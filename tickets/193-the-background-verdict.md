# ⚔️ Quest #193 — The Background Verdict

> *The `background` shorthand and its five unmodelled sub-property longhands —
> the last raw-store vein of `css/css-backgrounds/parsing/`.*

**Realm:** `css/css-backgrounds/parsing/`
**Banner:** The `background` shorthand + background-repeat/-attachment/-clip/-origin/-size longhands
**Status:** ✅ SECURED — **+72, zero regressions**
**Date:** 2026-07-16

---

## The gap

Same lever as #179→#192 (CSS value parsing living in JS `CSSStyleDeclaration.setProperty`):

1. **Five sub-property longhands stored RAW** — `background-repeat`, `background-attachment`,
   `background-clip`, `background-origin`, `background-size` never gated on their grammar, so
   every `*-invalid` was 0/N (`background-attachment: auto`, `background-clip: margin-box`,
   `background-size: -1px` all wrongly accepted) and two `*-valid` canonicalizations were missing
   (`background-size: 1px` → should be `1px auto`; `auto auto` → `auto`; `background-clip:
   text border-area` → `border-area text`).

2. **The `background` shorthand was UNMODELLED** — `style.background = …` fell through to
   generic single-key storage, so `background-valid` sat at 1/46 (only the trivial `CSS.supports`
   probe passed) and `background-invalid` at 0/2. `CSS.supports('background', 'none')` returned
   **false**.

## The work (all JS in `bootstrap.js`, no Rust)

**Sub-property longhands** — `_canonBg(name, value)` via `_BG_VALIDATED`, dispatched in the
setProperty chain (and `CSS.supports`) ahead of the generic branches. Each is a comma-separated
per-layer list (`<type>#`); `_canonBgLayer` validates one layer:
- `background-attachment` = `[scroll|fixed|local]#`
- `background-repeat` = `[repeat-x | repeat-y | [repeat|space|round|no-repeat]{1,2}]#`
- `background-origin` = `[border-box|padding-box|content-box]#`
- `background-clip` = `[<visual-box> | border-area | text | [border-area && text]]#`
  (two-token clip is the `border-area || text` pair, canonically `border-area text`)
- `background-size` = `[[<lp [0,∞]>|auto]{1,2} | cover | contain]#` — single value expands to the
  canonical two-value form (`1px` → `1px auto`), `auto auto` collapses to `auto`. `<lp>` reuses
  `_canonGapItem` (non-negative, calc-aware; `normal` rejected).

**The `background` shorthand** — `_parseBackgroundShort(value)` expands into (and stores as) the
eight longhands (background-image/-position/-size/-repeat/-attachment/-origin/-clip/-color), or
null → the declaration is ignored. Grammar (css-backgrounds-4 §2.12):
`background = <bg-layer># , <final-bg-layer>` where each layer is the order-independent
`<bg-image> || <bg-position> [ / <bg-size> ]? || <repeat-style> || <attachment> || <bg-clip> ||
<visual-box>` and only the **final** layer admits `<'background-color'>`.
- `_bgLayerToks` splits a layer keeping functions/`[]` whole and making a top-level `/` its own
  token; the main scan classifies each token (image / position-run / repeat-run / attachment /
  box / color) and greedily consumes the contiguous position run — then, and only immediately
  then, an optional `/ <bg-size>`. This is what rejects `black 0 url(…) / cover` (invalid): the
  `/` doesn't directly follow the `<bg-position>`, so a stray top-level `/` is hit → null.
- `_bgResolveBox` applies the §2.12 box rule: one `<visual-box>` → both origin & clip; a clip-only
  keyword (border-area/text) → clip + origin `border-box`; two `<visual-box>` → first origin,
  second clip.
- Each component is stored already-canonical (position via `_serializePositionSpecified`, image
  via `_canonImageSet(_canonGradients(…))`, color via `_canonColorSpecified`) so the longhands
  round-trip.
- `_serBackgroundShort(get)` reconstructs (spec/WebKit order: `[<color> on final] <image>
  <position>[/<size>] <repeat> <attachment> <origin> <clip>`, defaults omitted; `''` if a
  longhand is absent or the per-layer counts disagree; all-CSS-wide → that keyword).
- Wired exactly like the `grid` shorthand (#191): expand+store in setProperty (gated on
  `!var()`), `getPropertyValue`/`removeProperty` reconstruct/clear, `CSS.supports` branch.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `background-valid.html` | 1/46 | **45/46** | **+44** |
| `background-invalid.html` | 0/2 | **2/2** | **+2** |
| `background-repeat-invalid.html` | 0/3 | **3/3** | **+3** |
| `background-attachment-invalid.html` | 0/2 | **2/2** | **+2** |
| `background-clip-invalid.html` | 0/5 | **5/5** | **+5** |
| `background-clip-valid.html` | 8/9 | **9/9** | **+1** |
| `background-origin-invalid.html` | 0/4 | **4/4** | **+4** |
| `background-size-invalid.html` | 0/3 | **3/3** | **+3** |
| `background-size-valid.html` | 7/9 | **9/9** | **+2** |
| `background-size-computed.html` | 10/16 | **14/16** | **+4** (bonus — longhand canon) |
| `background-computed.html` | 37/39 | **39/39** | **+2** (bonus — shorthand expansion) |

**Total: +72, zero regressions.**

Zero-regression sweep: qsa 1975, serialize-values 696/697, cssom/shorthand-serialization 7/7,
grid-shorthand-valid 49, grid-template-shorthand-invalid 66, color-valid 17/17, color-invalid
8/11, border-color-valid 7/7, and the whole `background-*` dir (image/color/position all held at
100%). The two "bonus" rows were verified as genuine gains via a `git stash` before/after cycle
(background-size-computed 10→14, background-computed 37→39; the longhand canon feeds the computed
path). `background-shorthand-serialization` (2/11) and `background-repeat-computed` (12/13) were
byte-for-byte identical before and after — pre-existing, untouched.

## Caps / Next

- **Unwinnable (1):** `background-valid`'s `background: none` → `background-color` subtest expects
  `rgba(0, 0, 0, 0)` while the three newer (border-area/two-box) cases expect `transparent`. The
  test's own expectations are internally inconsistent (an old Chrome-quirk row vs newer spec rows);
  a single default can only satisfy one side. We use `transparent` (spec-correct — the shorthand
  resets background-color to its initial *keyword*), winning 3, losing the 1 legacy row.
- **Computed-path caps (COMPUTED, not parsing):** `background-size-computed` 14/16 — the last 2 are
  `calc(10px + 0.5em)` (needs real font-size resolution = layout) and a multi-layer computed row.
  `background-repeat-computed` 12/13 — computed collapses `repeat repeat` → `repeat` (the *specified*
  value keeps `repeat repeat`, which the -valid test's accepted-array expects); a small
  `_normComputed` follow-up could close it. Both are pre-existing and outside the parsing vein.
- **The `css/css-backgrounds/parsing/` value-parsing vein is now GREEN** (background + all sub-props
  + border-color/position). The remaining `border-image-*` sub-vein (border-image-valid 28/30,
  border-image-invalid 0/N, plus the `border-image` shorthand + `border-image-slice`/`-width`/
  `-outset`/`-repeat`/`-source` longhands) is the next in-realm lever — a `<border-image>` value
  engine (`<'border-image-source'> || <'border-image-slice'> [/ <…-width>? [/ <…-outset>]?]? ||
  <…-repeat>`), same expand/reconstruct pattern.
- **Otherwise:** pivot to a NEW untouched `css/*/parsing/` dir (`css-scroll-snap` remainder,
  `css-shapes`, `css-masking`/`mask-*`, etc.) — the #179→#193 three-axis JS value-engine pattern
  (`_canon*` validate/canon + `CSS.supports` branch + `_GCS_DEFAULTS`/`_normComputed`) still applies.
  Baseline a sample first (`*-invalid` at 0/N is the raw-store tell).
