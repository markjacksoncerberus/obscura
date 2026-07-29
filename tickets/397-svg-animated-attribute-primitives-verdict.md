# 397–399 · The SVG Animated-Attribute Primitives Verdict ⚔️🏳️‍⚧️

> *"Fix root-cause primitives, not leaves."* — the campaign creed. This arc took the
> memory's highest-downstream-leverage pointer at its word: the SVG animated-attribute
> primitives, which unblock file after file.

**Realm:** `css/css-masking/idlharness.html` (**9→41, 100%, +32**) &
`svg/idlharness.window.html` (**148→652, 38.2%, +504**) — **+536 total**, 3 quests,
ONE commit, ZERO regressions. Session 2026-07-29.

## The gap

SVG support was three classes deep — `SVGElement`, `SVGSVGElement`, `SVGStyleElement`.
Every other SVG element interface was missing, and so were ALL the SVG animated-attribute
wrapper types (`SVGAnimated*`) and value types (`SVGLength`/`SVGRect`/…). Worse, the
element-wrap path (`_elementClassFor`) was namespace-*blind*: a parsed `<clipPath>` /
`<rect>` was mapped through `_htmlClassForLocal` → `HTMLUnknownElement`, not an SVG
interface at all. `css-masking/idlharness` (SVGClipPathElement + SVGMaskElement) sat at
9/41; the giant `svg/idlharness` at 148/1709.

## The work

### #397 — namespace-aware wrapping + `SVGClipPathElement` + the first animated wrappers
- **Namespace-aware `_elementClassFor`.** New `_MAYBE_SVG_TAGS` (the SVG-only element
  locals + `svg`); a parsed element whose lowercased local is in that set resolves its
  real namespace via the `namespace_uri` bridge op and, if SVG, maps through the new
  `_svgClassForLocal` / `_SVG_IFACE_BY_TAG`. The common HTML tag pays **no** extra bridge
  call (its local isn't in the set). `createElementNS` re-pointed at `_svgClassForLocal`
  too (was an inline `svg ? SVGSVGElement : SVGElement` ternary).
- **`SVGClipPathElement`** (`clipPathUnits` → `SVGAnimatedEnumeration`, `transform` →
  `SVGAnimatedTransformList`), non-author-constructible (`...args` ctor → `.length` 0,
  numeric nid on the wrap path or "Illegal constructor"), `Symbol.toStringTag`,
  `[SameObject]` getters caching the wrapper on the element, `_nid`-branded (reading on
  the bare prototype throws).
- **`SVGAnimatedEnumeration`/`SVGAnimatedLength`/`SVGAnimatedTransformList`** + the value
  types `SVGLength` (with the `SVG_LENGTHTYPE_*` constants) & `SVGTransformList`. Minted
  internally via `_newSvg` (a one-shot ctor-guard flip); `baseVal`/`animVal` brand-checked.
- css-masking **9→21**.

### #398 — `SVGMaskElement`
- `maskUnits`/`maskContentUnits` (`SVGAnimatedEnumeration`), `x`/`y`/`width`/`height`
  (`SVGAnimatedLength`) — the same [SameObject] `_nid`-branded getter recipe.
- css-masking **21→41 (100%)**.

### #399 — the SVG element interface hierarchy + the value/animated type set
- **The element hierarchy** (`_defSvgIface` + a `[name, base, tag]` table): the SVG 2
  inheritance tree — abstract bases `SVGGraphicsElement`/`SVGGeometryElement`/
  `SVGGradientElement`/`SVGComponentTransferFunctionElement`/`SVGTextContentElement`/
  `SVGTextPositioningElement`/`SVGAnimationElement`, then ~50 concrete element interfaces
  (containers, geometry, text, gradients, all the `feXxx` filter primitives, the
  animation elements). Each: correct `extends` base (so the interface-object prototype
  chain matches IDL), `.length` 0, own `.name`, `Symbol.toStringTag`, non-author-ctor.
  `SVGSVGElement` reparented `: SVGElement` → `: SVGGraphicsElement` per SVG 2.
  Registered into `_SVG_IFACE_BY_TAG` so `createElementNS`/the wrap path mint them.
  **svg/idlharness 148→443 (+295).**
- **The value + animated-wrapper type set**: `SVGNumber`/`SVGRect`/`SVGPoint`/`SVGMatrix`/
  `SVGAngle`/`SVGPreserveAspectRatio` + the `SVGUnitTypes` constants iface; the list
  interfaces `SVGNumberList`/`SVGLengthList`/`SVGPointList`/`SVGStringList` (via a generic
  `_defSvgList`); the scalar wrappers `SVGAnimated{String,Number,Integer,Boolean}` (via
  `_defSvgAnimScalar`); the SameObject-backed `SVGAnimated{Rect,Angle,PreserveAspectRatio,
  LengthList,NumberList}` (via `_defSvgAnimObject`). Members spec-shaped + enumerable;
  `SVGAngle`/`SVGPreserveAspectRatio`/`SVGUnitTypes` constants seeded on iface + prototype.
  **svg/idlharness 443→652 (+209).**

## Results

| Test | Before | After | Status |
|------|:------:|:-----:|:------:|
| `css/css-masking/idlharness.html` | 9/41 | **41/41** | ✅ 100% |
| `svg/idlharness.window.html` | 148/1709 | **652/1709** | 🟢 38.2% |

## Zero-regression sweep (all identical)

createElementNS **596/596** (the changed path), qsa 1975, classlist 1420, createElement
147, tagName 6, getElementsByTagName 19, cssom idlharness 493, css-animations 98,
css-transitions 64, css-view-transitions 66, css-fonts 97.

## Caps / Next

- **`svg/idlharness.window.html` (652/1709) is the next frontier** and the widest tail in
  the campaign. The remaining fails are, in order of leverage:
  1. **Per-element attribute reflection** — most element interfaces exist now but expose
     no attributes. Each element's `x`/`y`/`href`/`className`/… `SVGAnimated*` getters +
     `SVGSVGElement`'s many members (`createSVGRect`/`createSVGPoint`/`viewBox`/…) are the
     bulk of the remaining "must inherit property X" fails, and they light up the
     `add_objects` instance tests too. A per-element reflection table is the play.
  2. **`SVGElement` base members** (`className`, `ownerSVGElement`, `viewportElement`,
     `dataset`, `style` [have], the `SVGTests`/`SVGURIReference` mixins).
  3. The value-type **member internals** (SVGMatrix arithmetic, SVGLength unit conversion)
     — currently inert; their existence + member *shape* is green, live math is not.
  4. **CAP — `SVGPathSeg*`**: the whole `createSVGPathSeg*` / `SVGPathSeg*` zoo was
     **removed from SVG 2**; no engine implements it, so those ~40 subtests fail
     everywhere. Genuinely unwinnable — leave them.
- Reusable seeded: `_svgClassForLocal`/`_SVG_IFACE_BY_TAG`/`_MAYBE_SVG_TAGS` (namespace-
  aware wrap), `_defSvgIface` (element-interface factory), `_defSvgList`/`_defSvgAnimScalar`/
  `_defSvgAnimObject` (the type factories), `_newSvg`/`_svgBrand` (the ctor-guard + brand).
  Adding a new SVG element interface is now one table row; a new animated attribute is one
  branded getter.
