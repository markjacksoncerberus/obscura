# Quest #109 — The Singular Verdict

**Single-argument `min()`/`max()` collapses to `calc()` at computed time, +30**
(session 2026-06-26, branch `engine-per-page-threads`)

## The gap

`css/css-values/minmax-length-percent-computed.html` sat at **0/50** — listed in the
#108 memory as part of "next leverage #1: `%`→used-px against the containing block
(real layout)", THE standing widest tail.

But measuring the actual failures showed the realm splits cleanly in two, and **half
is not a layout problem at all**:

```
min(1px + 1%) should be used-value-equivalent to calc(1px + 1%)
  -> expected "calc(1% + 1px)" but got "min(1% + 1px)"
min(1em + 1%) should be used-value-equivalent to calc(1em + 1%)
  -> expected "calc(1% + 20px)" but got "min(1% + 1em)"
min(20px, 10%) should be used-value-equivalent to 20px
  -> expected "20px" but got "min(20px, 10%)"
```

The test (`test_math_used` from `css/support/numeric-testcommon.js`, `prop:'margin-left'`)
sets `#target.style['margin-left']` to BOTH the test expr and the reference expr and
asserts their `getComputedStyle` serializations are equal — so the "expected" string is
**our own engine's `calc(…)` serialization**.

- **Category A (30 — NO layout):** single-argument `min()`/`max()` wrapping a sum with a
  `%`, one per unit × {min,max}: `1px,1cm,1mm,1Q,1in,1pc,1pt,1em,1ex,1ch,1rem,1vh,1vw,1vmin,1vmax`.
  CSS Values 4 §simplification: a `min()`/`max()` with a **single** argument reduces to
  that argument (the comparison is trivial), serialized as `calc()`. The `%` (and viewport
  units) stay symbolic; em/ex/ch/rem/abs resolve to px — **exactly** what bare
  `calc(1px + 1%)` already computes to in our engine. So both sides only match once the
  `min`/`max` wrapper is gone.
- **Category B (20 — layout cap):** genuine multi-argument comparisons
  (`min(20px, 10%)`→`10px`, `max(1em, 10%)`→`40px`, `min(30px + 10%, 60px + 5%)`→`70px`)
  that require resolving `%` to used px against the containing block. Real layout — the
  standing cap.

## Root cause

`margin-left` is in `_LENGTH_COMPUTED_PROPS` → computed via `_trComp(v, el, true)`. When the
value contains a `%`, `_trComp` routes through `_resolvePctLengthCalc(t, emPx)` to produce
the canonical `calc(P% ± Lpx)` form. But that helper opens with:

```js
const m = /^calc\(([\s\S]*)\)$/i.exec(String(s).trim());
if (!m) return null;
```

— it only handles a **`calc(`-prefixed** string. A single-arg `min(1px + 1%)` failed the
regex → `_resolvePctLengthCalc` returned `null` → `_trComp` fell back to
`_canonMathExpr(t) || t`, which canonicalises the inner sum (sorting `%` first) **but keeps
the `min(…)` wrapper verbatim**. So `min(1px + 1%)` computed to `min(1% + 1px)` while
`calc(1px + 1%)` computed to `calc(1% + 1px)` — the function name leaked into the computed
value and the two no longer matched. (em also stayed `1em` because that fallback path never
reached the px-resolving calc machinery.)

## The fix

Pure JS, additive, one helper in `bootstrap.js`, gated on the computed path:

```js
const _unwrapSingleMinMax = (t) => {
  const m = /^(?:min|max)\(([\s\S]*)\)$/i.exec(String(t).trim());
  if (!m) return t;
  const args = _commaSplitTop(m[1]);
  return args.length === 1 ? 'calc(' + args[0].trim() + ')' : t;
};
```

Called once at the top of `_trComp`, gated on `computed`:

```js
const _trComp = (t, el, computed, vp) => {
  t = t.trim();
  if (computed) t = _unwrapSingleMinMax(t);
  ...
```

A single-arg `min(X)`/`max(X)` (one top-level argument — no comma) becomes `calc(X)` and
then flows through the existing `_resolvePctLengthCalc` (mixed `%`) or `_evalMath` (pure
length) machinery exactly like any other calc. Multi-arg min/max (a real comparison), any
non-min/max value, and already-`calc()` input are returned untouched, so the change is
**idempotent everywhere except a single-arg min/max — and only observably different when
that single arg contains a `%`** (a non-`%` single arg already evaluated to one px value
either way). Gating on `computed` leaves the specified-value / serialize path byte-identical.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-values/minmax-length-percent-computed.html` | 0/50 | **30/50** |

All 30 Category-A single-arg subtests pass. The 20 remaining are the Category-B multi-arg
comparisons (the layout cap).

## Zero-regression sweep

The change touches only `_trComp`'s computed path (and only single-arg min/max-with-`%`).
Every realm sharing `_trComp` / the math serializers held exactly:

| Realm | Hold |
|-------|:----:|
| `minmax-length-computed` | 76/80 |
| `signs-abs-computed` | 222/233 |
| `round-mod-rem-computed` | 227/243 |
| `hypot-pow-sqrt-computed` | 48/52 |
| `clamp-length-computed` | 24/24 |
| `minmax-length-serialize` | 24/24 |
| `clamp-length-serialize` | 50/50 |
| `translate-parsing-computed` | 19/19 |

## Caps / Next

- **The 20 remaining `minmax-length-percent` fails are all multi-arg `min/max(px, %)`
  comparisons** needing `%`→used-px against the containing block — **real layout**, THE
  standing widest tail. It now joins: `round-mod-rem-computed`'s 16 `%`/`0%`-mixed fails,
  `hypot-pow-sqrt-computed`'s 4 `0%`-mixed, `signs-abs-computed`'s 5 `%`→used-px, and the
  margin/padding/block-size `%` rows. A narrow no-layout sub-win still exists (`0%` is 0px
  regardless of the containing block, so `0% + 3px`→`3px` folds without layout) but it
  touches the length-resolution layout boundary — its own scoped quest.
- cssText recombination for `border` (untested since #107).
- `fr`/`dpi`/`flex` niche computed paths (small).
