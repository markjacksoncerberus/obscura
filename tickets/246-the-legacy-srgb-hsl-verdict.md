# Quest #246 — The Legacy-sRGB/HSL Verdict

> Realm: `css/css-color/parsing/` — the legacy-vs-modern **rgb()/rgba()/hsl()/hsla()**
> syntax gate in the shared `_isValidColor` primitive.
> **Result: +38, ZERO regressions.**

## The gap

The memory's "next leverage" pointer named `_isValidColor` as a root-cause primitive
needing **rgb()/hsl() argument-type consistency + arity checks** (it flagged the six
`color-invalid` caps documented in Quest #244). A baseline of `css/css-color/parsing/`
found a wide raw-store vein in the invalid tests:

| File | Before |
|------|:------:|
| `color-invalid-rgb.html` | 15/30 |
| `color-invalid-hsl.html`  | 8/23 |
| `color-invalid.html` | 8/11 |

`_isValidColor`'s rgb/hsl branch was far too lenient:
- **rgb/rgba** deferred entirely to `_rgbComponents`, which only counts 3–4
  top-level tokens and checks each *resolves* — it never enforced the legacy
  grammar.
- **hsl/hsla** split on `/[,\/\s]+/` and accepted any `none`-or-number token.

Neither distinguished the two non-interchangeable CSS Color 4 grammars:

- **Legacy (comma) syntax** — `fn(a, b, c[, α])`: the three channels must share
  ONE numeric type (all `<number>` OR all `<percentage>`); `none` is forbidden;
  hsl's saturation/lightness must be `<percentage>`; alpha may not be `none`;
  arity is exactly 3 or 4; separators are all commas.
- **Modern (space) syntax** — `fn(a b c[ / α])`: each channel an independent
  type, `none` allowed, alpha only after a single `/`.

So we accepted `rgb(10%, 50%, 0)` (mixed types), `rgb(none, none, none)` (none in
legacy), `hsl(0, 50, 30%)` (bare-number saturation), `rgb(257, 0, 5 / 0)` (mixed
`,`+`/`), `rgb(0, 0,, 0)` (doubled comma), `hsla(1,2,3,4,5)` (over-arity), etc.

## The fix (all `bootstrap.js`)

Three new helpers before `_isValidColor`, gating the rgb/hsl branch:

- **`_colorSepTokens(inner)`** — tokenizes a colour body into an ordered stream of
  value tokens `{v}` and hard separators `{s:','|'/'}`, respecting nested parens
  (calc). Whitespace delimits values but is not itself a separator, so a
  leading/trailing/doubled comma surfaces as a stray/adjacent `{s}`.
- **`_colorCompType(t)`** — classifies one component: `none | number | percentage
  | angle | math | invalid`. A token containing `(` is `math` — a **type wildcard**
  so `calc()`/`var()` colours stay valid.
- **`_validSrgbHsl(isHsl, inner)`** — the grammar. Rejects empty/leading/trailing/
  doubled separators and mixed `,`+`/`, then branches legacy vs modern and applies
  the per-syntax type + arity rules above.

Wired in: `rgb`/`rgba` → `_validSrgbHsl(false, inner) && _rgbComponents(inner) !== null`
(the resolver kept as a belt-and-suspenders second gate); `hsl`/`hsla` →
`_validSrgbHsl(true, inner)`. The lenient resolvers (`_rgbComponents`,
`_computeColor`) are untouched — they only ever run on values that already passed
the gate, so **computed output for valid colours is byte-identical**.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `color-invalid-rgb.html` | 15/30 | **30/30** ✅ |
| `color-invalid-hsl.html`  | 8/23 | **23/23** ✅ |
| `color-invalid.html` | 8/11 | **10/11** 🟡 |
| `css/css-logical/parsing/border-block-color-invalid.html` | 12/15 | **15/15** ✅ (bonus) |
| `css/css-logical/parsing/border-inline-color-invalid.html` | 12/15 | **15/15** ✅ (bonus) |

**+38.** The two logical-border bonuses are the exact `rgb(10%, 20, 30%)` type-mixing
caps documented in Quest #244 — the root-cause fix closed them for free.

## Zero-regression sweep

color-valid-rgb 48/70, color-valid-hsl 21/59, color-valid-hwb 26/38, color-valid-lab
150/150, color-valid 17/17, color-computed-rgb 79/99, color-computed-hwb 47/56,
color-computed-lab 112/120, color-computed 16/16 — **all held exactly**.
gradient-interpolation-method-valid 1398/1398 (heavy rgb() exercise),
background-computed 39/39, background-color-valid 9/9, border-color-valid 7/7. Held
realms: qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7.

## Caps / Next

- **CAP** — the lone remaining `color-invalid.html` fail is
  `hsl(calc(0.56turn * -0.43turn), 47%, 4884.6%)`: the hue calc multiplies two
  angles (`<angle>²`), which is dimensionally invalid, but `_colorCompType` treats
  any `(`-bearing token as a `math` wildcard. Rejecting it needs calc **type/unit**
  analysis (angle×angle → invalid), a broader concern than legacy/modern syntax —
  left as a documented cap.
- **NEXT** — the sibling modern-only functions in the same dir are the next lever:
  `color-invalid-hwb` 2/6 (hwb has **no** legacy comma form — `hwb(90deg, 50%, 50%)`
  must reject its commas) and `color-invalid-lab` 12/18 (lab/lch/oklab/oklch reject a
  bare 4th component — alpha requires `/`). Then the Kelvin-sign vein:
  `color-invalid-named-color` 153/184 (all 31 fails are `blacK`-style U+212A KELVIN
  SIGN look-alikes that JS `.toLowerCase()` wrongly folds to ASCII `k`; CSS keyword
  matching must be **ASCII**-case-insensitive → use `_asciiLower`).
- Beyond the invalid tests, the big valid-side vein is unresolvable-`calc()` colour
  **serialization** (color-valid-rgb 48/70, color-valid-hsl 21/59, color-valid-hwb
  26/38) — a channel with a non-foldable math fn must serialize the whole colour
  symbolically in modern form (`rgb(calc(…) 0 0 / 0.5)`); a separate, harder feature.
- grep `_validSrgbHsl` / `_colorSepTokens`.
