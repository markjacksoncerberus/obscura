# Scroll 96 — The Resolved Verdict

> *The standing deep quest of css-values, named since Quest #94: a **computed-length
> resolver**. getComputedStyle is meant to return the **resolved** value — math
> folded, relative & absolute units collapsed to canonical units. Our engine resolved
> NONE of it: every length/integer/time property echoed its specified value verbatim,
> capping the entire `*-computed` half of the math-functions family. This scroll teaches
> getComputedStyle to resolve.*

## The gap

`test_math_used` / `test_math_computed` (css/support/numeric-testcommon.js) and
`test_computed_value` (css/support/computed-testcommon.js) **set both a test value and an
expected value, read each back through `getComputedStyle`, and assert they serialize
identically.** They never hard-code "what the engine should print" — they only require
the two sides to *agree*. So the win is not byte-exact spec serialization; it is
**resolving both sides consistently**:

- `round(10em,6em)` and `12em` must BOTH collapse to `240px` (em→px, math folded).
- `abs(10px)` and `10px` → both `10px`. `sign(1px)` and `1` → both `1`.
- `min(1vh)` and `1vh` → both the same px. `round(10s,6s)` and `12s` → both `12s`.

The property each type routes through (per numeric-testcommon.js):

| type | used → prop | computed → prop |
|------|-------------|-----------------|
| number | `scale` | `scale` |
| integer | `z-index` (+position:absolute) | `z-index` |
| length | `margin-left` | `flex-basis` |
| angle | `rotate` | `rotate` |
| time | `transition-delay` | `transition-delay` |

`number`/`angle` already folded (Quest #94 wired `scale`/`rotate` through the calc
engine). **`length`, `integer`, and `time` fell straight through `_normComputed` →
returned verbatim** → the whole `*-computed` length/integer/time tail was red.

## The work (pure JS, additive — `crates/obscura-js/js/bootstrap.js`)

One generic resolver in `_normComputed`, reusing the existing calc engine:

1. **`_LENGTH_COMPUTED_PROPS`** (margin-*/padding-*/top/right/bottom/left/width/height/
   min-*/max-*/flex-basis/text-indent/outline-offset/letter-spacing/word-spacing) →
   **`_trComp(v, el, true, vp)`** — the very same `<length-percentage>` component
   resolver translate() already uses. It folds math functions and resolves em/rem/ex/ch
   + the absolute units to px; `%` is kept symbolic (a used `%` length needs layout we
   don't do); keywords (`auto`/`none`/`normal`/`min-content`) pass through untouched.
2. **`_INTEGER_COMPUTED_PROPS`** (`z-index`, `order`) → `_computeIntegerValue` folds the
   expression (lengths enabled so `sign(1px)`/`sign(1em)`/`sign(1vw)` resolve their
   argument to the `<number>` they yield) and rounds to nearest integer; `auto` passes.
3. **`_TIME_COMPUTED_PROPS`** (transition/animation delay+duration) → `_computeTimeValue`
   folds to canonical **seconds** via a new `_evalMath` `opts.time` mode (`_TIME_S = {s,
   ms}`). Mixed units resolve consistently (`round(10s,6000ms)` and `12s` → both `12s`).
4. **Viewport units**: a new gated `opts.vw`/`opts.vh` in `_evalMath` (px per 1% of the
   viewport, from `innerWidth`/`innerHeight`) resolves vw/vh/vmin/vmax (+ the
   small/large/dynamic `sv*`/`lv*`/`dv*` and logical `vi`/`vb` variants). Gated on the
   flag and threaded through `_trComp`'s new optional `vp` param **only for the length
   path** — translate()'s `_trComp` call omits it, so translate stays byte-identical.

## Results (before → after, this session)

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| signs-abs-computed | 31/233 | **163/233** | **+132** |
| round-mod-rem-computed | 160/243 | **225/243** | **+65** |
| hypot-pow-sqrt-computed | 4/52 | **43/52** | **+39** |
| minmax-length-computed | 0/80 | **76/80** | **+76** |
| minmax-integer-computed | 0/10 | **10/10** | **+10** |
| clamp-length-computed | 0/24 | **17/24** | **+17** |
| clamp-integer-computed | 0/6 | **1/6** | **+1** |
| getComputedStyle-calc-mixed-units-002 | 0/8 | **2/8** | **+2** |
| getComputedStyle-calc-mixed-units-003 | 0/7 | **2/7** | **+2** |
| flex-basis-computed | 8/12 | **11/12** | **+3** |
| word-spacing-computed | 4/9 | **7/9** | **+3** |
| letter-spacing-computed | 5/9 | **7/9** | **+2** |
| padding-computed | 6/13 | **7/13** | **+1** |
| **TOTAL** | | | **+353** |

**Zero regressions** (stash-baseline proven): scale-parsing-computed 38, -valid 32,
rotate-parsing-computed 23, translate-parsing-computed 19, -valid 20, transform-computed
3, -valid 42, perspective-origin-computed 21, transform-origin-computed 23,
background-position-computed 32, opacity-computed/-valid 30/30, offset-distance-computed
6, minmax-number-computed 14, sin-cos-tan-computed 26, acos-computed 11, signs-abs-serialize
16, round-mod-rem-serialize 21, sin-cos-tan-serialize 270, translate-getComputedStyle 1,
margin-computed 6; DOM ritual classlist 1420, createElement 147 all held.

## Caps / Next (honest)

- **`%` used-length resolution** — the biggest remaining tail. `abs(10%)`→`10px`,
  `margin 30%`→`60px`, minmax-length-percent (0/50), and the `%` rows of mixed-units all
  need the **containing-block width** (real layout / used value). We resolve no layout.
- **`calc-infinity-nan-computed` (0/48)** — width-specific **range clamping**: `calc(NaN
  * 1px)`→`0px`, `calc(infinity * 1px)`→a finite large px. Needs a per-property
  `[min,max]` range + NaN→0 / ∞→clamp pass; distinct from unit folding. High value.
- **Property registration gap** — `max-width`/`min-width`/`max-height`/`min-height` and
  the **logical** inset/margin/padding (`inset-block-start`, …) are NOT in `_GCS_DEFAULTS`,
  so `test_computed_value`'s `property in getComputedStyle` + `CSS.supports` pre-asserts
  fail before any value check (max-width-computed 0/12, min-width 0/11, inset-computed
  0/20). They're already in `_LENGTH_COMPUTED_PROPS` — **registering them in
  `_GCS_DEFAULTS` would light them up immediately under this resolver.** Cheap, high-ROI
  next move.
- **`clamp(none, …)`** — `none` as a ±∞ sentinel in clamp (clamp-integer 5 remaining).
- **`lh` unit** (`8lh` in mixed-units) — needs line-height resolution in the length path.
- **minmax 4** — unbalanced-paren `calc(min(1em, 21px) * 2` (auto-close in the length
  setter). **acos-computed** — `sibling-index()` + `sign(1em-1px)` in the angle path
  (unchanged here; a Quest #94 cap).
