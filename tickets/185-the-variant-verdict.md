# Scroll 185 — The Variant Verdict ⚔️

> *The `font-variant` shorthand, its five combinatorial longhands, and
> `font-feature-settings` — the last combinatorial grammars of the css-fonts realm.*

**Realm:** `css/css-fonts/parsing/` (the font-variant family + font-feature-settings)
**Quest:** #185 The Variant Verdict
**Result:** **+82 subtests, ZERO regressions.** Realm 1249/1569 → **1331/1569**.

---

## The gap

After #183 (css-fonts longhands) + #184 (the `font` shorthand), the css-fonts realm
still carried a wide combinatorial tail — the `||`-combination font-variant longhands
and the `font-variant` shorthand stored their values RAW (no grammar check), and
`font-feature-settings` was only half-modelled:

- `font-variant` (shorthand) **44/46 valid, 0/21 invalid** — never expanded, never reordered.
- `font-variant-ligatures`/`-numeric`/`-east-asian` **valid OK but `*-invalid` all 0/N**
  (raw storage accepted every bad value; combinations never reordered to canonical order).
- `font-variant-east-asian-valid` **11/12** — the one reorder case (`ruby full-width
  simplified` → `simplified full-width ruby`) failed under raw storage.
- `font-variant-alternates` **valid 3/3 but invalid 0/15** — the functional grammar
  (`stylistic()`/`styleset()#`/…) unvalidated.
- `font-variant-position` **invalid 0/2** — `auto` / `super sub` wrongly accepted.
- `font-variant-serialization` **0/1**, `font-shorthand-variant` **0/1** (the #183/#184 CAP).
- `font-feature-settings` **valid 4/10, invalid 0/5, computed 6/10** — the `<opentype-tag>`
  4-char string grammar, on/off/integer serialization, escaping, and computed sort/dedup/calc
  all missing.

## The work (all pure JS in `bootstrap.js`, no new Rust)

**font-variant longhands** — reuse the existing `_ccOrderedCanon` (each token → one ordered
category, ≤ one per category, `normal`/`none` singletons). New `_FV_CC` map for ligatures /
numeric / east-asian; `font-variant-position` added to `_FONT_ENUM`. Canonical serialization
reorders tokens to grammar-category order (so `ruby full-width simplified` → `simplified
full-width ruby`).

**font-variant-alternates** (`_canonFontVariantAlternates`) — a `||` of functional
notations: `stylistic()`/`swash()`/`ornaments()`/`annotation()` take exactly one
`<feature-value-name>` (a `<custom-ident>`, `_isFvn`), `styleset()`/`character-variant()`
take a `#` list, `historical-forms` is a keyword. One per category, canonical order
(stylistic, historical-forms, styleset, character-variant, swash, ornaments, annotation).

**font-feature-settings** (`_canonFontFeatureSettings` + `_computeFontFeatureSettings`) —
`normal | <feature-tag-value>#`, `<feature-tag-value> = <string> [ <integer [0,∞]> | on |
off ]?`. The `<opentype-tag>` must be exactly four 0x20–0x7E chars (decoded via
`_unescapeIdent`, re-serialized via `_serCssString` with CSSOM `"`/`\`/control escaping).
Value 1/on omitted, off→0, other integer kept. COMPUTED folds each calc integer (via
`_evalMath` `{cqZero}` — so `sign(2cqw - 10px)` = −1), dedups by tag (last wins), sorts
tags in codepoint order.

**The `font-variant` shorthand** (`_parseFontVariantShorthand`/`_FONT_VARIANT_SH_LH`/
`_fontVariantFromLonghands`) — like `font`, a valid value EXPANDS into and stores as its
six font-variant-* longhands. `normal` → all normal; `none` → ligatures:none + rest normal.
Otherwise route each token to its longhand by keyword membership, then canonicalize each
longhand's tokens together (so the within-longhand duplicate-category rules reject e.g.
`lining-nums oldstyle-nums`). The getter (`getPropertyValue`/`getComputedStyle`)
reconstructs in canonical order [ligatures, caps, alternates, numeric, east-asian,
position]; returns '' when no longhand is present, or when ligatures:none coexists with
another non-initial longhand. A CSS-wide keyword / var() is kept as a single `font-variant`
key. Wired into setProperty / getPropertyValue / removeProperty / getComputedStyle.

**The #183/#184 CAP closed** — `_fontFromLonghands` (the `font` shorthand serializer) now
also returns '' when any of the five extra font-variant longhands is non-initial, so
`font` correctly reads back only its CSS2 subset (`font-shorthand-variant.html`: setting
`fontVariant = titling-caps` or `full-width` makes `style.font` empty).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| font-variant-valid | 44/46 | **46/46** |
| font-variant-invalid | 0/21 | **21/21** |
| font-variant-ligatures-invalid | 0/6 | **6/6** |
| font-variant-numeric-invalid | 0/9 | **9/9** |
| font-variant-east-asian-valid | 11/12 | **12/12** |
| font-variant-east-asian-invalid | 0/9 | **9/9** |
| font-variant-alternates-invalid | 0/15 | **15/15** |
| font-variant-position-invalid | 0/2 | **2/2** |
| font-variant-serialization | 0/1 | **1/1** |
| font-shorthand-variant | 0/1 | **1/1** |
| font-feature-settings-valid | 4/10 | **10/10** |
| font-feature-settings-invalid | 0/5 | **5/5** |
| font-feature-settings-computed | 6/10 | **10/10** |

**+82. Realm 1249/1569 → 1331/1569.**

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, Element-matches 669/669, createElement 147/147,
url-origin 406/413, serialize-values 696/697, css-align place-content 23/23, css-text
text-indent 14/14, css-scroll-snap scroll-margin-shorthand 20/20, css-ui caret-color-computed
12/12, **font-valid 315/315, font-computed 315/315** (#184), font-variant-caps/emoji/
ligatures/numeric/east-asian/position -valid + -computed all held, font-weight-computed 58,
font-width-computed 30, font-synthesis-invalid 12, font-family-valid 11 — all held.

## Caps / Next

- **In-realm remaining:** `font-face-src-*` (~109 — @font-face `src`/`format()`/`tech()`/
  `local()` DESCRIPTOR parsing, a different mechanism from setProperty), `<font size=N>`
  presentational hints (5 — a cascade presentational-hint layer we lack), `from-font`
  (6 — needs real font metrics), `font-variation-settings` (if any tail).
- **NEXT LEVERAGE:** the still-untouched `css/*/parsing/` dirs remain the widest tail, SAME
  three-axis JS machinery (setProperty validate/canon + `_normComputed`): `css/css-grid/
  parsing/` (61 files) and `css/css-overflow/parsing/` (35, scattered across small props:
  block-ellipsis, continue, line-clamp, scroll-buttons 0/37, scrollbar-gutter). Baseline
  each before committing.
- grep `_FV_CC` / `_canonFontVariantAlternates` / `_parseFontVariantShorthand` /
  `_canonFontFeatureSettings` / `_FONT_VARIANT_SH_LH` before touching font-variant values.
