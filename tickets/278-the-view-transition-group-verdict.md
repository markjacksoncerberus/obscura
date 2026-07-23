# Quest #278 — The View-Transition-Group Verdict

**Realm:** `css/css-view-transitions/parsing/` · **Result:** +7 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
`view-transition-group` (CSS View Transitions 2, **tentative**) was **raw-store**:
- `view-transition-group-invalid.tentative.html` — **0/7** (`default`, `foo none`,
  `#fff`, `12px`, `foo 12px`, `12em`, `12%` all wrongly stored)
- `view-transition-group-valid.tentative.html` — 7/7 (raw-store round-trip)

There is no `-computed` file for group in the dir.

## The grammar
```
view-transition-group = normal | nearest | contain | <custom-ident>
```
- `normal`/`nearest`/`contain` are keywords (case-insensitive → lowercased).
- `<custom-ident>` is **case-preserved** and excludes CSS-wide + `default`. Unlike
  -name/-class, **`none` is an ordinary custom-ident here** (`view-transition-group:
  none` is valid), because the grammar has no `none` keyword.
- Initial `normal`; not inherited.

## The fix (all `crates/obscura-js/js/bootstrap.js`)
Folded into the **shared name/group `_canonCssUi` branch** (`name ===
'view-transition-name' || name === 'view-transition-group'`): a single token; the
keyword set is chosen per property (group: `normal`/`nearest`/`contain`), else
`default` → null, else `_GRID_CI_RE.test(t) ? t : null`. Registered in
`_CSSUI_VALIDATED`, the inline parser branch, and `_GCS_DEFAULTS`
(`'view-transition-group': 'normal'`).

## Result
| file | before | after |
|------|:------:|:-----:|
| view-transition-group-invalid.tentative | 0/7 | **7/7** |
| view-transition-group-valid.tentative | 7/7 | 7/7 |

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, plus all name/class files held
(#276/#277). Whole `css/css-view-transitions/parsing/` property vein (8 files) now green.

## Caps / Next
The 4 `pseudo-elements-*` files (959 subtests) test `::view-transition-*` SELECTOR
parsing — a Rust `selectors`-crate quest, not the JS value vein. **Next leverage:**
`css/css-overscroll-behavior/parsing/` (`overscroll-behavior-invalid` 0/15 — a small
raw-store `[ contain | none | auto ]{1,2}` shorthand + longhand vein), then a NEW
`css/*/parsing/` dir. grep `view-transition-group`.
