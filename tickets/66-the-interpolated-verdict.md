# Scroll #66 — The Interpolated Verdict

> Gradients carry a `<color-interpolation-method>` — `in oklab`, `in lab`,
> `in hsl longer hue`. The canonical serialization moves that clause to sit
> **after** the direction, drops it when it equals the default space, and
> canonicalizes its aliases. The widest unopened tail of the whole frontier.

## The gap

`css/css-images/parsing/gradient-interpolation-method-{valid,computed}` exercise
the CSS Images 4 / CSS Color 4 `in <color-space> [ <hue> hue ]?` clause across
linear/radial/conic gradients × seven rectangular spaces × four polar spaces ×
five hue methods × three stop forms. Baseline (with the now-required `.html`
suffix — wpt.live 404s the suffixless path):

| Test | Before | Failing |
|---|:---:|:---:|
| `gradient-interpolation-method-valid` | 585/1398 | 813 |
| `gradient-interpolation-method-computed` | 306/932 | 626 |

By far the widest tail left — an order of magnitude past anything adjacent
(`mask-image-computed` 0/47, etc.). The #64/#65 gradient canonicalizer never
parsed the `in …` clause, so every reorder / default-drop / alias case failed.

## The rules (read straight from the test source)

The test generators encode the canonical serialization exactly:

1. **Reorder** — the interpolation clause serializes **after** the direction.
   `linear-gradient(in lab 30deg, …)` and `linear-gradient(30deg in lab, …)` both
   → `linear-gradient(30deg in lab, …)`.
2. **Default-space drop** (in **both** valid and computed) — a gradient
   interpolates in `oklab` by default, **unless every colour stop uses legacy
   sRGB colour syntax** (named/hex/`rgb()`/`hsl()`), in which case the default is
   `srgb`. The clause is omitted when it equals that default:
   `linear-gradient(in srgb, red, blue)` → `linear-gradient(red, blue)`;
   `linear-gradient(in oklab, color(srgb 1 0 0), blue)` →
   `linear-gradient(color(srgb 1 0 0), blue)`.
3. **Alias canon** — `xyz` → `xyz-d65`.
4. **Hue canon** — for polar spaces, the default `shorter hue` is dropped
   (`in hsl shorter hue` → `in hsl`); `longer`/`increasing`/`decreasing hue` kept.
5. **Radial prelude** (a side-effect this test surfaces, separate from
   interpolation) — the default shape `ellipse` is dropped when an explicit size
   is present (`ellipse 50% 40em` → `50% 40em`), and at computed time the size
   resolves to px (`40em` → `640px`).

## The fix — pure JS, `bootstrap.js`, NO new Rust

Extended the #64/#65 gradient canonicalizer:

- **`_GRADIENT_COLOR_SPACES`** / **`_GRADIENT_POLAR_SPACES`** / **`_HUE_METHODS`**
  data sets; **`_isNonLegacyColorTok`** (`color(`/`lab(`/`lch(`/`oklab(`/`oklch(`/
  `hwb(` → non-legacy).
- **`_interpolationClause(toks)`** — locate the `in <space> [ <hue> hue ]?` clause
  → `{start, len}` (len 2 or 4), or null.
- **`_canonInterpolationMethod(toks, isLegacy)`** — `xyz`→`xyz-d65`, drop default
  `shorter hue`, drop the whole clause when it equals the default space
  (`srgb`/`oklab` per `isLegacy`). Returns `'in …'` or `''`.
- **`_canonGradientInner`** computes `isLegacy` by scanning the stop colours (all
  legacy → `srgb` default, any non-legacy → `oklab`) and threads it down.
- **`_canonGradientConfig`** splits the interpolation clause off the config first,
  canonicalizes direction (existing logic, now factored into
  **`_canonGradientDirection`**) and method independently, and recombines
  `<direction> in <space>`.
- **`_canonRadialPrelude(toks, computed, emPx)`** — drop `farthest-corner` always
  and `ellipse` when an explicit size is present; at computed time resolve each
  length token to px via `_posComputeLen` (reusing the #61/#63 engine + the
  element's computed `font-size` for `emPx`).
- **`_isGradientConfig`** — detect an `in` clause (a config may be *solely* an
  interpolation method, e.g. `linear-gradient(in lab, …)`), and detect a **bare
  `<radial-size>`** config (`50px`, `50% 40em`) — once `ellipse` is dropped at
  specified time, the size alone must still be recognized as a config at computed
  time so the size resolves (a colour stop's leading `<color>` is never all
  size-ish, so the two never collide).

## Results

| Test | Before | After | Δ |
|---|:---:|:---:|:---:|
| `gradient-interpolation-method-valid` | 585/1398 | **1398/1398** | +813 |
| `gradient-interpolation-method-computed` | 306/932 | **932/932** | +626 |

**+1439.** Pure JS, no new Rust.

## Zero-regression sweep

Byte-identical across the shared `<position>`/gradient family and the ritual
holds: gradient-position-valid 18 / -computed 43, variable-substitution-background
10/10, background-position 31/32, object-position 18/16, transform-origin 16,
perspective-origin 18, mask-position-valid 23, serialize-values 695/697 (the 2
fails are #59's pre-existing `counter()`/font-family caps), var-substitution-
shorthands 51, var-definition 71/73, color-computed 16, inherit-initial 4,
shorthand-serialization 7, Element-matches 669, createElement 147; obscura-dom
40/40.

## Caps / Next leverage

1. **More `<image>` props** — `mask-image` (computed 0/47), `list-style-image`,
   `border-image-source` carry the same gradient grammar; baseline (`*-computed`
   paths need the `.html` suffix — several 404 without it) then add to
   `_GRADIENT_PROPS`. The gradient engine is now complete enough that this is
   mostly registration + a per-prop initial value.
2. **Comprehensive valid-property registry** — csstext unknown-prop drop
   (serialize-values hot-path risk; must be a superset of every prop it sets).
3. **Fresh realm** (`fetch/`, `html/dom/` reflection).
