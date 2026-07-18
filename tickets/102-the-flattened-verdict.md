# Scroll 102 — The Flattened Verdict

> *Quest #101's "next leverage" #1, and the last fail standing in
> `minmax-length-serialize`: a nested product `2 * (0.2 * min(1em, 1px))` should
> simplify to `0.4 * min(1em, 1px)` at specified time, but our `_simpCalc` left
> the coefficient `2` stranded one level above the `0.2`, so it serialized
> verbatim as `2 * (0.2 * min(1em, 1px))`. This scroll teaches the product
> simplifier to **flatten** a nested product into its parent so the coefficients
> combine.*

## The gap — one stranded coefficient

```
test_serialization(
	'calc(2 * (.2 * min(1em, 1px)) + 1px)',   // input
	'calc(1px + (0.4 * min(1em, 1px)))',       // SPECIFIED — we failed this
	'1.4px');                                   // COMPUTED — already passing
```

| test | before | after | gap |
|------|:------:|:-----:|-----|
| `minmax-length-serialize` | 23/24 | **24/24** | the single nested-product row |

The COMPUTED value (`1.4px`) already resolved correctly — `_evalMath` multiplies
numerically, so `2 * 0.2 * min(16px,1px)` = `2 * 0.2 * 1px` = `0.4px`, `+ 1px`
= `1.4px`. Only the **specified** serializer left the coefficients un-combined.

### Why the coefficient was stranded

`_simpCalc`'s product branch folds all numeric leaves at *one* level into a single
coefficient, then keeps the non-numeric factors (`rest`) symbolic. For
`2 * (0.2 * min(1em, 1px))` the parser produces an outer product whose factors are
`[num 2, prod(0.2 * min)]`. When `_simpCalc` recurses, the inner product
`0.2 * min(1em, 1px)` can't collapse to a single numeric leaf — `min(1em, 1px)`
stays symbolic — so it survives as a `prod` node carrying its own coefficient
`0.2`. Back at the outer level, that surviving `prod` lands in `rest` (it isn't a
`num`), so the outer `2` and the inner `0.2` never meet:

```
out = [ {* num 2}, {* prod(0.2 * min)} ]   →   2 * (0.2 * min(1em, 1px))
```

## The fix (pure JS, additive, `bootstrap.js`)

Before the coefficient-folding loop, **flatten** any factor that is itself a
product, inlining its factors at this level so their numeric leaves join the
parent's fold. A child product only survives simplification when it still holds a
symbol or function (a fully-numeric one already folded to a single leaf), so its
coefficient is always exactly the stranded one we want to recover.

```js
let facs = node.facs.map((f) => ({ op: f.op, node: _simpCalc(f.node, sort) }));
if (sort && facs.some((f) => f.node.k === 'prod')) {
  const flat = [];
  for (const f of facs) {
    if (f.node.k === 'prod') {
      for (const inner of f.node.facs)
        flat.push({ op: f.op === '/' ? (inner.op === '*' ? '/' : '*') : inner.op, node: inner.node });
    } else flat.push(f);
  }
  facs = flat;
}
```

Inner factor ops carry over unchanged under multiplication (`x * (a * b)` =
`x * a * b`, `x * (a / b)` = `x * a / b`); under division they **invert**
(`x / (a * b)` = `x / a / b`, `x / (a / b)` = `x / a * b`). After flattening,
`[num 2, num 0.2, fn min]` folds the two numerics into one coefficient `0.4`, and
the surviving `rest` is just `min(1em, 1px)`:

```
0.4 * min(1em, 1px)
```

The sum-ordering (#100) then places `1px` first → `calc(1px + (0.4 * min(1em, 1px)))`. ✓

### Gated behind `sort`

The flatten only runs on the **length/time canon path** (`sort` true, threaded
from `opts.canonLen || opts.canonTime`). The colour channel calls `_simpCalc` with
`sort` false and is left byte-for-byte identical — same guard the #100 sum-ordering
uses. Flattening nested products is a spec-blessed calc simplification (CSS Values
4 §calc-simplification), but scoping it tight keeps the zero-regression promise
trivially provable.

## Results

| test | before | after | Δ |
|------|:------:|:-----:|:-:|
| `minmax-length-serialize` | 23/24 | **24/24** | +1 |

**+1 subtest** — closes the realm at 100%. No new Rust.

## Zero-regression sweep

The flatten lives in the **shared** `_simpCalc`, so the sweep covered every calc
serialize/compute consumer and the colour anchors. All held:

- `color-valid-relative-color` 1146/1147; `color-computed-relative-color`
  **1121/1169** (the wpt.live test-content change noted in #101 — NOT a regression;
  the flatten is gated off for colour anyway).
- `calc-infinity-nan-serialize` length/number/time/angle 41/31/29/30;
  `calc-infinity-nan-computed` 48/48.
- `signs-abs-serialize`/`-computed` 16/164; `round-mod-rem-serialize`/`-computed`
  21/227; `hypot-pow-sqrt-serialize`/`-computed` 25/43.
- `minmax-number`/`-angle-serialize` 40/38; `minmax-length-computed` 76;
  `minmax-time-serialize` 22; `calc-nesting` 6; `calc-dimension-serialization-order`
  44; `clamp-length-serialize` 50; `clamp-length-computed` 24; `clamp-integer-computed` 6.
- `scale`/`rotate`/`translate-parsing-computed` 38/23/19;
  `Element-classlist` 1420; `Document-createElement` 147.

## ⚠️ wpt.live path reminder (unchanged from #101)

`css/css-values/serialize-values.html` is **removed**; the per-type
`calc-infinity-nan-serialize-{length,number,time,angle}.html` files are SEPARATE
(there is no combined `calc-infinity-nan-serialize.html` — a guessed path 404s to
a 42-byte body = a false could-not-run). Colour relative-color tests live at
`css/css-color/parsing/`; transform `*-parsing-computed` at
`css/css-transforms/parsing/`.

## Caps / Next (ROI order)

1. **calc-in-shorthand** — `calc(calc(10px)) solid pink` → `calc(10px) solid pink`
   (the standing `calc-nesting` 6/8 cap): border/shorthand values bypass
   `_canonLengthTimeMath`, so their embedded calc() never gets canonicalized. Needs
   the shorthand parser to route each length component through the math canon.
2. **`%` → used-px against the containing block** — the standing layout cap
   (`calc(60% - 20px)` → `100px`, the margin/padding/block-size `%` rows,
   `minmax-length-percent` 0/50). Needs a real used value (layout).
3. **`signs-abs-computed` / `hypot-pow-sqrt-computed` em-relative tails** (164/233,
   43/52): the computed evaluator doesn't resolve every font-relative `sign()`/
   `hypot()` argument. Worth a baseline before committing.
