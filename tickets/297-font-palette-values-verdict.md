# 🎨 The Font-Palette-Values Verdict — Quests #297–#299

> *A new at-rule joins the roster. `@font-palette-values` — the named palette
> override that lets a colour-font wear a different coat — was landing in the CSSOM
> as a faceless `CSSGenericRule`: no `.name`, no descriptor validation, invalid
> preludes kept alive, every accessor `undefined`. Two files, 63 subtests, told the
> whole story.*

## The gap

`css/css-fonts/parsing/` held a fat fresh vein hiding in a "mature" realm:

| File | Before | After |
|------|:------:|:-----:|
| `font-palette-values-invalid.html` | **1 / 27** | **27 / 27** |
| `font-palette-values-valid.html` | **11 / 36** | **36 / 36** |

**+51 across the arc, zero regressions.**

The `font-palette` *property* was already green (invalid 4/4, computed 4/4). The
gap was the `@font-palette-values` *at-rule* and its `CSSFontPaletteValuesRule`
CSSOM interface — entirely unmodelled. `_cssParseRuleList` routed it to the generic
`{ type: 'at' }` carrier, so its cssText round-tripped verbatim (accidentally
passing a handful of substring checks) but it had no `.name`, no
`.fontFamily`/`.basePalette`/`.overrideColors`, and no descriptor grammar.

## The work — three quests, by descriptor

The whole feature is one new class + two parser branches. Split into three
monotonic increments (each strictly ≥ the last on both files):

### #297 — Structure + `font-family` + `base-palette` (invalid 1→27, valid 11→10*)
- **Prelude validity.** `@font-palette-values <dashed-ident> { … }`. A `_cssParseRuleList`
  branch validates the prelude with `_isFpvName` (`/^--/` + `_GRID_CI_RE`) — an absent
  name (`@font-palette-values {}`), a non-dashed name (`A`), or two names (`--A --B`)
  makes the whole at-rule **invalid → dropped** (so `rules.length` drops the 3 malformed
  preludes → 25, not 28). Escaped names round-trip: `--\{` → `.name === "--{"`,
  serialized back via `_serializeCssIdent` as `--\{`.
- **`CSSFontPaletteValuesRule`** (new class, `globalThis`-exposed, real
  `constructor.name`). Readonly `.name` + the three descriptor accessors (getter-only —
  a sloppy-mode `rule.fontFamily = x` silently no-ops, per the readonly IDL attribute).
  **No `CSSRule.FONT_PALETTE_VALUES_RULE` constant** (the spec omits it; the test asserts
  `=== undefined`).
- **`font-family` descriptor** = `<family-name>#` — reuses the property-level
  `_canonOneFamily` but **rejects a lone `<generic-family>`** (`serif` is valid for the
  property, invalid in the descriptor) via `_fpvCanonFontFamily`. Empty string `""` is a
  valid family (stays). `font:` shorthand / a number / CSS-wide keywords → dropped.
- **`base-palette` descriptor** = `light | dark | <integer [0,∞]>` (`_fpvCanonBasePalette`).
  Negative, non-integer, string, CSS-wide, `sibling-index()` → invalid.
- *(\*) The valid file's per-rule subtests bundle all three accessors, so its count is
  pinned at 10 until override-colors lands — the −1 vs. baseline is purely
  cssText-verbatim matches lost, all recovered in #298. Stash-proved no permanent loss.*

### #298 — `override-colors` (valid 10→34)
- `override-colors` = `[ <integer [0,∞]> <absolute-color> ]#` (`_fpvCanonOverrideColors`).
  Comma list (paren-aware via `_splitCommaQuoted` so a `color-mix(…)`'s inner commas don't
  split entries); each entry `<index> <color>`; entries are **NOT deduped by index** (a
  repeated index keeps both). Any malformed entry (`0` alone, `0 "red"`, `ident #123`,
  `0 #123 1`, `0 #123, 1`, empty) invalidates the whole declaration.
- **Absolute-colour gate** (`_fpvAbsoluteColor` + `_fpvForbiddenColorTok`): the colour
  must be `_isValidColor` AND contain **no** `currentcolor`, system colour (`canvas`, …),
  or `light-dark()` — a token scan catches these anywhere. Colours canonicalize via
  `_canonColorSpecified` (`#0000FF`→`rgb(0, 0, 255)`, `green`/`transparent` kept as
  keywords). This quest defers `color-mix()` (gated off).

### #299 — `color-mix()` in `override-colors` (valid 34→36)
- Flip the `allowMix` gate on: an absolute `color-mix()` is a valid override colour
  (`0 color-mix(in lch, red, blue)`), **including nested** color-mix, and the token scan
  still rejects a color-mix carrying `currentcolor`/`canvas` (`color-mix(in lch, red,
  canvas)` stays invalid). `_canonColorSpecified` round-trips the mix syntax exactly.

## Last-valid-wins

Descriptors apply in source order; each **valid** value overrides the previous, and an
**invalid** value is dropped without clobbering the last valid one (CSS declaration-block
semantics + descriptor grammar). `_fpvSplitDecls` keeps the ordered, duplicate-preserving
declaration list a plain `_cssParseDecls` (which dedupes) would lose.

## Zero-regression sweep

qsa 1975, classlist 1420; CSSKeyframesRule 2/2, CSSKeyframeRule 2/2,
CSSGroupingRule-insertRule 7/7, CSSRuleList 1/1, cssom-cssText-serialize 1/1
(the shared `_cssParseRuleList`/`_makeRule` paths hold); font-invalid 13/16
(pre-existing partial, unchanged), font-variant-invalid 21/21, font-family-invalid 7/7,
font-palette-invalid 4/4 + -computed 4/4 (the *property*, untouched); color-valid 17/17,
color-invalid-color-mix-function 141/141 (#294–#295 held).

**Not regressions:** `CSSStyleSheet.html` 11/6 (the 6 fails are `insertRule`/`addRule`/
`removeRule` arity behaviors — unrelated to at-rules), `CSSFontFaceRule.html` 0/1 (the
untouched `CSSGenericRule` font-face path — a separate interface gap).

## Caps / Next

**CAP:** `@font-face` / `@counter-style` / `@page` still ride the minimal
`CSSGenericRule` carrier (verbatim cssText, no typed interface). `CSSFontFaceRule.html`
(0/1) is the next at-rule-interface quest if a fat vein wants it — but it's a lone
subtest, low ROI.

**NEXT LEVERAGE:** scout a fresh `css/*/parsing/` dir. This session re-confirmed the
lesson: even a "mature/green" realm (css-fonts) can hide a fully-unmodelled feature — the
tell here was a **1/27** file, not a partial. Batch-scan `*-invalid`/`*-computed`;
transforms/images/transitions/shapes/anchor-position/content/lists/color-adjust/text/font-variant
were all re-baselined green this session. Reusable templates from this arc:
`CSSFontPaletteValuesRule` (a typed at-rule: `_cssParseRuleList` prelude-validity branch
+ `_makeRule` branch + a class with descriptor accessors), `_fpvSplitDecls` (ordered
last-valid-wins descriptor block), `_fpvAbsoluteColor`/`_fpvForbiddenColorTok`
(absolute-colour gate — reject currentColor/system/light-dark by token scan).
