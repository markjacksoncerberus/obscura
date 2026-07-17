# Quest #204 — The Gradient Position Verdict

**Realm:** `css/css-images/parsing/` (gradient `at <position>` grammar)
**Result:** `gradient-position-invalid` **0/9 → 9/9**. **+9, ZERO regressions.**
**Commit:** `feat(css-images): a strict `<position>` gate for gradient `at` clauses`

## The gap

`radial-gradient(…)` and `conic-gradient(…)` accept an `at <position>` clause. That
`<position>` uses the **strict CSS Values `<position>` grammar**, which is *narrower*
than the `<bg-position>` grammar the `background-position` property uses:

- **`<position>` has NO 3-value form.** Only 1, 2, or 4 tokens are legal.
- The edge-offset (`&&`) form requires **both** axes to be `[left|right|top|bottom]
  <length-percentage>` — all four tokens, no `center`, no optional offset.

`background-position`'s `<bg-position>` additionally allows the 3-value form
(`left 10px center`) and `center`/optional-offset combos — a back-compat extension
that gradients do **not** inherit.

Our `_parsePosition` implements the looser `<bg-position>` (correct for
`background-position`, which stayed 31/31 valid + 11/11 invalid). It therefore
happily parsed — and `_serializePositionSpecified` round-tripped — the 3-value
positions that gradients must reject:

```
radial-gradient(at center left 1px, red, blue)   → wrongly accepted
radial-gradient(at bottom right 8%, red, blue)   → wrongly accepted
radial-gradient(at top 0px, red, blue)           → wrongly accepted (a lone V-keyword can't lead)
```

All 9 `gradient-position-invalid` subtests failed this way (the value was accepted
and canonicalized instead of dropped).

## The fix

Followed the #202 pattern: a **parallel rejection gate**, no touch to the working
canonicalizer. `at <position>` sits in a gradient's first (configuration) argument,
which `_gradientConfigInvalid` already validates for the `in <color-space>`
interpolation clause. Extended it:

- New helper `_gradientPosInvalid(posToks)` (right before `_gradientConfigInvalid`):
  - empty (`at` with nothing after) → invalid,
  - **exactly 3 tokens → invalid** (strict `<position>` has no 3-value form),
  - otherwise defer to `_parsePosition(...) === null` (which already rejects
    `top 0px` — a lone vertical keyword can't lead the 2-value form — and any garbage).
- In `_gradientConfigInvalid`, after the `in`-clause removal, find `at` in the
  residual config tokens and call `_gradientPosInvalid` on everything after it.

Because `at` comes **before** `in` in the grammar and the `in` clause is stripped
into `residual` first, the tokens after `at` in the residual are exactly the
`<position>`. `at` never appears in a colour stop or shape/size, so no false match.

Wired via the existing `_gradientInvalid` gate — already called in **both**
setProperty paths (inline ~865, API ~1203) — so **zero new wiring**. Fully isolated:
1 helper + 2 lines in `_gradientConfigInvalid`. The lenient `_parsePosition` /
`_serializePositionSpecified` used by `background-position` are untouched.

## Why 3-token ≙ invalid is the whole delta

`_parsePosition` already returns `null` for the 2-token invalid case (`top 0px`) and
every 4-token parse it accepts is necessarily two `edge <lp>` components (both offsets
present — a 1-token component would force a 3-token partner, impossible for n=4). So
the only `<bg-position>`-vs-`<position>` leniency that reaches valid parses is the
3-value form. Rejecting `n === 3` (plus deferring to `_parsePosition` for the rest)
covers all 9 subtests exactly, and no valid gradient position is 3-token.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `gradient-position-invalid.html` | 0/9 | **9/9** |
| `gradient-position-valid.html` | 18/18 | 18/18 (held) |

Zero-regression sweep held: gradient-interpolation-method-invalid 292/292, -valid
1398/1398, -computed 932/932, image-function-valid 13/13, image-function-invalid 6/6,
object-position-valid 18/18, background-image-valid 13/13, background-position-valid
31/31, background-position-invalid 11/11, background-valid 45/46 (pre-existing cap),
background-computed 39/39, mask-computed 32/32, object-fit-invalid 5/5,
image-orientation-invalid 12/12, line-clamp-valid 18/18, cursor-invalid 10/10,
qsa 1975/1975.

## Caps / Next

**CAP:** none in this file.

**NEXT LEVERAGE (same `css/css-images/parsing/` dir):**
- `conic-gradient-calc-angle-percentage-invalid` 0/4 **AND** `-valid` 1/6 — a paired
  quest. Rejecting `calc(50% + 30deg)` in linear/radial stops (`<length-percentage>`
  context: % is length, mixing length+angle is a `calc()` type error) and
  `conic-gradient(from calc(50% + 30deg))` (`from` takes `<angle>`, not
  angle-percentage) and `calc(50% + 0)` (percentage + number). BUT the `-valid` file
  needs the harder half: **canonical calc-term reordering** for the legal
  angle-percentage case — `calc(0deg + 100%)` → `calc(100% + 0deg)`,
  `calc(90deg + 50%)` → `calc(50% + 90deg)`. That's a `calc()` serialization feature
  (order terms percentage-before-dimension), a bigger lift than a pure rejection gate.
- OR `background-image-invalid` 0/12 (in `css-backgrounds/parsing/`, NOT this dir) —
  a different gradient sub-grammar: negative radial radii `radial-gradient(circle
  -10px …)` + `cross-fade()` % rules `cross-fade(-1% red, green)`.
- OR a NEW `css/*/parsing/` dir (baseline `*-invalid` 0/N first).

grep `_gradientPosInvalid`.
