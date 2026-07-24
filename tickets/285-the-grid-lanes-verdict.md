# Quest #285 — The Grid-Lanes Verdict

**Realm:** `css/css-display/parsing/tentative/` · **Result:** +16 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
The `tentative/` subdir of the css-display parsing dir (un-baselined until now) tests
the **css-grid-3** experimental `grid-lanes` / `inline-grid-lanes` `display` values:
- `display-valid.html` — 0/6
- `display-computed.html` — 0/10

Both files exercised the `_canonDisplay` engine from Quest #283, but `grid-lanes` was
not in `_DISPLAY_INSIDE` and `inline-grid-lanes` not in `_DISPLAY_PREDEFINED`, so every
value was dropped as out-of-grammar.

## The rule (css-grid-3 §grid-lanes-containers)
`grid-lanes` is a new `<display-inside>` keyword; `inline-grid-lanes` is the predefined
inline-level single keyword. The canon:
- `grid-lanes` → `grid-lanes`
- `block grid-lanes` → `grid-lanes` (block is the default outer, dropped)
- `grid-lanes block` → `grid-lanes`
- `inline-grid-lanes` → `inline-grid-lanes` (verbatim predefined keyword)
- `inline grid-lanes` → `inline grid-lanes` — **does NOT collapse** to the
  `inline-grid-lanes` keyword (unlike flex/grid's `inline flex`→`inline-flex`); the
  two-value form is kept
- `grid-lanes inline` → `inline grid-lanes`

Computed = specified, EXCEPT blockification (§2.7): a floated / abspos box blockifies
`inline grid-lanes` → `grid-lanes` (the 4 `test_display_affected` cases).

## The fix (all `crates/obscura-js/js/bootstrap.js`)
- `_DISPLAY_INSIDE` += `grid-lanes`
- `_DISPLAY_PREDEFINED` += `inline-grid-lanes`
- `_DISPLAY_CANON` — a new `grid-lanes` column per outside: block→`grid-lanes`,
  inline→`inline grid-lanes` (kept two-value, NOT collapsed), run-in→`run-in grid-lanes`
- `_BLOCKIFY_MAP` += `inline-grid-lanes`→`grid-lanes` (for consistency; `inline
  grid-lanes` already blockifies via the existing `strip leading 'inline '` fallback in
  `_blockifyDisplay`)

## Results
| Test | Before | After |
|------|:------:|:-----:|
| `tentative/display-valid` | 0/6 | **6/6** |
| `tentative/display-computed` | 0/10 | **10/10** |

Parent `css/css-display/parsing/` dir held 275/275 (valid 108, invalid 55, computed 112).

## Caps / Next
None specific. The whole `css/css-display/parsing/` dir (incl. `tentative/`) is now
SECURED. NEXT: a NEW `css/*/parsing/` dir — grep `_canonDisplay` for a multi-keyword
canon template, `_CSSUI_ENUM` for the enum template.
