# Quest #244 — The Logical-Border Verdict

**Region:** `css/css-logical/parsing/` (border family)
**Result:** +134 subtests, ZERO regressions
**Session:** 2026-07-22

## The gap

Same dir as #243. The whole flow-relative border family was raw-store / unregistered.

| Family | valid | invalid | computed |
|--------|:-----:|:-------:|:--------:|
| border-block/inline-color | 5/7 | 0/15 | 0/8 |
| border-block/inline-style | 12/13 | 0/6 | 0/13 |
| border-block/inline-width | 5/10 | 0/7 | 0/11 |
| border-block/inline (side) | 4/6 | — | — |

Colour longhands echoed raw; the style/width longhands + every block/inline
shorthand were UNREGISTERED (nothing computed, nothing rejected).

## The fix (all `crates/obscura-js/js/bootstrap.js`)

Guiding rule: **a flow-relative border property behaves EXACTLY like its physical
sibling.**

1. **Colour longhands** (`border-<block|inline>-<start|end>-color`) → added to
   `_COLOR_PROPS`. Free: specified `<color>` canon, `_isValidColor` rejection,
   `currentColor`→computed colour, `rgb(0, 0, 0)` default.
2. **Style + width longhands** → new `_BORDER_LOGICAL_LH` validators:
   - `_canonBorderStyleValue` — a single `<line-style>` keyword (`auto` invalid).
   - `_canonLineWidthValue` — `<length [0,∞]> | thin|medium|thick` (rejects a
     percentage, a bare non-zero number, a negative literal, `auto`, multi-token).
   - Registered in `_GCS_DEFAULTS` (style `none`, width `0px`); widths added to
     `_WIDTH_COMPUTED_PROPS` (compute to absolute px). The shared width branch now
     returns `0px` when the sibling `-style` computes `none`/`hidden` (CSS
     Backgrounds §border-width) — scoped to `border-*` (outline excluded); physical
     border-width tests set `border-style: dotted` so they are unaffected.
3. **Two-value shorthands** (`_BORDER_LOGICAL_SH`: border-block/inline-color/-style/
   -width) — expand into their `{start, end}` longhands, mirroring the
   scroll-margin-block machinery across ALL touch points: setProperty, inline
   `_parseStyleDecls`, the CSSOM getter, removeProperty, getComputedStyle `resolve()`
   (reconstruct via `_serializeBoxValue`, collapse an equal pair), CSS.supports, and
   the **cascade** (`_SHORTHAND_LONGHANDS` + `_expandShorthand`) so a stylesheet
   `border-block-style: dotted` resolves the sibling style for the width-zeroing.
4. **Border-side shorthands** `border-block`/`border-inline` (both edges) + the four
   per-edge forms → `_BORDER_EXPAND` + `_expandBorderShorthand`/
   `_serializeBorderShorthand` (both-edge reconstruction requires start == end).

## Wins

color +44, style +40, width +46, side-shorthands +4 = **+134**. All 20 files 100%
except the two `*-color-invalid` at 12/15.

## Caps (honest)

6 color-invalid subtests (`rgb(10%, 20, 30%)`, `hsla(1,2,3,4,5)`,
`rgba(-2, 300, 400%, -0.5)`) need a stricter `_isValidColor` — rgb()/hsl() argument
TYPE consistency (no mixing `<number>` and `<percentage>`) + arity. This is a
PRE-EXISTING gap shared with EVERY `<color>` property (physical `color`,
`border-top-color`, …), not introduced here. Left as a documented cap (touching
`_isValidColor` is a broad, separate change).

## Zero-regression sweep

Broad — this touched `_COLOR_PROPS`, `_WIDTH_COMPUTED_PROPS`, the cascade, the CSSOM
getter, and getComputedStyle. qsa 1975, classlist 1420, serialize-values 695/697,
shorthand-serialization 7/7, getComputedStyle-property-order 1/1, border-width-computed
11/11, border-style-computed 8/8, border-shorthand 36/36, outline-width-computed 9/9,
color-valid 17/17, color-computed 16/16, caret-color-computed 12/12, scroll-margin-
computed 11/11, column-rule-shorthand 12/12, text-emphasis-computed 7/7, flex-computed
14/14, list-style-computed 5/5, margin-block-inline-computed 9/12 + inset-block-inline-
computed 12/12 unchanged. STASH-PROVED `border-color-computed` 4/4 IDENTICAL pre/post
(pre-existing physical border-color shorthand-computed gap — echoes specified).

## Next leverage

The SAME dir's margin/padding/inset-logical: `margin-block`/`-inline`,
`padding-block`/`-inline`, `inset-block`/`-inline` + the physical `inset` shorthand.
The `-invalid`/`-shorthand` files are at 0/N; the `_BOX_SHORTHANDS` machinery is
partly present (margin/padding computed mostly green, inset computed 12/12). Needs:
longhand `<length-percentage>|auto` (margin/inset) / `[0,∞]` (padding) validators +
`test_shorthand_value` support (the longhand getter must reflect the shorthand).
grep `_BORDER_LOGICAL_SH` / `_expandBorderLogical`.
