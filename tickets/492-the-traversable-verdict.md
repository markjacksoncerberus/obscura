# 🧭 The Traversable Verdict — `navigation-api/*`, and the browser that could not go back

> *Quests #625–#649. Region: the whole `navigation-api/` realm — 452 test files,
> **zero mentions in `WPT_PROGRESS.md` after 624 quests**. Chrome ~100%.*

---

## The gap

`window.navigation` did not exist.

Not "existed with gaps" — the identifier was `undefined`, so **every one of the
realm's 452 files threw on its first line**. The measured baseline was
**1 subtest passing out of 547**, and the one that passed did so by accident.

Underneath it, the thing the Navigation API is a view of did not exist either.
`history` was an object literal:

```js
globalThis.history = {
  length: 1, state: null, scrollRestoration: "auto",
  pushState(state, _unused, url) { this._update(state, url, true); },
  replaceState(state, _unused, url) { this._update(state, url, false); },
  ...
  go() {}, back() {}, forward() {},          // ← the back button
};
```

`history.length` was the constant 1. `go`, `back` and `forward` were empty
functions. There was no list of entries, no index into it, no key, no id, no
state per entry — **no session history at all**. A page could change its URL and
nothing anywhere remembered that it had.

That is not a missing API. That is a browser that cannot go back — and "back" is
the single control every reader on a slow connection uses most, because it is the
one that costs nothing.

---

## What was built

### The session history (Quests #625–#627)

A real list, per window: entries carrying `key` (the SLOT, stable across a
replace), `id` (the VERSION, new on every mutation), `url`, two states, and which
document they belong to. `history` and `navigation` are two views of that one
list, minted together per window.

The two states are not one state. `entry.getState()` is the Navigation API's;
`history.state` is the classic one; writing either clears the other — which is
why `history.pushState(1)` leaves `currentEntry.getState()` undefined rather than
stale.

### It outlives the document (Quest #628)

`Page::init_js` throws the whole JS realm away on every navigation — right for
script state, and exactly wrong for a session history, which describes the
traversable and not the document. The list is now mirrored into a cell the Rust
`Page` owns (`ObscuraState::session_history`, `op_session_history_load` /
`op_session_history_store`) and read back at the start of each new document's
life, along with a note saying WHY the last document left, so the arriving one
lands in the right slot instead of guessing.

### ⭐⭐⭐ A FRAME IS A TRAVERSABLE TOO (Quests #633–#638)

Half this realm is written from the parent, about `i.contentWindow.navigation`.
An `<iframe>` in this engine had **no `history` and no `navigation` at all**, and
worse:

* a link clicked inside a frame reached the TOP-LEVEL `location` and navigated
  **the whole page** — which, when the frame is the thing under test, means the
  test throws itself away mid-run (this is what produced 58 "too many redirects"
  rows the first time the realm was measured with a working `navigation`);
* `contentWindow.location.assign`, `.replace` and `.reload` were **empty
  functions**, and `.href` was a plain string field, so a parent steering its own
  frame — "go to the next step", "reload after saving" — silently did nothing.

The session history is now an object with the four things that differ between a
top-level window and a frame as methods on it (where the URL is read, how it is
written, whether the document finished loading, and what "actually go there"
means), so every algorithm above is written once.

### ⭐⭐ The ordering, which is the hard part

`navigation-api/ordering-and-transition/` asserts the exact interleaving of
events, promise resolutions and unrelated microtasks — and the orders differ
between `navigate()` (synchronous) and `back()` (a task). Three rules produce all
of it, uniformly:

1. `committed` resolves **synchronously at the commit**.
2. `navigatesuccess` is fired from a `committed.then(…)` **attached at the moment
   the intercept handlers settle**, and `finished` resolves inside that same
   reaction. Attaching there rather than firing directly is what puts
   `navigatesuccess` BEFORE the page's own `committed.then` for a synchronous
   `navigate()` (we attached first) and AFTER it for a traversal (the page
   attached first, while the task that commits had not yet run). One line, both
   orders, no special-casing.
3. `navigation.transition` exists only for an INTERCEPTED navigation, and is
   cleared in that same reaction — still readable from `navigatesuccess`, already
   null by the time `committed`'s reactions run.

### The rules that decide push vs replace

* **A script-initiated navigation before the load event REPLACES.** This is the
  rule 316 of the realm's 452 files are written around (`// Wait for after the
  load event so that the navigation doesn't get converted into a replace
  navigation`), and getting it wrong shifts every index in every assertion by one.
* **A followed hyperlink pushes anyway**, even during parse.
* **A form submission replaces unless a person asked for it.** `form.submit()`
  from script is a replace on a fully loaded page — it is the page redirecting
  itself, and it must not put a step in the reader's back button that goes
  nowhere. A submit button someone actually pressed pushes.
* **A frame's initial `about:blank` is REPLACED** by the document the frame was
  actually pointed at, so no frame on the web begins its history with a blank
  page nobody asked for.

### And the rest

`navigate` / `navigatesuccess` / `navigateerror` / `currententrychange` /
`dispose` events; `NavigateEvent` with a real constructor, `intercept()`,
`scroll()`, `signal`, `formData`, `downloadRequest` and `sourceElement`;
`NavigationDestination`; `NavigationTransition`; `NavigationActivation`;
`precommitHandler` with `redirect()` and `addHandler()`; focus reset after an
intercepted transition; `<a download>` firing `navigate` and then not navigating;
`window.stop()` aborting the navigation in flight; and starting a navigation
aborting the one already running.

---

## ⚠️ The runner was blind to a whole shape of test

`wpt_run.py` reads the results testharness RENDERS into `#log`. testharness only
creates that node once its Output handler has been initialised — which happens on
a start callback. **A file whose tests are registered from an ES module can run,
finish, time out and fire every completion callback while `#log` is never created
at all**, and the runner then reports "no-results" for a run that produced a
perfectly good verdict.

That was hiding **63 files in this realm alone** — every `.mjs`-helper file,
which is most of `ordering-and-transition/`. The runner now also registers an
`add_completion_callback` of its own and reads the verdict from there when the
table never appears. The rendered table stays the primary source; this is a
fallback, so no historical number changes meaning.

**The baseline in this scroll was re-measured from scratch with the fixed runner**
(against a binary built from `HEAD` with the arc's changes stashed), so the
before and after are the same instrument.

---

## Results

Probe list: **`scripts/wpt-navigation-api-probe.txt`** — 452 files (the whole
realm minus `resources/` helpers and `-manual` files), expanded by the runner to
~540 rows once `<meta name="variant">` files are split.

Both sides measured with the SAME (fixed) runner, base binary built from `HEAD`
with this arc's changes stashed:

| | base | after |
|---|---|---|
| **`navigation-api/*`** | **1 / 543** | **230 / 540** |
| files scored | 462 | 457 |
| files up | — | **179** |
| files down | — | **7** (all `0/N` → could-not-run; no subtest was lost) |

Selected files, base → after:

| file | base | after |
|---|---|---|
| `navigate-event/event-constructor.html` | 0/6 | **6/6** |
| `precommit-handler/*` (20 files) | 0/20 | **22/23** |
| `focus-reset/basic.html` | 0/8 | **8/8** |
| `navigation-methods/navigate-same-document.html` | 0/2 | **2/2** |
| `navigation-methods/return-value/back.html` | 0/1 | **1/1** |
| `navigation-history-entry/current-basic.html` | 0/1 | **1/1** |
| `currententrychange-event/*` | 0/11 | **10/11** |
| `navigate-event/navigate-anchor-download.html` | 0/4 | **4/4** |
| `navigate-event/navigate-form*.html` | 0/5 | **5/5** |
| `updateCurrentEntry-method/basic.html` | 0/1 | **1/1** |

**Zero-regression ritual** (`scripts/wpt-ritual.txt`, 316 rows → 341 scored,
base binary vs this one, same runner): **55,235/55,799 → 55,330/55,899**,
**1 file up, 0 files down.**

---

## ⛔ Caps — honest, and not to be mistaken for failures

* **Cross-origin.** `navigate-anchor-cross-origin`, `intercept-cross-origin`,
  `sourceElement-cross-origin.sub.html`, the `cross-window/*-crossorigin` family
  and the `.sub.html` alternate-host files need a second origin the harness can
  actually reach. Not winnable here.
* **bfcache.** `activation-after-bfcache*`, `dispose-after-bfcache`,
  `entries-after-bfcache*` need a back/forward cache: a document kept ALIVE after
  navigating away. This engine drops the realm on every navigation by design
  (`Page::init_js`), which is a security posture, not an oversight.
* **`scroll-behavior/` (28 files, 1/17 scored rows).** Every one of them asserts
  `window.scrollY` actually moved. The render path has no scroll model reachable
  from JS yet — the same cap the campaign has carried since #580 ("scroll-on-focus").
  `scroll: "manual"` / `scroll()` are wired and the ordering is right; only the
  observable scroll is missing.
* **`navigate-event/defer/tentative/`** — a tentative proposal (deferred
  same-document commits) that is not implemented at all.
* **An entry's state crosses a document boundary as JSON.** A structured-clone
  value JSON cannot express (a Map, a Blob, a cycle) survives inside one document
  and arrives as `null` in the next. No file in the realm exercises it; a second
  serializer for that case is not yet worth its weight.
* **`javascript:` URLs** as a navigation target are still unimplemented
  (`navigate-to-javascript`, `navigate-javascript-url`, `entries-after-javascript-url-navigation`).
* **`<frameset>`** parsing (carried from #604) still drops the whole document.

---

## Caps / Next

The next-best moves out of this region, in order:

1. **⭐⭐⭐ `position: fixed` IS NOT VIEWPORT-RELATIVE** — carried unchanged from
   the Mathematical arc, and deliberately deferred under the standing order
   (untouched realm before deepening a held one). `stylo_taffy` maps
   `Position::Fixed` to Taffy `Absolute`, so `left:100px` lands at 108px on a page
   with the default body margin. Every sticky header, modal and toast on the web.
2. **⭐⭐ A SCROLL MODEL REACHABLE FROM JS.** `window.scrollY` / `scrollTo` /
   `scrollIntoView` actually moving the viewport unlocks `scroll-behavior/`
   (28 files) here, `scroll-on-focus` in the focus realm, and
   `cssom-view/scrolling` — three realms waiting on one primitive.
3. **⭐⭐ `javascript:` URLs as a navigation target** — small, and it appears in
   four realms' tails now.
4. **⭐ `<a target>` / named-frame navigation breadth** — this arc taught link
   following about `target`; forms and `window.open` targets share the code.
5. **⭐ A real `EventTarget` interface** (still `Node`; carried from #604).
6. **`<frameset>` parsing** (carried from #604).
7. **@container in the RENDER path** (carried 8×).

**And a warning for whoever measures next:** a realm that starts at "the object
does not exist" will, the moment it exists, walk further and hit walls that were
never reachable before. The first full sweep of this arc produced **58 "too many
redirects" rows** — not regressions, but real navigations the old incapacity had
been silently preventing. Read a spike in could-not-run as *new capability*, and
go find what it is now able to do wrong.
