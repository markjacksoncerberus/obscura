# Scroll #194 — The Border-Image Verdict

**Realm:** `css/css-backgrounds/parsing/border-image-*`
**Session:** 2026-07-16 · **Result:** +71 subtests, ZERO regressions
**Lever:** CSS value parsing in JS `CSSStyleDeclaration.setProperty` (the #179→#193 pattern)

## The gap

The `border-image` sub-vein was the last raw-store region of `css/css-backgrounds/parsing/`.
Two shapes, both the familiar raw-store tell:

1. **The five longhands stored RAW.** `border-image-source`/`-slice`/`-width`/`-outset`/`-repeat`
   accepted any value → every `*-invalid` at 0/N, and no canonicalization
   (`fill 1 2% 3 4%` should serialize `1 2% 3 4% fill`; `space space` → `space`).
2. **The `border-image` shorthand was UNMODELLED.** `el.style.borderImage = …` fell through to
   single-key storage → the shorthand-longhand test 0/30, border-image-valid 28/30.

## The grammar (CSS Backgrounds 3 §border-image)

```
border-image = <'border-image-source'>
            || <'border-image-slice'> [ / <'border-image-width'>
                                       | / <'border-image-width'>? / <'border-image-outset'> ]?
            || <'border-image-repeat'>
```

- **source**: `none | <image>` (a single image — no comma layer list).
- **slice**: `[<number [0,∞]> | <percentage [0,∞]>]{1,4} && fill?` — `fill` contiguous with the number
  run (before or after, never mid-run: `1% fill 2%` invalid), serialized LAST.
- **width**: `[<length-percentage [0,∞]> | <number [0,∞]> | auto]{1,4}`.
- **outset**: `[<length [0,∞]> | <number [0,∞]>]{1,4}` — no percentage, no auto.
- **repeat**: `[stretch | repeat | round | space]{1,2}` — two equal keywords collapse to one.

## The fix (all JS in `bootstrap.js`)

- **`_canonBorderImage(name, value)`** dispatches five per-longhand canon fns:
  `_canonBiSlice`/`_canonBiWidth`/`_canonBiOutset`/`_canonBiRepeat`/`_canonBiSource`.
  Numeric tokens matched by sign-free regexes `_biNum`/`_biPct`/`_biLen` (a leading `-` simply
  fails to match → negatives rejected). `_biCollapse` does the margin-style 1–4 collapse
  (`1 1 1 1`→`1`, `1 2% 3 4%` stays).
- Routed via a new **`_BI_VALIDATED`** branch placed BEFORE the `_GRADIENT_PROPS` branch in
  setProperty (source is in both; `_GRADIENT_PROPS` would accept `auto`/a comma layer list, so
  `_BI_VALIDATED` must intercept first). Source canon reuses
  `_canonImageSet(_canonGradients(v, null, false))` — byte-identical to the gradient path, so
  border-image-source-valid/-computed don't regress.
- **`_parseBorderImageShort(value)`** — the three `||` members (source / slice-group / repeat) in
  any order; the slashes bind to the slice-group. `_bgLayerToks` tokenizes (functions whole, a
  top-level `/` its own token) so `1 / -2px`, `1 / / auto`, `1 / none / 1px`, `1 2 3 4 5 / / 1px`
  are all rejected. Expands into + stores the five longhands (already canonical).
- **`_serBorderImage(get)`** reconstructs: source shown if non-default; slice shown if slice/width/
  outset non-default; `/ <width>` when width or outset non-default; `/ / <outset>` when outset alone
  is non-default; repeat shown if non-default; all-default → `none`. A fixed-point of parse∘serialize
  (round-trips). All-CSS-wide → that keyword.
- Wired EXACTLY like the `background` shorthand (#193): setProperty expand gated on `!var()`;
  removeProperty/getPropertyValue clear/reconstruct; two CSS.supports branches; `_BI_SH_LH` the
  5-longhand list.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| border-image-shorthand.sub | 0/30 | **30/30** |
| border-image-valid | 28/30 | **30/30** |
| border-image-invalid | 0/17 | **17/17** |
| border-image-slice-valid | 3/4 | **4/4** |
| border-image-slice-invalid | 0/6 | **6/6** |
| border-image-width-valid | 5/5 | 5/5 |
| border-image-width-invalid | 0/5 | **5/5** |
| border-image-outset-valid | 3/3 | 3/3 |
| border-image-outset-invalid | 0/5 | **5/5** |
| border-image-repeat-valid | 2/3 | **3/3** |
| border-image-repeat-invalid | 0/2 | **2/2** |
| border-image-source-valid | 2/2 | 2/2 |
| border-image-source-invalid | 0/2 | **2/2** |
| border-image-source-computed.sub | 10/10 | 10/10 |

**+71, ZERO regressions.** Held: qsa 1975, serialize-values 696/697, color-valid 17/17,
color-invalid 8/11, border-color-valid 7/7, grid-shorthand-valid 49, background-valid 45/46,
background-computed 39/39, background-invalid 2/2, bg-position-valid 31.

## Caps / Next

- **CAP (pre-existing, NOT a parsing issue):** `border-image-width`/`-outset`/`-slice`/`-repeat`-computed
  are 0/N — those four longhands aren't registered in the getComputedStyle machinery ("border-image-*
  doesn't seem to be supported in the computed style"). This is a **computed-style-registration** task
  (add the four to the computed-property list + resolution), independent of this specified-value change.
  border-image-source-computed passes because source IS registered (via `_GRADIENT_PROPS`/computed
  defaults). A future quest could register the four (mostly identity resolution for the specified
  keywords/lengths; width/outset resolve `<number>`/`<length>` but `auto`/`%` stay symbolic → likely
  layout-independent for most rows) — ~29 subtests (width 12, outset 7, slice 7, repeat 3).
- **NEXT LEVERAGE:** this closes `css/css-backgrounds/parsing/` entirely. Move to a NEW untouched
  `css/*/parsing/` dir — `css-shapes` (`shape-outside`/`clip-path` `<basic-shape>`), `css-masking`
  (`mask`/`mask-*` — a mask value engine, directly analogous to the background shorthand), or the
  `css-scroll-snap` remainder. Baseline a sample first (`*-invalid` 0/N is the raw-store tell). The
  #179→#194 three-axis JS value-engine pattern (`_canon*` + `_*_VALIDATED` setProperty branch +
  CSS.supports branch + a shorthand `_parse*`/`_ser*`) still applies.
