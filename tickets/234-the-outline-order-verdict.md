# Quest #234 — The Outline-Order Verdict

**Realm:** `css/css-ui/parsing/`
**Result:** +3 subtests, ZERO regressions. `outline-valid` → 100%.
**Session:** 2026-07-21

## The gap

Took #233's next-leverage (the outline family sibling `outline-valid` 17/20).
Two gaps, both in the `outline` shorthand serialization:

1. It serialized in **border's** `<width> <style> <color>` order, but css-ui-4
   canonicalizes `outline` as `<color> || <style> || <width>` — the *reverse*
   component order. So `3px ridge rgba(10, 20, 30, 0.4)` serialized as
   `3px ridge rgba(…)` instead of the expected `rgba(…) ridge 3px`.

2. `outline: 0` was rejected — `_isLengthTok('0')` is false (a bare unitless
   zero carries no unit), so the strict border-side parser saw no valid width,
   returned null, and the whole shorthand was disallowed → read back `""`.

## The fix (all `bootstrap.js`)

- **`_joinOutline(w, s, c)`** — mirrors `_joinBorderSide` but emits
  color-style-width, with the same drop-at-initial rules (color ≠ currentcolor,
  style ≠ none, width ≠ medium) and the all-initial → `none` fallback. Wired into
  the `sh === 'outline'` branch of `_serializeBorderShorthand`. `border` /
  `border-<side>` / `column-rule` keep `_joinBorderSide` (width-style-color).

- **Bare-zero width** — `_parseBorderSideStrict`'s width branch now also accepts
  `_isZeroTok(t)` → `0px`. `outline: 0` → `0px` (also benefits border-side /
  column-rule bare-zero widths).

## Wins

`outline-valid` 17 → **20** (100%):
- `3px ridge rgba(10, 20, 30, 0.4)` → `rgba(10, 20, 30, 0.4) ridge 3px`
- `dashed thin` → `dashed thin`
- `medium rgba(…)` → `rgba(…)` (width `medium` dropped)
- `outline: 0` → `0px`

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, border-valid 6/6, border-shorthand 36/36,
column-rule-valid 5/5, column-rule-shorthand 12/12 (all still use
`_joinBorderSide` / `_parseBorderSideStrict` — proven unaffected by the bare-zero
addition), outline-shorthand 4/4, outline-invalid 4/4, outline-color-valid 2/2;
and the #233 wins outline-width-computed 9/9 + border-width-computed 11/11 held.

## Caps / Next

**CAP:** `outline` computed (`getComputedStyle`) is not exercised by any css-ui
`parsing/` test, so its resolve() path was left as-is (falls to
`_computedPropOf`).

**NEXT LEVERAGE:** `cursor-computed` 36/39 (a gradient-cursor grammar gap) and
`resize-computed` 5/6 (a `::before`/`::after` pseudo-element computed-style bug,
deeper than value parsing) are the last two in-dir veins; OR
`border-image-width-computed` 0/12 (a fresh raw-store vein in
`css/css-backgrounds/parsing/`); OR a NEW `css/*/parsing/` dir. grep
`_joinOutline` / `_WIDTH_COMPUTED_PROPS`.
