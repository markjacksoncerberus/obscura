# 🏛️ Quest #225 — The Multi-Column Verdict

**Realm:** `css/css-multicol/parsing/`
**Result:** +103, ZERO regressions (session 2026-07-18)
**Files:** `crates/obscura-js/js/bootstrap.js`

## The gap

Took #224's next-leverage (a NEW `css/*/parsing/` dir). Baselined
`css/css-multicol/parsing/` and found the WHOLE property family raw-store — the
multicol longhands and both shorthands stored their value verbatim (no grammar
check, no computed resolution). Every `*-invalid` file scored 0/N (junk accepted),
the `*-computed` files never folded calc()/em, and `columns`/`column-rule` had no
canonical serialization:

| Test | Baseline |
|------|:--------:|
| columns-valid | 10/24 |
| columns-invalid | 0/17 |
| columns-computed | 0/27 |
| column-count-invalid | 0/6 |
| column-count-computed | 3/4 |
| column-width-invalid | 0/5 |
| column-width-valid | 2/3 |
| column-width-computed | 1/3 |
| column-rule-shorthand | 0/12 |
| column-rule-computed | 0/6 |
| column-rule-valid | 3/5 |
| column-rule-invalid | 0/3 |
| column-rule-width-computed | 1/3 |
| column-rule-style-invalid | 0/1 |
| column-span-invalid | 0/2 |
| column-fill-invalid | 0/2 |

The longhand `-valid`/`-computed` files for style/color/span/fill already passed
(generic echo accepts valid keywords), but their `-invalid` twins failed.

## The grammar

- `column-width` : `auto | <length [0,∞]>` (unitless `0` → `0px`; calc folded, clamped ≥0)
- `column-count` : `auto | <integer [1,∞]>` (a number-typed calc folds at computed time)
- `column-rule-width` : `<line-width>` = `thin | medium | thick | <length [0,∞]>` (= outline-width)
- `column-rule-color` : `<color>`  ·  `column-rule-style` : `<line-style>` (NO `auto`)
- `column-span` : `none | all`  ·  `column-fill` : `auto | balance | balance-all`
- `column-rule` : `<'column-rule-width'> || <'column-rule-style'> || <'column-rule-color'>`
- `columns` : `[ <'column-width'> || <'column-count'> ] [ / <'column-height'> ]?`
  (css-multicol-2; `<column-height>` shares the `<column-width>` grammar)

## The work

All in `bootstrap.js`, mirroring the established css-ui / border-expand templates.

### `column-rule` → the border-expand machinery (+23)

`column-rule` is a border/outline-style shorthand, so it joins `_BORDER_EXPAND`
(`['column-rule-width','column-rule-style','column-rule-color']`). Added a
`column-rule` case to `_expandBorderShorthand` (reuses `_parseBorderSideStrict`
with `outlineStyle=false` — no `auto` line-style; `auto` → invalid `<color>` →
rejected) and a case to `_serializeBorderShorthand`. The ONE difference from
`_joinBorderSide`: the all-initial serialization falls back to the WIDTH initial
`medium` (not the style initial `none`, unlike border/outline) — matches the
`column-rule-valid` reference (`currentcolor none medium` → `medium`). This gives
the shorthand the full setProperty-expand → getter/removeProperty/computed wiring
for free (`test_shorthand_value` reads each longhand + `.style.length`; a cssText
blob still round-trips via the raw-key getter branch).

Computed `column-rule`: a getComputedStyle `resolve()` branch reconstructs from the
COMPUTED longhands — width and colour always print, style prints only when it is not
`none` (`10px` → `10px rgb(0, 255, 0)`; `dotted` → `medium dotted rgb(0, 255, 0)`;
`0px none rgb(255,0,255)` → `0px rgb(255, 0, 255)`). `mediumWidth` in the test is
derived from OUR own `column-rule-width: medium` computed, so leaving `medium`
unresolved is self-consistent (thin/medium/thick→px is "not yet tested" per the
longhand spec note).

### The multicol longhands + `columns` self-canon (+80)

New `_canonMulticol(name, value)` + `_MULTICOL_VALIDATED` set, dispatched in the
API `setProperty` else-if chain (after `_CSSUI_VALIDATED`) and the CSS.supports
validity switch. `column-rule` is NOT in the set — it is a border-expand shorthand
handled earlier. Helpers:

- `_canonColumnWidth` — `auto`/`0px`/length (rejects literal-negative, `%`, unitless
  non-zero, `none`, multi-token); also serves `<column-height>`.
- `_canonColumnRuleWidth` — outline-width logic (adds thin/medium/thick).
- `_canonColumnCount` — `auto`/positive-integer/number-typed calc (`_mt(root,null)
  ==='number'`; rejects `2.5`/`-1`/`0`/`auto 1`/`1 234`).
- `column-rule-color` — single `<color>` (`green blue`/`auto` → invalid).
- `_MULTICOL_ENUM` — span/fill enums + `column-rule-style` (`_LINE_STYLE_KW`).
- `columns` — `_parseColumns`/`_serColumns`/`_slashSplitTop`. `_slashSplitTop`
  splits on a top-level `/` (paren-aware, so a calc division `/` is preserved). The
  `||` body classifies each token: a length (incl. a unitless `0`) → column-width, a
  positive integer → column-count, `auto` → fills width-first-then-count. Canonical
  serialization is width-then-count (each dropped when `auto`; both-auto → `auto`),
  then ` / <height>` only when the height is non-`auto`. `2 10px`→`10px 2`,
  `auto 3`→`3`, `1 0`→`0px 1`, `10px 2 / auto`→`10px 2`, `auto / auto`→`auto`.
  Rejects `0 0`/`10px 20px`/`10 20`/`0 7px` (double-classify), 3-token bodies, and
  every lone-`/` form (`/ 100px`, `auto /`, `2 100px /`, …).

### Computed

- `column-width`, `column-rule-width` → added to `_LENGTH_COMPUTED_PROPS` +
  `_CLAMP_NEG_PROPS`: `auto`/`medium` keywords pass through `_trComp`, a length/calc
  resolves to px (em folded) and clamps ≥0. `calc(10px + 0.5em)`→`30px`,
  `calc(10px - 0.5em)`→`0px`.
- `column-count` → a dedicated `_normComputed` branch folding a calc via
  `_computeIntegerValue`, clamped ≥1 (`calc(1 + 234)`→`235`).
- `columns` → a `resolve()` branch: `_computeColumns(el, spec)` re-parses the
  self-canonical specified value and resolves its width/height `<length>`s to px
  (count stays integer), re-serializing with the drop rules. `columns`/`column-rule`
  registered in `_CSS_KNOWN_PROPS`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| columns-valid | 10/24 | **24/24** |
| columns-invalid | 0/17 | **17/17** |
| columns-computed | 0/27 | **27/27** |
| column-count-invalid | 0/6 | **6/6** |
| column-count-computed | 3/4 | **4/4** |
| column-width-invalid | 0/5 | **5/5** |
| column-width-valid | 2/3 | **3/3** |
| column-width-computed | 1/3 | **3/3** |
| column-rule-shorthand | 0/12 | **12/12** |
| column-rule-computed | 0/6 | **6/6** |
| column-rule-valid | 3/5 | **5/5** |
| column-rule-invalid | 0/3 | **3/3** |
| column-rule-width-computed | 1/3 | **3/3** |
| column-rule-style-invalid | 0/1 | **1/1** |
| column-span-invalid | 0/2 | **2/2** |
| column-fill-invalid | 0/2 | **2/2** |

**+103, ZERO regressions.** The whole `css/css-multicol/parsing/` dir is now green
save the pseudo-element CAP. Held: qsa 1975, classlist/DOMTokenList 1/1,
createElement 147, getComputedStyle-property-order 1/1 (+2 registered shorthands
did not disturb enumeration), serialize-values 695/697 (2 pre-existing),
outline-shorthand 4/4, border-valid 6/6, border-shorthand 36/36, flex-computed
14/14, flex-basis-computed 12/12, gap-computed 11/11, text-indent-computed 10/10,
inset-computed 20/20, tab-size-computed 10/10, transition-shorthand 18/18,
animation-shorthand 36/36. In-dir greens held: column-rule-style-valid/-computed
9/9, column-rule-color-valid/-invalid/-computed 2/2, column-span-valid/-computed
2/2, column-fill-valid/-computed 3/3, column-count-valid 3/3.

## Caps / Next

- **CAP: `column-pseudo-computed.html` 0/4** — a `::column` pseudo-element computed
  test (`::column { font-size }` inheritance). Needs `::column` pseudo-element
  support in the render/style tree, NOT value parsing. Unwinnable here.
- **Adjacent lever (NOT taken):** `outline-width-computed` is 5/9 — the calc/em/px
  fails are because `outline-width` is NOT in `_LENGTH_COMPUTED_PROPS` (it echoes its
  specified value). Adding it (like column-rule-width) would fold `0.5em`→`20px`,
  `calc(10px+0.5em)`→`30px`, but thin/medium/thick must then resolve to px (the
  `thin` subtest expects a px value) and `medium` is the initial — a keyword→px map
  that risks border-width computed. Scope it as its own quest with a stash-prove.
  `outline-valid` 17/20 is the pre-existing color/style/width **ordering** gap
  (`3px ridge rgba()` → `rgba() ridge 3px`) + `outline: 0`→`""` in `_joinBorderSide`
  — both pre-existing, untouched here.
- **NEXT LEVERAGE:** a NEW `css/*/parsing/` dir. Candidates baselined but NOT worked:
  `css/css-text-decor/parsing/` (`text-decoration-shorthand` 0/5,
  `text-decoration-computed` 0/14, `text-emphasis-computed` 0/7 — a wide raw-store
  vein, the `text-decoration` shorthand + `<text-emphasis>` grammar);
  `css/css-lists/parsing/` (`list-style-shorthand.sub` 0/4, `list-style-computed.sub`
  0/5 — `list-style` shorthand + `<image>` computed); `css/css-ui/parsing/`
  (`cursor-computed` 36/39, `resize-computed` 5/6 — small). grep `_canonMulticol`.
