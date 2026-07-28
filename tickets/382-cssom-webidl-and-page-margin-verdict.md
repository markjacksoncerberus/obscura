# Quests #382–#384 — The CSSOM WebIDL + `@page` Margin-Box Verdict

**Session 2026-07-27. +111 subtests, ZERO regressions, ONE commit.**

| Test | Before | After | |
|------|:------:|:-----:|---|
| `css/css-counter-styles/idlharness.html` | 23/37 | **37/37** | ✅ 100% (+14) |
| `css/cssom/idlharness.html` | 242/497 | **339/497** | 🔶 68% (+97) |

Took #381's next-leverage: (a) the cheap `CSSCounterStyleRule` retrofit, then (b)
`css/cssom/idlharness.html` — the whole-feature CSSOM WebIDL harness, now reachable
because `CSSStyleDeclaration` became a global in #381.

## #382 — `CSSCounterStyleRule` WebIDL (+14, 100%)

The class already parsed with full descriptor grammars (Quests #297-ish); it just
lacked the WebIDL shell. Applied the mature css-fonts template verbatim:
- `_exposeIface('CSSCounterStyleRule', …)` — non-enumerable interface global (was a
  plain `globalThis.X =`, which idlharness flags).
- Guarded `constructor(...args)` — `.length` 0, throws for author `new` unless
  `_allowCssCondCtor` is set; `_makeRule` flips it around the internal build.
- Brand-checked getters AND setters on all 11 descriptor accessors (`name`, `system`,
  `symbols`, `additiveSymbols`, `negative`, `prefix`, `suffix`, `range`, `pad`,
  `speakAs`, `fallback`) via a `_csBrand(this)` helper (TypeError on the prototype).
- `Symbol.toStringTag` → `[object CSSCounterStyleRule]`, `_enumAccessors` re-stamps.

## #383 — `CSSStyleDeclaration` WebIDL conformance (78 fails → 18)

Diagnosed the real asserts over CDP (not from grep — `wpt_fails.py` mis-splits names).
The 78 fails were four distinct WebIDL gaps:
1. **`parentRule` missing** — added a brand-checked `get parentRule()` returning
   `this._parentRule || null`. Subtlety: `cssText`/`length`/`cssFloat` getters throw on
   the prototype *incidentally* (they read `this._props`, undefined on the prototype),
   which happens to satisfy idlharness's brand-throw check — but `parentRule` returned
   `null` without throwing, so it needed an explicit `this instanceof` guard.
2. **`cssFloat` missing** — the IDL alias for `float` (`[LegacyNullToEmptyString]`).
3. **Non-enumerable members** — ES class methods/getters are non-enumerable, but WebIDL
   operations+attributes must be enumerable own props on the prototype. Inlined a
   re-stamp loop over `cssText`/`length`/`parentRule`/`cssFloat`/`item`/`getPropertyValue`/
   `getPropertyPriority`/`setProperty`/`removeProperty` (the `_enumAccessors` helper is
   defined later in the prelude, so inline).
4. **`setProperty` `.length`** — was 3 (`name, value, priority`); WebIDL requires 2
   (priority optional). Fixed with a default `priority = ""`.
5. **Operation arity-throwing** — WebIDL requires an operation to throw `TypeError` when
   called with fewer than its required args. idlharness registers `svg_element.style`,
   `getComputedStyle(svg_element)`, and the rule styles and calls e.g. `setProperty()`
   with 0 args expecting a throw. Added `if (arguments.length < N) throw new TypeError`
   to `setProperty`(2)/`getPropertyValue`(1)/`getPropertyPriority`(1)/`removeProperty`(1)/
   `item`(1). (Verified no internal 0-arg callers first.)
6. **Author-non-constructible** — `new CSSStyleDeclaration()` must throw. Guarded via
   `new.target === CSSStyleDeclaration && !_allowStyleDeclCtor`; the sole subclass
   `CSSFontFaceDescriptors` chains through `super()` with new.target === the subclass, so
   it stays safe. A `_newStyleDecl()` internal factory (flips the flag) replaced all 6
   `new CSSStyleDeclaration()` sites.

## #384 — `CSSRule` base + the `@page` margin-box object model

**`CSSRule` base** (23 fails → 0): `new.target === CSSRule` ctor guard (every real rule
is a subclass, safe), brand-checked `type`/`cssText`/`parentRule`/`parentStyleSheet`
getters, a **writable no-op `cssText` setter** (CSSOM `cssText` is `attribute`, not
readonly — idlharness asserts "setter must be function"), non-enum global,
`Symbol.toStringTag`, enumerable accessors.

**The `@page` margin-box model:**
- `class CSSMarginRule extends CSSRule` — `.name` (box name), `.style`, type 9
  (`MARGIN_RULE`), `...args` ctor (`.length` 0), PutForwards `set style`.
- `CSSPageRule` re-based from `CSSRule` onto **`CSSGroupingRule`** — gains `.cssRules`,
  `insertRule`, `deleteRule`. Its ctor splits the `@page` body with `_splitNestedRuleBody`
  (declarations → `.style`, `@<margin-box> {…}` at-rules → `CSSMarginRule` children).
- `_MARGIN_BOXES` — the 16 css-page-3 boxes (`top-left`, `top-center`, …).
- Both non-author-constructible, guarded by `_allowPageChildCtor` (flipped in `_makeRule`).

**THE ROOT-CAUSE HUNT** (the session's most instructive debug): `sheet.cssRules[2].cssRules[0]`
(the margin child) kept reading `undefined` on the LOADED idlharness page, yet fresh &
dynamically-created `@page { @top-left {} }` sheets built the child correctly (proven).
A long instrumentation chain (a build counter, an instance-identity check, a list-object
identity check) showed: the constructor DID build the child (`final: 1`), the SAME
instance later had 0 children, with NO rebuild. A **Proxy trap** on the child array
captured the culprit's stack:

```
Error: cleared 1->0
    at CSSPageRule.deleteRule (bootstrap:…)
    at assert_throws_js_impl (testharness)
    at IdlInterface.<anonymous>  ← idlharness "deleteRule too-few-args must throw"
```

idlharness's own **"calling `deleteRule()` with too few arguments must throw TypeError"**
test was calling `pageRule.deleteRule()` — and `CSSGroupingRule.deleteRule`/`insertRule`
(unlike `CSSStyleSheet`'s, which already had it) had **no WebIDL arity guard**. So instead
of throwing, `deleteRule()` ran `arr.splice(0 >>> 0, 1)` and **spliced out the margin
child**, undefining the registered object and cascading ~15 subtest failures across
`CSSRule`/`CSSMarginRule`/`CSSPageRule`/`CSSGroupingRule`.

The fix — `if (arguments.length < 1) throw new TypeError(...)` on both
`CSSGroupingRule.insertRule` and `deleteRule` — fixed the destructive deletion AND the
arity tests themselves. `css/cssom/idlharness` 300 → 339.

## Zero-regression proof

STASH-PROVED the baseline (`git stash` bootstrap.js → rebuild → measure → pop):
- `css/cssom/idlharness` **242** pre-change (→339 GAIN).
- `getComputedStyle-detached-subtree` **0/6 IDENTICAL** — a pre-existing render-tree
  gap (it wants EMPTY computed style for detached/`display:none`/outside-flat-tree
  elements; our getComputedStyle returns populated objects, failing `assert_true` not
  throwing — construction is fine).

Held (all matched): `CSSGroupingRule-insertRule` 7/7, `CSSStyleSheet` 17/17, `cssimportrule`
11/11, `css-nesting/cssom` 12/14, `nested-declarations-cssom` 12/12, `cssom-setProperty-shorthand`
76/76, `serialize-media-rule` 12/12, `css-counter-styles/idlharness` 37/37, `css-fonts/idlharness`
97/97, `css-conditional/idlharness` 45/45, `css-cascade/idlharness` 34/34, `container-queries/idlharness`
28/28, `serialize-values` 696/697, `register-property-syntax-parsing` 246/246, `CSSStyleRule-set-selectorText`
82/82, `CSSKeyframesRule` 2/2, `cssstyledeclaration-csstext` 11/11, `shorthand-serialization` 6/7,
`font-face-src-list` 17/17, qsa 1975/1975, classlist 1420/1420, createElement 147/147.
(`all-shorthand` read CNR — curl-confirmed wpt.live HTTP 404, a stale path.)

## Caps / Next

Remaining `css/cssom/idlharness` fails (158):
- **`CSSPageDescriptors` (34)** — the `@page` `.style` descriptor interface (`CSSFontFaceDescriptors`
  recipe exactly: `extends CSSStyleDeclaration` + generated brand-checked accessors for
  `size`/`margin`/`marks`/`bleed`/… ; `CSSMarginRule.style` + `CSSPageRule.style` should
  return it). **Cheapest next win** — the template is proven.
- **`MediaList` (16) / `StyleSheetList` (11) / `CSSRuleList` (7)** — the "found on object
  expected in prototype chain" proxy pattern: their members are OWN properties on the
  proxy target instead of on the prototype. Fix the proxy to expose members via the
  prototype.
- **`CSSStyleSheet` (18) / `CSSStyleProperties` (12) / `CSSImportRule` (11) /
  `CSSNamespaceRule` (10)** — assorted WebIDL shape (some need the same enumerable/brand/
  arity treatment; `@namespace` is still a bare `CSSGenericRule`, not `CSSNamespaceRule`).

**NEXT LEVERAGE:** `CSSPageDescriptors` (a), then the proxy-own-property `MediaList` family (b).

Reusable seeded: `_newStyleDecl()` (guarded internal `CSSStyleDeclaration` factory), the
operation-arity-throw pattern, the `new.target` ctor guard (author-non-constructible with
no flag), `_MARGIN_BOXES` + `_splitNestedRuleBody`-driven margin-child build,
`_csBrand`/`_csRuleBrand`.
