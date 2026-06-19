# Quest #46 — The Disabled Lineage (`:disabled` / `:enabled` propagation)

**Realm:** `html/semantics/selectors/pseudo-classes/{disabled,enabled}.html`
**Hold:** disabled **7/7** (was 0/7), enabled **1/1** (held)
**Status:** ✅ SECURED — **+7**, zero regressions.
**Session:** 2026-06-19

---

## The gap

The Rust selector matcher's `:disabled` / `:enabled` arm (`crates/obscura-dom/src/selector.rs`)
only ever consulted the candidate element's **own** `disabled` attribute:

```rust
PseudoClass::Disabled => form_disableable && n.get_attribute("disabled").is_some(),
PseudoClass::Enabled  => form_disableable && n.get_attribute("disabled").is_none(),
```

That is incomplete. Per HTML's "actually disabled" definition an element is disabled when:

1. it carries its own `disabled` attribute (input/button/select/textarea/optgroup/option/fieldset), **or**
2. it is an `<option>` whose parent `<optgroup>` carries a `disabled` attribute, **or**
3. it is a descendant of a disabled `<fieldset>` — **except** anything within that
   fieldset's *first `<legend>` element child* — which also covers nested fieldsets
   (a `<fieldset>` inside a disabled `<fieldset>` is itself a disabled fieldset, and
   disables its own descendants).

So `disabled.html` was a deceptive **0/7**: the base case alone needs `clubname`/`clubnum`
(inputs inside a disabled `<fieldset>`, outside its `<legend>`) to match — and the checkbox
`club` *inside* the legend to NOT match — and the final dynamic subtest appends a whole
nested-fieldset subtree and expects every disable-able descendant (including `optgroup`,
`option`, and the nested `<fieldset>` itself) to match `:disabled`.

`enabled.html` (1/1) was already green because its fixture has no fieldset propagation —
but rewiring `:enabled` risked it, so it's a watched baseline.

## The fix (pure Rust, `selector.rs`, no JS / no new op)

Same shape as #45's `:read-write`/`:read-only` — everything is tree-derivable, so it is
matched **live** off the arena with no per-query priming. Added to the inherent
`impl<'a> DomElement<'a>` block (NOT the `impl Element` trait block — `E0407`):

- `is_disableable()` — element local name ∈ {input, button, select, textarea, optgroup,
  option, fieldset}. Every other element matches neither pseudo-class (so `a`/`area`/`link`
  with `disabled`, and `object`/`output`/`label`/`img`/`meter`/`progress`, are excluded —
  the test asserts exactly this).
- `is_actually_disabled()` — `is_disableable()` AND (own `disabled` attr OR option's
  disabled `<optgroup>` parent OR `is_disabled_by_fieldset()`).
- `is_disabled_by_fieldset()` — walk ancestors via the existing `parent_element()`,
  tracking `prev_id` (the direct child of each ancestor on the upward path). When an
  ancestor is a disabled `<fieldset>`, the element is disabled by it **unless** the path
  entered through that fieldset's first `<legend>` child (`first_legend_child_id() ==
  Some(prev_id)`). The first child of a fieldset on a descendant's ancestor path is exactly
  that descendant's gateway, so a single id-compare decides the legend exclusion — no
  separate descendant-of-legend search.
- `first_legend_child_id()` — first child element whose local name is `legend`.

The pseudo-class arm became simply:

```rust
PseudoClass::Disabled => self.is_actually_disabled(),
PseudoClass::Enabled  => self.is_disableable() && !self.is_actually_disabled(),
```

## Note on spec vs. test

Strict HTML text only propagates fieldset-disabling to button/input/select/textarea/
form-associated-custom + nested fieldsets — not to `optgroup`/`option`. But `disabled.html`'s
final subtest **expects** `optgroup_nested`/`option_nested` (no own/optgroup `disabled` attr,
inside a disabled fieldset) to match `:disabled`, matching real browser behaviour. We follow
the test: `is_disabled_by_fieldset()` applies to the whole disable-able set. The base
subtests have no `optgroup`/`option` inside a disabled fieldset, so this never affects them.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `…/pseudo-classes/disabled.html` | 0/7 | **7/7** |
| `…/pseudo-classes/enabled.html` | 1/1 | **1/1** (held) |

**+7, zero regressions.** Sweep: qsa 1975, classlist 1420, matches 669, closest 29,
readwrite-readonly 25, valid-invalid 30, required-optional 6, has-basic 18, is-where-basic
15, tagName 6, cloneNode 135, createElement 147, createElementNS 596, willValidate 67,
checkValidity 122, mark 22, structured-clone 141/152, getRandomValues 39,
url-setters-stripping 260; obscura-dom unit tests 40/40 (incl. the `:disabled`/`:enabled`
selector test).

## Caps / Next

- **`getComputedStyle` / CSS cascade** remains the recurring wall (has-specificity 0/8,
  is-nested 0/2, every `-type-change`/`-hidden` selector variant) — a large architectural
  realm and the strongest single piece of leverage left in `css/`.
- The whole **live-state form / structural pseudo-class family is now complete**:
  `:required` `:optional` `:valid` `:invalid` `:in-range` `:out-of-range` `:read-write`
  `:read-only` `:enabled` `:disabled` `:checked` `:target` `:focus`.
- Otherwise a **fresh realm** (`fetch/`, `html/dom/` reflection / idlharness).
