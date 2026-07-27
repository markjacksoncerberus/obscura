# 🪶 Scroll #379–#381 — The CSS-Fonts CSSOM/WebIDL Verdict

> *A fresh whole-feature `idlharness` at 14/97 — the widest untouched WebIDL tail on
> the board. Three pure-interface primitives, no layout: the `@font-face` descriptor
> object, the `@font-feature-values` rule + its maplike, and the WebIDL polish of the
> already-parsed `@font-palette-values` rule.*

**Realm:** `css/css-fonts/idlharness.html` — **14 → 97 (100%)**, **+83**, zero regressions.
**Banner drawn from:** #378's next-leverage — *"a fresh whole-feature `idlharness`/`cssom`/`parsing`
dir at 0/N; all three templates mature (WebIDL non-author-constructible iface; typed at-rule
primitive; property/descriptor grammar)."*

---

## The gap

`css/css-fonts/idlharness.html` pulls the `css-fonts-5`, `css-fonts`, and `cssom` IDL and
`add_objects`es exactly two live objects — a plain `CSSStyleRule` (`cssRule`) and the page's
`@font-face` rule (`cssFontFaceRule`). Everything else is a pure interface-object /
prototype-shape check, so **no layout or real font loading is needed** — only the WebIDL
surface must exist and be shaped right. Baseline 14/97 broke down as:

| Interface | Fails | Why |
|-----------|:----:|-----|
| `CSSFontFaceDescriptors` | 47 | interface wholly absent (the `@font-face` `.style` type in css-fonts-5) |
| `CSSFontFeatureValuesRule` | 13 | absent |
| `CSSFontFeatureValuesMap` | 8 | absent (a maplike) |
| `CSSFontFaceRule` | ~6 | enumerable global, ctor `.length` 1, `[object Object]`, no brand-checked `.style` |
| `CSSFontPaletteValuesRule` | ~4 | existed (Quests #297–#299) but pre-WebIDL: enumerable, `.length` 1, getters didn't brand-check |
| `CSSRule.FONT_FEATURE_VALUES_RULE` | 3 | constant 14 missing |
| `CSSStyleDeclaration` (parent) | (blocked descr.) | **never exposed as a global at all** |

---

## The work — all `bootstrap.js`, one commit, reusing the mature WebIDL template

### #379 — `CSSFontFaceDescriptors` + `CSSFontFaceRule` WebIDL (~53)
- New `class CSSFontFaceDescriptors extends CSSStyleDeclaration` — the specialized
  declaration returned by `CSSFontFaceRule.style` (css-fonts-5). A generated loop stamps one
  **enumerable, brand-checked** accessor pair per descriptor, in BOTH the camelCase
  (`fontFamily`) and literal dashed (`font-family`) IDL forms — 21 descriptors → ~41 attrs —
  each forwarding to the underlying declaration's `getPropertyValue`/`setProperty` on the
  canonical kebab property, `[LegacyNullToEmptyString]` (null → `""`).
- Fixed `CSSFontFaceRule` to the non-author-constructible template: `_exposeIface`
  (non-enumerable global), guarded `...args` ctor (`.length` 0, author `new` throws),
  `Symbol.toStringTag` → `[object CSSFontFaceRule]`, brand-checked `.style` getter
  (throws on the bare prototype) that now returns a `CSSFontFaceDescriptors` instance.
- **Subtlety:** idlharness asserts a getter/setter's `.name` is the spec form
  (`"get fontFamily"`), but a `defineProperty({ get(){} })` names the function just `"get"`.
  A `_named(kind, attr, fn)` helper stamps `fn.name` for every generated accessor.

### #380 — `CSSFontFeatureValuesRule` + `CSSFontFeatureValuesMap` + the CSSRule constant (~22)
- `CSSRule.FONT_FEATURE_VALUES_RULE = 14` added to `_CSSRULE_CONSTS` (13/DOCUMENT_RULE stays
  deliberately unassigned) — exposed on the interface object, the prototype, and every instance.
- New `class CSSFontFeatureValuesMap` — a maplike backed by a real `Map`, exposing
  `size`/`entries`/`keys`/`values`/`forEach`/`get`/`has` + `set`/`delete`/`clear` + the custom
  `set(name, values)` operation. **Subtlety:** WebIDL maplike members must be **enumerable**
  own prototype properties (ES class members are non-enumerable) → `_enumAccessors` re-stamps
  them; `@@iterator` is aliased to the same function object as `entries`; and `forEach` uses a
  rest param so its `.length` is 1 (a `forEach(cb, thisArg)` would report 2).
- New `class CSSFontFeatureValuesRule extends CSSRule` — writable `fontFamily` + seven readonly
  `CSSFontFeatureValuesMap` sub-blocks (annotation/ornaments/stylistic/swash/characterVariant/
  styleset/historicalForms), lazily built. `@font-feature-values` is not parsed into a rule yet
  (no instance in `add_objects`), so this models the interface only.

### #381 — `CSSFontPaletteValuesRule` WebIDL polish + `CSSStyleDeclaration` exposure (~8)
- Retrofitted the existing (Quests #297–#299) `CSSFontPaletteValuesRule` to the template:
  `_exposeIface`, guarded `...args` ctor, `Symbol.toStringTag`, brand-checked `.name`/`.fontFamily`/
  `.basePalette`/`.overrideColors` getters, `_enumAccessors`; `_makeRule` flips the guard.
- `_exposeIface('CSSStyleDeclaration', CSSStyleDeclaration)` — it was never a global, which
  blocked every `CSSFontFaceDescriptors` inherited-interface check. (Stays internally
  constructible; author-`new`-throws is a separate cssom-idlharness cap.)

`_makeRule`'s `font-face` and `font-palette-values` branches now flip `_allowCssCondCtor` around
construction, like the `@layer` branches.

---

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-fonts/idlharness.html` | 14/97 | **97/97** ✅ |

**Zero regressions** — swept: `css/cssom/CSSFontFaceRule` 1, `CSSCounterStyleRule` 1,
`CSSKeyframesRule` 2, `CSSGroupingRule-insertRule` 7, `css/css-fonts/parsing/font-face-src-list`
17, `font-face-src-format` 35, `font-palette-values-valid` 36, `font-palette-values-invalid` 27,
`css-conditional/idlharness` 45, `css-cascade/idlharness` 34, `container-queries/idlharness` 28,
`css-counter-styles/idlharness` 23/37 (unchanged — untouched), qsa 1975, classlist 1420,
createElement 147.

## Caps / Next

- **CAP:** `css-counter-styles/idlharness.html` stays **23/37** — its 14 fails are the SAME
  pattern (`CSSCounterStyleRule` is enumerable, ctor `.length` 1, getters don't brand-check).
  `CSSCounterStyleRule` already exists with full descriptor grammars (a prior quest); it just
  needs the identical WebIDL retrofit (`_exposeIface` + guarded `...args` ctor + brand checks +
  `_enumAccessors` + `Symbol.toStringTag`). **This is the cheapest next win on the board.**
- **CAP:** `css/css-counter-styles/cssom/*` and `counter-style-at-rule/descriptor-*` are
  **reftests** (`<link rel="match">`) — they render list markers and need real layout. Wall.
- **CAP (bigger tails, need real objects):** `css/css-animations/idlharness` 59/98 and
  `css/css-transitions/idlharness` 30/64 want `CSSAnimation`/`CSSTransition`/`AnimationEvent`/
  `TransitionEvent` + the Web Animations `Animation` machinery — a much larger lift than pure
  CSSOM interface objects.
- **NEXT LEVERAGE:** (a) `CSSCounterStyleRule` WebIDL retrofit → `css-counter-styles/idlharness`
  23→~37 (identical template, one small edit); (b) `CSSStyleDeclaration` full WebIDL / the
  `css/cssom/idlharness.html` file if it's a winnable pure-interface vein (now that
  `CSSStyleDeclaration` is a global); (c) another fresh whole-feature `idlharness` at 0/N —
  curl-verify every wpt.live path (⅓ 404, a 42-byte body reads as CNR).

**Reusable seeded here:** `_named(kind, attr, fn)` (stamp a generated accessor's WebIDL
function name); the maplike recipe (`_enumAccessors` over the surface + `@@iterator`-aliases-
`entries` + rest-param `forEach` for `.length` 1); the descriptor-object recipe
(`extends CSSStyleDeclaration` + generated brand-checked camel/dashed accessor pairs forwarding
to set/getPropertyValue).
