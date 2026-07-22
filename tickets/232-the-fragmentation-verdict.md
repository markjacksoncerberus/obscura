# Quest #232 — The Fragmentation Verdict

**Realm:** `css/css-break/parsing/`
**Result:** +20 subtests, ZERO regressions. All 18 files → 100%.
**Session:** 2026-07-21

## The gap

Took #231's next-leverage (a NEW `css/*/parsing/` dir). Probed several fresh
dirs — `css-ui`, `css-align`, `motion`, `css-scroll-snap`, `css-overflow` were
all already ~clean — and found the raw-store vein in `css/css-break/parsing/`.

The css-break longhands were **registered** (present in `_GCS_DEFAULTS`, so their
`-computed`/`-valid` files already passed) but never **validated the invalid
path**: setProperty stored any value verbatim. The tell was every `*-invalid`
sitting at 0/N.

Baseline:

| File | Before |
|------|:------:|
| `break-after-invalid` | 0/2 |
| `break-before-invalid` | 0/2 |
| `break-inside-invalid` | 0/2 |
| `box-decoration-break-invalid` | 0/2 |
| `orphans-invalid` | 0/5 |
| `orphans-computed` | 2/3 |
| `widows-invalid` | 0/5 |
| `widows-computed` | 2/3 |

(All `*-valid` and the break-*-computed files were already 100%.)

## Grammar

- `break-before` / `break-after` = `auto | avoid | avoid-page | page | left |
  right | recto | verso | avoid-column | column | avoid-region | region`
- `break-inside` = `auto | avoid | avoid-page | avoid-column | avoid-region`
  (the subset — only forbids a break *inside* the box, no forced-break keywords;
  so `region` is invalid for break-inside but valid for break-before/-after)
- `box-decoration-break` = `slice | clone`
- `orphans` / `widows` = `<integer [1,∞]>` (inherits; a number-typed calc folds
  at computed time, clamped ≥1)

## The fix (all `bootstrap.js`, ~3 tiny edits)

1. **Enum keywords** — the break-* family drops straight onto the existing css-ui
   enum machinery. Added `break-after`/`break-before`/`break-inside`/
   `box-decoration-break` to `_CSSUI_ENUM`, and all six css-break names to
   `_CSSUI_VALIDATED`. Now `_canonCssUi` lowercases + membership-checks in
   setProperty and `CSS.supports`, rejecting `none`, `avoid region`,
   `auto avoid`, `slice clone`.

2. **orphans/widows specified** — a new `_canonCssUi` branch (placed right after
   the enum-set check): single token only; a number-typed calc via
   `_parseCalcTree`/`_mt` kept symbolic; a `+?\d+` literal accepted iff ≥1, else
   null. Rejects `auto`, `1 234` (multi), `-234`, `-1`, `0`.

3. **orphans/widows computed** — a new `_normComputed` branch (after the
   `column-count` branch) folds the calc via `_computeIntegerValue` and clamps
   ≥1: `calc(1 + 234)`→`235`.

## Wins

All 18 css-break `parsing/` files → 100%. +20:
break-after/-before/-inside invalid 0→2 each, box-decoration-break invalid 0→2,
orphans/widows invalid 0→5 each, orphans/widows computed 2→3 each.

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, getComputedStyle-property-order 1/1; css-ui enum
family held (box-sizing-invalid 6/6, resize-valid 4/4, cursor-valid 46/46,
outline-style-computed 10/10, user-select-computed 4/4, text-overflow-valid 2/2),
color-interpolation-filters-valid 4/4, z-index-computed 3/3 (the
`_INTEGER_COMPUTED_PROPS` z-index/order path is unaffected by the orphans/widows
branch added after it). Change fully gated on the six css-break names.

## Caps / Next

**CAP:** css-break `parsing/` is now clean of raw-store veins (all 18 → 100%).

**NEXT LEVERAGE:** the `outline` family in `css/css-ui/parsing/` is a live in-dir
vein — `outline-width-computed` 5/9 (outline-width echoes specified, is NOT in
`_LENGTH_COMPUTED_PROPS`, so thin/medium/thick + calc never resolve to px) and
`outline-valid` 17/20 (color/style/width ordering + `outline: 0`→`""` in
`_joinBorderSide`); also `cursor-computed` 36/39 (gradient-cursor grammar) and
`resize-computed` 5/6 (`::before`/`::after` pseudo-element computed bug, deeper
than value parsing). OR a NEW `css/*/parsing/` dir. grep `_CSSUI_ENUM` /
`_canonCssUi`.
