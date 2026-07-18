# Scroll #55 — The Custom Verdict

> *Quest #55. Realm: `css/css-variables/` — CSS custom-property (`--*`) storage,
> serialization, cascade, inheritance, and `var()` substitution.*
> **SECURED — +88, zero regressions (session 2026-06-20).**

## The gap

The campaign's standing top "next leverage (a)" since #51: **CSS custom-property
cascade + `var()` substitution.** The whole `css/css-variables/` realm was dark
because the two primitives it rests on were missing/broken:

1. **`CSSStyleDeclaration` was a toy.** `setProperty`/`cssText`/`getPropertyValue`
   did no custom-property name validation, no `!important` tracking, no
   custom-property whitespace canonicalization. Worse, **the `style` Proxy `set`
   trap stored `style.cssText = "…"` as a plain `_props['cssText']`** instead of
   invoking the real setter — so `el.style.cssText = …` silently lost every
   declaration. (The few subtests that "passed" before did so for the wrong
   reason: nothing was stored, so computed values fell back to the initial.)

2. **The `style` content attribute never reached the live decl.** HTML parsing
   sets `style="…"` directly in the Rust tree (bypassing JS `setAttribute`), so
   `el.style.getPropertyValue("--x")` read an empty `_props` — the *specified*
   value of any HTML-authored declaration was invisible.

3. **`getComputedStyle` had no custom-property inheritance.** Custom properties
   were echoed from the cascade verbatim — no ancestor-chain inheritance (custom
   properties always inherit), no CSS-wide keyword resolution, no `var()`
   substitution into standard properties.

## The work (pure JS, `bootstrap.js`, NO new Rust)

- **`CSSStyleDeclaration` rewrite** with `_priority` tracking and shared helpers:
  - `_isValidCustomPropName` — `--`-prefix, length > 2, no internal whitespace
    (`--`, `--foo bar` invalid; `--foo`, `---` valid).
  - `_canonCustomValue` — trim leading/trailing whitespace, preserve internal;
    an empty (all-whitespace) value becomes a single space (`--x: ;` → `" "`),
    the form the CSSOM round-trips.
  - `_parseStyleDecls` — ordered `{name,value,important}` parse of a declaration
    block (drops invalid custom names, lowercases standard names, strips
    `!important`).
  - `setProperty(name,value,priority)` validates names, canonicalizes, tracks
    importance; empty value ⇒ removeProperty (CSSOM). `getPropertyPriority` added.
  - `cssText` setter folds with cascade semantics (an `!important` decl is not
    overridden by a later normal one of the same property); getter serializes
    `name: value[ !important];` joined by spaces.
- **Proxy `set` trap fix** — accessor/method names (`cssText`, …) delegate to the
  real setter; only genuine CSS property names land on `_props`.
- **`style` content-attribute sync** — `get style` does a one-time lazy sync from
  the `style` attribute on first access (cheap; HTML parsing populates the Rust
  tree, JS `setAttribute`/`removeAttribute` keep it synced thereafter). The live
  CSSOM `_props` cascade source now carries real `!important` priority.
- **`_computedCustomProp(el,name)`** — custom properties always inherit; their
  initial value is the guaranteed-invalid value (serializes as `""`); CSS-wide
  keywords resolve here (`initial`→`""`, `inherit`/`unset`/`revert`→parent). A
  property explicitly set to the empty value computes to `" "` (distinct from
  "not set", which inherits). Wired into `getComputedStyle.resolve` for `--*`.
- **`var()` substitution** — `_substituteVars(el,value)` + `_splitVarArgs`:
  replace every `var(--name, fallback)` with the custom property's computed value
  (or the fallback when guaranteed-invalid), recursively (nested var()/fallbacks,
  cycle guard). Token boundaries approximated by space-padding insertions and
  collapsing whitespace (`var(--a)var(--b)` → `"a b"`). Wired into `_computedPropOf`:
  a value with `var()` is substituted; if substitution fails (undefined no
  fallback / cycle / unbalanced) the property is **invalid at computed-value
  time** → inherited-or-initial.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css/css-variables/variable-definition.html` | 11/73 | **71/73** | +60 |
| `css/css-variables/variable-definition-cascading.html` | 5/9 | **9/9** | +4 |
| `css/css-variables/variable-definition-keywords.html` | 0/8 | **8/8** | +8 |
| `css/css-variables/variable-cssText.html` | 1/11 | **8/11** | +7 |
| `css/css-variables/variable-substitution-basic.html` | 5/13 | **11/13** | +6 |
| `css/css-variables/variable-created-element.html` | 1/3 | **3/3** | +2 |
| `css/css-variables/variable-created-document.html` | 1/2 | **2/2** | +1 |

**+88. Zero regressions.** Swept: qsa 1975, classlist 1420, matches 669, closest
29, createElement 147, getElementsByClassName 3, color-computed 16, named 455,
opacity-computed 30, color-computed-rgb 95 (cap unchanged), css-color/inheritance
4, inherit-initial 4, css-text/ui/fonts inheritance 42/28/39, has/not-specificity
8/8, disabled 7, readwrite-readonly 25, valid-invalid 30; obscura-dom unit 40/40.
(aria-attribute-reflection 8/33 confirmed pre-existing by stash+rebuild.)

## Caps (honest)

- **`var()` + `CSS.supports`** — `color-computed-rgb`'s 2 `var()` subtests fail at
  `CSS.supports('color','rgb(var(--high),0,0)')` returning false; CSS.supports
  doesn't yet treat a `var()`-containing value as valid-at-parse-time. A shared
  hot path (gates the whole `*-computed.html` family) — deferred for regression
  safety; and that test caps at 97 regardless (2× `2cqw` container-unit, unwinnable).
- **Invalid-at-computed-time for `<color>`** — `test_variable_legal_values` 0/23
  and `variable-substitution-filters`/`-background-properties` need a substituted
  value to be *rejected* as an invalid color (→ initial) and reflected; `_computeColor`
  echoes unrecognized values rather than signalling invalidity. Separate engine.
- **Shorthand expansion** — `margin: var(--p)` must serialize to empty longhands
  (`variable-cssText` target9; `variable-substitution-shorthands` 13/51). No
  shorthand-longhand model yet.
- **Unknown-property drop** — `variable-definition` `-var4`/`expando` (×2-3) and
  `variable-cssText` target10 expect unrecognized standard properties dropped;
  we store any standard name (allow-listing risks regressing vendor-prefixed
  props elsewhere).
- **Token boundaries** — `var(--n)px` → `0px` (invalid) needs a real tokenizer +
  per-property grammar; our string-level substitution yields `"20 px"`.
- **Comment preservation in values** — `variable-cssText` target11.
- **Custom-property computed value** keeps `var()` verbatim (substituted only when
  *used* in a standard property), and reftests (`variable-declaration-*`,
  `css-vars-custom-property-inheritance`) are out of realm.

## Next leverage

1. **`CSS.supports` + `var()`** (small, +2 rgb caps + helps the family) — make a
   `var()`-bearing value valid for any known property; verify no `*-computed.html`
   regression.
2. **Invalid-at-computed-time signalling** for `<color>` (`_computeColor` returns
   null on unparseable) → unlocks `test_variable_legal_values` (23) and the
   substitution-into-{filters,background,shadow} family.
3. **Shorthand → longhand expansion** in the cascade/serialization (opens
   `variable-substitution-shorthands` 51 + the cssText shorthand cases).
4. A **specified-value serialization engine** (`serialize-values` 0/697) or a
   fresh realm (`fetch/`, `html/dom/` reflection).
