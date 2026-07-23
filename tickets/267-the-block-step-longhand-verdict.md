# Quest #267 — The Block-Step Longhand Verdict

**Realm:** `css/css-rhythm/parsing/` — the four `block-step-*` longhands (CSS Rhythmic Sizing 1)
**Hold before:** raw-store — align 4/21, insert 3/15, round 6/24, size 5/17 (invalid 0/N, computed 0/N)
**Hold after:** all 12 longhand files 100/100 — **+65, ZERO regressions**

## The gap

`css/css-rhythm/parsing/` (CSS Rhythmic Sizing 1) was a fat, fresh raw-store vein: the
whole `block-step-*` family — a shorthand + four longhands — was unregistered. Every
`-invalid` sat at 0/N (the raw-store accepted anything) and every `-computed` at 0/N
(the props were absent from getComputedStyle). This quest took the four longhands.

## The work (all `bootstrap.js`)

Three keyword enums + one length longhand:

- **`block-step-align`** = `auto | center | start | end` → `_CSSUI_ENUM`.
- **`block-step-insert`** = `margin-box | padding-box | content-box` → `_CSSUI_ENUM`
  (the `-box` keywords only — `margin`/`padding`/`content`/`border-box` are invalid).
- **`block-step-round`** = `up | down | nearest` → `_CSSUI_ENUM`.
- **`block-step-size`** = `none | <length [0,∞]>` → a dedicated `_canonCssUi` branch
  (single token; `none`, unitless `0`→`0px`, a non-negative literal length via
  `_canonLineWidth`, or a length-typed calc kept symbolic; a literal negative /
  percentage / unitless non-zero / `auto` / >1 token → invalid — modelled on the
  `border-spacing` branch but single-valued with the `none` keyword).

All four → `_CSSUI_VALIDATED` (gate setProperty + the inline parser) + `_GCS_DEFAULTS`
(initials `auto` / `margin-box` / `up` / `none`, none inherited). The three enums
compute to keyword identity (no `_normComputed` branch needed). `block-step-size` got
a `_normComputed` branch: `none` unchanged, else the length resolved to px (em/calc
folded against the element's font-size via `_trComp`), a resolved negative clamped to
0 (`calc(10px - 0.5em)` @40px → -10 → `0px`).

> WPT quirk: `block-step-round-invalid.html` actually calls
> `test_invalid_value("block-step-align", …)` (a copy-paste in the test source), so its
> 18 subtests are really the align enum rejecting `up up` / `-1px` / `none` / etc. —
> covered for free once `block-step-align` is a strict enum.

## Results

| file | before | after |
|------|:------:|:-----:|
| block-step-align-valid | 4/4 | 4/4 |
| block-step-align-invalid | 0/13 | 13/13 |
| block-step-align-computed | 0/4 | 4/4 |
| block-step-insert-valid | 3/3 | 3/3 |
| block-step-insert-invalid | 0/12 | 12/12 |
| block-step-insert-computed | 0/3 | 3/3 |
| block-step-round-valid | 3/3 | 3/3 |
| block-step-round-invalid | 0/18 | 18/18 |
| block-step-round-computed | 0/3 | 3/3 |
| block-step-size-valid | 5/6 | 6/6 |
| block-step-size-invalid | 0/5 | 5/5 |
| block-step-size-computed | 0/6 | 6/6 |

**+65.**

**Zero-regression sweep:** qsa 1975, classlist 1420, serialize-values 695/697,
border-spacing-computed 4/4, table-layout-invalid 2/2, baseline-shift-computed 8/8,
order-invalid 3/3, orphans-computed 3/3, ruby-overhang-valid 3/3,
rule-visibility-items-invalid 15/15 — all held.

## Caps / Next

The four `block-step-*` longhands are secured. **Next (#268):** the `block-step`
shorthand — `<'block-step-size'> || <'block-step-insert'> || <'block-step-align'> ||
<'block-step-round'>` (order-independent `||`, serialized `size insert align round`
with each default dropped, all-defaults → `none`). block-step-valid 9/34,
block-step-invalid 0/7. Then (#269) its computed reconstruction (block-step-computed
0/34). grep `_CSSUI_ENUM`/`block-step-size`.
