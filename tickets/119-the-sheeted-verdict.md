# Quest #119 — The Sheeted Verdict (CSSOM rule tree)

**Realm:** `css/cssom/` — the CSS Object Model rule tree.
**Banner:** A real constructable `CSSStyleSheet` + `CSSRule`/`CSSRuleList` tree,
`document.styleSheets` / `<style>.sheet`, grouping & keyframes rules, and the
cascade reading `adoptedStyleSheets`.
**Result: +38** subtests across the rule-object-model family. ZERO regressions.

## The gap

`css/cssom/` splits cleanly in two. **Serialization** (specified/computed value
round-trips) was already conquered — `serialize-values` 696/697,
`shorthand-serialization` 7/7 — because the inline-style `CSSStyleDeclaration`
(el.style) is rich and well-tested. But the **rule tree** was a stub:

- `document.styleSheets` returned `[]` (hardcoded).
- `<style>.sheet` did not exist.
- `CSSStyleSheet` was a placeholder storing `{cssText, type}` plain objects; no
  real `CSSRule`, `CSSRuleList`, `CSSStyleRule`, grouping rules, or keyframes.
- `CSSStyleDeclaration` was not iterable (`Symbol.iterator` missing).
- `adoptedStyleSheets` did not feed the cascade, and its getter returned a
  throwaway `[]` so `.push(sheet)` was silently lost.

So the entire constructable-stylesheet / `cssRules` / `insertRule` family was red.

## The work (all in `bootstrap.js`, additive — no ops.rs change)

A spec-shaped CSSOM object model layered over the **same CSS parser the cascade
already uses** (`_cssParseDecls` / `_serializeDeclBlock`), so a rule's `cssText`
matches the heavily-tested specified declaration-block form for free.

1. **`_cssParseRuleList(cssText)`** — a recursive rule-list parser (unlike the
   cascade's `_cssSplitRules`, it preserves at-rules and their nested rule lists,
   tracking string + bracket nesting). Emits descriptors: `style` / `group`
   (`@media`/`@supports`/`@container`/`@document`) / `keyframes` / `at` / `stmt`.
2. **`CSSRuleList`** — array-like over a backing `_rules` array mutated in place,
   so list identity is stable (`rules === sheet.cssRules` after replace). Numeric
   index via a Proxy reading the live array; `item()` returns null OOB.
3. **`CSSRule`** base + rule-type constants on interface AND prototype/instances;
   `parentRule`/`parentStyleSheet`/`type`/`cssText` are **prototype getters**
   (readonly — satisfies `assert_idl_attribute` + `assert_readonly`), backed by
   `_parentRule`/`_parentStyleSheet` set through `_makeRule`.
4. **`CSSStyleRule`** — `selectorText`, `style` (a `_styleProxy` CSSStyleDeclaration),
   `cssText` = `sel { decls }`. `set style(v)` implements `[PutForwards=cssText]`.
5. **Grouping rules** — `CSSGroupingRule` (cssRules/insertRule/deleteRule,
   rejecting statement at-rules with `HierarchyRequestError`), `CSSConditionRule`,
   `CSSMediaRule` (type 4, `MediaList` + `[PutForwards=mediaText]` media setter),
   `CSSSupportsRule` (type 12).
6. **`CSSKeyframesRule`** (type 7) — name (id-vs-string serialization for CSS-wide
   keywords/`none`), `cssRules`, `appendRule`/`findRule`(last-match)/`deleteRule`,
   indexed getter via Proxy; **`CSSKeyframeRule`** (type 8) keyText + style
   (`[PutForwards]`).
7. **`MediaList`** — serializable query list, Proxy-wrapped for `media[0]` access.
8. **`CSSStyleSheet`** (real, constructable) — cssRules/insertRule(default idx 0)/
   deleteRule/replace/replaceSync (ignoring `@import`), media/disabled/title/
   ownerNode/href; non-constructable variant backs `<style>.sheet`.
9. **`document.styleSheets`** — StyleSheetList over `<style>`+stylesheet `<link>`,
   each a CSSStyleSheet cached per node (`_nodeSheetMap` WeakMap, re-parsed on
   text change); **`HTMLStyleElement`/`HTMLLinkElement` `.sheet`** getter.
10. **Cascade integration** — `_buildCascade` now also reads
    `document.adoptedStyleSheets` (top-level `CSSStyleRule`s, ordered after the
    document's `<style>` rules), **gated on a non-empty adopted list** so ordinary
    pages keep the exact original cascade byte-for-byte. `adoptedStyleSheets`
    getter returns a stable persistent array so `.push()` is observed.

## Results (honest before → after; stash-proved baseline)

| test | before | after |
|---|---|---|
| CSSStyleRule | 0/10 | **10/10** |
| CSSGroupingRule-insertRule | 0/7 | **7/7** |
| CSSStyleSheet-constructable | 1/13 | **6/13** |
| CSSKeyframesRule | 0/2 | **2/2** |
| CSSKeyframeRule | 0/2 | **2/2** |
| CSSStyleSheet-constructable-replace-cssRules | 0/2 | **2/2** |
| CSSStyleSheet-constructable-duplicate | 0/4 | **2/4** |
| insertRule-no-index | 0/2 | **2/2** |
| MediaList | 0/1 | **1/1** |
| CSSRuleList | 0/1 | **1/1** |
| CSSStyleDeclaration-iterator | 0/1 | **1/1** |
| CSSGroupingRule-cssRules | 0/1 | **1/1** |
| CSSConditionRule-conditionText | 0/1 | **1/1** |
| CSSStyleSheet-constructable-cssRules | 0/1 | **1/1** |

**Total +38.** Zero regressions: serialize-values 696/697 (pre-existing 1 fail),
shorthand-serialization 7/7, qsa 1975, classlist 1420, getElementsByTagName 19,
MO-attributes 42, MO-childList 38, Node-properties 726, getComputedStyle-pseudo
2/28 (unchanged pre-existing pseudo-element layout cap). Cascade change
stash-proved harmless (gated on non-empty adoptedStyleSheets).

## Caps / Next

- **`CSSStyleSheet-constructable` 6/13** and **`-duplicate` 2/4** residue is
  **shadow-DOM + cross-document scoping**: `shadowRoot.adoptedStyleSheets` applying
  within a shadow tree, cascade position of duplicate adopted sheets in a
  ShadowRoot, and the cross-realm guard (a sheet constructed in one document can't
  be adopted by another → must throw). These need shadow-tree style scoping +
  per-sheet constructor-document tracking — a separate, larger lift.
- **Nested `@media`/`@supports` matching in the cascade** is not modelled (only
  top-level style rules from adopted sheets feed getComputedStyle); media-query
  evaluation is out of scope.
- Several `css/cssom/` paths (`CSSStyleRule-cssText`, `CSSMediaRule`,
  `CSSSupportsRule`, `insertRule-from-script`, `StyleSheet-ownerNode-content-document`)
  **404 on wpt.live** (bodyLen 42/95 → reads as CNR) — stale paths, not regressions.
- **Next-best:** the shadow-DOM adoptedStyleSheets scoping (would finish
  constructable.html + duplicate), or sweep `css/cssom/` insertRule-* /
  CSSStyleSheet-constructable-* tail for more pure-object-model wins.
