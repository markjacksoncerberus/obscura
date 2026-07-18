# Quest #176 — The Click-Focus Verdict (+10)

**Realm:** `html/semantics/popovers/popover-focus.html`
**Result:** 20/30 → **30/30** (100%). **ZERO regressions.**
**Session:** 2026-07-10

## The gap

Two whole test families in `popover-focus.html` — *"Popover button click focus
test"* and *"Popover corner cases test"* (10 subtests) — all died on the same first
assertion:

```
await clickOn(button);
assert_equals(document.activeElement, button,
  'focus should move to the button when clicked, and should stay there when the popover closes');
// expected <button popovertarget> … got <button id="priorFocus">
```

The trusted click reached the invoker (its popover toggled correctly, thanks to
#173), but **focus never moved to the clicked control** — it stayed on `priorFocus`.
Quest #158, which built the layout-free focus model, had named this exact cap:
*"the 'button click'/'corner cases' families need … isTrusted-synthetic
click-to-focus."*

## Root cause

Obscura had no **"click focusing steps."** Real browsers, on `mousedown`, run the
focusing steps on the nearest click-focusable inclusive ancestor of the press
target. Obscura's focus model only moved focus via the `focus()`/`showPopover()`
autofocus paths — a pointer press focused nothing.

## The fix (`bootstrap.js`, one new installer)

`globalThis._installClickFocus()` — a bubble-phase `mousedown` listener on the live
document (installed by `__obscura_init` alongside `_installPopoverLightDismiss` /
`_installInvokerActivation`). For a **trusted, non-canceled** press it walks from
`e.target` up to the first `_isFocusableArea` and `_performFocus`es it.

Why this is enough — **the sequencing carries the three cases for free.** The WPT
input bridge fires `mousedown → pointerup → click`, so the click-focus lands BEFORE
popover light dismiss (pointerup) and invoker activation (click):

| Case | mousedown | activation / dismiss | end focus |
|------|-----------|----------------------|-----------|
| invoker button *outside* popover | focus button | invoker hides popover (focus not inside it → no restore) | **button** ✓ |
| invoker button *inside* popover (`action=hide`) | focus button | hide → button now `display:none`; `_restorePreviousFocus` (focus was inside) → priorFocus | **priorFocus** ✓ |
| unrelated button (no `popovertarget`) | focus button | pointerup light-dismisses popover (focus now on button, outside → no restore) | **button** ✓ |

The existing `_restorePreviousFocus` already restores only *when current focus is
inside the closing element* — so case 2's "hide moves focus back" wins precisely
because the pressed control stopped being focusable.

### Two deliberate scoping choices

- **Trusted only** (`isTrusted || __obscura_trusted_input`). The scripted `.click()`
  METHOD dispatches an untrusted click and no `mousedown` at all — so it never shifts
  focus. This is load-bearing: the *passing* "Popover focus test" family calls
  `button.click()` and asserts focus stays on the popover's autofocus target, **not**
  the button. A trusted-gated `mousedown` hook leaves that path untouched.
- **Focus-only, never blur.** A press on non-focusable content is a no-op here (we do
  not clear focus the way a real browser blurs on click-empty-space). No WPT fixture
  depends on click-empty-space clearing focus, and blurring broadly is the kind of
  wide primitive that risks the zero-regression promise. Scoped to the observable
  "click focuses control" behavior.

## Results & sweep

`popover-focus` **20/30 → 30/30**. Zero regressions (fresh-server measured — two
apparent dips, top-layer-combinations 3/5 and light-dismiss 24, were server
degradation and cleared on restart to 5/5 and 25):

popover-attribute-basic 195, popover-invoking-attribute 1402, popover-light-dismiss
25, popover-light-dismiss-command 8, popover-light-dismiss-hint 9, popover-shadow-dom
3, popover-top-layer-combinations 5/5, popover-top-layer-interactions 9/9, qsa 1975,
classlist 1420, createElement 147, dispatchEvent 25, Element-matches 669,
all-global-events 375, dialog-showModal 8/10 (pre-existing layout cap), dialog-close 5.

## Caps / Next

- **Click-focus is `mousedown`-scoped and focus-only.** No blur-on-empty-click, no
  click-focusability distinction beyond `_isFocusableArea` (which already admits
  `tabindex=-1`). Grep `_installClickFocus` before touching pointer→focus behavior.
- **cross-document pointerdown/up pairing** (`popover-light-dismiss`: "Pointer down in
  one document and pointer up in another shouldn't dismiss") — needs the
  `_popoverLightDismissDown/Up` state + `__obscura_trusted_input` bridge to span an
  iframe boundary. Still ~8 fails in that file (focus-move edge cases,
  cross-document-pointer, hint-stack).
- **scripting-errors exact line/col** (runtime→Rust boundary drops the throw site →
  `lineno:0`).
- `Node.isConnected` still shadow-blind (#174, deliberately untouched).
