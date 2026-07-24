# Quests #303–#305 — css-scrollbars + the css-borders-4 corner-shape feature

**Session 2026-07-24. Branch `engine-per-page-threads`. +248, ZERO regressions, ONE commit.**

## The gap

Scouting fresh `css/*/parsing/` dirs turned up two raw-store scrollbar properties and
a fully-unmodelled css-borders-4 feature:

| File | Before | After |
|------|:------:|:-----:|
| `css/css-scrollbars/scrollbar-width-parsing.html` | 4/15 | **15/15** |
| `css/css-scrollbars/scrollbar-color-parsing.html` | 8/13 | **13/13** |
| `css/css-borders/corner-shape/corner-shape-invalid.html` | 0/71 | **71/71** |
| `css/css-borders/corner-shape/corner-shape-valid.html` | 118/241 | **241/241** |
| `css/css-borders/corner-shape/corner-shape-computed.html` | 0/38 | **38/38** |

## #303 The Scrollbar-Width Verdict (+11)

`scrollbar-width` = `auto | thin | none` — an inherited single-keyword enum (initial
`auto`). The `_CSSUI_ENUM` template: a set entry, `_CSSUI_VALIDATED`, `_GCS_DEFAULTS`
`'auto'`, `_INHERITED_PROPS`. Rejects `tiny`/`enormous`/`12px`/`3em`/`20%`/`#FF0000`/
`red green` and every two-keyword combination (`auto none`, `thin auto`, `none thin`).

`scrollbar-width-keywords.html` stays **1/2** — a scrollbar-SIZING layout reftest
(`clientWidth`/`clientHeight` of an overflowing box), a documented **render cap**, not
a parsing gap. Our stored value (`none`) is already correct.

## #304 The Scrollbar-Color Verdict (+5)

`scrollbar-color` = `auto | <color>{2}` — inherited; a dedicated `_canonCssUi` branch
mirroring `caret-color`/`outline-color`. `auto` stands ALONE (both thumb & track use
the UA default); otherwise EXACTLY two `<color>` values (`_isValidColor` +
`_canonColorSpecified`), canonicalized (`#FF0000 #00FF00` → `rgb(255, 0, 0) rgb(0, 255,
0)`). `auto` is not a `<color>`, so it can't mix (`auto currentcolor`), repeat (`auto
auto`), and a single colour (`red`/`#FF0000`) is invalid. `currentcolor currentcolor`
is valid. Registered in `_CSSUI_VALIDATED` + `_GCS_DEFAULTS` `'auto'` + `_INHERITED_PROPS`.

## #305 The Corner-Shape Verdict (+232)

The NEW css-borders-4 `corner-shape` feature — a whole property family, fully unmodelled.

**`<corner-shape-value>`** = `round | scoop | bevel | notch | square | squircle |
superellipse(<number>)`. Each keyword is an alias for a `superellipse()` with a fixed
exponent:

| keyword | exponent |
|---------|----------|
| `bevel` | 0 |
| `scoop` | -1 |
| `notch` | -infinity |
| `round` | 1 |
| `squircle` | 2 |
| `square` | infinity |

- **`_canonCornerShapeValue(v, computed)`** — validates ONE value. `superellipse()`
  takes EXACTLY one `<number>` argument, where `<number>` includes the `infinity`/
  `-infinity` calc constants and `<number>`-typed `calc()`. Invalid: `superellipse(8 8)`
  (two tokens), `superellipse(,)`/`superellipse(4,0.1)` (comma), `superellipse(foo)`/
  `superellipse(1 abc)`/`superellipse()`/`superellipse(--.3)` (not a number), plus
  `straight`/`auto`/`none`/`10px`/`10%`.
- **SPECIFIED** keeps the author keyword; `superellipse(.5)`→`superellipse(0.5)`,
  `superellipse(  0)`→`superellipse(0)`, `superellipse(calc(0.5 * 4))`→
  `superellipse(calc(2))` (`_canonSuperellipseNum` → `_canonMathExpr`).
- **COMPUTED** (`_normComputed` branch) maps EVERY value → `superellipse(<number>)`
  (`round`→`superellipse(1)`, `square`→`superellipse(infinity)`, `notch`→
  `superellipse(-infinity)`); an explicit `superellipse(1)` stays itself.

**8 single-corner longhands** — 4 physical (`corner-{top,bottom}-{left,right}-shape`)
+ 4 flow-relative (`corner-{start,end}-{start,end}-shape`). Each takes ONE value; not
inherited; initial `round`. Wired via `_CSSUI_VALIDATED` + a `_canonCssUi` branch
(`_CORNER_SHAPE_LONGHANDS`) + the `_normComputed` branch + `_GCS_DEFAULTS 'round'`.

**9 shorthands** (`_CORNER_SHAPE_SH`) — `corner-shape` (4-value, physical order TL·TR·
BR·BL) + 8 two-value edge shorthands (`corner-{top,right,bottom,left}-shape` physical,
`corner-{block,inline}-{start,end}-shape` flow-relative). Expand via
`_parseCornerShapeShorthand` (reusing `_boxEdges` for the `{1,4}` edge expansion) and
reconstruct-and-collapse via `_serCornerShapeSh` (reusing `_serializeBoxValue`). Wired
at the SAME 6 shorthand touch points as `_GAP_RULE_SH`:
1. setProperty — expand into + store the longhands (CSS-wide keyword → single key).
2. removeProperty — clear the longhands.
3. getPropertyValue — reconstruct + collapse (`"round round round round"`→`"round"`).
4. computed getPropertyValue — reconstruct from the COMPUTED longhands.
5. `_expandShorthand` (cascade path).
6. `CSS.supports`.
Plus `_CSS_KNOWN_PROPS` (so `CSS.supports` + computed enumeration recognize them).

## Zero-regression sweep

qsa 1975, classlist 1420, **serialize-values 695/697** (the box-shorthand-serialization
canary — held EXACTLY, proving `_boxEdges`/`_serializeBoxValue` reuse didn't perturb
margin/padding), display-invalid 55/55, color-valid 17/17, caret-color-invalid 12/12,
box-sizing-computed 2/2, overflow-anchor-computed 2/2, margin-block-inline-invalid 7/7.
`border-radius-valid` 20/23 and `margin-computed` 7/8 are PRE-EXISTING partials (my
changes are purely additive `corner-*`/`scrollbar-*` branches — no shared mutable state).

## Caps / Next

- **CAP — the COMBINED `corner-*` shorthands.** `corner-top-left`/`corner`/`corners` =
  `<corner-shape-value> || <length-percentage>{1,2}` (shape ⊗ border-radius) stay 0:
  `corner-invalid` 0/14, `corner-computed` 0/22, `corners-invalid` 0/23. DEFERRED — they
  need the shape⊗radius product woven with the border-radius longhands.
- **CAP — `scrollbar-width-keywords` 1/2** — scrollbar-sizing render cap.
- **NEXT LEVERAGE:** the combined `corner-*` shorthands (~59 subtests) reuse the
  `_CORNER_SHAPE_*` engine + the border-radius longhands — the natural next quest. Then
  scout a fresh `css/*/parsing/` dir. Reusable templates: `_CSSUI_ENUM` (keyword enum),
  a dedicated `_canonCssUi` `auto|<color>{2}` branch, and the `_CORNER_SHAPE_SH`
  shorthand template (expand-via-`_boxEdges` + collapse-via-`_serializeBoxValue`, 6
  touch points).
