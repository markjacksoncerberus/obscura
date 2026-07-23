# Quest #280 — The Overscroll-Shorthand Verdict

**Realm:** `css/css-overscroll-behavior/parsing/` · **Result:** +7 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
After #279 secured the four longhands, the `overscroll-behavior` **shorthand** was
still raw-store:
- `overscroll-behavior-invalid.html` — 12/15 (the 3 shorthand rows `normal`, `0`,
  `contain contain contain` wrongly stored)
- `overscroll-behavior-valid.html` — 24/28 (the 4 collapse rows `contain contain`
  → `contain`, `none none`→`none`, `auto auto`→`auto`, `chain chain`→`chain` kept
  the raw pair instead of collapsing)

## The grammar
```
overscroll-behavior = [ contain | none | auto | chain ]{1,2}
```
The first value → `overscroll-behavior-x`, the second (or a copy of the first) →
`overscroll-behavior-y` (**physical only**; `-inline`/`-block` are independent
logical longhands with no shorthand here). Serialization collapses equal axes to
one value. This is **exactly the `overflow` shorthand pattern**.

## The fix (all `crates/obscura-js/js/bootstrap.js`)
Mirrored `overflow` across its six touch points:
- NEW helpers next to `_serializeOverflowShorthand`: `_OVERSCROLL_SH_LH`,
  `_OVERSCROLL_KW` (= the shared `_CSSUI_ENUM['overscroll-behavior-x']` set),
  `_parseOverscrollShorthand` (`{1,2}` → `{x,y}` or null), `_serializeOverscrollShorthand`
  (collapse `x===y`).
- `setProperty` (after the overflow branch): expand into — and store as — `-x`/`-y`
  (a CSS-wide keyword goes to both); never keep the shorthand key.
- `removeProperty`: clear `-x`/`-y` (+ any raw key).
- `getPropertyValue`: reconstruct via `_serializeOverscrollShorthand` (raw key wins
  if set via cssText/style attribute).
- `getComputedStyle` resolver: `add('overscroll-behavior')` + reconstruct from
  computed `-x`/`-y`.
- `CSS.supports`: `_parseOverscrollShorthand` gate.

## Result
| file | before | after |
|------|:------:|:-----:|
| overscroll-behavior-invalid  | 12/15 | **15/15** |
| overscroll-behavior-valid    | 24/28 | **28/28** |
| overscroll-behavior-computed | 16/16 | 16/16 |

Whole `css/css-overscroll-behavior/parsing/` dir (3 files, 59 subtests) now green.

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, overflow-valid 18/18,
overflow-computed 34/34 (the shared `overflow` pattern this is modelled on).

## Caps / Next
None in this dir. **Next leverage:** a NEW `css/*/parsing/` dir — `css-size-adjust`
`text-size-adjust` (#281). grep `_parseOverscrollShorthand`.
