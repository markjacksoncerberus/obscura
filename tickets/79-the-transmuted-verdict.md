# Quest #79 — The Transmuted Verdict

> **Realm:** `css/css-color/parsing/color-computed-color-mix-function` +
> `css/css-color/parsing/color-computed-relative-color` — the COMPUTED value of
> `color-mix()` and of relative colour syntax (`rgb(from …)` / `lab(from …)` /
> `color(from …)`).
>
> **Status:** ✅ SECURED — **+2069** (color-mix **0→919/948**, relative
> **0→1150/1169**). The single biggest standing prize of the whole CSS-colour
> frontier, named as "next leverage (1)" by every quest since #75.

## The gap

The specified-value side of `color-mix()` (#77) and relative colour (#78) was pure
syntax canon — no maths. The COMPUTED side is the opposite: it needs a real
cross-space colour engine. Both `color-computed-color-mix-function` (0/948) and
`color-computed-relative-color` (0/1169) sat at **0**, left as a documented cap
across #75–#78 because both need the *same* missing primitive.

The computed value of these functions is the resolved colour, serialized in the
interpolation/function colour space's canonical form:
- `in hsl` / `in hwb` / `in srgb` and relative `rgb()`/`hsl()`/`hwb()` → `color(srgb …)`
- `in lab`/`lch`/`oklab`/`oklch` and relative `lab()`/`lch()`/`oklab()`/`oklch()` →
  `lab(…)`/`lch(…)`/`oklab(…)`/`oklch(…)`
- relative `color(<space> …)` → `color(<space> …)` (the same space)

(Note the asymmetry vs a *plain* `hsl()`, which computes to `rgb()`: a colour
produced by relative/mix syntax serializes in the modern `color()`/function form.)

The WPT comparator (`css/support/color-testcommon.js`) is **fuzzy** — it strips all
digits/dots and compares the non-numeric skeleton exactly, then the numbers with
ε≈0.01–0.02. So the engine must emit the right output FUNCTION/SPACE + channel
count + `/` for alpha; ~6 significant figures on the numbers is ample. **But** the
harness also does an exact `assert_equals` round-trip stability check, so the
output must re-serialize to itself byte-for-byte.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

A self-contained CSS Color 4 cross-space engine, hub = **XYZ-D65**:

- **Conversions** (published reference matrices, XYZ→RGB by inversion via `_inv3`):
  sRGB / srgb-linear / display-p3(+linear) / a98-rgb / rec2020 / prophoto-rgb
  (D50) ↔ linear-light ↔ XYZ; XYZ-D65 ↔ XYZ-D50 (Bradford); Lab/LCH ↔ XYZ-D50;
  OKLab/OKLCH ↔ XYZ-D65 (cube-rooted LMS); HSL/HWB ↔ sRGB. `_toXYZ`/`_fromXYZ`
  dispatch by space; `_csConvert` bridges any two.
- **Parse** `_csParse` → `{space, coords, alpha, none[4]}` (named/hex/legacy via
  `_computeColor`; modern functions parse channels in place; `none` tracked).
- **`_colorMixStruct`** — resolve both operands (recursively, incl. nested
  color-mix / relative / currentcolor), convert into the mix space, apply the
  **N-ary percentage rule** (omitted % split the remaining equally; alpha
  multiplier `min(1, sum/100)` applies only when the sum is under 100%; both-0%
  → equal weights, alpha 0), then **premultiplied-alpha interpolation** (a zero
  total alpha collapses channels to 0; hue is never premultiplied and follows the
  §12.4 arc fixup for shorter/longer/increasing/decreasing). The binary case keeps
  the full hue-arc + per-channel `none`-carry machinery; 1-or-N-ary uses straight
  weighted premultiplied interpolation.
- **`_relativeStruct`** — resolve the origin into the function's space, expose its
  channels as keyword values (rgb 0–255, hsl/hwb 0–100 + deg, lab/lch/oklab/oklch
  in their units, color() in [0,1]), substitute keywords (`_relSubst`, paren-wrapped
  to preserve calc precedence) into each channel expression, evaluate, assemble.
- **`_csSerialize`** — hsl/hwb resolve to sRGB → `color(srgb …)`; the RGB + xyz
  spaces → `color(<space> …)`; lab/lch/oklab/oklch keep their function; hue at 6
  sig-figs (round-trip-stable); L/chroma clamped per `_MODERN_LAB_FNS`; `none`
  channels kept; alpha ≥ 1 dropped.

Wired into `_normComputed`'s colour branch (after `_computeModernColor`) and into
`_isValidColor` (`CSS.supports`) — the latter MUST precede the legacy rgb/hsl
branch, since `rgb(from …)`/`hsl(from …)` share those function names.

### Powerless-hue subtlety (the key correctness insight)

A hue is "missing" (carried from the other operand) only when it **emerges from a
conversion** into a polar space with ~0 chroma — `lab(50 0 0)` mixed in lch → no
hue. A **natively-specified** polar colour keeps its explicit hue even at C=0:
`lch(100 0 20deg)` interpolates its 20°. So the powerless rule lives in
`_csConvert` (which only runs on an actual space change), NOT as a blanket pass.
Thresholds sit above the ~1e-5 chroma the XYZ round-trip leaves on a true grey.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `color-computed-color-mix-function` | 0/948 | **919/948** |
| `color-computed-relative-color` | 0/1169 | **1150/1169** |

**Zero regressions** (full sweep): color-valid 17, color-computed 16,
color-valid-color-mix **674/677**, color-valid-relative-color **1127/1147**,
color-valid-lab 116, color-computed-lab 112, color-computed-rgb 95,
color-computed-color-function 466/468, color-valid-hwb 28,
gradient-interpolation-method-valid 1398, image-function-valid 13,
Element-getElementsByTagName 19, Document-createElement 147; `cargo test -p
obscura-dom --lib` 40/40. (`serialize-values` + `color-function-valid` came back
wpt.live HTTP 404 `bodyLen=42` — serving flux, NOT regressions; both provably
unaffected — serialize-values sets only fixed legacy colours that don't match the
color-mix/`from` gates, and the specified modern-colour path is untouched, proven
by color-computed-color-function holding 466.)

## Honest caps (the ~48 residual)

1. **hsl/hwb components carrying `none` in color-mix** (~28). The CSSOM serialized
   specified value of `hsl(none none none)` is `rgb(0, 0, 0)` — the valid test
   *confirms* this (`color-valid-color-mix` expects exactly that). Obscura stores
   the lossy serialized string, so `none` is gone before computed time. Real
   browsers compute from the pre-serialization parse that retains `none`; matching
   both would require storing structured/original values, not serialized strings —
   an architectural change, out of scope. (lab/lch/oklab/oklch/color() components
   are unaffected — their `none`-preserving serialization round-trips, so those
   none cases PASS.)
2. **`calc()` with trig / `pi` / `pow`** in relative channels (~13) — `sin`/`asin`/
   `clamp`-in-trig/`pi`/`pow`. Needs `_evalMath` extended with the CSS trig/exponent
   functions + constants (a shared-hot-path change → its own scoped quest).
3. **`light-dark()` wrapping relative/mix** (2) — needs `light-dark()` computed
   resolution.
4. **Out-of-gamut / double-Bradford round-trips through hsl** (~4) at ε=0.0001 —
   hsl can't represent out-of-gamut colours losslessly; a precision edge.

## Next leverage

1. **`_evalMath` trig/exponent extension** — `sin`/`cos`/`tan`/`asin`/`acos`/`atan`/
   `atan2`/`sqrt`/`pow`/`exp`/`log`/`hypot` + `pi`/`e` constants. Unlocks the ~13
   relative-colour trig cases AND is foundational for any future calc-heavy realm;
   additive (new function names) so lower-risk than touching calc *serialization*,
   but still the serialize-values hot path → scope tight + sweep hard.
2. **`alpha(from …)`** (0/32) — relative-style standalone alpha.
3. **`light-dark()` computed resolution** — picks one branch at computed time.
4. Fresh realm (`fetch/`, `html/dom/` reflection).
