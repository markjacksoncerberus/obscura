# ⚔️ Scroll 499 — The Furnished Verdict

> **Quests #712–#730 · 2026-09-10 · the accessibility tree over CDP, and eight APIs that were not there**
>
> **46-file arc probe 130/480 → 444/503** (23 files up, 1 down — and that one is a harness artifact, proved below)
> `touch-events/idlharness` **29/128 → 100/128** · `entries-api/idlharness` **18/68 → 67/68**
> `css/css-highlight-api` **0 → 145** across twelve files · `web-share` **15/41 → 40/41**
> `console` **25/28 → 28/28** plus three files from 3/18 to 18/18 · `imagebitmap-renderingcontext` **1/7 → 7/7**

---

## The headline: the browser gave two different answers about what an element is

Scrolls 497 and 498 built one accessibility computation and measured it to
885/888 and 291/304. Then this arc asked the obvious next question — *what does
an agent driving Obscura over CDP actually see?* — and found
`Accessibility.getFullAXTree` answering out of **a completely separate
implementation in Rust**: a hardcoded tag→role table of about thirty roles and a
five-step name guesser (aria-label → aria-labelledby's raw `textContent` → `alt`
→ `title`).

That is the campaign's oldest failure shape — *two answers to one question* — in
the place where it matters most for this browser's whole purpose. The agent's
view is the one that decides whether it presses the right button, and it was not
the view WPT had just validated. Nothing in that Rust walker knew about the
minimum role, or `sectionheader`, or a `doc-chapter`, or a `<th>` that heads its
row, or that a `role="none"` container's children must be promoted rather than
dropped.

**#712** points the CDP domain at the JS realm's own tree
(`__obscuraA11yFullTree`, built on the model quest #702 added). Measured over
CDP on a small shop page, the tree now comes back as:

```
 ax-root RootWebArea  'Shop'
   ax-1  generic         ''            kids=[nav, main]
   ax-3  navigation      'Main'
   ax-5  list            ''
   ax-8  link            'Home'
   ax-4  main            ''
  ax-10  heading         'Boots'
  ax-11  button          'Add to cart'   ← promoted out of its role="none" wrapper
  ax-12  searchbox       'Search'        ← named by its <label for>
  ax-13  checkbox        'Gift wrap'     [checked=true]
```

— with the `aria-hidden` span absent entirely. The Rust walker survives only as
the fallback for a page with no JS realm at all.

---

## Eight APIs that were not there

Chosen by measuring a fresh 101-file frontier sample across 36 untouched realms.
Each of these is a page reaching for something and getting `undefined`.

### The CSS Custom Highlight API — #713, #714, #715, #716, #717

`Highlight`, `HighlightRegistry` and `CSS.highlights` did not exist, so twelve
files read **0** and four could not run at all.

This is how a page marks up text it did not write the markup for: search results,
spell-check squiggles, a collaborative editor showing where someone else's cursor
is. Before it, the only way was to shred the DOM into `<span>`s and hope nothing
depended on the shape of the tree. Ranges live *alongside* the document instead
of inside it, so nothing the author wrote is disturbed.

⭐ Built on plain **arrays**, not `Set`/`Map`. WPT ships
`Highlight-setlike-tampered-Set-prototype` and its Map twin, which replace
`Set.prototype.add` before touching a Highlight — and, past the test, a page that
innocently patches `Set.prototype` must not be able to break the browser's own
highlighting.

**#716** taught the selector engine `::highlight(<ident>)` (a new
`PseudoElement` variant in `crates/obscura-dom/src/selector.rs`), and **#717**
taught the CSSOM validator the rules that go with it: the bare `::highlight` is
invalid (the name **is** the registry key), `::before::highlight(foo)` is invalid,
and nothing may follow it — no `:hover`, no `::after`, no descendant — because it
names a set of **ranges**, and a range has none of those. `highlight-pseudo-parsing`
**2/16 → 15/16**.

**#715** `highlightsFromPoint()` — which highlights are under this point, the
question a page asks when the user clicks a search hit. Ordered by priority, ties
broken by registration order **reversed**, because whatever was painted last is
what the click lands on.

### Touch — #718

`Touch`, `TouchList` and `TouchEvent` did not exist. A finger is not a mouse: it
has width, it has pressure, and there can be several at once.

⚠️ **Deliberately without the `ontouchstart` handler attributes**, and that costs
us 24 subtests we could have had. `'ontouchstart' in window` is how half the web
decides whether it is talking to a touchscreen; answering yes makes sites serve
their mobile layout and swap hover affordances for tap ones. Obscura is driven by
an agent through a synthetic pointer, not by a finger, so it must not claim
otherwise. The interfaces exist because a page that *constructs* a TouchEvent —
every touch-emulation shim, every gesture library's own tests — should not die on
a missing global. `expose-legacy-touch-event-apis.html` checks exactly this
consistency and holds at 16/16 either way.

### console is a namespace — #719, #720

`console`'s `[[Prototype]]` must be an **empty object** that in turn inherits
from `Object.prototype`, not `Object.prototype` itself; it must carry
`@@toStringTag` of `"console"`; and every one of its operations reports a
`length` of 0 because every argument is optional. All three were wrong.

**#720**: a *label* is stringified through the ordinary JS path, so
`console.count(obj)` calls `obj.toString()` — and when that throws, the exception
is the page's to see. A logger that silently eats an exception from the thing it
was asked to log is worse than no logger. `count`/`countReset`/`time`/`timeLog`/
`timeEnd` are now real rather than empty functions.

### The rest — #721, #722, #723, #724, #725, #726, #729, #730

* **#721 `InputDeviceCapabilities`** (+ `UIEvent.sourceCapabilities`) — which
  *kind* of thing generated this event. A `click` from a finger and a `click`
  from a mouse arrive identically; this is the only place to ask.
* **#722 The Entries API** — what a browser hands a page when someone drags a
  **folder** onto it. The File API gives a flat list; this gives the shape, which
  is the difference between "upload these 40 files" and "upload this project".
  Interfaces are exact; there is no OS drag-and-drop here, so
  `webkitGetAsEntry()` honestly answers `null` rather than fabricating a tree,
  and the callbacks are queued (never synchronous), because a page whose success
  callback runs before its own call returns reads state it has not written.
* **#723 `File.webkitRelativePath` + `<input webkitdirectory>`** — the only thing
  that says *where inside the folder* each file came from.
* **#724 `isSecureContext`** — ⭐ it did not exist at all. This is the one-line
  question a page asks before registering a service worker (so the site works
  offline — which matters most where the connection is metered), using
  `crypto.subtle`, or asking for a camera. `if (isSecureContext)` threw a
  ReferenceError; `if (window.isSecureContext)` silently took the insecure branch
  on a page that was perfectly secure. Note that trustworthiness is an **origin**
  question, not a scheme one: localhost is trustworthy without TLS.
* **#725 `visualViewport.pageLeft` / `pageTop`** were the constant 0. They are
  *document* coordinates — where the visual viewport sits in the page — so
  returning 0 tells a page pinned to the top of a document it has scrolled a
  thousand pixels down.
* **#726 ⚠️ CORS-exposed response headers.** A cross-origin response's headers
  were handed to script **in full**. Seven are safelisted; everything else is
  readable only because the server named it in `Access-Control-Expose-Headers`.
  Exposing the rest is a real leak — internal routing headers, rate-limit
  counters, backend version strings. And the list is **all-or-nothing**:
  `Access-Control-Expose-Headers: bb-8, no no` is not "expose bb-8 and ignore the
  junk"; `no no` is not a token, so the whole field fails to parse and nothing
  extra is exposed. A parser that salvages the good entries turns a server's typo
  into an exposure the server never authorised. (An *empty* entry, though, is not
  malformed — `, bb-8` is the ordinary shape of a list built by concatenation.)
  **7/16 → 12/16.**
* **#729 `ImageBitmapRenderingContext`** — `getContext('bitmaprenderer')`
  returned null. It is the cheapest way to put a decoded image on screen: the
  canvas **adopts** a bitmap decoded elsewhere and the bitmap is emptied in the
  same breath. That "transfer, don't copy" is the whole point on a device where a
  4000×3000 photo is 48 MB — the alternative keeps both copies alive at once.
  **#730** made `ctx.canvas` return the **OffscreenCanvas** the caller holds
  rather than the `<canvas>` backing it.

### Web Share — #727, #728

`navigator.share()` is how a page hands a link to whatever the person actually
uses. Without it, every site ships its own row of social buttons, each one a
third-party script that tracks the reader for the privilege. The API replaces all
of them with one system dialog and no third parties at all.

⚠️ It is `[SecureContext]`, and the suite checks that `'share' in navigator` is
**false** on http — so the members cannot simply be defined at startup, because
at startup there is no URL yet to judge. **#728** is the gate: a small Proxy
around `navigator` (the technique this file already uses for `document`'s named
properties) that hides exactly those two names on a non-secure page. It
deliberately does **not** bind the functions it hands out — a WebIDL operation
read off `navigator` and applied to something else must still throw, and a bound
function can never tell.

**15/41 → 40/41.**

---

## ⛔ Caps — honest

* **`web-share/share-securecontext.http.html` reads 0/1 here and that is the
  RUNNER, not the engine.** The file must be served over **http** to mean
  anything, and `scripts/wpt_run.py` loads every test from `https://wpt.live`.
  Re-run with `--base http://wpt.live` and it is **1/1**. Recorded rather than
  papered over: it is the only row in this arc that moved down.
* **`touch-events/idlharness` keeps 28 failures by choice** — the `ontouch*`
  handler attributes, for the reason given above. A deliberate product decision,
  not a gap.
* **`css/css-highlight-api/highlight-pseudo-computed.html` 0/12 and
  `HighlightRegistry-highlightsFromPoint` 4/8** are both blocked on the same
  thing, which is the biggest single finding of this arc that is *not* fixed:
* ⭐⭐⭐ **`Range.getBoundingClientRect()` returns a 0×0 rect and
  `Range.getClientRects()` returns one empty rect — always.** They are literal
  stubs (`return new DOMRect()`). That is the geometry every rich-text editor,
  every "position this tooltip over the selection", every find-in-page
  scroll-into-view and every agent that wants to point at a phrase depends on.
  Measured: a Range over characters 2–10 of a monospace `<span>` at
  (8, 7.9)–(90.7, 23.1) reports `[0,0,0,0]`. The engine has element geometry and
  `inline_fragment_rect` (glyph-run union per inline element) but **no
  per-character geometry** — parley's cluster API is right there in the fork, and
  nothing exposes it to the JS realm.
* `console`'s three `*-logging` tests need testdriver's BiDi
  `log.entry_added.subscribe`, which the harness does not implement.
* `import-maps/dynamic-integrity` (7/12) needs integrity checking in the module
  loader — measured, banked, not attempted.

## Caps / Next

1. ⭐⭐⭐ **Range geometry from the text layout** — see above. It unblocks
   `highlightsFromPoint`, `caretPositionFromPoint`'s rect, selection UI, and it
   is the single most agent-facing primitive still missing.
2. ⭐⭐ **`counter()` / `attr()` / `:dir(rtl)` inside CSS `content`** (carried) —
   the 12 remaining `accname/comp_name_from_content` rows are all that one gap.
3. ⭐⭐ **`css/css-flexbox`'s `align-content-horiz-001a/b` are 0/72 each, and the
   whole reason is `float: left` on the test's flex containers.** Floats are laid
   out as ordinary blocks today (measured: a `float:left` box and the block after
   it stack vertically, and the float lands at x=0). Float layout was rejected in
   scroll 496 for having no score behind it — there is now 144 subtests of score
   behind it in two files alone.
4. ⭐⭐ The sticky offset in the PAINT path (carried from 496).
