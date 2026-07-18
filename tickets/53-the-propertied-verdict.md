# Scroll 53 — The Propertied Verdict

> *Fifteen realms of the CSS property-inheritance frontier, each gated on the same
> shared harness, each one primitive away from a flood of greens.*

**Status: SECURED — +263 (session 2026-06-20).**

## The gap

The shared helper `/css/support/inheritance-testcommon.js`
(`assert_inherited`/`assert_not_inherited`/`assert_initial`) drives the WHOLE
`css/*/inheritance.html` family. For each property it asserts, in order:

1. `property in getComputedStyle(target)` — the property must be "supported".
2. `target.style[property] = 'initial'` → `getComputedStyle(target)[property]`
   equals the spec **initial value**.
3. (inherited) set the value on `#container`, leave `#target` at `unset`/`inherit`,
   and check the value **propagates** down; (not-inherited) check it does **not**.

Quest #52 already built the property-agnostic computed-value engine that resolves
`initial`/`inherit`/`unset`/`revert` and walks the ancestor chain
(`_specifiedValue`/`_INHERITED_PROPS`/`_initialOf`/`_normComputed`/`_computedPropOf`).
But it only modelled ~30 properties, so every other `inheritance.html` failed at
assert #1 (`prop in gCS` → false). The fix is almost pure **data**: register each
property's initial value and inherited flag, and the #52 engine resolves the rest.

## The work (pure JS, `bootstrap.js`, NO new Rust)

**1. Property registry expansion.** Added ~120 properties across 15 families to
`_GCS_DEFAULTS` (which doubles as the initial-values table feeding `_initialOf`,
and as the registry feeding `_CSS_KNOWN_PROPS` → the proxy `has` trap +
`CSS.supports`). Added the inherited ones to `_INHERITED_PROPS`. Computed
serialization for these is **identity** (keyword / simple length / number), which
the engine's echo already provides — so no per-property serializer was needed.
Families: css-text, css-ui, css-fonts, css-text-decor, css-writing-modes,
css-lists, css-overflow, css-break, css-images, css-tables, css-align,
css-flexbox, css-grid, css-content, css-multicol.

**2. `currentColor`-initial colour properties.** `caret-color`, `outline-color`,
`text-decoration-color`, `text-emphasis-color`, `column-rule-color` have a
`currentColor` initial (not `rgb(0,0,0)`). Set their default to `'currentColor'`;
the colour normalizer resolves it to the element's own computed colour — which is
exactly what each test's `currentColor` reference variable
(`getComputedStyle(reference).color`) holds. Added `text-emphasis-color` to
`_COLOR_PROPS`.

**3. Live CSSOM declaration cascade fix (the real correctness win).** css-ui set a
property via `el.style.outlineStyle = 'initial'` *while* an author rule
`#target { outline-style: dotted }` was present. `_specifiedValue` was
cascade-first, and `el.style.foo =` (the live CSSOM declaration) does **NOT**
reflect into the `style=""` attribute that `_buildCascade` reads — so the author
rule wrongly won. Fix: `_buildCascade` now injects the live `el.style._props` as
the **highest-priority normal author source** (above every `<style>` rule; an
author `!important` rule still beats it, preserving `important-vs-inline-001`).
`_specifiedValue` is now cascade-authoritative for every property. This also
fixes camelCase-set values that the old `getPropertyValue(kebab)` fallback missed.

**4. font-size keyword resolution.** `#box { font-size: medium }` must compute to
`16px`. Added `_FONT_SIZE_KEYWORDS` (the absolute-size keyword → px table) to the
`font-size` branch of `_normComputed`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-text/inheritance.html` | 0/42 | **42/42** |
| `css/css-ui/inheritance.html` | 3/28 | **28/28** |
| `css/css-fonts/inheritance.html` | 3/39 | **39/39** |
| `css/css-text-decor/inheritance.html` | 1/18 | **18/18** |
| `css/css-writing-modes/inheritance.html` | 0/10 | **10/10** |
| `css/css-lists/inheritance.html` | 0/10 | **10/10** |
| `css/css-overflow/inheritance.html` | 0/18 | **18/18** |
| `css/css-break/inheritance.html` | 0/12 | **12/12** |
| `css/css-images/inheritance.html` | 0/8 | **8/8** |
| `css/css-tables/inheritance.html` | 0/10 | **10/10** |
| `css/css-align/inheritance.html` | 0/16 | **16/16** |
| `css/css-flexbox/inheritance.html` | 0/20 | **20/20** |
| `css/css-grid/inheritance.html` | 0/20 | **20/20** |
| `css/css-content/inheritance.html` | 0/6 | **6/6** |
| `css/css-multicol/inheritance.html` | 1/14 | **14/14** |

**+263** (8 → 271). **Zero regressions** — full sweep: qsa 1975, classlist 1420,
matches 669, closest 29, createElement 147, cloneNode 135, color-computed
16/455/95/30, opacity-computed 30, inherit-initial 4, css-color/inheritance 4,
has-specificity 8, not-specificity 8, is-specificity 1, is-nested 2,
is-where-pseudo-classes 1, valid-invalid 30, readwrite-readonly 25, disabled 7,
getRandomValues 39, mark 22; obscura-dom unit 40/40.

## Caps (honest)

- **`display`** (css-display) skipped: its *spec initial* is `inline`, but our
  no-author default is `block` (UA-stylesheet behaviour). `_GCS_DEFAULTS` conflates
  "initial value" with "default computed value"; splitting them just for `display`
  risks regressing the heavily-used `gCS().display` everywhere for +1 subtest.
- Families needing **real layout / units** for their `other` round-trip
  (percentage/length resolution, shorthand expansion) are NOT covered — only
  identity-serializing keyword/length/number properties.
- `css-backgrounds/inheritance.html`, `mathml/.../css-styling`, `svg/...`
  could-not-run (wpt.live serving / reftest, `bodyLen=42`).
- The specified-value serialization family (`*-valid`, `cssom/serialize-values`)
  is a SEPARATE engine — those read `el.style` serialization, untouched here.

## Next leverage

1. **More property families** — many `inheritance.html` files still dark
   (css-position done elsewhere; check css-shapes, css-scroll-snap, css-transitions,
   css-will-change, css-color-adjust, css-fonts more). Each identity-serializing
   property = 2 greens; the engine resolves the rest.
2. **CSS custom-property cascade + `var()` substitution** — the standing
   foundational quest: closes the 2 `color-computed-rgb` `var()` caps and opens
   `css/css-variables/` (variable-css-wide-keywords 0/30 needs `@property` +
   `@layer` too — heavier).
3. **A specified-value serialization engine** — unlocks `serialize-values` (0/697)
   and the `*-valid` family broadly (hot `CSSStyleDeclaration` path).
4. A fresh realm (`fetch/`, `html/dom/` reflection).
