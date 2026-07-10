# Quest #173 — The Invoked Verdict

**Realm:** `html/semantics/popovers/` (invoker activation on trusted clicks)
**Session:** 2026-07-10
**Result:** +15 subtests across 6 tests, ZERO regressions.

## The gap

Quest #172 fixed popover *light dismiss* for trusted (harness) input, but named the
next lever precisely: a **trusted `click` event carries no activation behavior**. All
invoker activation — the popover invoker (`popovertarget`) and the command invoker
(`commandfor`) — lived *only* inside the `.click()` **method**. A dispatched click
(the harness's `test_driver` pointer sequence, or any real user click) ran the click
event's listeners but never its default action, so:

- The harness clicking a `<button popovertarget=p>` never showed/toggled `p`.
- The harness clicking a `<button commandfor=p command=toggle-popover>` never ran the
  command.

Dozens of popover subtests open a popover via `clickOn(invokerButton)` and then assert
it is open — all of them failed at the very first assertion.

## The fix (`bootstrap.js`, three parts)

**(1) Extract the activation, share it with a trusted-click listener.** The popover +
command invoker blocks moved out of `.click()` into `globalThis._runInvokerActivation(el)`
(behavior-preserving for the `.click()` path). A new
`globalThis._installInvokerActivation()` — called by `__obscura_init` right after the
document is bound, exactly like the #172 light-dismiss installer — registers a
bubble-phase `click` listener on the live document. For a **trusted, non-canceled**
click it walks from `e.target` up to the nearest invoker ancestor and runs its
activation.

Trust gating mirrors light dismiss: `e.isTrusted || __obscura_trusted_input` (the WPT
bridge sets `__obscura_trusted_input` around its synchronous injected dispatch). This
is why there is **no double-fire**: the untrusted `click` that `.click()` itself
dispatches is not trusted and `__obscura_trusted_input` is not set during `.click()`,
so the doc listener ignores it while `.click()`'s inline `_runInvokerActivation` still
runs; and a page's own `dispatchEvent(new MouseEvent('click'))` (untrusted) activates
nothing, per spec.

**(2) Command invokers protect their popover from light dismiss.** `_popoverClickedTarget`
(the light-dismiss "clicked node" resolution) only recognized `popovertarget` invokers.
A `<button commandfor=p>` pointing at a *showing* popover now protects it too — clicking
the invoker again shouldn't light-dismiss the popover it controls (HTML light-dismiss
ancestry). Without this, the "clicking the invoker after activation shouldn't close its
popover" cases dismissed-then-reshowed (`hideCount` off by one).

**(3) A disabled invoker protects nothing.** A `disabled` button/input is inert: it
activates nothing (both `_runPopoverInvoker`/`_runCommandInvoker` already bail on
`disabled`) and it must **not** shield the popover from light dismiss — clicking it is
just an ordinary outside click that dismisses normally. Added an early `if (n.disabled)`
skip in the `_popoverClickedTarget` walk. This both removed a regression the commandfor
branch would otherwise have introduced and turned `popover-light-dismiss-disabled-button`
from 1/3 to **3/3**.

## Results (+15, zero regressions — clean matched baseline)

| Test | Before | After |
|------|:------:|:-----:|
| `popover-light-dismiss-command.html` | 4/14 | **8/14** (+4) |
| `popover-light-dismiss.html` | 20/33 | **23/33** (+3) |
| `popover-light-dismiss-input-button.html` | 5/14 | **8/14** (+3) |
| `popover-light-dismiss-disabled-button.html` | 1/3 | **3/3** (+2) |
| `popover-invoking-attribute.html` | 1400/1402 | **1402/1402** (+2) |
| `popover-hint-hierarchy.html` | 4/5 | **5/5** (+1) |

Regression sweep (all held): `popover-attribute-basic` 195/249, `popover-invoking-attribute-hint`
700/700, `popover-target-element-disabled` 7/7, `popover-open-in-beforetoggle` 5/5,
`popover-light-dismiss-hint` 9/9, `imperative-invokers` 10/10, `togglePopover` 3/3,
`popover-types` 1/1, `button-type-popovertarget` 11/15, `input-type-popovertarget` 8/12,
`popover-top-layer-*` unchanged; qsa 1975/1975, DOMTokenList-value 1/1, createElement
147/147, dispatchEvent 25/25, all-global-events 375/375, button-click-submits 6/12
(pre-existing). `checkbox` 2/6 unchanged (trusted-click does not run the checkbox
pre-click activation — a separate, untouched primitive).

## Caps / Next

The remaining popover invoker failures are **distinct primitives**, not more of this one:

1. **Shadow-DOM popover connectedness** (`popover-shadow-dom` 0/3, and the "shadow DOM
   popover" cases inside `popover-light-dismiss`). `showPopover()` on a `[popover]` inside
   a (declarative) shadow tree throws *"Invalid on popover elements which aren't connected
   to a document"* — the connectedness check stops at the shadow boundary; it should be
   shadow-inclusive.
2. **Cross-document pointer sequences** (`popover-light-dismiss` / `-command`: "Pointer down
   in one document and pointer up in another shouldn't dismiss"). Needs the pointerdown/up
   pairing to span an iframe boundary; the current `__obscura_trusted_input` bridge and the
   `_popoverPdown*` state are per top-document.
3. **Tab-focus navigation** into/out of popovers (`popover-focus` 11/30; the "moving focus
   outside/back to the invoker should not dismiss" cases).
4. **`popover-top-layer-combinations`** (0/5) and **`-interactions`** (4/9) — dialog +
   popover top-layer interaction ordering.

**DEV NOTES:** grep `_runInvokerActivation` / `_installInvokerActivation` before touching
invoker activation or `.click()` — activation is shared between the `.click()` method and
the document-level trusted-click listener (installed after `globalThis.document` is bound,
never at top-level). Grep `_popoverClickedTarget` before touching light-dismiss invoker
protection — it now recognizes `commandfor` invokers and skips `disabled` ones. The
trusted-click activation is gated on `isTrusted || __obscura_trusted_input`, so scripted
`.click()` (untrusted) and page-synthesized clicks never double-activate.
