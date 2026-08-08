# 🏷️ Quest #512 — The Loaded Verdict

> *A fix that does not survive to the end of the file is not a fix.*

**Realm:** `html/semantics/embedded-content/the-img-element` — **131 files, zero
ledger rows before this quest**
**Date:** 2026-08-08 · **Status:** ✅ taken

---

## ☀️ Why this one

The standing order says to prefer untouched realms, and `the-img-element` had
never been measured. It is also the realm directly behind the previous quest: a
decoder the JS realm can reach is only half of it, because the *other* way a page
gets pixels is an `<img>` that finished loading.

`<img onerror>` in particular is load-bearing across the whole platform. It is
how half the web substitutes a placeholder, and `sanitizer-inert-document` has
been blocked on it since quest #501.

---

## 🔍 The gap

Better than expected in one place and much worse in another.

**Better:** `<img>` *already* fetched and already fired `load`/`error` —
`_loadElementResource` has done that since the resource-timing work. What it
could not do was tell whether the bytes were an image.

**Worse:** an `<img>` had **no current request at all**. No `naturalWidth`, no
`naturalHeight`, no `complete`, no `decode()`, no `currentSrc`. And two holes
underneath:

1. **`img.width` and `canvas.width` did not exist.** Not "returned the wrong
   number" — the property was **absent**, `undefined`, on every page.
2. **`<video>` never settled.** `HTMLMediaElement` was
   `class HTMLMediaElement extends HTMLElement {}` — an empty body. Setting
   `video.src` set an attribute and then nothing ever happened again: no
   `loadedmetadata`, no `canplaythrough`, and no `error`.

---

## ⚒️ The work

- **The current request** (`_IMG_REQ`): the four states HTML defines —
  unavailable, complete, broken — with `naturalWidth`, `naturalHeight`,
  `complete`, `currentSrc` and `decode()` reading it. Setting or removing `src`
  restarts it, observably.
- **Decode decides `load` vs `error`.** A 200 response carrying an undecodable
  body fires `error`, not `load`.
- **`data:` URLs are not a fetch.** They were being sent to the HTTP client and
  refused as a blocked scheme, so every inline `<img src="data:…">` on the web
  was broken here. Now decoded in place, on a task.
- **`MediaError` and an honest media failure** — see below.
- **The `width`/`height` rehoming fix** — see below.

---

## 📊 Results

`the-img-element`, 86-file probe: **120/612 → 180/612** at this quest
(→ **~400/612** after #513's srcset work on the same realm).

| Test | Before | After (#512) |
|---|---|---|
| `naturalWidth-naturalHeight-width-height` | 0/258 | 34/258 |
| `img.complete` | 0/19 | 15/19 |
| `natural-size-orientation` | 0/3 | **3/3** |
| `update-src-complete` | 0/1 | **1/1** |
| `not-rendered-dimension-getter` | 0/1 | **1/1** |
| `delay-load-event-until-move-to-empty-source` | 0/1 | **1/1** |
| `data-url` | 0/1 | **1/1** |

---

## ⭐ What was learned

### ⭐⭐⭐ THE FIND: a shared table DELETES the property it fails to mention

`img.width` was `undefined`. So was `canvas.width`. Quest #508 had *specifically*
taught `Element.prototype.width` about `<canvas>` — before it, every canvas was
300×150 no matter what its markup said, and that was called out as one of the two
finds bigger than the score.

Three thousand lines later, this runs:

```js
for (const member in __IFACE_MEMBERS) {
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, member);
  …
  if (homed) delete Element.prototype[member];      // ← vacate
}
```

It relocates legacy reflections from `Element.prototype` onto the interfaces that
actually declare them, which is right — and then **deletes the original**. The
`width` list named six interfaces. `HTMLCanvasElement` was not one of them.
`HTMLImageElement` was not one of them.

So #508's fix was **undone in the same file**, and nothing caught it, because the
canvas tests read the *content attribute* through `_c2dDim` rather than the IDL
property. The bug was invisible from inside the realm that introduced it.

**The lesson: a table that removes what it does not list is a table you must
audit against every interface, not just the ones you were thinking about.** The
grep that would have found this is "who else defines `width`?", and it takes ten
seconds.

### ⭐⭐ A promise that never settles does not fail one thing — it stops everything behind it

`<video>` fired no event either way. Five WPT `ImageBitmap` files scored nothing
because of it: their shared helper builds a `<video>`, awaits `canplaythrough`,
and rejects on `error`. With neither event the promise hung and the **whole file
timed out**, including the dozens of subtests that never mentioned video.

`HTMLMediaElement` now fails the resource selection algorithm the way HTML says a
UA with no supported codecs should: `error` set to a `MediaError` with
`MEDIA_ERR_SRC_NOT_SUPPORTED`, `networkState` `NETWORK_NO_SOURCE`,
`readyState` `HAVE_NOTHING`, an `error` event on a task, `canPlayType()`
returning `''`, and `play()` rejecting with `NotSupportedError`.

That is not a workaround for a test. Silence gets a spinner that never stops,
which is indistinguishable from a broken connection and blames the wrong thing;
every player on the web is built to hear `error` and show the poster, the
download link, the transcript.

### ⭐⭐ `complete` means "no longer in flight", NOT "succeeded"

An `<img>` with no `src` is `complete === true`. So is one that 404'd. Code that
reads it as success shows a broken image; code that reads a `false` as failure
spins forever. Three states, one boolean, and the boolean is about the *request*
finishing, not about it working.

### ⭐ `currentSrc` survives a 404

It is the URL the request **is for**, set when the request is created — not the
URL that succeeded. A page reading it inside `onerror` to report which file was
missing needs it to still be there.

### ⭐ Restarting a load must forget the old pixels immediately

`2d.drawImage.incomplete.reload` sets a new `src` on a loaded `<img>` and draws
it in the very next statement, asserting that **nothing** is painted. Keeping the
previous bitmap until a replacement arrives paints the image the page just said
it no longer wants — plausible, and wrong.

---

## ⛔ Honest caps

- **No media decoder.** Every media element fails resource selection. That is the
  honest state, not a stub — but it means `<video>`-shaped tests will stay red.
- `img.width` when the element **is being rendered** should be the used width from
  layout; we answer from the content attribute, then the intrinsic size, then 0.
  The layout bridge could supply it (~6 subtests in the big file).
- `relevant-mutations` 70/113 and the `image-loading-lazy-*` family need
  `loading="lazy"` wired to `IntersectionObserver`.
- `adoption`, `document-adopt-base-url` and friends need per-document base URL
  handling for image loads.

---

## ▶️ Next

[`114-the-sourced-verdict.md`](114-the-sourced-verdict.md) took the same realm
further with `srcset`.
