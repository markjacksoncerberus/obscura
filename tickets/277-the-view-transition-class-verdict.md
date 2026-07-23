# Quest #277 — The View-Transition-Class Verdict

**Realm:** `css/css-view-transitions/parsing/` · **Result:** +18 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
`view-transition-class` (CSS View Transitions 2) was **raw-store**:
- `view-transition-class-invalid.html` — **0/7** (`default`, `foo none`, `#fff`,
  `12px`, `foo 12px`, `12em`, `12%` all wrongly stored)
- `view-transition-class-computed.html` — **0/11** ("not supported in the computed style")
- `view-transition-class-valid.html` — 6/6 (raw-store round-trip)

## The grammar
```
view-transition-class = none | <custom-ident>+
```
- `none` **alone** is the keyword.
- Otherwise a **space-separated list** of `<custom-ident>` (`foo`, `foo bar`,
  `foo bar baz`), each **case-preserved** and excluding CSS-wide + `default` + `none`
  (so `foo none` is invalid — `none` may not appear in a multi-ident list).
- Not inherited; initial `none`; computed = specified identity (the list is kept).

## The fix (all `crates/obscura-js/js/bootstrap.js`)
1. **Dedicated `_canonCssUi` branch**: `_wsTokens(s)`; a lone `none` → `'none'`;
   else per token reject `none`/`default`/CSS-wide, require `_GRID_CI_RE`, and
   `toks.join(' ')`.
2. **`_CSSUI_VALIDATED`** += `'view-transition-class'`.
3. **Inline `_parseStyleDecls` branch** (shared with -name/-group).
4. **`_GCS_DEFAULTS`** += `'view-transition-class': 'none'` (not inherited).

## Result
| file | before | after |
|------|:------:|:-----:|
| view-transition-class-invalid | 0/7 | **7/7** |
| view-transition-class-computed | 0/11 | **11/11** |
| view-transition-class-valid | 6/6 | 6/6 |

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, color-scheme-computed 13/13,
column-rule-computed 6/6.

## Caps / Next
See #276 for the `pseudo-elements-*` selector-engine cap. Next: #278 (group).
grep `view-transition-class`.
