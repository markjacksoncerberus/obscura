# 400–402 · The SVG Per-Element Attribute Reflection Verdict ⚔️🏳️‍⚧️

> *"Fix root-cause primitives, not leaves."* — #399 seeded the whole SVG-primitive
> factory kit and left one table row per element as the play. This arc cashed that in:
> the animated-attribute getters, the element operations, and the value type SVGTransform
> — carrying `svg/idlharness.window.html` from a third green to nearly whole.

**Realm:** `svg/idlharness.window.html` (**652→1692, 99.0%, +1040**) — 3 quests, ONE
commit, ZERO regressions. Session 2026-07-29.

## The gap

After #399 every SVG element *interface* existed (the SVG 2 hierarchy) and every
`SVGAnimated*`/value type was type-checkable — but the element interfaces exposed **no
members**. Every `objects.rect.x`, `objects.svg.createSVGTransform()`,
`objects.text.getSubStringLength(...)` read `undefined`, so 627 `add_objects` "must
inherit property X" subtests + the per-interface attribute/operation checks all failed.
The value type `SVGTransform` (and the `createSVGTransform` factory) didn't exist at all.

## The work (all `bootstrap.js`, one commit)

### #400 — the reflection kit + SVGTransform + the base/SVGSVGElement members
- **`SVGTransform`** value type (identity `SVG_TRANSFORM_MATRIX`, `type`/`matrix`
  [a `DOMMatrix`]/`angle`, the six `set*` mutators with arity throws, the
  `SVG_TRANSFORM_*` constants) + `SVGTransformList.consolidate()` /
  `createSVGTransformFromMatrix()`.
- **The reflection helpers** — `_svgReflect(proto, {attr: WrapperClass})` stamps a
  `_nid`-branded `[SameObject]` getter that lazily mints & caches the wrapper on the
  element; `_svgReflectStr` (reflected DOMString content attrs); `_svgNullAttr` (inert
  nullable interface refs); `_svgDefOp` / **`_svgDefElemOp`** (operations with an exact
  name + WebIDL arity; the element variant brands `this` — idlharness invokes every op
  with `this=null` — **and** throws on too-few-args).
- **`SVGGraphicsElement`** (`transform` + the `SVGTests` mixin `requiredExtensions`/
  `systemLanguage` + `getBBox`/`getCTM`/`getScreenCTM`), **`SVGGeometryElement`**
  (`pathLength` + `isPointInFill`/`isPointInStroke`/`getTotalLength`/`getPointAtLength`),
  and all of **`SVGSVGElement`** — `x`/`y`/`width`/`height`, the `SVGFitToViewBox`
  `viewBox`/`preserveAspectRatio`, `currentScale`/`currentTranslate`, and the full
  operation set (`createSVG{Number,Length,Angle,Point,Matrix,Rect,Transform,
  TransformFromMatrix}`, `getElementById`, the intersection/enclosure/redraw/animation
  methods).

### #401 — the concrete-element attribute tables + type polish
- **Per-element `_svgReflect` tables** for every geometry element (rect/circle/ellipse/
  line), the `SVGAnimatedPoints` mixin (polyline/polygon), image/foreignObject/use,
  marker (+ its constants + `setOrientTo*`), the gradients (+ `SVG_SPREADMETHOD_*` +
  linear/radial coords + stop `offset`), pattern/symbol/view (`SVGFitToViewBox`), textPath
  (+ constants), and the `SVGTextContentElement`/`SVGTextPositioningElement` text families
  (+ the `LENGTHADJUST_*` constants + the nine text-query ops).
- **`SVGElement` base** — `className` (SVGAnimatedString), `ownerSVGElement`/
  `viewportElement` (nearest-ancestor-`<svg>` walk).
- **`Symbol.toStringTag`** on every value/list/animated type (they were stringifying to
  `[object Object]` — the idlharness class-string check) + **arity throws** on the
  `_defSvgList`/`SVGTransformList` mutation ops (`initialize`/`getItem`/… must TypeError on
  too-few-args).

### #402 — the animation family, the legacy/edge interfaces, and the polish fixes
- **`SVGAnimationElement`** — `targetElement`, the `SVGTests` mixin, the
  `onbegin`/`onend`/`onrepeat` event-handler IDL accessors (via a single-name installer
  reusing the shared `_eh*` machinery), and the seven timing/begin/end operations.
- **`SVGAElement`** — `target`/`href` (SVGAnimatedString), the reflected string attrs, the
  `[PutForwards=value]` `relList` (DOMTokenList over `rel`), and the
  **HTMLHyperlinkElementUtils** URL-component accessors (over the element's `href` resolved
  against the document base).
- **`TimeEvent`** (a legacy Event subclass, non-author-constructible — guarded ctor flipped
  by `createEvent`), **`SVGUseElementShadowRoot`** (ShadowRoot subclass), **`Document.rootElement`**.
- **Polish:** `SVGElement`/`SVGStyleElement` made non-author-constructible (guarded `...args`
  ctors → `new X()` throws, interface-object `.length` 0) + non-enumerable globals +
  toStringTag; fixed a getter-name collision (`_named` renames in place — `ownerSVGElement`/
  `viewportElement` now each get their own function); `SVGAnimatedRect.baseVal` → a real
  `DOMRect`.

## Results

| Test | Before | After | Status |
|------|:------:|:-----:|:------:|
| `svg/idlharness.window.html` | 652/1709 | **1692/1709** | 🟢 99.0% |

## Zero-regression sweep (all identical)

createElementNS **596/596** (the SVG wrap path + the new guarded base ctors), css-masking
41, classlist 1420, qsa 1975, createElement 147, tagName 6, getElementsByTagName 18/18,
cssom idlharness 493, css-animations 98, css-transitions 64, css-view-transitions 66,
css-fonts 97, Event-initEvent 12/12 + CustomEvent 3/3 (the `createEvent` change is a no-op
for every non-TimeEvent type — the `new Cls('')` path is byte-identical).

## Caps / Next

The final **17 fails are all genuine dependency caps or a separate spec**, in three groups:
- **Filter Effects `fe*` attributes** (~9 — `objects.feConvolveMatrix.preserveAlpha`/`orderX`
  etc.): the `SVGFEConvolveMatrixElement` (and the whole `fe*` family) attribute set lives
  in **`interfaces/filter-effects.idl`** — a separate spec. This is the clean **NEXT
  LEVERAGE**: one `_svgReflect` table per `fe*` element on top of the kit already seeded
  here (same pattern, new IDL). Highest remaining ROI in this realm.
- **Geometry read-only types** (2): `viewBox.animVal` (`DOMRectReadOnly`) and
  `currentTranslate` (`DOMPointReadOnly`) — Obscura's Geometry-Interfaces subset doesn't
  expose the read-only variants yet (`instanceof` RHS is `undefined`). A Geometry-Interfaces
  dependency, not an SVG bug.
- **`ShadowAnimation`** (7): extends the Web Animations `Animation` interface, which Obscura
  doesn't implement — the whole interface is absent. A Web-Animations dependency.

Reusable seeded: `_svgReflect` / `_svgReflectStr` / `_svgNullAttr` (attribute tables),
`_svgDefOp` / `_svgDefElemOp` (ops with arity + `this`-brand), `_svgReflectCrossOrigin` /
`_svgInstallHyperlinkUtils` (the reflected-string + hyperlink-utils recipes), `_svgSeedConsts`.
Adding an `fe*` element's attributes is now one table.
