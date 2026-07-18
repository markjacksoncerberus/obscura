# Quest #43 — The Charter of Constraints

> *Realm:* `html/semantics/forms/constraints/*` — the **constraint validation API**.
> *Hold:* **SECURED — +877** (session 2026-06-19).
> *Difficulty:* ⚔️⚔️⚔️ (a proper campaign — the whole validity model, in one cohesive engine).

## The gap

The entire constraint validation API was **absent**. `willValidate`, `validity`,
`validationMessage`, `checkValidity()`, `reportValidity()`, `setCustomValidity()`,
and the `ValidityState` interface simply did not exist on any form control, so the
whole `html/semantics/forms/constraints/` realm was dark:

| Test | Before | After |
|------|:------:|:-----:|
| `form-validation-willValidate.html` | 0/67 | **67/67** |
| `form-validation-willValidate-datalist.html` | 0/17 | **17/17** |
| `form-validation-checkValidity.html` | 0/122 | **122/122** |
| `form-validation-reportValidity.html` | 0/122 | **122/122** |
| `form-validation-validate.html` | 0/8 | **8/8** |
| `inputwillvalidate.html` | 0/2 | **2/2** |
| `form-validation-validity-valueMissing.html` | 0/71 | **71/71** |
| `form-validation-validity-valid.html` | 0/33 | **33/33** |
| `form-validation-validity-typeMismatch.html` | 0/11 | **11/11** |
| `form-validation-validity-patternMismatch.html` | 0/85 | **85/85** |
| `form-validation-validity-rangeOverflow.html` | 0/49 | **49/49** |
| `form-validation-validity-rangeUnderflow.html` | 0/47 | **47/47** |
| `form-validation-validity-stepMismatch.html` | 0/28 | **27/28** ⬆️cap |
| `form-validation-validity-tooLong.html` | 0/63 | **63/63** |
| `form-validation-validity-tooShort.html` | 0/63 | **63/63** |
| `form-validation-validity-customError.html` | 0/4 | **4/4** |
| `form-validation-validity-badInput.html` | 0/11 | **11/11** |
| `form-validation-validity-valueMissing-weekmonth.html` | 0/19 | **19/19** |
| `form-validation-validity-valid-weekmonth.html` | 0/8 | **8/8** |
| `form-validation-validity-rangeOverflow-weekmonth.html` | 0/19 | **19/19** |
| `form-validation-validity-rangeUnderflow-weekmonth.html` | 0/19 | **19/19** |
| `form-validation-validity-textarea-defaultValue.html` | 0/5 | **2/5** ⬆️cap |
| `radio-valueMissing.html` | 0/6 | **6/6** |
| `radio-group-valueMissing.html` | 0/2 | **2/2** |
| `input-pattern-dynamic-value.html` | 0/1 | 0/1 ✋cap |
| `input-number-validity-dynamic-value-no-change.html` | 0/1 | 0/1 ✋cap |

**+877 subtests, zero regressions.** Pure JS (`bootstrap.js`) — no new Rust.

## The work

One cohesive engine appended after the `HTML*Element` interface block in
`bootstrap.js`, installed on the 7 form-associated "listed" interfaces
(`input`, `button`, `select`, `textarea`, `fieldset`, `object`, `output`) plus
`HTMLFormElement`:

- **`ValidityState`** — a real interface (with `Symbol.toStringTag`, so
  `assert_class_string` sees `[object ValidityState]`); its getters read a
  freshly-computed flag set, so validity is always live against the element's
  current attributes/value.
- **`_cvCompute(el)`** — the validity algorithm. Highlights of the spec subtleties
  that the suite pins down:
  - **`valueMissing`** is *mutable-gated* (a disabled/readonly element reports
    `false`) **only** for text-like + typed inputs and `textarea`; checkbox, radio,
    file and select are ungated. Radio is **group-aware** (`_cvRadioGroup`): a group
    is missing iff some member is `required` and none are `checked`, reported on
    every member; a nameless radio is never in a group.
  - **`typeMismatch`** for `email`/`url` after the value-sanitization whitespace
    strip; email honours `multiple` (comma-split, each token validated).
  - **`patternMismatch`** compiles the **raw** pattern first (so `"a)(b"` — valid
    only once wrapped — is rejected and ignored), then the anchored
    `^(?:…)$` with the `v` flag (fallback `u`).
  - **range/step** for the typed inputs via comparable-number parsers
    (`_cvParseDate/Time/DateTimeLocal/Month/Week/Number`, ISO-week → Monday ms).
    Reversed ranges (`min > max` on periodic types) flag over+underflow together
    inside `(max, min)`. Step uses Blink's float-tolerant snap-and-compare
    (`diff < step/2²³` aligned; when round-trip noise exceeds the step, the value
    is treated as a multiple). Step base = `min` → else the `value` content
    attribute → else the type default.
  - **`tooLong`/`tooShort`/`badInput`** are always `false` — they require
    interactive user editing, which a headless engine never produces (and the
    suite asserts exactly that).
  - **`customError`** = non-empty `setCustomValidity` message (ungated);
    **`validationMessage`** returns `""` when the element is barred, else the
    custom message.
- **`willValidate`** = NOT barred-from-constraint-validation: `false` for
  fieldset/output/object, input types `hidden`/`button`/`reset`, a `<button>`
  whose type isn't submit, anything disabled (incl. **inside a disabled
  fieldset**, `_cvIsDisabled` walking ancestors but skipping the first legend), a
  control with a `readonly` attribute, or one with a `<datalist>` ancestor.
- **`checkValidity()`/`reportValidity()`** fire a cancelable `invalid` event and
  return `false` when the element is a candidate and invalid;
  `HTMLFormElement.checkValidity/reportValidity` statically validate every
  candidate descendant.
- **Reflected attributes** the suite drives: `required` (input/select/textarea),
  `readOnly`/`maxLength`/`minLength` (input/textarea), `multiple` (input/select),
  `pattern`/`min`/`max`/`step` (input), `textarea.defaultValue`.
- **`HTMLElement.click()`** gained the pre-click activation step: a checkbox
  toggles its checkedness and a radio becomes checked (reverted if the click is
  default-prevented) — so `radio.click()` actually checks the radio.

## Caps (honest)

- **`:valid`/`:invalid` selector matching** — `input-pattern-dynamic-value` and
  `input-number-validity-dynamic-value-no-change` assert `el.matches(":invalid")`.
  Our `matches()` runs through the Rust selector engine, which can't call back into
  the JS validity computation, so `:valid`/`:invalid` don't match. This is the same
  cap as `Element-closest` 28/29 (`:invalid` ×1). **The clear next quest** — closing
  it would also light the `css/selectors/:valid`/`:invalid` family.
- **`test_driver.send_keys`** (interactive keystrokes) — 3 of the 5
  `textarea-defaultValue` subtests simulate typing; Obscura has no input injection.
- **`stepMismatch` 27/28** — the one fail (`step=3e-15`, `value=17`) needs Blink's
  arbitrary-precision `Decimal` arithmetic to detect a sub-ULP misalignment; IEEE-754
  doubles round it away. Not worth a decimal-math library for one subtest.

## Next

The recurring wall remains **CSS cascade / `getComputedStyle`** (specificity +
applied values) and the **`:valid`/`:invalid`/`:required` live-state selector
pseudo-classes** (would close the two dynamic-value caps + `Element-closest` 29/29 +
the `css/selectors` validity family). Otherwise a fresh realm
(`fetch/`, `html/dom/` reflection). Form `input`/`change` events on `click()`
(the `the-input-element/checkbox.html` + `radio.html` tails) are a small adjacent
win unblocked by the new click activation step.
