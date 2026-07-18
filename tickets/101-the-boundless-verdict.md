# Scroll 101 — The Boundless Verdict

> *Quest #100 taught the **SPECIFIED** serializer to fold `clamp(none, …)` — the
> `none` keyword removes a bound, so the folding lives in `_foldMathFn` and
> `clamp(none, 33px, 30px)` serializes to `calc(30px)`. But getComputedStyle does
> not run the specified serializer — it runs a **separate numeric evaluator**,
> `_evalMath`, and that evaluator had never heard of `none`. So at COMPUTED time
> `z-index: clamp(none, 30, 33)` fell back to the symbolic form and resolved to
> `calc(30)` instead of the bare integer `30`. This scroll teaches the computed
> path the same `none` sentinel — and, while chasing the last length fail, fixes a
> latent mixed-unit product bug that silently dropped a relative unit.*

## The gap — the COMPUTED clamp-none / em tail

The named #100 "next leverage" #1:

| test | before | gap |
|------|:------:|-----|
| `clamp-integer-computed` | 1/6 | `clamp(none, 30, 33)` on `z-index` → `30` (we returned `calc(30)`) |
| `clamp-length-computed`  | 22/24 | `clamp(1000px, 1em/1rem*1px, none)` → `1000px`; `clamp(1600px/1em*1px, 1em/1rem*1px, none)` → `80px` (font-size 20px) |

Both failures share one root cause for the `none` cases: the computed numeric path
is `_evalMath` (the full evaluator that returns a *number*), which is **distinct**
from the specified serializer `_canonMathExpr`/`_simpCalc`/`_foldMathFn` (which
folds *symbolically*). `_foldMathFn` already understood `none` (#100); `_evalMath`
did not. When `_evalMath` hit the bare `none` ident it `tfail()`ed → returned
`null` → the computed resolver fell back to the symbolic serializer (`calc(30)`).

The *second* `clamp-length-computed` fail had a deeper cause — see fix (2).

## The fix (pure JS, additive, `bootstrap.js`)

### 1. `none` sentinel in `_evalMath`'s clamp branch

`clamp()` is the only math function that accepts the `none` keyword (CSS Values 4
§funcdef-clamp), and `none` only ever sits in the MIN or MAX slot, where it
*removes* that bound. So we peel it per-argument, before the generic function-call
machinery, and evaluate it as the bound that doesn't constrain:

- a `none` **low** (slot 0) → **−∞** (no floor)
- a `none` **high** (slot 2) → **+∞** (no ceiling)

The existing formula then collapses correctly with no further change:

```
clamp(none, 30, 33) → max(−∞, min(30, 33)) = max(−∞, 30) = 30   ✓
clamp(30, 33, none) → max(30, min(33, +∞)) = max(30, 33) = 33   ✓
clamp(none, 30, none) → max(−∞, min(30, +∞)) = 30              ✓
```

This fixed `clamp-integer-computed` whole-hog (1 → 6) and the three `none`-only
`clamp-length-computed` rows.

### 2. Mixed-unit product fix — `_mulUnit` / `_divUnit`

The last `clamp-length-computed` fail was
`clamp(1600px / 1em * 1px, 1em / 1rem * 1px, none)`, expected `80px` at font-size
20px (`1600px / 1em` = 1600/20 = 80, `* 1px` = 80px; the `none` high → no ceiling).
We returned `1600px`. A CDP probe showed the **specified** value was already
serialized to `clamp(1600px, 1em, none)` — the `/ 1em * 1px` had been *dropped*
before computed eval ever ran.

The culprit: the product fold in `_simpCalc` collapsed `1600px / 1em * 1px` into a
single numeric leaf `{v: 1600, u: 'px'}` because `_mulUnit`/`_divUnit` assumed
*only one side ever carries a unit*:

```js
const _mulUnit = (a, b) => (a === '' ? b : (b === '' ? a : a));   // px·em → 'px'  ✗
const _divUnit = (a, b) => (b === '' ? a : (a === b ? '' : a));   // px/em → 'px'  ✗
```

Two **different non-empty** units form a compound that **cannot reduce to one
numeric leaf at specified time** (a relative unit like `em` is unresolved). The fix
returns `null` for that case, and the product fold bails to a symbolic product when
it sees `null`:

```js
const _mulUnit = (a, b) => (a === '' ? b : (b === '' ? a : null));
const _divUnit = (a, b) => (b === '' ? a : (a === b ? '' : null));
// …in the product fold:
const nu = f.op === '*' ? _mulUnit(cu, f.node.u) : _divUnit(cu, f.node.u);
if (nu === null) { badUnit = true; break; }
…
if (badUnit) return { k: 'prod', facs };   // keep symbolic — computed path resolves em→px
```

The clean cases are untouched: `number × dimension → dimension`,
`dimension ÷ number → dimension`, `dimension ÷ sameDimension → number` (`px/px` →
`''`). Only the previously-*wrong* both-non-empty branch changes — and folding
incompatible units to a single unit was always wrong, so no currently-passing case
can depend on it. The specified value is now `clamp(1600px / 1em * 1px, 1em / 1rem
* 1px, none)`, and the computed path resolves `em → 20px` and folds to `80px`.

## Results

| test | before | after | Δ |
|------|:------:|:-----:|:-:|
| `clamp-integer-computed` | 1/6 | **6/6** | +5 |
| `clamp-length-computed`  | 22/24 | **24/24** | +2 |

**+7 subtests.** No new Rust.

## Zero-regression sweep

The product-fold change touches the **shared** `_simpCalc` (colour + every calc
serialize/compute test), so the sweep was thorough.

- **The scare that wasn't:** `color-computed-relative-color` reads **1121/1169**
  now, down from the memory's 1163. A `git stash` of `bootstrap.js` + rebuild
  measured the **same 1121** with my edits gone → it is a **wpt.live test-content
  change**, NOT my regression.
- Held: `color-valid-relative-color` 1146; `calc-infinity-nan-serialize`
  length/number/time/angle 41/31/29/30; `signs-abs-serialize`/`-computed` 16/164;
  `round-mod-rem-serialize`/`-computed` 21/227; `minmax-number`/`angle-serialize`
  40/38; `minmax-length-computed` 76; `hypot-pow-sqrt-serialize`/`-computed` 25/43;
  `scale`/`rotate`/`translate-parsing-computed` 38/23/19; `calc-nesting` 6;
  `calc-dimension-serialization-order` 44; `clamp-length-serialize` 50;
  `Element-classlist` 1420; `Document-createElement` 147.

## ⚠️ wpt.live path migration (read before you measure)

wpt.live moved/removed many paths the campaign's ritual list still names. A stale
path returns a 42-byte JSON 404 body → reads as a `bodyLen=42` could-not-run, **not
a regression**. Confirmed this session:

- `css/css-values/serialize-values.html` — **removed** (no replacement; the per-type
  `*-serialize.html` tests cover its ground).
- colour relative-color tests → `css/css-color/parsing/` (e.g.
  `css/css-color/parsing/color-valid-relative-color.html`).
- transform `*-parsing-computed.html` → `css/css-transforms/parsing/`.

Always `curl -s "https://api.github.com/repos/web-platform-tests/wpt/contents/<dir>"`
to get the live file list.

## Caps / Next (ROI order)

1. **Nested-product coefficient fold** — `calc(2*(0.2*min(1em,1px))+1px)` →
   `calc(1px + (0.4*min(1em,1px)))` (the last `minmax-length-serialize` fail):
   product FLATTENING (`2*(0.2*X)` → `0.4*X`), gate behind `sort` like the sum
   ordering.
2. **calc-in-shorthand** — `calc(calc(10px)) solid pink` → `calc(10px) solid pink`
   (border/shorthand values bypass `_canonLengthTimeMath`).
3. **`%` → used-px against the containing block** — the standing layout cap
   (`calc(60% - 20px)` → `100px`, the margin/padding/block-size `%` rows,
   `minmax-length-percent` 0/50). Needs real layout (a used value).
