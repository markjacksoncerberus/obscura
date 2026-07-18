# Quest #153 — The Hinted Verdict (+21)

**Realm:** `html/semantics/popovers/` (the hint-stacking tail) + a broadly-useful
`document.currentScript` primitive.
**Files:** `crates/obscura-js/js/bootstrap.js` (the model + reflection + reentrancy +
`currentScript` getter) and `crates/obscura-browser/src/page.rs` (the classic-script
driver sets `document.currentScript`). **No new Rust DOM primitives.**
**Result:** **+21, ZERO regressions** (stash-verified the script-driver change; full held-realm sweep).

## The gap

Quest #152 landed the whole popover API on a **single merged auto/hint stack**
(`_popoverAutoStack`) whose "show closes unrelated popovers" step used pure DOM
containment. That was correct for auto-only pages but wrong for hints:

- Showing a `popover=hint` closed unrelated `popover=auto` popovers (it should close
  only other hints — an auto must survive a hint opening above it).
- No downgrade: an `auto` opened *inside* an open `hint` should become a hint (an auto
  cannot be parented by a hint) and share the hint's fate.
- No "hint stack parent": hiding an auto should take its *nested* hint stack down with
  it, but leave a *sibling* (non-nested) hint open.
- `popover-types-with-hints.html` couldn't even run its assertions — its helper reads
  `document.currentScript.parentElement`, and **`document.currentScript` did not exist**,
  so every subtest threw `reading 'parentElement' of undefined`.
- `showPopover({source})` didn't validate `source` (WebIDL: a non-nullable `Element`,
  so `{source:null}` must throw TypeError) and didn't use `source` for ancestry.
- `popoverTargetElement` reflection was one-directional: `=null` left the attribute set,
  and removing/rewriting the `popovertarget` attribute didn't clear the explicit ref.
- No reentrancy guard: `showPopover()` from inside a *closing* `beforetoggle` handler
  should throw `InvalidStateError` (a whole `popover-open-in-beforetoggle.html` gap that
  showed up as a harness ERROR).

## The fix (all `bootstrap.js` except the `currentScript` driver)

**The auto/hint two-list stacking model** (HTML §popover, verified against the spec's
"show popover", "hide popover", "hide popover stack until", "topmost popover ancestor"):
`_popoverAutoStack` stays a single top-layer order; the spec's "showing auto popover
list" and "showing hint popover list" are just that stack filtered by **effective
type** (`_popoverEffType` — an `auto` opened inside a `hint` is stored downgraded to
`hint`). New helpers:
- `_topmostPopoverAncestor(newEl, source)` — the open popover that is the nearest
  flat-tree ancestor of `newEl` OR whose subtree contains the invoker `source`;
  whichever is later in top-layer order wins (`max(popoverAncestorIndex, sourceAncestorIndex)`).
- `_hideStackUntil(endpoint, stackType, fireEvents)` — hide, top-first, every popover of
  the given type sitting above `endpoint` in that type's list (all of them if endpoint is
  null / absent), recomputing each pass since a fired beforetoggle may show more popovers.
- **show popover** computes the ancestor, downgrades an `auto`→`hint` when its ancestor is
  a hint, then `_hideStackUntil(ancestor, 'hint')` **always** and `_hideStackUntil(ancestor,
  'auto')` **only when this popover resolves to auto** — so a hint never disturbs autos, and
  an auto closes hints before autos (the spec's "hints close first" ordering).
- **hide popover** closes hints above `el`, then (if `el` is `_popoverHintStackParent`) the
  whole hint stack, then autos above `el`, then `el`. `_popoverHintStackParent` is the auto
  a fresh hint stack hangs off of (recorded when the hint list goes empty→non-empty, cleared
  when the last hint closes) — the mechanism that ties a nested hint's lifetime to its
  ancestral auto while leaving a sibling hint alone.

**`document.currentScript`** — a `Document` getter returning `_wrap(globalThis.__currentScriptNid)`
(null when unset / in modules). The classic-script driver in `page.rs` sets
`__currentScriptNid` to each `<script>`'s node id (threaded through `ScriptInfo.nid =
sid.raw()`) before running it and resets to `-1` before module evaluation; the dynamic
inline-`<script>` `appendChild` path save/restores it around its `eval`. Broadly useful
beyond popovers.

**`{source}` validation + ancestry** — `_optSource` throws TypeError for a present-but-non-Element
`source` (incl. explicit null), returns null for absent/undefined; the resolved source feeds
`_topmostPopoverAncestor` so a popover shown via `showPopover({source})` or a `popovertarget`
invoker nests under the popover the source lives in.

**`popoverTargetElement` element reflection** — `=null` now `removeAttribute('popovertarget')`;
`=element` sets the content attribute then records the explicit ref; and any direct
`setAttribute`/`removeAttribute` of `popovertarget` clears `_popoverTargetElement` so the getter
falls back to id resolution (the "explicitly set attr-element" rule).

**Reentrancy guards** — document-level `_popoverShowingFlag` (true across a show) and
`_popoverHidingCount` (>0 while a closing beforetoggle fires). `showPopover()` throws
`InvalidStateError` (or silently returns for the invoker path) when either is active, so a
`showPopover()` fired from inside a beforetoggle handler is rejected.

## Results

| Test | Before | After | Note |
|------|:------:|:-----:|------|
| `popover-types-with-hints.html` | 0/7 | **7/7** | hint model + `currentScript` |
| `imperative-invokers.html` | 5/10 | **10/10** | `source` ancestry + `{source:null}` throws |
| `popover-open-in-beforetoggle.html` | 0/5 (ERROR) | **3/5** | reentrancy guards |
| `popover-hint-hierarchy.html` | 0/5 | **3/5** | hint model |
| `popover-top-layer-nesting-hints.html` | 3/20 | **5/20** | hint model |
| `popovertarget-reflection.html` | 0/1 | **1/1** | element reflection |

**= +21, ZERO regressions.** Held (measured this session): qsa 1975, classlist 1420,
createElement 147, reflection-misc 4709/4877, reactions Element 47 / Node 14 / NamedNodeMap
14 / HTMLElement 22, attributes 67, setAttribute 2, popover all-elements 1101 / invoking 1400 /
-hint 700 / toggleevent 39 / attribute-basic 113 / button 11/15 / input 8/12 / toggle-source 6/7.
Stash-verified the script-driver change: async_001 (0/1) and script-onerror (TIMEOUT) are
pre-existing, identical with and without the change.

## Caps / Next

- **`test_driver` → CDP input bridge is still the widest remaining lever.** Every remaining
  hint/dismiss/focus fail ends in `test_driver.Actions()` / `send_keys` / `clickOn`, which
  isn't bridged to real input (no DOM pointer/key events fire). This caps
  `popover-hint-hierarchy` (2), `popover-top-layer-nesting-hints`, `popover-attribute-basic`
  (136 combinatorial), all `popover-light-dismiss-*`, `popover-focus-*`, `popover-self-invoke`.
  The tests compute click coordinates from `getBoundingClientRect()` and rely on
  `elementFromPoint` (only 9/33 here, no real layout) — so a pure-JS synthetic-event bridge
  would still mis-hit-test; a faithful bridge needs coordinate hit-testing Obscura fakes.
- **`dialog.showModal`** — the dialog top-layer API (separate surface) caps the rest of
  `popover-top-layer-nesting*` and one `open-in-beforetoggle` subtest.
- **The `command`/`commandfor` invoker API** — the newer sibling of `popovertarget`
  (`popover-toggle-source` last 1, `popover-light-dismiss-command*`). Pure DOM/event work,
  no input — the cleanest next non-render popover win.
- **Shadow-DOM flat-tree ancestry** — `popover-nested-in-button` (invoker inside a shadow root)
  needs `_topmostPopoverAncestor` to walk the flat tree across shadow boundaries.
