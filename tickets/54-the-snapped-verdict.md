# Scroll 54 — The Snapped Verdict

> *Five more realms of the CSS property-inheritance frontier — scroll-snap,
> transitions, color-adjust, shapes, will-change — each one data entry away
> from a clean sweep.*

**Status: SECURED — +62 (session 2026-06-20).**

## The gap

The shared helper `/css/support/inheritance-testcommon.js`
(`assert_inherited`/`assert_not_inherited`/`assert_initial`) drives the WHOLE
`css/*/inheritance.html` family, gating every subtest first on
`property in getComputedStyle(target)`. Quest #52 built the property-agnostic
computed-value engine (resolves `initial`/`inherit`/`unset`/`revert` + walks the
ancestor chain); Quest #53 registered ~120 properties across 15 families. Five
families were still dark — every subtest dying at assert #1 (`prop in gCS` → false):

| Family | Before | Properties (all identity-serializing) |
|--------|:------:|---------------------------------------|
| `css-scroll-snap` | 0/38 | 8× scroll-margin-* (`0px`), 8× scroll-padding-* (`auto`), scroll-snap-align (`none`), scroll-snap-stop (`normal`), scroll-snap-type (`none`) — none inherit |
| `css-transitions` | 0/8 | transition-delay/duration (`0s`), transition-property (`all`), transition-timing-function (`ease`) — none inherit |
| `css-color-adjust` | 0/8 | color-scheme (`normal`), color-adjust + print-color-adjust (`economy`), forced-color-adjust (`auto`) — **all four inherit** |
| `css-shapes` | 0/6 | shape-image-threshold (`0`), shape-margin (`0px`), shape-outside (`none`) — none inherit |
| `css-will-change` | 0/2 | will-change (`auto`) — does not inherit |

## The work (pure JS, `bootstrap.js`, NO new Rust — pure DATA)

Identical shape to #53: register each property's spec initial value in
`_GCS_DEFAULTS` (which doubles as the `_initialOf` table + the `_CSS_KNOWN_PROPS`
registry feeding the `has`-trap and `CSS.supports`), and add the inherited ones
to `_INHERITED_PROPS`. Computed serialization for all 35 properties is **identity**
(keyword / simple length / number), which the #52/#53 engine's default echo already
provides — no per-property serializer needed.

- **34 properties → `_GCS_DEFAULTS`** (scroll-snap 19, transitions 4, color-adjust 4,
  shapes 3, will-change 1, plus the legacy `color-adjust` alias of
  `print-color-adjust`).
- **4 properties → `_INHERITED_PROPS`**: the whole css-color-adjust family
  (`color-scheme`, `color-adjust`, `forced-color-adjust`, `print-color-adjust`).
  All scroll-snap / transition / shape / will-change properties do NOT inherit, so
  they need only the defaults entry.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-scroll-snap/inheritance.html` | 0/38 | **38/38** |
| `css/css-transitions/inheritance.html` | 0/8 | **8/8** |
| `css/css-color-adjust/inheritance.html` | 0/8 | **8/8** |
| `css/css-shapes/inheritance.html` | 0/6 | **6/6** |
| `css/css-will-change/inheritance.html` | 0/2 | **2/2** |

**+62. ZERO regressions.** Swept: the #53 fifteen families (css-text 42, css-ui 28,
css-fonts 39, css-flexbox 20, css-grid 20, css-multicol 14), inherit-initial 4,
css-color/inheritance 4, color-computed 16, color-computed-named 455,
opacity-computed 30, matches 669, closest 29, createElement 147, has-specificity 8,
not-specificity 8, valid-invalid 30, disabled 7, qsa-removed 1, classlist 1420;
obscura-dom unit 40/40.

## Caps / Next

- The remaining `inheritance.html` family is now mostly the families needing real
  **layout/unit resolution** (percentage/length/shorthand round-trip) rather than
  identity serialization — e.g. `css-backgrounds` (could-not-run, `bodyLen=42`
  wpt.live serving), `css-position`, `css-sizing`. Those are NOT free data wins;
  they need the engine to resolve computed lengths/percentages, a separate quest.
- **NEXT LEVERAGE (unchanged from #53, now the front-runners since the cheap
  identity tail is largely exhausted):** (a) **CSS custom-property cascade + `var()`
  substitution** — closes the 2 rgb `var()` caps, opens `css/css-variables/`; the
  #47 cascade + #52 inheritance walk are the templates. (b) a **specified-value
  serialization engine** (`serialize-values` 0/697, the `*-valid`/`*-invalid`
  family) — reads `el.style` serialization off the hot `CSSStyleDeclaration` path,
  a larger separate engine. (c) a **fresh realm** (`fetch/`, `html/dom/` reflection).
</content>
</invoke>
