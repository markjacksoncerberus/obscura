# Quest #241 — The Table-Grammar Verdict

**Realm:** `css/css-tables/parsing/`
**Result:** +18 subtests, ZERO regressions
**Session:** 2026-07-22

## The gap

Continuing #240's "a NEW `css/*/parsing/` dir" pointer, baselined
`css/css-tables/parsing/` → a clean raw-store vein:

- All five `-invalid` files at **0/N** (border-collapse 0/2, border-spacing 0/4,
  caption-side 0/4, empty-cells 0/2, table-layout 0/2) — the properties stored raw,
  nothing rejected out-of-grammar values.
- `border-spacing-computed` **1/4** and `border-spacing-valid` **2/3** — a length
  canon/fold gap (em/calc not resolved, no clamp/collapse).

The four enum properties' `-computed` already passed (valid keyword round-trips).

## The grammars

- `border-collapse` = `separate | collapse`
- `caption-side` = `top | bottom`
- `empty-cells` = `show | hide`
- `table-layout` = `auto | fixed`
- `border-spacing` = `<length [0,∞]>{1,2}` — one or two **non-negative** lengths, **no
  percentage**; unitless non-zero is invalid (`30` rejected), only unitless `0` is a
  valid length.

## The fix (all `bootstrap.js`)

**The four enums** — same `_CSSUI_ENUM`/`_CSSUI_VALIDATED` machinery as #240: added
their keyword sets to `_CSSUI_ENUM` and the names to `_CSSUI_VALIDATED`. The
setProperty `_canonCssUi` enum branch now rejects `auto`/`none`/two-keyword combos.

**`border-spacing`** needed the full three-part treatment (validate/canon/compute):

1. *Specified* — a `border-spacing` branch in `_canonCssUi`: 1–2 tokens, each a
   non-negative length (`_isZeroTok`→`0px`; `_isLengthTok` with a literal-negative
   guard that exempts calc; percentage / unitless-non-zero / keyword → `null`
   invalid). Each component canonicalized via `_canonLineWidth` (so
   `calc(10px + 0.5em)`→`calc(0.5em + 10px)`). A distinct pair is NOT collapsed at
   specified time. Added `border-spacing` to `_CSSUI_VALIDATED`.
2. *Computed* — a `border-spacing` branch in `_normComputed`: each of the 1–2
   components resolved to px via `_trComp` (em/calc folded), a resolved negative
   clamped to 0 via `_clampNegPx`, and an equal pair collapsed to a single value
   (`calc(10px + 0.5em) calc(10px - 0.5em)`→`30px 0px`; `0`→`0px`; `10px 20px` stays
   two).

## Results

All 11 files → 100% (+18):

| File | Before | After |
|------|:------:|:-----:|
| border-collapse-invalid | 0/2 | 2/2 |
| border-spacing-invalid | 0/4 | 4/4 |
| caption-side-invalid | 0/4 | 4/4 |
| empty-cells-invalid | 0/2 | 2/2 |
| table-layout-invalid | 0/2 | 2/2 |
| border-spacing-computed | 1/4 | 4/4 |
| border-spacing-valid | 2/3 | 3/3 |
| (4 enum `-computed`) | 2/2 each | held |

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, box-sizing-invalid 6/6, cursor-valid 46/46,
writing-mode-invalid 2/2 (#240 held), column-width-computed 3/3 (shares
`_trComp`/`_clampNegPx`).

## Cap / Next

`css/css-tables/parsing/` is now fully secured (all 11 files 100%).

**Next leverage:** a NEW `css/*/parsing/` dir. The tell is a `-invalid` at 0/N
(raw-store) or a `-valid`/`-computed` canon gap. grep `_CSSUI_ENUM`.
