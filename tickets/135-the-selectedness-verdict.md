# Quest #135 — The Selectedness Verdict

**Realm:** `html/semantics/forms/the-select-element` + `the-option-element` +
`the-datalist-element` — the `<select>`/`<option>`/`HTMLOptionsCollection` model
and the selectedness algorithm (HTML §the-select-element / §the-option-element).

**Result: +94 across 20 tests, zero regressions.**

## The gap

After #133/#134 completed the input value model, the rest of fresh
`html/semantics/forms/*` was swept. The constraints-validity suite was already
~100% (the earlier constraint-validation work holds), but the whole `<select>`/
`<option>` machinery was a wide untapped tail (~90 failing subtests) rooted in one
missing primitive: `.options` was just a `querySelectorAll('option')` NodeList and
selection was ad-hoc localName-gated getters on `Element.prototype`. There was no
real `HTMLOptionsCollection`, no `HTMLSelectElement` IDL (`value`/`selectedOptions`/
`add`/`remove`/named getter/`selectedIndex`), no `HTMLOptionElement` IDL
(`index`/`label`/`text`/`defaultSelected`/`new Option()`), and no selectedness
algorithm underneath.

| Test | before | after |
| --- | --- | --- |
| selected-index | 0/13 | **13** |
| option-label | 0/12 | **12** |
| option-value | 7/12 | **12** |
| option-element-constructor | 0/11 | **11** |
| select-selectedOptions | 1/8 | **8** |
| common-HTMLOptionsCollection | 1/8 | **8** |
| common-HTMLOptionsCollection-namedItem | 0/6 | **6** |
| option-selectedness-script-mutation | 0/5 | **5** |
| select-validity | 1/6 | **5** (cap 1) |
| select-named-getter | 0/4 | **4** |
| option-index | 0/4 | **4** |
| select-remove | 2/4 | **4** |
| select-ask-for-reset | 0/3 | **3** |
| common-HTMLOptionsCollection-add | 0/3 | **3** |
| option-selected | 2/3 | **3** |
| select-add | 0/2 | **2** |
| option-text-label | 0/2 | **2** |
| datalistoptions | 1/2 | **2** |
| select-add-optgroup | 0/1 | **1** |
| option-text-setter | 0/1 | **1** |

## The fix (`bootstrap.js`, NO Rust)

One new block installed on the subclass prototypes (`HTMLSelectElement`/
`HTMLOptionElement`/`HTMLDataListElement`), so it **shadows** the generic
localName-gated getters on `Element.prototype` — the same idiom the input value
model uses. It reuses the module-scoped live-collection machinery (`_makeHTMLCollection`,
`_hcRefresh`, `_hcNamedItem`, `_hcIsIndex`).

1. **`HTMLOptionsCollection`** (subclass of `HTMLCollection`) via a Proxy:
   indexed getter, indexed setter (`null` removes; `index === length` appends;
   `index > length` pads the gap with empty `<option>`s then places; `index < length`
   replaces), settable `length` (grow appends empty options, shrink trims from the
   end), `add`/`remove`/`selectedIndex`, named getter through `namedItem`, iterable.

2. **`HTMLSelectElement` IDL**: `options` (cached `[SameObject]` `HTMLOptionsCollection`),
   `selectedOptions` (cached live `HTMLCollection` of selected options), `value`,
   `selectedIndex`, `size`, `length`, `item`, `namedItem` (matches `id`/`name`, first
   in tree order — the select itself has **no** named getter), `add(element, before)`
   (ancestor→`HierarchyRequestError`, before-not-descendant→`NotFoundError`, `before`
   as element/index/null), `remove` (no-arg → `ChildNode.remove()`; `remove(index)`
   out-of-range no-op). The **indexed getter `select[i]`** is supported by mirroring the
   list of options onto the select's own non-enumerable numeric properties (elements
   are not Proxy-wrapped), refreshed from the `length`/`options` getters and every
   mutator.

3. **`HTMLOptionElement` IDL**: `value`/`label` (fall back to the option's *text*
   unless the attribute is present **in the null namespace** — a `setAttributeNS`
   value does not count), `text` (strip-and-collapse ASCII whitespace over Text
   descendants, excluding `<script>` subtrees; setter is string-replace-all),
   `index` (position in its select's list of options, `0` when not in a select),
   `defaultSelected` (reflects the `selected` content attribute), `selected`,
   `form`, and the `Option(text, value, defaultSelected, selected)` legacy factory
   (4th arg sets selectedness **without** dirtiness; `value` set only when the arg
   is present; empty `text` appends no node).

4. **Selectedness + dirtiness model**. Each option carries `_optSel` (selectedness)
   and `_optDirty` (dirtiness), lazily seeded from the `selected` attribute. The IDL
   `selected` setter sets dirtiness and selectedness but **never** the content
   attribute. The `selected` **content-attribute change steps** (move selectedness
   only while not dirty, and re-run the algorithm) are hooked via a *scoped*
   `setAttribute`/`removeAttribute` override on `HTMLOptionElement.prototype` — the
   one place we can observe that attribute mutating without a generic hook.

5. **The selectedness setting algorithm**, run at **read** time. Per spec it runs on
   parse/insert/remove/reset/attribute-change/"ask for a reset" — triggers we mostly
   lack — so running it whenever `selectedIndex`/`value`/`selectedOptions`/
   `option.selected` are read reconciles to the same observable state:
   - "Get the list of options" is a **descendant tree-walk** (descending through
     ordinary elements, never into an `<option>` subtree nor a nested `<optgroup>`),
     so an `<option>` nested in a `<div>` still counts (`select-value` "option is
     child of div").
   - Single-line select (`multiple` absent, display size 1) with none selected →
     auto-select the first non-disabled option.
   - ≥2 selected in a single-select → collapse to the **last** in tree order (this is
     the markup path; the runtime single-selection invariant is enforced eagerly in
     the `selected` setter, which deselects the others when one goes true).
   - The one thing read-time cannot infer is a *deliberate* empty selection, so the
     `value`/`selectedIndex` setters set a per-select `_noAutoSelect` flag that
     suppresses the auto-select-first step; any selection-establishing act (an
     option `selected` setter, an attribute change, a form reset) clears it. This is
     exactly what makes `selectedIndex = -1` stick (→ `-1`) while
     `option.selected = false` re-selects the first (→ `0`).

6. Select **`valueMissing`** (in `_cvCompute`, using public IDL only since the
   helpers are block-scoped): missing iff no option is selected, or the only selected
   one is the **placeholder label option** (first option, a direct child of the
   select — not in an optgroup — with an empty value, when single-line).

7. Form **reset**: `HTMLFormElement.prototype.reset` now restores each option's
   selectedness from its `selected` content attribute, clears dirtiness, and re-runs
   the algorithm (non-select controls keep the prior behaviour).

## Honesty / caps

- `select-restore-invalid-option` (0/1) — bfcache + form-state restoration on
  navigation; out of scope for a pure DOM model.
- `select-validity` 5/6 — the last subtest prepends an already-selected `<option>`
  and expects the spec invariant "*adding* a selected option to a single-select
  deselects the others" to fire. That is an **insertion** trigger; read-time
  reconciliation instead keeps the last-in-tree option, so it can't tell which node
  was just inserted. Fixing it would need hooking every tree-insertion path
  (appendChild/insertBefore/prepend/…) — too broad a risk for one subtest under the
  zero-regression promise.

## Zero-regression sweep

Verified via stash-baseline that `reset-form` (0/12), `reset-event` (0/1) and
`the-textarea-element/value-defaultValue-textContent` (6/12) were **already failing
before** this change (pre-existing gaps: proper default-value restoration + the reset
event), not regressions. `select-value` held 4/4. Core anchors held: qsa 1975,
classlist 1420, createElement 147, Node-properties 726, type-change-state 380,
form-validation-validity-valueMissing 78, typeMismatch 11, tooLong 63,
textfieldselection-setRangeText 80/88, input-stepup 53, input-valueasdate 30.

## Caps / Next

The select/option realm is now ~99% (bar the two caps above). Standing leads
unchanged: **form reset** is now a real opportunity — `reset-form` (0/12) and
`reset-event` (0/1) want proper default-value restoration for input/textarea plus a
dispatched `reset` event (the current `reset()` still crudely clears to `""`).
Otherwise: shadow-tree scope (aria-element 5 / CSSStyleSheet-constructable 6/13),
the namespaced cascade-match Rust lift (`crates/obscura-dom/src/selector.rs`,
set-selectorText-namespace 0/5), or the remaining fresh `html/semantics/forms/*`
(form-submission, the-button-element, the-fieldset-element).
