# Quest #136 — The Reset Verdict

**Realm:** `html/semantics/forms/resetting-a-form` — the form reset algorithm
(HTML §4.10.21.4 "resetting a form" + each control's reset algorithm), plus the
default-value IDL attributes it restores.

**Result: +16 across 5 tests, zero regressions.**

## The gap

After #135 completed the `<select>`/`<option>` model, form **reset** was the
outstanding thread the memory flagged. The whole `resetting-a-form/` suite was at
**0** — `HTMLFormElement.prototype.reset()` crudely cleared every control's value
to `""`, never fired the `reset` event, and there were no default-value IDL
attributes for it to restore from:

- no `reset` event fired at all (`reset-event` / `reset-form-event-realm` = 0);
- reset set `value = ""` instead of restoring each control's default;
- reset buttons (`<button type=reset>` / `<input type=reset>`) had no activation
  behavior, so clicking one did nothing;
- `input.defaultValue` / `input.defaultChecked` / `output.value` /
  `output.defaultValue` did not exist;
- `document.forms` was a static `querySelectorAll` NodeList, so
  `document.forms.fm1.reset()` threw ("Cannot read properties of undefined");
- setting `textarea.value` clobbered the child text, destroying the default value
  that reset (and `defaultValue`) must return.

| Test | before | after |
| --- | --- | --- |
| reset-form | 0/12 | **12** |
| reset-form-2 | 0/1 | **1** |
| reset-event | 0/1 | **1** |
| reset-form-event-realm | 0/1 | **1** |
| value-defaultValue-textContent | 6/12 | **7** (bonus; residual 5 separate) |

## The fix (all in `bootstrap.js` + one tiny Rust op)

1. **The reset algorithm** (`HTMLFormElement.prototype.reset`): construct
   `new Event("reset", {bubbles:true, cancelable:true})`, mark it trusted, dispatch
   privately via `_dispatchSpec` (so the trusted flag survives — the public path
   clears it), then invoke the `onreset` content-attribute handler explicitly (this
   engine does not auto-invoke element `onX` handlers during dispatch — same as the
   `onselect` path). If `defaultPrevented`, abort. Otherwise run each control's
   reset algorithm over `this.elements`.

2. **Per-control reset** (`_resetControl`):
   - **input**: drop the dirty value (`delete _formValues[nid]` → the getter falls
     back to the sanitized `value` attribute); for checkbox/radio drop the dirty
     checkedness override so `checked()` follows the `checked` attribute again.
   - **textarea**: drop the dirty value → the getter returns the child text (default).
   - **output**: leave value mode = default, restore textContent from the stored
     default value.
   - **select**: restore each option's selectedness from its `selected` attribute,
     clear dirtiness, re-run the selectedness algorithm (reuses #135's `_resetSelect`).

3. **Dirty checkedness = the Rust `checked_state` override.** The Rust DOM already
   models "follow the attribute unless JS set it": `checked()` returns the override
   if present, else `getAttribute("checked").is_some()`. So the only missing piece
   was a way to *drop* the override on reset — a new **`clear_checked` op**
   (`tree.rs::clear_checked` + `ops.rs`). After reset, `defaultChecked = false`
   (which removes the attribute) correctly makes `checked` false with no re-reset.

4. **Default-value IDL**: `input.defaultValue` (reflects `value`),
   `input.defaultChecked` (reflects `checked`), `output.value` /
   `output.defaultValue` (value-mode flag `_outValueMode` + stored default
   `_outDefault`, HTML §4.10.12). `textarea.defaultValue` and
   `option.defaultSelected` already existed.

5. **Reset-button activation behavior** (in `Element.prototype.click`): after a
   non-canceled click on a `type=reset` button/input, run its form owner's reset.

6. **`document.forms` is now a real `HTMLCollection`** (`_makeHTMLCollection` over
   `querySelectorAll("form")`) so named access `document.forms.fm1` resolves by
   id/name — required by the "by calling reset()" subtests.

7. **`textarea.value` no longer mutates the child text.** A textarea's *raw value*
   (the API value, stored in `_formValues`) is distinct from its *default value*
   (the child text, which `defaultValue` reflects and reset restores). The old
   setter wrote `this.textContent = v`, destroying the default; removing that write
   (in both the setter and `_setTextControlRawValue`) is spec-correct and is what
   fixes reset for textarea (+1 bonus on `value-defaultValue-textContent`).

## Zero-regression sweep (stash-verified before→after)

Baseline captured by stashing all three files, rebuilding, and re-measuring:
reset-form 0/12, reset-form-2 0/1, reset-event 0/1, reset-form-event-realm 0/1,
value-defaultValue 6/12 — all confirmed pre-change. Held realms after the change:
type-change-state 380/380, select-event 270/270, setRangeText 80/88,
setSelectionRange 49/49, selection-start-end 45/45, qsa 1975/1975,
classlist 1420/1420, createElement 147/147, Node-properties 726/726,
select-value 4/4, select-selectedOptions 8/8, option-selected 3/3.

## Caps / Next

- **`value-defaultValue-textContent` residual 5**: the textarea default value is the
  *child text content* (direct Text-node children only), not `textContent` (which
  includes element descendants), and the value getter must **normalize CRLF/CR → LF
  and strip NUL**. Both are self-contained follow-ups on the textarea value model.
- **`document.forms.html` is could-not-run** — but this is PRE-EXISTING and NOT a
  regression: on that specific page (three forms + testharness) plain
  `document.querySelectorAll('form')` overflows the stack (independent of the
  `forms` getter, which is why it was CNR before too). A separate selector-engine
  bug worth a look; minimal data-URL repros did not reproduce it.
- **NEXT**: the rest of fresh `html/semantics/forms/*` — `the-button-element`,
  `the-output-element` (now that output has value/defaultValue), `form-submission-0`,
  `the-fieldset-element`; or the textarea child-text/CRLF normalization above.
  Standing leads unchanged: shadow-tree scope (aria-element 5 /
  CSSStyleSheet-constructable 6/13), namespaced cascade-match Rust lift
  (`crates/obscura-dom/src/selector.rs`, set-selectorText-namespace 0/5).
