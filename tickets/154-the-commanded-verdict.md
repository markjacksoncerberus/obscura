# Quest #154 — The Commanded Verdict (+92)

**Realm:** `html/semantics/the-button-element/command-and-commandfor/` — the
`command`/`commandfor` invoker API, the newer sibling of `popovertarget`.
**Files:** `crates/obscura-js/js/bootstrap.js` only. **No new Rust DOM primitives.**
**Result:** **+92, ZERO regressions** (a bonus +1 on `popover-toggle-source` 6→7; a
mid-quest regression on `on-popover-invalid-behavior` was caught and fixed before commit).

## The gap

The `html/semantics/the-button-element/command-and-commandfor/` realm was found
almost entirely red — the whole command invoker surface was unimplemented. Unlike
`popovertarget` (built in #152, which reflects a target + an action), the command
API is event-driven: an invoker button fires a **`CommandEvent`** at its target and
the UA runs a named default action (show/hide/toggle a popover, show-modal/close a
dialog, or a custom `--x` no-op). Memory #152/#153 flagged it as the cleanest next
popover-adjacent win — pure DOM/event, no `test_driver` input bridge required.

Baseline: interface 1/11, command-reflection 8/16, event-interface 0/22,
button-type-behavior 8/23, button-type-reflection 9/27, on-popover-behavior 14/28,
on-popover-disconnect 0/1, source-attribute-retargeting 0/3.

## The work (all `bootstrap.js`)

1. **`CommandEvent`** (Event subclass, mirrors `ToggleEvent`): `command` is a
   DOMString ToString-coerced readonly default `""`; `source` is an `Element?` default
   null — but any present non-Element value (a boolean, `{}`, a non-Element EventTarget
   like `XMLHttpRequest`) is a WebIDL conversion **TypeError**. Crucially `source`
   **participates in event retargeting** exactly like a MouseEvent's `relatedTarget`.

2. **Generalized the shared dispatch retargeting** (`_dispatchSpec` / `_invokeListeners`)
   to carry `source` for a CommandEvent. Introduced a single `_rtBase` — the retargeting
   base is `relatedTarget` for a Mouse/Focus event, or the CommandEvent's original
   `source` (`_cmdSource`, stashed immutable so struct-building never sees the live
   value). Per struct the retargeted value is written to `event._sourceLive` (the
   `source` getter reports it); on clear-targets it becomes null. **Guarded on
   `'_cmdSource' in event`**, so for every existing event `_rtBase === event.relatedTarget`
   and the behavior is provably identical — the change is inert for non-CommandEvents.

3. **`commandForElement`** element reflection (HTMLButtonElement only — NOT input): the
   setter stores the explicit element + blanks the content attribute (a `{}` throws
   TypeError); the getter exposes the explicit element only while it is a **descendant of
   one of the button's shadow-including ancestors** (so a light-DOM target set from a
   shadow button IS visible, but a target buried in a shadow tree is not — this is the
   "get the attr-associated element" algorithm, and differs from popoverTargetElement's
   simpler same-root check).

4. **`command`** enumerated reflection: known keywords (`toggle-popover`, `show-popover`,
   `hide-popover`, `show-modal`, `close`) are ASCII-case-insensitive and canonicalize to
   lowercase; a custom command (starts with `--`) is valid and preserved verbatim
   (case-sensitive); anything else — and the missing attribute — reads back as `""`.
   Setter is a plain string reflection. `commandfor` content-attr writes clear the
   explicit `_commandForElement` (mirroring `popovertarget`).

5. **`button.type`** now resolves the **Auto** state correctly: missing/invalid type is
   Auto, and Auto reflects as `"submit"` ONLY for a bona-fide submit button (neither
   `command` nor `commandfor` present); a command invoker's Auto reflects as `"button"`.

6. **Activation** (`_runCommandInvoker` + a `click()` hook): follows the HTML button
   activation behavior. The form-owner gate is the subtle part — **only when the button
   has a form owner** do the Submit/Reset/Auto states return early (submit → submit,
   reset → reset, Auto → nothing); the Button state, or having no form owner at all,
   reaches the command steps. The form owner honors the `form=` attribute (via
   `_ceiFormOwner`), not just ancestry, and the submit-button determination now excludes
   command invokers. `_runCommandInvoker`: resolve target → **determine command validity
   BEFORE firing** (popover commands valid on any HTML element; show-modal/close only on
   a `<dialog>`; custom on any HTML element — an unsupported pair fires NO event) →
   capture the command value → fire a cancelable/bubbling/composed `CommandEvent`
   (source = invoker) → if not canceled AND target still connected AND not custom, run
   the default action. The captured command is read before firing, so a handler rewriting
   the `command` attribute can't alter the running invocation.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `interface.html` | 1/11 | **11/11** | +10 |
| `command-reflection.html` | 8/16 | **16/16** | +8 |
| `event-interface.html` | 0/22 | **22/22** | +22 |
| `button-type-behavior.html` | 8/23 | **23/23** | +15 |
| `button-type-reflection.html` | 9/27 | **27/27** | +18 |
| `on-popover-behavior.html` | 14/28 | **28/28** | +14 |
| `on-popover-disconnect.html` | 0/1 | **1/1** | +1 |
| `source-attribute-retargeting.html` | 0/3 | **3/3** | +3 |
| `popovers/popover-toggle-source.html` | 6/7 | **7/7** | +1 (bonus) |
| **Total** | | | **+92** |

`on-popover-invalid-behavior.html` stayed **16/16** — a mid-quest regression (show-modal/
close were firing events on a non-dialog popover) was caught by the sweep and fixed with
the command-validity gate.

## Zero-regression sweep

Shared dispatch change verified: `shadow-dom/event-with-related-target` 18/18,
`event-composed-path` 11/11, `event-composed` 9/9, `EventTarget-dispatchEvent` 25/25,
`Event-dispatch-order` 1/1, `Event-dispatch-target-moved` 1/1. Popover held: all-elements
1101, invoking-attribute 1400/1402 (the 2 fails are the `action_sequence()` test_driver
cap), -hint 700, toggleevent 39, attribute-basic 113/249 (input-bridge cap),
open-in-beforetoggle 3/5, events 5/6. Button/DOM held: `the-button-element/button-type`
2/2, qsa 1975, createElement 147, DOMTokenList-stringifier 1/1.

## Caps / Next

- **The dialog command tail is dialog-API-blocked, not command-blocked.**
  `on-dialog-behavior` (0/104), `on-dialog-invalid-behavior` (1/40) fail on
  `dialog.showModal is not a function` — the `<dialog>` element has NO `showModal`/
  `close`/`open`/`:modal`/`returnValue` yet. `_runCommandInvoker` already dispatches
  show-modal/close correctly and gates validity on `localName === 'dialog'`, so **the
  moment the dialog API lands, these ~140 subtests light up for free.** `on-dialog-disconnect`
  (1/1) already passes (it only checks the command event fires without error).
- **`invalid-element-types` / `command-close-target-non-dialog-crash`** could-not-run —
  they lean on `test_driver` `clickOn`/`action_sequence` (the input-bridge cap) and long
  timeouts.
- **NEXT (highest leverage): the `<dialog>` element API** — `show()`/`showModal()`/
  `close()`/`requestClose()`, the `open` reflection, `returnValue`, the `cancel`/`close`
  events, `:modal`, and top-layer participation. It unlocks the dialog command tail above
  PLUS the standalone `html/semantics/interactive-elements/the-dialog-element/` realm.
  Then the `test_driver`→CDP input bridge remains the widest single lever for the whole
  popover/dialog light-dismiss + focus tail.
