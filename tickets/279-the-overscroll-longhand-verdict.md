# Quest #279 — The Overscroll-Longhand Verdict

**Realm:** `css/css-overscroll-behavior/parsing/` · **Result:** +28 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
Took #278's next-leverage. The whole `overscroll-behavior` family was **raw-store /
unregistered in computed**:
- `overscroll-behavior-invalid.html` — **0/15** (`normal`/`0`/`contain contain`
  wrongly stored across the shorthand + all four longhands)
- `overscroll-behavior-computed.html` — **0/16** ("not supported in computed style")
- `overscroll-behavior-valid.html` — 24/28 (raw-store round-trip; the 4 collapse
  cases `contain contain`→`contain` fail — those are the shorthand's, see #280)

## The grammar
The four per-axis longhands are a single keyword enum:
```
overscroll-behavior-{x,y,inline,block} = contain | none | auto | chain
```
Initial `auto`; **not inherited**; computed = the lowercased keyword (identity).
(The `overscroll-behavior` shorthand → x/y is Quest #280.)

## The fix (all `crates/obscura-js/js/bootstrap.js`)
The exact `_CSSUI_ENUM` template — three one-liners:
- `_CSSUI_ENUM` += the four longhands (`new Set(['contain','none','auto','chain'])`).
  The generic enum branch in `_canonCssUi` (`enumSet.has(low) ? low : null`) then
  validates + canonicalizes for free.
- `_CSSUI_VALIDATED` += the four names → the inline `_parseStyleDecls` branch (1548)
  and API `setProperty` (25612) both dispatch to `_canonCssUi` automatically.
- `_GCS_DEFAULTS` += the four names → `'auto'` → registered in computed (identity).

## Result
| file | before | after |
|------|:------:|:-----:|
| overscroll-behavior-invalid  | 0/15  | **12/15** (3 shorthand → #280) |
| overscroll-behavior-computed | 0/16  | **16/16** |
| overscroll-behavior-valid    | 24/28 | 24/28 (4 collapse → #280) |

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, position-computed 5/5,
break-after-computed 12/12, overflow-computed 34/34.

## Caps / Next
The shorthand (`overscroll-behavior` = `[…]{1,2}` → x/y) is Quest #280. grep
`overscroll-behavior-x`.
