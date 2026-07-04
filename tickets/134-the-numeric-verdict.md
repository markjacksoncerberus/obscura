# Quest #134 — The Numeric Verdict

**Realm:** `html/semantics/forms/the-input-element` — the value-as-number / value-as-date
projection of the input value model, plus stepUp/stepDown and temporal value
normalization (HTML §4.10.5.4 "Common input element APIs").

**Result: +119 across 13 tests, zero regressions.**

## The gap

Quest #133 built the input **value model** (four value modes, per-type sanitization,
the "signal a type change" algorithm) and the text-field **selection API**. It did NOT
build the *numeric* projection of that value model: `valueAsNumber`, `valueAsDate`,
`stepUp()`/`stepDown()`. Every test that touched them died on
`input.valueAsNumber is not a function` / `input.stepUp is not a function`:

| Test | before | after |
| --- | --- | --- |
| input-stepup | 0/53 | **53** |
| input-stepdown | 0 (could-not-run) | **5** |
| input-stepdown-02 | 0/6 | **6** |
| input-stepdown-weekmonth | 0/2 | **2** |
| input-valueasnumber-stepping | 0/7 | **7** |
| input-valueasnumber-typeerror | 0/4 | **4** |
| input-valueasnumber-invalidstateerr | 0 (could-not-run) | **1** |
| input-valueasdate | 4/30 | **30** |
| input-valueasdate-typeerror | 0/4 | **4** |
| input-valueasdate-invalidstateerr | 0/1 | **1** |
| datetime-local-valueasdate | 0/1 | **1** |
| datetime-local-trailing-zeros | 0/1 | **1** |
| input-seconds-leading-zeroes | 4/12 | **12** |

## The fix (`bootstrap.js`, NO Rust)

All of it rides the **constraint-validation number machinery already present** from the
validity work: `_cvTyped(t, s)` ("convert a string to a number", null on error, with
leap-year-aware date validation), `_cvStepInfo(t)` (`{def, scale}`), `_cvDefaultStepBase(t)`
(week's special `1970-W01` Monday base), and the per-type parsers. We only had to add the
**inverses** and the stepping algorithm, all on `HTMLInputElement.prototype` next to the
#133 value/selection block (so `<textarea>`/`<select>`/`<li>` are untouched):

1. **number→string** (`_numToStr`) — inverse of `_cvTyped`: number/range via `String(n)`;
   date/datetime-local via UTC calendar fields; month via `Date.UTC(1970, n, 1)`
   (JS normalizes the month overflow); week via `_weekStrFromMs`; time via `_msToTimeStr`.
2. **string→Date-ms** (`_strToDateMs`) and **Date-ms→string** (`_dateMsToStr`) for
   `valueAsDate` — a *different* projection: month/week map to a calendar Date (first
   day / Monday) rather than the numeric month-count / Monday-ms.
3. **`_weekStrFromMs`** — proper ISO-8601 week-of-year from an arbitrary instant (via the
   Thursday of its week), used for both the number→string week case (Monday input) and the
   valueAsDate setter (a supplied Date may fall on any weekday).
4. **`_msToTimeStr`** — `HH:MM`, adding `:SS` iff seconds or millis are nonzero, adding a
   fractional part **with trailing zeros stripped** (`10ms → ".01"`, `500ms → ".5"` — NOT
   `".010"`/`".500"`; this detail is exactly what `datetime-local-trailing-zeros` and
   `input-seconds-leading-zeroes` assert).
5. **`valueAsNumber`** get/set — getter returns `_cvTyped` or `NaN` off-type; setter throws
   `TypeError` on `±Infinity` **first** (before the applies check — a checkbox + Infinity is
   a TypeError, not InvalidStateError), then `InvalidStateError` off the typed set, else
   routes `_numToStr` through the value setter.
6. **`valueAsDate`** get/set — applies only to date/month/week/time; getter returns a `Date`
   or `null`; setter throws `InvalidStateError` off-type, `TypeError` for a non-null non-Date,
   and treats null / NaN-time as `""`.
7. **`stepUp(n)`/`stepDown(n)`** (`_stepInput`) — the full HTML step algorithm: allowed value
   step (default·scale, `step="any"` → InvalidStateError, positive float override), min/max
   (range defaults 0/100), step base (min → value-attr → per-type default), align-or-step,
   min/max clamp back onto the grid, and the overshoot guard.
8. **Temporal value-sanitization normalization** — `_sanitizeInputValue`'s temporal branch
   now parses-then-re-serializes (`_cvTyped` → `_numToStr`) instead of returning the string
   verbatim, so a valid value is stored in canonical form (redundant `.010`/`:00` dropped,
   space separator → `T`) and an out-of-range-but-pattern-matching value (e.g. `2019-13-10`)
   correctly sanitizes to `""`.

### The one subtle divergence — the empty-value step guard

The step algorithm's final "overshoot guard" (a step that would move the value the wrong way
past where it started is a no-op — e.g. `stepUp` on `<input type=number value=1 max=0>`) is
**skipped when the field started empty/unparseable**. Tracing all six `input-stepdown-02`
cases: five match the pure spec exactly, and only the "empty value, positive min, clamp
raises above 0" case (`''` + `min=7` → `7`) needs the skip — the pure guard would abort and
leave `''`. Browsers (Blink/Gecko) snap an empty field toward min/max rather than no-op, so
we track `valueWasError` and bypass the guard in that case. This is the single reverse-
engineered behavior; everything else is spec-literal.

## Zero-regression sweep

#133 value-model / selection realm (all held exactly at their documented values):
type-change-state 380, select-event 270, selection-not-application?default 183,
textfieldselection-setRangeText 80/88, textfieldselection-setSelectionRange 49,
selection-after-content-change 15/18, selection-value-interactions 9/14,
selection-start-end 37, selection-start-end-extra 9/11, defaultSelection 6,
selection-not-application-textarea 1, select-value 4/4. Core: qsa 1975, classlist
168/175, createElement 147, Node-properties 726, reflection-misc 4709, input-checkvalidity
1, input-validity 1. **No pass regressions.** (Interim honesty note: the temporal-
normalization change first regressed `input-seconds-leading-zeroes` 12→10 and left
`datetime-local-trailing-zeros` failing, both because `_msToTimeStr` padded milliseconds to
3 digits `".010"`; stripping trailing fraction zeros fixed both and won the trailing-zeros
test — the normalization and the millis formatter had to land together.)

## Caps / Next

- `input-stepup-weekmonth` is **could-not-run** even on a fresh server at 70 s (a genuinely
  heavy generated test, likely `meta timeout=long`); not attempted this session.
- Residual selection-realm caps are unchanged from #133 (scrollLeft layout;
  eager textarea/reset selection clamp).
- **Next leverage:** the numeric value model is now complete — sweep the rest of fresh
  `html/semantics/forms/*` (form-submission, the-select-element, the-button-element,
  constraints/*), which the value + numeric model underpin. Standing leads unchanged:
  shadow-tree scope (aria-element 5 / CSSStyleSheet-constructable 6/13), namespaced
  cascade-match Rust lift (`crates/obscura-dom/src/selector.rs`, set-selectorText-namespace 0/5).
