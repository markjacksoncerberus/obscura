# ⚔️ The Geometry Interfaces WebIDL Verdict — Quests #406–#408

> *A fresh whole-feature idlharness at 0/N, taken end-to-end. The whole Geometry
> Interfaces Module Level 1 — `DOMPoint`/`DOMRect`/`DOMQuad`/`DOMMatrix`, their
> `*ReadOnly` bases, and `DOMRectList` — rebuilt from naive placeholder classes
> into proper WebIDL with real column-major 4×4 math.*

**Realm:** `css/geometry/idlharness.any.html` — **32 → 372 (100%), +340**
**Fallout:** `svg/idlharness.window.html` **1700 → 1702**; behavior tests
`DOMPoint-001` 8→16, `DOMRect-001` 7→30, `DOMMatrix-001` 4→118, `DOMQuad-001` 0→26
**Files:** `crates/obscura-js/js/bootstrap.js` only. ONE commit. **ZERO regressions.**

---

## The gap

Obscura shipped naive placeholder `DOMRect`/`DOMPoint`/`DOMMatrix` classes (a tiny
`if (typeof X === 'undefined')` block): own-property fields instead of prototype
accessors, no `*ReadOnly` base, enumerable interface objects, no static factories,
no real math, and no `SVGPoint`/`SVGRect`/`SVGMatrix` legacy alias. Against the
Geometry idlharness (which loads *only* the `geometry` IDL — a clean whole-feature
target with no cross-dependencies) that scored **32/372**.

The chosen pivot was doubly good: it was the memory's named next-leverage (SVG
idlharness family done → a fresh idlharness at 0/N), and it closes SVG's own
remaining Geometry caps (`viewBox.animVal` needs `DOMRectReadOnly`,
`currentTranslate` needs `DOMPointReadOnly`).

## The work

**#406 — `DOMPointReadOnly` / `DOMPoint`.** The readonly-base + mutable-subclass
**two-level split** matching the `[Exposed]` split: the base carries get-only,
brand-checked (`instanceof`), enumerable prototype accessors; the subclass adds
get+set (the IDL `inherit attribute`). `[Default] object toJSON()` returns exactly
`{x, y, z, w}`. Static `[NewObject] fromPoint` is own on *each* interface object
(idlharness checks statics are own props). `matrixTransform` runs the real matrix
math. `LegacyWindowAlias=SVGPoint` → `_exposeIface('SVGPoint', DOMPoint)`.

**#407 — `DOMRectReadOnly` / `DOMRect` + `DOMQuad` + `DOMRectList`.** `DOMRect` with
computed `top`/`right`/`bottom`/`left` (min/max, so negative width/height behave).
`DOMQuad` (`p1`–`p4` `[SameObject]`, `getBounds`, `fromRect`/`fromQuad`).
`DOMRectList` — non-author-constructible, `length` + `item(index)` (arity throw),
indexed props + `@@iterator` — minted by a `globalThis._newDomRectList` factory, and
`Element.getClientRects()` now returns one (spec-correct; the naive path returned a
plain Array). `SVGRect` alias.

**#408 — `DOMMatrixReadOnly` / `DOMMatrix`.** Real **column-major 4×4 math**:
`_matMul` (post-multiply), `_matXform` (point transform), `_matInv` (general cofactor
inverse), `_rotAxis` (axis-angle → column-major). All 22 `a`..`m44` aliases readonly
on the base / writable on the subclass (a genuinely-3D element setter flips `is2D`
false); `is2D`/`isIdentity` computed; the immutable transform family
(`translate`/`scale`/`scale3d`/`rotate`/`rotateAxisAngle`/`rotateFromVector`/`skewX`/
`skewY`/`multiply`/`flipX`/`flipY`/`inverse`/`transformPoint`/`toFloat32Array`/
`toFloat64Array`) + the mutable `*Self` family; `fromMatrix`/`fromFloat32Array`/
`fromFloat64Array`; the `stringifier` (`matrix(...)` for 2D, `matrix3d(...)` for 3D).
`SVGMatrix`/`WebKitCSSMatrix` aliases.

## Gotchas worth remembering

- **Constructor `.length` 0 via a default param.** The matrix constructor takes one
  *optional* arg, so it must report `.length` 0. A bare `constructor(init)` has JS
  `.length` 1 (no default) → fails idlharness "interface object length". Fix:
  `constructor(init = undefined)`. (The point/rect/quad ctors were already fine —
  every param has a default.)
- **Enumerate operations AND statics.** The first build was 342/372; the 30 fails
  were all *"property should be enumerable"*. ES class methods — instance and static
  alike — are non-enumerable, but WebIDL operations/statics must be enumerable own
  props. `_enumAccessors` (which re-stamps a descriptor `enumerable:true`) works for
  methods too. Plus a `DOMRectList.item()` arity throw. → 372/372.
- **A 16-element matrix init is always `is2D=false`** — per spec, unconditionally
  (not computed from the values). Same for `matrix3d()` and the 16-element typed
  arrays. (Fixed after the behavior test flagged it: DOMMatrix-001 108→118.)
- **`SVGPoint`/`SVGRect`/`SVGMatrix` are NOT standalone interfaces in SVG 2** — they
  are `LegacyWindowAlias`es of the Geometry types. The old internal classes were
  removed from the global exposure loop (kept only as inert backing for
  `SVGAnimatedRect`'s dummy base) and the globals aliased to `DOMPoint`/`DOMRect`/
  `DOMMatrix`. `createSVGPoint()`/`createSVGMatrix()`/`createSVGRect()` already
  returned the DOM types, so this was net-neutral for SVG (+2 from the newly-existent
  read-only variants).

## Zero-regression proof

Stash-proved the geometry baseline (32) and swept the held realms — all identical:
`createElementNS` **596/596** (the changed SVG value-type path), `createElement` 147,
`classlist` 1420, `qsa` 1975, `css-masking/idlharness` 41, `filter-effects/idlharness`
485, `cssom/idlharness` 493. `svg/idlharness` **1702** (+2, not a regression).

## Caps (honest)

- `css/geometry/idlharness.any.worker.html` — Web Workers unimplemented (CNR,
  orthogonal to this arc).
- DOMMatrix **CSS-transform-string parsing** — `new DOMMatrix("scale(2)
  translateX(5px)")`, case-insensitive `NONE`, `/**/` comments: a full CSS transform
  function grammar we don't build (~20 `DOMMatrix-001` behavior subtests). The
  idlharness target is unaffected (100%); this is behavior-test tail.

## Next leverage

Another fresh whole-feature idlharness at 0/N. **`css/cssom-view/idlharness.html`**
(134/417) is warm — it references `DOMRect`/`DOMRectList`/`DOMPoint`, so it already
bumped here; its tail is the cssom-view `Element`/`Window`/`Document` members
(`getBoundingClientRect`/`getClientRects` typed, `scroll*`, `VisualViewport`,
`MediaQueryList`).

Reusable seeded: the **readonly-base/mutable-subclass two-level split** template, the
real 4×4 matrix helpers (`_matMul`/`_matInv`/`_matXform`/`_rotAxis`), `_newDomRectList`,
the constructor-`.length`-0-via-`= undefined` trick, and the enumerate-operations-
AND-statics reminder.
