# Quest #145 — The Internal Verdict

**Realm:** `ElementInternals` / `attachInternals` (`custom-elements/*`, `custom-elements/form-associated/*`)
**Hold before:** `attachInternals` did not exist; the whole `ElementInternals` surface was red.
Unblocked by Quest #144 (real custom elements).
**Result:** **+28 across 7 tests, ZERO regressions.** All `bootstrap.js`.

## The fix (`crates/obscura-js/js/bootstrap.js`)

1. **`HTMLElement.prototype.attachInternals()`** (HTML §4.13.5) — autonomous only: throws
   `NotSupportedError` for a customized built-in (`_is`), an element with no autonomous
   definition, a `disabledFeatures: ['internals']` definition, an already-attached element, or
   one whose custom element state is not `"precustomized"`/`"custom"`. Otherwise mints and stows
   an `ElementInternals` on `_ceInternals`. (Quest #144's `_ceUpgrade` now sets `"precustomized"`
   during the constructor, so `this.attachInternals()` inside a custom ctor is allowed.)

2. **`ElementInternals`** interface —
   - `shadowRoot`: the target's shadow root iff `_availableToElementInternals` (set in
     `attachShadow` when the host is already (pre)customized — so a shadow attached during/after
     upgrade is reachable, one attached to a still-"undefined" host is not).
   - form-associated ops all guarded by `_requireFormAssociated()` (→ `NotSupportedError` when the
     definition isn't `formAssociated`): `form` (form owner via `form` id-ref or ancestor `<form>`),
     `setFormValue`, `setValidity(flags, message, anchor)` (stores flags; empty-message-when-invalid
     → TypeError), `validity` (a `ValidityState` reflecting the stored flags), `validationMessage`,
     `willValidate` (barred by disabled / `<datalist>` ancestor / `readonly`), `checkValidity`/
     `reportValidity` (fire `invalid`), `labels`.

3. **Labels integration** (additive to Quest #137's label machinery): `_isLabelable` now returns
   true for a form-associated custom element; `label.form` reads the internals' form owner for such
   controls; `ElementInternals.labels` reuses the live-`NodeList` maker via a `__ceiLabelsFor` hook.

## Results (measured, before → after)

| Test | Before | After |
|------|:------:|:-----:|
| `HTMLElement-attachInternals.html` | 0 | 4 |
| `element-internals-shadowroot.html` | 0 | 7 |
| `form-associated/ElementInternals-validation.html` | 0 | 11 |
| `form-associated/ElementInternals-form.html` | 0 | 2 |
| `form-associated/ElementInternals-setFormValue-nullish-value.html` | 0 | 2 |
| `form-associated/ElementInternals-NotSupportedError.html` | 0 | 1 |
| `form-associated/ElementInternals-labels.html` | 0 | 1 |

**= +28, ZERO regressions.** Swept: labelable-elements 26, label-attributes.sub 20,
ShadowRoot-interface 8, form-validation-validity-valueMissing 78, declarative-shadow-dom-basic 22,
connected-callbacks 24, adopted-callback 20.

## Caps / Next

- **Form validity integration** (validation residual 11/14) — a form-associated custom control's
  `setValidity` should propagate to its owner form's `checkValidity`/`:valid`/`:invalid`; not wired
  (would touch `HTMLFormElement.checkValidity` + the `:valid`/`:invalid` matchers). Also `setValidity`
  anchor descendant-check (→ NotFoundError) unimplemented.
- **`ElementInternals-setFormValue.html`** (CNR, `bodyLen=0`) — needs form-submission/`FormData`
  entry-list integration we don't have.
- **`ElementInternals-labels`** residual (1/3) — `LABEL click` forwarding to a custom control + one
  multi-label ordering case.
- **`ElementInternals-role`/`-accessibility`** (118 subtests) — gated on
  `test_driver.get_computed_role`/`get_computed_label` = a CDP accessibility backend we lack.
  Genuinely unwinnable now.
- **Custom state / `CustomStateSet`** (`:state()` pseudo) — not implemented.
