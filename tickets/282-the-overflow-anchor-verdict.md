# Quest #282 — The Overflow-Anchor Verdict

**Realm:** `css/css-scroll-anchoring/parsing/` · **Result:** +4 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
A NEW dir. `overflow-anchor` was **raw-store / unregistered in computed**:
- `overflow-anchor-invalid.html` — **0/2** (`all`, `auto none` wrongly stored)
- `overflow-anchor-computed.html` — **0/2** ("not supported in computed style")
- `overflow-anchor-valid.html` — 2/2 (already round-tripped via raw-store)

## The grammar
```
overflow-anchor = auto | none
```
Whether the element is a scroll-anchoring candidate. Rejects `all` and any
two-keyword combination (`auto none`). Not inherited; initial `auto`; computed =
the lowercased keyword (identity).

## The fix (all `crates/obscura-js/js/bootstrap.js`)
The `_CSSUI_ENUM` template — three one-liners:
- `_CSSUI_ENUM['overflow-anchor'] = new Set(['auto', 'none'])`
- `_CSSUI_VALIDATED` += `'overflow-anchor'` (→ inline `_parseStyleDecls` sibling +
  API `setProperty` both dispatch to `_canonCssUi`'s generic enum branch)
- `_GCS_DEFAULTS['overflow-anchor'] = 'auto'` (not inherited, computed = identity)

## Result
| file | before | after |
|------|:------:|:-----:|
| overflow-anchor-invalid  | 0/2 | **2/2** |
| overflow-anchor-computed | 0/2 | **2/2** |
| overflow-anchor-valid    | 2/2 | **2/2** |

Whole `css/css-scroll-anchoring/parsing/` dir (3 files) green.

## Caps / Next
None. **Next:** the big `css-display` `display` vein (Quests #283/#284).
grep `overflow-anchor`.
