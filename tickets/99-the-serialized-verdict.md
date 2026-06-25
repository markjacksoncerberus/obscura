# Scroll 99 — The Serialized Verdict

> *Quest #98 taught `getComputedStyle` to **clamp** non-finite math at computed time.
> But the **specified** value of a non-finite calc — what `el.style.width` reads back —
> was still echoed verbatim. `calc(1px * NaN)` came back as `calc(1px * NaN)`, not the
> canonical `calc(NaN * 1px)`. This scroll teaches the SPECIFIED-value path to
> **serialize** non-finite math per CSS Values 4 §calc-type-checking / §serialization.*

## The gap — `calc-infinity-nan-serialize-length` 0/41 and `-serialize-time` 0/29

`test_specified_serialization` (css/support/serialize-testcommon.js) sets a value AND
its expected canonical form through `el.style[prop]`, reads BOTH back, and asserts they
serialize identically:

```js
el.style.width = "calc(1px * NaN)";   tValue = el.style.width;   // must be "calc(NaN * 1px)"
el.style.width = "calc(NaN * 1px)";   eValue = el.style.width;   // must round-trip exactly
assert_equals(tValue, eValue);
```

So this is the **specified** serializer (the `style` setter/getter round-trip), NOT
`getComputedStyle`. We had a complete calc serializer already — `_canonMathExpr` →
`_parseCalcTree` → `_simpCalc` → `_serCalcTree`/`_serCalcNum` — but it was wired ONLY
into the colour-channel canon. The generic `<length>`/`<time>` value path ran
`_canonStandardValue` (which normalizes number literals but keeps calc bytes verbatim),
so every one of the 70 subtests failed.

The expected behaviours, all already half-built in `_serCalcNum`/`_simpCalc`:

| input | wanted | rule |
|-------|--------|------|
| `calc(1px * NaN)` | `calc(NaN * 1px)` | product reorder — number first |
| `calc(1in * NaN)` | `calc(NaN * 1px)` | absolute length → px |
| `calc(1ms * NaN)` | `calc(NaN * 1s)` | time → s |
| `calc(1px * infinity)` | `calc(infinity * 1px)` | emit `infinity` keyword |
| `calc(1px * -infinity)` | `calc(-infinity * 1px)` | emit `-infinity` |
| `calc(1px * 1/infinity)` | `calc(0px)` | fold finite (1/∞ = 0) |
| `calc(1 * min(NaN*2px, NaN*4em))` | `calc(NaN * 1px)` | min/max NaN-collapse across same-type units |
| `calc(1 * clamp(NaN*2em, NaN*4px, NaN*8pt))` | `clamp(NaN * 1em, NaN * 1px, NaN * 1px)` | clamp keeps args; no calc wrapper |

## The fix (pure JS, additive, `bootstrap.js`)

1. **Absolute-length & time canon in `_parseCalcTree`** — a new opt-in (`opts.canonLen`/
   `opts.canonTime`, default OFF so the colour path is byte-identical) mirrors the
   existing angle→deg canon: `_ABS_LEN_PX` (px/in/cm/mm/q/pt/pc → px — the relative
   units in `_LENGTH_PX` deliberately excluded) and `_TIME_S` (ms → s). So same-type
   arithmetic folds: `min(NaN*1pt, NaN*1cm)` → both px → `calc(NaN * 1px)`.

2. **min()/max() NaN cross-unit collapse in `_foldMathFn`** — when a min/max's args are
   the same numeric TYPE but different units (length px-vs-em), they normally stay
   symbolic until computed time. BUT if any arg is NaN the comparison is indeterminate
   regardless of the unresolved units, so it collapses to NaN at the type's canonical
   unit (`_unitType`/`_CANON_TYPE_UNIT`). `clamp()` is excluded — it keeps its three
   args, matching `clamp(NaN*2em, NaN*4px, NaN*8pt)` → `clamp(NaN*1em, NaN*1px, NaN*1px)`.

3. **Redundant-form drops** — two CSS Values 4 serialization niceties, needed for the
   clamp case: (a) `_simpCalc` drops a unitless `1 *` multiplicative identity (`calc(1 *
   clamp(…))` → the bare `clamp(…)`), guarded so a leading `/` keeps its numerator
   (`calc(1 / l)` ≠ `calc(l)`); (b) `_canonMathExpr` sheds the redundant `calc()` wrapper
   around a standalone top-level function — gated on the non-finite path (`canonLen`/
   `canonTime`) so the colour path keeps its legacy wrapper rule exactly.

4. **Wiring** — `_canonNonFiniteMath(name, value)` runs in `setProperty` and
   `_parseStyleDecls`, **gated on a non-finite keyword** (`\b(?:infinity|nan)\b`): only a
   non-finite math function on a known `<length>` (`_LENGTH_COMPUTED_PROPS` ∪
   `_SIZE_COMPUTED_PROPS`) or `<time>` (`_TIME_COMPUTED_PROPS`) property is routed
   through `_canonMathExpr({canonLen|canonTime})`. Every FINITE calc still serializes
   byte-identically through `_canonStandardValue` — the generic specified calc
   serializer is intentionally left untouched (folding finite `calc(1px+2px)`→`calc(3px)`
   is a separate, broader change). **No new Rust.**

## Result

`calc-infinity-nan-serialize-length` **0/41 → 41/41 (+41)**,
`calc-infinity-nan-serialize-time` **0/29 → 29/29 (+29)** = **+70**. Zero regressions —
stash-verified the two shared-path consumers byte-for-byte
(`color-valid-relative-color` 1146/1147, `color-computed-relative-color` 1163/1169
identical with/without the change; `serialize-values` 696/697 identical), and held the
calc/transform ledger: calc-infinity-nan-computed 48, serialize-number 31,
serialize-angle 30, signs-abs-computed 163, round-mod-rem-computed 225, minmax-length 76,
minmax-number 14, clamp-length 17, hypot-pow-sqrt-serialize 25, hypot-pow-sqrt-computed
43, scale/rotate/translate-parsing-computed 38/23/19, classlist 1420, createElement 147.

## Caps / Next

- **The deep layout-bound cap — `%`→used-px against the containing block** — still THE
  biggest remaining tail (margin/padding/block-size `%` rows, minmax-length-percent 0/50).
  Needs a used value, not a computed value (real layout).
- **Finite-calc generic-path folding** — we intentionally gate the new serializer on a
  non-finite keyword, so a finite `width: calc(1px + 2px)` is NOT folded to `calc(3px)`
  in the specified value (it stays verbatim via `_canonStandardValue`). Generalizing
  `_canonMathExpr` to the whole generic length/time specified path is a clean follow-up
  but risks the `serialize-values` hot path — would need its own zero-regression sweep.
- `clamp-length` 17/24, `clamp-integer` 1/6 — the `clamp(none, …)` ±∞ sentinel form,
  a #94-era leftover, still open.
- `lh` unit in the length path; minmax 4 unbalanced-paren auto-close.
