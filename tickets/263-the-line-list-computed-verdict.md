# Quest #263 — The Line-List Computed Verdict

**Realm:** `css/css-gaps/parsing/` (CSS Gap Decorations)
**Banner:** COMPUTED serialization of the `<line-*-list>` grammar + the bidirectional shorthand computed reconstruction.
**Result:** +45, ZERO regressions. **The css-gaps color/style/width/break line-decoration vein is now SECURED.**

## The gap
Quest #262 validated the specified `<line-*-list>` grammar, but computed serialization was
raw-store for the list forms:
- `gap-decorations-color-computed` 5/33 — colours not resolved, repeat/list not computed.
- `gap-decorations-width-computed` 12/24 — length leaves + folded integers not computed.
- `gap-decorations-style-computed` 60/63, `gap-decorations-bidirectional-shorthands` 10/14.

## The computed model
The list STRUCTURE is kept (`repeat` stays a repeat), the repeat integer FOLDS
(`repeat(calc(5 + 3), …)` → `repeat(8, …)`), and each leaf resolves to its computed form:
colour → `rgb(…)`/`color(srgb …)` (incl. `currentColor`, color-mix(), relative colour);
width → px (calc/em folded, clamp ≥0); style → keyword identity.

## The work (all `bootstrap.js`)
- **NEW `_computeGapRuleList(el, kebab, v)`** — re-parses the stored list; per item folds the
  repeat count (`_computeIntegerValue`, `auto` kept) and maps each leaf through
  `_computeGapLeaf` (colour → `_computeColorFull`; width → `_LINE_WIDTH_PX` keyword or
  `_clampNegPx(_trComp(...))`; style → identity).
- **Factored `_computeColorFull(el, v, isColorProp)`** out of the `_normComputed` colour
  branch (currentColor → modern → color-mix → alpha → contrast → relative → legacy) so the
  gap colour leaf resolves identically to a standalone `<color>` property. The colour branch
  now calls it — byte-identical (proven: color-computed 16/16, -rgb 79/99, -lab 112/120 held).
- **Dispatch:** `_normComputed` intercepts a LIST gap-rule value (`_isGapList` = `repeat(` or a
  top-level comma) at the TOP, before the `_LENGTH_COMPUTED_PROPS`/`_COLOR_PROPS` branches
  (which would mangle the whole list). SINGLE-leaf values fall through to those existing
  paths — so multicol column-rule-* computed is untouched. Registered single `row-rule-color`
  in `_COLOR_PROPS` and `row-rule-width` in `_LENGTH_COMPUTED_PROPS`/`_CLAMP_NEG_PROPS`.
- **`rule` mega-shorthand** computed reconstruction (`<width> [<style>] <color>`, only when
  BOTH axes agree on all three, else `''`) + `add('rule')`.
- **Bugfix (the width calc leaf):** `_canonLengthTimeMath` was shedding the `calc()` wrapper of a
  leaf INSIDE `repeat(...)` (`repeat(5, calc(0.5em + 10px))` → an invalid bare `0.5em + 10px`),
  because it treats `repeat(` as an unknown function and serializes its argument at root
  position. Guarded the gap-rule props out (`if (_GAP_RULE_LEAF[name]) return v` — they
  self-canonicalize via `_canonGapRuleList`).

## Results
| File | Before | After |
|------|:------:|:-----:|
| `gap-decorations-color-computed` | 5/33 | **33/33** |
| `gap-decorations-style-computed` | 60/63 | **63/63** |
| `gap-decorations-width-computed` | 12/24 | **24/24** |
| `gap-decorations-bidirectional-shorthands` | 10/14 | **12/14** |

**+45.**

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697; multicol column-rule-color/-width/-computed
2·3·6 held; color-computed 16/16, -rgb 79/99, -lab 112/120, background-color-computed 7/7,
caret-color-computed 12/12 all held exactly (the `_computeColorFull` refactor is byte-identical).

## Caps / Next
The css-gaps **color/style/width/break** line-decoration vein is SECURED across all
valid/invalid/computed + the bidirectional/`rule` shorthands. **CAP (2 bidirectional
subtests):** `rule-visibility-items` and `rule-inset` are SEPARATE gap-decoration property
families (the dir has a large `rule-inset-*` set — ~20 files — plus `column/row-rule-visibility-items`).
**Next:** the `rule-inset-*` family (cap-start/end, junction-start/end, the inset shorthand +
bidirectional shorthands) and `rule-visibility-items` — both fresh raw-store veins in the SAME
dir; or a NEW `css/*/parsing/` dir. grep `_computeGapRuleList`/`_computeColorFull`/`_GAP_BIDI_SH`.
