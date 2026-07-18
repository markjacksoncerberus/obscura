# Quest #220 — The Tab-Size Sign Verdict

**Realm:** `css/css-text/parsing/tab-size-computed.html`
**Hold:** 8/10 → **10/10** (+2, ZERO regressions)
**Session:** 2026-07-18
**Grabbed from:** #219's next-leverage — the cqw-`sign()` fold, now in a `<length>`/`<number>`
context. Also **closes the #181 css-text cap** (which explicitly named
"container-query `sign(2cqw…)` in tab-size").

## The gap

`tab-size` computed value is the specified `<number>` or an absolute `<length>`
(CSS Text 3 §propdef-tab-size). Two subtests failed:

```
test_computed_value("tab-size", 'calc(10 + (sign(2cqw - 10px) * 5))',  '5');
test_computed_value("tab-size", 'calc(10px + (sign(2cqw - 10px) * 5px))', '5px');
```

Both kept the symbolic calc:
```
calc(10 + (sign(2cqw - 10px) * 5))    -> got "calc(10 + (5 * sign(2cqw - 10px)))"   (want "5")
calc(10px + (sign(2cqw - 10px) * 5px)) -> got "calc(10px + (5px * sign(2cqw - 10px)))" (want "5px")
```

With no query container, container-query units resolve so only the `sign()` matters:
`2cqw - 10px` = `-10px` ⇒ `sign(...)` = `-1`, giving `10 + -1*5` = `5` and
`10px + -1*5px` = `5px`.

## Root cause

The `tab-size` computed branch (`bootstrap.js` ~18554) short-circuited a bare number
regex, then routed everything else through `_clampNegPx(_trComp(v, el, true, _vpUnits()))`.
`_trComp`'s length-opts (`lenOpts()`) do **not** set `cqZero`, so a `cqw` inside the
`sign()` gate could not resolve → `_evalMath` returned null → the value fell through to
`_canonMathExpr` (the symbolic calc). And even had it resolved, `_trComp` always appends
`px`, which is wrong for the number-typed twin (`5`, not `5px`).

## The fix

A math branch in the `tab-size` computed case, ahead of the old `_trComp` fallback:

```js
if (_MATHFN_NAME_RE.test(s)) {
  const root = _parseCalcTree(s);
  const nv = _evalMath(s, 0, Object.assign(
    { lengths: true, cqZero: true, emPx: _emPxOf(el), nonFinite: true }, _vpUnits(), _siblingOpts(el, s)));
  if (root !== null && nv !== null) {
    const ty = _mt(root, null);
    if (ty === 'number') return _serNumber(_nfClamp(Math.max(0, nv)));
    if (ty === 'length') return _clampNegPx(_serNumber(_nfClamp(nv)) + 'px');
  }
}
```

- **`cqZero: true`** collapses an unresolved container unit to 0 (mirrors #219's
  `_computeTimeValue` fix), so the `sign()` gate folds to its sign.
- **`_mt(root, null)`** classifies the calc's *type*: `_mt` types `sign()` as `<number>`
  regardless of its argument, so `10 + sign·5` is number-typed (→ `5`) and
  `10px + sign·5px` is length-typed (→ `5px`). `pctType = null` because `tab-size`
  admits no `%`.
- Number result clamps ≥0 (`Math.max(0, …)`, the property's `[0,∞]` range at
  computed-value time); length result clamps via `_clampNegPx`.
- Anything that fails to classify or evaluate falls through to the pre-existing
  `_trComp` path → byte-identical for every value that already worked.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-text/parsing/tab-size-computed.html` | 8/10 | **10/10** |

## Zero-regression sweep

tab-size-valid 5/5, tab-size-invalid 4/4, transition-delay-computed 1/1,
animation-duration-computed 15/15, round-mod-rem-computed 233/243 (pre-existing
baseline), minmax-length-percent-computed 30/50 (pre-existing baseline),
background-position-computed 32/32, qsa 1975. All held.

## Caps / Next

The `<time>`- and `tab-size`-`sign()` computed veins are now clean. **Next leverage:**
- A **NEW `css/*/parsing/` dir** — baseline `-valid`/`-computed` too, most `-invalid`
  are already green via generic setProperty rejection, so the tell in a mature dir is a
  `-valid`/`-computed` canonicalization gap.
- `animation-timeline` / `animation-composition` as their own validated properties
  (check `css/scroll-animations/` + `css-animations/`).
- The same `sign(2cqw - 10px)` fold audited across other `*-computed` length/number
  props (`word-spacing`, `letter-spacing`, `text-indent`, sizing longhands) — grep for
  branches that call `_trComp`/`_clampNegPx` without `cqZero`.
