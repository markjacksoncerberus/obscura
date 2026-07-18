# Scroll 83 — The Contrasted Verdict (`contrast-color()`, CSS Color 5)

**Quest #83 · session 2026-06-23 · +27**

## The gap

CSS Color 5's `contrast-color( <color> )` resolves at computed-value time to
whichever of **black/white** contrasts more with its single `<color>` argument.
Obscura had no notion of it — the natural sibling of the `alpha()` quest (#82):

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-color/parsing/color-valid-contrast-color-function.html` | 15/17 | **16/17** |
| `css/css-color/parsing/color-invalid-contrast-color-function.html` | 0/9 | **9/9** |
| `css/css-color/parsing/color-computed-contrast-color-function.html` | 0/17 | **17/17** |

The same three failure modes as `alpha()`:
- **computed** fell through to verbatim (`contrast-color(white)` stored as-is, not
  resolved to `rgb(0, 0, 0)`/`rgb(255, 255, 255)`) → 0/17;
- the colour-property setter **validates no colours**, so every malformed form
  (`contrast-color()`, `contrast-color(max white)`, `contrast-color(white white)`)
  was accepted → invalid 0/9;
- a handful of valid forms needed canon (the `calc()` inner-colour case).

## The work (pure JS, `bootstrap.js`, NO new Rust)

Built directly on the #79 structured cross-space colour engine + #82's alpha()
scaffolding, mirroring that quest's shape:

- **`_parseContrastColor`** — shared strict-grammar parser → `{ color }` (the raw
  inner token string) or null. The function name must be `contrast-color` with a
  single non-empty argument. The argument is ONE `<color>` (may itself contain
  spaces / `/` / commas inside its own parens — `color(srgb 1 0 1 / 0.5)`,
  `rgb(255, 0, 0)`), so we keep the whole inner verbatim and let `_isValidColor`
  judge it.
- **`_isValidContrastColor`** — the inner must be a valid `<color>` (a `var()`
  passes without resolving). `white white` / `max white` / `1` → not a single
  colour → invalid. Wired into `_isValidColor` + a NARROW setter drop (the
  existing `alpha(`-scoped drop regex generalized to
  `/^(?:alpha|contrast-color)\(/i` — drops only a `contrast-color(`-prefixed value
  that fails `_isValidColor`, so every other colour is untouched).
- **`_canonContrastColor`** (SPECIFIED, dispatched from `_canonColorSpecified`
  before the modern-colour branch) — canonicalize the inner via
  `_canonColorSpecified` recursively, re-emit `contrast-color(<canon>)`. This wins
  the `calc()` valid case: `contrast-color(color(srgb calc(0.5) calc(1 + 1 / 1) 1 /
  .5))` → `contrast-color(color(srgb calc(0.5) calc(2) 1 / 0.5))` via the #81
  Wave-2 calc serializer threading through `_computeModernColor(s, true)`.
- **`_contrastStruct`** (COMPUTED) — resolve the inner via `_resolveColorStruct`
  (gained a `contrast-color(` dispatch, so a nested `contrast-color()` and
  `contrast-color()`-as-color-mix-component / -relative-origin resolve
  automatically), then pick black or white by the WCAG-2.1 contrast ratio: the
  colour's relative luminance L is the **Y of its XYZ-D65 form**; black wins iff
  `(L + 0.05) / 0.05 >= 1.05 / (L + 0.05)`. The argument's alpha plays no part.
- **`_computeContrastColorComputed`** — top-level serialization: a sRGB black/white
  serializes in the **legacy `rgb()` form when standalone**
  (`contrast-color(white)` → `rgb(0, 0, 0)`); nested inside color-mix()/relative
  colour it is resolved via `_resolveColorStruct` and serialized in that context's
  own space (`color-mix(in srgb, contrast-color(blue) 100%, purple)` →
  `color(srgb 0 0 0)`, `rgb(from contrast-color(blue) r g b)` → `color(srgb 0 0 0)`).
  Wired into `_normComputed` after the alpha dispatch.

### Root-cause primitive: `_SYSTEM_COLOR_RGB`

`contrast-color(buttonface)` exposed that system-colour keywords had **no
structured form** — `_SYSTEM_COLORS` was a name-only Set (their used value is
UA-defined; the computed value stays the lowercased ident, like named keywords).
Added `_SYSTEM_COLOR_RGB`, an approximate light-theme sRGB map (Chromium
defaults), used ONLY as a fallback inside `_contrastStruct` so a
`contrast-color(<system-color>)` has a luminance to choose against (a keyword
absent from the map → neutral mid grey). Tightly scoped — the system-colour
computed path is untouched, no other test sees these values.

## Why the WPT computed test is sound either way

`color-computed-contrast-color-function` accepts **EITHER** `rgb(0, 0, 0)` OR
`rgb(255, 255, 255)` for every case (the exact contrast algorithm — WCAG 2.1 vs
APCA — isn't pinned in the spec yet). So our honest WCAG-2.1 luminance pick stays
sound even at the L≈0.18 crossover, and out-of-gamut inputs
(`color(srgb 10 10 10)` → L huge → black; `color(srgb -10 -10 -10)` → L negative →
white) are fine.

## Caps / Next

- **CAP (1, valid):** `color-mix(contrast-color(blue) 100%, purple)` — this line
  **lacks the spec-required `in <colorspace>`** in `color-mix()`. Our engine
  leniently accepts a no-`in` color-mix and applies the standard percentage-fill
  rule, producing `color-mix(contrast-color(blue) 100%, purple 0%)` (which is what
  a spec engine produces for the `in`-bearing form — `100%`/omitted → `100%`/`0%`,
  not 50/50, so both serialize). The test expects the input round-tripped verbatim
  (`…purple)`). Matching it would require changing the **shared** percentage-fill
  rule and risks the color-mix-valid realm (674/677) — not worth 1 dubious
  subtest. Likely a test bug (an `in srgb` typo).

- **Next leverage (unchanged from #82):** (1) `light-dark()` computed — passes
  valid verbatim, computed should resolve to one branch (2 light-dark caps in
  colour-computed). (2) `var()` custom-property registration / `sibling-index()`
  COMPUTED resolution (6 color-computed-relative residual caps; `sibling-index()`
  now parses in calc since #82). (3) generalize `_canonMathExpr` to the generic
  value path (serialize-values additive-ordering cap + cursor `calc(2 + 0)`; REAL
  hot-path risk → own quest, scope tight + sweep hard). (4) `none`-component
  structured storage (~28 hsl/hwb color-mix caps). (5) fresh realm.

## Zero-regression sweep (all green)

color-computed-relative **1163**, computed-color-mix **919/948**, valid-relative
**1146/1147**, valid-color-mix **674/677**, alpha-computed **32**,
alpha-valid **45**, alpha-invalid **18**, valid-lab **150**,
valid-color-function **340**, valid-hwb **38**, computed-color-function **466/468**,
computed-hwb **54/56**, **serialize-values 696/697** (hot path byte-identical —
all changes gated behind a `contrast-color(` prefix), color-valid **17**,
color-computed **16**, gradient-interpolation-valid **1398**,
createElement **147**, getElementsByTagName **19**;
`cargo test -p obscura-dom --lib` **40/40**.
