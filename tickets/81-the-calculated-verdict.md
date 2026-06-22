# Quest #81 — The Calculated Verdict ✅ SECURED (+126)

> *The Wave-2 specified-`calc()` serializer — the primitive named "next leverage (1)"
> since Quest #76, carried across five quests. A CSS Values 4 calculation-tree
> serializer that folds constants and imposes canonical order, scoped tightly to
> colour channels so the `serialize-values` hot path stays untouched.*

**Session:** 2026-06-22 · **Branch:** `engine-per-page-threads`

## The gap

Five quests of CSS-colour work (#75–#80) left ONE residual shape failing across the
whole `color-valid-*` frontier: a colour channel carrying a `calc()` (or other math
function). The specified-value path (`_canonColorSpecified` → `_computeModernColor`)
was deliberately GATED to channels with no nested `(` — a calc-bearing channel must
PRESERVE its math expression (unclamped, `%` symbolic), not evaluate it, and the
engine had no serializer for that. So every calc channel stored verbatim and failed
the canonical-serialization check.

Baseline (this session):

| Test | Before |
|------|:------:|
| `color-valid-lab` | 116/150 |
| `color-valid-color-function` | 277/340 |
| `color-valid-hwb` | 28/38 |
| `color-valid-relative-color` | 1127/1147 |

The 127 fails were ALL one missing primitive: **serialize a CSS calculation tree**
(CSS Values 4 §"Serialize a Calculation Tree"). Verified against the real WPT
sources — the required transforms:

- **fold a fully-numeric sum/product** of one unit to a single value, keeping its
  type: `calc(50 * 3)`→`calc(150)`, `calc(20deg * 2)`→`calc(40deg)`,
  `calc(50% * 3)`→`calc(150%)`, `calc(0.5 - 1)`→`calc(-0.5)`, `calc(0 / 0)`→`calc(NaN)`;
- **product number-first**: a product's numeric factors fold into ONE coefficient
  placed FIRST — `calc(g * 2)`→`calc(2 * g)`, `calc(a / 3)`→`calc(0.333333 * a)`
  (a numeric divisor becomes its reciprocal); a NON-numeric divisor stays a
  division (`calc(1 / l)` kept);
- **sum number-first**: the combined numeric constant moves FIRST —
  `calc(l - 20)`→`calc(-20 + l)`; non-numeric terms keep their source order;
- **products parenthesized in sums**: `calc(g * .5 + g * .5)`→
  `calc((0.5 * g) + (0.5 * g))`;
- a `<percentage>`/`<dimension>` stays SYMBOLIC (a % resolves against its channel
  reference only at COMPUTED time, never here).

## The fix (pure JS, `bootstrap.js`, NO new Rust)

A self-contained calculation-tree serializer, the dual of `_evalMath` (which fully
EVALUATES; this PRESERVES symbolic terms):

- **`_parseCalcTree(str)`** — recursive-descent parse into a tree of nodes:
  `num{v,u}` (u = '' | '%' | dimension), `sym{s}` (opaque ident — relative-colour
  channel keyword / unknown), `sum{terms:[{op,node}]}`, `prod{facs:[{op,node}]}`,
  `fn{name,args}` (a preserved function — `sign`/`min`/…). Constants `pi`/`e`/
  `infinity`/`nan` parse to `num` leaves. **Every `<angle>` unit is canonicalized to
  degrees at parse time** (see the angle gotcha below).
- **`_simpCalc(node)`** — fold + reorder: a fully-numeric same-unit sum/product
  collapses to one `num`; a product's numeric factors combine into a single
  coefficient placed first (a numeric divisor → reciprocal; `_mulUnit`/`_divUnit`
  track `number×dimension→dimension`, `dimension÷sameDimension→number`); a sum's
  combined numeric constant moves first. `calc()` unwraps; other functions keep
  (args simplified, not evaluated) — so `sign(1em - 10px)` (a sum of distinct units,
  irreducible) survives verbatim.
- **`_serCalcTree`/`_serCalcRoot`/`_serCalcNum`** — serialize with parens around
  every sum/product; the root sheds one outer layer (`calc(2 * g)`, not
  `calc((2 * g))`); a non-finite leaf → CSS keyword (`NaN`/`infinity`/`-infinity`).
- **`_canonMathExpr(str)`** — the public entry: parse → simplify → wrap (`calc(…)`).
- **`_calcConstValue(str)`** — returns the numeric value iff the calc folds to a
  single constant (no symbols, no preserved function, no relative unit) — the
  specified-time resolvability test (does NOT invent a px-per-em, unlike `_evalMath`).

Wiring — **only two colour-specific call sites** (the `serialize-values` calc hot
path is structurally untouched):

1. **`_computeModernColor(value, specified)`** — threaded a `specified` flag down
   through `_modernBody`/`_modernChannel`/`_modernAlpha`. When `specified` and a
   channel/alpha is a math function (`indexOf('(')`), it's serialized via
   `_canonMathExpr` (kept symbolic, unclamped); else it resolves+clamps exactly as
   the computed path. The `_canonColorSpecified` gate dropped its no-nested-paren
   guard and calls `_computeModernColor(s, true)`. At COMPUTED time `specified` is
   falsy → byte-identical to before.
2. **`_canonHwb`** — at specified time an hwb() whose hue is an unresolvable calc
   (sign/relative units) stays `hwb()` (`_hwbSpecified`: calc hue symbolic, `%`
   whiteness/blackness → `<number>`, alpha per the modern rule), while a calc that
   folds to a constant (`calc(infinity)`/`calc(0/0)`) still resolves to sRGB
   `rgb()` (with non-finite hue → 0, alpha clamped). `_computeHwb`'s resolvability
   now uses `_calcConstValue`, not `_evalMath`.
3. **`_canonRelativeColor`** — each `calc()`-bearing channel runs through
   `_canonMathExpr` (`calc(g * 2)`→`calc(2 * g)`, `calc(l - 20)`→`calc(-20 + l)`);
   bare keywords / `/` / replacement values kept verbatim.

## Result

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `color-valid-lab` | 116/150 | **150/150** | +34 ✅ 100% |
| `color-valid-color-function` | 277/340 | **340/340** | +63 ✅ 100% |
| `color-valid-hwb` | 28/38 | **38/38** | +10 ✅ 100% |
| `color-valid-relative-color` | 1127/1147 | **1146/1147** | +19 |

**+126. ZERO regressions.**

## The angle gotcha (a real regression caught + fixed)

`_canonRelativeColor`'s output is STORED as the specified value and later
RE-EVALUATED by the computed colour engine. So `_canonMathExpr` must be
SEMANTICS-PRESERVING. The first cut treated `rad`/`deg`/`grad`/`turn` as distinct
units: `calc(50rad / (50deg * (180 / pi)))` (which is a unitless `1` — angle ÷
angle) folded to `0.0175rad` instead of `1`, and when the computed engine
re-evaluated it, `sin(l * angle)` read `l` as DEGREES instead of a radian number —
corrupting two computed cases (`color-computed-relative-color` 1163→1162). Fix:
canonicalize every `<angle>` unit to degrees at parse time, so same-dimension
arithmetic cancels (`deg ÷ deg = number`). No specified colour test carries a
non-deg angle unit in a calc, so this is safe for the specified gains. Caught via
the stash-rebuild-baseline regression sweep — computed-relative restored to 1163.

## Zero-regression sweep

color-valid-lab 150, -color-function 340, -hwb 38, -relative-color 1146,
**color-computed-relative-color 1163** (restored), color-computed-lab 112,
color-computed-hwb 54, color-computed-color-function 466/468, color-computed-rgb 95,
color-computed-color-mix 919/948, color-valid-color-mix 674/677, color-valid 17,
color-computed 16, gradient-interpolation-method-valid 1398, gradient-position-valid
18, image-function-valid 13, Document-createElement 147, Element-getElementsByTagName
19; `cargo test -p obscura-dom --lib` 40/40. (`serialize-values` came back wpt.live
HTTP 404 `bodyLen=42` — serving flux, NOT a regression; provably untouched: the calc
serializer is wired ONLY into the colour-channel canon, never the generic value path.)

## Caps / Next leverage

**HONEST CAP — the 1 residual fail:** `rgb(from var(--color) calc(r * .3 + g * .59 +
b * .11) …)` — a `var()` origin makes `_canonRelativeColor` bail to verbatim
(pending-substitution), and `_canonStandardValue`'s numeric pass then normalizes
`.3`→`0.3` (a non-fuzzy exact-number quirk; the var() comparison is exact, not the
usual fuzzy colour compare). Architectural, shared with #78. Distinct from this quest.

**NEXT LEVERAGE:**
1. **`alpha(from …)`** (0/32) — relative-style alpha (the `alpha` keyword in calc,
   origin-colour resolution). A clean self-contained tail.
2. **`light-dark()` computed** — currently passes `valid` verbatim; computed should
   resolve to one branch (the 2 light-dark caps across the colour-computed family).
3. **`var()` custom-property registration / `sibling-index()`** — the computed-
   relative residual caps; needs registered custom-property resolution + tree-position
   functions.
4. **Generalize `_canonMathExpr` to the generic value path** — a `calc()` in `width`/
   `margin`/… (the `serialize-values` calc cap, `calc(10px + 1vmin + 10%)` additive
   ordering). Carries the real hot-path risk → own quest, scope tight + sweep hard.
5. fresh realm (`fetch/`, `html/dom/` reflection).
