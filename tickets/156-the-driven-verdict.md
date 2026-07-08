# Quest #156 — The Driven Verdict (+56)

**Realm:** the **`test_driver` input bridge** — the widest single lever named by every
quest since #152. Unlocks the popover/dialog *light-dismiss + keyboard close-request*
tail (`html/semantics/popovers/popover-light-dismiss*`,
`.../the-dialog-element/dialog-canceling`, and the whole class of `test_driver`-driven
tests suite-wide).
**Files:** `scripts/wpt_run.py`, `scripts/wpt_fails.py` (the in-page bridge + runner),
`crates/obscura-js/js/bootstrap.js` (real `elementFromPoint`, `_processCloseRequest`,
top-layer stamps), `crates/obscura-cdp/src/domains/input.rs` (Escape close-request on the
CDP path), `crates/obscura-browser/src/page.rs` + `crates/obscura-cdp/src/domains/page.rs`
(preload-before-scripts).
**Result:** **+56, ZERO regressions** (stash-verified).

## The gap

WPT drives real user input through `test_driver` (`click` / `send_keys` / `Actions()`).
testharness leaves the backend to a vendor file; on wpt.live it is **empty**, so the
default `test_driver_internal` methods throw and every input-driven test hangs or fails.
Nothing in Obscura bridged those calls — so the entire light-dismiss / Escape-to-close /
focus tail was dark, and the memory named a `test_driver`→input bridge as the widest
single lever four quests running.

## What actually had to be built (four interlocking pieces)

The happy surprise: Obscura **already** had a CDP `Input` domain (mouse hit-test + key
dispatch) and popover light-dismiss already listened on `mousedown`. The blockers were
subtler, and each was discovered by measurement:

1. **A real `elementFromPoint`** (`bootstrap.js`). It was a stub that returned `<body>`
   for any in-viewport point. But `getBoundingClientRect` synthesizes a *stable, distinct
   per-node rect* (a grid keyed by node id), and automation always clicks an element at
   **its own** rect center — so a hit-test that returns the topmost (deepest / latest in
   tree order) element whose synthetic box contains the point returns exactly the clicked
   element. This is what the WebDriver "pointer-interactable" gate and light-dismiss
   containment checks need. (Preserves the non-null `<body>` fallback for stray points —
   issue #63 — and saves/restores the `__obscura_click_target` side effect of gBCR.)

2. **The Escape close-request** (`_processCloseRequest` in `bootstrap.js`; invoked from
   both `input.rs` and the in-page bridge). A trusted Escape keydown, **only if not
   preventDefault'd** (a focused text field can swallow it), runs the UA close algorithm:
   pick the single topmost top-layer element across **both** the auto/hint popover stack
   **and** the open modal dialogs — ranked by a new monotonic `_topLayerSeq` stamp set
   when a popover shows or a dialog goes modal — and run its close behavior (hide the
   popover; or fire cancelable `cancel` then close the dialog). A `_modalDialogSet`
   maintained at the single `_setDialogModal` choke point makes the dialog side cheap.

3. **The in-page bridge** (`scripts/wpt_run.py`, injected via `add_init_script`).
   `test_driver_internal.{click,send_keys,action_sequence,bless}` are patched to
   synthesize the DOM events **directly in the page** — element origins → viewport-center
   coords, WebDriver key code points (`` Escape, …) → key/code, then pointer/mouse
   `down`→`up`→`click` and `keydown`/`keyup` (+ the Escape close-request). Installed via a
   get/set property so it survives testdriver.js's single `test_driver_internal = {…}`
   assignment.

4. **Preload-before-scripts** (`page.rs` + `domains/page.rs`). THE crux. Obscura ran CDP
   `addScriptToEvaluateOnNewDocument` sources **after** navigation completed — but it also
   runs the whole async harness **during** navigation, so the bridge landed *after* the
   promise_tests had already run against the throwing default backend. Fixed by threading
   the preloads onto the page (`set_pending_preloads`) and running them right after the JS
   context is created and **before** the document's own scripts — the correct "on new
   document" ordering (Playwright's `addInitScript` relies on it).

## Why in-page, not CDP-routed

The first three designs failed, each teaching the next:
- A Playwright `expose_binding` → CDP `Input` route died: Obscura's `Runtime.addBinding`
  is a **no-op stub** (defines a function returning `null`, never calls back).
- A Python-side queue drained over CDP died: Obscura's page thread **blocks on any
  in-flight `page.evaluate`** and cannot service a second one (a 2 s timer evaluate
  starved a parallel `1+1` into an 8 s timeout) — so a concurrent drainer deadlocks.
- Draining after `goto` died: the harness **completes during `Page.navigate`** (even with
  `wait_until=domcontentloaded` the results are already rendered when goto returns), so
  Python never regains control while the tests run.

The conclusion: input must be synthesized **synchronously in-page**, exactly when the test
calls `test_driver`. Trade-off: in-page events are `isTrusted:false`, so the one subtest
that asserts "synthetic events can't close popovers" is unwinnable this way (named below).

## Results (stash-verified before → after)

| Test | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `popover-attribute-basic` | 113/249 | **159/249** | **+46** |
| `popover-light-dismiss` | 8/33 | **15/33** | **+7** |
| `popover-light-dismiss-hint` | 1/9 | **3/9** | **+2** |
| `dialog-canceling` | 0/1 | **1/1** | **+1** |

**+56, zero regressions.** The `attribute-basic` +46 is a bonus: many of its subtests
depend on box/visibility, which the real `elementFromPoint` (and the gBCR it exercises)
fixes.

## Zero-regression sweep

Held at HEAD (with the bridge injected on every run): qsa **1975/1975**, createElement
**147/147**, Node-insertBefore **39/40**, appendChild **11/11**, DOMTokenList-Iterable
6/6, url-origin 406/413, mark 22/22, structured-clone 141/152, getRandomValues 39/39,
EventTarget-dispatchEvent **25/25**; command realm **event-interface 22, command-reflection
16, button-type-behavior 23, on-popover-behavior 28, on-dialog-behavior 104** (193/193,
100%); popover **all-elements 1101/1101, invoking-attribute 1400/1402, toggleevent 39/39**.
Baselines stash-proven by rebuilding at clean HEAD.

## Caps / Next

- **Tab / focus navigation** — `send_keys(Tab)` does not move focus (no focus model), so
  `popover-focus*` and the "moving focus outside/back" light-dismiss subtests stay red.
  A real **focus/`activeElement` traversal model** is the next lever here.
- **isTrusted-synthetic** — an in-page bridge produces `isTrusted:false` events, so
  "Synthetic events can't close popovers" cannot pass without a way to mark bridge input
  trusted. A genuine cap of the in-page approach.
- **Coordinate-driven invoker activation** — `clickOn(popovertargetButton)` dispatches a
  `click` event but doesn't run the popovertarget/command activation (that path keys off
  `.click()` / specific wiring), so several invoker light-dismiss subtests stay red.
- **`pointerup`-vs-`pointerdown` light-dismiss timing** — the existing light-dismiss fires
  on `mousedown`; one subtest wants close-on-`pointerup`. Pre-existing behavior; a bounded
  fix.
- **`CloseWatcher` API** — `close-watcher/*` mostly need `new CloseWatcher()` (absent); the
  dialog/popover-typed helpers there would light up once it lands. A clean follow-up now
  that `_processCloseRequest` exists.
- **`dialog-cancel-events`** (single_test + `done()`): closes correctly but the async
  `close` event's trailing `setTimeout(0)` doesn't reach `done()` before the harness gives
  up during navigation — 0/1 baseline, still 0/1 (no regression). A navigation event-loop
  draining nuance.
- **Next:** a focus/`activeElement` model unlocks the whole Tab/focus tail across popovers,
  dialogs, and forms; then the `CloseWatcher` API; then the `pointerup` timing + coordinate
  invoker activation for the rest of light-dismiss.
