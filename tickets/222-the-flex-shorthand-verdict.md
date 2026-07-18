# Quest #222 — The Flex Shorthand Verdict

**Realm:** `css/css-flexbox/parsing/` — the whole `flex` / `flex-flow` family
**Hold:** flex-computed 0/14, flex-valid 4/16, flex-invalid 0/6, flex-grow/-shrink
valid 1/4 + invalid 0/4 (×2), flex-basis-computed 11/12, flex-flow valid 1/7 +
invalid 0/2 + computed 0/2 → **all 100%** (+57), plus the
`animation-composition-computed` bonus (+1). **+58, ZERO regressions.**
**Session:** 2026-07-18
**Grabbed from:** #221's next-leverage — a NEW `css/*/parsing/` dir. Baselined
`css/css-flexbox/parsing/` and found `flex-computed` at a stark **0/14** (the
raw-store tell in a computed file), which unravelled into a whole coherent vein.

## The gap

The css-flexbox flex sizing vein was almost entirely raw-store:

- **`flex` shorthand** — never expanded. `.style.flex = "1"` stored a `flex` key
  verbatim (`test_valid_value` wants the canonical `1 1 0%`), and the shorthand
  was unregistered in computed style (*"flex doesn't seem to be supported in the
  computed style"*). flex-computed 0/14, flex-valid 4/16, flex-invalid 0/6.
- **flex-grow / flex-shrink** — stored raw, no `<number>` canon. `23.4e5` stayed
  `23.4e5` (want `2340000`), `.0` stayed `0.0`, and `2e3.4`/`-+5`/`1.` were
  accepted. valid 1/4, invalid 0/4 (each).
- **flex-basis** — computed didn't clamp its non-negative range: `calc(10px -
  0.5em)`→`-10px` (want `0px`), and a container-unit `sign()` calc stayed
  symbolic. 11/12.
- **flex-flow** — raw-store shorthand: valid 1/7, invalid 0/2, computed 0/2.

Grammar (CSS Flexbox 1):

```
flex      = none | [ <'flex-grow'> <'flex-shrink'>? || <'flex-basis'> ]
flex-flow = <flex-direction> || <flex-wrap>
```

The canonical `flex` serialization is ALWAYS the 3-value `<grow> <shrink> <basis>`
form (`none`→`0 0 auto`); an omitted grow/shrink defaults to **1** (not the
longhand initial 0) and an omitted basis to **`0%`**.

## The fix

All in `crates/obscura-js/js/bootstrap.js`, mirroring the #216/#217
`animation`/`transition` shorthand-expansion template.

### New helpers (css-flexbox section, ~15819)

- **`_canonFlexFactor(tok)`** — a single `<number>` flex factor: a plain
  `<number [0,∞]>` via `_serNumber` (strict `_FLEX_NUM_RE` rejects `1.`/`2e3.4`),
  or a `<number>`-typed math function (`_mt(root, null) === 'number'`, reordered
  via `_canonMathExpr` — `calc(-1)` is valid, clamped at used-value time). A
  length/percentage calc → null (that is a basis, not a factor).
- **`_canonFlexBasisTok(tok)`** — `<'flex-basis'>` = a basis keyword
  (auto/content/min-content/max-content/fit-content), or a `<length-percentage>`
  (bare `0`→`0px`). A math function must be length/percentage-typed —
  `_mt(root,'length') === 'number'` (a unitless `calc(0)`/`calc(3 - 3)`) → null.
- **`_expandFlex(value)`** → `{flex-grow, flex-shrink, flex-basis}` | null.
  `none`→`0 0 auto`. Otherwise classifies each of ≤3 tokens: a **unitless zero**
  matches both grammars, so it is a flex factor UNLESS two factors already
  preceded it (CSS Flexbox §7 note) — `calc(-1) calc(-1) 0`→basis `0px`. Rejects
  a third factor (`2 3 4`, `1 2 calc(0)`), a second basis (`5px 7%`), a split
  factor run (`4 6px 5`), and any non-factor/non-basis token (`none 1`, `9 none`).
- **`_canonFlexGrowShrink`** / **`_serFlexFromLonghands`** — the longhand gate and
  the always-3-value reconstruction.
- **`_expandFlexFlow`** / **`_serFlexFlow`** — flex-flow into flex-direction +
  flex-wrap; serialization drops each at its initial but keeps `row` when both
  default (`row nowrap`→`row`, `nowrap`→`row`, `row wrap`→`wrap`).

### Wiring (same five touch points as `transition`)

1. **Inline decl parser** (~1035) + **API `setProperty`** (~1590): flex-grow/-shrink
   validate via `_canonFlexGrowShrink`; `flex`/`flex-flow` expand into their
   longhands (CSS-wide/var kept as one blob key that clears the longhands).
2. **`getPropertyValue`** (~1805): reconstruct `flex`/`flex-flow` from longhands.
3. **`removeProperty`** (~1690): clear the longhands.
4. **getComputedStyle `resolve`** (~19075): `flex` reconstructs
   `<grow> <shrink> <basis>` from the COMPUTED longhands; `flex-flow` from computed
   flex-direction/flex-wrap.
5. **`_CSS_KNOWN_PROPS`**: register `flex` + `flex-flow`.

### Computed resolution (`_normComputed`)

- **flex-grow / flex-shrink** (new branch by `tab-size`): a `<number [0,∞]>` — fold
  a math function with `cqZero` (`calc(10 + sign(20cqw - 10px) * 5)`→`5`, cqw→0 ⇒
  `sign(-10px)`=-1), clamp ≥0 (`calc(-1)`→`0`).
- **flex-basis**: added to `_CLAMP_NEG_PROPS` (non-negative → `calc(10px -
  0.5em)`→`0px`), plus a surgical branch (guarded to a container-unit pure-`<length>`
  calc) that folds the cqw-`sign()` gate to px — `calc(10px + (sign(20cqw -
  10px) * 5px))`→`5px`. A `%`-bearing calc (`_mt` ≠ 'length') falls through to the
  generic `_trComp` path (keeps `%` symbolic).

### Bonus (+1)

`animation-composition` was already validated (via `_ANIM_KEYWORD_LISTS`) but not
in computed style. Added `animation-composition: replace` to `_GCS_DEFAULTS` →
`animation-composition-computed.tentative.html` 0/1 → 1/1.

## Results

| File | Before | After |
|------|:------:|:-----:|
| flex-computed | 0/14 | **14/14** |
| flex-valid | 4/16 | **16/16** |
| flex-invalid | 0/6 | **6/6** |
| flex-grow-valid | 1/4 | **4/4** |
| flex-grow-invalid | 0/4 | **4/4** |
| flex-shrink-valid | 1/4 | **4/4** |
| flex-shrink-invalid | 0/4 | **4/4** |
| flex-basis-computed | 11/12 | **12/12** |
| flex-flow-valid | 1/7 | **7/7** |
| flex-flow-invalid | 0/2 | **2/2** |
| flex-flow-computed | 0/2 | **2/2** |
| animation-composition-computed (bonus) | 0/1 | **1/1** |

**+58 subtests, ZERO regressions.**

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, getComputedStyle-property-order 1/1 (the +3
registered props didn't disturb enumeration), serialize-values 695/697 (2
pre-existing), shorthand-serialization 7/7, animation-shorthand 36/36,
transition-shorthand 18/18, animation-range-shorthand 133/133, animation-computed
15/15, transition-computed 10/10, tab-size-computed 10/10, inset-computed 20/20,
flex-direction-valid 4/4, flex-wrap-valid 3/3. padding-computed 8/13 +
margin-computed 6/8 unchanged (their %→px fails need real layout — a standing cap).

## Caps / Next

- **CAP — layout-dependent computed.** `padding-computed` (8/13) and
  `margin-computed` (6/8) fail their `%`→px rows (`20%`→`40px`) because
  getComputedStyle returns the *used* value for margin/padding, which needs the
  containing-block width from real layout we don't perform. Unwinnable without a
  layout pass; NOT a raw-store gap.
- **NEXT LEVERAGE:**
  - a NEW `css/*/parsing/` dir — the css-flexbox dir is now clean; the tell in a
    mature dir is a `-computed` file at 0/N (raw-store shorthand) or a
    `-valid`/`-computed` canonicalization gap (most `-invalid` are already green
    via generic rejection). Candidates not yet audited: `css/css-grid/`,
    `css/css-ui/`, `css/css-borders/`, `css/css-masking/`, `filter-effects/`.
  - `align-content`/`justify-*` box-alignment SHORTHANDS in `css/css-align/` (the
    `place-*` family) if any `-computed`/`-shorthand` files are raw-store.
  - the same cqw-`sign()` length fold audited across other `*-computed` length
    props that still route through the generic `_trComp` (`text-indent`,
    `outline-offset`, sizing longhands) — grep the `_LENGTH_COMPUTED_PROPS` branch.

grep `_expandFlex` / `_canonFlexFactor`.
