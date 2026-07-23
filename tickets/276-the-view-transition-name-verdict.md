# Quest #276 — The View-Transition-Name Verdict

**Realm:** `css/css-view-transitions/parsing/` · **Result:** +22 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
`view-transition-name` (CSS View Transitions 1) was **raw-store**: `el.style` accepted
any value and getComputedStyle had no entry for it.
- `view-transition-name-invalid.html` — **0/11** (no validation gate: `default`,
  `none none`, `"none"`, `foo foo`, `#fff`, `12px`/`12em`/`12%` all wrongly stored)
- `view-transition-name-computed.html` — **0/11** ("not supported in the computed style")
- `view-transition-name-valid.html` — 5/5 (already round-tripped via raw-store)

## The grammar
```
view-transition-name = none | <custom-ident> | match-element
```
- `none` and `match-element` are keywords (case-insensitive → lowercased;
  `maTch-element` → `match-element`).
- `<custom-ident>` is **case-PRESERVED** (`foo`/`bar`/`baz` stay verbatim) and excludes
  the CSS-wide keywords + `default`.
- Not inherited; initial `none`; computed = specified identity.

## The fix (all `crates/obscura-js/js/bootstrap.js`)
1. **`_canonCssUi` branch** (shared with `view-transition-group`, see #278): single
   token; keyword match (name: `none`/`match-element`) → lowercased; `default` → null;
   else `_GRID_CI_RE.test(t) ? t : null` (case-preserved). The top-of-function
   `_CSS_WIDE`/`var()` guard handles CSS-wide + `var()` pass-through.
2. **`_CSSUI_VALIDATED`** += `'view-transition-name'` — gates API `setProperty` +
   `CSS.supports`.
3. **Inline `_parseStyleDecls` branch** — routes inline `style="…"` through the same
   canon (invalid → drop the declaration).
4. **`_GCS_DEFAULTS`** += `'view-transition-name': 'none'` — registers computed
   (identity, since there is no `_normComputed` branch). Not added to `_INHERITED_PROPS`.

## Result
| file | before | after |
|------|:------:|:-----:|
| view-transition-name-invalid | 0/11 | **11/11** |
| view-transition-name-computed | 0/11 | **11/11** |
| view-transition-name-valid | 5/5 | 5/5 |

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, page-computed 6/6 (the sibling
`page` = `auto | <custom-ident>` pattern), position-computed 5/5, font-palette-valid 5/5.

## Caps / Next
The 4 `pseudo-elements-*` files in this dir test `::view-transition-*` SELECTOR parsing
(Rust `selectors` crate) — a different quest type. Next in this vein: #277 (class),
#278 (group). grep `view-transition-name`.
