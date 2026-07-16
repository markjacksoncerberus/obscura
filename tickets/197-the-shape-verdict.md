# Quest #197 — The Shape Verdict

**Realm:** `css/css-shapes/parsing/` — `shape-outside` / `shape-margin` / `shape-image-threshold`
**Banner:** A `css-shapes` value engine reusing the offset-path/clip-path `<basic-shape>` engine.
**Result:** **+81, ZERO regressions.** Session 2026-07-16.

## The gap

`css-shapes` was pure raw-store — `shape-outside`, `shape-margin`, and
`shape-image-threshold` were stored verbatim (all three were already in
`_GCS_DEFAULTS`, so the property *existed*, but no validation/canon/compute ran).
Every `*-invalid` suite was 0/N, and the `*-valid`/`*-computed` suites passed only
the round-trip-lucky rows:

| Test | Before |
|------|:------:|
| `shape-outside-shape-invalid` | 0/9 |
| `shape-outside-shape-valid` | 11/12 |
| `shape-outside-path-invalid` | 0/7 |
| `shape-outside-path-valid` | 1/9 |
| `shape-outside-invalid-position` | 0/10 |
| `shape-outside-valid-position` | 10/20 |
| `shape-outside-computed` | 8/32 |
| `shape-margin-invalid` | 0/2 |
| `shape-margin-valid` | 3/4 |
| `shape-margin-computed` | 1/3 |
| `shape-image-threshold-invalid` | 0/2 |
| `shape-image-threshold-valid` | 2/5 |
| `shape-image-threshold-computed` | 1/6 |

## The discovery (again: reuse the shape engine)

`shape-outside = none | [ <basic-shape> || <shape-box> ] | <image>` — the same
`<basic-shape>` engine (`_opShape`) that #196 (clip-path) and offset-path already
use. It differs from clip-path in exactly two ways:

1. **The box set** `<shape-box>` = `content-box | padding-box | border-box | margin-box`
   (NO `fill-box`/`stroke-box`/`view-box`).
2. **The default box is `margin-box`** (elided beside a shape) — where clip-path's
   default is `border-box`. So `circle() margin-box` → `circle()` but
   `circle() border-box` is kept.

`path()` carries the same optional `<fill-rule>` (via `_clipPathPathFn`), `ray()` is
the same forbidden (motion-only), and a standalone `<image>` (url/gradient/image-set)
is the third alternative (reuses `_canonImageSet(_canonGradients(...))`).

## The work (all JS in `bootstrap.js`)

- **`_serShapeOutside(value, computed, el)`** — thin wrapper over `_opShape`, modelled
  on `_serClipPath`, with the two deviations above. `_isValidShapeOutside` /
  `_canonShapeOutside` / `_computeShapeOutside` are the three-axis wrappers.
- **`_opSvgPathAbsolute(data)`** — a NEW relative→absolute SVG path resolver. Specified
  `path()` keeps commands verbatim (`_opSvgPath`: relative kept, only `z`→`Z`, numbers
  re-serialized), but COMPUTED `path()` normalizes to absolute
  (`M 10 10 h 80 v 80 h -80 Z` → `M 10 10 H 90 V 90 H 10 Z`). The resolver folds
  `m/l/h/v/c/s/q/t/a` against the running point, tracks the sub-path start for `Z`,
  and keeps arc radii/flags verbatim (only the endpoint is relative). Called by
  `_clipPathPathComputed` (the computed twin of `_clipPathPathFn`).
- **`_serShapeMargin`** — `<length-percentage [0,∞]>`; `0`→`0px`; a bare non-zero
  number / `none` / negative plain dimension rejected (`_isNonNegShapeLP`). Computed
  folds em→px (`_posComputeLen`) and clamps a math result that went negative to `0px`.
- **`_serShapeThreshold`** — `<number> | <percentage>`; specified keeps a number
  verbatim and converts a percentage to its number (`50%`→`0.5`, `-100%`→`-1`) with
  NO clamp; computed clamps to `[0,1]`. `auto`/`<length>` rejected.

### Two shared `_opShape` fixes (correct for offset-path + clip-path too, zero regressions)

- **`_parseShapePos`** — a 3-value `<position>` inside a `<basic-shape>` is INVALID
  (CSS Values 4 / csswg-drafts #2140 removed the legacy 3-value form: `center left 1px`,
  `right top 5px`, …). Only 1/2/4-token positions are valid. Applied at every `_opShape`
  position check (circle/ellipse `at`, `ray(at …)`, shape() control-point + end-point).
  This is the whole `shape-outside-invalid-position` win (**+10**), and it does NOT
  touch `background-position` (which keeps its own `<bg-position>` path — verified
  31/31 held).
- **shape() `to <position>` end-point** — the `to` end-point of move/line/curve/smooth
  is an absolute `<position>` (so `smooth to center 20%` → `smooth to 50% 20%`), while
  `by` stays a relative `<coordinate-pair>`. Previously both were coordinate-pairs, so
  a position keyword (`center`) was wrongly rejected.

Wired exactly like clip-path (#196): setProperty branches (inline-parse + `setProperty`),
`_computedPropOf` dispatch, `CSS.supports` branches. (`_GCS_DEFAULTS` already had all
three properties.)

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `shape-outside-shape-invalid` | 0/9 | **9/9** |
| `shape-outside-shape-valid` | 11/12 | **12/12** |
| `shape-outside-path-invalid` | 0/7 | **7/7** |
| `shape-outside-path-valid` | 1/9 | **9/9** |
| `shape-outside-invalid-position` | 0/10 | **10/10** |
| `shape-outside-valid-position` | 10/20 | **20/20** |
| `shape-outside-computed` | 8/32 | **29/32** |
| `shape-margin-invalid` | 0/2 | **2/2** |
| `shape-margin-valid` | 3/4 | **4/4** |
| `shape-margin-computed` | 1/3 | **3/3** |
| `shape-image-threshold-invalid` | 0/2 | **2/2** |
| `shape-image-threshold-valid` | 2/5 | **5/5** |
| `shape-image-threshold-computed` | 1/6 | **6/6** |

**+81, ZERO regressions.**

## Caps (3, all in `shape-outside-computed`, all pre-existing classes — NOT parsing)

1. `rect(0px calc(100% - 20px) 2% 3em)` → the right edge `100% − (100% − 20px)` needs
   **symbolic `calc(% − %)` arithmetic** (`_opSub100` is single-unit). Same class as the
   clip-path #196 `calc(%+px)` xywh/rect cap and the background-size cap.
2. `circle(… right calc(10% * sign(1em − 1px)))` → `sign()` with **em resolution inside
   a position** doesn't fold (we emit `calc(100% − 0px)`).
3. `circle(… right calc(10% * sibling-index()))` → **`sibling-index()`** is a
   tree-counting function we cannot resolve.

## Zero-regression sweep

Shared surface (`_opShape`) fully held: `offset-path-parsing-invalid` 24/24,
`-parsing-valid` 70/70, `-shape-parsing` 35/35, `-shape-computed` 12/12,
`offset-path-computed` 65/65, `offset-shorthand` 18/18; `clip-path-invalid` 48/48,
`-valid` 54/54, `-shape-parsing` 43/44 (pre-existing `0Px` cap), `-computed` 19/21
(pre-existing 2 `calc(%+px)` caps). Broad: `mask-invalid` 13/13, `mask-computed` 32/32,
`background-valid` 45/46, `background-position-valid` 31/31, `serialize-values` 696/697,
qsa 1975/1975.

## Next leverage

`css-shapes/parsing/` is now CLOSED (13/13 files, only 3 layout/symbolic-math caps).
The `css/*/parsing/` value-engine vein (the #179→#197 lever: raw-store → validate/canon/
compute in JS `setProperty`/`getComputedStyle`) continues. Candidates — baseline a
sample first (`*-invalid` 0/N is the raw-store tell):
- **`css-scroll-snap`** remainder (scroll-snap-* / scroll-margin / scroll-padding).
- **`css-contain`** (`contain` / `container` / `container-type` / `container-name`).
- **`css-will-change`** (`will-change` = `auto | <animateable-feature>#`).
- **`css-overflow`** remainder / **`css-ui`** remainder.

grep `_serShapeOutside` / `_opSvgPathAbsolute` / `_parseShapePos` / `_serShapeMargin` /
`_serShapeThreshold` / `_clipPathPathComputed`.
