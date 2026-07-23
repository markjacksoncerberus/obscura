# Quest #268 — The Block-Step Shorthand Verdict

**Realm:** `css/css-rhythm/parsing/` — the `block-step` shorthand (CSS Rhythmic Sizing 1)
**Hold before:** raw-store — block-step-valid 9/34, block-step-invalid 0/7, block-step-computed 0/34
**Hold after:** all three files 100% — **+66, ZERO regressions**

## The work (all `bootstrap.js`)

`block-step = <'block-step-size'> || <'block-step-insert'> || <'block-step-align'> ||
<'block-step-round'>` — an order-independent `||` of the four #267 longhands, each at
most once.

- **`_expandBlockStep(value)`** — whitespace-tokenize (paren-aware `_wsTokens`, 1–4
  tokens); classify each token into exactly one of the four longhands. The categories
  are disjoint — `none`/`<length>` is size (via `_canonCssUi('block-step-size', tok)`),
  and the three enum sets share no keyword — so each token maps uniquely; a token in no
  category, or a second value for one longhand, → invalid. Missing longhands fill with
  their initials. (Rejects `auto auto` / `start end` / `none none` / `300px none` /
  `300px start border-box padding-box` — `border-box` is in no category.)
- **`_serBlockStep(get)`** — reconstruct in the FIXED order size · insert · align ·
  round, dropping each component at its initial (`none`/`margin-box`/`auto`/`up`); when
  ALL are initial the shorthand collapses to `none`. (`content-box 100px up` →
  `100px content-box`; `100px center down padding-box` → `100px padding-box center
  down`; `auto` / `margin-box` / `up` → `none`.)

Wired exactly like `flex-flow` across all six touch points: the inline `_parseStyleDecls`
parser + setProperty eager-expand into (and store as) the four longhands; removeProperty
+ getPropertyValue + the getComputedStyle resolver reconstruct via `_serBlockStep`;
`block-step` added to `_CSS_KNOWN_PROPS` (CSS.supports). The computed resolver
reconstructs from the **computed** longhands, so `block-step: 2em` computes with the
resolved `80px` (size folds to px; the WPT computed file only exercises `100px`/`none`,
so this came green alongside valid/invalid).

## Results

| file | before | after |
|------|:------:|:-----:|
| block-step-valid | 9/34 | 34/34 |
| block-step-invalid | 0/7 | 7/7 |
| block-step-computed | 0/34 | 34/34 |

**+66.** The whole `css/css-rhythm/parsing/` dir (block-step family, 15 files) is now
**100%** — +131 across #267–#268.

**Zero-regression sweep:** qsa 1975, classlist 1420, serialize-values 695/697,
flex-flow-shorthand 6/6, flex-flow-computed 2/2, position-try-parsing 35/35,
block-step-size-computed 6/6 — all held.

## Caps / Next

`css/css-rhythm/parsing/` is FULLY SECURED. **Next leverage: a NEW `css/*/parsing/`
dir.** From this session's baselines, css-overflow / css-scroll-snap / css-images /
css-flexbox / css-multicol are all mature/green; the remaining css-overflow gaps are
SELECTOR-ENGINE (`::scroll-button()` 0/37, Rust) plus `webkit-box-computed` 14/20 (a
JS `display`-alias vein). Fresh un-baselined dirs with a `parsing/` subtree:
css-animations (44 files), css-logical (54), css-masking (29), css-position (23),
css-page (12), css-color-adjust, css-forced-color-adjust, css-content. The tell in a
mature dir: a `-invalid` at 0/N (raw-store) or a `-computed` canon gap. grep
`_expandBlockStep`/`_CSSUI_ENUM`.
