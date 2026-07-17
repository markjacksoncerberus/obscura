# Quest #206 — The Angle-Percentage Verdict

**Realm:** `css/css-images/parsing/` (conic-gradient calc() `<angle-percentage>` stops)
**Result:** `conic-gradient-calc-angle-percentage-invalid` **0/4 → 4/4**, `-valid` **1/6 → 6/6**.
**+9, ZERO regressions.**
**Commit:** `feat(css-images): a calc() dimensional type-check + specified-value reorder for conic gradient stops`

## The gap

A PAIRED quest — #205's next-leverage. Both files probe `calc()` mixing an angle and a
percentage inside gradient colour stops, and both halves were genuinely unimplemented:

- `-invalid` **0/4** — four values the property must REJECT on a calc() type error.
- `-valid` **1/6** — five conic stops whose `calc()` position must **reorder** on
  serialization (the one already-canonical case passed).

The root cause for both: `_evalMath` *numerically* sums a calc() but never type-checks it
(`50% + 30deg` evaluates to a plain number, no error), and specified-mode gradient stops
passed through **verbatim** (only the *computed* path canonicalized stop positions). So no
calc() in a specified stop was ever type-checked or reordered.

The spec grammar being enforced:

- A gradient colour-stop / hint **position** is `<length-percentage>` for linear/radial,
  `<angle-percentage>` for conic.
- A conic gradient's `from` angle is a pure `<angle>` — **not** `<angle-percentage>`.

## The invalid half (+4) — a focused calc() dimensional type-check

```
linear-gradient(red calc(50% + 30deg), blue)     → angle in an <length-percentage> stop
radial-gradient(red calc(50% + 30deg), blue)      → angle in an <length-percentage> stop
conic-gradient(from calc(50% + 30deg), red, blue) → % in a pure-<angle> `from`
conic-gradient(red calc(50% + 0), blue)           → bare <number> added to a %
```

New helpers (before `_gradientConfigInvalid`):

- **`_dimKindOfTok(t)`** → `'num'|'len'|'ang'|'pct'|'other'` for one simple token
  (`_ANGLE_DEG`/`_LENGTH_PX` decide unit class; unknown units like `vw`/`cqw` → `'other'`).
- **`_calcSumKind(body)`** classifies ONLY a flat sum of simple terms (a term carrying a
  product `*`/`/` or nested group → `'other'` → DEFER, never reject). Returns `'bad'` when
  the sum mixes types that can never add — a `<number>` with a dimension/%, or a `<length>`
  with an `<angle>` — else `len`/`ang`/`pct`/`len-pct`/`ang-pct`.
- **`_gradientCalcBad(tok, ctx)`** — for a bare `calc( … )` token, reject per context
  `ctx ∈ 'lp' | 'ap' | 'angle'`: `lp` rejects angle-bearing kinds, `ap` rejects
  length-bearing kinds, `angle` rejects any %/length; `'bad'` is rejected in every context.
  Non-`calc()` tokens (colours, min/max/nested math) DEFER.

Wired through the EXISTING `_gradientInvalid` gate (already in both setProperty paths):

- The `from`-angle check sits inside `_gradientConfigInvalid` (conic only): find `from`,
  test `_gradientCalcBad(next, 'angle')`.
- The stop-calc check sits in `_gradientInnerInvalid`. **Crucially the unconditional
  `_gradientConfigInvalid(args[0])` call is kept** (so the 292 interpolation-method
  rejections are untouched); the stop-calc check is added on **non-config** args only —
  `_isGradientConfig(args[0])` decides whether `args[0]` is a real config (`from …`/`at …`)
  or actually a colour stop (`red calc(50% + 0)`, test 4). This ordering also means a valid
  conic `at calc(50% + 10px)` position (length-percentage) inside a config is never
  stop-typed under the `'ap'` context and mis-rejected.

## The valid half (+5) — specified-value calc() reorder

```
conic-gradient(red, calc(0deg + 100%), blue)  → conic-gradient(red, calc(100% + 0deg), blue)
conic-gradient(red calc(0deg + 100%), blue)   → conic-gradient(red calc(100% + 0deg), blue)
conic-gradient(red calc(90deg + 50%), blue)   → conic-gradient(red calc(50% + 90deg), blue)
conic-gradient(red calc(90deg + 0%), blue)    → conic-gradient(red calc(0% + 90deg), blue)   [zero % preserved]
conic-gradient(red calc(100% - 45deg), blue)  → unchanged (already % first)
repeating-conic-gradient(red calc(90deg + 50%), blue) → …calc(50% + 90deg)…
```

New `_canonGradientStopSpecified(arg)` runs in `_canonGradientInner`'s `else` (specified)
branch. It maps each stop token and canonicalizes **only** a `calc(` token, via the
existing `_canonSortedCalc` — which already applies the CSS Values 4 mixed-unit term
ordering (number, then percentage, then dimension). Colours and plain position tokens stay
byte-identical, so no non-calc stop's specified serialization changes. `_canonSortedCalc`
preserves the `0%` term (it sorts the raw sum terms rather than folding the additive
identity away).

## Zero-regression sweep

gradient-interpolation-method-valid 1398/1398 · -invalid 292/292 · -computed 932/932 ·
gradient-position-valid 18/18 · -invalid 9/9 · image-function-valid 13/13 · -invalid 6/6 ·
object-position-valid 18/18 · object-fit-invalid 5/5 · -valid 9/9 · image-orientation-invalid
12/12 · image-rendering-invalid 2/2 · image-resolution-valid 12/12 · background-image-valid
13/13 · -invalid 12/12 · background-valid 45/46 (pre-existing cap) · background-computed 39/39 ·
mask-image-computed 47/47 · cursor-invalid 10/10 · line-clamp-valid 18/18 · qsa 1975/1975.

## Caps / Next

- **CAP:** none in these two files (4/4, 6/6).
- The specified-stop path is now calc-aware — this is the first specified-value stop
  serialization change (previously verbatim). Any future stop-serialization work (e.g.
  linear/radial length-percentage stop calc reorders) can extend `_canonGradientStopSpecified`.
- **Next leverage (same `css/css-images/parsing/` dir):** baseline the remaining
  `*-invalid`/`*-valid` gradient files for raw-store tells (an `*-invalid` at 0/N), e.g.
  `radial-gradient-*` / `linear-gradient-*` parsing files; OR move to a NEW `css/*/parsing/`
  dir (baseline `*-invalid` 0/N first). grep `_gradientCalcBad`.
