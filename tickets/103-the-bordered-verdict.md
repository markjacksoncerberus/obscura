# Scroll 103 — The Bordered Verdict

> *Quest #102's "next leverage" #1, and the standing `calc-nesting` 6/8 cap: a
> `border` shorthand carrying a nested calc line-width — `calc(calc(10px)) solid
> pink` — should canonicalize to `calc(10px) solid pink` at specified time, but
> the embedded calc() was echoed verbatim because the `border` family bypasses the
> length/time math canon. This scroll routes the line-width component of the
> border / outline / column-rule shorthands through the same `_canonMathExpr` the
> longhands already use.*

## The gap — calc never reached the canon in a shorthand

```
test_valid_value("border", "calc(calc(10px)) solid pink", "calc(10px) solid pink");
```

| test | before | after | gap |
|------|:------:|:-----:|-----|
| `calc-nesting` | 6/8 | **7/8** | the `border` shorthand row |

The sibling `test_valid_value("left", "calc(calc(100px))", "calc(100px)")` already
passed — `left` is a known `<length>` property, so `_canonLengthTimeMath('left', …)`
folded its nested calc. But `border` (and `outline`, `column-rule`) are **shorthands**,
not in the length tables, so `_canonLengthTimeMath` returns early and their embedded
calc() never reaches `_canonMathExpr`. The value flowed through `_canonStandardValue`
(a tokenizer that normalizes numbers/strings/urls but does **not** fold math) and came
back out untouched: `calc(calc(10px)) solid pink`.

## The fix (pure JS, additive, `bootstrap.js`)

A `<line-width> || <line-style> || <color>` value has exactly one length-typed
component — the width — and a top-level bare math function (`calc`/`min`/`max`/`clamp`/…)
can only be that width (a keyword, hex, or colour-function is never a top-level bare
math token). So: split the value at the top level, and route any component that **is**
a math function through the length math canon — the very same `_canonMathExpr(…, {canonLen:true})`
that `left`/`width` use.

```js
const _BORDER_SH_PROPS = new Set([
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'outline', 'column-rule',
]);
const _canonShorthandLenMath = (value) => {
  if (!_MATHFN_NAME_RE.test(value)) return value;     // no math → byte-identical
  return _splitTopLevel(value)
    .map((p) => (_MATHFN_NAME_RE.test(p) ? (_canonMathExpr(p, { canonLen: true }) || p) : p))
    .join(' ');
};
```

Wired into both the CSSOM `setProperty` and the declaration-block parser
`_parseStyleDecls`, as a new `else if (… _BORDER_SH_PROPS.has(name))` branch right
before the unconditional `_canonLengthTimeMath` line (which is a no-op for these
non-length props).

### Gated for zero whitespace reflow

`_canonShorthandLenMath` returns the value **unchanged** unless the whole value
contains a math function (`_MATHFN_NAME_RE`). Every ordinary border — `1px solid
pink`, `thin dashed`, a colour-function fill — skips the split/rejoin entirely and
stays byte-for-byte identical, so the split's single-space rejoin can never reflow a
currently-passing value. Only a calc-bearing border (currently failing) is touched,
and there the single-space join *is* the canonical form.

`min`/`max`/`clamp` widths are length-typed too, so `canonLen:true` is correct for
any top-level math token here. `_canonMathExpr` returns `null` on a parse failure and
the `|| p` keeps the original — a malformed width is left for the (separate, still
absent) validity gate, not silently mangled.

## Results

| test | before | after | Δ |
|------|:------:|:-----:|:-:|
| `calc-nesting` | 6/8 | **7/8** | +1 |

**+1 subtest.** No new Rust. The lone remaining `calc-nesting` fail is the layout
test (`div2 { width: calc(calc(60%) - 20px) }` → `100px`), the standing `%`→used-px
cap that needs real layout.

## Zero-regression sweep

`border-shorthand` reads **0/36** and `outline-shorthand` **0/4** — alarming on the
surface, so **stash-proven NOT a regression**: I stashed `bootstrap.js`, rebuilt, and
measured the SAME 0/36 and 0/4 at baseline. Those failures are pre-existing structural
caps — `border` is stored as a single property (Obscura does **not** expand it to
`border-bottom-color`/etc. longhands) and the invalid-value rejection (`color-mix(42deg)`)
is absent. **None of those 36/4 cases contain a math function**, so the
`_MATHFN_NAME_RE` gate leaves every one of them untouched. (calc-nesting was 6/8 at the
same baseline → my fix is the whole +1.)

All shared-path anchors held (with fix):

- `color-valid-relative-color` 1146/1147; `color-computed-relative-color` 1121/1169
  (the wpt.live test-content change from #101, NOT a regression).
- `calc-infinity-nan-serialize-length` 41/41; `calc-infinity-nan-computed` 48/48.
- `minmax-length-serialize` 24/24; `minmax-length-computed` 76/80;
  `minmax-time-serialize` 22/22.
- `clamp-length-serialize` 50/50; `clamp-length-computed` 24/24.
- `calc-dimension-serialization-order` 44/44; `signs-abs-serialize` 16/16;
  `round-mod-rem-serialize` 21/24; `cssom/serialize-values` 696/697;
  `border-width-valid` 6/6.

## Caps / Next (ROI order)

1. **`%` → used-px against the containing block** — the standing layout cap, now the
   *lone* `calc-nesting` fail (`calc(60% - 20px)` → `100px`, the margin/padding/block-size
   `%` rows, `minmax-length-percent` 0/50). Needs a real used value (layout) — the
   single biggest remaining length tail.
2. **`border` → longhand expansion** — `border-shorthand` 0/36 is mostly *structural*:
   `border` doesn't expand into its 12 longhands (`border-*-{width,style,color}`), and
   invalid sub-values (`color-mix(42deg)`, bad `<line-style>`) aren't rejected. A real
   border shorthand parser/expander would unlock that realm AND `outline-shorthand` 0/4
   — a bigger, root-cause quest (touches the cascade + `_serializeDeclBlock`).
3. **`signs-abs-computed` / `hypot-pow-sqrt-computed` em-relative tails** (164/233,
   43/52): the computed evaluator doesn't resolve every font-relative `sign()`/`hypot()`
   argument. Worth a baseline before committing.
