# Quest #196 — The Clip-Path Verdict

**Realm:** `css/css-masking/parsing/` — the `clip-path` / `clip` / `clip-rule` sub-vein
**Banner:** A `clip-path` `<basic-shape>` value engine reusing the offset-path `_opShape`.
**Result:** **+121, ZERO regressions.** Session 2026-07-16.

## The gap

`css-masking`'s clip family was pure raw-store — `clip-path`, `clip-rule`, and the
legacy `clip` were stored verbatim in `setProperty`, so every `*-invalid` and every
`*-computed` suite was 0/N, and the `*-valid` suites passed only the rows whose input
already equalled the canonical form (round-trip luck):

| Test | Before |
|------|:------:|
| `clip-path-invalid` | 0/48 |
| `clip-path-valid` | 36/54 |
| `clip-path-shape-parsing` | 19/44 |
| `clip-path-computed` | 0/21 |
| `clip-invalid` | 0/4 |
| `clip-computed` | 0/4 |
| `clip-rule-invalid` | 0/2 |
| `clip-rule-computed` | 0/2 |

## The discovery

The entire `<basic-shape>` engine — `_opShape` (inset / circle / ellipse / polygon /
path / rect / xywh / shape) with full specified-canon + computed resolution (default
keywords elided, `xywh()`/`rect()`→`inset()`, em/pt→px) — **already existed** for
`offset-path`. `clip-path`'s grammar is nearly the same:

```
clip-path = none | <clip-source> | [ <basic-shape> || <geometry-box> ]
  <clip-source>  = <url>            (a reference; stands alone — no geometry-box)
  <geometry-box> = <shape-box> | fill-box | stroke-box | view-box
  <shape-box>    = <visual-box> | margin-box   (content/padding/border/margin-box)
```

`<geometry-box>` is exactly the offset-path `_COORD_BOX` set, so the box handling and
the border-box-elided-beside-a-shape rule port straight over.

## The work (all JS in `bootstrap.js`)

- **`_serClipPath(value, computed, el)`** — the clip-path serializer. Tokenizes into
  geometry-box keywords + at most one function, delegates the shape functions to
  `_opShape`, with two clip-path-specific deviations:
  - **`ray()` forbidden** — it is motion-only, not a `<basic-shape>`.
  - **`path()` carries an optional leading `<fill-rule>`** — `_clipPathPathFn`
    handles `path( <fill-rule>? , <string> )`, `nonzero` (default) elided. The
    fill-rule prefix is matched with a **quote-aware regex** (`/^(nonzero|evenodd)\s*,/`)
    so a comma *inside* the SVG `<string>` (`"M20,20…"`) is not mistaken for the
    separator — `_commaSplitTop` is paren/bracket-aware but NOT quote-aware.
  - **`url()`** = a standalone `<clip-source>`; combining it with a geometry-box is
    rejected.
  - `_isValidClipPath` / `_canonClipPath` / `_computeClipPath` are the thin
    valid/canon/compute wrappers (the #179→#195 three-axis pattern).
- **`_canonClipRule`** — `nonzero | evenodd` single keyword (inherited; computed =
  identity, registered in `_GCS_DEFAULTS`).
- **`_serClip`** — the legacy CSS2 `clip`: `auto | rect(<t>,<r>,<b>,<l>)`, **comma-
  separated only** (space-separated `rect()` is invalid for `clip`), each edge a
  **signed `<length>` | auto** (NO percentages — `_isClipLen`), serialized with `, `.
  Computed resolves em/…→px via `_posComputeLen` (`calc(-1em + 10px)`→`-30px`).

### The shared `_opShape` fix (made offset-path stricter, zero regressions)

Three of the clip-path-invalid rows exposed a **genuine `_opShape` bug** shared with
offset-path: it accepted a unitless non-zero number (`123`) as a length, and accepted
negative radii / border-radius. `_isPosLP` (the `<position>` predicate) is too loose
for shapes. Added:

- **`_isShapeLP`** — a shape `<length-percentage>`: percentage, length-with-unit,
  unitless **0** only, or math. Rejects a bare non-zero number. Applied to inset
  offsets.
- **`_isNonNegShapeLP`** — as above, but also rejects a negative plain dimension
  (math sign is unknown at parse, deferred to computed). Applied to border-radius
  (`_opBorderRadius`) and circle/ellipse radii.
- **`_opClampRadius`** — computed-time: a radius that resolved to a negative `<length>`
  clamps to `0px` (`circle(calc(10px - 0.5em))` with em=40 → `-10px` → `0px`).

## Wiring

Wired exactly like `offset-path`: an `else if` branch in both the inline-style parser
and `setProperty` (validate → canon, drop/ignore on invalid), a `_computedPropOf`
dispatch (`kebab === 'clip-path'`/`'clip'` → compute fn; `clip-rule` echoes),
`_GCS_DEFAULTS` registration (`clip-path:none`, `clip-rule:nonzero`, `clip:auto`), and
three `CSS.supports` branches.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `clip-path-invalid` | 0/48 | **48/48** | +48 |
| `clip-path-valid` | 36/54 | **54/54** | +18 |
| `clip-path-shape-parsing` | 19/44 | **43/44** | +24 |
| `clip-path-computed` | 0/21 | **19/21** | +19 |
| `clip-invalid` | 0/4 | **4/4** | +4 |
| `clip-computed` | 0/4 | **4/4** | +4 |
| `clip-rule-invalid` | 0/2 | **2/2** | +2 |
| `clip-rule-computed` | 0/2 | **2/2** | +2 |
| **Total** | | | **+121** |

(`clip-valid` 3/3 and `clip-rule-valid` 2/2 were already green.)

**Zero regressions.** offset-path-invalid 24/24, -valid 70/70, -computed 65/65,
offset 13/13 + 29/29 (the `_opShape` tightening broke nothing — it only rejected
genuinely-invalid values offset-path's own suites never exercised). Held realms: qsa
1975, serialize-values 696/697, mask-invalid 13/13, mask-computed 32/32, grid-
shorthand-valid 49/49, background-valid 45/46.

## Caps (3, all pre-existing/shared — NOT clip-path parsing)

1. **2 mixed-`calc(%+px)` xywh/rect computed rows** — e.g.
   `xywh(calc(0px) calc(1px+1%) calc(2px+2%) calc(3px+3%))` expects
   `inset(calc(1%+1px) calc(98%-2px) calc(96%-4px) 0px)`: computing `100% − x − w`
   when `w` is itself a mixed `calc(2px+2%)` needs **symbolic calc arithmetic**
   (`100%−(2%+2px)`=`98%−2px`), which `_opShape`'s `_opPctPx` (single-unit only)
   cannot do. Same class as the background-size-computed calc cap. Shared with
   offset-path (whose computed suite doesn't include these → 65/65).
2. **1 `0Px`→`0px` unit-lowercasing** in `shape(EvenOdd from 0px 0Px, CLOSE)` —
   `_canonLPToken` doesn't lowercase a dimension's unit; used very broadly, low ROI.

## Next leverage

`css-masking/parsing/` is now effectively **CLOSED** (mask #195 + clip-path #196).
Pivot to a NEW untouched `css/*/parsing/` dir:

- **`css-shapes`** — `shape-outside` **shares `<basic-shape>`**, so it can reuse the
  `_serClipPath` pattern (plus its own `<image>`/box specifics) almost verbatim;
  `shape-margin` is a simple `<length-percentage>`. Natural sibling.
- **`css-scroll-snap`** remainder, **`css-contain`**, or **`css-will-change`**.

Baseline a sample first (`*-invalid` 0/N is the raw-store tell). Same three-axis JS
value-engine pattern (`_canon*`/`_ser*` + a `setProperty` branch + a `CSS.supports`
branch + `_GCS_DEFAULTS`). grep `_serClipPath` / `_clipPathPathFn` / `_isShapeLP` /
`_isNonNegShapeLP` / `_serClip` / `_canonClipRule`.
