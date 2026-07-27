# Scroll 361 — The CSS-Nesting CSSOM Verdict (Quests #361–#363)

> *A modern component library, a homework page, a government form built with any
> of today's CSS toolchains ships nested rules — and increasingly reaches into
> them from JavaScript: read `.cssRules`, `insertRule` a state variant, tweak a
> child's `selectorText`. Scroll #358 taught the engine to PARSE nesting. This
> scroll teaches it to let a script MANIPULATE it — the CSSOM half of the feature.*

**Realm:** `css/css-nesting/cssom.html` **1/14 → 12/14**, `invalid-inner-rules.html`
**0/2 → 2/2**, `nested-declarations-cssom.html` **2/12 → 5/12**.
**Bounty:** **+16**, three quests, ONE commit, ZERO regressions.
**Session:** 2026-07-26. Took #360's next-leverage (a): a nested-rule CSSOM had just
opened up a cluster of sibling files. All pure-JS, all `bootstrap.js`.

## The gap

Scroll #358–#360 gave `CSSStyleRule` a read-only `.cssRules` and nested-selector
serialization, but a style rule was still a plain `CSSRule`: no `insertRule`/
`deleteRule`, no `CSSGroupingRule` inheritance, and its `cssText` serialized nested
rules on a SINGLE line (`.a { color: red; & .b {…} }`) where the spec (and every
browser) uses a MULTI-line indented block. Three holes, one per quest.

## The work (all `bootstrap.js`, all pure-JS)

### Quest #361 — `CSSStyleRule` IS a `CSSGroupingRule`
Per CSS Nesting a style rule is a grouping rule. `class CSSStyleRule extends
CSSGroupingRule` — which forced moving the `CSSGroupingRule`/`CSSConditionRule`
class block ABOVE `CSSStyleRule` (an ES `extends` clause is evaluated at
class-definition time; the runtime helpers those methods call — `_cssParseRuleList`,
`_makeRule`, `_assertRuleSelectorValid` — resolve later at call time, so only the
class needed to move). This makes `CSSStyleRule.__proto__ === CSSGroupingRule` and
brings `deleteRule`, the indexed getter, and `.item()` (→ `null` OOB) for free. A
style-rule-specific `insertRule` marks a child STYLE rule `_nested` (so its selector
is parsed/serialized as a `<relative-selector-list>`), validates it, and inserts at
index — OOB → `IndexSizeError`, `% {}` → `SyntaxError`.

### Quest #362 — multi-line nested `cssText` serialization
`_serializeDeclBlock` was refactored to sit on a new `_serializeDeclList` (the array
of `name: value;` strings, before the space-join). A style rule with NO nested rules
keeps the classic single-line form; WITH nested rules it serializes the CSS Nesting
§serialize block:
```
selector {
  decl;            (each declaration, 2-space indent, own line)
  child            (each child rule's cssText, 2-space indent)
}
```
A child's OWN internal newlines are NOT re-indented — the spec's indentation is
deliberately shallow, which is exactly why an inserted `@supports` serializes as:
```
.a {
  color: red;
  & .b { color: green; }
  @supports selector(&) {
  & div { font-size: 10px; }
}
  & .c { color: blue; }
}
```
Two more subtests rounded out here: the `.style` setter now strips nested rules from
its assigned text (`_splitNestedRuleBody(v).declText` — nested rules are not part of
a declaration list, so `& { … }` in the assignment is ignored and the rule's live
`.cssRules` are untouched); and a rule "dropped in forgiving parsing but containing
`&`" is serialized AS AUTHORED — `_subHasNest` now scans a forgiving pseudo's
preserved `raw` argument for `&`, so `:is(!& .foo, .b)` is kept verbatim rather than
absolutized to `& :is(…)`.

### Quest #363 — nesting-context rule validity + `<style>` re-parse
In "nesting context" (inside a style rule, transitively) only style rules and nested
GROUP rules are valid children; `@font-face`/`@keyframes`/`@page`/`@property`/
`@counter-style` (and the statement at-rules) are invalid there. Two enforcement
points, plus a re-parse fix:
- **`_filterNestDescs`** drops those at-rules when building a style rule's nested
  descriptors, recursing through nested group rules (so `div { @media { @font-face
  {…} } }` drops the inner `@font-face` too) — but it runs ONLY on a style rule's
  body, so a top-level `@media { @font-face { … } }` is untouched (still valid).
- **`insertRule` gate** — a style rule rejects any non-style/non-group child
  (`HierarchyRequestError`), and `CSSGroupingRule.insertRule` rejects the same when
  `_ruleInNestingContext(this)` (a style rule anywhere up the `parentRule` chain) —
  again a no-op for a top-level `@media`.
- **`_invalidateNodeSheet`** — assigning a `<style>`'s `innerHTML`/`textContent`
  now drops its cached sheet-vs-text sync so the next `document.styleSheets`/`.sheet`
  access re-parses. The old text-equality cache in `_styleSheetForNode` MISSED the
  case where a CSSOM edit (`rule.style = …`) mutated the rules and the author then
  re-assigned the ORIGINAL text — byte-identical text, stale rules. Per spec,
  replacing a style element's children re-parses even when the text is unchanged.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-nesting/cssom.html` | 1/14 | **12/14** 🔶 86% |
| `css/css-nesting/invalid-inner-rules.html` | 0/2 | **2/2** ✅ |
| `css/css-nesting/nested-declarations-cssom.html` | 2/12 | **5/12** 🔶 42% |

**ZERO regressions** — stash-proved (build the pre-change binary, measure, restore):
`style-sheet-interfaces-001` 4/7 and `css-conditional/idlharness` 30/45 IDENTICAL
before/after (the CSSGroupingRule reorder is byte-identical in content and
shape-neutral; the `<style>` re-parse only changes WHEN a sheet rebuilds). Held
baselines all matched: `parsing.html` 32/32, qsa 1975, classlist 1420, createElement
147, serialize-values 696/697, shorthand-serialization 6/7, csstext 11, all-shorthand
27, cssom-setProperty-shorthand 76, CSSStyleRule-set-selectorText 82, cssimportrule
11, CSSKeyframesRule 2, CSSStyleSheet 17, MediaList 1, parse-is-where 31/33, parse-not
25/26, parse-anplusb 112, all-prop-initial-xml 382.

## Caps / Next

**CAP (this session):**
- `cssom.html`'s last 2 subtests ("Mutating the selectorText … invalidates inner
  rules", "Manipulation of nested declarations through CSSOM") need BOTH named-window
  globals (`outer`/`inner1` from element `id`s) AND nested-rule *matching* in the
  cascade (`getComputedStyle` reflecting a nested rule / a `CSSNestedDeclarations`
  edit). The matching is the real wall — the Rust `selectors` engine + cascade must
  resolve `&` against the parent, which is layout/matching-adjacent.

**NEXT LEVERAGE:**
- **(a) the `CSSNestedDeclarations` rule primitive** — `nested-declarations-cssom`
  5/12 is the fattest remaining nesting-CSSOM vein. Declarations that appear AFTER a
  nested rule in a style rule's body become their OWN `CSSNestedDeclarations` rule in
  `.cssRules` (not folded into the parent's `.style`); `insertRule('z-index: 3;')`
  inserts one. Needs a new rule class + a body-split that emits declaration-run rules
  interleaved with nested rules + cascade wiring for its `.style`. Sibling
  `nested-declarations-cssom-whitespace` (0/2) rides along.
- **(b) `nested-error-recovery` 1/4 + `mixed-declarations-rules` 0/1** — small
  serialization/recovery files that may fall to the same body-splitter work.
- **(c) a fresh `css/*/parsing/` dir** — the mature value-parsing realms are mined
  out; scout for a whole-feature 0/N file like css-nesting was.

**Reusable:** `_serializeDeclList` (per-declaration array — use anywhere a block must
be emitted line-by-line, not space-joined); `_filterNestDescs` + `_ruleInNestingContext`
+ `_nestOkDesc` (the nesting-context validity trio); `_invalidateNodeSheet` (force a
`<style>`/`<link>` sheet re-parse on content replacement); the multi-line grouping-block
serialize shape (`'  ' + child.cssText`, newlines un-reindented).
