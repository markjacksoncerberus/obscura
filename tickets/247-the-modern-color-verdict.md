# Quest #247 — The Modern-Color Verdict

> Realm: `css/css-color/parsing/` — the modern-only colour functions
> **hwb() / lab() / lch() / oklab() / oklch() / color()** separator grammar in
> `_computeModernColor`. **Result: +44, ZERO regressions.**

## The gap

`_computeModernColor` (which doubles as the validity gate for these functions via
`_isValidColor`'s fall-through) split every body with `_splitTopLevel`, which
treats `,` `/` and space as one interchangeable delimiter. The modern colour
functions have a single strict separator grammar — space-separated components with
an optional trailing `/ <alpha>`, and **NO commas** — so the comma-blind split
wrongly accepted:

- **hwb** has no legacy comma form at all: `hwb(90deg, 50%, 50%)` /
  `hwb(90, 50%, 50%, 0.2)` — the commas made it look like 3–4 clean parts.
- **lab/lch/oklab/oklch** take exactly three components + an optional `/`-alpha, so
  a bare 4th component is invalid: `lab(0% 0 0 1)`, `lab(0% 0 0 10%)`,
  `lch(20% 10 10deg 10)` — the space-separated `1`/`10%`/`10` was mistaken for alpha.
- **color()** likewise accepted a comma'd body (`color(srgb, 1, 0, 0)`) and other
  separator violations.

| File | Before |
|------|:------:|
| `color-invalid-hwb.html` | 2/6 |
| `color-invalid-lab.html`  | 12/18 |
| `color-invalid-color-function.html` | 90/124 |

## The fix (all `bootstrap.js`)

New **`_modernColorParts(inner)`** — reuses #246's `_colorSepTokens` to split a
modern colour body into `{comps, alpha}`, returning null on any comma, a duplicated
or misplaced `/`, a stray/leading/trailing/doubled separator, or a bare (non-`/`)
trailing alpha. `alpha` is non-null only when a single top-level `/` preceded
exactly one final value.

`_computeModernColor` now routes hwb / lab-family / color() through
`_modernColorParts` instead of `_splitTopLevel`, and enforces the exact component
arity on `mp.comps` (hwb 3, lab-family 3, color() 4 incl. the colour-space) — so a
bare 4th component no longer slides into the alpha slot. `_computeHwb` was retimed
to take `(comps, alpha, specified)` (it rebuilds the flat `[h w b α?]` array its
resolvers and `_hwbSpecified` already expect). The channel resolvers themselves are
untouched → **computed output for valid colours is byte-identical**.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `color-invalid-hwb.html` | 2/6 | **6/6** ✅ |
| `color-invalid-lab.html`  | 12/18 | **18/18** ✅ |
| `color-invalid-color-function.html` | 90/124 | **124/124** ✅ (bonus) |

**+44.** The +34 on `color-invalid-color-function` (a documented Quest #192 baseline
of 90/124) is a bonus from the same guard — **stash-proved** against the post-#246
build (90/124 without the change, 124/124 with it).

## Zero-regression sweep

color-valid-hwb 26/38, color-valid-lab 150/150, color-computed-hwb 47/56,
color-computed-lab 112/120, color-valid-color-function 340/340,
color-computed-color-function 466/468 (2 pre-existing), color-invalid-color-function
124/124 — all held/gained exactly. #246 held: color-invalid-rgb 30/30,
color-invalid-hsl 23/23, color-valid-rgb 48/70, color-valid-hsl 21/59. Held realms:
qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing).

## Caps / Next

- **CAP** — the valid-side symbolic-`calc()` serialization gap persists
  (color-valid-hwb 26/38: a channel with an unresolvable math fn must keep the whole
  colour symbolic in modern form). Separate, harder feature; out of scope here.
- **NEXT** — `color-invalid-named-color` 153/184: all 31 fails are `blacK`-style
  U+212A KELVIN SIGN look-alikes that JS `.toLowerCase()` folds to ASCII `k`. CSS
  keyword matching must be ASCII-case-insensitive → swap the `.toLowerCase()` in
  `_isValidColor`'s keyword-comparison path for the existing `_asciiLower`.
- grep `_modernColorParts` / `_colorSepTokens`.
