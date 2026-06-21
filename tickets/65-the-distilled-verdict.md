# Scroll 65 — The Distilled Verdict ⚔️

> *A gradient writes its defaults in full, then the computed value distils them
> away: `to bottom` evaporates, `ellipse farthest-corner` dissolves to nothing,
> and what remains is only what was chosen. Quest #64 taught the radial sun its
> centre; this one teaches every gradient to forget what it never needed to say.*

**Realm:** `css/css-variables/variable-substitution-background-properties`
**Banner secured:** 2026-06-21 · **+2**

## The gap

#64's named "next leverage (1)" — **gradient default-token canonicalization**.
`variable-substitution-background-properties` was 8/10; the 2 remaining fails were
gradient values that, after `var()` substitution, must compute by dropping tokens
equal to their grammar defaults:

| Subtest | Substituted input | Expected computed |
|---------|-------------------|-------------------|
| `background-image-linear-gradient` | `linear-gradient(to bottom, rgb(30,87,0) 0%,rgb(125,232,185) 100%)` | `linear-gradient(rgb(30, 87, 0) 0%, rgb(125, 232, 185) 100%)` |
| `background-image-radial-gradient` | `radial-gradient(ellipse farthest-corner at 25px 25px, black 10%, green 90%)` | `radial-gradient(at 25px 25px, rgb(0, 0, 0) 10%, rgb(0, 128, 0) 90%)` |

Two gaps in #64's canonicalizer:

1. **`linear-gradient` was never matched** — `_GRADIENT_HEAD` only recognized
   `radial`/`conic`, so a linear gradient passed through verbatim. Its direction
   prelude (`to <side-or-corner>` / `<angle>`) needs the default `to bottom`
   dropped at computed time.
2. **Radial shape/size prelude kept verbatim** — `_canonGradientConfig` split off
   the `at <position>` clause but returned the prelude (`ellipse farthest-corner`)
   unchanged. Computed serialization drops the default shape (`ellipse`) and the
   default size (`farthest-corner`).

Colour-stop computation was *already* handled by #64's `_canonGradientStop` via
`_computeColor` — and `_computeColor` already whitespace-normalizes
(`rgb(30,87,0)`→`rgb(30, 87, 0)`) and resolves named colours (`black`→`rgb(0, 0,
0)`, `green`→`rgb(0, 128, 0)`). The per-layer `.join(', ')` normalizes comma
spacing. So the only missing pieces were the two default-token drops above.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

Extended #64's self-contained gradient canonicalizer to be **gradient-type-aware**:

1. **`_GRADIENT_HEAD`** now matches `linear` too; `_canonGradients` derives a
   `type` (`'linear'`/`'radial'`/`'conic'`) from the matched function head and
   threads it through to `_canonGradientInner` → `_isGradientConfig` /
   `_canonGradientConfig`.

2. **`_isGradientConfig(arg, type)`** — type-aware first-argument detection. For
   `linear`, a config is `to …` or a lone `<angle>` (new `_isAngle`/`_ANGLE_RE`
   matching `deg`/`grad`/`rad`/`turn` + `calc(`); a bare colour like `red` is
   never mistaken for one). For `radial`/`conic`, the existing `at`/`from`/shape/
   size detection.

3. **`_canonGradientConfig(arg, el, computed, type)`** branches:
   - **linear** — keep the direction tokens, but at computed time **drop a default
     `to bottom`** (returns `''`, filtered out by the layer join).
   - **radial/conic** — split off the `at <position>` clause as before; for
     **radial at computed time**, run the prelude through new
     **`_canonRadialPrelude`**, which filters the default `ellipse` shape and
     `farthest-corner` size while keeping `circle` / explicit lengths / non-default
     sizes. A position resolving to `50% 50%` still drops the whole `at` clause
     (the #64 behaviour).

Worked example (radial, computed):
`['ellipse','farthest-corner','at','25px','25px']` → prelude
`['ellipse','farthest-corner']` → `_canonRadialPrelude` → `[]` → prelude `''`;
`at 25px 25px` survives → config `at 25px 25px`; stops `black 10%`→`rgb(0, 0, 0)
10%`, `green 90%`→`rgb(0, 128, 0) 90%` → `radial-gradient(at 25px 25px, rgb(0, 0,
0) 10%, rgb(0, 128, 0) 90%)`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-variables/variable-substitution-background-properties` | 8/10 | **10/10** |

**+2.**

## Zero regressions

The new linear branch and the radial prelude filter are tightly scoped:

- **gradient-position-valid 18/18, gradient-position-computed 43/43** — byte-identical.
  Their configs are all `at`-only with an empty prelude, so `_canonRadialPrelude`
  (computed-only) finds nothing to drop, and none are `linear`.
- **serialize-values 695/697** — held; the test sets no gradient values at all, so
  the specified-mode gradient path is never exercised there.
- background-position 31/32, -computed 32/32, object-position 18/16,
  transform-origin-computed 23/23, var-substitution-filters 7/7, -shorthands 51/51,
  var-definition 71/73, color-computed 16/16, shorthand-serialization 7/7,
  Element-matches 669/669, Document-createElement 147/147; **obscura-dom 40/40**.

## Caps / Next leverage

1. **More `<image>` props** — `mask-image` / `list-style-image` /
   `border-image-source` carry the same gradient grammar; baseline then add to
   `_GRADIENT_PROPS`.
2. **Broader linear/conic computed canon** — angle normalization (`0deg`,
   `1turn`→`360deg`?), gradient interpolation-method hints (see
   `gradient-interpolation-method-{valid,computed}`).
3. **Comprehensive valid-property registry** — csstext unknown-prop drop
   (serialize-values hot-path risk).
4. **Fresh realm** (`fetch/`, `html/dom/` reflection).
