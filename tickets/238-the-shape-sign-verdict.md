# Quest #238 — The Shape-Sign Verdict

**Realm:** `css/css-shapes/parsing/shape-outside-computed.html`
**Hold before:** 29/32 → **31/32** (+2)
**Status:** ✅ SECURED — zero regressions (1 documented cap)
**Session:** 2026-07-22

## The gap

Took Quest #237's next-leverage (`shape-outside-computed` 29/32). Three fails:

```
rect(0px calc(100% - 20px) 2% 3em)              → expected inset(0px calc(0% + 20px) 98% 120px)
circle(at top 0% right calc(10% * sign(1em - 1px)))  → expected circle(at 90% 0%)
circle(at top 0% right calc(10% * sibling-index())) → expected circle(at 90% 0%)   [CAP]
```

Two share one root cause; the third needs an unimplemented tree function.

## Root cause (the two winnable fails)

A **mixed length-percentage** value (a calc carrying both a `%` and a length, or a
`%` times a unitless coefficient) silently lost its percentage whenever it was
folded against a 0 %-base via `_evalMath(s, 0, {lengths})`. That base-0 fold turns
`100%`→0, so the percentage part is dropped.

**(1) rect → inset right/bottom edge.** `rect()` computes to `inset()` with the
right/bottom edges converted to `100% − <edge>`. `_opPctPx` resolved the edge to
`{pct, px}` but for a mixed calc it used the base-0 fold → `{pct:0, px:-20}` for
`calc(100% - 20px)`. Then `100% − edge` = `_opSerCalc100(100 − 0, 20)` =
`calc(100% + 20px)` — keeping the 100% that the edge's own 100% should have
cancelled. The correct result is `calc(0% + 20px)`.

**(2) circle `right <offset>`.** `_posCompComputed`'s right/bottom branch resolved
a non-pure-`%` offset as a **pure length** via `_evalMath(off, 0, {lengths})`. For
`calc(10% * sign(1em - 1px))` (sign = +1 since 1em = 16px > 1px), the `10%` folded
to length 0, giving `right 0` → `calc(100% - 0px)` instead of `right 10%` → `90%`.

## The fix (all `bootstrap.js`)

1. **`_opPctPx`** — when the token contains a `%` and no value-kink function
   (min/max/clamp/abs), decompose it linearly via two %-base probes:
   `v(base) = (pct/100)·base + px`, so `pct = v(100) − v(0)`, `px = v(0)`. A
   three-probe linearity check (0/100/200) guards against non-linear expressions;
   otherwise it falls through to the unchanged length-only path.

2. **`_opSerCalc100`** — dropped the `if (pct ≈ 0) return px + 'px'` shortcut. These
   values come only from a `100% − <edge>` conversion, so the percentage is part of
   the computed type; keep `calc(0% + Lpx)` when it folds to 0. (pct=0/px≠0 is
   reachable only from a mixed edge — pure-length edges always yield pct=100.)

3. **`_posCompComputed`** — added a `%`-carrying branch to the right/bottom offset
   handler: if the offset contains a `%`, serialize `100% − offset` via the fixed
   `_opSub100` (which now decomposes correctly). Pure-length offsets keep the
   existing path untouched.

## Results

`shape-outside-computed` 29 → **31/32**. `rect(… calc(100% - 20px) …)` → right
`calc(0% + 20px)`; `circle(… right calc(10% * sign(1em - 1px)))` → `circle(at 90%
0%)`.

## Zero-regression sweep

qsa 1975, classlist 1420, background-position-computed 32/32, clip-path-computed
21/21, clip-computed 4/4, offset-path-computed 65/65, offset-position-computed
15/15, transform-origin-computed 23/23, object-position-computed 16/16,
shape-outside-shape-valid 12/12, shape-outside-valid-position 20/20,
shape-outside-path-valid 9/9, shape-outside-invalid-position 10/10,
shape-margin-computed 3/3 — all held. (offset-path-computed 65/65 heavily
exercises `_opShape` + the position computed path — strong confidence.)

## Cap / Next

**Cap:** the 3rd fail `circle(at top 0% right calc(10% * sibling-index()))` requires
the `sibling-index()` tree-counting math function (returns the element's 1-based
sibling index). `_evalMath` has no DOM access and doesn't implement it — resolving
it would mean threading the element + a sibling count through the whole math
evaluator, deeper than value parsing. Left as-is (output is the verbatim
`calc(10% * sibling-index())`).

**Next leverage:** a NEW `css/*/parsing/` dir (the shape/background computed veins
are now clean). grep `_opPctPx` / `_opSub100`.
