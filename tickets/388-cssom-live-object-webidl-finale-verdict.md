# 388 — The CSSOM Live-Object WebIDL Finale (Quests #388–#390)

**Session:** 2026-07-28 · **Branch:** `engine-per-page-threads` · **Commit:** one, all `bootstrap.js`
**Result:** `css/cssom/idlharness.html` **440 → 493 (+53, 99.2%)**, ZERO regressions.

Closed out the `css/cssom/idlharness.html` tail begun in the #382–#387 arc, taking
#387's three next-leverage pointers (a) `CSSStyleRule`/`CSSImportRule` WebIDL polish,
(b) the prototype-getter brand-throw family, (c) `CSSStyleSheet`/`StyleSheet` live-object
WebIDL. Every remaining bucket was a mature template.

## The gap

After #387 the cssom idlharness sat at 440/497 (88.5%). The 57 fails clustered:

| Bucket | Fails | Root cause |
|--------|:-----:|------------|
| `CSSStyleSheet` / `StyleSheet` | ~26 | a live object with no two-level interface split; attrs on the wrong prototype |
| the prototype-getter brand-throw family | ~15 | element/document `style`/`sheet`/`styleSheets` getters didn't throw on the bare prototype |
| `CSSStyleRule` / `CSSImportRule` | ~13 | still `[object CSSRule]` — no toStringTag / non-enum global / brand checks |
| `layerName` / `supportsText` / `xmlss_pi` | 4 | see CAP |

## The work

### #388 — `CSSStyleRule` / `CSSImportRule` WebIDL (440 → 453, +13)
Both serialized as `[object CSSRule]` (they inherit `CSSRule`'s toStringTag and were
plain enumerable globals). Applied the mature rule-WebIDL template to each:
`Symbol.toStringTag`, `_exposeIface` (non-enumerable interface-object global), brand
checks on every attribute getter — **and the writable setters** (idlharness tests
`selectorText`/`style`/`media` setter-on-wrong-object throws TypeError too), `...args`
constructor guarded by `_allowCssCondCtor` so the interface-object `.length` is 0 and
author `new` throws. The internal `new CSSImportRule(desc)` in `_makeRule` was wrapped in
the `_allowCssCondCtor = true` window (CSSStyleRule's build already sat inside it).

### #389 — the prototype-getter brand-throw family (453 → 468, +15)
The WebIDL rule *"getting an attribute on the interface's bare prototype object throws
TypeError"* was unmet across the element/document CSSOM surface. A real element/document
carries a numeric `_nid`; the prototype objects do not — so `typeof this._nid !== 'number'`
is the brand discriminator. Applied to:
- **`style`** (ElementCSSInlineStyle) getter + setter on the Element base — covers
  HTMLElement/SVGElement.
- **`sheet`** (LinkStyle) — refactored into a reusable `_installLinkStyleSheet(ctor)` that
  stamps a brand-throwing getter **named `get sheet`** (via `_named` — a bare `get(){}` in
  a descriptor is named just `"get"`, which idlharness rejects); applied to
  HTMLStyleElement/HTMLLinkElement/SVGStyleElement/ProcessingInstruction.
- **Document** `styleSheets` + `adoptedStyleSheets` (getter/setter, `_named`).
- **ShadowRoot** `styleSheets` + new `adoptedStyleSheets`, made enumerable.

Plus the rest of the quest's misc conformance:
- **`CSSGroupingRule`** — `new.target === CSSGroupingRule` ctor guard (author `new` throws;
  subclasses call super() with a leaf new.target, unaffected); brand-checked `cssRules`;
  `cssRules`/`insertRule`/`deleteRule` re-stamped enumerable; `insertRule(text, index = 0)`
  → interface-object `.length` 1.
- **`getComputedStyle`** — arrow → named `function getComputedStyle(el, _pseudo = null)`
  (`.name` "getComputedStyle", `.length` 1), a 0-arg call throws TypeError, and a wrong-`this`
  call (`this` not the global) throws TypeError (unbound calls where `this` is
  undefined/null/global are allowed).
- **`CSS`** namespace object re-stamped non-enumerable.
- new **`MathMLElement`** / **`SVGStyleElement`** interface-object globals (dependency IDLs,
  presence + member shape only).
- **`style`** copied as an OWN enumerable accessor onto HTMLElement/SVGElement/MathMLElement
  prototypes — the ElementCSSInlineStyle mixin requires the member OWN on each host, not only
  on the shared Element base (idlharness runs `assert_own_property` on each).

### #390 — the `StyleSheet` → `CSSStyleSheet` two-level split (468 → 493, +25)
`StyleSheet` was a bare `class StyleSheet {}` presence stub and `CSSStyleSheet` a standalone
class, so idlharness's *"prototype of CSSStyleSheet.prototype is StyleSheet.prototype"* and
the seven `StyleSheet` attributes failed. Introduced a real abstract base:
- **`class StyleSheet`** — holds `type`/`href`/`ownerNode`/`parentStyleSheet`/`title`/`media`
  (+PutForwards setter)/`disabled` (+setter), all brand-checked + enumerable; not
  author-constructible (`new.target === StyleSheet` throws); `[object StyleSheet]`.
- **`class CSSStyleSheet extends StyleSheet`** — so `CSSStyleSheet.prototype`'s prototype IS
  `StyleSheet.prototype` and `.constructor` resolves correctly. `ownerRule` moved from an own
  data property (which failed `assert_inherits` — "found on object") to a prototype getter
  backed by `_ownerRule` (CSSImportRule now sets `sheet._ownerRule = this`); brand-throwing
  `cssRules`/`rules`; enumerable ops; `...args` ctor (`.length` 0); `[object CSSStyleSheet]`.
- **`replaceSync`** — brand check + arity check BEFORE the constructed-sheet check, so a
  0-arg / wrong-`this` call throws **TypeError** (not our `NotAllowedError`).
- **`replace`** — returns a **rejected promise** for every error path (brand, arity,
  non-constructed): a promise-returning WebIDL operation must never throw synchronously.
- **`addRule`/`removeRule`** — all-optional params → interface-object `.length` 0.

## Zero-regression proof

Swept 16 held realms, all identical: `cssimportrule` 11/11, `CSSStyleRule-set-selectorText`
82/82, `CSSGroupingRule-insertRule` 7/7, `cssstyledeclaration-csstext` 11/11,
`serialize-values` 696/697, `cssom-setProperty-shorthand` 76/76, `serialize-media-rule`
12/12, `css-fonts/idlharness` 97/97, `css-conditional/idlharness` 45/45,
`css-cascade/idlharness` 34/34, `css-counter-styles/idlharness` 37/37,
`container-queries/idlharness` 28/28, `css-nesting/cssom` 12/14, `CSSKeyframesRule` 2/2,
`createElement` 147/147, qsa 1975/1975, classlist 1420/1420. `getComputedStyle-detached-subtree`
0/6 and `getComputedStyle-pseudo` 1/28 unchanged (pre-existing layout/render caps).

## Caps / Next

The remaining **4 fails are all genuine caps**:
- **`layerName` / `supportsText` "with the proper type"** — an idlharness quirk, not our
  bug. `assert_type_is` unwraps the `CSSOMString` typedef (idlharness.js:921) BEFORE the
  nullable early-return (:926), so the nullable flag is lost and a spec-correct `null`
  (`typeof "object"`) fails the `typeof === "string"` check. Proven by contrast:
  `parentStyleSheet` is `CSSStyleSheet?` (nullable, **non-typedef**) and passes with `null`.
  Any conformant engine returning `null` here fails these two — returning `""` would violate
  CSSOM (empty string means an *anonymous* layer) and break `cssimportrule.html`, so we leave
  them spec-correct.
- **`ProcessingInstruction` / `xmlss_pi`** — the test's `xmlss_pi` object is
  `iframe.contentDocument.firstChild` of an XHTML doc beginning with `<?xml-stylesheet?>`.
  Our XHTML parser drops the leading PI, so `firstChild` is the `<html>` element, not a PI.
  Fixing needs XHTML PI parsing + xml-stylesheet linked-sheet resolution — a separate
  subsystem. (`ProcessingInstruction.prototype.sheet` itself is correctly installed +
  brand-throwing; only the malformed add_object fails.)

**NEXT LEVERAGE:** `css/cssom/idlharness.html` is effectively DONE (99.2%, remaining 4 all
capped). Move to a fresh whole-feature `idlharness`/`cssom`/`parsing` dir at 0/N — every
template is now mature: WebIDL non-author-constructible interface (`_exposeIface` /
`_enumAccessors` / `_allowCssCondCtor` guard / `_named`), the two-level interface split
(`StyleSheet`→`CSSStyleSheet` recipe), the prototype-getter brand-throw (`_nid`/`instanceof`
brand + `_named` accessors), the descriptor-object recipe, and the typed at-rule/rule
primitive. Scout via the GitHub contents API and curl-verify every wpt.live path (⅓ 404; a
404 body is 42 bytes → reads as CNR). Reusable seeded this arc: `_installLinkStyleSheet`,
the `_nid`-brand prototype-throw pattern, the `StyleSheet`→`CSSStyleSheet` two-level split,
promise-op-rejects-not-throws, all-optional-params → `.length` 0.
