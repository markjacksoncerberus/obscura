# Quest #172 — The Dismissed Verdict

**Realm:** `html/semantics/popovers/` (popover light dismiss)
**Session:** 2026-07-10
**Result:** +61 subtests, ZERO regressions.

## The gap

`popover-attribute-basic.html` sat at 159/249 — **~90 failing subtests**, and almost all of
them ended in the same assertion:

```
assert_false: A popover=auto should light-dismiss expected false got true
```

The test shows an `auto` popover, `await clickOn(outsideElement)` (a `test_driver.Actions()`
pointer sequence over the outside element's rect), and expects the popover to have
light-dismissed. It hadn't. The `manual` cases (which assert it stays open) passed; every
`auto`/`hint` case that should dismiss failed — i.e. **light dismiss simply never happened**.

## Root cause — the listener was registered on a null document

Narrowing from the failing test to a same-origin `data:`/`srcdoc` repro driven over CDP proved
it step by step:

- `elementFromPoint(outsideCenter)` correctly returns the outside element (hit-testing fine).
- A **direct** call to `globalThis._popoverLightDismiss(outside)` correctly closes the popover
  (the dismiss logic itself is fine).
- A real `pointerdown` dispatched on the outside element **reaches** document capture listeners
  (a test listener fired) — but a wrapped `_popoverLightDismiss` was **never invoked**, and the
  popover stayed open.
- `_eventRegistry` had only a `window` key; the document's `_nid` key (`0`) appeared **only after**
  a runtime `document.addEventListener` — proving no document listener existed from bootstrap.

The light-dismiss listener is registered by top-level code in the popover block:

```js
document.addEventListener('pointerdown', _ld, true);   // ~line 17757
```

But `globalThis.document` is `null` at that point — it is set to `null` at bootstrap
(`globalThis.document = null`) and only **bound to the real document inside `__obscura_init`**
(which runs at runtime construction, after all top-level bootstrap). So `document.addEventListener`
threw `TypeError`, was swallowed by the surrounding `try/catch`, and **no listener was ever installed
on the live document**. Light dismiss was dead on every page.

## The fix (`bootstrap.js` + a harness assist)

**(1) Defer registration to after the document is bound.** Replaced the top-level registration
with an installer that `__obscura_init` calls right after `globalThis.document = _docProxy`:

```js
globalThis._installPopoverLightDismiss = () => {
  try {
    const _down = (e) => { if (_trusted(e)) globalThis._popoverLightDismissDown(e && e.target); };
    const _up   = (e) => { if (_trusted(e)) globalThis._popoverLightDismissUp(e && e.target); };
    document.addEventListener('pointerdown', _down, true);
    document.addEventListener('mousedown',   _down, true);
    document.addEventListener('pointerup',   _up,   true);
    document.addEventListener('mouseup',     _up,   true);
  } catch (e) {}
};
```

This single change took `popover-attribute-basic` 159→195 (+36) and cascaded across the realm.

**(2) The spec pointerdown/pointerup model.** HTML light-dismisses on the pointer-**up**: the
popover under the pointer-**down** is remembered, and the matching pointer-up hides the popovers not
related to it. This is what lets a drag started inside a popover and released outside leave it open,
and makes a bare pointerdown (no pointerup) inert. Split the old single-shot handler into
`_popoverClickedTarget` (containment + invoker protection), `_popoverDismissExcept`,
`_popoverLightDismissDown` (record), `_popoverLightDismissUp` (dismiss using the recorded target).

**(3) Trusted-input gating.** Only trusted input dismisses (`e.isTrusted || __obscura_trusted_input`)
so a page's own `dispatchEvent(new PointerEvent('pointerup'))` does not close popovers. The WPT input
bridge (`scripts/wpt_run.py` `firePointer`/`fireMouse`) sets `__obscura_trusted_input` for the
duration of its synchronous dispatch — the faithful simulation of WebDriver's trusted events. (There
is no Rust CDP mouse-input path in the product — mouse input arrives only via this in-page bridge or
page scripts — so the gating cannot regress real usage.)

## Results (+61, zero regressions)

| Test | Before | After |
|------|:------:|:-----:|
| `popover-attribute-basic.html` | 159/249 | **195/249** (+36) |
| `popover-light-dismiss.html` | 15/33 | **20/33** (+5) |
| `popover-light-dismiss-hint.html` | 3/9 | **9/9** (+6) |
| `popover-target-element-disabled.html` | 2/7 | **7/7** (+5) |
| `popover-top-layer-nesting-hints.html` | 5/20 | **11/20** (+6) |
| `popover-hint-hierarchy.html` | 3/5 | **4/5** (+1) |
| `popover-open-in-beforetoggle.html` | 3/5 | **5/5** (+2) |

Regression sweep (all held): dispatchEvent 25/25, all-global-events 375/375, body-window 140/140,
onerroreventhandler 3/3, qsa 1975/1975, DOMTokenList 6/6 + 1/1, createElement 147/147,
form-elements-matches 2/2, inline-event-handler-ordering 3/3, dialog-showModal 8/10 & frame-removal
5/6 (both pre-existing layout/windowless caps, unrelated to pointer light dismiss).

## Caps / Next

The remaining popover failures are **distinct primitives**, not more of this one:

1. **Coordinate-invoker activation (widest next lever).** A *trusted* `click` event runs **no
   activation behavior** — the popover invoker (`_runPopoverInvoker`) and command invoker
   (`_runCommandInvoker`) fire only inside the `.click()` **method**, not as the default action of a
   dispatched click (`_dispatchSpec` has no activation-behavior step). So the harness clicking a
   `popovertarget` button doesn't show/toggle its popover. Blocks the invoker cases in
   `popover-light-dismiss` and the shadow-DOM popover cases. This extends the same trusted-input
   mechanism added here — a document-level trusted-`click` listener that runs invoker/command
   activation (gated on `isTrusted || __obscura_trusted_input`, so it won't double-fire for the
   untrusted click `.click()` dispatches).
2. **Form-owner via the `form=` attribute** (`button-type-popovertarget` 11/15,
   `input-type-popovertarget` 8/12). A submit/reset/image button associated to a form by the `form=`
   attribute should perform the form action and NOT toggle its popover; `this.form` / the `_hasForm`
   check in `.click()` isn't honouring `form=`.
3. **Tab-focus navigation** into/out of popovers (`popover-focus` 11/30, and the "moving focus
   outside should not dismiss" case).

**DEV NOTES:** grep `_installPopoverLightDismiss` before touching popover light dismiss or
`__obscura_init`'s document binding — the capture listeners MUST be installed after `globalThis.document`
is bound, never at top-level (document is null there). Grep `_popoverLightDismissDown`/`Up` /
`_popoverClickedTarget` before touching the dismiss algorithm (pointerdown records, pointerup dismisses).
`__obscura_trusted_input` is set by the WPT bridge around injected pointer dispatch and read only by the
light-dismiss handler — a page's synthetic events stay untrusted and inert.
