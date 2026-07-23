# Quest #253 — The Line-Height Verdict

**Realm:** `css/css-inline/parsing/` (line-height, baseline-shift)
**Result:** +32, ZERO regressions. All 6 files → 100%.
**Session:** 2026-07-22.

## The gap

Continuing the css-inline vein from #252. Both remaining sibling props were
raw-store:

| Property | invalid | valid | computed |
|----------|:-------:|:-----:|:--------:|
| line-height | 0/8 | 8/8 | 3/13 |
| baseline-shift | 0/5 | 8/9 | 0/8 |

## The grammars

- **line-height:** `normal | <number [0,∞]> | <length-percentage [0,∞]>` (+ calc).
  Reject `auto`, negatives, and multi-token (`2 10px`, `auto 10px`).
- **baseline-shift:** `<length-percentage> | sub | super | top | center | bottom`.
  Reject a bare number (`5`), multi-token, and a comma list.

## The fix (all `bootstrap.js`)

Both grammars already had a validator elsewhere — reused, not reinvented:

1. `_canonCssUi` branches:
   - `line-height` → `_canonFontLineHeight(single token)` (the `font` shorthand's
     line-height slot — the exact same non-negative number/length-percentage grammar).
   - `baseline-shift` → the five keywords, else `_canonLenPctSigned(tok, true)`
     (signed `<length-percentage>`, rejects a bare non-zero number, `0`→`0px`).
2. `_CSSUI_VALIDATED` — added both. `_GCS_DEFAULTS` — added `baseline-shift: 0px`
   (line-height already present).

### Computed (`_normComputed`)

- **`_computeBaselineShift`** — keywords pass through; a `<length>` folds to px
  (em/calc against the element font-size); a bare `%` stays symbolic (it resolves
  against the used line-height, which needs layout). `-10px`→`-10px`, `20%`→`20%`,
  `calc(10px - 0.5em)`→`-10px` (font-size 40px).
- **`_computeLineHeight`** — the subtle one. A `<length>`/`<percentage>`/calc computes
  to an absolute px length (% base = the element's computed **font-size**, `cqZero`
  folds a `sign(2cqw…)` container gate to 0, clamp ≥0). But a `<number>` (and a
  number-typed calc) is KEPT as a bare number, because a `<number>` line-height
  **inherits as a number** — it multiplies each descendant's *own* font-size — so
  storing the parent's px would break a child with a different font-size.

  The px RESOLVED (OM) value for a `<number>` is applied only at the getComputedStyle
  `resolve()` boundary: `number × this element's computed font-size`. That keeps the
  internal computed value (used by inheritance and by `_lineHeightPx`) a number, while
  `getComputedStyle().lineHeight` returns px, exactly as browsers do.

  Verified all 13 computed cases incl. `2`→`80px`, `200%`→`80px`,
  `calc(200% + 10px)`→`90px`, `calc(10px - 0.5em)`→`0px` (clamp),
  `calc(10 + (sign(2cqw - 10px) * 5))`→`200px` (number → ×fs),
  `calc(10% + (sign(2cqw - 10px) * 5%))`→`2px` (% → ×fs).

## Zero-regression sweep

font-valid 315/315, font-computed 315/315 (the `font` shorthand's line-height
longhand is unaffected), classlist 1420, serialize-values 695/697,
alignment/dominant-baseline (#252) held. **STASH-PROVED** `lh-rlh-on-root-001` 4/8
IDENTICAL with and without the change (pre-existing, NOT a regression).

## Caps / Next

The last sibling in the SAME dir: **vertical-align** (invalid 0/9, computed 0/23,
valid 19/30). It's the fattest — the legacy grammar `baseline | sub | super |
text-top | text-bottom | middle | top | bottom | <length-percentage>` mixes keyword
+ length/%. In CSS Inline 3 it also becomes a shorthand of baseline-source /
alignment-baseline / baseline-shift, but the WPT here tests the legacy longhand form.

grep `_computeLineHeight` / `_canonFontLineHeight` / `_canonLenPctSigned`.
