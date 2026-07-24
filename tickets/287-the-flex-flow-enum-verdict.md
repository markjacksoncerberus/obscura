# Quest #287 — The Flex-Flow-Enum Verdict

**Realm:** `css/css-flexbox/parsing/` · **Result:** +4 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
`flex-direction-invalid.html` (0/2) and `flex-wrap-invalid.html` (0/2) — both
raw-store. The `-valid`/`-computed` files round-tripped, but there was no invalid
gate, so `auto` / two-keyword combos (`column row-reverse`, `nowrap wrap`) were
accepted.

## The rule (css-flexbox-1 §5.1)
- `flex-direction` = `row | row-reverse | column | column-reverse`
- `flex-wrap` = `nowrap | wrap | wrap-reverse`

Single-keyword enums. Computed = the lowercased keyword (identity).

## The fix (all `crates/obscura-js/js/bootstrap.js`)
The `_CSSUI_ENUM` template — two one-liners each:
- `_CSSUI_ENUM` += `flex-direction`, `flex-wrap` sets
- `_CSSUI_VALIDATED` += `flex-direction`, `flex-wrap`

Both the inline `_parseStyleDecls` parser and API `setProperty` auto-dispatch to
`_canonCssUi`'s generic enum branch. The `flex-flow` shorthand path is untouched: it
expands into the longhands directly via `_expandFlexFlow` (storing into `this._props`),
bypassing the setProperty enum gate — and its values are valid enum members anyway.

## Results
| Test | Before | After |
|------|:------:|:-----:|
| `flex-direction-invalid` | 0/2 | **2/2** |
| `flex-wrap-invalid` | 0/2 | **2/2** |
| `flex-direction-valid`/`-computed` | 4/4 · 4/4 | held |
| `flex-wrap-valid`/`-computed` | 3/3 · 3/3 | held |
| `flex-flow-*` (regression) | 2/2 · 7/7 · 2/2 | held |

## Caps / Next
The css-flexbox parsing dir's remaining gaps are `align-*`/`justify-*` (they live in
`css/css-align/`, not here). NEXT: a NEW `css/*/parsing/` dir — grep `_CSSUI_ENUM` for
the enum template.
