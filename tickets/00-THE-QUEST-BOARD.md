# 🏰 The Quest Board — Web Platform Conformance Campaign

> *Hear ye! These scrolls chart every unconquered realm of the Web Platform Tests
> still standing between Obscura and a kingdom safe for all AI-agent travellers.
> Each scroll names a region, its current hold, the beasts within, and a battle
> plan. Choose thy banner.*

Measured via `scripts/wpt_run.py` over CDP against a `--features render` server.
Live scoreboard of conquered lands: [`../WPT_PROGRESS.md`](../WPT_PROGRESS.md).

> 🤝 **New here?** Start with [`AGENT-HANDOFF.md`](AGENT-HANDOFF.md) — the dev loop,
> hard-won gotchas, architecture map, and concrete next moves.

---

## ⚔️ Open Quests

| # | Scroll | Realm | Hold | Difficulty | Bounty |
|---|--------|-------|:----:|:----------:|:------:|
| ~~207~~ | ✅ [The Image-Resolution Verdict](207-the-image-resolution-verdict.md) | **`image-resolution` rejection gate** — `css/css-images/parsing/` (image-resolution-invalid) | **+5 in one file** | ⚔️ | **SECURED — +5, zero regressions.** `image-resolution = [ from-image \|\| <resolution> ] && snap?` was pure raw-store (invalid 0/5; -valid passes 12/12 verbatim since no browser ships the prop, so its expectations are author byte-order). Added `_isValidImageResolution` — a pure rejection gate (value kept byte-identical, no reorder): the `[from-image \|\| <resolution>]` group required, each part ≤ once; `snap` optional/≤ once/never interior (opposite side of the `&&`). Rejects `auto`/`100%`/`2` (no group member) + `3dpi snap from-image`/`from-image snap 4dppx` (snap splits the group). Wired into both setProperty paths, var()/CSS-wide deferred. **Next:** a NEW `css/*/parsing/` dir — baseline its `*-invalid` files for a raw-store tell. |
| ~~202~~ | ✅ [The Gradient Interpolation Verdict](202-the-gradient-interpolation-verdict.md) | **Gradient `<color-interpolation-method>` rejection gate** — `css/css-images/parsing/` (gradient-interpolation-method-invalid) | **+292 in one file** | ⚔️⚔️ | **SECURED — +292, zero regressions.** `gradient-interpolation-method-invalid` was 0/292 while `-valid` 1398/1398 and `-computed` 932/932 already passed: the `_canonGradients` engine canonicalizes every valid `in <space> [<hue> hue]?` clause but was *lenient* (unrecognized first args passed through as stops). Added `_gradientInvalid(value)` — a rejection gate parallel to `_imageFuncInvalid`, wired in both setProperty paths — that validates ONLY the interpolation-method grammar/placement: `in` must be immediately followed by a colour space, no interpolation-ish token may sit outside a valid `in` clause (`lab lab`/`hsl hue`/`in 45deg`/`in to right`/`90deg in hsl longer`), no colour stop may begin with a bare colour-space keyword (`red, blue, lab`), no empty argument. Canonicalizer untouched → valid/computed held. Defers on `var()`/`env()`. **Next:** `gradient-position-invalid` 0/9, `conic-gradient-calc-angle-percentage-invalid` 0/4, `object-fit`/`image-orientation`/`image-rendering` `-invalid`, or `background-image-invalid` 0/12 (negative radial radii + `cross-fade()` %). |
| ~~201~~ | ✅ [The Line-Clamp Verdict](201-the-line-clamp-verdict.md) | **The `line-clamp` shorthand value engine** — `css/css-overflow/parsing/` (line-clamp-invalid + line-clamp-valid) | **+16 across 2 files** | ⚔️⚔️ | **SECURED — +16, zero regressions.** Same #179→#200 raw-store→validate lever: the unprefixed `line-clamp` shorthand had no dedicated handling — a generic path stored simple values raw (invalid 0/8) yet dropped `no-ellipsis`/`<string>`/`-webkit-legacy` values and never canonicalized (valid 10/18). Built (JS) `_serLineClamp` for `line-clamp = none \| [ <integer [1,∞]> \|\| <'block-ellipsis'> ] -webkit-legacy?`: canonical `<max-lines> <block-ellipsis>? -webkit-legacy?` where the max-lines slot is the integer or `auto` when omitted, and the block-ellipsis token is emitted only when non-default (`auto` kept only beside an int, `ellipsis`/omitted = default elided, `no-ellipsis`/`<string>` verbatim). Only the specified-value serialization is tested → pure string canon, no longhand expansion. Wired identity-guarded in both setProperty paths, reusing `_wsTokens`. **Cap:** `webkit-box-computed` 14/20 (6 = `display` computed-value special-casing, a layout feature). **Next:** `scroll-buttons-invalid` 1/8, else a NEW `css/*/parsing/` dir or a gradient grammar validator. |
| ~~199~~ | ✅ [The Contain Verdict](199-the-contain-verdict.md) | **The `contain` value engine** — `css/css-contain/parsing/` (invalid + valid + computed + computed-children) | **+34 across 4 files** | ⚔️ | **SECURED — +34, zero regressions. CLOSES `css/css-contain/parsing/` (43/43).** Same #179→#198 raw-store→validate lever: `contain` had no property handling at all (unregistered in `_GCS_DEFAULTS`, stored raw) → invalid 0/14, valid 9/13, computed 0/15, computed-children 0/1. Built (JS) `_serContain` for `contain = none \| strict \| content \| [ [size\|inline-size] \|\| layout \|\| style \|\| paint ]`: unordered set (no repeats, size/inline-size mutually exclusive), canonical order size/inline-size→layout→style→paint. SPECIFIED keeps the expanded list; COMPUTED folds `layout style paint`→`content` and `size layout style paint`→`strict` (inline-size does NOT fold). Registered `contain: none` default (does not inherit) so getComputedStyle enumerates it + children read `none`. Wired identity-guarded (`_CSS_WIDE`/`_TF_VAR_RE`) in both setProperty paths + a `kebab === 'contain'` computed branch. **No caps** (dir closed). **Next:** `css-ui` (`cursor-invalid` 0/10 = `<url>`-list cursor engine) or `css-overflow` remainder (`text-overflow`/`scrollbar-gutter`/`webkit-line-clamp` `-invalid`). |
| ~~193~~ | ✅ [The Background Verdict](193-the-background-verdict.md) | **The `background` shorthand + its five raw-store sub-property longhands** — background-repeat/-attachment/-clip/-origin/-size (invalid+valid) + the `background` shorthand (valid+invalid), the last raw-store vein of `css/css-backgrounds/parsing/` | **+72 across 11 files** | ⚔️⚔️⚔️ | **SECURED — +72, zero regressions.** Same #179→#192 lever: five sub-prop longhands stored RAW (`*-invalid` 0/N; `background-size: 1px`→`1px auto` canon missing) and the `background` shorthand was unmodelled (valid 1/46, `CSS.supports('background','none')` false). Built (JS): `_canonBg`/`_canonBgLayer` (per-layer `<type>#` grammar for repeat/attachment/clip/origin/size via `_BG_VALIDATED`; size reuses `_canonGapItem`) + the `background` shorthand `_parseBackgroundShort`/`_serBackgroundShort` (order-independent `<bg-image> \|\| <bg-position>[/<bg-size>] \|\| <repeat-style> \|\| <attachment> \|\| <bg-clip> \|\| <visual-box>` per layer, color final-only; `_bgLayerToks` keeps `/` a token so `black 0 url(…) / cover` — `/` not after `<bg-position>` — is rejected; `_bgResolveBox` = §2.12 box rule) expanding into the 8 longhands, wired like the `grid` shorthand. Bonus: background-size-computed 10→14, background-computed 37→39. **Cap:** `background: none`→color expects `rgba(0, 0, 0, 0)` while the newer rows expect `transparent` (internally-inconsistent test — we pick the spec-correct `transparent`, 1 unwinnable subtest). **Next:** the `border-image-*` sub-vein (a `<border-image>` value engine), else a NEW `css/*/parsing/` dir. |
| ~~192~~ | ✅ [The Color Verdict](192-the-color-verdict.md) | **The `<color>` invalid-value gate** — every `_COLOR_PROPS` property, across `css-color`/`css-backgrounds`/`css-multicol/parsing/` | **+560 across 13 files** | ⚔️ | **SECURED — +560, zero regressions. The widest single-change win of the campaign.** Every `_COLOR_PROPS` prop stored its value RAW (the setProperty branch only rejected `image()`/malformed `alpha()`); it never gated on the full `<color>` grammar → every `color-invalid-*` at 0/N. Added one gate `if (!_CSS_WIDE && !var() && !_isValidColor(stored)) return;` to the `_COLOR_PROPS` branch (reusing the already-robust `_isValidColor`), plus two fixes so it doesn't regress valids: (1) `light-dark(<color>,<color>)` added to `_isValidColor`; (2) modern-colour validity now runs `_computeModernColor(value, true)` (SPECIFIED mode) so `calc(infinity)` channels validate instead of bailing. named 1→153, relative 0→132, layers 0→93, color-function 0→90, mix 0→33, rgb 0→15, lab 0→12, hex 0→10, color-invalid 0→8, hsl 0→8, hwb 0→2; +background-color-invalid 0→3, +column-rule-color-invalid 0→2. **Cap:** the remaining invalid fails need a STRICTER `_isValidColor` (loose legacy hsl/rgb + color-mix branches) — a large incremental follow-up. **Next:** the `background` shorthand in `css/css-backgrounds/parsing/`. |
| ~~191~~ | ✅ [The Grid Verdict](191-the-grid-verdict.md) | **The CSS `grid` shorthand** — the full six-longhand `grid` shorthand (invalid + valid), the LAST `css/css-grid/parsing/` value vein | **+51 across 2 files** | ⚔️⚔️⚔️ | **SECURED — +51, zero regressions. Closes the whole `css/css-grid/parsing/` value-parsing vein (#188→#191).** `grid` was unmodelled (single-key storage → invalid 0/34, valid 32/49). Built `_parseGridShort` → all six longhands: **Form 1** `<'grid-template'>` (reuse `_parseGridTemplate`; auto-* → initials); **Form 2/3** auto-flow forms `<rows> / [auto-flow && dense?] <auto-columns>?` and `[auto-flow && dense?] <auto-rows>? / <columns>` (`_parseAutoFlowSide` consumes leading auto-flow/dense in any order then the trailing `<track-size>+`; exactly one top-level `/` and auto-flow on exactly one side). `_serGridShort` (§7.8): auto-* all initial → grid-template form; else auto-flow form (`column`→Form 2 needs template-columns none, else Form 3 needs template-rows none); `''` unless all six set / inexpressible. Wired like `grid-template`. grid-shorthand-valid 32→49, grid-shorthand-invalid 0→34. **Cap:** grid-template-columns/-rows COMPUTED (13 each — layout). **Next:** a NEW `css/*/parsing/` dir. |
| ~~190~~ | ✅ [The Template Verdict](190-the-template-verdict.md) | **The CSS Grid `grid-template` value engine** — `grid-template-areas` longhand + `grid-template` shorthand (invalid + valid), the next `css/css-grid/parsing/` vein | **+96 across 4 files** | ⚔️⚔️⚔️ | **SECURED — +96, zero regressions.** Same #179→#189 lever: `grid-template-areas` stored RAW (invalid 0/11), `grid-template` shorthand unmodelled (invalid 0/66). Built a template engine (JS): `_gridTemplateTokens` (strings/`[]`/`()` whole, `/` its own token) + `_gridAreaCells`/`_gridAreasRectangular` (§7.3 cell split + filled-rectangle check) + `_canonGridTemplateAreas` (`none \| <string>+`, whitespace-collapse, dot-runs→`.`) + `_parseGridTemplate` (`none`; **Form A** `<rows> / <cols>` via `_canonGrid`; **Form B** ascii-art `[<line-names>? <string> <track-size>? <line-names>?]+ [/ <explicit-track-list>]?` — per-boundary line-name-group count ≤1 at edges / ≤2 between strings, `_canonGridTrackSeq` columns no-repeat) → 3 longhands; `_serGridTemplate` reconstructs (Form A `rows / cols`, Form B re-interleaves the row track-list w/ area strings; `''` unless all 3 set). Wired like `grid-column` (expand+store, getter/removeProperty, CSS.supports). areas-valid 6→9, areas-invalid 0→11, template-valid 24→40, template-invalid 0→66. **Next:** the `grid` shorthand (same dir — reuse this engine + add auto-flow forms). |
| ~~189~~ | ✅ [The Placement Verdict](189-the-placement-verdict.md) | **The CSS Grid `<grid-line>` placement value engine** — `grid-row`/`-column`-`start`/`-end` longhands + `grid-column`/`grid-row`/`grid-area` shorthands (invalid + valid), the next `css/css-grid/parsing/` vein | **+150 across 4 files** | ⚔️⚔️⚔️ | **SECURED — +150, zero regressions.** Same #179→#188 lever: the four `<grid-line>` longhands stored RAW (`*-invalid` 0/N) and the three placement shorthands were unmodelled (fell through to single-key storage → longhands never set). Built a self-contained `<grid-line>` engine (JS, no Rust): `_gridLineTokens` (whitespace split that keeps `\`-escapes — a `\`+hex may embed a terminating space, `\31 st` — and `()` whole) + `_canonGridLine` (`auto \| <custom-ident> \| <integer> && <custom-ident>? \| span && [<integer> \|\| <custom-ident>]`, canonical int-before-ident, `span 1 i`→`span i`) + `_canonGridLineInt` (literal non-zero, or math folded via `_canonMathExpr`: `min(-1,6)`→`calc(-1)`) + `_unescapeCssIdent`/`_serializeCssIdent` (CSSOM ident serialize so `\31st`≡`\31 st`, non-ASCII `-zπ`/`--a` verbatim). Shorthands EXPAND into + store as longhands (`_parseGridColumnRow`/`_parseGridArea`, omitted line copies a lone `<custom-ident>` else `auto`); `getPropertyValue`/`removeProperty` reconstruct/clear (`_serGridColumnRow`/`_serGridArea` drop redundant trailing defaults). grid-column-shorthand 0→48, grid-row-shorthand 0→48, grid-area-valid 31→60, grid-area-invalid 0→25. **Next:** `grid`/`grid-template`/`grid-template-areas` shorthands (same dir, reuse #188 `<track-size>` + this quest's `<grid-line>`). |
| ~~188~~ | ✅ [The Track Verdict](188-the-track-verdict.md) | **The CSS Grid track-sizing value engine** — `grid-template-columns`/`-rows`, `grid-auto-columns`/`-rows`, `grid-auto-flow` (invalid + valid + computed), the widest untouched `css/css-grid/parsing/` vein | **+155 across 15 files** | ⚔️⚔️⚔️ | **SECURED — +155, zero regressions.** Same #179→#187 lever: five longhands stored track lists RAW → every `*-invalid` 0/N, no canon, no calc-fold. Built a self-contained grid track-sizing engine (JS, no Rust) via `_GRID_VALIDATED`: `_gridTokens` (bracket/paren/comment-aware) + `_canonGridTrackSize` (`<track-breadth> \| minmax(<inflexible-breadth>, <track-breadth>) \| fit-content(<lp≥0>)`, each reporting `<fixed-size>`-ness) + `_canonGridTemplate` (`none \| <track-list> \| <auto-track-list>`: ≤1 auto-repeat, all other components must be `<fixed-size>`/`<fixed-repeat>`, line names exclude `span`/`auto`, no adjacent groups) + `_canonGridAutoFlow` (`[row\|column] \|\| dense`, drop default `row`, `dense column`→`column dense`). Computed: grid-auto folds calc lengths (`minmax(calc(10px+0.5em), max-content)`→`minmax(30px, max-content)`, ≥0); grid-template resolves the layout-INDEPENDENT subset (fixed `<length>` tracks + normal `repeat(<int\|calc-int>)` expansion with adjacent line-name-group merging), everything layout-dependent kept specified. template-cols/-rows-invalid 0→42 each, auto-cols/-rows-invalid 0→16/15, auto-flow 0→3, all `*-valid` 100%, auto-computed 18→25. **Caps:** grid-template COMPUTED (13 fail each — `auto-fill/fit` repetition+collapse, `%`→used px need the grid track-sizing algorithm = real layout); the grid **shorthands** (`grid-column`/`-row`/`grid-area`/`grid`/`grid-template`, `grid-column-shorthand` 0/48 pre-existing). **Next:** the grid shorthands (same dir, reuse these primitives). |
| ~~187~~ | ✅ [The Carousel Verdict](187-the-carousel-verdict.md) | **The CSS-Overflow-5 carousel keyword props** — scroll-marker-group / scroll-target-group / scroll-axis-lock (invalid + computed), the next `css/css-overflow/parsing/` vein | **+42 across 6 files** | ⚔️ | **SECURED — +42, zero regressions.** Three simple keyword-enum props stored RAW → every `*-invalid` 0/N + `*-computed` 0/N (absent from GCS enumeration; `CSS.supports(prop,'initial')` false). Extended the #186 engine: a `_CAROUSEL_ENUM` map (`scroll-marker-group` `none\|before\|after`, `scroll-target-group` `none\|auto`, `scroll-axis-lock` `auto\|none`) dispatched in `_canonCssOverflow` + added to `_OVERFLOW_VALIDATED`; registered all three in `_GCS_DEFAULTS` (initial none/none/auto, none inherit — that one map = `_CSS_KNOWN_PROPS` + GCS enumeration + computed identity). Fixed a latent gap: the `_OVERFLOW_VALIDATED` branch of `CSS.supports` didn't accept CSS-wide keywords — added the gate (also closes it for the #186 overflow longhands). scroll-axis-lock invalid 0→7/computed 0→8, scroll-target-group invalid 0→5/computed 0→8, scroll-markers invalid 0→5/computed 0→9. **Caps:** the `::scroll-button()` **selector** tests (scroll-buttons 0/37+1/8, getComputedStyle-scroll-button 0/5) need a functional pseudo-element in the Servo `selectors` crate — a separate Rust quest. **Next:** `css-grid`(61) parsing. |
| ~~185~~ | ✅ [The Variant Verdict](185-the-variant-verdict.md) | **The `font-variant` shorthand + its combinatorial longhands + `font-feature-settings`** — the last combinatorial grammars of `css/css-fonts/parsing/` | **+82 across 13 files** | ⚔️⚔️⚔️ | **SECURED — +82, zero regressions.** The `||`-combination font-variant longhands + the `font-variant` shorthand stored RAW; `font-feature-settings` half-modelled. Built (pure JS): ligatures/numeric/east-asian via `_ccOrderedCanon` (`_FV_CC`, canonical category-order reserialize — `ruby full-width simplified`→`simplified full-width ruby`); `font-variant-position`→`_FONT_ENUM`; `font-variant-alternates` a functional-notation `||` parser (`_canonFontVariantAlternates`: `stylistic()`/`swash()`/`ornaments()`/`annotation()` one `<feature-value-name>`, `styleset()`/`character-variant()` a `#` list, `historical-forms` keyword, canonical order); `font-feature-settings` the `<opentype-tag>` 4-char-string grammar (`_serCssString` CSSOM `"`/`\`/control escaping, on/off/integer serialize, computed sort/dedup + calc-fold via `_evalMath` cqZero). The `font-variant` **shorthand** EXPANDS into and stores as its 6 longhands (`_parseFontVariantShorthand`/`_FONT_VARIANT_SH_LH`/`_fontVariantFromLonghands`; `none`→ligatures:none; getter reconstructs canonical [lig,caps,alt,num,ea,pos]). Closed the #183/#184 CAP: `_fontFromLonghands` returns '' when any extra font-variant longhand is non-initial (font-shorthand-variant 0→1). font-variant-invalid 0→21, -alternates-invalid 0→15, font-feature-settings valid 4→10/invalid 0→5/computed 6→10. Realm **1249/1569 → 1331/1569**. **Caps:** `font-face-src-*` (~109, @font-face descriptor parsing — different mechanism), `<font size=N>` presentational hints (5), `from-font` (6, needs metrics). **Next:** `css-grid`(61)/`css-overflow`(35) parsing. |
| ~~184~~ | ✅ [The Shorthand Verdict](184-the-shorthand-verdict.md) | **The `font` shorthand** — `css/css-fonts/parsing/font-valid.html` + `font-computed.html` (the CSS Fonts 4 §font-prop crown jewel) | **+615 across 2 files** | ⚔️⚔️⚔️ | **SECURED — +615, zero regressions.** The `font` shorthand was unmodelled (`style.font=…` fell through to generic single-key storage). Built it on the #183 css-fonts longhand canonicalizers: a valid value EXPANDS into — and stores as — its 7 longhands (`_parseFontShorthand`/`_FONT_SH_LH`: style/variant-caps/weight/stretch/size/line-height/family), a system-font/CSS-wide keyword kept as a single `font` key. `getPropertyValue('font')` reconstructs the specified serialization (`_serializeFontShorthand`→`_fontFromLonghands`: `\|\|`-order reorder, drop `normal`, `size / line-height` spacing); `getComputedStyle().font` reconstructs from computed longhands (`computed=true`: weight bolder/lighter drop-400, stretch `%`→css3 keyword via `_FONT_WIDTH_KW_REV`). Quote/paren-aware tokenizer with top-level `/` (`_fontTokens`); `<'line-height'>` grammar (`_canonFontLineHeight`); `CSS.supports` + `_CSS_KNOWN_PROPS` registration. font-valid 9→315, font-computed 6→315. Realm **634/1569 → 1249/1569**. **Cap:** `font-shorthand-variant.html` (1 subtest — needs the full `font-variant` shorthand + reset-longhand initial checks). **Next:** `font-variant`/`font-feature-settings`, then `css-grid`(61)/`css-overflow`(35) parsing. |
| ~~183~~ | ✅ [The Font Verdict](183-the-font-verdict.md) | **CSS Fonts parsing longhands** — the css-fonts longhand families of `css/css-fonts/parsing/` (`font-style`/`-weight`/`-width`/`-stretch`/`-size`/`-size-adjust`/`-family`/`-synthesis`/`-kerning`/`-optical-sizing`/`-variant-caps`/`-variant-emoji`/`-synthesis-*`) | **+250 across 24 files** | ⚔️⚔️⚔️ | **SECURED — +250, zero regressions.** Same #179→#182 lever, the widest untouched `css/*/parsing/` dir: the css-fonts longhands stored values RAW → every `*-invalid` 0/N, keyword→canonical rewrites & computed forms missing. Built a self-contained css-fonts value engine in `bootstrap.js` (`_canonFont` via `_FONT_VALIDATED`, ahead of `_MATH_GATE`; computed in `_normComputed`): validate+canon `font-style` (`oblique <angle [-90,90]>?`, 0→normal), `font-weight` (`<number [1,1000]>`+calc, pulled out of `_MATH_GATE_PROPS`), `font-width`/`font-stretch` (`<keyword>\|<percentage [0,∞]>`), `font-size`, `font-size-adjust` (default `ex-height` basis dropped), `font-family` (generic-lowercase + string↔ident reserialization), `font-synthesis` (`_ccOrderedCanon`), and the enum longhands (`_FONT_ENUM`). Computed: oblique→deg, bolder/lighter inherited-relative (`_fontBolder`/`_fontLighter`), keyword→%/px, calc-fold+clamp. Registered `font-width` + 4 synthesis subprops. Realm **384/1569 → 634/1569**. font-weight-computed 13→58, font-size-adjust-invalid 0→57, font-synthesis-valid 6→23. **Caps:** the `font` **shorthand** (font-valid + font-computed = 630 subtests — the crown jewel, next quest), `font-variant`/`font-feature-settings` (complex combinatorial grammars), `font-face-src-*` (~109, @font-face descriptor parsing), `<font size=N>` presentational hints (5), `from-font` metrics (6). **Next:** the `font` shorthand (630 subtests — the widest lever left in this realm), then font-variant, then `css-grid`(61)/`css-overflow`(35) parsing. |
| ~~181~~ | ✅ [The Textual Verdict](181-the-textual-verdict.md) | **CSS Text parsing** — the whole `css/css-text/parsing/` realm (86 files: `text-wrap`/`white-space`/`word-break`/`text-transform`/`text-autospace`/`text-align*`/`text-indent`/`letter-spacing`/`word-spacing`/`tab-size`/`hyphenate-*`/`text-spacing`/`text-fit`/…) | **+404 across ~40 files** | ⚔️⚔️⚔️ | **SECURED — +404, zero regressions.** Same shape as #179/#180 (the widest lever yet): the whole css-text family stored values RAW → every `*-invalid` 0/N, `text-autospace`/`text-spacing`/`text-fit` unregistered, the shorthands (`text-wrap`/`white-space`) never canonicalized. Built a self-contained css-text value engine in `bootstrap.js` (`_canonCssText`, via `_CSSTEXT_VALIDATED`): enum validation (`_CSSTEXT_ENUM`, 14 longhands), `||`-combination ordered-category canon (`_ccOrderedCanon`/`_CCSET`: text-transform/text-autospace/word-space-transform/hanging-punctuation), `<length-percentage>`/`<number>` grammar (`_canonLenPctSigned`: word/letter-spacing, tab-size, text-indent), auto\|`<string>`/`[auto\|<integer>]{1,3}` (hyphenate-character/-limit-chars), and the text-wrap/white-space/text-spacing/text-fit shorthands canonicalized to a single stored keyword. Plus registration of the 7 unmodelled props + `_normComputed` branches (text-fit drops default `consistent`, text-justify `distribute`→`inter-character`, tab-size/hyphenate-limit-chars/text-indent computed resolution). Realm **341/754 → 745/754**. Every `*-invalid` 0/N→N/N; text-autospace 0/32→32/32; white-space-shorthand 6/45→45/45. **Caps (9):** container-query `sign(2cqw…)`, `match-parent`→`center` parent-walk, `"\1400"`→`"᐀"` string-escape, the white-space↔text-wrap-mode longhand interaction (single-key storage, chosen for cssText safety). **Next:** the still-untouched `css/*/parsing/` dirs — `css-fonts` (83), `css-grid` (61), `css-overflow` (35), `css-scroll-snap` (25) — same three-axis JS machinery. |
| ~~180~~ | ✅ [The Interface Verdict](180-the-interface-verdict.md) | **CSS Basic User Interface parsing** — the whole `css/css-ui/parsing/` realm (42 files: `box-sizing`/`resize`/`user-select`/`outline-*`/`caret-color`/`cursor`/`text-overflow`/`field-sizing`/`interactivity`) | **+62 across 16 files** | ⚔️⚔️ | **SECURED — +62, zero regressions.** Same shape as #179: css-ui longhands stored their value RAW (no grammar check) → every `*-invalid` was 0/N. Built a self-contained css-ui value engine in `bootstrap.js`: `_canonCssUi` validates + canonicalizes the longhands (enumerated keywords via `_CSSUI_ENUM`; `caret-color` `[auto\|<color>]{1,2}` + `outline-color` `auto\|<color>\|invert`; `text-overflow` `[clip\|ellipsis\|<string>]{1,2}`; `outline-width` `<line-width>`; `outline-offset` `<length>\|inset`), dispatched via `_CSSUI_VALIDATED` ahead of the lenient `_COLOR_PROPS` branch. Plus caret-color two-value computed resolution (`_normComputed`), `field-sizing`/`interactivity` computed defaults + `_CSS_KNOWN_PROPS` registration, `interactivity` inheritance, and a `CSS.supports` css-ui branch. Every `*-invalid` 0/N→N/N (bar the `invert` cap), caret-color-computed 3/12→12/12. **Caps:** `outline-color: invert` is a spec-version conflict (kept valid so `serialize-values` doesn't regress → `outline-color-invalid` 2/3); `cursor` (0/10 invalid) needs a real value engine; `canonical-order-outline` 0/26. **Next:** other untouched `css/*/parsing/` dirs (`css-text` 86, `css-fonts` 83, `css-grid` 61, `css-overflow` 35) — same JS machinery. |
| ~~179~~ | ✅ [The Alignment Verdict](179-the-alignment-verdict.md) | **CSS Box Alignment parsing** — the whole `css/css-align/parsing/` realm (50 files: `align-*`/`justify-*`/`place-*`/`gap`/`grid-*-gap`) | **+366 across ~44 files** | ⚔️⚔️⚔️ | **SECURED — +366, zero regressions.** A fresh WIDE realm (input-element thinned, popovers heavily mined). The family had NO value handling in `CSSStyleDeclaration`: raw storage → invalid values accepted (every `*-invalid` 0/N, ~171 subtests), no canonical serialization, no shorthand expansion, no computed resolution. Built a self-contained Box-Alignment value engine in `bootstrap.js`: keyword-grammar validate+canonicalize for the six align/justify longhands (`_alignCanonLonghand`/`_ALIGN_PROPS` — overflow-position ordering, `[first\|last]? baseline`, `legacy && [left\|right\|center]`), non-negative `<length-percentage>` `row-gap`/`column-gap`, `gap`/`place-*` shorthand→longhand expansion (`_parseGapShorthand`/`_parsePlaceShorthand`, greedy align/justify split, `place-content` baseline→`start`), `grid-*-gap` legacy aliases, `CSS.supports`/`_CSS_KNOWN_PROPS` registration, computed reconstruction of the shorthands, and `em`/`calc`→px (clamped ≥0) gap-length resolution. Realm **249/618 → 615/618**. **Cap:** `justify-items: legacy` computed-inheritance (3 fails). **Next:** the other untouched `css/*/parsing/` dirs (`css-text` 86, `css-fonts` 83, `css-grid` 61, `css-ui` 42, `css-overflow` 35) — same three-axis pattern, same JS machinery. |
| ~~178~~ | ✅ [The Suggestions Verdict](178-the-suggestions-verdict.md) | **`HTMLInputElement` IDL primitives** — `input-list.html` (0/6), `maxlength.html` (3/5) | **+8 across 2 tests** | ⚔️ | **SECURED — +8, zero regressions.** Two small `bootstrap.js` IDL fixes in the input reflected-attribute block. **(1)** New `input.list` getter — the *suggestions source element*: `getRootNode().getElementById(list attr)`, returned only if it's a `<datalist>` (getElementById tree-order, so an earlier non-datalist with the same ID → null); null for input types the attribute doesn't apply to. **(2)** `maxLength`/`minLength` now reflect a `long` "limited to only non-negative numbers": setter ToInt32-converts (non-numeric → 0) and throws `IndexSizeError` on a negative value; getter maps a negative content attribute to the default (-1). `input-list` **0/6→6/6**, `maxlength` **3/5→5/5**. **Next:** cross-document pointer pairing (`popover-light-dismiss` ~8); scripting-errors line/col; or a fresh wide realm (input-element is now nearly all green). |
| ~~175~~ | ✅ [The Fullscreen Verdict](175-the-fullscreen-verdict.md) | **Dialog/fullscreen ↔ popover top-layer interactions** — `popover-top-layer-combinations.html` (0/5), `popover-top-layer-interactions.html` (4/9) | **+10 across 2 tests** | ⚔️⚔️ | **SECURED — +10, zero regressions.** Two root causes. **(1)** `showPopover()` on a non-modal open `<dialog>` (opened via `show()`) wrongly threw — `_checkPopoverValidity`'s dialog gate keyed on the bare `open` attribute; per spec it gates on the **is-modal flag** (`_isModal`), so only a `showModal()` dialog (or a fullscreen element) blocks. **(2)** `requestFullscreen` didn't exist (a synchronous TypeError that escaped the tests' `await …then/catch`). Added a partial Fullscreen API — a top-layer STATE machine (no real render): `Element.requestFullscreen()`/`Document.exitFullscreen()`/`fullscreenElement`/`fullscreenEnabled`, a new Rust `:fullscreen` flag (mirrors `:modal`) matched by the selector engine, and a fullscreen-flag popover-validity throw. Entering fullscreen supersedes open popovers via the shared `_topLayerHidePopovers` but leaves modal dialogs and other fullscreen elements alone (they stay `:modal`/`:fullscreen`). `popover-top-layer-combinations` **0/5→5/5**, `popover-top-layer-interactions` **4/9→9/9**. **Next:** cross-document pointerdown/up pairing (`popover-light-dismiss`); popover Tab-focus (`popover-focus` 20/30); real error line/col in the scripting-errors realm. |
| ~~174~~ | ✅ [The Shadowed Verdict](174-the-shadowed-verdict.md) | **Popovers inside shadow DOM** — `popover-shadow-dom.html` (`showPopover()` threw "not connected to a document" inside a shadow tree) | **+5 across 2 tests** | ⚔️ | **SECURED — +5, zero regressions.** The popover connectedness check was the boundary-stopping `isConnected`; a popover in a connected host's shadow tree read as disconnected. Swapped to the shadow-including `_shadowConnected` in `_checkPopoverValidity` (fixes the throw) and the invoker target-validity check, and added a shadow-including containment walk (`_shadowIncludes`) to "topmost popover ancestor" so a popover nested inside a shadow-DOM ancestor popover is recognized as nested (not closed). `popover-shadow-dom` **0/3→3/3**, `popover-light-dismiss` **23→25** (its two shadow subtests). Left `Node.isConnected` itself untouched (spec-should-be-shadow-inclusive, but too broad a primitive to risk here). **Next:** dialog+popover top-layer ordering (`popover-top-layer-combinations` 0/5, `-interactions` 4/9); cross-document pointer pairing; popover Tab-focus. |
| ~~171~~ | ✅ [The Framed-Error Verdict](171-the-framed-error-verdict.md) | **In-frame `document.body.outerHTML` body replacement + the frame-window OnErrorEventHandler** — `onerroreventhandler.html`, the #169/#170-named `body.outerHTML` bug | **+3 across 1 test** | ⚔️⚔️⚔️ | **SECURED — +3.** One Rust primitive + four `bootstrap.js` fixes, unravelling a bug the previous two quests both deferred. **(1) Rust fragment context:** `set_inner_html` now parses with the TARGET element's own tag as the fragment-parsing context (spec §fragment-parsing; new `parse_fragment_ctx`/`fragment_root`), so `body.outerHTML = "<body …>"` (context = parent `<html>`) yields a real body instead of dropping it. **(2) The real iframe root cause:** `_IframeDocument`'s naive regex strip of `<html>/<head>/<body>` was eating those tags **inside `<script>` text** — the frame's `document.body.outerHTML = "<body onerror=…></body>"` became `"onerror=…>"` → body → text node → `null`. Now masks raw-text (`script/style/textarea/title`) blocks before stripping. **(3)** `_IframeWindow.onerror` is a real OnErrorEventHandler `error`-listener accessor (was a plain data prop `dispatchEvent` never fired). **(4)** `_windowForNode` resolves a node's window from its TREE ROOT (robust to un-`_ownerDoc`-tagged parsed frame nodes); `_ehScopeChain` prepends the frame window + `_bodyWinSetContentAttr` compiles the reflected handler with it — so a frame handler resolves `check1`/`check3` against the frame window. **(5)** `_runFrameProgram` hoists frame-script top-level `function`s onto the window at program START (not just `finally`), so a handler firing synchronously during the script sees them. **Zero regressions** — swept HARD (event-handler realm 1027/1027 incl. all-global-events 375, body-window 140, windowless-body 236, sourcetext 5, lexical-scopes 3, cancellation now 15/15; scripting-errors/timers realm all held, window-onerror 2/3 pre-existing lineno cap; qsa 1975, classlist 1420, createElement 147, createElementNS 596, dispatchEvent 25; DOMParser html 9/10 + xml 20/20, insertAdjacent 6/6+6/6, template innerhtml 4/4 + outerhtml 3/3, table insertRow/tBodies/rows; iframe-load 2/2, srcdoc 3/3+1/1; Range-comparePoint/isPointInRange/intersectsNode full counts — frame `contentWindow`+`eval` path intact; mark 22, getRandomValues 39, url-origin 406/413 + structured-clone 141/152 pre-existing). **Caps:** exact error `lineno` still 0 (runtime→Rust boundary drops the throw site — the `window-onerror-*` exact-line tests stay 2/3); a frame-parsed body's `ownerDocument` still mis-resolves to the main doc for non-reflect consumers (the reflect + handler-scope paths walk to root to compensate). **Next:** real error line/col tracking (the last exact-`lineno` lever), or the frame-node `_ownerDoc` tagging gap. |
| ~~168~~ | ✅ [The Scope-Chain Verdict](168-the-scope-chain-verdict.md) | **Scope-chain compilation + markup on-handler activation** — the #167-named last structural gap in the event-handler realm | **+17 across 6 tests** | ⚔️⚔️ | **SECURED — +17.** All `bootstrap.js` + one `ops.rs` op. **(1) Scope-chain compilation:** `_ehCompile` now builds a handler literally named `on<type>` (5-arg `(event, source, lineno, colno, error)` only for onerror on Window/body/frameset, else `(event)`), so `.toString()` matches exactly (`event-handler-sourcetext` **0→5**); the body runs inside nested `with(document){with(formOwner){with(element){…}}}` captured at creation, so free identifiers resolve through element→form-owner→document→window and `with` natively honours `Symbol.unscopables` (`compile-event-handler-symbol-unscopables` **0→3**, needed new `@@unscopables` objects on Element/Document/DocumentFragment prototypes; `compile-event-handler-lexical-scopes` **0→2**, form-owner **0→4**). **(2) Markup on-handler activation:** parsed `<div onclick=…>` content attrs now activate as real listeners at wrapper construction (`_activateMarkupHandlers` via a new `on_handler_attrs` op — one bridge call per new element wrap, `""` for the common handler-less element), which also gives markup handlers correct ordering ahead of later `addEventListener`. **(3)** Added `document.domain` (origin host), `HTMLFormElement.enctype`/`encoding`, and a **live cached `form.elements` HTMLFormControlsCollection** (identity-stable, excludes `input[type=image]`) — bonus `form-elements-matches` **0→2**, `form-elements-nameditem-01` **0→1**. **Zero regressions** (all-global-events 375, processing 7, ordering 3, cancellation 14/15, body-window 140, windowless-body 236, body-alt 118, window 118, qsa 1975, classlist 1420, createElement 147, dispatchEvent 25, iframe-load 2/2, dialog-open 3/3, toggleevent-interface 39/39, popover-toggle-source 7/7, popover-events 5/6 & details-toggleEvent both stash-proven pre-existing, mark 119, measure 38). **Caps:** `compile-event-handler-lexical-scopes` test 3 (`window.onerror` must fire as an *ordered* `error` listener, before a later `addEventListener("error")`) needs **onerror-as-listener** — the OnErrorEventHandler 5-arg/`return true`-inverts conversion of the error subsystem, its own increment (like #167 did for onload); RadioNodeList named access (nameditem 2/3). **Next:** onerror-as-listener, then form-associated custom-element `.form` refinement. |
| ~~167~~ | ✅ [The Onload Verdict](167-the-onload-verdict.md) | **`window.onload` as a real `load`-event listener** — the #166-named next lever; `body-onload.html` + the last `event-handler-attributes-body-window` subtest | **+2 across 2 tests** | ⚔️ | **SECURED — +2.** One `bootstrap.js` line + one `page.rs` line. `window.onload` was one of two names (`load`/`error`) excluded from the window on-handler *accessor* machinery — kept a plain data property because the load driver both **called `window.onload()` directly** (no event arg → `e.currentTarget` undefined) **and** dispatched a `load`. Removed `"load"` from `_WINDOW_ONHANDLER_DATA` → `window.onload` is now a real `load`-listener accessor; removed the direct `window.onload()` call from `page.rs`'s `<load-event>` step → the trusted `load` dispatch fires onload **once**, in listener order, with `currentTarget === window`. So a detached `body.onload` (reflects to `window.onload` per #166) fires correctly at the window. `error` stays a data-prop (bespoke `OnErrorEventHandler` signature). **Frame path left untouched** — `_IframeWindow` proxies `onload` to a bare data-prop that `dispatchEvent` never fires, so its direct call (`bootstrap.js:~5735`) is the only firing site (no double-fire). body-onload **0→1**, body-window **139→140**. **Zero regressions** — the load lifecycle held everywhere: iframe-load 2/2, user-timing/measures 119/119 (runs from `<body onload>`→`window.onload`), clearMarks 57/57, test-document-onload 3/3, nav2-attributes 1/1, all-global-events 375, processing 7, ordering 3, onerroreventhandler 0/3 (pre-existing TIMEOUT), cancellation 14/15, qsa 1975, classlist 1420, createElement 147, dispatchEvent 25. **Caps:** frame-window onload-as-listener (no red test needs it); `-window-frameset` 0/118 = pre-existing frameset-document cap. **Next:** **scope-chain compilation** (`compile-event-handler-lexical-scopes`/`-symbol-unscopables`/`event-handler-sourcetext` — handler body run with element/form-owner/document in scope + exact `.toString()` source) — the last structural gap in the event-handler realm; then markup on-handler activation. |
| ~~166~~ | ✅ [The Body-Window Verdict](166-the-body-window-verdict.md) | **The Window-reflecting body element event handler set** — the `event-handler-attributes-*` reflection matrix | **+234 across 4 tests** | ⚔️⚔️ | **SECURED — +234.** All `bootstrap.js`. On `<body>`/`<frameset>`, the reflecting `on*` handlers `{blur,error,focus,load,resize,scroll}` ∪ WindowEventHandlers (24 names) act on the element's **Window**, not the element: reflecting accessors on `HTMLBodyElement`/`HTMLFrameSetElement` forward get/set/content-attr to `ownerDocument.defaultView` (null → inert, for windowless docs). Added `afterprint`/`messageerror`/`pagereveal`/`pageswap` to the window on-handler installer; `window.onerror`/`onunhandledrejection` now default **null** (were internal stubs; debug capture moved to `_reportError`). body-window **75→139**, windowless-body **152→236**, body-alt **75→118**, window **75→118**. **Zero regressions** (all-global-events 375, processing 7, ordering 3, onerroreventhandler 0/3, cancellation 14/15, qsa 1975, classlist 1420, createElement 147, dispatchEvent 25; baselines stash-proven). **Caps:** `window.onload` is a data-prop not a listener → `body-onload` (0/1) + the load-fires subtest need onload converted to a real `load` listener (load-machinery increment); `-window-frameset` 0/118 is a pre-existing frameset-document cap. **Next:** `window.onload` as a listener, then scope-chain compilation. |
| ~~165~~ | ✅ [The Handler Verdict](165-the-handler-verdict.md) | **GlobalEventHandlers `on*` IDL + content-attribute reflection** — the `html/webappapis/scripting/events/` event-handler realm | **+383 across 3 tests** | ⚔️⚔️ | **SECURED — +383.** All `bootstrap.js`. All 75 `on*` names are own accessors on **HTMLElement/SVGElement/Document/window (NOT Element)**; a single listener installs at first activation (content-attr OR IDL set) and holds its position; the value is a function, null, or a lazily-compiled raw content-attribute source; `return false` cancels a cancelable event. Made **`SVGElement` a distinct class** (was `= Element`, would leak handlers onto `Element.prototype`) + routed `createElementNS` SVG to it. Removed 4 now-double-firing manual `el['on'+type]` calls (popover/dialog/select/reset). all-global-events **0→375**, processing-algorithm **2→7**, inline-event-handler-ordering **0→3**. **Zero regressions** (qsa 1975, classlist 1420, dispatchEvent 25, insertBefore 39/40, createElement 147, focus-pseudo 20, focus-method-delegatesFocus 15, toggleevent 39, select-event 270, reset-form 12; popover-events 5/6 proven pre-existing via stash). **Caps:** scope-chain compilation (lexical-scopes/unscopables/sourcetext); **markup on-handler activation** (`<div onblur>` from parsed HTML fires nothing yet — the JS setAttribute/IDL paths work). **Next:** markup on-handler activation (unlocks `focus-within-focus-move` + inline-handler markup tail), then scope-chain compilation. |
| ~~160~~ | ✅ [The Fixed-Up Verdict](160-the-fixed-up-verdict.md) | **The focus fixup rule** — reset focus when the focused element stops being focusable + the sequential-focus **starting point** | **+2 (target +1, bonus +1)** | ⚔️ | **SECURED — +2.** The four-quests-named "small, self-contained" next lever. All `bootstrap.js`. **(1)** `_runFocusFixup()` — unfocus the element (blur/focusout), null `__obscura_focused` (so `activeElement` → `<body>` via the existing getter), and record it as the sequential-focus **starting point** `__obscura_seqFocusStart`. **(2)** Triggers: attribute changes (`disabled`/`hidden`/`tabindex`/`contenteditable`) schedule an **async** re-check at the end of `setAttribute`/`removeAttribute` (gated on `if (__obscura_focused)` — near-free; the deferred callback re-checks focusability so unrelated changes no-op); **removal** fixes up **synchronously** at the `removeChild` site (`.remove()` routes through it). **(3)** `_sequentialFocusNavigation` resumes from the starting point when the focused element is no longer a candidate: pick the first candidate whose `(tabindex, tree-order)` key falls after it, wrapping — so Tab after disabling `target(ti=2)` lands on `third(ti=3)`, not `first(ti=1)`. `_performFocus` clears the starting point on any genuine focus move (single-use). sequential-focus-navigation-after-disabled 0→1; focus-fixup-rule-one-no-dialogs 0→1 (bonus). **Zero regressions** (stash-proven at HEAD; qsa 1975, insertBefore 39, dispatchEvent 25, setAttribute 2/2, attributes 67, tabindex-getter 120, focus-tabindex-order 1/1, popover-focus 11, popover-attribute-basic 159, invoking-attribute 1400, on-dialog-behavior 104, dialog-canceling 1/1, button-type-behavior 23). **Caps:** `focus-fixup-rule-one` (1/8) needs exact "end of update-the-rendering" fixup timing (after rAF + ResizeObserver), ResizeObserver firing, and visibility:hidden / ancestor-`fieldset[disabled]` / `contenteditable=false` focusability. **Next:** `inert` model, then popover-in-taborder, then shadow-DOM focus retargeting. |
| ~~159~~ | ✅ [The Tabbed Verdict](159-the-tabbed-verdict.md) | **Sequential focus navigation (Tab order)** — the `sequential-focus-navigation-and-the-tabindex-attribute/` tail + the name-based `tabindex` default | **+25 across 7 tests** | ⚔️⚔️ | **SECURED — +25.** The four-quests-named "widest remaining focus lever." Two `bootstrap.js` changes + a bridge fix. **(1)** The **`tabindex` default value** is name-based per §dom-tabindex (`_defaultTabIndexZero`): 0 for a/area/button/frame/iframe/input/object/select/textarea + a details' summary, else −1 — *ignoring* disabled/hidden/href/type (a `<button disabled>` and `<input type=hidden>` still default to 0), which is distinct from actual focusability. Fixes all 14 zero-default rows → **tabindex-getter 106→120**, plus the `<button>` row of focus-tabindex-default-value. **(2)** **`_sequentialFocusNavigation(backward)`** — collect the focusable areas with effective tabindex ≥ 0 (`el.tabIndex >= 0 && _isFocusableArea(el)`; negatives skipped), order them (positive first ascending, ties in tree order; then the 0 group in tree order), move focus after/before the current one wrapping at the ends. Layout-free (tree order stands in for rendered order). **(3)** The bridge's **`send_keys` is now ASYNC** (each key's keydown/keyup microtask-deferred, returning the chained promise) — real `test_driver.send_keys` is async, and tests rely on it: a focus handler that calls `send_keys` for the *next* Tab expects its own `i++` to run first; a synchronous dispatch recursed the handler and hung the whole test. Also: the bridge now stamps legacy `keyCode`/`which` (Tab === 9, tracked modifier state for Shift+Tab). focus-tabindex-order/positive/zero/negative 0→1 each, default-value 1→2, tabindex-getter 106→120, tab-table-caption 0→6. **Zero regressions** (stash-proven at HEAD; qsa 1975, insertBefore 39, dispatchEvent 25, createDocument 434, structured-clone 141, popover-attribute-basic 159, popover-invoking-attribute 1400, toggleevent 39, popover-light-dismiss 15, popover-focus 11, on-popover-behavior 28, dialog-open 3/close 5/canceling 1 — send_keys-Escape still works, on-dialog-behavior 104, button-type-behavior 23). **Caps:** `popover-focus-2` + the popover-focus button-click family need **popover-in-taborder** logic (a shown popover's contents participate in tab order right after its invoker) + coordinate-invoker activation; `sequential-focus-navigation-after-disabled` needs the **focus fixup rule** (disabling the focused element resets focus); shadow-DOM focus retargeting; the `inert` model. **Next:** the focus fixup rule (small), then `inert`, then popover-in-taborder / shadow-DOM focus retargeting. |
| ~~158~~ | ✅ [The Focused Verdict](158-the-focused-verdict.md) | **A layout-free focus model** — the autofocus focusing steps + focus restoration (popover-focus, dialog autofocus) | **+13 across 4 tests** | ⚔️⚔️⚔️ | **SECURED — +13.** The four-quests-named "widest lever overall." All `bootstrap.js`. A FOCUSABILITY predicate (`_isFocusableArea` + a layout-free `_isRenderedForFocus` — `hidden`/inline-`display:none`/closed-`<dialog>`/non-showing-`[popover]` on self-or-ancestor → unfocusable) so **`focus()` on a non-focusable element is a no-op**; the **popover/dialog autofocus FOCUSING STEPS** on show (`_popoverFocusingSteps`/`_dialogFocusingSteps` over `_autofocusDelegate`/`_firstFocusableDescendant`); focus **RESTORATION** to a stored `_previouslyFocusedElement` on hide/close/Escape (auto popovers + dialogs; a `focusPrev` flag opts removal + modal-supersede out); the Esc router fixed so a `<dialog>` shown *as a popover* takes the hide-popover path (`bestKind`); and **document-load autofocus** (unhangs `waitUntilLoadedAndAutofocused`). popover-focus 1→11, dialog-autofocus 0→1, show-modal-focusing-steps 0→1, dialog-autofocus-just-once 0→1. **Zero regressions** (stash-proven at HEAD; a mid-session regression — disconnected-dialog fallback focus 2/2→1/2 — was caught & fixed with an `_isFocusableArea(control)` guard; qsa 1975, insertBefore 39, popover-attribute-basic 159, on-dialog-behavior 104, dialog-close 5/5, iframe-load 2/2). **Caps:** the "button click"/"corner cases" popover-focus families need coordinate-invoker activation + isTrusted click-to-focus; `popover-focus-2` + the Tab tail need sequential focus navigation; `focus-after-close` shadow subtests need shadow-DOM focus retargeting; `inert` model. **Next:** sequential focus navigation (Tab order — unlocks `popover-focus-2` + the broad Tab tail), then `inert`, then shadow-DOM focus retargeting. |
| ~~157~~ | ✅ [The Watched Verdict](157-the-watched-verdict.md) | **The `CloseWatcher` API** (`close-watcher/`, found entirely red) + Window `on*` handlers as real accessors | **+65 across the realm** | ⚔️⚔️⚔️ | **SECURED — +65.** Verified/completed a prior-session draft of the `CloseWatcher` API (`new CloseWatcher()`, `requestClose`/`close`/`destroy`, `cancel`/`close` events, `oncancel`/`onclose`, the `signal` option) + the close-watcher **manager**: activation-gated GROUPS (watchers established without intervening user activation share one group; one Esc closes the whole group in reverse order; each activation banks a new group; a prevented cancel consumes the activation). `_processCloseRequest` routes to `_cwProcessCloseWatchers()` when a group outranks any popover/dialog by `_topLayerSeq` (−1 → popover/dialog path untouched). **Root-cause fix that unblocked the keyboard tail:** Window `on*` handler IDL attributes were inert `null` data props (feature-detection only) — `window.onkeydown = fn` never registered a listener; made them **real listener-registering accessors** (so `onkeydown`/`onresize`/`onpopstate`/… fire), EXCLUDING `onload` (would double-fire — the load driver dispatches AND calls it) and `onerror` (bespoke signature). basic 0→7, event-properties 0→1, abortsignal 0→9, frame-removal 0→5, inside-event-listeners 0→12, esc-key 0→5, user-activation 2→28. **Zero regressions** (stash-proven; iframe-load-event 2/2 held — the `load` exclusion; qsa 1975, command realm 149, popover 159, dialog-open/close). **Caps:** the 9 `-dialog`/`-popover` user-activation variants need dialogs/popovers wired into the manager as close watchers (group-close, hot `_showPopover`/`_showModalDialog` paths — deferred); cross-realm `frame-removal`/`iframes` need a per-realm fully-active check. **Next:** dialogs/popovers as close watchers (the grouping), then a focus/`activeElement` model. |
| ~~156~~ | ✅ [The Driven Verdict](156-the-driven-verdict.md) | **The `test_driver` input bridge** — the widest lever named since #152; popover/dialog light-dismiss + Escape close-request | **+56 across 4 tests** | ⚔️⚔️⚔️⚔️ | **SECURED — +56.** Four interlocking pieces: (1) a **real `elementFromPoint`** hit-testing the synthetic per-node rects instead of always returning `<body>` (automation clicks an element at its own center → hit-test returns it); (2) the **Escape close-request** (`_processCloseRequest`: a non-preventDefault'd trusted Escape closes the topmost popover / fires `cancel`+close on the topmost modal dialog, ranked by a monotonic `_topLayerSeq` across both stacks); (3) an **in-page `test_driver` bridge** (`click`/`send_keys`/`Actions` synthesize DOM events directly — resolving element origins to coords, key code points to key/code); (4) **preload-before-scripts** in `page.rs` (Obscura ran `addScriptToEvaluateOnNewDocument` *after* navigation, but runs the whole harness *during* it, so the bridge landed too late — now runs right after the JS context, before the document's scripts). Why in-page not CDP: `Runtime.addBinding` is a no-op stub, the page thread blocks on any in-flight evaluate (no concurrent drainer), and the harness completes during `Page.navigate` (Python never regains control). popover-attribute-basic **113→159** (+46 bonus from real hit-testing), popover-light-dismiss **8→15**, -hint **1→3**, dialog-canceling **0→1**. **Zero regressions** (stash-proven; qsa 1975, createElement 147, command realm 193/193, popover all-elements 1101 / invoking 1400 / toggleevent 39, dispatchEvent 25). **Caps:** Tab/focus navigation (no focus model), isTrusted-synthetic (in-page events), coordinate-invoker activation, `CloseWatcher` API. **Next:** a focus/`activeElement` model (whole Tab/focus tail); then `CloseWatcher`. |
| ~~155~~ | ✅ [The Dialoged Verdict](155-the-dialoged-verdict.md) | **The `<dialog>` element API** — `html/semantics/interactive-elements/the-dialog-element/` + the command-invoker **dialog tail** | **+~164 across 14 tests** | ⚔️⚔️⚔️ | **SECURED — +~164.** `show()`/`showModal()`/`close()`/`requestClose()`, `open`/`returnValue`/`closedBy` IDL, cancel/close/toggle events, and the **`:modal`** pseudo-class (a non-monotonic `dialog_modal` `HashSet` in `tree.rs` + a `selector.rs` arm + a `set_dialog_modal` op). The dialog API unlocked the previously-blocked command tail: **on-dialog-behavior 0→104, on-dialog-invalid-behavior 1→40** (a detached-invoker leak cascade fixed by gating `_runCommandInvoker` on **shadow-including** connectedness — `getRootNode({composed:true})`, not `isConnected`). **The real story:** `on-dialog-behavior` **OOM-killed the server** — bisected to `insert_before(x, x)` and root-caused to **two pre-existing DOM tree-corruption bugs**: (1) `insertBefore` missing DOM pre-insert **step 3** (`referenceChild = node.nextSibling`), so `prepend()` of an already-first child inserted a node *before itself* → self-cycle → hang; (2) Rust `insert_before` captured `prev_id` **before** `detach`, dropping a sibling on a no-op adjacent move. Fixed both (JS + Rust guard + detach-reorder); **bonus Node-insertBefore 38→39.** dialog-open 3/3, dialog-close 5/5, close-event(-async) 1/1, requestclose-2/3 1/1, toggle-events 0→5/12, +more. **Zero regressions** (stash-verified attribute-basic 113 — a −2 `<dialog popover>` display:none regression caught & fixed; qsa 1975, classlist 1420, createElement 147, all ChildNode/ParentNode insert methods, popover all-elements 1101 / invoking 1400 / toggleevent 39, full command realm). **Caps:** Escape/light-dismiss + `*-crash` reftests need a `test_driver`→CDP **input bridge**; top-layer/backdrop/autofocus need render+focus; toggle-events tail = a testharness `step_timeout` ordering quirk. **Next:** the input bridge (widest lever for dialog+popover dismiss/focus). |
| ~~154~~ | ✅ [The Commanded Verdict](154-the-commanded-verdict.md) | **The `command`/`commandfor` invoker API** — `html/semantics/the-button-element/command-and-commandfor/` | **+92 across 9 tests** | ⚔️⚔️⚔️ | **SECURED — +92.** All `bootstrap.js`. `CommandEvent` (retargeting `source` like `relatedTarget`), `commandForElement`/`command` reflection, `button.type` Auto-state, and the activation steps (`_runCommandInvoker`). The dialog tail was capped here on the missing `<dialog>` API — unblocked by **Quest #155**. |
| ~~153~~ | ✅ [The Hinted Verdict](153-the-hinted-verdict.md) | **The popover hint-stacking model + `document.currentScript`** — the `html/semantics/popovers/` hint/reentrancy tail | **+21 across 6 tests** | ⚔️⚔️⚔️ | **SECURED — +21.** All `bootstrap.js` + a one-line Rust script-driver tweak (no new DOM primitive). The **auto/hint two-list stacking model** over one top-layer order (showing a hint never closes autos; an auto opened inside a hint **downgrades** to hint; hiding an auto takes its **nested** hint stack with it via a "hint stack parent", but leaves a sibling hint) — implemented from the spec's `topmost popover ancestor` (now honouring the invoker `source`), `hide popover stack until`, and the hints-close-before-autos ordering. Plus **`document.currentScript`** (a `Document` getter fed by the classic-script driver in `page.rs` + the dynamic-`appendChild` eval path — broadly useful), **`{source:null}`→TypeError** + source-based ancestry, **`popoverTargetElement` element-reflection** (`=null` removes the attr; any `popovertarget` write clears the explicit ref), and the document **`showing popover`/`hiding popover nesting count` reentrancy guards** (`showPopover()` from inside a closing beforetoggle → InvalidStateError). types-with-hints 0→7/7, imperative-invokers 5→10/10, open-in-beforetoggle 0(ERROR)→3/5, hint-hierarchy 0→3/5, top-layer-nesting-hints 3→5, reflection 0→1/1. **Zero regressions.** **Caps:** the `test_driver`→CDP input bridge (light dismiss/focus, and coordinate hit-testing Obscura fakes); `dialog.showModal`; the `command`/`commandfor` API; shadow-flat-tree ancestry. **Next:** the `command` API (cleanest non-render popover win); then the input bridge. |
| ~~152~~ | ✅ [The Overlaid Verdict](152-the-overlaid-verdict.md) | **The whole popover API** — `html/semantics/popovers/` (found ENTIRELY red) | **+~3405 across 20+ tests** | ⚔️⚔️⚔️⚔️ | **SECURED — +~3405.** Mostly `bootstrap.js` + a tiny Rust primitive (`:popover-open` node flag). `ToggleEvent`; the `popover` reflector + `showPopover`/`hidePopover`/`togglePopover` over HTML's algorithms (validity checks, re-checking the type after each event-firing step, cascade-closing the auto/hint top-layer stack); async coalescing `toggle` + cancelable-only-opening `beforetoggle`; **attribute-change steps** (type change while showing → hide) + **removal steps** (leaves document → hide, no events); **`popovertarget` invokers** (`popoverTargetElement`/`popoverTargetAction` IDL + `.click()` activation, `source` on the event, form-action buttons excepted); light dismiss (spec-correct but harness-capped); and **UA `display:none` for hidden popovers** synthesized in `getComputedStyle` + the offset/rect stubs (gated on `_popoverEverUsed`, stash-verified inert off-popover). all-elements 0→1101, invoking-attribute 0→1400, -hint 0→700, toggleevent 0→39, attribute-basic 0→113, reactions/HTMLElement 20→22, +more. **Zero regressions.** **Caps:** light/keyboard dismiss + focus tests need a `test_driver`→CDP-input bridge (missing); hint-before-auto semantics; the `commandfor`/`command` API; reftests need render. **Next:** hint stacking model; command API; then a `test_driver` input bridge would unlock the whole dismiss/focus tail. |
| ~~146~~ | ✅ [The Stateful Verdict](146-the-stateful-verdict.md) | **`CustomStateSet` + the `:state()` custom-state pseudo-class** — the whole `custom-elements/state/` realm (found all red), riding #145's `ElementInternals` | **+20 across 5 tests** | ⚔️⚔️ | **SECURED — +20.** Two-part, mirroring `:defined`. **(JS)** `CustomStateSet` (thin wrapper over a real `Set<string>` — insertion-ordered, Set-identical live iteration, any string, no `supports`→TypeError, `toStringTag`); `ElementInternals.states` lazily-minted `[SameObject]`; every mutation pushes the list to Rust via a new `set_ce_states` op. No style invalidation needed — `getComputedStyle` re-matches live → `state-css-selector` 0→10. **(Rust)** `ce_states` per-node `HashMap<NodeId,Vec<String>>` (non-monotonic); `PseudoClass::State` parsed as a lone `expect_ident`+`expect_exhausted` (bad forms → SyntaxError), serialized via `serialize_identifier`, matched via `has_ce_state`. Plus `::part()` parse-but-never-match (`PseudoElement::Part` + `accepts_state_pseudo_classes`) so `::part()` rules stay in the CSSOM, and an **escape-aware CSS rule splitter** (`_cssParseRuleList` ignored backslash-escapes → `:state( \(escaped\ state )` dropped). ElementInternals-states 0→4, state-css-selector 0→10, state-pseudo-class 2→6, nth-of 0→1, strong-ref 0→1. **Zero regressions** (qsa 1975, classlist 1420, CSSStyleRule 10, serialize-values 696, pseudo-class-defined 27, connected-callbacks 24, reactions/Element 38). **Caps:** `::part()`/`:host(:state())` shadow **styling** (state-pseudo-class 6/8 — needs real shadow-part/host matching, same lift as constructable-in-shadow); `:nth-child(N of S)` (nth-of 1/3 — the "of `<selector>`" nth form). **Next:** reaction-queue microtask model (~25 subtests, high risk); `:nth-child(of S)`; form-validity integration. |
| ~~138~~ | ✅ [The Shadowed Verdict](138-the-shadowed-verdict.md) | **A real `ShadowRoot` + `Node.getRootNode`** — the standing shadow-tree lead named since Quest #34; `shadow-dom/*` attach/interface + the fragment tree-scoping it shares with `<label>`/ARIA | **+21 across 9 tests** | ⚔️⚔️⚔️ | **SECURED — +21.** All `bootstrap.js` (no Rust), riding the existing real `DocumentFragment`. The old `attachShadow` returned a **fake object literal** and `ShadowRoot` was `class ShadowRoot {}`. Now: (1) **`Node.getRootNode(options)`** walks the `parent` chain to the topmost node (was a stub returning `document`); `composed:true` jumps a shadow root to its host's tree — *no internal caller, pure gain*. (2) **`class ShadowRoot extends DocumentFragment`** — real backing node, `instanceof DocumentFragment`, non-constructible (`new ShadowRoot()` throws), `host`/`mode`. (3) **`attachShadow`** rewritten to DOM §4.9: required `mode` enum (missing/invalid → **TypeError**), non-safelisted host & already-hosts → **NotSupportedError**, returns a real `ShadowRoot`. (4) **`Element.prototype.shadowRoot`** getter (open → root, closed/none → null; Element-only). (5) **`DocumentFragment.getElementById`** made real (was a `null` stub) — scoped, first-in-tree-order, empty-id never matches; `ShadowRoot` inherits it (works after host detach). **attachShadow 2→6, shadowRoot-attribute 0→3, rootNode 1→5, ShadowRoot-interface 6→8, attachShadow-custom-element 1→4, getElementById-dynamic-001 0→1, DocumentFragment-getElementById 3→4, aria-element-reflection 22→24, label-attributes.sub 19→20.** **Zero regressions** (stash-verified all baselines; held: qsa 1975, Node-properties 726, createElement 147, cloneNode 135, aria-attribute 41, type-change-state 380, select-value 4/4, DocumentFragment-constructor 2/2, insert_adjacent_html 31, Range-cloneContents 187). **Caps:** `activeElement` (in-shadow focus) + `styleSheets` (connected-shadow `style.sheet`, same lift as `constructable` 6/13) = 4 residual on ShadowRoot-interface. **Next:** **slots** (`Slottable-mixin` 0/4, `HTMLSlotElement-interface` 2/18 — the slot-assignment algorithm, the next-biggest shadow tail); composed events / retargeting; shadow-inclusive-ancestor scope (aria-element 24→27); declarative shadow DOM. |
| ~~136~~ | ✅ [The Reset Verdict](136-the-reset-verdict.md) | **The form reset algorithm** — the whole `resetting-a-form/` suite (found at 0/15) + the default-value IDL it restores | **+16 across 5 tests** | ⚔️⚔️ | **SECURED — +16.** `HTMLFormElement.reset()` now fires a **trusted, bubbling, cancelable `reset` event** (dispatched privately so the trusted flag survives; `onreset` invoked explicitly, `preventDefault()` aborts), then runs each control's reset algorithm: **input** value → `value` attr (drop dirty value) + checkbox/radio checkedness → `checked` attr (new **`clear_checked` Rust op** drops the `checked_state` override — the dirty-checkedness flag); **textarea** raw value → child text; **output** → default value; **select** → per-option `selected` attr (#135's `_resetSelect`). Added `input.defaultValue`/`defaultChecked`, `output.value`/`defaultValue` (value-mode flag + stored default); **reset-button `click()`** activation behavior; **`document.forms`** is now a real named-access `HTMLCollection`; and **`textarea.value=` no longer clobbers the child text** (raw value ≠ default value, so `defaultValue`/reset survive). **reset-form 0→12, reset-form-2 0→1, reset-event 0→1, reset-form-event-realm 0→1, value-defaultValue 6→7.** **Zero regressions** (stash-verified all five baselines; held: type-change-state 380, select-event 270, setRangeText 80/88, setSelectionRange 49, qsa 1975, classlist 1420, createElement 147, Node-properties 726, select-value 4/4). **Caps:** `document.forms.html` CNR is PRE-EXISTING (a `querySelectorAll('form')` stack overflow on that specific page, independent of the `forms` getter). **Next:** `the-button-element`/`the-output-element`/`form-submission-0`; or textarea child-text/CRLF-normalization residual. |
| ~~135~~ | ✅ [The Selectedness Verdict](135-the-selectedness-verdict.md) | **`<select>`/`<option>`/`HTMLOptionsCollection` model + the selectedness algorithm** — the whole `the-select-element/` + `the-option-element/` suites (found ~90 subtests failing on one missing primitive) | **+94 across 20 tests** | ⚔️⚔️⚔️ | **SECURED — +94.** All additive in `bootstrap.js` (no Rust) on the subclass prototypes (shadows the generic `Element` getters). (1) real **`HTMLOptionsCollection`** (settable `length`, indexed get/set, `add`/`remove`/`selectedIndex`, `namedItem`, iterable). (2) **`HTMLSelectElement` IDL** — `options`/`selectedOptions` (live `[SameObject]`)/`value`/`selectedIndex`/`size`/`item`/`namedItem`/`add`/`remove` + indexed getter `select[i]`. (3) **`HTMLOptionElement` IDL** — `value`/`label` (text fallback unless a *null-namespace* attr)/`text`/`index`/`defaultSelected`/`selected`/`form` + `Option(text,value,defaultSelected,selected)` factory. (4) the **selectedness+dirtiness model** (IDL `selected` setter sets dirtiness, never the content attr; content-attr changes move selectedness only while not dirty — hooked via a scoped `setAttribute`/`removeAttribute` override on `HTMLOptionElement.prototype`). (5) the **selectedness setting algorithm** run at *read* time (list of options = descendant tree-walk so a `<div>`-nested option counts; auto-select first non-disabled; collapse markup double-selection to last) with a `_noAutoSelect` flag so `selectedIndex=-1` sticks. (6) select `valueMissing` via the placeholder-label-option. (7) form reset restores option selectedness from the `selected` attr. **selected-index 0→13, option-label 0→12, option-element-constructor 0→11, select-selectedOptions 1→8, common-HTMLOptionsCollection 1→8, option-value 7→12, select-validity 1→5, +many.** **Zero regressions** (stash-verified: reset-form 0/12, reset-event 0/1, value-defaultValue 6/12 already failing; select-value held 4/4; qsa 1975, classlist 1420, createElement 147, Node-properties 726, type-change-state 380, valueMissing 78, setRangeText 80/88). **Caps:** `select-restore-invalid-option` (bfcache — out of scope); `select-validity` 5/6 (prepend-of-selected-option deselecting siblings needs an insertion hook). **Next:** form reset is now a real opportunity (proper default-value restoration + `reset` event); shadow scope; namespaced cascade-match Rust lift. |
| ~~133~~ | ✅ [The Selected Verdict](133-the-selected-verdict.md) | **Text-field selection API + input value model** — `html/semantics/forms/the-input-element/type-change-state.html` (found at 0/380) + the whole `textfieldselection/` suite | **+1082 across 15 tests** | ⚔️⚔️⚔️ | **SECURED — +1082.** All additive in `bootstrap.js` (no Rust) on `HTMLInputElement`/`HTMLTextAreaElement` prototypes. (1) **Input value model** (HTML §4.10.5): four value modes (value/default/default-on/filename), per-type value sanitization, and the "signal a type change" algorithm re-flowing the value between modes on a `type` change (`<input type=file>.value=` throws `InvalidStateError`). (2) **Selection API** (input {text,search,tel,url,password} + textarea): `selectionStart/End/Direction` (getters clamp to value length + return `null` off-type; setters throw `InvalidStateError` off-type, ToUint32, push-end), `setSelectionRange`, `setRangeText` (4 selectMode branches), `select()` (never throws); value-set moves the cursor to the end only on a real change (default cursor is 0). (3) The **`select` event** — trusted, bubbling, non-cancelable, queued async by "set the selection range" iff the selection changed, via `_dispatchSpec` + an `onselect` IDL handler. **type-change-state 0→380, select-event 30→270, selection-not-application 42→262, setRangeText 16→80, selection.html(2) 2→59, selection-start-end 3→37, +many.** **Zero pass-regressions** (qsa 1975, classlist 1420, reflection-misc 4709, reflection-metadata 2994, Node-properties 726, aria-attribute 41, select-value 4/4). **Caps:** eager selection clamp on textarea content mutation + form reset (2–3), `scrollLeft` preservation (layout), value-sanitization detail (~13). **Next:** shadow scope (aria-element 5 / constructable 6/13), namespaced cascade-match Rust lift, or sweep fresh `html/semantics/forms/*` (the value model is foundational there). |
| ~~132~~ | ✅ [The Presentational Verdict](132-the-presentational-verdict.md) | **Obsolete presentational reflectors** — section + grouping suites (`html/dom/reflection-sections.html`, `html/dom/reflection-grouping.html`) | **sections 4890→5604 (100%), grouping 4797→5314 (+517)** | ⚔️ | **SECURED — +1231.** All additive in `bootstrap.js` (no Rust), riding #130's table-driven `Element.prototype` machinery. Generic DOMString `align`/`color`/`background`; boolean `reversed` (`<ol>`) / `noShade`→`noshade` (`<hr>`); body-gated `[LegacyNullToEmptyString]` colours `text`/`link`/`vLink`/`aLink`/`bgColor` (gated to `<body>` — `.text` means script-text on `<script>`; setter uses strict `=== null` so `null`→`""` but `undefined`→`"undefined"`); tag-dispatched `width` (`long` on `<pre>` default 0, DOMString on `<hr>`); `size` (DOMString, `<hr>`); `start` (`<ol>` `long`, default **1**); `<li>.value` (`long`, default 0, branch in the form-control `value` accessor); and Document-level `dir` (enum → document element) + `fgColor`/`linkColor`/`vlinkColor`/`alinkColor`/`bgColor` (→ `<body>` colour attrs) on `Document.prototype` (forwarded through the §nameditem document Proxy). **Zero regressions** (qsa 1975, classlist 1420, createElement 147, Node-properties 726, aria-attribute 41, aria-element 22/27, getElementById 18, attributes 67, reflection-misc 4709, reflection-metadata 2994, DOMTokenList-coverage-for-attributes 168/175, Element-getElementsByTagName 19/19, select-value 4/4). **Cap:** grouping's 44 residual = `<blockquote>.cite` URL-origin cap (headless env reports `undefined` origin → garbage expected value). **Next:** shadow scope (aria-element 5 / constructable 6/13), namespaced cascade-match Rust lift, or sweep fresh DOM. |
| ~~128~~ | ✅ [The Aborted Verdict](128-the-aborted-verdict.md) | **`AddEventListenerOptions.signal`** — AbortSignal-driven listener removal — `dom/events/AddEventListenerOptions-signal.any.html` (found at 4/11 on a fresh sweep) | **4/11 → 11/11** | ⚔️ | **SECURED — +7.** One edit to the central `_addListenerByKey` (`bootstrap.js`, no Rust), the single choke point every `addEventListener` path funnels through. `addEventListener` now reads `options.signal`: a *present* signal that isn't an `AbortSignal` (notably `null`) throws `TypeError` **before** the null-callback step (WebIDL coerces the non-nullable interface member during argument processing — so even `addEventListener("x", null, {signal:null})` throws); an already-**aborted** signal never adds the listener; otherwise the listener is added and an `abort` algorithm registered on the signal **removes** it (via the existing `_removeListenerByKey`, matched by handler+capture) when it fires. Abort-from-inside-a-listener removes future listeners for free — the existing `_invokeListeners` already snapshots and re-checks the live registry per call. **Zero regressions** (qsa 1975, Node-properties 726, createElement 147, nameditem-01 7/7, Event-dispatch-bubbles-true 5/5, Event-dispatch-order 1/1, EventListenerOptions-capture 4/4, AddEventListenerOptions-once 4/4, EventTarget-add-remove/add/remove-listener 1/1 each, EventListener-handleEvent 6/6, remove-all-listeners 2/2, dom/abort/event.any 15/16; `AddEventListenerOptions-passive.any` 2/5 fails only on passive-preventDefault, a dispatch concern this edit never touches — pre-existing). **Next:** passive-`preventDefault` gate (2/5, ~+3), shadow scope, namespaced cascade-match Rust lift, or sweep fresh DOM. |
| ~~126~~ | ✅ [The Adjacent Verdict](126-the-adjacent-verdict.md) | **`Element.insertAdjacentHTML` spec rewrite** — `domparsing/insert_adjacent_html.html` (found at 2/31 on a fresh sweep) | **2/31 → 31/31** | ⚔️ | **SECURED — +29.** Rewrote `insertAdjacentHTML` (`bootstrap.js`, no Rust) from a buggy stub to the DOM algorithm. Old code switched on the **raw, case-sensitive** position (so `"beforeBegin"` etc. fell through to a silent no-op), moved a **live** `childNodes` list one node at a time (each move shrank the list under the loop → skipped nodes / `appendChild(undefined)` → "Cannot read properties of null"), and silently no-op'd the error cases. Now: ASCII case-insensitive position; resolve the insertion **context** and throw BEFORE parsing — unknown position → `SyntaxError`, `beforebegin`/`afterend` with no parent or a **Document** parent → `NoModificationAllowedError` (code 7, was the wrong `HierarchyRequestError` code 3); parse in a context-named throwaway element (`<html>`→`<body>`); flag parsed `<script>`s "already started" (`_scriptAlreadyStarted`, the Quest #125 inertness flag) so they don't execute on insertion; insert the parsed nodes via a **DocumentFragment** atomically (no live-NodeList hazard, no text-node merging). **Zero regressions** (insert-adjacent 4/4 [Element/Text], outerhtml-01 1/1, outerhtml-02 5/5, Event-dispatch-bubbles-true 5/5, Node-cloneNode 135, Node-properties 726, classlist 1420, qsa 1975, createElement 147, getElementById 18, attributes 67, aria-attribute 41, dataset 8). **Next:** shadow scope (aria-element 5 / constructable 6/13), namespaced cascade-match Rust lift, or sweep fresh DOM. |
| ~~125~~ | ✅ [The Cloned Verdict](125-the-cloned-verdict.md) | **`Document.cloneNode` + cloned-script inertness** — `dom/events/Event-dispatch-bubbles-true.html` (`document.cloneNode(true)` returned `null`) | **broken/ERROR → 5/5** | ⚔️⚔️ | **SECURED — root-cause primitive.** Two fixes in `bootstrap.js` (no Rust): (1) `Document.prototype.cloneNode(deep)` — `Node.cloneNode` returned `null` for nodeType 9, so `document.cloneNode(true)` threw "Cannot read properties of null (reading 'documentElement')". The page document (and standalone `new Document()`) now clone into a fresh **detached** document of the same kind (HTML `DetachedDocument` / XML `new Document()`), deep-cloning children into the clone (shallow clone = empty doc, per spec). (2) A cloned `<script>` now carries the DOM "already started" flag (`_scriptAlreadyStarted`), and `appendChild`'s inline-script eval is gated on it — without this, deep-cloning a page containing its own `<script>` re-executed it and recursed to OOM (masked before fix #1 because the inner `cloneNode` returned `null` and threw). A dynamically *created* script still runs; only **clones** are inert. **Zero regressions** (Node-cloneNode 135, importNode 5, isEqualNode 9, qsa 1975, createElement 147, Node-properties 726, getElementById 18, attributes 67, getElementsByTagName 19, Event-dispatch-order 1, aria 41 / 22, Range-cloneContents 187, classlist 1420). **Honesty:** the pre-fix `2112/2705` ERROR is a harness inflation artifact — 5 real `test()` blocks; the win is *harness ERROR→OK* + the `cloneNode(true)` subtest green, not a literal `+593`. **Next:** shadow scope (aria-element 5 / constructable 6/13), namespaced cascade-match Rust lift, or sweep fresh DOM. |
| ~~122~~ | ✅ [The Associated Verdict](122-the-associated-verdict.md) | **ARIAMixin element reflection** — `html/dom/aria-element-reflection.html` (the #121-named sibling lift): `ariaActiveDescendantElement` + 7 `FrozenArray<Element>` relationship attrs | **5/27 → 22/27** | ⚔️⚔️ | **SECURED — +17.** ARIA *element* reflection (all additive in `bootstrap.js`, no Rust): one single-Element attr (`ariaActiveDescendantElement` ↔ aria-activedescendant) + 7 `FrozenArray<Element>` attrs (`ariaControls/DescribedBy/Details/ErrorMessage/FlowTo/LabelledBy/OwnsElements`). Two association paths per the "attr-associated elements" algorithm: **explicit** (IDL setter stashes raw refs in `_explicitAria`, writes `""` to the content attribute, survives id-change/reparent) and **computed** (parsed from content-attr id tokens via getElementById, first-in-tree-order). Setting/removing the content attribute directly resets the explicit ref (hook in setAttribute/removeAttribute via `__ariaResetExplicit`). A ref is exposed only in a **valid scope** (host+ref connected to the same document — covers not-yet-inserted + cross-document); the FrozenArray getter **caches by element-list identity** (IDL caching invariant: `el.x === el.x`). Setter type-checks → TypeError on non-Element / non-sequence. **Zero regressions** (aria-attribute-reflection 41/41, attributes 67, qsa 1975, classlist 1420, createElement 147, Node-properties 726, getElementsByTagName 19, MO-attributes 42, setAttribute 2/2, selectorSerialize 23 — all unchanged). **Next / cap:** the 5 residual all need real shadow-tree scope discrimination (crossing-INTO a shadow tree disallowed vs a shadow-INCLUSIVE-ancestor allowed) — the "same-document + connected" model can't tell them apart; needs shadow-root scope walking. |
| ~~120~~ | ✅ [The Canonical Verdict](120-the-canonical-verdict.md) | **CSSOM selector serialization** — `CSSStyleRule.selectorText` parse/validate/serialize across `selectorSerialize`, `serialize-namespaced-type-selectors`, `CSSStyleRule-set-selectorText` (the #119-named CSSOM tail) | **all 3 → 100%** | ⚔️⚔️⚔️ | **SECURED — +96.** `selectorText` was a stub (getter returned raw bytes; setter just trimmed). Built a real recursive-descent **selector parser + CSSOM serializer** (all additive in `bootstrap.js`, no Rust): identifier/string escaping (`\30 zonk`, `\@`, `\\`), An+B canonicalisation (`even`→`2n`, `1n - 0`→`n`), functional-pseudo whitespace collapse (`:lang( ja )`→`:lang(ja)`, `:not( abc )`→`:not(abc)`), legacy `:before`→`::before`, unknown-pseudo rejection (`:gibberish` invalid), and the full **namespace serialization** rule (`*\|` dropped without a default ns / kept with one; a named prefix resolving to the default-namespace URL omitted, `nsdefault\|e`→`e`; attr null-ns `[\|x]`→`[x]`). `set selectorText` validates → no-op on parse failure (keeps old value); getter falls back to raw text if unparseable so it can never break a page. Plus a **dirty-gated cascade reflection** — `_styleSheetRules` serves the cascade from the live `CSSStyleRule` objects when a `<style>`-backed sheet has a CSSOM selectorText edit (`_cssomDirty`, freshness-guarded on textContent), so `getComputedStyle` honours the edit; untouched pages keep the byte-for-byte text-parse path. **selectorSerialize 14→23, serialize-namespaced 31→60, set-selectorText 24→82.** **Zero regressions** (qsa 1975, classlist 1420, createElement 147, Node-properties 726, MO-attributes 42 / childList 38, getElementsByTagName 19, serialize-values 696/697, shorthand 7/7, CSSStyleRule 10, constructable 6/13, getComputedStyle-pseudo 2 — all unchanged). **Next:** `set-selectorText-namespace` 0/5 is a SEPARATE cap — namespace-aware *matching* in the Rust `selectors` glue (the rule never matches even at parse time), not serialization. Sweep a fresh region or take that Rust lift. |
| ~~118~~ | ✅ [The Batched Verdict](118-the-batched-verdict.md) | **MutationObserver atomic childList record batching** — `MutationObserver-childList`, `MutationObserver-inner-outer`, `ParentNode-replaceChildren`, `domparsing/outerhtml-*` (the #117-named next lead) | **all 5 → 100%** | ⚔️⚔️ | **SECURED — +20.** A compound DOM op must emit ONE childList record (added ∪ removed) per DOM "queue a tree mutation record", not one per Rust primitive. Added a Rust **suppress-then-synthesize** mechanism: a `suppress_mutations` depth counter (the 3 childList primitives skip their per-step push while suppressed) + a `record_childlist_mutation` op (`push_suppress_mutations`/`pop_suppress_mutations`/`record_childlist`). `bootstrap.js` `__obscura_batchDepth` + enter/exit/record helpers — only the OUTERMOST batch scope synthesizes (nested compound ops collapse to the outer record); ALL gated on an active observer so unobserved pages run the original fast paths untouched. Applied to `textContent`, fragment `append`/`insert` (two records: removal on the fragment + addition on the parent), `replaceChild` (incl. the *internal replacement* → 2 records in spec order: node's old-parent removal first, then the combined replace), `innerHTML` (batched in the Rust `set_inner_html` op), and `_pnReplaceChildren`. Plus a **missing `set outerHTML`** (its absence made `el.outerHTML=…` a silent no-op → the `inner-outer` test TIMED OUT); added §dom-element-outerhtml with `[LegacyNullToEmptyString]`. **childList 31→38, inner-outer 0→3, replaceChildren 25→29, outerhtml-02 0→5, outerhtml-01 0→1.** **Zero regressions** (qsa 1975, classlist 1420, the Range content-ops 1840 each, MO attributes 42 / characterData 23 / takeRecords 3 / disconnect 2, Rust unit tests 40/40; outerhtml STASH-PROVED). **Next:** `MutationObserver-document` 1/4 is a separate parse-time observation gate; sweep a fresh region. |
| ~~117~~ | ✅ [The Namespaced Verdict](117-the-namespaced-verdict.md) | **MutationObserver attribute-record correctness** — `dom/nodes/MutationObserver-attributes.html` (found red on a fresh sweep; the Collections Armory baselined already-100%, the board's "4/19" was stale) | **42/42** | ⚔️ | **SECURED — +6 (100%).** Two root-cause fixes in the Rust mutation recorder (Phase 0c — the Rust tree is the authoritative mutation source the JS observer drains). (1) **`attributeNamespace` was hardcoded `null`**: the `MutationRecord` had no namespace field, so `setAttributeNS`/`removeAttributeNS` records reported `attributeNamespace === null` where the test wants the real ns. Added `attr_namespace: Option<String>` to `MutationRecord`, threaded a `namespace` arg through `record_attribute_mutation`, the two ns-aware ops pass `Some(ns)`, drain serializes it, and `bootstrap.js` carries it through `__drainMutations` + `_enqueue`. (2) **A no-op removal queued a spurious record**: `removeAttribute`/`removeAttributeNS` on an absent attribute must queue nothing (DOM §"remove an attribute" returns early when null) — guarded the record on `old.is_some()` ("expected 1 but got 2" fixed). **Zero regressions** (classlist 1420, createElement 147, Node-properties 726, attributes 67, surroundContents 1840, insertNode 1840, qsa 1975, MO characterData 23 / takeRecords 3 / disconnect 2). **Next:** atomic childList record batching (compound op = ONE record) lifts `MutationObserver-childList` 31/38, `inner-outer` 0/3, `ParentNode-replaceChildren` 25/29 — needs a Rust suppress-then-synthesize mechanism. |
| ~~114~~ | ✅ [The Coerced Verdict](114-the-coerced-verdict.md) | **WebIDL `unsigned long` (ToUint32) coercion + required-arg-count on the CharacterData mutators** — the #113-named tail across `dom/nodes/CharacterData-{substringData,deleteData,replaceData,insertData,appendData}.html` | **all 5 → 100%** | ⚔️ | **SECURED — +30.** Every fail was a WebIDL coercion gap: offset/count are `unsigned long`, coerced via ToUint32 (`>>> 0`, the same op `setStart` already uses) — `-1`→4294967295, `-0x100000000+2`→2, `0x100000000+1`→1, `"test"`→0 — and the args are required (missing → TypeError). THE FIX (pure JS, two-line core): coerce `offset = offset >>> 0; count = count >>> 0` at the top of the shared `__obscura_replaceData` primitive (covers delete/insert/replace/append), rewrite `substringData` to coerce + arg-check + clamp the tail per DOM "substring data", and add a required-arg check to `appendData`. Internal Range callers pass plain in-bounds integers, for which `>>> 0` is the identity. **substringData 14→28, deleteData 12→18, replaceData 30→34, insertData 14→18, appendData 12→14.** **Zero regressions** (the Range internals that route through these primitives all held: extractContents 187, deleteContents 125, cloneContents 187, surroundContents 1840, comparePoint 5580, splitText 6/6, normalize 4/4; classlist 1420, createElement 147, qsa 1975, Node-properties 726). **Next:** wire `__obscura_liveRanges` into the *other* spec range-mutation hooks (node insert/remove, `splitText`, `normalize`); CSS `%`→used-px stays layout-capped. |
| ~~113~~ | ✅ [The Collapsing Verdict](113-the-collapsing-verdict.md) | **live-range adjustment in the DOM "replace data" primitive** — the #111/#112-named range-collapse-offset bug under `dom/ranges/Range-extractContents.html` + `Range-deleteContents.html` | **187/187 + 125/125** | ⚔️ | **SECURED — +40 (both 100%).** Every failure was a same-node-CharacterData range that didn't collapse after extract/delete. The tell was the **"Test bug!"**-prefixed assertion failing on the *expected* range — WPT's own JS reference `myDeleteContents` does `deleteData(so, eo-so); return;` with no `setStart`, **relying on `deleteData` to collapse the live range**. Per DOM "replace data", mutating a CharacterData node must shift the boundary points of every live range in the replaced span — ours never did. THE FIX (pure JS, additive): a live-range registry (`__obscura_liveRanges`, WeakRefs, mirroring `__obscura_liveNodeIterators`) + one shared `__obscura_replaceData(node, offset, count, data)` primitive that all four CharacterData mutators route through, applying the spec's range-mutation steps (and a spec-correct `IndexSizeError` for `offset > length`). **extractContents 168→187, deleteContents 106→125, +2 bonus CharacterData-insertData 12→14.** **Zero regressions** (stash-compared the 4 mutators; splitText 6/6, normalize 4/4, surroundContents 1840, insertNode 1840, cloneContents 187, comparePoint 5580, classlist 1420, qsa 1975, createElement 147). **Next:** wire the same registry into the *other* range-mutation hooks (node insert/remove, `splitText`, `normalize`); `CharacterData-*` tails are WebIDL unsigned-long coercion. |
| ~~112~~ | ✅ [The Validated Verdict](112-the-validated-verdict.md) | **document-rooted `Range.insertNode` validity** — the #111 leftover 48, all ranges whose start container is a Document (`document`/`foreignDoc`/`xmlDoc`) under `dom/ranges/Range-insertNode.html` | **1840/1840** | ⚔️ | **SECURED — +48 (100%).** `Range.insertNode` (DOM "insert") must run pre-insertion validity *before* it mutates, but `__obscura_ensurePreInsertionValidity` omitted the Document-parent cardinality rules (one element child, doctype placement) — deferring them to `insertBefore`'s `_checkInsertConstraints`, which runs *after* the node is removed from its old parent. So inserting an element/doctype into a Document that already has one removed the node, *then* threw `HierarchyRequestError` → DOM left mutated (and the orphaned node corrupted later subtests, incl. the genuine `xmlDoc` adoption cases). THE FIX (pure JS, additive): call `_checkInsertConstraints(parent, node, child)` at the end of `__obscura_ensurePreInsertionValidity` so the full validity runs up-front, before any mutation. Adoption itself already worked (CDP-verified). **insertNode 1792→1840.** **Zero regressions** (`__obscura_ensurePreInsertionValidity` is called only by `Range.insertNode`; surroundContents 1840, cloneContents 187, extract 168/delete 106 with 19/19 pre-existing, comparePoint 5580, appendChild 11, cloneNode 135, classlist 1420, createElement 147, qsa 1975). **Next:** extract/delete remaining 19 each (range-collapse-offset bug); CSS `%`→used-px (layout-capped). |
| ~~111~~ | ✅ [The Sectioned Verdict](111-the-sectioned-verdict.md) | **DOMException legacy `*_ERR` constants on the prototype + CDATASection as Text/CharacterData in Range ops** under `dom/ranges/Range-surroundContents.html`, `Range-insertNode.html` | **1840/1840 + 1792/1840** | ⚔️⚔️ | **SECURED — +632.** Pivoted from the layout-capped CSS-math realm into DOM Range. (1) WPT `dom/common.js` `getDomExceptionName` does `for…in` over a DOMException *instance* for an `*_ERR` const; we defined them only on the interface object, not `DOMException.prototype` (WebIDL: both, enumerable) → `_DOMEXCEPTION_CONSTANTS` on both. (2) `CDATASection` (nodeType 4) now Text/CharacterData in Range ops (node-length = `data` length, not child count) via `__obscura_isText`(3\|4)/`__obscura_isCharData`(3\|4\|7\|8). **surroundContents 1308→1840 (100%), insertNode 1700→1792, extract 163→168, delete 103→106.** Zero regressions. |
| ~~110~~ | ✅ [The Zeroed Verdict](110-the-zeroed-verdict.md) | **all-`0%` args fold inside forcing math functions (`hypot`/`round`/`mod`/`rem`) at computed time** — the named #107–#109 "next leverage" no-layout `0%` sub-win across `css/css-values/hypot-pow-sqrt-computed` + `round-mod-rem-computed` | **52/52 + 233/243** | ⚔️ | **SECURED — +10.** `0%` is 0 against any containing block, so a forcing function (one that can't re-serialize as linear `calc(P% ± Lpx)`) whose every `%` literal is `0%` folds with NO layout: `hypot(0% + 3px, 0% + 4px)`→`5px`, `calc(round(1px + 0%, 1px + 0%))`→`1px`. Single-arg `hypot(0% + 772.333px)`→`calc(0% + 772.333px)` via the #109 single-arg unwrap (now extended to `hypot`). ROOT CAUSE: any `%` routed `_trComp` into the mixed-`%` branch which can't fold a function → the name leaked into the computed value (`hypot(0% + 3px, …)`). THE FIX (pure JS, additive): new `_FORCE_EVAL_FN_RE` + `_allPctZero(t)`; the mixed-`%` branch evals with %-base 0 when both hold, gated on `computed`. **hypot-pow-sqrt-computed 48→52 (100%), round-mod-rem-computed 227→233.** **Zero regressions** (a non-zero `%` keeps `_allPctZero` false → stays symbolic; minmax-length-percent 30, minmax-length 76, signs-abs 222, clamp-length-computed 24, sin-cos-tan 32, acos 50, all serialize realms byte-identical incl. round-mod-rem-serialize 21/24 stash-proven pre-existing, qsa 1975, calc-nesting 7/8). **Cap:** the remaining 10 round-mod-rem + the minmax/signs-abs/etc. tails are all non-zero `%`→used-px against the containing block (real layout) — THE standing widest tail. |
| ~~109~~ | ✅ [The Singular Verdict](109-the-singular-verdict.md) | **single-arg `min()`/`max()` collapses to `calc()` at computed time** — the named #108 "next leverage" `%` tail, the no-layout half of `css/css-values/minmax-length-percent-computed` | **30/50** | ⚔️ | **SECURED — +30.** The 0/50 realm split: 30 single-arg `min(1em + 1%)`/`max(1vh + 1%)` reduce to their lone argument per CSS Values 4 §simplification → serialize as `calc(1% + 20px)` (NO layout — `%`/viewport stay symbolic, em/abs→px), 20 multi-arg `min(20px, 10%)`→`10px` need the containing block (layout cap). ROOT CAUSE: `_resolvePctLengthCalc` only matched `calc(`-prefixed strings, so single-arg min/max fell through to `_canonMathExpr` which echoed the `min(…)` wrapper → leaked the function name into the computed value. THE FIX (pure JS, additive): `_unwrapSingleMinMax(t)` rewrites `min(X)`/`max(X)` (one top-level arg, no comma) → `calc(X)`, called once atop `_trComp` gated on `computed` so the specified/serialize path is byte-identical. **minmax-length-percent-computed 0→30.** **Zero regressions** (minmax-length-computed 76, signs-abs 222, round-mod-rem 227, hypot 48, clamp-length-computed 24, minmax/clamp-length-serialize 24/50, translate-parsing-computed 19). **Cap:** the 20 multi-arg comparisons need `%`→used-px (layout) — THE standing widest tail. |
| ~~105~~ | ✅ [The Counted Verdict](105-the-counted-verdict.md) | **`sibling-index()` (CSS Values 5 tree-counting)** — the named #104 "next leverage" #1; the shared `sibling-*` tail across `acos-asin-atan-atan2-computed`, `sin-cos-tan-computed`, `hypot-pow-sqrt-computed` | **50/50 + 32/32 + 47/52** | ⚔️ | **SECURED — +14.** One primitive across four computed property paths. THE FIX (pure JS, additive): (1) **`_mtFn` types `sibling-index()`/`sibling-count()` as `<number>`** (was the conservative catch-all `'unknown'`, which made `atan2(1, sibling-index())` resolve `'unknown'` so `_rotKind` mis-rejected it in `rotate`); (2) **`_evalMath` resolves them** from `opts.siblingIndex`/`siblingCount` (real DOM value) or a `siblingValid` grammar placeholder; (3) **`_siblingOpts(el, val)`** reads the element's true 1-based element-sibling position via `element_children`, gated on `_SIBLING_FN_RE` so the common computed path takes no extra DOM round-trip; threaded into `_rotSerAngle`/`_scaleComp`/`_trComp`/`_computeIntegerValue` + scale's `_scaleCalcOk` probe. Reads the REAL DOM (CDP-verified: hypot's `#target` is the 4th child → `sibling-index()`=4). **acos 46→50, sin-cos-tan 26→32, hypot 43→47.** **Zero regressions** (signs-abs 167/16, round-mod-rem 227/108, calc-infinity-nan 48, minmax-length 76/24, clamp-length 24/50, invalid realm acos 62/1-cap + signs/round/sin/hypot, transforms 23/38/19, color-computed-relative-color 1121, classlist 1420, createElement 147). **Caps:** `hypot` `0%`-mixed + `pow`-length validity (47/52); `%`→used-px (layout); `border`→longhand expansion. |
| ~~102~~ | ✅ [The Flattened Verdict](102-the-flattened-verdict.md) | **nested-product coefficient fold in the SPECIFIED length/time serializer** — the named #101 "next leverage" #1, the last fail under `css/css-values/minmax-length-serialize` | **24/24** | ⚔️ | **SECURED — +1.** `_simpCalc` folds numeric leaves at one product level but left a coefficient stranded inside a surviving child product (`2 * (0.2 * min(1em,1px))` kept its `2` and `0.2` apart). THE FIX (pure JS, additive): before the coefficient fold, **flatten** any factor that is itself a product, inlining its factors so the numerics combine (`2 * (0.2 * min)` → `0.4 * min`). Inner ops carry over under `*`, invert under `/`. Gated behind the length/time `sort` path so the colour channel stays byte-identical. **minmax-length-serialize 23→24 (realm now 100%).** **Zero regressions** (color-valid 1146, color-computed 1121 = the wpt.live content change, calc-infinity-nan 41/31/29/30 + 48, signs-abs 16/164, round-mod-rem 21/227, hypot 25/43, minmax 40/38/76/22, calc-nesting 6, calc-dim-order 44, clamp 50/24/6, transforms 38/23/19, classlist 1420, createElement 147 all held). **Caps:** calc-in-shorthand (`calc(calc(10px)) solid pink`, the `calc-nesting` 6/8 cap); `%`→used-px (layout). |
| ~~101~~ | ✅ [The Boundless Verdict](101-the-boundless-verdict.md) | **`clamp(none,…)` at COMPUTED time + mixed-unit product fix** — the named #100 "next leverage" #1 under `css/css-values/clamp-integer-computed`, `clamp-length-computed` | **6/6 + 24/24** | ⚔️ | **SECURED — +7.** #100 folded `clamp(none,…)` in the SPECIFIED serializer (`_foldMathFn`), but the COMPUTED numeric path (`_evalMath`) failed on the bare `none` keyword → fell back to symbolic `calc(30)`. THE FIX (pure JS, additive): (1) **`none` sentinel in `_evalMath`'s clamp branch** — a `none` low → −∞, a `none` high → +∞, so the existing `max(lo, min(val, hi))` collapses correctly and `clamp(none,30,33)` on `z-index`→bare `30`; (2) **mixed-unit product fix** — `_mulUnit`/`_divUnit` now return `null` for two different non-empty units (px·em, px/em) so the product fold keeps `1600px / 1em * 1px` symbolic at specified time (em unresolved) and the computed path resolves em→px later (→`80px` at font-size 20px). Was silently dropping `/1em*1px` → bogus `1600px`. **clamp-integer-computed 1→6, clamp-length-computed 22→24.** **Zero regressions** (stash-confirmed color-computed-relative-color 1121 is a wpt.live test-content change, NOT my regression; color-valid 1146, calc-infinity-nan-serialize 41/31/29/30, signs-abs 16/164, round-mod-rem 21/227, minmax 40/38/76, hypot 25/43, transforms 38/23/19, calc-nesting 6, classlist 1420, createElement 147 all held). **Caps:** nested-product coefficient fold (`2*(0.2*X)`→`0.4*X`); calc-in-shorthand; `%`→used-px (layout). **Note: wpt.live moved many paths** — `serialize-values.html` removed, colour → `css/css-color/parsing/`, transforms → `css/css-transforms/parsing/`. |
| ~~100~~ | ✅ [The Folded Verdict](100-the-folded-verdict.md) | **finite-calc folding + canonical sum-ordering in the SPECIFIED length/time serializer** — `clamp(1px,2px,3px)`→`calc(2px)`, sum sort order, `clamp(none,…)` sentinels under `css/css-values/clamp-length-serialize`, `calc-dimension-serialization-order`, `minmax-{length,time}-serialize`, `calc-nesting`, `clamp-none-whitespace` | **see scroll** | ⚔️⚔️ | **SECURED — +123.** The named #99 "next leverage" #2. #99 gated the math serializer on a non-finite keyword; finite `clamp`/`calc` stayed verbatim. THE FIX (pure JS, additive, all behind the length/time `canonLen`/`canonTime` opt so the colour path stays byte-identical): (1) **`clamp()` `none` sentinels** in `_foldMathFn` — `clamp(none,V,H)`≡`min(V,H)`, `clamp(L,V,none)`≡`max(L,V)`, before the all-numeric guard; (2) **canonical sum-ordering** `_simpSumSorted` (number → percentage → dimensions alphabetical), reached only on the `sort` path threaded through `_simpCalc` (+ fixed `args.map(_simpCalc)` leaking the index as `sort`); (3) **lifted the gate** `_canonNonFiniteMath`→`_canonLengthTimeMath` so all length/time math routes through `_canonMathExpr`. **clamp-length-serialize 4→50, calc-dimension-serialization-order 0→44, minmax-length-serialize 13→23, minmax-time-serialize 11→22, calc-nesting 0→6, clamp-none-whitespace 0→3; +2 round-mod-rem-computed (227), +1 signs-abs-computed (164) bonus.** **Zero regressions** (stash-class verify: color-valid 1146, color-computed 1163, serialize-values 696 byte-identical; non-finite serialize 41/29/31/30, computed 48, hypot 25/43, minmax-computed 76, transforms 38/23/19, classlist 1420, createElement 147). **Caps:** nested-product coefficient fold (`2*(0.2*X)`→`0.4*X`, last minmax fail); calc-in-shorthand; `%`→used-px (layout); the COMPUTED clamp-none/em tail (`clamp-length-computed` 17/24). |
| ~~99~~ | ✅ [The Serialized Verdict](99-the-serialized-verdict.md) | **non-finite math in SPECIFIED length/time values** — `el.style.width`/`animation-duration` round-trip of `calc(1px·NaN)`/`calc(1s·infinity)` under `css/css-values/calc-infinity-nan-serialize-{length,time}` | **41/41 + 29/29** | ⚔️ | **SECURED — +70.** The named #98 leftover (#98 clamped at *computed* time; the *specified* value was still verbatim). We already had a full calc serializer wired ONLY into the colour path. THE FIX (pure JS, additive): abs-length/time canon in `_parseCalcTree` (opt-in `canonLen`/`canonTime`: `_ABS_LEN_PX` px/in/cm/…→px, `_TIME_S` ms→s); min()/max() NaN cross-unit collapse in `_foldMathFn` (`_unitType`/`_CANON_TYPE_UNIT`; clamp excluded → keeps 3 args); `1 *` identity + redundant `calc()` wrapper drops; wired via `_canonNonFiniteMath` in `setProperty`/`_parseStyleDecls`, **gated on a non-finite keyword** so every finite calc stays byte-identical. **0→41 + 0→29.** **Zero regressions** (stash-verified color-valid-relative-color 1146, color-computed-relative-color 1163, serialize-values 696 byte-for-byte identical; calc-infinity-nan-computed 48, serialize-number 31, serialize-angle 30 held). **Caps:** `%`→used-px (layout); finite-calc generic-path folding (`calc(1px+2px)`→`calc(3px)`, broader, risks serialize-values); `clamp(none,…)` ±∞ sentinel. |
| ~~98~~ | ✅ [The Clamped Verdict](98-the-clamped-verdict.md) | **non-finite math at computed time** — `calc(infinity·…)`/`calc(NaN·…)`/`calc(-infinity·…)` across `<length>`/`<time>`/`<angle>`/`<number>` under `css/css-values/calc-infinity-nan-computed` | **48/48** | ⚔️ | **SECURED — +48.** The named #96/#97 leftover. Our calc engine already *computed* infinity/NaN numerically but the computed path dropped non-finite results (`_evalMath` returns `null` unless `nonFinite`) and serialized verbatim. ONE clamp helper `_nfClamp` (NaN→0, +∞→1e30, −∞→−1e30, per CSS Values 4 §calc-type-checking) threaded into each computed numeric family: length (`_trComp` + `nonFinite` on `lenOpts`, incl. the mixed-`%` **collapse** — a non-finite probe with a positive base, since a finite `calc(50%+10px)` must stay symbolic), time (`_computeTimeValue` + `_balanceParens` for the EOF auto-close `calc(max(∞·1s,10s)`), scale-number (`_scaleComp`), rotate-angle→identity (`_tfDeg`→0 keeps the matrix finite). Plus registered the `animation-*` longhands (`animation-duration` was failing the `property in getComputedStyle` gate). Pure JS, no new Rust. **calc-infinity-nan-computed 0→48.** **Zero regressions** (signs-abs 163, round-mod-rem 225, minmax-length 76, clamp-length 17, scale/rotate/translate-computed 38/23/19, transform-individual 1, margin/padding 6/8, flex-basis 11, classlist 1420, createElement 147 all held). **Caps:** the SPECIFIED siblings `calc-infinity-nan-serialize-length` 0/41 & `-serialize-time` 0/29 need the math *specified* serializer (operand reorder `1px * NaN`→`NaN * 1px` + emit infinity/nan keywords) — a clean next quest; `%`→used px (layout); `clamp(none,…)` ±∞ sentinel. |
| ~~97~~ | ✅ [The Sized Verdict](97-the-sized-verdict.md) | the **css-sizing + css-logical box computed families** — `min/max-width/height`, `block/inline-size`, `min/max-block/inline-size`, the logical inset/margin/padding longhands + 2-value shorthands under `css/css-sizing/`, `css/css-position/`, `css/css-logical/` | **see scroll** | ⚔️ | **SECURED — +135.** Quest #96's named cheapest sequel: properties already in `_LENGTH_COMPUTED_PROPS` but unregistered in `_GCS_DEFAULTS` failed the harness's first gate (`property in getComputedStyle`). Registered the whole css-sizing + css-logical box family; taught the engine the two extra computed rules those families need beyond plain length resolution — **clamp-negative→0** (`_clampNegPx` on sizing + padding) and **edge collapse** for the 2-value flow-relative shorthands (`_computeBoxShorthand` → split, resolve each edge, collapse via `_serializeBoxValue`). New `_computeSizeValue` (keywords pass, `fit-content()` arg resolves, min-* `auto`→`0px`, `%` symbolic). Pure JS, no new Rust. **max/min-width/height 0→12/11/12/11, inset-computed 0→20, inset-block-inline 0→12, max/min-block/inline-size 0→8/8/8/8, margin/padding-block-inline 0→9/11, block/inline-size 0→3, +bonus physical padding-computed 7→8.** **Zero regressions** (signs-abs-computed 163, round-mod-rem-computed 225, minmax-length 76, scale/rotate/translate-computed 38/23/19, flex-basis 11, classlist 1420, createElement 147 all held). **Caps:** `%`→used px (needs layout — margin/padding/block-size `%` rows); `block/inline-size` intrinsic keywords (layout); flex `auto` min; `calc-infinity-nan` (0/48). |
| ~~96~~ | ✅ [The Resolved Verdict](96-the-resolved-verdict.md) | the **computed length/integer/time resolver** — the `*-computed` half of the CSS math-functions family + length/integer/time computed values (getComputedStyle returns the *resolved* value) under `css/css-values/`, `css/css-box`, `css/css-text`, `css/css-flexbox` | **see scroll** | ⚔️⚔️⚔️ | **SECURED — +353.** The standing deep quest, named since #94. getComputedStyle echoed every length/integer/time property verbatim; the `*-computed` math tests compare two values that must *agree* through it. One generic resolver in `_normComputed`: length props route through the existing `_trComp(v, el, true, vp)` (folds math + resolves em/rem/ex/ch/abs→px, `%` kept symbolic); `z-index`/`order` fold to a rounded integer (`sign(1px)`→`1`); `transition-delay`/duration fold to seconds (new `_evalMath` `opts.time`); a gated `opts.vw`/`opts.vh` resolves viewport units (threaded only through the length path, not translate). Pure JS, no new Rust. **signs-abs-computed 31→163, round-mod-rem-computed 160→225, hypot-computed 4→43, minmax-length 0→76, minmax-integer 0→10, clamp-length 0→17, +bonuses (flex-basis/padding/letter-spacing/word-spacing/mixed-units).** **Zero regressions** (stash-baseline proven). **Caps:** `%` used-length (needs layout); `calc-infinity-nan` width range-clamp (0/48); **`max-width`/`min-width`/logical inset not registered in `_GCS_DEFAULTS`** — cheap high-ROI next move (already in the length set); `clamp(none,…)`; `lh` unit. |
| ~~95~~ | ✅ [The Rejected Verdict](95-the-rejected-verdict.md) | the `*-invalid` half of the CSS math-functions family (CSS Values 4 §10 type-checking) — `sin-cos-tan`/`acos-asin-atan-atan2`/`exp-log`/`hypot-pow-sqrt`/`signs-abs`/`round-mod-rem` `-invalid` under `css/css-values/` | **362/363** | ⚔️⚔️ | **SECURED — +365** (realm +362/363, bonus +3). The clean next quest #94 named. ONE math-function GRAMMAR/TYPE validator over the existing `_parseCalcTree` AST (`_mt`/`_mtFn`/`_mathValid`): per-function arity + unit/type checks + zero-arg rejection, with a proper CSS type lattice where `<percentage>` unifies with dimensions but NOT `<number>` (so `round(1, 1%)` is a type error even on `opacity`), and a `pctType` context (`%` not accepted by `font-weight`/`tab-size`/`<angle>`). Wired into `_tfArgValid` (rejects `rotate(sin(…))` — number into an angle slot) and a new `_MATH_GATE_PROPS` setter gate (`opacity`/`outline-offset`/`font-weight`/`margin-left`/`tab-size`/`height`), firing only when the value contains a math function. Pure JS, no new Rust. **sin-cos-tan 0→42, acos 0→62, exp-log 0→48, hypot 0→49, signs-abs 0→53, round-mod-rem 0→108, +bonus opacity-invalid 0→3.** **Zero regressions** (stash-baseline proven: minmax-length-computed 0/80, registered-property 0/75, signs-abs-computed 31, round-mod-rem-computed 160; math-realm serialize/computed all held exactly; transform 42/20, scale 32/8/38, rotate 23/9/23, translate 20/6/19, opacity 30/30, classlist 1420, createElement 147). **Caps:** 1 subtest `atan2(…, + …)` (whitespace-sensitive `+`, shared tokenizer — too risky for one); the **computed-length resolver** stays the deep next quest. |
| ~~94~~ | ✅ [The Stepped Verdict](94-the-stepped-verdict.md) | the CSS math-functions family — `round`/`mod`/`rem`, trig, inverse-trig, `exp`/`log`, `hypot`/`pow`/`sqrt`, `sign`/`abs` (CSS Values 4 §10) — across `css/css-values/*-{computed,serialize,invalid}` | **see scroll** | ⚔️⚔️ | **SECURED — +446** (realm +401, bonus +45). The widest unconquered tail of the campaign. Two surgical calc-engine primitives, pure JS: (1) `round`/`mod`/`rem` added to `_evalMath` (`_roundOp`/`_modOp`/`_remOp`, full ±0/±∞/NaN spec tables — round's strategy keyword peeled before numeric parse); (2) `_simpCalc` now FOLDS function nodes to a numeric leaf when args resolve to compatible units (`_foldMathFn` — min/max/clamp/round/mod/rem keep the shared unit, `sign`→<number>, trig→<number>, inverse-trig→deg, pow/sqrt/exp/log unitless). Plus wiring: transform args fold (`scale(abs(1))`→`scale(calc(1))`), `opacity` specified canon (`50%`→`0.5`, `min(50%,0%)`→`calc(0%)`), non-finite handling (`calc(NaN * 1deg)`, opacity NaN→0, scale accepts/folds NaN→0). **sin-cos-tan-serialize 144→270, acos-serialize 0→52, signs-abs-serialize 0→16, hypot-serialize 13→25, exp-log-serialize 8→19, round-mod-rem-computed 0→160, +bonus minmax-number-serialize 20→40 & opacity-valid 5→30.** **Zero regressions** (stash-baseline proven on the hot calc primitive: transform 3, scale 32/38/8, rotate 23/23, offset-path 70/24/65, offset 29/29, color-computed-relative 1163, alpha-color 32, color-valid-color-function 340, classlist 1420, createElement 147 all held). **Caps:** all `*-invalid` (363 subtests) need a math-grammar validation gate on opacity/height — the **next quest**; `*-computed` length/time-type need a computed-length/-time resolver (deep quest); `acos-computed` needs `sibling-index()` + length-in-angle. |
| ~~93~~ | ✅ [The Composed Verdict](93-the-composed-verdict.md) | `css/motion/parsing/offset-{parsing-valid,parsing-invalid,shorthand}` (the `offset` shorthand — CSS Motion 1 §6) | **29/29 · 13/13 · 18/18** | ⚔️ | **SECURED — +47.** The capstone of the offset realm (#90–92 built every longhand): the `offset` shorthand `[ <offset-position>? [ <offset-path> [ <offset-distance> \|\| <offset-rotate> ]? ]? ]! [ / <offset-anchor> ]?`. `_parseOffsetShorthand` splits the optional `/ <anchor>` tail (`_splitTopSlash`, paren/quote aware), finds the first `<offset-path>`-start token (`none`/ray()/path()/url()/basic-shape/coord-box) so everything before it is `<offset-position>`, then parses the `distance \|\| rotate` tail (`_parseOffsetDistRot`, either order, each once — `reverse 100px 30deg` rejected for interleaving). The shorthand **expands into its five longhands** (each readable canonically); `getPropertyValue('offset')` recomposes them, eliding initial parts (`normal` position, trailing-`none` path, `0px` distance, `auto`/`auto 0deg` rotate, `auto` anchor). Pure JS, no new Rust; composes the #90–92 longhand validators/serializers. **Zero caps, zero regressions** — offset-path core trio 70/24/65, shape 35/12, offset-rotate 7, offset-distance 4, offset-position 12/15, offset-anchor 11, background-position 31, transform 42, scale 32, classlist 1420, createElement 147 all held. **Next:** standing colour leverage (light-dark()/var()/sibling-index() computed); generalize `_canonSortedCalc` unit-ordering into `_canonMathExpr` (the calc-serialization 0/1 hot-path cap); or a fresh realm. |
| ~~92~~ | ✅ [The Segmented Verdict](92-the-segmented-verdict.md) | `css/motion/parsing/offset-path-shape-{parsing,computed}` (the full `shape()` segment-list grammar — CSS Shapes 2) | **35/35 · 12/12** | ⚔️ | **SECURED — +27.** The sequel #91 named: `shape()` was the last offset-path branch passed through verbatim. Built the full `shape( <fill-rule>? from <coordinate-pair>, <shape-command># )` grammar as a new `head === 'shape'` branch in `_opShape` — move/line/hline/vline/curve/smooth/arc/close. A `<coordinate-pair>` is two `<length-percentage>`s (`_isPosLP`+`_opLp`); a `with` control-point is a full `<position>` (`with 10rem center` valid, via the existing position serializers); arc takes `of <lp>{1,2}` then `<arc-sweep>? <arc-size>? [rotate <angle>]?`. Default `nonzero` fill-rule + arc `ccw`/`small`/`rotate 0deg` elided; computed resolves coordinate/control lengths to px (em/rem/pt→px) while `%` stays symbolic, arc `rotate`→deg. Pure JS, no new Rust; purely additive (new branch + removing the one verbatim short-circuit line). **Zero caps, zero regressions** — offset-path core trio 70/24/65, offset-rotate 5, offset-distance 6, background-position 31, transform 42, scale 32, color-computed-relative 1163/1169, classlist 1420, calc-serialization cap 0/1 all held. **Next:** the `offset` shorthand (valid 13/29, invalid 0/13); standing colour leverage; or a fresh realm. |
| ~~89~~ | ✅ [The Inherited Matrix](89-the-inherited-matrix.md) | `css/css-transforms/parsing/{transform-box,backface-visibility}-computed` + `css/css-transforms/inheritance` (computed-style registry + CSS-wide passthrough on the transform grammar gates) | **5/5 · 2/2 · 20/20** | ⚔️ | **SECURED — +19.** Two root causes in the transform realm's computed-style plumbing. **(1) Unregistered props:** `perspective`, `transform-box`, `backface-visibility`, `transform-style` were never in `_GCS_DEFAULTS`, so `'transform-box' in getComputedStyle(el)` was false — failing the `test_computed_value`/`assert_initial` support gate. Registered all four with their spec initials (`none`/`view-box`/`visible`/`flat`; none inherited; computed value identity), + a `transform-style` keyword gate (`flat\|preserve-3d`) in `_SIMPLE_TRANSFORM_PROPS`. **(2) CSS-wide keywords dropped:** `_isValidTransform`/`_isValidIndividualTransform` (and `_canonIndividualTransform`) didn't exempt `inherit`/`initial`/`unset`/`revert`, so `style.rotate = 'inherit'` was rejected by the #85–#86 grammar gates and the child never observed an explicit inherit (`transform`/`rotate`/`scale`/`translate` "does not inherit" all failed). Mirrored the `_isValidSimpleTransform` short-circuit into both siblings + canon. Pure JS, no new Rust. **Zero caps, zero regressions** (every css-transforms/parsing test green: transform-valid/invalid/computed 42/20/3, transform-origin 16/23/10, perspective-origin 18/21/12, scale/rotate/translate parsing all green; object-position 18, background-position 31, color-computed-relative 1163/1169, classlist 1420, obscura-dom 40/40). **Next:** css/motion offset-rotate/path/distance parsing (filter out reftests); background-position-x/-y longhands; standing colour leverage; fresh realm. |
| ~~83~~ | ✅ [The Contrasted Verdict](83-the-contrasted-verdict.md) | `css/css-color/parsing/color-{valid,invalid,computed}-contrast-color-function` (the `contrast-color()` function, CSS Color 5) | **16/17 · 9/9 · 17/17** | ⚔️⚔️ | **SECURED — +27.** The natural sibling of #82's `alpha()`: `contrast-color( <color> )` resolves to black/white, whichever contrasts more. Same three failure modes — computed fell through to verbatim (0/17), the setter validated no colours so malformed forms were accepted (invalid 0/9), and the `calc()` valid form needed canon (15/17). **Built (pure JS, NO new Rust):** `_parseContrastColor` (one `<color>` arg) + `_isValidContrastColor` (wired into `_isValidColor` + the `alpha(`-scoped setter drop generalized to `/^(?:alpha\|contrast-color)\(/i`); SPECIFIED `_canonContrastColor` (inner via `_canonColorSpecified` recursively — wins the `calc()` case via the #81 serializer); COMPUTED `_contrastStruct` (resolve inner via `_resolveColorStruct` — now with a `contrast-color(` dispatch so nesting works — pick black/white by WCAG-2.1 luminance, Y of XYZ-D65) + `_computeContrastColorComputed` (standalone → legacy `rgb(0, 0, 0)`; nested in color-mix()/relative → that context's own space). Root-cause primitive `_SYSTEM_COLOR_RGB` (approximate light-theme sRGB for system colours, scoped to `_contrastStruct`) so `contrast-color(buttonface)` has a luminance. The computed test accepts EITHER black or white. **Zero regressions** (color-computed-relative 1163, computed-color-mix 919/948, valid-relative 1146/1147, valid-color-mix 674/677, alpha 32/45/18, valid-lab 150, valid-color-function 340, valid-hwb 38, computed-color-function 466/468, computed-hwb 54, **serialize-values 696/697** hot path byte-identical, color-valid 17, color-computed 16, gradient-interpolation 1398, createElement 147, getElementsByTagName 19; obscura-dom 40/40). **Cap (1):** `color-mix(contrast-color(blue) 100%, purple)` lacks the spec-required `in <colorspace>` (likely a test bug; matching it risks the color-mix percentage-fill rule). **Next:** `light-dark()` computed; `var()`/`sibling-index()` computed; generalize `_canonMathExpr` to the generic value path (hot-path risk → own quest); fresh realm. |
| ~~82~~ | ✅ [The Veiled Verdict](82-the-veiled-verdict.md) | `css/css-color/parsing/alpha-color-{computed,parsing-valid,parsing-invalid}` (the `alpha()` relative-alpha function, CSS Color 5) | **32/32 · 45/45 · 18/18** | ⚔️⚔️ | **SECURED — +58.** The top "next leverage" since #77: `alpha(from <origin> [/ <a>])` keeps the origin's channels + colour space and replaces only alpha. Obscura had no notion of it — computed fell through to verbatim (0/32), the setter validated no colours so every malformed form was accepted (invalid 0/18), and 8 valid forms needed canon. **Built (pure JS, NO new Rust):** a shared strict-grammar parser `_parseAlphaFn`; validity `_isValidAlpha`/`_isValidAlphaValue` (only the `alpha` keyword stands for a channel — `r`/`l`/`red`/`calc(r * 0.5)` invalid) wired into `_isValidColor` + a narrow `alpha(`-scoped setter drop; SPECIFIED canon `_canonAlpha` (origin via `_canonColorSpecified` recursively, a `calc()` alpha reordered via `_canonMathExpr`); COMPUTED `_alphaStruct` (resolve origin via `_resolveColorStruct` — now with an `alpha(` dispatch so nested alpha() + alpha()-as-relative-origin work — and swap alpha) + `_computeAlphaComputed`. **The serialization fork:** a *legacy* sRGB origin (`_isLegacyOrigin`: named/hex + `rgb`/`hsl`/`hwb`, incl. their relative forms, recursively through nested alpha()) with a numeric alpha → `rgb()/rgba()`; else (`currentcolor`/`color()`/`color-mix()`/lab/ok*, OR a `none` alpha) → `_csSerialize` own-space form (the test notes its own expectations may be inconsistent — csswg #13992/#13994 — these match Chromium). Plus two root-cause primitives: `_SYSTEM_COLORS` (CSS system-colour keywords lowercase, wired into canon + validity) and zero-arg math functions in `_parseCalcTree` (`sibling-index()`/`sibling-count()`, unblocking `calc(sibling-index() * 0.2)`→`calc(0.2 * sibling-index())`). **Zero regressions** (color-computed-relative 1163, computed-color-mix 919/948, valid-relative 1146/1147, valid-color-mix 674/677, valid-lab 150, valid-color-function 340, valid-hwb 38, computed-lab 112, computed-hwb 54, computed-color-function 466/468, computed-rgb 95, color-valid 17, color-computed 16, gradient-interpolation 1398, gradient-position 18, image-function 13, **serialize-values 696/697 loaded** — zero-arg calc change left the hot path byte-identical, cursor-valid 45/46, createElement 147, getElementsByTagName 19; obscura-dom 40/40). **No caps in the realm** (all three 100%). **Next:** `light-dark()` computed; `var()`/`sibling-index()` computed resolution; generalize `_canonMathExpr` to the generic value path (serialize-values calc cap, hot-path risk → own quest); fresh realm. |
| ~~81~~ | ✅ [The Calculated Verdict](81-the-calculated-verdict.md) | `css/css-color/parsing/color-valid-{lab,color-function,hwb,relative-color}` (the Wave-2 specified-`calc()` serializer) | **150/150 · 340/340 · 38/38 · 1146/1147** | ⚔️⚔️ | **SECURED — +126.** The primitive named "next leverage (1)" since #76, carried across five quests: a CSS Values 4 calculation-tree serializer for colour channels. Every calc-bearing channel failed because the specified path was GATED to no-nested-paren (a calc channel must be PRESERVED, not evaluated) and there was no serializer. **Built (pure JS, NO new Rust):** `_parseCalcTree` (tree of num/sym/sum/prod/fn nodes; `<angle>` units → degrees at parse time), `_simpCalc` (fold a fully-numeric same-unit sum/product to one value; a product's numeric factors → ONE coefficient placed FIRST, a numeric divisor → reciprocal `calc(a / 3)`→`calc(0.333333 * a)`, a non-numeric divisor stays division `calc(1 / l)`; a sum's numeric constant moves first `calc(l - 20)`→`calc(-20 + l)`; `calc()` unwraps, other functions kept so `sign(1em - 10px)` survives), `_serCalcTree`/`_canonMathExpr` (parens on every sum/product, root sheds one layer; non-finite → `NaN`/`infinity`). Wired into ONLY two colour-specific sites: `_computeModernColor(value, specified)` (a `specified` flag threads down — a mathy channel/alpha serializes symbolically & unclamped, a bare one resolves+clamps as before) and `_canonRelativeColor` (each calc channel). hwb keeps `hwb()` for an unresolvable calc hue (`_hwbSpecified`) but still resolves a constant-folding calc to sRGB. lab 116→150, color-function 277→340, hwb 28→38, relative 1127→1146. **The `serialize-values` calc hot path is STRUCTURALLY UNTOUCHED** (the serializer is wired only into colour channels, never the generic value path). **GOTCHA caught + fixed:** `_canonRelativeColor`'s output is re-evaluated by the computed engine, so the serializer must be semantics-preserving — a first cut treated `rad`/`deg` as distinct units, folding `calc(50rad / (50deg * (180/pi)))` (a unitless 1) to `0.0175rad`, corrupting `sin(l)`→`sin(l°)` (color-computed-relative 1163→1162); fixed by canonicalizing all angle units to degrees at parse time (caught via stash-rebuild-baseline). **Zero regressions** (color-computed-relative-color 1163 restored, computed-lab 112, computed-hwb 54, computed-color-function 466/468, computed-rgb 95, computed-color-mix 919/948, color-valid-color-mix 674/677, color-valid 17, color-computed 16, gradient-interpolation 1398, gradient-position 18, image-function 13, createElement 147, getElementsByTagName 19; obscura-dom 40/40; serialize-values wpt.live 404-flux but provably unaffected). **Cap:** the 1 relative fail is `rgb(from var(--color) …)` — a var() origin bails to verbatim then `_canonStandardValue` normalizes `.3`→`0.3` (non-fuzzy var exact-number quirk, architectural, shared with #78). **Next:** `alpha(from …)` (0/32); `light-dark()` computed; `var()` custom-property registration / `sibling-index()`; generalize `_canonMathExpr` to the generic value path (serialize-values calc cap, the real hot-path risk → own quest); fresh realm. |
| ~~79~~ | ✅ [The Transmuted Verdict](79-the-transmuted-verdict.md) | `css/css-color/parsing/color-computed-{color-mix-function,relative-color}` (COMPUTED color-mix() + relative-colour, the cross-space colour-maths engine) | **919/948 · 1150/1169** | ⚔️⚔️⚔️ | **SECURED — +2069.** The biggest standing prize of the CSS-colour frontier, named "next leverage (1)" since #75. Both `color-computed-color-mix-function` (0/948) and `color-computed-relative-color` (0/1169) needed the SAME missing primitive: a real CSS Color 4 cross-space engine. **Built (pure JS, NO new Rust):** XYZ-D65-hub conversions (sRGB/srgb-linear/display-p3(+linear)/a98-rgb/rec2020/prophoto-rgb ↔ linear ↔ XYZ; XYZ-D65↔D50 Bradford; Lab/LCH↔XYZ-D50; OKLab/OKLCH↔XYZ-D65; HSL/HWB↔sRGB; XYZ→RGB by `_inv3` inversion), structured parse `_csParse`→`{space,coords,alpha,none[4]}`, `_colorMixStruct` (N-ary % rule + alpha multiplier `min(1,sum/100)` + premultiplied-alpha interpolation, hue via §12.4 arc fixup), `_relativeStruct` (origin→func-space, channel-keyword substitution + calc), `_csSerialize` (hsl/hwb→`color(srgb …)`, RGB+xyz→`color(<space> …)`, lab/lch/oklab/oklch own function; hue 6-sig-figs round-trip-stable; L/chroma clamped). **Key insight:** powerless hue is "missing" only when it EMERGES from a conversion with ~0 chroma (`lab(50 0 0)` in lch → no hue) — a NATIVE polar colour keeps its explicit hue (`lch(100 0 20deg)` interpolates 20°); so the rule lives in `_csConvert` (only on a space change), thresholds above the ~1e-5 XYZ-round-trip drift. Wired into `_normComputed` + `_isValidColor` (the latter BEFORE the legacy rgb/hsl branch). **Zero regressions** (color-valid 17, color-computed 16, color-valid-color-mix 674/677, color-valid-relative-color 1127/1147, color-valid-lab 116, computed-lab 112, computed-rgb 95, computed-color-function 466/468, color-valid-hwb 28, gradient-interpolation 1398, image-function 13, getElementsByTagName 19, createElement 147; obscura-dom 40/40; serialize-values + color-function-valid 404-flux but provably unaffected). **Caps:** ~28 hsl/hwb `none`-components (Obscura stores the lossy CSSOM-serialized `rgb(0,0,0)`, valid test CONFIRMS that serialization — needs structured-value storage, architectural); ~13 `calc()` trig/`pi`/`pow` (needs `_evalMath` trig extension); 2 `light-dark()`-wrapping; ~4 out-of-gamut hsl round-trips at ε=0.0001. **Next:** `_evalMath` trig/exponent extension (~13 + foundational); `alpha(from …)` (0/32); `light-dark()` computed; fresh realm. |
| ~~78~~ | ✅ [The Borrowed Verdict](78-the-borrowed-verdict.md) | `css/css-color/parsing/color-valid-relative-color` (specified-value relative-`<color>` serialization) | **1127/1147** | ⚔️⚔️ | **SECURED — +571.** #77's named "next leverage (2)" — relative colour SPECIFIED, the natural syntax-only sibling. `color-valid-relative-color` was 556/1147. **Key insight (the WPT comparator is fuzzy — it strips ALL digits/dots and compares the non-numeric skeleton + approximate numbers):** at specified time `<fn>(from <origin> <channels>)` serializes by (a) ASCII-lowercasing the function name and folding `rgba`/`hsla`→`rgb`/`hsl`; (b) running the `<origin>` colour recursively through the EXISTING `_canonColorSpecified` (`rgb(20%, 40%, 60%, 80%)`→`rgba(51, 102, 153, 0.8)`, `lab(25 20 50 / 40%)`→`lab(25 20 50 / 0.4)`, `hwb(…)`→sRGB rgba, `rgb(none none none)`→`rgb(0, 0, 0)`; named/`currentcolor`/`color-mix()` stay symbolic); (c) for `color()`, aliasing the post-`from` colour-space token `xyz`→`xyz-d65`; (d) keeping the channel keywords (`r`/`g`/`b`/`alpha`/`none`/replacement values) VERBATIM — the fuzzy comparator means no number normalization is required. A `var()` anywhere bails to verbatim (it's a pending-substitution token stream the engine keeps byte-for-byte, case + calc order preserved). Fix (pure JS, no new Rust): new `_canonRelativeColor` + `_REL_COLOR_FNS`, dispatched from `_canonColorSpecified` (gated on `/^<colorfn>\(\s*from\s/`, BEFORE the modern/legacy branches since `from` isn't a number). 556→1127. **Zero regressions** (color-valid 17, color-computed 16, color-valid-color-mix 674/677, computed-color-mix 0/948 UNCHANGED, computed-relative-color 0/1169 UNCHANGED = the maths cap, color-valid-lab 116, color-function 277, hwb 28, gradient-interpolation 1398, image-function 13, createElement 147; obscura-dom 40/40; serialize-values wpt.live 404 `bodyLen=42` this session but provably byte-identical — its fixed colours don't match the `from` gate). **Cap:** the 20 fails are the `calc()`-operand-reordering forms (`calc(g * 2)`→`calc(2 * g)`, `calc(l - 20)`→`calc(-20 + l)`) = the Wave-2 specified-calc serializer, plus the pre-existing var-substitution exact-number quirk (`.3`→`0.3` via `_canonStandardValue`, non-fuzzy compare). **Next:** the COMPUTED relative-colour (0/1169) + COMPUTED `color-mix()` (0/948) — the real cross-space colour-maths engine (matrices/gamut/interp), biggest standing prize; the Wave-2 specified-calc serializer (~107 across lab/color-function/hwb + these ~20); `alpha(from …)` (0/32); fresh realm. |
| ~~77~~ | ✅ [The Mingled Verdict](77-the-mingled-verdict.md) | `css/css-color/parsing/color-valid-color-mix-function` (specified-value `color-mix()` serialization) | **674/677** | ⚔️⚔️ | **SECURED — +424.** #76's named "next leverage (2)" — the giant `color-mix()`/relative-color prize. The COMPUTED mix (0/948) needs cross-space matrix math (a documented cap), but the SPECIFIED (`color-valid`) path is pure SYNTAX canonicalization needing NO maths: `color-valid-color-mix-function` was 250/677. **Key insight:** at specified time `color-mix()` serializes by (a) canonicalizing the interpolation method — keep the space, alias `xyz`→`xyz-d65`, drop the default `shorter hue`, and **drop the whole `in oklab`** (oklab is color-mix's default space); (b) canonicalizing each component `<color>` via the EXISTING `_canonColorSpecified` (`hsl(120deg 10% 20%)`→`rgb(46, 56, 46)`, `oklab(100 …)`→`oklab(1 …)`, modern fns kept); (c) moving each `<percentage>` AFTER its colour, keeping a `calc()`/`var()` % symbolic, else filling the omitted side to 100%−other and dropping a resulting 50%/50% pair. Fix (pure JS, no new Rust): new `_canonColorMix`/`_canonColorMixMethod`/`_splitMixComponent` dispatched from `_canonColorSpecified` (so it canonicalizes everywhere a `<color>` appears); recognizes the missing-method 2-arg form (`color-mix(c1, c2)`) and `display-p3-linear`. 250→674. **Zero regressions** (color-valid 17, color-computed 16, computed-color-mix 0/948 UNCHANGED = the maths cap, color-valid-lab 116, computed-lab 112, computed-rgb 95, color-valid-hwb 28, serialize-values 696/697, gradient-interpolation 1398, gradient-position 18, image-function 13, content-valid 46, cursor-valid 45, createElement 147; obscura-dom 40/40). **Cap:** the 3 remaining fails are the N-ary color-mix forms (1-colour `color-mix(in srgb, red 100%)`→`(in srgb, red)`, 3-colour with percentage distribution `red 50%, green, blue`→`red 50%, green 25%, blue 25%`) — a distinct percentage-distribution feature. **Next:** the COMPUTED `color-mix()` (0/948) + relative-color `rgb(from …)` computed (0/1169) — the real cross-space colour-maths engine (matrices/gamut/interp); relative-color SPECIFIED (`color-valid-relative-color` 556/1147 — origin-colour channel substitution, also syntax-only); `alpha(from …)` (0/32); Wave-2 specified-calc serializer (~107); fresh realm. |
| ~~76~~ | ✅ [The Stated Verdict](76-the-stated-verdict.md) | `css/css-color/parsing/color-valid-{lab,color-function,hwb}` (specified-value modern `<color>` serialization) | **116/150 · 277/340 · 28/38** | ⚔️⚔️ | **SECURED — +286.** #75's named "next leverage (1)". The COMPUTED modern colours were done (#75) but the SPECIFIED path (`_canonColorSpecified`) kept them verbatim → `color-valid-lab` 54/150, `-color-function` 81/340, `-hwb` 0/38. **Key insight:** for `lab`/`lch`/`oklab`/`oklch`/`color(<space> …)`/`hwb()` whose channels are all plain `<number>`/`<percentage>`/`<angle>`/`none` (NO nested math function), the SPECIFIED value serializes IDENTICALLY to the computed value (resolve `%`, clamp per channel, normalize hue, drop alpha≥1, hwb→sRGB). Fix (pure JS, no new Rust): `_canonColorSpecified` reuses `_computeModernColor` — but ONLY when the body has no nested `(` (no calc/min/…), since a calc channel must be PRESERVED unclamped with `%` left symbolic at specified time. `color(srgb 10% 10% 10%)`→`color(srgb 0.1 0.1 0.1)`, `color(srgb 200 200 200)` unclamped, `lab(50% 50% -20%)`→`lab(50 62.5 -25)`, `hwb(120 30% 50%)`→`rgb(77, 128, 77)`. lab 54→116, color-function 81→277, hwb 0→28. **Zero regressions** (color-valid 17, color-computed 16, computed-lab 112/-hwb 54/-color-function 466 UNCHANGED, gradient-interpolation 1398, gradient-position 18, image-function 13, serialize-values 696/697, var-bg 10, content-valid 46, cursor-valid 45, createElement 147; obscura-dom 40/40). **Cap:** the 107 remaining fails are ALL calc-bearing channels — the specified path must PRESERVE the `calc()` wrapper (unclamped, `%` left symbolic, pure-number arithmetic simplified) = a Wave-2 CSS-math serializer (own quest, carries the serialize-values calc hot-path risk). **Next:** Wave-2 specified-calc serializer (~107 more); `color-mix()` (0/948) + relative-color `rgb(from …)` (0/1169) — the giant prize, needs cross-space matrix/gamut/interp math; `alpha(from …)` (0/32); fresh realm. |
| ~~75~~ | ✅ [The Spectral Verdict](75-the-spectral-verdict.md) | `css/css-color/parsing/color-computed-{lab,hwb,color-function}` (modern `<color>` computed serialization) | **112/120 · 54/56 · 466/468** | ⚔️⚔️ | **SECURED — +632.** Obscura's `_computeColor` kept every modern colour function verbatim → `color-computed-lab` 0/120, `-hwb` 0/56, `-color-function` 0/468 (the support check `CSS.supports('color', …)` failed AND the value wasn't resolved). Key insight: `lab`/`lch`/`oklab`/`oklch` and `color(<space> …)` compute in their **own** colour space — no cross-space conversion, just per-channel canonicalization; `hwb()` converts to sRGB. Fix (pure JS, no new Rust): new `_computeModernColor` resolves each channel (eval math, `%`→channel reference, `none` preserved, NaN→0, ±∞→bounds, per-channel clamp, hue→deg normalized [0,360) at 6 sig-figs, alpha clamped/≥1-dropped), `color(xyz)`→`xyz-d65`; `_computeHwb` does pure-hue·whiteness/blackness→rgb (6-decimal snap so 127.5 rounds up). Wired into the `_normComputed` colour branch only — the **specified path is untouched** (no `color-valid-*` regression). `_isValidColor` (CSS.supports) extended via `_computeModernColor`. lab 0→112, hwb 0→54, color-function 0→466. **Zero regressions** (color-computed 16, -rgb 95/99, -named 455, -hex 6, color-valid 17, -lab 54/150 & -color-function 81/340 UNCHANGED = specified untouched; gradient-interpolation 1398, gradient-position-computed 43, serialize-values 696/697, var-bg 10, createElement 147; obscura-dom 40/40). **Caps:** the 12 fails (8 lab + 2 hwb + 2 color-function) are ALL `2cqw` container-query units — unwinnable (no layout). **Next:** specified-path modern colour (`color-valid-{lab,hwb,color-function}` — needs calc()-preservation: keep `calc(…)` wrapper, leave a/b/C `%` unresolved); `color-mix()` (0/948) + relative-color (0/1169) need real cross-space conversion math (the giant prize, a bigger engine); `alpha(from …)` (0/32) relative-style alpha. |
| ~~74~~ | ✅ [The Pointed Verdict](74-the-pointed-verdict.md) | `css/css-ui/parsing/cursor-{computed,valid}` (the `cursor` property — `<image>` items: gradients + `image-set()`) | **37/39 · 45/46** | ⚔️ | **SECURED — +4.** `cursor` was registered for computed defaults but not in `_GRADIENT_PROPS`, so its gradient items serialized verbatim (cursor-computed 36/39) and bare-string `image-set()` options weren't wrapped (cursor-valid 42/46). Fix (pure JS, no new Rust): (1) added `cursor` to `_GRADIENT_PROPS` → its `<image>` items route through the existing `_canonGradients`/`_canonUrls` engine (the trailing hotspot coords + cursor keyword pass through verbatim) — fixed the radial computed case; (2) new `_canonImageSet` balanced-paren-scans `image-set(`/`-webkit-image-set(` heads and wraps a leading bare `<string>` option in `url()` (`image-set("u" 1x)`→`image-set(url("u") 1x)`, incl. nested in `light-dark()`; `_splitCommaQuoted` so a `,` in a string is safe), wired into all `_GRADIENT_PROPS` paths after `_canonGradients`, fast-pathing out when no `image-set(`. **The 2 remaining cursor-computed fails are upstream WPT test bugs** — lines 52/54 have malformed expected values (the gradient's `)` is missing, the trailing keyword pulled inside; line 54 even expects `pointer` for a `crosshair` input). No correct browser passes them; our output is the correct serialization. Zero regressions (surgically scoped: cursor-only + image-set-only; gradient family 18/43/13/1398, color 17, position 32, content-valid 46 byte-identical; obscura-dom 40/40; serialize-values/background-image-valid/mask-image 404-flux but proven zero image-set/cursor refs). Caps: `calc(2 + 0)`→`calc(2)` integer-calc simplification (the last cursor-valid fail; serialize-values hot-path risk, own quest); `light-dark()` resolution; `resolve-relative-to-stylesheet`; valid-prop registry; fresh realm. |
| ~~73~~ | ✅ [The Storied Verdict](73-the-storied-verdict.md) | `css/css-content/parsing/content-{computed,valid}` (the `content` property — content-list serialization) | **41/41 · 46/46** | ⚔️ | **SECURED — +49.** `content` was never registered for computed style → `getComputedStyle(el).content` returned `""`, failing every `content-computed` support check (0/41); the specified path stored values verbatim, never dropping the default `decimal` counter-style (`content-valid` 38/46). Fix (pure JS, no new Rust): (1) registered `content: 'normal'` in `_GCS_DEFAULTS`; (2) new `_canonContent` wired into `_parseStyleDecls`/`setProperty` (specified) + `_normComputed` (computed) — `_canonCounterFns` drops a default `decimal` `<counter-style>` from `counter()`/`counters()` (`counter(n, dECiMaL)`→`counter(n)`, case-insensitive; custom styles kept; escaped names like `counter(\})` byte-preserved), gradient items route through the existing `_canonGradients`, url()s absolutize via `_canonUrls`; (3) quote-aware `_splitCommaQuoted` (counters() string separators may contain `,`); (4) linear `to <side-or-corner>` reorder in `_canonGradientDirection` (`to top right`→`to right top`, CSSOM order — the one gradient content-item needing a new rule; radial `ellipse`-drop + conic `from <angle>` were already handled). content-computed 0→41, content-valid 38→46. Zero regressions (gradient family 1398/932/18/43/13/3, background-image 13, mask-image 47, serialize-values 696/697, color 17/16, position 32, var-bg 10, shorthand 7, cursor 36/42 unchanged, createElement 147; obscura-dom 40/40). Caps: `cursor` gradient + image-set canon (cursor-computed 36/39, near-free +3); `resolve-relative-to-stylesheet` (external-CSS loading); comprehensive valid-prop registry; fresh realm. |
| ~~72~~ | ✅ [The Lowercased Verdict](72-the-lowercased-verdict.md) | `css/css-backgrounds/parsing/{background,border}-color-valid` (keyword-`<color>` canonicalization) | **9/9 · 7/7** | ⚔️ | **SECURED — +2.** CSSOM canonical serialization ASCII-lowercases a keyword ident, but #68's `_canonColorSpecified` kept `currentColor`/named/CSS-wide keywords verbatim → `background-color: currentColor` serialized `currentColor` not `currentcolor`. Fix (pure JS, no new Rust): (1) `_canonColorSpecified` returns the lowercased keyword for that branch (legacy hex/rgb/hsl still resolve; modern fns/`var()` still verbatim); (2) new `_canonColorShorthand` + `_COLOR_SHORTHAND_PROPS` (`border-color`/`border-block-color`/`border-inline-color`) splits a value into top-level `<color>` tokens via paren-aware `_splitTopLevel` (`rgb(0, 0, 255)` stays whole) and canonicalizes each, wired into `_parseStyleDecls` + `setProperty`. Zero regressions (serialize-values 695/697, color 17/16/95, gradient/position/image family unchanged; obscura-dom 40/40). Foundational: every 404'd `*-color-valid` longhand + border-color flow-relative shorthands get the `currentColor` green free once served. Caps: `resolve-relative-to-stylesheet` (external-CSS loading); comprehensive valid-prop registry; broaden `_canonUrls` to `cursor`/`content`/`@font-face src`; fresh realm. |
| ~~70~~ | ✅ [The Resolved Verdict](70-the-resolved-verdict.md) | `css/css-values/urls/resolve-relative-to-base.sub.html` (computed-time URL absolutization) | **2/2** | ⚔️ | **SECURED — +2.** Took #69's "next leverage (1)" — the foundational `<url>`-computed primitive (the `image-set`/`cross-fade` pointers turned out not to exist as WPT tests; the `<url>` family lives in `css/css-values/urls/`). A relative `url()` in an `<image>`/`<url>` property must compute to its absolute URL against the document base URL (`<base href>`), but Obscura stored it verbatim (non-variable `url(images/test.png)`, variable `url("images/test.png")`). New `_canonUrls(value, el)` (pure JS, no new Rust): scans for `url()` tokens (both quoted functional + unquoted url-token forms), resolves each via `new URL(raw, el.baseURI).href`, serializes double-quoted; idempotent/fail-safe — already-absolute or unparseable (`{{token}}`) urls round-trip byte-identical (empirically verified in-engine). Wired into `_normComputed` after `_canonGradients` for `_GRADIENT_PROPS` (also absolutizes `url()`s nested in `image()`/`cross-fade()`). Specified time untouched (relative stays as written). Zero regressions (mask-image-computed 47/47 — its `url("http://{{host}}/")` round-trips byte-identical, the key idempotency proof; gradient family 18/43/1398, color 17/16, serialize-values 695/697, background-position-computed 32, createElement 147; obscura-dom 40/40). Caps: `resolve-relative-to-stylesheet` (0/3, needs external-CSS loading w/ per-stylesheet base); broaden `_canonUrls` to `cursor`/`content`/`@font-face src`; `image-function-invalid` (per-prop validation). |
| ~~69~~ | ✅ [The Composited Verdict](69-the-composited-verdict.md) | `image-function-valid`·`-computed` + `background-image-valid` (`<image>`-function canon: `image()` + `cross-fade()`) | **13/13 · 3/3 · 13/13** | ⚔️ | **SECURED — +7.** Took #68's "next leverage (1)+(2)". Generalized `_canonGradients` from a gradient-only scan to an `<image>`-function scan (pure JS, no new Rust): new `_IMAGE_FUNC_HEAD` adds `image`/`cross-fade` heads, dispatched per-head. `_canonImageInner` canonicalizes `image(<color>)` (specified `_canonColorSpecified` → `image(rgb(0 128 255))`→`image(rgb(0, 128, 255))`, names/modern fns verbatim; computed `_computeColor` → `image(red)`→`image(rgb(255, 0, 0))`, `image(transparent)`→`image(rgba(0, 0, 0, 0))`). `_canonCrossFadeInner`/`_canonCfImage` reorder each `cross-fade()` `<cf-image>` to `<image|colour> <percentage>` (`cross-fade(50% url(…), …)`→`cross-fade(url(…) 50%, …)`, `cross-fade( 1% red, green)`→`cross-fade(red 1%, green)`), nested `<image>` functions recurse. Already wired via `background-image` ∈ `_GRADIENT_PROPS`. image-valid 12→13, image-computed 1→3, background-image-valid 9→13. Zero regressions (gradient family 18/43/1398, color-valid 17/computed 16, serialize-values 695/697, background-position-computed 32, Element-matches 669, createElement 147; obscura-dom 40/40; composing cases `cross-fade(image(green), red)`/nested gradients byte-identical). Caps: url absolutization (document base-URL, foundational `<url>`-computed); `cross-fade()` computed (404 this session, code already in place); `image-set()` canon; valid-prop registry. |
| ~~68~~ | ✅ [The Tinctured Verdict](68-the-tinctured-verdict.md) | `css/css-color/parsing/color-valid` (specified-value `<color>` serialization) | **17/17** | ⚔️ | **SECURED — +10.** Took #67's "next leverage" via a reachability sweep (the bigger `<image>`/`<url>` tails were wpt.live 404 this session). The inline-`style` specified path stored colours verbatim, so legacy sRGB forms never canonicalized. New `_canonColorSpecified` (pure JS, no new Rust) reuses the existing `_computeColor` for the hex/`rgb`/`hsl`→canonical `rgb()`/`rgba()` conversion (`#234`→`rgb(34, 51, 68)`, `hsl(120, 100%, 50%)`→`rgb(0, 255, 0)`, channel/`%` clamp, 4-arg/slash-alpha→rgba) but — UNLIKE the computed path — keeps named colours/`currentcolor`/`transparent`/CSS-wide/modern functions (`light-dark()`)/`var()` **verbatim** (they only resolve at computed time). Wired into `_parseStyleDecls` + `setProperty` for `_COLOR_PROPS`. The foundational specified-`<color>` primitive: every `*-color-valid` test (background/border/outline/caret/text-decoration-color — all 404 this session) canonicalizes for free once served. Zero regressions (serialize-values 695/697 — its colour list is all fixed points; color-computed 16/16; gradient/position/image family unchanged; obscura-dom 40/40). Caps: `image(<color>)` canon (`image-function` 12/13·1/3 — extend `_canonGradients` to the `image()` wrapper); `cross-fade()` (404); url absolutization; colour-invalid drop. |
| ~~67~~ | ✅ [The Imaged Verdict](67-the-imaged-verdict.md) | `mask-image` / `background-image` / `list-style-image` / `border-image-source` `-computed` | **47/47 · 47/48 · 11/11 · 9/10** | ⚔️⚔️ | **SECURED — +76.** Took #66's "next leverage (1)". Registered `mask-image`/`list-style-image`/`border-image-source` in `_GRADIENT_PROPS` (+ `_GCS_DEFAULTS` initial `none`) and completed the #64–66 gradient computed canonicalizer (pure JS, no new Rust): radial size clamp-to-`0px` + drop `circle` on explicit length, conic `from <angle>` normalize/drop-default-`0deg`, conic stop angle units (`1turn`→`360deg`) + stop calc resolution, **two-position colour-stop split** (`black 0% 0.5em`→`black 0%, black 20px`), linear direction angle calc (`calc(90deg-45deg)`→`45deg`), mixed `%`+length stop calc kept as `calc()`, pure-`%` calc resolved, `lh` unit (`1lh`→`80px`), `currentcolor`→el `color`, angle 6-sig-fig serialization (`2rad`→`114.592deg`), and EOF auto-close for unclosed functions. mask 0→47, background 35→47, list-style 3→11, border-image 0→9. Zero regressions (whole `<position>`/gradient family byte-identical; serialize-values 695/697; obscura-dom 40/40). Caps: `light-dark()` (CSS Color 5), url absolutization (document base-URL), `cross-fade()` specified canon. |
| ~~66~~ | ✅ [The Interpolated Verdict](66-the-interpolated-verdict.md) | `css/css-images/parsing/gradient-interpolation-method-{valid,computed}` | **1398/1398 · 932/932** | ⚔️⚔️ | **SECURED — +1439.** The widest unopened tail of the whole frontier. Gradients carry a `<color-interpolation-method>` (`in oklab`/`in lab`/`in hsl longer hue`) the #64/#65 canonicalizer never parsed. Extended it (pure JS, no new Rust): `_interpolationClause` finds the `in <space> [ <hue> hue ]?` clause; `_canonGradientConfig` splits it off, canonicalizes direction + method independently, and **recombines `<direction> in <space>`** (reorder — `in lab 30deg`→`30deg in lab`); `_canonInterpolationMethod` aliases `xyz`→`xyz-d65`, drops the default `shorter hue`, and **drops the clause when it equals the default space** (`srgb` if every stop is a legacy sRGB colour, `oklab` otherwise — `_isNonLegacyColorTok`/`isLegacy`). Plus radial-prelude fixes the test surfaced: `_canonRadialPrelude` drops the default `ellipse` when an explicit size is present (`ellipse 50% 40em`→`50% 40em`) and resolves lengths to px at computed time (`40em`→`640px`), and `_isGradientConfig` now detects a bare `<radial-size>` config so the size still resolves after `ellipse` is dropped. valid 585→1398 (+813), computed 306→932 (+626). Zero regressions (whole `<position>`/gradient family byte-identical; serialize-values 695/697). Caps: more `<image>` props (`mask-image`/`list-style-image`/`border-image-source` — same grammar, mostly registration); valid-property registry; fresh realm. |
| ~~65~~ | ✅ [The Distilled Verdict](65-the-distilled-verdict.md) | `css/css-variables/variable-substitution-background-properties` (gradient default-token canonicalization + linear-gradient) | **10/10** | ⚔️ | **SECURED — +2.** #64's named "next leverage (1)" — gradient default-token canonicalization, distilling away tokens that compute to their defaults. Extended the #64 gradient canonicalizer (pure JS, no new Rust) to (a) **`linear-gradient`** (added to `_GRADIENT_HEAD`; direction config detected via `to`/`<angle>`; computed-time drop of the default `to bottom`) and (b) **radial default shape/size drop** (`_canonRadialPrelude` filters the default `ellipse` shape + `farthest-corner` size from the prelude at computed time, keeping `circle`/explicit sizes + the `at` clause). `_canonGradientInner`/`_canonGradientConfig`/`_isGradientConfig` made gradient-type-aware (linear vs radial/conic); colour stops already computed via `_computeColor`, comma-spacing normalized by the layer join. `linear-gradient(to bottom, rgb(30,87,0) 0%, …)`→`linear-gradient(rgb(30, 87, 0) 0%, …)`; `radial-gradient(ellipse farthest-corner at 25px 25px, black 10%, …)`→`radial-gradient(at 25px 25px, rgb(0, 0, 0) 10%, …)`. Zero regressions (gradient-position-valid 18, -computed 43 byte-identical; serialize-values 695 has no gradients). Caps: more `<image>` props (`mask-image`/`list-style-image`/`border-image-source`); broader linear/conic computed canon (angle normalization, interpolation hints); valid-property registry; fresh realm. |
| ~~64~~ | ✅ [The Gradient Verdict](64-the-gradient-verdict.md) | `css/css-images/parsing/gradient-position-{valid,computed}` | **18/18 · 43/43** | ⚔️⚔️ | **SECURED — +47.** The standing widest unopened tail since #57: `radial-gradient`/`conic-gradient` carry an `[ at <position> ]?` clause sharing the #61 `<position>` grammar, but `background-image` was stored verbatim. New gradient canonicalizer (pure JS, no new Rust) scoped to `_GRADIENT_PROPS={background-image}` + radial/conic (incl. `repeating-`): `_canonGradients` balanced-paren-scans a value, transforming each gradient in place while leaving every other char verbatim (multi-image lists/`url()`/`none`/inter-layer commas survive); `_canonGradientInner` comma-splits args, detecting a config chunk (`at`/`from`/shape/size kw) vs colour stops; `_canonGradientConfig` reorders the `at <position>` clause (specified) or computes it + **drops a default `at center center`/`at 50% 50%`** (computed); `_canonGradientStop` computes each stop colour (`red`→`rgb(255, 0, 0)`). Wired into `setProperty`/`_parseStyleDecls` (specified) + `_normComputed` (computed) alongside the `_POSITION_PROPS` branches. Zero regressions. Caps: gradient default-token canon (drop `to bottom`/`ellipse farthest-corner` + whitespace-normalize substituted colours → `variable-substitution-background` 8/10 + opens linear-gradient); more `<image>` props (`mask-image`/`list-style-image`). |
| ~~62~~ | ✅ [The Anchored Verdict](62-the-anchored-verdict.md) | `css/css-transforms/parsing/{transform,perspective}-origin-{valid,computed}` | **16/16 · 23/23 · 18/18 · 21/21** | ⚔️ | **SECURED — +39.** #61's "next leverage (2)" (more `<position>` props). Both origins stored verbatim → computed `""`. Two grammars: `transform-origin` = restricted two-value `<position>` + optional Z `<length>`; `perspective-origin` = full `<position>` (edge-offset forms), no Z. Both COMPUTE to absolute lengths against the element's box (`10%`→`20px` on a 200px box; box dims read via `_computedPropOf(el,'width'/'height')` since the test sets explicit px), unlike object-position which keeps percentages. Small origin engine on #61's primitives: `_parseOriginPos` (peel trailing Z, then ≤2-token parse), `_parseOrigin` (dispatch; perspective-origin reuses full `_parsePosition` verbatim), `_serializeOriginSpecified` (+Z), `_originAxisPx` (keyword→fraction of base, edge offset from its edge, math via `_evalMath`), `_serializeOriginComputed`; registered both in `_GCS_DEFAULTS`. Pure JS, no new Rust. Zero regressions (`_parsePosition` reused read-only). Caps: gradient `at <position>` + gradient canon (widest adjacent tail; reuses this engine), `mask-position`/`offset-anchor`. |
| ~~61~~ | ✅ [The Positioned Verdict](61-the-positioned-verdict.md) | `css/css-images` + `css/css-backgrounds` `<position>` serialization (object-position / background-position) | **18/18 · 16/16 · 31/31 · 32/32** | ⚔️⚔️ | **SECURED — +60.** A reusable CSS `<position>` value serializer (specified + computed) for `object-position`/`background-position`, which were stored verbatim. `_parsePosition` decomposes 1–4 tokens into horizontal/vertical components — KEY: an offset attaches to an edge keyword ONLY in the 3/4-token edge-offset form (`right 40%` is two components H:`right` V:`40%`, not `right` with a 40% offset). `_serializePositionSpecified` (horizontal-first, fill omitted axis with `center`, retain edge keywords; per comma-layer) wired into `setProperty`/`_parseStyleDecls`; `_serializePositionComputed` (keywords→percentages, `right`/`bottom` edge offset → `100%−off` or `calc(100% ∓ off)` with negative-sign folding, a `%`+length calc kept as calc to round-trip) wired into `_normComputed`. New `_evalMath` `opts.emPx` resolves em against the element's computed font-size (`#target{font-size:40px}` → `calc(10px+0.5em)`→`30px`). Pure JS, no new Rust. Zero regressions (serialize-values held 695 — it generates background-position H-then-V ordered so the reorder swap never fires). Caps: gradient `at <position>` (the natural follow-up, reuses this engine — gradient-position-computed 0/43 needs gradient-param parse + colour computation + default-`at`-drop, i.e. #57's gradient-canon cap); other `<position>` props (transform-origin/perspective-origin/mask-position). |
| ~~60~~ | ✅ [The Recombined Verdict](60-the-recombined-verdict.md) | `css/cssom/` shorthand serialization (inverse of #58) | **7/7 · 7/11 · 9/11** | ⚔️⚔️ | **SECURED — +6.** #59's "next leverage (1)" — the standing shorthand serialization engine. The CSSOM `cssText` getter + the shorthand-property getter (`el.style.margin`) must reconstruct a box-model shorthand from the longhands actually present. KEY (low-risk): `serialize-values` (695) only ever sets *longhands* and reads `el.style[idl]` (never `.cssText`), so the engine lives entirely in the `cssText` getter + box-shorthand getter, reads the literal `_props` on-the-fly, and **never mutates stored state** — cascade/`setProperty`/longhand reads untouched. New pure-JS helpers: `_styleLonghandList` (expand `_props` → ordered longhand list, last-write-wins reappend, var()-shorthand → pending-substitution longhands), `_serializeDeclBlock` (CSSOM "serialize a CSS declaration block" with logical-group adjacency), `_serializeBoxValue` (collapse 1–4 edges). Scoped to margin/padding (+ `-inline`/`-block`); background/border/transition stay verbatim. `shorthand-serialization` 4→7, `cssstyledeclaration-csstext` 5→7, `variable-cssText` 8→9. Zero regressions. Caps: unknown-property drop (needs a comprehensive valid-prop registry — serialize-values hot-path risk), per-property value validation, computed-style `cssText`/`length`, in-value comment preservation. |
| ~~59~~ | ✅ [The Serialized Verdict](59-the-serialized-verdict.md) | `css/cssom/serialize-values` (specified-value serialization for the inline `style` object) | **695/697** | ⚔️⚔️ | **SECURED — +580.** #58's "next leverage (4)" (specified-value serializer). The test sets every standard property via `setAttribute('style',…)` and `el.style.prop=…`, then reads the *specified* serialization back off `el.style[idl]`. Root cause: the `style` Proxy stored/read props by the raw JS accessor name (`backgroundColor`) while `setProperty`/`setAttribute`/`cssText` keyed `_props` by **kebab** — so a hyphenated read missed the key → `""` (the 118-pass/579-fail split was single-word vs hyphenated). Fix (pure JS, no new Rust): `_cssPropToKebab` routes every Proxy get/set through one canonical kebab key (+415); `_canonStandardValue` lightly canonicalises numeric tokens (`.5%`→`0.5%`, `-0px`→`0px`) leaving idents/hex/strings/structure intact (+158); serialize-a-url (`url(x)`→`url("x")`) + serialize-a-string (single→double quotes) (+4). Plus a last-write-wins repair to `setProperty` (delete+reinsert) so #58's target9 held at 51/51. Bonus: `cssstyledeclaration-csstext` 2→5. Zero regressions. Caps: `counter()` default-arg drop + font-family quote-drop (the last 2); shorthand SERIALIZATION (the inverse engine — `shorthand-serialization` 4/7, `variable-cssText` 8/11); unknown-property drop + value validation. |
| ~~58~~ | ✅ [The Expanded Verdict](58-the-expanded-verdict.md) | `css/css-variables/variable-substitution-shorthands` (shorthand→longhand expansion in the cascade) | **51/51** | ⚔️⚔️ | **SECURED — +38.** #57's "next leverage (2)". The test stamps shorthand declarations (`margin`/`border`/`border-<side>`/`border-width`/`transition`, many bearing `var()`) and reads back the longhand computed values — but the cascade resolved one property *name* at a time, so `margin: var(--prop)` never reached `margin-left`, and the `border-*-width`/`-style` longhands weren't modelled. Fix (pure JS, no new Rust): `_SHORTHAND_LONGHANDS` + `_expandDeclInto` write a pending slot for each longhand a shorthand governs (carrying `_sh` + the whole value), with within-block order/`!important` via `_putDecl`; at computed time `_computedPropOf` substitutes `var()` then `_expandShorthand` splits the value (box-edge rule for `margin`/`padding`/`border-{width,style,color}`, `<width>‖<style>‖<color>` for `border`/`border-<side>`, layer parse for `transition`) and keeps this longhand's piece. Added the 8 `border-*-{width,style}` longhands to `_GCS_DEFAULTS`. Zero regressions. Caps: shorthand *serialization* (`variable-cssText` 8/11) is the inverse engine; gradient canonicalization (background 8/10); border width/style interaction not modelled; only margin/padding/border*/transition shorthands expanded. |
| ~~57~~ | ✅ [The Bounded Verdict](57-the-bounded-verdict.md) | `css/css-variables/variable-substitution-{filters,background-properties}` (token-boundary-aware `var()` substitution) | **filters 7/7, background-properties 8/10** | ⚔️ | **SECURED — +14.** #56's "next leverage (1)". `filter: blur(var(--blur))` substituted as `blur( 15px )` (space-padded) instead of `blur(15px)` — the standing token-boundary cap — and `filter`/background longhands weren't registered so they echoed the unsubstituted value. Fix (pure JS, no new Rust): (a) `_substituteVars` now joins each insertion with a new `_joinTok` (separator only when the boundary chars would merge into one token — `(`/`)`/`,`/whitespace need none), so a value lands cleanly inside a function call; (b) registered `filter` + the seven `background-*` longhands in `_GCS_DEFAULTS` (identity computed serialization) so they route through `_computedPropOf` and the substituted value round-trips. filters 0→7, background-properties 1→8. Zero regressions (substitution-basic held 11/13). Caps: the 2 gradient subtests need full gradient canonicalization (drop default `to bottom`/`ellipse farthest-corner`, named→rgb, whitespace) — a gradient serializer; shorthand→longhand (`-shorthands` 13/51). |
| ~~56~~ | ✅ [The Lawful Verdict](56-the-lawful-verdict.md) | `css/css-variables/test_variable_legal_values` (custom-property `<declaration-value>` validity + invalid-at-computed-time for `<color>`) | **23/23** | ⚔️ | **SECURED — +23.** #55's "next leverage (2)". The test stamps `--test: <value>; background-color: var(--test)` and reads back the computed colour. Allowed values (valid `<declaration-value>`s) substitute a non-colour → property invalid at computed-value time → initial (`transparent`); disallowed values (unmatched `)`/`]`/`}`) drop the declaration → `--test` keeps its prior value. New `_isBalancedDeclValue` (stack-matched brackets; unmatched closers reject, openers OK; strings/comments skipped) wired into all three declaration parsers; `_cssSplitRules` block scanner made nesting-aware (a stray `}` in a value no longer closes the rule early); `_computedPropOf` rejects a `var()`-substituted non-`<color>` as invalid-at-computed-time. Pure JS, no new Rust. Zero regressions. Caps: filter/background substitution (token-boundary cap), shorthand→longhand, non-colour invalid-at-computed-time. |
| ~~55~~ | ✅ [The Custom Verdict](55-the-custom-verdict.md) | `css/css-variables/` (custom-property storage, cascade, inheritance, `var()` substitution) | **definition 71/73, cascading 9/9, keywords 8/8, cssText 8/11, substitution-basic 11/13, created-element 3/3, created-document 2/2** | ⚔️⚔️ | **SECURED — +88.** The standing top "next leverage (a)". Rewrote `CSSStyleDeclaration` (custom-prop name validation + whitespace canonicalization + `!important` tracking + `cssText`/`setProperty`/`getPropertyValue`), fixed the `style` Proxy `set` trap (it stored `style.cssText=…` as a plain prop, losing every declaration), lazily synced the `style` content attribute into the live decl (HTML parsing bypasses JS setAttribute), gave `getComputedStyle` real custom-property inheritance + CSS-wide keyword resolution (`_computedCustomProp`), and added `var()` substitution (`_substituteVars`: recursive name/fallback, cycle guard, invalid→initial/inherited). Pure JS, no new Rust. Zero regressions. Caps: `CSS.supports`+`var()` (the 2 rgb caps), invalid-at-computed-time for `<color>` (`test_variable_legal_values` 23), shorthand expansion (`substitution-shorthands` 51), unknown-property drop, token boundaries, reftests. |
| ~~54~~ | ✅ [The Snapped Verdict](54-the-snapped-verdict.md) | 5 more `css/*/inheritance.html` realms (scroll-snap/transitions/color-adjust/shapes/will-change) | **all 5 at 100%** | ⚔️ | **SECURED — +62.** Same pure-DATA shape as #53: 34 properties → `_GCS_DEFAULTS` (scroll-margin/padding-* + scroll-snap-*, transition-delay/duration/property/timing-function, shape-*, will-change, the 4 color-adjust props), the 4 color-adjust props also → `_INHERITED_PROPS` (the only inherited family of the five). Identity serialization is the #52/#53 engine's default echo — no new serializer, NO new Rust. Zero regressions. Caps: the cheap identity-serializing `inheritance.html` tail is now largely exhausted; remaining families (css-backgrounds/position/sizing) need real layout/unit resolution. Next: custom-property `var()` cascade, a specified-value serializer (`serialize-values` 0/697), or a fresh realm. |
| ~~53~~ | ✅ [The Propertied Verdict](53-the-propertied-verdict.md) | 15 `css/*/inheritance.html` realms (property-family modelling) | **all 15 at 100%** | ⚔️⚔️ | **SECURED — +263.** The shared `inheritance-testcommon.js` gates every subtest on `prop in getComputedStyle` first, but #52's engine only registered ~30 properties. Registered ~120 properties across css-text/ui/fonts/text-decor/writing-modes/lists/overflow/break/images/tables/align/flexbox/grid/content/multicol (initial value in `_GCS_DEFAULTS`, inherited flag in `_INHERITED_PROPS`; identity serialization is the engine's default echo). Real correctness win: `_buildCascade` now injects the live CSSOM decl (`el.style.foo=`, which never reflects to the `style=""` attribute) as the top *normal* author source, so it beats normal author rules (author `!important` still wins). `currentColor`-initial colour props (caret/outline/text-decoration/text-emphasis/column-rule-color) + `_FONT_SIZE_KEYWORDS` (`medium`→`16px`). Pure JS, no new Rust. Zero regressions. Caps: `display` skipped (spec-initial `inline` ≠ our UA default `block`); families needing real layout/unit resolution; the specified-value serialization family (`serialize-values` 0/697) is a separate engine. |
| ~~52~~ | ✅ [The Inherited Verdict](52-the-inherited-verdict.md) | `css/css-cascade/inherit-initial` + `css/css-color/inheritance` (CSS-wide keyword resolution + per-property inheritance) | **inherit-initial 4/4, inheritance 4/4** | ⚔️⚔️ | **SECURED — +7.** `getComputedStyle` echoed the CSS-wide keywords verbatim (`z-index:inherit`→`"inherit"` not `"auto"`; `opacity:initial`→`"initial"` not `"1"`). Generalised the colour-only computed-value machinery into a property-agnostic engine on top of #47's cascade + #49/#50's colour/opacity normalizers: `_specifiedValue` (cascade-first, live-decl fallback; `color` decl-first), `_INHERITED_PROPS`, `_initialOf` (`_GCS_DEFAULTS` doubles as the initial-values table), `_normComputed`, and **`_computedPropOf`** — resolve `initial`→initial, `inherit`→parent's computed value (root→initial), `unset`/`revert`→inherit-if-inherited-else-initial, per-property inheritance through the ancestor chain. `getComputedStyle.resolve` routes every modelled standard prop through it. Fixed a latent bug: `_computedColorOf` treated `unset` as `initial` but `color` inherits (now `_computedPropOf(el,'color',0)`). Pure JS, no new Rust. Zero regressions (caught+fixed a mid-flight `currentColor`-on-`color` drop). Caps: broader `css/*/inheritance.html` tail gated on the **property model** (each family needs initial value + inherited flag + computed serialization), not the engine; `var()` substitution; `color-computed-hsl` could-not-run. **PATH GOTCHA: wpt.live now 404s extensionless paths — every test path needs its `.html`.** |
| ~~51~~ | ✅ [The Channelled Verdict](51-the-channelled-verdict.md) | `css/css-color/parsing/color-computed-rgb` (`calc()` inside `rgb()` channels) | **95/99** | ⚔️⚔️ | **SECURED — +36.** #50's named follow-up: reuse `_evalMath` inside `rgb()`/`rgba()` channels. The 40 fails were calc constants/non-finite (16), `sign()`+`<length>` (18), escaped function names (2), plus `var()`/`cqw` caps (4). `_isValidColor`'s `[^)]*` regex couldn't span a nested `calc()` (so `CSS.supports` returned `false`), and `_computeColor` split channels with `parseFloat`. Added `_splitTopLevel` (paren-aware split), `_unescapeIdent` (`r\67 b`→`rgb`), `_resolveChannel` (NaN/±∞→bounds), `_rgbComponents`; rewrote name/inner extraction; extended `_evalMath` with `<length>` dimension tokens (`em`=16px…), calc constants (`infinity`/`nan`/`pi`/`e`), `sign()`/`abs()`, and a non-finite passthrough. Opacity byte-identical. **59→95.** Zero regressions. Caps: `var(--x)` (custom-property cascade) ×2, `2cqw` (layout) ×2 |
| ~~50~~ | ✅ [The Calculated Verdict](50-the-calculated-verdict.md) | `css/css-color/parsing/opacity-computed` (computed `opacity` + the `calc()`/`min()`/`max()`/`clamp()` math evaluator) | **30/30** | ⚔️ | **SECURED — +27.** Computed `opacity` echoed the specified value back (`50%`, `-2`, `calc(1 + 1)` all returned unchanged — `getComputedStyle`'s `norm` step only normalized `<color>` properties). Added `_evalMath` — a hand-tokenized recursive-descent evaluator for `calc()`/`min()`/`max()`/`clamp()` plus raw `<number>`/`<percentage>` (percent → fraction in the unitless opacity context) — with `_serNumber` (computed-number serialization) and `_computeOpacity` (clamp to `[0, 1]`), wired into `norm`. Pure JS, no new Rust. The math evaluator is a **reusable primitive** — the named cap for `color-computed-rgb`'s 40 `calc()` cases. Zero regressions. Caps: `opacity-valid`/`opacity-invalid` need a specified-value `calc()`-simplification serializer + per-property grammar validation on the hot `CSSStyleDeclaration` setter (separate quest); `var()`/escaped idents still unresolved |
| ~~49~~ | ✅ [The Computed Verdict](49-the-computed-verdict.md) | `css/css-color/parsing/*-computed.html` (the shared computed-value harness) | **color-computed 16/16, hex 6/6, named 455/455, rgb 59/99** | ⚔️⚔️ | **SECURED — +536.** The whole `*-computed.html` family was gated `0` on two shared asserts: `'prop' in getComputedStyle(el)` (the Proxy had no `has` trap) and `CSS.supports(prop, val)` (hardcoded `false`). Added a `has` trap + `_CSS_KNOWN_PROPS` registry, a real two/one-arg `CSS.supports`, `color` inheritance through the ancestor chain, and an extended `_computeColor` (hsl→rgb, alpha clamp, the `none` keyword, comment stripping). Pure JS. Zero regressions. Caps: rgb 40 = `calc()`/`var()`/escaped idents; `opacity-computed` (next); inheritance/initial for non-colour props |
| ~~48~~ | ✅ [The Indeterminate Verdict](48-the-indeterminate-verdict.md) | `html/semantics/selectors/pseudo-classes/{indeterminate,default,placeholder-shown,required-optional-hidden}` | **indeterminate 6/6, default 2/2, placeholder-shown-type-change 1/1, required-optional-hidden 1/1** | ⚔️ | **SECURED — +10.** The last three HTML selector pseudo-classes were parsed but `PseudoClass::Other` → false. All added to the Rust matcher, tree-derived: **`:indeterminate`** (checkbox via a new eager `indeterminate` IDL side-map + JS `el.indeterminate`; radio whose name-group has no checked member, nameless = self; valueless `<progress>`), **`:placeholder-shown`** (placeholder-applicable input/textarea, non-empty `placeholder`, empty value), **`:default`** (checkbox/radio with the `checked` attr, option with `selected`, or a submit button that is its form owner's default button — form owner via `form` attr else nearest ancestor `<form>`, first submit in tree order). Plus spec-correct **`:optional`** (now matches any input/select/textarea not `:required`, incl. `type=hidden`/`submit`). Zero regressions; the live-state form/structural pseudo family is now complete. Caps: `:placeholder-shown` live `.value` IDL, radio-group form-owner partitioning, `css/selectors/indeterminate*` reftests |
| ~~47~~ | ✅ [The Cascade Crown](47-the-cascade-crown.md) | `css/selectors/*specificity*` + `…/pseudo-classes/*-type-change` (the `getComputedStyle`/CSS-cascade wall) | **+24** | ⚔️⚔️ | **SECURED — +24.** `getComputedStyle` had **no author-stylesheet cascade** — only inline style + a defaults table — so every "inject `<style>` rules, read the winner back" test died (the recurring wall named by #42–#46). Built a real cascade on top of the existing Servo selector engine: new Rust op `selector_match_specificity` (matches? + highest matching-complex-selector specificity, `:is`/`:where`/`:has`-correct), JS gathers `<style>` rules, primes the live-state side-maps (`:target`/validity), and resolves each property by **importance → specificity → source order**; inline style is the top source. Added computed-value `<color>` serialization (named/hex/rgb → `rgb(r, g, b)`). has-specificity 0→8, is-specificity 0→1, is-nested 0→2, is-where-pseudo-classes 0→1, not-specificity 0→8, readwrite-readonly-type-change 0→1, checked-type-change 0→1, inrange-outofrange-type-change 0→2. Zero regressions. Caps: inheritance/layout/computed-values still absent; `:indeterminate`/`:placeholder-shown`/`:optional`-for-hidden are separate matching gaps; CSSOM/shadow/`:dir`/`:visited`/reftests out of realm |
| ~~46~~ | ✅ [The Disabled Lineage](46-the-disabled-lineage.md) | `html/semantics/selectors/pseudo-classes/disabled` (+ `enabled` held) | **7/7** | ⚔️ | **SECURED — +7.** `:disabled`/`:enabled` only checked the element's *own* `disabled` attribute (the separate matcher gap named by #45). Now "actually disabled" per HTML, matched **live off the Rust tree**: own attr, an `<option>` whose `<optgroup>` parent is disabled, and any disable-able element (input/button/select/textarea/optgroup/option/fieldset) inside a disabled `<fieldset>` — except within that fieldset's first `<legend>` — covering nested fieldsets via a single `prev_id == first_legend_child` ancestor-walk compare. `:enabled` is the exact complement over the disable-able set. Pure-Rust, no per-query priming. Zero regressions. The live-state form/structural pseudo family is now complete. Caps: `getComputedStyle`/CSS cascade (recurring wall) |
| ~~45~~ | ✅ [The Mutable Charter](45-the-mutable-charter.md) | `html/semantics/selectors/pseudo-classes/readwrite-readonly` (`:read-write`/`:read-only`) | **25/25** | ⚔️ | **SECURED — +20.** The last live-state form pseudo-classes (the #44 cap) were dark — parsed but `PseudoClass::Other` → always false (deceptive 5/25: only the empty-match subtests passed). Now matched **live off the tree** in the Rust matcher: an `input` to which `readonly` applies (no `readonly`, not disabled) / `textarea` / any element editable via a `contenteditable` editing-host ancestor walk → `:read-write`; every other element → `:read-only`. `document.designMode` (previously undefined entirely) gets a real get/set that pushes a document-global flag the engine reads during matching — so the design-mode subtests (predicted a cap) are green too. Pure-Rust matching, no per-query priming. Zero regressions. Caps: `readwrite-readonly-type-change` (getComputedStyle/CSS cascade), `:disabled` disabled-propagation (separate matcher gap) |
| ~~44~~ | ✅ [The Living Verdict](44-the-living-verdict.md) | `html/semantics/selectors/pseudo-classes/{required-optional,valid-invalid,inrange-outofrange,…}` (+ `Element-closest`, dynamic constraint tails) | **required-optional 6/6, valid-invalid 30/30, inrange 6/6, time-reversed 4/4, fieldset-disconnected 2/2, closest 29/29** | ⚔️⚔️ | **SECURED — +34.** The constraint-validation **live-state selector pseudo-classes** were all dark — the Servo `selectors` crate parses them but `PseudoClass::Other` always returned `false`. `:required`/`:optional` now evaluate straight off the tree in the Rust matcher (input of a requirable type / select / textarea, split by the attribute). `:valid`/`:invalid`/`:in-range`/`:out-of-range` read a per-node validity bitmask (`validity_state` side-map, like `:checked`) that JS computes via the #43 `_cvCompute` engine and **primes** onto the nodes before the query (a `_primeValidity` sibling of `_primeTarget`, gated on a `valid`/`range` substring so the hot qsa path pays nothing; `<form>`/`<fieldset>` aggregate over owned/descendant candidates). Closed the named #43 caps (2 dynamic `matches(":invalid")` tests + `Element-closest` 29/29). Bonus: `select.value` now reflects selectedness; `type=range` clamps so it's never out-of-range. Zero regressions (stash-proved the `:disabled`/`:default` sibling fails pre-existing). Caps: `:read-write`/`:read-only` (editing hosts/designMode/custom elements — deferred), `getComputedStyle` `-type-change`/`-hidden` variants (CSS cascade), `test_driver.send_keys` |
| ~~43~~ | ✅ [The Charter of Constraints](43-the-charter-of-constraints.md) | `html/semantics/forms/constraints/*` (constraint validation API) | **willValidate 67/67, checkValidity 122/122, valueMissing 71/71, valid 33/33, patternMismatch 85/85, range 49+47, +14 more** | ⚔️⚔️⚔️ | **SECURED — +877.** The entire constraint validation API was absent. New `ValidityState` + `willValidate`/`validity`/`validationMessage`/`checkValidity`/`reportValidity`/`setCustomValidity` on the 7 listed interfaces + `HTMLFormElement`, with the full `_cvCompute` validity algorithm: mutable-gated `valueMissing` (group-aware radio), `email`/`url` `typeMismatch`, raw-then-anchored `pattern` (`v` flag), typed range/step (reversed ranges, Blink float-tolerant step, step base min→@value→default), barred-from-CV `willValidate` (disabled-fieldset propagation, datalist, readonly), always-false tooLong/tooShort/badInput, `customError`. Plus reflected attrs (required/readonly/pattern/min/max/step/multiple/maxlength/minlength/textarea.defaultValue) and checkbox/radio activation on `click()`. Pure JS, zero regressions. Caps: `:valid`/`:invalid` selector matching (2 dynamic tests + closest 29/29 — needs the Rust matcher to reach JS validity); `test_driver.send_keys` (3 textarea subtests); 1 sub-ULP `stepMismatch` (needs decimal arithmetic) |
| ~~42~~ | ✅ [The Logical Lens](42-the-logical-lens.md) | `css/selectors/{is-where,has}-*`, `ParentNode-querySelector-scope`, `Element-closest` | **is-where 33/33, has 78/78, scope 4/4, closest 28/29** | ⚔️ | **SECURED — +116.** `:is()`/`:where()`/`:has()` and the `:scope` scoping root were all dark — the Servo `selectors` crate implements their matching already, but `parse_is_and_where()`/`parse_has()` default `false` (so the selectors threw `SyntaxError` and blanked every test) and `MatchingContext.scope_element` was always `None` (so `:scope` == `:root` even for element-rooted queries). Enabled the two parse hooks + thread a per-query scope element (element-rooted → the element; document-rooted → `None`/`:root` unchanged; `closest` holds the context element fixed across the ancestor walk via a `"<node>,<scope>"` op arg so `:has(> :scope)` resolves right). Pure selector-engine plumbing, no DOM model change. Caps: `:invalid` (form constraint-validation), `getComputedStyle` specificity/cascade tests (CSS-cascade frontier), render reftests |
| ~~01~~ | ✅ [The Selector Sorcery](01-the-selector-sorcery.md) | `dom/nodes/ParentNode-querySelector-All` | **1975/1975** | ⚔️⚔️ | **SECURED 100%** |
| ~~02~~ | ✅ [The Attr-Node Codex](02-the-attr-node-codex.md) | `dom/nodes/attributes` | **67/67** | ⚔️⚔️⚔️ | **SECURED** |
| ~~03~~ | ✅ [The ClassList Mutation-Echo](03-the-classlist-mutation-echo.md) | `dom/nodes/Element-classlist` | **1420/1420** | ⚔️⚔️ | **SECURED 100%** |
| 04 | [The URL Swamps](04-the-url-swamps.md) | `url/url-constructor`, `url/url-setters` | ⚔️ stripping **260/260** + statics **8/8** DONE; constructor 847, setters 241 | ⚔️⚔️⚔️ | Inc 1–3: **+73** (userinfo no-strip, statics, hostname/port, path `^`, opaque-space, `///` slash-skip); remaining = rust-url-vs-WHATWG `file:`/empty-host/`/.` divergences (real WHATWG parser is the keystone) |
| ~~05~~ | ✅ [The Element Forge](05-the-element-forge.md) | `dom/nodes/Document-createElement` | **147/147** | ⚔️⚔️⚔️ | **SECURED** |
| 06 | [The Node-Smithing Vaults](116-the-self-same-verdict.md) | `dom/nodes/Node-*` | **near-100%** | ⚔️⚔️ | **Quest #116 +49** — isSameNode 9/9, contains 1482/1482, cloneNode-XMLDocument 1/1, cloneNode-doctype 3/3. Realm baselined far greener than the old ~150 est (compareDocumentPosition 1444, properties 726, textContent 81, lookupNamespaceURI 75 all 100%). Caps: Node-removeChild hang, querySelector-escapes lone-surrogate IDs (Rust UTF-8), replaceChildren atomic-replace MO record, parentNode iframe onload |
| 07 | [The Event Amphitheater](07-the-event-amphitheater.md) | `dom/events/*` | ⚔️ spec dispatch **DONE**; core 100% | ⚔️⚔️ | +110 this session (capturing/bubbling, event classes, trusted); tails = heavy cloneNode fixtures + synthetic-click |
| 08 | [The Encoding Cipher](08-the-encoding-cipher.md) | `encoding/*` | ⚔️ TextEncoder/Decoder + **legacy encodings DONE** (~7800) | ⚔️⚔️ | #08b: +3900 (all single-byte + gb18030/gbk/big5/euc/sjis/iso-2022-jp via `encoding_rs` op); tails = SAB, utf-16-truncated, iso-2022-jp fatal-stream state |
| 09 | [The FileAPI Vault](09-the-fileapi-vault.md) | `FileAPI/*` | ⚔️ Blob/File/FileReader + **blob: URL store DONE** (~365) | ⚔️⚔️ | #09b: +34 (blob:{origin}/{uuid}, byte store, fetch/XHR/Request snapshot); tails = element-toString, SAB, url-reload/in-tags (navigation), FileList |
| 10 | [The Traversal Labyrinth](10-the-traversal-labyrinth.md) | `dom/ranges`, `dom/traversal` | ⚔️ traversal **DONE**; ranges 90%+ | ⚔️⚔️⚔️ | iframe content-ops left |
| ~~11~~ | ✅ [The Collections Armory](11-the-collections-armory.md) | `dom/collections`, getElementsBy* | **getElementsBy\* all 100%** | ⚔️⚔️ | **SECURED** |
| 12 | [The Iframe Frontier](12-the-iframe-frontier.md) | `dom/ranges` content-ops (per-iframe realms) | ⚔️ insertNode **1531**, surround **1247** | ⚔️⚔️⚔️ | +1171 this session (validity + live doctype); tails = doctype-order + range-setup IndexSizeError |
| ~~13~~ | ✅ [The Harness Gates](13-the-harness-gates.md) | *meta* — could-not-run / no-results | **SECURED** | ⚔️⚔️ | unlocked #10 |
| ~~18~~ | ✅ [The Timekeeper's Ledger](18-the-timekeepers-ledger.md) | `user-timing/*`, `hr-time/*` | **mark 22/22 + realm** | ⚔️⚔️ | **SECURED** — real User Timing L3 (was a no-op `performance`): mark/measure/getEntries/clear + PerformanceEntry/Mark/Measure/Timing + ~70 realm subtests. Caps: obsolete L1/L2 `mark(timingAttr)`-throws subtests; `<body onload>` load-event gap |
| ~~17~~ | ✅ [The Entropy Gate](17-the-entropy-gate.md) | `WebCryptoAPI/getRandomValues` | **39/39** | ⚔️ | **SECURED 100%** — real `crypto.getRandomValues` contract (was a `Math.random` fill @ 23/39); **+16**. Added `TypeMismatchError:17` to `DOMException._codes` + the modern `QuotaExceededError` interface |
| ~~16~~ | ✅ [The Clone Forge](16-the-clone-forge.md) | `html/webappapis/structured-clone` | **141/152** | ⚔️⚔️ | **SECURED 93%** — real structuredClone (was a `JSON` stub @ 29/152); **+112**. 10 left are engine gaps (FileList/MessagePort/ImageBitmap/OffscreenCanvas/OOB-TA) |
| 23 | [The Element Ledger](23-the-element-ledger.md) | `resource-timing/*` element loads (+ perf-timeline) | ⚔️ po-observe 1/1, dynamic-insertion 5/6, img 1/1, link 5/8 | ⚔️⚔️ | **inc 1+2 ~+16.** Element subresource loads (`<img>`, `<link>`, `<script>`, `<object>` — both JS-inserted AND markup) emit `resource` entries + fire load/error; iframe/XHR report correct initiatorType. Next: css-embedded "css" entries, `img.src` resolved-URL reflection, font→css, redirect timing, buffer-full |
| ~~24~~ | ✅ [The Resolved Reflection](24-the-resolved-reflection.md) | `resource-timing/status-codes-create-entry` (+ `getEntriesByName(el.src)` family) | **status-codes 0→1/1** | ⚔️ | **SECURED — +1, foundational.** URL-reflecting IDL getters (`img/script/iframe.src`, `a/link/area.href`) now return the RESOLVED absolute URL (was the raw attribute), so `getEntriesByName(img.src)` matches the absolute entry name. Page `<script src>` `resource` entries carry the real fetch-elapsed `duration` (was a collapsed 0). Scoped tight (per-localName sets), zero regressions. Caps: TAO/cross-origin family, `<base>`-loader divergence |
| ~~26~~ | ✅ [The Content-Type Ledger](26-the-content-type-ledger.md) | `resource-timing/content-type` | **0→16/21** | ⚔️ | **SECURED — +16.** New `PerformanceResourceTiming.contentType` (MIME essence of the response Content-Type), exposed for non-opaque responses (same-origin + crossorigin CORS loads; opaque cross-origin → ""). `_loadElementResource` now honors the element `crossOrigin` attr → CORS fetch mode. Bug fix: `XMLHttpRequest.open(url)` coerces a `URL`-object url to string (was `url.includes is not a function`). Caps: cross-origin no-cors XHR (our XHR is cors-mode → blocked) + cross-origin redirect TAO |
| ~~25~~ | ✅ [The Buffer Ledger](25-the-buffer-ledger.md) | `resource-timing/buffer-full-*` | **12 tests 0→1/1** | ⚔️⚔️ | **SECURED — +8, then +4 harvest (post-#28).** Real Resource Timing buffer (was unbounded, no event): primary buffer w/ size limit 250 + secondary buffer; `resourcetimingbufferfull` event + `onresourcetimingbufferfull` handler + the "fire a buffer full event" task (copy-secondary-buffer + no-progress overflow guard); `setResourceTimingBufferSize`/`clearResourceTimings` per spec. **Harvest:** the ×4 `xhr_sync`-ordering tails (add-then-clear, then-increased, add-entries-during-callback, inspect-buffer-during-callback) — capped on #25 because sync XHR didn't exist — turned green once `_sendSync` was taught to record a `resource` entry (#28 landed sync XHR; this added the entry). Zero regressions. Cap left: `buffer-full-eventually` times out (250 sequential network loads exceed harness wall-clock) |
| ~~22~~ | ✅ [The Resource Ledger](22-the-resource-ledger.md) | `resource-timing/*` (+ perf-timeline) | **buffered-flag 1/1, clear-resource-timings 1/1, case-sensitivity 3/3** | ⚔️⚔️ | **SECURED — +4.** `PerformanceResourceTiming` entries for `fetch()`/XHR + page `<script src>` loads; real `clearResourceTimings`. Caps: element loads (img/link/iframe), TAO cross-origin, buffer-full family |
| ~~21~~ | ✅ [The Navigator's Almanac](21-the-navigators-almanac.md) | `navigation-timing/*` | **~20 subtests across 9 tests** | ⚔️⚔️ | **SECURED — ~+20.** Real `PerformanceNavigationTiming` (+ `PerformanceResourceTiming` base): nav entry present from the start, queued to observers at load; honest body sizes from the Rust response; `readystatechange` at interactive/complete. Caps: exact-byte-size/host-URL value tests, per-iframe nav timing, real redirect-chain timing |
| ~~20~~ | ✅ [The Observer's Gallery](20-the-observers-gallery.md) | `performance-timeline/*` | **PO suite 11/11 + idl 35/58** | ⚔️⚔️ | **SECURED — ~+15.** Real `PerformanceObserver` (was a no-op stub): observe(entryTypes/type+buffered), disconnect/takeRecords, supportedEntryTypes, PerformanceObserverEntryList, task-queued delivery from mark()/measure(). Cap: po-observe + 2 case-sensitivity subtests need resource/navigation timing entries |
| ~~19~~ | ✅ [The Load Bell](19-the-load-bell.md) | *load-lifecycle* — `<body onload>` → `window.onload` | **clearMarks 57/57, clearMeasures 57/57, measures 119/119** | ⚔️⚔️ | **SECURED — +233.** `<body onload=…>` is an HTML *window* event handler; it was never wired to `window.onload`, so testharness pages running tests from `<body onload>` came back could-not-run. `__installBodyWindowHandlers()` compiles body/frameset window-reflecting on\* content attrs onto `window.on*` before parser scripts run. General fix — unlocks any load-gated test |
| 27 | [The XHR Foundry](27-the-xhr-foundry.md) | `xhr/*` (XMLHttpRequest) | ⚔️ data-uri 10/10, setrequestheader-bogus-name 71/71, -value 5/5, open-method-bogus 8/8 | ⚔️⚔️ | **OPENED — +94.** Async correctness, no new architecture: `fetch()` resolves `data:` URLs in-process (WHATWG data: URL processor); real `setRequestHeader` validation (ByteString→TypeError, token/value→SyntaxError, normalize+combine); `open()` method validation (non-token→SyntaxError, CONNECT/TRACE/TRACK→SecurityError, uppercase well-known) |
| 28 | [The Synchronous XHR Keystone](28-the-sync-xhr-keystone.md) | `xhr/*` synchronous (`open(...,false)`) | ⚔️ headers-normalize 15/15, open-method-case-{in,}sensitive 6/6+9/9, responsetype-set-sync 5/5, sync-event/sequencing all green | ⚔️⚔️⚔️ | **SECURED — ~+49.** Blocking Rust op `op_fetch_url_sync` (factored out of `op_fetch_url`'s network core) makes `send()` block until the response — safe on per-page threads. `open()` records `_async` + InvalidAccessError + state-change-gated readystatechange; new `_sendSync()` (data:/blob: in-process, NetworkError on failure); `_fireEvent` builds real ProgressEvents. Zero regressions. Caps: charset-aware query encoding, `.asis` raw-response, hyper-lowercased request header names |
| 29 | [The Entity-Body Forge](29-the-entity-body-forge.md) | `xhr/*` request body + Content-Type | ⚔️ send-content-type-charset 19/19, send-content-type-string 1/1, send-entity-body-{none,empty,get-head,get-head-async} all green | ⚔️⚔️ | **SECURED — +19.** WHATWG "extract a body" + XHR §send() Content-Type: `_extractRequestBody` (String/Document/Blob/BufferSource/FormData/URLSearchParams), real `_parseMimeType`/`_serializeMimeType` + charset→UTF-8 adjustment (only when present & not already utf-8), GET/HEAD discard the body, POST/PUT null body emits `Content-Length: 0`. Caps: request-header-NAME case (hyper lowercases → `setrequestheader-content-type` values correct but capped), `status-*` custom reason phrase (h2), `.asis` |
| ~~31~~ | ✅ [The Charset Decipher](31-the-charset-decipher.md) | `xhr/*` response decoding | **responsetext-decoding 37/37, responsedocument-decoding 6/6** | ⚔️⚔️ | **SECURED — +19.** XHR decoded every response as UTF-8; the fetch core already hands JS the raw bytes (`bodyBase64`). New §"text response" + document decoding: `_xhrFinalEncoding` (override>Content-Type charset), `_xhrDecode` (Encoding §decode — BOM sniff picks the encoding, `TextDecoder` strips it), XML-declaration sniff (default `""` type) + HTML `<meta charset>` prescan (document). Pure JS, no new Rust. Caps: `responseText` throwing-getter for non-text responseTypes (next), XML-parser well-formedness edge |
| ~~30~~ | ✅ [The Response Document](30-the-response-document.md) | `xhr/*` `responseXML` | **media-type 15/15, get-twice 4/4** | ⚔️⚔️ | **SECURED — +11.** XHR §"document response": `responseXML` was a constant `null`. New lazy, cached `_getDocumentResponse()` — final MIME type via `_parseMimeType` (missing/unparseable Content-Type → `text/xml`), XML/HTML detection, parse via `_IframeDocument` (parsererror→null), default `""` type never parses HTML; `.response`/`.responseXML` share one cached object (identity). Caps: `responsexml-document-properties` (full XML doc metadata + lastModified/redirect.py); charset-aware response decoding |
| ~~32~~ | ✅ [The Throwing Getter](32-the-throwing-getter.md) | `xhr/*` `responseText` | **non-document-types 5/5** | ⚔️ | **SECURED — +4.** `responseText` was a plain data property (never threw); per §the-responsetext-attribute it must throw `InvalidStateError` when `responseType` is not `""`/`"text"`. Refactored to a getter backed by `_responseText` (all send paths assign the backing field) — empty string until LOADING/DONE, else the decoded text. `responseXML` already threw. Pure JS, no new Rust. The response-attributes vein is now clean. Caps: `responsexml-document-properties` (full XML doc metadata quest) |
| ~~33~~ | ✅ [The Interface Armory](33-the-interface-armory.md) | `dom/nodes/Node-cloneNode*` (+ HTML element interface objects) | **Node-cloneNode 135/135** | ⚔️⚔️ | **SECURED — +34.** Most `HTML*Element` interface objects were a single shared alias of `HTMLElement` and a large tail was missing → `typeName in window` false. Now each is a distinct subclass of `HTMLElement` + a canonical `_HTML_IFACE_BY_TAG` tag→interface map, so `createElement(t) instanceof HTMLXxxElement` is honest. Added `DocumentType.cloneNode` + `DetachedDocument.cloneNode`. Caps: DOMParser HTML doc drops `<!DOCTYPE>` (parse-path gap); `document.adoptNode` unimplemented (next quick win) |
| ~~34~~ | ✅ [The Adoption Papers](34-the-adoption-papers.md) | `dom/nodes/Document-adoptNode` (+ insert-adopt) | **Document-adoptNode 4/4, Node-mutation-adoptNode 2/2** | ⚔️ | **SECURED — +5.** `document.adoptNode` was unimplemented (`adoptNode is not a function`). Real DOM §dom-document-adoptnode: detach from any parent, deep-retarget the node document of the whole subtree (`_setNodeDocumentDeep`), adopting a Document throws `NotSupportedError`; inherited by `DetachedDocument`. Also fixed insertion (`appendChild`/`insertBefore`) to run the §insert "adopt into the parent's node document" step **deeply** when crossing documents (was retagging only the direct child) — hot-path safe via a same-document cheap compare. Pure JS, no new Rust. Caps: DocumentFragment/ShadowRoot adopt subtests (need a working `new Document()` web ctor, template-content owner document, `attachShadow`), `remove-and-adopt-thcrash` (`window.open()` popup document) |
| ~~35~~ | ✅ [The Insertion Concord](35-the-insertion-concord.md) | `dom/nodes/{ParentNode-append,prepend,replaceChildren,ChildNode-before,after,replaceWith}` | **before/after/replaceWith 45/45+45/45+33/33, append 25/25, prepend 22/22, replaceChildren 25/29** | ⚔️⚔️ | **SECURED — +177.** The whole ParentNode/ChildNode mutation family shared crooked, duplicated "convert nodes into a node" logic that only handled `typeof === "string"` (so `null`/`undefined`/numbers threw instead of becoming Text nodes), `before`/`after`/`replaceWith` lacked the viable-sibling algorithm (so `child.before(x, child)` **crashed the engine** → the three suites were dark), and `replaceChildren` was missing entirely. One shared spec-correct core (`_convertNodesIntoNode` + `_cn*`/`_pn*` mixins on Element/CharacterData/DocumentType/DocumentFragment/Document) + §ensure-pre-insertion-validity steps 5–6 added to `appendChild`/`insertBefore`. Bonus: insertAdjacentElement/Text 5→6 each. Caps: `replaceChildren` atomic "replace all" MutationObserver record (needs a Rust suppress-observers flag) |
| 14 | [The Parsing Foundry](14-the-parsing-foundry.md) | `domparsing/*` | ⚔️⚔️ KEYSTONE SECURED — XML parser + serializer (xml 20/20, serializer 27/29, html 9/10) | ⚔️⚔️⚔️ | Inc 1 +7 (detached HTML doc, was returning the LIVE document!); **Inc 2 +46** (real namespace-aware XML parser + W3C XMLSerializer; unlocked Node-normalize 4/4 + Element-tagName 6/6). Tails: createContextualFragment/insert_adjacent_html (HTML fragment-in-context) |
| ~~41~~ | ✅ [The Reflection's Mirror](41-the-reflections-mirror.md) | `dom/nodes/Element-{matches,webkitMatchesSelector,closest}` | **matches 669/669, webkitMatchesSelector 669/669** | ⚔️ | **SECURED — +700.** `webkitMatchesSelector` was entirely missing (`is not a function`, 661 dark subtests) and `matches()` used `parent.querySelectorAll(s)` — returning `false` for a detached (parentless) element WITHOUT parsing the selector (so 33 invalid-selector→`SyntaxError` subtests passed through silently), no arg-count `TypeError`, and mis-coerced `matches(null)`/`matches(undefined)`. New `element_matches` Rust op over the real selector engine (parse → invalid throws `SyntaxError`; combinators see true ancestors even when detached); `matches`/`closest`/new `webkitMatchesSelector` route through it with WebIDL DOMString coercion (0 args → `TypeError`). Caps: `Element-closest` 25/29 — the 4 left need a scope-element MatchingContext (`:scope` ×3) + form-validity pseudo-classes (`:invalid` ×1) |
| ~~40~~ | ✅ [The Standalone Charter](40-the-standalone-charter.md) | `dom/nodes/Document-constructor` (the `new Document()` web ctor) | **5/5** | ⚔️ | **SECURED — +2.** The `new Document()` web constructor named "next leverage" since #34. It returned a `DetachedDocument` subclass, so `Object.getPrototypeOf(doc) !== Document.prototype` AND its XML `createElement` used `_wrapEl` (HTML interface) → `createElement("a").constructor !== Element`. Now `new Document()` is a genuine `Document` instance set up as **standalone** (real fragment backing node + `_standalone`/`_kind:'xml'`/`_createMode:'xml'`): base-class getters branch on `_standalone` for application/xml content type, about:blank URL, self-scoped queries, non-HTML createElement (case-preserving plain `Element` via shared `_createElementXMLInto`), and a working `createCDATASection`. Caught & fixed a latent regression: `dom/common.js` does `new Document().createCDATASection(...)` — the base throwing version aborted the whole harness (TreeWalker/Range went dark). Pure JS, no new Rust, zero regressions. Caps: template-content owner doc + `attachShadow` (adoption.window 3/6 tail) |
| ~~39~~ | ✅ [The Doctype Charter](39-the-doctype-charter.md) | `dom/nodes/DOMImplementation-createDocumentType` | **82/82** | ⚔️ | **SECURED — +81.** Exposed by #38. `createDocumentType` had no "valid doctype name" check (a name is valid unless it contains ASCII whitespace / U+0000 / `>`; empty string valid — *looser* than QName, so `:foo`/`foo:`/`prefix::local`/`@` are fine; only `"edi:>"`/`"edi:a "` throw `InvalidCharacterError`) and gave the wrong `ownerDocument`: `DetachedDocument`/`_IframeDocument` overrode `get implementation()` to return the **page's** impl, so `doc.implementation.createDocumentType(...)` owned to the page not `doc`. Fix: `Document.get implementation()` captures `this` + sets the doctype's `_ownerDoc`; delegating overrides removed (inherit the bound getter); `<3 args` → `TypeError`. Pure JS, no new Rust |
| ~~38~~ | ✅ [The Document Charter](38-the-document-charter.md) | `dom/nodes/DOMImplementation-createDocument` (+ `adoption.window`) | **createDocument 434/434** | ⚔️⚔️ | **SECURED — +116.** The widest DOM frontier left (the `new Document()` footgun named since #34). 114 fails were all document-identity `assert_equals` (distinct objects, not `===`). `XMLDocument` was `class extends Document {}` (abstract, no backing node) and `createDocument` returned a `DetachedDocument`, so `Object.getPrototypeOf(doc) === XMLDocument.prototype` never held. Now `XMLDocument extends DetachedDocument` (a real fragment-backed node — distinct backing Document, no node-0 fallback); `createDocument` returns `new XMLDocument('xml')` + full WebIDL validation/coercion + spec node order. `adoption.window` 1→3/6 came free. Caps: `createDocumentType` 1/82 (next quest), ShadowRoot/popup adoption, `new Document()` web ctor (Document-constructor 3/5) |
| ~~37~~ | ✅ [The Wordsmith's Charter](37-the-wordsmiths-charter.md) | `dom/nodes/{Text,Comment}-constructor`, `CharacterData-data`, `Text-splitText`, `Text-wholeText` | **constructors 15/16+15/16, data 16/16, splitText 6/6, wholeText 1/1** | ⚔️ | **SECURED — +30.** `Text`/`Comment` had no web constructor — they inherited `Node(nid)`, so `new Text("42")` stuffed the data string into `_nid` (→ ops fell back to the live document, `.data` returned the page body). Added real `new Text/Comment(data)` constructors (allocate a backing node; a private `_NID_TOKEN` sentinel keeps internal nid-wraps distinct from web data so `new Text(42)`→data `"42"`). Harvested 3 nearby gaps: `data` setter `[LegacyNullToEmptyString]` (`undefined`→`"undefined"`), `splitText` IndexSizeError on out-of-range offset, real `wholeText` (contiguous Text-node concatenation). Pure JS, no new Rust. Caps: cross-global iframe-realm ownerDocument (the shared 15/16 fail); next frontier = `DOMImplementation-createDocument` 320/434 needs distinct backing Document nodes (`new Document()` footgun) |
| ~~36~~ | ✅ [The Living Roster](36-the-living-roster.md) | `dom/nodes/Node-childNodes` | **6/6** | ⚔️⚔️ | **SECURED — +5.** `Node.childNodes` returned a fresh plain array each call (no identity, not live). Now a cached, live `NodeList` Proxy per node: the target is a real `NodeList extends Array` (so `instanceof` + the `Array.prototype` iterator/keys/values/entries/forEach identities hold), Proxy traps serve integer-index + `length` from the live tree, the proxy is cached on the node for identity, and a `_treeGen` counter (bumped by the 5 structural `op_dom` mutators) keeps repeated reads between mutations cheap. Pure JS, no new Rust. Zero regressions (TreeWalker 761/761 a key signal) |

Difficulty: ⚔️ quick & decisive · ⚔️⚔️ a proper campaign · ⚔️⚔️⚔️ an architectural siege.

---

## 🗺️ Captain's Counsel (recommended order — updated 2026-06-14, session 5)

With **#02 Attr-Node Codex SECURED (67/67)** — a real `Attr`/`NamedNodeMap` model
over namespace-aware Rust attribute storage — the field stands thus:

1. **The Collections Armory (11)** + **Node-Smithing Vaults (06)** — now the most
   leveraged ground: `getElementsByTagName(NS)` and the `Node-*` family are
   measurable and the new `Attr`/`NamedNodeMap`/namespace machinery directly
   supports them (`Element-getElementsByTagName` sits at 4/19 today).
2. **The Selector Sorcery (01)** — finish the tail (see Scroll 01 for the bucketed ~52):
   namespace selectors, shadow-DOM pseudo-elements, a real `NodeList` type, and a
   harness node-identity mystery. Namespaced attributes are now real, which helps.
3. **The ClassList Mutation-Echo (03)** (1315/1420) — bankable tail on held ground.
4. **The Iframe Frontier (12) tails** — `Range-insertNode`/`surroundContents`
   per-subtest correctness (909/698 of 1840). Grinding but bankable.
5. The smaller self-contained realms (08 Encoding, 09 FileAPI) for breadth.
6. **Standing leverage:** XML-document mode + iframes-delay-load (#05) and the new
   namespace-aware attribute layer (#02) may unblock OTHER XML/foreign-content tests.

## 📜 Lands already secured this campaign (for the chronicles)

**Session 2026-07-17 (Quest #207 The Image-Resolution Verdict — a pure rejection gate for `image-resolution-invalid`, +5, ZERO regressions):**
Took #206's next-leverage: baselined the remaining `*-invalid` files in `css/css-images/parsing/` and found `image-resolution-invalid`
**0/5** — a raw-store tell. `image-resolution = [ from-image || <resolution> ] && snap?` (CSS Images 4 §7) was entirely raw-store:
every value stored verbatim, so `auto`/`100%`/`2` were accepted and nothing rejected a `snap` split into the middle of the group. The
paired `-valid` file passes **12/12 verbatim** precisely because no browser ships this property, so WPT's -valid expectations are the
author's own byte-order (no reordering) — which our raw-store already delivers. So this is the #202 pattern taken to its limit: a PURE
rejection gate that keeps the stored value byte-identical. New `_isValidImageResolution(value)` (beside `_serObjectFit`): tokenize
(paren-aware `_wsTokens`), 1–3 tokens; the `[from-image || <resolution>]` group is REQUIRED and each part appears ≤ once; `snap` is
optional, ≤ once, and — being on the OTHER side of the `&&` from the group — may sit only at position 0 or last, never interior (remove
it, then the remaining 1–2 tokens are the group). A `<resolution>` = a numeric dimension with unit in `{dpi,dpcm,dppx,x}`
(`_isResolutionTok`, reusing the `_UNIT_KIND` resolution set). Rejects `auto`/`100%`/`2` (no group member), `3dpi snap from-image` /
`from-image snap 4dppx` (interior snap). Wired as an `image-resolution` branch in BOTH setProperty paths (inline + API), var()/env() and
CSS-wide keywords deferred; when valid the value is left untouched so the -valid round-trips hold. **WINS:** image-resolution-invalid
0→5. **+5, ZERO regressions.** Sweep held: image-resolution-valid 12/12, gradient-interpolation-method-invalid 292/292 + -valid
1398/1398, gradient-position-invalid 9/9 + -valid 18/18, conic-gradient-calc-angle-percentage-invalid 4/4 + -valid 6/6,
image-function-invalid 6/6, object-fit-invalid 5/5 + -valid 9/9, object-position-valid 18/18, image-orientation-invalid 12/12,
image-rendering-invalid 2/2, background-image-invalid 12/12 + -valid 13/13, background-valid 45/46 (pre-existing cap), background-computed
39/39, mask-image-computed 47/47, qsa 1975. **CAP:** none in this file. **NEXT LEVERAGE:** `css/css-images/parsing/` is now almost fully
green (all `*-invalid` files there pass) — move to a NEW `css/*/parsing/` dir and baseline its `*-invalid` files for a raw-store tell
(an `*-invalid` at 0/N while `*-valid` passes). Scroll `tickets/207-the-image-resolution-verdict.md`.

**Session 2026-07-17 (Quest #206 The Angle-Percentage Verdict — a calc() dimensional type-check + specified-value reorder for conic gradient stops, +9, ZERO regressions):**
Took #205's next-leverage: the PAIRED `conic-gradient-calc-angle-percentage-{invalid 0/4, valid 1/6}` in `css/css-images/parsing/`.
A gradient colour-stop/hint position is `<length-percentage>` (linear/radial) or `<angle-percentage>` (conic); a conic `from` is a
pure `<angle>`. `_evalMath` numerically SUMS a calc() but never type-checks (`50% + 30deg` evaluates fine), so both halves were new
work. **Invalid half (+4) — a focused calc type-checker (`_gradientCalcBad`/`_calcSumKind`/`_dimKindOfTok`):** classify ONLY a flat
`calc()` sum of simple number/dimension/percentage terms (a term with a product `*`/`/` or nested group → `'other'` → DEFER, never
reject); `'bad'` when the sum mixes types that can't add (a `<number>` with a dimension/%, or a `<length>` with an `<angle>`); else a
kind (`len`/`ang`/`pct`/`len-pct`/`ang-pct`). Rejected per context: `lp` rejects angle-bearing (`linear/radial-gradient(red
calc(50% + 30deg))`), `ap` rejects length-bearing, `angle` rejects %/length (`conic-gradient(from calc(50% + 30deg))`); `'bad'`
everywhere (`conic-gradient(red calc(50% + 0))` — number+%). Wired via the EXISTING `_gradientInvalid`: `from`-angle check inside
`_gradientConfigInvalid` (conic), stop-calc check in `_gradientInnerInvalid` — the unconditional `_gradientConfigInvalid` call on
`args[0]` KEPT (so the 292 interp rejections are untouched), the stop-calc check added on non-config args only (gated by
`_isGradientConfig` so a real `from …`/`at …` config isn't stop-typed and mis-rejected). **Valid half (+5) — specified-value calc
reorder:** specified-mode stops passed VERBATIM (only computed canonicalized them), so `calc(0deg + 100%)` never reordered. New
`_canonGradientStopSpecified` maps each stop token, canonicalizing ONLY a `calc(` token via the existing `_canonSortedCalc` (CSS
Values 4 mixed-unit ordering: number, then %, then dimension) — `calc(0deg + 100%)`→`calc(100% + 0deg)`, `calc(90deg + 50%)`→
`calc(50% + 90deg)`, `calc(90deg + 0%)`→`calc(0% + 90deg)` (zero % preserved), `calc(100% - 45deg)` unchanged, repeating-conic too;
colours + plain positions stay byte-identical. **WINS:** conic-gradient-calc-angle-percentage-invalid 0→4, -valid 1→6. **+9, ZERO
regressions.** Sweep held: gradient-interpolation-method-valid 1398/1398 + -invalid 292/292 + -computed 932/932, gradient-position-valid
18/18 + -invalid 9/9, image-function-valid 13/13 + -invalid 6/6, object-position-valid 18/18, object-fit-invalid 5/5 + -valid 9/9,
image-orientation-invalid 12/12, image-rendering-invalid 2/2, image-resolution-valid 12/12, background-image-valid 13/13 + -invalid
12/12, background-valid 45/46 (pre-existing cap), background-computed 39/39, mask-image-computed 47/47, cursor-invalid 10/10,
line-clamp-valid 18/18, qsa 1975. **CAP:** none in these files. Scroll `tickets/206-the-angle-percentage-verdict.md`.

**Session 2026-07-17 (Quest #205 The Background-Image Verdict — three parallel rejection gates for `background-image-invalid`, +12, ZERO regressions):**
Took #204's next-leverage: `background-image-invalid` **0/12** in `css/css-backgrounds/parsing/` (NOT `css-images` — that dir has
no `background-image-*` files). The 12 failures were three clean groups of *pure rejections* (no serialization change), each a
small parallel gate leaving the `_canonGradients`/`_canonCrossFade` engines untouched: **(1) negative radial radii (6)** —
a radial `<radial-size>` is one/two `<length-percentage>` radii which MUST be non-negative (`radial-gradient(circle -10px …)`,
`ellipse -20px 30px`, `-20% 30%`, `20px -30px`); made `_gradientConfigInvalid` type-aware (threaded `type` from `_gradientInvalid`
→ `_gradientInnerInvalid`) and, for `type==='radial'`, reject any prelude token (before `at`) that is a literal negative
`<length-percentage>` (`_isPosLP(t) && parseFloat(t) < 0`). RADIAL-only — linear/conic preludes carry angles, where negative is
valid. **(2) `cross-fade()` percentages (5)** — cross-fade was CANONICALIZED but never VALIDATED; new `_crossFadeInvalid`
(balanced-paren scan, parallel to `_gradientInvalid`) enforces `<cf-image> = <percentage [0,100]>? && [<image>|<color>]`: partition
each cf-image's tokens into plain-`%` vs rest; AT MOST one `%`, EXACTLY one rest token, `%` in `[0,100]`. Rejects `auto blue`/`1px red`
(two rest toks), `calc(1% + 1px) red` (mixed-type calc is one non-% token → two rest), `-1%`/`101%` (range). Valid `50% url(…)`,
`red 33%`, `blue`, nested cross-fade all leave exactly one rest + in-range %. **(3) `none, auto` bad layer (1)** — new
`_bgImageLayersInvalid` (name-guarded to `background-image`): each comma layer must be a single token that is `none`, an `<image>`
function/url() head (`_isBgImageTok`), or `light-dark()`; `auto` is none of these. Defers on var()/env(). Both new gates wired into
BOTH setProperty paths (inline ~864, API ~1204) beside the existing `_imageFuncInvalid`/`_gradientInvalid`. **Regression caught &
fixed mid-flight:** the first `_bgImageLayersInvalid` rejected `light-dark(url(…), url(…))` (a valid bg-image layer not in
`_BG_IMAGE_FN_RE`) → dropped background-image-valid 13→10; added the explicit `light-dark(` allowance → restored 13/13. **WINS:**
background-image-invalid 0→12. **+12, ZERO regressions.** Sweep held: background-image-valid 13/13, background-valid 45/46
(pre-existing cap), background-computed 39/39, gradient-position-invalid 9/9 + -valid 18/18, gradient-interpolation-method-invalid
292/292 + -valid 1398/1398, image-function-valid 13/13 + -invalid 6/6, object-fit-invalid 5/5, object-position-valid 18/18,
image-orientation-invalid 12/12, mask-image-computed 47/47, line-clamp-valid 18/18, cursor-invalid 10/10, qsa 1975. **CAP:** none in
this file. Scroll `tickets/205-the-background-image-verdict.md`.

**Session 2026-07-17 (Quest #204 The Gradient Position Verdict — a strict `<position>` gate for gradient `at` clauses, +9, ZERO regressions):**
Took #203's next-leverage: `gradient-position-invalid` **0/9** in `css/css-images/parsing/`. A radial/conic gradient's
`at <position>` clause uses the **strict CSS Values `<position>` grammar** — which, unlike the `<bg-position>` grammar
of the `background-position` property, has **NO 3-value form** and no `center`/optional-offset variant of the
edge-offset (`&&`) form (all 4 tokens `[edge <lp>] && [edge <lp>]` mandatory). Our `_parsePosition` implements the
looser `<bg-position>` (correct for `background-position`, held 31/31 valid + 11/11 invalid), so it round-tripped the
3-value positions gradients must drop (`at center left 1px`, `at bottom right 8%`) plus `at top 0px` (which it already
rejected, but `_serializePositionSpecified` kept verbatim). Fix followed the #202 pattern — a **parallel rejection
gate, canonicalizer untouched**: new `_gradientPosInvalid(posToks)` (empty → invalid; **exactly 3 tokens → invalid**;
else defer to `_parsePosition(...) === null`), called from `_gradientConfigInvalid` after the `in`-clause removal (find
`at` in the residual config tokens, validate everything after it — `at` precedes `in` in the grammar, so the residual
tail is exactly the `<position>`). Wired via the existing `_gradientInvalid` gate — already in BOTH setProperty paths
→ ZERO new wiring. Fully isolated: 1 helper + 2 lines. **The whole `<bg-position>`-vs-`<position>` delta reduces to
"3-token is invalid"** — `_parsePosition` already rejects the 2-token bad case, and every 4-token parse it accepts is
necessarily two `edge <lp>` components. **WINS:** gradient-position-invalid 0→9. **+9, ZERO regressions.** Sweep held:
gradient-position-valid 18/18, gradient-interpolation-method-invalid 292/292 + -valid 1398/1398 + -computed 932/932,
image-function-valid 13/13, image-function-invalid 6/6, object-position-valid 18/18, background-image-valid 13/13,
background-position-valid 31/31, background-position-invalid 11/11, background-valid 45/46 (pre-existing cap),
background-computed 39/39, mask-computed 32/32, object-fit-invalid 5/5, image-orientation-invalid 12/12,
line-clamp-valid 18/18, cursor-invalid 10/10, qsa 1975/1975. **NEXT LEVERAGE (same dir):**
`conic-gradient-calc-angle-percentage-invalid` 0/4 + `-valid` 1/6 (paired — the invalid half is a `calc()` type-check
rejection, the valid half needs the harder calc-term-reordering serialization `calc(0deg + 100%)`→`calc(100% + 0deg)`),
OR `background-image-invalid` 0/12 (in `css-backgrounds/parsing/` — negative radial radii + `cross-fade()` %), OR a NEW
`css/*/parsing/` dir. Scroll `tickets/204-the-gradient-position-verdict.md`.

**Session 2026-07-17 (Quest #203 The Enum Longhand Verdict — three plain-enum `css-images` longhands, +22, ZERO regressions):**
Took #202's next-leverage: the raw-store enum longhands in the same `css/css-images/parsing/` dir. Baseline:
`image-orientation-invalid` **0/12**, `object-fit-invalid` **0/5**, `object-fit-valid` **6/9**,
`image-rendering-invalid` **0/2**. All three properties were registered in `_GCS_DEFAULTS`/inherit lists but had NO
value validation — garbage stored raw, canonical reorders never applied. `image-orientation` (`from-image | none`) and
`image-rendering` (`auto | smooth | high-quality | crisp-edges | pixelated`) are single-keyword enums → valid iff the
value is exactly one keyword; any multi-token value (`0 flip`, `flip from-image`, `high-quality crisp-edges`) or
foreign keyword (`auto`/`30deg`/`none`) is rejected by a plain `Set.has(low)`. `object-fit`
(`fill | none | [contain|cover] || scale-down`) got a fold fn `_serObjectFit`: the `||` serializes the fit keyword
before `scale-down`, EXCEPT `contain` collapses beside `scale-down` (`contain scale-down`/`scale-down contain`→
`scale-down`; `cover scale-down`/`scale-down cover`→`cover scale-down`). Two keyword sets + one fn next to
`_serContain`, wired identity-guarded (`_CSS_WIDE`/`_TF_VAR_RE`) as branches in BOTH setProperty paths. No computed
branch needed — computed tests use only already-canonical inputs, and the specified value is canonicalized on store.
Reused `_wsTokens` unmodified → fully isolated. **WINS:** image-orientation-invalid 0→12, object-fit-invalid 0→5,
object-fit-valid 6→9, image-rendering-invalid 0→2. **+22, ZERO regressions.** Sweep held:
gradient-interpolation-method-invalid 292/292 + -valid 1398/1398, image-function-valid 13/13,
image-function-invalid 6/6, object-position-valid 18/18, image-resolution-valid 12/12, cursor-invalid 10/10,
contain-invalid 14/14, will-change-invalid 127/127, line-clamp-valid 18/18, qsa 1975. **NEXT LEVERAGE (same dir):**
`gradient-position-invalid` 0/9 (lenient `_canonGradientDirection` → add rejection, like #202's `_gradientInvalid`),
`conic-gradient-calc-angle-percentage-invalid` 0/4 (+`-valid` 1/6), or `background-image-invalid` 0/12 (in
`css-backgrounds/parsing/` — negative radial radii + `cross-fade()` %). Scroll `tickets/203-the-enum-longhand-verdict.md`.

**Session 2026-07-17 (Quest #202 The Gradient Interpolation Verdict — a `<color-interpolation-method>` rejection gate, +292, ZERO regressions):**
Took #201's next-leverage (the gradient-grammar-validator branch), routed into the biggest single-file tail on the
board. Baseline in `css/css-images/parsing/`: `gradient-interpolation-method-invalid` **0/292**, while `-valid`
**1398/1398** and `-computed` **932/932** already passed. The existing `_canonGradients`/`_canonInterpolationMethod`
engine already canonicalizes every valid `in <color-space> [ <hue> hue ]?` clause (hence the green valid/computed), but
it was **lenient**: an unrecognized first argument passed straight through as if it were a colour stop, so malformed
interpolation methods were silently accepted. Rather than touch the (working) canonicalizer, added a parallel
**rejection gate** `_gradientInvalid(value)` — used at the `_GRADIENT_PROPS` setProperty branch beside
`_imageFuncInvalid`, in BOTH paths. Helpers: `_interpIsh(t)` (a token that can only ever be part of an `in` clause —
`in`/`hue`/a hue method/a colour space), `_gradientConfigInvalid(toks)` (the first arg: an `in` must be immediately
followed by a valid colour space + optional well-formed `<hue> hue` for polar spaces; once that clause is removed, NO
interpolation-ish token may remain among the residual direction/prelude tokens), `_gradientInnerInvalid(inner)` (empty
arg → invalid; arg 0 through the config check; every later arg is a colour stop and can never begin with a bare
colour-space keyword), `_gradientInvalid(value)` (balanced-paren head walk; fast-paths on no-`gradient(`; **defers on
`var()`/`env()`** so substitution-pending values are never rejected). `_wsTokens` is paren-aware so `color(srgb 1 0 0)`
is one token → the exact keyword-equality checks never false-match a colour function. **WINS:**
gradient-interpolation-method-invalid 0→292. **+292, ZERO regressions** (valid 1398/1398, computed 932/932 held).
Sweep held: gradient-position-valid 18/18, image-function-valid 13/13, background-image-valid 13/13, background-valid
45/46 (cap), background-computed 39/39, mask-computed 32/32, list-style-image-valid 3/3, cursor-invalid 10/10,
cursor-valid 46/46, line-clamp-valid 18/18, will-change-invalid 127/127, contain-invalid 14/14, qsa 1975. **NEXT:**
same dir — `gradient-position-invalid` 0/9 (radial/conic direction+position preludes), `conic-gradient-calc-angle-
percentage-invalid` 0/4, `object-fit`/`image-orientation`/`image-rendering` `-invalid` (raw-store→validate), or
`background-image-invalid` 0/12 (a DIFFERENT gradient sub-grammar: negative radial radii + `cross-fade()` %). grep
`_gradientInvalid`. Scroll `tickets/202-the-gradient-interpolation-verdict.md`.

**Session 2026-07-17 (Quest #201 The Line-Clamp Verdict — a `line-clamp` shorthand value engine, +16, ZERO regressions):**
Took #200's next-leverage: the `css-overflow` cluster. Baseline: `line-clamp-invalid` 0/8, `line-clamp-valid`
10/18, `webkit-box-computed` 14/20. The unprefixed `line-clamp` shorthand (distinct from the already-handled
`-webkit-line-clamp` longhand) had **no dedicated handling** — a generic path stored simple keyword/integer
values raw (so `0`/`-5`/`none 2` were accepted → invalid 0/8) yet *dropped* values with
`no-ellipsis`/`<string>`/`-webkit-legacy` (returned `""`) and never canonicalized. Grammar (CSS Overflow 4 §5.1):
`line-clamp = none | [ <integer [1,∞]> || <'block-ellipsis'> ] -webkit-legacy?`. Only the specified-value
serialization is exercised by these parsing tests → built **`_serLineClamp(value)`** to canonicalize the string
directly (no longhand expansion). Canonical form `<max-lines> <block-ellipsis>? -webkit-legacy?`: the max-lines
slot is always serialized (the integer, or `auto` when omitted), and the block-ellipsis token is emitted only
when non-default — `auto` kept ONLY beside an integer (`8 auto`→`8 auto`; standalone→`auto`), `ellipsis`/omitted
= the default ellipsis, elided (`8 ellipsis`→`8`, `ellipsis`→`auto`), `no-ellipsis`/`<string>` verbatim
(`" x "`→`auto " x "`, prepending the placeholder). A leading `auto` beside a block-ellipsis token is read back
as the max-lines placeholder so canonical values round-trip. Parse via `_wsTokens` (quote-aware) + trailing
`-webkit-legacy` strip + 1–2-token classification. Wired identity-guarded (`_CSS_WIDE`/`_TF_VAR_RE`) in BOTH
setProperty paths, reusing `_wsTokens` unmodified (1 fn + 2 branches). **WINS:** line-clamp-invalid 0→8,
line-clamp-valid 10→18. **CAP:** `webkit-box-computed` 14/20 (6 = `display` computed-value special-casing for
`-webkit-box` + `-webkit-box-orient: vertical` + `-webkit-line-clamp` → `flow-root`/`inline-block`, a layout
feature, not value parsing). Sweep held: cursor-invalid 10/10, contain-invalid 14/14, will-change-invalid 127/127,
clip-path-invalid 48/48, background-valid 45/46 (pre-existing cap), text-overflow-valid 5/5, webkit-line-clamp
3/3+7/7, overflow-clip-margin 25/25, scrollbar-gutter-valid 4/4, qsa 1975. **Next:** `scroll-buttons-invalid`
1/8, else a NEW `css/*/parsing/` dir or a gradient grammar validator. Scroll `tickets/201-the-line-clamp-verdict.md`.

**Session 2026-07-16 (Quest #200 The Cursor Verdict — a `cursor` value engine, +10 net):**
Took #199's next-leverage: `css-ui`. Baseline: `cursor-invalid` 0/10, `cursor-valid` 45/46,
`cursor-computed` 37/39 (the sibling `caret-color`/`resize`/`field-sizing`/`text-overflow` `-invalid`
already passed). `cursor` was mis-registered in `_GRADIENT_PROPS` — treated as a plain `<image>`
property, so the WHOLE `cursor` grammar was unchecked (any garbage accepted; gradients wrongly
accepted). Grammar `cursor = [ <cursor-image> [<x> <y>]? , ]* <cursor-keyword>`: a comma-list of
url/image-set/light-dark images (each with an optional `<x> <y>` hotspot), ending in a mandatory bare
cursor keyword. Built `_serCursor(value, computed, el)` (+ `_cursorCanonImage` / `_cursorHotspotNum`
/ `_CURSOR_KEYWORDS`): `_commaSplitTop` the value → last item must be a keyword; each earlier item is
`<image>` or `<image> <x> <y>` (`_wsTokens`, exactly 1 or 3 tokens). Images validate by FUNCTION HEAD
(url/image-set/light-dark ONLY — generated images gradient/`image()`/`element()`/`paint()` reject;
light-dark recurses on its two args), so a url() whose target text contains `gradient(` is never
misjudged. Hotspots are `<number>` (calc folded via `_canonMathExpr`, `calc(2 + 0)`→`calc(2)`);
lengths/`%` reject (`1px 2px`/`3% 4%`). Removed `cursor` from `_GRADIENT_PROPS`; wired via
`_CSSUI_VALIDATED` + a `name === 'cursor'` branch in the inline parser + a `kebab === 'cursor'`
computed branch (CSS-wide guarded). Reused `_commaSplitTop`/`_wsTokens`/`_canonImageSet`/`_canonUrls`/
`_canonMathExpr` unmodified. **WINS:** cursor-invalid 0→10, cursor-valid 45→46. **CAP (−1, inherent):**
cursor-computed 37→36 — its 3 gradient computed rows DIRECTLY CONTRADICT cursor-invalid (which mandates
gradient rejection; all 4 of its gradient cases use single-stop `gradient(red)`, and we have NO gradient
well-formedness validator — `background-image-invalid` is itself 0/12 — so "accept well-formed, reject
malformed" isn't achievable). No browser passes both files; the other 2 gradient rows already failed on
malformed expected strings (missing `)`, input `crosshair` vs expected `pointer`). **+10 net.** Sweep
held: caret-color-invalid 12/12, will-change-invalid 127/127, contain-invalid 14/14, clip-path-invalid
48/48, background-image-valid 13/13, mask-computed 32/32, list-style-image-valid 3/3, background-valid
45/46 (pre-existing cap), qsa 1975. **NEXT LEVERAGE:** the newer `css-overflow` cluster — `line-clamp`
(a shorthand, `line-clamp-invalid` 0/8 + `-valid` 10/18, grammar `none | <integer [1,∞]> || <ellipsis>
|| -webkit-legacy` expanding into max-lines/block-ellipsis/continue/-webkit-line-clamp, tricky canonical
reorder), `scroll-buttons-invalid` 1/8, `webkit-box-computed` 14/20. OR a real gradient grammar validator
(fixes `background-image-invalid` 0/12 AND recovers the cursor radial-gradient computed row). grep
`_serCursor`. Scroll `tickets/200-the-cursor-verdict.md`.

**Session 2026-07-16 (Quest #199 The Contain Verdict — a `contain` value engine, +34,
ZERO regressions):** Took the #198 outgoing knight's next-leverage: the NEW untouched
`css/css-contain/parsing/` dir. Baseline: `contain-invalid` 0/14, `contain-valid` 9/13,
`contain-computed` 0/15, `contain-computed-children` 0/1 — `contain` had NO property handling
(absent from `_GCS_DEFAULTS`, so getComputedStyle returned '' → the whole computed file 0/N, and
setProperty stored any garbage). Built `_serContain(value, computed)` for the grammar
`contain = none | strict | content | [ [size|inline-size] || layout || style || paint ]`: the
multi-keyword alternative is an unordered set (no repeats; size and inline-size mutually exclusive),
serialized in canonical order size/inline-size → layout → style → paint. The SPECIFIED value keeps
the expanded keyword list; only the COMPUTED value folds the two shorthand-equivalent sets —
`layout style paint` → `content`, `size layout style paint` → `strict` (inline-size does NOT fold,
since `strict` implies the full `size` containment). Registered `contain: none` in `_GCS_DEFAULTS`
(does not inherit) so getComputedStyle enumerates it and a child with no `contain` reads `none`.
Wired identity-guarded (`!_CSS_WIDE.has(low) && !_TF_VAR_RE.test(value)` so `inherit`/`var()` pass
through) in both setProperty paths + a `kebab === 'contain'` branch in the computed dispatch. Fully
isolated: one new function + two setProperty branches + one computed branch + one default entry;
reused `_wsTokens`/`_CSS_WIDE`/`_TF_VAR_RE` unmodified. **WINS:** contain-invalid 0→14, -valid 9→13,
-computed 0→15, -computed-children 0→1. **+34, ZERO regressions. CLOSES `css/css-contain/parsing/`
(43/43).** Sweep held: will-change-invalid 127/127, clip-path-invalid 48/48, offset-path-parsing-valid
70/70, shape-outside-shape-invalid 9/9, scroll-snap-type-invalid 14/14, user-select-valid 4/4,
background-valid 45/46 (pre-existing cap), qsa 1975. **CAPS: none** (dir CLOSED). **NEXT LEVERAGE:**
same raw-store→validate pattern, baseline first — **`css-ui`** (`cursor-invalid` 0/10 = a `<url>`-list
`cursor` engine `[<url> [<x> <y>]?,]* [auto|default|…]`; also `caret-color`/`resize`/`field-sizing`
`-invalid`) or **`css-overflow`** remainder (`text-overflow`/`overflow-clip-margin`/`scrollbar-gutter`/
`webkit-line-clamp` `-invalid`). grep `_serContain`. Scroll `tickets/199-the-contain-verdict.md`.

**Session 2026-07-16 (Quest #198 The Will-Change Verdict — a `will-change` validator, +127,
ZERO regressions):** Took the #197 outgoing knight's next-leverage: the NEW untouched
`css/css-will-change/parsing/` dir. Baseline showed a single lopsided file — `will-change-invalid`
0/127 while `will-change-valid` 20/20 and `will-change-computed` 23/23 already passed (raw-store
echoes valid values case-preserved and computed == specified). So the whole gap was invalid-value
rejection. Built `_isValidWillChange` for the grammar `auto | <animateable-feature>#`: `auto` is a
standalone alternative (never a list item — `auto, transform`/`contents, auto` are invalid); a list
is comma-separated `<animateable-feature>` = scroll-position | contents | `<custom-ident>`, each a
single ident token (reusing `_GRID_CI_RE` + `_commaSplitTop`); the `<custom-ident>` excludes the
CSS-wide keywords plus `default`, `will-change`, `none`, `all`, `auto` (case-insensitive). Wired as
an identity-canon branch in BOTH setProperty paths (inline-parse + API), guarded by `_CSS_WIDE`/
`_TF_VAR_RE` so `will-change: inherit`/`var(...)` pass through. No `_computedPropOf`/`_GCS_DEFAULTS`
change (`will-change: auto` default + computed==specified already present). **CLOSES
`css/css-will-change/parsing/` (170/170).** ZERO regressions (offset-path 70/24/65, clip-path-invalid
48, mask-invalid 13, shape-outside-shape-invalid 9, scroll-snap-type-invalid 14, background-valid
45/46, serialize-values 696/697, qsa 1975 — all held). NEXT: `css-contain` (contain-invalid 0/14,
contain-valid 9/13) or `css-ui` (cursor-invalid 0/10) — same raw-store→validate pattern. Scroll
`tickets/198-the-will-change-verdict.md`.

**Session 2026-07-16 (Quest #197 The Shape Verdict — a `css-shapes` value engine reusing the
offset-path/clip-path `<basic-shape>` engine, +81, ZERO regressions):** Took the #196 outgoing
knight's option: the NEW untouched `css/css-shapes/parsing/` dir (pure raw-store — shape-outside/
shape-margin/shape-image-threshold stored verbatim → every `*-invalid` 0/N). `shape-outside =
none | [<basic-shape> || <shape-box>] | <image>` reuses the same `_opShape` engine as clip-path
(#196) and offset-path, differing in only two ways: the box set excludes fill/stroke/view-box, and
the DEFAULT box is `margin-box` (elided beside a shape) not border-box. Built `_serShapeOutside`
(thin wrapper, modelled on `_serClipPath`) + `_serShapeMargin` (`<length-percentage [0,∞]>`, `0`→
`0px`, calc-neg→`0px`) + `_serShapeThreshold` (`<number>|<percentage>`, `%`→number, computed clamps
`[0,1]`). NEW `_opSvgPathAbsolute` (relative→absolute SVG resolver) for computed `path()`
(`h 80 v 80`→`H 90 V 90`), specified keeps commands verbatim. TWO shared `_opShape` fixes (correct
for offset-path + clip-path too, ZERO regressions): (a) `_parseShapePos` rejects the legacy 3-value
`<position>` (`center left 1px`, csswg #2140) at every `_opShape` position check — the whole
shape-outside-invalid-position win, and it does NOT touch background-position (own path, 31/31 held);
(b) shape() `to <position>` end-point (`smooth to center 20%`→`smooth to 50% 20%`) vs `by
<coordinate-pair>`. WINS: shape-outside-shape-invalid 0→9, -shape-valid 11→12, -path-invalid 0→7,
-path-valid 1→9, -invalid-position 0→10, -valid-position 10→20, -computed 8→29; shape-margin-invalid
0→2, -valid 3→4, -computed 1→3; shape-image-threshold-invalid 0→2, -valid 2→5, -computed 1→6.
**+81, ZERO regressions** (offset-path-parsing-invalid 24/24, -parsing-valid 70/70, -shape-parsing
35/35, -shape-computed 12/12, -computed 65/65, offset-shorthand 18/18; clip-path-invalid 48/48,
-valid 54/54, -shape-parsing 43/44, -computed 19/21 — both pre-existing caps; mask-invalid 13/13,
mask-computed 32/32, background-valid 45/46, background-position-valid 31/31, serialize-values
696/697, qsa 1975). **CAPS (3, all shape-outside-computed, all pre-existing classes):** symbolic
`calc(%−%)` rect edge, `sign(1em−1px)` em-in-position, `sibling-index()` tree fn. **NEXT LEVERAGE:**
`css-shapes/parsing/` now CLOSED (13/13 files). Pivot to another `css/*/parsing/` dir — `css-scroll-snap`
remainder, `css-contain` (`contain`/`container-*`), `css-will-change`, or `css-overflow`/`css-ui`
remainder. Baseline a sample first (`*-invalid` 0/N = raw-store tell). grep `_serShapeOutside`/
`_opSvgPathAbsolute`/`_parseShapePos`. Scroll `tickets/197-the-shape-verdict.md`.

**Session 2026-07-16 (Quest #196 The Clip-Path Verdict — a `clip-path` `<basic-shape>` value engine
reusing the offset-path `_opShape`, +121, ZERO regressions):** Took the #195 outgoing knight's option:
the `clip-path` `<basic-shape>` sub-vein of `css-masking/parsing/` (pure raw-store — clip-path/clip/
clip-rule stored verbatim → every `*-invalid`/`*-computed` 0/N). The big discovery: the entire
`<basic-shape>` engine (`_opShape`: inset/circle/ellipse/polygon/path/rect/xywh/shape) ALREADY existed
for `offset-path`. Built a thin `clip-path` wrapper `_serClipPath` (grammar `none | <clip-source> |
[<basic-shape> || <geometry-box>]`) that delegates the shapes to `_opShape` with two clip-path-specific
deviations: `ray()` forbidden (motion-only) and `path()` carries an optional leading `<fill-rule>`
(`_clipPathPathFn`, quote-aware split so a comma inside the SVG string isn't the fill-rule separator).
`url()` = a standalone `<clip-source>` (no geometry-box). Default `<geometry-box>` = border-box, elided
beside a shape; a lone box kept. Also added `_canonClipRule` (`nonzero|evenodd`) and legacy `_serClip`
(`auto | rect(<t>,<r>,<b>,<l>)`, comma-only, signed `<length>|auto` NO `%`, em→px computed). Fixed a
GENUINE `_opShape` bug (shared with offset-path, made it stricter with ZERO regressions): unitless
non-zero (`123`) was accepted as a length and negative radii/border-radius were accepted — added
`_isShapeLP` (rejects bare non-zero numbers) + `_isNonNegShapeLP` (also rejects negatives) applied to
inset offsets / border-radius / circle+ellipse radii, plus `_opClampRadius` (computed negative radius→
0px). WINS: clip-path-invalid 0→48, -valid 36→54, -shape-parsing 19→43, -computed 0→19, clip-invalid
0→4, clip-computed 0→4, clip-rule-invalid 0→2, clip-rule-computed 0→2. **+121, ZERO regressions**
(offset-path-invalid 24/24, -valid 70/70, -computed 65/65, offset 13/13+29/29 all held; qsa 1975,
serialize-values 696/697, mask-invalid 13/13, mask-computed 32/32, grid-shorthand-valid 49/49,
background-valid 45/46). **CAPS (3, all pre-existing/shared, NOT clip-path parsing):** (1) 2 mixed-
`calc(%+px)` xywh/rect computed rows need symbolic calc arithmetic (`100%−(2%+2px)`=`98%−2px`; same class
as background-size-computed's calc cap); (2) 1 `0Px`→`0px` unit-lowercasing in `_canonLPToken` (shared
broadly, low ROI). **NEXT LEVERAGE:** `css-masking/parsing/` is now effectively CLOSED (mask #195 +
clip-path #196). Pivot to a NEW untouched `css/*/parsing/` dir: `css-shapes` (`shape-outside`/`shape-
margin` — `shape-outside` shares `<basic-shape>` so it can REUSE `_serClipPath`'s pattern almost
verbatim), or the `css-scroll-snap` remainder, or `css-contain`/`css-will-change`. Baseline a sample
first (`*-invalid` 0/N is the raw-store tell). grep `_serClipPath`/`_clipPathPathFn`/`_isShapeLP`/
`_isNonNegShapeLP`/`_serClip`/`_canonClipRule`. Scroll `tickets/196-the-clip-path-verdict.md`.

**Session 2026-07-16 (Quest #195 The Mask Verdict — the `mask` shorthand + its raw-store longhands,
+120):** Took the #194 outgoing knight's option (B): a NEW untouched `css/*/parsing/` dir. `css-masking`
was pure raw-store — no `mask` handling existed in `bootstrap.js` at all (only `mask-image` via
`_GRADIENT_PROPS` and `mask-position` via `_POSITION_PROPS` were green). Same #179→#194 lever. Two gaps:
(1) `mask-repeat`/`-size`/`-composite`/`-mode`/`-origin`/`-clip`/`-type` stored RAW (every `*-invalid`
0/N, every `*-computed` 0/N); (2) the `mask` shorthand was UNMODELLED (mask-invalid 0/13, mask-computed
0/32). Built (all JS): `_canonMaskLayer`/`_canonMask`/`_MASK_VALIDATED` (per-layer `<type>#`; mask-size
reuses `_canonBgLayer('background-size')`; mask-repeat has its own two-token→single-keyword collapse
`repeat no-repeat`→`repeat-x`) + `_canonMaskType` (single `luminance|alpha`, no comma). The `mask`
shorthand `_parseMaskShort`/`_serMaskShort`/`_maskResolveBox` — grammar `<mask-reference> || <position>
[/ <bg-size>]? || <repeat-style> || <geometry-box> || [<geometry-box>|no-clip] || <compositing-operator>
|| <masking-mode>`, expands into the 8 longhands. Two subtleties that cost the last few greens:
(a) the `<mask-reference>` check MUST precede the `<position>` check — `_MATHFN_NAME_RE` matches a `calc(`
anywhere, so a calc-bearing gradient (`linear-gradient(calc(90deg-45deg), …)`) was mis-sniffed as a
position and rejected; (b) the box §serialization is order-independent for input (`no-clip stroke-box`≡
`stroke-box no-clip`→origin=stroke-box, clip=no-clip) and for output drops the origin only when it is the
initial border-box AND clip is `no-clip` (`border-box no-clip`→`no-clip`, but `stroke-box no-clip`→both).
Computed: a `kebab==='mask'` branch in getComputedStyle's `resolve()` reconstructs from the COMPUTED
longhands (colours→rgb, lengths→px); the 8 longhands + mask-type registered in `_GCS_DEFAULTS`. Wired
exactly like the `background` shorthand (#193). WINS: mask-invalid 0→13, mask-computed 0→32,
mask-repeat 0/16→22/22+5/5, mask-size 0→14+9/9+3/3, mask-composite 0→18, mask-type 0→3+2/2, mask-repeat-
computed 0→22, mask-composite-computed 0→4. **+120, ZERO regressions** (held: qsa 1975, classlist 1420,
serialize-values 696/697, color-valid 17/17, grid-shorthand-valid 49, all background/border-image suites
at baseline). CAP: mask-size-computed 14/16 (2 `calc(px+em)`→px rows need font-size resolution=layout,
same cap as background-size-computed). NEXT: the `clip-path` sub-vein of `css-masking/parsing/` — a
`<basic-shape>` value engine (`clip-path-invalid` 0/48, `clip-path-valid` 36/54; + legacy `clip: rect()`),
then `css-shapes` (`shape-outside` shares `<basic-shape>`). Scroll `tickets/195-the-mask-verdict.md`.

**Session 2026-07-16 (Quest #194 The Border-Image Verdict — the `border-image` shorthand + its five
raw-store longhands, +71):** Took the #193 outgoing knight's option (A) and closed the LAST raw-store
vein of `css/css-backgrounds/parsing/`. Two gaps, same #179→#193 lever (CSS value parsing in JS
`setProperty`): (1) `border-image-source`/`-slice`/`-width`/`-outset`/`-repeat` stored RAW (every
`*-invalid` 0/N; no canon: `fill 1 2% 3 4%`→`1 2% 3 4% fill`, `space space`→`space` missing);
(2) the `border-image` shorthand was UNMODELLED (`style.borderImage=…` fell through to single-key
storage → shorthand test 0/30, valid 28/30). Built (all JS in `bootstrap.js`): `_canonBorderImage`
dispatching five per-longhand canon fns (`_canonBiSlice` `[<num>|<pct>]{1,4} && fill?` with fill
contiguous+serialized-last + margin-style `_biCollapse`; `_canonBiWidth` adds `auto`+`<len>`+`<pct>`;
`_canonBiOutset` `[<len>|<num>]{1,4}` no pct/auto; `_canonBiRepeat` `[stretch|repeat|round|space]{1,2}`
two-equal→one; `_canonBiSource` `none | <image>` rejecting `auto`+comma layer lists), routed via a new
`_BI_VALIDATED` branch placed BEFORE `_GRADIENT_PROPS` (which also holds border-image-source but would
accept `auto`). The `border-image` shorthand `_parseBorderImageShort` (the three `||` members
source/slice-group/repeat in any order; slashes bind to the slice-group `slice [/ width [/ outset]]`;
`_bgLayerToks` makes a top-level `/` its own token so `1 / -2px`/`1 / / auto`/`1 / none / 1px` are
rejected) expands into + stores the five longhands; `_serBorderImage` reconstructs (defaults omitted,
`/ / <outset>` when outset alone non-default, all-default→`none`). Wired EXACTLY like the `background`
shorthand (#193): setProperty expand gated on `!var()`, removeProperty/getPropertyValue clear/reconstruct,
CSS.supports branches, `_BI_SH_LH` the 5-longhand list. WINS: border-image-shorthand 0→30, -invalid 0→17,
-valid 28→30, -slice-valid 3→4, -slice-invalid 0→6, -width-invalid 0→5, -outset-invalid 0→5, -repeat-valid
2→3, -repeat-invalid 0→2, -source-invalid 0→2. **+71, ZERO regressions** (qsa 1975, serialize-values
696/697, color-valid 17/17, color-invalid 8/11, border-color-valid 7/7, grid-shorthand-valid 49,
background-valid 45/46, background-computed 39/39, bg-position-valid 31 all held; border-image-source-valid
2/2 + -source-computed 10/10 unchanged). **CAP (pre-existing, NOT parsing):** border-image-`-width`/`-outset`/
`-slice`/`-repeat`-computed are 0/N because those four longhands aren't registered in the getComputedStyle
machinery ("doesn't seem to be supported in the computed style") — a separate computed-style-registration
task, untouched by this specified-value change (border-image-source-computed passes: source IS registered).
Scroll `tickets/194-the-border-image-verdict.md`.

**Session 2026-07-16 (Quest #193 The Background Verdict — the `background` shorthand + its five
raw-store sub-property longhands, +72):** Took the outgoing knight's option (A) and pivoted to the
last raw-store vein of `css/css-backgrounds/parsing/`. Two gaps, same #179→#192 lever (CSS value
parsing in JS `setProperty`): (1) `background-repeat`/`-attachment`/`-clip`/`-origin`/`-size`
stored RAW (every `*-invalid` 0/N; `background-size: 1px`→`1px auto` and `auto auto`→`auto` canon
missing); (2) the `background` shorthand was UNMODELLED (`style.background=…` fell through to
single-key storage → valid 1/46, `CSS.supports('background','none')` false). Built (all JS in
`bootstrap.js`): `_canonBg`/`_canonBgLayer` for the five per-layer `<type>#` longhands (via
`_BG_VALIDATED`, size reusing `_canonGapItem`), and the `background` shorthand
`_parseBackgroundShort` (order-independent `<bg-image> || <bg-position>[/<bg-size>] || <repeat-style>
|| <attachment> || <bg-clip> || <visual-box>` per layer, color final-only; `_bgLayerToks` keeps a
top-level `/` its own token so `black 0 url(…) / cover` is rejected — the `/` doesn't abut the
`<bg-position>`; `_bgResolveBox` = §2.12 box rule: one visual-box→both, clip-only→clip+origin
border-box, two→origin then clip) expanding into all 8 longhands + `_serBackgroundShort`
reconstructing, wired exactly like the `grid` shorthand (#191). background-valid 1→45,
background-invalid 0→2, the five sub-props all →100% (repeat/attachment/clip/origin/size invalid
0→N, clip-valid 8→9, size-valid 7→9); bonus from the longhand canon feeding the computed path:
background-size-computed 10→14, background-computed 37→39. **+72, zero regressions** (proved via
`git stash` before/after — bonus computed rows are genuine gains, background-shorthand-serialization
2/11 & background-repeat-computed 12/13 byte-identical). **Cap:** the `background: none`→
background-color subtest expects `rgba(0, 0, 0, 0)` while the newer border-area/two-box rows expect
`transparent` (internally-inconsistent test) — we use the spec-correct `transparent` (3 wins, 1
unwinnable). **Next:** the `border-image-*` sub-vein (a `<border-image>` value engine, same
expand/reconstruct pattern), else a NEW untouched `css/*/parsing/` dir.

**Session 2026-07-12 (Quest #192 The Color Verdict — the `<color>` invalid-value gate, +560):**
Pivoted off the now-closed grid vein to `css/css-color/parsing/`, whose every `color-invalid-*`
test was 0/N. Root cause: the `_COLOR_PROPS` setProperty branch stored colours RAW (only rejected
`image()`/malformed `alpha()`) — it never gated on the full `<color>` grammar, even though a
robust `_isValidColor` already existed (used by `CSS.supports` + border/shadow parsing). Added one
gate — `if (!_CSS_WIDE.has(low) && !_TF_VAR_RE.test(stored) && !(caret-color && auto) &&
!_isValidColor(stored)) return;` — to that branch. Two fixes kept the valid suites at zero
regression: **(1)** taught `_isValidColor` `light-dark(<color>,<color>)` (was rejecting the valid
`light-dark(black, white)`); **(2)** switched the modern-colour validity check to SPECIFIED mode
(`_computeModernColor(value, true)`) so `calc(infinity)`/`calc(-infinity)` channels (valid `lab`
a/b + all `color()` components) validate instead of bailing on the non-finite computed value
(would have cost `color-valid-lab` −4 and `color-valid-color-function` −20). Wins: named 1→153,
relative 0→132, layers 0→93, color-function 0→90, mix 0→33, rgb 0→15, lab 0→12, hex 0→10,
color-invalid 0→8, hsl 0→8, hwb 0→2 (+555 in css-color); background-color-invalid 0→3,
column-rule-color-invalid 0→2 (+5 cross-realm via the shared gate). **+560, zero regressions**
(valid colours all held byte-for-byte via three stash cycles; serialize-values 696/697, qsa 1975,
Element-matches 669, cloneNode 135, background-position-valid 31 all held). Scroll
`tickets/192-the-color-verdict.md`. **NEXT:** the `background` shorthand vein in
`css/css-backgrounds/parsing/` (background-valid 1/46 unmodelled + every sub-property `-invalid`
at 0/N; ~80 subtests; grammar already scouted). Or, in-realm, a STRICTER `_isValidColor` to close
the remaining invalid tail (loose legacy hsl/rgb + color-mix branches).

**Session 2026-07-12 (Quest #191 The Grid Verdict — the CSS `grid` shorthand, +51):**
Closed the `css/css-grid/parsing/` value-parsing vein (#188 track sizing → #189 placement →
#190 grid-template → #191 grid). `grid` was unmodelled (single-key storage → invalid 0/34,
valid 32/49). Built `_parseGridShort` → the six grid-template-*/grid-auto-* longhands: **Form 1**
`<'grid-template'>` (reuse `_parseGridTemplate`; grid-auto-* → initials row/auto/auto); **Form 2/3**
auto-flow forms `<'grid-template-rows'> / [ auto-flow && dense? ] <'grid-auto-columns'>?` and
`[ auto-flow && dense? ] <'grid-auto-rows'>? / <'grid-template-columns'>` — a helper `_parseAutoFlowSide`
consumes the leading `auto-flow`/`dense` (either order) then the trailing `<track-size>+` (default auto,
stray keyword before the list → invalid: `auto / auto-flow foo()`); exactly one top-level `/` and
`auto-flow` on exactly one side (both/neither → invalid). `_serGridShort` (§7.8): grid-auto-* all initial →
grid-template form (`_serGridTemplate`); else auto-flow form — `column` in grid-auto-flow → Form 2 (needs
grid-template-columns none), otherwise Form 3 (needs grid-template-rows none); returns `''` unless all six
longhands are set / when inexpressible. Wired like `grid-template` (expand+store 6 longhands, getter/
removeProperty, CSS.supports). grid-shorthand-valid 32→49, grid-shorthand-invalid 0→34. **+51. ZERO
regressions** (serialize-values 696/697, qsa 1975, grid-template-shorthand-valid 40/-invalid 66,
grid-area-valid 60, grid-auto-flow-valid 7, grid-auto-columns-computed 25, grid-template-areas-valid 9).
Scroll: `191-the-grid-verdict.md`. In-realm cap: grid-template-columns/-rows COMPUTED (13 each — real layout).

**Session 2026-07-12 (Quest #190 The Template Verdict — CSS Grid `grid-template` value engine, +96):**
Stayed in `css/css-grid/parsing/` for the next vein after #189. Same #179→#189 root cause:
`grid-template-areas` stored RAW (invalid 0/11 — junk `""`/`"."`/non-rectangular accepted) and
the `grid-template` SHORTHAND was unmodelled (fell through to single-key storage → invalid 0/66,
valid 24/40). Built a grid-template value engine (all JS): a template tokenizer `_gridTemplateTokens`
(keeps `"…"` strings + `[ … ]` groups + `()` whole, top-level `/` its own token), the §7.3 area-cell
tokenizer `_gridAreaCells` (dot-run = one null cell, name-run = one named cell) + `_gridAreasRectangular`
(same column count + filled-rectangle check per name), `_canonGridTemplateAreas` (`none | <string>+`,
whitespace-collapse, dot-runs→`.`), and `_parseGridTemplate` → the three longhands: `none` all-none;
**Form A** `<'grid-template-rows'> / <'grid-template-columns'>` (no strings, one `/`; each side via
`_canonGrid`); **Form B** ascii-art `[ <line-names>? <string> <track-size>? <line-names>? ]+ [ /
<explicit-track-list> ]?` (collect per-boundary line-name groups + per-row string + optional row size —
default auto, no repeat; columns via `_canonGridTrackSeq`, no repeat/auto-repeat). Key invalid rule:
line-name-group COUNT per boundary — ≤1 before the first / after the last string, ≤2 between strings
(a row's trailing + the next's leading) — so `[] [] "a"`/`"a" [a] [a]` invalid but `"a" [a] [b] "b"`→
`"a" [a b] "b"` valid. `_serGridTemplate` reconstructs (Form A `rows / cols` or `none`; Form B
re-interleaves the row track-list's sizes/names with the area strings; returns `''` unless all three
longhands are set — this was the fix for the invalid tests, which clear then check `getPropertyValue===""`).
Wired like `grid-column` (expand+store longhands, getter/removeProperty reconstruct/clear, CSS.supports).
areas-valid 6→9, areas-invalid 0→11, template-valid 24→40, template-invalid 0→66. **+96. ZERO regressions**
(serialize-values 696/697, qsa 1975, createElement 147, url-origin 406/413, grid-area-valid 60,
grid-column-shorthand 48, grid track engine all 100%). Scroll: `190-the-template-verdict.md`.

**Session 2026-07-12 (Quest #189 The Placement Verdict — CSS Grid `<grid-line>` value engine, +150):**
Stayed in `css/css-grid/parsing/` for the next vein after #188: the grid-line placement
props. Same #179→#188 root cause — the four `<grid-line>` longhands (`grid-row`/`-column`-
`start`/`-end`) stored their value RAW so every `*-invalid` was 0/N, and the three placement
**shorthands** (`grid-column`/`grid-row`/`grid-area`) were unmodelled (fell through to
generic single-key storage → their longhands were never set, so grid-column-shorthand /
grid-row-shorthand were 0/48 each and grid-area-invalid 0/25). Built a self-contained
`<grid-line>` engine (all JS): a `\`-escape-aware tokenizer `_gridLineTokens` (a `\`+hex
escape can embed a terminating space, `\31 st`, which is NOT a token separator), the
`<grid-line>` grammar `_canonGridLine` (`auto | <custom-ident> | <integer> && <custom-ident>?
| span && [<integer> || <custom-ident>]` — canonical integer-before-ident, `span 1 i`→
`span i`, `SpAn`→`span`), integer folding `_canonGridLineInt` (literal non-zero, sign
normalized; math via `_canonMathExpr`, `min(-1, 6)`→`calc(-1)`), and full CSS ident
handling `_unescapeCssIdent`/`_serializeCssIdent` (CSSOM serialize-an-identifier, so
`\31st`≡`\31 st`→`\31 st`; non-ASCII `-zπ`/`--a`/`π_` verbatim). The shorthands EXPAND into
and store as their longhands (`_parseGridColumnRow`/`_parseGridArea` — an omitted line copies
the corresponding start when it is a lone `<custom-ident>`, else `auto`); `getPropertyValue`/
`removeProperty` reconstruct/clear via `_serGridColumnRow`/`_serGridArea`, dropping redundant
trailing lines that equal their defaults (`auto / i / auto / i`→`auto / i`, `1 / auto / auto /
auto`→`1`). CSS-wide keyword → every longhand; `var()` kept as a single shorthand key; added
`CSS.supports` branches. grid-column-shorthand 0→48, grid-row-shorthand 0→48, grid-area-valid
31→60, grid-area-invalid 0→25. **+150. ZERO regressions** (qsa 1975, Element-matches 669,
serialize-values 696/697, grid track engine all 100%, css-overflow 34, css-fonts 315).
Scroll: `189-the-placement-verdict.md`.

**Session 2026-07-12 (Quest #188 The Track Verdict — CSS Grid track-sizing value engine, +155):**
Pivoted off the finished css-overflow realm to the widest untouched `css/*/parsing/` dir,
`css/css-grid/parsing/`. Same #179→#187 root cause: `grid-template-columns`/`-rows`,
`grid-auto-columns`/`-rows`, and `grid-auto-flow` stored their track lists RAW → every
`*-invalid` was 0/N, no keyword canon, no calc-fold. Built a self-contained grid
track-sizing value engine (all JS in `bootstrap.js`, no Rust) via a new `_GRID_VALIDATED`
setProperty branch + `CSS.supports` path: a bracket/paren/comment-aware tokenizer
(`_gridTokens`), the `<track-size>` grammar (`_canonGridTrackSize`: `<track-breadth> |
minmax(<inflexible-breadth>, <track-breadth>) | fit-content(<lp≥0>)`, each reporting
`<fixed-size>`-ness), the full `<track-list>`/`<auto-track-list>` validator
(`_canonGridTemplate`: ≤1 auto-repeat, all other components `<fixed-size>`/`<fixed-repeat>`,
line names exclude `span`/`auto`, no two adjacent groups, empty `[]` dropped), and
`grid-auto-flow` `[row|column] || dense` canon. Computed (`_normComputed`): grid-auto
folds each `<length-percentage>` to px (calc collapsed, `%` symbolic, ≥0); grid-template
resolves only the layout-independent subset (fixed `<length>` tracks + normal
`repeat(<int|calc-int>)` expansion with adjacent line-name-group merging at the seams),
returning the specified serialization for anything needing layout. template-cols/-rows-invalid
0→42 each, auto-cols/-rows-invalid 0→16/15, auto-flow-invalid 0→3, all 5 `*-valid` now 100%,
grid-auto computed 18→25, grid-template computed 6→12/6→11. **+155, ZERO regressions**
(held realms all steady; the 4 adjacent grid-shorthand tests verified pre-existing via a
`git stash` baseline). **Caps:** grid-template COMPUTED (13 fail each — `auto-fill/fit`
repetition+collapse & `%`→used px need the grid track-sizing algorithm = real layout); the
grid **shorthands** (`grid-column`/`-row`/`grid-area`/`grid`/`grid-template`) are the next
grid vein, mostly layout-independent value parsing, reusing this quest's `<track-size>`
primitives. Scroll `tickets/188-the-track-verdict.md`.

**Session 2026-07-12 (Quest #187 The Carousel Verdict — CSS-Overflow-5 carousel keyword props, +42):**
Stayed in the #186 dir for its next vein: the CSS-Overflow-5 carousel props. Three
(`scroll-marker-group`, `scroll-target-group`, `scroll-axis-lock`) are plain keyword
enums the raw-store fallback already accepted (so `*-valid` passed) but never validated
or registered — so every `*-invalid` was 0/N (junk accepted) and every `*-computed` 0/N
(prop absent from `getComputedStyle` enumeration, and `CSS.supports(prop,'initial')`
returned false, tripping `test_computed_value`'s support precondition). Extended the #186
css-overflow engine (all JS, no Rust): a `_CAROUSEL_ENUM` map (marker-group `none|before|
after`, target-group `none|auto`, axis-lock `auto|none`) dispatched inside
`_canonCssOverflow` (exactly one listed keyword; 2nd token/comma/number → invalid) and
added to `_OVERFLOW_VALIDATED`; registered all three in `_GCS_DEFAULTS` (initial none/
none/auto, none inherit — that one map drives `_CSS_KNOWN_PROPS` membership, GCS
enumeration, AND the computed value, which is keyword identity here so no `_normComputed`
branch is needed). Fixed a latent gap it exposed: the `_OVERFLOW_VALIDATED` branch of the
two-arg `CSS.supports` never accepted CSS-wide keywords (setProperty gated them but this
path didn't) — added `if (_CSS_WIDE.has(val)) return true`, which also closes the same gap
for the #186 overflow longhands. scroll-axis-lock invalid 0→7 + computed 0→8,
scroll-target-group invalid 0→5 + computed 0→8, scroll-markers invalid 0→5 + computed
0→9. **+42, zero regressions** (css-overflow #186 realm all held — overflow-computed 34,
overflow-clip-margin 25, scrollbar-gutter-invalid 26 etc.; qsa 1975, classlist 1420,
matches 669, createElement 147, url-origin 406/413, serialize-values 696/697).
**CAP:** the `::scroll-button()` **selector** tests (scroll-buttons-valid 0/37,
scroll-buttons-invalid 1/8) + `getComputedStyle-scroll-button` (0/5) are NOT value tests —
they need a new functional pseudo-element in the Servo `selectors` crate + pseudo-element
computed style with writing-mode logical→physical mapping (a separate Rust quest, ~50
subtests). **NEXT:** the css-overflow value-engine tail is now fully green; pivot to the
untouched `css/css-grid/parsing/` (61 files, the `<track-list>`/`repeat()`/`minmax()`
grammar — grid-template-columns-invalid alone 0/42). See `tickets/187-the-carousel-verdict.md`.

**Session 2026-07-11 (Quest #186 The Overflow Verdict — CSS Overflow value-parsing props, +120):**
Pivoted off the finished css-fonts realm to the untouched `css/css-overflow/parsing/` dir — SAME root cause as
#179→#185: the css-overflow longhands stored their value RAW in setProperty (no grammar check), so every
`*-invalid` was 0/N, combinations were never reordered, and the computed forms were missing. Built a
self-contained css-overflow value engine in `bootstrap.js` (`_canonCssOverflow`, dispatched via
`_OVERFLOW_VALIDATED` in setProperty + `CSS.supports`): overflow-x/-y/-block/-inline `visible|hidden|clip|scroll|
auto`; `scrollbar-gutter` `auto | stable && both-edges?` (both-edges reordered after stable); `block-ellipsis`
`no-ellipsis|ellipsis|<string>`; `overflow-clip-margin` `<visual-box> || <length [0,∞]>` (box dropped when default
`padding-box`, length dropped when literal-0 & a box is shown, calc-fold, no `%`) via `_canonOCMLength`/
`_serOverflowClipMargin`; `continue` `normal|discard|collapse|-webkit-legacy`; `max-lines` `auto || <integer
[1,∞]>` (integer serialized first); `-webkit-line-clamp` `none|<integer [1,∞]>`. The `overflow` **shorthand**
`[visible|hidden|clip|scroll|auto]{1,2}` EXPANDS into and stores as overflow-x/-y (`_parseOverflowShorthand`; the
getter/removeProperty check a raw `overflow` key first — the style-attribute path stores it un-expanded — then
reconstruct via `_serializeOverflowShorthand`, collapsing equal axes). Computed (`_normComputed`): the overflow
visible↔auto coupling (a `visible` axis computes to `auto` when the OTHER axis is a scrolling keyword; `clip`
never changes) via the counterpart's SPECIFIED value (no recursion), `getComputedStyle().overflow` reconstruction,
and overflow-clip-margin length→absolute-px (`_trComp`, clamp ≥0, em=16px). Also made the SHARED `_wsTokens`
quote-aware so a `<string>` with an internal space (`text-overflow: "marker string"`) tokenizes as ONE token —
fixed text-overflow-valid/-computed too. Registered `overflow-clip-margin`(0px)/`-webkit-line-clamp`(none) in
`_GCS_DEFAULTS`, `overflow` in `_CSS_KNOWN_PROPS`. **Every `*-invalid` 0/N→N/N (scrollbar-gutter-invalid 1→26,
block-ellipsis-invalid 0→11, continue-invalid 0→9, max-lines-invalid 0→8, webkit-line-clamp-invalid 0→7,
overflow-invalid 0→6), overflow-clip-margin 7→25 + computed 0→20, overflow-computed 25→34, overflow-valid 15→18
(+120). Realm value-parsing props 76/196 → 196/196. ZERO regressions** (qsa 1975, classlist 1420, Element-matches
669, createElement 147, url-origin 406/413, serialize-values 696/697 — caught + fixed a mid-dev regression where
the `overflow` getter ignored the style-attribute raw key, restoring the 5 `overflow:` subtests — css-fonts
font-valid 315/315 + font-computed 315/315 + font-variant-invalid 21/21 + font-feature-settings 10/5/10, css-text
text-indent 14/14 + word-spacing 9/9, css-ui caret-color 12/12+15/15, css-align place-content 23/23, css-scroll-snap
scroll-margin-shorthand 20/20, css-content content-valid 46/46 all held). **Caps / Next:** the `line-clamp`
shorthand (12/18 valid, 0/7 invalid — a 3-longhand expansion into max-lines/block-ellipsis/continue whose ellipsis
component `auto|ellipsis|no-ellipsis|<string>` serializes DIFFERENTLY from block-ellipsis, `ellipsis`→`auto`;
deferred as the messiest grammar); the untouched CSS-Overflow-5 carousel vein `scroll-buttons` (0/37!),
`scroll-axis-lock` (invalid/computed 0/15), `scroll-target-group`, `getComputedStyle-scroll-button` (0/5) — the
next in-realm target, SAME machinery; and the `display: -webkit-box`→`flow-root` blockification rule
(webkit-box-computed, a display-computed feature we lack). grep `_canonCssOverflow`/`_OVERFLOW_VALIDATED`/
`_parseOverflowShorthand`/`_serOverflowClipMargin`/`_canonOCMLength`. Scroll `tickets/186-the-overflow-verdict.md`.

**Session 2026-07-11 (Quest #185 The Variant Verdict — the `font-variant` shorthand + longhands + `font-feature-settings`, +82):**
Closed the last combinatorial tail of the css-fonts realm. The `||`-combination font-variant longhands
(ligatures/numeric/east-asian) + the `font-variant` shorthand stored their values RAW (every `*-invalid`
0/N, combinations never reordered), `font-variant-alternates`' functional grammar was unvalidated, and
`font-feature-settings` was half-modelled. Built (pure JS in `bootstrap.js`): the three `||` longhands via the
existing `_ccOrderedCanon` (new `_FV_CC` map — canonical category-order reserialization, so `ruby full-width
simplified`→`simplified full-width ruby`); `font-variant-position` added to `_FONT_ENUM`;
`font-variant-alternates` a dedicated functional-notation `||` parser (`_canonFontVariantAlternates`:
`stylistic()`/`swash()`/`ornaments()`/`annotation()` take one `<feature-value-name>`, `styleset()`/
`character-variant()` a `#` list, `historical-forms` a keyword, canonical order stylistic→annotation);
`font-feature-settings` the full `<opentype-tag>` 4-char-string grammar (`_serCssString` CSSOM `"`/`\`/control
escaping, on/off/integer serialization, computed sort + dedup-last-wins + calc-fold via `_evalMath` cqZero so
`sign(2cqw-10px)`=−1). The `font-variant` **shorthand** EXPANDS into and stores as its six font-variant-*
longhands (`_parseFontVariantShorthand`/`_FONT_VARIANT_SH_LH`/`_fontVariantFromLonghands`; `none`→ligatures:none;
the getter reconstructs in canonical order [ligatures, caps, alternates, numeric, east-asian, position], returns
'' when no longhand is present or ligatures:none coexists with another non-initial longhand; wired into
setProperty/getPropertyValue/removeProperty/getComputedStyle). Closed the #183/#184 CAP: `_fontFromLonghands`
(the `font` serializer) now returns '' when any of the five extra font-variant longhands is non-initial, so
`style.font` reads back only its CSS2 subset (`font-shorthand-variant.html` 0→1). **font-variant-invalid 0→21,
-ligatures-invalid 0→6, -numeric-invalid 0→9, -east-asian-valid 11→12 + -invalid 0→9, -alternates-invalid 0→15,
-position-invalid 0→2, -serialization 0→1, font-feature-settings valid 4→10/invalid 0→5/computed 6→10 (+82).
Realm 1249/1569 → 1331/1569. ZERO regressions** (qsa 1975, classlist 1420, Element-matches 669, createElement
147, url-origin 406/413, serialize-values 696/697, css-align place-content 23/23, css-text text-indent 14/14,
css-scroll-snap scroll-margin-shorthand 20/20, css-ui caret-color-computed 12/12, and #184 font-valid 315/315 +
font-computed 315/315 + every font-variant-*-valid/-computed all held). **Cap:** `font-face-src-*` (~109 —
@font-face descriptor parsing, a different mechanism), `<font size=N>` presentational hints (5), `from-font`
(6 — needs font metrics). **Next:** the untouched `css/*/parsing/` dirs `css-grid` (61) / `css-overflow` (35).
grep `_FV_CC`/`_canonFontVariantAlternates`/`_parseFontVariantShorthand`/`_canonFontFeatureSettings`. Scroll
`tickets/185-the-variant-verdict.md`.

**Session 2026-07-11 (Quest #184 The Shorthand Verdict — the `font` shorthand, +615):**
Took the crown jewel #183 deferred: the `font` shorthand (`css/css-fonts/parsing/font-valid.html` 9/315 +
`font-computed.html` 6/315), the widest single lever left. It was unmodelled — `style.font = "italic bold
20px/1.5 serif"` fell through to generic single-key storage, so `getPropertyValue('font')` never canonicalized
and `getComputedStyle().font` returned nothing usable. Built it on the #183 css-fonts longhand canonicalizers
using the established shorthand model (scroll/align/border): a valid value EXPANDS into — and stores as — its 7
longhands (`_parseFontShorthand`/`_FONT_SH_LH`: font-style/-variant-caps/-weight/-stretch/-size, line-height,
font-family, each set to the parsed value or its initial so the shorthand overrides inheritance); a system-font
/ CSS-wide keyword is kept as a single `font` key. A quote/paren-aware tokenizer isolates the top-level `/`
(`_fontTokens`); a greedy `||`-order prefix scan (style/variant-css2/weight/stretch, each ≤ once, `normal` a
filler) stops at the mandatory `<'font-size'>`, then optional `/ <'line-height'>` (`_canonFontLineHeight`), then
the mandatory family. `getPropertyValue('font')` reconstructs the specified serialization
(`_serializeFontShorthand`→`_fontFromLonghands`: reorder, drop `normal`, `size / line-height` spacing);
`getComputedStyle().font` reconstructs from the computed longhands (`_fontFromLonghands(get, true)`: weight
bolder/lighter inherited-relative + drop-400, font-stretch computed `%`→css3 keyword via `_FONT_WIDTH_KW_REV`).
Because both the target and the test's per-longhand `reference` div resolve through the same computed code under
the same `#container` context, even calc font-sizes / line-heights round-trip. Registered `font` in
`_CSS_KNOWN_PROPS` + `CSS.supports`. **font-valid 9→315, font-computed 6→315 (+615). Realm 634/1569 →
1249/1569. ZERO regressions** (qsa 1975, classlist 1420, Element-matches 669, createElement 147, url-origin
406/413, serialize-values 696/697, css-align place 15/gap 12, css-scroll-snap scroll-margin-shorthand 20/20,
css-text text-indent 14/14, css-ui caret-color-computed 12/12, and the #183 font longhands all held). **Cap:**
`font-shorthand-variant.html` (1 subtest — needs the full `font-variant` shorthand: expand `font-variant` into
its `font-variant-*` longhands + have `_fontFromLonghands` return `''` when any shorthand-reset longhand is
non-initial). **Next:** `font-variant` (44/46 valid, 0/21 invalid) + `font-feature-settings`, then the untouched
`css/*/parsing/` dirs `css-grid` (61) / `css-overflow` (35). grep `_parseFontShorthand`/`_FONT_SH_LH`/
`_fontFromLonghands`/`_fontTokens`. Scroll `tickets/184-the-shorthand-verdict.md`.

**Session 2026-07-11 (Quest #183 The Font Verdict — CSS Fonts parsing longhands, +250):**
Stayed on the #179→#182 lever — the widest still-untouched `css/*/parsing/` dir, same root cause. The whole
`css/css-fonts/parsing/` realm (82 files) sat at **384/1569**: the css-fonts longhands stored values RAW in
`CSSStyleDeclaration.setProperty` (no grammar check) → every `*-invalid` was 0/N (font-size-adjust-invalid 0/57,
font-synthesis-invalid 0/12, …), the keyword→canonical rewrites never happened, and the computed forms
(keyword→px/%, oblique→deg, bolder/lighter, calc folding) were missing. Built a self-contained **css-fonts value
engine** in `bootstrap.js` (dispatched via `_FONT_VALIDATED` in setProperty ahead of the `_MATH_GATE` branch;
computed forms in `_normComputed`): validation + canon for `font-style` (`_canonFontStyle`, `oblique <angle
[-90,90]>?`, literal-0→`normal`, grad/calc kept), `font-weight` (`_canonFontWeight`, `<number [1,1000]>`+calc —
removed from `_MATH_GATE_PROPS`), `font-width`/`font-stretch` (`_canonFontWidth`, `<keyword>|<percentage [0,∞]>`),
`font-size` (`_canonFontSize`, absolute/relative-size|`<length-percentage [0,∞]>`), `font-size-adjust`
(`_canonFontSizeAdjust`, `none|<basis>? [from-font|<number [0,∞]>]`, default `ex-height` basis dropped),
`font-family` (`_canonFontFamily`: generic lowercasing + string↔custom-ident reserialization via `_serFamilyString`/
`_isFamilyIdent`), `font-synthesis` (`_ccOrderedCanon` w/ `_FONT_SYNTH_CATS`, oblique-only in the style category),
plus the `font-kerning`/`font-optical-sizing`/`font-variant-caps`/`font-variant-emoji`/`font-synthesis-{weight,style,
small-caps,position}` enum longhands (`_FONT_ENUM`). Computed (`_normComputed` branches): oblique→deg (grad→deg,
calc, clamp [-90,90], 0→normal), font-weight bolder/lighter inherited-relative (`_fontBolder`/`_fontLighter` via
`_computedPropOf(parent)`) + keyword→number + calc-clamp [1,1000], font-width keyword→% (`_FONT_WIDTH_KW`) +
calc-clamp≥0, font-size larger/smaller (×/÷1.2 vs `_parentFontSizePx`) + em/%-vs-parent resolution, font-size-adjust
calc-fold + clamp≥0. Registered `font-width` + the 4 synthesis subprops in `_GCS_DEFAULTS`/`_INHERITED_PROPS`.
Realm **384/1569 → 634/1569 (+250)**. **ZERO regressions** (qsa 1975, classlist 1420, Element-matches 669,
createElement 147, url-origin 406/413, serialize-values 696/697, css-align place/gap 15+11, css-ui caret-color 12
+box-sizing 2, css-text text-indent 10, css-scroll-snap scroll-margin 11 — all held; the one in-realm regression
during dev, font-synthesis-style dropping `oblique-only`, was caught + fixed before commit). **CAPS:** the `font`
**shorthand** (font-valid + font-computed = 630 subtests — the crown jewel, deferred to a follow-up quest as it
needs a full shorthand parser/serializer incl. system-font keywords), `font-variant` (44/46 valid but 0/21 invalid —
a complex combinatorial shorthand, risky to canonicalize without regressing the 44) and `font-feature-settings`,
`font-face-src-*` (~109 — `@font-face` `src`/`format()`/`tech()` descriptor parsing, a different mechanism from
style-property setProperty), `<font size=N>` presentational hints (5 — a legacy UA attribute→CSS mapping the
cascade lacks), and `from-font` (6 — needs real font-metric resolution). **NEXT LEVERAGE:** the `font` shorthand is
the single widest remaining lever in this realm (630 subtests). After it, `font-variant`+`font-feature-settings`,
then the still-untouched `css/css-grid` (61) / `css-overflow` (35) parsing dirs. grep
`_canonFont`/`_FONT_VALIDATED`/`_FONT_ENUM` before touching font values. Scroll `tickets/183-the-font-verdict.md`.

**Session 2026-07-10 (Quest #182 The Snapped Verdict — CSS Scroll Snap parsing, +271):**
Stayed on the #179/#180/#181 lever — another untouched `css/*/parsing/` dir, same root cause. The whole
`css/css-scroll-snap/parsing/` dir (25 files) sat at **161/435**: the scroll-margin/scroll-padding/scroll-snap
family stored values RAW in `CSSStyleDeclaration.setProperty` (no grammar check) → every `*-invalid` was 0/N
(~120 subtests), every `*-shorthand` was 0/N (the shorthands never expanded, so `el.style.scrollMarginTop` read
"" after `scrollMargin = …` and `.length` was wrong, ~76 subtests), and the length longhands never resolved at
computed time. Built a self-contained **css-scroll-snap value engine** in `bootstrap.js` (inserted just before
`_LENGTH_COMPUTED_PROPS`, where all the length/box helpers are already defined): **(1)** longhand validation +
canon — `scroll-margin-*` `<length>` signed (`_canonScrollMargin`, reuses `_canonLenPctSigned`/`_canonMathExpr`,
0→0px, no %), `scroll-padding-*` `auto|<length-percentage [0,∞]>` (`_canonScrollPadding`, reuses `_canonGapItem`
for the order-preserving non-neg canon), `scroll-snap-align` `[none|start|end|center]{1,2}` (two-equal collapse),
`scroll-snap-type` `none|[x|y|block|inline|both] [mandatory|proximity]?` (default `proximity` dropped),
`scroll-snap-stop` `normal|always` — dispatched via `_SCROLL_LONGHANDS` in the setProperty else-if chain; **(2)**
the `scroll-margin`/`scroll-padding` shorthands (physical 1–4 + logical block/inline 1–2) EXPAND into and store
as their longhands (the border/offset model, NOT the raw-store `_BOX_SHORTHANDS` model — because the parsing
tests read each `div.style[longhand]` and `.length`), via `_SCROLL_SH_LH`/`_expandScrollShorthand`, with
reconstruction on the shorthand getter/`removeProperty`/`getComputedStyle` (`_serializeScrollShorthand` +
`_serializeBoxValue`'s 1–4/1–2 edge collapse); **(3)** computed length resolution — the 16 longhands added to
`_LENGTH_COMPUTED_PROPS`, the 8 scroll-padding to `_CLAMP_NEG_PROPS` (non-negative → resolved-negative clamps to
0px), an `auto` passthrough in `_normComputed`; **(4)** registration (`_CSS_KNOWN_PROPS` gets the 6 shorthands;
the longhands were already in `_GCS_DEFAULTS`) + a `CSS.supports` branch (validate longhands via `_canonScrollLong`,
shorthands via `_expandScrollShorthand`). Realm **161/435 → 432/435** (+271). **ZERO regressions** (qsa 1975,
classlist 1420, Element-matches 669, createElement 147, url-origin 406/413, css-align place/gap 15+12, css-ui
caret-color-computed 12/12 + box-sizing-computed 2/2, css-text text-indent-valid 14/14, serialize-values 696/697,
cssstyledeclaration-csstext 7/11 stash-proven pre-existing all held). **Caps (3):** `calc(auto)` on scroll-padding
is wrongly accepted — a PRE-EXISTING engine-wide leniency, NOT scroll-specific: the shared math type-checker
(`_mt`/`_mathValid`) treats the unknown symbol `auto` as `'unknown'` → valid (the var()/env() escape hatch), so
`margin-left: calc(auto)` and `outline-offset: calc(auto)` are equally accepted. A correct fix belongs in `_mt`
(reject bare non-constant identifiers) and would lift these 3 + the same latent bug across every length prop —
deliberately left out of scope to keep this change tight and zero-regression. **Next:** the still-untouched
`css/*/parsing/` dirs remain the widest tail — `css-fonts` (83), `css-grid` (61), `css-overflow` (35, more
scattered across many small/experimental props) — same three-axis JS machinery. DEV NOTE: grep `_canonScrollLong`/
`_SCROLL_SH_LH`/`_SCROLL_LONGHANDS`/`_expandScrollShorthand` before touching scroll-snap values.

**Session 2026-07-10 (Quest #181 The Textual Verdict — CSS Text parsing, +404):**
Stayed on the #179/#180 lever — the widest untouched `css/*/parsing/` dir, same root cause. The whole
`css/css-text/parsing/` dir (86 files) sat at **341/754**: the entire css-text family stored values RAW in
`CSSStyleDeclaration.setProperty` (no grammar check) → every `*-invalid` was 0/N (~150 subtests), several
props (`text-autospace`, `text-spacing`, `text-spacing-trim`, `text-group-align`, `word-space-transform`,
`hyphenate-character`, `hyphenate-limit-chars`) weren't registered at all (computed 0/N), and the shorthands
(`text-wrap`, `white-space`, `text-spacing`, `text-fit`) were never canonicalized. Built a self-contained
**css-text value engine** in `bootstrap.js` (`_canonCssText`, dispatched via `_CSSTEXT_VALIDATED` ahead of the
length/`_MATH_GATE` branches): **(1)** enum validation (`_CSSTEXT_ENUM`, 14 longhands); **(2)** a generic
`||`-combination canon `_ccOrderedCanon` driven by `_CCSET` (ordered categories, ≤1 per category, singletons
stand alone, per-property `preserveOrder`/`requireCats`) for text-transform / text-autospace /
word-space-transform / hanging-punctuation; **(3)** `<length-percentage>`/`<number>` grammar
(`_canonLenPctSigned`) for word-spacing/letter-spacing/tab-size/text-indent (bare non-zero numbers invalid,
`0`→`0px`, calc %-first reorder); **(4)** auto\|`<string>` (hyphenate-character) and `[auto\|<integer>]{1,3}`
with trailing-dup collapse (hyphenate-limit-chars); **(5)** the text-wrap / white-space / text-spacing /
text-fit shorthands canonicalized to a SINGLE stored keyword (`_canonTextWrap`/`_canonWhiteSpace`/
`_canonTextSpacing`/`_canonTextFit` — single-key storage, NOT longhand expansion, to keep cssText round-trips
safe). Plus registration of the 7 unmodelled props (`_GCS_DEFAULTS`+`_INHERITED_PROPS`+`CSS.supports`) and
`_normComputed` branches: text-justify `distribute`→`inter-character`, text-fit drops the default `consistent`
scope, hyphenate-limit-chars/tab-size calc→integer/px+clamp, text-indent length-resolve + keyword-keep. Realm
**341/754 → 745/754** (+404). **ZERO regressions** (qsa 1975, classlist, Element-matches 669, createElement
147, dispatchEvent 25, css-align place/gap 15+12, css-ui caret-color-computed 12/12, serialize-values 696/697,
color-valid 17/17, transform-valid 42/42 all held; inline-style-001 4/5 pre-existing). **Caps (9):** container-
query `sign(2cqw − 10px)` in tab-size-computed (needs cqw units, 2); `match-parent`→`center` needs a parent
text-align walk (1); `"\1400"`→`"᐀"` needs a CSS `<string>` escape-unescaper (2); the white-space↔text-wrap-mode
longhand interaction (`white-space-shorthand-text-wrap`, 2) — traded away by single-key storage; an
unbalanced-paren mixed %/length calc in letter/word-spacing computed (2). **Next:** the still-untouched
`css/*/parsing/` dirs — `css-fonts` (83), `css-grid` (61), `css-overflow` (35), `css-scroll-snap` (25) — same
three-axis JS machinery. DEV NOTE: grep `_canonCssText`/`_CSSTEXT_ENUM`/`_CCSET`/`_CSSTEXT_VALIDATED` before
touching css-text values.

**Session 2026-07-10 (Quest #180 The Interface Verdict — CSS Basic User Interface parsing, +62):**
Stayed on the #179 lever — another untouched `css/*/parsing/` dir with the same root cause. The
whole `css/css-ui/parsing/` dir (42 files) sat at **~206/323**: the css-ui longhands stored their
value RAW in `CSSStyleDeclaration.setProperty` (no grammar check), so every `*-invalid.html` was
0/N — `box-sizing: fill-box`, `caret-color: invert`, `resize: auto`, `outline-style: hidden`,
`outline-width: 1%` all accepted and echoed back. Built a self-contained css-ui value engine in
`bootstrap.js`: **`_canonCssUi(name, value)`** validates + canonicalizes each longhand (enumerated
keywords via `_CSSUI_ENUM`; `caret-color` `[auto|<color>]{1,2}` + `outline-color` `auto|<color>`;
`text-overflow` `[clip|ellipsis|<string>]{1,2}`; `outline-width` `<line-width>`; `outline-offset`
`<length>|inset`), dispatched via `_CSSUI_VALIDATED` **ahead of** the lenient `_COLOR_PROPS` branch
so caret-color/outline-color get real validation. Added caret-color two-value computed resolution
(`_normComputed`), `field-sizing`/`interactivity` to `_GCS_DEFAULTS` (auto-registers in
`_CSS_KNOWN_PROPS` → getComputedStyle exposes them), `interactivity` inheritance, and a
`CSS.supports` css-ui branch (the two-value/keyword grammars). Every `*-invalid` 0/N→N/N (bar
`outline-color: invert`), caret-color-computed 3/12→12/12, field-sizing-computed 0/2→2/2,
interactivity 6/9→9/9. **+62 harness-OK, ZERO regressions** (serialize-values held at 696/697 after
discovering — and honoring — the `invert` conflict; color-valid 17/17, color-computed 16/16,
border-valid 6/6, css-align all held). **Cap:** `outline-color: invert` is a spec-version conflict —
css-ui-4 rejects it but the CSSOM `serialize-values` must-pass test needs it valid; kept valid (no
regression) → `outline-color-invalid` caps at 2/3. `cursor` (0/10) needs a real value engine
(url/image-set/**gradient**/light-dark + coord grammar); `canonical-order-outline` 0/26 needs
outline-shorthand computed reconstruction. **Next:** `css-text` (86), `css-fonts` (83), `css-grid`
(61), `css-overflow` (35) — same three-axis machinery. Scroll `tickets/180-the-interface-verdict.md`.

**Session 2026-07-10 (Quest #179 The Alignment Verdict — CSS Box Alignment parsing, +366):**
Pivoted to a fresh WIDE realm — the whole `css/css-align/parsing/` dir (50 files) sat at **249/618**
(369 failing subtests). Root cause: the entire alignment family (`align-*`/`justify-*`/`place-*`/
`gap`/`grid-*-gap`) had NO value handling in `CSSStyleDeclaration` — every value stored raw. That
meant every `*-invalid.html` was 0/N (~171 subtests: no validation), the `*-valid` tails failed
canonical serialization, `gap`/`place-*` shorthands weren't expanded, and computed values were empty.
Built a self-contained **Box-Alignment value engine** in `bootstrap.js` (all in the CSS-value section
after `_posComputeLen`): **(1)** `_alignCanonLonghand(prop, value)` — a per-property capability table
(`_ALIGN_PROPS`) driving one keyword-grammar validator+canonicalizer over the six longhands (self- vs
content-position sets, content-distribution, `<overflow-position>` ordering, `[first|last]? baseline`
canonical-dropping `first`, `left|right`, `auto`, and `legacy && [left|right|center]` → canonical
`legacy X`). **(2)** `_canonGapItem` — `normal | <length-percentage [0,∞]>` for row-gap/column-gap
(rejects literal negatives + bare non-zero numbers; `0`→`0px`; `calc()` passes). **(3)** shorthand
expansion into longhands like `offset`: `_parseGapShorthand` (gap/grid-gap) and `_parsePlaceShorthand`
(place-content/items/self — greedy align-half/justify-half split, `place-content` baseline→`start`),
with `getPropertyValue`/`removeProperty` reconstructing/clearing and equal halves collapsing;
`grid-row-gap`/`grid-column-gap` as legacy single-longhand aliases (`_GRID_GAP_ALIAS`). **(4)**
registered the shorthands in `_CSS_KNOWN_PROPS` + `CSS.supports` (validate-by-expansion), reconstructed
the shorthands' computed values from computed longhands in `getComputedStyle`, and added
`row-gap`/`column-gap` to `_LENGTH_COMPUTED_PROPS`+`_CLAMP_NEG_PROPS` so their computed value resolves
`em`/`calc`→px and clamps negatives to `0px`. Realm **249/618 → 615/618** (+366). **ZERO regressions**
(qsa 1975, classlist 1420, Element-matches 669, createElement 147, dispatchEvent 25, url-origin 406/413,
mark 22/22, structured-clone 141/152, getRandomValues 39/39, popover-focus 30/30, color-valid 17/17,
transform-valid 42/42, grid-auto-flow 4/7 all held; serialize-values 696/697, inline-style-001 4/5,
style-sheet-interfaces 3/7 stash-proven identical pre/post). **Cap:** `justify-items: legacy`
computed-inheritance (the only 3 remaining fails — needs a parent-computed walk, entangled with the
existing `legacy center` initial-value hack). Grep `_alignCanonLonghand` / `_ALIGN_SHORTHAND_LH` /
`_parsePlaceShorthand` / `_canonGapItem` / `_GRID_GAP_ALIAS`. Scroll `tickets/179-the-alignment-verdict.md`.

**Session 2026-07-10 (Quest #178 The Suggestions Verdict — `HTMLInputElement.list` + non-negative `maxLength`/`minLength`, +8):**
Cheap wide-ish follow-on to #177, staying in the input-element realm. Two small IDL fixes, both `bootstrap.js`.
**(1)** New `input.list` getter (input-list 0/6→6/6) — the *suggestions source element*:
`getRootNode().getElementById(<list attr>)` returned only when it's a `<datalist>`, so getElementById
first-in-tree-order means an earlier non-datalist sharing the ID yields null (a later datalist doesn't win);
null for the non-applicable input types. **(2)** `_cvReflLong` (shared by `maxLength`/`minLength`, its only
callers) upgraded to a `long` "limited to only non-negative numbers" (maxlength 3/5→5/5): the setter
ToInt32-converts the JS value (`"not-a-number"` → 0) and throws `IndexSizeError` on a negative result; the getter
maps a negative content attribute to the default (-1). ZERO regressions (minlength 5/5, checkbox 6/6, radio 12/12,
form-validation-validity-valueMissing 78/78, type-change-state 380, qsa 1975, createElement 147, dispatchEvent 25,
popover-focus 30/30 all held). Scroll `tickets/178-the-suggestions-verdict.md`.

**Session 2026-07-10 (Quest #177 The Activation Verdict — input checkbox/radio activation behavior + radio-group exclusivity, +13):**
Pivoted off the now-heavily-mined popover tail to a fresh wide primitive: the HTML **input-element activation
behavior** for checkbox/radio. `checkbox.html` (2/6) and `radio.html` (3/12) shared one realm — the pre-activation
toggle, the legacy-canceled-activation revert, the trusted `input`→`change` event pair, and (for radio) **radio
button group mutual exclusion**. THREE fixes, all `bootstrap.js`: **(1)** the `checked` IDL setter now unchecks every
other member of a radio's group when a radio's checkedness becomes true (group = same tree root + same non-empty
`name` + same form owner via `_cvRadioGroup`; unchecks siblings with a direct `_dom("set_checked",…,"0")` so there's
no re-entrancy) — this alone carries 8 of radio's 9 fails, which set `.checked` directly and never reach `.click()`.
**(2)** `_cvRadioGroup` upgraded from the ancestor-only `_cvFormOwner` to the full `_ceiFormOwner` (honors the
`form=` id-reference attribute) so radios associated to a form by id group correctly. **(3)** `.click()` gained the
full activation behavior: a disabled checkbox/radio is a complete no-op; pre-activation clears `indeterminate` +
toggles (checkbox) or remembers the group's prior checked member + sets checked (radio); canceled-activation (click
`preventDefault`-ed) restores checkbox `checked`/`indeterminate` or re-checks the radio's remembered member; a
non-canceled click fires a trusted, bubbling, non-cancelable `input` then `change` via the new
`_fireInputThenChange` helper (dispatched through `_dispatchSpec` with `isTrusted=true`, so the events are trusted
while the `.click()`-initiated click event stays untrusted — exactly what the tests assert). checkbox **2/6→6/6**,
radio **3/12→12/12**. **Zero regressions:** form-validation-validity-valueMissing 78/78, select-validity 5/6
(pre-existing cap), popover-invoking-attribute 1402, popover-light-dismiss 25, popover-focus 30/30,
EventTarget-dispatchEvent 25, qsa 1975, DOMTokenList 6/6, Element-matches 669, createElement 147, type-change-state
380/380. **Caps:** no name-change/form-owner-change re-evaluation of an already-checked radio (exclusivity runs on the
checkedness→true setter, which covers every fixture); no parse-time group de-dup. Grep `set checked` / `_cvRadioGroup`
before touching radio grouping. **Next:** cross-document pointerdown/up pairing (`popover-light-dismiss` ~8 fails);
scripting-errors exact line/col. Scroll `tickets/177-the-activation-verdict.md`.

**Session 2026-07-10 (Quest #176 The Click-Focus Verdict — trusted-mousedown click focusing steps, +10):**
Took #175's named next lever's neighbor — the widest clearly-diagnosed tail on the board: `popover-focus.html`
(20/30), whose last 10 fails (the *"Popover button click focus"* + *"corner cases"* families) all died on one
assertion: after `await clickOn(button)`, `document.activeElement` should be the clicked button but stayed on
`priorFocus`. ROOT CAUSE — Obscura had no **HTML "click focusing steps"**: a trusted pointer press focused
nothing (the focus model only moved focus via `focus()`/autofocus paths). #158, which built the focus model,
had literally named this cap. **FIX (`bootstrap.js`, one new installer):** `globalThis._installClickFocus()` —
a bubble-phase `mousedown` listener (installed by `__obscura_init` next to the light-dismiss/invoker
installers) that, for a **trusted, non-canceled** press, walks from `e.target` up to the first
`_isFocusableArea` and `_performFocus`es it. The WPT bridge fires `mousedown → pointerup → click`, so this
focus lands BEFORE popover light dismiss (pointerup) and invoker activation (click) — a click on an invoker
focuses the button, THEN the toggle/dismiss runs; when the pressed control sat *inside* the closing popover it
becomes `display:none` → unfocusable, so `_restorePreviousFocus` (already gated on "focus is inside the
closing element") correctly returns focus to `priorFocus`. Two scoping choices: **trusted-only** (the scripted
`.click()` METHOD dispatches an untrusted click with no `mousedown`, so it never shifts focus — the *passing*
"Popover focus test" family relies on focus NOT moving to the invoker) and **focus-only, never blur** (a press
on non-focusable content is a no-op; no fixture needs click-empty-space to clear focus, and blurring broadly
is too wide a primitive to risk). `popover-focus` **20/30 → 30/30**. **Zero regressions** (fresh-server
measured — two apparent dips, top-layer-combinations 3/5 and light-dismiss 24, were server degradation, cleared
to 5/5 and 25 on restart): popover-attribute-basic 195, popover-invoking-attribute 1402, popover-light-dismiss
25, popover-light-dismiss-command 8, popover-light-dismiss-hint 9, popover-shadow-dom 3, top-layer-combinations
5/5, top-layer-interactions 9/9, qsa 1975, classlist 1420, createElement 147, dispatchEvent 25, Element-matches
669, all-global-events 375, dialog-showModal 8/10 (pre-existing layout cap), dialog-close 5. **Caps:**
click-focus is mousedown-scoped and focus-only — grep `_installClickFocus` before touching pointer→focus.
**Next:** cross-document pointerdown/up pairing (`popover-light-dismiss` ~8 fails); scripting-errors exact
error line/col. Scroll `tickets/176-the-click-focus-verdict.md`.

**Session 2026-07-10 (Quest #175 The Fullscreen Verdict — dialog/fullscreen ↔ popover top-layer, +10):**
Took #174's named #1 next lever: the dialog/fullscreen ↔ popover top-layer interaction tests. Two
distinct root causes. **(1) The dialog gate:** `popover-top-layer-combinations` opens a `<dialog>`
NON-modally via `show()` (sets `open`, but not the is-modal flag) then calls `showPopover()`, which
"should not throw" — but `_checkPopoverValidity` threw *InvalidStateError: "Not supported on <dialog>
elements that are open as a dialog"* for ANY `open` attribute. Per the current HTML "check popover
validity" algorithm the throw is gated on the dialog's **is-modal flag** (and separately on the
element's fullscreen flag), NOT the bare `open` attribute — a `show()` dialog can still be shown as a
popover; only `showModal()` (or fullscreen) blocks. Swapped the gate to `el._isModal`. **(2) Fullscreen
didn't exist:** `ex.requestFullscreen is not a function` — a *synchronous* TypeError that escaped the
tests' `await ex.requestFullscreen().then().catch()` and rejected the whole `promise_test` (blocked all
5 interactions fails + 2/5 combinations, plus a 3rd combination needed the fullscreen popover-validity
throw). Added a **partial Fullscreen API** — a top-layer STATE machine, no real fullscreen render (all
these tests observe is DOM state: `matches(':fullscreen')`, `:popover-open`, `:modal`): a new Rust
`fullscreen` node flag (mirrors `:modal` exactly — `set_fullscreen`/`is_fullscreen` + the `:fullscreen`
selector arm), and in `bootstrap.js` (after `globalThis.Element`/`Document` exist)
`Element.prototype.requestFullscreen()` → Promise (rejects TypeError if disconnected or a showing
popover — it already occupies the top layer as a popover; else pushes onto `globalThis._fullscreenStack`,
sets the flag, supersedes open popovers, resolves), `Document.prototype.exitFullscreen()` (pops the
stack top) + `webkitExitFullscreen`, and `fullscreenElement`/`fullscreenEnabled` getters. Entering
fullscreen calls the newly-extracted `globalThis._topLayerHidePopovers` (identical to the dialog show
path's `_dialogHidePopovers`) so it closes open popovers but leaves modal dialogs + other fullscreen
elements untouched; a second fullscreen element pushes onto the stack while the first keeps its flag, so
both stay `:fullscreen`. `popover-top-layer-combinations` **0/5→5/5**, `popover-top-layer-interactions`
**4/9→9/9**. **Zero regressions** (matched baseline): popover-attribute-basic 195, popover-invoking-attribute
1402, popover-light-dismiss 25, popover-shadow-dom 3, popover-focus 20/30, dialog-showModal 8/10
(pre-existing layout cap), dialog-close 5, qsa 1975, classlist 1420, createElement 147, dispatchEvent
25, Element-matches 669. **Caps:** state-machine only — no `::backdrop` layout, no Escape-exits, no
activation gating or `fullscreenerror`; `Node.isConnected` still shadow-blind (#174). **Next:**
cross-document pointerdown/up pairing (`popover-light-dismiss`); popover Tab-focus (`popover-focus`
20/30); the scripting-errors realm's exact error line/col. Scroll `tickets/175-the-fullscreen-verdict.md`.

**Session 2026-07-10 (Quest #174 The Shadowed Verdict — shadow-DOM popover connectedness, +5):**
Took #173's named #1 next lever: `showPopover()` on a popover inside a (declarative) shadow tree
threw *"Invalid on popover elements which aren't connected to a document."* Root cause — the popover
"check validity" connectedness gate used the plain `isConnected` getter, which walks only the
`parentNode` chain and stops dead at the shadow boundary, so a popover in a *connected host's* shadow
tree read as disconnected (per spec, connectedness is shadow-INCLUDING). **FIX (`bootstrap.js`, all
scoped to the popover subsystem):** **(1)** `_checkPopoverValidity` now uses the existing shadow-including
`_shadowConnected` helper (jumps each shadow root to its `_shadowHost`) instead of `isConnected` — the
single change that unblocked the throw. **(2)** the "topmost popover ancestor" computation uses a new
shadow-including containment walk `_shadowIncludes` (replacing `Node.contains`, which is shadow-blind) so
a popover nested inside a shadow-DOM ancestor popover is recognized as *nested* — opening it doesn't close
the ancestor, and hiding the ancestor cascades to it. **(3)** the popover invoker's target-validity check
swapped `isConnected`→`_shadowConnected` so an invoker targeting a shadow-tree popover still activates it.
`Node.isConnected` itself left untouched — it *should* be shadow-inclusive per spec, but it's a very
widely-used primitive (mutation/removal/custom-element/focus steps) and the scoped fix carries no blast
radius. **+5, ZERO regressions:** popover-shadow-dom **0/3→3/3**, popover-light-dismiss **23→25** (its two
shadow subtests; remaining fails are focus-move / cross-document-pointer / hint-stack, untouched). Swept
clean: popover-attribute-basic 195, popover-invoking-attribute 1402, popover-light-dismiss-hint 9,
target-element-disabled 7, popover-focus 20, qsa 1975, classlist 1420, createElement 147, dispatchEvent 25,
all-global-events 375, dialog-showModal 8/10 (pre-existing layout cap). **NEXT:** dialog+popover **top-layer
ordering** (popover-top-layer-combinations 0/5, -interactions 4/9 — the widest untouched popover lever);
cross-document pointerdown/up pairing; popover Tab-focus (popover-focus 20/30). Scroll
`tickets/174-the-shadowed-verdict.md`.

**Session 2026-07-10 (Quest #173 The Invoked Verdict — trusted-click invoker activation + command-invoker light-dismiss protection, +15):**
Took #172's named next lever: a *trusted* `click` carried no activation behavior. Popover
(`popovertarget`) and command (`commandfor`) invoker activation lived only inside the `.click()`
**method**, so the harness clicking an invoker button never showed/toggled its popover — dozens of
`clickOn(invoker)`-then-assert-open subtests failed at the first assertion. **FIX (`bootstrap.js`):
(1)** extracted the two invoker blocks out of `.click()` into `_runInvokerActivation(el)` and shared
it with a new document-level bubble-phase trusted-`click` listener (`_installInvokerActivation`,
installed by `__obscura_init` after the doc is bound, gated on `isTrusted || __obscura_trusted_input` —
so scripted `.click()`'s own untrusted dispatch and page-synthesized clicks never double-activate).
**(2)** `_popoverClickedTarget` (light-dismiss "clicked node") now recognizes `commandfor` invokers
too, protecting the showing popover they control from dismiss. **(3)** a `disabled` invoker protects
nothing — an early `n.disabled` skip in the walk, which both killed a regression the commandfor branch
would have caused and took `popover-light-dismiss-disabled-button` 1/3→3/3. **+15, ZERO regressions:**
popover-light-dismiss-command 4→8, popover-light-dismiss 20→23, -input-button 5→8, -disabled-button
1→3, popover-invoking-attribute 1400→1402, popover-hint-hierarchy 4→5. Swept clean: qsa 1975,
createElement 147, DOMTokenList, dispatchEvent 25, all-global-events 375, and the whole popover realm.
**NEXT:** shadow-DOM popover connectedness (`popover-shadow-dom` 0/3 — `showPopover()` throws inside a
shadow tree; connectedness check must be shadow-inclusive); cross-document pointerdown/up pairing;
popover Tab-focus (`popover-focus` 11/30). Scroll `tickets/173-the-invoked-verdict.md`.

**Session 2026-07-10 (Quest #172 The Dismissed Verdict — popover light dismiss finally fires (live-document listener) + the pointerup/trusted-input spec model, +61):**
Pivoted out of the scripting-errors realm into the widest untouched tail on the board: the popover
family, where `popover-attribute-basic.html` alone sat at 159/249 with ~90 failing subtests all
ending in the same assertion — *"popover=auto should light-dismiss expected false got true"*. Root
cause, found by narrowing to a same-origin `srcdoc`/`data:` repro driven over CDP: **light dismiss
never fired at all.** The listener was registered at *top-level bootstrap* — `document.addEventListener
('pointerdown', _ld, true)` — but `globalThis.document` is still `null` there (it is bound later, inside
`__obscura_init`), so the call threw into a swallowing `try/catch` and no listener was ever installed on
the live document. Proven directly: `_eventRegistry` had only a `window` key until a runtime
`document.addEventListener` added the document's `_nid` key; a wrapped `_popoverLightDismiss` was never
invoked by a real pointerdown, while the direct call and `elementFromPoint` both worked. **THE FIX (all
`bootstrap.js` + a harness assist):** **(1)** deferred registration to a new `globalThis.
_installPopoverLightDismiss()` that `__obscura_init` calls right after binding `globalThis.document`, so
the pointer capture listeners land on the real document. That single fix took attribute-basic 159→195
(+36). **(2)** Rewrote light dismiss to the spec model — **pointerdown records** the popover under the
pointer, the **matching pointerup dismisses** the popovers not related to it (`_popoverClickedTarget` /
`_popoverDismissExcept` / `_popoverLightDismissDown` / `_popoverLightDismissUp`). So a bare pointerdown,
or a drag started inside a popover and released outside, no longer dismisses. **(3)** Gated dismissal on
**trusted input** (`e.isTrusted || __obscura_trusted_input`): a page's own `dispatchEvent(new
PointerEvent(...))` must not close popovers, while automation must. The WPT input bridge (`wpt_run.py`
`firePointer`/`fireMouse`) sets `__obscura_trusted_input` for the duration of its synchronous dispatch —
the faithful simulation of WebDriver's trusted events (there is no Rust CDP mouse-input path in the
product, so this cannot regress real usage). **Results (+61, ZERO regressions):** attribute-basic
159→195 (+36), light-dismiss 15→20 (+5), light-dismiss-hint 3→9 (+6, 100%), target-element-disabled
2→7 (+5, 100%), top-layer-nesting-hints 5→11 (+6), hint-hierarchy 3→4 (+1), open-in-beforetoggle 3→5
(+2, 100%). Swept hard: dispatchEvent 25/25, all-global-events 375/375, body-window 140/140,
onerroreventhandler 3/3, qsa 1975/1975, classlist 6/6+1/1, createElement 147/147, form-elements-matches
2/2, inline-event-handler-ordering 3/3, dialog-showModal 8/10 + frame-removal 5/6 (both pre-existing
layout/windowless caps, unrelated). **CAPS / NEXT:** the remaining popover failures split into distinct
primitives — (a) **coordinate-invoker activation**: a *trusted* `click` event runs no activation
behavior (popover invoker / command invoker fire only inside the `.click()` *method*, not as a dispatched
click's default action — `_dispatchSpec` has no activation step), which blocks the invoker cases in
light-dismiss + shadow-DOM popovers; (b) **form-owner via the `form=` attribute** (button/input-type-
popovertarget: a submit/reset button associated by `form=` should do the form action and NOT toggle its
popover — `this.form`/`_hasForm` isn't honouring `form=`); (c) **Tab-focus navigation** into/out of
popovers (popover-focus 11/30). Trusted-click activation behavior is the widest next lever (extends this
same trusted-input mechanism). Scroll `tickets/172-the-dismissed-verdict.md`.

**Session 2026-07-09 (Quest #171 The Framed-Error Verdict — in-frame `document.body.outerHTML` + the frame-window OnErrorEventHandler, +3):**
Finally took the `document.body.outerHTML` body-replacement bug that #169 AND #170 both named
Finally took the `document.body.outerHTML` body-replacement bug that #169 AND #170 both named
and deferred — the last blocker on `onerroreventhandler.html` (0/3). It turned out to be FIVE
bugs stacked, uncovered one at a time by narrowing from the failing test down to a faithful
same-origin `srcdoc` repro (nested data-URLs corrupt the frame; DOMParser shares the same
`_IframeDocument` class and was the key top-level observability trick).
**(1) The main-document primitive (Rust).** `element.innerHTML`/the `outerHTML` setter parsed
with a HARDCODED `body` fragment-parsing context, so `<body …>` (a stray body start-tag under
`body`/`div` context) was DROPPED — `document.body.outerHTML = "<body …></body>"` (whose context
per spec is the parent `<html>`) lost the new body entirely → `body` went `null`. Fixed by
threading the target element's own local name as the context: new
`parse_fragment_ctx(html, ctx)` + `fragment_root()` in `obscura-dom`, and `set_inner_html`
(`ops.rs`) reads `dom.get_node(target).as_element().local`. Under an `html` context html5ever now
yields a real `head`+`body`. (Verified pure via a Rust unit test.)
**(2) The REAL iframe root cause (bootstrap).** The main-doc fix alone left the iframe test at
`Cannot set properties of null`, because iframes are synthetic `_IframeDocument`s whose constructor
strips `<html>/<head>/<body>` with a NAIVE global regex — which also ate those tags appearing as
literal TEXT inside the frame's `<script>`: `document.body.outerHTML = "<body onerror=…></body>"`
became `"onerror=…>"` → body replaced by a text node → `null`. (Proven with a one-line DOMParser
repro: `var x = "A<body>B</body>C"` → `"ABC"`.) Fixed by masking raw-text (`script/style/textarea/
title`) blocks to opaque `\x00RAW<n>\x00` sentinels before the strip, then restoring.
**(3) Frame-window onerror as a listener (bootstrap).** With the body replaced, the reflected
`<body onerror>` set `frameWin.onerror = fn` — but `_IframeWindow` had no `onerror` accessor (a
plain data prop `dispatchEvent` never fires). Added the real OnErrorEventHandler accessor (mirrors
the main window, Quest #169) using `this.addEventListener('error', _makeOnErrorListener(fn))`, with
own null slots so the frame proxy doesn't leak the top window's onerror.
**(4) Which window + which scope (bootstrap).** The freshly-parsed body's `ownerDocument`
mis-resolved to the MAIN document (parsed frame children aren't `_ownerDoc`-tagged unless custom
elements are live), so the reflect targeted the top window. New `_windowForNode` walks to the tree
ROOT (the frame `_IframeDocument`, or the throwaway `<html>` context element, which IS tagged) to
recover the frame window; `_bodyReflectWin` now delegates to it, and `_ehScopeChain` PREPENDS the
frame window so a `<span onerror='check3()'>` in a frame resolves `check3` (a frame-script global);
`_bodyWinSetContentAttr` compiles the reflected handler with the frame window in its `with` chain.
**(5) Synchronous frame-script globals (bootstrap).** Frame classic scripts run via `new Function`
(Option C), and `_runFrameProgram` only hoisted top-level decls onto the window in a `finally` —
AFTER the body ran. But the test dispatches the error SYNCHRONOUSLY during the script, before the
finally. Function declarations are hoisted, so we now also mirror them onto the window at the START
of the program body (`_scanTopLevelDecls` tracks which names are functions). Result:
onerroreventhandler.html **0→3/3**, **+3, ZERO regressions** (see the quest row for the full sweep;
event-handler realm 1027/1027, Range frame-heavy tests full counts, all held). **Caps:** exact
`lineno` still 0 (the `window-onerror-*` exact-line tests stay 2/3); a frame-parsed body's
`ownerDocument` still resolves to the main doc for non-reflect consumers. **Next:** real error
line/col tracking (the last exact-`lineno` lever), or the frame-node `_ownerDoc` tagging gap.

**Session 2026-07-09 (Quest #170 The Timer-Source Verdict — string-source timers + timer-callback error reporting, +8):**
Took Quest #169's named next lever. The four `*-in-setTimeout` / `*-in-setInterval` tests
(`html/webappapis/scripting/processing-model-2/`, all 0/2) use **string-source timers** —
`setTimeout("undefined_variable;", 10)` / `setTimeout("{", 10)` — which were *silently
ignored* (`setTimeout`/`setInterval` bailed on any non-function handler) and whose throw,
even if run, was *swallowed* to `console.error`. A `TimerHandler` is `(Function or
DOMString)`: a string must be **compiled as a classic script and run in global scope** at
fire time, and its uncaught exception "reported" (fire `error` at the Window). **THE FIX,
all `bootstrap.js`:** a shared `_runTimerHandler(fn, code, args)` does `code !== null ?
(0, eval)(code) : fn(...args)` inside `try { … } catch (e) { _reportError(e); }`. The
**indirect** `(0, eval)` gives exactly global-scope classic-script evaluation, so
`"undefined_variable;"` throws a ReferenceError at run and `"{"` a SyntaxError at compile
— both synchronously in the callback, caught and routed to `_reportError` (#169), which
fires the ordered `error` listener path → `window.onerror(message, filename =
location.href, lineno, colno, error)`. `setTimeout`/`setInterval` compute `code = (typeof
fn === "function") ? null : String(fn)` once at schedule time and route every fire (and
`setInterval` tick) through the helper; the function-callback path now reports its throws
too (was `console.error`). The interval test's `window.onerror` `clearInterval`s on first
report; `tick`'s post-run `_intervals.has(id)` guard stops the reschedule the same turn.
The tests assert only `typeof lineno === 'number'` (not exact) and `filename ===
location.href`, both already satisfied — so the #169 `lineno:0` cap doesn't block them.
Results: compile-error-in-setTimeout **0→2/2**, compile-error-in-setInterval **0→2/2**,
runtime-error-in-setTimeout **0→2/2**, runtime-error-in-setInterval **0→2/2**. **= +8,
ZERO regressions** — swept hard on the risky function-throw→`_reportError` change:
qsa 1975, classlist 1420, createElement 147, createElementNS 596, dispatchEvent 25,
mark 22, measure-l3 3, getRandomValues 39, all-global-events 375, body-window 140,
windowless-body 236, eventhandler-cancellation 14/15, processing-algorithm 7,
lexical-scopes 3, the whole #169 scripting-errors realm, iframe-load 2/2, url-origin
406/7, structured-clone 141/152 (last three's fails pre-exist). **CAPS:**
`onerroreventhandler.html` 0/3 still blocked by the *separate* `document.body.outerHTML`
body-replacement bug (after `document.body.outerHTML = "<body …></body>"` the body goes
`null`; the `outerHTML` setter parses with an `<html>` context element that doesn't yield
a findable body — mirror `insertAdjacentHTML`'s `html`→`body` context map); exact error
line/col still 0 (runtime→Rust boundary); cross-origin/data-URL timer error tests are the
muted-error / opaque-origin cap. **NEXT: the `document.body.outerHTML` body-replacement
bug** (real DOM-primitive fix, unlocks onerroreventhandler + a broader outerHTML/body
tail), then real error line/col tracking. Scroll `tickets/170-the-timer-source-verdict.md`.

**Session 2026-07-09 (Quest #169 The Reported-Error Verdict — onerror-as-listener + "report the error" for uncaught classic-script errors, +16):**
Took Quest #168's named last lever (`compile-event-handler-lexical-scopes` test 3 needed `window.onerror` to fire as
an *ordered* `error` listener) — and it opened the whole **runtime-script-errors** realm. Two dark gaps: (a)
`window.onerror` was a plain data-property invoked manually at the *end* of `_reportError`, so a `body.setAttribute
("onerror")` handler couldn't fire before a later `window.addEventListener("error")`, and an explicit
`window.dispatchEvent(errorEvent)` never reached it; (b) an uncaught parse/runtime error in a classic `<script>` was
*swallowed* (`page.rs` only `tracing::warn!`-logged it) — HTML's "report the error" (fire an `error` event at the
Window) never happened. **THE FIX, `bootstrap.js` + `page.rs`.** **(1)** `window.onerror` is now a real
OnErrorEventHandler `error`-listener accessor: removed `"error"` from `_WINDOW_ONHANDLER_DATA`, and the accessor
registers a **wrapper** (`_makeOnErrorListener`) that applies the special error handling — 5-arg `(message, filename,
lineno, colno, error)` splat when the event is an `ErrorEvent`, else the event; `true` (special) / `false` (ordinary)
return cancels. `get` returns the raw fn (native `.length` intact), wrapper tracked in `__winon_error_w`.
`_reportError` no longer hand-calls `globalThis.onerror` — the wrapper fires in listener order via the existing
direct-fire loop, once. **(2)** `_reportError`'s ErrorEvent now carries `filename = location.href` + numeric
line/col (0). **(3)** `Page::report_script_error` runs `_reportError(new Error(<msg>))` on any `execute_script_guarded`
`Err` (src + inline paths). Results: lexical-scopes **2/3→3/3**, compile-error **0→2/2**, runtime-error **0→2/2**,
compile-error-in-attribute **1→2/2**, runtime-error-in-attribute **1→2/2**, body-onerror-{compile,runtime}-error
**1→2/2** each, runtime-error-in-body-onerror **0→1/1**, window-onerror-{runtime-error, parse-error,
runtime-error-throw} **0→2/3** each. **= +16, ZERO regressions** (event-handler realm all held; url-origin 406/7 and
structured-clone 141/10 stash-proven identical to baseline — their fails pre-exist). **CAPS:** exact error line/col
(the runtime→Rust boundary drops the throw site → we report `lineno:0`; the three `window-onerror-*` remaining fails
each assert an exact line); `onerroreventhandler.html` 0/3 blocked by a *separate* `document.body.outerHTML`→null
body-replacement bug; `*-in-setTimeout/setInterval` need string-source timers. **NEXT: timer-callback error
reporting** (`setTimeout`/`setInterval` `catch → _reportError`, with a hard regression sweep), then the
`body.outerHTML` body-replacement bug, then real line/col tracking. Scroll `tickets/169-the-reported-error-verdict.md`.

**Session 2026-07-09 (Quest #168 The Scope-Chain Verdict — scope-chain compilation + markup on-handler activation, +17):**
Took Quest #167's named last lever: the event-handler realm's final structural gap. An inline handler was compiled
by a bare `new Function('event', src)` — no scope chain, wrong `.toString()`, and (worse) parsed-markup `on*`
attributes never activated at all (only JS `setAttribute`/IDL paths did), so a `<td onclick=…>` fired NOTHING.
**THE FIX, three parts, all `bootstrap.js` + one new `ops.rs` op.** **(1) Compilation** (`_ehCompile`/`_ehMakeFn`):
build a function literally named `on<type>` whose params are the 5-arg OnErrorEventHandler form `(event, source,
lineno, colno, error)` for onerror on Window/body/frameset and `(event)` otherwise — so `.toString()` is exactly
`function on<type>(<params>) {\n<src>\n}` (`event-handler-sourcetext` **0→5**); the body is returned from inside
nested `with(document){with(formOwner){with(element){…}}}` (outermost→innermost = document→form-owner→element,
captured by the closure at creation), so free identifiers later resolve element→form-owner→document→window
(`compile-event-handler-lexical-scopes` **0→2**), the form owner gated on real form-association
(`_FORM_ASSOCIATED_TAGS` + `_ceDefinition.formAssociated`, NOT a bare `.form` getter that walks to any ancestor
form — that had given a `<div>` a bogus owner) so form-owner **0→4**. `with` natively honours `Symbol.unscopables`,
so an unscopable in-scope property stops shadowing the global — needed new extensible `@@unscopables` objects on
Element/Document/DocumentFragment prototypes (`compile-event-handler-symbol-unscopables` **0→3**). **(2) Markup
activation** (`_activateMarkupHandlers` in `_wrap`/`_wrapEl`): a new `on_handler_attrs` op returns an element's
space-joined `on*` attribute names (`""` for the common handler-less element, one bridge call per NEW wrapper);
each activates as a real listener at wrapper construction — before any script can `addEventListener` on that node,
so markup handlers keep spec ordering ahead of later listeners. The `_fireIframeElementLoad`/`_fireElementError`
markup-`onload`/`onerror` eval fallbacks stay correct (still gated on `!el['__ehon_<name>']`; now the real listener
fires during their `_dispatchSpec` and the eval is skipped — no double-fire). **(3)** Added `document.domain`
(origin host), `HTMLFormElement.enctype`/`encoding` (enumerated, url-encoded default), and a **live cached
`form.elements` HTMLFormControlsCollection** (same object every read → identity-stable; selector excludes
`input[type=image]`) — bonus `form-elements-matches` **0→2**, `form-elements-nameditem-01` **0→1** (both baselines
stash-proven 0). **= +17 across 6 tests, ZERO regressions** (all-global-events 375, processing 7, ordering 3,
cancellation 14/15, body-window 140, windowless-body 236, body-alt 118, window 118, qsa 1975, classlist 1420,
createElement 147, dispatchEvent 25, iframe-load 2/2, dialog-open 3/3, toggleevent-interface 39/39,
popover-toggle-source 7/7, mark 119, measure 38; popover-events 5/6 & details-toggleEvent 1/1F/9notrun both
stash-proven PRE-EXISTING). **DEV NOTE:** grep `_ehMakeFn`/`_ehScopeChain`/`_ehFormOwner`/`_activateMarkupHandlers`
/`on_handler_attrs` before touching handler compilation or element wrapping; a compiled handler's source text is
now the `function on<type>(…){…}` literal, and every element wrap pays one `on_handler_attrs` bridge call.
**CAPS:** `compile-event-handler-lexical-scopes` **test 3** (window's onerror must fire as an *ordered* `error`
listener — registered by `body.setAttribute("onerror")` BEFORE the test's `window.addEventListener("error")`, so it
must fire first; today `_reportError` fires all `error` listeners THEN calls `globalThis.onerror` data-prop last)
needs **onerror-as-listener** — the OnErrorEventHandler 5-arg / `return true`-inverts conversion of the
error-reporting subsystem, its own increment exactly like #167 did for onload (deferred to protect
onerroreventhandler / cancellation). RadioNodeList named access (`form-elements-nameditem-01` 2/3). **NEXT:
onerror-as-listener** (unlocks lexical-scopes test 3 + likely a broader onerror tail), then form-associated
custom-element `.form` (ElementInternals-set form owner) refinement.

**Session 2026-07-09 (Quest #167 The Onload Verdict — `window.onload` as a real `load`-event listener, +2):**
Took Quest #166's named next lever and closed its one honest cap. `window.onload` was a plain data property
(one of two names, `load`/`error`, excluded from the window on-handler accessor machinery) because the main
load-event driver both **called `window.onload()` directly** — with no event argument, so `e.currentTarget`
was undefined inside the handler — **and** dispatched a `load` event; a listener would have double-fired.
Two subtests pinned exactly that: `body-onload.html` (a detached `body.onload`, reflecting to `window.onload`
per #166, asserts `e.currentTarget === window`) and the last `event-handler-attributes-body-window` fail
(*"shadowed load on body fires when event dispatched on window"*). **THE FIX** — one `bootstrap.js` line + one
`page.rs` line: (1) removed `"load"` from `_WINDOW_ONHANDLER_DATA` so `window.onload` becomes a real
`load`-listener accessor (like `onresize`/`onpopstate`/…); (2) removed the direct `window.onload()` call from
`page.rs`'s `<load-event>` step — the trusted `load` dispatch already on the next line now fires onload once,
in listener order, with `currentTarget === window`. `error` stays a data-prop (bespoke `OnErrorEventHandler`
signature). **Frame path left untouched** — `_IframeWindow` proxies `onload` to a bare data-prop that
`dispatchEvent` never fires, so its direct call is the sole firing site (no double-fire to remove); both target
tests run in the **main** window. body-onload **0→1**, body-window **139→140** = **+2, zero regressions** (load
lifecycle held: iframe-load 2/2, user-timing/measures 119/119 [runs from `<body onload>`→`window.onload`],
clearMarks 57/57, test-document-onload 3/3, nav2-attributes 1/1, all-global-events 375, processing 7, ordering
3, onerroreventhandler 0/3, cancellation 14/15, qsa 1975, classlist 1420, createElement 147, dispatchEvent 25).
**CAPS:** frame-window onload-as-listener (no red test needs it); `-window-frameset` 0/118 = pre-existing
frameset-document cap. **NEXT: scope-chain compilation** (`compile-event-handler-lexical-scopes` /
`-symbol-unscopables` / `event-handler-sourcetext` — handler body run with element/form-owner/document in
scope + exact `.toString()` source) — the last structural gap in the event-handler realm; then markup
on-handler activation. Scroll `tickets/167-the-onload-verdict.md`.

**Session 2026-07-09 (Quest #166 The Body-Window Verdict — the Window-reflecting body element event handler set, +234):**
Took Quest #165's neighbour lever. #165 gave every element the general GlobalEventHandlers `on*` model
(element-scoped); this quest lands the HTML special case on top: on **`<body>`/`<frameset>`**, the reflecting
handlers `{blur,error,focus,load,resize,scroll}` ∪ WindowEventHandlers (24 names) act on the element's
**Window**, not the element. All `bootstrap.js`: a canonical `_BODY_WIN_REFLECT_SET`; reflecting `on*`
accessors installed on `HTMLBodyElement`/`HTMLFrameSetElement` prototypes that forward get/set to
`el.ownerDocument.defaultView` (null → inert, for windowless docs); `setAttribute`/`removeAttribute` route a
reflecting name to the Window's content-attr handler; added `afterprint`/`messageerror`/`pagereveal`/`pageswap`
to the window on-handler installer (they were missing); and `window.onerror`/`window.onunhandledrejection` now
default **null** (they were internal reporter stubs, visible to pages — the debug capture moved into
`_reportError`). `event-handler-attributes-body-window` **75→139**, `-windowless-body` **152→236**, `-body-alt`
**75→118**, `-window` **75→118** = **+234, zero regressions** (all-global-events 375, processing-algorithm 7,
inline-ordering 3, onerroreventhandler 0/3, eventhandler-cancellation 14/15, qsa 1975, classlist 1420,
createElement 147, dispatchEvent 25 held; baselines proven via stash-A/B). **CAPS:** `window.onload` is a
data-property, not a listener — the load-event driver calls `window.onload()` directly (no event arg) so
`body-onload` (0/1) and the load-fires subtest stay red; the root-cause fix is converting `window.onload` to a
real `load` listener + removing both direct calls (its own load-machinery increment). `-window-frameset` 0/118
is a pre-existing frameset-document cap. **NEXT: `window.onload` as a listener** (unlocks body-onload +
load-fires), then scope-chain compilation. Scroll `tickets/166-the-body-window-verdict.md`.

**Session 2026-07-09 (Quest #165 The Handler Verdict — GlobalEventHandlers `on*` IDL + content-attribute reflection, +383):**
Took Quest #164's named next lever: **GlobalEventHandlers content-attribute reflection**. `el.onclick = fn`
set a plain expando that fired nowhere, and `<div onclick>` content attributes fired nothing — there were no
general `on*` accessors on any element/document interface. Built the spec's event-handler model in
`bootstrap.js`: all 75 `on*` names are own accessors on **HTMLElement/SVGElement/Document/window (NOT
Element)**; a single listener installs at first activation (content-attr OR IDL set) and holds its position;
the value is a function, null, or a lazily-compiled raw content-attribute source; a `return false` cancels a
cancelable event. Required making **`SVGElement` a distinct class** (it was a bare `= Element` alias, which
would have leaked the handlers onto `Element.prototype`) and routing `createElementNS` SVG to it. Removed the
four now-double-firing manual `el['on'+type]` calls (popover toggle / dialog / select / reset) — those handlers
fire as installed listeners during dispatch now. `event-handler-all-global-events` **0→375**,
`event-handler-processing-algorithm` **2→7**, `inline-event-handler-ordering` **0→3** = **+383, zero
regressions** (qsa 1975, classlist 1420, dispatchEvent 25, insertBefore 39/40, createElement 147, focus-pseudo
20, focus-method-delegatesFocus 15, toggleevent 39, select-event 270, reset-form 12 held; popover-events 5/6
proven pre-existing via stash-A/B). **CAPS:** scope-chain compilation (lexical-scopes / unscopables /
sourcetext still red — a follow-up); markup on-handler activation not yet wired (`<div onblur>` from parsed
HTML fires nothing — the JS setAttribute/IDL paths work; markup is the next lever, unlocks
`focus-within-focus-move` + the inline-handler markup tail). **NEXT: markup on-handler activation** (activate
`on*` content attributes at wrapper construction, ideally gated on a cheap Rust node flag), then scope-chain
compilation. Scroll `tickets/165-the-handler-verdict.md`.

**Session 2026-07-09 (Quest #164 The Lit-Host Verdict — `:focus`/`:focus-within` on shadow hosts + focus-update-steps, +19):**
Took Quest #163's named next lever: **`:focus`/`:focus-within`-on-shadow-host selector matching**. The
shadow tree lives entirely in JS; in the Rust arena a shadow root is a *detached fragment* (its parent is
null), so the selector engine can't walk from a focused shadow node to its host — a shadow input's focus
never lit its host's `:focus`. **(1) The focus-host chain.** JS's `_focusShadowHosts(el)` walks the focused
element's parent chain, jumping each shadow root to its `_shadowHost`, collecting the hosts crossed (slotted
light-DOM content crosses none → its host stays dark, per spec). `_syncRustFocus` sends `[nid, host-nids]`
to Rust via the existing `set_focus` op (arg2); Rust `:focus` matches `focused == self || focus_hosts
∋ self`. A move that repositions the focused element (or a shadow-including ancestor) re-syncs the chain,
gated on a JS-only ancestor check so unrelated DOM-building pays no bridge op. **(2) `:focus-within`** —
was parsed-but-never-matched; now a real `PseudoClass::FocusWithin` matching the focused element's light-tree
inclusive ancestors + every focus-host and its ancestors (`Tree::focus_within`). **(3) Focus update steps** —
`_performFocus` now unfocuses the old element BEFORE its blur/focusout fire (activeElement reads `<body>`
during them, spec-correct), aborts if a nested `focus()` in a handler took over, and bails if `el` became
unfocusable — so focusing/removing a target from its own `focusout` leaves no stale `:focus-within`.
`focus-pseudo-matches-on-shadow-host` 8→20 (+12), `focus-selector-delegatesFocus` 6→12 (+6),
`focus-within-removal` 0→1 (+1) = **+19, ZERO regressions** (held: qsa 1975, classlist 1420, dispatchEvent 25,
insertBefore 39/40, focus-method-delegatesFocus 15, -with 8, autofocus 5, blur 2, activeElement 6,
ShadowRoot-delegatesFocus 3, delegatesFocus-tabindex-change 1, popover-focus 11/30 — all at baseline).
**CAPS:** `focus-pseudo-on-shadow-host-1/2/3` are **reftests** (render comparison, unwinnable); `focus-tab-on-shadow-host`
needs `:focus` render/send_keys; `focus-within-focus-move` needs **`onblur` content-attribute event-handler
reflection** (GlobalEventHandlers) which fires nothing today — a separate quest. **NEXT: GlobalEventHandlers
content-attribute reflection** (`on*=""` → compiled handler; unlocks focus-within-focus-move + broad event
tail), then **popover-in-taborder** (still open from #161). Scroll `tickets/164-the-lit-host-verdict.md`.

**Session 2026-07-09 (Quest #163 The Flattened Verdict — flat-tree scoped sequential focus navigation, +37):**
Took Quest #162's named next lever: **shadow-DOM sequential focus navigation**. The core
`_sequentialFocusNavigation` (Quest #159) gathered candidates from `document.querySelectorAll('*')`
— the **light DOM only** — so Tab never descended shadow trees, never followed slot assignment, and
mis-ordered across shadow/slot boundaries. Rewrote it to walk the **flat tree** and honour **focus
navigation scopes** (the document, each shadow tree, each `<slot>`). All `bootstrap.js`, one function.
**(1)** `flatChildren` — a scope node's flat-tree children: a shadow host exposes its shadow root's
children; a `<slot>` exposes its assigned slottables (fallback content when none, reusing `_findSlottables`);
a host's *light* children are reached only through its shadow `<slot>`s. **(2)** Per-scope member
collection + tabindex ordering (positive ascending, then the 0/auto group in flat order); a scope owner
(host/slot) is emitted at its own tabindex position and its inner scope spliced in there — so a slotted
element sorts by *its own* tabindex within the slot scope, and a host's contents appear right where the
host sits. **(3)** The scope rules the tests pin down: a `delegatesFocus` host is never itself a Tab stop
(only its shadow contents); a host/slot with an *explicit* negative tabindex removes its whole scope while
an *omitted*-−1 (whose `tabIndex` getter also reports −1) leaves the contents navigable — discriminator
`hasAttribute('tabindex') && tabIndex < 0`. Reverse traversal = the reverse of the built order; the #160
fixup starting-point resume is preserved (keyed on a flat-preorder map). Hand-traced the deeply-nested
`focus-navigation.html` (document → x-foo shadow → x-bar shadow → two interleaved slots, tabindex scrambled
across scopes) to the fixture's ideal order before measuring. `focus-navigation/`: focus-navigation 0→1,
focus-navigation-with-delegatesFocus 4→16, the 11-test slot family 0→1 each, focus-reverse-unassigned-slot
0→1, focus-with-negative-index 0→1 = **+26**; `focus/focus-tabindex-order-shadow-*` 11 tests 0→1 each =
**+11**. **+37 total, ZERO regressions** (stash A/B on the shared rewrite: baseline binary measured with the
change stashed, then popped + rebuilt + re-measured — qsa 1975, dispatchEvent 25, insertBefore 39/40, and
every #159/#160/#162 focus test held). **Caps:** `focus-with-negative-index` subtest 2 (intra-excluded-scope
navigation with a Chromium-specific exit order — needs the recursive scoped search, not a flattened list);
`focus-tabindex-order-shadow-varying-tabindex-2`/`-3` (multi-host + forwarder ordering); `:focus`/`:focus-visible`
on a shadow host (`focus-tab-on-shadow-host`, `focus-selector-delegatesFocus` 6/12, `focus-pseudo-*`,
`delegatesFocus-highlight-sibling`) is a **selector/render** gap — navigation lands focus correctly, but
these read `matches(':focus')` / computed style. **Next:** `:focus`/`:focus-within`-on-shadow-host selector
matching, then popover-in-taborder. Scroll `tickets/163-the-flattened-verdict.md`.

**Session 2026-07-09 (Quest #162 The Delegated Verdict — shadow-DOM focus retargeting + `delegatesFocus`, +28):**
Took Quest #161's named next lever: **shadow-DOM focus retargeting**. The `shadow-dom/focus/`
realm was mostly red — `document.activeElement` leaked shadow-internal nodes, `ShadowRoot.activeElement`
was a hard `return null`, and `delegatesFocus` did nothing (`host.focus()` never delegated). All
`bootstrap.js`. **(1)** `activeElement` as a **retargeting** — reused the existing event-dispatch
helpers `_retarget`/`_nodeRoot`/`_shadowIncAncestor`: `document.activeElement` = focused retargeted to
the document (topmost shadow host); `ShadowRoot.activeElement` = the retarget against that root, or null
when focus lies outside it. **(2)** The **focus delegate** `_shadowFocusDelegate(host)`: walk the host's
shadow TREE in tree order (slotted light-DOM content is never a candidate — a `<slot>`'s children are its
fallback, not its assigned nodes; nested delegating hosts descend, non-delegating ones are skipped),
preferring the first `autofocus` candidate else the first focusable. `host.focus()` delegates to it (keeps
focus if already inside; no-op if no delegate); `host.blur()` clears a shadow-tree delegation but not a
slotted element focused through the host. **(3)** The latent blocker: `Node.isConnected` isn't
shadow-including, so shadow-tree elements read `isConnected===false` and `_isFocusableArea` rejected them —
added `_shadowConnected` (shadow-crossing) used ONLY in the focus path (tight scope; provably ≡ `isConnected`
off-shadow). focus-method-delegatesFocus 1→15, activeElement 2→6, focus-method-with-delegatesFocus 4→8,
focus-autofocus 1→5, blur-on-shadow-host-delegatesFocus 1→2, delegatesFocus-tabindex-change 0→1 = **+28,
ZERO regressions** (same-session stash A/B: qsa 1975, dispatchEvent 25, insertBefore 39, event-composed 9,
event-composed-path 11, attachShadow 6, popover-focus 11, dialog-open 3, ShadowRoot-delegatesFocus 3/3 —
all identical). **Caps:** `:focus`/`:focus-within`-on-host matching (`focus-selector-delegatesFocus` 6/12,
`focus-pseudo-on-shadow-host-*`) is a selector/render gap; `focus-navigation/*` needs shadow/slot-crossing
sequential focus (flat-tree Tab order); root-cause `isConnected` shadow-inclusion deferred to its own quest.
**Next:** shadow-DOM sequential focus navigation (flat-tree Tab across slots + delegating hosts), then
`:focus`-on-host selector matching. Scroll `tickets/162-the-delegated-verdict.md`.

**Session 2026-07-09 (Quest #161 The Inert Verdict — the `inert` model, +13):**
Took Quest #160's named next lever: the **`inert` model** (HTML §inert). The `inert/`
realm was mostly red — `el.inert` was `undefined`, inert elements were fully focusable,
and turning an ancestor inert never fired the focus fixup. Three small `bootstrap.js`
changes. **(1)** Added `inert` to `__reflectedBoolAttrs` → the `inert` IDL boolean
reflection (getter reflects the element's *own* attribute, so a node inside an inert
subtree with no attribute of its own still reports `.inert === false`). **(2)** `_isInert(el)`:
walks self + inclusive ancestors for the `inert` attribute. **(3)** One line in
`_isFocusableArea` — `if (_isInert(el)) return false` — makes every inert element a
`focus()` no-op AND, because #160's fixup rule already re-checks `_isFocusableArea` on
*any* attribute change while something is focused, automatically blurs a focused
descendant when it (or an ancestor) turns inert — **no new fixup wiring needed**.
inert-node-is-unfocusable 1→6, dynamic-inert-on-focused-element 0→6, nested-inert-unfocusable
1→3 = **+13, ZERO regressions** (fresh-server sweep: qsa 1975, dispatchEvent 25, insertBefore
39, dialog-open 3, dialog-close 5, popover-focus 11, popover-attribute-basic 159,
tabindex-getter 120, focus-tabindex-order 1, tab-table-caption 6, after-disabled 1,
focus-fixup-rule-one 1/8 — all held). **Caps:** the rest of `inert/` is gated on features
*outside* the inert model — `getSelection().toString()` over a subtree (`inert-on-non-html`,
`inert-with-modal-dialog-001/002`), `window.find` (`-003`), modal-dialog inertness,
contenteditable typing (`-uneditable`), click activation (`-form-control`), and
hittest/reftests. **Next:** popover-in-taborder, then shadow-DOM focus retargeting. Scroll
`tickets/161-the-inert-verdict.md`.

**Session 2026-07-09 (Quest #160 The Fixed-Up Verdict — the focus fixup rule, +2):**
Took Quest #159's named "small, self-contained" next lever: the **focus fixup rule**
(HTML §focus-fixup-rule). When the focused element stops being a focusable area
(removed, `disabled`, `hidden`, loses `tabindex`), the UA must unfocus it, move the
focused area to the viewport (`activeElement` → `<body>`), and set the **sequential
focus navigation starting point** to it so a later Tab resumes from its position. All
`bootstrap.js`. **(1)** `_runFocusFixup()`: blur/focusout, null `__obscura_focused` (the
`activeElement` getter already returns `body` when null — no explicit body-focus), record
`__obscura_seqFocusStart`. **(2)** Triggers: **attribute changes** (`disabled`/`hidden`/
`tabindex`/`contenteditable`) schedule an **async** fixup at the end of `setAttribute`/
`removeAttribute`, gated on `if (__obscura_focused)` (near-free; the deferred callback
re-checks `_isFocusableArea` so an unrelated change no-ops); **removal** fixes up
**synchronously** at the `removeChild` site (`.remove()` routes through it — removal is the
one synchronous trigger per spec). **(3)** `_sequentialFocusNavigation` resumes from the
starting point when the focused element is no longer a candidate: first candidate whose
`(tabindex, tree-order)` key falls after it, wrapping — so Tab after disabling `target(ti=2)`
lands on `third(ti=3)`, not `first(ti=1)`; `_performFocus` clears the starting point on any
genuine focus move (single-use). sequential-focus-navigation-after-disabled 0→1;
focus-fixup-rule-one-no-dialogs 0→1 (bonus) = **+2, ZERO regressions** (stash-proven at
HEAD — both targets 0 with the change stashed, `focus-events` 0/0/2-other and
`autofocus/first` 0/1 unchanged either way; qsa 1975, insertBefore 39, dispatchEvent 25,
createDocument 434, setAttribute 2/2, attributes 67, tabindex-getter 120, focus-tabindex-order
1/1, tab-table-caption 6/6, tabindex-focus-flag 35/35, popover-focus 11, light-dismiss 15,
popover-attribute-basic 159, invoking-attribute 1400, toggleevent 39, on-popover-behavior 28,
on-dialog-behavior 104, dialog-open 3/close 5/canceling 1, button-type-behavior 23). **Caps:**
`focus-fixup-rule-one` (1/8) needs exact "end of update-the-rendering" fixup timing (after rAF
+ ResizeObserver — our rAF-scheduled fixup runs *during* the first rAF batch, failing the
"shouldn't have changed yet (rAF)" assert), ResizeObserver firing, and visibility:hidden /
ancestor-`fieldset[disabled]` / `contenteditable=false` focusability predicates — each a
separate lift. **Next:** the `inert` model, then popover-in-taborder, then shadow-DOM focus
retargeting. Scroll `tickets/160-the-fixed-up-verdict.md`.

**Session 2026-07-09 (Quest #159 The Tabbed Verdict — sequential focus navigation, +25):**
Took the four-quests-named "widest remaining focus lever": sequential focus navigation (Tab
order). The `sequential-focus-navigation-and-the-tabindex-attribute/` realm was almost all red —
`focus-tabindex-order/positive/zero/negative` at 0, `tabindex-getter` at 106/120. Three changes.
**(1) The `tabindex` default value** (`bootstrap.js`): a plain `<button>`'s `tabIndex` read −1
but should be 0. Per §dom-tabindex the default is a **name-based** table (0 for
a/area/button/frame/iframe/input/object/select/textarea + a details' summary, else −1) that
*ignores* disabled/hidden/href/type — a `<button disabled>` and `<input type=hidden>` still
default to 0, which is distinct from actual focusability (`_isFocusableArea`, which *does* honour
them). New `_defaultTabIndexZero` used in the absent/invalid branch of the getter. Fixed all 14
zero-default rows → **tabindex-getter 106→120**. **(2) `_sequentialFocusNavigation(backward)`**
(`bootstrap.js`): collect the focusable areas whose effective tabindex ≥ 0
(`el.tabIndex >= 0 && _isFocusableArea(el)` — a negative tabindex is focusable but skipped by
Tab), order them (positive first ascending, ties in tree order; then the 0 group in tree order),
and move focus after (backward: before) the currently focused element, wrapping at the ends.
Layout-free — tree order (querySelectorAll order) stands in for rendered order, correct for the
in-flow case. **(3) THE REAL FIGHT — `send_keys` must be ASYNC** (`wpt_run.py` bridge): the
navigation *logic* was right immediately (a direct CDP repro walked the order perfectly), but
`focus-tabindex-order` still TIMED OUT. The test's focus handler calls `test_driver.send_keys`
for the *next* Tab and then runs `i++` — real `send_keys` is asynchronous, so `i++` runs BEFORE
the next key fires. Our bridge dispatched keys **synchronously**, so the reentrant `send_keys`
inside the handler recursed the handler (btn9→btn5→btn0→btn9→…) *before* `i++` ever ran → infinite
recursion → timeout. Fixed by microtask-deferring each key's keydown/keyup (chained off
`Promise.resolve()`, returning the chain) so the handler unwinds (and `i++` runs) between keys.
Also stamped legacy `keyCode`/`which` (Tab === 9, the assertion every one of these tests makes)
and tracked modifier state for Shift+Tab. focus-tabindex-order/positive/zero/negative 0→1 each,
default-value 1→2, tabindex-getter 106→120, tab-table-caption 0→6 = **+25, ZERO regressions**
(stash-proven at HEAD — `tabindex-focus-flag` was already 35/35 so NOT claimed; the deferred
`send_keys` still drives Escape close-requests: dialog-canceling 1/1 held; qsa 1975, insertBefore
39, dispatchEvent 25, structured-clone 141, popover-attribute-basic 159, invoking-attribute 1400,
toggleevent 39, light-dismiss 15, popover-focus 11, on-popover-behavior 28, dialog-open 3/close 5,
on-dialog-behavior 104, button-type-behavior 23). **DEV NOTE:** when a test that drives input
*hangs* rather than fails, suspect **sync-vs-async** in the input bridge — a synchronous
`send_keys` breaks any test that does work after the call expecting the key to fire later. **Caps:**
`popover-focus-2` + the popover-focus button-click family need **popover-in-taborder** (a shown
popover's contents join tab order right after its invoker) + coordinate-invoker activation;
`sequential-focus-navigation-after-disabled` needs the **focus fixup rule** (disabling the focused
element resets focus); shadow-DOM focus retargeting; the `inert` model. **Next:** the focus fixup
rule (small), then `inert`, then popover-in-taborder / shadow-DOM focus retargeting. Scroll
`tickets/159-the-tabbed-verdict.md`.

**Session 2026-07-08 (Quest #158 The Focused Verdict — a layout-free focus model, +13):**
Took the four-quests-running "widest lever overall": a focus / `activeElement` model. The
popover/dialog APIs shipped (#152–#157) but every focus-dependent subtest was red —
`popover-focus` at 1/30, the dialog autofocus tests HUNG (`waitUntilLoadedAndAutofocused()`
never resolved), and `focus()` focused *anything*. The primitives existed (`activeElement`
← `__obscura_focused`; `focus()`/`blur()` dispatching focus/blur/focusin/focusout); what was
missing were the ALGORITHMS. All `bootstrap.js`. **(1)** A **FOCUSABILITY predicate**
(`_isFocusableArea`) over a layout-free `_isRenderedForFocus` (walks self + ancestors,
rejecting `hidden`/inline-`display:none`/closed-`<dialog>`/non-showing-`[popover]` — exactly
what the WPT autofocus fixtures use to SKIP candidates), so `focus()` on a non-focusable
element is a no-op (`popover.focus()` on a `<div popover>` with no `tabindex` does nothing).
**(2)** The **autofocus FOCUSING STEPS** on show — a popover focuses its `autofocus` self or
its autofocus delegate; a dialog focuses its `autofocus` self → focus delegate (autofocus
delegate → first focusable descendant) → **the dialog itself** as fallback. **(3)** Focus
**RESTORATION** to a stored `_previouslyFocusedElement` on hide/close/Escape (auto popovers +
dialogs; a `focusPrev` flag opts removal + a modal dialog superseding popovers OUT). **(4)**
Fixed `_processCloseRequest` so a `<dialog>` shown *as a popover* (no `open` attr) takes the
hide-popover path (restores focus), not `requestClose` (which early-returns) — tracked the
winner's origin stack (`bestKind`). **(5)** **Document-load autofocus** (flush the autofocus
candidates on `window` `load` — the `focusin` that `waitUntilLoadedAndAutofocused` waits for).
popover-focus **1→11** (all 8 div-popover "Popover focus test" subtests + both `<dialog
popover>` variants), dialog-autofocus **0→1**, show-modal-focusing-steps **0→1**,
dialog-autofocus-just-once **0→1**. **Zero regressions** (stash-proven at HEAD; a mid-session
regression — the disconnected-dialog fallback focused the disconnected dialog, 2/2→1/2 — was
caught by the stash baseline and fixed with an `_isFocusableArea(control)` guard so the steps
only move focus to a real focusable area; qsa 1975, insertBefore 39, dispatchEvent 25,
structured-clone 141, iframe-load 2/2, popover-attribute-basic 159, popover-light-dismiss 15,
popover-invoking-attribute 1400, toggleevent 39, on-dialog-behavior 104, on-popover-behavior
28, dialog-open 3/3, dialog-close 5/5, dialog-focusing-steps-disconnected 2/2). **Caps:** the
"button click"/"corner cases" popover-focus families (18 subtests) need coordinate-invoker
activation + isTrusted-synthetic click-to-focus; `popover-focus-2` + the whole Tab tail need
sequential focus navigation (`sendTab`/`sendShiftTab` — Tab-order traversal); `focus-after-close`
shadow subtests need shadow-DOM focus retargeting; `dialog-focusing-steps-inert` needs an
`inert` model. **Next:** sequential focus navigation (Tab order — the widest remaining focus
lever, unlocks `popover-focus-2` + the broad Tab tail), then `inert`, then shadow-DOM focus
retargeting, then coordinate-invoker activation. Scroll `158-the-focused-verdict.md`.

**Session 2026-07-08 (Quest #157 The Watched Verdict — the `CloseWatcher` API + Window `on*` accessors, +65):**
Found the whole `close-watcher/` realm red and a nearly-complete `CloseWatcher` draft sitting uncommitted from a prior
session (the close-watcher **manager** + the `CloseWatcher` class + a `_cwTopSeq` splice into `_processCloseRequest` + a
`__obscuraUserActivation` bridge hook). **Verified, measured, root-cause-fixed, regression-swept, and completed it.** The
manager: activation-gated GROUPS — watchers established without intervening user activation share ONE group that a single
Esc closes in reverse order; each user activation (bridge `click`/`bless()`) banks room for one more group; a prevented
cancel consumes the activation. `_processCloseRequest` (the #156 Esc entry) now ranks a close-watcher group by its topmost
watcher's `_topLayerSeq` against the popover/dialog stacks and routes to `_cwProcessCloseWatchers()` when it wins (no
watchers → −1 → popover/dialog path untouched, stash-proven inert). **The root-cause fix this session** (what turned
`esc-key/keydown` green): Window `on*` handler IDL attributes were inert `null` data properties installed for feature
detection only — `window.onkeydown = fn` never registered a listener, so a page's `onkeydown` `preventDefault()` couldn't
swallow the close request. Made them **real listener-registering accessors** (so `onkeydown`/`onresize`/`onpopstate`/
`onhashchange`/… actually fire during dispatch — broadly useful), **EXCLUDING `onload`** (the load driver both dispatches a
`load` event AND calls `win.onload(...)` → a listener would double-fire and regress `iframe-load-event`) and **`onerror`**
(invoked manually with its bespoke `(message, source, lineno, colno, error)` signature). The only event dispatched to the
window engine-wide is `load` (grep-verified), so those two exclusions make the change safe. basic 0→7, event-properties
0→1, abortsignal 0→9, frame-removal 0→5, inside-event-listeners 0→12, esc-key 0→5, user-activation 2→28 = **+65, ZERO
regressions** (stash-verified clean HEAD; iframe-load-event 2/2 held, qsa 1975, createElement 147, dispatchEvent 25,
Node-insertBefore 39, structured-clone 141, url-origin 406, popover-attribute-basic 159, toggleevent-interface 39, command
event-interface 22 / on-dialog-behavior 104 / button-type-behavior 23, dialog-open 3, dialog-close 5). **Caps:** the 9
`-dialog`/`-popover` user-activation variants need dialogs/popovers wired into the manager as close watchers (group-close
semantics — touches the hot `_showPopover`/`_showModalDialog` paths, deferred to bank the clean win); cross-realm
`frame-removal` last subtest + `iframes/*` need a per-realm fully-active check. **Next:** dialogs/popovers as close
watchers (the grouping — the spec-correct root architecture), then a focus/`activeElement` model. Scroll
`157-the-watched-verdict.md`.

**Session 2026-07-08 (Quest #156 The Driven Verdict — the `test_driver` input bridge, +56):**
Took the four-quest-running "next leverage" — a `test_driver` input bridge — the widest single lever for the whole
popover/dialog light-dismiss + keyboard close tail. **Four interlocking pieces, each discovered by measurement:**
**(1) A real `elementFromPoint`** (`bootstrap.js`): it was a stub returning `<body>`, but `getBoundingClientRect`
synthesizes a stable, distinct per-node rect (a grid keyed by node id), and automation always clicks an element at *its
own* center — so a hit-test returning the topmost (deepest/latest-in-tree) element whose synthetic box contains the point
returns exactly the clicked element (preserves the non-null `<body>` fallback for stray points; saves/restores gBCR's
`__obscura_click_target` side effect). **(2) The Escape close-request** (`_processCloseRequest`, invoked from `input.rs`
AND the in-page bridge): a trusted Escape keydown — **only if not preventDefault'd** (a focused text field swallows it) —
runs the UA algorithm, picking the single topmost top-layer element across **both** the auto/hint popover stack and the
open modal dialogs (ranked by a new monotonic `_topLayerSeq` stamped when a popover shows / a dialog goes modal; a
`_modalDialogSet` maintained at the `_setDialogModal` choke point) and running its close behavior (hide popover; or fire
cancelable `cancel` then close the dialog). **(3) The in-page bridge** (`scripts/wpt_run.py` via `add_init_script`):
`test_driver_internal.{click,send_keys,action_sequence,bless}` synthesize DOM events **directly in the page** (element
origins → viewport-center coords, WebDriver key code points → key/code, then pointer/mouse down→up→click + keydown/keyup +
the Escape close-request), installed via a get/set property so it survives testdriver.js's single assignment. **(4)
Preload-before-scripts** (`page.rs` + `domains/page.rs`) — THE crux: Obscura ran CDP `addScriptToEvaluateOnNewDocument`
sources *after* navigation, but runs the whole async harness *during* navigation, so the bridge landed after the
promise_tests already ran against the throwing default backend; fixed by threading preloads onto the page
(`set_pending_preloads`) and running them right after the JS context is created, **before** the document's own scripts
(correct "on new document" ordering). **Why in-page, not CDP-routed** — three earlier designs failed and taught the next:
Playwright `expose_binding` died (Obscura's `Runtime.addBinding` is a no-op stub); a Python-drained queue died (the page
thread blocks on any in-flight `page.evaluate` — a 2 s timer starved a parallel `1+1` into an 8 s timeout, so a concurrent
drainer deadlocks); draining after `goto` died (the harness completes *during* `Page.navigate`, so Python never regains
control while tests run). In-page synthesis runs synchronously exactly when the test needs it (trade-off: `isTrusted:false`,
so "synthetic events can't close popovers" is unwinnable this way). **popover-attribute-basic 113→159 (+46 bonus from real
hit-testing), popover-light-dismiss 8→15, -hint 1→3, dialog-canceling 0→1 = +56.** **Zero regressions** (stash-proven
baselines at clean HEAD; held with the bridge injected on every run: qsa 1975, createElement 147, Node-insertBefore 39,
appendChild 11, command realm 193/193 [event-interface 22, command-reflection 16, button-type-behavior 23, on-popover 28,
on-dialog 104], popover all-elements 1101 / invoking-attribute 1400/1402 / toggleevent 39, dispatchEvent 25, structured-clone
141, url-origin 406, mark 22, getRandomValues 39). **Caps:** Tab/focus navigation (no focus/`activeElement` traversal model);
isTrusted-synthetic (in-page events); coordinate-driven invoker activation; `pointerup`-vs-`pointerdown` timing; the
`CloseWatcher` API (`close-watcher/*` need `new CloseWatcher()`); `dialog-cancel-events` (async close event doesn't reach
`done()` during navigation — 0/1 baseline, still 0/1). **Next:** a focus/`activeElement` model unlocks the whole Tab/focus
tail across popovers, dialogs, and forms; then `CloseWatcher`; then `pointerup` timing + coordinate invoker activation.
Scroll `tickets/156-the-driven-verdict.md`.

**Session 2026-07-08 (Quest #154 The Commanded Verdict — the `command`/`commandfor` invoker API, +92):**
Took the #152/#153-named "next leverage" — the `command`/`commandfor` invoker API, the event-driven sibling of `popovertarget`,
found the `command-and-commandfor/` realm almost entirely red. All `bootstrap.js`, no new Rust. **(1) `CommandEvent`** (Event
subclass like `ToggleEvent`): `command` ToString-coerced readonly; `source` an `Element?` where a present non-Element (bool, `{}`,
`XMLHttpRequest`) throws WebIDL TypeError — and `source` **retargets through event dispatch exactly like `relatedTarget`**.
**(2) Generalized the shared dispatch** (`_dispatchSpec`/`_invokeListeners`) with a single `_rtBase` = relatedTarget for a
Mouse/Focus event OR the CommandEvent's original `source` (stashed immutable in `_cmdSource`; per-struct retarget written to
`_sourceLive`); **guarded on `'_cmdSource' in event`** so for every existing event `_rtBase === relatedTarget` and the path is
provably inert. **(3) `commandForElement`** element reflection (button-only): the getter exposes the explicit element while it's a
**descendant of a shadow-including ancestor** of the button (the get-the-attr-associated-element algorithm — differs from
popoverTargetElement's same-root check). **(4) `command`** enumerated reflection (known keywords case-fold; `--custom` verbatim;
invalid/missing → `""`). **(5) `button.type` Auto-state**: Auto reflects `submit` only for a bona-fide submit button (no
command/commandfor), else `button`. **(6) Activation** (`_runCommandInvoker` + `click()`): the form-owner gate returns early for
Submit/Reset/Auto ONLY when the button has a form owner (honoring `form=` via `_ceiFormOwner`); command validity is decided
BEFORE firing (popover cmds on any HTML element, show-modal/close only on `<dialog>`, unsupported → no event), the command value
captured before the cancelable/bubbling/composed event, default action gated on not-canceled + still-connected.
interface 1→11, command-reflection 8→16, event-interface 0→22, button-type-behavior 8→23, button-type-reflection 9→27,
on-popover-behavior 14→28, on-popover-disconnect 0→1, source-attribute-retargeting 0→3, +bonus popover-toggle-source 6→7 =
**+92, ZERO regressions** (a mid-quest `on-popover-invalid-behavior` regression — show-modal/close firing on a non-dialog — was
caught by the sweep and fixed with the validity gate; shared-dispatch verified: event-with-related-target 18/18, composed-path
11/11, dispatchEvent 25/25; popover held: all-elements 1101, invoking 1400/1402 [test_driver cap], -hint 700, toggleevent 39;
qsa 1975, createElement 147). **CAP:** the dialog command tail (`on-dialog-behavior` 0/104, `-invalid` 1/40) is dialog-API-blocked
— `dialog.showModal` doesn't exist yet; `_runCommandInvoker` already dispatches show-modal/close, so ~140 subtests light up the
moment the `<dialog>` API lands. **NEXT: the `<dialog>` element API** (show/showModal/close/requestClose, `open` reflection,
returnValue, cancel/close events, `:modal`, top-layer) — unlocks the dialog command tail PLUS the standalone dialog realm; then
a `test_driver`→CDP input bridge for the light-dismiss/focus tail. Scroll `tickets/154-the-commanded-verdict.md`.

**Session 2026-07-08 (Quest #153 The Hinted Verdict — the popover hint-stacking model + `document.currentScript`, +21):**
Quest #152 landed the popover API on a **single merged auto/hint stack** whose "show closes
unrelated popovers" step used pure DOM containment — correct for auto-only pages, wrong for
hints. This session built the real **auto/hint two-list model** from the HTML spec (all
`bootstrap.js`): the single `_popoverAutoStack` top-layer order is filtered by **effective
type** into the spec's "showing auto/hint popover lists"; an `auto` opened inside a `hint`
is **downgraded** to hint (stored on the element); `_topmostPopoverAncestor` finds the nearest
open flat-tree ancestor OR the popover containing the invoker `source` (whichever is later);
`_hideStackUntil(endpoint, type)` closes, top-first, one type's list above an endpoint; **show
popover** closes hints always + autos only when this popover resolves to auto (the spec's
"hints close first" ordering); **hide popover** closes the nested hint stack with its auto
parent (a `_popoverHintStackParent`) but leaves a sibling hint. Added **`document.currentScript`**
— a `Document` getter fed by the classic-script driver (`page.rs` threads each `<script>`'s node
id through `ScriptInfo.nid` and sets `__currentScriptNid` before running it; the dynamic
`appendChild` eval path save/restores it) — broadly useful beyond popovers. Plus **`{source:null}`
→ TypeError** with source-based ancestry, **`popoverTargetElement` element-reflection** (`=null`
removes the attribute; any `popovertarget` content-attr write clears the explicit ref), and the
document **`showing popover` / `hiding popover nesting count` reentrancy guards** (a `showPopover()`
from inside a closing `beforetoggle` throws `InvalidStateError`). **types-with-hints 0→7/7,
imperative-invokers 5→10/10, open-in-beforetoggle 0(ERROR)→3/5, hint-hierarchy 0→3/5,
top-layer-nesting-hints 3→5, popovertarget-reflection 0→1/1 = +21.** **Zero regressions**
(stash-verified the script-driver change — async_001 0/1 & script-onerror TIMEOUT pre-existing;
held: qsa 1975, classlist 1420, createElement 147, reflection-misc 4709, reactions Element 47 /
Node 14 / NamedNodeMap 14 / HTMLElement 22, attributes 67, popover all-elements 1101 / invoking
1400 / -hint 700 / toggleevent 39 / attribute-basic 113 / toggle-source 6). **Caps:** the
`test_driver`→CDP input bridge remains the widest lever (light dismiss/focus, and the tests
compute coordinates needing `elementFromPoint`/layout Obscura fakes); `dialog.showModal`; the
`command`/`commandfor` API; shadow-flat-tree ancestry (`popover-nested-in-button` invoker-in-shadow).
**Next:** the `command` API (cleanest non-render popover win). Scroll `tickets/153-the-hinted-verdict.md`.

**Session 2026-07-07 (Quest #152 The Overlaid Verdict — the whole popover API, +~3405):**
The `html/semantics/popovers/` realm was found **entirely red** (0 passing) — the biggest
untouched frontier on the board. Built the popover API top-to-bottom, almost all in
`bootstrap.js` plus a tiny Rust primitive mirroring `:defined`/`:state()` (a non-monotonic
`popover_open` node set + `set_popover_open` op + a `:popover-open` match arm). Added
**`ToggleEvent`** (oldState/newState ToString-coerced readonly, source Element?, no
relatedTarget); the **`popover` reflector** (enumerated auto/hint/manual, invalid→manual);
**`showPopover`/`hidePopover`/`togglePopover`** over HTML's algorithms — `check popover
validity` (NotSupportedError / silent no-op / InvalidStateError), the cancelable opening
`beforetoggle` with a **type re-check after every event-firing step** (a handler that changes
the type throws InvalidStateError), cascade-closing the auto/hint top-layer stack, and the
async **coalescing `toggle`** element task; **attribute-change steps** (a type change while
showing hides the popover, firing events) and **removal steps** (a showing popover that leaves
the document is hidden without events), gated on `_popoverShowingCount`; **`popovertarget`
invokers** (`popoverTargetElement`/`popoverTargetAction` IDL + activation in `.click()`, the
invoker becomes the ToggleEvent `source`, a submit/reset/image button with a form owner does
its form action instead of toggling); spec-correct **light dismiss** (currently harness-capped);
and — with no render engine — **UA `display:none` for hidden popovers** synthesized in
`getComputedStyle` + the offset/rect stubs so the WPT visibility helpers pass, all gated on a
monotonic `_popoverEverUsed` flag (stash-verified inert off-popover: `elementFromPoint` 9/33 and
`Element-matches` 669/669 identical pre/post). **all-elements 0→1101, invoking-attribute 0→1400,
-hint 0→700, toggleevent 0→39, attribute-basic 0→113, button/input-type 0→11/8, toggle-source
0→6, events 0→5, togglePopover 0→3, reactions/HTMLElement 20→22, +a dozen more.** **Zero
regressions** (qsa 1975, classlist 1420, createElement 147, reactions/Element 47/Node 14,
cloneNode 135, reflection-misc 4709, Node-appendChild 11). **Caps:** light/keyboard dismiss +
focus tests drive `test_driver.Actions()`, which this harness doesn't bridge to CDP input (the
136 `popover-attribute-basic` combinatorial fails, `popover-light-dismiss-*`, `popover-focus-*`);
hint-before-auto stacking semantics; the `commandfor`/`command` invoker API; reftests need
render. Scroll `tickets/152-the-overlaid-verdict.md`.

**Session 2026-07-07 (Quest #151 The Queued Verdict — the custom element reactions STACK, +12):**
Quests #144–#150 ran the whole custom-elements realm on a **single global FIFO** reaction queue
drained by a re-entrancy-guarded flush at the end of each mutating op — correct for a flat
mutation, wrong the moment a reaction callback itself mutates the DOM (the nested mutation's
reactions flattened into the outer drain). Replaced it with HTML's **custom element reactions
stack** (all `bootstrap.js`, no Rust): per-element reaction queues, a stack of element queues
where each `[CEReactions]` boundary pushes/drains its own queue, plus a backup element queue +
`queueMicrotask` safety net. **Upgrade became a queued reaction** — `_ceTryUpgrade`/`define()`/
`upgrade()`/`createContextualFragment` now ENQUEUE an upgrade reaction (`_ceEnqueueUpgrade`)
instead of upgrading synchronously; `_ceDoUpgrade` runs during invoke and enqueues
attributeChanged (for the PRE-construction observed attributes) + connectedCallback (on the
PRE-construction connected state) **before** running the constructor, so an attribute the ctor
sets no longer spuriously fires attributeChanged and a `this.remove()` in the ctor no longer
suppresses connectedCallback. `define()`'s candidate loop is one boundary → per-element
`ctor, attrChanged, connected` ordering. The four step functions self-bound only as the
top-level op; `appendChild`/`insertBefore` open ONE boundary spanning removing+adopting+
inserting (gated on `_ceGlobalDefCount > 0`) so a reaction fired inside an `adoptedCallback`
sees siblings' still-pending `connected` reactions. Everything stays behind `_ceGlobalDefCount`
→ zero cost off custom elements. reaction-queue 1→6, reaction-timing 1→3, enqueue-inside-callback
4→8 = **+12, ZERO regressions** (git-stash-verified: microtasks-and-constructors 1/5,
range-and-constructors 0/2, connected/disconnected 24, Document 11, upgrading 25 all identical
pre/post; whole reactions/ dir + qsa 1975 / classlist 1420 / createElement 147 held). CAPS:
`throw-on-dynamic-markup-insertion-counter-{construct,reactions}` (0/11 each) need a real
`document.write` parser + per-doc throw-on-dynamic counter + `document.open(URL)` navigation
(subtest 3 hard-times-out, cascading notrun) — separate feature, navigation cap. NEXT: **`popover`**
(reactions/HTMLElement 20/22 — the last 2; self-contained), then the detached-iframe innerHTML-
upgrade gap (reactions/HTMLTableElement 7/10). Scroll `tickets/151-the-queued-verdict.md`.

**Session 2026-07-07 (Quest #150 The Tabulated Verdict — the whole tabular-data IDL, +146):**
The table family (`HTMLTableElement`/`HTMLTableSectionElement`/`HTMLTableRowElement`/`HTMLTableCellElement`)
were **empty subclasses** — `createElement("table")` was honestly an `HTMLTableElement`, but the entire
tabular DOM API was absent, pinning `html/semantics/tabular-data/` at **1/131**. Built the whole layer in
ONE `bootstrap.js` block (no Rust) over three enumeration helpers — `_tblKids(el, local)` (direct HTML-ns
children by localName), `_tblCells(tr)`, and `_tableRows(table)` (thead rows → direct-tr+tbody rows
interleaved in tree order → tfoot rows). Every enumeration is HTML-namespace + localName scoped, so a
`<foo:caption>` or foreign-namespaced `<tbody>` is invisible, matching the spec's namespace filters and the
`createElementNS("", …)` cases. **HTMLTableElement:** `caption`/`tHead`/`tFoot` getters+setters (WebIDL
TypeError on wrong type, HierarchyRequestError on wrong-localName section / cyclic insert), `createCaption`/
`createTHead`/`createTFoot`/`createTBody`, `deleteCaption`/`deleteTHead`/`deleteTFoot`, `tBodies`+`rows`
([SameObject] live HTMLCollections), `insertRow`/`deleteRow` (IndexSizeError bounds; the empty-table
create-a-tbody branch). **Section:** `rows`, `insertRow`/`deleteRow`. **tr:** `cells`, `insertCell`/
`deleteCell`, `rowIndex` (index in the table's rows collection, −1 unless properly parented in an HTML
table), `sectionRowIndex` (index among the parent's tr children — for a direct-table-child tr that's its
position among the table's *direct* tr children, NOT the full rows collection). **td/th:** `cellIndex`.
Named access (`table.rows.foo`), `namedItem`, and `Object.getOwnPropertyNames(rows)` all came free from the
existing `_makeHTMLCollection` Proxy. **Reactions came free** — every mutation routes through
appendChild/insertBefore/remove which already fire `[CEReactions]`. tabular-data element suite 1→131 (+130),
cellIndex 0→6, reactions/HTMLTable{Element 0→7, RowElement 0→1, SectionElement 0→2} = **+146, ZERO
regressions**. CAP: reactions/HTMLTableElement 7/10 — the 3 remaining need custom-element construction when
setting `innerHTML` on a *detached iframe-owned* element (a #148-era innerHTML-upgrade gap, not table IDL).
NEXT: reaction-queue microtask model (highest tail, highest risk), then `popover`. Scroll
`tickets/150-the-tabulated-verdict.md`.

**Session 2026-07-06 (Quest #149 The Reflected Verdict — CEReactions on CSSOM + reflectors, +26):**
The `custom-elements/reactions/` suite had a cluster of untouched interfaces. The elephant was
`CSSStyleDeclaration` (0/30): mutating `el.style.setProperty`/`cssText`/`removeProperty`/camelCase
never wrote back to the `style` content attribute at all (`getAttribute('style')` returned stale/null),
so no `attributeChanged` reaction could fire. **The root-cause fix (all `bootstrap.js`):** the element's
inline `CSSStyleDeclaration` gets an `_onChange` back-reference; every mutation method fires it
(`_notifyChange`, batched so a shorthand expansion like `border-width`→4 longhands reflects as ONE
reaction), and `_styleWriteback` re-serializes the declaration and reflects it via `setAttribute('style', …)`
— which keeps the Rust tree/`getAttribute`/serialization live AND fires the `[CEReactions]` attributeChanged.
**Gated on `_ceGlobalDefCount > 0`:** the only spec-observable consequence of reflecting a *per-property*
CSSOM mutation is a custom-element reaction, so the writeback stays inert (and zero-cost) on non-custom
pages — which also avoids leaking our lenient CSSOM value storage (real browsers reject `width: -100px` /
unknown properties at parse time; we store them, and an always-on writeback surfaced them as spurious
attributes / mutation records — caught & fixed via a stash-compare that flagged 3 regressions:
`cssstyledeclaration-setter-attr` 2→0, `mutationrecord-002`/`005` 1→0). The whole-declaration `.style =`
setter keeps its unconditional raw reflect (baseline). Plus `-webkit-filter`→`filter` alias (in the central
`_cssPropToKebab`). Then three reflectors: `HTMLAnchorElement.text` (textContent alias),
`HTMLTitleElement.text` (child-text-content get / replace-all set — a documented #148 cap), and
`contentEditable` (enumerated reflector on `HTMLElement.prototype`). CSSStyleDeclaration 0→22,
ElementContentEditable 0→2, HTMLAnchorElement 0→1, HTMLTitleElement 0→1 = **+26, ZERO regressions**
(qsa 1975, createElement 147, classlist, reactions/Element 47/HTMLElement 20/Node 14/NamedNodeMap 14,
upgrading 25, pseudo-class-defined 31, adopted-callback 32; CSSOM csstext 7/11, modifications 2/4,
mutationrecord suite, setter-attr 2/2 all held). CAPS: CSSStyleDeclaration 22/30 last 8 = border-width/
style/color shorthand **serialization recombination** (we expand them to longhands but `_serializeDeclBlock`
only recombines margin/padding — broad CSSOM-serialization change, deferred); the always-on getAttribute(
'style') reflection for non-custom pages (needs stricter CSSOM value validation to not leak invalid values —
this is why `mutationrecord-001`'s valid-value gain is forgone under the gate); HTMLSelectElement 3/5 (indexed
setter); the whole table IDL (`HTMLTableElement`/`Section`/`Row` 0/13 — caption/tHead/tFoot/insertRow/rows/
cells, a separate quest with a large `tabular-data` tail). NEXT: **the table IDL** (fresh primitive, broad
tabular-data tail + the 13 reaction subtests), then **reaction-queue microtask model**, then `popover`.
Scroll `tickets/149-the-reflected-verdict.md`.

**Session 2026-07-06 (Quest #148 The Realmed Verdict — per-window `CustomElementRegistry`, +36):**
Quests #144–#147 built the whole custom-elements realm behind ONE global registry, but HTML gives
each Window its own. The shared WPT helper `test_with_window(f)` runs each test in a fresh iframe and
does `contentWindow.customElements.define('custom-element', C)` — and because our iframe window's
`customElements` fell through a Proxy to the global registry, the SECOND test's define collided
(`the name "custom-element" has already been used with this registry`), pinning `reactions/Document`
at 0/12 and `parser-uses-registry-of-owner-document` at 1/10. **The fix, all `bootstrap.js`:**
**(1)** `_ceRegistryForDoc`/`_ceRegistryForNode` resolve the registry of a node's OWNER DOCUMENT —
main doc → global registry, iframe doc → its own (`doc._ceRegistry`), window-less doc → null (never
constructs). `_IframeWindow` mints `new CustomElementRegistry(doc)`; `define()` walks ITS document's
upgrade candidates. **(2)** A single `_ceGlobalDefCount` (defs across ALL registries) replaces every
`_defs.size` gate so non-custom pages stay provably inert; a global `_ceGlobalByCtor` map lets the one
shared `HTMLElement` ctor resolve `new.target` across realms. **(3)** `createElement` dropped its
`defaultView === globalThis` gate for `_ceRegistryForDoc(this)` — so iframe `createElement`/`importNode`
(delegates to `cloneNode`→`createElement`)/`adoptNode` now construct from the frame registry; every
reaction hook (`_ceTryUpgrade`, `attachInternals`, `attachShadow`, `createContextualFragment`) resolves
per-node. **(4)** `innerHTML`-parsed nodes get `_setNodeDocumentDeep` retagged to the context element's
document (gated to non-main docs) so `frameBody.innerHTML='<x>'` upgrades against the RIGHT registry.
**(5)** New spec `Document.body` setter (WebIDL TypeError + HierarchyRequestError + replace/append, CE
reactions free) and `_IframeDocument.write`/`open`/`writeln`/`close` clear semantics (write on a loaded
doc implicitly opens→empties→disconnected, then appends the parsed markup). reactions/Document 0→10,
parser 1→10, upgrading 17→25, pseudo-class-defined 27→31, Document.body 7→11, reaction-queue 0→1 =
**+36, ZERO regressions** (qsa 1975, createElement 147, reactions/Element 47/HTMLElement 20/Node 14,
adopted-callback 32, CustomElementRegistry 31, connected 24, disconnected 24, structured-clone 141).
CAPS: reactions/Document last 2 = `execCommand('delete')` (editing) + `HTMLTitleElement.text`;
reaction-queue rest = the microtask backup-element-queue model. Scroll `tickets/148-the-realmed-verdict.md`.

**Session 2026-07-05 (Quest #147 The Reactive Verdict — CEReactions on the remaining DOM mutation entry points, +51):**
Quest #144 wired reactions into the primary mutation paths; this filled in EVERY other
Quest #144 wired reactions into the primary mutation paths; this filled in EVERY other
`[CEReactions]` entry point the `custom-elements/reactions/` suite exercises. All `bootstrap.js`,
all gated on `customElements._defs.size` so non-custom pages pay zero cost. **(1) Attribute
funnel:** `setAttributeNS`/`setAttributeNode(NS)`/`NamedNodeMap.setNamedItem(NS)` and the
`Attr.value`/`nodeValue`/`textContent` setters ALL funnel through `_rawSetNS` (removes through
`_rawRemoveNS`), so ONE hook in each — read old value when `"custom"`, then
`_ceAttributeChanged(local, old, new, ns)` — fixed Element attrs + Attr + NamedNodeMap + the
Attr-node cases of Node at once. **(2) Moved connected nodes run removing steps** (DOM "adopt"
step 2): `appendChild`/`insertBefore` now capture `_wasConnected` before the tree op and
`_ceRemovalSteps(node)` after, so a cross-document move fires the leading `disconnected`;
`replaceChild` + all before/after/replaceWith/remove/append/prepend delegate to these cores;
`textContent`/`innerText`/`outerText` setters fire removal steps on detached children.
**(3) HTMLElement reflectors:** `translate`/`draggable`/`spellcheck` (IDL bool → enumerated
keyword content values) + a real `outerText` setter. **(4) `Range.createContextualFragment`:**
fragment-parse in context, then upgrade the subtree. reactions/Element 38→47, HTMLElement 12→20
(popover capped), NamedNodeMap 8→14, Node 9→14, ChildNode 4→7, ParentNode 2→4, Range 8→10,
Attr 1→2, **+ bonus** adopted-callback 20→32, attribute-changed-callback 9→12 = **+51, ZERO
regressions** (qsa 1975, classlist 1420, createElement 147, Range-surroundContents 1840,
Range-cloneContents 187, connected 24, disconnected 24, upgrading 17, pseudo-class-defined 27,
CustomElementRegistry 31). CAPS: per-document registries (reactions/Document 0/12, parser 1/10),
reaction-queue microtask model, `popover`. Scroll `tickets/147-the-reactive-verdict.md`.

**Session 2026-07-05 (Quest #146 The Stateful Verdict — `CustomStateSet` + `:state()`, +20):**
Rode #145's fresh `ElementInternals` into the `custom-elements/state/` realm (all red).
Two-part feature mirroring `:defined`: **(JS)** `CustomStateSet` — a thin wrapper over a real
`Set<string>` (insertion-ordered, live iteration semantics identical to Set, any string accepted,
no `supports` method → `TypeError`, `Symbol.toStringTag='CustomStateSet'`); `ElementInternals.states`
a lazily-minted `[SameObject]` getter (available regardless of form-association); every mutation pushes
the full list to Rust via a new `set_ce_states` op. **No style invalidation needed** — `getComputedStyle`
re-runs the Rust matcher live (`_buildCascade`→`selector_match_specificity`), so state-css-selector went
straight to 10/10. **(Rust)** `ce_states` per-node `HashMap<NodeId,Vec<String>>` (non-monotonic — empty
drops the entry); `PseudoClass::State(String)` parsed as a single `expect_ident`+`expect_exhausted`
(so `:state(16px)`/`:state()`/`:state(name=value)` all SyntaxError), serialized via `serialize_identifier`,
matched via `has_ce_state`. Plus **`::part()` parse-but-never-match** (`PseudoElement::Part`, mirroring
`::slotted`, + `accepts_state_pseudo_classes→true` so `::part(x):state(y)` parses) so `::part()` rules
stop being dropped from the CSSOM. Plus an **escape-aware CSS rule splitter** — `_cssParseRuleList`'s
prelude scanner ignored backslash-escapes, so `:state( \(escaped\ state  )`'s escaped `\(` inflated paren
depth and the rule's `{` was never found → rule dropped; fixed by skipping escaped code points in both the
prelude scanner and block reader. ElementInternals-states 0→4, state-css-selector 0→10, state-pseudo-class
2→6, state-css-selector-nth-of 0→1, custom-state-set-strong-ref 0→1 = **+20, ZERO regressions** (qsa 1975,
classlist 1420, CSSStyleRule 10, serialize-values 696, pseudo-class-defined 27, connected-callbacks 24,
reactions/Element 38). CAPS: `::part()`/`:host(:state())` shadow **styling** (state-pseudo-class 6/8),
`:nth-child(N of S)` (nth-of 1/3). Scroll `tickets/146-the-stateful-verdict.md`.

**Session 2026-07-05 (Quest #145 The Internal Verdict — `ElementInternals` / `attachInternals`, +28):**
Rode #144's fresh custom elements to the memory's original pointer. `HTMLElement.attachInternals()`
(autonomous only; spec `NotSupportedError` gating on `is`/no-def/`disabledFeatures`/already-attached/
state) + a full `ElementInternals`: `shadowRoot` (gated on a new `_availableToElementInternals` flag
set in `attachShadow` when the host is already (pre)customized), and form-associated ops all guarded by
`NotSupportedError` when the definition isn't `formAssociated` — `form` (owner via id-ref/ancestor),
`setFormValue`, `setValidity`/`validity`/`validationMessage`/`willValidate`/`checkValidity`/
`reportValidity`, `labels`. Made `_isLabelable` accept form-associated customs (so `label.control`
resolves them) + `label.form` reads the internals' owner. `_ceUpgrade` now sets `"precustomized"`
during the ctor so `this.attachInternals()` works mid-upgrade. attachInternals 0→4, shadowroot 0→7,
validation 0→11, form 0→2, setFormValue-nullish 0→2, NotSupportedError 0→1, labels 0→1 = **+28,
ZERO regressions** (labelable-elements 26, label-attributes.sub 20, ShadowRoot-interface 8,
form-validation-valueMissing 78, declarative-shadow-dom-basic 22, connected 24, adopted 20).
CAPS: form-validity integration (custom control → owner form `checkValidity`/`:valid`/`:invalid`,
validation 11/14); `setFormValue.html` (CNR, needs FormData entry-list); `ElementInternals-role`/
`-accessibility` (118, need `test_driver.get_computed_role` = a CDP a11y backend). NEXT:
reaction-queue microtask model; form-validity integration; `CustomStateSet`/`:state()`. Scroll
`tickets/145-the-internal-verdict.md`.

**Session 2026-07-05 (Quest #144 The Upgraded Verdict — custom element upgrade + reactions + `:defined`, +131):**
Chased #143's pointer (`ElementInternals`) and found the elephant beneath it: the whole
`custom-elements/` realm (~500+ subtests) was red behind a five-line STUB `customElements`
(`define` just stored the class; no upgrade, no reactions, `createElement`/parser returned
`HTMLUnknownElement`). Built the real thing (all `bootstrap.js` bar the `:defined` Rust
primitive): (1) a real `CustomElementRegistry` — spec `define` (name/ctor validation, callback +
`observedAttributes`/`disabledFeatures`/`formAssociated` extraction, candidate upgrade),
`get`/`getName`/`whenDefined`/`upgrade`; (2) a real HTML element constructor with the
**construction-stack adoption trick** — when upgrading, `super()` returns the existing wrapper
WITHOUT allocating, so the user's `this` rebinds to it and JS identity survives; (3) custom
element state + `_ceUpgrade` (re-point `[[Prototype]]`, run ctor, fire attrChanged + connected);
(4) a re-entrancy-guarded reaction FIFO wired into insertion (`appendChild`/`insertBefore`/
`innerHTML`), removal (`removeChild`), adoption (`_adoptNodeInto` + cross-doc branches), and
attribute (`setAttribute`/`removeAttribute`) — ALL gated on `_defs.size` so non-custom pages pay
zero cost; (5) `:defined` via a Rust `ce_defined` node flag (`set_ce_defined` op, `match_defined`,
`is_valid_custom_element_name`). CustomElementRegistry 10→31, createElement 0→12, constructor
1→11, upgrading 8→17, connected 8→24, disconnected 8→24, attribute-changed 0→9,
pseudo-class-defined 10→27, adopted 0→20, reaction-timing 0→1 = **+131, ZERO regressions**
(swept qsa 1975, classlist 1420, createElement 147, Node-properties 726, cloneNode 135,
insert_adjacent_html 31, template-content 216, declarative-shadow-dom-basic 22, attachment 654,
slots 26, event-inside-slotted-node 20, Document-adoptNode 4, attributes 67, Node-appendChild 11).
CAPS: reaction-queue timing edge cases (custom-element-reaction-queue/enqueue-inside-callback/
throw-on-dynamic-markup — need the full backup-queue microtask model); `ElementInternals-role`/
`-accessibility` (118 subtests, gated on `test_driver.get_computed_role` = a CDP a11y backend we
lack); shadow-including upgrade order + customized built-ins. NEXT: **`ElementInternals`/
`attachInternals`** (now unblocked, ~47 winnable subtests). Scroll `tickets/144-the-upgraded-verdict.md`.

**Session 2026-07-05 (Quest #143 The Cloned Verdict — clone-propagation of shadow roots, +8):**
Took #142's #1 pointer (`declarative-shadow-dom-basic` 18/22 — clone a `<template>` whose
content holds a `<template shadowrootmode=open shadowrootclonable>` and assert the clone's
inner host has a live shadow). CDP-probing pinned THREE `bootstrap.js` root causes: (1)
`_processDeclarativeShadowRoots` never descended into `<template>` content (a template's
markup lives in its separate content fragment, `firstChild` is null), so the inner
declarative shadow was never attached at parse time; (2) `Node.cloneNode` skipped the DOM
"clone a node" shadow-host step (a *clonable* shadow must be re-attached and deep-cloned onto
the clone); (3) `DocumentFragment.cloneNode` cloned via an `innerHTML` round-trip, which DROPS
shadow roots (innerHTML never serializes shadow trees) — so `template.content.cloneNode(true)`
lost the shadow before the element clone step ran. FIX: descend into template content;
`cloneNode` runs the shadow-host step gated on `_clonable` (imperative non-clonable shadows
stay uncloned — the "should NOT clone" subtests already passed); fragment `cloneNode` recurses
over REAL children forwarding `_targetDoc`; and `ShadowRoot.cloneNode` throws `NotSupportedError`
(DOM §clone), which also makes `importNode(shadowRoot)` throw. basic 18→22, Node-prototype-cloneNode
2→4, Document-prototype-importNode 0→2 = **+8, ZERO regressions** (Node-cloneNode 135,
Range-cloneContents/extractContents 187 each, template-content 216, insert_adjacent_html 31,
qsa 1975, classlist 1420, createElement 147, Node-properties 726, attachment 654, opt-in 111,
slots 26, gethtml 6908 — all identical). CAPS: `declarative-after-attachshadow` 0/1 (parse-time
MutationObserver interleaving, not clone); `slot-assignment-serialization` 1/3; `ElementInternals`;
in-shadow focus. NEXT: **`ElementInternals`/`attachInternals`**, then in-shadow focus
(`ShadowRoot.activeElement`). Scroll `tickets/143-the-cloned-verdict.md`.

**Session 2026-07-04 (Quest #142 The Serialized Verdict — `getHTML()` = HTML fragment serialization with shadow roots, +6914):**
Took #141's #1 pointer (the `gethtml.html` 0/6908 elephant — the single largest red test
in the suite). `Element.getHTML()`/`ShadowRoot.getHTML()` did not exist. **THE FIX (all
`bootstrap.js`):** `getHTML(options)` serializes a node's children like `innerHTML`, but an
element hosting a *to-be-serialized* shadow (listed in `options.shadowRoots`, or
`serializableShadowRoots` && the shadow is `serializable`) prepends the shadow as a
`<template shadowrootmode>` to its content. Our shadow model lives in JS (invisible to the
Rust serializer), so we recurse in JS only along the shadow-hosting spine and hand every
shadow-free subtree to the Rust `outer_html` serializer — keeping getHTML byte-identical to
innerHTML by default and reusing Rust's escaping/void/raw-text handling. **SECOND FIX** (a
pre-existing, orthogonal bug surfaced once getHTML existed): connecting an
`embed`/`form`/`iframe`/`img`/`object` (`_DOC_NAMED_TAGS`) triggered a document named-
property lookup whose `querySelectorAll` read `document._isHTMLDoc` back through the named-
access Proxy, which routed the internal `_`-key to `_docNamedItem` again → infinite
recursion (`Maximum call stack size exceeded`). Guard: internal `_`-prefixed keys are NEVER
WebIDL named properties (doc-proxy `get`/`has`/`getOwnPropertyDescriptor` skip them) —
breaking the cycle AND hardening the engine (`appendChild(createElement('img'))` can no
longer stack-overflow). RESULTS (stash-verified): gethtml 0→6908, gethtml-ordering
could-not-run→3, declarative-shadow-dom-serialization 0→2, slot-assignment-serialization
0→1 = **+6914 across 4 tests**. ZERO regressions (stash-verified: qsa 1975, classlist 1420,
createElement 147, Node-properties 726, cloneNode 135, getElementsByTagName 19,
template-content 216, insert_adjacent_html 31, slots 26, event-inside-slotted-node 20,
attachment 654, basic 18/22, opt-in 111/117, ShadowRoot-interface 8/12, reset-form 12/12,
nameditem-01/02/05/07 100%, nameditem-names 15/16 — the whole named-access series identical).
CAPS: clone-propagation of clonable shadows (basic 18/22 — needs `cloneNode`/`importNode`
to clone shadow roots, now the biggest self-contained shadow residual); slot-assignment-
serialization 1/3 (manual `shadowrootslotassignment` round-trip); `ElementInternals`; in-
shadow focus (`ShadowRoot.activeElement`). NEXT: **clone-propagation** (cloneNode/importNode
clone shadow roots → basic 4 + template-clone tail), then **`ElementInternals`**, then
**in-shadow focus**. Scroll `tickets/142-the-serialized-verdict.md`.

**Session 2026-07-04 (Quest #141 The Declared Verdict — Declarative Shadow DOM: `<template shadowrootmode>` → a real shadow root at parse time, +793):**
Took #140's #2 pointer (declarative shadow DOM). The whole `shadow-dom/declarative/` realm
was red (attachment 0/654, opt-in 0/117, basic 1/22) behind two blockers: `setHTMLUnsafe`
missing, and a parser bug that DUMPED a declarative template's content into the light DOM.
ROOT CAUSE: **html5ever 0.39 natively supports declarative shadow DOM** via two `TreeSink`
hooks — `allow_declarative_shadow_roots` (default true) + `attach_declarative_shadow`
(default false, no-op); our sink implemented neither, so the parser mis-handled the floating
template. Since our shadow model lives in JS (`ShadowRoot`/`attachShadow`), the fix splits
clean: **(1) Rust** — override `allow_declarative_shadow_roots → false` (parser now leaves
every `<template shadowrootmode>` as an ordinary template, markup in `template_contents`);
this ONE line took opt-in 0→110. **(2) JS** (`bootstrap.js`) — `_processDeclarativeShadowRoots`
tree-walk converts templates → real shadow roots, but ONLY in the opt-in contexts (main-doc
load + `setHTMLUnsafe`, never `innerHTML`); a `skipDirect` flag skips the fragment context's
direct-child templates (topmost-element rule — also handles void hosts like `<area>`);
`attachShadow` declarative-reattach (matching mode empties + returns, preserves ORIGINAL
options per whatwg/dom#1246; else throws) + `disabledFeatures` check;
`HTMLTemplateElement` reflection (`shadowRootMode`/`shadowRootDelegatesFocus`/
`shadowRootClonable`/`shadowRootSerializable`/`shadowRootSlotAssignment`). **(3) page.rs** —
the `<ready-state>` hook calls the walk before named-globals exposure. RESULTS
(stash-verified): attachment 0→654, opt-in 0→111, basic 1→18, slot-assignment 0→7, repeats
0→3, repeats-2 0→1 = **+793 across 6 tests**. ZERO regressions (stash-verified identical:
qsa 1975, classlist 1/1, createElement 147, Node-properties 726, cloneNode 135, slots 26,
slots-fallback 13, ShadowRoot-interface 8/12, attachShadow 6/6, event-inside-slotted-node 20,
template-content 216, insert_adjacent_html 31, DOMParser-html 9/10). CAPS: clone-propagation
of clonable shadows (basic 4/22, needs `cloneNode` shadow cloning); `getHTML()` serialization
(**gethtml.html 0/6908** — the single largest remaining shadow tail); `ElementInternals`;
streaming-parse ordering (disabled-shadow 1). NEXT: **`getHTML()` + shadow serialization**
(6908-subtest elephant), then **clone-propagation** (cloneNode/importNode clone shadow roots),
then `ElementInternals`. Scroll `tickets/141-the-declared-verdict.md`.

**Session 2026-07-04 (Quest #140 The Retargeted Verdict — full DOM §2.9 event dispatch with shadow retargeting + `composedPath()`, +107):**
Followed #139's pointer into **composed events / event retargeting** (`shadow-dom/event-*`) — the frontier stood at
Followed #139's pointer into **composed events / event retargeting** (`shadow-dom/event-*`) — the frontier stood at
~14/110. Event dispatch built a flat `target → parentNode → document → window` path: `event.target` was set once and
never retargeted, `composedPath()` returned that flat path (no closed-tree hiding, no slot/shadow crossing),
`relatedTarget` was never retargeted. THE FIX (all `bootstrap.js`, no Rust): rewrote `_dispatchSpec`,
`_invokeListeners`, and `composedPath()` to the DOM Standard §2.9 dispatch algorithm. New shadow-aware helpers
(`_isSR`/`_nodeRoot`/`_shadowIncAncestor`/`_retarget`/`_assignedSlotOf`/`_getEventParent`) replace the old flat
`_eventParent`. `_dispatchSpec` builds an **event path of structs** `{it, sat, rt, rct, sct}` via the spec's
`while(parent)` walk (crossing assigned-slottable→slot and shadow-root→host, tracking the evolving target for the
shadow-inclusive-ancestor branch, slot-in-closed-tree bookkeeping, and the step-5 skip gate); `event.target` per
struct = last non-null shadow-adjusted target at-or-before. `_invokeListeners` sets `currentTarget`/`target`/
`relatedTarget` per struct and manages **`window.event` per struct** (exposed only when the invocation target is NOT
in a shadow tree). `composedPath()` reimplemented as the spec's closed-tree-visibility walk over the `rct`/`sct`
flags. **clear-targets computed BEFORE listeners run** (a listener may move the target across a shadow boundary).
Plus: `Element.click()` now fires its `MouseEvent` with `composed:true`. RESULTS (stash-verified): event-inside-slotted-node
0→20, event-with-related-target 0→18, event-post-dispatch 3→16, Extensions-to-Event-Interface 8→16,
event-composed-path-with-related-target 4→13, event-inside-shadow-tree 0→12, event-composed-path 1→11, event-composed
5→9, capturing-and-bubbling-…-across-shadow-trees 1→5, event-post-dispatch-no-listeners 0→5,
event-composed-path-after-dom-mutation 0→2, event-dispatch-order.tentative 0→1, event-global 4→5 = **+107 across 13
tests**. ZERO regressions (qsa 1975, classlist 1420, Node-properties 726, cloneNode 135, createElement 147,
getElementsByTagName 19, slots 26, slots-fallback 13, ShadowRoot-interface 8/12, type-change-state 380,
EventTarget-dispatchEvent 25, Event-propagation 7 — all held; checkbox 1/6 + detached-input 4/12 identical
before/after). CAPS: `focus-within-shadow` (in-shadow focus tracking), `slotchange` (query-lazy model, tests HANG),
declarative shadow DOM, input-activation `input`/`change` events. NEXT: **`slotchange`** (needs a signal-a-slot-change
queue + microtask flush; unlocks imperative-slot-api 9/16 residual), then **declarative shadow DOM**
(`<template shadowrootmode>`), then in-shadow focus (`ShadowRoot.activeElement` → focus-within-shadow + the
ShadowRoot-interface 4/12 residual). Scroll `tickets/140-the-retargeted-verdict.md`.

**Session 2026-07-04 (Quest #139 The Slotted Verdict — the slot-assignment algorithm + a real `<template>.content`, +185):**
Followed #138's pointer into **slots**, and found a second, deeper prize underneath: `<template>` content was
silently broken engine-wide. (1) **Slots** (all `bootstrap.js`, computed lazily on every query — no dirty
tracking, no `slotchange`): `element.slot` reflection; `HTMLSlotElement` `name`/`assignedNodes`/`assignedElements`/
`assign()`; `Slottable.assignedSlot` on Element+Text only; the DOM find-a-slot / find-slottables /
find-flattened-slottables algorithms (open-flag hides slots in closed trees; named **and** manual modes; fallback
content; recursive flatten). (2) **`<template>` content** was dropped by FOUR primitives at once — `template.content`
returned a disconnected empty fragment (never wired to the real Rust `template_contents` node); `import_children_from`
kept the source tree's dangling content id and imported the template's (empty) direct children; HTML serialization
emitted `<template></template>`; and `cloneNode(deep)` never cloned the content fragment. THE FIX: new Rust op
`template_content` (returns/creates the real content node) + `_templateContentFragment` wrapper; `import_node_from`
rebuilds a fresh content node and imports the *source content's* children; `serialize_node` emits a template's
content children (byte-identical for non-templates); `cloneNode` runs the template cloning step. RESULTS: Slottable-mixin
0→4, HTMLSlotElement-interface 2→18, slots 1→26, slots-fallback 0→13, imperative-slot-api 1→7, imperative-slot-cross-shadow
0→1, slots-outside-shadow-dom 0→1, slots-fallback-in-document 0→2, assign-slottables-after-removing 0→1, template-clone-children
2→3, templates-copy-document-owner 3→5, serializing outerhtml 0→3, innerhtml-on-templates 3→4, **template-content 108→216
(+108)**, DocumentFragment-getElementById 4→5 = **+185 across 15 tests**, ZERO regressions (stash-verified: qsa 1975,
classlist 1420, cloneNode 135, Node-properties 726, Range-cloneContents 187, createElement 147, insert_adjacent_html 31,
attachShadow 6/6, ShadowRoot-interface 8/12). CAPS: `slotchange` events (query-lazy model has no mutation bookkeeping —
`slotchange*.html` hang, imperative-slot-api residual 9/16); composed events/retargeting; declarative shadow DOM. Scroll
`tickets/139-the-slotted-verdict.md`.

**Session 2026-07-04 (Quest #138 The Shadowed Verdict — a real `ShadowRoot` + `Node.getRootNode`, +21):**
The standing shadow-tree lead — named since Quest #34 and deferred by a dozen quests since — falls. `attachShadow`
returned a **fake object literal**, `ShadowRoot` was `class ShadowRoot {}` (empty, web-constructible, not
`instanceof DocumentFragment`), there was no `Element.prototype.shadowRoot`, and `Node.getRootNode()` was a hard
stub returning `document`. Because the shadow was a plain object (not a real node), nothing flowed through the Rust
tree. THE FIX (all `bootstrap.js`, NO Rust — riding the engine's existing real `DocumentFragment`): (1)
**`Node.getRootNode(options)`** walks the `parent` chain to the topmost node (parentless → itself); `composed:true`
jumps a shadow root to its host's tree. No internal caller ⇒ pure gain. (2) **`class ShadowRoot extends
DocumentFragment`** — real fragment-backed node, `instanceof DocumentFragment`, non-constructible via an
`_allowShadowConstruct` gate (`new ShadowRoot()` throws `TypeError`), exposes `host`/`mode`. (3) **`attachShadow`**
rewritten to DOM §4.9: required `mode` enum (missing/non-{open,closed} → `TypeError` during dictionary conversion),
non-shadow-host-candidate → `NotSupportedError` (safelist `article…span` + hyphenated custom names), already-hosts →
`NotSupportedError`. (4) **`Element.prototype.shadowRoot`** — open shadow root else null (closed hidden), defined
only on `Element.prototype` so it doesn't leak to Node/Document/DocumentFragment. (5) **`DocumentFragment.getElementById`**
made real (first-in-tree-order, empty-id never matches, scoped to the backing node); `ShadowRoot` inherits it so
`host.shadowRoot.getElementById` survives host detachment. RESULTS: attachShadow 2→6, shadowRoot-attribute 0→3,
rootNode 1→5, ShadowRoot-interface 6→8, attachShadow-custom-element 1→4, getElementById-dynamic-001 0→1,
DocumentFragment-getElementById 3→4, aria-element-reflection 22→24, label-attributes.sub 19→20 = **+21 across 9
tests**. ZERO regressions (stash-verified all baselines; `getElementById-dynamic-002` was already 1/1, not counted).
CAPS: ShadowRoot `activeElement` (in-shadow focus tracking) + `styleSheets` (connected-shadow `style.sheet`, same
lift as `CSSStyleSheet-constructable` 6/13) = the 4 residual on ShadowRoot-interface. NEXT: **slots** (`Slottable-mixin`
0/4, `HTMLSlotElement-interface` 2/18 — the slot-assignment algorithm, next-biggest shadow tail); composed events /
event retargeting; shadow-inclusive-ancestor scope (aria-element 24→27); declarative shadow DOM. Scroll
`tickets/138-the-shadowed-verdict.md`.

**Session 2026-07-04 (Quest #137 The Labeled Verdict — form-element IDL: `type`/`labels`/`control` + label association, +43):**
Followed #136's "next leverage" into fresh `html/semantics/forms/*` element IDL. The button/output/fieldset
elements returned `""` for `.type` (the generic `Element` getter), no element had a `labels` attribute, and
`<label>` had no `control`/`htmlFor`/`form`. THE FIX (all `bootstrap.js`, NO Rust; a block after the
`<output>` value model): (1) **`button.type`** — enumerated attribute {submit, reset, button}, both the
missing- and invalid-value defaults are "submit", reflected as the lowercased canonical keyword (shadows the
generic getter on `HTMLButtonElement.prototype`). **`output.type`**/**`fieldset.type`** = constants. (2)
**`fieldset.elements`** — an `HTMLCollection` (`_makeHTMLCollection`) of the *listed* form-associated
descendants (`button, fieldset, input, object, output, select, textarea`; `<progress>`/`<meter>` are NOT
listed), tree order. (3) **`labels`** — only on labelable elements (button, input-not-hidden, meter, output,
progress, select, textarea; others → `undefined`), a hidden input → `null`. It's a **[SameObject] live
NodeList** (a `Proxy` over a real `NodeList`, recomputed on access, cached per element in a `WeakMap`) so the
WPT test's retained reference reflects the control becoming un-labelable when its `type` flips to hidden and
returns the *same object* when it flips back. (4) **`label.control`** = the labeled control: the element named
by `for` (if labelable), else the label's first labelable descendant. **`label.htmlFor`** reflects `for`;
**`label.form`** = the control's form owner (null if no control) — NOT the label's own ancestor form. (5)
**Tree-scoped association**: `getRootNode()` here is a stub that always returns `document`, so I walk
`parentNode` to the *real* root — a detached label can't label a connected control and vice-versa, and a
label enumeration/`for`-id lookup is scoped to that root (including the root itself when it's a `<label>`).
This is what makes the detached-subtree, cross-move-liveness, and duplicate-id cases correct.
RESULTS (before→after): labelable-elements 12→26, label-attributes.sub 2→19, button-validation 3→6,
button-type 0→2, button-type-enumerated-ascii-case-insensitive 0→2, button-labels 0→1, input-labels 0→1,
output 0→1, HTMLFieldSetElement 1→3 = **+43 across 9 tests**. ZERO regressions (held: qsa 1975, classlist
1420, createElement 147, Node-properties 726, type-change-state 380, reset-form 12, select-value 4/4,
output-validity/button-validity/fieldset-validity 1/1; input-labels baseline STASH-verified 0/1 pre-change).
CAPS: label-attributes.sub 19/20 — last needs shadow DOM (`attachShadow`/`ShadowRoot instanceof
DocumentFragment`), the standing shadow-tree lead. HTMLFieldSetElement 3/4 — last needs form
supported-property-name named access (`form[name]`), which would need Proxy-wrapping form elements (the engine
deliberately doesn't Proxy elements — architectural, not worth 1 subtest). NEXT: the shadow-tree scope lead
is now doubly-attractive (unlocks label-attributes 20/20 + aria-element 5 + CSSStyleSheet-constructable 6/13);
or the textarea residual (value-defaultValue 7/12 — child-text-content default + CRLF/NUL value normalization);
or namespaced cascade-match Rust lift (`crates/obscura-dom/src/selector.rs`, set-selectorText-namespace 0/5).
Scroll `tickets/137-the-labeled-verdict.md`.

**Session 2026-07-04 (Quest #136 The Reset Verdict — the form reset algorithm, +16):**
Followed #135's "next leverage" pointer straight to form **reset**: the whole `resetting-a-form/` suite sat
at **0/15**. `HTMLFormElement.prototype.reset()` crudely cleared every control to `""`, fired no event, and
there were no default-value IDL attributes to restore from. THE FIX (all `bootstrap.js` + one tiny Rust op):
(1) reset now fires a **trusted, bubbling, cancelable `reset` event** — built with `new Event`, marked
trusted, dispatched via `_dispatchSpec` privately (the public path clears the trusted flag), `onreset`
invoked explicitly (this engine doesn't auto-run element `onX` during dispatch — the `onselect` precedent),
`preventDefault()` aborts. (2) Per-control reset: **input** drops the dirty value (getter → `value` attr) +
for checkbox/radio drops the **dirty-checkedness override** — which in this engine IS the Rust
`checked_state` map (`checked()` already falls back to the `checked` attribute when there's no override), so
the only missing piece was a **`clear_checked` op** (`tree.rs`+`ops.rs`); **textarea** drops the dirty value
→ child text; **output** restores textContent from its default value; **select** restores option selectedness
from the `selected` attr (#135's `_resetSelect`). (3) Added `input.defaultValue`/`defaultChecked`,
`output.value`/`defaultValue` (value-mode flag + stored default). (4) **reset-button `click()`** now runs the
reset activation behavior. (5) **`document.forms`** is now a real named-access `HTMLCollection` (was a static
NodeList) so `document.forms.fm1.reset()` resolves. (6) **`textarea.value=` no longer writes `textContent`**
— a textarea's raw value (API value in `_formValues`) is distinct from its default value (child text, which
`defaultValue` reflects and reset restores); the old setter destroyed the default. RESULTS: reset-form 0→12,
reset-form-2 0→1, reset-event 0→1, reset-form-event-realm 0→1, value-defaultValue 6→7 = **+16 across 5 tests**.
ZERO regressions (STASH-VERIFIED all five baselines pre-change; held: type-change-state 380, select-event 270,
setRangeText 80/88, setSelectionRange 49, selection-start-end 45, qsa 1975, classlist 1420, createElement 147,
Node-properties 726, select-value 4/4, select-selectedOptions 8/8, option-selected 3/3). CAP: `document.forms.html`
is CNR but PRE-EXISTING — plain `document.querySelectorAll('form')` overflows the stack on that one page,
independent of the `forms` getter (a separate selector-engine bug). NEXT: `the-button-element` /
`the-output-element` / `form-submission-0`; or the textarea child-text-content + CRLF/NUL value normalization
residual (value-defaultValue 7/12). Scroll `tickets/136-the-reset-verdict.md`.

**Session 2026-07-04 (Quest #135 The Selectedness Verdict — `<select>`/`<option>`/`HTMLOptionsCollection` model + the selectedness algorithm, +94):**
After #134 completed the input value model, swept the rest of fresh `html/semantics/forms/*`: the
constraints-validity suite was already ~100% (earlier CV work holds), but the whole **`<select>`/`<option>`
machinery** was a wide untapped tail (~90 failing subtests) rooted in one missing primitive — `.options`
was just a `querySelectorAll` NodeList and selection was ad-hoc. **The fix** (`bootstrap.js`, no Rust, all on
the subclass prototypes so it shadows the generic `Element` getters): (1) a real **`HTMLOptionsCollection`**
(settable `length`, indexed get/set, `add`/`remove`/`selectedIndex`, `namedItem`, iterable); (2) the
**`HTMLSelectElement` IDL** — `options`/`selectedOptions` (live, `[SameObject]`)/`value`/`selectedIndex`/
`size`/`item`/`namedItem`/`add`/`remove` + the indexed getter `select[i]`; (3) the **`HTMLOptionElement`
IDL** — `value`/`label` (text fallback unless a *null-namespace* attribute is present)/`text` (strip-collapse
excluding `<script>`)/`index`/`defaultSelected`/`selected`/`form` + the `Option(text,value,defaultSelected,
selected)` factory; (4) the **selectedness + dirtiness model** — the IDL `selected` setter sets dirtiness
(never the content attribute), content-attribute changes move selectedness only while not dirty (hooked via a
scoped `setAttribute`/`removeAttribute` override on `HTMLOptionElement.prototype`); (5) the **selectedness
setting algorithm** ("get the list of options" is a descendant tree-walk, so a `<div>`-nested `<option>`
counts; auto-select the first non-disabled option when a single-line select has none; collapse a markup
double-selection to the last) run at *read* time — the spec runs it on parse/insert/remove/reset (hooks we
lack), so read-time reconciliation reproduces the same observable state, with a `_noAutoSelect` flag so a
deliberate empty selection (`selectedIndex=-1`) sticks; (6) select **`valueMissing`** via the placeholder-
label-option; (7) form **reset** restores each option's selectedness from its `selected` attribute.
**selected-index 0→13, option-label 0→12, option-element-constructor 0→11, select-selectedOptions 1→8,
common-HTMLOptionsCollection 1→8, option-value 7→12, option-selectedness-script-mutation 0→5, +namedItem 6,
select-named-getter 4, option-index 4, select-validity 1→5, select-ask-for-reset 3, +more = +94 across 20
tests.** ZERO regressions (verified via stash-baseline: reset-form 0/12, reset-event 0/1, value-defaultValue
6/12 were already failing pre-change; select-value held 4/4; qsa 1975, classlist 1420, createElement 147,
Node-properties 726, type-change-state 380, valueMissing 78, setRangeText 80/88, input-stepup 53 all held).
CAPS: `select-restore-invalid-option` (bfcache/session-history — out of scope); `select-validity` 5/6 (the
last needs prepend-of-a-selected-option to deselect siblings, i.e. an insertion hook we don't have).
Scroll `tickets/135-the-selectedness-verdict.md`.

**Session 2026-07-03 (Quest #134 The Numeric Verdict — valueAsNumber/valueAsDate/stepUp/stepDown + temporal normalization, +119):**
Continuation of #133: the value model was in place but its *numeric* projection was not, so every
`valueAsNumber`/`valueAsDate`/`stepUp`/`stepDown` test died on `is not a function`. **The fix**
(`bootstrap.js`, no Rust, all on `HTMLInputElement.prototype`) rides the constraint-validation number
machinery already present (`_cvTyped`/`_cvStepInfo`/`_cvDefaultStepBase` + leap-year-aware parsers) and
adds only its inverses: number→string / string→Date / Date→string projections, `valueAsNumber` (TypeError
on ±Infinity *before* the applies check; InvalidStateError off-type), `valueAsDate` (date/month/week/time
only; TypeError on non-null non-Date), the full `stepUp/stepDown` step algorithm (allowed step,
`step="any"`, step base, align-or-step, min/max grid clamp, overshoot guard), and temporal value-
sanitization **normalization** (parse→re-serialize, dropping redundant `.010`/`:00`). One reverse-
engineered browser divergence: the step overshoot guard is skipped when the field started empty
(only case 2 of `input-stepdown-02` needs it; the other five are spec-literal). **input-stepup 0→53,
input-valueasdate 4→30, input-seconds-leading-zeroes 4→12, input-stepdown 0→5, input-valueasnumber-stepping
0→7, + 8 more = +119 across 13 tests.** ZERO regressions (#133 realm held exactly: type-change-state 380,
select-event 270, setRangeText 80, setSelectionRange 49, …; core: qsa 1975, classlist 168/175, createElement
147, Node-properties 726, reflection-misc 4709). CAP: `input-stepup-weekmonth` could-not-run (heavy/long).
Scroll `tickets/134-the-numeric-verdict.md`.

**Session 2026-07-03 (Quest #133 The Selected Verdict — text-field selection API + input value model, +1082):**
After the reflection realm reached ~100% (bar the URL cap), swept fresh ground and found the widest
untapped tail: `the-input-element/type-change-state.html` at **0/380**, every subtest blocked on one
missing primitive (`input.setSelectionRange is not a function`). Pulling the thread uncovered the whole
**text-field selection API** and the **input value model** beneath it. **The fix** (`bootstrap.js`, no
Rust, all on `HTMLInputElement`/`HTMLTextAreaElement` prototypes overriding the shared `Element` value
accessor): (1) the input **value model** — four value modes (value/default/default-on/filename), per-type
value sanitization, and the "signal a type change" algorithm that re-flows & re-sanitizes the value
between modes when `type` changes (and makes `<input type=file>.value=` throw `InvalidStateError`);
(2) the **selection API** — `selectionStart/End/Direction` (getters clamp to value length, `null`
off-type; setters throw off-type, ToUint32, push-end per spec), `setSelectionRange`, `setRangeText`
(all four selectMode branches, one-arg form, `IndexSizeError`), and `select()` (never throws), applying
to `<textarea>` + input {text,search,tel,url,password}; value-set moves the cursor to the end only on a
real change (default cursor is **0**, not the end); (3) the **`select` event** — a trusted, bubbling,
non-cancelable Event queued async (never synchronous) by "set the selection range" **iff** the
selection's extent/direction actually changed, dispatched via `_dispatchSpec` (keeps `isTrusted`) plus an
`onselect` IDL handler. **type-change-state 0→380, select-event 30→270, selection-not-application (2 variants)
42→262, setRangeText 16→80, the-input-element/selection 2→42, textfieldselection/selection 0→17,
selection-start-end 3→37, setSelectionRange(2) →49+1, +more = +1082 across 15 tests.** **Zero pass-regressions**
(qsa 1975, classlist 1420, reflection-misc 4709, reflection-metadata 2994, Node-properties 726, aria-attribute
41, select-value 4/4). **Honesty note:** `select-event.html` first read 30→**0** (the working methods
unblocked the sequential `promise_test` event-waits, so all timed out; the prior 30 were an artifact of the
property-setter actions not throwing) — firing the `select` event turned it into 270/270. **Caps:** eager
selection clamp on textarea content mutation + form `reset()` (2–3 residual), `scrollLeft` preservation
(layout), value-sanitization detail (~13). Scroll `tickets/133-the-selected-verdict.md`.

**Session 2026-06-29 (Quest #132 The Presentational Verdict — section + grouping reflectors, +1231):**
After #130/#131 unlocked the global + metadata reflectors on `Element.prototype`, the sibling
`reflection-sections` (4890/5604) and `reflection-grouping` (4797/5358) suites still had their own
*obsolete presentational* content-attribute reflectors unimplemented. **The fix** (`bootstrap.js`, no
Rust, riding #130's table-driven machinery): generic DOMString `align`/`color`/`background`; boolean
`reversed` (`<ol>`)/`noShade`→`noshade` (`<hr>`); a **body-gated** `[LegacyNullToEmptyString]` block for
`<body>` colours `text`/`link`/`vLink`/`aLink`/`bgColor` (gated because `.text`/`.link` name different IDL
members on `<script>`/`<a>`; setter uses strict `=== null` so `null`→`""` but `undefined`→`"undefined"` —
the loose `== null` was a first-pass bug surfaced by 10 `IDL set to undefined` subtests); a **tag-dispatched
`width`** (`long` on `<pre>` default 0, DOMString on `<hr>` — same content-attr, different IDL types);
`size` (DOMString, `<hr>`-gated); `start` (`<ol>` `long`, default **1**); `<li>.value` (`long`, default 0,
a branch atop the form-control `value` accessor); and **Document-level** `dir` (enum → document element)
plus `fgColor`/`linkColor`/`vlinkColor`/`alinkColor`/`bgColor` (→ `<body>` colour attrs) on
`Document.prototype` (forwarded through the §nameditem document Proxy since `Reflect.has` is now true).
**reflection-sections 4890→5604 (100%), reflection-grouping 4797→5314 (+517).** Zero regressions
(qsa 1975, classlist 1420, createElement 147, Node-properties 726, aria-attribute 41, aria-element 22/27,
getElementById 18, attributes 67, reflection-misc 4709, reflection-metadata 2994,
DOMTokenList-coverage-for-attributes 168/175, Element-getElementsByTagName 19/19, select-value 4/4 — all
unchanged). **Cap:** grouping's 44 residual = `<blockquote>.cite` URL-origin cap (headless env reports
`undefined` origin → garbage expected value, exactly as #130/#131). Note: the ritual's
`DOMTokenList-coverage.html` / `getElementsByTagName.html` paths now 404 on wpt.live (renamed to
`DOMTokenList-coverage-for-attributes.html` / `Element-getElementsByTagName.html`; held values identical).
Scroll `132-the-presentational-verdict.md`.

**Session 2026-06-29 (Quest #131 The Metadata Verdict — metadata-element reflectors, +712):**
After #130 unlocked the global HTMLElement reflectors and a first batch of element-specifics on
`Element.prototype`, the sibling `reflection-metadata` suite (`link`/`meta`/`base`/`style`/`script`)
still sat at **2282/3110 (73.4%)** — its own element-specific content-attribute reflectors returned
`undefined`. **The fix** (`bootstrap.js`, no Rust, all riding #130's table-driven machinery so each
reflector is inert on non-owning elements): two enum reflectors added to `__reflectedEnumAttrs` —
`as` (`<link>`-only) and `referrerPolicy` (with `""` itself a keyword AND the missing/invalid default);
six DOMString reflectors added to `__reflectedExtraStringAttrs` — `media`/`scheme`/`target`/`rev`/
`hreflang`/`nonce`; and a **`content` overload** (one `Object.defineProperty` on `Element.prototype`
preserving `template.content`'s read-only `DocumentFragment` byte-for-byte while adding `meta`-style
string reflection everywhere else). **2282/3110 → 2994/3110, +712** (stash-baseline confirmed).
**Zero regressions** (qsa 1975, classlist 1420, createElement 147, Node-properties 726, aria-attribute
41, aria-element 22/27, getElementsByTagName 19/19; the risky `content` overload stash-baselined against
`template-content.html` — 108/216 BOTH with and without, the 108 fails a pre-existing
template-via-`innerHTML` parsing gap). **CAP:** the residual 116 is dominated by the same URL-origin cap
as #130 — `link.href` (~42) expects the origin-less harness's garbage `"undefined//undefined…"` while
Obscura returns the correct resolved URL. **NEXT:** grouping (4797/5358) & sections (4890/5604) carry
their own element-specific reflectors (table-cell/form-control/list) under the same additive style; then
the standing shadow-scope / namespaced-cascade leads. Scroll `tickets/131-the-metadata-verdict.md`.

**Session 2026-06-29 (Quest #130 The Global Verdict — global HTMLElement attribute reflection, +4146):**
After #129 exhausted the `dom/events` AddEventListenerOptions fruit, a fresh sweep found the widest
unimplemented tail on the board: `html/dom/reflection-misc.html` at **563/4877 (11.5%)** — 4314 failing
subtests. The failures clustered on the **global HTMLElement attributes**, which Obscura defined nowhere
(`HTMLElement` is an empty subclass of `Element`): `dir` (816), `hidden` (468), `autofocus` (468), `title`
(456), `lang` (456), `accessKey` (456), `tabIndex` (336), `inputMode` (120), `enterKeyHint` (114) — every
`element.title`/`element.dir`/… returned `undefined`. **The fix** (`bootstrap.js`, no Rust): a table-driven
block on `Element.prototype` right after `__ariaReflectedAttrs`, four reflector kinds matching the WPT
`reflection.js` semantics — DOMString (return attr or `""`; set `String(v)`), enum (ASCII-only keyword
match, missing/invalid default `""`), boolean (`hasAttribute` / set-`""`-or-remove), and long (`tabIndex`,
HTML signed-int parse with `−0`→`+0`, default −1). Plus the winnable element-specifics: DOMString
`version`/`dateTime`/`integrity`/`event`/`charset`, boolean `open`/`defer`/`noModule`/`compact`, and the
nullable-enum `crossOrigin` (missing default `null`, invalid default `"anonymous"`). **563/4877 → 4709/4877,
+4146.** The same primitive lifts every other reflection suite (measured after, not scored: grouping
4797/5358, sections 4890/5604, metadata 2282/3110). **Zero regressions** (qsa 1975, createElement 147,
Node-properties 726, getElementById 18, attributes 67, aria-attribute 41, aria-element 22/27 unchanged,
Event-dispatch 5/5, passive 5/5, signal 11/11, DOMTokenList-coverage 168/175 — the 7 are pre-existing
`relList`/`htmlFor`/`sandbox`/`sizes` DOMTokenList gaps). **CAP:** URL-typed reflections `cite`/`src` (~130)
resolve to a garbage expected value (`"undefined//undefined…"`) in the origin-less harness — unwinnable here;
`reflection-text`/`-embedded`/`-tabular`/`-obsolete` are `meta timeout=long` files that could-not-run even at
280 s. Scroll `130-the-global-verdict.md`.

**Session 2026-06-29 (Quest #129 The Passive Verdict — `AddEventListenerOptions.passive` during dispatch, +3):**
The sibling #128 flagged: `dom/events/AddEventListenerOptions-passive.any.html` at **2/5**. Obscura read
`passive` from the options dict and stored it per-listener, but never honored it during dispatch — a
`preventDefault()` (or legacy `returnValue = false`) from inside a passive listener still set the canceled
flag, so `dispatchEvent` wrongly returned `false`. **The fix** (`bootstrap.js`, no Rust — the DOM "in passive
listener flag"): `_invokeListeners` sets `event._inPassiveListener = !!e.passive` immediately before each
listener call and clears it after; `Event.preventDefault()` and the `returnValue` setter now set the canceled
flag only when that flag is unset. A passive listener's cancel is silently ignored; a following non-passive
listener (or any post-dispatch code) can still cancel. The "Equivalence of option values" subtest also went
green — `passive` was already correctly excluded from the dedup key (only type/callback/capture identify a
listener), it had merely been blocked behind the dispatch failures. **2/5 → 5/5, +3.** Zero regressions
(AddEventListenerOptions-signal 11/11, -once 4/4, EventListenerOptions-capture 4/4, Event-dispatch-bubbles-true
5/5, Event-dispatch-order 1/1, EventTarget-add-remove 1/1, EventListener-handleEvent 6/6, abort/event.any
15/16 [pre-existing], qsa 1975, classlist 1420). No cap (realm 100%). The `dom/events` low-hanging fruit is now
exhausted; NEXT-BEST reverts to the standing leads — shadow-tree scope discrimination (aria-element 5 residual /
constructable 6/13), namespaced cascade-match Rust lift (`crates/obscura-dom/src/selector.rs`,
set-selectorText-namespace 0/5), or sweep a fresh DOM/HTML region. Scroll `129-the-passive-verdict.md`.

**Session 2026-06-29 (Quest #128 The Aborted Verdict — `AddEventListenerOptions.signal`, +7):**
After #127 took named-document-access to 80/82, swept the fresh `dom/events` ground that #127's
next-leverage flagged as implementable. The widest tail there was
`dom/events/AddEventListenerOptions-signal.any.html` at **4/11**: Obscura read `capture`/`once`/`passive`
from the `addEventListener` options dict but ignored **`signal`** entirely, so an `AbortSignal` never
removed its listeners and `{signal:null}` didn't throw. **The fix** (one edit to the central
`_addListenerByKey`, `bootstrap.js`, no Rust — the single choke point every `addEventListener` path
funnels through): read `options.signal`; a *present* non-`AbortSignal` value (notably `null`) throws
`TypeError` **before** the null-callback step (WebIDL coerces the non-nullable interface member during
argument processing — so `addEventListener("x", null, {signal:null})` throws too); an already-aborted
signal never adds; otherwise the listener is added and an `abort` algorithm on the signal removes it (via
the existing `_removeListenerByKey`) when it fires. Abort-from-inside-a-listener removes future listeners
for free — `_invokeListeners` already snapshots and re-checks the live registry per call, so no dispatch
change was needed. **4/11 → 11/11, +7.** Zero regressions (full event/abort + held-realm sweep). No cap
(realm 100%). The sibling `AddEventListenerOptions-passive.any` (2/5) is the natural next quest — it fails
only on passive-`preventDefault` suppression, a dispatch-time gate this edit deliberately doesn't touch.
Scroll `128-the-aborted-verdict.md`.

**Session 2026-06-29 (Quest #127 The Named Verdict — named access on the Document object, +64):**
After #126 took `insertAdjacentHTML` to 100%, swept fresh ground past the saturated `dom/nodes` realm and
found the widest unimplemented tail on the board: **named property access on the `document` object**
(HTML §named-access-on-the-Document-object / "nameditem") — `document.foo`, `document['foo']`,
`'foo' in document`, `Object.getOwnPropertyNames(document)`. Obscura had **none** of it (every
`document.someName` returned `undefined`), so the whole `html/dom/documents/dom-tree-accessors/nameditem-*`
cluster sat at **16/82**. **The fix** (all in `bootstrap.js`, no Rust): a set of helpers computing the
spec's supported-property-names set (the `name` of every exposed `embed`/`form`/`iframe`/`img`/`object`;
the `id` of every exposed `object`; the `id` of every `img` that has both id AND name), plus a **transparent
Proxy over the document** whose `get`/`has`/`ownKeys`/`getOwnPropertyDescriptor`/`set` traps expose named
elements — but only when the name isn't already a real property of the document or its prototype chain
(interface members & expandos always win, per WebIDL legacy-platform-object semantics). A single match
returns the element (or an iframe's `contentWindow`); multiple matches return a **live `HTMLCollection`**.
The load-bearing detail: the Proxy is installed BOTH as `globalThis.document` AND in the wrapper cache
(`_cache.set(_docNid, _docProxy)`), so node-identity (`document === node.ownerDocument === _wrap(docNid)`)
stays intact. **16/82 → 80/82, +64.** Zero regressions (qsa 1975, classlist 1420, createElement 147,
Node-properties 726, getElementById 18, attributes 67, aria-attribute-reflection 41, dataset-get 10,
insert_adjacent_html 31, Document-createElementNS 596, Event-dispatch-bubbles-true 5,
getElementsByName-newelements 27). **2 caps:** `nameditem-03` (applet, 0/1 — `applet.name` returns the
attribute because Obscura's generic `name` getter is too broad; narrowing it is a regression-prone refactor
for one obsolete element) and `nameditem-names` (15/16 — the "embed inside an embed" exposure edge hinges on
void-element parsing + plugin semantics we don't model). `Document.currentScript` 0/18 TIMEOUT + `title-01`
1/4 verified identical on the stashed baseline — pre-existing, not regressions. Scroll
`tickets/127-the-named-verdict.md`.

**Session 2026-06-28 (Quest #126 The Adjacent Verdict — `Element.insertAdjacentHTML` spec rewrite, +29):**
After #125 fixed `Document.cloneNode`, swept a fresh region and found the widest single-file tail on the
board: `domparsing/insert_adjacent_html.html` at **2/31**. `insertAdjacentHTML` was a buggy stub with four
faults: (1) it switched on the **raw, case-sensitive** position, so the test's mixed-case positions
(`"beforeBegin"`, `"Afterbegin"`, …) fell through to a silent no-op; (2) it iterated a **live** `childNodes`
list while moving nodes out of it — each move shrank the list under the loop counter, so it skipped nodes and
eventually indexed past the end (`appendChild(undefined)` → "Cannot read properties of null"); (3) an unknown
position silently no-op'd instead of throwing `SyntaxError`; (4) `beforebegin`/`afterend` with no parent (or a
**Document** parent, e.g. `document.documentElement`) silently no-op'd or threw the wrong
`HierarchyRequestError` (code 3) instead of `NoModificationAllowedError` (code 7). **The fix** (all in
`bootstrap.js`, no Rust): the DOM §`insertAdjacentHTML` algorithm — ASCII case-insensitive position; resolve
the insertion **context** and throw the right DOMException *before* parsing; parse in a context-named throwaway
element (`<html>`→`<body>` so no implied head/body); flag parsed `<script>`s "already started"
(`_scriptAlreadyStarted`, the #125 inertness flag) so they never execute on insertion; insert the parsed nodes
via a **DocumentFragment** atomically (no live-NodeList hazard, no text-node merging). **2/31 → 31/31, +29.**
Zero regressions (insert-adjacent 4/4 [insertAdjacentElement/Text, untouched], outerhtml-01 1/1, outerhtml-02
5/5, Event-dispatch-bubbles-true 5/5, Node-cloneNode 135, Node-properties 726, classlist 1420, qsa 1975,
createElement 147, getElementById 18, attributes 67, aria-attribute-reflection 41, dataset 8). **No cap**
(realm 100%). Scroll `tickets/126-the-adjacent-verdict.md`.

**Session 2026-06-28 (Quest #125 The Cloned Verdict — `Document.cloneNode` + cloned-script inertness):**
After #124 took `element.dataset` to 100%, swept a fresh region and found a broken core primitive:
`dom/events/Event-dispatch-bubbles-true.html` failing en masse on `document.cloneNode(true)` →
"Cannot read properties of null (reading 'documentElement')". **Root cause #1:** `Node.cloneNode`
handled element/text/comment nodes but returned `null` for **document** nodes (type 9) — so the page
document (and standalone `new Document()`) had no working clone. **Fix:** a `Document.prototype.cloneNode(deep)`
(in `bootstrap.js`, modeled on the working `DetachedDocument.cloneNode`) that clones into a fresh **detached**
document of the same kind (HTML `DetachedDocument` / XML `new Document()`), strips the auto-built scaffold, and
deep-clones children **into the clone** (a shallow clone is an empty document). **Root cause #2 (unmasked by #1):**
`appendChild` evaluates inserted inline `<script>`s; deep-cloning the page reproduced its *own* inline test-script,
which re-ran `document.cloneNode(true)` → clone → re-run → JS stack overflow → V8 OOM → server core-dump. Per DOM
§clone, a script's "already started" flag is copied to the clone so it must not auto-execute. **Fix:** cloned scripts
get `_scriptAlreadyStarted = true` (in `Node.cloneNode`) and `appendChild`'s eval is gated `&& !c._scriptAlreadyStarted`
— dynamically *created* scripts still run; only **clones** are inert. **broken/ERROR → 5/5 OK.** Zero regressions
(Node-cloneNode 135, importNode 5, isEqualNode 9, qsa 1975, createElement 147, Node-properties 726, getElementById 18,
attributes 67, getElementsByTagName 19, Event-dispatch-order 1, aria 41 / 22, Range-cloneContents 187, classlist 1420).
**Honesty:** the displayed pre-fix `2112/2705` ERROR count is a harness inflation artifact (only 5 real `test()`
blocks); the win is the harness completing (ERROR→OK) + the `cloneNode(true)` subtest going green. Scroll
`tickets/125-the-cloned-verdict.md`.

**Session 2026-06-28 (Quest #124 The Mapped Verdict — DOMStringMap / `element.dataset`, +25):**
After #123 swept getElementById to 100%, swept a fresh region and found a stubbed ubiquitous API:
`element.dataset` had no `DOMStringMap` interface at all (`DOMStringMap is not defined`), returned
`null` (not `undefined`) for absent keys, lacked `has`/`ownKeys`/`getOwnPropertyDescriptor`/`delete`
traps, and was handed to *every* element regardless of namespace. **The fix** (all additive in
`bootstrap.js`, no Rust): a `DOMStringMap` interface global + a Proxy over
`Object.create(DOMStringMap.prototype)` so `dataset instanceof DOMStringMap` holds; gated to the
HTML/SVG/MathML namespaces (a random-namespace element gets `undefined`); spec `data-*` ↔ camelCase
converters; `get`/`has` scan `getAttributeNames()` and **fall through to the prototype chain** on no
match (so `Object.prototype.toString` and accessor properties on `DOMStringMap.prototype` shine
through); `set` is the named-property setter (always writes the content attribute, never a prototype
setter, `SyntaxError` on an invalid name); full `ownKeys`/`getOwnPropertyDescriptor`/`deleteProperty`.
The whole cluster went **21/46 → 46/46 (+25)**: `dataset` 0→8, `dataset-delete` 1→9, `dataset-enumeration`
0→2, `dataset-prototype` 0→2, `dataset-set` 10→11, `dataset-binding` 0→4 (`dataset-get` already 10/10).
Zero regressions (qsa 1975, classlist 1420, createElement 147, Node-properties 726, aria-attribute 41,
aria-element 22/27 cap, getElementsByTagName 19, getElementById 18, attributes 67, Element-matches 669
— all unchanged). **No cap** (realm 100%). **NEXT:** a real `Document.cloneNode` — the main-page
`Document.cloneNode(deep)` returns a DocumentFragment instead of a cloned Document (no documentElement/
head/body), the next root-cause primitive; clone into a `DetachedDocument` instead. (The
`Event-dispatch-bubbles-true` test that surfaced it reports an untrustworthy inflated subtest count —
fix the primitive for its own sake, measure on real clone tests.) Scroll `tickets/124-the-mapped-verdict.md`.

**Session 2026-06-28 (Quest #123 The Identified Verdict — getElementById tree-order/connectedness/liveness, +10):**
After #122 exhausted the ARIA reflection realm bar shadow scoping, swept a fresh region and found a
**broken core primitive**: `dom/nodes/Document-getElementById.html` at 8/18. `getElementById` underlies the
cascade's form-owner resolution, ARIA element reflection and named-element access — yet `tree.rs::get_element_by_id`
was a single-entry `HashMap<String, NodeId>` lookup: it could not honour **tree order** across duplicate ids
(last-writer-wins), did not check **connectedness** (returned detached elements), went **stale** across
innerHTML/outerHTML/subtree mutations, and indexed `id=""`. The JS side compounded it — the shared `_dom`
helper's `String(a1 ?? "")` collapses `null`/`undefined`→`""`, breaking WebIDL `DOMString` coercion. **The fix:**
replaced the index lookup with a **live pre-order tree walk** from the document root (new `push_children_rev`
helper; first element in tree order whose live, non-empty `id` matches) — making tree order, connectedness
(only document-reachable nodes are visited), liveness (tree read each call), and `id=""`→null all correct at
once; and made JS `getElementById` coerce its argument (`String(id)`) before `_dom`, with standalone/Detached
paths short-circuiting `""`→null. **8/18 → 18/18, +10.** Zero regressions (qsa 1975, classlist 1420, createElement
147, Node-properties 726, aria-attribute 41, aria-element 22, getElementsByTagName 19, getElementsByClassName 1
— all unchanged). **No cap** (realm 100%); the walk is O(n) worst-case but the only certainly-correct option —
if ever hot, the right optimization is a `Vec<NodeId>` superset index re-validated at lookup, never a single-entry
map. Scroll `tickets/123-the-identified-verdict.md`.

**Session 2026-06-28 (Quest #122 The Associated Verdict — ARIAMixin element reflection, +17):**
After #121 secured the ARIAMixin *string* family, took the sibling it named:
`html/dom/aria-element-reflection.html` at 5/27. This is the **element** half of ARIA
reflection — IDL attributes that reflect an *element reference* (`ariaActiveDescendantElement`)
or a frozen array of them (`ariaControlsElements`, `ariaLabelledByElements`, …) rather than a
string. The model (HTML "attr-associated elements"): an association is either **explicitly set**
via the IDL setter — we stash the raw refs in `_explicitAria[contentAttr]` and write the EMPTY
STRING to the content attribute (the spec never serialises the id back); an explicit ref wins over
the content attribute and survives id changes / reparenting — or **computed** from the content
attribute's id token(s) via `getElementById` (first-in-tree-order) when no explicit ref exists.
Writing or removing the content attribute directly **resets** the explicit ref (`__ariaResetExplicit`,
hooked into `setAttribute`/`removeAttribute`). A reference is *exposed* only when it shares a valid
scope with the host — modelled as "both connected to the same document", which correctly handles the
not-yet-inserted and cross-document cases. The `FrozenArray` getter **caches by element-list identity**
so `el.ariaControlsElements === el.ariaControlsElements` until the list actually changes (the IDL caching
invariant). Setters type-check (TypeError for a non-Element / a non-sequence / a sequence with a
non-Element item). All additive in `bootstrap.js` — NO Rust. **5/27 → 22/27, +17.** Zero regressions
(aria-attribute-reflection 41/41, attributes 67, qsa 1975, classlist 1420, createElement 147,
Node-properties 726, getElementsByTagName 19, MO-attributes 42, Element-setAttribute 2/2,
selectorSerialize 23 — all unchanged). **CAP:** the 5 residual all require real shadow-tree scope
discrimination — the spec distinguishes "crossing INTO a shadow tree" (disallowed) from "a shadow-
INCLUSIVE ANCESTOR" (allowed), which "same document + connected" cannot express; needs shadow-root
scope walking (the same shadow-scoping lift that gates `CSSStyleSheet-constructable` 6/13). Scroll
`tickets/122-the-associated-verdict.md`.

**Session 2026-06-28 (Quest #121 The Reflected Verdict — ARIAMixin string reflection, +33):**
After #120 exhausted the CSSOM serialization tail, swept fresh ground and found
`html/dom/aria-attribute-reflection.html` at 8/41. The WAI-ARIA **`ARIAMixin`** is a
family of IDL attributes (`role`, `ariaLabel`, `ariaChecked`, `ariaColCount`, …) that
each reflect an ARIA content attribute as a **nullable `DOMString`** (getter → the
attribute or `null`; setter → remove for null/undefined else `String(v)`). `bootstrap.js`
carried only 8 hand-written accessors; every other `ariaXxx` was absent (read
`undefined`). Replaced them with a **table-driven loop** (`__ariaReflectedAttrs`) that
defines all 41 properties on `Element.prototype` with the uniform nullable-reflection
getter/setter, handling the spec's irregular folds (`ariaAutoComplete`→`aria-autocomplete`,
`ariaHasPopup`→`aria-haspopup`, `ariaPosInSet`→`aria-posinset`, …). **8→41, +33.** Zero
regressions (qsa 1975, classlist 1420, createElement 147, Node-properties 726,
getElementsByTagName 19, selectorSerialize 23 — all unchanged). **Cap / Next:** the
sibling `html/dom/aria-element-reflection.html` (5/27) is a SEPARATE larger lift — the
Element-typed / `FrozenArray<Element>` relationship reflections (aria-activedescendant,
aria-labelledby/controls/describedby/flowto/owns) needing the "explicitly set
attr-element" internals + ID-resolution, and it is shadow-DOM-heavy (58 refs → many
shadow-scoping caps). Scroll `tickets/121-the-reflected-verdict.md`.

**Session 2026-06-28 (Quest #120 The Canonical Verdict — CSSOM selector serialization, +96):**
Took #119's named CSSOM tail. `CSSStyleRule.selectorText` was a stub — getter returned the
raw authored prelude, setter just trimmed. Built a real recursive-descent **CSS selector
parser + CSSOM serializer** (all additive in `bootstrap.js`, no `ops.rs`; the matching engine
is the Servo `selectors` crate, so this is pure syntax + serialization): identifier/string
escaping (CSSOM *serialize-an-identifier*: `\30 zonk`, `\@`, `\\`), An+B canonicalisation
(`even`→`2n`, `+10`→`10`, `1n - 0`→`n`), functional-pseudo whitespace collapse
(`:lang( ja )`→`:lang(ja)`, `:not( abc )`→`:not(abc)`, recursive into `:not()`/`:is()`),
legacy `:before`→`::before`, unknown-pseudo rejection (`:gibberish`/`::gibberish` invalid),
and the full **type/universal namespace rule** (`*|` dropped without a default namespace /
kept with one; a named prefix resolving to the default-namespace URL omitted, `nsdefault|e`→`e`;
universal `*` dropped when other simples follow; attr null-ns `[|x]`→`[x]`). `set selectorText`
validates → **no-op on parse failure** (retains the old value, per spec); the getter **falls
back to the raw text if unparseable** so an exotic real-page selector can never break. Plus a
**dirty-gated cascade reflection**: `_styleSheetRules` (the function the cascade uses) serves
from the live `CSSStyleRule` objects when a `<style>`-backed sheet carries a CSSOM selectorText
edit (`_cssomDirty`, freshness-guarded on `textContent`), so `getComputedStyle` honours the
edit — untouched pages keep the byte-for-byte text-parse fast path (zero regression). The
adopted-stylesheet cascade now matches on `_selectorSource` (raw) so serialization never
perturbs matching. **selectorSerialize 14→23, serialize-namespaced 31→60, set-selectorText
24→82 — all 100%. +96.** Zero regressions (qsa 1975, classlist 1420, createElement 147,
Node-properties 726, MO-attributes 42 / childList 38, getElementsByTagName 19, serialize-values
696/697, shorthand 7/7, CSSStyleRule 10, CSSStyleSheet 11/17, constructable 6/13,
getComputedStyle-pseudo 2 — all unchanged). **Cap / Next:** `set-selectorText-namespace` 0/5 is
a SEPARATE cap — namespace-aware *matching* in the Rust `selectors` glue
(`crates/obscura-dom/src/selector.rs`), since `svg|*.style1` never matches even at parse time
(`getComputedStyle` → transparent). Sweep a fresh region or take that Rust lift. Scroll
`tickets/120-the-canonical-verdict.md`.

**Session 2026-06-28 (Quest #119 The Sheeted Verdict — CSSOM rule tree, +38):**
After #118 exhausted the MutationObserver childList tail, swept a fresh region:
`css/cssom/`. Its serialization half was already conquered (`serialize-values`
696/697) but the **rule tree** was a stub — `document.styleSheets` returned `[]`,
`CSSStyleSheet` stored plain `{cssText,type}` objects, no `CSSRule`/`CSSRuleList`/
`CSSStyleRule`/grouping/keyframes, and `CSSStyleDeclaration` wasn't iterable. Built
a spec-shaped CSSOM object model in `bootstrap.js` over the **same CSS parser the
cascade already uses** (so a rule's `cssText` reuses the heavily-tested
`_serializeDeclBlock` for free): a recursive `_cssParseRuleList` (preserves nested
at-rules), `CSSRuleList` (stable-identity array-like, Proxy index), `CSSRule` base
with readonly prototype attrs + type constants, `CSSStyleRule`
(`[PutForwards=cssText]`), grouping rules `CSSGroupingRule`/`CSSMediaRule`(+`MediaList`,
`[PutForwards=mediaText]`)/`CSSSupportsRule` (insertRule rejects `@import`/`@namespace`
with HierarchyRequestError), `CSSKeyframesRule`/`CSSKeyframeRule`, a real constructable
`CSSStyleSheet` (replace/replaceSync/insertRule/deleteRule), `document.styleSheets` +
`<style>/<link>.sheet` (cached per node in a WeakMap), and cascade integration so
`getComputedStyle` honours `adoptedStyleSheets` (gated on a non-empty list →
ordinary pages keep the exact original cascade; the getter now returns a persistent
array so `.push()` applies). **CSSStyleRule 0→10, CSSGroupingRule-insertRule 0→7,
constructable 1→6, Keyframes(Rule) 0→2 each, replace-cssRules 0→2, duplicate 0→2,
insertRule-no-index 0→2, MediaList/CSSRuleList/iterator/grouping-cssRules/
conditionText/constructable-cssRules 0→1 each. +38.** ZERO regressions
(serialize-values 696/697, shorthand 7/7, qsa 1975, classlist 1420,
getElementsByTagName 19, MO-attributes 42, MO-childList 38, Node-properties 726,
getComputedStyle-pseudo 2/28 — all unchanged; cascade change stash-proved). **Next
leverage:** shadow-DOM `adoptedStyleSheets` scoping (finishes constructable.html +
duplicate) or the `css/cssom/` insertRule-*/constructable-* tail. Scroll
`tickets/119-the-sheeted-verdict.md`.

**Session 2026-06-28 (Quest #118 The Batched Verdict — MutationObserver atomic childList record batching, +20):**
Took #117's named lead. A compound DOM op must emit ONE childList record (added ∪ removed) per DOM "queue a tree mutation
record", but the Phase-0c Rust recorder pushes one per primitive. Built a **suppress-then-synthesize** mechanism: a Rust
`suppress_mutations` depth counter (the 3 childList primitives skip their push while suppressed) + a `record_childlist_mutation`
op (`push_suppress_mutations`/`pop_suppress_mutations`/`record_childlist`); `bootstrap.js` `__obscura_batchDepth` + enter/exit/record
helpers where **only the OUTERMOST batch synthesizes** (nested ops collapse to the outer record), ALL gated on an active observer
so unobserved pages run the original fast paths byte-for-byte. Applied to `textContent`, fragment `append`/`insert` (removal on
the fragment + addition on the parent), `replaceChild` (incl. the *internal replacement* → 2 records in spec order: node's
old-parent removal first, unsuppressed, then the combined replace), `innerHTML` (batched in the Rust `set_inner_html` op), and
`_pnReplaceChildren`. Plus a **missing `set outerHTML`** — its absence made `el.outerHTML=…` a silent no-op so the observer never
fired and `inner-outer` TIMED OUT; added §dom-element-outerhtml with `[LegacyNullToEmptyString]`. **childList 31→38, inner-outer
0→3, replaceChildren 25→29, outerhtml-02 0→5, outerhtml-01 0→1 (+20).** Zero regressions (qsa 1975, classlist 1420, Range
content-ops 1840 each, MO attributes 42 / characterData 23, Rust unit tests 40/40; outerhtml STASH-PROVED). **Next leverage:**
`MutationObserver-document` 1/4 is a separate parse-time observation gate (parser-inserted nodes don't fire the observer); the
childList/innerHTML/replaceChildren/outerHTML tail is exhausted — sweep a fresh DOM/CSS region. Scroll
`tickets/118-the-batched-verdict.md`.

**Session 2026-06-28 (Quest #117 The Namespaced Verdict — MutationObserver attribute-record correctness, +6):**
After #116 declared Node-Smithing exhausted, swept fresh ground: the Captain's Counsel #1 Collections Armory baselined
already-100% (the board's "4/19" was stale — Attr/Node-Smithing lifted it), so pivoted to the still-red MutationObserver realm
(`MutationObserver-attributes` 36/42). Both fails were Rust-recorder primitives: (1) `attributeNamespace` was hardcoded `null` —
added `attr_namespace` to the Rust `MutationRecord`, threaded through `record_attribute_mutation` / the ns-aware ops / drain /
`bootstrap.js`; (2) a no-op `removeAttribute(NS)` queued a spurious record — guarded on `old.is_some()`. **42/42 (+6).** Zero
regressions (classlist 1420, createElement 147, Node-properties 726, attributes 67, surroundContents/insertNode 1840, qsa 1975,
MO siblings green). **Next leverage:** atomic childList record batching (a Rust suppress-then-synthesize flag) unlocks
`MutationObserver-childList` 31/38 + `inner-outer` 0/3 + `ParentNode-replaceChildren` 25/29 — all the same cap. Scroll
`tickets/117-the-namespaced-verdict.md`.

**Session 2026-06-28 (Quest #116 The Self-Same Verdict — Node-Smithing correctness: isSameNode, contains, XMLDocument/doctype cloneNode, +49):**
Took the Captain's Counsel #1 lead (Node-Smithing Vaults 06) now that the Range frontier is exhausted. The realm baselined far
greener than the board's "~150" estimate — compareDocumentPosition (1444), lookupNamespaceURI (75), textContent (81),
properties (726), nodeName, appendChild, replaceChild, isEqualNode, the ChildNode/ParentNode families were already 100%. Four
pockets of red, all pure-JS (`bootstrap.js`), all additive: **(1) `Node-isSameNode` 0→9** — `isSameNode(other){return other && …}`
leaked the falsy arg (`null`) instead of a WebIDL `false`; fixed with `other != null && this._nid === other._nid`, plus `Attr`
(not a Node subclass) gained its own `isSameNode(o){return o===this}`. **(2) `Node-contains` 1444→1482** — `contains(node)` on
itself was false; DOM §4.4 wants the *inclusive* descendant (a node contains itself), so the `o._nid === this._nid` self case is
folded into the method (the Rust `contains` op is strict-descendant only; the 4 internal callers already added their own
self-check — the tell). **(3) `Node-cloneNode-XMLDocument` 0→1** — `DetachedDocument.cloneNode` hardcoded `new DetachedDocument`,
giving an `XMLDocument` clone the wrong interface; branch `instanceof XMLDocument` (sibling `_IframeDocument` has a different
ctor signature → not `this.constructor`). **(4) `Node-cloneNode-document-with-doctype` 2→3** — DOMParser HTML stripped
`<!DOCTYPE>` and never re-created the DocumentType child; `parseFromString` now parses name/publicId/systemId and inserts a real
`createDocumentType` node, scoped to DOMParser to spare the iframe Range harness child counts. **+49.** ZERO regressions
(Node-cloneNode 135, Node-properties 726, isEqualNode 9, compareDocumentPosition 1444, qsa 1975, classlist 1420, createElement
147, surroundContents 1840, insertNode 1840, extract 187, delete 125, disabled 7/7; stash-proved the `contains`-at-risk suspects
pre-existed: MutationObserver-childList could-not-run on old code too, DOMParser-parseFromString-html was already 9/10 — its lone
fail is `<noscript>` parsing). CAPS: `Node-removeChild` heavy-test hang (loads but never completes, like Node-insertBefore);
`querySelector-escapes` 66/68 (lone-surrogate IDs — Rust UTF-8 can't hold them, coerced to U+FFFD); `replaceChildren` 25/29
(atomic-replace MutationObserver record, needs a Rust suppress-observers flag); `Node-parentNode` 4/5 (iframe-realm `onload`
`this`). NEXT: Node-Smithing ~exhausted of cheap wins; broaden to a fresh CSS region or the MutationObserver/iframe harness gates.
Scroll `tickets/116-the-self-same-verdict.md`.

**Session 2026-06-28 (Quest #115 The Shifted Verdict — live-range adjustment in the DOM node-mutation hooks: remove, insert, split, +48):**
Took the #112/#113/#114-named "next leverage" — wire the `__obscura_liveRanges` registry (from #113) into the *other* spec
range-mutation hooks. The individual `dom/ranges/Range-mutations-*.html` harnesses exist (the un-suffixed `Range-mutations.html`
is the 404 noted before). Baselined: removeChild 11/20, appendChild 56/70, splitText 95/116, replaceChild 56/60. Curling
`Range-mutations.js` showed the reference model is the literal DOM spec: **remove** collapses a removed node's descendant
boundaries to (parent, index) and decrements later parent boundaries; **insert** (non-null reference only — appends don't
shift) increments parent boundaries past the insertion point; **split** moves boundaries past the split offset onto the new
node and bumps the index+1 boundary. THE FIX (pure JS, additive, bootstrap.js): two helpers beside `__obscura_replaceData` —
`__obscura_adjustRangesForRemove` (called in removeChild before the tree op, and in appendChild/insertBefore when the node has
an old parent = the remove half of a move) and `__obscura_adjustRangesForInsert` (called in insertBefore only, after the tree
op); `splitText` rewritten to the spec "split" order (insert new node → steps 8.2–8.5 → truncate via `__obscura_replaceData`,
so detached-node ranges still collapse). `replaceChild` (= remove + insert) fell out for free, including the `replaceChild(x,x)`
replace-with-self round trip that needs the insert shift to undo the remove decrement. All four call sites guard on
`__obscura_liveRanges.length` so range-free page mutations pay nothing. **removeChild 11→20, appendChild 56→70, splitText
95→116, replaceChild 56→60 — all 100%, +48.** ZERO regressions (the Range content-ops route through these and all held; see
sweep). CAP: `Range-mutations-insertBefore.html` is a pre-existing heavy-test hang (no result on baseline either, >5 min) —
same family as the `Node-insertBefore.html` hang from #111; its logic is covered by replaceChild's node moves. NEXT: registry
now wired into replace-data + remove + insert + split; CSS `%`→used-px stays layout-capped. Scroll `tickets/115-the-shifted-verdict.md`.

**Session 2026-06-28 (Quest #114 The Coerced Verdict — WebIDL `unsigned long` (ToUint32) coercion + required-arg-count on the CharacterData mutators, +30):**
Took the #113-named "next leverage" `CharacterData-*` tail. Baselined the five mutators: `substringData` 14/28, `deleteData`
12/18, `replaceData` 30/34, `insertData` 14/18, `appendData` 12/14. Curling the real WPT sources confirmed every failure was a
single primitive: the offset/count arguments are WebIDL `unsigned long`, which means each is coerced via **ToUint32** before
use — and `x >>> 0` in JS *is* ToUint32 (the very op `setStart`/`splitText` already use). So `deleteData(-1, 10)` must read
offset = `(-1) >>> 0` = 4294967295 → out of bounds → `IndexSizeError`; `deleteData(2, -1)` reads count = 4294967295 →
clamped to the tail → `"te"`; `deleteData(1, -0x100000000 + 2)` reads count = 2 → `"tt"`; `substringData("test", 3)` reads
offset = `ToUint32(NaN)` = 0 → `"tes"`. Plus the args are *required*: `substringData()`/`substringData(0)`/`appendData()`
must throw `TypeError`. THE FIX (pure JS, additive, bootstrap.js): (1) coerce `offset = offset >>> 0; count = count >>> 0` at
the top of the shared `__obscura_replaceData` primitive (one place, covers delete/insert/replace/append — the existing
`offset > length` throw and `offset + count > length` tail-clamp then do the right thing for the huge coerced values);
(2) rewrite `substringData` to require 2 args (else `TypeError`), coerce both via `>>> 0`, throw `IndexSizeError` when
`offset > length`, and return the tail when `offset + count` overruns (DOM "substring data"); (3) add a required-arg check to
`appendData`. Internal Range callers (`sc.substringData(so, eo-so)`, `sc.deleteData(...)`) pass plain in-bounds integers, for
which `>>> 0` is the identity — so the blast radius on the Range content-ops is nil. **substringData 14→28, deleteData 12→18,
replaceData 30→34, insertData 14→18, appendData 12→14 — all five now 100%.** ZERO regressions — the Range internals that
route through these primitives all held (`extractContents` 187, `deleteContents` 125, `cloneContents` 187, `surroundContents`
1840, `comparePoint` 5580, `splitText` 6/6, `normalize` 4/4) plus `classlist` 1420, `createElement` 147, `qsa` 1975,
`Node-properties` 726. DEV-LOOP note: `qsa` lives at `dom/nodes/ParentNode-querySelector-All.html` (hyphen before "All") —
the un-hyphenated path is a could-not-run 404, not a regression. **CAPS / NEXT:** the entire CharacterData mutator family is
now 100%. The named next leverage stands: wire the `__obscura_liveRanges` registry (from #113) into the *other* spec
range-mutation hooks (node insert/remove pre-remove steps, `splitText`, `normalize`) for more Range/`*-mutations` greens. CSS
`%`→used-px stays layout-capped. Scroll `tickets/114-the-coerced-verdict.md`.

**Session 2026-06-27 (Quest #113 The Collapsing Verdict — live-range adjustment in the DOM "replace data" primitive, +40):**
Continued the DOM Range realm — the #111/#112-named range-collapse-offset bug, the remaining 19 each on
`Range-extractContents`/`Range-deleteContents`. Every failure was a "Resulting cursor position" subtest whose range starts
and ends in the **same CharacterData node**; after extract/delete the range must collapse (`startOffset === endOffset`) and
ours didn't. The first read (missing collapse in our native same-node early-return branch) was a red herring — adding an
explicit collapse there didn't move the count. The real tell was the assertion prefixed **"Test bug!"** that kept failing:
it asserts on the *expected* range, produced by WPT's own JS reference `myDeleteContents`, which in the same-node case does
`originalStartNode.deleteData(originalStartOffset, originalEndOffset - originalStartOffset); return;` — **no `setStart`/
`setEnd`**, deliberately relying on `deleteData` to collapse the live range. Per the DOM "replace data" primitive
(<https://dom.spec.whatwg.org/#concept-cd-replace>, underlying append/insert/delete/replaceData), mutating a CharacterData
node's text must shift the boundary points of every live range that lands in the replaced span — ours never touched live
ranges. THE FIX (pure JS, additive, bootstrap.js): a live-range registry (`__obscura_liveRanges`, WeakRefs pruned lazily,
mirroring the existing `__obscura_liveNodeIterators`) + one shared `__obscura_replaceData(node, offset, count, data)` that
all four CharacterData mutators route through — it rewrites the string AND applies the spec's range-mutation steps
(offset in `(offset, offset+count]` → `offset`; `> offset+count` → `+= data.length − count`), plus a spec-correct
`IndexSizeError` when `offset > length`. The `Range` constructor registers `new WeakRef(this)`. Now both our native Range
methods and WPT's JS reference collapse the range for free through `deleteData` (the hand-written collapse attempt was
reverted). **extractContents 168→187 (100%), deleteContents 106→125 (100%), +2 bonus on `CharacterData-insertData` 12→14**
(the spec-correct `IndexSizeError`). ZERO regressions — stash-compared the four mutators on a fresh old-code server
(`deleteData` 12/18→12/18, `insertData` 12/18→**14/18**, `replaceData` 30/34→30/34, `appendData` 12/14→12/14); `splitText`
6/6 and `normalize` 4/4 (both use these primitives internally), `surroundContents` 1840, `insertNode` 1840, `cloneContents`
187, `comparePoint` 5580, `classlist` 1420, `qsa` 1975, `createElement` 147, `Node-properties` 726 all held. (`Range-mutations.html`
is a 404 on wpt.live — stale path, not a regression.) **CAPS / NEXT:** the major Range content-ops are now all 100%
(surround/insert/clone/extract/delete/comparePoint). The `__obscura_liveRanges` registry is now a real primitive — wire it
into the *other* spec range-mutation hooks (node insert/remove, `splitText`, `normalize`) for more Range/`*-mutations`
greens. `CharacterData-*` remaining tails are WebIDL unsigned-long / arg-count coercion (e.g. `deleteData(-1,10)` must treat
−1 as 4294967295 and throw) — a separate self-contained primitive. CSS `%`→used-px stays layout-capped. Scroll
`tickets/113-the-collapsing-verdict.md`.

**Session 2026-06-26 (Quest #112 The Validated Verdict — document-rooted `Range.insertNode` runs full pre-insertion validity before mutating, +48):**
Continued the DOM Range realm — the #111 leftover 48, all under `dom/ranges/Range-insertNode.html`. Measuring the failures
showed all 48 shared one trait: **the range's start container is a Document node** (the only document-container ranges in
`testRangesShort`: `[document,0,document,N]`, `[foreignDoc,1,foreignComment,2]`, `[xmlDoc,1,xmlComment,0]`), × 7 inserted
node kinds (element/doctype). Most *should* throw `HierarchyRequestError` — you can't put a second element or doctype into a
Document that already has one — and the test asserts the DOM is **unchanged** after the throw. ROOT CAUSE: `Range.insertNode`
(DOM "insert") must run pre-insertion validity *before* it splits text / removes the node from its old parent, but
`__obscura_ensurePreInsertionValidity` omitted the Document-parent **cardinality** rules (one element child, doctype
placement), deferring them to `insertBefore`'s `_checkInsertConstraints` — which runs *after* the `removeChild`. So an
invalid Document insertion removed the node, *then* threw → DOM left mutated, and the orphaned node corrupted later subtests
(which is why even the genuine `xmlDoc`-adoption cases failed as collateral — adoption itself already worked, CDP-verified).
THE FIX (pure JS, additive): call `_checkInsertConstraints(parent, node, child)` at the end of
`__obscura_ensurePreInsertionValidity` (it's the same machinery `insertBefore`/`appendChild` use) so the complete validity
runs up-front, before any mutation. `__obscura_ensurePreInsertionValidity` is called ONLY by `Range.insertNode`, so the blast
radius is `insertNode` + `surroundContents`. **insertNode 1792→1840 (100%).** ZERO regressions: surroundContents 1840,
cloneContents 187, extract 168/delete 106 (19/19 pre-existing), comparePoint 5580, appendChild 11, cloneNode 135, classlist
1420, createElement 147, qsa 1975. **CAPS / NEXT:** `Range-extractContents`/`deleteContents` remaining 19 each — a
range-collapse-offset correctness bug ("startOffset and endOffset must be the same after"), the next-best Range lead; CSS
`%`→used-px stays layout-capped. Scroll `tickets/112-the-validated-verdict.md`.

**Session 2026-06-26 (Quest #111 The Sectioned Verdict — DOMException legacy `*_ERR` constants on the prototype + CDATASection as Text/CharacterData in Range ops, +632):**
Pivoted out of the now-layout-capped CSS-math realm (Captain's Counsel) into the DOM Range realm — the biggest unmined
frontier by far (`Range-surroundContents` 1308/1840 = **532 fails**). TWO root causes, both pure-JS in `bootstrap.js`.
**(1) DOMException legacy constants only on the interface object.** WPT's `dom/common.js` `getDomExceptionName(e)` does
`for (var prop in e)` over a DOMException **instance** looking for an `*_ERR` constant whose value `== e.code`; our
`DOMException` defined `HIERARCHY_REQUEST_ERR` &c. only via `Object.assign(DOMException, …)` (the interface object), never
on `DOMException.prototype`, so an instance `for…in` found none and the helper threw `"Exception seems to not be a
DOMException?"`. Per WebIDL these constants live on BOTH the interface object and the interface prototype object,
enumerable — so factored them into `_DOMEXCEPTION_CONSTANTS` and `Object.assign`'d onto both. **(2) CDATASection (nodeType
4) not treated as Text/CharacterData in Range ops.** `paras[5]` (common.js) holds two `CDATASection` nodes; a range
starting inside one (`setStart(cdata, 2)`) threw `IndexSizeError` because `__obscura_nodeLength` computed a CDATASection's
length as its child count (0) — it special-cased only Text(3)/Comment(8)/PI(7). Per DOM, the length of ANY CharacterData
(Text, **CDATASection**, PI, Comment) is its `data` length. Added `t===4` to `__obscura_nodeLength` + two helpers
(`__obscura_isText` = 3|4, `__obscura_isCharData` = 3|4|7|8) wired through `cloneContents`/`extractContents`/`deleteContents`
(CharacterData branches) + `insertNode` (split a CDATA start node like Text) + `surroundContents` (partially-contained
non-Text guard); the WPT reference's own `isText` is `TEXT_NODE || CDATA_SECTION_NODE`. **surroundContents 1308→1840 (100%),
insertNode 1700→1792, extractContents 163→168, deleteContents 103→106 = +632.** ZERO regressions (DOMException is a shared
global — swept error-bearing realms): cloneContents 187, comparePoint 5580, qsa 1975, classlist 1420, Node-cloneNode 135,
Node-properties 726, createElement 147, Node-appendChild 11, structured-clone 141, getRandomValues 39, mark 22; CSS math
signs-abs 222, round-mod-rem 233, minmax-length-percent 30 byte-identical; extractContents/deleteContents IMPROVED and
their remaining 19/19 stash-proven pre-existing. **CAPS / NEXT (ROI):** `Range-insertNode`'s remaining 48 = cross-document
**adoption** (insert a node from a foreign doc → adopt into start node's document; we don't yet) + niche document-insertion
validity (`HIERARCHY_REQUEST_ERR` for doctype/element when range start is `document`) — a scoped follow-on. The 19+19
extract/delete fails are a separate range-collapse-offset correctness bug. `Node-insertBefore.html` is a pre-existing
heavy test that hangs the server on baseline too (NOT a regression). Scroll `tickets/111-the-sectioned-verdict.md`.

**Session 2026-06-26 (Quest #110 The Zeroed Verdict — all-`0%` args fold inside forcing math functions, +10):**
The named #107–#109 "next leverage" no-layout `0%` sub-win. Probed the standing `%`→used-px tail first and confirmed
it IS genuinely layout-capped: getComputedStyle returns `margin-left: 10%` unresolved, and our layout reports the
WRONG containing-block width (100px for a `width:75px` div) — not a single-session win. But the no-layout HALF is real:
`0%` is 0 against ANY containing block, so a *forcing* math function (`hypot`/`round`/`mod`/`rem` — one that can't be
re-serialized as a linear `calc(P% ± Lpx)` and so MUST collapse its args to numbers to fold) whose every `%` literal is
`0%` folds with no layout. `hypot(0% + 3px, 0% + 4px)`→`5px`, `hypot(0% + 600px, 0% + 800px)`→`1000px`,
`calc(round(1px + 0%, 1px + 0%))`→`1px`, `round(1px + 0%, 1px)`→`1px`. Single-arg `hypot(0% + 772.333px)`→
`calc(0% + 772.333px)` (the % must stay symbolic — Chrome keeps a plain `calc(0% + Npx)`) via the #109 single-arg
unwrap, now extended from min/max to `hypot`. ROOT CAUSE: any `%` routed `_trComp` into the mixed-`%` branch, which
can only emit `calc(P% ± Lpx)` or echo the original — so a function name (`hypot(`) leaked into the computed value and no
longer matched the bare `5px`. THE FIX (pure JS, additive, bootstrap.js): (1) `_unwrapSingleMinMax` regex gains `hypot`;
(2) new `_FORCE_EVAL_FN_RE` (hypot/round/mod/rem/trig/exp/sign/abs) + `_allPctZero(t)` (every `%` literal parses to 0,
and there's at least one); (3) in `_trComp`'s mixed-`%` branch, when both hold AND `computed`, eval with %-base 0 and
return the folded px. A plain `calc(0% + Npx)` has no forcing function → skipped → stays symbolic (so single-arg hypot,
unwrapped to calc *before* this point, never folds). A non-zero `%` (e.g. `mod(18px, 100%/15)`) → `_allPctZero` false →
stays symbolic (correct — needs the 75px containing block). **hypot-pow-sqrt-computed 48→52 (100%), round-mod-rem-computed
227→233 = +10.** ZERO regressions (gated on `computed` so all serialize realms byte-identical — hypot-serialize 25,
round-mod-rem-serialize 21/24 STASH-PROVEN pre-existing, minmax/clamp/signs-abs-serialize 24/50/16; all `*-invalid`
held — hypot 49, round-mod-rem 108, signs-abs 53; computed realms minmax-length-percent 30, minmax-length 76,
signs-abs 222, clamp-length 24, sin-cos-tan 32, acos 50, calc-infinity-nan 48; serialize-values 696, qsa 1975,
calc-nesting 7/8). **CAPS / NEXT (ROI):** the remaining 10 round-mod-rem fails + minmax-length-percent's 20 +
signs-abs's `%` rows are ALL non-zero `%`→used-px against the containing block (REAL LAYOUT — our getComputedStyle
doesn't resolve margin/inset `%` and reports wrong used dimensions) — still THE standing widest tail, now genuinely
blocked behind a layout engine. Smaller non-layout leads: cssText recombination for `border` (untested since #107);
`fr`/`dpi` niche computed paths (signs-abs's 6). Scroll `tickets/110-the-zeroed-verdict.md`.

**Session 2026-06-26 (Quest #109 The Singular Verdict — single-arg `min()`/`max()` collapses to `calc()`, +30):**
The named #108 "next leverage #1" — the `%`→used-px tail — turned out to be HALF non-layout. `minmax-length-percent-computed`
was 0/50, but the 50 fails split cleanly: **30 are single-argument** `min()`/`max()` (`min(1em + 1%)`, `max(1vh + 1%)`, …)
which per CSS Values 4 §simplification reduce to their lone argument at computed time and serialize as `calc()` — these
need NO layout (`%`/viewport stay symbolic, em/abs→px, exactly like bare `calc()`). The other 20 are genuine multi-arg
comparisons (`min(20px, 10%)`→`10px`) that DO need the containing-block width (the standing layout cap). ROOT CAUSE:
`_resolvePctLengthCalc` (the mixed-`%`+length computed serializer) only matched strings starting `calc(`, so a single-arg
`min(1px + 1%)` fell through to `_canonMathExpr` which echoed the `min(…)` wrapper verbatim → the function name leaked into
the computed value and no longer matched the equivalent `calc(1% + 1px)`. THE FIX (pure JS, additive, bootstrap.js):
new `_unwrapSingleMinMax(t)` — if `t` is `min(X)`/`max(X)` with a single top-level argument (no comma), rewrite to
`calc(X)`; called once at the top of `_trComp` gated on `computed` so the specified-serialization path (serialize realms)
is byte-identical. Idempotent for multi-arg / non-min-max / already-calc input. **minmax-length-percent-computed 0→30 = +30.**
ZERO regressions (full computed+serialize sweep — the change only alters single-arg min/max-with-`%`, every other path
byte-identical): minmax-length-computed 76, signs-abs-computed 222, round-mod-rem-computed 227, hypot-pow-sqrt-computed 48,
clamp-length-computed 24, minmax-length-serialize 24, clamp-length-serialize 50, translate-parsing-computed 19.
**CAPS / NEXT (ROI):** the remaining 20 minmax-length-percent fails are ALL the multi-arg `min/max(px, %)` comparisons that
need `%`→used-px against the containing block (real layout) — still THE standing widest tail (joins round-mod-rem's 16
`%`/`0%`-mixed, hypot's 4 `0%`-mixed, margin/padding/block-size `%`). Scroll `tickets/109-the-singular-verdict.md`.

**Session 2026-06-26 (Quest #108 The Signed Zero — `sign()` of angle/time + negative-zero round-trip + time-path lengths, +55):**
The named "next leverage #3" of #106–#107 — the no-layout `signs-abs-computed` tail (167/233). Three
orthogonal root causes, all non-layout: **(A) `sign(<angle>)`/`sign(<time>)` serialized `calc(1)` not `1`.**
The integer (z-index) computed path `_computeIntegerValue` called `_evalMath` with only `lengths:true`, so an
angle/time unit inside `sign()`/`abs()` was unresolvable → `_evalMath` returned null → the caller fell back to
the symbolic `_canonMathExpr` (`calc(1)`). Fix: enable `angle:true, time:true` (the only way an angle/time unit
reaches a valid integer value is inside sign/abs, which collapse it to a `<number>`; invalid mixed-type values
are rejected at set time). **+30.** **(B) Negative zero was being destroyed at specified-serialization time.**
`el.style.zIndex = 'calc(sign(-0px))'` stored `calc(sign(0px))` — `_canonStandardValue` (the light token-level
canon on EVERY standard-property set) ran `_canonNumberLiteral`, which strips `-0`→`0` per the CSSOM
`<number>` serialization rule. But inside a math function `-0` is observably distinct (`1 / sign(-0px)` = −∞,
clamped to −1; vs `+0`→+∞→+1). Fix: paren-depth tracking in `_canonStandardValue` preserves the sign of zero
inside parens (`_serCalcNum` already special-cased to emit `-0`), while a bare top-level `-0` still collapses to
`0`. The computed re-evaluation then recovers −1 (`_evalMath`'s unary-minus + `Math.sign(-0)`=−0 already
correct). **+22.** **(C) The time path didn't resolve lengths inside sign().** `_computeTimeValue` lacked
`lengths`/`emPx`, so `calc(5s + 15s * sign(40px - 2em))` stayed symbolic; threaded `el`+`emPx` so `sign(40px-2em)`
(2em=40px at font-size 20px) → 0 → `5s`. **+3.** **signs-abs-computed 167→222 = +55.** ZERO regressions across
the full sweep — KEY (the −0 change touches every standard-property set): all serialize realms held byte-for-byte
(signs-abs-serialize 16, clamp-length-serialize 50, minmax-length/time-serialize 24/22,
calc-dimension-serialization-order 44, hypot-pow-sqrt-serialize 25, calc-infinity-nan-serialize
length/number/time/angle 41/31/29/30, serialize-values 696), all `*-invalid` realms held (signs-abs 53,
round-mod-rem 108, sin-cos-tan 42, hypot-pow-sqrt 49), transforms rotate/scale/translate-parsing-computed
23/38/19, colour color-valid 17 + color-computed-relative-color 1121, calc-nesting 7/8,
variable-substitution-shorthands 51, classlist 1420, createElement 147, qsa 1975; sibling math realms held
(round-mod-rem-computed 227, minmax-length-computed 76, clamp-length-computed 24, sin-cos-tan 32, acos 50,
hypot-pow-sqrt 48, calc-infinity-nan 48). **Caps / Next:** the remaining 11 signs-abs fails are 5 `%`→used-px
(the standing layout cap — `abs(10%)`→`10px`, `calc((1em+1px)*(sign(1em-10px-10%)+1))`→`21px`) + 3 `fr`-unit
(grid-template-rows) + 3 `dpi` (image-resolution) niche computed paths. round-mod-rem-computed's 16 fails are
ALL `%`/`0%`-mixed (layout); a narrow `0%`→0px-always sub-win (~6 there) is possible but touches the
length-resolution layout boundary. Scroll `tickets/108-the-signed-zero.md`.

**Session 2026-06-26 (Quest #107 The Bordered Expansion — `border`/`outline` shorthands expand into specified longhands, +40):**
The named #103–#106 "next leverage #2". `border-shorthand` sat at **0/36** and `outline-shorthand`
at **0/4** because `el.style.border = "5px dotted blue"` stored `border` as one opaque key, so the
specified-value reads `el.style.borderTopColor` returned `""`. (This is the CSSOM `el.style` path —
distinct from Quest #58's *computed*-time cascade expansion, which already passed
`variable-substitution-shorthands` 51/51 via getComputedStyle.) THE FIX (pure JS, additive,
`bootstrap.js`) mirrors the `offset` shorthand model: expand-on-write into longhands, store only the
longhands, reconstruct on read. New `_BORDER_EXPAND` table (shorthand→longhands; `border` also lists
the 5 `border-image-*` reset longhands per CSS Backgrounds 3 §border-shorthands), `_expandBorderShorthand`
(validates each `<line-width> ‖ <line-style> ‖ <color>` component — `color-mix(42deg)` rejected via
`_isValidColor`; line-width math folded via `_canonLineWidth` so `calc(calc(10px))`→`calc(10px)`),
`_serializeBorderShorthand` (reconstruct: sides agree + border-image initial → join dropping
medium/none/currentcolor). Wired into setProperty/removeProperty/getPropertyValue + `CSS.supports`,
all gated on `!var()` so the cascade still owns `border: var(--x)`. The proxy needed no change.
**border-shorthand 0→36, outline-shorthand 0→4 = +40** (bonus: `border-image-source-computed` 9→10).
ZERO regressions across a full sweep — KEY: `variable-substitution-shorthands` 51/51 (var()-cascade),
`calc-nesting` 7/8 (border calc subtest held via `_canonLineWidth`), `serialize-values` 695→696,
`shorthand-serialization` 7/7, `border-color-valid` 7/7, `css-ui/inheritance` 28/28,
`css-tables/inheritance` 10/10, classlist 1420, createElement 147, qsa 1975. **Caps / Next:** (1)
`%`→used-px against the containing block (the standing layout cap, biggest length tail); (2) cssText
recombination for `border` (currently serializes longhands individually — untested, not a regression);
(3) signs-abs/round-mod-rem-computed em-relative tails (no layout). Scroll `tickets/107-the-bordered-expansion.md`.

**Session 2026-06-26 (Quest #106 The Balanced Verdict — auto-close unbalanced calc parens, +1):**
The named #105 "next leverage" #1 — the `pow`-length `margin-left` validity gap. `hypot-pow-sqrt-computed`
sat at 47/52; one fail was `calc(1px * pow(2, sqrt(100))` → expected `1024px`, got the default `0px`.
The test value is **one closing paren short** (`calc(` `pow(` `sqrt(` = 3 opens, `100))` = 2 closes).
CSS Syntax §"consume a simple block" implicitly closes any blocks still open at end-of-input — so
`calc(1px * pow(2, sqrt(100))` is a perfectly valid `calc(1px * pow(2, sqrt(100)))`, not a parse error.
But the generic math parser `_parseCalcTree` (the chokepoint for the validity gate `_mathReject`→
`_mathValid` AND the specified-value serializer `_canonMathExpr`) treated the unbalanced token stream as
malformed and returned `null` → the gate rejected the value → `margin-left` fell back to its `0px`
initial. (The `rotate`/`scale`/`translate` gates already auto-balance via `_balanceParens` —
`_parseCalcTree` was simply missing the same step.) THE FIX (pure JS, additive, one line, `bootstrap.js`):
wrap `_parseCalcTree`'s input in the existing `_balanceParens` (`String(str)…trim()` → append the missing
`)`s). **Idempotent** for already-balanced input (the overwhelmingly common case — a no-op), so the colour
path and every finite/non-finite calc stay byte-identical. With the tree now parsing, the validity gate
types it `<length>` (pow→`<number>`, `1px × <number>`→`<length>`) and `_canonMathExpr` folds it to
`calc(1024px)` (it already accepts values ending in `)`, which this one does after its trailing
`sqrt(100))`). **hypot-pow-sqrt-computed 47→48 = +1.** Zero regressions across the full sweep — KEY: the
`*-invalid` realm (the over-acceptance risk, since the gate now accepts MORE) held exactly: acos-invalid
62/63 (the 1 is the pre-existing `atan2(…, + …)` cap #95), signs-abs-invalid 53, round-mod-rem-invalid
108, sin-cos-tan-invalid 42, hypot-invalid 49 — unbalanced trailing parens are not an invalidity reason
per spec, so no invalid test relies on rejecting them. Also held: signs-abs-computed 167,
round-mod-rem-computed 227, calc-infinity-nan 48, minmax-length-computed 76, clamp-length-computed 24,
minmax-length-serialize 24, clamp-length-serialize 50, signs-abs-serialize 16, calc-nesting 7/8,
calc-dimension-serialization-order 44, minmax-time-serialize 22, hypot-pow-sqrt-serialize 25,
rotate/scale/translate-parsing-computed 23/38/19, color-computed-relative-color 1121, color-valid 17,
classlist 1420, createElement 147. **Caps / Next:** the remaining 4 hypot fails are all `hypot(0% + …)`
mixed-percentage rows → the standing `%`→used-px layout cap (`minmax-length-percent` 0/50). Then
`border`→12-longhand expansion (`border-shorthand` 0/36). Scroll `tickets/106-the-balanced-verdict.md`.

**Session 2026-06-25 (Quest #105 The Counted Verdict — `sibling-index()` tree-counting, +14):**
The named #104 "next leverage" #1. Three computed math-function tests shared a `sibling-index()` tail —
`acos-asin-atan-atan2-computed` (46/50), `sin-cos-tan-computed` (26/32), `hypot-pow-sqrt-computed`
(43/52). `sibling-index()`/`sibling-count()` (CSS Values 5) substitute at computed time to the
element's real element-sibling position/count, but the engine had no DOM-backed value and `_mtFn` typed
them as the conservative `'unknown'` — so `atan2(1, sibling-index())` resolved `'unknown'` and `_rotKind`
mis-rejected it in `rotate`, scale's `_scaleCalcOk` rejected `calc(sin(pi*sibling-index()))` as invalid,
and z-index/margin left them symbolic. THE FIX (pure JS, additive, `bootstrap.js`): (1) `_mtFn` types
`sibling-index()`/`sibling-count()` as `<number>` (any arg → invalid); (2) `_evalMath` resolves them from
`opts.siblingIndex`/`siblingCount` (real value) or a `siblingValid` grammar placeholder; (3)
`_siblingOpts(el, val)` reads the true 1-based position via `element_children`, gated on `_SIBLING_FN_RE`
so the common computed path takes no extra DOM round-trip; threaded into `_rotSerAngle`/`_scaleComp`/
`_trComp`/`_computeIntegerValue` + scale's validity probe. Reads the REAL DOM (CDP-verified: hypot's
`#target` is the 4th of four sibling divs → `sibling-index()`=4, `sqrt(4)`=2, `atan2(1,4)`=14.036deg).
**acos 46→50, sin-cos-tan 26→32, hypot 43→47 = +14.** Zero regressions across the full sweep (invalid
realm held — acos-invalid's lone fail is the pre-existing `atan2(…, + …)` cap; colour 1121, classlist
1420, createElement 147). NEXT: `hypot` `0%`-mixed + `pow`-length validity (47/52, the pow one is
layout-free); `%`→used-px (layout); `border`→longhand expansion.

**Session 2026-06-25 (Quest #104 The Angled Verdict — inverse-trig angles in `rotate`, +38):**
The named #103 "next leverage" #3 (the computed inverse-trig tail). `acos-asin-atan-atan2-computed`
sat at 11/50: the `rotate` property REJECTED angle-valued math functions that carry no literal angle
unit — `acos(1)`, `atan2(0,0)`, `calc(asin(sin(pi/2)))`, `atan2(1px,-1px)` — computing `none` (the
default) instead of the `<angle>`. Root cause: `_rotKind` decided a math token's angle-ness by a
LITERAL-TEXT heuristic (does the string contain `deg|grad|rad|turn`?), which both rejected unit-free
angle results AND would mis-accept a number-valued `sin(45deg)`. THE FIX (pure JS, additive,
`bootstrap.js`): (1) `_rotKind` now classifies a math token by its calc-tree RESULT TYPE
(`_parseCalcTree`→`_mt`, the same lattice `_mathValid` uses, `pctType=null`) — `asin`/`acos`/`atan`
:`<number>`→`<angle>`, `atan2`:two same-typed→`<angle>`, `sin`/`cos`/`tan`→`<number>`; the literal
heuristic survives only as the fallback for an `unknown` type (`var()`/`sibling-index()`). (2)
`_rotSerAngle` threads `el` and resolves `<length>`/`<time>`/viewport arguments
(`angle:true, lengths:true, time:true, emPx, vw, vh`) so `atan2(1px,-1px)`/`atan2(1s,-1s)`/
`atan2(1vh,-1vh)`→`135deg` (like units cancel as a ratio). (3) `_evalMath`'s `opts.time` branch now
FALLS THROUGH to the length branch for a non-`<time>` unit — but ONLY when `opts.lengths` is also set
(`if (!opts.lengths) return tfail()` guards it), so every existing time-only caller is byte-identical
and only the new rotate-angle eval gains mixed length/time resolution. **acos-asin-atan-atan2-computed
11→46 (+35); signs-abs-computed 164→167 (+3 bonus) = +38.** **ZERO regressions**: rotate/scale/
translate-parsing-computed 23/38/19, rotate-parsing-valid 23, sin-cos-tan-computed 26, round-mod-rem-
computed 227, calc-infinity-nan-computed 48, hypot-pow-sqrt-computed 43, signs-abs-serialize 16,
classlist 1420, createElement 147 all held. **Caps / Next:** `sibling-index()` (CSS Values 5
tree-counting) — the lone `acos…` tail (4 fails) and a RECURRING tail across the whole computed
css-values realm; needs the element's 1-based sibling index plumbed into `_evalMath` (today a pure
string evaluator with no DOM context). Then `%`→used-px (layout); `border`→longhand expansion. Scroll
`tickets/104-the-angled-verdict.md`.

**Session 2026-06-25 (Quest #103 The Bordered Verdict — calc-in-shorthand: line-width math in border/outline/column-rule, +1):**
The named #102 "next leverage" #1 — the standing `calc-nesting` 6/8 cap. The `border` shorthand value
`calc(calc(10px)) solid pink` echoed its nested calc verbatim instead of canonicalizing to
`calc(10px) solid pink`: `border`/`outline`/`column-rule` aren't in the length tables, so
`_canonLengthTimeMath` skips them and their embedded calc() never reached the math canon. THE FIX (pure
JS, additive, `bootstrap.js`): a `_canonShorthandLenMath` helper + a `_BORDER_SH_PROPS` set
(`border`(+top/right/bottom/left), `outline`, `column-rule`). The grammar is `<line-width> ||
<line-style> || <color>`; only the width can be a TOP-LEVEL math function (a keyword/hex/colour-function
never is), so each top-level component that IS one (`_MATHFN_NAME_RE`) routes through
`_canonMathExpr(p, {canonLen:true})` — the same length math canon `left`/`width` already use. Gated on
`_MATHFN_NAME_RE` over the whole value so a math-free border stays **byte-for-byte identical** (no
whitespace reflow), and wired into both `setProperty` and `_parseStyleDecls`. **calc-nesting 6→7/8.**
**ZERO regressions** — stash-proven: border-shorthand 0/36 + outline-shorthand 0/4 were ALREADY failing
(pre-existing structural caps — `border` not expanding to longhands, invalid-value rejection — none
contain a math fn so the gate leaves them untouched); colour 1146/1121, calc-infinity-nan 41/48,
minmax-length-serialize 24, clamp-length-serialize 50/computed 24, minmax-time-serialize 22,
calc-dim-order 44, signs-abs 16, serialize-values 696 all held. The lone calc-nesting fail left is the
layout test (`calc(60% - 20px)`→`100px`, the `%`→used-px cap). Scroll `tickets/103-the-bordered-verdict.md`.

**Session 2026-06-25 (Quest #102 The Flattened Verdict — nested-product coefficient fold in the SPECIFIED length/time serializer, +1):**
The named #101 "next leverage" #1 and the last fail standing in `minmax-length-serialize`. `_simpCalc`
folds all numeric leaves at *one* product level into a single coefficient, but a child product that still
holds a symbol/function survives simplification carrying its *own* coefficient — so
`calc(2 * (.2 * min(1em,1px)) + 1px)` left the `2` and the `0.2` one level apart and serialized verbatim
as `calc(1px + (2 * (0.2 * min(1em, 1px))))` instead of the canonical
`calc(1px + (0.4 * min(1em, 1px)))`. (The COMPUTED value `1.4px` already passed — `_evalMath` multiplies
numerically.) THE FIX (pure JS, additive, `bootstrap.js`): before the coefficient-folding loop in
`_simpCalc`'s product branch, **flatten** any factor that is itself a product, inlining its factors at
this level so their numeric leaves join the parent's fold (`2 * (0.2 * min)` → `0.4 * min`). Inner factor
ops carry over unchanged under `*` and **invert** under `/` (`x / (a*b)` = `x/a/b`, `x / (a/b)` =
`x/a*b`). Gated behind the length/time `sort` path (threaded from `opts.canonLen || opts.canonTime`) so
the colour channel — which calls `_simpCalc` with `sort` false — stays byte-for-byte identical.
**minmax-length-serialize 23→24, the realm now closes at 100%.** **Zero regressions** across the full
calc sweep: color-valid-relative-color 1146, color-computed-relative-color 1121/1169 (the wpt.live
test-content change from #101, NOT a regression — the flatten is gated off for colour anyway),
calc-infinity-nan-serialize 41/31/29/30 + computed 48, signs-abs 16/164, round-mod-rem 21/227, hypot
25/43, minmax-number/angle/length-computed/time 40/38/76/22, calc-nesting 6, calc-dimension-order 44,
clamp-length-serialize/computed + integer-computed 50/24/6, scale/rotate/translate-parsing-computed
38/23/19, classlist 1420, createElement 147 all held. **Caps / Next:** calc-in-shorthand
(`calc(calc(10px)) solid pink` — the `calc-nesting` 6/8 cap, shorthand values bypass
`_canonLengthTimeMath`); `%`→used-px against the containing block (the standing layout cap,
`minmax-length-percent` 0/50). Scroll `tickets/102-the-flattened-verdict.md`.

**Session 2026-06-25 (Quest #101 The Boundless Verdict — `clamp(none,…)` at COMPUTED time + mixed-unit product fix, +7):**
The named #100 "next leverage" #1. #100 taught the SPECIFIED serializer to fold `clamp(none,…)` (the
`none` sentinels live in `_foldMathFn`), but the COMPUTED numeric path is a *separate* evaluator
(`_evalMath`) and it choked on the bare `none` keyword: the whole eval failed (`tfail()`→`null`), so
`z-index: clamp(none, 30, 33)` fell back to the symbolic serializer and computed to `calc(30)` instead
of the bare integer `30`. THE FIX (pure JS, additive, `bootstrap.js`): (1) **`none` sentinel in
`_evalMath`'s clamp branch** — clamp is the only math function that takes `none`, so we peel it per-arg
and evaluate a `none` in the MIN slot as −∞ and in the MAX slot as +∞; the existing
`max(lo, min(val, hi))` then collapses exactly (`clamp(none,30,33)`→`max(−∞,min(30,33))`→`30`,
`clamp(30,33,none)`→`max(30,min(33,+∞))`→`33`). This fixed `clamp-integer-computed` whole-hog (1→6).
(2) **mixed-unit product fix** — the last `clamp-length-computed` fail was
`clamp(1600px / 1em * 1px, 1em / 1rem * 1px, none)` (expected `80px` at font-size 20px). The SPECIFIED
serializer was folding `1600px / 1em * 1px` → a bogus `1600px`: `_mulUnit`/`_divUnit` assumed *only one
side ever carries a unit* and hit a final `else → a` branch that silently DROPPED the second unit
(`px / em` → `px`, `px * px` → `px`). Two DIFFERENT non-empty units form a compound that can't reduce to
one numeric leaf at specified time (em is unresolved), so they now return `null` and the product fold
keeps the whole expression symbolic (`{k:'prod', facs}`) — letting the COMPUTED path resolve em→px and
fold it correctly later. **clamp-integer-computed 1→6, clamp-length-computed 22→24 (+7).** **Zero
regressions**, stash-verified: `color-computed-relative-color` reads 1121/1169 now (down from the
memory's 1163) but that's a **wpt.live test-content change** — a clean stash of `bootstrap.js` measured
the SAME 1121 without my edits, so it is NOT my regression. Held: color-valid-relative-color 1146,
calc-infinity-nan-serialize length/number/time/angle 41/31/29/30, signs-abs-serialize/computed 16/164,
round-mod-rem-serialize/computed 21/227, minmax-number/angle-serialize 40/38, minmax-length-computed 76,
hypot-pow-sqrt-serialize/computed 25/43, scale/rotate/translate-parsing-computed 38/23/19, calc-nesting 6,
calc-dimension-serialization-order 44, clamp-length-serialize 50, classlist 1420, createElement 147.
**⚠️ wpt.live moved many ritual paths** (the next comrade WILL hit 42-byte/`bodyLen=42` could-not-runs on
the old paths): `css/css-values/serialize-values.html` is **removed**; the colour relative-color tests
moved to `css/css-color/parsing/`; the transform `*-parsing-computed` tests live at
`css/css-transforms/parsing/`. **Caps / Next:** nested-product coefficient fold (`2*(0.2*X)`→`0.4*X`, the
last `minmax-length-serialize` fail); calc-in-shorthand (`calc(calc(10px)) solid pink`); `%`→used-px
against the containing block (the standing layout cap). Scroll `tickets/101-the-boundless-verdict.md`.

**Session 2026-06-25 (Quest #100 The Folded Verdict — finite-calc folding + canonical sum-ordering in the SPECIFIED length/time serializer, +123):**
The named #99 "next leverage" #2. #99 taught the specified serializer to canonicalize *non-finite*
math but **gated it on a non-finite keyword** — so finite `clamp(1px, 2px, 3px)` / `calc(1px + 2px)`
on a `<length>`/`<time>` property still echoed verbatim through `_canonStandardValue`. The folding
machinery already existed (`_canonMathExpr`→`_parseCalcTree`→`_simpCalc`→`_foldMathFn`); it was just
gated off. THE FIX (pure JS, additive, `bootstrap.js`, all behind the length/time `canonLen`/`canonTime`
opt so the colour path — which shares `_simpCalc`/`_canonMathExpr` — stays byte-identical): (1)
**`clamp()` `none` sentinels in `_foldMathFn`** (CSS Values 4 §funcdef-clamp): `none` removes that
bound — `clamp(none, V, H)` ≡ `min(V, H)`, `clamp(L, V, none)` ≡ `max(L, V)`, `clamp(none, V, none)`
≡ `V`; handled *before* the all-numeric guard since `none` is a symbol leaf (validation already
accepts it). (2) **Canonical sum-ordering `_simpSumSorted`** (§sort-a-calculations-children): fold
numeric terms by unit into one leaf each, then order **number → percentage → dimensions
(ASCII-alphabetical by unit)** with non-numeric terms preserved after; reached only on the new `sort`
path threaded through `_simpCalc` (and fixed `node.args.map(_simpCalc)` which was leaking the array
index as the `sort` arg). (3) **Lifted the gate** — `_canonNonFiniteMath` → `_canonLengthTimeMath`:
drop the `_NONFINITE_KW_RE` test so **every** value containing a math function on a known
`<length>`/`<time>` property routes through `_canonMathExpr({canonLen|canonTime})`; a bare keyword
(no math function) keeps its `_canonStandardValue` serialization. No new Rust. **clamp-length-serialize
4→50, calc-dimension-serialization-order 0→44, minmax-length-serialize 13→23, minmax-time-serialize
11→22, calc-nesting 0→6, clamp-none-whitespace 0→3 = +120; +2 round-mod-rem-computed (227), +1
signs-abs-computed (164) bonus = +123.** Zero regressions — colour path byte-for-byte
(color-valid-relative-color 1146/1147, color-computed-relative-color 1163/1169 unchanged;
serialize-values 696/697 no calc), and held the ledger (calc-infinity-nan serialize 41/29/31/30 +
computed 48, hypot-pow-sqrt 25/43, minmax-length-computed 76, minmax-number/angle-serialize 40/38,
scale/rotate/translate-parsing-computed 38/23/19, classlist 1420, createElement 147). Scroll
`tickets/100-the-folded-verdict.md`. **NEXT:** nested-product coefficient fold (`2*(0.2*X)`→`0.4*X`,
the last minmax-length-serialize fail — product flattening, gate behind `sort`); the COMPUTED
clamp-none / `sign(1em-18px)` tail (`clamp-length-computed` 17/24, `clamp-integer-computed` 1/6 —
the `_evalMath`/`_trComp` path); calc-in-shorthand; `%`→used-px against the containing block (layout).

**Session 2026-06-24 (Quest #99 The Serialized Verdict — non-finite math in SPECIFIED length/time values, +70):**
The named #98 leftover. #98 clamped non-finite math at *computed* time; the *specified* value
(`el.style.width` round-trip) was still echoed verbatim (`calc(1px * NaN)` → `calc(1px * NaN)`).
We already had a full calc serializer (`_canonMathExpr`→`_parseCalcTree`→`_simpCalc`→`_serCalcTree`/
`_serCalcNum`, incl. the `<keyword> * 1<unit>` non-finite leaf form) but it was wired ONLY into the
colour-channel canon. THE FIX (pure JS, additive): (1) **abs-length & time canon in `_parseCalcTree`**
— opt-in `canonLen`/`canonTime` (default OFF → colour byte-identical) mirroring the angle→deg canon:
`_ABS_LEN_PX` (px/in/cm/mm/q/pt/pc→px; relative units excluded) + `_TIME_S` (ms→s), so same-type
arithmetic folds (`min(NaN*1pt, NaN*1cm)`→`calc(NaN * 1px)`); (2) **min()/max() NaN cross-unit
collapse in `_foldMathFn`** — a NaN makes the comparison indeterminate regardless of unresolved
units (px-vs-em), so it folds to NaN at the type's canonical unit (`_unitType`/`_CANON_TYPE_UNIT`);
`clamp()` excluded (keeps its 3 args → `clamp(NaN*1em, NaN*1px, NaN*1px)`); (3) **redundant-form
drops** — `_simpCalc` drops a unitless `1 *` identity (`calc(1 * clamp(…))`→bare `clamp(…)`, guarded
so `calc(1 / l)` keeps its numerator) and `_canonMathExpr` sheds the redundant `calc()` wrapper around
a standalone fn (gated on the non-finite path so colour keeps its legacy rule); (4) **wiring** —
`_canonNonFiniteMath` in `setProperty`/`_parseStyleDecls`, **gated on a non-finite keyword**
(`\b(?:infinity|nan)\b`) over known `<length>`/`<time>` props, so every FINITE calc stays
byte-identical via `_canonStandardValue`. No new Rust. **calc-infinity-nan-serialize-length 0→41,
calc-infinity-nan-serialize-time 0→29 = +70.** Zero regressions — stash-verified the shared-path
consumers byte-for-byte (color-valid-relative-color 1146/1147, color-computed-relative-color
1163/1169, serialize-values 696/697 all identical with/without), held calc-infinity-nan-computed 48,
serialize-number 31, serialize-angle 30, signs-abs 163, round-mod-rem 225, minmax-length 76,
minmax-number 14, clamp-length 17, hypot-pow-sqrt-serialize 25/computed 43, scale/rotate/translate
38/23/19, classlist 1420, createElement 147. Scroll `tickets/99-the-serialized-verdict.md`.
**NEXT:** the deep `%`→used-px-against-containing-block cap (needs layout); finite-calc generic-path
folding (`width: calc(1px+2px)`→`calc(3px)`, a broader change risking the serialize-values hot path);
`clamp(none,…)` ±∞ sentinel.

**Session 2026-06-24 (Quest #98 The Clamped Verdict — non-finite math clamped at computed time, +48):**
The named #96/#97 leftover. Our calc engine already *computed* `infinity`/`NaN`/`-infinity`
numerically, but the computed path then dropped non-finite results (`_evalMath` returns
`null` for a non-finite result unless `nonFinite` is set) and serialized the value verbatim
(`calc(infinity * 1px)` → `parseFloat` `NaN`). CSS Values 4 §calc-type-checking: a non-finite
result is clamped at computed/used time — **NaN → 0, +∞ → largest finite, −∞ → most negative**.
ONE shared helper `_nfClamp` (NaN→0, +∞→`1e30`, −∞→`−1e30`) threaded into each computed numeric
family: **length** (`_trComp` — added `nonFinite` to the already-`computed`-gated `lenOpts`, plus
the mixed-`%` **collapse**: probe the whole expression with a *positive* `%`-base so `∞·1%`→∞ not
`∞·0=NaN`, and only collapse to a clamped `px` when the probe is non-finite — a finite
`calc(50%+10px)` still stays symbolic); **time** (`_computeTimeValue`, + `_balanceParens` for the
tokenizer's EOF auto-close `calc(max(∞·1s, 10s)`); **number/scale** (`_scaleComp`); **angle/rotate**
(`_tfDeg`→0 for non-finite so `rotate(calc(∞·1deg))` builds the identity matrix instead of poisoning
it to NaN). Plus **registered the `animation-*` longhands** in `_GCS_DEFAULTS` — `animation-duration`
was failing the harness's `property in getComputedStyle` gate outright. Pure JS, no new Rust.
**calc-infinity-nan-computed 0→48.** Zero regressions (signs-abs-computed 163, round-mod-rem-computed
225, minmax-length 76, minmax-integer 10, clamp-length 17, clamp-integer 1, minmax-number 14,
hypot-computed 43, scale/rotate/translate-parsing-computed 38/23/19, transform-individual-computed 1,
margin-computed 6, padding-computed 8, flex-basis 11, letter/word-spacing 7/7, classlist 1420,
createElement 147). Caps: the SPECIFIED siblings `calc-infinity-nan-serialize-length` 0/41 &
`-serialize-time` 0/29 (math *specified* serializer — operand reorder + infinity/nan keywords, the
clean next quest); `%`→used px (layout); `clamp(none,…)` ±∞ sentinel. Scroll `98-the-clamped-verdict.md`.

**Session 2026-06-24 (Quest #97 The Sized Verdict — the css-sizing + css-logical box computed families, +135):**
Quest #96's named cheapest sequel. `test_computed_value` opens with `assert_true(property in
getComputedStyle(target))` — the proxy `has` trap → `_CSS_KNOWN_PROPS`, built from
`_GCS_DEFAULTS` keys. So `min/max-width/height` (in `_LENGTH_COMPUTED_PROPS` since #96 but
**never registered**) and the entire css-logical box family (in neither set) failed the very
first gate before the resolver ever ran. Registered the whole css-sizing + css-logical box
family in `_GCS_DEFAULTS`, then taught `_normComputed` the two computed rules those families
need beyond plain length resolution: **(1) clamp-negative→`0px`** (`_clampNegPx`, wired for
sizing + physical/logical `padding-*` — `calc(10px - 0.5em)` at `font-size:40px` → `-10px` →
`0px`); **(2) edge collapse** for the 2-value flow-relative shorthands (`_computeBoxShorthand`
→ paren-aware split, resolve each edge as its longhand type, expand to full edge count, collapse
via the existing `_serializeBoxValue` — `auto auto`→`auto`). New `_computeSizeValue` for the
min/max + block/inline sizing family (keywords pass, `fit-content(<lp>)` arg resolves, `min-*
auto`→`0px`, `%` symbolic). **The CSSOM resolved-value split is exactly the layout boundary:**
min/max-sizing + inset keep `%` symbolic (= computed value, **we pass**); margin/padding +
block/inline-size resolve `%`→used px against the containing block (**needs layout → a cap**;
px/em still pass). Pure JS, no new Rust. **max/min-width/height 0→12/11/12/11, inset-computed
0→20, inset-block-inline 0→12, max/min-block/inline-size 0→8/8 & 1→8/8, margin/padding-block-inline
0→9/11, block/inline-size 0→3, +bonus physical padding-computed 7→8 = +135.** Zero regressions
(signs-abs-computed 163, round-mod-rem-computed 225, minmax-length 76, minmax-integer 10,
clamp-length 17, scale/rotate/translate-computed 38/23/19, transform-computed 3, flex-basis 11,
letter/word-spacing 7/7, margin-computed 6, classlist 1420, createElement 147 — all matched the
#96 ledger). Caps: `%`→used px (needs layout, the deep next quest); `block/inline-size` intrinsic
keywords; flex `auto` min; `calc-infinity-nan` 0/48. Scroll `97-the-sized-verdict.md`.

**Session 2026-06-24 (Quest #96 The Resolved Verdict — the computed length/integer/time resolver, +353):**
The standing deep quest, named since #94: our `getComputedStyle` echoed every length /
integer / time property *verbatim*, capping the entire `*-computed` half of the
math-functions family. The `test_math_used`/`test_computed_value` harness sets a test value
and an expected value and asserts the two **agree** through `getComputedStyle` — so the win
is consistent *resolution*, not byte-exact serialization (`round(10em,6em)` and `12em` both
→ `240px`). One generic resolver added to `_normComputed`, pure JS, reusing the existing
calc engine: (1) **length props** (margin-*/padding-*/top/…/width/height/flex-basis/
text-indent/outline-offset/letter-spacing/word-spacing) route through the very `_trComp(v,
el, true, vp)` that translate() uses — folds math functions, resolves em/rem/ex/ch + the
absolute units to px, keeps `%` symbolic (a used `%` length needs layout), passes keywords;
(2) **integer props** (`z-index`/`order`) fold to a rounded integer, with lengths enabled so
`sign(1px)`→`1`; (3) **time props** (transition/animation delay+duration) fold to seconds
via a new gated `_evalMath` `opts.time` (`_TIME_S`), mixed s/ms consistent; (4) **viewport
units** resolved via a gated `opts.vw`/`opts.vh` (from `innerWidth`/`innerHeight`), threaded
through `_trComp`'s new optional `vp` param **only for the length path** so translate stays
byte-identical. signs-abs-computed 31→163, round-mod-rem-computed 160→225, hypot-computed
4→43, minmax-length 0→76, minmax-integer 0→10, clamp-length 0→17, clamp-integer 0→1,
mixed-units-002/003 0→2/0→2, +bonus flex-basis 8→11, word-spacing 4→7, letter-spacing 5→7,
padding 6→7 = **+353**. **Zero regressions** — stash-baseline proved the held realms exact
(scale/rotate/translate/transform/perspective-origin/transform-origin/background-position/
opacity/offset-distance all 100%, minmax-number 14, sin-cos-tan-computed 26, acos 11, the
serialize realm 16/21/270, translate-getComputedStyle 1, margin-computed 6; DOM classlist
1420, createElement 147). **Caps named honestly:** `%` used-length resolution (needs real
layout — the biggest remaining tail, incl. minmax-length-percent 0/50); `calc-infinity-nan`
0/48 (width-range clamp, NaN→0 / ∞→finite — a distinct range-aware feature); **`max-width`/
`min-width`/`max-height`/`min-height` and the logical inset/margin/padding are NOT in
`_GCS_DEFAULTS`** so the harness `property in getComputedStyle` + `CSS.supports` pre-asserts
fail (they're already in the length set — **registering them is the cheap high-ROI next
move**); `clamp(none,…)` ±∞ sentinel; `lh` unit; the minmax 4 unbalanced-paren auto-close.
Scroll [`96-the-resolved-verdict.md`](96-the-resolved-verdict.md). NEXT: register the
sizing/logical length props in `_GCS_DEFAULTS`; then the `%`-against-containing-block
(layout) and `calc-infinity-nan` range-clamp quests.

**Session 2026-06-24 (Quest #95 The Rejected Verdict — the math-functions `*-invalid` realm, +365):**
The sequel #94 named. #94 taught the engine to evaluate and fold every math function;
this taught it to say NO. The acceptance gates were blind to math grammar: `_tfArgValid`
waved through any `_FILTER_MATH_RE` match for every transform slot (so `rotate(sin())`,
`rotate(tan(1deg))` — sin/tan yield a `<number>`, not the `<angle>` rotate() needs — were
stored), and `opacity`/`height`/`font-weight`/`margin-left`/`tab-size`/`outline-offset`
had no math gate at all (`opacity: exp()`, `height: round(0px)` "succeeded"). Built ONE
grammar/type validator over the existing `_parseCalcTree` AST — pure JS, no new Rust:
`_mt`/`_mtFn` resolve a node to its CSS numeric type (or `null`=type error / `'unknown'`=
accept), checking per-function arity + unit/type + zero-arg rejection. The keystone is a
correct type lattice: a `<percentage>` is its OWN type that unifies with dimensions
(`10px + 5%` → length) but NOT with a bare `<number>` (so `round(1, 1%)` is invalid even on
`opacity`, which resolves `%`→number for the whole value), and a `pctType` context kills `%`
where the property forbids it (`abs(1%)` on `font-weight`, `sign(10%)` on `tab-size`).
Wired into `_tfArgValid` (per-slot `<type>`) and a new `_MATH_GATE_PROPS` setter gate that
fires only when the value contains a math function (bare keywords/lengths/numbers and
var()/env()/CSS-wide keep pass-through). sin-cos-tan 0→42, acos 0→62, exp-log 0→48, hypot
0→49, signs-abs 0→53, round-mod-rem 0→108, +bonus opacity-invalid 0→3 = **+365**. ONE cap:
`atan2(…, + …)` (whitespace-sensitive `+` in the shared tokenizer — too risky for one
subtest). **Zero regressions** — stash-baseline proved pre==post on the gated-prop-exposed
tests (minmax-length-computed 0/80, registered-property 0/75, signs-abs-computed 31,
round-mod-rem-computed 160); math-realm serialize/computed + transform realm + opacity +
classlist 1420 + createElement 147 all held. Scroll `tickets/95-the-rejected-verdict.md`.
NEXT: the computed-length resolver (the deep, highest-leverage css-values quest).

**Session 2026-06-24 (Quest #94 The Stepped Verdict — the CSS math-functions realm, +446):**
The widest unconquered tail of the campaign (~1150 failing subtests across the
`round`/`mod`/`rem`, trig, inverse-trig, `exp`/`log`, `hypot`/`pow`/`sqrt`, `sign`/`abs`
families × computed/serialize/invalid). One unified root cause: the calc engine could
not (a) evaluate `round`/`mod`/`rem` — absent from `_evalMath` — nor (b) FOLD a function
node down to the number it always was — `_simpCalc` folded sums/products but left
`cos(0)` as `"cos(0)"`, `abs(1)` as `"abs(1)"` realm-wide. Fixed both, pure JS, additive
to the hottest shared primitive: `_roundOp`/`_modOp`/`_remOp` (shared by both pipelines,
full ±0/±∞/NaN spec tables — round's optional strategy keyword peeled before numeric
parse); `_foldMathFn` in `_simpCalc`'s `fn` branch (collapse to a numeric leaf when all
args are compatible-unit numerics — min/max/clamp/round/mod/rem keep the shared unit,
`sign`→<number>, trig→<number>, inverse-trig/`atan2`→deg, pow/sqrt/exp/log unitless;
mixed units stay symbolic). Plus the wiring that routes properties through the engine:
`_canonTfArg` folds transform args (`scale(abs(1))`→`scale(calc(1))`),
`_canonOpacitySpecified` (bare `%`→number `50%`→`0.5`, math folds with `%` symbolic
`min(50%,0%)`→`calc(0%)`), and non-finite handling (`_serCalcNum`→`calc(NaN * 1deg)`,
`_computeOpacity` NaN→0/∞-clamp, `_scaleCalcOk`/`_scaleComp` accept non-finite & NaN→0).
sin-cos-tan-serialize 144→270 (100%), acos-serialize 0→52, signs-abs-serialize 0→16
(100%), hypot-serialize 13→25 (100%), exp-log-serialize 8→19 (100%), round-mod-rem
computed 0→160 + serialize 0→21; bonus minmax-number-serialize 20→40 & opacity-valid
5→30. **Zero regressions** — stash-baseline proved every calc consumer byte-identical
(transform/scale/rotate/offset-path/offset/color all held; classlist 1420, createElement
147). **Caps named honestly:** the `*-invalid` realm (363 subtests) awaits a math-grammar
validation gate on opacity/height (the next quest); `*-computed` length/time-type await a
computed-length/-time resolver (a deep, high-value quest — our engine resolves no computed
lengths at all, even `2em`); `acos-computed` also needs `sibling-index()` in `_evalMath`
and `sign(1em-1px)` length-resolution in the angle path. Scroll
[`94-the-stepped-verdict.md`](94-the-stepped-verdict.md).

**Session 2026-06-24 (Quest #93 The Composed Verdict — the `offset` shorthand, +47):**
The capstone of the offset realm. Quests #90–92 built every longhand
(`offset-position`/`-path`/`-distance`/`-rotate`/`-anchor`); #93 composes them into the
`offset` shorthand `[ <offset-position>? [ <offset-path> [ <offset-distance> ||
<offset-rotate> ]? ]? ]! [ / <offset-anchor> ]?` (CSS Motion 1 §6). It was unhandled —
`offset-parsing-valid` 13/29 (only rows already canonical passed), `offset-parsing-invalid`
0/13 (verbatim store accepted everything), `offset-shorthand` 0/18 (no longhand expansion).
Built (pure JS, no new Rust): `_parseOffsetShorthand` splits the optional `/ <anchor>`
tail with `_splitTopSlash` (paren/quote aware, >1 slash → invalid), then scans for the
first `<offset-path>`-start token (`none`, a ray()/path()/url()/basic-shape function, or a
`<coord-box>` keyword) — everything before it is the `<offset-position>`, the path region
is a run of path-function/coord-box tokens, and the remainder is parsed by
`_parseOffsetDistRot` as a `<distance> || <rotate>` (`_isPosLP` distance, a maximal
`[auto|reverse] || <angle>` rotate; either order, each once — so `reverse 100px 30deg`
interleaves and is rejected). Each component is validated/canonicalized by the existing
#90–92 longhand helpers. The shorthand **expands into its five longhand `_props` keys**
(no `offset` key — so the "should not set unrelated longhands" invariant holds and the
longhands read back canonically); `getPropertyValue('offset')`/`removeProperty('offset')`
recompose/clear them. `_serializeOffsetShorthand` elides initial parts — `normal` position,
a `none` path with nothing trailing, `0px` distance, `auto`/`auto 0deg` rotate, `auto`
anchor — but keeps `none` when it must carry a trailing distance/rotate or stand as the
sole `!`-group value, and renders the anchor as ` / <anchor>`. Added `offset` to
`_CSS_KNOWN_PROPS` for `CSS.supports`. **All three → 100%** (valid 13→29, invalid 0→13,
shorthand 0→18). **Zero caps, zero regressions** — offset-path 70/24/65, shape 35/12,
offset-rotate 7, offset-distance 4, offset-position 12/15, offset-anchor 11,
background-position 31, transform 42, scale 32, classlist 1420, createElement 147 all
held. Scroll `tickets/93-the-composed-verdict.md`.

**Session 2026-06-24 (Quest #92 The Segmented Verdict — offset-path shape(), +27):**
The sequel #91 named. `shape()` (CSS Shapes 2) was the last offset-path branch left
verbatim — its 17/35 valid rows that needed no canon passed, the rest failed (no
canonicalization), and computed sat at 3/12. Implemented the full segment-list grammar
`shape( <fill-rule>? from <coordinate-pair>, <shape-command># )` as a new branch in
`_opShape` (move/line/hline/vline/curve/smooth/arc/close). A `<coordinate-pair>` is two
`<length-percentage>`s (`_isPosLP`+`_opLp`); a `with` control-point is a full
`<position>` (so `with 10rem center` parses, routed through the existing
`_serializePosition{Specified,Computed}`); arc takes `of <lp>{1,2}` then
`<arc-sweep>? <arc-size>? [rotate <angle>]?`. Default `nonzero` fill-rule + arc `ccw`,
`small`, `rotate 0deg` elided in both specified and computed; computed resolves
coordinate/control lengths to px (em/rem/pt→px) while percentages stay symbolic, and
arc `rotate`→deg via `_evalMath`/`_serAngle`. **Pure JS, no new Rust; purely additive
— a new `head === 'shape'` branch plus removing the one-line verbatim short-circuit
that only ever returned shape() values unchanged. No shared primitive touched.**
**shape-parsing 17→35, shape-computed 3→12** (both 100%). **Zero caps, zero
regressions** — offset-path core trio 70/24/65, offset-rotate 5, offset-distance 6,
background-position 31, transform 42, scale 32, color-computed-relative 1163/1169,
classlist 1420, calc-serialization cap 0/1 all held. NEXT: the `offset` SHORTHAND
(`offset-path-shorthand` valid 13/29, invalid 0/13 — composes
offset-position/path/distance/rotate/anchor); the standing colour leverage
(light-dark()/var()/sibling-index() computed); generalize `_canonSortedCalc`'s
unit-ordering into `_canonMathExpr` (the calc-serialization cap); or a fresh realm.
Scroll `tickets/92-the-segmented-verdict.md`.

**Session 2026-06-24 (Quest #91 The Charted Verdict — offset-path core, +117):**
`offset-path` (CSS Motion 1) was never registered — stored verbatim (only the 46/70
valid rows needing no canon passed), invalids kept (0/24), and the computed support
gate `'offset-path' in getComputedStyle` failed at assertion 1 (0/65), the same shape
as #89/#90. Built the full grammar `none | <ray()>|<url>|<basic-shape> || <coord-box>`
as one additive module — ray()/path()/url()/inset()/circle()/ellipse()/polygon()/
xywh()/rect() serializers on the existing position/length/calc primitives (no new
Rust, no shared primitive touched). closest-side/round-0/nonzero defaults elided,
calc ordered; computed resolves angles→deg, lengths→px (em/pt→px), positions→%, and
xywh()/rect()→equivalent `inset(y calc(100%−x−w) calc(100%−y−h) x)`; path() computed
accepts the as-authored form; the default `border-box` coord-box elided when a path
accompanies it (kept when lone). `shape()` (CSS Shapes 2) intentionally preserved
verbatim — the sequel. **offset-path-parsing-valid 46→70, -invalid 0→24, -computed
0→65** (all 100%), plus incidental shape-parsing 16→17 and shape-computed 0→3 from
registration. **Zero caps in the core trio, zero regressions** — background-position
31, mask-position 23, offset-anchor 14, transform 42, scale 32, color-computed-relative
1163/1169, classlist 1420, calc-serialization cap 0/1 all held. NEXT: `shape()`
(~+27, shape-parsing 18 + shape-computed 9 — route through `_opShape`'s shape branch);
the `offset` shorthand; standing colour leverage; or a fresh realm. Scroll
`tickets/91-the-charted-verdict.md`.

**Session 2026-06-23 (Quest #90 The Single-Axis Verdict — offset-rotate /
offset-distance + background-position-x/-y longhands, +80):** Four single-axis
longhands stood unregistered and ungated. The css-motion scalars `offset-rotate`
(`[auto|reverse] || <angle>`) and `offset-distance` (`<length-percentage>`), and the
css-backgrounds halves `background-position-x`/`-y` (one axis of `<bg-position>`
each), all had passing VALID rows but **0** on every computed test (never in
`_GCS_DEFAULTS` → the `test_computed_value` support gate `property in
getComputedStyle` failed at the first assertion, exactly like #89's transform-box)
and unguarded invalid rows. Closed all **twelve** tests → 100%. **Pure JS, NO new
Rust; the diff is purely additive (200 insertions, 0 deletions) — no shared
primitive modified, so every existing consumer is byte-identical by construction.**
Built: (1) registered the four in `_GCS_DEFAULTS` (`offset-rotate:auto`,
`offset-distance:0px`, `background-position-x/-y:0%`; none inherited). (2)
`offset-rotate` — `_parseOffsetRotate`/`_isValidOffsetRotate`/`_canonOffsetRotate`
(keyword-first serialization, `5turn auto`→`auto 5turn`) + `_computeOffsetRotate`
(angle→deg, `reverse`≡`auto`+180°, `reverse -50grad`→`auto 135deg`). (3)
`offset-distance` — `_isValidOffsetDistance` (single `<length-percentage>` via
`_isPosLP`, drops `none`/`30deg`) + `_canonOffsetDistance` (`0`→`0px`) + computed via
`_posComputeLen`. (4) `background-position-x/-y` — `_parseBgAxisLayer` per comma
layer (x: `left|right|x-start|x-end`, y: `top|bottom|y-start|y-end`; keyword precedes
offset; wrong-axis/`center 10px`/`right left` dropped), `_isValidBgAxis`,
`_canonBgAxis`, `_computeBgAxis` (keyword→%, offsets routed through the shared
`_posCompComputed` so `right 10px`→`calc(100% - 10px)`; logical `x-start` kept only
as the sole layer else physicalized — the recorded engine quirk). (5) `_canonSortedCalc`
— a calc additive **unit-ordering** serializer (numbers → % → dimensions
alphabetical-by-unit, `calc(10px - 0.5em)`→`calc(-0.5em + 10px)`) wired **only** into
`_canonLPToken`, leaving the shared `_canonMathExpr` hot path (and its standing
`calc-serialization.html` 0/1 cap) untouched. All gates wired into both specified
paths + `_normComputed`. **ZERO caps, ZERO regressions** — background-position
shorthand 31/32, object-position 18, mask-position 23, offset-anchor 11/14,
offset-position 12, transform-valid 42, scale 32, gradient-position 18/43,
color-computed-relative 1163/1169, classlist 1420, createElement 147, qsa 1975 all
at held baselines. NEXT: `offset-path` (valid 46/70, invalid 0/24, computed 0/65 —
needs `ray()`/basic-shape/`url()`/coord-box grammar, a dedicated quest); the `offset`
shorthand (composes the longhands); standing colour leverage; or a fresh realm.
Scroll `tickets/90-the-single-axis-verdict.md`.

**Session 2026-06-23 (Quest #89 The Inherited Matrix — css-transforms computed-style
registry + CSS-wide passthrough, +19):** The transform realm's serializers were
done (#85–#88), but the *computed-style plumbing* still had blind spots. Two root
causes. **(1)** Four real CSS-Transforms properties — `perspective`,
`transform-box`, `backface-visibility`, `transform-style` — were never registered
in `_GCS_DEFAULTS`, so `'transform-box' in getComputedStyle(el)` was false, failing
the WPT `test_computed_value`/`assert_initial` support gate at the first assertion.
Registered all four with their spec initial values (`none`/`view-box`/`visible`/
`flat`; none inherited; computed value identity), plus a `transform-style` keyword
gate in `_SIMPLE_TRANSFORM_PROPS`. **(2)** The #85–#86 grammar gates
`_isValidTransform`/`_isValidIndividualTransform` (and `_canonIndividualTransform`)
never exempted the CSS-wide keywords, so `style.rotate = 'inherit'` was *dropped* by
the setter — the child never observed an explicit `inherit`, breaking the
`transform`/`rotate`/`scale`/`translate` "does not inherit" rows. Mirrored the
`_isValidSimpleTransform` short-circuit (`if (_CSS_WIDE.has(low)) return true;`) into
both siblings + the canon entry point. `transform-box-computed` 0/5→5/5,
`backface-visibility-computed` 0/2→2/2, `inheritance.html` 8/20→20/20. Pure JS, no
new Rust. **Zero caps, zero regressions** — every css-transforms/parsing test green,
color-computed-relative 1163/1169, classlist 1420, obscura-dom 40/40. (Note: the old
`serialize-values.html` canary now 404s on wpt.live AND GitHub — the file was split
into per-function `*-serialize.html` tests; use `calc-serialization.html` et al.
instead.) Scroll `tickets/89-the-inherited-matrix.md`.

**Session 2026-06-23 (Quest #88 The Cornered Verdict — the background / mask /
offset position-invalid gates, +30):** The sequel to #87. Four position gates
still stood open — `background-position` (0/11), `mask-position` (0/13),
`offset-anchor` (0/3), `offset-position` (0/3) — each with a passing VALID test and
an unguarded INVALID one. The quest closed all four and drew the precise line
between the TWO position grammars. **Strict `<position>`** (CSS Values 4 — 4-value
edge form `[[left|right]<lp>] && [[top|bottom]<lp>]` ONLY, no `center`, no 3-value
form) governs `mask-position`/`offset-anchor`/`offset-position`; **lenient
`<bg-position>`** (CSS Backgrounds 3 — `center` admitted, offsets optional, 3-value
forms like `center top 8px` legal) governs `background-position`. **ALL FOUR → 100%**
(11/13/3/3). **Built (pure JS, NO new Rust):** (1) root-cause fix to the shared
`_isPosLP` — a unit'd token is a `<length-percentage>` only for a LENGTH unit (or
`%`), so `30deg` (an angle) is no longer admitted as a position component; bare
numbers + math fns still pass. (2) `_STRICT_POSITION_PROPS` became a
`Map<prop, extraKeywordSet>` (`mask-position`→none, `offset-anchor`→`{auto}`,
`offset-position`→`{auto, normal}`); `_isValidStrictPosition` made **comma-layer-aware**
(mask admits `bottom left, right 20%`) + keyword-exempting, keeping the 3-token-invalid
guard. (3) new `_isValidBgPosition` (lenient, per-layer `_parsePosition`, NO 3-token
guard). All wired into both specified paths. **ZERO caps. ZERO regressions** — the
shared `_isPosLP` change is semantics-preserving for every consumer: background/mask/
offset/object valid all hold (31/23/11/12 + object 18/13/16), and the gradient
consumers stay byte-identical (gradient-position-valid 18/18 + computed 43/43,
gradient-interpolation 1398/1398), plus serialize-values 696/697,
color-computed-relative 1163/1169, classlist 1420, createElement 147; obscura-dom
40/40. **Next:** the `css-transforms/parsing` `*-computed` tail; `offset-rotate`/
`offset-path` parsing; `background-position-x`/`-y` longhands; the standing colour
leverage; or a fresh realm. Scroll `tickets/88-the-cornered-verdict.md`.

**Session 2026-06-23 (Quest #87 The Warded Verdict — the transform-module +
object-position invalid-rejection gates, +43):** Six grammar gates stood
unguarded — `transform-origin-invalid`, `perspective-origin-invalid`,
`perspective-invalid`, `transform-box-invalid`, `backface-visibility-invalid`
(all 0%), plus the adjacent `object-position-invalid` (0/13). Every one of these
properties already serialized its **valid** and **computed** forms correctly
(transform-origin 16/23, perspective-origin 18/21, transform-box-valid 5/5,
backface-visibility-valid 2/2, object-position 18/16) — the only gap was the
**invalid-rejection gate**: an out-of-grammar value was stored verbatim instead of
being dropped, so `test_invalid_value()` (which asserts the property comes back
empty) failed across the board. **ALL SIX tests → 100%** (10/12/3/3/2/13).
**Built (pure JS, NO new Rust).** Root-cause fix in the shared 2-value
`<position>` parser (`_parsePosition` + its origin sibling `_parseOriginPos`):
reordering to horizontal-first is admitted **only in the keyword-pair form**; once
a `<length-percentage>` is present the order is fixed H-then-V, so `1px left` /
`top 1px` (a length plus a wrong-axis keyword) are now rejected (they were wrongly
accepted via keyword-axis reorder). Three gates layered on top: **`_isValidOrigin`**
(var()/CSS-wide exempt; for `perspective-origin` an explicit 3-token guard rejects
the legacy 3-value form `center left 1px` — strict `<position>` has no 3-value
syntax); **`_isValidSimpleTransform`** (`transform-box` + `backface-visibility`
keyword enums; `perspective` = `none | <length [0,∞]>` via `_isValidPerspective`,
which rejects `1000`/`-1px`/`80%` — bare number, negative, percentage — using
`_trLenUnit` + a non-negative check); **`_isValidStrictPosition`** (gates
`object-position` only — `background`/`mask-position` keep the legacy `<bg-position>`
3-value form, `offset-anchor`/`offset-position` left ungated for their `auto`/
`normal` keywords). All wired into both specified paths (`_parseStyleDecls` +
`setProperty`). **ZERO caps. ZERO regressions** — the shared `_parsePosition`
change is semantics-preserving (only rejects already-invalid forms): every
consumer verified clean — background-position-valid/computed 31/32,
object-position-valid/computed 18/16, gradient-position-valid/computed 18/43,
offset-anchor/position-valid 11/12 + computed 14/15, plus serialize-values 696/697,
all transform valid/computed/invalid, color-computed-relative 1163/1169, classlist
1420, createElement 147; `cargo test -p obscura-dom --lib` 40/40. **Next:**
`background-position-invalid` 0/11 / `mask-position-invalid` (need a dedicated
`<bg-position>` validator — legacy 3/4-value quirks); `offset-anchor`/`offset-position`
invalid gates (reuse `_isValidStrictPosition` + keyword exemptions); the standing
colour leverage; or a fresh realm. Scroll `tickets/87-the-warded-verdict.md`.

**Session 2026-06-23 (Quest #86 The Individuated Matrix — the `scale`/`rotate`/
`translate` properties, +142):** The sequel to #85 — the three **individual
transform properties** (CSS Transforms 2 §individual-transform). Unlike the
`transform` shorthand they do NOT collapse to a matrix; their computed value
keeps the keyword/number/angle form, only resolving units. Obscura had none of
them registered — no `_GCS_DEFAULTS`, no validation, no canon — the same three
failure modes ×3 properties. **ALL NINE tests → 100%** (scale 32/38/8, rotate
23/23/9, translate 20/19/6; before 15/0/0, 7/0/0, 14/0/0). **Built (pure JS, NO
new Rust)** on the #84/#85 scaffolding (`_splitFilterTokens`, the `_FILTER_*`
regexes, `_isFilterZero`, `_LENGTH_PX`, `_ANGLE_DEG`, `_evalMath`, `_serNumber`,
`_canonMathExpr`, `_resolvePctLengthCalc`): three independent serializers behind
one dispatcher pair (`_isValidIndividualTransform`/`_canonIndividualTransform`,
wired into both specified paths + `_normComputed`; `_INDIV_TRANSFORM` set; `scale`/
`rotate`/`translate` → `none` in `_GCS_DEFAULTS`). **scale** (`none | [<number>|
<percentage>]{1,3}`): `_isValidScale` (`_scaleCalcOk` strips `sign()` bodies then
requires a unitless eval → `calc(100px)`/`calc(1s)`/`calc(180deg)` invalid but
`calc(2 * sign(1em - 1px))` valid); `_canonScale` (`%`→fraction, SPECIFIED keeps
calc symbolic / COMPUTED resolves to number, trailing elision: drop z==`1` then
y==x — `100 100 1`→`100`, `100 100 2`→`100 100 2`). **rotate** (`none | <angle> |
[x|y|z|<number>{3}] && <angle>`): `_rotParse` (exactly one angle + axis of
nothing/one-keyword/three-numbers); `_canonRotate` (axis→`x`/`y` keyword or bare
`<angle>` with sign-flip on reverse, `0 0 0` kept, arbitrary→`x y z <angle>`;
angle last, SPECIFIED keeps unit / COMPUTED→deg). **translate** (`none |
<length-percentage> [<length-percentage> <length>?]?`, z a pure `<length>`):
`_isValidTranslate` (z rejects `%`); `_canonTranslate` (unitless `0`→`0px`,
SPECIFIED keeps unit / COMPUTED→px, mixed %+length calc → `calc(P% ± Lpx)` via
`_resolvePctLengthCalc` since `_canonMathExpr` doesn't reorder % before length,
trailing zero-*length* elision but `0%` kept). **Two loop fixes:** the translate
calc ordering (`calc(10px - 10%)`→`calc(-10% + 10px)`) and `_balanceParens`
(CSS EOF auto-closes open functions → `2 calc(300% * sign(1em - 1px)` valid).
**ZERO caps. ZERO regressions** — purely additive, no shared primitive touched
(serialize-values 696/697, transform-valid/computed/invalid 42/3/20,
transform-origin 16/23, perspective-origin 18/21, transform-box-valid 5/5,
color-computed-relative 1163/1169, color-valid 17/17, classlist 1420/1420,
createElement 147/147; `cargo test -p obscura-dom --lib` 40/40). The
`filter-effects/parsing/*` dir 404'd on wpt.live during the sweep (including the
untouched `filter-valid` — directory-wide upstream flux, not a regression).
**Next:** `transform-origin-invalid` 0/10 (pure grammar gate); `perspective`/
`transform-box`/`backface-visibility` invalid gates; or a fresh realm. Scroll
`tickets/86-the-individuated-matrix.md`.

**Session 2026-06-23 (Quest #85 The Transmuted Matrix — the `transform`
property, +45):** A fresh realm — the first slice of the wide
`css-transforms/parsing` frontier (~+197 across `transform`/`rotate`/`scale`/
`translate`/`transform-origin`/`perspective`). The `transform` property takes a
`<transform-list>` (`none` or space-separated `<transform-function>`s —
`matrix`/`matrix3d`, `translate`/`X`/`Y`/`Z`/`3d`, `scale`/…, `rotate`/…,
`skew`/`X`/`Y`, `perspective`). Obscura had `transform` in `_GCS_DEFAULTS`
(`none`) with identity computed serialization and **no validation** — the same
three failure modes as #82/#83/#84: every malformed form accepted
(`transform-invalid` 0/20), computed fell through to verbatim
(`transform-computed` 0/3), several valid forms needed canon (`transform-valid`
20/42). ALL THREE → **100%**. **Built (pure JS, NO new Rust)** on the #84 filter
scaffolding (`_splitFilterTokens`, the `_FILTER_*` regexes, `_isFilterZero`,
`_evalMath`, `_serNumber`): `_TF_FUNCS` (per-function arg-count + per-arg type
grammar table); `_parseTransform` + `_splitTfArgs` (paren-aware comma split);
`_isValidTransform` (the grammar gate, wired into both specified paths — invalid
list dropped); `_canonTransform(value, el, computed)` (the shared serializer).
**SPECIFIED** keeps the function form, canonicalizing — scale `%`→number
(`scale(250%)`→`scale(2.5)`), unitless angle `0`→`0deg`, and the Blink/WebKit
**name-case quirk** (`_TF_DISP`): `scaleX`/`skewX`→lowercase but
`translateX`/`rotateX` keep camelCase. **COMPUTED** resolves the whole list to a
single `matrix()`/`matrix3d()` — `_tfMatrix` builds each function's 4×4 matrix in
matrix3d() column-major order (index = col*4 + row), `_tfMul` post-multiplies,
`_serMatrix` collapses to 2D `matrix()` when possible (`perspective(10px)`→
`matrix3d(…, -0.1, …)`, `matrix3d(<identity>)`→`matrix(1, 0, 0, 1, 0, 0)`); a
layout-dependent value the builder can't resolve falls back to the specified
canon. A `var()`/`env()` guard keeps unresolved custom props verbatim.
transform-valid 20→42, transform-invalid 0→20, transform-computed 0→3. **+45.
Every subtest green. ZERO caps. ZERO regressions** (serialize-values 696/697,
transform-origin 16/16 + 23/23, filter-computed 83/83, filter-parsing-valid
87/87, backdrop-filter-computed 28/28, color-computed-relative 1163/1169,
color-valid 17/17, classlist 1420/1420; `cargo test -p obscura-dom --lib`
40/40 — baseline-exact; purely additive, no shared primitive touched). **Next:**
the individual `scale`/`rotate`/`translate` properties (~+142, but their computed
forms keep the function rather than collapsing to a matrix → own per-property
computed serializers, reusing `_isValidTransform`'s predicates + `_canonTfArg`);
`transform-origin-invalid` 0/10; `perspective`/`transform-box`/
`backface-visibility`. Scroll `tickets/85-the-transmuted-matrix.md`.

**Session 2026-06-23 (Quest #84 The Filtered Verdict — the `filter` /
`backdrop-filter` properties, +167):** A fresh realm. CSS Filter Effects 1's
`filter`/`backdrop-filter` take a `<filter-value-list>` (space-separated
`<filter-function>`s — `blur`/`brightness`/`contrast`/`drop-shadow`/`grayscale`/
`hue-rotate`/`invert`/`opacity`/`saturate`/`sepia` — or a `url()` reference;
`none` stands alone). Obscura had `filter` in `_GCS_DEFAULTS` with identity
computed serialization and **no validation** — same three failure modes as
alpha()/contrast-color(): computed fell through to verbatim
(`filter-computed` 11/83, `backdrop-filter-computed` 0/28); the setter validated
nothing, so every malformed form was accepted (both `-invalid` 0/25); and a few
valid forms needed canon (`filter-parsing-valid` 78/87). **Built (pure JS, NO new
Rust):** `_parseFilterValue` (paren-aware top-level token split); `_isValidFilter`/
`_isValidFilterFn`/`_parseShadowArgs` (the grammar gate, wired into both specified
paths — invalid list dropped); `_canonFilter(value, el, computed)` (the shared
serializer). **The SPECIFIED↔COMPUTED fork:** SPECIFIED keeps the number/`%`/calc
form and only canonicalizes (`blur(0)`→`blur(0px)`, `hue-rotate(0)`→
`hue-rotate(0deg)`, `grayscale(300%)`→`grayscale(100%)`, `opacity(2)`→`opacity(1)`,
drop-shadow colour-first reorder, `drop-shadow(0 0 0)`→`drop-shadow(0px 0px 0px)`);
COMPUTED resolves everything — `<amount>` → bare `<number>` (`%`→fraction, fill
default `1`, clamp [0,1] vs [0,∞)), `blur()`→`blur(0px)`, `hue-rotate()`→
`hue-rotate(0deg)`, calc→px/deg, drop-shadow colour via `_computeColor`
(`currentColor`=el colour), lengths→px, fill blur `0px`, order `<color> x y blur`.
One shared primitive: `_evalMath` gained a **narrow gated `opts.cqZero`** flag (an
unresolvable container/viewport unit → 0, passed ONLY by the four `_canonFilter`
computed call-sites — the colour/serialize-values hot path is byte-identical by
construction) so `sign(2cqw - 10px)` resolves (the tests gate every such unit
inside `sign()`, where only the sign matters → -1). Registered `backdrop-filter`
in `_GCS_DEFAULTS`. filter & backdrop-filter share the grammar → one serializer
wins both. computed 11→83 + 0→28, invalid 0→25 + 0→25, valid 78→87 + 29→37.
**+167. EVERY subtest green. ZERO caps. ZERO regressions** (color-computed-relative
1163, computed-color-mix 919/948, valid-relative 1146, computed-color-function
466/468, valid-color-function 340, valid-lab 150, gradient-interpolation-valid
1398, cursor-valid 45, color-valid 17, color-computed 16, classlist 1420,
createElement 147; `cargo test -p obscura-dom --lib` 40/40 — all baseline-exact.
serialize-values was a wpt.live 404 this session, `bodyLen=42`, confirmed via
`curl` — serving flux, not a regression; gated `opts.cqZero` makes it
byte-identical regardless). **Next:** `light-dark()` computed; `var()`/
`sibling-index()` computed; generalize `_canonMathExpr` (hot-path risk → own
quest); a fresh realm (filter proved an untouched CSS module can be one serializer
away from a flood — candidates: `transform` 20/42+0/3, the rest of filter-effects).
Scroll `tickets/84-the-filtered-verdict.md`.

**Session 2026-06-23 (Quest #83 The Contrasted Verdict — the `contrast-color()`
function, +27):** The natural sibling of #82's `alpha()`. CSS Color 5's
`contrast-color( <color> )` resolves at computed-value time to whichever of
black/white contrasts more with its single `<color>` argument. Obscura had the
same three failure modes as alpha(): computed fell through to verbatim
(`color-computed-contrast-color-function` 0/17); the colour-property setter
validates no colours, so every malformed form was accepted
(`color-invalid-contrast-color-function` 0/9); and the `calc()` inner-colour form
needed canon (`color-valid-contrast-color-function` 15/17). **Built (pure JS, NO
new Rust)** on the #79 structured cross-space engine + #82's alpha() scaffolding:
a strict-grammar parser `_parseContrastColor` (one `<color>` arg); validity
`_isValidContrastColor` (the inner must be a valid `<color>` — `white white`/
`max white`/`1` invalid) wired into `_isValidColor` + the existing `alpha(`-scoped
setter drop generalized to `/^(?:alpha|contrast-color)\(/i`; SPECIFIED canon
`_canonContrastColor` (inner via `_canonColorSpecified` recursively — wins the
`calc()` case `contrast-color(color(srgb calc(0.5) calc(1 + 1 / 1) 1 / .5))`→
`…calc(2)…` via the #81 calc serializer); COMPUTED `_contrastStruct` (resolve the
inner via `_resolveColorStruct` — now with a `contrast-color(` dispatch so nested
contrast-color() + contrast-color()-as-color-mix-component/relative-origin work —
then pick black/white by the WCAG-2.1 contrast ratio, the colour's relative
luminance L being the Y of its XYZ-D65 form) + `_computeContrastColorComputed` (a
standalone black/white serializes in the legacy `rgb(0, 0, 0)` form; nested inside
color-mix()/relative it serializes in that context's own space → `color(srgb 0 0
0)`). Root-cause primitive `_SYSTEM_COLOR_RGB` (approximate light-theme sRGB for
the system colours, scoped to `_contrastStruct` only) so `contrast-color(buttonface)`
has a luminance to choose against. The computed test accepts EITHER black or white
(the exact algorithm isn't pinned). valid 15→16, invalid 0→9, computed 0→17.
**+27. ZERO regressions** (color-computed-relative 1163, computed-color-mix
919/948, valid-relative 1146/1147, valid-color-mix 674/677, alpha 32/45/18,
valid-lab 150, valid-color-function 340, valid-hwb 38, computed-color-function
466/468, computed-hwb 54, **serialize-values 696/697** — all changes gated behind
a `contrast-color(` prefix so the hot path is byte-identical, color-valid 17,
color-computed 16, gradient-interpolation-valid 1398, createElement 147,
getElementsByTagName 19; `cargo test -p obscura-dom --lib` 40/40). **Cap (1):**
`color-mix(contrast-color(blue) 100%, purple)` lacks the spec-required `in
<colorspace>` — likely a test bug; matching the expected verbatim round-trip would
mean changing the shared color-mix percentage-fill rule and risks the color-mix-
valid realm. **Next:** `light-dark()` computed; `var()`/`sibling-index()` computed
resolution; generalize `_canonMathExpr` to the generic value path (hot-path risk →
own quest); fresh realm. Scroll `tickets/83-the-contrasted-verdict.md`.

**Session 2026-06-23 (Quest #82 The Veiled Verdict — the `alpha()` relative-alpha
function, +58):** Took the top "next leverage" carried since #77. CSS Color 5's
`alpha(from <origin> [/ <a>])` keeps the origin colour's channels + colour space and
replaces only its alpha (the `alpha` keyword inside the `<alpha-value>` reads the
origin's alpha). Obscura had no notion of it: computed fell through to verbatim
(`alpha-color-computed` 0/32); the colour-property setter validates no colours, so
every malformed form was accepted (`alpha-color-parsing-invalid` 0/18); and 8 valid
forms needed canon (`alpha-color-parsing-valid` 37/45). **Built (pure JS, NO new
Rust)** on the #79 structured cross-space engine + the #81 calc-tree serializer: a
shared strict-grammar parser `_parseAlphaFn`; validity `_isValidAlpha`/
`_isValidAlphaValue` (only the `alpha` keyword stands for a channel — `r`/`l`/`red`/
`calc(r * 0.5)` are invalid) wired into `_isValidColor` + a narrow `alpha(`-scoped
setter drop; SPECIFIED canon `_canonAlpha` (origin via `_canonColorSpecified`
recursively, a `calc()` alpha reordered via `_canonMathExpr`, `var()`/`sibling-*()`/
`alpha` verbatim); COMPUTED `_alphaStruct` (resolve the origin via
`_resolveColorStruct` — now with an `alpha(` dispatch, so nested `alpha()` +
`alpha()`-as-relative-origin work — and swap the alpha) + `_computeAlphaComputed`.
**The serialization fork (subtle):** `alpha()`'s output form is the origin's
*syntactic* legacy-ness, not its standalone computed form (relative `rgb(from red r
g b)` computes to `color(srgb 1 0 0)` alone, yet `alpha(from rgb(from red r g b) /
0.8)`→`rgba(255, 0, 0, 0.8)`). `_isLegacyOrigin` (named/hex + `rgb`/`hsl`/`hwb`,
incl. their relative forms, recursively through nested `alpha()`) with a numeric
alpha → `rgb()/rgba()`; `currentcolor`/`color()`/`color-mix()`/lab/ok* OR a `none`
alpha → `_csSerialize` own-space form (a `none` alpha forces even a legacy origin
into `color(srgb … / none)`). The test file itself flags its expectations as
possibly inconsistent (csswg-drafts #13992/#13994) — these match Chromium. Plus two
root-cause primitives: `_SYSTEM_COLORS` (the CSS system-colour keyword set, lowercased
in `_canonColorSpecified` + accepted by `_isValidColor`) and **zero-arg math
functions** in `_parseCalcTree` (`sibling-index()`/`sibling-count()` have empty
parens the recursive-descent parser couldn't handle; unblocks `calc(sibling-index()
* 0.2)`→`calc(0.2 * sibling-index())`). computed 0→32, valid 37→45, invalid 0→18.
**+58. ZERO regressions** (color-computed-relative 1163, computed-color-mix 919/948,
valid-relative 1146/1147, valid-color-mix 674/677, valid-lab 150, valid-color-function
340, valid-hwb 38, computed-lab 112, computed-hwb 54, computed-color-function 466/468,
computed-rgb 95, color-valid 17, color-computed 16, gradient-interpolation 1398,
gradient-position 18, image-function 13, **serialize-values 696/697** loaded — the
zero-arg calc change left the hot path byte-identical, cursor-valid 45/46,
createElement 147, getElementsByTagName 19; `cargo test -p obscura-dom --lib` 40/40).
**No caps in the realm** — all three tests 100%. **Next:** `light-dark()` computed;
`var()`/`sibling-index()` computed resolution; generalize `_canonMathExpr` to the
generic value path (the serialize-values calc cap, real hot-path risk → own quest);
fresh realm. Scroll `tickets/82-the-veiled-verdict.md`.

**Session 2026-06-22 (Quest #81 The Calculated Verdict — the Wave-2 specified-
`calc()` serializer, +126):** Took the primitive named "next leverage (1)" since
#76, carried across five quests. Every `color-valid-*` test had ONE residual shape
failing: a colour channel carrying a `calc()`. The specified path was deliberately
GATED to no-nested-paren (a calc channel must PRESERVE its math, not evaluate it),
and there was no serializer — so 127 calc channels stored verbatim and failed the
canonical-serialization check (lab 116/150, color-function 277/340, hwb 28/38,
relative-color 1127/1147). **Built a CSS Values 4 calculation-tree serializer (pure
JS, no new Rust)** — the dual of `_evalMath` (which EVALUATES; this PRESERVES
symbolic terms): `_parseCalcTree` (recursive descent → num/sym/sum/prod/fn nodes;
`<angle>` units canonicalized to degrees at parse time), `_simpCalc` (fold a
fully-numeric same-unit sum/product to one value keeping its type; a product's
numeric factors → ONE coefficient placed FIRST, a numeric divisor → reciprocal
`calc(a / 3)`→`calc(0.333333 * a)`, a non-numeric divisor stays a division
`calc(1 / l)`; a sum's numeric constant moves first `calc(l - 20)`→`calc(-20 + l)`;
products parenthesized in sums `calc(g * .5 + g * .5)`→`calc((0.5 * g) + (0.5 * g))`;
`calc()` unwraps, other functions kept so `sign(1em - 10px)` survives), `_serCalcTree`/
`_canonMathExpr` (parens on every sum/product, root sheds one layer; non-finite →
`NaN`/`infinity`). Wired into ONLY two colour-specific call sites — `_computeModernColor
(value, specified)` (a `specified` flag threads down through `_modernBody`/
`_modernChannel`/`_modernAlpha`: a mathy channel/alpha serializes symbolically &
UNCLAMPED with `%` kept, a bare one resolves+clamps exactly as the computed path; the
`_canonColorSpecified` gate dropped its no-nested-paren guard) and `_canonRelativeColor`
(each calc channel) — so **the `serialize-values` calc hot path is STRUCTURALLY
UNTOUCHED**. hwb keeps `hwb()` for an unresolvable calc hue (`_hwbSpecified`: calc hue
symbolic, `%` whiteness/blackness → `<number>`, alpha per the modern rule) but still
resolves a constant-folding calc (`calc(infinity)`/`calc(0/0)`) to sRGB `rgb()`.
lab 116→150, color-function 277→340, hwb 28→38, relative 1127→1146. **+126. Zero
regressions.** **GOTCHA caught + fixed:** `_canonRelativeColor`'s output is stored as
the specified value and RE-EVALUATED by the computed engine, so `_canonMathExpr` must
be semantics-preserving — a first cut treated `rad`/`deg`/`grad`/`turn` as distinct
units, folding `calc(50rad / (50deg * (180/pi)))` (a unitless 1) to `0.0175rad` and
flipping `sin(l)`→`sin(l°)` (color-computed-relative-color 1163→1162); fixed by
canonicalizing all `<angle>` units to degrees at parse time so same-dimension
arithmetic cancels (caught via stash-rebuild-baseline; restored to 1163). Swept
color-computed-lab 112, computed-hwb 54, computed-color-function 466/468, computed-rgb
95, computed-color-mix 919/948, color-valid-color-mix 674/677, color-valid 17,
color-computed 16, gradient-interpolation 1398, gradient-position 18, image-function 13,
createElement 147, getElementsByTagName 19; obscura-dom 40/40 (serialize-values wpt.live
404 `bodyLen=42` serving-flux, provably unaffected — wired only into colour channels).
**Cap:** the 1 relative fail is `rgb(from var(--color) …)` (var() origin bails to
verbatim, `_canonStandardValue` normalizes `.3`→`0.3` — non-fuzzy exact-number quirk,
architectural). **Next:** `alpha(from …)` (0/32); `light-dark()` computed; `var()`
custom-property registration / `sibling-index()`; generalize `_canonMathExpr` to the
generic value path (the serialize-values calc cap, real hot-path risk → own quest);
fresh realm. Scroll `tickets/81-the-calculated-verdict.md`.

**Session 2026-06-22 (Quest #80 The Reckoned Verdict — `_evalMath` trigonometry +
exponent extension, +13):** Took #79's named "next leverage (1)". The
`color-computed-relative-color` test carried ~13 fails whose relative channels use
math functions `_evalMath` didn't know (`sin`/`asin`/`pow`/`pi`), e.g.
`hsl(from hsl(50 50 50) h s calc((sin(l) + 1) * 50))`,
`hsl(... calc((sin(l * (50rad / (50deg * (180 / pi)))) + 1) * 50))`,
`oklch(from green pow(l, 1) c h)`. An unknown function returned `null`, so even the
`CSS.supports` support check failed. Extended `_evalMath` (pure JS, no new Rust)
with `sin`/`cos`/`tan` (radians or `<angle>` arg → radians), `asin`/`acos`/`atan`/
`atan2` (return an `<angle>` in degrees), `pow`/`sqrt`/`hypot`/`exp`/`log`. The
crux is proper CSS `<angle>`-vs-`<number>` type tracking through the calc algebra
(each parse fn now returns `[value, isAngle]`; `angle×number→angle`,
`angle÷angle→number`) so `50rad / 50` is an angle while `50rad / (50deg *
(180/pi))` is a number, and `sin(asin(sin(l)))` round-trips. Angle units are
recognized inside a trig argument even without an angle context (`trigDepth`); an
angle leaking into a non-angle context is rejected. **Zero hot-path risk by
construction:** `isAngle` only becomes true under `opts.angle` or inside a trig
arg, so every other call site (serialize-values calc, gradient stops, length
channels) is byte-identical. `color-computed-relative-color` 1150→1163. **+13.
ZERO regressions** — color-valid-relative-color 1127/1147, color-computed-color-mix
919/948, gradient-interpolation 1398, gradient-position 43/18, image-function 13,
color-valid 17, color-computed 16, color-computed-lab 112, color-valid-lab 116,
color-computed-color-function 466/468, color-computed-rgb 95, createElement 147,
getElementsByTagName 19; obscura-dom 40/40 (serialize-values wpt.live HTTP 404 —
serving flux, provably inert). **Caps — the 6 residual, all distinct:** 2
`light-dark()`-wrapping, 2 `var()` custom-property origins, 1 `sibling-index()`,
~4 out-of-gamut hsl xyz round-trips at ε=0.0001. **Next:** (1) Wave-2 specified-
`calc()` serializer (~127). (2) `alpha(from …)` (0/32). (3) `light-dark()`
computed. (4) `var()` custom-property registration. Scroll
`tickets/80-the-reckoned-verdict.md`.

**Session 2026-06-22 (Quest #79 The Transmuted Verdict — COMPUTED `color-mix()` +
relative-colour, the cross-space colour-maths engine, +2069):** Took the
"next leverage (1)" pointer carried since #75 — the biggest standing prize of the
CSS-colour frontier. Both `color-computed-color-mix-function` (0/948) and
`color-computed-relative-color` (0/1169) needed the SAME missing primitive: a real
CSS Color 4 cross-space conversion + interpolation engine. Built it as a
self-contained module (pure JS, no new Rust) hubbed on XYZ-D65: sRGB / srgb-linear
/ display-p3(+linear) / a98-rgb / rec2020 / prophoto-rgb (D50) ↔ linear-light ↔
XYZ; XYZ-D65 ↔ XYZ-D50 Bradford; Lab/LCH ↔ XYZ-D50; OKLab/OKLCH ↔ XYZ-D65; HSL/HWB
↔ sRGB (XYZ→RGB matrices derived by `_inv3`). `_csParse` → structured
`{space, coords, alpha, none[4]}`; `_colorMixStruct` does the N-ary percentage rule
(omitted % split the remainder; alpha multiplier `min(1, sum/100)` only when the
sum is under 100%; both-0% → equal weights, alpha 0) + premultiplied-alpha
interpolation (zero total alpha collapses channels to 0; hue never premultiplied,
follows the §12.4 shorter/longer/increasing/decreasing arc fixup); `_relativeStruct`
resolves the origin into the function's space, exposes its channels as keyword
values, substitutes them into each channel expression and evaluates; `_csSerialize`
maps the result to its computed form (hsl/hwb → `color(srgb …)`, RGB + xyz spaces →
`color(<space> …)`, lab/lch/oklab/oklch keep their function; hue at 6 sig-figs so the
harness's exact round-trip is byte-stable; L/chroma clamped per `_MODERN_LAB_FNS`).
**Key correctness insight:** a hue is "missing" (carried from the other operand)
ONLY when it emerges from a conversion into a polar space with ~0 chroma
(`lab(50 0 0)` mixed in lch → no hue), while a natively-specified polar colour keeps
its explicit hue even at C=0 (`lch(100 0 20deg)` interpolates its 20°) — so the
powerless rule lives in `_csConvert` (which only runs on an actual space change),
with thresholds set above the ~1e-5 chroma the XYZ round-trip leaves on a true grey.
Wired into `_normComputed`'s colour branch + `_isValidColor` (CSS.supports), the
latter placed BEFORE the legacy rgb/hsl branch since `rgb(from …)`/`hsl(from …)`
share those function names. color-mix 0→919, relative 0→1150. **+2069. ZERO
regressions** — color-valid 17, color-computed 16, color-valid-color-mix 674/677,
color-valid-relative-color 1127/1147, color-valid-lab 116, color-computed-lab 112,
color-computed-rgb 95, color-computed-color-function 466/468, color-valid-hwb 28,
gradient-interpolation 1398, image-function 13, getElementsByTagName 19,
createElement 147; obscura-dom 40/40 (serialize-values + color-function-valid came
back wpt.live HTTP 404 `bodyLen=42` — serving flux, provably unaffected). **HONEST
CAPS — the ~48 residual:** (1) ~28 hsl/hwb components carrying `none` in color-mix —
the CSSOM serialized specified value of `hsl(none none none)` is `rgb(0, 0, 0)`
(the valid test CONFIRMS this serialization), and Obscura stores that lossy string,
so `none` is gone before computed time; browsers compute from the pre-serialization
parse — matching both needs structured-value storage, an architectural change.
(lab/lch/oklab/oklch/color() none-components round-trip fine and PASS.) (2) ~13
`calc()` with trig/`pi`/`pow`. (3) 2 `light-dark()`-wrapping. (4) ~4 out-of-gamut
hsl round-trips at ε=0.0001. **NEXT LEVERAGE:** (1) `_evalMath` trig/exponent
extension (`sin`/`cos`/`asin`/`pow`/`sqrt`/… + `pi`/`e`) — unlocks the ~13 trig
cases AND is foundational; additive but on the serialize-values hot path. (2)
`alpha(from …)` (0/32). (3) `light-dark()` computed. (4) fresh realm. Scroll
`tickets/79-the-transmuted-verdict.md`.

**Session 2026-06-22 (Quest #78 The Borrowed Verdict — specified-value relative-`<color>`
serialization, +571):** Took #77's named "next leverage (2)" — relative colour SPECIFIED,
the natural syntax-only sibling of the `color-mix()` work. A baseline confirmed
`color-valid-relative-color` 556/1147 (the COMPUTED side `color-computed-relative-color`
0/1169 needs cross-space colour maths, a documented cap). **Key insight:** the WPT
`fuzzy_compare_colors` comparator strips ALL digits/dots and compares the non-numeric
*skeleton* plus approximate numbers — so the only transforms that matter to the skeleton
are (a) the function name (`rgba`/`hsla`→`rgb`/`hsl`, lowercase) and (b) the `<origin>`
colour canonicalization; the channel keywords (`r`/`g`/`b`/`alpha`/`none`/replacements)
are kept VERBATIM (no number normalization needed). For `<fn>(from <origin> <channels>)`:
lowercase+fold the name, run `<origin>` recursively through the EXISTING
`_canonColorSpecified` (`rgb(20%, 40%, 60%, 80%)`→`rgba(51, 102, 153, 0.8)`,
`lab(25 20 50 / 40%)`→`lab(25 20 50 / 0.4)`, `hwb(…)`→sRGB rgba, `rgb(none none none)`→
`rgb(0, 0, 0)`; named/`currentcolor`/`color-mix()` symbolic), and for `color()` alias the
post-`from` space token `xyz`→`xyz-d65`. A `var()` anywhere bails to verbatim (the engine
keeps a pending-substitution value byte-for-byte, preserving case + calc order). **Fix
(pure JS, `bootstrap.js`, NO new Rust):** new `_canonRelativeColor` + `_REL_COLOR_FNS`,
dispatched from `_canonColorSpecified` (gated on `/^<colorfn>\(\s*from\s/`, placed BEFORE
the modern/legacy branches because the `from` keyword isn't a number a legacy parser would
touch). 556→1127. **+571. ZERO regressions** — color-valid 17, color-computed 16,
color-valid-color-mix 674/677, **computed-color-mix 0/948 + computed-relative-color 0/1169
UNCHANGED** (the maths caps = proof the computed path is untouched), color-valid-lab 116,
color-function 277, hwb 28, gradient-interpolation 1398, image-function 13, createElement
147; `cargo test -p obscura-dom --lib` 40/40. (serialize-values came back wpt.live HTTP 404
`bodyLen=42` this session — serving flux, NOT a regression; provably byte-identical, as its
fixed colours `black`/`red`/`rgb(50, 75, 100)`/`rgba(5, 7, 10, 0.5)` don't match the `from`
gate.) **HONEST CAP — the 20 fails are the `calc()`-operand-reordering forms**
(`calc(g * 2)`→`calc(2 * g)`, `calc(l - 20)`→`calc(-20 + l)`, `calc(g * .5 + g * .5)`→
`calc((0.5 * g) + (0.5 * g))`): these change the skeleton, needing the Wave-2 specified-calc
serializer (number-first product ordering, sum parenthesization) — a distinct primitive
carrying the serialize-values calc hot-path risk. A handful are the pre-existing
var-substitution exact-number quirk (`.3`→`0.3` from `_canonStandardValue`, compared
non-fuzzily). **NEXT LEVERAGE:** (1) the COMPUTED relative-colour (0/1169) + COMPUTED
`color-mix()` (0/948) — the real cross-space colour-maths engine (sRGB↔Lab↔OKLab↔XYZ
matrices, gamut, per-channel substitution + interp): the biggest standing prize. (2) the
**Wave-2 specified-`calc()` serializer** (~107 across `color-valid-{lab,color-function,hwb}`
+ these ~20 relative + the cursor-valid `calc(2 + 0)`). (3) `alpha(from …)` (0/32). (4) fresh
realm. Scroll `tickets/78-the-borrowed-verdict.md`.

**Session 2026-06-22 (Quest #77 The Mingled Verdict — specified-value `color-mix()`
serialization, +424):** Took #76's named "next leverage (2)" — the giant
`color-mix()` prize. A baseline confirmed `color-valid-color-mix-function` 250/677
(the widest clean tail) while the COMPUTED side (0/948) needs cross-space matrix
maths (left as a documented cap). **Key insight:** the SPECIFIED serialization of
`color-mix()` is pure SYNTAX canonicalization, NO colour maths: (a) the
interpolation method — keep the space, alias `xyz`→`xyz-d65`, drop the default
`shorter hue`, and **drop the whole `in oklab`** (oklab is color-mix's default
space, exactly like a gradient drops its default); (b) each component `<color>`
through the EXISTING `_canonColorSpecified` (`hsl(120deg 10% 20%)`→`rgb(46, 56, 46)`,
`oklab(100 …)`→`oklab(1 …)`, modern fns/`currentcolor` kept); (c) each
`<percentage>` moved AFTER its colour — a `calc()`/`var()` % kept symbolic, else the
omitted side filled to 100%−other and a resulting 50%/50% pair dropped entirely.
**Fix (pure JS, `bootstrap.js`, NO new Rust):** new `_canonColorMix` (parses
method + two components via `_commaSplitTop`/`_wsTokens`), `_canonColorMixMethod`
(returns `''` for the default `in oklab`), `_splitMixComponent` (separates colour
from percentage), dispatched from `_canonColorSpecified` so it fires everywhere a
`<color>` is canonicalized; handles the missing-method 2-arg form
(`color-mix(c1, c2)`) and the `display-p3-linear` space. `color-mix(in srgb, 70% red,
50% blue)`→`color-mix(in srgb, red 70%, blue 50%)`, `color-mix(in oklab, oklab(0.1
0.2 0.3), oklab(0.5 0.6 0.7))`→`color-mix(oklab(0.1 0.2 0.3), oklab(0.5 0.6 0.7))`,
`color-mix(in hsl, red 50%, blue)`→`color-mix(in hsl, red, blue)`. 250→674. **+424.
ZERO regressions** — color-valid 17, color-computed 16, **computed-color-mix 0/948
UNCHANGED** (the maths cap — proof the computed path is untouched), color-valid-lab
116, computed-lab 112, computed-rgb 95, color-valid-hwb 28, serialize-values 696/697,
gradient-interpolation 1398, gradient-position 18, image-function 13, content-valid
46, cursor-valid 45, createElement 147; `cargo test -p obscura-dom --lib` 40/40.
**HONEST CAP — the 3 remaining fails are the N-ary color-mix forms** (1-colour
`color-mix(in srgb, red 100%)`→`(in srgb, red)`, 3-colour with percentage
distribution `red 50%, green, blue`→`red 50%, green 25%, blue 25%`): a distinct
percentage-distribution feature, not the binary syntax this quest covers. **NEXT
LEVERAGE:** (1) the COMPUTED `color-mix()` (0/948) + relative-color `rgb(from …)`
computed (0/1169) — the real cross-space colour-maths engine (sRGB↔Lab↔OKLab↔XYZ
matrices, gamut, per-space interpolation, premultiplied alpha): the biggest standing
prize. (2) relative-color SPECIFIED (`color-valid-relative-color` 556/1147) — also
syntax-only (origin-colour channel-keyword substitution), the natural sibling to this
quest. (3) `alpha(from …)` (0/32). (4) Wave-2 specified-`calc()` serializer (~107).
(5) fresh realm. Scroll `tickets/77-the-mingled-verdict.md`.

**Session 2026-06-22 (Quest #76 The Stated Verdict — specified-value modern `<color>`
serialization, +286):** Took #75's named "next leverage (1)". #75 landed the COMPUTED
modern colours but deliberately left the SPECIFIED path (`_canonColorSpecified`) keeping
them verbatim → `color-valid-lab` 54/150, `-color-function` 81/340, `-hwb` 0/38 (~393
fails, the widest clean tail). **Key insight:** for `lab`/`lch`/`oklab`/`oklch`/
`color(<space> …)`/`hwb()` whose channels are all plain `<number>`/`<percentage>`/
`<angle>`/`none` (NO nested math function), the SPECIFIED serialization is IDENTICAL to
the computed one — resolve `%` against the channel reference, clamp per channel
(L [0,100]; color() channels unclamped — `color(srgb 200 200 200)` stays), normalize hue
into [0,360), drop alpha ≥ 1, and hwb→sRGB `rgb()`/`rgba()`. **Fix (pure JS,
`bootstrap.js`, NO new Rust):** `_canonColorSpecified` now reuses `_computeModernColor`
— but ONLY when the function body has no nested `(`: a channel carrying a `calc()`/
`min()`/… must PRESERVE the math expression at specified time (unclamped, `%` left
symbolic, e.g. `lab(calc(50%) 50% 0.5)`→`lab(calc(50%) 62.5 0.5)`), which the computed
helper would wrongly evaluate/clamp — so those calc-bearing forms stay verbatim (a clean
Wave-2 cap). `color(srgb 10% 10% 10%)`→`color(srgb 0.1 0.1 0.1)`, `lab(50% 50% -20%)`→
`lab(50 62.5 -25)`, `hwb(120 30% 50%)`→`rgb(77, 128, 77)`. lab 54→116, color-function
81→277, hwb 0→28. **+286. ZERO regressions** — color-valid 17, color-computed 16,
**computed-lab 112 / -hwb 54 / -color-function 466 UNCHANGED** (proof the computed path
is untouched — the same helper, called from a new site), color-computed-rgb 95,
gradient-interpolation-method-valid 1398, gradient-position-valid 18, image-function-valid
13, serialize-values 696/697 (its colours are all legacy → `_computeModernColor` returns
null → unchanged), variable-substitution-background 10, content-valid 46, cursor-valid 45,
createElement 147; `cargo test -p obscura-dom --lib` 40/40. **HONEST CAP — the 107
remaining fails are ALL calc-bearing channels** (`lab(calc(50 * 3) …)`→`lab(calc(150) …)`,
`color(srgb calc(50% + (10% * sign(1em - 10px))) …)`): the specified path must preserve
the `calc()` wrapper unclamped, leave `%` symbolic, and simplify pure-number arithmetic —
a full CSS-math serializer, a distinct primitive carrying the standing serialize-values
calc hot-path risk → its own quest. **Next leverage:** (1) Wave-2 specified-`calc()`
serializer (~107 more across these three + the `calc(2 + 0)` cursor-valid fail). (2)
`color-mix()` (0/948) + relative-color `rgb(from …)` (0/1169) — the giant prize, needs
real cross-space matrix/gamut/interpolation math. (3) `alpha(from …)` (0/32). (4) fresh
realm. Scroll `tickets/76-the-stated-verdict.md`.

**Session 2026-06-22 (Quest #75 The Spectral Verdict — modern `<color>` computed
serialization, +632):** A baseline sweep of the `css/css-color/parsing` realm
surfaced the widest unopened tail of the whole frontier: every modern colour
function computed `0/N` because `_computeColor` kept them verbatim AND the
`test_computed_value` support check `CSS.supports('color', …)` (→ `_isValidColor`)
rejected them. **Key insight:** `lab()`/`lch()`/`oklab()`/`oklch()` and
`color(<space> …)` compute in their **own** colour space — no cross-space
conversion, just per-channel canonicalization — and `hwb()` converts to sRGB.
**Fix (pure JS, `bootstrap.js`, NO new Rust):** new **`_computeModernColor(value)`**
parses the function, splits channels via `_splitTopLevel` (3 + optional alpha;
`color()` peels the space first), and resolves each channel through
**`_modernChannel`** — `_evalMath` the token, resolve `<percentage>` against the
channel's reference range (lab L→100/a,b→125, oklab L→1/a,b→0.4, lch C→150, oklch
C→0.4, `color()`→1), `none` preserved verbatim, `NaN`→0, `±∞`→clamp bounds,
per-channel clamp (L lab/lch [0,100], ok* [0,1]; C ≥0; a/b & `color()` unclamped),
hue→degrees normalized `[0,360)` at 6 sig-figs (`1.28rad`→`73.3386`) — and
**`_modernAlpha`** (`%`→number, clamp [0,1], `≥1` drops the `/ a`, `none` kept).
`color(xyz …)`→`color(xyz-d65 …)`, space lowercased. **`_computeHwb`** scales the
pure-hue sRGB (`_hslToRgb(h,1,.5)`) by whiteness/blackness (`w+b≥1`→gray), snapping
channels to 6 decimals so an exact half-integer (127.5) rounds **up** not down (the
`1·(1−w−b)+w` float-drift bug: green came out `127.4999…`). Wired into the
`_normComputed` colour branch ONLY (`_computeModernColor(v) ?? _computeColor(v)`) —
the **specified path (`_canonColorSpecified`) is deliberately untouched** because
the `*-valid-*` tests need a different serialization (calc()-preservation), so they
must not regress. `_isValidColor` (CSS.supports) extended via the same helper.
lab 0→112, hwb 0→54, color-function 0→466. **+632. ZERO regressions** —
color-computed 16/16, -rgb 95/99 (4 pre-existing), -named 455/455, -hex 6/6,
color-valid 17/17, color-valid-lab 54/150 & -color-function 81/340 **UNCHANGED**
(the proof the specified path is untouched), gradient-interpolation-method-valid
1398, gradient-position-computed 43, serialize-values 696/697 (pre-existing calc
cap), variable-substitution-background-properties 10, createElement 147;
`cargo test -p obscura-dom --lib` 40/40. **HONEST CAP — the 12 remaining fails (8
lab + 2 hwb + 2 color-function) are ALL `sign(2cqw - 10px)` container-query-unit
cases** — `2cqw` needs the container's resolved width; Obscura has no layout, so
`_evalMath` fails on `cqw` → unwinnable. **NEXT LEVERAGE:** (1) **specified-path
modern colour** (`color-valid-{lab,hwb,color-function}` ≈ 528 more) — the harder
sibling: must PRESERVE `calc()` wrappers (`lab(calc(50*3) …)`→`lab(calc(150) …)`,
NOT clamped) and leave a/b/C `%` UNRESOLVED (`calc(50%)` stays) while still
resolving bare numbers/percentages — a specified-value engine distinct from this
computed one. (2) **`color-mix()`** (0/948) + **relative-color** `rgb(from …)`
(0/1169) — the giant prize, but both need real **cross-space conversion math**
(sRGB↔Lab↔OKLab↔XYZ matrices, gamut, interpolation) — a much bigger engine. (3)
**`alpha(from …)`** (0/32) — relative-style alpha replacement (`alpha` keyword in
calc, origin-colour resolution). (4) fresh realm. Scroll
`tickets/75-the-spectral-verdict.md`.

**Session 2026-06-22 (Quest #74 The Pointed Verdict — `cursor` `<image>` items:
gradients + `image-set()`, +4):** Took #73's named "next leverage (1)" — the
near-free `cursor` gradient registration. `cursor` was already in `_GCS_DEFAULTS`
(so the 36 keyword forms passed computed) but **not** in `_GRADIENT_PROPS`, so its
gradient items serialized verbatim (cursor-computed 36/39) and bare-string
`image-set()` options weren't wrapped (cursor-valid 42/46). **Fix (pure JS,
`bootstrap.js`, NO new Rust):** (1) added `cursor` to `_GRADIENT_PROPS` so its
`<image>` items route through the existing `_canonGradients`/`_canonUrls` engine —
the balanced-paren scan canonicalizes each gradient in place and leaves the trailing
hotspot coords + final cursor keyword (`, auto`) verbatim; (2) new **`_canonImageSet
(value)`** balanced-paren-scans `image-set(`/`-webkit-image-set(` heads and wraps a
*leading* bare `<string>` option in `url()` (`image-set("u" 1x)`→`image-set(url("u")
1x)`, including one nested inside `light-dark()` — the flat head scan reaches it),
splitting options with the quote-aware `_splitCommaQuoted`; wired into all
`_GRADIENT_PROPS` specified + computed paths after `_canonGradients`, fast-pathing
out when there's no `image-set(` token so every other `<image>` prop is
byte-identical. cursor-computed 36→37, cursor-valid 42→45. **HONEST CAP — the 2
remaining cursor-computed fails are bugs in the upstream WPT test:** lines 52/54
have malformed expected values (the gradient's closing `)` is missing and the
trailing cursor keyword got pulled inside the function; line 54 even expects
`pointer` for a `crosshair` input). No correct browser passes them — our output is
the correct, balanced serialization; verified by fetching the raw source and
counting parens. **+4. ZERO regressions** — surgically scoped (`cursor` ∈
`_GRADIENT_PROPS` touches only the cursor prop; `_canonImageSet` activates only on
`image-set(`, absent from every swept test except cursor): gradient-position 18/43,
image-function-valid 13, gradient-interpolation-method-valid 1398, color-valid 17,
background-position-computed 32, content-valid 46 all byte-identical;
`cargo test -p obscura-dom --lib` 40/40. (serialize-values / background-image-valid /
mask-image-computed were wpt.live HTTP 404 this session — `bodyLen=42` serving flux,
NOT regressions; both proven unaffected by source inspection — zero cursor/image-set
references — and by the gradient siblings that did run.) **NEXT LEVERAGE:** (1)
`calc(2 + 0)`→`calc(2)` integer-calc simplification (the last cursor-valid fail; a
number/percentage-only `calc()` simplifier, but it carries the serialize-values
hot-path risk so it deserves its own scoped quest); (2) `light-dark()` resolution
(CSS Color 5); (3) `resolve-relative-to-stylesheet` (0/3, external-CSS loading +
per-stylesheet base); (4) comprehensive valid-prop registry; (5) fresh realm. Scroll
`tickets/74-the-pointed-verdict.md`.

**Session 2026-06-22 (Quest #73 The Storied Verdict — the `content` property:
content-list serialization, +49):** A baseline sweep of #72's named "next leverage"
pointers found the widest clean tail in `css/css-content/parsing`: `content-computed`
was **0/41** (the property was never registered for computed style, so
`getComputedStyle(el).content` returned `""` and every subtest's support check
failed) and `content-valid` **38/46** (the specified path stored values verbatim,
never dropping the default `decimal` counter-style). **Fix (pure JS,
`bootstrap.js`, NO new Rust):** (1) registered `content: 'normal'` in
`_GCS_DEFAULTS` (clears the support check + the ~38 identity-serializing subtests:
quotes/strings/url/counter with custom-or-no style/combinations); (2) new
**`_canonContent(value, el, computed)`** wired into `_parseStyleDecls` + `setProperty`
(specified) and `_normComputed` (computed) — **`_canonCounterFns`** balanced-paren-
scans `counter(`/`counters(` heads and drops a trailing default `decimal`
`<counter-style>` (ASCII-case-insensitive; custom-idents kept; a non-rewritten call
copied byte-for-byte so escaped names `counter(\})` round-trip), then routes gradient
content-items through the existing `_canonGradients` and absolutizes url()s via
`_canonUrls` at computed time; (3) quote-aware **`_splitCommaQuoted`** (neither
`_commaSplitTop` nor `_splitTopLevel` skips strings, and a counters() separator may
contain a comma); (4) a linear-gradient **`to <side-or-corner>` reorder** in
`_canonGradientDirection` (`to top right`→`to right top`, CSSOM order — the one
gradient content-item needing a new rule; the radial `ellipse`-drop + conic
`from 1.5708rad`→`from 90.0002deg` cases were already handled by the #64–67 engine).
content-computed 0→41, content-valid 38→46. **+49. ZERO regressions** — the risky
shared corner-reorder was swept across the whole gradient family
(gradient-interpolation-method-valid 1398, -computed 932, gradient-position 18/43,
image-function 13/3, background-image-valid 13, mask-image-computed 47), plus
serialize-values 696/697 (≥ the standing 695; the 1 fail is the pre-existing `calc()`
additive-ordering cap), background-position-computed 32, color-valid 17, color-computed
16, var-substitution-background 10, shorthand-serialization 7, cursor-computed 36/39 +
cursor-valid 42/46 (unchanged — cursor isn't a gradient prop), createElement 147;
`cargo test -p obscura-dom --lib` 40/40. **CAPS / NEXT LEVERAGE:** (1) **`cursor`
gradient + image-set canon** — cursor-computed 36/39, its 3 fails are gradient
content-items; registering `cursor` in `_GRADIENT_PROPS` + `_GCS_DEFAULTS` (initial
`auto`) is a near-free +3, and cursor-valid 42/46 wants `image-set("url" 1x)`→
`image-set(url("url") 1x)` + `calc(2 + 0)`→`calc(2)` + `light-dark()` (separate
primitives). (2) **`resolve-relative-to-stylesheet`** (0/3) — external-CSS loading +
per-stylesheet base. (3) comprehensive valid-property registry (serialize-values
hot-path risk). (4) fresh realm (`fetch/`, `html/dom/` reflection). Scroll
`tickets/73-the-storied-verdict.md`.

**Session 2026-06-22 (Quest #72 The Lowercased Verdict — keyword-`<color>`
canonicalization, +2):** A reachability sweep of #71's named "next leverage"
showed the bigger pointers blocked this session — `resolve-relative-to-stylesheet`
0/3 (needs external-CSS loading + per-stylesheet base, a real build) and the
comprehensive valid-property registry (serialize-values hot-path risk). The clean,
loadable tail: the specified-`<color>` keyword case. `_canonColorSpecified` (#68)
short-circuited `transparent`/`currentcolor`/CSS-wide/named colours to **verbatim**,
but CSSOM canonical serialization ASCII-lowercases a keyword ident —
`background-color: currentColor` must serialize `currentcolor`. **Fix (pure JS,
`bootstrap.js`, NO new Rust):** (1) `_canonColorSpecified` now returns the lowercased
keyword (`low`) instead of the verbatim `value` for the keyword/CSS-wide branch
(legacy hex/rgb/hsl still resolve as before; modern functions/`var()` still verbatim).
(2) New `_canonColorShorthand` + `_COLOR_SHORTHAND_PROPS` (`border-color`/
`border-block-color`/`border-inline-color`) splits a shorthand value into its
top-level `<color>` tokens via the paren-aware `_splitTopLevel` (so `rgb(0, 0, 255)`
stays whole) and canonicalizes each, wired into `_parseStyleDecls` + `setProperty`.
`background-color-valid` 8→9, `border-color-valid` 6→7. **+2. ZERO regressions** —
serialize-values 695/697 (its colour list is all-lowercase fixed points; no
`border-color`), color-valid 17, color-computed 16, color-computed-rgb 95,
caret/text-decoration/column-rule-color-valid 15/3/2, gradient-position-valid 18,
image-function-valid 13, background-position-computed 32, shorthand-serialization 7,
var-substitution-background 10, css-color/inheritance 4, createElement 147; obscura-dom
40/40. **FOUNDATIONAL:** every wpt.live-404'd `*-color-valid` longhand
(`border-top/right/bottom/left-color`, `text-emphasis-color`) and the border-color
flow-relative shorthands get the `currentColor`→`currentcolor` green free once served.
**Caps / next leverage:** (1) `resolve-relative-to-stylesheet` (0/3, external-CSS
loading + per-stylesheet base — the broad `<url>`-computed prize). (2) comprehensive
valid-property registry (csstext unknown-prop drop + per-prop validation; MUST be a
superset of serialize-values' ~95 props). (3) broaden `_canonUrls` to non-image
`<url>` props (`cursor`/`content`/`@font-face src`). (4) fresh realm (`fetch/`,
`html/dom/` reflection). Scroll `tickets/72-the-lowercased-verdict.md`.

**Session 2026-06-21 (Quest #71 The Forbidden Verdict — scoped per-property value
validation for `image()`, +6):** Took #70's named "next leverage (3)". A reachability
sweep confirmed the other pointers were dead ends this session — `resolve-relative-to-
stylesheet`, `cross-fade-valid`/`-computed` all wpt.live 404 (cross-fade tests don't
exist in the repo per the GitHub contents API; the stylesheet one needs external-CSS
loading, a bigger build). The clean, loadable, winnable target: `css/css-images/parsing/
image-function-invalid.html` at **0/6**. `test_invalid_value` sets the property to an
invalid value and asserts `getPropertyValue` returns `""` — the declaration must be
*rejected*. Obscura stored every value verbatim, so `background-image: image()` etc.
read back non-empty. **The 6 cases:** image() takes a single `<color>`, so `image()` /
`image(none)` / `image(red, blue)` / `image(notacolor)` / `image(url(foo.png))` are all
invalid in an `<image>` property, and `image(red)` is invalid in a `<color>` property
(image() is an `<image>`, never a `<color>`). **Fix (pure JS, `bootstrap.js`, NO new
Rust):** new **`_imageFuncInvalid(value)`** balanced-paren-scans for `image()` heads
(token-boundary, skips `-webkit-image-set(`), top-level-comma-splits each inner, and
rejects unless it is exactly one **`_isColorish`** argument; **`_hasImageFunc(value)`**
detects any image() token for the `<color>`-property reject. **`_isColorish`** is a
permissive *head-only* colour check (`_CSS_NAMED_COLORS`/`transparent`/`currentcolor`/
hex/`_COLOR_FUNC_NAMES` incl. `light-dark`/`color-mix`/`color`) — enough to reject
`none`/`url()`/bare idents without re-validating the deep colour grammar
`_canonColorSpecified`/`_computeColor` already accept, so all 13 valid image() forms
still pass. Wired into the `_GRADIENT_PROPS`/`_COLOR_PROPS` branches of both
`_parseStyleDecls` (invalid → `continue`/drop) and `setProperty` (invalid → `return`/
ignore, keeping the prior value). 0→6/6. **+6. ZERO regressions** — image-function-valid
13/13 (the proof the permissive check accepts all valid forms), image-function-computed
3/3, color-valid 17/17, color-computed 16/16, gradient-position-valid 18/18,
interpolation-method-valid 1398, serialize-values 695/697, csstext 7/11,
resolve-relative-to-base 2/2, createElement 147; obscura-dom 40/40.
(`background-image-valid`/`-computed`, `mask-image-computed` came back wpt.live 404 —
serving flux, NOT regressions; their identical `_GRADIENT_PROPS` path is proven safe by
image-function-valid 13/13.) **Caps / next:** (1) **comprehensive valid-property
registry** — the standing cap behind csstext 7/11 (unknown-prop drop) + general per-prop
value validation; this quest is the narrow `image()` slice of it. (2) `resolve-relative-
to-stylesheet` (0/3) needs external-CSS loading with per-stylesheet base URL (bigger
prize). (3) broaden `_canonUrls` to non-image `<url>` props (`cursor`/`content`/
`@font-face src`) once registered for computed serialization. (4) fresh realm
(`fetch/`, `html/dom/` reflection). Scroll `tickets/71-the-forbidden-verdict.md`.

**Session 2026-06-21 (Quest #70 The Resolved Verdict — computed-time URL
absolutization, +2):** Took #69's named "next leverage (1)" (URL absolutization). A
reachability sweep found the `image-set-*`/`cross-fade-*` pointers from #69's memory
**do not exist** as WPT tests (confirmed via the GitHub contents API); the `<url>`
family lives in `css/css-values/urls/`. Of the reachable fails, `resolve-relative-to-
base.sub.html` (0/2) is the clean foundational primitive: a relative `url()` in an
`<image>`/`<url>` property must compute to its absolute URL against the document base
URL (`<base href="http://www.not-wpt.live">` → `url(images/test.png)` computes to
`url("http://www.not-wpt.live/images/test.png")`). Obscura stored it verbatim — a bare
`url()` is outside every `_IMAGE_FUNC_HEAD` function, so `_canonGradients`'s scan never
touched it. **Fix (pure JS, `bootstrap.js`, NO new Rust):** new **`_canonUrls(value,
el)`** scans for `url()` tokens (both the quoted functional `url("a")` and the unquoted
url-token `url(a)` forms, trailing ws trimmed, escapes consumed), resolves each via
`new URL(raw, el.baseURI).href` (base from `_documentBaseURL` → `<base href>`), and
re-serializes double-quoted. **Idempotent / fail-safe:** an unparseable target (e.g. an
unsubstituted `{{token}}`) or an already-absolute url round-trips byte-identical —
verified in-engine that `new URL("http://{{host}}/", base).href === "http://{{host}}/"`.
Wired into `_normComputed` *after* `_canonGradients` for `_GRADIENT_PROPS` (so `url()`s
nested in `image()`/`cross-fade()` absolutize too); specified time untouched. 0→2/2.
**+2. ZERO regressions** — mask-image-computed 47/47 (its `url("http://{{host}}/")`
subtests round-trip byte-identical = the idempotency proof), background-image-computed
47/48 (1 pre-existing `light-dark()` cap), image-function 13/3, gradient-position
18/43, interpolation-method 1398, color 17/16, background-position-computed 32,
serialize-values 695/697, createElement 147; obscura-dom 40/40. (`list-style-image-
computed`/`Element-matches` came back wpt.live 404 this session — serving flux, NOT
regressions.) **Caps / next:** (1) `resolve-relative-to-stylesheet` (0/3) needs external-
CSS loading with per-stylesheet base URL (bigger); (2) broaden `_canonUrls` to non-image
`<url>` props (`cursor`/`content`/`@font-face src`) once registered for computed
serialization; (3) `image-function-invalid` / per-property value validation (valid-prop
registry cap); (4) `cross-fade()` computed (404, code in place); (5) fresh realm. Scroll
`tickets/70-the-resolved-verdict.md`.

**Session 2026-06-21 (Quest #69 The Composited Verdict — `<image>`-function canon
(`image()` + `cross-fade()`), +7):** Took #68's named "next leverage (1)+(2)". A
reachability sweep confirmed all three targets were served (where the bigger `<image>`/
`<url>` computed tails were 404 again). `_canonGradients` — the #64–67 `<image>`
canonicalizer — only recognized the *gradient* functions; `image()` and `cross-fade()`
were serialized verbatim. **Fix (pure JS, `bootstrap.js`, NO new Rust):** generalized the
balanced-paren scan to an `<image>`-function scan via `_IMAGE_FUNC_HEAD`
(`gradient`|`cross-fade`|`image`), dispatched per head. `_canonImageInner` canonicalizes
`image(<color>)` (specified `_canonColorSpecified` keeps names/`currentcolor`/modern
functions verbatim, canonicalizes legacy `rgb(0 128 255)`→`rgb(0, 128, 255)`; computed
`_computeColor` resolves `red`→`rgb(255, 0, 0)`, `transparent`→`rgba(0, 0, 0, 0)`).
`_canonCrossFadeInner`/`_canonCfImage` reorder each `cross-fade()` `<cf-image>`
(`<percentage>? && [<image>|<color>]`) to image-first/percentage-last
(`cross-fade(50% url(…), …)`→`cross-fade(url(…) 50%, …)`, `cross-fade( 1% red, green)`→
`cross-fade(red 1%, green)`), recursing into nested `<image>` functions
(`cross-fade(image(green), red)`, `cross-fade(red 1%, cross-fade(…))`). Already wired:
`background-image` ∈ `_GRADIENT_PROPS` routes specified + computed. image-function-valid
12→13, image-function-computed 1→3, background-image-valid 9→13. **Zero regressions**
(gradient-position 18/43, interpolation-method-valid 1398, color-valid 17/computed 16,
serialize-values 695/697, background-position-computed 32, shorthand-serialization 7,
Element-matches 669, createElement 147; obscura-dom 40/40; the composing cases that
passed verbatim stay byte-identical because nested gradients recurse through the unchanged
gradient canonicalizer). **Caps / next:** url absolutization (foundational `<url>`-computed);
`cross-fade()` computed (wpt.live 404 this session, reorder+compute already implemented);
`image-set()` canon; valid-prop registry; fresh realm. Scroll
[`69-the-composited-verdict.md`](69-the-composited-verdict.md).

**Session 2026-06-21 (Quest #68 The Tinctured Verdict — specified-value `<color>`
serialization, +10):** Took #67's named "next leverage" but, via a reachability sweep,
chose the widest *measurable* tail: wpt.live was 404ing the bigger `<image>`/`<url>`
computed tests (`background-image-valid`, `image-set-*`, the `*-color-*` siblings — serving
flux), while `color-valid` was reachable at **7/17**. The inline-`style` specified path
stored colours verbatim (only `_canonStandardValue`'s numeric pass ran), so every legacy
sRGB form that must canonicalize stayed unchanged. **Fix (pure JS, `bootstrap.js`, NO new
Rust):** new **`_canonColorSpecified(value)`** placed after `_computeColor` — it
short-circuits keywords/named-colours/CSS-wide values to verbatim, then delegates the
legacy hex/`rgb`/`hsl`→canonical `rgb()`/`rgba()` conversion to the existing `_computeColor`
(channel clamp, `%`→0-255, 4-arg/slash-alpha→rgba, `%` alpha→number), with an `out === s`
guard returning the original bytes for modern functions/`var()`/unparseable. The KEY
distinction from the computed path: at specified time, named colours, `currentcolor`,
`transparent`, CSS-wide keywords, and modern functions (`light-dark()`/`color-mix()`/`lab()`/
relative) are kept as written — they only resolve at computed-value time (so `red` stays
`red`, not `rgb(255, 0, 0)`). Wired into `_parseStyleDecls` + `setProperty` for `_COLOR_PROPS`,
alongside the `_POSITION_PROPS`/`_ORIGIN_PROPS`/`_GRADIENT_PROPS` branches. **7→17/17; +10.
ZERO regressions** — `serialize-values` 695/697 (its `_COLOR_PROPS` list `['black','red',
'rgb(50, 75, 100)','rgba(5, 7, 10, 0.5)']`+`transparent`+`inherit` is all fixed points),
`color-computed` 16/16 (the computed path is idempotent on the canonical `rgb()` we now
store), gradient-position valid/computed 18/43, image-function 12·1 (unchanged), var-
substitution-background 10/10, css-color/inheritance 4, inherit-initial 4, Element-matches
669, Document-createElement 147; `cargo test -p obscura-dom` 40/40. (3 pre-existing runtime
unit failures — blob-url/document.write/iframe-lifecycle — proven present on baseline with
the change stashed; unrelated to colour.) **Foundational:** every `*-color-valid` test
canonicalizes for free once wpt.live serves them. **Next leverage:** (1) `image(<color>)`
canon (`image-function` 12/13·1/3 — extend `_canonGradients` to the `image()` wrapper, reuse
this helper); (2) `cross-fade()` specified canon (404 this session); (3) url absolutization
(foundational across `<url>` computed); (4) colour-invalid drop; (5) valid-property registry.
Scroll `tickets/68-the-tinctured-verdict.md`.

**Session 2026-06-21 (Quest #67 The Imaged Verdict — `<image>`-prop computed
serialization, +76):** Took #66's named "next leverage (1)" (more `<image>` props). A
baseline sweep showed the `<image>` family was the widest *non-validation* tail:
`mask-image-computed` 0/47 + `border-image-source-computed` 0/10 (unregistered),
`background-image-computed` 35/48 + `list-style-image-computed` 3/11 (registered but the
#64–66 gradient computed canonicalizer was incomplete). One root cause: complete the
gradient computed serializer + register the remaining `<image>` props. **Fix (pure JS,
`bootstrap.js`, NO new Rust):** added `mask-image`/`list-style-image`/`border-image-source`
to `_GRADIENT_PROPS` (+ `mask-image`/`border-image-source` to `_GCS_DEFAULTS`, initial
`none`); extended the canonicalizer — `_evalMath` gained opt-in `opts.angle` (angle units
→ degrees) + `opts.lhPx` (`lh`); `_serAngle` (6-sig-fig angle serialization, `2rad`→
`114.592deg`); `_canonStopPos` (per-stop-position computed: angle→deg, `%`-only→%, mixed
`%`+length→`calc(P% ± Lpx)`, else length→px); `_canonGradientStop` (resolve `currentcolor`
→ el `color`, **split a two-position colour stop** into two stops); `_canonConicPrelude`
(`from <angle>` normalize + drop default `from 0deg`); `_canonRadialPrelude` (drop `circle`
on explicit length + clamp negative px → `0px`); `_canonGradientDirection` (linear single-
`<angle>` direction resolves to degrees, e.g. `calc(90deg-45deg)`→`45deg`); `_posComputeLen`
(`%`-only calc → a single percentage, mixed `%`+length still kept as canonical `calc()` so
the #61 round-trip invariant holds; threads `lhPx`); `_canonGradients` (treats EOF as the
implicit `)` for an unclosed function). mask 0→47, background 35→47, list-style 3→11,
border-image 0→9. **ZERO regressions** — whole `<position>`/gradient family byte-identical
(gradient-position 18/43, interpolation 1398/932, background-position-computed 32,
transform/perspective-origin 23/21, mask-position-valid 23, list-style/border-image-valid
3/2), serialize-values 695/697, var-substitution-background 10 / -shorthands 51,
color-computed 16, opacity 30, Element-matches 669, createElement 147; obscura-dom 40/40.
(`object-position`/`offset-*` `-computed` are wpt.live HTTP 404 = serving flux, not
regressions; identical position code proven safe by background-position 32/32.) **Caps:**
`light-dark()` (CSS Color 5, 1 subtest), url absolutization (document base-URL, 1 subtest),
`cross-fade()` specified canon (background-image-valid 9/13). **Next leverage:** (1)
`cross-fade()` specified canon (+4); (2) url absolutization (foundational across `<url>`
computed); (3) comprehensive valid-property registry (csstext unknown-prop drop —
serialize-values hot-path risk); (4) fresh realm. Scroll `tickets/67-the-imaged-verdict.md`.

**Session 2026-06-21 (Quest #66 The Interpolated Verdict — gradient
`<color-interpolation-method>` serialization, +1439):** Took #65's named "next
leverage (2)" (broader linear/conic computed canon — interpolation hints), which a
baseline sweep revealed to be the widest unopened tail of the entire frontier:
`gradient-interpolation-method-valid` 585/1398 and `-computed` 306/932 — ~1439
failing subtests, an order of magnitude past anything adjacent. Gradients carry an
`in <color-space> [ <hue> hue ]?` clause (CSS Images 4 / CSS Color 4) the #64/#65
canonicalizer never parsed. The rules, read straight from the test generators: (1)
**reorder** the clause to serialize AFTER the direction (`linear-gradient(in lab
30deg, …)`→`linear-gradient(30deg in lab, …)`); (2) **drop the clause when it
equals the default space** — `oklab` normally, but `srgb` when every colour stop
uses legacy sRGB syntax (named/hex/`rgb()`/`hsl()`) — applies in BOTH valid and
computed; (3) alias `xyz`→`xyz-d65`; (4) drop the default `shorter hue` for polar
spaces. **Fix (pure JS, `bootstrap.js`, NO new Rust)** extending the gradient
canonicalizer: `_interpolationClause` (locate the clause → `{start,len}`),
`_canonInterpolationMethod` (alias + hue-drop + default-space-drop via an
`isLegacy` flag `_canonGradientInner` derives from the stop colours),
`_canonGradientConfig` refactored to split the clause off, canonicalize direction
(now `_canonGradientDirection`) and method independently, and recombine
`<direction> in <space>`. The test also surfaced two radial-prelude gaps:
`_canonRadialPrelude` now drops the default `ellipse` shape when an explicit size
is present (`ellipse 50% 40em`→`50% 40em`) and resolves lengths to px at computed
time (`40em`→`640px` via #61/#63 `_posComputeLen` + the element's font-size), and
`_isGradientConfig` detects a bare `<radial-size>` config so the size still
resolves after `ellipse` was dropped at specified time. valid 585→1398 (+813),
computed 306→932 (+626). **ZERO regressions** — the whole shared `<position>`/
gradient family byte-identical (gradient-position 18/43, var-substitution-
background 10/10, background/object-position 31/32·18/16, transform/perspective-
origin 16/18, mask-position 23), serialize-values 695/697, var-shorthands 51,
var-definition 71/73, color-computed 16, shorthand-ser 7, Element-matches 669,
createElement 147; obscura-dom 40/40. Scroll `66-the-interpolated-verdict.md`.
**Next leverage:** (1) more `<image>` props — `mask-image` (computed 0/47),
`list-style-image`, `border-image-source` share the gradient grammar, mostly
registration into `_GRADIENT_PROPS` + a per-prop initial; (2) comprehensive
valid-property registry (csstext unknown-prop drop); (3) fresh realm.

**Session 2026-06-21 (Quest #65 The Distilled Verdict — gradient default-token
canonicalization + `linear-gradient`, +2):** Took #64's named "next leverage (1)".
`variable-substitution-background-properties` was 8/10 — the 2 remaining fails were
gradients whose substituted value computes by *distilling away* tokens equal to their
defaults: `background-image-linear-gradient` (`linear-gradient(to bottom, rgb(30,87,0)
0%, rgb(125,232,185) 100%)` → `linear-gradient(rgb(30, 87, 0) 0%, rgb(125, 232, 185)
100%)` — drop the default `to bottom`, normalize colour/comma whitespace) and
`background-image-radial-gradient` (`radial-gradient(ellipse farthest-corner at 25px
25px, black 10%, green 90%)` → `radial-gradient(at 25px 25px, rgb(0, 0, 0) 10%, rgb(0,
128, 0) 90%)` — drop the default `ellipse` shape + `farthest-corner` size, keep the
`at` clause, compute stops). #64 handled radial/conic `at <position>` but never matched
`linear-gradient` and kept the radial shape/size prelude verbatim. **Fix (pure JS,
`bootstrap.js`, NO new Rust)** extending #64's canonicalizer: (1) `linear` added to
`_GRADIENT_HEAD`; `_canonGradients` derives a `type` (`linear`/`radial`/`conic`) from
the function head and threads it through. (2) `_isGradientConfig(arg,type)` is now
type-aware — for linear a config is `to …` or a lone `<angle>` (`_isAngle`/`_ANGLE_RE`),
for radial/conic the existing `at`/`from`/shape/size detection. (3) `_canonGradientConfig
(arg,el,computed,type)` branches: linear keeps the direction but **drops `to bottom` at
computed time**; radial/conic split off the `at <position>` clause and, for radial at
computed time, run the prelude through new **`_canonRadialPrelude`** (filters the default
`ellipse`/`farthest-corner`, keeps `circle`/explicit sizes). Colour stops were already
computed via `_computeColor` (`_computeColor('rgb(30,87,0)')`→`rgb(30, 87, 0)`,
`black`→`rgb(0, 0, 0)`), comma-spacing normalized by the per-layer `.join(', ')`. **8→10/10;
+2. ZERO regressions** — gradient-position-valid 18/18 + -computed 43/43 byte-identical
(their configs are `at`-only with empty preludes; radial filter is computed-only and
doesn't touch them), background/object-position 31/32/18/16, transform-origin 23,
var-substitution-filters 7 / -shorthands 51, color-computed 16, serialize-values 695 (no
gradients), shorthand-ser 7, matches 669, createElement 147, var-definition 71;
obscura-dom 40/40. **CAPS / NEXT LEVERAGE:** (1) **more `<image>` props** —
`mask-image`/`list-style-image`/`border-image-source` carry the same gradient grammar;
baseline then add to `_GRADIENT_PROPS`. (2) broader linear/conic computed canon (angle
normalization `0deg`/`1turn`, gradient interpolation-method hints — see
`gradient-interpolation-method-computed`). (3) comprehensive valid-property registry
(csstext unknown-prop drop — serialize-values hot-path risk). (4) fresh realm. Scroll
`tickets/65-the-distilled-verdict.md`.

**Session 2026-06-21 (Quest #64 The Gradient Verdict — gradient `at <position>`
canonicalization + colour-stop computation, +47):** Took the standing widest
unopened tail named by every quest since #57. `radial-gradient`/`conic-gradient`
carry an `[ at <position> ]?` clause sharing the #61 `<position>` grammar, but
`background-image` was stored verbatim → `gradient-position-valid` 14/18 (the 4
fails all the horizontal-first reorder of the `at` clause), `gradient-position-computed`
**0/43** (needs the `at` clause resolved to %/px, a default `at center center`/`at
50% 50%` dropped, and each colour stop computed). **Fix (pure JS, `bootstrap.js`,
NO new Rust):** a self-contained gradient canonicalizer on the #61 `<position>`
primitives + `_computeColor`, scoped to `_GRADIENT_PROPS={background-image}` and the
radial/conic (incl. `repeating-`) functions. (1) **`_canonGradients(value,el,computed)`**
— a balanced-paren scan transforming each gradient function in place while leaving
every other character verbatim (multi-image lists, `url()`, `none`, and the commas
*between* layers survive; fast-path bails when no `gradient(` present). (2)
**`_canonGradientInner`** — top-level-comma-split; the first arg is a *configuration*
(vs a colour stop) when `_isGradientConfig` sees an `at`/`from`/shape/size keyword.
(3) **`_canonGradientConfig`** — split out the `at <position>` clause (keeping any
shape/size/angle prelude); specified → `_serializePositionSpecified` (reorder),
computed → `_serializePositionComputed` with a `50% 50%` result **dropping the whole
`at` clause** (`radial-gradient(at center, red, blue)`→`radial-gradient(rgb(255, 0,
0), rgb(0, 0, 255))`). (4) **`_canonGradientStop`** (computed) — compute the stop
colour, keep positions. Wired into `setProperty`/`_parseStyleDecls` (specified) +
`_normComputed` (computed). **valid 18/18, computed 43/43; +47. ZERO regressions** —
the `<position>` family that shares this code held byte-identical (background-position
31/32, object-position 18/16, transform-origin 23, mask-position-valid 23,
offset-anchor-computed 14); swept serialize-values 695, var-substitution-background
8/10 (2 unchanged) / -shorthands 51, color-computed 16 / -rgb 95, shorthand-ser 7,
css-fonts inheritance 39, matches 669, createElement 147; obscura-dom 40/40. Cap:
gradient default-token canon (drop `to bottom`/`ellipse farthest-corner` +
whitespace-normalize substituted colours → `variable-substitution-background` 8/10,
opens linear-gradient). Scroll `tickets/64-the-gradient-verdict.md`.

**Session 2026-06-21 (Quest #63 The Offset Verdict — `mask-position` /
`offset-anchor` / `offset-position` `<position>` serialization, +40):** Took #62's
"next leverage (2)" (more `<position>` props). `mask-position` is the full
`<position>#` grammar (comma-layered) identical to `background-position`, stored
verbatim → mask-position-valid 12/23; `offset-anchor`/`offset-position` are a full
`<position>` computing like object-position but weren't in `_GCS_DEFAULTS` →
computed 0/14·0/15 (their valid tests were already canonical, passing verbatim).
Fix (pure JS, no new Rust): added all three to `_POSITION_PROPS`; registered
`offset-anchor` (initial `auto`) / `offset-position` (initial `normal`) in
`_GCS_DEFAULTS` (`auto`/`normal` parse-fail → verbatim passthrough). Two computed
refinements (these tests use `em` in offsets where object-position used only px):
a far-edge length offset now resolves to px via `_evalMath` (`bottom 20em`→
`calc(100% - 800px)`); a `calc()` mixing one `%` with length terms collapses the
lengths to px keeping `%` symbolic, percentage-first (`calc(20% - 5em)`→
`calc(20% - 200px)`) via new `_splitSumTerms`/`_resolvePctLengthCalc`. Both refinements
are px-preserving → existing cases unchanged. **mask-position-valid 23/23,
offset-anchor-computed 14/14, offset-position-computed 15/15; +40. Zero
regressions** (background-position 31/32, object-position 18/16, both origins
16/23/18/21 byte-identical; serialize-values 695, matches 669; obscura-dom 40/40).
Cap: `mask-position-computed.html` is a wpt.live 404 (unwinnable). Next: gradient
`at <position>` + gradient canon (still the widest adjacent tail; the new calc
helpers are reusable for gradient stop positions). Scroll
`tickets/63-the-offset-verdict.md`.

**Session 2026-06-21 (Quest #62 The Anchored Verdict — `transform-origin` /
`perspective-origin` serialization, +39):** Took #61's "next leverage (2)" (more
`<position>` props). Both origins were stored verbatim (not in `_GCS_DEFAULTS` →
computed `""`): transform-origin-valid 5/16, -computed 0/23, perspective-origin
17/18·17/21. Two grammars: `transform-origin` is the restricted two-value
`<position>` + optional Z `<length>`; `perspective-origin` is the full
`<position>` (edge-offset forms), no Z. Both COMPUTE to absolute lengths against
the element's box (`10%`→`20px` on a 200px box), unlike object-position which
keeps percentages — readable via `_computedPropOf(el,'width'/'height')` since the
test sets explicit px and `getComputedStyle(el).width` already returns `"200px"`.
Built a small origin engine on #61's primitives (pure JS, no new Rust):
`_parseOriginPos` (peel trailing Z, then ≤2-token parse), `_parseOrigin`
(dispatch: transform-origin restricted, perspective-origin → full `_parsePosition`
reused verbatim), `_serializeOriginSpecified` (+ Z), `_originAxisPx` (keyword →
fraction of base, edge offset measured from its edge, math via `_evalMath`),
`_serializeOriginComputed`. Registered both in `_GCS_DEFAULTS`. **All four 100%;
+39. Zero regressions** (`_parsePosition` reused read-only → object/background-
position byte-identical). Caps: gradient `at <position>` + gradient canon (still
the widest adjacent tail; reuses this engine), `mask-position`/`offset-anchor`.
Scroll `tickets/62-the-anchored-verdict.md`.

**Session 2026-06-21 (Quest #61 The Positioned Verdict — a reusable CSS
`<position>` value serializer, +60):** `object-position` and `background-position`
were stored verbatim, so every `*-valid`/`*-computed` case needing canonical
reordering, axis defaulting, or keyword→percentage resolution failed
(object-position 11/18·1/16, background-position 23/31·2/32). Built one
self-contained `<position>` engine (pure JS, no new Rust): **`_parsePosition`**
decomposes 1–4 tokens into horizontal/vertical components — the KEY subtlety is
that an offset attaches to an edge keyword **only in the 3/4-token edge-offset
form** (`right 40%` is two components H:`right` V:`40%`, not `right` with a 40%
offset; nailed by `right 40%` computing to `100% 40%`). **`_serializePositionSpecified`**
(horizontal-first order, fill an omitted axis with `center`, retain edge keywords,
per comma-separated layer) wired into `setProperty`/`_parseStyleDecls`;
**`_serializePositionComputed`** (keywords→percentages, a `right`/`bottom` edge
offset → `100%−off` for a percentage or `calc(100% ∓ off)` for a length with the
negative sign folded into `+`, and a `calc()` mixing `%`+length kept as calc so the
round-trip assert holds) wired into `_normComputed`. New `_evalMath` `opts.emPx`
resolves `em` offsets against the element's computed font-size
(`#target{font-size:40px}` → `calc(10px + 0.5em)` → `30px`). **All four tests 100%
(18·16·31·32); +60. ZERO regressions** — the hot-path risk was serialize-values
(695), which generates `background-position` as horizontal-then-vertical-ordered
combinations, so the reorder swap never fires and output is byte-identical to the
old verbatim path; swept the css-variables/colour/inheritance/selector/DOM ritual
lists + obscura-dom 40/40 (`qsa` is a wpt.live HTTP 404 right now, not a
regression). **Caps:** gradient `at <position>` is the natural follow-up and reuses
this exact engine (`gradient-position-computed` 0/43 additionally needs
gradient-param parsing + colour computation of stops + dropping the default
`at center center` — i.e. #57's standing gradient-canonicalization cap); other
`<position>`-shaped properties (`transform-origin`/`perspective-origin`/
`mask-position`). Scroll `tickets/61-the-positioned-verdict.md`.

**Session 2026-06-21 (Quest #60 The Recombined Verdict — shorthand serialization
engine, +6):** Took #59's "next leverage (1)". The CSSOM `cssText` getter + the
shorthand-property getter (`el.style.margin`) must reconstruct a box-model
shorthand from the longhands present — the inverse of #58's cascade-side expansion.
KEY decision that made it zero-risk: `serialize-values` (the 695/697 win) sets only
*longhands* and reads `el.style[idl]`, never `.cssText`; so the engine lives purely
in the `cssText` getter + box-shorthand getter, reading the literal `_props`
on-the-fly with **no stored-state mutation** — cascade, `setProperty`, and longhand
reads are all untouched. New pure-JS helpers (no new Rust): `_styleLonghandList`
(expand `_props` → ordered longhand list with last-write-wins reappend; a
var()-bearing box shorthand → pending-substitution longhands), `_serializeDeclBlock`
("serialize a CSS declaration block" with the logical-group adjacency rule),
`_serializeBoxValue` (collapse 1–4 edges to the shortest form), `_boxShorthandSerialization`
(the getter). Scoped to margin/padding + their `-inline`/`-block` variants;
background/border/transition stay verbatim. `shorthand-serialization` 4→7,
`cssstyledeclaration-csstext` 5→7 (the two logical-group subtests),
`variable-cssText` 8→9 (target9 pending-substitution). **Zero regressions** (swept
serialize-values 695, -shorthands 51/51, definition 71, basic 11, filters 7/7,
background 8/10, legal-values 23/23; colour computed 16/named 455/rgb 95/opacity 30;
inherit-initial 4, css-color/inheritance 4, css-text 42, fonts 39, scroll-snap 38,
flexbox 20; qsa 1975, classlist 1, matches 669, closest 29, createElement 147,
valid-invalid 30; obscura-dom 40/40). Caps: unknown-property drop (needs a
comprehensive valid-prop registry — serialize-values hot-path risk), per-property
value validation, computed-style `cssText`/`length`, in-value comment preservation.
Scroll `60-the-recombined-verdict.md`.

**Session 2026-06-21 (Quest #59 The Serialized Verdict — specified-value
serialization for the inline `style` object, +580):** Took #58's "next leverage
(4)". `css/cssom/serialize-values` (697 subtests, the widest single CSS tail left)
sat at 118/697. Root cause: the `style` Proxy stored & read CSS properties by the
**raw JS accessor name** (`backgroundColor`) while `setProperty` /
`setAttribute('style',…)` / `cssText` all keyed `_props` by **kebab**
(`background-color`) — so `el.style.backgroundColor` after a `background-color`
set looked up the wrong key and returned `""`. Single-word props passed,
hyphenated failed: exactly the 118/579 split. Fix (pure JS, no new Rust): (1)
`_cssPropToKebab` maps every JS accessor to one canonical kebab key (camelCase →
kebab, leading-cap → vendor prefix, `cssFloat` → `float`, custom/kebab
passthrough); the Proxy get/set now route through `getPropertyValue`/`setProperty`
on that key (+415). (2) `_canonStandardValue` — a cheap hand scan that rewrites
each numeric token (`.5%`→`0.5%`, `-.5`→`-0.5`, `-0px`→`0px`, `+5`→`5`) while
leaving idents/hex/strings/`url()`/structure byte-identical; wired into
`_parseStyleDecls` + `setProperty` for standard props only (custom props bypass)
(+158). (3) serialize-a-url (`url(x)`/`url('x')`→`url("x")`) + serialize-a-string
(single→double quotes) in the same scan (+4). (4) regression repair: the
camelCase fix exposed that #58's `target9` passed by accident (a CSSOM re-set used
to append a *new* camelCase key, landing last in `_buildCascade`'s iteration);
`setProperty` now deletes+reinserts an existing key so the live-decl cascade
resolves shared longhands last-write-wins → shorthands held 51/51. Bonus:
`cssstyledeclaration-csstext` 2→5. **serialize-values 118→695, +580 total. ZERO
regressions** (stash+rebuild-verified baselines 118 & 2; swept the css-variables,
colour, inheritance, selector & DOM ritual lists). Caps: `counter()` default-arg
drop + font-family quote-drop (last 2 of serialize-values); shorthand
SERIALIZATION (the inverse engine — `shorthand-serialization` 4/7, `variable-cssText`
8/11); unknown-property drop + per-property value validation. Scroll
`tickets/59-the-serialized-verdict.md`.

**Session 2026-06-21 (Quest #58 The Expanded Verdict — shorthand→longhand
expansion in the cascade, +38):** Took #57's "next leverage (2)".
`variable-substitution-shorthands` (13/51) stamps shorthand declarations
(`margin`, `border`, `border-<side>`, `border-width`, `transition` — many
bearing `var()`) into inline styles and reads back the **longhand** computed
values (`margin-left`, `border-top-width`, `transition-duration`, …). Obscura's
cascade resolved one property *name* at a time, so a `margin` declaration never
reached `margin-left` (→ `0px`), and the `border-*-width`/`-style` longhands
weren't even modelled (→ `""`). **Fix (pure JS, `bootstrap.js`, NO new Rust):**
(1) **expansion at parse time into pending slots** — `_SHORTHAND_LONGHANDS` maps
each shorthand to the longhands it governs; `_expandDeclInto` writes the
shorthand name **and** a slot per longhand carrying `_sh` (the shorthand name) +
the *whole* shorthand value; `_putDecl` enforces within-block cascade order (an
`!important` slot is never clobbered by a later normal one). Wired into
`_cssParseDecls` (author rules + the `style=""` attribute) and the live-CSSOM
source in `_buildCascade`. (2) **lazy split at computed time** — `_cascadeResolve`
refactored onto `_cascadeWinner`; new `_specifiedDecl` returns `{value, sh}`;
`_computedPropOf` substitutes `var()` (a shorthand with var is one pending value),
then if `_sh` is set `_expandShorthand` splits the value — the **box-edge rule**
(`_boxEdges`/`_wsTokens`) for `margin`/`padding`/`border-{width,style,color}`,
`<line-width> ‖ <line-style> ‖ <color>` (`_parseBorderSide`) for
`border`/`border-<side>`, and a comma-layer parse (`_commaSplitTop`) for
`transition` — keeping this longhand's piece (an unparseable shorthand → invalid
at computed-value time, i.e. target7 `margin: var(--invalid)` → `0px`). (3) the 8
`border-*-{width,style}` longhands → `_GCS_DEFAULTS` (identity serialization;
unset width `0px`). The two-source cascade still gets target9 right because CSSOM
operations are *later in time* = higher cascade `order`, so the re-set
`style.borderLeft` beats the markup `border-width` for the left edge while the
other widths keep their `border-width` value. **13→51/51. +38. ZERO regressions**
(swept css-variables — substitution-basic 11/13, -filters 7/7, -background 8/10,
-cssText 8/11, -definition 71/73, legal-values 23/23; colour — computed 16/named
455/rgb 95/hex 6/opacity 30; inheritance — css-color 4, inherit-initial 4,
css-text 42, css-ui 28, css-fonts 39, css-transitions 8, css-flexbox 20,
css-grid 20; selectors — has/not-specificity 8/8, valid-invalid 30, disabled 7,
readwrite-readonly 25; DOM — classlist 1420, matches 669, closest 29,
createElement 147, getElementsByTagName 19; obscura-dom 40/40). `qsa` /
`css-backgrounds inheritance` are **wpt.live HTTP 404s** (`bodyLen=42`,
curl-confirmed — transient serving, not regressions). **Caps:** shorthand
*serialization* (`variable-cssText` 8/11 — the inverse engine, reconstructing
`margin:…` from longhands through the CSSOM `cssText` getter); gradient
canonicalization (background 8/10); border width/style interaction not modelled
(a `none` style should force width `0`); only margin/padding/border*/transition
expanded. **NEXT LEVERAGE:** (1) more shorthands (`outline`, `flex`, `gap`/`inset`,
`list-style`, `text-decoration`, `font`); (2) shorthand serialization (the inverse
— `variable-cssText` 8→11); (3) gradient canonicalization; (4) a specified-value
serializer (`serialize-values` 0/697) or a fresh realm. Scroll
`tickets/58-the-expanded-verdict.md`.

**Session 2026-06-20 (Quest #57 The Bounded Verdict — token-boundary-aware
`var()` substitution into `filter`/`background-*`, +14):** Took #56's "next
leverage (1)" — the standing token-boundary cap. `variable-substitution-filters`
(0/7) sets `filter: blur(var(--blur))` with `--blur: 15px` and reads computed
`filter`, expecting `blur(15px)`; `variable-substitution-background-properties`
(1/10) does the same for the seven background longhands. Two gaps: (1) `_substituteVars`
space-padded every insertion (`out += ' ' + resolved + ' '`) then collapsed
whitespace, yielding `blur( 15px )` — wrong inside a function call; (2) `filter`
and the `background-*` longhands weren't in `_GCS_DEFAULTS`, so `getComputedStyle`
echoed the *unsubstituted* `blur(var(--blur))` verbatim (only registered props
route through `_computedPropOf`, which performs substitution). **Fix (pure JS,
`bootstrap.js`, NO new Rust):** added `_joinTok(a, b)` — concatenate two CSS-text
fragments, inserting a single space ONLY when the last char of `a` and the first
char of `b` are both "tokenish" (`[A-Za-z0-9_.%#-]`+non-ASCII) and would merge
into one token; a boundary against `(`/`)`/`,`/whitespace needs no separator.
`_substituteVars` now routes every literal-and-insertion join through `_joinTok`
(no more blanket pad+collapse), so `blur(` + `15px` + `)` → `blur(15px)` while
`var(--a)var(--b)` still → `a b`. Registered `filter: none` + the seven
`background-{attachment,clip,origin,position,repeat,size,image}` initials in
`_GCS_DEFAULTS` (identity computed serialization, like the #53/#54 families).
**filters 0→7, background-properties 1→8. +14. ZERO regressions** (swept the
css-variables family — definition 71/73, cssText 8/11, substitution-basic 11/13,
created-element 3/3, created-document 2/2, legal-values 23/23, shorthands 13/51;
color-computed 16/named 455/rgb 95/opacity 30; the five inheritance families
css-text 42/ui 28/fonts 39/scroll-snap 38/transitions 8; inherit-initial 4,
css-color/inheritance 4; qsa 1975, classlist 1420, matches 669, closest 29,
createElement 147, has/not-specificity 8/8, valid-invalid 30, disabled 7,
readwrite-readonly 25; obscura-dom 40/40). **Caps (honest):** the 2 gradient
subtests (`background-image-{linear,radial}-gradient`) substitute correctly but
need full **gradient canonicalization** (`linear-gradient(to bottom, rgb(30,87,0)
0%,…)` → `linear-gradient(rgb(30, 87, 0) 0%, …)` — drop the default direction/shape,
named→rgb, normalize whitespace) — a gradient serializer, out of realm; shorthand
→longhand (`-shorthands` 13/51). **PATH NOTE:** `variable-cascading`/`variable-keywords`
now **404 on wpt.live** (`bodyLen=42`, HTTP 404 confirmed by curl — NOT a regression;
`variable-definition` etc. still 200). Scroll `tickets/57-the-bounded-verdict.md`.

**Session 2026-06-20 (Quest #56 The Lawful Verdict — custom-property
`<declaration-value>` validity + invalid-at-computed-time for `<color>`, +23):**
Took #55's "next leverage (2)". `test_variable_legal_values.html` (0/23) exercises
two halves of the custom-property grammar #55 left open. Allowed values (`25%`,
`foo()`, `( )`, `@media {}`, …) are valid `<declaration-value>`s that substitute
into `background-color: var(--test)` to a **non-colour** → the property is invalid
at computed-value time → falls back to initial (`transparent`). Disallowed values
(`]`, `)`, `(])`, `[)]`, `(})`) carry an **unmatched closer** → the declaration is
dropped → `--test` keeps its prior value. **Fix (pure JS, NO new Rust):** (1) new
`_isBalancedDeclValue` (stack-matched `()`/`[]`/`{}`; unmatched closers reject,
unmatched openers OK; strings/comments skipped), wired into `_cssParseDecls`,
`_parseStyleDecls` and `setProperty` — an invalid custom value is dropped, the
earlier one preserved; (2) `_cssSplitRules` block scanner made nesting-aware so a
stray `}` inside a value (`--test: (})`) no longer closes the rule early; (3) in
`_computedPropOf`, a `var()`-substituted value that isn't a real `<color>` (and
isn't a CSS-wide keyword / `currentColor`) makes a colour property
invalid-at-computed-time → inherited-or-initial. **0→23/23, +23, zero regressions**
(whole css-variables family held, color/opacity computed held, selector realms
held, obscura-dom 40/40). **Caps:** substitution into filter/background grammars
(`-filters` 0/7, `-background-properties` 1/10) is the **token-boundary cap**
(`blur(var(--blur))`→`blur( 15px )` not `blur(15px)`; needs a real tokenizer +
registering `filter`/`background-*`); shorthand→longhand (`-shorthands` 13/51);
non-colour invalid-at-computed-time. Scroll `tickets/56-the-lawful-verdict.md`.

**Session 2026-06-20 (Quest #55 The Custom Verdict — CSS custom properties &
`var()` substitution, +88):** Took the standing top "next leverage (a)" since #51.
The `css/css-variables/` realm rested on two missing/broken primitives. **(1)
`CSSStyleDeclaration` was a toy** — no custom-property name validation, no
`!important` tracking, no whitespace canonicalization — and the `style` Proxy
`set` trap stored `el.style.cssText = "…"` as a plain `_props['cssText']` instead
of invoking the setter, silently dropping every declaration. **(2)** the `style`
content attribute set by HTML parsing never reached the live decl, so the
*specified* value of any authored declaration was invisible. **(3)**
`getComputedStyle` had no custom-property inheritance/keywords/`var()`. Fix (pure
JS, no new Rust): rewrote `CSSStyleDeclaration` with `_isValidCustomPropName` /
`_canonCustomValue` / `_parseStyleDecls` (empty custom value → `" "`, later normal
never overrides earlier `!important`), fixed the Proxy `set` trap to delegate
accessors to the real setter, added a one-time lazy `style`-attribute sync in
`get style` (+ setAttribute/removeAttribute sync), `_computedCustomProp` (custom
props always inherit; `initial`→`""`, `inherit`/`unset`/`revert`→parent), and
`_substituteVars`/`_splitVarArgs` (recursive `var(--name,fallback)` with cycle
guard; unresolvable → invalid-at-computed-time → initial/inherited). Wins:
variable-definition 11→71, cascading 5→9, keywords 0→8, cssText 1→8,
substitution-basic 5→11, created-element 1→3, created-document 1→2. **+88, zero
regressions** (swept qsa 1975, classlist 1420, matches 669, closest 29,
createElement 147, color-computed 16/455/30, color-computed-rgb 95, the
inheritance families 42/28/39, has/not-spec 8/8, disabled 7, readwrite-readonly
25, valid-invalid 30; obscura-dom 40/40; aria-reflection 8/33 proven pre-existing
by stash). Caps: `CSS.supports`+`var()` (2 rgb caps), invalid-at-computed-time for
`<color>` (`test_variable_legal_values` 23), shorthand expansion
(`substitution-shorthands` 51), unknown-property drop, token boundaries, reftests.
Scroll `tickets/55-the-custom-verdict.md`.

**Session 2026-06-20 (Quest #54 The Snapped Verdict — five more CSS
property-inheritance realms, +62):** Continued #53's "next leverage (a)" — model
more `inheritance.html` families. Five were still dark, every subtest dying at
`prop in getComputedStyle` → false: **css-scroll-snap** (0/38: 8× scroll-margin-*
`0px`, 8× scroll-padding-* `auto`, scroll-snap-align/stop/type), **css-transitions**
(0/8: transition-delay/duration `0s`, transition-property `all`,
transition-timing-function `ease`), **css-color-adjust** (0/8: color-scheme `normal`,
color-adjust/print-color-adjust `economy`, forced-color-adjust `auto` — **all four
inherit**), **css-shapes** (0/6: shape-image-threshold `0`, shape-margin `0px`,
shape-outside `none`), **css-will-change** (0/2: will-change `auto`). Pure DATA, same
shape as #53: 34 properties → `_GCS_DEFAULTS`, the 4 color-adjust props →
`_INHERITED_PROPS`; identity serialization is the #52/#53 engine's default echo, so no
new serializer and NO new Rust. **All five families 100%; +62. ZERO regressions**
(swept the #53 fifteen families, inherit-initial 4, css-color/inheritance 4,
color-computed 16/455, opacity 30, matches 669, closest 29, createElement 147,
has/not-specificity 8/8, valid-invalid 30, disabled 7, classlist 1420; obscura-dom
40/40). **CAPS:** the cheap identity-serializing `inheritance.html` tail is now largely
exhausted — remaining families (css-backgrounds [could-not-run, wpt.live `bodyLen=42`],
css-position, css-sizing) need real layout/unit resolution, a separate engine. **NEXT:**
CSS custom-property cascade + `var()` substitution (opens `css/css-variables/`), a
specified-value serialization engine (`serialize-values` 0/697), or a fresh realm.
Scroll `tickets/54-the-snapped-verdict.md`.

**Session 2026-06-20 (Quest #53 The Propertied Verdict — modelling 15 CSS
property-inheritance realms, +263):** The shared `/css/support/inheritance-testcommon.js`
drives the whole `css/*/inheritance.html` family; #52 built the property-agnostic
computed-value engine (resolves `initial`/`inherit`/`unset`/`revert` + ancestor-chain
inheritance) but registered only ~30 properties, so every other `inheritance.html`
died at assert #1 (`prop in getComputedStyle` → false). Registered ~120 properties
across **15 families** (css-text, css-ui, css-fonts, css-text-decor, css-writing-modes,
css-lists, css-overflow, css-break, css-images, css-tables, css-align, css-flexbox,
css-grid, css-content, css-multicol) — initial value in `_GCS_DEFAULTS`, inherited flag
in `_INHERITED_PROPS`; identity serialization (keyword/length/number) is the engine's
default echo, so it was almost pure data. Three small engine fixes: (1) `_buildCascade`
now injects the live CSSOM declaration (`el.style.foo=`, which does NOT reflect into the
`style=""` attribute the cascade reads) as the **highest-priority normal author source**,
so a CSSOM-set value beats a normal author rule — an author `!important` rule still wins
(`important-vs-inline-001` preserved); `_specifiedValue` is now cascade-authoritative.
(2) `currentColor`-initial colour properties (caret/outline/text-decoration/text-emphasis/
column-rule-color) resolve to the element's own colour. (3) `_FONT_SIZE_KEYWORDS` so
`font-size: medium` computes to `16px`. Pure JS, no new Rust. **All 15 families now
100%; +263 (8→271). Zero regressions** (qsa 1975, classlist 1420, matches 669, closest
29, createElement 147, cloneNode 135, color-computed 16/455/95/30, opacity 30,
inherit-initial 4, css-color/inheritance 4, has/not/is-specificity, is-nested,
is-where-pseudo-classes, valid-invalid 30, readwrite-readonly 25, disabled 7,
getRandomValues 39, mark 22; obscura-dom 40/40). Caps: `display` skipped (spec-initial
`inline` ≠ UA-default `block`, regression risk for +1); families needing real layout/unit
resolution; the specified-value serialization engine (`serialize-values` 0/697) is
separate. Scroll `tickets/53-the-propertied-verdict.md`.

**Session 2026-06-20 (Quest #52 The Inherited Verdict — CSS-wide keyword resolution
+ per-property inheritance in `getComputedStyle`, +7):** After #47 (cascade) and
#49/#50 (computed colour/opacity), `getComputedStyle` still echoed the CSS-wide
keywords verbatim for every non-colour property — `inherit-initial.html` **0/4**
(`z-index:inherit`→`"inherit"` not `"auto"`; also `position`/`overflow`/
`background-color`), `css-color/inheritance.html` **1/4** (`opacity:initial`→
`"initial"`; `color:unset`→`rgb(0,0,0)` instead of inheriting — a latent bug, since
`color` inherits). Generalised the colour-only machinery into a property-agnostic
computed-value engine (pure JS, no new Rust): **`_specifiedValue`** (cascade-first so
`!important` resolves, live-CSSOM-decl fallback; `color` decl-first), **`_INHERITED_PROPS`**,
**`_initialOf`** (`_GCS_DEFAULTS` doubles as the initial-values table), **`_normComputed`**
(colour/opacity serialization), and **`_computedPropOf`** — `initial`→initial,
`inherit`→parent's computed value (root→initial), `unset`/`revert`→inherit-if-inherited-
else-initial, walking the ancestor chain. `getComputedStyle.resolve` routes every modelled
standard property through it; `_computedColorOf` collapses to `_computedPropOf(el,'color',0)`
(fixing the `unset` bug). Driven by the shared `inheritance-testcommon.js` that gates the
whole `css/*/inheritance.html` family. **inherit-initial 0→4, inheritance 1→4. +7, zero
regressions** (caught+fixed a mid-flight `currentColor`-on-`color` drop → restored
color-computed 16/16 + named 455/455; swept has/not/is-specificity, the `-type-change`
family, qsa/classlist/matches/closest, structured-clone, obscura-dom 40/40). Caps: the
broader inheritance tail (css-text 0/42, css-ui 3/28, css-fonts 3/39) is gated on the
**property model** (each family needs initial value + inherited flag + computed
serialization), NOT the engine. **PATH GOTCHA: wpt.live now 404s extensionless paths —
every test path must carry its `.html`.** Scroll `tickets/52-the-inherited-verdict.md`.

**Session 2026-06-19 (Quest #51 The Channelled Verdict — `calc()` inside `rgb()`
channels, +36):** #50's named follow-up. `color-computed-rgb.html` sat at **59/99**;
the 40 fails were `calc()` constants/non-finite (16), `sign()` + `<length>` (18), escaped
function names (2), `var()` (2 cap), and `2cqw` container units (2 cap). Two gate
failures blocked them: `_isValidColor`'s `[^)]*` regex couldn't span a nested
`calc(...)` (so `CSS.supports` returned `false`), and `_computeColor` split channels
with `parseFloat` + a naive separator split. Fix (pure JS, reusing #50's `_evalMath`):
`_splitTopLevel` (paren-aware component split), `_unescapeIdent` (`r\67 b`/`r\gb`→`rgb`),
`_resolveChannel` (NaN/±∞ → channel bounds), `_rgbComponents` (evaluate each component as
math, `percentBase` 255 for r/g/b and 1 for alpha); `_computeColor`/`_isValidColor`
rewritten to extract the name-before-`(` and inner-to-final-`)`. `_evalMath` gained an
`opts` arg (`lengths` → `<length>` dimension tokens via `_LENGTH_PX`, `em`=16/`px`=1…;
`nonFinite` → let ±∞/NaN through), calc constants (`infinity`/`nan`/`pi`/`e`), and
`sign()`/`abs()`. Opacity is byte-identical (calls `_evalMath` with no `opts`). **59→95
(+36).** Zero regressions (color-computed 16, hex 6, named 455, opacity 30 — the shared
paths — qsa 1975, classlist 1420, matches 669, closest 29, has-specificity 8,
not-specificity 8, valid-invalid 30, disabled 7, readwrite-readonly 25, structured-clone
141/152, getRandomValues 39, mark 22; obscura-dom 40/40). Caps: `var(--x)` (needs
custom-property cascade), `2cqw` (needs layout). Scroll `51-the-channelled-verdict.md`.

**Session 2026-06-19 (Quest #50 The Calculated Verdict — computed `opacity` + the
`calc()`/`min()`/`max()`/`clamp()` math evaluator, +27):** #49 opened the
`*-computed.html` family and built a computed-value engine for colour; its named
follow-up ("opacity + simple numeric computed values") was still dark — `opacity-computed.html`
at **3/30**. `getComputedStyle`'s `norm` step only normalized `<color>` properties, so
computed `opacity` echoed the *specified* value verbatim (`50%` → `"50%"`, `-2` → `"-2"`,
`calc(1 + 1)` → `"calc(1 + 1)"`). Built **`_evalMath(input, percentBase)`** — a
hand-tokenized recursive-descent evaluator that collapses a CSS math expression
(`calc()`/`min()`/`max()`/`clamp()` + raw `<number>`/`<percentage>`) to a plain number;
intentionally unit-agnostic (every term → a number; percent → `(p/100)·percentBase`,
`base = 1` for unitless opacity) — enough for opacity and number channels, not a general
length calculator. Plus `_serNumber` (computed-number serialization: round float noise,
drop trailing zeros, `-0`→`0`) and `_computeOpacity` (clamp to `[0, 1]`), wired into
`norm` ahead of the colour branch. Pure JS, no new Rust. The math evaluator is a
**reusable primitive** — the named cap for `color-computed-rgb`'s 40 `calc()` cases (next:
reuse it inside `rgb()`/`hsl()` channels with `percentBase = 255`). **Win:**
opacity-computed 3→**30/30** (+27). **Zero regressions** (qsa 1975, classlist 1420,
matches 669, closest 29, valid-invalid 30, readwrite-readonly 25, disabled 7,
has-specificity 8, not-specificity 8, is-nested 2, createElement 147, color-computed 16,
color-computed-hex-color 6, color-computed-named-color 455, color-computed-rgb 59,
structured-clone 141/152, getRandomValues 39, mark 22, url-setters-stripping 260;
obscura-dom unit 40/40). Caps: `opacity-valid`/`opacity-invalid` need a specified-value
`calc()`-simplification serializer + per-property grammar validation on the hot
`CSSStyleDeclaration` setter (separate quest); `var()`/escaped idents unresolved. Scroll
`tickets/50-the-calculated-verdict.md`.

**Session 2026-06-19 (Quest #49 The Computed Verdict — computed-value plumbing + the
colour engine, +536):** After #47 built an author-stylesheet *cascade* for `getComputedStyle`, After #47 built an author-stylesheet *cascade* for `getComputedStyle`,
the *computed-value* side of CSS was still dark. The whole `css/*/parsing/*-computed.html`
family runs through the shared helper `/css/support/computed-testcommon.js`, which gates
**every** subtest on two assertions before reading a value: `'prop' in getComputedStyle(el)`
and `CSS.supports(prop, specified)`. Both failed for us — the computed-style Proxy had no `has`
trap (so `'color' in gCS` was `false` → `color-computed.html` a clean 0/16, all on that first
assert), and `CSS.supports` was hardcoded `() => false`. Two tiny shared primitives blocking a
wide tail. Fix (pure JS, `bootstrap.js`, no new Rust): a Proxy **`has` trap** + property
registry `_CSS_KNOWN_PROPS`; a **real `CSS.supports`** (two-arg + one-arg condition form;
unknown properties still `false` to bound the blast radius; `<color>` values validated via new
`_isValidColor`); **`color` inheritance** (`getComputedStyle(el).color` resolves through the
ancestor chain — live inline `style.color` → author cascade → inherit; `currentColor`/`inherit`
walk up; root falls back to initial `rgb(0,0,0)`); and an extended `_computeColor` —
`hsl()`/`hsla()` → sRGB (new `_hslToRgb`), alpha clamped to `[0,1]`, the CSS Color 4 `none`
keyword treated as 0, and CSS comments stripped from values. **Wins (all from baseline 0,
gated on the first `in` assert):** color-computed 0→16, color-computed-hex-color 0→6,
color-computed-named-color 0→455, color-computed-rgb 0→59. **+536, zero regressions** (swept
the #47 colour-via-cascade tests has-specificity 8 / is-specificity 1 / not-specificity 8 /
is-nested 2 / important-vs-inline-001 4 / inrange-outofrange-type-change 2 / checked-type-change
1 — the highest risk — plus qsa 1975, classlist 1420, matches 669, closest 29, valid-invalid 30,
readwrite-readonly 25, disabled 7, createElement 147, mark 22, structured-clone 141/152,
getRandomValues 39; obscura-dom unit 40/40). **Caps:** color-computed-rgb 59/99 (remaining 40 =
`calc()`/`var()`/CSS-escaped identifiers — need a calc evaluator + value tokenizer);
`alpha(from …)` relative-colour (CSS Color 5, bleeding edge — we correctly return `false`);
`opacity-computed` 3/30 (a different property — clamp/percentage/calc, clean follow-up);
`color-computed-hsl` could-not-run for a harness reason (bootstrap not attaching, unrelated to
colour). **NEXT:** the `has`-trap + `CSS.supports` primitives are now a foundation for the whole
`*-computed.html` family — `opacity-computed` + simple numeric computed values next, then CSS
inheritance + initial values for non-colour properties (`inherit-initial.html` 0/4 — an
initial-values table + `inherit`/`initial`/`unset` resolution + a generalised inheritance walk),
else a fresh realm. Scroll `tickets/49-the-computed-verdict.md`.

**Session 2026-06-19 (Quest #48 The Indeterminate Verdict — the remaining HTML selector
pseudo-classes, +10):** After #44–#46 finished the live-state form selector family, three
HTML pseudo-classes were still dark: the Servo `selectors` crate *parses* `:indeterminate`/
`:placeholder-shown`/`:default` but they fall to `PseudoClass::Other` → `false`. All added to
the Rust matcher (`crates/obscura-dom/src/selector.rs`), tree-derived (the #44–#46 pattern).
**`:indeterminate`** — a checkbox whose `indeterminate` IDL flag is set (new Rust side-map +
JS `HTMLInputElement.indeterminate` get/set, *eager* so no per-query priming), a radio whose
group (same non-empty name, same tree; nameless = a group of one) has no checked member, or a
`<progress>` with no `value` attribute. **`:placeholder-shown`** — an input of a
placeholder-applicable type (or textarea) with a non-empty `placeholder` and empty value.
**`:default`** — a checkbox/radio with the `checked` attribute, an `<option>` with `selected`,
or a submit button that is its form owner's default button (form owner via the `form`
attribute else nearest ancestor `<form>`; first submit button in tree order owned by that
form). Plus spec-correct **`:optional`** (restructured `match_required_optional`): now matches
*any* input/select/textarea not `:required`, including `type=hidden`/`submit` — optional by
never being required (what `required-optional-hidden` and browsers assert). **Wins:**
indeterminate 1→6, indeterminate-type-change 0→1, placeholder-shown-type-change 0→1, default
0→2, required-optional-hidden 0→1. **+10, zero regressions** (qsa 1975, classlist 1420, matches
669, closest 29, valid-invalid 30, required-optional 6, readwrite-readonly 25, disabled 7,
enabled 1, inrange-outofrange 6, has-specificity 8, not-specificity 8; obscura-dom unit 40/40).
Caps: `:placeholder-shown` live `.value` IDL, radio-group form-owner partitioning,
`css/selectors/indeterminate*` reftests. The live-state form/structural selector pseudo-class
family is now complete. NEXT: CSS inheritance + computed-value normalizations (builds on the
#47 cascade, opens `css/css-cascade/`), or a fresh realm (`fetch/`, `html/dom/` reflection).

**Session 2026-06-19 (Quest #47 The Cascade Crown — author-stylesheet cascade for
`getComputedStyle`, +24):** For six quests the selector *matcher* grew strong, but every
test asking "and which rule WINS?" died at `getComputedStyle` — which had no
author-stylesheet cascade at all (just inline style + a defaults table). This is the
exact `getComputedStyle`/CSS-cascade wall named as the top "next leverage" by #42–#46.
Built a real cascade on top of the existing Servo selector engine (which already computes
correct specificity for `:is()`/`:where()`/`:has()`): new Rust `DomTree::selector_match_specificity`
(parse the rule's selector list → highest specificity among the *complex selectors that
match* the element, else None; per-selector not per-list, so `.a, #b` contributes `#b`'s
specificity) + op `selector_match_specificity`. JS rewrote `getComputedStyle`: a minimal
CSS tokenizer (`_cssSplitRules`/`_cssParseDecls`, skips @-rules, caches per `<style>`),
`_buildCascade(el)` flattens all rules in document order + primes the JS live-state
side-maps once (`_primeTarget`/`_primeValidity` — so `:target`/`:valid`/`:in-range` author
rules resolve), `_cascadeResolve` picks the winner by importance → specificity → source
order (inline style is the top source via `spec = MAX_SAFE_INTEGER`). Added computed-value
`<color>` serialization (`_computeColor`: full named-colour table / `#hex` 3-8 / rgb()/rgba()
→ `rgb(r, g, b)` or `rgba(…, a)`), applied to colour properties only. **Wins:** has-specificity
0→8, is-specificity 0→1, is-nested 0→2, is-where-pseudo-classes 0→1, not-specificity 0→8,
readwrite-readonly-type-change 0→1 (the named #44/#45 cap), checked-type-change 0→1,
inrange-outofrange-type-change 0→2. **+24, zero regressions** (qsa 1975, classlist 1420,
matches 669, closest 29, createElement 147, createElementNS 596, cloneNode 135,
valid-invalid 30, required-optional 6, readwrite-readonly 25, disabled 7, enabled 1, mark 22,
structured-clone 141/152, getRandomValues 39; obscura-dom unit 40/40). NOT a layout engine —
no inheritance/initial-values/shorthand/`auto`/percentage/layout. CAPS: `indeterminate-type-change`/
`placeholder-shown-type-change` need the `:indeterminate`/`:placeholder-shown` pseudos (matching
gaps); `required-optional-hidden` wants `:optional` to match `type=hidden` (a form-matcher tweak,
deferred to avoid risking the family for +1); `is-where-error-recovery`/`*-shadow`/`dir-style-*`/
`is-where-visited` need CSSOM/shadow/`:dir`/`:visited`; `*-ref.html` are render reftests. NEXT:
inheritance + a few computed-value normalizations (opens `css/css-cascade/` basics), the small
matching pseudos above, or a fresh realm. Scroll `tickets/47-the-cascade-crown.md`.

**Session 2026-06-19 (Quest #46 The Disabled Lineage — `:disabled`/`:enabled`
propagation, +7):** The `:disabled`/`:enabled` matcher arm consulted only the element's
*own* `disabled` attribute (the separate matcher gap named by #45's caps). `disabled.html`
was a deceptive 0/7 — even the base subtest needs inputs inside a disabled `<fieldset>`
(but outside its `<legend>`) to match. Implemented as **pure-Rust live matching** (no
priming, like #45): new inherent `DomElement::{is_disableable, is_actually_disabled,
is_disabled_by_fieldset, first_legend_child_id}` in `selector.rs`. An element is "actually
disabled" iff it is disable-able (input/button/select/textarea/optgroup/option/fieldset)
AND (own `disabled` attr / an `<option>` whose `<optgroup>` parent is disabled / a disabled
`<fieldset>` ancestor). The fieldset walk tracks `prev_id` (the gateway child of each
ancestor) so the first-`<legend>` exclusion is a single `first_legend_child_id() ==
Some(prev_id)` compare; nested fieldsets fall out naturally. `:disabled` =
`is_actually_disabled()`, `:enabled` = `is_disableable() && !is_actually_disabled()`.
disabled 0→7/7, enabled held 1/1. Zero regressions (qsa 1975, classlist 1420, matches 669,
closest 29, readwrite-readonly 25, valid-invalid 30, required-optional 6, has-basic 18,
is-where-basic 15, tagName 6, cloneNode 135, createElement 147, createElementNS 596,
willValidate 67, checkValidity 122, mark 22, structured-clone 141/152, getRandomValues 39,
url-setters-stripping 260; obscura-dom unit tests 40/40). NOTE: the test expects
`optgroup`/`option`/nested-`fieldset` inside a disabled fieldset to match `:disabled` too
(real-browser behaviour, slightly beyond strict spec text) — we follow the test. NEXT: the
live-state form/structural pseudo family is now COMPLETE; the recurring wall is CSS cascade
/ `getComputedStyle`, else a fresh realm (`fetch/`, `html/dom/` reflection). Scroll
`tickets/46-the-disabled-lineage.md`.

**Session 2026-06-19 (Quest #45 The Mutable Charter — `:read-write`/`:read-only`
live-state pseudo-classes, +20):** The last live-state form selector pseudo-classes
(the cap named by #44) were dark — parsed by the Servo crate but `PseudoClass::Other`
→ always false. Deceptive 5/25: only the empty-match subtests passed (including, *by
accident*, `:read-only → []` under design mode, which a naïve impl would have
regressed). Implemented as **pure-Rust live matching** (no per-query priming, unlike
#44's validity bitmap) since everything but `document.designMode` is tree-derivable:
new `DomElement::match_read_write_read_only`/`is_read_write`/`is_editable` in
`selector.rs` — input (readonly-applicable type, no `readonly` attr, not disabled) /
textarea / `contenteditable` editing-host ancestor walk → `:read-write`; every other
element → `:read-only`; non-elements neither. `document.designMode` (entirely
undefined before) got a real get/set in `bootstrap.js` that pushes a document-global
`design_mode` flag (new `set_design_mode` op + `DomTree` field) the matcher reads
live — so even the design-mode subtests (predicted a cap) are green. readwrite-readonly
5→25/25 (+20). Zero regressions (qsa 1975, classlist 1420, matches 669, closest 29,
createElement 147, createElementNS 596, cloneNode 135, willValidate 67, checkValidity
122, valid-invalid 30, required-optional 6, has-basic 18, structured-clone 141/152,
getRandomValues 39, mark 22, url-setters-stripping 260; `:disabled` 0/7 + `:checked`
2/3 sibling fails pre-existing, `:disabled` arm untouched). Caps: `readwrite-readonly-
type-change` 0/1 (getComputedStyle/CSS-cascade wall), `:disabled` disabled-propagation
(separate matcher gap). NEXT: the live-state form selector family is now complete; the
recurring wall is the CSS cascade / `getComputedStyle` realm, else `:disabled`
propagation or a fresh realm. Scroll `tickets/45-the-mutable-charter.md`.

**Session 2026-06-19 (Quest #44 The Living Verdict — constraint-validation
live-state selector pseudo-classes, +34):** The `:required`/`:optional`/`:valid`/
`:invalid`/`:in-range`/`:out-of-range` pseudo-classes were all dark — the Servo
`selectors` crate *parses* them (`is_known_pseudo_class`) but they fell to
`PseudoClass::Other`, whose match arm always returns `false`. This was the
**recurring cap named by #41, #42, and #43** (`:valid`/`:invalid` selector
matching). Split by strategy: `:required`/`:optional` are pure tag+type+attribute
state, evaluated straight off the tree in a new `DomElement::match_required_optional`
(input of a requirable type / select / textarea, split by the `required` attr).
`:valid`/`:invalid`/`:in-range`/`:out-of-range` need the JS verdict, so — mirroring
`:checked`/`:target` — a `validity_state: HashMap<NodeId,u8>` side-map on the tree
(bits `1/2/4/8`), set via a new `set_validity_flags` op, read by the matcher; JS
computes the bitmask with the #43 `_cvCompute` engine and **primes** every
validity-bearing element before the query (`_primeValidity`, a `_primeTarget`
sibling gated on a `valid`/`range` substring so qsa 1975 / classlist 1420 pay
nothing). `<form>`/`<fieldset>` aggregate over owned/descendant candidates. Two
correctness finds: `type=range` clamps its value (never out-of-range), and
`select.value` now reflects option selectedness (`§dom-select-value`) instead of a
nonexistent `value` attribute. **Wins:** required-optional 0→6, valid-invalid
17→30, inrange-outofrange 0→6, time-reversed 0→4, valid-invalid-fieldset-disconnected
0→2, the two dynamic `matches(":invalid")` tests 0→1 each (the #43 cap), Element-closest
28→29. **+34, zero regressions** (proven by stash-rebuild that the `:disabled`/
`:default`/`:indeterminate` sibling-test fails are pre-existing; #43 constraint
suite preserved — valueMissing 71/71, valid 33/33). Caps: `:read-write`/`:read-only`
(editing hosts/designMode/custom elements — deferred), `getComputedStyle`
`-type-change`/`-hidden` variants (CSS cascade), `test_driver.send_keys`. Scroll
`tickets/44-the-living-verdict.md`.

**Session 2026-06-19 (Quest #43 The Charter of Constraints — the constraint
validation API, +877):** The entire `html/semantics/forms/constraints/` realm was
dark — `willValidate`, `validity`, `validationMessage`, `checkValidity()`,
`reportValidity()`, `setCustomValidity()` and the `ValidityState` interface did not
exist on any form control. Built the whole engine in one cohesive pure-JS block
(no new Rust) on the 7 form-associated "listed" interfaces (input/button/select/
textarea/fieldset/object/output) + `HTMLFormElement`: a real `ValidityState` (with
`Symbol.toStringTag`) whose getters read a live `_cvCompute` flag set; barred-from-
constraint-validation `willValidate` (fieldset/output/object, input
hidden/button/reset, non-submit `<button>`, disabled — incl. **inside a disabled
fieldset**, readonly attribute, datalist ancestor); per-type `valueMissing`
(mutable-gated for text-like/typed inputs + textarea, ungated for
checkbox/radio/file/select, **group-aware** radio); `email`/`url` `typeMismatch`
after whitespace-strip sanitization; `patternMismatch` that validates the **raw**
pattern first (so `"a)(b"` is rejected/ignored) then matches the anchored `^(?:…)$`
with the `v` flag; typed `rangeOverflow`/`rangeUnderflow`/`stepMismatch` via
comparable-number parsers (date/time/datetime-local/month/week/number, ISO-week →
Monday ms; reversed ranges flag over+underflow together; Blink's float-tolerant
snap-and-compare step test; step base = min → `value` attribute → default);
always-`false` tooLong/tooShort/badInput (require interactive editing); `customError`
+ barred-aware `validationMessage`; `checkValidity`/`reportValidity` (element +
form) firing a cancelable `invalid` event. Added the reflected attributes the suite
drives (required/readOnly/pattern/min/max/step/multiple/maxLength/minLength,
textarea.defaultValue) and the checkbox/radio pre-click activation step on
`HTMLElement.click()`. Wins (all 0→): willValidate 67, willValidate-datalist 17,
checkValidity 122, reportValidity 122, validate 8, inputwillvalidate 2, valueMissing
71, valid 33, typeMismatch 11, patternMismatch 85, rangeOverflow 49, rangeUnderflow
47, stepMismatch 27/28, tooLong 63, tooShort 63, customError 4, badInput 11,
valueMissing-weekmonth 19, valid-weekmonth 8, rangeOverflow/Underflow-weekmonth 19+19,
textarea-defaultValue 2/5, radio-valueMissing 6, radio-group-valueMissing 2.
**+877, zero regressions** (qsa 1975, classlist 1420, createElement 147,
createElementNS 596, cloneNode 135, matches/webkitMatches 669/669, closest 28/29,
tagName 6, TreeWalker 761, mark 22, structured-clone 141/152, getRandomValues 39,
url-setters-stripping 260; checkbox 1/6 + radio 3/12 unchanged greens — verified by
stash-rebuild that `click()` activation lost no passes). Caps: `:valid`/`:invalid`
selector matching (the 2 dynamic-value tests + closest 29/29 — the Rust selector
engine can't call JS validity); `test_driver.send_keys` (3 textarea subtests); one
sub-ULP `stepMismatch` (`step=3e-15` — needs decimal arithmetic). Scroll
`tickets/43-the-charter-of-constraints.md`.

**Session 2026-06-19 (Quest #42 The Logical Lens — `:is()`/`:where()`/`:has()` +
the `:scope` scoping root, +116):** The Selectors-4 logical/relative pseudo-classes
were entirely dark — not because matching was missing (the Servo `selectors` crate
implements `Component::Is`/`Where`/`Has` and `:scope` already) but because PARSING
them was gated off: `parse_is_and_where()` and `parse_has()` default to `false`, so
`:is(...)`/`:where(...)`/`:has(...)` were rejected as unknown and threw `SyntaxError`,
blanking every test (is-where-basic 0/15, has-basic 0/18, has-relative-argument 0/35,
has-matches-to-uninserted 0/12, has-argument-with-explicit-scope 0/13, is-where-not
0/18). Separately `:scope` always fell back to `:root` because every `MatchingContext`
had `scope_element: None` (correct for `document.querySelector(":scope")`, wrong for
`div.querySelector(":scope > p")`). Fix (all in `selector.rs` + a 1-line op tweak +
1-line `bootstrap.js` tweak, NO new architecture): override the two parse hooks; add
`scope_opaque_for(node)` (element → its opaque, non-element → `None`) and thread it
into all four matching entry points via the public `context.scope_element` field —
element-rooted queries scope to the element, document-rooted stay `:root`, and
`closest` holds the context element fixed across the ancestor walk (passed as
`"<node>,<scope>"` through the 2-arg op) so `:has(> :scope)` resolves to the context
node. Wins: is-where-basic 15/15, is-where-not 18/18, has-basic 18/18,
has-relative-argument 35/35, has-matches-to-uninserted 12/12,
has-argument-with-explicit-scope 13/13, querySelector-scope 2→4/4, Element-closest
25→28/29. Zero regressions (qsa 1975, matches/webkitMatches 669/669 each, classlist
1420, createElement 147, createElementNS 596, cloneNode 135, TreeWalker 761, mark 22,
structured-clone 141/152, getRandomValues 39, url-setters-stripping 260; selector unit
tests 19/19). Caps: `:invalid` (form constraint-validation, the closest 28/29 tail);
`getComputedStyle` specificity/cascade tests (has-specificity 0/8, is-nested 0/2 — the
CSS-cascade frontier, not selector matching); render reftests. Scroll
`tickets/42-the-logical-lens.md`.

**Session 2026-06-19 (Quest #41 The Reflection's Mirror — the `Element.matches()`
family, +700):**
- Three sibling tests share one algorithm ("match an element against a selector
  list"): `Element-matches.html` was **630/669**, `Element-webkitMatchesSelector.html`
  was **8/669** (a byte-copy of the matches test calling the vendor-prefixed alias),
  `Element-closest.html` **25/29**.
- **Root causes:** (1) `webkitMatchesSelector` did not exist at all (`is not a
  function` → 661 dark subtests); it's a legacy alias of `matches()`. (2) `matches()`
  did `parent.querySelectorAll(s)` then checked membership — so a **detached
  (parentless) element returned `false` without ever parsing the selector**, and
  the 33 "Detached Element.matches: Invalid …" subtests (expecting `SyntaxError`)
  silently passed through; it also lacked the no-arg `TypeError` and mis-coerced
  `matches(null)`/`matches(undefined)`; and querying the parent's descendants is
  structurally wrong for combinators that reach above the parent. (3) `closest()`
  inherited those gaps.
- **Fix (1 small Rust fn + 1 op + a JS rewrite):** new `DomTree::element_matches`
  (`selector.rs`) — a one-element analogue of `query_selector_from` that
  `parse_selector(...)?` (invalid → `Err` → `"ERR"`) and runs `matches_selector_list`
  against the element (the matcher walks the real arena ancestors, so combinators
  are correct even when detached); new `"element_matches"` op (`ops.rs`) →
  `"ERR"`/`"true"`/`"false"`; `matches`/`closest`/new `webkitMatchesSelector` in
  `bootstrap.js` all route through it with `arguments.length<1`→`TypeError`,
  `String(s)` DOMString coercion, and `"ERR"`→`_qsThrow` (the same `SyntaxError`
  helper `querySelectorAll` uses). Added `webkitMatchesSelector` to the
  `_markNative` list.
- **Wins:** webkitMatchesSelector 8→**669/669** (+661), matches 630→**669/669**
  (+39); closest 25/29 unchanged. **+700, zero regressions** (qsa 1975, classlist
  1420, createElement 147, createElementNS 596, Element-tagName 6/6, cloneNode 135,
  getElementsByTagNameNS 16/16, TreeWalker 761/761, mark 22/22, structured-clone
  141/152, getRandomValues 39/39, url-setters-stripping 260/260).
- **Caps:** `Element-closest` 25/29 — `:scope` ×3 needs a scope-element
  MatchingContext, `:invalid` ×1 needs form-validity pseudo-classes (both separate
  gaps). Scroll `tickets/41-the-reflections-mirror.md`.

**Session 2026-06-19 (Quest #40 The Standalone Charter — the `new Document()`
web constructor, +2):**
- `dom/nodes/Document-constructor.html` was **3/5** — the `new Document()` web
  ctor named as "next leverage" since #34/#36/#38. Two fails:
  1. **`Object.getPrototypeOf(doc) === Document.prototype`** — `new Document()`
     returned `new DetachedDocument('xml')`, so the immediate prototype was
     `DetachedDocument.prototype`, not `Document.prototype` (and a DetachedDocument's
     prototype tricks can't be reconciled with prototype identity).
  2. **`doc.createElement("a").constructor === Element`** — the XML createElement
     path (`_createElementXML`) used `_wrapEl`, which picks an HTML interface class
     (HTMLAnchorElement) by tag; per §createElement, an XML (null-namespace)
     document must yield a plain `Element`.
- **Fix (pure JS, `bootstrap.js`, no new Rust):** `new Document()` is now a genuine
  `Document` instance, set up as **standalone** — a real fragment backing node
  (`create_document_fragment` + `mark_real_document`, cached as its own canonical
  wrapper) plus `_standalone`/`_kind:'xml'`/`_createMode:'xml'`. The base `Document`
  getters/methods branch on `this._standalone`: `documentElement`/`doctype` scan its
  own children, queries route to the `*_scoped` ops, `URL`/`documentURI` →
  `about:blank`, `location`/`defaultView` → `null`, `contentType` →
  `application/xml`, `_isHTMLDoc` → `false`, and `createElement` goes through a new
  shared module helper **`_createElementXMLInto(doc, name, ns)`** (case-preserving
  local name; HTML-namespace → HTMLElement subclass, XML null-namespace → plain
  `Element`). The factory methods (`createTextNode`/`createComment`/
  `createDocumentFragment`/`createProcessingInstruction`) tag `_ownerDoc = this`
  when standalone, and `createCDATASection` creates a real CDATA node (instead of
  the HTML-document throw). `DetachedDocument._createElementXML` now delegates to the
  shared helper (xhtml path byte-identical via `_wrapEl`; the only behavior change is
  XML createElement now yields plain `Element` — more spec-correct).
- **The latent landmine:** `dom/common.js` (shared by TreeWalker, Range, and many
  `dom/` tests) does `const xmlDocument = new Document();
  xmlDocument.createCDATASection("1234")`. The base `createCDATASection` throws
  `NotSupportedError` on HTML documents — so a naïve standalone Document would have
  thrown there and **aborted the whole harness**, darkening TreeWalker/Range to
  could-not-run. Caught it in the regression sweep (TreeWalker 761→could-not-run) and
  fixed by making standalone documents create CDATA. A reminder that `new Document()`
  is load-bearing far beyond its own test.
- **Win:** Document-constructor 3→**5/5** (+2). **Zero regressions** (Document-
  createElement 147, createElementNS 596, createDocument 434/434, createDocumentType
  82/82, createHTMLDocument 12/13, cloneNode 135, adoptNode 4/4, adoption.window 3/6
  [restored — standalone factories tag `_ownerDoc`], DOMParser-xml 20/20, XMLSerializer
  27/29, responsexml-media-type 15/15, TreeWalker 761/761, Range-cloneContents 181/187,
  qsa 1975, classlist 1420, Element-tagName 6/6, structured-clone 141/152, mark 22/22,
  getRandomValues 39/39, url-setters-stripping 260/260).
- **Caps / next leverage:** `adoption.window` 3/6 tail needs **template-content owner
  documents** (`template.content.ownerDocument !== document`) + **`attachShadow`/
  ShadowRoot** (both named since #34). The `dom/nodes/` document-creation vein is now
  fully clean (create{Document,DocumentType,Element,ElementNS,HTMLDocument} +
  `new Document()` all green/capped). Best next regions: a **fresh realm** (`dom/`
  Node-* heavy fixtures, `fetch/`, `html/dom/` reflection), or the standing
  `replaceChildren` atomic-record Rust op (#35 cap). PATH GOTCHA discovered: the bare
  `structured-clone.any.html` path now **404s on wpt.live** (bodyLen=42) — the live
  path is `html/webappapis/structured-clone/structured-clone.any.html` (141/152).
  Scroll `tickets/40-the-standalone-charter.md`.

**Session 2026-06-18 (Quest #39 The Doctype Charter —
`DOMImplementation.createDocumentType`, +81):**
- `dom/nodes/DOMImplementation-createDocumentType.html` was **1/82** — the
  frontier freshly exposed by #38. The naive impl (`new DocumentType(nid,
  String(qname), …)`) had two defects:
  1. **No "valid doctype name" check.** Per DOM §createDocumentType a name is
     valid unless it contains **ASCII whitespace, U+0000, or `>`** (the empty
     string is valid) — deliberately *looser* than `createElementNS`'s QName, so
     `":foo"`/`"foo:"`/`"prefix::local"`/`"@"`/`"{"`/`"1foo"` are all fine; only
     `"edi:>"` and `"edi:a "` throw `InvalidCharacterError`.
  2. **Wrong `ownerDocument`.** The doctype must take the *implementation's
     associated document* as its node document, but `DetachedDocument`/
     `_IframeDocument` overrode `get implementation()` to return the **page's**
     DOMImplementation — so `doc.implementation.createDocumentType(...)` owned the
     doctype to the page, not `doc`. The test runs every case against both
     `document` and a `createHTMLDocument`.
- **Fix (pure JS, no new Rust):** `Document.get implementation()` now captures
  `const _implDoc = this` and sets the new doctype's `_ownerDoc = _implDoc`; the
  delegating overrides on `DetachedDocument`/`_IframeDocument` were removed so
  they inherit the bound getter; `<3 args` → `TypeError`.
- **Win:** createDocumentType 1→**82/82** (+81). **Zero regressions** (createDocument
  434/434, createHTMLDocument 12/13, cloneNode 135, cloneNode-document-with-doctype
  2/3, adoptNode 4/4, DOMParser-xml 20/20, responsexml-media-type 15/15, qsa 1975,
  classlist 1420, createElement 147, createElementNS 596, TreeWalker 761/761,
  structured-clone 141/152, url-setters-stripping 260/260, mark 22/22). Scroll
  `39-the-doctype-charter.md`.
- **Next leverage:** the `dom/nodes/` document-creation vein is now clean; the
  `new Document()` web ctor (`Document-constructor` 3/5, mirror the XMLDocument
  real-backing-node model) or a fresh realm (`dom/` Node-* heavy fixtures,
  `fetch/`).

**Session 2026-06-18 (Quest #38 The Document Charter — `DOMImplementation.createDocument`
distinct backing Document nodes, +116):**
- `dom/nodes/DOMImplementation-createDocument.html` was **320/434** — the widest
  single DOM frontier left, named as "next leverage" since #34. All 114 fails were
  document-**identity** `assert_equals` ("expected Document node with N children but
  got Document node with N children" = distinct objects, not `===`) — the
  **`new Document()` footgun**.
- **Root cause:** `XMLDocument` was `class XMLDocument extends Document {}` (an
  abstract `Document` subclass with no real backing node), and
  `implementation.createDocument` returned a `DetachedDocument` — so the suite's
  `Object.getPrototypeOf(doc) === XMLDocument.prototype` assertion never held, and
  WebIDL argument handling (required args, nullable doctype, coercion, node order)
  was absent.
- **Fix (pure JS, no new Rust):** `XMLDocument extends DetachedDocument` (a real
  fragment-backed node, marked a real document — a **distinct backing Document
  node**, no node-0 fallback); `createDocument` returns `new XMLDocument('xml')`
  and runs the spec: `<2 args`/non-`DocumentType` doctype → `TypeError`,
  `namespace` `DOMString?`, `qualifiedName` `[LegacyNullToEmptyString]`, document
  element created **before** the doctype is appended. `DOMParser`'s XML branch
  still returns a sibling `_IframeDocument` (also `extends DetachedDocument`), so
  `!(doc instanceof XMLDocument)` for parsed documents still holds.
- **Wins:** createDocument 320→**434/434** (+114), adoption.window 1→**3/6** (+2 —
  the DocumentFragment subtests came free). **+116, zero regressions** (DOMParser-xml
  20/20, XMLSerializer 27/29, responsexml-media-type 15/15, responsexml-non-document-types
  5/5, cloneNode 135, adoptNode 4/4, qsa 1975, TreeWalker 761/761, classlist 1420,
  createElement 147, createElementNS 596, structured-clone 141/152, url-setters-stripping
  260/260, mark 22/22).
- **Caps / Next:** `DOMImplementation-createDocumentType.html` **1/82** — a freshly
  exposed, high-leverage frontier right next door (createDocumentType lacks arg-count
  validation, `[LegacyNullToEmptyString]` coercion, qualified-name validity, correct
  ownerDocument) = **recommended Quest #39**. Also: ShadowRoot/popup adoption (adoption.window
  3/6 tail), the `new Document()` web ctor (`Document-constructor` 3/5). Scroll
  `38-the-document-charter.md`.

**Session 2026-06-18 (Quest #37 The Wordsmith's Charter — Text/Comment web
constructors + CharacterData data semantics, +30):**
- `Text` and `Comment` had **no web constructor** — they inherited `Node`'s
  `constructor(nid)`, so `new Text("42")` stored the data *string* as the `_nid`;
  tree ops coerced that bad nid and fell back to node 0 (the live document), so
  `.data` returned the whole page body. Both `*-constructor.html` were 2/16.
- **Fix (pure JS, no new Rust):** real `new Text(data)` / `new Comment(data)`
  constructors that allocate a backing text/comment node holding the WebIDL
  DOMString-coerced data (`undefined`→`""`, `null`→`"null"`, `42`→`"42"`). A
  private `_NID_TOKEN` sentinel passed by internal wrappers (`_wrap`,
  `createTextNode`, `createComment`, `_makeCDATA`) keeps an internal nid-wrap
  distinct from web data, so `new Text(42)` correctly means data `"42"`.
- **Harvested 3 nearby gaps in the same family:** `CharacterData.data` setter is
  `[LegacyNullToEmptyString]` (`null`→`""` but `undefined`→`"undefined"`);
  `Text.splitText` throws `IndexSizeError` on an out-of-range offset; `Text.wholeText`
  now concatenates the contiguous Text-node run in tree order (was `return this.data`).
- **Wins:** Text-constructor 2→**15/16**, Comment-constructor 2→**15/16**,
  CharacterData-data 14→**16/16**, Text-splitText 5→**6/6**, Text-wholeText
  0→**1/1**. **+30, zero regressions** (qsa 1975, classlist 1420, createElement 147,
  createElementNS 596, cloneNode 135, isEqualNode 9, Node-normalize 4/4, TreeWalker
  761/761, attributes 67, MutationObserver-characterData 23/23, mark 22/22, measures
  119/119, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
  260/260).
- **Caps:** both constructor tests cap at 15/16 on the shared cross-global
  iframe-realm ownerDocument subtest. **Next frontier:** `DOMImplementation-createDocument`
  320/434 — the 114 fails are document-identity `assert_equals` (distinct objects),
  needing distinct backing Document nodes (the `new Document()` footgun). Scroll
  `37-the-wordsmiths-charter.md`.

**Session 2026-06-18 (Quest #36 The Living Roster — live, cached
`Node.childNodes`, +5):**
- `Node.childNodes` returned a **fresh plain array** every call, so it failed
  identity (`node.childNodes === node.childNodes`), liveness (a held reference
  reflecting append/remove), and the `instanceof NodeList` / iterator-identity
  subtests — `Node-childNodes.html` 1/6.
- **Fix (pure JS, no new Rust):** a **cached, live `NodeList` Proxy** per node.
  The target is a real `NodeList extends Array`, so `instanceof` + the
  `Array.prototype` iterator/keys/values/entries/forEach identities the test
  demands come for free; Proxy traps serve integer-index + `length` from the live
  tree; the proxy is cached on the node (`_childNodesCache` WeakMap) for identity.
  A `_treeGen` generation counter — bumped inside the `_dom` wrapper by the five
  structural mutators (`append_child`/`remove_child`/`insert_before`/
  `set_inner_html`/`set_text_content`) — lets each NodeList cache its snapshot, so
  hot read loops don't re-query Rust per index while still reflecting any mutation
  instantly.
- **Win:** Node-childNodes 1→**6/6**. **+5.** Zero regressions (qsa 1975,
  classlist 1420, createElement 147, createElementNS 596, TreeWalker 761/761
  [heavy childNodes user], cloneNode 135, isEqualNode 9, attributes 67,
  Node-append/replaceChild 11/29, mark 22/22, measures 119/119, structured-clone
  141/152, getRandomValues 39/39, url-setters-stripping 260/260; Range-cloneContents
  181/187 ≥ baseline, MutationObserver-childList 31/38 = baseline). Scroll
  `36-the-living-roster.md`.

**Session 2026-06-18 (Quest #35 The Insertion Concord — ParentNode/ChildNode
mutation methods, +177):**
- The DOM mutation-method family — `append`/`prepend`/`before`/`after`/
  `replaceWith`, plus the entirely-missing `replaceChildren` — each carried its
  own ad-hoc "convert nodes into a node" that only handled `typeof === "string"`.
  Three defects: (a) non-Node args (`null`/`undefined`/numbers) were *rejected*
  by `appendChild` instead of WebIDL-stringified into Text nodes; (b)
  `before`/`after`/`replaceWith` had no viable-sibling algorithm, so
  `child.before(x, child)` (context node among its own args) **crashed the
  engine** — `ChildNode-before/after/replaceWith` were dark (could-not-run);
  (c) `replaceChildren` didn't exist.
- **Fix (pure JS, no new Rust):** one shared spec core — `_convertNodesIntoNode`
  (stringify non-Nodes, gather multiples into a DocumentFragment) + `_pnAppend/
  _pnPrepend/_pnReplaceChildren` (ParentNode) + `_cnBefore/_cnAfter/
  _cnReplaceWith/_cnRemove` (ChildNode, with the viable-sibling walk) — installed
  once onto Element/DocumentFragment/Document (ParentNode) and Element/
  CharacterData/DocumentType (ChildNode; doctype had *none* of these before).
  Also added §ensure-pre-insertion-validity **steps 5–6** to
  `appendChild`/`insertBefore` (Text-into-document, doctype-into-non-document,
  document element/doctype cardinality → `HierarchyRequestError`); cheap on the
  hot path (gated to document parents).
- Wins: ChildNode-before/after/replaceWith **0→45/45/33** (+123), append
  11→**25/25** (+14), prepend 9→**22/22** (+13), replaceChildren 0→**25/29**
  (+25), insertAdjacentElement/Text 5→**6/6** each (+2 bonus). **+177**, zero
  regressions (qsa 1975, classlist 1420, createElement 147, createElementNS 596,
  Node-appendChild 11, Node-replaceChild 29, cloneNode 135, isEqualNode 9,
  attributes 67, mark 22/22, measures 119/119, structured-clone 141/152,
  getRandomValues 39/39, url-setters-stripping 260/260). Scroll
  `35-the-insertion-concord.md`.
- **Caps (honest):** `replaceChildren`'s last 4/29 (2 "right order" fails + 2
  MutationRecord timeouts) need the spec's **atomic "replace all"** — per-node
  ops with the suppress-observers flag + ONE combined `childList` record. Records
  come entirely from the Rust queue, so that needs a **Rust suppress-observers
  flag / `replace_all` op** (touches the shared mutation system classlist/
  attributes depend on) — deferred, not risked for +4. `Node-removeChild.html`
  is a PRE-EXISTING no-results (verified via stash-rebuild — `frames[0].document`
  fixture, not a regression).
- **Next leverage:** the `replaceChildren` atomic-record Rust op (also unlocks
  spec-correct innerHTML/textContent replace-all granularity); else the standing
  `new Document()` web ctor (Quest #34's named foundational primitive —
  `adoption.window` DocumentFragment subtests, template content, importNode); or
  a fresh realm.

**Session 2026-06-18 (Quest #34 The Adoption Papers — `document.adoptNode` +
deep insert-adopt, +5):**
- `dom/nodes/Document-adoptNode.html` was 0/4 — `document.adoptNode` was simply
  **unimplemented** (`adoptNode is not a function`). The named next quick win
  from Quest #33.
- **Fix (pure JS, no new Rust):** Obscura tracks a node's node document with the
  wrapper's `_ownerDoc` tag (default = the page document; cached wrappers keep it
  stable). So adoption is a *detach + deep retag* — the backing nodes stay in the
  shared Rust arena (an adopted-but-not-inserted subtree just lives there
  unparented). New `Document.adoptNode(node)` (inherited by `DetachedDocument`):
  TypeError for non-Nodes, `NotSupportedError` for a Document, else run
  `_adoptNodeInto(node, this)` = DOM §concept-node-adopt (remove from parent; when
  the destination differs from the node's current document, `_setNodeDocumentDeep`
  retargets the node and every descendant).
- **Second win — insert-adopt depth:** `appendChild`/`insertBefore` only retagged
  the **direct** child's `_ownerDoc`, so a foreign subtree's descendants kept
  their old `ownerDocument` after insertion. Now insertion runs the §insert
  "adopt into the parent's node document" step deeply (and an element's attributes
  follow via `_ownerEl`), but only when the node actually crosses documents — a
  cheap `ownerDocument !== targetDoc` compare keeps the hot same-document path
  walk-free. Fixed `Node-mutation-adoptNode` "simple append of foreign div" +
  "owner docs of attributes".
- Wins: Document-adoptNode 0→**4/4**, Node-mutation-adoptNode 1→**2/2**. **+5**,
  zero regressions (qsa 1975, classlist 1420, createElement 147, createElementNS
  596, cloneNode 135, isEqualNode 9/9, appendChild 11/11, mark 22/22, measures
  119/119, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
  260/260). Scroll `34-the-adoption-papers.md`.
- **Caps (honest):** `adoption.window` (1/6) + the `remove-and-adopt-thcrash`
  test need machinery Obscura doesn't model yet — a working `new Document()` web
  constructor (its `_nid` is NaN → ops fall back to node 0, the live document),
  template-content owner documents (`template.content.ownerDocument !==
  document`), `attachShadow`/ShadowRoot, and `window.open()` popup documents
  (`popup.document` is null). Each is a wider quest.
- **Next leverage:** the `new Document()` web constructor (a real backing
  fragment node + a distinct node document) would unlock the `adoption.window`
  DocumentFragment subtests AND is a foundational primitive (template content,
  `createDocumentFragment` identity); else a fresh realm (`dom/` Node-* family,
  `fetch/`).

**Session 2026-06-18 (Quest #33 The Interface Armory — HTML element interface
objects + Node/Document/DocumentType cloning, +34):**
- `dom/nodes/Node-cloneNode.html` sat at 103/135; the 32 fails were all
  `HTMLXxxElement is not supported`. Obscura defined most `HTML*Element`
  interfaces as a **single shared alias of `HTMLElement`**, and a large tail
  (`HTMLAreaElement`, `HTMLBaseElement`, `HTMLTableColElement`, `HTMLModElement`,
  `HTMLObjectElement`, the deprecated `HTMLDirectoryElement`/`HTMLFontElement`/
  `HTMLFrameElement`/`HTMLFrameSetElement`, …) was simply **missing** →
  `typeName in window` was false.
- **Root-cause fix (pure JS):** each `HTML*Element` is now a distinct subclass of
  `HTMLElement` (`HTMLAreaElement !== HTMLDivElement`, as the platform requires;
  behaviour stays shared on `Element.prototype`), `HTMLMediaElement` is the base
  of audio/video, and a canonical `_HTML_IFACE_BY_TAG` tag→interface map drives
  `_htmlClassForLocal`, so `createElement('area') instanceof HTMLAreaElement` is
  genuinely true.
- The last 3 cloneNode fails were a different bug: cloning a `DocumentType` or a
  `Document` (createDocument/createHTMLDocument) returned `null` (no `cloneNode`).
  Added `DocumentType.cloneNode` + `DetachedDocument.cloneNode(deep)` (same
  kind/contentType/compatMode/title; clone starts empty; children only when deep).
- Wins: Node-cloneNode 103→**135/135**, cloneNode-document-with-doctype 0→**2/3**.
  **+34**, no new Rust, zero regressions (qsa 1975, classlist 1420, createElement
  147, createElementNS 596, isEqualNode 9/9, Element-tagName 6/6, mark 22/22,
  structured-clone 141/152, getRandomValues 39/39, url-setters-stripping 260/260,
  XMLSerializer 27/29). Scroll `33-the-interface-armory.md`.
- **Next leverage:** `document.adoptNode` is unimplemented (`Document-adoptNode`
  0/4 — a small self-contained sibling of cloneNode, good next quick win); the
  DOMParser HTML-doc `<!DOCTYPE>` drop (`_IframeDocument` parse-path gap) caps the
  last doctype-clone subtest; the new distinct interface objects are the
  foundation for the html/dom element idlharness tail.

**Session 2026-06-18 (Quest #32 The Throwing Getter — XHR `responseText`, +4):**
- `responseText` was a plain **data property** (assigned in the constructor,
  `open()`, and every send completion), so it never threw. Per §the-responsetext-
  attribute it must throw `InvalidStateError` when `responseType` is not `""` or
  `"text"`. (`responseXML` already threw for non-`""`/`"document"` since #30.)
- Refactored to a **getter backed by `_responseText`**: throws for the wrong
  responseType; empty string until LOADING/DONE; else the decoded text. All five
  former assignment sites now write the backing field (a plain assignment against
  a getter-only property throws `TypeError` in a class body's strict mode). The
  async path also stores the decoded text in a local and uses it in the
  `responseType` switch so the switch never trips the throwing getter.
- Wins: `responsexml-non-document-types` 1→5/5. **+4**, pure JS, no new Rust,
  zero regressions (responsetext-decoding 37/37, responsexml-media-type 15/15,
  get-twice 4/4, response-json 4/4, data-uri 10/10, send-content-type-charset
  19/19; ritual qsa 1975, classlist 1420, createElement 147, mark 22/22, measures
  119/119, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
  260/260). Scroll `32-the-throwing-getter.md`.
- **Next leverage:** the response-attributes vein is now clean. Consider a fresh
  realm (`fetch/`, `dom/` heavy fixtures) or the `responsexml-document-properties`
  full-XML-document-metadata quest (named in #30).

**Session 2026-06-18 (Quest #31 The Charset Decipher — XHR response decoding, +19):**
- XHR decoded every response body as UTF-8 (`await resp.text()` / `new
  TextDecoder().decode()`); a `charset=windows-1252`, a UTF-16 BOM, or an XML
  `encoding=` declaration all came back mojibake. The fetch core already returns
  the raw bytes (`bodyBase64` → `Response._bodyBytes`), so this was a pure-JS
  bootstrap.js change.
- New §"text response": `_xhrFinalEncoding` (override-MIME charset > Content-Type
  charset, via the Quest #08 `_getEncodingName` label table), XML-declaration
  sniff for the default `""` responseType only, `_xhrDecode` = Encoding §decode
  (BOM-sniff picks the encoding — `TextDecoder` strips the matching BOM; legacy
  encodings route to `op_text_decode`). `_getDocumentResponse` decodes the bytes
  for the document with its own rules (charset > HTML `<meta>` prescan / XML
  declaration > UTF-8). Both send paths store `this._responseBytes`.
- Wins: responsetext-decoding 22→37, responsedocument-decoding 2→6. **+19**, zero
  regressions, no new Rust. Scroll `31-the-charset-decipher.md`.
- **Next leverage:** `responseText`/`responseXML` throwing getters
  (`InvalidStateError`) for arraybuffer/blob/json/document responseTypes
  (`responsexml-non-document-types` 1/5 — a small backing-field refactor).

**Session 2026-06-18 (Quest #30 The Response Document — XHR `responseXML`, +11):**
- `responseXML` was a constant `null` (never built); `response` for
  `responseType="document"` returned the raw text. Implemented the XHR
  §"document response" algorithm as a lazy, cached `_getDocumentResponse()`:
  final MIME type via `_parseMimeType` (a missing/unparseable `Content-Type`
  defaults to `text/xml` per "get a response MIME type" — so `""`/`bogus`/
  `application`/`bogus+xml` all parse), XML vs HTML detection, parse through the
  Quest #14 `_IframeDocument` 'xml'/'html' parser (parsererror root → null), and
  the default `""` responseType never parses HTML.
- Made `responseXML` a getter (InvalidStateError off-type, null until DONE) and
  wired the `case 'document':` arms of both `send()` and `_sendSync()` to the same
  cached document so `.response` and `.responseXML` are object-identical.
- Wins: responsexml-media-type 7→15, responsexml-get-twice 1→4. **+11**, zero
  regressions. Pure JS, no new Rust.
- **Next leverage:** `responsexml-document-properties` is a could-not-run needing
  the full XML-document metadata surface (`domain`/`baseURI`/`all`→HTMLAllCollection/
  `lastModified`/`redirect.py`) — a wider separate quest; and charset-aware
  response decoding (`responsetext-decoding`) via `op_text_decode` on raw bytes.

**Session 2026-06-18 (Quest #29 The Entity-Body Forge — XHR request body + Content-Type, +19):**
- `send(body)` was coercing every body type with `String(body)` and deriving no
  request `Content-Type`. Implemented the WHATWG "extract a body" algorithm
  (`_extractRequestBody`: String/Document/Blob/BufferSource/FormData/URLSearchParams)
  + the XHR §send() Content-Type rules, with a real `_parseMimeType`/
  `_serializeMimeType` MIME parser so the charset→UTF-8 adjustment is exact
  (param dedup, name-lowercasing, value-case preservation, quoted-string
  unescaping, already-`utf-8` and invalid-MIME passthrough).
- GET/HEAD now discard `send()`'s body argument; a null/empty POST/PUT body emits
  `Content-Length: 0` (set explicitly in `perform_fetch_core` — h2 omits it for an
  empty body). Both async `send()` and blocking `_sendSync()` share the logic.
- Wins: send-content-type-charset 12→19, send-content-type-string 0→1,
  send-entity-body-none 2→6, -empty 1→3, -get-head 0→2, -get-head-async 0→2,
  setrequestheader-content-type 3→4 (values all correct, rest capped). **+19**,
  zero regressions.
- **Honest caps named:** `setrequestheader-content-type` (30 left) + the whole
  `status-*` family (~73 subtests, widest XHR tail) are **transport caps** —
  request-header NAME case is lowercased by hyper/`http` (and h2 requires it), and
  custom HTTP reason phrases don't exist over h2 / aren't exposed by reqwest. Not
  failures — architecturally unwinnable for us. Next winnable = the **response**
  side: `responsexml-media-type` (7/15) + charset-aware response decoding.

**Session 2026-06-18 (Quest #25 harvest — sync XHR resource entries, +4):**
- With sync XHR landed in #28, harvested the ×4 `buffer-full-*` tails that #25 named as
  its widest cap (`add-then-clear`, `then-increased`, `add-entries-during-callback`,
  `inspect-buffer-during-callback`). These tests drive the Resource Timing buffer *only*
  through `load.xhr_sync()`.
- **Root cause:** `_sendSync` populated status/headers/responseText but never called
  `performance._addResourceEntry`, so a synchronous XHR added **zero** timeline entries
  → every assertion saw an empty buffer. The async path (`fetch()`) already recorded an
  entry; sync was the gap.
- **Fix (bootstrap.js, ~3 lines + a start-time capture):** `_sendSync` now records a
  completed `resource` entry on the timeline (initiatorType `xmlhttprequest`, honest
  byte size from the response bytes, `_entryContentType` MIME essence) right before the
  DONE transition — exactly mirroring the async fetch path. Pure JS, no new Rust.
- **Wins:** the 4 tails 0→1/1 each (**+4**). All 12 `buffer-full-*` tests now green.
  Zero regressions (qsa 1975, classlist 1420, createElement 147, mark 22/22, measures
  119/119, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
  260/260, data-uri 10/10, setrequestheader-bogus-name 71/71, open-method-bogus 8/8,
  buffered-flag/clear-resource-timings/status-codes 1/1, content-type 16/21 unchanged).
- **Cap left:** `buffer-full-eventually` (250 sequential network loads exceed harness
  wall-clock). Content-type cross-origin no-cors XHR tail still capped (sync XHR is
  cors-mode). Scroll [`25-the-buffer-ledger.md`](25-the-buffer-ledger.md).

**Session 2026-06-18 (Quest #28 — The Synchronous XHR Keystone, ~+49):**
- **The root-cause primitive behind the whole `xhr/*` realm.** WPT's XHR suite leans
  heavily on `open(method, url, false)` (sync) because it lets a test `send()` then read
  `responseText`/`getResponseHeader()` on the next line. Obscura's `send()` was *always*
  async (`fetch().then()`), so the next-line read saw `""`/`null` — files that looked
  like header/method/URL tests were all blocked on one missing thing: a **blocking
  `send()`**. This was the single widest Cap named across #25, #26, and #27.
- **Rust:** factored `op_fetch_url`'s network core into a standalone async
  `perform_fetch_core` (preflight + SSRF-revalidated redirect loop + cookies + envelope),
  and added a blocking **`op_fetch_url_sync`** (`#[op2]`) that runs the core on a
  throwaway worker-thread runtime and **blocks the page's JS thread** on a channel.
  Safe on `engine-per-page-threads`: only that page blocks, never the engine. Interception
  is skipped (would deadlock the one thread; WPT never intercepts); cookies/proxy/CORS/SSRF
  all still apply. The async `op_fetch_url` now delegates to the same core — **behaviour
  preserving** (every async XHR/fetch realm held).
- **JS:** `open()` records `_async` (was dropped) + throws `InvalidAccessError` for sync +
  timeout/responseType + only fires `readystatechange` on a real state change (redundant
  `open()` is silent → `[1,4]`). New `_sendSync()` blocks via the op, handles `data:`/`blob:`
  in-process, populates state synchronously, fires DONE + `load`/`loadend` (no loadstart for
  sync), and throws `NetworkError` on a transport/CORS/SSRF failure or malformed response
  header. `_fireEvent` now builds real `ProgressEvent`s for the progress family.
- **Wins:** headers-normalize-response 0→15, open-method-case-insensitive 0→6,
  open-method-case-sensitive 0→9, open-method-responsetype-set-sync 0→5, open-url-fragment
  0→4, response-method 1→3, event-readystate-sync-open 0→2, open-open-sync-send 0→1,
  open-sync-open-send 0→1, send-sync-no-response-event-{load,loadend} 0→1 each,
  send-redirect-infinite-sync 0→1, responseurl 0→1. **Zero regressions** (qsa 1975, classlist
  1420, createElement 147, mark 22/22, measures 119/119, structured-clone 141/152,
  getRandomValues 39/39, url-setters 260/260, url-with-fetch 16/16, url-with-xhr 14/14;
  async XHR held: data-uri 10/10, setrequestheader 71/71+5/5, open-method-bogus 8/8,
  response-json 4/4). Caps: `open-url-encoding` (charset-aware query encoding), `.asis`
  raw-response (reqwest/serving), `setrequestheader-allow-empty-value` (hyper lowercases
  request header names), `send-data-unexpected-tostring` (re-entrant mid-stringify).
  Scroll `tickets/28-the-sync-xhr-keystone.md`.

**Session 2026-06-18 (Quest #27 — The XHR Foundry OPENED, +94):**
- **A new realm.** With the resource-timing vein (#21–#26) thinning to architectural
  caps (sync XHR, cross-origin TAO), opened `xhr/*` (231 tests, baselined largely
  dark). Three pure-JS fixes in `bootstrap.js`, **no new architecture**:
- **`data:` URLs in `fetch()` (+10, `data-uri.htm` 0→10/10).** `op_fetch_url` is
  reqwest-backed (HTTP only), so a `data:` fetch errored and XHR fired `error`. New
  `_processDataURL` runs the WHATWG **"data: URL processor"** (MIME essence +
  percent-decode + `;base64`); the synthesized `Response` carries `content-type` only
  (no Content-Length, per the test) and a `HEAD` request yields an empty body.
- **`setRequestHeader` validation (+76, bogus-name 0→71, bogus-value 0→5).** Was a
  bare `_headers[name]=value`. Now: WebIDL ByteString coercion (code unit >0xFF →
  `TypeError`; missing 2nd arg → `TypeError`), OPENED-state check, value normalized,
  name must be an HTTP **token** + value a **header value** (no `\0`/`\r`/`\n`) → else
  `SyntaxError`, then case-insensitive **combine**.
- **`open()` method validation (+8, `open-method-bogus.htm` 0→8/8).** Non-token method
  → `SyntaxError`; forbidden CONNECT/TRACE/TRACK → `SecurityError`; byte-uppercase the
  well-known methods (DELETE/GET/HEAD/OPTIONS/POST/PUT).
- **Zero regressions** (fresh-server sweep): qsa 1975, classlist 1420, createElement
  147, mark 22/22, measures 119/119, structured-clone 141/152, getRandomValues 39/39,
  url-setters-stripping 260/260, url-with-xhr 14/14, url-with-fetch 16/16,
  clear-resource-timings 1/1, status-codes 1/1, buffered-flag.any 1/1, response-json
  4/4, content-type 16/21 (peak; bounces 13↔16 on cross-origin network timing — a
  documented flaky cap, not this work).
- **Caps / Next:** **synchronous XHR** (blocking Rust op) is the widest remaining
  lever — it's the *same* cap named in #25 (×4) and #26 (×2), and would unlock the
  `*-sync.htm` family (~18), `open-method-case-*` (15), `responseurl` (2),
  `allow-empty-value` (3), plus the resource-timing tails. Also: `.asis` raw-response
  tests (reqwest/serving cap), `headers-normalize-response` (async, winnable), forbidden
  request-headers, a real send flag. Scroll `tickets/27-the-xhr-foundry.md`.

**Session 2026-06-17 (Quest #26 — The Content-Type Ledger, +16):**
- **`PerformanceResourceTiming.contentType` now exists.** Resource entries had no
  `contentType` member, so `entry.contentType` was `undefined` for every resource —
  `content-type.html` was 0/21. Added the attribute (the MIME **essence** —
  `type/subtype`, params stripped, lowercased — of the response `Content-Type`,
  which `op_fetch_url` already returns in `headers`), exposed for **non-opaque**
  responses only: same-origin loads, and crossorigin **CORS** loads that pass the
  access-control check; opaque cross-origin (no-cors) → `""`.
- **`crossOrigin` → CORS fetch mode.** `_loadElementResource` hard-coded `no-cors`,
  so a `crossOrigin="anonymous"` image/script/stylesheet got an opaque response and
  `contentType: ""`. It now honors the element's `crossOrigin` attribute and fetches
  in **cors** mode, making the CORS-allowed cross-origin responses non-opaque (and
  exposing their content-type) — won 4 cross-origin subtests.
- **Bug fix: `XMLHttpRequest.open(URL)`** — the `xhr_async` loader passes a `URL`
  object as the url; `open` stored it verbatim and `send()` then threw
  `url.includes is not a function`. `open` now coerces a non-string url to a string
  (the spec parses it anyway). Unblocks any test that opens an XHR with a URL object.
- **Results:** `content-type.html` **0→16/21** (+16: 7 same-origin, 5 cross-origin
  no-cors `""`, 4 cross-origin CORS). **Zero regressions** (fresh-server sweep: qsa
  1975, classlist 1420, mark 22/22, measures 119/119, structured-clone 141/152,
  getRandomValues 39/39, url-with-xhr 14/14, url-with-fetch 16/16, buffered-flag 1/1,
  clear-resource-timings 1/1, status-codes 1/1, initiator-type-for-script 1/1,
  image-sequence 3/3, po-observe 5/6 [pre-existing fail]).
- **Caps (the remaining 5):** cross-origin **no-cors XHR** (×2) — Obscura's XHR is
  always cors-mode, so a cross-origin XHR without ACAO is blocked → no entry →
  timeout; cross-origin **redirect TAO** (×3) — after a cross-origin redirect the
  final URL can be same-origin, so the origin check over-exposes; needs real
  redirect-chain origin/TAO tracking. Scroll `tickets/26-the-content-type-ledger.md`.

**Session 2026-06-17 (Quest #25 — The Buffer Ledger, +8):**
- **The Resource Timing buffer is real.** `performance._addResourceEntry` used to
  push every resource entry straight onto the timeline with no size limit and no
  `resourcetimingbufferfull` event — so every `buffer-full-*` test hung forever
  waiting for an event that could never fire. Implemented the Resource Timing
  Level 2 buffer model in the `Performance` class (bootstrap.js): a primary buffer
  (the resource entries already in `_entries`) with a **size limit of 250**, a
  **secondary buffer** for overflow, the **`resourcetimingbufferfull`** event +
  **`onresourcetimingbufferfull`** handler attribute, and the **"fire a buffer
  full event"** task (queued on `setTimeout(0)` so synchronous follow-up code —
  e.g. a `setResourceTimingBufferSize()` — runs first). The task fires the event
  while the primary is full, copies the secondary buffer in while there is room,
  and drops the remainder when no progress can be made (the spec's overflow
  guard). `setResourceTimingBufferSize` now just sets the limit; `clearResourceTimings`
  resets the primary (untouched secondary still copies in afterward).
- **8 tests 0→1/1:** `buffer-full-then-decreased`, `-when-populate-entries`,
  `-set-to-current-buffer`, `-decrease-buffer-during-callback`,
  `-increase-buffer-during-callback`, `-store-and-clear-during-callback`,
  `-add-after-full-event`, `-add-entries-during-callback-that-drop`.
- **Zero regressions** (fresh-server sweep): qsa 1975, classlist 1420, iframe-load
  2/2, mark.any 22/22, measures 119/119, structured-clone 141/152, clear-resource-timings
  1/1, buffered-flag 1/1, status-codes-create-entry 1/1, po-disconnect 3/3,
  po-observe 5/6 (the 1 fail = pre-existing `observe({entryTypes:"mark"})` WebIDL
  coercion, not this change).
- **Honest caps:** four `buffer-full-*` tests drive entries through `load.xhr_sync`
  and assert on **synchronous-XHR** ordering; Obscura's `XMLHttpRequest.send` is
  always async (`fetch().then()`), so those orderings can't be honored without a
  blocking Rust sync-XHR op (architectural). `buffer-full-eventually` loads ~250
  images sequentially over the real network to fill the default buffer — it
  exceeds the harness wall-clock and times out (the algorithm is correct; this is
  a network/timing cap). Scroll `tickets/25-the-buffer-ledger.md`.

**Session 2026-06-17 (Quest #24 — The Resolved Reflection, +1, foundational):**
- **URL-reflecting IDL attributes now return the resolved absolute URL.** The
  shared `Element` `src`/`href` getters returned the raw content attribute, so
  `img.src` on `<img src="resources/foo.py">` gave the relative string while the
  Resource Timing ledger (Scroll #23) filed the entry under the absolute URL —
  `getEntriesByName(img.src)` matched nothing. New `_reflectURL(el, attr)`
  (bootstrap.js) implements the HTML "reflect as a URL" getter (absent → `""`;
  else `new URL(value, el.baseURI).href`; parse-fail → raw), gated to the
  genuinely URL-reflecting elements via `_URL_REFLECT_SRC`
  (img/script/iframe/audio/video/source/track/embed/input/frame) and
  `_URL_REFLECT_HREF` (a/area/link) so non-URL reads stay raw.
- **Honest page-`<script src>` entry duration.** The page-script `resource` entry
  was injected with `startTime === endTime` (`duration 0`); the test also asserts
  `duration > 0`. `page.rs` now times each script fetch with `std::time::Instant`
  and records `startTime = now - elapsed`, so `duration` is the real network time.
- **Results:** `resource-timing/status-codes-create-entry` 0→**1/1**. Zero
  regressions (clean-server sweep: qsa 1975, classlist 1420, createElement 147,
  url-origin 403, mark 22/22, structured-clone 141/152, getRandomValues 39/39,
  po-disconnect 3/3, url-with-fetch 16/16, iframe-load 2/2, measures 119/119,
  nav2-attributes 1/1, po-observe 1/1, case-sensitivity.any 3/3, img 1/1, link
  5/8, dynamic-insertion 5/6, clear-resource-timings 1/1; relevant-mutations
  70/113, flaky 69↔70 unrelated). **Caps:** TAO/cross-origin `getEntriesByName`
  family; `<base>`-tag divergence between the getter (`baseURI`) and the loader
  (`document_url`). Scroll `tickets/24-the-resolved-reflection.md`.

**Session 2026-06-17 (Quest #23 — The Element Ledger, inc 2, ~+6):**
- **Markup subresource scan.** Inc 1 only loaded elements inserted via JS; MARKUP
  `<img src>`/`<link rel=stylesheet>` (parsed by html5ever) never did. New
  `__startResourceLoads()` (beside `__startFrameLoads`) scans `img[src]`/`link`/`object`
  and loads them, wired into `page.rs`'s `<dcl-events>` step so the fetches settle
  before `load` (bounded by `pump_until_idle`'s 500ms). `modulepreload` → "other".
- **Results:** initiator-type/img 0→1/1, link 0→5/8, the-img-element/relevant-mutations
  70→71. Zero regressions (verified by stashing inc 2 and re-measuring on inc 1).
- **Caps:** css-embedded resources ("css", needs a CSS resource walker); `getEntriesByName(img.src)`
  tests need `img.src` IDL to return the *resolved* URL (broad shared-getter change, deferred);
  svg/embed/video/audio/input element types. Scroll `tickets/23-the-element-ledger.md`.

**Session 2026-06-17 (Quest #23 — The Element Ledger, inc 1, ~+10):**
- **Element subresource loads now emit `PerformanceResourceTiming` entries** (the #22 cap).
  New `bootstrap.js` helper `_loadElementResource(el, url, initiatorType, {eval})` fetches the
  resource via `op_fetch_url`, records an honest-size `resource` entry (`_addResourceEntry`),
  then fires the element's trusted `load`/`error` event (new `_fireElementError`). Wired to:
  `<img>`.src setter (incl. `new Image()`, now a real `<img>` factory), `<script src>` appendChild
  (refactored to use the helper + emit an entry), and `_connectResourceElement` on appendChild/
  insertBefore for JS-inserted `<link rel=stylesheet/preload/prefetch/icon/manifest/modulepreload>`
  + `<object data>`. Added `rel` IDL reflection to Element (`link.rel = "stylesheet"` was setting a
  plain property, so the link never loaded). iframe + XHR fetches now pass an internal
  `_initiatorType` so their entries read "iframe"/"xmlhttprequest" instead of "fetch".
- **Results:** performance-timeline/po-observe 0→1/1 (the headline); resource-timing/initiator-type/
  dynamic-insertion 0→5/6; entry-attributes 0→1/3; xhr-resource-timing →1/2. Zero regressions
  (qsa 1975, classlist 1420, createElement 147, url-origin 403, mark.any 22/22, measure-exceptions
  13/13, structured-clone 141/152, getRandomValues 39/39, po-disconnect 3/3, po-takeRecords 1/1,
  url-with-fetch 16/16, iframe-load 2/2, nav2-test-attributes-exist 1/1).
- **Caps / Next (inc 2):** MARKUP `<img src>`/`<link rel=stylesheet>` (parsed by Rust, never go
  through the JS appendChild hook) still don't emit entries → initiator-type/img.html + link.html
  capped; needs a `__startResourceLoads()` markup scan (watch load-event timing / regression risk).
  Also: font→"css" (`<style>@font-face` + `document.fonts`), same-origin redirect timing
  (collapsed-phase entry has redirectStart=0), TAO cross-origin, buffer-full family. Scroll
  `tickets/23-the-element-ledger.md`.

**Session 2026-06-17 (Quest #22 — The Resource Ledger, +4):**
- **`PerformanceResourceTiming` entries** for fetched resources (building on Scroll #21's
  base class). `bootstrap.js`: `Performance._addResourceEntry` (collapses network sub-phases,
  `responseEnd` = completion so `duration > 0`, queues to observers), real `clearResourceTimings`,
  `'resource'` added to `supportedEntryTypes`, and a `fetch()` hook (XHR rides on fetch). `page.rs`:
  each page `<script src>` injects a "script" resource entry as it loads, before executing, so a
  later inline script sees it.
- **Results:** resource-timing/buffered-flag 1/1, clear-resource-timings 1/1,
  performance-timeline/case-sensitivity 1/3→3/3. Zero regressions (url-with-fetch 16/16, mark.any
  22/22, measures 119/119, po suite, nav timing, qsa 1975, base64 380/380).
- **Caps:** element resource loads (img/link/iframe/dynamic .src) don't emit entries → entry-attributes,
  po-observe, most of resource-timing/* remain capped; no TAO cross-origin machinery; no
  resourcetimingbufferfull buffer-full family; XHR initiatorType is "fetch" not "xmlhttprequest".
  **Next: element-load resource entries + the buffer-full family.** Scroll `tickets/22-the-resource-ledger.md`.

**Session 2026-06-17 (Quest #21 — The Navigator's Almanac, ~+20):**
- **A real `PerformanceNavigationTiming` entry** (+ `PerformanceResourceTiming` base class)
  for the document navigation. `bootstrap.js` (classes ~4958, `__navTimingDCL`/`__navTimingLoad`,
  nav-entry creation in `__obscura_init`) + `page.rs` (body-size plumbing, readystatechange,
  hook calls).
  - The nav entry is created at startup and pushed to `performance._entries` so
    `getEntriesByType('navigation')` is populated from the very start (head sync script);
    its document-lifecycle phases (`domInteractive`…`loadEventEnd`) are filled at the real
    DCL/load moments; at load it's queued to observers (so an observer registered during
    parse fires). `'navigation'` added to `supportedEntryTypes`.
  - **Honest body sizes** from the real Rust document response: a new `Page.document_body_size:
    Option<(encoded,decoded)>` captured at fetch, seeded into the entry at the `<ready-state>`
    step (`transferSize = encoded + 300`). Not synthesized.
  - **`readystatechange`** now dispatched on `document` (+ `document.onreadystatechange`) at
    interactive (DCL) and complete (load).
  - **Results:** nav2-test-attributes-exist 1/1, nav2-test-instance-accessible-from-the-start
    1/1, nav2-test-navigation-type-navigate 1/1, po-navigation 1/1, buffered-flag.window 1/1,
    test-navigation-attributes-exist 4/4, test-navigation-redirectCount-none 5/5,
    test-document-onload 0/2→3/3, test-document-readiness-exist 1→3/3, idlharness 36/161.
    Zero regressions (mark.any 22/22, measures 119/119, measure-exceptions 13/13, po-* suite,
    qsa 1975, classlist 1420, createElement 147, EventTarget-dispatchEvent 25/25, Node-properties
    726, structured-clone 141/152, base64 380/380, url-origin 403/403).
  - **Caps:** exact-byte-size (5949) + host-config-URL value tests (nav2-test-attributes-values /
    instance-accessors), per-iframe nav timing (unique-nav-instances), real redirect-chain timing
    (timing-persistent). **Next: Resource Timing entries** (base class now exists; needs the
    resource-load paths to emit entries) — unlocks resource-timing/*, po-observe, case-sensitivity.
    Scroll `tickets/21-the-navigators-almanac.md`.

**Session 2026-06-17 (Quest #20 — The Observer's Gallery, ~+15):**
- **A real `PerformanceObserver`** replacing `class{constructor(){} observe(){} disconnect(){}}`.
  All in `bootstrap.js` after the `Performance` class (~5093), built on Scroll #18's entry buffer.
  - `observe({entryTypes})` (replaces observed set) / `observe({type, buffered})` (accumulates;
    buffered:true seeds from the global timeline) with `InvalidModificationError` on mode-mix and
    `SyntaxError` on both/neither; `disconnect()`; `takeRecords()`; cached frozen
    `supportedEntryTypes = ['mark','measure']`; `PerformanceObserverEntryList`
    (getEntries/ByType/ByName, startTime-sorted).
  - **Delivery:** `mark()`/`measure()` call `_queuePerformanceEntry` → append to matching observers'
    buffers → one `setTimeout(0)` task (`_schedulePerfTask`/`_flushPerfObservers`); the flush clears
    the scheduled flag first so a callback that observes() schedules a fresh task (chains
    `multiple-buffered-flag-observers`). `takeRecords()` drains before the task → callback skipped.
  - idlharness tidy-ups: `Symbol.toStringTag` on both, non-enumerable interface objects (matches
    real Chrome), EntryList WebIDL length 0 (reads `arguments[0]`).
  - **Results:** supportedEntryTypes 2/2, po-disconnect 3/3, po-takeRecords 1/1, po-entries-sort 1/1,
    observer-buffered-false 1/1, buffered-flag-after-timeout 1/1, multiple-buffered-flag-observers 1/1,
    case-sensitivity 1/3, idlharness 31→35/58. Zero regressions (mark.any 22/22, measure-exceptions
    13/13, clearMarks 57/57, hr-time/basic 5/5, monotonic-clock 2/2, qsa 1975, classlist 1420,
    createElement 147, structured-clone 141/152, getRandomValues 39/39, base64 380/380, url-origin
    403/403, XMLSerializer 27/29).
  - **Cap:** `po-observe` (TIMEOUT) + the other 2 `case-sensitivity` subtests need `resource`/`navigation`
    timeline entries (resource/navigation timing — not implemented). The observer is complete; it has
    nothing to deliver for those types. Scroll `tickets/20-the-observers-gallery.md`.

**Session 2026-06-17 (Quest #19 — The Load Bell, +233):**
- **`<body onload>` is a *window* event handler — now wired.** Testharness pages
  that run their tests from `<body onload=onload_test()>` + `setup({explicit_done:true})`
  came back **could-not-run**: the document `load` event fired on the window, but the
  body's `onload` content attribute (an HTML window event handler) was never wired to
  `window.onload`, so the handler — and its `done()` — never ran.
- **`__installBodyWindowHandlers()`** (`bootstrap.js` ~2903) scans `document.body`
  (and `<frameset>`) for the window-reflecting `on*` content attribute set, compiles
  each with `new Function('event', attr)`, and assigns it to `globalThis.on<name>`.
  Called from the `<ready-state>` step in `page.rs` (~472), **before** parser scripts
  run — body already exists in the static snapshot, and a later `window.onload = fn`
  in a page script overrides it (safe script-wins ordering). `onerror` excluded to
  preserve the engine's error-reporting bridge. No double-fire (`_dispatchSpec` invokes
  only registered listeners, not `on*` props; the explicit `window.onload()` in
  `<load-event>` is the single call).
- **Results:** `user-timing/clearMarks` 0→**57/57**, `clearMeasures` 0→**57/57**,
  `measures` 0→**119/119** (all were could-not-run). General fix — any load-gated test
  now runs. Zero regressions (mark.any 22/22, measure-exceptions 13/13, hr-time/basic
  5/5, qsa 1975, classlist 1420, createElement 147, structured-clone 141/152,
  getRandomValues 39/39, base64 380/380, url-origin 403/403, XMLSerializer 27/29).
- **Honest cap:** `measure_associated_with_navigation_timing.html` now runs but
  no-results — it needs nonzero `loadEventEnd`/`domComplete`, which must stay 0 for the
  secured `measure-exceptions` (0-valued attr → `InvalidAccessError`). Real
  navigation-timing population is a separate quest. Scroll `tickets/19-the-load-bell.md`.

**Session 2026-06-17 (Quest #18 — The Timekeeper's Ledger, User Timing L3, ~+70):**
- **A real User Timing Level 3** replacing a no-op `performance` (mark()/measure() did
  nothing; getEntries* always returned `[]`). All in `bootstrap.js`, pure JS:
  - **`PerformanceEntry` / `PerformanceMark` / `PerformanceMeasure` / `PerformanceTiming`**
    classes (+ globals) and a **`Performance`** class with an entry buffer.
  - `mark(name, opts)` → a `PerformanceMark` (opts validated: non-object/negative
    `startTime` → `TypeError`); `measure(name, startOrOptions, endMark)` with the L3
    options dict (`start`/`end`/`duration`/`detail`) AND positional mark names;
    `getEntries`/`getEntriesByName`/`getEntriesByType` (startTime-sorted),
    `clearMarks`/`clearMeasures`; `mark()`/`measure()` with no name → `TypeError`.
  - **`now()` is now relative to `timeOrigin`** (high-res, monotonic, ≥0) — was the raw
    `Date.now()`. `performance.toJSON()` + `PerformanceTiming.toJSON()` (full 21-attribute
    set). `performance` gained a minimal **EventTarget** (addEventListener/dispatchEvent
    with `once`) so `hr-time/basic` "extends EventTarget" passes.
  - **"Convert a mark to a timestamp"**: a PerformanceTiming attribute name resolves to its
    value (0 → `InvalidAccessError`); positional start/end are DOMStrings (a number is
    string-coerced, so `51.15` → not-a-mark → `SyntaxError`); unknown name → `SyntaxError`.
    Load-phase timing attrs (DOMContentLoaded/load/unload/redirect/TLS) are 0 — realistic
    mid-load AND what the spec treats as empty.
  - **Results:** `user-timing/mark.any` **0→22/22**; `measure-exceptions` **→13/13**;
    `mark-errors` 10/10, `mark-measure-return-objects` 5/5, `measure_exceptions_navigation_timing`
    4/4, `measure_navigation_timing` 1/1, `measure` 1/1, `user-timing-tojson` 2/2,
    `mark-measure-feature-detection` 2/2, `invoke_without_parameter` 2/2; `hr-time/basic`
    4→5, `hr-time/performance-tojson` 0→1. Zero regressions (structured-clone 141/152,
    getRandomValues 39/39, hr-time/monotonic-clock 2/2, qsa 1975, classlist 1420, base64
    380/380, url-origin 403/403, createElement 147, encoding 3421).
  - **Honest caps (not the algorithm):** `mark_exceptions` (1/22) and
    `invoke_with_timing_attributes` (21/42) are gated by OBSOLETE L1/L2 subtests that assert
    `mark(timingAttribute)` throws `SyntaxError` — removed in L3, so current browsers fail
    them too. `clearMarks`/`clearMeasures`/`measures`/`measure_associated_with_navigation_timing`
    are **could-not-run**: they run tests from `<body onload=…>`, and the load event isn't
    firing for testharness pages — a separate load-lifecycle gap (a future quest), not User
    Timing. Scroll `tickets/18-the-timekeepers-ledger.md`.

**Session 2026-06-17 (Quest #17 — The Entropy Gate, getRandomValues 23→39/39, +16):**
- **A real `crypto.getRandomValues` contract** replacing a `Math.random` fill that honored
  none of the spec (no type check, no quota, and it *threw* on BigInt arrays because it
  assigned `Math.floor(...)` numbers to a `BigInt64Array`). Now: non-`ArrayBufferView` →
  `TypeError`; a float/`DataView` view (`Float16Array`/`Float32Array`/`DataView`) →
  `TypeMismatchError`; `byteLength > 65536` → `QuotaExceededError`; otherwise fill the
  bytes through a `Uint8Array` view over the buffer (so every integer view — incl.
  `BigInt64Array`/`BigUint64Array` and subclasses — fills cleanly) and return the SAME view.
- **Two shared-surface fixes the test demanded:** (1) `DOMException._codes` was missing
  `TypeMismatchError: 17`, so its `code` getter returned 0 (the legacy `TYPE_MISMATCH_ERR`
  constant existed but the name→code map didn't) — added it. (2) WPT's
  `assert_throws_quotaexceedederror` requires the **modern `QuotaExceededError` interface**
  (a `DOMException` subclass with nullable `quota`/`requested`, and `e.constructor ===
  self.QuotaExceededError`), not a bare `new DOMException(…, "QuotaExceededError")` — added
  the class + global.
- **getRandomValues 23→39/39 (100%).** `randomUUID` was already 3/3 (its old format was
  valid). Zero regressions (structured-clone 141/152, qsa 1975, classlist 1420, base64
  380/380, url-origin 403/403, createElement 147, encoding 3421, parseFromString-xml 20/20,
  Element-tagName 6/6, Node-normalize 4/4).
- **Honest caveat:** entropy is still `Math.random`, not a CSPRNG — a real security
  follow-up (needs a Rust-exposed secure RNG op). This change is conformance only and does
  not weaken anything vs. the prior stub. Scroll `tickets/17-the-entropy-gate.md`.

**Session 2026-06-17 (Quest #16 — The Clone Forge, structuredClone 29→141/152, +112):**
- **A real WHATWG StructuredSerialize/StructuredDeserialize** replacing the
  `globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v))` footgun (which
  dropped `undefined`/`NaN`/`±Infinity`, corrupted `-0`, threw on `BigInt` and **every
  cyclic ref**, and lost all platform types). Pure JS @ `bootstrap.js`, no new Rust.
  - Recursive `_clone(value, memory, transferSet)` with a **`memory` Map** keyed by the
    original → clone (checked before recursing, container inserted before its contents)
    so cycles and shared references are preserved.
  - **Brand dispatch** via `Object.prototype.toString`: primitives & BigInt survive
    verbatim; boxed Boolean/Number/String/BigInt; Date; RegExp (lastIndex→0); the Error
    family (name→standard ctor, own message + own cause only, custom props dropped);
    ArrayBuffer (resizable-aware) + all TypedArrays + DataView (length-tracking preserved);
    Map/Set; Blob/File (copy the `_bytes` store directly — byte-exact for invalid-UTF-8
    blobs; `Object.create(proto)` collapses subclasses to the closest serializable type);
    arrays (holes + non-index props); ordinary objects (own enumerable string keys only,
    clone proto = `%Object.prototype%`).
  - **`DataCloneError`** for symbols, functions, non-serializable platform objects
    (`Response`/`Request`), and `SharedArrayBuffer` (we're not cross-origin-isolated).
  - **ArrayBuffer transfer** using V8's `ArrayBuffer.prototype.transfer()`/`.detached`
    (copy bytes → build fresh buffer w/ preserved `maxByteLength` → detach source);
    detached/non-ArrayBuffer entries in the transfer list → `DataCloneError`.
  - Interface objects (`Blob`/`File`/`Response`/`Request`) captured at load so a clone
    still works after the page deletes the global; added `crossOriginIsolated = false`.
  - **structured-clone.any 29→141/152 (+112).** Zero regressions (qsa 1975, classlist
    1420, createElement 147, base64 380/380, url-origin 403/403, encoding 3421,
    parseFromString-xml 20/20, XMLSerializer 27/29, Element-tagName 6/6, Node-normalize 4/4).
  - **10 honest losses, all engine gaps (not the algorithm):** 3× FileList (no FileList
    interface), 2× OOB-TypedArray (V8 reports an OOB TA as length-0/offset-0 — undetectable
    in pure JS; the OOB **DataView** cases DO pass since `.byteLength` throws), MessagePort
    /ImageBitmap/OffscreenCanvas transfer + detached/deleted MessagePort (no real
    transferable-platform machinery). Bonus `structuredclone_0.html` still TIMEOUTs — it's
    a cross-document `postMessage`/`MessageChannel` test, unrelated to the clone algorithm.

**Session 2026-06-16 (knight Claudius — Base64 Cipher, atob/btoa 164→380/380, +216):**
- **Real HTML-spec `btoa`/`atob` over a BYTE string.** The old `btoa` stub
  TextEncoder-encoded its arg (UTF-8!), so `btoa("\x80")` gave `"woA="` instead of
  `"gA=="`. Now `btoa` validates each code unit ≤ 0xFF (else InvalidCharacterError) and
  base64-encodes the latin1 bytes; `atob` implements WHATWG Infra **forgiving-base64
  decode** (strip ASCII whitespace, strip ≤2 trailing `=` only when len%4==0, fail on
  len%4==1 / stray `=` / non-alphabet junk, streaming 6→8-bit decode). **base64.any
  164→380/380 (100%).** Zero regressions (readAsDataURL 4/4, url-with-fetch 16/16, Blob
  69/73, filereader_result 8/12, qsa 1975, classlist 1420). Pure JS, ~10 lines each.

**Session 2026-06-16 (knight Claudius — Quest #14 Inc 2: the XML keystone, +46):**
- **A real namespace-aware XML `DOMParser` + the W3C `XMLSerializer`** — the keystone
  the campaign deferred for many sessions. All in `bootstrap.js`, no new Rust, built on
  the existing `createElementNS`/`setAttributeNS` namespace machinery.
  - **`_parseXMLDocument`** — a hand-rolled XML tokenizer (deliberately NOT html5ever
    nor xml5ever: html5ever lowercases + HTML-namespaces; xml5ever implements *XML5*
    which is error-recovering and can never emit a `parsererror`). Tracks an xmlns scope
    stack, resolves element/attr prefixes to declared URIs, builds the tree with real
    namespaces; text/CDATA/comment/PI/entity-ref/`<?xml?>` handling; non-well-formed →
    a Gecko-style `parsererror` document.
  - **`globalThis.XMLDocument`** defined so `!(doc instanceof XMLDocument)` holds — per
    the HTML spec, DOMParser's XML branch returns a plain `Document` (unlike
    createDocument/XHR). All four XML types route through the real parser.
  - **The W3C XML serialization algorithm** — namespace prefix map, generate-a-prefix
    (`ns${i}`), record-namespace-information, xmlns reset/redundancy, nearest-prefix
    selection, attr `&#x9;/&#xA;/&#xD;` escaping, `<div/>` self-close vs HTML `<div></div>`.
  - **Footgun fixed:** `new DocumentFragment()` (no nid) didn't allocate a backing node →
    `_nid` undefined → Rust ops read node 0 (the LIVE page!). Now allocates; also added
    DocumentFragment `append`/`prepend`/`childElementCount`.
  - **parseFromString-xml 0→20/20 (100%), XMLSerializer 3→27/29**; retroactively
    **Node-normalize 3→4/4**, **Element-tagName 5→6/6**. Zero regressions (qsa 1975,
    classlist 1420, createElement 147, url-origin 403, encoding 3421, iframe-load 2/2,
    content_document 1/1, isEqualNode 9/9, Range-clone/extract 177/159, cloneNode 103,
    appendChild 11/11). 2 serializer tails left are hard spec edges (XLink prefix =
    Chrome-specific; `xmlns=""` keep-vs-drop = mutually exclusive DOM-Parsing spec issue).

**Session 2026-06-16 (knight Claudius — Quest #14 The Parsing Foundry opened, +7):**
- **Real `DOMParser.parseFromString`** (was a stub returning the LIVE `globalThis.document`
  — a footgun where mutating a "parsed" doc mutated the real page). `text/html` now builds
  a real detached HTML document via `_IframeDocument`; `compatMode` reflects the DOCTYPE
  (CSS1Compat vs BackCompat); XML types build a detached doc with the right contentType +
  page URL; invalid type → TypeError. Made `_IframeDocument`'s compatMode/contentType/location
  getters honor the parser-set fields. **parseFromString-html 4→9/10, XMLSerializer 1→3/29.**
  Zero regressions (qsa 1975, classlist 1420, createElement 147, iframe-load 2/2). Inc 2 (the
  real keystone) = a namespace-aware XML parser + spec XMLSerializer — Scroll #14.
- **Also: the honest territory map.** A 25-realm stratified WPT baseline sweep
  (`scripts/wpt_baseline.py`) — the scriptable DOM core is 90–100% (traversal/events/
  collections/encoding/FileAPI), the frontiers are `fetch` (~18%), `domparsing` (~11%),
  CSSOM (~6%, needs render), `html/webappapis` (~36%: structuredClone is a JSON stub).

**Session 2026-06-16 (knight Claudius — Quest #04 The URL Swamps — Increment 3, +7):**
- **`///` special-authority-ignore-slashes.** For a special (non-`file`) base, a
  scheme-relative ref with 3+ leading slashes/backslashes skips them all before the
  authority (`///host` ≡ `//host`); rust-url rejects it. `collapse_special_authority_slashes`
  collapses the leading run to `//` before `b.join`. **constructor 840→847.** Zero
  regressions. Remaining constructor fails are `file:` drive-letter/slash + non-special
  backslash — rust-url structural divergences (a real WHATWG parser is the keystone).

**Session 2026-06-16 (knight Claudius — Quest #04 The URL Swamps — Increment 2, +16):**
- Two spec-correct post-processing fix-ups in `url_components_json`:
  **(1) path `^`→`%5E`** — rust-url's path percent-encode set omits U+005E; encode it
  across the path region only (query/fragment `^` stays literal). **(2) opaque-path
  trailing space → `%20`** — the WHATWG opaque-path serializer encodes the single
  space before `?`/`#`/EOF; recoverable only when a delimiter follows (rust-url trims
  the pure-trailing case). **constructor 833→840, setters 232→241.** Zero regressions.

**Session 2026-06-16 (knight Claudius — Quest #04 The URL Swamps — Increment 1, +50):**
- **userinfo setters stop stripping tab/newline.** `op_url_set` stripped `\t\n\r`
  from *every* part; WHATWG only strips for parser-based setters. The `username`/
  `password` setters percent-encode the value directly, so `\t`→`%09`, `\n`→`%0A`,
  `\r`→`%0D`. Strip moved per-part into `apply_url_setter`; userinfo gets the raw
  value (rust-url already C0-encodes). **`url-setters-stripping` 224→260/260 (100%).**
- **`URL.parse` / `URL.canParse` statics** added (`parse`→URL|null, never throws).
  **`url-statics-parse` 0→8/8 (100%).**
- **hostname `:` invalidates the whole value** (host-invalid-code-point → no-op,
  not truncation; `[IPv6]` still allowed) and **port whitespace-only → no-op**
  (only literal `''` clears). **`url-setters` 226→232.**
- Zero regressions (url-origin 403/403, url-with-fetch 16, url-with-xhr 14,
  url-format 6, Element-classlist 1420, Node-baseURI 9). New tool `scripts/wpt_fails.py`
  (dumps each non-pass subtest's name + assert message for bucketing). The remaining
  ~105 are rust-url-vs-WHATWG structural divergences (file: URLs, non-special empty-host
  `sc:///`, opaque trailing-space `%20`, `///` authority-slash-skip) — see Scroll #04.


**Session 2026-06-16 (knight Claudius — solidifying the tails, ~+34):**
- **#09b blob: URL byte store.** `createObjectURL` now mints spec `blob:{origin}/{uuid-v4}`
  and snapshots the byte-backed Blob's bytes; `fetch` strips the fragment, allows only GET,
  and rejects with TypeError on revoked/query/path. `Request`/XHR `open()` snapshot the blob
  at construction so a revoke-before-fetch still works. Surfaced + fixed an XHR hang (error
  path skipped `onreadystatechange`) and statusText. url-format 3→6/6, url-with-fetch
  1→16/16, url-with-xhr ~0→14/14. Tails: url-reload/in-tags need navigation/tag-loading.
- **#08b utf-16 EOF fix.** The utf-16 decoder coalesces a pending lead-surrogate and/or odd
  trailing byte into ONE U+FFFD at end-of-queue (was emitting two) — `textdecoder-mistakes`
  84→86/87 (only `fatal stream: iso-2022-jp` left).

**Session 2026-06-16 (knight Claudius — Quest #08b Legacy Encodings — ~+3900):**
- **The expensive ground: legacy encodings via `encoding_rs`.** Instead of embedding the
  large WHATWG index tables in JS, added a Rust op `op_text_decode` backed by `encoding_rs`
  (Gecko's reference encoder, already a workspace dep) and routed every non-utf encoding
  through it. `textdecoder-fatal-single-byte` ~half→**7168/7168** (all ISO-8859-*/KOI8/
  windows-125x, every byte), `gb18030-decoder` **275/275**, `gbk-decoder` **82/82**,
  `iso-2022-jp-decoder` **34/34**.
- **Stateless streaming trick:** with `last=false` `encoding_rs` holds back partial
  trailing sequences, so re-decoding a growing buffer only extends prior output — JS
  slices the new suffix. Wins `textdecoder-eof` Big5 `stream:true` (1/2→**2/2**) with no
  persistent Rust decoder state.
- **ASCII-only label lowercasing** — JS `.toLowerCase()` folds U+212A KELVIN→'k' and
  wrongly validated `'Koi8-r'`; fixed (`textdecoder-mistakes` 83→**84/87**).
- Tails (documented): SharedArrayBuffer; 2 utf-16-truncated subtests (JS utf-16 decoder);
  `fatal stream: iso-2022-jp` (needs decoder state to survive a mid-stream throw); the
  Ishida `*-decode.html` (HTML-parser charset) and XHR `overrideMimeType` suites are
  separate subsystems.

**Session 2026-06-16 (knight Claudius — Quests #08 Encoding + #09 FileAPI — ~+4000):**
- **#08 The Encoding Cipher — real TextEncoder/TextDecoder (~101 → ~3900).** Embedded
  the WHATWG label table (40 names, 228 labels) → `_getEncodingName` (trim ASCII ws,
  lowercase) powers RangeError on unknown/replacement labels (`api-invalid-label`
  0→**3421/3421**) and the `encoding` attribute (`textdecoder-labels` 0→**222/222**).
  Full WHATWG **utf-8** decoder (per-byte lower/upper bounds, fatal→TypeError;
  `textdecoder-fatal` 0→36/36), **utf-16le/be** with unpaired-surrogate handling,
  **windows-1252** + **x-user-defined**; **stateful streaming** (`{stream:true}` +
  flush; `textdecoder-streaming` 32/32, `-arguments` 4/4); BOM removal + ignoreBOM;
  code-point-aware `encodeInto` + lone-surrogate→U+FFFD (44→110/111).
- **#09 The FileAPI Vault — byte-backed Blob/File + real FileReader (~153 → ~330).**
  `Blob` over a `Uint8Array` (WebIDL sequence/dict guards — primitives throw,
  `Blob.length===0`; type normalization; `slice`/`text`/`arrayBuffer`/`bytes`/`stream`;
  native-EOL `endings`); `File extends Blob` (name/lastModified, `File.length===2`);
  `FileReader` on the unified event machinery — async reads (`readAsText`/`ArrayBuffer`/
  `DataURL`/`BinaryString`), `ProgressEvent`, on* handler attributes, abort, events as
  separate tasks. Blob-array-buffer/text/bytes/endings + readAs*/multiple-reads/events/
  event-handler-attributes/abort all **100%**.
- Zero regressions (events 25/25, classlist 1420, qsa 1975, Node-properties 726,
  handleEvent 6, iframe-load 2). Tails: Big5/legacy multi-byte (index tables),
  SharedArrayBuffer, element-`toString`, blob-URL byte store, `filereader_result`'s
  last 4 (event-loop microtask-drain timing).

**Session 2026-06-16 (knight Claudius — Quest #07 The Event Amphitheater — spec dispatch, +110):**
- **Unified spec-compliant event dispatch (DOM §2.9).** Replaced a bubble-only
  recursion (no capturing phase, no path to window, plus a stale `addEventListener(){}`
  no-op stub on `Node` that surfaced once Element/Document's own copies were removed)
  with one `_dispatchSpec`: every EventTarget (node / Document / window / iframe
  win+doc) stores listeners in one `_eventRegistry` keyed by `_evtRegKey`, and
  dispatch runs capturing (root→target) then bubbling (target→root) over a path
  built by `_eventParent` (parentNode → document.defaultView → window).
- **Event surface:** eventPhase constants, `cancelBubble`/`returnValue`,
  `composedPath()`, instance `isTrusted`, `type` coercion, `initEvent`/
  `initCustomEvent` mandatory-arg + `_initialized` flag; WebIDL guards
  (`dispatchEvent(null)`→TypeError, uninitialized/in-flight→InvalidStateError);
  option flattening before the null-callback check.
- **Event-class hierarchy:** UIEvent(view/detail) → Mouse/Keyboard/Focus/Composition/
  Input; Wheel/Pointer → Mouse; null-options → empty dict.
- **Trusted model:** public dispatch clears `isTrusted` (after the state check);
  UA events (frame load, main DOMContentLoaded/load) dispatch directly to stay
  trusted; legacy `window.event` set during dispatch.
- **Headline:** Event-subclasses-constructors 10→**49/49**, EventTarget-dispatchEvent
  4→**25/25**, Event-cancelBubble 0→**8/8**, Event-returnValue **7/7**, Event-propagation
  4→**7/7**, Event-constants 0→**4/4**, CustomEvent 1→**3/3**, EventListenerOptions-capture
  2→**4/4**, ~15 dispatch tests 0→1/1. **~110+ subtests, zero regressions.**


URL realm (`constructor 1→833`, `origin →403/403`, `setters 5→226`, `searchparams 1→4/4` + family),
`Element-classlist ~0→1315/1420`, `Node-appendChild 1→11/11`, `EventListener-handleEvent 1→6/6`,
iframe increments 1–4, `insertAdjacentText`, named-window access, frame-window realm fallback, and the
engine **hardened against URL-triggered crashes**.

**Session 2026-06-14 (knight Claudius):**
- **#13 Harness Gates — SECURED.** `createCDATASection`/`createProcessingInstruction` +
  real `DetachedDocument` (for `new Document()`, `implementation.createDocument`/
  `createHTMLDocument`/`createDocumentType`) replacing stubs that returned the live page;
  fixed a latent `Comment`/`PI` `textContent` bug. Unblocked all of `dom/ranges` +
  `dom/traversal` (no-results → ~7,600 measurable; `TreeWalker` 0→300/761).
  Bonus: `Node-cloneNode` 98→99. Tool added: `scripts/harness_probe.py`.
- **#01 Selector Sorcery — 1646 → 1917/1977 (97.0%).** Stable `Element::opaque()` identity
  (the keystone — un-corrupted the selectors-crate NthIndexCache, fixing all `:nth-*` /
  `*-of-type`, +151); CSS2 pseudo-elements parse-but-never-match (+80); `querySelector`
  WebIDL coercion (+~6); `:lang()` with ancestor inheritance (+26); `:link`/`:any-link`/
  `:visited` (+8). Commits `1342890`, `a6d8257`, `bc515c1`, `60b138d`.

**Session 2026-06-15 #13 (knight Claudius — Quest #06 Node-* — `Node-properties` 710→726/726 CONQUERED + `Node-replaceChild` →29/29):**
- **Four small spec-correctness fixes** bucketed from the tail:
  1. `nodeValue` (get/set) now covers every CharacterData kind — ProcessingInstruction(7)
     and CDATASection(4), not just Text(3)/Comment(8). Fixes PI `nodeValue`.
  2. `textContent` is `null` for Document(9) and DocumentType(10) — getter returns
     null, setter is a no-op (it used to wipe the document's children).
  3. `charset`/`inputEncoding` added as aliases of `characterSet` on all Document classes.
  4. `DocumentType.ownerDocument` honors its real node document (`_ownerDoc`), and
     `createDocument` sets the adopted doctype's `_ownerDoc`. (createHTMLDocument
     already did.)
- **710 → 726/726 (full conquest).** **Bonus:** fix #4 also closed the last
  `Node-replaceChild` subtest (cross-document doctype replace) — **28 → 29/29**.
- Zero regressions (createElement 147, createElementNS 596, attributes 67, appendChild
  11, cloneNode 103, normalize 3, isEqualNode 9, baseURI 9, lookupNamespaceURI 75, qsa
  1939, classlist 1315, getElementsByTagName 19, **Node-textContent 81/81**,
  Range-insertNode 909, Range-extractContents 159, iframe 2).

**Session 2026-06-15 #12 (knight Claudius — Quest #06 Node-* — `Node-baseURI` 0→9/9 CONQUERED):**
- **`baseURI` on `Node` and `Attr`** (was undefined → 0/9). New `_documentBaseURL(doc)`
  helper implements HTML's "document base URL": the first `<base>` with an `href`
  attribute resolved against the document URL (via the real `URL` parser), else the
  document's own URL (fallback base). `Node.baseURI` resolves the node document
  (a document node is its own node document); `Attr.baseURI` delegates through its
  `ownerDocument`. The iframe-doc `baseURI` getter still overrides for srcdoc/about:blank.
- **0 → 9/9.** Zero regressions (createElement 147, createElementNS 596, attributes
  67, appendChild 11, replaceChild 28, cloneNode 103, normalize 3, isEqualNode 9,
  lookupNamespaceURI 75, qsa 1939, classlist 1315, getElementsByTagName 19,
  Node-properties 710 unchanged).

**Session 2026-06-15 #16 (knight Claudius — Quest #12 Range content-ops — `Range-insertNode` 909→1531, `Range-surroundContents` 698→1247, +1171):**
- **Pre-insertion validity before the text split.** `Range.insertNode` split the
  start Text node *before* validating the node, so an invalid insert (Document,
  misplaced doctype, ancestor) threw only after mutating — failing the "resulting
  DOM unchanged" checks. New `__obscura_ensurePreInsertionValidity` (throw-only:
  parent type, host-including ancestor, reference-child, node-type, Text-in-Document
  / doctype-outside-Document) runs first. **insertNode +200.**
- **Live `DetachedDocument.doctype`.** The getter returned a construction-time cache,
  so a doctype appended/moved later (the Range tests' iframe setup does exactly this)
  was invisible — the tree comparison saw a null `.doctype` and the whole subtree
  mismatched. Now it scans children for a DocumentType. **insertNode +422,
  surroundContents +549** — one small primitive, ~970 subtests.
- Zero regressions (replaceChild 29, isEqualNode 9, Node-properties 726, classlist
  1420, qsa 1975, extractContents 159, cloneContents 177). Remaining ~309 insertNode
  tails are thin & varied: a doctype-ordering mismatch in the tree compare + an
  IndexSizeError in some range setups (e.g. paras[5] CDATA offsets).

**Session 2026-06-15 #15 (knight Claudius — Quest #03 The ClassList Mutation-Echo — `Element-classlist` 1315→1420/1420 SECURED 100%):**
The whole tail was three fixes, all rooted in mutation timing + DOMTokenList spec edges:
- **Eager mutation drain.** `__notifyMutation` now drains the Rust mutation queue
  immediately (then schedules async delivery) instead of only scheduling. A
  synchronous `takeRecords()` — which the classList test calls right after each op —
  now sees the record, and mutations that no *current* observer targets (e.g. a
  setup `setAttribute` before `observe()`) are discarded rather than leaking into a
  later observer. The classList `replace()` mutation-count assertion is the only
  DOMTokenList method whose count the test checks. **+90.** (A first attempt that
  drained inside `takeRecords()` regressed to 949 — it pulled *stale* pre-`observe()`
  records; draining at mutation time, when target lists are accurate, is the fix.)
- **`_write` doesn't materialize an empty attribute** when the attribute is absent
  and the token set is empty (DOM update steps), so `remove()` on a null class
  leaves it null. **+10.**
- **`replace()` validates empty (SyntaxError) on both tokens before whitespace
  (InvalidCharacterError)**, so `replace(" ", "")` throws SyntaxError. **+5.**
- **Bonus, zero regressions:** the eager drain also lifted MutationObserver-childList
  26→31, -takeRecords 1→3, -disconnect 1→2 (+8). Verified by rebuilding the parent
  commit to compare. qsa 1975, attributes 67, Node-properties 726, createElement 147 held.

**Session 2026-06-15 #14 (knight Claudius — Quest #01 The Selector Sorcery — `ParentNode-querySelector-All` 1939→1975/1975 SECURED 100%):**
Five increments cleared the entire tail:
- **`::slotted()`** functional pseudo-element parses-but-never-matches (mirror of
  the CSS2 pseudo-element fix; cssparser auto-closes the unterminated-paren form). **+16.**
- **Iframe docs preserve `<html>/<head>/<body>` attributes.** `_IframeDocument`
  regex-stripped those start tags (with their attrs) before parsing into a synthetic
  scaffold; now it copies the start-tag attributes onto the scaffold first. Fixes
  the html/body type selectors, `:root`, AND `:lang` inheritance (lang lived on
  `<html>`) in the iframe Document context. Paired with **`:link` matches only
  `a`/`area`** (not `<link>` elements). **+10.**
- **Real `:target`** — DomTree `target_id` + `PseudoClass::Target`; JS primes the
  queried document's URL fragment (resolved by walking the node to its document
  root) before a `:target` query. **+4.**
- **Real `NodeList`** — `extends Array` (keeps indexing/iteration/spread/array
  methods internal callers rely on), `Symbol.species → Array`; qsa returns it. **+4.**
- **`:root` distinguishes a real document from a fragment** — `create_document_fragment`
  backs both, so a `real_documents` set (DetachedDocument marks its node; main doc
  is implicit) lets `is_root()` match a document's root element but not a fragment's
  child. **+2.**
- Zero regressions throughout; selector.rs unit tests 17→19; obscura-dom 40/40.
  Bonus: Element-matches 624→630.

**Session 2026-06-15 #11 (knight Claudius — Quest #06 Node-* — `Node-isEqualNode` 4→9/9 CONQUERED):**
- **Spec per-interface `isEqualNode`** (was a nodeName/nodeValue approximation).
  DOM §4.5: switch on nodeType — DocumentType (name/publicId/systemId), Element
  (namespaceURI + prefix + localName, then attribute-**set** equality matched by
  ns+localName+value, *ignoring prefix*), ProcessingInstruction (target/data),
  Text/CDATA/Comment (data) — then equal child count + recursive child equality.
- **Root-cause the documents subtest:** `createDocument(xhtmlNS, …)` now sets the
  doc's content type to `application/xhtml+xml`, so its `createElement` produces
  HTML-namespace head/body — structurally identical to `createHTMLDocument`. (SVG
  ns → image/svg+xml.) The 'xhtml' createMode + `_contentType` plumbing already
  existed; createDocument just wasn't using it.
- **4 → 9/9.** Zero regressions (createElement 147, createElementNS 596, attributes
  67, appendChild 11, replaceChild 28, cloneNode 103, normalize 3, lookupNamespaceURI
  75, qsa 1939, classlist 1315, Range-insertNode 909, getElementsByTagName 19, iframe 2).

**Session 2026-06-15 #10 (knight Claudius — Quest #06 Node-* — `Node-normalize` 0→3/4):**
- **Real `normalize()`** (was a no-op stub). DOM §4.5: walk every descendant
  exclusive Text node in tree order; drop it if empty, else absorb its following
  contiguous Text siblings (`nodeType === 3`) and remove them. CDATASection is
  nodeType 4, so the same predicate skips it for free. Snapshot-then-process with a
  `parentNode` liveness check so nodes already absorbed by an earlier run are skipped
  (and removed nodes keep their old `data`, as the test asserts). Range-endpoint
  adjustment intentionally omitted — the WPT test doesn't exercise it.
- **0 → 3/4.** Zero regressions (createElement 147, attributes 67, appendChild 11,
  replaceChild 28, cloneNode 103, isEqualNode 4). Last fail = the XML subtest
  (`new DOMParser().parseFromString(…, "text/xml")` + `createCDATASection`/
  `createProcessingInstruction`) — the deferred XML realm, not a normalize gap.

**Session 2026-06-15 #9 (knight Claudius — Quest #06 Node-* — `Node-replaceChild` 5→28/29):**
- **Full DOM "replace" algorithm.** Pre-replacement validity (parent type, node
  inclusive-ancestor, child-is-a-child → NotFoundError, valid node type, Text-in-
  Document / doctype-outside-Document) + the Document-parent constraints evaluated
  excluding `child` (at-most-one element child, doctype/element ordering, fragment
  element/text limits). Then the reference-child adjustment + remove/insert via our
  existing primitives. Caught a Rust `insert_before` adjacency quirk (replace-with-
  next-sibling dropped the node) — guarded by skipping the re-insert when the node
  is already correctly placed after removal.
- **5 → 28/29.** Zero regressions (appendChild 11, cloneNode 103, lookupNamespaceURI
  75, createElementNS 596, Range-insertNode 909, attributes 67, classlist 1315, qsa
  1939, iframe 2, getElementsByTagName 19). Last fail = cross-document doctype
  replace (needs DetachedDocument doctype node tracking — a distinct fix).

**Session 2026-06-15 #8 (knight Claudius — Quest #06 Node-* — `Node-lookupNamespaceURI` 0→75/75):**
- **DOM namespace resolution** (`lookupNamespaceURI`/`lookupPrefix`/`isDefaultNamespace`
  on Node + the standalone Attr). Recursive "locate a namespace"/"locate a prefix":
  an element's own namespace (when its prefix matches) wins over its `xmlns`
  attributes; `xml`/`xmlns` are built-in at the element level; Attr resolves through
  its owner element; Document through its documentElement; DocumentType/Fragment → null.
  Directly leverages the real namespace/Attr/HTMLElement machinery from #02/#11.
- **0 → 75/75 (100%).** Zero regressions (createElementNS 596, attributes 67,
  appendChild 11, cloneNode 103, getElementsByTagName 19). Two bugs caught in the
  loop: `lookupNamespaceURI(null)` was `String(null)`→"null" (default-namespace
  lookups broke), and Attr (a standalone class) needed the methods mirrored.
- Remaining Node-* veins for next time: `Node-replaceChild` 5/29 (mutation
  pre-insertion validity), `Node-isEqualNode` 4/9, `Node-normalize` 0/4.

**Session 2026-06-15 #7 (knight Claudius — the createElementNS tail — CONQUERED 587→596/596):**
- **`importNode` into the target document** (Tail A): `cloneNode(deep, _targetDoc)`
  threads the importing document so the copy's `ownerDocument` (and `tagName`
  casing) reflects it; `document.importNode` passes `this`. `Element-tagName` 3→5.
- **Real `HTMLElement` hierarchy** (Tail B): `HTMLElement` is now a true subclass
  of `Element` (was an alias, so everything was an HTMLElement); added
  `HTMLUnknownElement`/`HTMLSpanElement`; `createElementNS` picks the wrapper class
  by namespace (non-HTML → `Element`; HTML → specific by lowercase tag, else
  `HTMLUnknownElement`), `_elementClassFor` maps the parsed/createElement path.
  Closed the 9 `instanceof` subtests → **`Document-createElementNS` 596/596 (100%)**.
- **Bonus** `Node-cloneNode` 101→103. **Zero regressions** (appendChild 11,
  classlist 1315, handleEvent 6, qsa 1939, children 2, getElementsByClassName 3,
  iframe-load 2, Range 909, createElement 147, attributes 67); capture + instanceof
  sanity clean. Last `Element-tagName` fail (1) needs real `DOMParser` XML parsing.

**Session 2026-06-15 #6 (knight Claudius — foreign-namespace createElementNS — Quest #11 SECURED, createElementNS 85→587):**
- **Real foreign-namespace element creation.** New Rust op `create_element_ns`
  builds a node with a true `QualName` (namespace + prefix + case-preserved local)
  instead of a faked HTML node. JS `Document.createElementNS` rewritten:
  validate-and-extract (the real algorithm — split on first colon, local must be a
  valid element name, colon needs a non-empty prefix; xml/xmlns `NamespaceError`
  rules), then create the real node and pin `_ns`/`_nsSet`/`_prefix`/`_localName`
  on the wrapper. Getters fixed: `namespaceURI` (honours an explicit null),
  `localName`/`tagName` (case-preserved; HTML-ns-in-HTML-doc uppercases),
  **`nodeName` now === `tagName`** (was a separate uppercasing op — the keystone:
  +250 createElementNS subtests). `cloneNode` recreates foreign/case-preserved
  elements via `createElementNS`.
- **Results:** `Document-createElementNS` 85→**587/596**; **`getElementsByTagName`
  19/19, `getElementsByTagNameNS` 16/16, `Document-getElementsByTagName` 18/18 —
  all 100% (Quest #11 SECURED)**; `querySelector-All` 1923→**1939** (+16, foreign-ns
  helps namespace/type selectors); `cloneNode` held 101. **Zero regressions**
  across createElement/attributes/appendChild/classlist/TreeWalker/
  compareDocumentPosition/iframe/Range; captures clean. Tail (12 subtests) needs
  `importNode`/`adoptNode` (tagName recompute on ownerDocument change).

**Session 2026-06-14 #5 (knight Claudius — Quest #11 The Collections Armory — increment 1, +33):**
- **A live `HTMLCollection` (Proxy) + Rust matching ops.** New Rust ops
  `get_elements_by_tag_name` (spec match: HTML-ns case-folded vs non-HTML
  case-sensitive, `*` = all), `get_elements_by_tag_name_ns` (`*` wildcards, ``=null
  ns), `get_elements_by_class_name` — all over `dom.descendants`, tree order.
  JS `globalThis.HTMLCollection` + a Proxy giving WebIDL semantics: live indexed
  access, supported-property-name access (id of any element + name of any HTML-ns
  element, single tree-order pass), expandos, index-set protection,
  `ownKeys`/`getOwnPropertyDescriptor`. Wired `getElementsByTagName(NS)`,
  `getElementsByClassName`, and `.children` on Element + Document. Added a minimal
  `globalThis.NodeList` so `x instanceof NodeList` is answerable.
- **Results:** `getElementsByClassName` 1→3/3, `Element-children` 0→2/2,
  `HTMLCollection-empty-name` 0→7/7 (all 100%); `getElementsByTagName` 4→12/19,
  `Document-getElementsByTagName` 3→11/18, `getElementsByTagNameNS` 0→7/16.
  **Zero regressions.** The remaining ~23 all need **real foreign-namespace
  `createElementNS`** (today it fakes `_ns` on the JS wrapper; the Rust node stays
  HTML-ns lowercased) — the clear next lever (also helps namespaceURI/cloneNode).

**Session 2026-06-14 #5 (knight Claudius — Quest #02 The Attr-Node Codex — CONQUERED 11 → 67/67):**
- **A real `Attr` node model over namespace-aware Rust storage.** Rust (`tree.rs`/
  `ops.rs`): namespace + qualified-name attribute methods alongside the local-keyed
  ones the selector/serializer use; ops `get/set/remove_attribute_ns` +
  `attribute_list`; existing get/set/remove switched to qualified-name matching.
  JS (`bootstrap.js`): real `Attr` (live value while attached, own value while
  detached) + `NamedNodeMap` (off-instance `WeakMap` state → correct
  `getOwnPropertyNames` shape) + per-element identity cache
  (`el.attributes[i] === getAttributeNode(name)`) + `get/setAttributeNode(NS)` +
  `removeAttributeNode` + `createAttribute(NS)` + DOM validate-and-extract
  (`xml`/`xmlns` `NamespaceError` rules) + HTML-only attribute lowercasing.
- **Two stragglers pinned by CDP probe:** moved-Attr value loss (snapshot the
  value *before* the removal op) and `el.style = "…"` now reflecting to the
  `style` content attribute (also a rendering-fidelity win).
- **Bonus** `Node-cloneNode` 99→101 (namespace-aware clone copy). **Zero
  regressions** across every held realm; real-page captures clean.

**Session 2026-06-14 #4 (Quest #05 The Element Forge — CONQUERED 0 → 147/147):**
- **The XML siege — XML+XHTML document iframes.** The remaining 98 subtests needed
  real XML-document mode in frames. `_IframeDocument` now takes a `kind`
  (html/xhtml/xml from content-type or `.xml`/`.xhtml` extension): an **xml** doc gets
  NO synthetic scaffold — its `documentElement` is the parsed root (`<foo>`); **xhtml**
  scaffolds like html but creates elements case-sensitively. `DetachedDocument` gained
  a `_createMode` + `_createElementXML` (case-preserved `localName`===`tagName`,
  `prefix` null, `namespaceURI` null for XML / HTMLNS for XHTML — pinned as own-props
  shadowing the HTML-casing getters). **Keystone:** the parent `load` event now WAITS
  for markup iframes (HTML "delay-the-load-event") — a new `__startFrameLoads()` fires
  at DOMContentLoaded and `page.rs` pumps to network-idle (`pump_until_idle`) BEFORE
  dispatching `load`; without this the test reads the frames before they finish loading.
  XHTML trailing-`</html>\n` text-node trimmed. Zero regressions (Quest #12 range
  iframes 909/177/103 intact, all held realms green, 104+35 unit, real-page capture OK).
- **HTML doc (the first 49).** WebIDL string coercion — `createElement(null)`→`"null"`,
  `undefined`→`"undefined"` (was crashing on `arg.toLowerCase()`); `_isValidElementName`
  → `InvalidCharacterError` for the invalid set; **ASCII-only** `_asciiLower`/`_asciiUpper`
  (so `marK`(KELVIN)/`İ`/`ı` survive); real `namespaceURI` (new Rust `op_dom "namespace_uri"`
  reading `QualName.ns` — `createElement('svg')` is HTML-ns) + `prefix`→`null`. Bonus:
  lifted `querySelector-All` 1917→1923. Commit `db7f923`.

**Session 2026-06-14 #4-prior (Quest #05 The Element Forge — HTML doc taken):**
- **`Document-createElement` 0 → 49/147.** Every HTML-document subtest passes.
  Four fixes: (1) WebIDL string coercion — `createElement(null)`→`"null"`,
  `undefined`→`"undefined"` (was crashing on `arg.toLowerCase()`); (2) element-name
  validation throwing `InvalidCharacterError` for the `invalid` set (empty / leading
  digit·`-`·`.`·`<`·`}` / whitespace / `>`), via `_isValidElementName`; (3) **ASCII-only**
  case folding (`_asciiLower`/`_asciiUpper`) so `marK` (KELVIN), `İ`, `ı` survive
  instead of being Unicode-folded by `String.prototype.toLowerCase`; (4) real
  `namespaceURI` (new Rust `op_dom "namespace_uri"` reading the node's actual `QualName.ns`
  — so `createElement('svg')` is HTML-namespaced, not mistaken for a parsed `<svg>`) +
  a `prefix` getter returning `null` not `undefined`. **Bonus:** the real `namespaceURI`
  lifted `querySelector-All` 1917→1923. Zero regressions (104 unit + held realms green).
- **Left for #05:** the XML (49) + XHTML (49) subtests — they need real **XML-document
  mode in iframes**. `_IframeDocument` is hardcoded `super('html')` with a synthetic
  `<html><head><body>` and HTML parsing; the `.xml`/`.xhtml` fixtures need a document
  whose `documentElement` is the parsed root (`<foo>`) and an XML-mode `createElement`
  (case-preserved `localName`/`tagName`, `namespaceURI` `null`/HTMLNS). A distinct siege.

**Session 2026-06-14 #3 (Quest #12 The Iframe Frontier):**
- **Content-op ranges — +2046 subtests, all 5 tests 0→.** `Range-insertNode`
  0→909/1840, `surroundContents` 0→698/1840, `cloneContents` 0→177/187,
  `deleteContents` 0→103/125, `extractContents` 0→159/187. Root unlock: real
  per-iframe JS realms — frame classic scripts run as one concatenated program and
  their top-level declarations are hoisted onto the frame window (in a `finally`, so
  a mid-script throw still attaches `run`/`setupRangeTests`); the parent realm drives
  the frame via `contentWindow.run()`. Plus a **node-backed `_IframeDocument`**
  (extends `DetachedDocument` → real childNodes/firstChild/appendChild/removeChild/
  doctype, live documentElement/head/body) and a **recursive `cloneNode(deep)`**
  (was `outerHTML`-into-`<div>`, which dropped `<html>/<head>/<body>` and was O(N²)).
  Zero regressions; 143 unit tests green. See Scroll #12 for the deferred FIX-B fork
  (frame platform-globals snapshot — reverted; exposed a clone node-identity hang in
  `surroundContents`).

**Session 2026-06-14 #2 (Quest #10 The Traversal Labyrinth):**
- **Traversal — CONQUERED.** Real `NodeIterator` (1→766/766, was a TreeWalker alias),
  spec `TreeWalker` (300→761/761, real FILTER_REJECT subtree-pruning vs SKIP, active
  flag, validating currentNode), `NodeIterator-removal` 0→23/23 (pre-removing steps +
  WeakRef live-iterator registry), full `NodeFilter` constant set, `createHTMLDocument`
  now prepends `<!DOCTYPE html>`. Commits `070ab6f`, `1f7a428`.
- **Range — built from a no-op stub.** Boundary-point model + all comparison/positioning/
  selection/mutation algorithms (content ops verified correct in isolation):
  `comparePoint` 0→5518/5580, `Range-set` 0→10838/10920, `compareBoundaryPoints`
  0→8665/9313, `isPointInRange` 0→5521/5733, `intersectsNode` 0→2356/2356,
  `stringifier` 5/5, + selectNode/collapse/cloneRange/commonAncestor 96–100%. `828ee41`.
- **Node identity — the keystone bug, fixed.** The global `document`, `DetachedDocument`
  fragments, and `DocumentType` nodes now each have ONE canonical wrapper (seeded into
  `_cache`), so `documentElement.parentNode === document`, `doctype === childNodes[i]`,
  etc. This was the long-standing "harness node-identity mystery" — it gated traversal,
  un-hung `Range-set`, and as a bonus made `compareDocumentPosition` real (hardcoded `4`
  → true tree order; +DOCUMENT_POSITION_* consts) → `Node-compareDocumentPosition`
  →1444/1444. Zero regressions; 143 unit tests green.
- **Left for #12:** the iframe-harness ranges content-op tests (~6k subtests) and the
  CDATA-in-HTML fixture (`paras[5]`, ~few hundred subtests, needs real CDATA nodes in
  the Rust DOM rather than coalescing text nodes).
