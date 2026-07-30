# 📜 The CSSOM View Verdict — Quests #409–#411

> *Realm:* `css/cssom-view/` — the CSSOM View Module Level 1
> *Banner drawn:* 2026-07-30 · *Branch:* `engine-per-page-threads`
> *Outcome:* **SECURED — +369 subtests, zero regressions.**

---

## Why this realm

Quest #408's scroll named it: *"another fresh whole-feature idlharness at 0/N —
`css/cssom-view/idlharness.html` (134/417 — WARM, it references
DOMRect/DOMRectList/DOMPoint so it bumped here."* This is that pointer, cashed in.

CSSOM View is the layer every page uses to ask *"where am I, how big is the window,
does this media query match, is this element actually visible?"* — `matchMedia`,
`window.innerWidth`, `screen`, `visualViewport`, `getBoundingClientRect`,
`checkVisibility`, the `scroll*` family. Obscura had **plain-object stubs** for most
of it: a `matchMedia` that returned a bare object literal whose `matches` was
hardcoded `false`, a `screen` object literal, a `visualViewport` object literal, and
`window.innerWidth` as a data property.

For the person on a hand-me-down laptop this is not cosmetic. A responsive site asks
`matchMedia("(max-width: 600px)")` to decide whether to serve the mobile layout. An
engine that always answers "no" hands that person the desktop layout — the heavy
one — on the machine least able to carry it. Getting this right means responsive
pages finally respond.

---

## Starting position (measured, clean `b015fb4`)

| Test | Baseline |
|------|:--------:|
| `css/cssom-view/idlharness.html` | 134/417 |
| the `MediaQueryList` behaviour family (7 files) | 3/46 |
| `css/cssom-view/checkVisibility.html` | 4/15 |
| `css/cssom-view/element-scroll-arguments.html` | 0/12 |
| `css/cssom-view/window-scroll-arguments.html` | 6/12 |
| `css/cssom-view/scrollingElement.html` | 0/8 |

**A note on provenance, so the ledger is honest:** the working tree at session start
already held ~431 uncommitted lines of a CSSOM View WebIDL block, drafted by a prior
session but **never built, measured, regression-swept, or chronicled**. This session
built it, measured it (it lands 417/417), proved it costs nothing, and wrote
quests #410–#411 on top. Quest #409's implementation credit is shared; its
verification is this session's.

---

## Quest #409 — the CSSOM View interface surface

`css/cssom-view/idlharness.html` **134 → 417 (100%)**.

Real WebIDL interfaces replacing the object-literal stubs:

- **`MediaQueryList : EventTarget`** — non-author-constructible, brand-checked
  `media`/`matches`, the legacy `addListener`/`removeListener` aliases, `onchange`.
- **`MediaQueryListEvent : Event`**, **`Screen`**, **`VisualViewport : EventTarget`**
  (7 readonly doubles + `onresize`/`onscroll`/`onscrollend`), **`CaretPosition`**,
  **`CSSPseudoElement`**.
- **The `GeometryUtils` mixin** on `Element`/`Text`/`Document`/`CSSPseudoElement`
  (`getBoxQuads`/`convertQuadFromNode`/`convertRectFromNode`/`convertPointFromNode`).
- **The Element/HTMLElement box-metric surface** re-homed from ad-hoc class members
  onto *enumerable, brand-checked prototype accessors* (`scrollTop`/`scrollLeft`/
  `scrollWidth`/`scrollHeight`/`client*`/`currentCSSZoom`; `offset*` duplicated OWN
  onto `HTMLElement.prototype`, because idlharness reads the descriptor there with
  `assert_own_property` and inheriting from `Element.prototype` is not enough).
- **The Window partial** — `innerWidth`/`innerHeight`/`outerWidth`/`outerHeight`/
  `devicePixelRatio`/`scrollX`/`scrollY`/`pageXOffset`/`screenX`/`screen`/
  `visualViewport` as `[Replaceable]` accessors backed by a `_winView` record (so
  per-page setup can update them without collapsing the accessor into a data
  property), plus `moveTo`/`moveBy`/`resizeTo`/`resizeBy`.
- **`MouseEvent`'s** `pageX`/`pageY`/`x`/`y`/`offsetX`/`offsetY` moved from instance
  own-properties to brand-checked prototype getters (own-props fail idlharness's
  "must inherit … in prototype chain").
- `Document.scrollingElement`/`caretPositionFromPoint`, `Range`'s
  `getClientRects`/`getBoundingClientRect`, `HTMLImageElement.x`/`y`.

**Fallout** (all measured against the clean baseline): `scrollingElement` 0→4,
`DOMRectList` 0→2, `window-screen-{width,height}-immutable` 0→1 each,
`scrolling-no-browsing-context` 0→1. **Subtotal +292.**

---

## Quest #410 — live media-query evaluation

The `MediaQueryList` behaviour family **3 → 46 (100%, all seven files)**.

Every one of those 46 subtests gated on one line in `resources/matchMedia.js`:

```js
assert_true(mql.matches, "MQL should match on newly created <iframe>");
```

Three root causes, all fixed:

1. **There was no media-query evaluator at all.** `matches` was hardcoded `false`
   and `CSSMediaRule.matches` carried a comment admitting the same. Built a real
   Media Queries Level 4 engine next to the existing `_serMediaQuery` serializer:
   `_mqParseQuery` (modifier/type/features, MQ4 range syntax `(200px <= width)` and
   `(a < width < b)`, boolean and plain forms), `_mqParseValue` (lengths incl.
   viewport-relative, `<ratio>`, `<resolution>` with the dpi/dpcm conversions,
   integers), `_mqEvalFeature` over `_MQ_RANGE` (width/height/device-*/aspect-ratio/
   resolution/color/monochrome) and `_MQ_DISCRETE` (orientation/hover/pointer/
   prefers-*/forced-colors/…), `_mqEvalList` (comma = OR, `""` matches all), and
   `_mqSerializeList` (a query that fails to parse serializes as `not all` per MQ4
   error handling — that is what makes `matchMedia("::")` report `"not all"`).
   `CSSMediaRule.matches` now uses the same engine instead of returning `false`.
2. **A frame's viewport was hardcoded 300×150** and `_IframeWindow.matchMedia`
   delegated straight to the *top-level* window, so a query inside a frame was
   evaluated against the wrong box. `_IframeWindow` now carries `_hostEl` and derives
   `innerWidth`/`innerHeight` from the host `<iframe>`'s box via
   `_frameViewportDim` (HTML's "parse a dimension value", defaulting to 300×150),
   and gets its own `matchMedia` that registers on that frame.
3. **`iframe.width`/`height` were not reflected content attributes at all** —
   `iframe.width = "250"` merely created a stray JS own-property, and
   `getAttribute('width')` stayed `null`. Added them to the existing tag-dispatching
   `Element.prototype.width` accessor (`iframe`/`embed`/`object`/`marquee` are the
   DOMString ones) and added the matching `height` accessor, whose non-gated branch
   re-creates an own data property so `canvas.height = 5` keeps behaving exactly as
   before.

Then the reporting machinery: **CSSOM View §evaluate media queries and report
changes** (`_mqReportChanges`), deliberately **two-pass** — every list's `matches` is
updated *before* any listener runs, so a handler inspecting a sibling list sees the
new value (this is exactly what `MediaQueryList-change-event-matches-value.html`
checks). A resize schedules one coalesced report via `requestAnimationFrame`.

**Fallout:** `matchMedia-display-none-iframe` 0→1. **Subtotal +44.**

---

## Quest #411 — the Element-extension behaviour

- **`checkVisibility` 4 → 13/15.** Replaced `return true` with a real computation
  over computed style: no box (`display:none` on self or any ancestor;
  `display:contents` on *itself* — an ancestor with `display:contents` still lets
  descendants generate boxes), an *ancestor* with `content-visibility:hidden` (it
  skips its **contents**, so an element carrying it itself still has a box — hence
  the ancestors-only walk, which is what makes `cvhiddenwithupdate` and the root-
  element case correctly report `true`), plus the `checkOpacity`/`opacityProperty`
  and `checkVisibilityCSS`/`visibilityProperty` option pairs (`visibility` inherits,
  so the element's own computed value suffices; `opacity` does not, so it walks).
- **`ScrollToOptions` WebIDL conversion** — `element-scroll-arguments` 0→12,
  `window-scroll-arguments` 6→12. With a single argument the dictionary overload is
  chosen, so a non-object (`scrollTo(25)`) is a `TypeError` and `behavior` must be a
  valid `ScrollBehavior`; because these operations return a promise, the conversion
  failure must **reject** rather than throw synchronously. `scrollIntoView` keeps
  its own signature (it takes `ScrollIntoViewOptions` *or* a boolean, so it must not
  run the `ScrollToOptions` conversion) and its click-target side effect.
- **Root-caused `content-visibility`.** The last test in `checkVisibility.html` sets
  `documentElement.style.contentVisibility = "hidden"` and then removes it — but the
  removal silently failed, poisoning a later async test. Cause: `content-visibility`
  was not a registered CSS property, so the camelCase assignment never reached
  `setProperty` and became a stray own JS property that `removeProperty` could never
  see. Registered it properly (`_CSSUI_ENUM` `visible|auto|hidden`,
  `_CSSUI_VALIDATED`, `_GCS_DEFAULTS` initial `visible`, not inherited).

**Fallout:** `content-visibility-computed` 0→3 and `content-visibility-valid` 0→3
(both now 100%). **Subtotal +33.**

---

## Results

| Test | Before | After | Status |
|------|:------:|:-----:|:------:|
| `css/cssom-view/idlharness.html` | 134/417 | **417/417** | ✅ 100% |
| `MediaQueryList-extends-EventTarget.html` | 0/7 | **7/7** | ✅ 100% |
| `MediaQueryList-extends-EventTarget-interop.html` | 0/8 | **8/8** | ✅ 100% |
| `MediaQueryListEvent.html` | 0/6 | **6/6** | ✅ 100% |
| `MediaQueryList-addListener-removeListener.html` | 1/8 | **8/8** | ✅ 100% |
| `MediaQueryList-addListener-handleEvent.html` | 0/6 | **6/6** | ✅ 100% |
| `MediaQueryList-change-event-matches-value.html` | 0/1 | **1/1** | ✅ 100% |
| `matchMedia.html` | 2/10 | **10/10** | ✅ 100% |
| `element-scroll-arguments.html` | 0/12 | **12/12** | ✅ 100% |
| `window-scroll-arguments.html` | 6/12 | **12/12** | ✅ 100% |
| `checkVisibility.html` | 4/15 | **13/15** | 🟢 87% |
| `scrollingElement.html` | 0/8 | **4/8** | 🟡 50% |
| `DOMRectList.html` | 0/2 | **2/2** | ✅ 100% |
| `window-screen-width-immutable.html` | 0/1 | **1/1** | ✅ 100% |
| `window-screen-height-immutable.html` | 0/1 | **1/1** | ✅ 100% |
| `scrolling-no-browsing-context.html` | 0/1 | **1/1** | ✅ 100% |
| `matchMedia-display-none-iframe.html` | 0/2 | **1/2** | 🟡 50% |
| `content-visibility/parsing/…-computed.html` | 0/3 | **3/3** | ✅ 100% |
| `content-visibility/parsing/…-valid.html` | 0/3 | **3/3** | ✅ 100% |

**Total: +369.**

## Zero-regression sweep

Held **identical**: qsa 1975, classlist 1420, createElement 147, createElementNS 596,
tagName 6, cssom idlharness 493, geometry idlharness 372, serialize-media-rule 12/12,
svg idlharness 1702, filter-effects 485, css-masking 41, css-animations 98,
css-transitions 64, css-view-transitions 66, css-fonts 97, css-conditional 45,
**event-handler-all-global-events 375/375**, event-handler-attributes-body-window
140/140, **popover-focus 30/30**, Event-initEvent 12/12, CustomEvent 3/3,
url-origin 406, structured-clone 141/152, mark 22/22, **iframe-load-event 2/2**,
srcdoc_process_attributes 3/3, srcdoc-attribute-reset 1/1,
content_document_changes_only_after_load_matures 1/1, cssstyledeclaration-all-shorthand
27/27, cssstyledeclaration-csstext 11/11, contain-{computed,invalid,valid} 15/14/13,
css-overflow inheritance 18/18, outline-valid 20/20.

**Stash-proved pre-existing, NOT regressions** (identical on clean `b015fb4`):
`dom/events/Event-dispatch-click.html` 18/33 TIMEOUT (checkbox/radio activation
behaviour + form submission — an unrelated subsystem), `css/cssom/serialize-values.html`
696/697, `css/css-ui/parsing/cursor-computed.html` 36/39.

**One flake worth naming:** `CaretPosition-001.html` (misnamed — it is an
`elementFromPoint` hit-test) reads 0/2 both before and after, but its second subtest
flips with the harness **window height**, because `_hitTestFromPoint` gates on
`window.innerHeight` and the CDP window size varies between runs (observed 820 and
784). Not a regression either way; it needs real layout.

---

## Caps / Next

**Genuine caps in this realm (named honestly, not failures):**

1. **`element-scroll-promises.html` (0/24) + `window-scroll-promises.html` (0/18) —
   a Web Animations dependency.** Both call `promise_setup(waitForCompositorReady)`,
   which is `document.body.animate({opacity:[0,1]}, {duration:1}).finished`. Obscura
   has no Web Animations implementation (`Element.animate`/`Animation` absent), so
   the setup throws and every subtest in both files fails regardless of our scroll
   behaviour. **42 subtests sitting behind one interface.**
2. **`checkVisibility`'s last 2** need real viewport intersection: whether a
   `content-visibility:auto` subtree is currently "relevant to the user". Obscura's
   box model reports every element at an on-screen grid position, so we answer
   consistently with that — `auto` content is treated as relevant (never skipped).
   The alternative default would happen to score one test higher and be no more
   correct; reporting visible content as skipped is the more harmful error for real
   pages, so the consistent choice was kept.
3. **`scrollingElement`'s last 4** are the quirks-mode branch: they need a blob-URL
   (`URL.createObjectURL(new Blob(…, {type:"text/html"}))`) iframe to load in
   **quirks mode** with a per-frame `compatMode`, plus the quirks body/root
   `overflow` algorithm.
4. **The bulk of `css/cssom-view/` needs a real layout engine** — every
   `scrollIntoView-*`, `offsetTopLeft-*`, `getBoundingClientRect-*`,
   `getClientRects-*`, `scrollWidthHeight-*`, `client-props-*`, `table-*-props`,
   `elementFromPoint-*` positional test. Not winnable without layout; do not burn a
   session on them.

**NEXT LEVERAGE (in order):**

- **(a) A minimal Web Animations `Element.animate()` + `Animation`** — the single
  highest-leverage unlock adjacent to here. It immediately unblocks 42 scroll-promise
  subtests, closes `svg/idlharness`'s last `ShadowAnimation` cap (7), and
  `scroll_support.js` gates a *large* number of `dom/events/scrolling/` tests the
  same way. Root-cause primitive, wide tail.
- **(b) A layout-less scroll-offset model** — `scrollTop`/`scrollLeft` currently
  read 0 and their setters are no-ops. Storing the offset (with `behavior:smooth`
  animating and the promise settling with the spec's scroll-result object) would
  serve real pages too, but it touches a primitive Playwright actionability reads —
  scope it tight and sweep hard.
- **(c) A fresh whole-feature idlharness at 0/N**, the pattern that has paid every
  arc since #379.

**Reusable seeded this arc:** the whole media-query engine (`_mqParseQuery`/
`_mqEvalList`/`_mqSerializeList`/`_mqContextFor` — any future `@media`,
container-query or `matchMedia` work builds on it); `_mqReportChanges`'s two-pass
update-then-dispatch shape (correct for any "report changes to a live list" spec
step); `_frameViewportDim` (per-frame viewport); `_ehDefineOnObjProto` (event-handler
accessors on a **non-node** EventTarget, brand-checked by `instanceof`);
`_toScrollToOptions` (WebIDL dictionary conversion that rejects a promise rather
than throwing); and the reminder that an **unregistered CSS property silently
becomes a stray own JS property** that `removeProperty` can never remove.
