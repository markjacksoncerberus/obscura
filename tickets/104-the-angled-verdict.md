# Quest #104 — The Angled Verdict

> *Quest #103's "next leverage" #3 (the computed inverse-trig tail): the `rotate`
> property rejected angle-valued math functions that carry no literal angle unit —
> `acos(1)`, `atan2(0,0)`, `calc(asin(sin(pi/2)))`, `atan2(1px,-1px)` — computing
> `none` (the default) instead of accepting them as `<angle>`s.*

## The gap

`acos-asin-atan-atan2-computed.html` sat at **11/50**. Almost every failure was the
same shape:

```
[fail] acos(1) should be used-value-equivalent to 0deg
  -> assert_not_equals: acos(1) isn't valid in 'rotate'; got the default value
     instead. got disallowed value "none"
```

The `rotate` property is `none | <angle> | [ x | y | z | <number>{3} ] && <angle>`.
The test sets `rotate: acos(1)` and expects it to compute to the same used value as
`rotate: 0deg`. The inverse trig functions (`acos`/`asin`/`atan` from a `<number>`,
`atan2` from two same-typed operands) all yield an `<angle>` — but our engine
classified them as `<number>`s and rejected the whole declaration, so
getComputedStyle returned the initial `none`.

### Root cause — `_rotKind` classified by text, not by type

`_rotKind` (the per-token classifier inside `_rotParse`) decided whether a math
function was an `<angle>` by a **literal-text heuristic**:

```js
if (_FILTER_MATH_RE.test(t)) return /\d*\.?\d+\s*(?:deg|grad|rad|turn)\b/i.test(t) ? 'angle' : 'num';
```

So `acos(1)` (no `deg` in the text) → `num` → pushed into the axis-`<number>` slot →
no `<angle>` present → `_rotParse` returns `null` → invalid → `none`. Conversely a
*number*-valued `sin(45deg)` (which textually *does* contain `deg`) would have been
mis-accepted as an angle. The heuristic is simply the wrong question: an angle's
angle-ness is its **result type**, not its spelling.

A second, narrower gap: even once classified, `_rotSerAngle` evaluated the angle
with only `{ angle: true }`, so an angle-typed math fn whose *arguments* are
`<length>`/`<time>`/viewport units (`atan2(1px,-1px)`, `atan2(1s,-1s)`,
`atan2(1vh,-1vh)`) failed to resolve and produced `NaN`.

## The fix (pure JS, additive, `bootstrap.js`)

**1. Type-aware classification in `_rotKind`.** A math token now routes through the
existing calc-tree type machinery (`_parseCalcTree` → `_mt`, the same lattice used
by `_mathValid`), with `pctType = null` (rotate accepts no `%`):

```js
if (_FILTER_MATH_RE.test(t)) {
  const root = _parseCalcTree(t);
  if (root) { const ty = _mt(root, null); if (ty === 'angle') return 'angle'; if (ty === 'number') return 'num'; }
  return /\d*\.?\d+\s*(?:deg|grad|rad|turn)\b/i.test(t) ? 'angle' : 'num';   // unknown (var()/sibling-index()) → heuristic
}
```

`_mt`/`_mtFn` already encode the spec result types (`asin`/`acos`/`atan` :
`<number>`→`<angle>`; `atan2` : two same-typed →`<angle>`; `sin`/`cos`/`tan` →
`<number>`). The literal heuristic is kept only as the fallback for an `unknown`
type (a `var()`/`sibling-index()` the type checker can't judge) so nothing
regresses.

**2. Resolve length/time/viewport arguments in `_rotSerAngle`.** Threaded `el`
through (`_canonRotate`'s `ang` closure → `_rotSerAngle(..., el)`) and widened the
eval options:

```js
const vp = _vpUnits();
const angOpts = { angle: true, lengths: true, time: true, emPx: _emPxOf(el), vw: vp.vw, vh: vp.vh };
```

The like units cancel as a ratio inside `atan2`, so `atan2(1px,-1px)` =
`atan2(1cm,-1cm)` = `atan2(1vh,-1vh)` = `atan2(1s,-1s)` = `135deg` regardless of the
concrete px/s factor.

**3. Make `_evalMath`'s time branch fall through to length.** The `opts.time` branch
used to *always* return (resolve-as-time or `tfail()`), so it could never coexist
with `opts.lengths`. Now a non-`<time>` unit falls through to the length branch —
**but only when `opts.lengths` is also set**:

```js
if (opts.time) {
  const sf = _TIME_S[tok.unit];
  if (sf !== undefined) return [tok.v * sf, false];
  if (!opts.lengths) return tfail();        // time-only callers: byte-identical to before
}
```

No existing caller sets both flags, so every prior path is provably unchanged; only
the new rotate-angle eval (which sets both) gains the mixed length/time resolution
`atan2`'s same-typed args need.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css/css-values/acos-asin-atan-atan2-computed.html` | 11/50 | **46/50** | **+35** |
| `css/css-values/signs-abs-computed.html` | 164/233 | **167/233** | **+3** (bonus) |

**+38 subtests.**

## Zero-regression sweep (all held)

`rotate-parsing-computed` 23/23, `scale-parsing-computed` 38/38,
`translate-parsing-computed` 19/19, `rotate-parsing-valid` 23/23,
`sin-cos-tan-computed` 26/32, `round-mod-rem-computed` 227/243,
`calc-infinity-nan-computed` 48/48, `hypot-pow-sqrt-computed` 43/52,
`signs-abs-serialize` 16/16, `Element-classlist` 1420/1420,
`Document-createElement` 147/147.

## Caps / Next (ROI)

- **`sibling-index()` (CSS Values 5 tree-counting) — the lone remaining
  `acos-asin-atan-atan2-computed` tail (4 fails) and a recurring tail across the
  *whole* computed css-values realm** (`signs-abs-computed`, `round-mod-rem-computed`,
  `sin-cos-tan-computed` all carry `sibling-index()`/`sign(1em-1px)` rows). Needs the
  element's 1-based sibling index plumbed into `_evalMath` (which today is a pure
  string evaluator with no DOM context). For *these* rows the element is the 1st
  child, so `sibling-index()` = 1 and they'd all fold (`atan2(1, sibling-index())` =
  `atan2(1,1)` = `45deg`). **Highest-leverage next move** — one primitive across many
  files.
- **`%`→used-px against the containing block** — the standing layout cap
  (`minmax-length-percent` 0/50; `calc(60% - 20px)`→`100px`; needs real layout).
- **`border`→12-longhand expansion** — `border-shorthand` 0/36 + `outline-shorthand`
  0/4 (structural; touches the cascade + `_serializeDeclBlock`).
