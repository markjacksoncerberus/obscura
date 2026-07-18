# Quest #108 — The Signed Zero

**`sign()` of angle/time + negative-zero round-trip + time-path length resolution, +55**
(session 2026-06-26, branch `engine-per-page-threads`)

## The gap

`css/css-values/signs-abs-computed.html` sat at **167/233**. The 66-fail tail was
mostly NON-layout (the `%`→used-px layout cap accounts for only ~5 of them). Three
distinct root causes, all fixable in pure JS:

`test_math_used(expr, expected, {type})` (from `css/support/numeric-testcommon.js`)
sets `#target.style[prop] = expr` and compares `getComputedStyle(#target)[prop]` to
that of `expected`. The property is chosen by `type`: `integer`→`z-index`
(`position:absolute`), `time`→`transition-delay`, `length`→`margin-left`. So these
are COMPUTED-value tests.

### Bug A — `sign(<angle>)` / `sign(<time>)` serialized `calc(1)` instead of `1`

```
sign(1deg)  -> expected "1"  got "calc(1)"
sign(1s)    -> expected "1"  got "calc(1)"
calc(sign(0deg)) -> expected "0" got "calc(0)"
```

`sign()` of any value yields a `<number>`, so for `z-index` the computed value is the
bare integer. `_computeIntegerValue` resolved its argument via
`_evalMath(s, 0, { lengths:true, … })` — only **lengths**. For `sign(1deg)` the angle
unit `deg` was unresolvable (no `opts.angle`), so `_evalMath` returned `null` and the
caller fell back to the symbolic serializer `_canonMathExpr(s)` → `calc(1)`.

### Bug B — negative zero destroyed at SPECIFIED-serialization time

```
clamp(-1, calc( 1 / sign(sign(-0px))), 1) -> expected "-1" got "1"
```

`test_zero` checks the sign of zero by dividing into it: `1 / sign(-0)` = −∞ (clamped
to −1), `1 / sign(+0)` = +∞ (clamped to +1). CDP probe of the SPECIFIED value:

```
el.style.zIndex = 'calc(sign(-0px))'  →  el.style.zIndex === 'calc(sign(0px))'
```

The `-0` was already gone before computed eval ran. Root cause: `_canonStandardValue`
(the light token-level canon applied to EVERY standard-property set value) calls
`_canonNumberLiteral` on each numeric token, which strips `-0`→`0` per the CSSOM
"serialize a `<number>`" rule. That rule is correct for a *bare* number, but inside a
math function `-0` is observably significant (CSS Values 4 keeps the sign of zero).

### Bug C — time path didn't resolve lengths inside `sign()`

```
calc(5s + 15s * sign(40px - 2em)) -> expected "5s"  got "calc(5s + (15s * sign(-2em + 40px)))"
```

`_computeTimeValue` evaluated with `{ time:true, nonFinite:true }` — no `lengths`/
`emPx`, so the length sub-expression `40px - 2em` inside `sign()` stayed symbolic.

## The fix (pure JS, `bootstrap.js`)

**A.** `_computeIntegerValue`: add `angle:true, time:true` to the `_evalMath` opts. The
only way an angle/time unit appears in a *valid* integer value is inside sign/abs (which
collapse it to a `<number>`); invalid mixed-type values are rejected at set time, so this
can't over-accept.

**B.** Preserve the sign of zero inside math functions:
- `_canonNumberLiteral(numStr, keepNegZero)` — skip the `-0`→`0` strip when `keepNegZero`.
- `_canonStandardValue` — track open-paren depth; pass `depth > 0` as `keepNegZero` so
  `-0` inside `calc(…)` round-trips while a bare top-level `-0` still collapses to `0`.
- `_serCalcNum` — emit `-0` for a negative-zero leaf (`Object.is(v, -0)`), so the calc
  serializer round-trips it too.

The computed re-evaluation already handled `-0` correctly (`_parseCalcTree`'s unary
`negate` yields `-0`; `Math.sign(-0)` = `-0`; `1 / -0` = −∞), it was only the specified
canon that lost it.

**C.** `_computeTimeValue(v, el)` — thread `el` through and add
`lengths:true, emPx:_emPxOf(el), vw/vh, _siblingOpts`. With `time` also set, `_evalMath`
resolves time units first and falls through to length only for non-time units, so plain
`<time>` values stay byte-identical.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-values/signs-abs-computed.html` | 167/233 | **222/233** |

Breakdown: Bug A +30, Bug B +22, Bug C +3.

## Zero-regression sweep (all held)

The Bug B change touches every standard-property set, so the sweep was broad:

- **Serialize:** signs-abs-serialize 16, clamp-length-serialize 50, minmax-length-serialize
  24, minmax-time-serialize 22, calc-dimension-serialization-order 44, hypot-pow-sqrt-serialize
  25, calc-infinity-nan-serialize length/number/time/angle 41/31/29/30, cssom/serialize-values 696.
- **Invalid (over-acceptance guard):** signs-abs-invalid 53, round-mod-rem-invalid 108,
  sin-cos-tan-invalid 42, hypot-pow-sqrt-invalid 49.
- **Transforms:** rotate/scale/translate-parsing-computed 23/38/19.
- **Colour:** color-valid 17, color-computed-relative-color 1121.
- **Other math-computed:** round-mod-rem-computed 227, minmax-length-computed 76,
  clamp-length-computed 24, sin-cos-tan-computed 32, acos-asin-atan-atan2-computed 50,
  hypot-pow-sqrt-computed 48, calc-infinity-nan-computed 48, calc-nesting 7/8.
- **DOM/cascade:** variable-substitution-shorthands 51, Element-classlist 1420,
  Document-createElement 147, ParentNode-querySelector-All 1975.

## Caps / Next

The remaining 11 `signs-abs-computed` fails:
- **5 `%`→used-px** (the standing layout cap): `abs(10%)`→`10px`, `abs(10px+10%)`→`20px`,
  `calc(10px+abs(10%))`→`20px`, `calc((1em+1px)*(sign(1em-10px-10%)+1))`→`21px`. Needs real
  layout (resolve `%` against the containing block).
- **3 `fr`-unit** (type:flex → `grid-template-rows`): `calc(3fr + 1fr * sign(38px-2em))`→`2fr`.
  A `fr`-unit computed path that resolves the length inside sign — niche.
- **3 `dpi`** (type:resolution → `image-resolution`): `calc(100dpi + 20dpi * sign(38px-2em))`
  → `80dpi`. A resolution computed path — niche.

`round-mod-rem-computed` (227/243) — all 16 fails are `%`/`0%`-mixed (`mod(0% + 3px, 2px)`,
`round(10%, 5px)`). A narrow sub-win is possible: `0%` is 0px **regardless of the containing
block**, so `0% + 3px` → `3px` could fold without layout (~6 of the 16) — but it touches the
length-resolution layout boundary and should be its own scoped quest. The `10%` rows need real
layout.

The widest remaining tail across all these realms is the same standing cap: **`%`→used-px
resolution against the containing block (real layout).**
