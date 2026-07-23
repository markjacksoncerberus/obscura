# Quest #252 — The SVG-Baseline Verdict

**Realm:** `css/css-inline/parsing/` (alignment-baseline, dominant-baseline)
**Result:** +28, ZERO regressions. All 6 files → 100%.
**Session:** 2026-07-22.

## The gap

Baselined a NEW dir (`css/css-inline/parsing/`, never touched this campaign) and
found a fat raw-store vein across FIVE properties:

| Property | invalid | valid | computed |
|----------|:-------:|:-----:|:--------:|
| alignment-baseline | 0/6 | 9/9 | 0/9 |
| dominant-baseline | 0/4 | 9/9 | 0/9 |
| baseline-shift | 0/5 | 8/9 | 0/8 |
| line-height | 0/8 | 8/8 | 3/13 |
| vertical-align | 0/9 | 19/30 | 0/23 |

~100 subtests available. This quest took the two **pure SVG baseline enums**
(alignment-baseline / dominant-baseline). Both were unregistered — setProperty
stored any value raw (so `-invalid` accepted everything), and the props weren't in
`getComputedStyle` (so `-computed` returned nothing).

## The grammars

- **alignment-baseline:** `baseline | text-bottom | alphabetic | ideographic |
  middle | central | mathematical | hanging | text-top` (9 keywords).
  Rejects `auto`, `none`, `top`, `center`, `bottom`, and any two-keyword combo.
- **dominant-baseline:** the same 9 EXCEPT the first slot is `auto` not `baseline`.
  Rejects `normal`, `none`, a comma list, and two-keyword combos.

Computed value is the lowercased keyword (identity) — no layout needed.

## The fix (all `bootstrap.js`)

Followed the #240 writing-modes enum template exactly, plus a `_GCS_DEFAULTS`
registration (writing-modes was already registered there; these weren't):

1. `_CSSUI_ENUM` — added both keyword Sets.
2. `_CSSUI_VALIDATED` — added both names so the setProperty (`_canonCssUi`) +
   inline-parser generic-enum branch reject out-of-grammar keywords.
3. `_GCS_DEFAULTS` — added both (initials `baseline` / `auto`, neither inherits).
   `_CSS_KNOWN_PROPS` auto-derives from `_GCS_DEFAULTS` keys, so CSS.supports is
   covered for free.

No new code path — two set-membership adds + two default entries. `_canonCssUi`'s
generic enum branch returns the lowercased keyword = byte-identical to the passing
computed values.

## Results

All 6 files 100%: alignment-baseline invalid 0→6, computed 0→9; dominant-baseline
invalid 0→4, computed 0→9. **+28.**

## Zero-regression sweep

classlist 1420, serialize-values 695/697, writing-mode-invalid 2/2,
table-layout-invalid 2/2; sibling css-inline props unchanged (baseline-shift-valid
8/9, vertical-align-valid 19/30).

## Caps / Next

The SAME dir holds three sibling props still raw-store (the next two quests):
- **baseline-shift** — `<length-percentage> | sub | super` (+ CSS Inline 3
  `top|center|bottom`); invalid 0/5, computed 0/8 (length resolves em→px).
- **line-height** — `normal | <number [0,∞]> | <length-percentage [0,∞]>`;
  invalid 0/8, computed 3/13 (number stays, length→px, `%`×font-size or symbolic).
- **vertical-align** — legacy `baseline | sub | super | text-top | text-bottom |
  middle | top | bottom | <length-percentage>`; invalid 0/9, computed 0/23,
  valid 19/30 (the fattest — length/% + keyword mix).

grep `_CSSUI_ENUM` / `_canonCssUi`.
