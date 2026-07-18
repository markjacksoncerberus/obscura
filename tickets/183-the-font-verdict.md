# Quest #183 — The Font Verdict (CSS Fonts parsing longhands)

**Realm:** `css/css-fonts/parsing/` (82 files, 1569 subtests)
**Result:** 384/1569 → **634/1569** (+250), ZERO regressions
**Session:** 2026-07-11
**Lever:** the #179→#182 vein — the widest still-untouched `css/*/parsing/` dir, identical root cause.

## The gap

The css-fonts longhands stored their values **RAW** in `CSSStyleDeclaration.setProperty` (no grammar
check). Three consequences, one per test bucket:

- **`*-invalid` 0/N (~120 subtests):** every invalid value was wrongly accepted — `font-size-adjust: auto`
  / `-10` / `0.5 ex-height` (0/57!), `font-variant-emoji: color`, `font-synthesis: none weight` (0/12),
  `font-width: -50%`, `font-family: cursive serif`, `font-size: -10px`, `font-style: italic oblique`, …
- **`*-valid` partial (keyword canon never happened):** `font-family: Serif` didn't lowercase to `serif`,
  `font-synthesis: style weight` didn't reorder to `weight style`, `font-size-adjust: ex-height 0.5` didn't
  drop the default basis, `'21st Century'` didn't re-quote with double quotes, oblique angles weren't
  validated.
- **`*-computed` mostly missing:** oblique→deg, `font-weight` bolder/lighter + keyword→number + calc-clamp,
  `font-width` keyword→%, `font-size` larger/smaller + em/%-vs-parent, `font-size-adjust` calc-fold+clamp —
  none of it existed (font-weight-computed 13/58, font-width-computed 1/30).

## Baseline (before) — the movers

```
font-style       : valid 13/17, invalid 0/2,  computed 9/17
font-weight      : valid 20/22, invalid 0/2,  computed 13/58
font-width       : valid 26/30, invalid 0/8,  computed 1/30   (font-stretch loops both names)
font-size        : valid 13/13, invalid 0/4,  computed 9/21
font-size-adjust : valid 14/19, invalid 0/57, computed 7/20
font-family      : valid 4/11,  invalid 0/7,  computed 9/10
font-synthesis   : valid 6/23,  invalid 0/12
font-{kerning,optical-sizing,variant-caps,variant-emoji}-invalid : 0/N
font-synthesis-{weight,style,small-caps,position}-invalid        : 0/N
Realm total: 384/1569 (24.5%)
```

## The fix — a self-contained css-fonts value engine (`bootstrap.js`)

Inserted after `_serializeScrollShorthand` (so `_wsTokens`, `_canonMathExpr`, `_canonLenPctSigned`,
`_ccOrderedCanon`, `_serNumber`, `_splitCommaQuoted`, `_evalMath`, `_serAngle`, `_FONT_SIZE_KEYWORDS`,
`_computedPropOf` are all defined). Dispatched via `_FONT_VALIDATED` in the `setProperty` else-if chain,
ahead of the `_MATH_GATE_PROPS` branch. CSS-wide keywords and `var()`/`env()` pass through untouched.

### 1. Specified validation + canonicalization (`_canonFont`)

- **`font-style`** (`_canonFontStyle`): `normal | italic | oblique <angle [-90deg,90deg]>?`. A literal 0
  angle serializes to `normal`; grad/rad/turn kept verbatim; a calc angle kept as `oblique calc(…)` (via
  `_canonMathExpr`, which reorders `sign(…)` products); out-of-range → invalid.
- **`font-weight`** (`_canonFontWeight`): `normal | bold | bolder | lighter | <number [1,1000]>` + calc
  (calc's out-of-range value is legal, clamped only at computed time). **Removed from `_MATH_GATE_PROPS`**
  (it now owns the whole grammar, including keyword + range rejection).
- **`font-width` / `font-stretch`** (`_canonFontWidth`): `<keyword> | <percentage [0,∞]>` + calc. Bare
  negative % → invalid; keyword kept as keyword.
- **`font-size`** (`_canonFontSize`): `<absolute-size> | <relative-size> | <length-percentage [0,∞]>` + calc.
  Bare negative length/% → invalid (calc negative kept, clamped at computed).
- **`font-size-adjust`** (`_canonFontSizeAdjust`): `none | <basis>? [from-font | <number [0,∞]>]` where
  `<basis>` ∈ {ex-height, cap-height, ch-width, ic-width, ic-height}. The default `ex-height` basis is
  dropped from serialization (`ex-height 0.5` → `0.5`). Bare negative number → invalid; calc kept.
- **`font-family`** (`_canonFontFamily`): `[ <family-name> | <generic-family> ]#`. Generic keywords
  lowercased; an unquoted sequence of custom-idents validated per token (`_isFamilyIdent`) and rejected if it
  contains a reserved keyword (generic / CSS-wide / `default`); a quoted string reserialized to an unquoted
  ident sequence when it is one and not reserved, else re-quoted with double quotes (`_serFamilyString`).
- **`font-synthesis`** (`_ccOrderedCanon` + `_FONT_SYNTH_CATS`): `none | [ weight || style/oblique-only ||
  small-caps || position ]`, canonical category order, `oblique-only` sharing the style category.
- **The enum longhands** (`_FONT_ENUM`): `font-kerning` (auto|normal|none), `font-optical-sizing` (auto|none),
  `font-variant-caps`, `font-variant-emoji`, and `font-synthesis-{weight,small-caps,position}` (auto|none) +
  `font-synthesis-style` (auto|none|**oblique-only**).

### 2. Computed forms (`_normComputed` branches)

- **font-style:** `oblique <angle>` → `<n>deg` (grad→deg via `_evalMath({angle,lengths,cqZero})`, calc
  resolved, clamped to [-90,90], 0 → `normal`).
- **font-weight:** `normal`→400, `bold`→700; `bolder`/`lighter` resolved against the **inherited** computed
  weight (`_computedPropOf(parent)`) through `_fontBolder`/`_fontLighter` (the continuous variable-font
  algorithm the tests encode); a number/calc folds and clamps to [1,1000] (not rounded).
- **font-width/font-stretch:** keyword → `%` (`_FONT_WIDTH_KW`); percentage/calc resolved and clamped ≥ 0.
- **font-size:** absolute keyword → px (`_FONT_SIZE_KEYWORDS`); `larger`/`smaller` = parent-size ×/÷ 1.2
  (`_parentFontSizePx`); a length/`%`/calc resolved against the **parent** font-size (em and % both use the
  parent's size), clamped ≥ 0.
- **font-size-adjust:** the number component folds calc and clamps to [0,∞); the basis is preserved.

### 3. Registration

Added `font-width` (initial `100%`) and the four `font-synthesis-*` subprops (initial `auto`) to
`_GCS_DEFAULTS` and `_INHERITED_PROPS` — which flows them into `_CSS_KNOWN_PROPS`/`CSS.supports` and the
inheritance engine.

## Results (after)

Every touched `*-invalid` → N/N. Notable per-file: font-style 13/2/9 → **17/2/17**, font-weight 20/0/13 →
**22/2/58**, font-width 26/0/1 → **30/8/30**, font-size-adjust 14/0/7 → **19/57/14**, font-family 4/0/9 →
**11/7/10**, font-synthesis 6/0 → **23/12**, plus font-kerning/-optical-sizing/-variant-caps/-variant-emoji
invalids all N/N and the four synthesis-subprop invalid families. Realm **384/1569 → 634/1569 (+250)**.

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, Element-matches 669/669, createElement 147/147, url-origin 406/413,
serialize-values 696/697, cssstyledeclaration-csstext 7/11 (pre-existing), css-align place-content 15 +
gap-computed 11, css-ui caret-color-computed 12 + box-sizing 2, css-text text-indent-computed 10,
css-scroll-snap scroll-margin-computed 11 — all held. One in-dev regression (font-synthesis-style dropping
`oblique-only` from its enum) was caught by the per-file diff and fixed before commit.

## Caps (honest)

- **The `font` shorthand** — `font-valid` (9/315) + `font-computed` (6/315) = **630 subtests**, untouched.
  The crown jewel and the single widest remaining lever in this realm; needs a full shorthand parser +
  serializer (the `[ style || <font-variant-css2> || weight || <font-stretch-css3> ]? <size> [ / <lh> ]?
  <family>` grammar, system-font keywords, and computed serialization that reads each longhand's computed
  value). Deferred to a follow-up quest so this stays tight/zero-regression.
- **`font-variant`** (44/46 valid but 0/21 invalid) + **`font-feature-settings`** (4/10) — complex
  combinatorial shorthand/list grammars; canonicalizing them risks the 44 already-green valid cases.
- **`font-face-src-*`** (font-face-src-format 0/35, -tech 0/39, -list 0/17, -local 0/18, -size-adjust 0/6 —
  ~109) — `@font-face` **descriptor** parsing (`src`/`format()`/`tech()`/`local()`), a different mechanism
  from style-property `setProperty`.
- **`<font size=N>` presentational hints** (5 in font-size-computed) — the legacy UA attribute→CSS mapping;
  the cascade has no presentational-hint layer.
- **`from-font`** (6 in font-size-adjust-computed) — needs real font-metric resolution (the `ahem-ex-500`
  font's ex-height/cap-height/ch-width); we have no font-metric engine.

## Next leverage

The `font` shorthand (630 subtests) is the widest lever left here. After it: `font-variant` +
`font-feature-settings`, then the still-untouched `css/css-grid/parsing/` (61 files) and
`css/css-overflow/parsing/` (35, scattered). grep `_canonFont`/`_FONT_VALIDATED`/`_FONT_ENUM` before
touching font values.
