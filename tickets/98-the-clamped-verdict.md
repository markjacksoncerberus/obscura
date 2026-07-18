# Scroll 98 — The Clamped Verdict

> *Quest #96 taught `getComputedStyle` to **resolve** math; #95 taught it to **reject**
> malformed math. But one corner stayed: a math expression whose result is
> **non-finite** — `calc(infinity * 1px)`, `calc(NaN * 1s)`, `calc(-infinity * 10)`.
> Our calc engine already computed these (it just held `NaN`/`±∞` numerically); the
> computed-value path then dropped the result (`_evalMath` returns `null` for a
> non-finite result unless `nonFinite` is set) and serialized the value verbatim. This
> scroll teaches the computed path to **clamp** at the boundary, per CSS Values 4
> §calc-type-checking.*

## The gap — `css/css-values/calc-infinity-nan-computed.html` 0/48

The harness sets a value AND reads it back through `getComputedStyle`:

```js
test_computed_value("width", "calc(NaN * 1px)", "0px");                       // NaN → 0
testComputedValueGreaterOrLowerThan("width", "calc(infinity * 1px)", 1e6);    // +∞ → big finite
testComputedValueGreaterOrLowerThan("margin-left", "calc(-infinity * 1px)", -1e6); // −∞ → big negative
testTransformValuesCloseTo("rotate(calc(infinity * 1deg))", 0.0001, "rotate(0deg)"); // ∞ angle → identity
testComputedValueGreaterOrLowerThan("scale", "calc(infinity)", 1e6);         // ∞ number → big finite
```

The spec rule (CSS Values 4 §calc-type-checking, "NaN and infinity"): a calculation that
produces a non-finite value is **still valid**, but at used/computed time it is clamped —
**NaN → 0**, **+∞ → the largest finite value the implementation represents**, **−∞ → the
most negative**. (`min`/`max`/`clamp` propagate NaN, so `min(NaN·1px, ∞·1px)` → NaN → 0;
`∞·1px − ∞·1%` → ∞−∞ = NaN → 0.)

Our before-state, all 48 failing:

| input | we produced | wanted |
|-------|-------------|--------|
| `calc(NaN * 1px)` (width) | `calc(NaN * 1px)` (verbatim) | `0px` |
| `calc(infinity * 1px)` | `calc(infinity * 1px)` → parseFloat `NaN` | finite `≥ 1e6` |
| `rotate(calc(infinity * 1deg))` | matrix poisoned to `NaN` | identity (`rotate(0deg)`) |
| `calc(infinity * 1s)` (animation-duration) | property not even registered | finite `≥ 1e6` |
| `calc(infinity)` (scale) | `calc(infinity)` (kept symbolic) | finite `≥ 1e6` |

## The fix (pure JS, additive, `bootstrap.js`)

One shared clamp helper, threaded into each computed numeric family:

```js
const _CALC_CLAMP = 1e30;   // finite, far above any real layout magnitude
const _nfClamp = (v) => Number.isNaN(v) ? 0 : v === Infinity ? _CALC_CLAMP : v === -Infinity ? -_CALC_CLAMP : v;
```

1. **Length** (`_trComp`, computed): added `nonFinite: true` to `lenOpts` (it was
   `computed`-gated already, so finite behaviour is byte-identical) and wrapped each
   computed eval in `_serNumber(_nfClamp(v)) + 'px'`. For the **mixed-`%`** branch a
   finite result must still stay symbolic (`calc(50% + 10px)`), so we **probe** the
   whole expression with a positive `%`-base (`_evalMath(t, 1, …)` — a 0 base would turn
   `∞·1%` into `∞·0 = NaN`); only a non-finite probe collapses to a clamped `px`.
2. **Time** (`_computeTimeValue`): `nonFinite: true` + `_nfClamp`, and `_balanceParens`
   on the eval input so the tokenizer's EOF auto-close is honoured
   (`calc(max(∞·1s, 10s)` — one `)` short).
3. **Number / scale** (`_scaleComp`, computed): a non-finite scale factor now clamps via
   `_nfClamp` (`NaN → 0`, `±∞ → ±1e30`) instead of keeping its `calc(infinity)` form.
4. **Angle / rotate** (`_tfDeg`): a non-finite rotation angle → `0deg` so the built
   matrix stays finite and `rotate(calc(∞·1deg))` serializes as the identity matrix.
5. **Registration**: added the `animation-*` longhands (`animation-duration`,
   `animation-delay`, name, timing-function, iteration-count, direction, fill-mode,
   play-state) to `_GCS_DEFAULTS` — `animation-duration` was failing the harness's
   `property in getComputedStyle` gate outright (`transition-*` were already registered).

## Result

`calc-infinity-nan-computed.html` **0/48 → 48/48 (+48)**. Zero regressions — held the
entire #96/#97 ledger: signs-abs-computed 163, round-mod-rem-computed 225, minmax-length
76, minmax-integer 10, clamp-length 17, clamp-integer 1, minmax-number 14, hypot-computed
43, scale/rotate/translate-parsing-computed 38/23/19,
transform-and-individual-transform-computed-style 1, margin-computed 6, padding-computed
8, flex-basis 11, letter/word-spacing 7/7, classlist 1420, createElement 147.

## Caps / Next

- **`calc-infinity-nan-serialize-length` 0/41 and `-serialize-time` 0/29** — the SPECIFIED
  serialization siblings. These need the math-function specified serializer
  (`_canonMathExpr`/`_serCalcTree`) to (a) **reorder operands** to canonical form
  (`calc(1px * NaN)` → `calc(NaN * 1px)` — a `<number>·<dimension>` product serializes
  number-first) and (b) emit `infinity`/`-infinity`/`NaN` keywords inside `calc()`. A
  self-contained next quest, all in the specified path (untouched here). `serialize-number`
  31/31 and `serialize-angle` 30/30 already pass.
- The **`%`→used-px against the containing block** family (margin/padding/block-size `%`
  rows, minmax-length-percent) remains the deep layout-bound cap named since #97.
- `clamp-length` 17/24, `clamp-integer` 1/6 — the `clamp(none, …)` ±∞ sentinel form, a
  #94-era leftover, still open.
