# Quest #182 — The Snapped Verdict (CSS Scroll Snap parsing)

**Realm:** `css/css-scroll-snap/parsing/` (25 files, 435 subtests)
**Result:** 161/435 → **432/435** (+271), ZERO regressions
**Session:** 2026-07-10
**Lever:** the #179/#180/#181 vein — another untouched `css/*/parsing/` dir, identical root cause.

## The gap

The scroll-margin / scroll-padding / scroll-snap family stored its values **RAW** in
`CSSStyleDeclaration.setProperty` (no grammar check). Three consequences, one per test bucket:

- **`*-invalid` 0/N (~120 subtests):** every invalid value (`scroll-margin-top: auto`, `20%`, `-30%`,
  `1px 2px`; `scroll-padding: none`, `-20px`; `scroll-snap-type: x y`, `mandatory`; `scroll-snap-align:
  start end center`) was wrongly accepted.
- **`*-shorthand` 0/N (~76 subtests):** the `scroll-margin`/`scroll-padding` shorthands never expanded, so
  `el.style.scrollMarginTop` read `""` after `el.style.scrollMargin = "10px 20px"` and `.length` was wrong.
- **`*-computed` partial:** length longhands never resolved to px at computed time; `20%`/`calc` stayed symbolic
  correctly only by accident, and the shorthands weren't reconstructed in `getComputedStyle`.

## Baseline (before)

```
scroll-margin-*        : invalid 0/20, shorthand 0/20, computed 4/11, valid 13/19
scroll-padding-*       : invalid 0/28, shorthand 0/20, computed 16/40, valid 28/35
scroll-margin-block-*  : invalid 0/24, shorthand 0/12, computed 4/14, valid 14/14
scroll-padding-block-* : invalid 0/32, shorthand 0/12, computed 16/42, valid 34/36
scroll-snap-align      : invalid 0/3, computed 6/7, valid 6/7
scroll-snap-type       : invalid 0/14, computed 7/8, valid 9/11
scroll-snap-stop       : invalid 0/2, computed 2/2, valid 2/2
Total: 161/435 (37.0%)
```

## The fix — a self-contained css-scroll-snap value engine (`bootstrap.js`)

Inserted just before `_LENGTH_COMPUTED_PROPS` (so all the length/box helpers — `_canonLenPctSigned`,
`_canonGapItem`, `_wsTokens`, `_boxEdges`, `_serializeBoxValue`, `_canonMathExpr` — are already defined).

1. **Longhand validation + canon** (`_canonScrollLong`, dispatched via `_SCROLL_LONGHANDS` in the setProperty
   else-if chain):
   - `scroll-margin-*` = `<length>` signed (`_canonScrollMargin`): single token, no `%`, `0`→`0px`, calc folded
     via `_canonMathExpr({canonLen})` (null → invalid, no raw fallback).
   - `scroll-padding-*` = `auto | <length-percentage [0,∞]>` (`_canonScrollPadding`): reuses `_canonGapItem`
     (order-preserving non-neg canon) after rejecting `normal` and gating math validity.
   - `scroll-snap-align` = `[none|start|end|center]{1,2}` (two-equal → one).
   - `scroll-snap-type` = `none | [x|y|block|inline|both] [mandatory|proximity]?` (default `proximity` dropped
     from serialization).
   - `scroll-snap-stop` = `normal | always`.

2. **The `scroll-margin`/`scroll-padding` shorthands** (physical 1–4 + logical block/inline 1–2) EXPAND into and
   store as their longhands — the **border/offset model**, NOT the raw-store `_BOX_SHORTHANDS` model. Chosen
   deliberately: `test_shorthand_value` reads each `div.style[longhand]` and asserts `.length` returns to its
   pre-set value after clearing the longhands, which only the expand-into-longhands storage satisfies. Machinery:
   `_SCROLL_SH_LH` (map), `_expandScrollShorthand` (validate each edge, `_boxEdges` for 4-value), reconstruction
   on the shorthand getter / `removeProperty` / `getComputedStyle` via `_serializeScrollShorthand` +
   `_serializeBoxValue` (1–4 / 1–2 edge collapse).

3. **Computed length resolution:** the 16 longhands → `_LENGTH_COMPUTED_PROPS`; the 8 scroll-padding →
   `_CLAMP_NEG_PROPS` (resolved-negative clamps to `0px`); an `auto` passthrough branch in `_normComputed`.

4. **Registration + support:** `_CSS_KNOWN_PROPS` gets the 6 shorthands (the longhands were already in
   `_GCS_DEFAULTS`); a `CSS.supports` branch validates longhands via `_canonScrollLong` and shorthands via
   `_expandScrollShorthand`.

## Result (after)

```
Every *-invalid  : N/N   Every *-shorthand : N/N   Every *-computed : N/N
Total: 432/435 (99.3%)
```

## Caps (3)

- **`calc(auto)` on scroll-padding accepted (3 subtests):** a **pre-existing engine-wide leniency**, NOT
  scroll-specific. The shared math type-checker (`_mt` / `_mathValid`, used by the `_MATH_GATE_PROPS` path)
  treats the unknown symbol `auto` inside a calc as type `'unknown'` → valid — the escape hatch that lets
  `var()`-ish content pass. So `margin-left: calc(auto)` and `outline-offset: calc(auto)` are equally (wrongly)
  accepted. A correct fix — reject bare non-constant identifiers in `_mt` — would lift these 3 AND the same
  latent bug across every length property, but touches shared math machinery; deliberately out of scope to keep
  this change tight and zero-regression. Documented for a future dedicated math-validation quest.

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, Element-matches 669/669, createElement 147/147, url-origin 406/413,
css-align place-content 15/15 + gap 12/12, css-ui caret-color-computed 12/12 + box-sizing-computed 2/2,
css-text text-indent-valid 14/14, serialize-values 696/697, cssstyledeclaration-csstext 7/11 (stash-proven
identical without the change) — all held.

## Next

The still-untouched `css/*/parsing/` dirs remain the widest tail, same three-axis JS machinery:
`css-fonts` (83 files), `css-grid` (61), `css-overflow` (35 — measured 124/366, but more scattered across many
small/experimental props: block-ellipsis, continue, line-clamp, scroll-buttons 0/37, scroll-markers,
scrollbar-gutter, webkit-box). DEV NOTE: grep `_canonScrollLong` / `_SCROLL_SH_LH` / `_SCROLL_LONGHANDS` /
`_expandScrollShorthand` before touching scroll-snap values.
