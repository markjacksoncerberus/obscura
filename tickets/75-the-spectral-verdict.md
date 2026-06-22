# Quest #75 — The Spectral Verdict

> *Colour is the whole spectrum, not just the corner of it browsers learned first.
> A child's drawing app, a designer's palette, a government form's brand colour —
> all of it spoken in `lab`, `oklch`, `color(display-p3 …)`. Today Obscura computes
> those tongues true, each in its own space, and names — honestly — the dozen tests
> that ask for a container we have no room to measure.*

**Realm:** `css/css-color/parsing/color-computed-{lab,hwb,color-function}` (the
modern `<color>` functions whose **computed** value stays in their own colour space,
plus `hwb()` → sRGB)
**Hold:** color-computed-lab **112/120**, color-computed-hwb **54/56**,
color-computed-color-function **466/468** (+632)
**Status:** ✅ SECURED — pure JS (`crates/obscura-js/js/bootstrap.js`), no new Rust.

---

## The gap

Obscura's `_computeColor` understood only the *legacy* sRGB forms — named colours,
hex, `rgb()`/`rgba()`, `hsl()`/`hsla()` — and returned everything else **verbatim**.
So every modern colour function computed `0/N`, and there were two distinct reasons
each subtest failed:

1. **The support check.** `test_computed_value` first asserts
   `CSS.supports('color', specified)`. That routes to `_isValidColor`, which only
   recognised the legacy forms → `false` for `lab()`/`hwb()`/`color(…)` → the test
   bailed before ever reading the computed value.
2. **The value.** Even past the support check, `getComputedStyle(el).color` returned
   the input verbatim instead of the canonical computed serialization.

Baselines: `color-computed-lab` **0/120**, `color-computed-hwb` **0/56**,
`color-computed-color-function` **0/468**.

## The insight

CSS Color 4 serialises the *computed* value of these functions **in their own colour
space** — there is **no cross-space conversion**:

- `lab()`/`lch()`/`oklab()`/`oklch()` → the same function, channels canonicalised.
- `color(<space> …)` → `color(<space> …)`, channels canonicalised (`color(xyz …)`
  aliases to `color(xyz-d65 …)`).
- `hwb()` is the one exception — it is a legacy sRGB form and computes to
  `rgb()`/`rgba()`.

That is the whole reason this quest is tractable in one session: the hard part of
modern colour (the matrices that convert sRGB↔Lab↔OKLab↔XYZ, gamut mapping,
interpolation) is **only** needed for `color-mix()` and relative colour — which stay
`0` here and are named as the next, bigger prize.

## The fix

All pure JS in `bootstrap.js`, all on the **computed** path only.

**`_computeModernColor(value)`** — parse the function name + inner; dispatch:

- **`lab`/`lch`/`oklab`/`oklch`** — split the inner with `_splitTopLevel` into 3
  channels (+ optional alpha), resolve each through `_modernChannel` against a
  per-function spec table `_MODERN_LAB_FNS`.
- **`color(<space> …)`** — peel `parts[0]` as the colour space (validated/aliased
  via `_COLOR_FN_SPACES`, `xyz`→`xyz-d65`, lowercased), then 3 channels (+ alpha),
  each `{ base: 1, clamp: null }` (so `%`→`/100`, and `200`/`-0.25` are **not**
  clamped).
- **`hwb`** — `_computeHwb`.

**`_modernChannel(tok, spec)`** — the heart of the canonicalisation:

- `none` → preserved verbatim.
- a **hue** channel (`spec.hue`): `_evalMath` with `angle`+`lengths`, `NaN`→0,
  normalise `((v%360)+360)%360`, serialise at **6 significant figures**
  (`1.28rad`→`73.3386`, matching the gradient `<angle>` serialiser).
- otherwise: `_evalMath(tok, spec.base, …)` — `spec.base` is the value of `100%` for
  that channel (lab L→100 / a,b→125; oklab L→1 / a,b→0.4; lch C→150; oklch C→0.4;
  `color()`→1) — then `NaN`→0, `±∞`→clamp bounds, and `spec.clamp` (L: [0,100] lab/
  lch, [0,1] ok\*; C: [0,∞); a/b & `color()`: none).

**`_modernAlpha(tok)`** — `none` kept (`/ none` always serialised); else resolve,
clamp [0,1]; a value **≥ 1 drops** the `/ a` entirely; otherwise `/ <number>`.

**`_computeHwb(inner)`** — pure-hue sRGB (`_hslToRgb(h, 1, 0.5)`) scaled by
whiteness/blackness: `channel = pure·(1−w−b) + w`; `w+b ≥ 1` → grey `w/(w+b)`; `none`
→ 0. The channels are **snapped to 6 decimals** before `_serColor`'s round-to-int,
because `1·(1−0.3−0.5)+0.3` evaluates to `0.49999999999999994` (float drift) →
`127.4999…`·… which would round **down** to 127; the snap restores the exact 127.5 →
**128** the spec expects.

**Wiring** — `_normComputed`'s colour branch becomes
`_computeModernColor(v) ?? _computeColor(v)`. **The specified path
(`_canonColorSpecified`) is deliberately left alone** (see Caps). `_isValidColor`
(used by `CSS.supports`) gains a final `if (_computeModernColor(value) !== null)
return true;` so the support check passes for exactly the forms we can compute.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `color-computed-lab.html` | 0/120 | **112/120** |
| `color-computed-hwb.html` | 0/56 | **54/56** |
| `color-computed-color-function.html` | 0/468 | **466/468** |

**+632.**

## Zero-regression sweep

- color-computed **16/16**, color-computed-rgb **95/99** (4 pre-existing
  support-check fails), color-computed-named-color **455/455**, color-computed-hex
  **6/6** — the legacy `_computeColor` path untouched.
- color-valid **17/17**, **color-valid-lab 54/150**, **color-valid-color-function
  81/340** — **UNCHANGED** from baseline: the specified path is genuinely untouched.
- gradient-interpolation-method-valid **1398**, gradient-position-computed **43**,
  serialize-values **696/697** (the 1 fail is the pre-existing `calc()`
  additive-ordering cap), variable-substitution-background-properties **10**,
  Document-createElement **147**.
- `cargo test -p obscura-dom --lib` **40/40**.

## Caps (named honestly)

- **The 12 remaining fails are ALL `sign(2cqw - 10px)` container-query-unit cases**
  (8 lab + 2 hwb + 2 color-function). `2cqw` = 2% of the query container's width;
  resolving it needs layout + container-query context, which Obscura does not have,
  so `_evalMath` fails on the `cqw` token and the colour stays verbatim. Genuinely
  unwinnable for us today.

## Next leverage

1. **Specified-path modern colour** (`color-valid-{lab,hwb,color-function}` ≈ 528
   more) — the harder sibling. The specified serialisation **preserves `calc()`
   wrappers** (`lab(calc(50*3) …)` → `lab(calc(150) …)`, **not** clamped to 100) and
   leaves a/b/C `<percentage>` **unresolved** (`lab(calc(50%) …)` stays `calc(50%)`)
   while still resolving *bare* numbers/percentages and clamping them. A distinct
   engine from this computed one — and it must NOT regress the 54/81 already passing.
2. **`color-mix()`** (0/948) + **relative colour** `rgb(from …)`/`lab(from …)`
   (0/1169) — the single largest prize on the board, but both require real
   **cross-space conversion math** (the sRGB↔linear↔Lab↔OKLab↔XYZ matrices, gamut
   mapping, and channel interpolation). A much bigger build; worth its own multi-step
   quest.
3. **`alpha(from …)`** (0/32) — a relative-colour-style alpha replacement function
   (`alpha` keyword referenced inside `calc()`, origin-colour resolution, one nested
   `color-mix()` case). Small but its own grammar.
4. A fresh realm (`fetch/`, `html/dom/` reflection) for breadth.
