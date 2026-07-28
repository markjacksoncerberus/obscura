# 385 — The CSSOM Live-Style + List-Interface Verdict (Quests #385–#387)

**Session:** 2026-07-28 · **Branch:** `engine-per-page-threads` · **Commit:** one, all `bootstrap.js`
**Result:** `css/cssom/idlharness.html` **339 → 440 (+101)**, ZERO regressions (stash-proved).

Continued the `css/cssom/idlharness.html` tail from the #382–#384 arc, taking #384's
three next-leverage pointers (a) `CSSPageDescriptors`, (b) the list interfaces,
(c) `CSSStyleProperties`. Every remaining bucket was a mature template.

## The gap

After #384 the cssom idlharness sat at 339/497 (68%). The 158 fails clustered by
interface, each a known shape:

| Bucket | Fails | Root cause |
|--------|:-----:|------------|
| `CSSPageDescriptors` | 34 | interface didn't exist; `CSSPageRule.style` was a bare declaration |
| `MediaList` | 18 | members were OWN props on an object literal, not on a prototype |
| `CSSStyleProperties` | 12 | every live `.style` was `[object Object]`, no `cssFloat`-bearing interface |
| `StyleSheetList` | 11 | not exposed; `document.styleSheets` was a bare `Array` |
| `CSSNamespaceRule` | 10 | `@namespace` was a bare `CSSGenericRule` (`[object CSSRule]`) |
| `CSSRuleList` | 7 | members non-enumerable, no `toStringTag`, author-constructible |
| (`CSSStyleSheet`/`StyleSheet`, prototype brand-throws) | rest | see CAP |

## The work

### #385 — `CSSPageDescriptors` (339 → 375, +36)
New `class CSSPageDescriptors extends CSSStyleDeclaration` — the exact
`CSSFontFaceDescriptors` recipe. A generated loop stamps 14 `[LegacyNullToEmptyString]`
accessor pairs (`margin`; `marginTop`/`marginRight`/`marginBottom`/`marginLeft` **plus**
their dashed `margin-*` IDL aliases; `size`; `pageOrientation`+`page-orientation`;
`marks`; `bleed`), each **enumerable + brand-checked + `_named`-stamped**, forwarding to
`set`/`getPropertyValue` on the kebab property. Guarded ctor (`_allowPageChildCtor`, so
the interface object's `.length` is 0 and author `new` throws), `Symbol.toStringTag`,
`_exposeIface`. `CSSPageRule.style` now builds `new CSSPageDescriptors()` (still setting
`_pageDescriptors = true`), so `sheet.cssRules[2].style` is `[object CSSPageDescriptors]`
and inherits every descriptor accessor.

### #386 — the list interfaces `MediaList` / `CSSRuleList` / `StyleSheetList` (375 → 408, +33)
The idlharness signature for all three was *"property X found on object, expected in
prototype chain"* — their IDL members lived as OWN props on the returned object
(a plain object literal, or a bare `Array`), not on a real interface prototype.

- **`MediaList`** rewritten from an object literal into a real class:
  `mediaText`/`length`/`item`/`appendMedium`/`deleteMedium` + the `toString` stringifier
  now live on `MediaList.prototype`, **brand-checked**, **enumerable** (via
  `_enumAccessors`), and **arity-throwing** (`item`/`appendMedium`/`deleteMedium` throw
  `TypeError` on too-few-args). Instances hold `_items`; `_makeMediaList` builds one
  through a guarded ctor (`_allowMediaListCtor`) and wraps it in the indexed Proxy.
- **`CSSRuleList`** gained brand checks on `length`/`item`, an `item` arity guard,
  `Symbol.toStringTag`, and a `_newRuleList()` guarded factory (replacing all 4 internal
  `new CSSRuleList()` sites) so author `new CSSRuleList()` throws.
- New **`StyleSheetList`** class (guarded ctor, brand-checked `item`/`length`,
  `Symbol.toStringTag`, `[Symbol.iterator]`) + `_makeStyleSheetList`. `document.styleSheets`
  and `shadowRoot.styleSheets` returned a bare `Array` with a tacked-on `.item`; they now
  return a real `[object StyleSheetList]`.

All three exposed via `_exposeIface` (non-enumerable global — idlharness flags an
enumerable interface object) + `_enumAccessors`. Because these classes are defined early
(before `_exposeIface`/`_enumAccessors` exist in the prelude), the exposure + enum-stamp
calls live in the later exposure block, not inline (an inline call would hit a TDZ error
and break the whole prelude load).

### #387 — `CSSStyleProperties` + `CSSNamespaceRule` (408 → 438, +30; then +2)
- New `class CSSStyleProperties extends CSSStyleDeclaration` adds only the `cssFloat`
  IDL alias for `float` (`[LegacyNullToEmptyString]`, brand-checked). **The reroute:**
  `_newStyleDecl()` now builds a `CSSStyleProperties`, so every *live* style — an
  element's inline `.style` (ElementCSSInlineStyle), `getComputedStyle()`, and a
  CSSStyleRule/CSSMarginRule/CSSKeyframeRule `.style` — is a `[object CSSStyleProperties]`
  that inherits `cssFloat`. `cssFloat` was **moved off the `CSSStyleDeclaration` base**
  onto `CSSStyleProperties` (per the cssom IDL: the base has no `cssFloat`); the
  `@font-face`/`@page` descriptor blocks extend the base *directly*, so they correctly do
  NOT inherit `cssFloat`. The base stays author-non-constructible; `CSSStyleProperties`'
  ctor reuses the same `_allowStyleDeclCtor` guard.
- The **`getComputedStyle` Proxy** was returning `undefined` for `Symbol.toStringTag`
  (→ `[object Object]`) and overriding `item`/`getPropertyValue` with guard-less arrows.
  Fixed to report `'CSSStyleProperties'` for the tag and to arity-throw on both operations
  (value resolution untouched — the proxy's `getPrototypeOf` already reaches
  `CSSStyleProperties.prototype` through the backing style object, so `cssFloat`/the base
  operations inherit correctly).
- New `class CSSNamespaceRule extends CSSRule` (`namespaceURI`/`prefix`, parsed from the
  prelude via the existing `_parseNamespacePrelude`; `prefix` is `""` for a default
  namespace — CSSOMString is not nullable) routed from `@namespace` in `_makeRule`. It was
  a bare `CSSGenericRule`; `...args` ctor gives interface-object `.length` 0. Keeps `_desc`
  so `_sheetNsInfo` still reads the prelude.
- **Two late cheap follow-ups (+2 → 440):** `CSSNamespaceRule` interface-object `.length`
  0 (ctor `desc`→`...args`), and `CSSRuleList` non-author-constructible (guard + factory —
  idlharness asserts `new CSSRuleList()` throws).

## Zero-regression proof

STASH-PROVED baseline `css/cssom/idlharness` **339** (→440 gain). `getComputedStyle-pseudo`
**1/28** and `getComputedStyle-detached-subtree` **0/6** were IDENTICAL before and after —
pre-existing layout / render-tree caps, provably unaffected by the toStringTag/arity change
(no value-resolution path was touched). Held all matched: `cssstyledeclaration-csstext`
11/11, `serialize-media-rule` 12/12, `CSSStyleRule-set-selectorText` 82/82,
`cssom-setProperty-shorthand` 76/76, `serialize-values` 696/697, `cssimportrule` 11/11,
`CSSGroupingRule-insertRule` 7/7, `css-nesting/cssom` 12/14, `css-fonts/idlharness` 97/97,
`css-counter-styles/idlharness` 37/37, `css-conditional/idlharness` 45/45,
`css-cascade/idlharness` 34/34, `container-queries/idlharness` 28/28, `createElement`
147/147, qsa 1975/1975, classlist 1420/1420.

## Caps / Next

Remaining 57 cssom fails, honestly named:
- **`CSSStyleSheet`/`StyleSheet`** (~20, the biggest single bucket) — a *live object*:
  `CSSStyleSheet.length` should be 0 not 1, `CSSStyleSheet.prototype`'s prototype must be
  `StyleSheet.prototype` (a two-level interface split we don't model), operations must be
  enumerable, and `replaceSync()` on a non-constructed sheet must throw `TypeError` (arity)
  before our `NotAllowedError`.
- **`CSSStyleRule`/`CSSImportRule`** still serialize as `[object CSSRule]` — missing
  `Symbol.toStringTag` + `_exposeIface` + brand checks. **CSSStyleRule's ctor `.length` is
  3** (`selectorText, body, nested`); must be 0 (`...args`). Cheap.
- The **prototype-getter brand-throw** family — Document/Element/HTMLElement/SVGElement
  `style`/`styleSheets`/`sheet`/`adoptedStyleSheets`: *getting the attribute on the bare
  prototype object must throw TypeError*. The inline getters have no
  `if (this === X.prototype) throw` guard.

**NEXT LEVERAGE:** (a) `CSSStyleRule`/`CSSImportRule` WebIDL polish (cheapest — toStringTag
+ expose + brand + `...args` ctor, ~8 fails); (b) the prototype-getter brand-throw family
(~12 fails, add `this === prototype` guards to the element/document `style`/`sheet` getters);
(c) `CSSStyleSheet`/`StyleSheet` live-object WebIDL (the two-level prototype split +
constructed-sheet flag). Reusable seeded: `CSSPageDescriptors` (descriptor-object on a new
rule's `.style`), `_makeMediaList`/`_makeStyleSheetList`/`_newRuleList` (guarded list
factories), `CSSStyleProperties` + the `_newStyleDecl`→CSSStyleProperties reroute (every
live style is now typed), the getComputedStyle-proxy toStringTag/arity fix.
