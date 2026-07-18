# Quest #69 — The Composited Verdict ✅ SECURED (+7)

**Realm:** `css/css-images/parsing/image-function-*` + `css/css-backgrounds/parsing/background-image-valid`
**Banner:** `<image>`-function canonicalization — `image()` + `cross-fade()`
**Session:** 2026-06-21

---

## The gap

`_canonGradients` (the #64–67 `<image>` canonicalizer) only recognized the
*gradient* functions (`linear`/`radial`/`conic`-gradient, incl. `repeating-`).
Two sibling `<image>` functions were stored/serialized verbatim:

- **`image( <color> )`** — `css/css-images/parsing/image-function-valid` **12/13**
  (`image(rgb(0 128 255))` never canonicalized → `image(rgb(0, 128, 255))`) and
  `image-function-computed` **1/3** (`image(red)`→`image(rgb(255, 0, 0))`,
  `image(transparent)`→`image(rgba(0, 0, 0, 0))` never resolved).
- **`cross-fade()`** — `css/css-backgrounds/parsing/background-image-valid`
  **9/13** (the 4 fails were all `cross-fade()`): a `<percentage>` was kept in
  its written position instead of being serialized after the image
  (`cross-fade(50% url(…), …)`→`cross-fade(url(…) 50%, …)`,
  `cross-fade( 1% red, green)`→`cross-fade(red 1%, green)`), and stray inner
  whitespace was not normalized.

Both are `<image>` functions that compose wherever an `<image>` is expected
(`cross-fade(image(green), red)`, `image(…), linear-gradient(…)`), so they
belong in the same canonicalizer.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

Generalized `_canonGradients` from a gradient-only scan to an `<image>`-function
scan, dispatching by head:

- **`_IMAGE_FUNC_HEAD`** = gradient heads **|** `cross-fade` **|** `image`; the
  fast-path bail now tests `/(?:gradient|cross-fade|image)\(/i`. The balanced-
  paren scan, token-boundary guard, and EOF-auto-close are unchanged; only the
  per-head dispatch is new (`m[1]` = function name without `(`).
- **`_canonImageInner(inner, el, computed)`** — `image(<color>)`: specified →
  `_canonColorSpecified` (named/`currentcolor`/`transparent`/CSS-wide/modern
  functions like `light-dark()`/`color-mix()`/relative `rgb(from …)` stay
  verbatim; legacy hex/`rgb`/`hsl` canonicalize); computed → `_computeColor`
  (`red`→`rgb(255, 0, 0)`, `transparent`→`rgba(0, 0, 0, 0)`). A url()/non-colour
  `<image-src>` returns unchanged from both helpers → verbatim.
- **`_canonCrossFadeInner(inner, el, computed)`** — split top-level commas into
  `<cf-image>`s; each is `<percentage>? && [ <image> | <color> ]`. Partition the
  ws-tokens into the `<percentage>` and the rest, canonicalize the rest via
  **`_canonCfImage`**, and emit `<image|colour> <percentage>` (image first,
  percentage last, single-space separated).
- **`_canonCfImage(tok, el, computed)`** — a nested `<image>` function
  (gradient/`image()`/`cross-fade()`) recurses through `_canonGradients`
  (handles `cross-fade(image(green), red)` and
  `cross-fade(red 1%, cross-fade(red 2%, green))`); otherwise the token is a
  `<color>` → `_canonColorSpecified`/`_computeColor` (url() unchanged).

Already wired: `background-image` ∈ `_GRADIENT_PROPS`, so all of these route
through `_canonGradients` on the specified path (`setProperty` /
`_parseStyleDecls`) and the computed path (`_normComputed`) with no new wiring.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-images/parsing/image-function-valid.html` | 12/13 | **13/13** |
| `css/css-images/parsing/image-function-computed.html` | 1/3 | **3/3** |
| `css/css-backgrounds/parsing/background-image-valid.html` | 9/13 | **13/13** |

**+7. ZERO regressions** — swept gradient-position-valid 18 / -computed 43,
gradient-interpolation-method-valid 1398, background-position-computed 32,
color-valid 17, color-computed 16, serialize-values 695/697,
shorthand-serialization 7, Element-matches 669, Document-createElement 147;
`cargo test -p obscura-dom` 40/40. The composing cases that previously passed
verbatim (`cross-fade(image(green), red)`, `image(…), linear-gradient(…)`,
`cross-fade(blue, linear-gradient(…))`, `cross-fade(red 1%, cross-fade(…))`)
stay byte-identical because nested gradients recurse through the unchanged
gradient canonicalizer.

## Caps / Next leverage

1. **URL absolutization** — `url("a.b#c")`→`url("https://…/a.b#c")` against the
   document base URL; the standing foundational `<url>`-computed primitive
   (`border-image-source-computed` last cap, broad across `*-computed`). The
   `cross-fade(url(…))` valid subtest accepts both quoted and unquoted forms so
   it passed without this, but the computed `<url>` family still needs it.
2. **`cross-fade()` computed** — `cross-fade-computed` / `cross-fade-valid` were
   wpt.live **404** this session (serving flux); the computed reorder + colour
   compute is already implemented, so they should land for free once served.
3. **`image-set()` / `-webkit-image-set()`** canon (resolution/`type()` args).
4. Comprehensive valid-property registry (csstext unknown-prop drop —
   serialize-values hot-path risk; standing since #60).
5. Fresh realm (`fetch/`, `html/dom/` reflection).

**Serving-flux note:** `mask-image-computed`, `list-style-image-computed`,
`variable-substitution-background-properties`, `cross-fade-*` all returned HTTP
404 (`bodyLen=42`) from wpt.live this session — NOT regressions; their identical
code is proven safe by `gradient-position-computed` 43/43 + `color-computed`
16/16 holding.
