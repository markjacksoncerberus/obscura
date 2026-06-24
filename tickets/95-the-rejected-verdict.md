# Scroll 95 — The Rejected Verdict

> *The engine had learned to evaluate every math function, to fold each one down to
> the number it always was. But it could not yet say NO. A garden of malformed
> calls — `sin( )`, `round(1, nearest)`, `pow(2px, 2)`, `rotate(tan(1deg))` — was
> waved straight through and stored. This quest taught it to judge.*

**Realm:** the `*-invalid` half of the CSS math-functions family (CSS Values 4
§10 type-checking) — `sin-cos-tan-invalid`, `acos-asin-atan-atan2-invalid`,
`exp-log-invalid`, `hypot-pow-sqrt-invalid`, `signs-abs-invalid`,
`round-mod-rem-invalid` under `css/css-values/`.
**Status:** ✅ SECURED — **+365** (realm +362 / 363, bonus +3). Pure JS, no new Rust.
**Session:** 2026-06-24.

## The gap

Quest #94 made the calc engine *evaluate* and *fold* every math function. But the
acceptance gates were blind to math-function grammar:

- The transform validator (`_tfArgValid`) accepted **any** `_FILTER_MATH_RE` match
  for every argument slot — so `rotate(sin())`, `rotate(tan(1deg))` (sin/tan yield a
  `<number>`, not the `<angle>` rotate needs), `rotate(sin(90px))` were all stored.
- `opacity`/`height`/`font-weight`/`margin-left`/`tab-size`/`outline-offset` had
  **no math gate at all** — they stored their value verbatim, so `opacity: exp()`,
  `height: round(0px)`, `margin-left: 1px * sign(10px + 5rad)`,
  `font-weight: abs(1, 2)` all "succeeded".

Baseline: every one of the six files at **0%** (42, 63, 48, 49, 53, 108 = 363
subtests), harness OK — a real, winnable frontier (the #94 scroll named it the
clean next quest).

## The work — one math-function GRAMMAR/TYPE validator

A type checker over the existing `_parseCalcTree` AST, placed beside the calc
engine in `bootstrap.js`. The parser already rejected most *syntactic* garbage
(`sin(,)`, `f(1 2)`, `f(1 + )`, unbalanced parens); what was missing was **arity**,
**unit/type checking**, and **zero-arg rejection**.

- **`_mt(node, pctType)`** → resolves a node to a CSS numeric type
  (`number`/`percentage`/`length`/`angle`/`time`/`frequency`/`resolution`/`flex`),
  `'unknown'` (a channel keyword / unknown function — be conservative and accept),
  or `null` (a definite type error). `_MATH_UNIT_TYPE` maps every unit → its base
  type, so an unknown unit (`1dag`) is a type error.
- **The percentage subtlety.** A `<percentage>` is its **own** type. It *unifies*
  with any concrete dimension (`10px + 5%` → length) via `_unifyType`/`_DIMENSIONS`,
  but **not** with a bare `<number>` — which is why `round(1, 1%)` is invalid even
  for `opacity` (which resolves `%`→number for the *whole* value): the two operands
  themselves don't share a type. `pctType` carries the property's `%` context
  (`null` ⇒ `%` not accepted at all, e.g. `font-weight`/`tab-size`/`<angle>`, so a
  `%` leaf is an immediate type error → kills `abs(1%)`, `sign(10%)`,
  `calc(100% + abs(1vmin * 10%))`).
- **`_mtFn`** mirrors `_foldMathFn`'s spec rules at the type level: per-function
  arity + argument types. `round()` peels an optional leading rounding-strategy
  keyword then requires exactly 2 same-type operands (a misplaced `nearest` in a
  numeric slot is rejected → `round(1, nearest)`, `round(nearest, 1, nearest)`);
  `sin`/`cos`/`tan` take `<angle>|<number>`→`<number>`; inverse-trig take
  `<number>`→`<angle>`; `pow`/`sqrt`/`exp`/`log`/`hypot` need unitless;
  `sign`→`<number>`; `abs` preserves; `min`/`max`/`clamp`/`hypot`/`mod`/`rem`/`atan2`
  unify their operands.
- **`_mathValid(str, types, pctType)`** parses, types, and matches against the set
  the property accepts — returning false ONLY when confident (an unparseable
  expression is invalid; one carrying an unknown symbol/function is accepted).
  A pure-`%` result resolves to `pctType` before the match.

### Wiring (the gates)

1. **`_tfArgValid`** (the `transform` shorthand) — a math argument is now routed
   through `_mathValid` with the slot's `<type>` (`_TF_MATH_TYPE`/`_TF_MATH_PCT`),
   so `rotate(sin(…))` (number into an angle slot) is rejected while
   `rotate(acos(1))` / `scale(cos(0))` still pass. var()/env() short-circuit.
2. **`setProperty`** — a new `_MATH_GATE_PROPS` table (`opacity`, `outline-offset`,
   `font-weight`, `margin-left`, `tab-size`, `height` with their accepted types and
   `%`-context) drives `_mathReject`, which fires **only** when the value contains a
   top-level math function (a bare keyword/length/number keeps its pass-through
   behaviour; var()/env()/CSS-wide always accepted). `opacity` also gained a tiny
   non-math grammar check (`auto`/`10px`/`0 1`).

## Results

| Test | Before → After |
|------|----------------|
| `sin-cos-tan-invalid` | 0 → **42** (+42) ✅100% |
| `acos-asin-atan-atan2-invalid` | 0 → **62** (+62) ⚠️ 1 cap |
| `exp-log-invalid` | 0 → **48** (+48) ✅100% |
| `hypot-pow-sqrt-invalid` | 0 → **49** (+49) ✅100% |
| `signs-abs-invalid` | 0 → **53** (+53) ✅100% |
| `round-mod-rem-invalid` | 0 → **108** (+108) ✅100% |
| **bonus** `css-color/parsing/opacity-invalid` | 0 → **3** (+3) ✅100% |

**Realm +362 / 363, bonus +3 = +365.**

## Zero-regression sweep

Math realm held EXACTLY at the #94 numbers: sin-cos-tan-serialize 270, acos-serialize
52, exp-log-serialize 19, hypot-serialize 25, signs-abs-serialize 16,
round-mod-rem-serialize 21, minmax-number-serialize 40, signs-abs-computed 31,
round-mod-rem-computed 160. Transform realm held: transform-valid 42, transform-invalid
20, scale-parsing 32/8/38, rotate-parsing 23/9/23, translate-parsing 20/6/19.
opacity-valid 30, opacity-computed 30. Canaries: classlist 1420, createElement 147,
calc-serialization 0/1 (held cap). **Stash-baseline proof** (revert bootstrap.js →
rebuild → measure → restore) on the gated-property-exposed tests showed pre-change ==
post-change: minmax-length-computed 0/80, registered-property-computation 0/75,
signs-abs-computed 31, round-mod-rem-computed 160.

## Caps / Next

- **1 cap:** `acos-asin-atan-atan2-invalid` — `rotate(atan2(30deg, + 0.261799rad))`.
  The `+ ` (space after a sign) is an operator with no left operand → invalid, but
  our shared `_parseCalcTree` tokenizer discards whitespace and reads it as a unary
  `+`. Fixing requires whitespace-sensitive `+`/`-` tokenization in the hot,
  serialization-shared parser — too risky for one subtest. Left as a documented cap.
- **Adjacent bonus realms now reachable** with the same validator: `*-invalid` for
  the other gated longhands likely have non-math cases too; and the broader
  css-values `calc(...)` invalid/type-checking tests.
- **The standing deep quest** remains the **computed-length resolver** (#94 Cap #2):
  our engine resolves NO computed lengths (`2em`/`calc(10px + 5px)` stay verbatim for
  margin-left/width/flex-basis), capping signs-abs-computed (202), round-mod-rem
  length/time (83), hypot-computed, minmax-length-computed (80), and much of the
  css-values length realm. The single highest-leverage move left in css-values.
