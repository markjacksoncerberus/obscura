# Quest #233 — The Width-Computed Verdict

**Realms:** `css/css-ui/parsing/` + `css/css-backgrounds/parsing/`
**Result:** +8 subtests, ZERO regressions. Both target files → 100%.
**Session:** 2026-07-21

## The gap

Took #232's next-leverage (the outline family). `outline-width-computed` sat at
5/9; root-causing it surfaced the *identical* vein in
`border-width-computed` 7/11 — one shared primitive.

The computed value of `outline-width` / `border-*-width` is an absolute
`<length>`, but the engine echoed the specified value:

- `0.5em` → `0.5em` (em never resolved)
- `thin`/`medium`/`thick` stayed keywords — so the WPT `thin ≤ medium ≤ thick`
  numeric-ordering assertion did `parseFloat('thin')` = NaN and failed
- `calc(10px - 0.5em)` → unfolded
- no integer-device-pixel snap (`2.5px` should compute to `2px` at DPR 1)

The `border-width` **shorthand** computed value also echoed specified
(`2px thin medium thick` verbatim) because it fell to `_computedPropOf`, which
does not reconstruct edge shorthands from computed longhands.

## The fix (all `bootstrap.js`)

1. **Shared width resolution** — a new `_normComputed` branch keyed on
   `_WIDTH_COMPUTED_PROPS` (the four `border-*-width` longhands + `outline-width`):
   a keyword resolves via `_LINE_WIDTH_PX` (`thin` 1 / `medium` 3 / `thick` 5 —
   the conventional Chrome/Firefox map); everything else goes through `_trComp` →
   px (em/vw/calc resolved), is clamped ≥0, then floored to an integer device
   pixel (`2.5px`→`2px`).

   The outline test's keyword cases compare `outline-width: thin` against
   `border-top-width: thin` (both set in the stylesheet). Because both sides use
   the *same* map, they resolve to `1px` and match — the test never asserts an
   absolute keyword value, only keyword-to-keyword and keyword-ordering.

2. **`border-width` shorthand** — a new getComputedStyle `resolve()` branch
   reconstructs from the COMPUTED longhands via `_serializeBoxValue` (collapsing
   to the shortest 1–4 edge form): `2px thin medium thick`→`2px 1px 3px 5px`,
   `0.5em`→`20px`.

## Wins

| File | Before | After |
|------|:------:|:-----:|
| `outline-width-computed` | 5/9 | **9/9** |
| `border-width-computed` | 7/11 | **11/11** |

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, getComputedStyle-property-order 1/1,
outline-shorthand 4/4, outline-width-valid 7/7, outline-width-invalid 3/3,
outline-offset-computed 7/7, column-rule-width-computed 3/3 (column-rule-width
stays in `_LENGTH_COMPUTED_PROPS`, untouched), orphans-computed 3/3 held.

**STASH-PROVED** `border-image-width-computed` 0/12 identical with and without
the change — a pre-existing, unrelated `border-image-width` gap (that property is
NOT in `_WIDTH_COMPUTED_PROPS`), so it is a cap, not a regression.

## Caps / Next

**CAP:** the `border-style`/`border-color` shorthands keep their existing
specified-echo computed path (untouched — no failing test drove them).

**NEXT LEVERAGE:** `outline-valid` 17/20 is the live in-dir sibling — the
`outline` SHORTHAND specified serialization needs the css-ui-4 canonical order
`<color> || <style> || <width>` (WPT wants `3px ridge rgba(…)`→`rgba(…) ridge
3px`, `dashed thin`→`dashed thin`) and `outline: 0` must be accepted (currently
disallowed → `""`). This is `_joinBorderSide` / `_parseBorderSideStrict` for
outline only — border keeps width-style-color, so scope it to outline and
stash-prove border + outline-shorthand. Also `cursor-computed` 36/39
(gradient-cursor grammar) and `resize-computed` 5/6 (pseudo-element bug). OR
`border-image-width-computed` 0/12 (a fresh raw-store vein). grep
`_WIDTH_COMPUTED_PROPS` / `_LINE_WIDTH_PX`.
