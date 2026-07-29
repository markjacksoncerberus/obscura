# 403–405 · The SVG Filter-Effects idlharness Verdict ⚔️🏳️‍⚧️

> *"Fix root-cause primitives, not leaves."* — #402 left the filter-effects `fe*`
> attribute set as the named next-leverage: the whole family lives in a **separate spec
> IDL** (`interfaces/filter-effects.idl`), and the reflection kit seeded in #400–#402 was
> built exactly for it. This arc cashed that in — **one `_svgReflect` table per `fe*`
> element** — and carried a fresh whole-feature idlharness from a third-green to whole.

**Realm:** `css/filter-effects/idlharness.any.html` (**184→485, 100%, +301**) — 3 quests,
ONE commit, ZERO regressions. Session 2026-07-29.

## The gap

`css/filter-effects/idlharness.any.js` type-checks the Filter Effects Module Level 1 IDL:
`SVGFilterElement` + the whole `fe*` primitive family (blend / colorMatrix /
componentTransfer + the `feFunc{R,G,B,A}` transfer functions / composite / convolveMatrix /
the diffuse & specular lighting + the three light sources / displacementMap / dropShadow /
flood / gaussianBlur / image / merge + mergeNode / morphology / offset / tile / turbulence).
The test declares `// TODO: objects` — **no `add_objects`**, so every subtest is pure
interface shape: the interface object + prototype, each attribute *present on the prototype
and throwing on a bare-prototype get*, each constant on both interface object and prototype,
and the two `setStdDeviation` operations.

After #399 every one of these interfaces **existed** (the SVG 2 hierarchy) but exposed **no
members**, and `SVGFEOffsetElement` had been missed from the hierarchy table entirely. So
184/485 passed (the bare interface-object/inheritance checks) and 301 attribute/constant/
operation subtests failed.

## The work (all `bootstrap.js`, one commit)

One self-contained block on top of the #400–#402 kit — `_svgReflect` (`[SameObject]`
`_nid`-branded getters), `_svgSeedConsts` (constants on interface + prototype),
`_svgDefElemOp` (ops with WebIDL arity + `this`-brand), and a local `_std(proto)` helper
for the `SVGFilterPrimitiveStandardAttributes` mixin (`x`/`y`/`width`/`height` +
`result`).

### #403 — the filter core + the primitive-standard-attributes mixin
- **`SVGFilterElement`** — `filterUnits`/`primitiveUnits` (`SVGAnimatedEnumeration`),
  `x`/`y`/`width`/`height` (`SVGAnimatedLength`), and `href` (the `SVGURIReference` mixin).
- **`SVGFilterPrimitiveStandardAttributes`** as the reusable `_std` helper, applied to every
  primitive that includes it (all `fe*` except the three light sources, `feMergeNode`, and
  the transfer-function elements).
- **`SVGFEBlendElement`** (`in1`/`in2`/`mode`), **`SVGFEColorMatrixElement`**
  (`in1`/`type`/`values`), **`SVGFEComponentTransferElement`** (`in1`), and the
  **`SVGComponentTransferFunctionElement`** base (`type`/`tableValues`/`slope`/`intercept`/
  `amplitude`/`exponent`/`offset` — inherited by `feFunc{R,G,B,A}`, which add nothing).

### #404 — the rest of the `fe*` family + the missing element + the ops
- **`SVGFEOffsetElement` added to the SVG 2 hierarchy table** (`_defSvgIface`, base
  `SVGElement`, tag `feoffset`) — it had never been created; `_sp('SVGFEOffsetElement')`
  would otherwise dereference `undefined`.
- **`SVGFECompositeElement`** (`in1`/`in2`/`operator`/`k1..k4`),
  **`SVGFEConvolveMatrixElement`** (the full order/kernel/target/edgeMode/preserveAlpha set —
  the `SVGAnimatedInteger`/`SVGAnimatedBoolean`/`SVGAnimatedNumberList` types),
  **`SVGFEDiffuseLightingElement`**/**`SVGFESpecularLightingElement`**, the three light
  sources **`SVGFEDistantLightElement`**/**`SVGFEPointLightElement`**/**`SVGFESpotLightElement`**
  (no standard-attributes mixin), **`SVGFEDisplacementMapElement`**,
  **`SVGFEDropShadowElement`**/**`SVGFEGaussianBlurElement`** (+ the `setStdDeviation(x, y)`
  operation, arity 2), **`SVGFEImageElement`** (`preserveAspectRatio` + **`crossOrigin` as an
  `SVGAnimatedString`** — the filter-effects IDL types it as the animated wrapper, *not* the
  HTML enumerated `DOMString`, so it reflects via `_svgReflect`, not `_svgReflectCrossOrigin`
  — + `href`), **`SVGFEMergeElement`**/**`SVGFEMergeNodeElement`**,
  **`SVGFEMorphologyElement`**, **`SVGFEOffsetElement`**, **`SVGFETileElement`**,
  **`SVGFETurbulenceElement`**.

### #405 — the constant sets + carry to 100%
- **Seeded every constant set** (on interface object AND prototype): `SVG_FEBLEND_MODE_*`
  (0–16), `SVG_FECOLORMATRIX_TYPE_*` (0–4), `SVG_FECOMPONENTTRANSFER_TYPE_*` (0–5),
  `SVG_FECOMPOSITE_OPERATOR_*` (0–6), `SVG_EDGEMODE_*` (0–3, shared by convolveMatrix &
  gaussianBlur), `SVG_CHANNEL_*` (0–4), `SVG_MORPHOLOGY_OPERATOR_*` (0–2), and the
  turbulence `SVG_TURBULENCE_TYPE_*` + `SVG_STITCHTYPE_*` (0–2 each).

## Results

| Test | Before | After | Status |
|------|:------:|:-----:|:------:|
| `css/filter-effects/idlharness.any.html` | 184/485 | **485/485** | 🟢 100% |
| `svg/idlharness.window.html` | 1692/1709 | **1700/1709** | 🟢 99.5% (fallout) |

The same reflection block closes the `fe*` attribute fails that #402 had capped in
`svg/idlharness.window.html`, plus the interface-object checks for the now-existent
`SVGFEOffsetElement` — +8 there, purely as downstream fallout.

## Zero-regression sweep (all identical)

createElementNS **596/596** (the SVG wrap path + the new `feOffset` hierarchy row),
createElement 147, classlist 1420, qsa 1975, css-masking/idlharness 41, cssom/idlharness
493 (the 4 caps unchanged), css-animations 98, css-transitions 64.

## Caps / Next

`css/filter-effects/idlharness.any.html` is **100%**. Remaining caps:
- **`css/filter-effects/idlharness.any.worker.html`** — a could-not-run: the worker
  variant never loads testharness (Web Workers are a separate, unimplemented subsystem —
  orthogonal to this arc, not a regression).
- **`svg/idlharness.window.html`** — the final **9 fails are the documented Geometry /
  Web-Animations dependency caps**: `viewBox.animVal` (`DOMRectReadOnly`) and
  `currentTranslate` (`DOMPointReadOnly`) need the Geometry-Interfaces read-only variants
  (2); `ShadowAnimation` extends the Web Animations `Animation` interface Obscura doesn't
  implement (7). Neither is an SVG bug.

**NEXT LEVERAGE:** the SVG idlharness family is effectively done (`svg/idlharness` 99.5%,
css-masking 100%, filter-effects 100%). Pivot to a **fresh whole-feature idlharness at 0/N**
— scout the CSS/DOM idlharness tails via the GitHub contents API and curl-verify every
wpt.live path (⅓ 404; a 404 body is 42 bytes → reads as CNR). The **SVG reflection kit is
fully mature** — `_svgReflect`/`_svgReflectStr`/`_svgNullAttr`/`_svgReflectCrossOrigin`
(attribute tables), `_svgSeedConsts` (interface+prototype constants), `_svgDefElemOp` (ops
with arity + `this`-brand) — adding any remaining SVG-adjacent element's attributes is now
one table.
