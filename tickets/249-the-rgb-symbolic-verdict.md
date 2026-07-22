# Quest #249 — The RGB-Symbolic Verdict

**Realm:** `css/css-color/parsing/color-valid-rgb.html`
**Result:** 48/70 → **70/70 (+22), ZERO regressions.**

## The gap

Took #248's next-leverage: the big VALID-side vein — unresolvable-`calc()` colour
serialization. `color-valid-rgb` was 48/70; **all 22 fails were identical in shape**:
an rgb()/rgba() channel or alpha holding a math function that cannot fold at
parse time because it depends on a font-relative unit —
`calc(50% + (sign(1em - 10px) * 10%))`. `1em` isn't known until computed-value
time, so the value can't be resolved to a concrete sRGB triple.

Per CSS Color 4, such a colour serializes in **modern** syntax, kept symbolic:

```
rgb(calc(50% + (sign(1em - 10px) * 10%)), 0%, 0%, 50%)
  → rgb(calc(50% + (10% * sign(1em - 10px))) 0 0 / 0.5)
```

We instead resolved it eagerly (inventing 16px/em) to `rgba(153, 0, 0, 0.5)`.

## Why only these 22

Everything else in the file already passed:
- Bare `none` channels resolve to `0` and serialize **legacy** (`rgb(none none none)`
  → `rgb(0, 0, 0)`) — rgb() switches to modern form ONLY for an unresolvable calc,
  NOT for `none` (unlike hsl/hwb — see #250/#251).
- `calc(infinity)`/`calc(-infinity)`/`calc(NaN)` **fold** to a constant → resolve to
  the channel bound (`rgb(calc(infinity), 0, 0)` → `rgb(255, 0, 0)`) via the existing
  `_rgbComponents`/`_resolveChannel` path.

So the change is surgical: intercept ONLY when a channel/alpha is a non-foldable calc.

## The fix (all `bootstrap.js`)

- **`_colorTokIsSymbolic(tok)`** — a token is "symbolic" (unresolvable) iff it contains
  a `(` AND `_calcConstValue(tok) === null` (it doesn't fold to a single numeric leaf).
  `_calcConstValue` never invents a px-per-em, so `sign(1em - 10px)` is correctly
  irreducible, while `calc(infinity)`/`calc(50% + 10%)` fold and are NOT symbolic.
- **`_rgbModern(parts)`** — SPECIFIED serialization when any of the 3 channels / alpha
  is symbolic: always `rgb(` (never rgba); each concrete channel resolves to a clamped
  0-255 `<integer>` (`0%`→`0`, `400`→`255`, `-400`→`0`) via `_resolveChannel`+round; a
  `none` stays `none`; the symbolic channel keeps its canonically-serialized `calc()`
  via `_canonMathExpr` (which reorders a product's operands: `sign(1em-10px) * 10%` →
  `10% * sign(1em-10px)`); alpha follows the modern-alpha rule (`50%`→`0.5`, symbolic
  kept, ≥1 dropped) via `_modernAlpha(tok, true)`. Returns null when nothing is
  symbolic → the caller resolves to legacy sRGB via `_computeColor`.
- **Dispatch** in `_canonColorSpecified`, after the color-mix branch and before the
  `_computeColor` fallback: for a top-level `rgb(`/`rgba(` value (var()/env()-guarded),
  run `_rgbModern(_splitTopLevel(inner))`; return it if non-null.

The lenient resolvers (`_rgbComponents`, `_computeColor`) are UNTOUCHED and only run
when `_rgbModern` declines → every already-passing value is byte-identical.

## Zero-regression sweep

color-valid-rgb 48→70 (100%). Held: color-valid 17/17, color-computed 16/16,
color-valid-lab 150/150, color-computed-rgb 79/99 (pre-existing computed caps),
color-computed-color-function 466/468 (2 pre-existing), color-invalid-rgb 30/30,
color-invalid-hsl 23/23, color-invalid-named-color 184/184, color-invalid 10/11
(the #246 `<angle>²` cap), qsa 1975, classlist 1420, serialize-values 695/697,
gradient-interpolation-method-valid 1398/1398 (real path is `css/css-images/parsing/`).

**Cap / Note:** `color-computed-hsl.html` could-not-run — a PRE-EXISTING harness
page-load gap (stash-proved identical on the pre-#249 build), NOT a regression; it
was never in the campaign's held-realm list.

## Next leverage

The SAME symbolic/none machinery applies to the sibling families:
- **#250 hsl** — color-valid-hsl 21/59: own-space `hsl(...)` for a `none` OR
  unresolvable-calc component (`hsl(120 100% 50% / none)` → `hsl(120 100 50 / none)`,
  s/l `%`-stripped, negative→0); AND fix `hsl(calc(infinity) …)` → rgb (the current
  `_computeColor` hsl regex can't cross the inner `calc()` paren).
- **#251 hwb** — color-valid-hwb 26/38: `_hwbSpecified` already handles the symbolic
  case; just needs to also trigger on a `none` component.
grep `_rgbModern`/`_colorTokIsSymbolic`.
