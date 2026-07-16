# Scroll #195 — The Mask Verdict

**Realm:** `css/css-masking/parsing/mask*`
**Session:** 2026-07-16 · **Result:** +120 subtests, ZERO regressions
**Lever:** CSS value parsing in JS `CSSStyleDeclaration.setProperty` + `getComputedStyle` (the #179→#194 pattern)

## The gap

Took the #194 next-leverage option: a NEW untouched `css/*/parsing/` dir. `css-masking`
was pure raw-store — no `mask` handling existed in `bootstrap.js` at all. Two shapes,
the familiar raw-store tell:

1. **The mask sub-longhands stored RAW.** `mask-repeat`/`-size`/`-composite`/`-mode`/
   `-origin`/`-clip`/`-type` accepted any value → every `*-invalid` at 0/N, no canon
   (`mask-size: 1px`→`1px auto`, `mask-repeat: repeat no-repeat`→`repeat-x`), and every
   `*-computed` at 0/N (getComputedStyle echoed the raw specified string).
2. **The `mask` shorthand was UNMODELLED.** `el.style.mask = …` fell through to single-key
   storage → mask-invalid 0/13, mask-computed 0/32.

`mask-image` (in `_GRADIENT_PROPS`) and `mask-position` (in `_POSITION_PROPS`) already
validated/computed, so those two suites were already green — the machinery was live, the
rest of the family just wasn't wired to it.

## The grammar (CSS Masking 1)

```
mask = <mask-layer>#
<mask-layer> = <mask-reference> || <position> [ / <bg-size> ]? || <repeat-style>
            || <geometry-box> || [ <geometry-box> | no-clip ]
            || <compositing-operator> || <masking-mode>
```

- **mask-reference** (mask-image): `none | <image> | url(...)`.
- **repeat-style** (mask-repeat): `repeat-x | repeat-y | [repeat|space|round|no-repeat]{1,2}`,
  the two-token form collapsing to a single keyword (`repeat no-repeat`→`repeat-x`,
  `no-repeat repeat`→`repeat-y`, equal pair→one). (Differs from background-repeat, which keeps the pair.)
- **bg-size** (mask-size): identical grammar to `background-size`.
- **geometry-box**: `content-box | padding-box | border-box | fill-box | stroke-box | view-box`.
  **NOTE:** `margin-box` is NOT accepted by mask (`test_invalid_value('mask','margin-box')`).
- **origin/clip**: `<geometry-box> || [<geometry-box> | no-clip]` — order-independent. Origin is
  the plain geometry-box; the clip member additionally allows `no-clip`. So `no-clip stroke-box`
  and `stroke-box no-clip` both mean origin=stroke-box, clip=no-clip.
- **compositing-operator** (mask-composite): `add | subtract | intersect | exclude` (per layer, `#`).
- **masking-mode** (mask-mode): `alpha | luminance | match-source` (per layer, `#`).
- **mask-type** (NOT in the shorthand — an SVG presentation attribute on `<mask>`):
  `luminance | alpha`, a SINGLE keyword, no comma list.

## The fix (all JS in `bootstrap.js`)

- **`_canonMaskLayer(name, layer)` + `_canonMask(name, value)` + `_MASK_VALIDATED`** — per-layer
  `<type>#` validate/canon for mask-repeat/-size/-composite/-mode/-origin/-clip. mask-size reuses
  `_canonBgLayer('background-size', …)` verbatim; mask-repeat has its own two-token collapse
  (`_canonMaskRepeat2`). Routed via a new `_MASK_VALIDATED` setProperty branch after `_BG_VALIDATED`,
  before `_COLOR_PROPS`. **`_canonMaskType`** is a separate single-value (no-comma) branch.
- **`_parseMaskShort(value)`** — expands into + stores the 8 longhands (image/position/size/repeat/
  origin/clip/composite/mode). Per layer: `_bgLayerToks` splits (functions whole, top-level `/` its own
  token), then classifies each token. **`_maskResolveBox`** applies the order-independent origin/clip
  rule. **The one subtlety worth its own note:** the `<mask-reference>` check must come BEFORE the
  `<position>` check — a gradient token can embed a math function (`linear-gradient(calc(…), …)`) and
  the math-name regex `_MATHFN_NAME_RE` matches ANYWHERE in a token, so a calc-bearing gradient would
  otherwise be mis-sniffed as a `<position>` component and rejected (this is why `mask: linear-gradient(
  calc(90deg - 45deg), …)` was failing while the `mask-image` longhand accepted it).
- **`_serMaskShort(get)`** reconstructs per layer `<image> <position>[/<size>] <repeat> <origin/clip>
  <composite> <mode>`, each component omitted at its initial. The `<geometry-box>` serialization
  (derived empirically from mask-computed): origin==clip → one box (omit if the initial border-box);
  else `origin clip`, EXCEPT the origin is dropped when it holds the initial border-box AND the clip is
  `no-clip` (so `border-box no-clip`→`no-clip` but `stroke-box no-clip`→`stroke-box no-clip`).
- **Computed** — a `kebab === 'mask'` branch in getComputedStyle's `resolve()` reconstructs the shorthand
  from the COMPUTED longhands (`_serMaskShort((ln) => resolve(ln))`), so gradient colours resolve to
  `rgb()`, lengths to px, etc. The eight longhands + mask-type registered in `_GCS_DEFAULTS` (initials:
  position `0% 0%`, size `auto`, repeat `repeat`, origin/clip `border-box`, composite `add`, mode
  `match-source`, type `luminance`); the sub-longhand computed suites pass via the keyword-identity echo.
- Wired EXACTLY like the `background` shorthand (#193): setProperty expand gated on `!var()`;
  removeProperty/getPropertyValue clear/reconstruct; three CSS.supports branches; `_MASK_SH_LH` the
  8-longhand list; `mask` added to `_CSS_KNOWN_PROPS`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| mask-invalid | 0/13 | **13/13** |
| mask-computed | 0/32 | **32/32** |
| mask-repeat-invalid | 0/5 | **5/5** |
| mask-repeat-valid | 16/22 | **22/22** |
| mask-repeat-computed | 0/22 | **22/22** |
| mask-size-invalid | 0/3 | **3/3** |
| mask-size-valid | 7/9 | **9/9** |
| mask-size-computed | 0/16 | **14/16** |
| mask-composite-invalid | 0/14 | **14/14** |
| mask-composite-valid | 5/5 | 5/5 |
| mask-composite-computed | 0/4 | **4/4** |
| mask-type-invalid | 0/3 | **3/3** |
| mask-type-valid | 2/2 | 2/2 |
| mask-type-computed | 0/2 | **2/2** |
| mask-position-valid | 23/23 | 23/23 |
| mask-position-invalid | 13/13 | 13/13 |
| mask-image-computed | 47/47 | 47/47 |

**+120, ZERO regressions.** Held: qsa 1975, classlist 1420, serialize-values 696/697,
cssom/shorthand-serialization 7/7, color-valid 17/17, color-invalid 8/11, color-computed 16/16,
grid-shorthand-valid 49, background-valid 45/46, background-invalid 2/2, background-computed 39/39,
background-size-computed 14/16, background-repeat-computed 12/13, background-clip-valid 9/9,
border-image-valid 30/30, border-image-invalid 17/17, border-image-shorthand.sub 30/30.

## Caps / Next

- **CAP (pre-existing, NOT parsing):** mask-size-computed 14/16 — the two `calc(10px + 0.5em)`→`30px 0px`
  rows need font-size resolution (= layout), exactly the same cap as background-size-computed (also 14/16).
  The specified-value engine folds no `em`; a computed-length follow-up would need real layout context.
- **CAP (shared gradient engine, NOT mask):** the gradient-with-calc rows are all now GREEN (the
  reference-before-position reorder fixed them), so this quest hit no gradient caps — noted only so the
  next knight knows the gradient engine *does* handle `calc()`/`turn` inside gradients here.
- **NEXT LEVERAGE:** `css-masking/parsing/` still has the **`clip-path`** sub-vein — a `<basic-shape>`
  value engine: `clip-path-invalid` 0/48, `clip-path-valid` 36/54 (+18), plus `clip-path-shape-parsing`,
  and the legacy `clip: rect()` (`clip-invalid` 0/4, `clip-computed` 0/4). `<basic-shape>` =
  `inset()|circle()|ellipse()|polygon()|path()|rect()|xywh()` + a `<geometry-box>` — a self-contained
  parser, same three-axis pattern (`_canon*` + `_*_VALIDATED` setProperty branch + CSS.supports branch).
  Then `css-shapes` (`shape-outside` shares `<basic-shape>`) is a natural sibling reusing that engine.
  Baseline a sample first (`*-invalid` 0/N is the raw-store tell).
