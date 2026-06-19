# Scroll #48 — The Indeterminate Verdict

> *The remaining HTML selector pseudo-classes — `:indeterminate`, `:placeholder-shown`,
> `:default` — and the spec-correct `:optional`. The live-state form/structural selector
> family, finished.*

**Status: SECURED — +10. Session 2026-06-19.**

## The gap

After #44–#46 the live-state form selector family (`:required`/`:optional`/`:valid`/
`:invalid`/`:in-range`/`:out-of-range`/`:read-write`/`:read-only`/`:enabled`/`:disabled`)
was complete — but three HTML pseudo-classes were still dark. The Servo `selectors` crate
**parses** `:indeterminate`/`:placeholder-shown`/`:default` (they're in
`is_known_pseudo_class`), but they fall to `PseudoClass::Other(name)` whose
`match_non_ts_pseudo_class` arm is `=> false`. So they matched nothing.

Baselines (`html/semantics/selectors/pseudo-classes/`):
- `indeterminate.html` 1/6 (only the empty-match-after-all-determinate subtest passed)
- `indeterminate-type-change.html` 0/1, `placeholder-shown-type-change.html` 0/1
- `default.html` 0/2
- `required-optional-hidden.html` 0/1 (a `:optional`-for-`type=hidden` correctness gap)

(The `css/selectors/indeterminate*` tests are render reftests — could-not-run, out of realm.)

## The work — all in the matcher (`crates/obscura-dom/src/selector.rs`)

New arms in the `PseudoClass::Other` match + new inherent `DomElement` helpers. All
**tree-derived** (the family pattern from #44–#46), with one tiny eager side-map.

### `:indeterminate` — `match_indeterminate()`
- **checkbox**: reads a new `indeterminate` IDL flag. Stored in a Rust side-map
  (`DomTree::{set_indeterminate,indeterminate}`, op `set_indeterminate`/`get_indeterminate`,
  JS `HTMLInputElement.indeterminate` get/set). **Eager** — the setter pushes to Rust
  immediately, so no per-query priming is needed (unlike validity). No content-attribute
  default → a node JS never touched is not indeterminate.
- **radio**: indeterminate iff its radio-button group contains no checked member.
  `radio_group_has_checked(name)` does a DFS from the tree root (`root_node()` walks
  parents to the top) for `input[type=radio][name=name]` and consults `tree.checked()`
  (which already falls back to the `checked` content attribute). A **nameless** radio is
  a group of one → indeterminate iff it itself isn't checked.
- **progress**: indeterminate iff it has no `value` content attribute.

### `:placeholder-shown` — `match_placeholder_shown()`
An `<input>` of a placeholder-applicable type (text/search/url/tel/email/password/number)
or a `<textarea>`, with a non-empty `placeholder` attribute and an empty value. Value
emptiness is read off the `value` content attribute (input) / text content (textarea).

### `:default` — `match_default()`
- checkbox/radio with the `checked` **content attribute** (the default checkedness);
- `<option>` with the `selected` **content attribute**;
- a submit button (`<input type=submit|image>`, or a `<button>` whose type is submit —
  the missing/invalid default) that is its **form owner's default button**:
  `is_form_default_button()` finds the element's form owner (`form_owner()`: the `<form>`
  named by a `form` attribute, else nearest ancestor `<form>`) then pre-order DFS-scans the
  tree for the first submit button owned by that form; matches iff that's this element.
  A submit button with no form owner is never a default button (per the test: a form-less
  `<button type=submit>` and a submit inside a `<dialog>` don't match).

### Spec-correct `:optional` — `match_required_optional()` restructure
Was: matched only form controls to which `required` *applies* (so `type=hidden` matched
**neither** `:required` nor `:optional`). Now: `:required` is unchanged (requirable type +
has the attribute), but `:optional` matches **any** input/select/textarea that is not
`:required` — including `type=hidden`/`submit` etc., which are optional by virtue of never
being required. This is what `required-optional-hidden` asserts (and what browsers do).
`required-optional.html` (6/6) only uses requirable types, so it is unaffected.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `indeterminate.html` | 1/6 | **6/6** |
| `indeterminate-type-change.html` | 0/1 | **1/1** |
| `placeholder-shown-type-change.html` | 0/1 | **1/1** |
| `default.html` | 0/2 | **2/2** |
| `required-optional-hidden.html` | 0/1 | **1/1** |

**+10, zero regressions.** Held: qsa 1975, classlist 1420, matches 669, closest 29,
valid-invalid 30, required-optional 6, readwrite-readonly 25, disabled 7, enabled 1,
inrange-outofrange 6, checked 2/3 (the 1 fail pre-existing), indeterminate-radio 1,
has-specificity 8, not-specificity 8, inrange-outofrange-type-change 2, DOMTokenList 1/1;
obscura-dom unit 40/40.

## Caps (honest)

- **`:placeholder-shown` live value**: emptiness is read off the content attribute / text
  content. A value set only via the JS `.value` IDL (`_formValues`) is not visible to the
  Rust matcher, so it wouldn't hide the placeholder. No test exercises this today.
- **Radio-group form-owner partitioning**: `radio_group_has_checked` groups by name within
  the tree, not by form owner. Two forms with same-named radios would share a group. Rare;
  no test hits it.
- **`css/selectors/indeterminate*`** are render reftests (out of realm).

## Next leverage

The live-state form/structural selector pseudo-class family is now **complete and clean**.
Best next:
- **CSS inheritance + a small computed-value-normalization set** — builds on the #47 cascade
  foundation, opens `css/css-cascade/` basics and more `getComputedStyle` tests (the widest
  `css/` tail).
- **A fresh realm** — `fetch/`, `html/dom/` reflection / idlharness.
