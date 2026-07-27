# 🏳️ The Cascade-Layer & Scope Verdict — Quests #370–#372

> *CSS Cascade 5/6 CSSOM object model — the `@layer` rule family and the `@scope`
> interface. `css/css-cascade/layer-rules-cssom.html` **0→9**,
> `css/css-cascade/idlharness.html` **2→34**. **+41, ONE commit, ZERO regressions.***

Session 2026-07-27. Took #369's next-leverage (b) — "`CSSMediaRule`/`CSSContainerRule`
object-model files if a winnable pure-JS vein exists." A scout of the cascade realm
found a fatter one: **`@layer` and `@scope` were wholly unmodelled.** The parser
dropped them (nesting context) or emitted a bare `CSSGenericRule` with no attributes,
so `window.CSSLayerBlockRule`/`CSSLayerStatementRule`/`CSSScopeRule` didn't exist and
`layer-rules-cssom` / `css-cascade/idlharness` sat at 0/9 and 2/34.

This is the classic "one primitive unlocks a whole file" shape, and pure-JS
(CSSOM structure + WebIDL surface, no layout, no cascade matching). It reuses the
CSSImportRule/CSSFontPaletteValuesRule at-rule template and #368's WebIDL scaffolding.

## The gap (baseline)

| File | Before | Cause |
|------|:------:|-------|
| `css/css-cascade/layer-rules-cssom.html` | 0/9 | no `CSSLayerBlockRule`/`CSSLayerStatementRule`; no `CSSImportRule.layerName`; `<style>` never fires `load` for `@import` |
| `css/css-cascade/idlharness.html` | 2/34 | interfaces `CSSLayerBlockRule`, `CSSLayerStatementRule`, `CSSScopeRule` all missing |

The idlharness stylesheet fixes the rule order and indices:
```css
@layer bar, baz;                          /* [0] CSSLayerStatementRule */
@import url('data:text/css,') layer(qux); /* [1] CSSImportRule (.layerName) */
@layer foo { }                            /* [2] CSSLayerBlockRule */
@scope (div) to (span) { }                /* [3] CSSScopeRule */
```

## The work (all `crates/obscura-js/js/bootstrap.js`)

### #370 — the `@layer` block + statement primitives + `layerName` + the style `load`
- **Parsing.** `_cssParseRuleList` gained a **block** branch (`@layer <name>? { <rule-list> }`
  → `{type:'layer-block', condition:<name>, rules}`; the name validated as a `<layer-name>`
  via `_isValidLayerName` or the rule dropped; empty name = anonymous) and, in the
  `;`-terminated branch, a **statement** branch (`@layer a, b;` →
  `{type:'layer-statement', nameList}` via `_parseLayerNameList` — an empty or invalid
  list drops the rule, since anonymous layers are **block-only**).
- **Classes.** `class CSSLayerBlockRule extends CSSGroupingRule` — `.name` (`''` for the
  anonymous `@layer { }`), the inherited `.cssRules`. `class CSSLayerStatementRule extends
  CSSRule` — `.nameList`, a WebIDL FrozenArray returned as a fresh `Object.freeze(slice())`
  each read. Both `.type` return 0 (no legacy numbered CSSRule type).
- **`CSSImportRule.layerName`.** `_parseImportRule` now captures the optional cascade
  layer (`layer`→`''`, `layer(name)`→the name, absent→null) with a `(?![\w-])` lookahead
  so `layerfoo` doesn't match the bare keyword; `.layerName` exposes it, and `.cssText`
  serializes it back.
- **The `<style>` `load` event.** The 3 `@import` subtests `await` the style element's
  `load`. `_connectResourceElement` gained an `else if (ln === 'style')` branch that fires
  a **queued** `load` (`_fireIframeElementLoad`) on a connected `<style>` whose text
  contains `@import` (we don't fetch imports; scoped to @import-bearing styles so the many
  plain `<style>`s that never observe load are untouched).

### #371 — WebIDL conformance for the two @layer interfaces
Mirrors #368's CSSConditionRule playbook:
- interface objects exposed **non-enumerable** (`_exposeIface`);
- **non-author-constructible** — an `_allowCssCondCtor` guard in each constructor throws
  "Illegal constructor" for author `new`, while `_makeRule` flips the flag on around
  internal construction (CSSLayerBlockRule/CSSScopeRule build inside the existing
  `_allowCssCondCtor=true` try; CSSLayerStatementRule builds at an early return, so its
  `_makeRule` branch sets/clears the flag itself);
- interface-object **`.length` 0** (`constructor(...args)`, reading `args[0]` as the desc);
- **brand-checked** `.name`/`.nameList` getters (reading on the prototype throws TypeError
  via `this instanceof`);
- **`Symbol.toStringTag`** → `[object CSSLayerBlockRule]` / `[object CSSLayerStatementRule]`;
- accessors **re-stamped ENUMERABLE** (`_enumAccessors` — ES class getters are
  non-enumerable, WebIDL attributes must be enumerable);
- correct **prototype chains** (block → `CSSGroupingRule`, statement → `CSSRule`).

### #372 — the `CSSScopeRule` interface + `@scope` parsing (incl. nested-in-style-rule)
- `class CSSScopeRule extends CSSGroupingRule` with `.start`/`.end` (the `<scope-start>`/
  `<scope-end>` selector text, or null); `_parseScopePrelude` parses
  `(<scope-start>)? [ to (<scope-end>) ]?`.
- Parsed both at **top level** (`_cssParseRuleList` `@scope` branch → `{type:'scope', …,
  rules}`) and **nested inside a style rule** — the subtle part. Once `window.CSSScopeRule`
  exists, `nested-declarations-cssom`'s "Nested @scope rule" test switches from its
  not-implemented path (asserting `cssRules.length === 0`, which passed while @scope was
  dropped) to its implemented path (asserting a real CSSScopeRule with 3 children). So
  `_buildNestedItems` gained a `@scope` branch, and a nested `@scope`'s body follows
  nesting semantics (decl-runs → `CSSNestedDeclarations`) **but** its child style rules are
  `:scope`-relative, so they serialize AS AUTHORED (`.b {}`, not `& .b {}`) — threaded via
  a new `_buildNestedItems(body, inScope)` param that sets `_nested: !inScope` on children.

## Results

| File | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `css/css-cascade/layer-rules-cssom.html` | 0/9 | **9/9** | +9 |
| `css/css-cascade/idlharness.html` | 2/34 | **34/34** | +32 |
| **Total** | | | **+41** |

## Zero-regression sweep (held, all matched)
css-conditional/idlharness **45/45**, serialize-media-rule **12/12**, at-supports-matches
**2/2**, cssimportrule **11/11**, CSSStyleSheet **17/17**, css-nesting parsing **32/32** +
cssom **12/14** + **nested-declarations-cssom 12/12** (the nested-@scope path repaired),
CSSGroupingRule-insertRule **7/7**, all-shorthand **27**, cssom-setProperty-shorthand
**76**, CSSStyleRule-set-selectorText **82**, register-property-syntax-parsing **246**,
CSSKeyframesRule **2**, MediaList **1**, mediaquery-sort-dedup **2**, qsa **1975**,
classlist **1420**, createElement **147**, serialize-values **696/697**.

The `<style>`-`load` change is structurally `<style>`-only; `link-load-event` 0/1 is a
pre-existing document-load-blocking cap (it uses no `<style>` element).

## Caps (honest)
- **`layer-cssom-order-reverse` 2/4** and **`layer-basic` 5/34** need the Rust cascade —
  layer ordering + rule matching reflected through `getComputedStyle` (+ web fonts). This
  is the layout/matching wall, not a CSSOM parse gap.
- **`serialize-group-rules-with-decls` / `nested-declarations-whitespace`** were
  could-not-run at chronicle time due to a **transient wpt.live 404** (curl-confirmed 404
  fetching the paths directly; both measured green earlier this session). Not a regression:
  the @scope change only sets `_nested: !inScope` and provably leaves non-scope group rules
  (`_buildNestedItems(body)` → `inScope` undefined → `_nested: true`, unchanged) untouched.

## Next leverage
1. **A fresh `css/*/parsing/` dir** — mature value realms are mined out; scout a
   whole-feature 0/N file.
2. **`CSSContainerRule` / `@container` object-model** — `css/css-contain/container-queries/
   cssom` + `idlharness` were could-not-run/stale in the scout; verify the real wpt.live
   paths first (curl), then the #368/#371 WebIDL scaffolding + the `@media`/group-rule
   plumbing is directly reusable.

**Reusable primitives:** `_isValidLayerName`/`_parseLayerNameList` (layer-name grammar),
`_parseScopePrelude` (`@scope` prelude → start/end), the non-author-constructible-rule
pattern (the `_allowCssCondCtor` guard reused for non-condition rules), `_exposeIface`/
`_enumAccessors` (WebIDL interface-object + enumerable-accessor stamping), and the
`<style>`-@import `load`-event fire in `_connectResourceElement`.
