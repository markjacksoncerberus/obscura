# Quest #236 — The Fit-Content-Calc Verdict

**Realm:** `css/css-sizing/parsing/` — the `fit-content()` argument computed style
**Hold before:** max-width-computed 11/12, min-width-computed 10/11, max-height-computed 11/12, min-height-computed 10/11
**Hold after:** all four → 100%
**Bounty:** **+4, ZERO regressions**
**Session:** 2026-07-22

## The gap

Baselined a batch of fresh `css/*/parsing/` dirs (css-transforms, css-shapes,
css-images, css-sizing, css-contain — most already 100%) and found a clean shared
vein across the css-sizing min/max computed files. Each of `max-width`, `min-width`,
`max-height`, `min-height` had exactly ONE fail, all identical:

```
test_computed_value("max-width", "fit-content(calc(10% + 40px))");
  → expected "fit-content(calc(10% + 40px))" but got "fit-content(40px)"
```

The sibling `fit-content(calc(10px + 0.5em))` → `fit-content(30px)` PASSED already
(no `%` to drop; the em-only calc folds cleanly). Only the mixed `%`+`<length>` case
failed — the percentage was silently dropped at computed time.

## Root cause

The SPECIFIED-value canon was corrupting the stored value before computed ever ran.
`_canonLengthTimeMath(name, v)` (the `<length>`/`<time>` math canon dispatched from
setProperty + the inline decl parser) fires whenever the value *contains* a math
function (`_MATHFN_NAME_RE.test(v)` matches the nested `calc(`), and for a sizing
property it ran the WHOLE value through `_canonMathExpr`:

- `_canonMathExpr('fit-content(calc(10% + 40px))')` parses `fit-content(` as an
  unknown function node and serializes its argument at "root" position — which
  **sheds the `calc()` wrapper** (`_serCalcRoot` drops the outer parens of a sum).
- Result stored: `fit-content(10% + 40px)` — but a bare `10% + 40px` is NOT a valid
  `<length-percentage>`; the calc() wrapper is mandatory.

Then `_computeSizeValue` extracts the argument `10% + 40px`, and since it is no longer
a recognized math function, `_trComp` routes it to `_evalMath('10% + 40px', 0)` which
folds the `%` against a 0 base → `40px`. The percentage vanished.

(A standalone `calc(10% + 40px)` on the same property stays `calc(10% + 40px)` — its
top-level IS a calc, so `_canonMathExpr` re-wraps correctly. Only the fit-content
*wrapper* triggered the bug.)

## The fix (all `bootstrap.js`)

Made `_canonLengthTimeMath` fit-content-aware: when the value is a top-level
`fit-content( <arg> )`, canonicalize the argument ALONE (preserving its calc()
wrapper) instead of running the whole value through the math canon:

```js
const fc = /^fit-content\(\s*([\s\S]*?)\s*\)$/i.exec(v.trim());
if (fc) {
  const inner = fc[1];
  const c = _MATHFN_NAME_RE.test(inner) ? (_canonMathExpr(inner, { canonLen: isLen }) || inner) : inner;
  return 'fit-content(' + c + ')';
}
```

`_canonMathExpr('calc(10% + 40px)', {canonLen:true})` keeps the wrapper (a plain calc
sum serializes as `calc(...)`), so the specified value is now the valid
`fit-content(calc(10% + 40px))`. The existing `_computeSizeValue` regex then extracts
`calc(10% + 40px)`, and `_trComp` keeps the mixed %+length symbolic → the computed
value round-trips correctly. The em-only `fit-content(calc(10px + 0.5em))` becomes
`fit-content(calc(0.5em + 10px))` specified and still folds to `fit-content(30px)`
computed (target font-size 40px → 0.5em = 20px).

The branch sits AFTER the `isLen/isTime` guard, so grid track sizing (which has its
own `_canonGridTrackSize`/`_canonGridLP` fit-content path and is NOT in the
length/size computed sets) is entirely unaffected.

## Wins

| File | before | after |
|------|:------:|:-----:|
| max-width-computed | 11/12 | **12/12** |
| min-width-computed | 10/11 | **11/11** |
| max-height-computed | 11/12 | **12/12** |
| min-height-computed | 10/11 | **11/11** |

Probe confirmation:
- `fit-content(calc(10% + 40px))` → spec `fit-content(calc(10% + 40px))`, computed `fit-content(calc(10% + 40px))`
- `fit-content(calc(10px + 0.5em))` → spec `fit-content(calc(0.5em + 10px))`, computed `fit-content(30px)`

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing), shorthand-serialization
7/7, box-sizing-computed 2/2, columns-computed 27/27, flex-computed 14/14, flex-basis-computed
12/12, tab-size-computed 10/10, grid-area-computed 35/35, inset-computed 20/20,
text-decoration-inset-computed 16/16, grid-template-columns-valid 34/34, grid-auto-columns-valid
30/30. All held. The change is gated on the `fit-content(` head, so every non-fit-content
length/time value is byte-identical.

## Caps / Next

- **Cap:** css-sizing min/max computed is now clean of this vein. `width`/`height`
  themselves have no `-computed` parsing file in this dir; `block-size`/`inline-size`
  fit-content is untested here.
- **Cursor cap (documented):** `css/css-ui/parsing/cursor-computed` 36/39 — the 3
  fails assert gradients (`linear-gradient(...), auto`) ARE supported for `cursor`,
  which directly CONTRADICTS `cursor-invalid` (correctly rejects gradients per
  css-ui-4, `<url>`/`<image-set>` only). The cursor-computed "expected" strings are
  also malformed (unbalanced parens, wrong trailing keyword `crosshair`→`pointer`).
  Passing those 3 would regress the 4 gradient-rejection subtests in cursor-invalid.
  **Unwinnable** — a genuine WPT inconsistency, not a value-parsing gap.
- **`resize-computed` 5/6:** `resize: both` in `::before` returns `vertical` — a
  pseudo-element computed-style bug (the wrong pseudo's value), deeper than value parsing.
- **NEXT LEVERAGE:** a NEW `css/*/parsing/` dir. Baselined this session with scattered
  small veins worth a look: `css/css-shapes/parsing/shape-outside-computed` 29/32 (a
  `rect()`→`inset()` right/left-edge calc conversion bug `100% - right` computed with
  wrong sign, + a `circle()` position `right calc(10% * sign(1em-1px))` resolving the
  `sign` to 0 instead of +1); `css/css-backgrounds/parsing/background-repeat-computed`
  12/13 (the computed two-keyword form `repeat repeat` must collapse to `repeat` — a
  serialization-only fix, the valid test accepts both forms). grep `_canonLengthTimeMath`.
