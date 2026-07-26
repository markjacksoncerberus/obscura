# 🏳️‍⚧️ The Page-Rule Verdict — Quests #328–#330

> **Realm:** `css/css-page/parsing/` + `css/cssom/`
> **Bounty:** **+31** across 2 files (+1 bonus), ONE commit, ZERO regressions.
> **Session:** 2026-07-26. **Difficulty:** ⚔️⚔️

## The gap

Took #327's next-leverage (scout a fresh `css/*/parsing/` dir). A wide re-baseline
sweep (~30 files across css-flexbox / css-logical / css-writing-modes / css-tables /
css-lists / css-break / css-masking / css-transforms / motion / css-align / css-ruby /
css-inline / css-color-adjust / css-overscroll-behavior) confirmed the css `*/parsing/`
surface is essentially mined green. The **one** fresh vein was:

| File | Before | After |
|------|:------:|:-----:|
| `css/css-page/parsing/size-valid.html` | 1/15 | **15/15** |
| `css/cssom/cssom-pagerule.html` | 6/22 | **22/22** |
| `css/cssom/cssimportrule.html` (bonus) | 2/11 | **3/11** |

It was gated behind a genuine **primitive gap**: an `@page` rule produced a bare
`CSSGenericRule` with **no `.style`**. `size-valid` reads `cssRules[i].style.cssText`
→ *"Cannot read properties of undefined (reading 'cssText')"* on all 14 value rows.
The "Test setup" row passed (the rules were *counted*), which is why this hid in a
realm that otherwise looks done.

## The work — three quests, one commit

### #328 — The `CSSPageRule` primitive
A real rule class (CSSOM §CSSPageRule) beside `CSSStyleRule`, modelled on it:
- `.style` — a `CSSStyleDeclaration` populated from the `@page` declaration block.
- `.selectorText` — the page selector (see #330).
- `.cssText` — `@page <sel>? { <decls> }`.
- `type` → `6` (`CSSRule.PAGE_RULE`).
- `@page` now routes to `{ type: 'page', … }` in `_cssParseRuleList` and a
  `CSSPageRule` branch in `_makeRule` (was the fall-through `CSSGenericRule`).

The rule's `.style` carries a **`_pageDescriptors`** flag. `size`/`page-orientation`
are in `_DESCRIPTOR_ONLY` (dropped on element styles). Threaded the flag through
`_parseStyleDecls(text, opts)`, `CSSStyleDeclaration.setProperty`, and the `cssText`
setter so those descriptors are accepted + canonicalized **only** on a page rule's
style. An element style still drops them → `size-invalid` stays 14/14.

### #329 — The `size` descriptor value engine
`_canonPageSize` for
`size = auto | <length [0,∞]>{1,2} | [ <page-size> || [ portrait | landscape ] ]`
where `<page-size>` = a5/a4/a3/b5/b4/jis-b5/jis-b4/letter/legal/ledger:
- page-size keywords lowercased (`A5`→`a5`, `jis-B5`→`jis-b5`);
- the default `portrait` is **dropped** when a page-size is present
  (`letter portrait`→`letter`);
- `landscape` is kept and serialized **after** the size
  (`legal landscape`, `landscape legal`→`legal landscape`);
- 1–2 non-negative lengths (`640px 480px`, `8.5in 11in`); a length may not mix
  with a keyword.

### #330 — The `@page` page-selector grammar
`_canonPageSelector` for a `<page-selector-list>` of `[ <ident>? <pseudo-page>* ]!`,
`pseudo-page = :left | :right | :first | :blank`:
- page name = case-**preserved** `<custom-ident>`; pseudos case-**insensitive**
  (`named:First`→`named:first`);
- NO whitespace between the name and its pseudos or between pseudos
  (`named :first`, `:first :left` → invalid);
- an unknown pseudo (`:notapagepseudo`) → invalid.

Wired into `CSSPageRule.selectorText` (getter canonicalizes; **setter no-ops on an
invalid selector per CSSOM**, keeping the previous value) and `.cssText`.

Also fixed `deleteRule` in **both** `CSSStyleSheet` and `CSSGroupingRule` to null a
removed rule's `parentStyleSheet`/`parentRule` (CSSOM §remove-a-css-rule) — greened
cssom-pagerule's last subtest and, as a bonus, `cssimportrule` 2→3.

## Zero-regression sweep

qsa 1975, classlist 1420, createElement 147, serialize-values 695/697,
**CSSStyleRule-set-selectorText 82/82** (big `_parseSelectorList` canary),
**CSSGroupingRule-insertRule 7/7** (the `deleteRule` change did not regress it),
CSSRuleList 1/1, CSSStyleSheet 11/17 (pre-existing arity cap),
cssstyledeclaration-csstext 7/11 (pre-existing), insertRule-no-index 2/2,
keyframes-name-invalid 20/20 + -valid 39/39, transition-shorthand 18/18,
**size-invalid 14/14**, page-valid/invalid/computed 3·5·6,
page-orientation-invalid.tentative 4/4.

**Stash-proved pre-existing** (identical on the baseline binary, NOT regressions):
`registered-property-computation` 0/75 (a separate @property computed-value gap) and
`anchor-size-parse-valid` could-not-run (the huge-table scrape/timeout).

## Caps / Next

- **CAP:** nested margin at-rules inside `@page` (`@top-center` …) are not modelled —
  only the declaration block is captured into `.style` (no target test needs them).
- **CAP:** `page-orientation-valid.tentative.html` is a 404 upstream (only the invalid
  variant exists).
- **NEXT LEVERAGE:** the css `*/parsing/` surface is deeply mined; this session's
  productive veins were behind **CSSOM/primitive** gaps, not raw-store value engines.
  Scout `css/cssom/` itself (re-baseline: cssimportrule 3/11 = `@import` sheet-loading,
  CSSStyleSheet 11/17 = constructor arity, cssstyledeclaration-csstext 7/11) and other
  CSSOM-object realms, OR the `@font-face`/`@counter-style`/`@property` at-rule
  descriptor families — direct parallels to this `@page` primitive (a typed at-rule
  with a descriptor block + a dedicated CSSOM rule class).
- **Reusable:** the `CSSPageRule`/`_makeRule` typed-rule template (parallels
  `CSSFontPaletteValuesRule`/`CSSKeyframesRule`); the `_pageDescriptors`-style
  declaration-context flag (a descriptor accepted only inside its at-rule);
  `_canonPageSize`/`_canonPageSelector`.
- **DEV-LOOP:** `size-valid` reads `cssRules[i].style.cssText` — the descriptor must
  round-trip through a real rule `.style`, not merely validate.
