# Scroll 94 — The Stepped Verdict

> *The calc engine knew how to add, multiply, take a min. It could not round, nor
> step, nor fold a function down to the number it always was. This quest taught it.*

**Realm:** the CSS math-functions family (CSS Values 4 §10) — `round`/`mod`/`rem`,
`sin`/`cos`/`tan`, `asin`/`acos`/`atan`/`atan2`, `exp`/`log`, `hypot`/`pow`/`sqrt`,
`sign`/`abs` — across their `*-computed`, `*-serialize`, and `*-invalid` tests under
`css/css-values/`.
**Status:** ✅ SECURED — **+446** (realm +401, bonus +45). Pure JS, no new Rust.
**Session:** 2026-06-24.

## The gap

The math engine was two cooperating pipelines:
- `_evalMath` — fully *evaluates* a math expression to a JS number. It knew
  min/max/clamp/sign/abs/trig/inverse-trig/pow/sqrt/hypot/exp/log — **but not
  `round`/`mod`/`rem`** (so that whole family was rejected/0% everywhere).
- `_parseCalcTree` → `_simpCalc` → `_serCalcTree`/`_canonMathExpr` — the symbolic
  canonicaliser. `_simpCalc` folded sums/products but **never folded a function
  node** — so `cos(0)` serialized as `"cos(0)"` (not `"calc(1)"`), `abs(1)`→`"abs(1)"`
  (not `"1"`), realm-wide.

Probing (CDP, `getComputedStyle`) pinned down exactly what was winnable now:
- **number-type** subtests use `scale` (and `opacity`), **angle-type** use `rotate` —
  both resolve math in our JS engine. ✅ winnable.
- **length-type** (`margin-left`/`flex-basis`/`width`) and **time-type**
  (`transition-delay`) resolve **no** computed math at all — even `2em` and
  `calc(10px + 5px)` stay verbatim. ❌ a separate deep quest (a computed-length /
  -time resolver) — see Caps.

## The work (pure JS, additive to the calc engine)

1. **`round`/`mod`/`rem` numeric ops** (`_roundOp`/`_modOp`/`_remOp`) — shared by
   both pipelines so they agree byte-for-byte. Full spec edge cases verified against
   `round-mod-rem-computed.html`: `round(B=0)`→NaN, both-infinite→NaN, A-infinite→A;
   B-infinite per-strategy ±0/±∞ table (`up`/`down`/`nearest`/`to-zero`); `mod`
   floored (sign follows B, opposite-sign-∞→NaN), `rem` truncated (sign follows A,
   ∞→A). Wired into `_evalMath` — `round()`'s optional leading strategy keyword is
   peeled before numeric arg-parsing; `mod`/`rem` join the generic 2-arg dispatch.
2. **Numeric function folding** (`_foldMathFn`, called from `_simpCalc`'s `fn`
   branch) — when every argument simplifies to a numeric leaf of a *compatible* unit,
   the function collapses to one leaf: `min`/`max`/`clamp`/`round`/`mod`/`rem`/`abs`
   keep the shared unit; `sign`→<number>; trig→<number>; inverse-trig/`atan2`→`deg`;
   `pow`/`sqrt`/`exp`/`log` require unitless. Mixed units (`min(1em, 2px)`) stay
   symbolic until computed time. This is THE keystone — it fixes the SPECIFIED
   serialization (`calc(1)`) across the whole realm.
3. **Transform argument folding** — `_canonTfArg` ran math args verbatim; now
   `_canonMathExpr(t) || t` so `scale(abs(1))`→`scale(calc(1))`,
   `rotate(calc(45deg + 45deg))`→`rotate(calc(90deg))`.
4. **`opacity` specified canon** (`_canonOpacitySpecified`) — a bare `<percentage>`→
   equivalent unclamped `<number>` (`50%`→`0.5`), bare `<number>` canonicalised, a
   math function folded with `%` kept symbolic (`min(50%, 0%)`→`calc(0%)`). Wired
   into both setter paths.
5. **Non-finite handling** — `_computeOpacity` now lets ±∞/NaN through (NaN→`0`, ±∞
   clamp to [0,1] bounds); `_serCalcNum` serializes a non-finite *dimensioned* value
   as `<keyword> * 1<unit>` (`calc(NaN * 1deg)`, not the invalid `NaNdeg`); `scale`
   validity (`_scaleCalcOk`) and computed (`_scaleComp`) accept non-finite math
   (a dimensionless calc resolving to NaN/∞ is valid; NaN scale factor → `0`).

## Results

| Test | Before → After |
|------|----------------|
| `round-mod-rem-computed` | 0 → **160** (+160) |
| `round-mod-rem-serialize` | 0 → **21** (+21) |
| `sin-cos-tan-serialize` | 144 → **270** (+126) ✅100% |
| `acos-asin-atan-atan2-serialize` | 0 → **52** (+52) |
| `exp-log-serialize` | 8 → **19** (+11) ✅100% |
| `hypot-pow-sqrt-serialize` | 13 → **25** (+12) ✅100% |
| `signs-abs-serialize` | 0 → **16** (+16) ✅100% |
| `signs-abs-computed` | 28 → **31** (+3) |
| **bonus** `minmax-number-serialize` | 20 → **40** (+20) |
| **bonus** `opacity-valid` | 5 → **30** (+25) ✅100% |

**Realm +401, bonus +45 = +446.** Zero regressions (stash-baseline proven on the hot
calc primitive; full sweep below).

## Zero-regression sweep

Stash-baseline (revert diff → rebuild → measure → restore) proved every calc-engine
consumer byte-identical: transform-computed 3/3, scale 32/38/8, rotate 23/23,
offset-path 70/24/65, offset 29/29 + shorthand 18/18, color-computed-relative
1163/1169, alpha-color-computed 32/32, color-valid 17/17, color-valid-color-function
340/340, color-computed 16/16, translate 20/20, calc-serialization 0/1 (held cap),
opacity-computed 30/30, classlist 1420/1420, createElement 147/147.

## Caps / Next

- **The `*-invalid` tests are all still 0%** (round 108, sin-cos-tan 42, acos 63,
  exp-log 48, hypot 49, signs-abs 53 = **363 subtests**). They set malformed math on
  `opacity`/`height`, which we still accept verbatim. This is the clear **next
  quest**: a real math-function grammar validator (per-function arg-count/keyword/type
  checking, `<calc-sum>` well-formedness) wired into the opacity/height/number gates.
- **`*-computed` length-type** (`signs-abs-computed` 202, `round-mod-rem-computed`
  ~83, `hypot-pow-sqrt-computed` 48, `acos-computed` most) need a **computed-length
  resolver** — our engine resolves *no* computed lengths (`2em`/`calc(10px+5px)` stay
  verbatim for `margin-left`/`width`/`flex-basis`). A deep, high-value quest of its
  own (would also light up much of the broader css-values length realm).
- **`*-computed` time-type** (`round-mod-rem` 12) want a transition-delay/time calc
  resolver; **`acos-computed`** also needs `sibling-index()` in `_evalMath` and
  `sign(1em - 1px)` length-resolution in the angle path.
