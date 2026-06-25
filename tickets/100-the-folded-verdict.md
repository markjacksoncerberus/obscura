# Scroll 100 — The Folded Verdict

> *Quest #99 taught the SPECIFIED serializer to canonicalize **non-finite** math
> (`calc(1px * NaN)` → `calc(NaN * 1px)`) — but it was deliberately **gated on a
> non-finite keyword**, so a finite `calc(1px + 2px)` / `clamp(1px, 2px, 3px)` was
> still echoed verbatim. This scroll lifts that gate: every `<length>`/`<time>`
> math function now **folds and canonicalizes** at specified time per CSS Values 4
> §calc serialization — folding to a single value where possible, sorting a sum's
> children into canonical order, and resolving `clamp()`'s `none` sentinels.*

## The gap — the whole finite-calc specified-serialization tail

The `_canonMathExpr` → `_parseCalcTree` → `_simpCalc` → `_serCalcTree` pipeline
already *folded* finite math (`_foldMathFn` computes `clamp(1px,2px,3px)` → `2px`),
but `_canonLengthTimeMath` (then `_canonNonFiniteMath`) only routed values
containing `infinity`/`nan` through it. Everything else fell to `_canonStandardValue`
(calc bytes verbatim). So a whole family of specified-serialization tests failed:

| test | before | gap |
|------|:------:|-----|
| `clamp-length-serialize` | 4/50 | `clamp(1px,2px,3px)`→`calc(2px)`, `none` sentinels, `calc(0px ± clamp(…))` arithmetic |
| `calc-dimension-serialization-order` | 0/44 | a sum's children must serialize **number → percentage → dimensions alphabetical by unit** |
| `minmax-length-serialize` | 13/24 | `min(1px)`→`calc(1px)`, `min(1in)`→`calc(96px)`, `calc(1px + min(1in,100px))`→`calc(97px)` |
| `minmax-time-serialize` | 11/22 | same, in the `<time>` family |
| `calc-nesting` | 0/8 | `calc(20px + calc(80px))`→`calc(100px)`, `calc(calc(100px))`→`calc(100px)` |
| `clamp-none-whitespace` | 0/3 | `clamp(none, 5px, 10px)` must be accepted + serialize deterministically |

## The fix (pure JS, additive, `bootstrap.js`)

Three changes, all behind the existing length/time `canonLen`/`canonTime` opt so the
colour path (which shares `_simpCalc`/`_canonMathExpr`) stays **byte-identical**:

1. **`clamp()` `none` sentinels in `_foldMathFn`** (CSS Values 4 §funcdef-clamp):
   `none` removes that bound — `clamp(none, V, H)` ≡ `min(V, H)`,
   `clamp(L, V, none)` ≡ `max(L, V)`, `clamp(none, V, none)` ≡ `V`. Handled
   *before* the all-numeric guard since `none` is a symbol leaf, not a `<number>`
   (validation already accepts it — a `sym` resolves to type `unknown`).

2. **Canonical sum-ordering — `_simpSumSorted`** (CSS Values 4
   §sort-a-calculations-children), reached only on the `sort` path (length/time):
   fold numeric terms by unit into one leaf each, then order **number →
   percentage → dimensions (ASCII-alphabetical by unit)**, with non-numeric terms
   (functions/products/symbols) preserved in order after the numbers. The colour
   path leaves `sort` falsy → keeps the existing input-order sum branch verbatim.
   `_simpCalc` gained a `sort` parameter threaded through every recursion (and the
   `node.args.map(_simpCalc)` call was fixed to `(a)=>_simpCalc(a, sort)` — `map`
   was passing the array index as the second arg).

3. **Lifted the gate** — `_canonNonFiniteMath` → `_canonLengthTimeMath`: drop the
   `_NONFINITE_KW_RE` test so **every** value containing a math function on a known
   `<length>`/`<time>` property routes through `_canonMathExpr({canonLen|canonTime})`.
   A bare `10px`/keyword (no math function) still keeps its `_canonStandardValue`
   serialization untouched. Absolute-unit canon (`1in`→`96px`, `1ms`→`1s`) and the
   redundant-`calc()`/`1 *` wrapper drops were already in place from #99.

## Result

| test | before | after |
|------|:------:|:-----:|
| `clamp-length-serialize` | 4/50 | **50/50** (+46) |
| `calc-dimension-serialization-order` | 0/44 | **44/44** (+44) |
| `minmax-length-serialize` | 13/24 | **23/24** (+10) |
| `minmax-time-serialize` | 11/22 | **22/22** (+11) |
| `calc-nesting` | 0/8 | **6/8** (+6) |
| `clamp-none-whitespace` | 0/3 | **3/3** (+3) |

**= +120**, plus **+2** `round-mod-rem-computed` (227) and **+1** `signs-abs-computed`
(164) as bonuses — the specified-value canonicalization now feeds cleaner input to
the computed reads. **= +123 total.**

**ZERO regressions** — the colour path (which shares `_simpCalc`/`_canonMathExpr`
with `sort` falsy) verified byte-for-byte: `color-valid-relative-color` 1146/1147 and
`color-computed-relative-color` 1163/1169 unchanged; `serialize-values` 696/697
(no calc cases). Held the calc/values ledger: `calc-infinity-nan-serialize-length`
41, `-time` 29, `-number` 31, `-angle` 30, `calc-infinity-nan-computed` 48,
`hypot-pow-sqrt-serialize` 25, `-computed` 43, `minmax-length-computed` 76,
`minmax-number-serialize` 40, `minmax-angle-serialize` 38,
`scale/rotate/translate-parsing-computed` 38/23/19, `classlist` 1420,
`createElement` 147.

## Caps / Next

- **Nested-product coefficient fold** — `calc(2 * (0.2 * min(1em,1px)) + 1px)` →
  `calc(1px + (0.4 * min(1em, 1px)))` (the last `minmax-length-serialize` fail).
  Needs product **flattening** (associativity: `2 * (0.2 * X)` → `0.4 * X`), a
  deeper `_simpCalc` product change — gate it behind `sort` like the sum ordering.
- **calc in shorthands** — `calc(calc(10px)) solid pink` → `calc(10px) solid pink`
  (a `calc-nesting` fail): `border`/shorthand values don't route through
  `_canonLengthTimeMath`; would need per-component canon in the shorthand parser.
- **`%`→used-px against the containing block** — the standing layout cap
  (`calc(60% - 20px)` → `100px`; the other `calc-nesting` fail, and the
  margin/padding/block-size `%` rows). Needs a real used value.
- **The COMPUTED clamp-none / em-resolution tail** — `clamp-length-computed` 17/24,
  `clamp-integer-computed` 1/6: these are the *computed* path (`_evalMath`/`_trComp`),
  which doesn't yet handle `none` or fold `sign(1em-18px)`. A clean sibling quest.
- **`calc-complex-unresolved-serialize`** 3/12 — `sign(1em - 18px)` (em-relative,
  computed) and `sibling-index()` paren-balance edge cases.
