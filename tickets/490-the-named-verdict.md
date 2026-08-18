# Scroll 490 — The Named Verdict (Quests #595–#604)

**Date:** 2026-08-18 · **Region:** `html/browsers/the-window-object` (+ its
`named-access-on-the-window-object/` and `accessing-other-browsing-contexts/`
sub-realms, and the `webstorage` popup rows that ride with them)
· **Branch:** `engine-per-page-threads`

## The verdict, in one breath

**The window had no prototype chain.** `Object.getPrototypeOf(window)` was
`Object.prototype`; `window.constructor` was not `Window`; `Window.prototype`
existed but nothing inherited from it — and because there was nowhere for a
named-properties object to live, "named access on the Window object" was faked
by eagerly defining an own getter on the global for every `id` present when the
document finished parsing. That fake could not see an element added afterwards,
could never forget one that left the tree, ignored the `name` attribute
entirely, and returned a single element where the spec returns an
`HTMLCollection`.

Underneath that, the second half of `window.open` was still missing: a window
had no `BarProp`s at all, so `support/window-open-popup-target.html` — the page
behind **all 51 rows** of `window-open-popup-behavior.html` — threw on its first
line and every row timed out. And a navigated window kept a `location` object
whose components had been computed once, at construction, so a reused popup that
navigated to `target.html?channelName` still reported an empty `location.search`
and opened a `BroadcastChannel` named `""`.

Ten quests. **Region 76/174 → 163/174** (24 files up, 0 down, 0 could-not-run).

| Test | Before | After |
| --- | --- | --- |
| `window-open-popup-behavior.html` | 0/51 TIMEOUT | **51/51** |
| `window-indexed-access-vs-named-access.html` | 3/10 | **10/10** |
| `window-open-noopener.html?indexed` | 1/9 | **9/9** |
| `named-access-.../window-named-properties.html` | 2/7 | **7/7** |
| `named-access-.../named-objects.html` | 3/6 | **6/6** |
| `named-access-.../basics.html` | 4/6 | **6/6** |
| `named-access-.../name-attribute-elements.html` | 1/3 | **3/3** |
| `window-prototype-chain.html` | 1/5 | **3/5** |
| `BarProp.window.html` | 0/2 | **2/2** |
| `window-open-noreferrer.html` | 0/1 | **1/1** |
| `Window-document.html` | 0/1 | **1/1** |
| `accessing-.../indexed-browsing-contexts-02.html` | 0/3 | **2/3** |
| `accessing-.../indexed-browsing-contexts-03.html` | 0/1 | **1/1** |

---

## Quest #595 ⭐⭐⭐ — the Window had no prototype chain

WebIDL gives a global with a named property getter a **named properties object**
between its interface prototype and the inherited one:

```
window → Window.prototype → WindowProperties → (EventTarget.prototype) → Object.prototype
```

Obscura had none of it. `Object.setPrototypeOf(globalThis, Window.prototype)`
plus a `WindowProperties` Proxy under it now gives `window.constructor ===
Window`, `Object.getPrototypeOf(window) === Window.prototype`, and one place
where HTML's *named objects* algorithm actually lives:

- document-tree child navigables whose **target name** matches (the live
  `window.name`, not the container's markup attribute — a frame that runs
  `window.name = "foo"` is findable as `foo` and no longer as its old name);
- `embed` / `form` / `img` / `object` elements whose `name` attribute matches;
- any element whose `id` matches;
- one element as-is, several as a **live `HTMLCollection`**, none as `undefined`.

Three details that each cost a debugging session:

1. **Reentrancy.** Answering a named lookup walks the tree, and walking the tree
   runs engine JS whose own global misses land straight back in the trap. The
   first version recursed until the stack was gone — and because that happened
   while bootstrap was wiring the page up, the symptom was not a wrong answer
   but a document that never ran a line of script. A latch fixes it, and it has
   to go up **before** the liveness check, because `_windowIsLive` reads
   `win._discarded`, which on the main window is itself a missing property.
2. **Cross-origin frames throw on every property read**, internal ones included.
   An unguarded `w.name` inside the trap poisoned *every* missing-property
   lookup on the window with a `SecurityError`.
3. **An `<iframe id=quux>` is reached as the ELEMENT**, not as its window. Only
   the target-name match yields a `WindowProxy`.

The old eager `[id]` scan (`__defineNamedGlobal` / `__exposeNamedGlobals`) is now
inert; both entry points remain because the tree code and the Rust bootstrap
call them.

**4. And it cost 40 subtests on a heavy page before it cost nothing.** This is
the part that nearly sank the arc, and it is worth reading twice. With the
named-properties object in the chain, **every missing-property read on the window
runs a trap** — and Obscura's shared node/event code treats every event target
alike, so one load of a 129-image page asked the window for `nodeType` **812
times**, `_shadowHost` 407 times and `parentNode` 137 times: 2418 trap calls,
each of which built a fresh selector string and made the DOM re-parse it. The
ritual caught it as a single regressed row —
`the-img-element/naturalWidth-naturalHeight-width-height.html`, a file whose
score depends on how many of its 129 images have finished when `load` fires —
dropping from a ~204-subtest average to ~153.

Three fixes, in order of how much each bought:

1. **`_NPO_ENGINE_INTERNALS`** — a fast-reject set of the names the ENGINE probes
   on a Window (`nodeType`, `parentNode`, `_shadowHost`, `_idbEventParent`, …).
   2418 trap calls → 792. Average back to ~188.
2. **`op_dom("window_named_objects", name)`** — a real Rust op that walks the tree
   once for "elements whose id is `name`, plus `embed`/`form`/`img`/`object` whose
   `name` is `name`", instead of `querySelectorAll` with a per-call selector
   string. Average back to ~201.
3. **`op_dom("navigable_container_candidates")`** — the same treatment for the
   `iframe, frame, object, embed` scan behind `window.length`, `window[i]` and the
   target-name half of every named lookup. Average ~201 against a baseline whose
   own 13 samples average 202. Parity.

⛔ **The concession, stated plainly:** a page whose element is literally called
`nodeType` (or `parentNode`, `_nid`, …) is not reachable as `window.nodeType`.
That is the price of not making every event dispatch pay for a tree walk, and it
is bounded to a fixed list of engine-internal names.

📏 **The measuring lesson.** The first three attempts to bisect this were all
measuring the WRONG BINARY: the baseline server was started from a *copy* named
`obscura-base`, and `pkill -f 'obscura serve'` does not match `obscura-base
serve`, so the new server silently failed to bind port 9222 and every "result"
came from the old binary. Kill by port when two binaries are in play.

⛔ **Cap, stated honestly:** the chain stops at `Object.prototype` instead of
continuing through `EventTarget.prototype`, because in this engine
`globalThis.EventTarget === Node`. Splicing `Node.prototype` above the global
would hand every page a `window.parentNode`, a `window.textContent` and forty
more Node accessors invoked with a receiver that has no node id. A real,
separate `EventTarget` interface is the prerequisite; until then the last two
subtests of `window-prototype-chain.html` stay red.

## Quest #596 ⭐ — an index past the last frame is a NAME

`window[0..63]` are own accessors on the global, so they can never fall through
the prototype chain by themselves: `window[3]` with three frames returned
`undefined` instead of the frame whose target name is `"3"`, and `window[4]`
returned `undefined` instead of the element with `id="4"`. Past the last
supported property index the getter now performs an ordinary named lookup.

`window-indexed-access-vs-named-access.html` 3/10 → **10/10**.

## Quest #597 ⭐⭐ — BarProp

`window.locationbar` and its five siblings did not exist. They are six
**distinct** objects per Window, stable for that Window's whole lifetime, whose
`visible` is false once the browsing context is discarded and false for every
bar of a popup.

That second rule is the only way a page can tell a popup from a tab, and it is
the entire content of `support/window-open-popup-target.html`.

## Quest #598 ⭐⭐ — `window.open` features decide popup-ness

`_parseOpenFeatures` understood exactly two tokens. It now tokenizes the whole
feature string, parses boolean features the way HTML does (empty / `yes` /
`true` on; `no` / `false` off; otherwise an integer, `0` off), and runs
"check if a popup window is requested": a chrome-less window is the exception,
so a feature string asking for the full set of bars still gets an ordinary tab
and dropping any one of them asks for a popup.

⚠️ `noopener` / `noreferrer` short-circuit to "tab". That is not in the spec
prose but it is what browsers do and what all 51 rows assert (`,popup` alone
expects a popup; `,noopener,noreferrer,popup` expects a tab).

`window-open-popup-behavior.html` 0/51 TIMEOUT → **51/51**.

## Quest #599 ⭐⭐ — `noopener` does not mean "make a new window"

An existing target with the requested name is still reused and still navigated,
and still keeps the opener it already had. All `noopener` withholds is the
**return value**: the caller is handed `null` and loses its handle on a window
that carries on loading. Obscura instead skipped the reuse path entirely and
built a fresh detached context, so the named window the test was holding never
went anywhere.

`window-open-noopener.html?indexed` 1/9 → **9/9**.

## Quest #600 ⭐ — `document.referrer` existed nowhere

It was simply absent, so `noreferrer-target.html` reported `undefined` where the
spec says `""`. Added on `Document`, `DetachedDocument` and `_IframeDocument`;
an auxiliary window inherits its opener's URL, and `noreferrer` means the new
context is told nothing about who opened it — no opener handle **and** no
referrer.

## Quest #601 ⭐⭐ — a navigated window kept the old Location

`window.location` is a plain object whose component fields were computed once at
construction. Assigning only `href` on navigation left `search`, `pathname`,
`origin` and the rest describing the **previous** document — so every reused
popup that navigated to `target.html?channelName` read an empty
`location.search`, opened `new BroadcastChannel("")` and talked to nobody. This
was the invisible half of #599: the window navigated correctly and the page on
the other end still could not be heard.

`_relocateWindow` re-derives every component from the new URL.

## Quest #602 ⭐⭐ — `object` and `embed` are browsing contexts

`window.length` counted `iframe` elements only. HTML says a navigable container
is an `iframe`/`frame` always, an `object` while it has `data`, and an `embed`
while it has `src` — and *not* when the type is a plugin/media type, because an
`<embed type=image/png src=…>` is a picture, not a browsing context (a whole
subtest asserts that such a document has **zero** child browsing contexts).

`embed` deliberately has no `contentWindow` in WebIDL, so the engine reaches a
container's window through `_navigableWindowOf` rather than the IDL member.
Losing the URL destroys the context as a **queued task**, not synchronously —
`window.length` read on the very next line still sees the old count.

⛔ **Cap:** the context exists and is `about:blank`; the resource behind
`data`/`src` is not fetched into it.
⛔ **Cap:** `indexed-browsing-contexts-02`'s second subtest needs a `<frameset>`
document inside a frame, and the Rust parser drops `<frameset>`/`<frame>`
entirely (`test3.html` arrives as an empty `<body>`). That is a parser gap, not
a window one.

## Quest #603 ⭐⭐ — navigating a navigable replaces the Document, not the Window

Every load path built a brand-new `_IframeWindow`, so a page that captured
`iframe.contentWindow` before `iframe.src = …` was left holding a window nothing
pointed at. `_installFrameWindow` reuses the existing window, swaps its
`document`, re-points its `location` and re-homes the custom-element registry.
`_reprocessIframe` no longer nulls the window either.

`Window-document.html` 0/1 → **1/1**.

## Quest #604 ⭐ — named property visibility

A supported name is **not** an own property of the named-properties object if
anything between the global and it already answers to that name. An
`<iframe name="constructor">` therefore does not put a `constructor` on the
object under `Window.prototype` — `Window.prototype.constructor` got there
first, and shadowing it from below would be invisible anyway.

`window-named-properties.html` 6/7 → **7/7**.

---

## Zero regressions

Ritual sweep, 316 files / 341 rows, before and after, each on its own binary
(`scripts/wpt_batch_par.sh <list> <out> 8 4 30 <binary>`, 8 shards, ~25 min):

| | rows | could-not-run | subtests |
| --- | --- | --- | --- |
| before | 341 | 2 | **55144 / 55719** |
| after | 341 | 2 | **55136 / 55719** |

One row moved: `the-img-element/naturalWidth-naturalHeight-width-height.html`,
210 → 202. That is the file this campaign has flagged as flaky since the
navigated arc, and for good reason — its score is "how many of 129 images had
finished when `load` fired". Solo, on a quiet machine, five runs per binary:

- baseline: 203 / 210 / 210 / 206 / 210 (and 210 / 194 / 186 / 192 / 197 in an
  earlier round) — 13 samples, mean **202**
- after: 203 / 210 / 206 / 194 / 192 — mean **201**

Parity. (Before the three performance fixes in #595 it really was a regression,
at a ~153 mean; see that section.)

---

## Caps / Next

⛔ **Unwinnable-for-now in this region**

- `window-open-noopener.html?_self|_parent|_top` (3 × 0/1, TIMEOUT) — each needs
  a `javascript:` URL to be *navigated to* in a fresh auxiliary window, running
  with that window as its global, plus a per-window `open` so that
  `window.open("", "_self")` inside the popup resolves to the popup. Both are
  real engine features, not window-object details.
- `window-indexed-properties.html` (3/7) — wants WebIDL legacy-platform-object
  semantics **on the global itself**: `Object.getOwnPropertyDescriptor(window,
  "0")` non-writable, `Object.defineProperty(window, 0, …)` throwing,
  `delete window[0] === false`. Those need V8 interceptors on the global object;
  they are not reachable from JS.
- `indexed-browsing-contexts-01.html` (2/3) — asserts child contexts are ordered
  by *container insertion*, not tree order. Modern spec (and Chrome) say tree
  order; treat as a stale test.

▶ **Next leverage**

1. ⭐⭐ **A real `EventTarget` interface** (`globalThis.EventTarget = Node` today).
   Splitting it out finishes the Window prototype chain (`window-prototype-chain`
   3/5 → 5/5), makes `x instanceof EventTarget` mean what it says across every
   non-Node event target, and is the last structural lie in the global's shape.
2. ⭐⭐ **`<frameset>` / `<frame>` parsing** — html5ever is being driven in a mode
   that drops them, so every frameset document in WPT arrives empty.
3. ⭐ **`object` / `embed` actually navigate** their `data`/`src` into the nested
   context (this scroll only creates the context).
4. ⭐ `javascript:` URLs as a navigation target (unlocks the three noopener
   special-target variants and a long tail elsewhere).
5. `@container` in the RENDER path (carried 6×); `::marker { content }`;
   `Range.getBoundingClientRect` sub-range glyphs; scroll-on-focus;
   webm/ogg header parse (carried).
