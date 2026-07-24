# Quest #286 — The Flex-Basis Verdict

**Realm:** `css/css-flexbox/parsing/` · **Result:** +7 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
`flex-basis-invalid.html` — **0/7**. `flex-basis` was raw-store: `flex-basis-valid`
(8/8) and `-computed` (12/12) round-tripped, but there was NO invalid gate, so
out-of-grammar values (`none`, `auto content`, `-1px`, `-2%`, `3px 4%`,
`anchor-size(--a width)`, `anchor-size(--a width, 10px)`) were accepted and reflected.

## The rule (css-flexbox-1 §7.2.3)
`flex-basis` = `content | <'width'>`. The `<'width'>` grammar is exactly the sizing
single-value grammar we already gate for width/height (`auto | <length-percentage
[0,∞]> | min-content | max-content | fit-content | fit-content() | stretch | contain`)
— crucially **no `none`, no negatives, single token only** — PLUS the flex-basis-only
`content` keyword.

## The fix (all `crates/obscura-js/js/bootstrap.js`)
NEW `_isValidFlexBasis(value)` = `content` keyword OR `_isValidSizeValue('flex-basis',
value)` (reusing the shared sizing validator, which rejects `none` for a non-`max-`
property, negatives, bare non-zero numbers, multi-token, and unrecognized tokens like
`anchor-size(...)`). Wired into the SAME two touch points as `_SIZE_VALIDATED`:
- inline `_parseStyleDecls` (`_SIZE_VALIDATED.has(name) || name === 'flex-basis'`,
  dispatching `_isValidFlexBasis` for flex-basis, with a `content` short-circuit)
- API `setProperty` (mirror)

The math gate (`_mathReject(value, ['length'], 'length')`) and `0`→`0px` canon are
shared with the sizing path unchanged; `calc(2em + 3ex)` (length-typed) passes.

## Results
| Test | Before | After |
|------|:------:|:-----:|
| `flex-basis-invalid` | 0/7 | **7/7** |
| `flex-basis-valid` | 8/8 | 8/8 |
| `flex-basis-computed` | 12/12 | 12/12 |

## Caps / Next
None. See Quest #287 (flex-direction/flex-wrap enums, same dir).
