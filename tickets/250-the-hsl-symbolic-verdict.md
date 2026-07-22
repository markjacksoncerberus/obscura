# Quest #250 — The HSL-Symbolic Verdict

**Realm:** `css/css-color/parsing/color-valid-hsl.html`
**Result:** 21/59 → **59/59 (+38), ZERO regressions.**

## The gap

Took #249's next-leverage (the sibling hsl family). color-valid-hsl was 21/59, with
THREE distinct root causes among the 38 fails:

1. **`none`-preservation** — an hsl() with a `none` component must keep its own modern
   `hsl(...)` form (resolving to sRGB would erase the `none`):
   `hsl(120 100% 50% / none)` → `hsl(120 100 50 / none)` (s/l `%`-stripped to a bare
   `<number>`), `hsl(none none none)` → `hsl(none none none)`. We resolved to
   `rgb(0, 0, 0)`.
2. **Folding `calc()` → sRGB** — `hsl(calc(infinity) 100% 50%)` → `rgb(255, 0, 0)`,
   `hsl(90 50% 50% / calc(-infinity))` → `rgba(128, 191, 64, 0)`. `_computeColor`'s hsl
   branch used the regex `/^hsla?\(([^)]*)\)$/`, whose `[^)]*` CANNOT cross the inner
   `calc(…)` paren → the whole value fell through **verbatim**.
3. **Unresolvable calc → own-space** (same as #249's rgb):
   `hsl(calc(50deg + (sign(1em - 10px) * 10deg)), 0%, 0%, 50%)` →
   `hsl(calc(50deg + (10deg * sign(1em - 10px))) 0 0 / 0.5)`.

Note the asymmetry with rgb (#249): rgb() keeps `none`→0/legacy and switches to modern
ONLY for an unresolvable calc; hsl() switches to own-space for EITHER a `none` or an
unresolvable calc.

## The fix (all `bootstrap.js`)

- **`_hslSpecified(parts)`** — own-space `hsl(h s l[ / a])`: hue normalized into
  [0, 360) (calc kept symbolic via `_canonMathExpr`); saturation/lightness drop `%` to a
  bare `<number>` lower-clamped at 0 (`80%`→`80`, `-100`→`0`, `300`→`300`, calc kept
  symbolic); alpha per the modern rule (`_modernAlpha(tok, true)` — `50%`→`0.5`, `none`
  kept, ≥1 dropped, calc kept).
- **`_hslResolve(parts)`** — legacy sRGB path that evaluates each channel through
  `_evalMath` (so a folding `calc(infinity)` resolves: non-finite hue→0, alpha ±∞/NaN→
  the [0,1] bound via `_resolveChannel`), then `_hslToRgb` + `_serColor`. Byte-identical
  to the old `_computeColor` output for the plain cases it already handled
  (`hsl(120 30% 50%)`→`rgb(89, 166, 89)`).
- **`_hslSpecifiedOrResolve(inner)`** — split via `_splitTopLevel`; own-space when any
  component is `none` or `_colorTokIsSymbolic`, else resolve.
- **Dispatch** in `_canonColorSpecified` (alongside the #249 rgb branch): a top-level
  `hsl(`/`hsla(` value (var()/env()-guarded) routes ALL hsl serialization through
  `_hslSpecifiedOrResolve`, taking over from `_computeColor`'s primitive regex branch.

## Zero-regression sweep

color-valid-hsl 21→59 (100%). Held: color-valid 17/17, color-computed 16/16,
color-valid-rgb 70/70 (#249), color-valid-lab 150/150, color-computed-rgb 79/99,
color-invalid-hsl 23/23, color-invalid 10/11, color-invalid-named-color 184/184,
color-valid-hwb 26/38 (unchanged — #251 target), qsa 1975, classlist 1420,
serialize-values 695/697, gradient-interpolation-method-valid 1398/1398.

## Next leverage

**#251 hwb** — color-valid-hwb 26/38: `_hwbSpecified` ALREADY handles the symbolic
case (the 4 sign() cases pass); the 12 fails are all `none` components, which
`_computeHwb`'s `num()` turns into 0 (→ resolves to sRGB) rather than triggering
own-space. Fix = trigger `_hwbSpecified(parts)` when any component is `none`. grep
`_hslSpecified`/`_hwbSpecified`.
