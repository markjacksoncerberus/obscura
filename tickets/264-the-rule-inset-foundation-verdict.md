# Quest #264 — The Rule-Inset Foundation Verdict

**Realm:** `css/css-gaps/parsing/` — the CSS Gap Decorations rule-INSET family
**Hold before:** 30/342 across the 9 start-end-level files (raw-store)
**Hold after:** 342/342 — **+312, ZERO regressions**

## The vein

CSS Gap Decorations gives every gap rule an *inset* — how far it is pulled back
from its gap intersections. The property tree:

- **8 stored leaf longhands**, one per `axis {column,row} × position {cap,junction}
  × side {start,end}`. Each = a single `<inset-value> = <length-percentage> |
  overlap-join` (initial `0`; computed folds `<length>`→px, keeps %/calc symbolic;
  `overlap-join` is a keyword).
- A tower of shorthands over them:
  - `{axis}-rule-inset-cap` / `-junction` → the two sides of one position — `<iv>{1,2}`
  - `{axis}-rule-inset-start` / `-end` → the two positions of one side — single `<iv>` (both)
  - `{axis}-rule-inset` → all four of one axis — `<iv>{1,2} [ / <iv>{1,2} ]?`
  - `rule-inset-cap/-junction/-start/-end/-inset` → the same, on **both** axes.

Everything was raw-store: the 8 longhands + every shorthand unregistered, so every
`-invalid`/`-computed`/`-shorthand` file scored 0/N.

## The work (this quest: the FOUNDATION + the start-end level)

Built the whole `_RI_*` infra in `bootstrap.js` (all three value shapes) and
registered the **start-end level**:

- `_RI_LEAF` (the 8 stored longhands) + `_canonInsetValue`/`_canonRuleInsetLeaf`
  (validate a single `<inset-value>`, reusing `_canonLenPctSigned(tok,true)` for the
  `<length-percentage>` + the `overlap-join` keyword) + `_computeInsetValue`
  (`overlap-join` identity; else `_trComp`→px, % kept — identical folding to a
  baseline-shift length).
- `_parseInsetShape(value, shape)` handles `dup` / `pair` / `quad` (the last via a
  paren-aware `_slashSplitTop` + `_parseInsetPair`); **only dup rows are registered
  this quest** — cap-junction (pair) lands in #265, inset (quad) in #266.
- `_RI_SH` (per-axis) + `_RI_BIDI` (both-axes) tables; `_expandRuleInset`
  (shorthand value → leaf-longhand map, CSS-wide → every leaf) + `_serRuleInset`
  (reconstruct from longhands; dup: equal→value else ''; bidi: axes agree→value else '').
- Wired the six shorthand touch points exactly like `_GAP_BIDI_SH`/box-logical:
  inline `_parseStyleDecls`, setProperty (shorthand-expand + leaf-validate),
  removeProperty, getPropertyValue, getComputedStyle resolver + `_normComputed` leaf
  fold + `add()` registration, and CSS.supports. Registered the 8 leaf longhands in
  `_GCS_DEFAULTS` (`0px`).

## Results

| file | before | after |
|------|:------:|:-----:|
| rule-inset-cap-start-end-computed | 0/32 | 32/32 |
| rule-inset-cap-start-end-invalid | 0/24 | 24/24 |
| rule-inset-junction-start-end-computed | 0/32 | 32/32 |
| rule-inset-junction-start-end-invalid | 0/24 | 24/24 |
| rule-inset-start-end-valid | 30/36 | 36/36 |
| rule-inset-start-end-invalid | 0/48 | 48/48 |
| rule-inset-start-end-computed | 0/36 | 36/36 |
| rule-inset-start-end-shorthand | 0/60 | 60/60 |
| rule-inset-start-end-bidirectional-shorthand | 0/50 | 50/50 |

**Zero-regression sweep:** qsa 1975, classlist 1420, serialize-values 695/697,
multicol column-rule-shorthand 12/12, column-rule-width-computed 3/3, color-computed
16/16, gap-decorations-color-computed 33/33, gap-decorations-width-computed 24/24,
gap-decorations-bidirectional-shorthands 12/14 (the 2 fails = the rule-visibility-items
cap, #266) — all held.

## Caps / Next

The `_RI_*` infra is built (all shapes). **#265** registers the cap-junction level
(add 4 `pair` rows to `_RI_SH` + 2 bidi rows) → greens rule-inset-cap-junction-*
(valid/invalid/computed/shorthand) + the two cap/junction bidirectional-shorthand
files. **#266** registers the `inset` super-shorthand (2 `quad` rows — the `/`
grammar) + builds the `rule-visibility-items` family (`all|around|between|normal`
enum + its bidirectional shorthand). grep `_RI_LEAF`/`_expandRuleInset`/`_serRuleInset`.
