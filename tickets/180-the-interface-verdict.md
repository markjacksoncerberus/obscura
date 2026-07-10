# Quest #180 — The Interface Verdict

**Realm:** CSS Basic User Interface parsing — `css/css-ui/parsing/` (42 files)
**Hold:** ~206/323 → **~272/323** (+62 harness-OK, +4 more under a harness ERROR)
**Difficulty:** ⚔️⚔️
**Status:** ✅ SECURED — +62, zero regressions.

---

## The gap

Same shape as Quest #179 (css-align): the css-ui longhands stored their value
**raw** in `CSSStyleDeclaration.setProperty` with **no grammar check**, so every
invalid value was wrongly accepted and every `*-invalid.html` file was 0/N.
`box-sizing: fill-box`, `caret-color: invert`, `resize: auto`, `outline-style:
hidden`, `outline-width: 1%`, `outline-offset: 2px 3px` — all stored and read
back verbatim. On top of that:

- `caret-color` had grown a **two-value form** `[ auto | <color> ]{1,2}` (the 2nd
  value is the text colour overlapping a block caret) — its computed resolution
  was missing (`caret-color-computed` 3/12).
- `field-sizing` and `interactivity` were entirely unknown to the computed-style
  machinery (not in `_GCS_DEFAULTS`) → `getComputedStyle` returned nothing.
- `CSS.supports("caret-color", "auto")` returned **false** (the generic
  `_COLOR_PROPS` branch validated via `_isValidColor`, which rejects `auto` and
  the two-value form) — so `test_computed_value`'s support-gate failed even
  where the value was fine.

## The work — a self-contained css-ui value engine (all `bootstrap.js`)

**`_canonCssUi(name, value)`** (defined right after `_canonGapItem`): validates +
canonicalizes each css-ui longhand, returning `null` for an invalid value (→
ignore the declaration, per CSSOM). CSS-wide keywords and `var()`/`env()` pass
through untouched. Dispatched from `setProperty` via `_CSSUI_VALIDATED` — placed
**before** the `_COLOR_PROPS` branch so `caret-color`/`outline-color` (both
`_COLOR_PROPS` members) get real grammar validation instead of the lenient
color-only path. Covers:

- **Enumerated keywords** (`_CSSUI_ENUM`): `box-sizing` (content-box|border-box),
  `resize` (none|both|horizontal|vertical|block|inline), `user-select`
  (auto|text|none|contain|all), `field-sizing` (fixed|content), `interactivity`
  (auto|inert), `outline-style` = `<outline-line-style>` (like border's line-style
  but **without `hidden`**, plus `auto`).
- **`caret-color`** `[ auto | <color> ]{1,2}` / **`outline-color`** `auto | <color>`
  — each token is `auto` or a valid `<color>` (`_isValidColor` +
  `_canonColorSpecified`). `outline-color` **also** accepts the legacy `invert`
  keyword (see cap below).
- **`text-overflow`** `[ clip | ellipsis | <string> ]{1,2}`.
- **`outline-width`** `<line-width>` (thin|medium|thick|non-negative `<length>`,
  no percentage; bare `0`→`0px`).
- **`outline-offset`** `<length> | inset` (negatives allowed; no percentage; `0`→`0px`).

**Computed / registration:**
- `caret-color` computed branch in `_normComputed` (before the generic color
  branch): resolves each of the 1–2 values as a colour (`auto`/`currentColor` →
  the element's own computed colour) and drops an `auto`/absent 2nd value from the
  serialization (spec).
- Added `field-sizing: 'fixed'` and `interactivity: 'auto'` to `_GCS_DEFAULTS`
  (which auto-registers both in `_CSS_KNOWN_PROPS`, so `getComputedStyle` exposes
  them); `interactivity` added to `_INHERITED_PROPS`.
- Added a `_CSSUI_VALIDATED` branch to `CSS.supports` (before its `_COLOR_PROPS`
  path) so the two-value/keyword grammars are recognized.

## Results

| File | Before | After |
|------|:------:|:-----:|
| box-sizing-invalid | 0/6 | **6/6** |
| caret-color-invalid | 0/12 | **12/12** |
| resize-invalid | 0/4 | **4/4** |
| user-select-invalid | 0/2 | **2/2** |
| text-overflow-invalid | 0/2 | **2/2** |
| outline-offset-invalid | 0/5 | **5/5** |
| field-sizing-invalid | 0/7 | **7/7** |
| outline-style-invalid | 0/3 | **3/3** |
| outline-width-invalid | 0/3 | **3/3** |
| outline-color-invalid | 0/3 | **2/3** (invert cap) |
| caret-color-computed | 3/12 | **12/12** |
| field-sizing-computed | 0/2 | **2/2** |
| interactivity | 6/9 | **9/9** |
| outline-width-valid | 6/7 | **7/7** |
| outline-offset-valid | 4/5 | **5/5** |
| interactivity-computed | 0/4 | **4/4** (harness ERROR) |

**+62 harness-OK** (plus interactivity-computed's 4 subtests pass under a harness
ERROR). **Zero regressions** — full held-realm sweep clean (qsa 1975, classlist
1420, Element-matches 669, createElement 147, dispatchEvent 25, serialize-values
696/697, color-valid 17/17, color-computed 16/16, transform-valid 42/42,
border-valid 6/6, border-color-valid 7/7, css-align align/gap/place all held).

## Caps / Next

- **`outline-color: invert`** — a genuine spec-version conflict. `outline-color-invalid`
  (css-ui-4) wants `invert` rejected; the CSSOM `serialize-values.html` (must-pass,
  no-regression) wants it **valid** and serialized as `invert`. A browser can't
  satisfy both — we keep `invert` valid (no regression), so `outline-color-invalid`
  caps at 2/3. `outline-color-computed` caps at 2/3 (the `auto`-computes-relative-
  to-`outline-style` subtest).
- **`cursor`** (invalid 0/10, valid 45/46, computed 37/39) — the widest remaining
  in-realm lever, but needs a real `cursor` value engine: `[ <cursor-image>
  [<x> <y>]? , ]* <keyword>` where `<cursor-image>` = url() | image-set() |
  **valid `<gradient>`** | light-dark(...), coords are `<number>` (integer/calc),
  with canonicalization matching the existing image/gradient canon (cursor-computed
  even has valid gradients needing `linear-gradient(200grad,…)`→`linear-gradient(…)`
  resolution). Self-contained (can't regress other props) but a quest of its own.
- **`canonical-order-outline-sub-properties-001`** (0/26) — needs computed
  reconstruction of the `outline` shorthand in canonical `<width> <style> <color>`
  order + `medium`→`3px` + `invert` computed. Big self-contained computed feature.
- **`outline-width-computed`** (5/9) — needs used-value integer rounding
  (`2.5px`→`2px`) + `thin`/`medium`/`thick`→resolved px, a rendering concern.
- **`interactivity-computed`** — 4/4 subtests pass but the harness reports ERROR
  (`test_no_interpolation` needs Web Animations).

**NEXT LEVERAGE:** other untouched `css/*/parsing/` dirs remain the widest tail,
same three-axis JS machinery (validation + canonical serialization + computed):
`css-text` (86 files), `css-fonts` (83), `css-grid` (61), `css-overflow` (35),
`css-scroll-snap` (25). Grep `_canonCssUi`/`_CSSUI_ENUM`/`_CSSUI_VALIDATED` before
touching css-ui values.
