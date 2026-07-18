# Quest #105 — The Counted Verdict

> *Quest #104's named "next leverage" #1: `sibling-index()` (CSS Values 5
> tree-counting) — the lone `acos-asin-atan-atan2-computed` tail AND a recurring
> tail across the whole computed css-values realm. One small primitive, four
> property paths, three tests to 100%.*

## The gap

Three computed math-function tests carried a shared `sibling-index()` tail:

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-values/acos-asin-atan-atan2-computed.html` | 46/50 | **50/50** |
| `css/css-values/sin-cos-tan-computed.html` | 26/32 | **32/32** |
| `css/css-values/hypot-pow-sqrt-computed.html` | 43/52 | **47/52** |

`sibling-index()` returns the element's 1-based position among its element
siblings; `sibling-count()` the total element-sibling count. They are substituted
at computed-value time (like `env()`), so the `*-computed` tests just need the
engine to read the element's real DOM position and fold the surrounding math.

The failures came in two flavours:

```
# acos / sin-cos-tan — REJECTED at setProperty (got the default instead)
[fail] calc(atan2(1, sibling-index())) should be used-value-equivalent to 45deg
  -> assert_not_equals: ... isn't valid in 'rotate'; got disallowed value "none"
[fail] calc(sin(pi * sibling-index()) should be used-value-equivalent to 0
  -> assert_not_equals: ... isn't valid in 'scale'; got disallowed value "none"

# hypot — ACCEPTED but left symbolic (never folded)
[fail] sqrt(sibling-index()) should be used-value-equivalent to 2
  -> assert_equals: expected "2" but got "sqrt(sibling-index())"
```

The properties span four computed paths: `rotate` (`<angle>`), `scale`
(`<number>`), `z-index` (`<integer>`), `margin-left` (`<length>`).

### Two root causes

**(1) `sibling-index()` had no DOM-backed value.** `_evalMath` is a pure string
evaluator with no element context, so `sibling-index()` → `tfail()` → the value
fell back to symbolic (or, where validity used `_evalMath`, was rejected outright).

**(2) `_mtFn` typed it as `'unknown'`.** The math-type checker's catch-all —
`if (!_MATH_FNS.has(name)) return 'unknown'` — accepted `sibling-index()`
conservatively but gave it the wrong type. `'unknown'` propagates: `atan2(1,
sibling-index())` resolved to `'unknown'` rather than `'angle'`, so `_rotKind`
(which classifies by `_mt` result type since #104) fell back to its literal
heuristic, found no `deg`, and rejected the declaration in `rotate`.

## The fix (pure JS, additive, `bootstrap.js`)

**`_mtFn` — type them concretely as `<number>`** (our type lattice has no
`<integer>`; `<number>` is the correct supertype). Placed before the `_MATH_FNS`
catch-all:

```js
if (name === 'sibling-index' || name === 'sibling-count') return args.length === 0 ? 'number' : null;
```

Now `atan2(1, sibling-index())` → `atan2(number, number)` → `'angle'`, so
`_rotKind` accepts it; `sqrt(sibling-index())` → `'number'`; `1px *
sqrt(sibling-index())` → `'length'` (so `margin-left`'s `_mathReject`/`_mathValid`
gate passes). Any argument (`sibling-index(1)`) → `null` → correctly invalid.

**`_evalMath` — resolve the value.** A zero-arg branch in `parseFactor`, before the
`round`/`clamp` handling:

```js
if (name === 'sibling-index' || name === 'sibling-count') {
  if (!peek() || peek().t !== ')') return tfail();   // these take no arguments
  p++;
  const sv = name === 'sibling-index' ? opts.siblingIndex : opts.siblingCount;
  if (typeof sv === 'number') return [sv, false];
  if (opts.siblingValid) return [1, false];           // grammar-validity probe: any integer
  return tfail();                                      // no DOM context → stay symbolic
}
```

Three modes: a real DOM value (`opts.siblingIndex`/`siblingCount`, threaded by the
computed paths), a `siblingValid` placeholder of `1` for grammar-only probes (scale
validity), or `tfail()` to stay symbolic when neither is supplied.

**`_siblingOpts(el, val)` — read the real DOM position.** Reads the parent's
`element_children` and finds the element's index. A parentless/detached element is
its own sole sibling (index 1, count 1). Gated on `_SIBLING_FN_RE` so the **common**
computed path takes no extra DOM round-trip — it returns `{}` (a no-op spread)
unless the value actually contains a `sibling-*` function:

```js
const _SIBLING_FN_RE = /sibling-(?:index|count)\(/i;
const _siblingOpts = (el, val) => {
  if (!el || !el._nid || (val != null && !_SIBLING_FN_RE.test(String(val)))) return {};
  const parent = el.parentNode;
  if (!parent || !parent._nid) return { siblingIndex: 1, siblingCount: 1 };
  const kids = _domParse('element_children', parent._nid) || [];
  const idx = kids.indexOf(el._nid);
  if (idx < 0) return { siblingIndex: 1, siblingCount: 1 };
  return { siblingIndex: idx + 1, siblingCount: kids.length };
};
```

**Threaded `..._siblingOpts(el, t)` into the four computed callers** —
`_rotSerAngle` (angOpts), `_scaleComp`, `_trComp` (lenOpts), `_computeIntegerValue`
— and added `siblingValid: true` to scale's `_scaleCalcOk` grammar probe.

`rotate`/`scale` already paren-balance via `_isValidIndividualTransform` /
`_canonIndividualTransform`, so the unclosed `calc(sin(pi * sibling-index())` in
`sin-cos-tan` auto-closes before evaluation — no extra work needed.

## Reading the REAL DOM, not a constant

`acos`/`sin-cos-tan` put `#target` as `<body>`'s first element child →
`sibling-index()` = 1 (`atan2(1,1)` = `45deg`). But `hypot`'s `#target` is the 4th
of four sibling `<div>`s → `sibling-index()` = 4 (`sqrt(4)` = `2`, `hypot(3,4)` =
`5`). A CDP probe against a hand-built 4-sibling DOM confirmed the engine reads the
true position: `z-index: sqrt(sibling-index())`→`2`, `rotate: calc(atan2(1,
sibling-index()))`→`14.036243deg` (`atan2(1,4)`), `margin-left`→`2px`. Hardcoding
`1` would have passed acos/sin-cos-tan and silently broken hypot.

## Results

**+14.** acos 46→50, sin-cos-tan 26→32, hypot 43→47.

### Zero regressions (full sweep, stash-free — additive change)

- **css-values computed:** `signs-abs` 167, `round-mod-rem` 227,
  `calc-infinity-nan` 48, `minmax-length` 76, `clamp-length` 24.
- **css-values serialize:** `minmax-length` 24, `clamp-length` 50, `signs-abs` 16.
- **invalid realm** (the `_mtFn` typing risk): `acos…-invalid` 62/1 (the 1 is the
  pre-existing `atan2(…, + …)` leading-sign cap from #95), `signs-abs-invalid` 53,
  `round-mod-rem-invalid` 108, `sin-cos-tan-invalid` 42, `hypot-pow-sqrt-invalid` 49.
- **transforms** (`css/css-transforms/parsing/`): `rotate-parsing-computed` 23,
  `scale-parsing-computed` 38, `translate-parsing-computed` 19.
- **colour:** `color-computed-relative-color` 1121 (the #101 wpt.live content
  change, byte-identical), `color-valid` 17.
- **DOM:** `Element-classlist` 1420, `Document-createElement` 147.

## Caps / Next (ROI)

- **`hypot` `0%`-mixed + `pow` tails** (`hypot-pow-sqrt-computed` 47/52) — the 5
  remaining are `hypot(0% + 3px, 0% + 4px)`→`5px` (mixed `%`+length under hypot,
  which needs the `%`→used-px layout resolution) and `calc(1px * pow(2, sqrt(100)))`
  rejected by `margin-left` validity (a length × `<number>`-power product the type
  checker should accept). The `pow`-length one is a pure validity gap, winnable
  without layout.
- **`%`→used-px against the containing block** — the standing layout cap
  (`minmax-length-percent` 0/50; `calc(60% - 20px)`→`100px`; needs real layout). The
  recurring tail across `minmax-length-computed` (4 fails) and the hypot `0%` rows.
- **`border`→12-longhand expansion** — `border-shorthand` 0/36 + `outline-shorthand`
  0/4 (structural; touches the cascade + `_serializeDeclBlock`).
