# Quest #184 — The Shorthand Verdict (the `font` shorthand)

**Realm:** `css/css-fonts/parsing/` — the `font` shorthand crown jewel
**Result:** font-valid 9/315 → **315/315** (+306), font-computed 6/315 → **315/315** (+309) = **+615**, ZERO regressions
**Session:** 2026-07-11
**Lever:** the widest single lever left in the campaign — the `font` shorthand, deferred from Quest #183 as
"the crown jewel." Built directly on the #183 css-fonts longhand canonicalizers.

## The gap

The `font` shorthand was completely unmodelled. `style.font = "italic bold 20px/1.5 serif"` fell through to
generic single-key storage — no parse, no expansion, no canonical serialization. So:

- **font-valid 9/315:** `style.getPropertyValue('font')` never reflected the canonical serialization (reorder
  to style/variant/weight/stretch, drop `normal`, `size / line-height` spacing).
- **font-computed 6/315:** `getComputedStyle(el).font` returned nothing usable — `'font' in getComputedStyle`
  was false, `CSS.supports('font', …)` was false, and there was no reconstruction from computed longhands.

The grammar (CSS Fonts 4 §font-prop):

```
[ [ <'font-style'> || <font-variant-css2> || <'font-weight'> || <font-stretch-css3> ]?
  <'font-size'> [ / <'line-height'> ]? <'font-family'> ]
| caption | icon | menu | message-box | small-caption | status-bar
```

## The fix — expand-into-longhands, reconstruct on read (`bootstrap.js`)

Followed the established shorthand model (scroll/align/border/offset): a valid `font` value **expands into —
and is stored as — its longhands**; the getter and `getComputedStyle` reconstruct it. A system-font keyword
(or CSS-wide keyword / var()) is kept as a single `font` key.

**Longhands** (`_FONT_SH_LH`): `font-style`, `font-variant-caps`, `font-weight`, `font-stretch`, `font-size`,
`line-height`, `font-family` — each set to the parsed value or its initial (so the shorthand overrides
inheritance, e.g. `font-weight: normal`→computed 400 even inside `#container{font-weight:800}`).

1. **Parse** (`_parseFontShorthand`): a quote/paren-aware tokenizer (`_fontTokens`) that isolates a top-level
   `/` as its own token. Greedy `||`-order prefix scan (style/variant-css2/weight/stretch, each ≤ once,
   `normal` a filler for any) that stops at the first non-prefix token — the mandatory `<'font-size'>`;
   optional `/ <'line-height'>` (`_canonFontLineHeight`: `normal | <number [0,∞]> | <length-percentage
   [0,∞]>` + calc); mandatory `<'font-family'>` (the rest, via `_canonFontFamily`). Reuses the #183
   `_canonFontStyle`/`_canonFontSize`/`_canonFontFamily`. Bare `<number>` → weight; `<font-stretch-css3>` is
   keyword-only (no `%`). null → invalid → whole declaration ignored.
2. **Specified serialization** (`_serializeFontShorthand` → `_fontFromLonghands(get, false)`): requires all 7
   longhands present at one importance, else `''`. Reorders to style/variant/weight/stretch, drops `normal`
   (and, for computed, weight `400`), emits `size / line-height` (spaces) only when line-height ≠ `normal`.
   Returns `''` when a longhand isn't shorthand-expressible (variant beyond `small-caps`).
3. **Computed serialization** (`getComputedStyle` `resolve('font')` → `_fontFromLonghands(get, true)`): reads
   the computed longhands. Computed weight bolder/lighter resolve inherited-relative (drop `400`); computed
   font-stretch `%` maps back to its css3 keyword (`_FONT_WIDTH_KW_REV`); a system/CSS-wide keyword set inline
   serializes as supplied. Because both the target and the test's per-longhand `reference` div resolve through
   the same computed code under the same `#container` context, even calc font-sizes / line-heights round-trip
   without needing full `%`/calc length resolution.
4. **Registration:** `font` added to `_CSS_KNOWN_PROPS` (so `'font' in getComputedStyle` + camel), a `font`
   branch in `CSS.supports`, and `setProperty`/`getPropertyValue`/`removeProperty` shorthand handling.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `font-valid.html` | 9/315 | **315/315** |
| `font-computed.html` | 6/315 | **315/315** |
| `font-shorthand-variant.html` | 0/1 | 0/1 (cap) |
| **Realm `css/css-fonts/parsing/`** | 634/1569 | **1249/1569** |

**Zero regressions** — swept qsa 1975, classlist 1420, Element-matches 669, createElement 147, url-origin
406/413, serialize-values 696/697, css-align place 15 / gap 12, css-scroll-snap scroll-margin-shorthand 20/20,
css-text text-indent 14/14, css-ui caret-color-computed 12/12, and the #183 font longhands (font-weight-computed
58/58, font-size-adjust-invalid 57/57, font-style-valid 17/17, font-synthesis-invalid 12/12, font-family-valid
11/11) — all held.

## Caps / Next

- **`font-shorthand-variant.html` (1 subtest)** — needs the full **`font-variant` shorthand**: it sets
  `style.fontVariant = "full-width"` (a `font-variant-east-asian` value) and expects `style.font` to return
  `''` because the `font` shorthand can't express non-css2 variants. Requires (a) expanding `font-variant`
  into its `font-variant-{ligatures,caps,alternates,numeric,east-asian,position,emoji}` longhands, and (b)
  `_fontFromLonghands` checking that every shorthand-reset longhand (all the `font-variant-*`, plus
  `font-size-adjust`/`font-kerning`/`font-feature-settings`/`font-optical-sizing`/`font-variation-settings`/
  `font-language-override`) is at its initial, else `''`. A separate, riskier lever for 1 subtest — deferred.
- **NEXT LEVERAGE:** `font-variant` (44/46 valid but 0/21 invalid) + `font-feature-settings` (4/10) — the
  combinatorial font-variant shorthand + descriptor grammar; then the still-untouched `css/*/parsing/` dirs
  `css-grid` (61) and `css-overflow` (35, scattered across small/experimental props). Also open in-realm:
  `font-face-src-*` (~109 — @font-face `src`/`format()`/`tech()`/`local()` **descriptor** parsing, a different
  mechanism from `setProperty`), `<font size=N>` presentational hints (5 — a cascade layer we lack),
  `from-font` (6 — needs real font metrics).
- DEV NOTE: grep `_parseFontShorthand`/`_FONT_SH_LH`/`_fontFromLonghands`/`_serializeFontShorthand`/`_fontTokens`
  before touching the `font` shorthand.
