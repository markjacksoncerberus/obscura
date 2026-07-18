# Quest #137 — The Labeled Verdict

**Realm:** `html/semantics/forms/*` — form-element IDL: `type` reflection, `labels`,
`<label>` association (`control`/`htmlFor`/`form`), `fieldset.elements`.
**Result:** **+43 across 9 tests.** ZERO regressions.
**Files:** `crates/obscura-js/js/bootstrap.js` only (no Rust).

## The gap

After #136 (the reset algorithm) the fresh `html/semantics/forms/*` element-IDL tail was
still wide open:

- `button.type` / `output.type` / `fieldset.type` all returned `""` — they fell through
  to the generic `Element` `type` getter (`getAttribute("type") || (input?"text":"")`).
- No element exposed a `labels` IDL attribute at all.
- `<label>` had no `control`, `htmlFor`, or `form`.
- `fieldset.elements` did not exist.
- The `<output>` value-mode switch never captured the default value, so `defaultValue`
  was destroyed by a `value=` write.

## The fix (all `bootstrap.js`, a block right after the `<output>` value model)

1. **`button.type`** — enumerated attribute, keywords {submit, reset, button}; BOTH the
   missing-value default and the invalid-value default are `"submit"`; reflected as the
   lowercased canonical keyword. Defined on `HTMLButtonElement.prototype` so it shadows
   the generic getter. `output.type`/`fieldset.type` are constants ("output"/"fieldset").

2. **`fieldset.elements`** — an `HTMLCollection` (`_makeHTMLCollection`, so
   `.constructor === HTMLCollection`) of the *listed* form-associated descendants
   (`button, fieldset, input, object, output, select, textarea`), in tree order.
   `<progress>` and `<meter>` are NOT listed elements, so they're excluded (the test's
   expected array proves it).

3. **`labels`** — defined ONLY on the labelable-element prototypes (button, input, meter,
   output, progress, select, textarea); non-labelable elements therefore have no `labels`
   property and return `undefined` (the test asserts `fieldset.labels === undefined`
   etc.). A hidden input is not labelable → `labels === null`. The value is a
   **[SameObject] live NodeList**: a `Proxy` over a real `NodeList` target (so
   `instanceof NodeList` holds), whose `length`/index reads recompute the associations on
   every access, cached per element in a `WeakMap`. This is exactly what the WPT test
   demands: it retains a `.labels` reference, flips the control's `type` to `hidden`
   (retained NodeList must go empty), then back to `checkbox` (getter must return the SAME
   object, now non-empty again).

4. **`label.control`** — the labeled control: the element named by the `for` attribute
   *if it is labelable*, else the label's first labelable descendant (tree order).
   **`label.htmlFor`** reflects `for`. **`label.form`** returns the labeled control's form
   owner (or `null` when there's no control) — NOT the label's own ancestor form (this
   overrides the generic `form` getter).

5. **Tree-scoped association** — the association algorithm is scoped to a single node
   tree: a detached label can't label a connected control, and vice-versa.
   `Node.prototype.getRootNode()` in this engine is a **stub that always returns
   `document`**, so it's useless here — instead I walk `parentNode` to the real root
   (`_rootOf`). Label enumeration (`_labelsInTree`) and `for`-id lookup
   (`_findLabelableById`) both use that root, *including the root itself when it is a
   `<label>`* (a detached `<label><input>…</label>` — the outer label is the root and
   `querySelectorAll` would miss it). This is what makes the detached-subtree,
   cross-DOM-move liveness, and duplicate-id (`for` → first-in-tree-order, checked for
   labelability) cases all correct.

6. **`<output>` default-value capture** — the `value` setter now, on the FIRST switch into
   value mode, freezes the current text into `_outDefault` so `defaultValue` keeps reading
   the pre-set text (HTML §4.10.12).

## Results (before → after)

| Test | Before | After | Δ |
| --- | --- | --- | --- |
| `the-label-element/labelable-elements.html` | 12/26 | **26/26** | +14 |
| `the-label-element/label-attributes.sub.html` | 2/20 | **19/20** | +17 |
| `the-button-element/button-validation.html` | 3/6 | **6/6** | +3 |
| `the-button-element/button-type.html` | 0/2 | **2/2** | +2 |
| `the-button-element/button-type-enumerated-ascii-case-insensitive.html` | 0/2 | **2/2** | +2 |
| `the-button-element/button-labels.html` | 0/1 | **1/1** | +1 |
| `the-input-element/input-labels.html` | 0/1 | **1/1** | +1 |
| `the-output-element/output.html` | 0/1 | **1/1** | +1 |
| `the-fieldset-element/HTMLFieldSetElement.html` | 1/4 | **3/4** | +2 |
| **Total** | | | **+43** |

## Zero-regression sweep (all held)

qsa 1975, classlist 1420, createElement 147, Node-properties 726, type-change-state 380,
reset-form 12/12, select-value 4/4, output-validity / button-validity / fieldset-validity
1/1, select-event 1/1. `input-labels` baseline was **STASH-verified 0/1** before the change
(so its +1 is real, not a pre-existing pass).

## Caps (honest)

- **label-attributes.sub 19/20** — the last subtest builds a shadow tree
  (`element.attachShadow(...)` + `ShadowRoot instanceof DocumentFragment`). Shadow DOM is
  the standing lead, out of scope for this quest.
- **HTMLFieldSetElement 3/4** — the last subtest reads `form.txt_inner` (a form's
  supported-property-name named access). Form elements are not `Proxy`-wrapped in this
  engine (a deliberate architectural choice — see the select/HTMLOptionsCollection notes),
  so `form[name]` named access would need a broad change for a single subtest. Not worth
  it now.

## Next leverage

- **Shadow-tree scope** is now doubly-attractive: it unlocks label-attributes 20/20 AND
  the aria-element / `CSSStyleSheet` constructable leads (`attachShadow`, `ShadowRoot`
  interface, `ShadowRoot instanceof DocumentFragment`, shadow `getElementById`).
- The **textarea residual** (`value-defaultValue-textContent` 7/12): default value = *child
  text content* (Text-node children only, not `textContent`) + value getter CRLF/CR→LF +
  NUL normalization.
- **Namespaced cascade-match** Rust lift (`crates/obscura-dom/src/selector.rs`,
  `set-selectorText-namespace` 0/5).
