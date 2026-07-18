# Scroll 158 — The Focused Verdict ⚔️🎯

> *A layout-free focus model: the autofocus focusing steps + focus restoration.*

**Quest #158 · Realm: focus (`focus/`, popover & dialog focus) · +13, ZERO regressions ·
session 2026-07-08**

## The gap

For four straight quests the outgoing knight named the same "widest lever overall": a
**focus / `activeElement` model**. The popover & dialog APIs were shipped (#152–#157) but
every focus-dependent subtest was red — `popover-focus` sat at **1/30**, the dialog
autofocus tests **hung** (`waitUntilLoadedAndAutofocused()` never resolved), and
`focus()` focused *anything* (a plain `<div>` with no `tabindex`), which is wrong.

The engine already had the primitives: `document.activeElement` tracks a module-level
`__obscura_focused`; `HTMLElement.prototype.focus()`/`blur()` dispatched
`focus`/`blur`/`focusin`/`focusout` and set the Rust `:focus` bit. What was missing was
the **algorithms** the top-layer elements run when they open and close.

## The work (all `crates/obscura-js/js/bootstrap.js`)

A new **Focus model** section before the Popover API, exposing global helpers:

- **`_isFocusableArea(el)`** — the HTML "focusable area" predicate: explicit `tabindex`,
  the natively-focusable elements (`button`/`select`/`textarea`, non-hidden `input`,
  `a`/`area[href]`, `iframe`/`object`/`embed`, `audio`/`video[controls]`, first
  `summary` of a `details`), an open/shown `<dialog>` (the dialog focusing-steps
  fallback target), or a `contenteditable` host — provided it is rendered and not a
  disabled form control.
- **`_isRenderedForFocus(el)`** — layout-free "not `display:none`" approximation: walks
  self + ancestors and rejects a `hidden` attribute, an inline `display:none`, a closed
  `<dialog>`, or a non-showing `[popover]`. This is exactly what the WPT autofocus
  fixtures rely on to SKIP candidates (a `<button autofocus>` inside a nested *closed*
  `<dialog>`, an `autofocus disabled` input, an `autofocus hidden` textarea).
- **`_autofocusDelegate` / `_firstFocusableDescendant`** — tree-order descendant search
  for the autofocus delegate (and the dialog "focus delegate" fallback).
- **`_popoverFocusingSteps` / `_dialogFocusingSteps`** — HTML's focusing steps. A popover
  focuses its `autofocus` self (if focusable) or its autofocus delegate; a `<dialog>`
  shown as a popover uses the dialog steps. A dialog focuses its `autofocus` self, else
  its focus delegate (autofocus delegate → first focusable descendant), else **the dialog
  itself** — but only when that control is a real focusable area (a **disconnected**
  dialog's steps must not move focus).
- **`_performFocus(el)`** — the shared state change (blur/focusout old, focus/focusin
  new, Rust `:focus`), used by the steps (which already picked a valid control).
- **`_restorePreviousFocus(el)`** — restore focus to a stored
  `_previouslyFocusedElement` on close, but only when focus is still inside the closing
  element and the stored element is still focusable (a removed prior-focus is not
  restored, and focus that already moved away is not stolen).

Wiring:

- **`focus()`** now no-ops on a non-focusable element (via `_isFocusableArea`) and
  delegates to `_performFocus`.
- **`_showPopover`**: an auto/hint popover stores `_previouslyFocusedElement` (a manual
  one does not — manual popovers move focus on show but never restore), then runs the
  popover focusing steps.
- **Popover hide** (`_hidePopoverInstance`/`_hideStackUntil`/`_hidePopover`): threads a
  `focusPrev` flag and restores. Removal (`_popoverRemovalSteps`) and a modal dialog
  superseding popovers (`_dialogHidePopovers`) pass `focusPrev=false` (no restoration).
- **Dialog `show()`/`showModal()`**: store `_previouslyFocusedElement`, run the dialog
  focusing steps; **`_closeTheDialog`** restores.
- **`_processCloseRequest`** (the Esc path): a `<dialog>` shown *as a popover* has no
  `open` attribute, so it must take the **hide-popover** path (which restores focus), not
  `requestClose` (which early-returns). Tracked the winner's origin stack (`bestKind`)
  and route on that.
- **Document-load autofocus**: on `window`'s `load`, "flush the autofocus candidates" —
  focus the first focusable `autofocus` element in tree order, only if nothing is focused
  yet. Inert for pages without an unfocused autofocus candidate. This is what fires the
  `focusin` that `waitUntilLoadedAndAutofocused()` waits for.

## Results

| Test | Before | After | Δ |
|---|:---:|:---:|:---:|
| `popovers/popover-focus.html` | 1/30 | **11/30** | +10 |
| `the-dialog-element/dialog-autofocus.html` | 0/1 (hung) | **1/1** | +1 |
| `the-dialog-element/show-modal-focusing-steps.html` | 0/1 (hung) | **1/1** | +1 |
| `the-dialog-element/dialog-autofocus-just-once.html` | 0/1 | **1/1** | +1 |

**+13, ZERO regressions.** Held (stash-proven at HEAD + re-measured with the change):
qsa 1975, Node-insertBefore 39, dispatchEvent 25, structured-clone 141, iframe-load 2/2,
popover-attribute-basic 159, popover-light-dismiss 15, popover-invoking-attribute 1400,
toggleevent 39, on-dialog-behavior 104, on-popover-behavior 28, dialog-open 3/3,
dialog-close 5/5, **dialog-focusing-steps-disconnected 2/2** (a regression to 1/2 was
caught mid-session — the disconnected-dialog fallback focus — and fixed with the
`_isFocusableArea(control)` guard), dialog-focusing-steps-prevent-autofocus 1/1.

## Caps / Next

- **The "Popover button click focus test" / "corner cases" families** (18 of
  popover-focus's remaining 19) need **coordinate-invoker activation** (`clickOn(button)`
  must run the popovertarget/command activation *and* move focus to the button) and
  **isTrusted-synthetic click-to-focus** — our in-page bridge synthesizes `isTrusted:false`
  events, and a synthetic click neither focuses its target nor light-dismisses. The
  "corner cases" failures cascade from the "button click" ones leaving popovers open.
- **`popover-focus-2.html` + the whole Tab tail** need **sequential focus navigation**
  (`sendTab()`/`sendShiftTab()` — a real Tab-order traversal over `tabindex` + DOM order).
  This is the widest *remaining* focus lever but is layout-adjacent (focus order).
- **`focus-after-close` shadow subtests** need **shadow-DOM focus retargeting**
  (`shadowRoot.activeElement`, `document.activeElement` = shadow host); one subtest needs
  **removal-resets-focus** (focusing element removed → `activeElement` falls back to
  `<body>`); one needs scroll (layout).
- **`dialog-focusing-steps-inert`** + `dialog-autofocus-multiple-times` need an **`inert`
  model** (`inert` attribute makes a subtree unfocusable).
- **NEXT:** sequential focus navigation (Tab order) — unlocks `popover-focus-2` and the
  broad Tab tail; then the `inert` model; then shadow-DOM focus retargeting; then
  coordinate-invoker activation for the popover-focus "button click" family.
