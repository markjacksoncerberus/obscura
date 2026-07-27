# Scroll 364 — The CSSNestedDeclarations Verdict (Quests #364–#366)

> *A child in a classroom opens a lesson built with a modern CSS toolchain. Its
> stylesheet nests declarations after nested rules — `div { color: blue; @media
> all { … } color: green }` — and a script reads `.cssRules` to theme the page.
> Scroll #358 taught the engine to PARSE nesting; #361 let a script manipulate a
> style rule. This scroll teaches the missing rule TYPE that sits between them —
> `CSSNestedDeclarations` — so those interleaved declarations are real, addressable
> CSSOM objects, and the page themes correctly instead of losing half its styles.*

**Realm:** `css/css-nesting/nested-declarations-cssom.html` **5/12 → 12/12**,
`nested-declarations-cssom-whitespace.html` **0/2 → 2/2**,
`serialize-group-rules-with-decls.html` **9/15 → 15/15**, and BONUS
`css/cssom/serialize-media-rule.html` **2/12 → 9/12**.
**Bounty:** **+22**, three quests, ONE commit, ZERO regressions.
**Session:** 2026-07-27. Took #363's next-leverage (a): the fattest remaining
nesting-CSSOM vein. All pure-JS, all `bootstrap.js`.

## The gap

Scrolls #358–#363 gave `CSSStyleRule` a `.cssRules` list of nested *rules* and made
it a `CSSGroupingRule`. But CSS Nesting has a subtler shape: a rule body interleaves
DECLARATIONS with nested rules, and the CSSOM models a run of declarations that
follows a nested rule (or any run inside a nested group rule, which has no `.style`
of its own) as its own rule — `CSSNestedDeclarations`. Obscura had none of this:

- `_splitNestedRuleBody` merged ALL declarations of a style rule into one `.style`,
  regardless of their position relative to nested rules, and serialized them first —
  so trailing declarations lost their source order and never became addressable.
- A nested group rule (`@media` inside a style rule) dropped its declarations
  entirely (`_cssParseRuleList` on its body knows only rules, not declarations).
- There was no `CSSNestedDeclarations` interface at all; `insertRule('color:red')`
  (a bare declaration block) threw SyntaxError instead of creating one.

## The work (all `bootstrap.js`, all pure-JS)

### Quest #364 — the ordered body model + the `CSSNestedDeclarations` primitive
`_splitNestedRuleBody` now also returns an ordered `items` array: consecutive
declarations coalesce into ONE `{kind:'decls', decls:[…]}` run; a nested rule flushes
the current run and pushes a `{kind:'rule', prelude, body}` item. A new
`_buildNestedItems(body)` maps those items to child descriptors:
- a decl-run → `{type:'nested-decls', declText}`,
- a nested style rule (valid `<relative-selector-list>`) → `{type:'style', _nested:true}`,
- a nested conditional group rule (@media/@supports/@container/@document) →
  `{type:'group', rules: _buildNestedItems(body)}` (recursive nesting context),
- everything else drops — an unparseable nested selector, or an at-rule invalid in
  nesting context (@font-face/@keyframes/@page/@property/@counter-style/@scope/@layer).

Crucially, a decl-run left ADJACENT to another because the rule between them was
dropped COALESCES with it — so `.a { @scope(.foo){…} --w:1 }` in an engine without
`CSSScopeRule` reads `--w:1` as the leading run → `.style`, and `cssRules.length` is
0, exactly as the "Nested @scope rule" test demands.

New `class CSSNestedDeclarations extends CSSRule`: `.style` (a `CSSStyleDeclaration`
via `_styleProxy`), `.cssText` = the bare declaration block (`_serializeDeclBlock`,
`''` when empty), `set style` forwarding to `cssText` ([PutForwards=cssText]).
`_makeRule` builds a `nested-decls` descriptor into one.

The **CSSStyleRule constructor** was rewritten onto `_buildNestedItems`: its LEADING
run (declarations before the first surviving nested rule) becomes `.style`; every
subsequent run and nested rule becomes a `_nestedDescs` child (a run → a
`CSSNestedDeclarations`). `_cascadeDecls` keeps the FULL declaration text (leading +
every run) so the CSSOM-edit cascade path (`_styleSheetRules`) is byte-unchanged from
before nesting. A nested group rule, having no `.style`, turns EVERY run (including
the leading one) into a `CSSNestedDeclarations` child.

### Quest #365 — `insertRule` of a bare declaration block
An `insertRule` argument that parses to ZERO rules but holds ≥1 valid declaration now
becomes a `CSSNestedDeclarations` (`_makeNestedDeclsFromText` + `_declBlockHasValid` —
a known standard property, or a valid custom property with a balanced value; an empty
block or one of only unrecognised properties like `xwidth:` yields none → SyntaxError).
Valid ONLY in a nesting context (`_ruleInNestingContext`): a style rule always
qualifies, a nested @media qualifies, but a TOP-LEVEL @media or a bare stylesheet does
NOT → SyntaxError. Wired into both `CSSGroupingRule.insertRule` and
`CSSStyleRule.insertRule`.

### Quest #366 — empty-child serialization + the multi-line group block
An emptied `CSSNestedDeclarations` (after `.style = ''`) serializes to `''` and is
SKIPPED in its parent's block (both `CSSStyleRule.cssText` and `_serializeGroupBlock`
now filter out children whose `cssText === ''`). An empty group block serializes as
`{\n}` (not the old ` { }`) per CSSOM §serialize-a-css-rule — which, as a bonus,
lifted `css/cssom/serialize-media-rule.html` from 2/12 to 9/12 (every expected value
in that file uses the `{\n}` form).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-nesting/nested-declarations-cssom.html` | 5/12 | **12/12** |
| `css/css-nesting/nested-declarations-cssom-whitespace.html` | 0/2 | **2/2** |
| `css/css-nesting/serialize-group-rules-with-decls.html` | 9/15 | **15/15** |
| `css/cssom/serialize-media-rule.html` (bonus) | 2/12 | **9/12** |

**+22 subtests**, ZERO regressions.

## Zero-regression proof

STASH-PROVED against a pre-change binary: `serialize-media-rule` was 2/12 (→9 is a
GAIN, not a regression), `css-conditional/idlharness` 30/45 IDENTICAL, `cssom.html`
12/14 IDENTICAL. Held baselines all matched: `parsing.html` 32/32,
`invalid-inner-rules` 2/2, qsa 1975, classlist 1420, createElement 147,
serialize-values 696/697, shorthand-serialization 6/7, cssstyledeclaration-csstext 11,
all-shorthand 27, cssom-setProperty-shorthand 76, CSSStyleRule-set-selectorText 82,
cssimportrule 11, CSSStyleSheet 17, CSSKeyframesRule 2, MediaList 1,
CSSGroupingRule-cssRules 1/1, CSSGroupingRule-insertRule 7/7, mediaquery-sort-dedup
2/2, register-property-syntax-parsing 246, **all-prop-initial-xml 382/382** (the
cascade path — `.style` now holds only the leading run but `_cascadeDecls` keeps the
full text, so the cascade is untouched), parse-anplusb 112, parse-is-where 31/33.

## Caps / Next

**CAP:** `mixed-declarations-rules` 0/1 and `nested-error-recovery` 1/4 stay red —
both are `getComputedStyle` cascade tests. They need nested-rule MATCHING and
declaration ordering carried through the cascade (the Rust `selectors` matcher +
computed-style), which is the same wall #360/#363 named: layout/matching-adjacent, not
pure-JS CSSOM.

**NEXT LEVERAGE:**
- **(a)** media-query text normalization in `_makeMediaList` — the last 3
  `serialize-media-rule` fails: case-fold a media type (`spEech`→`speech`) and feature
  (`cOLor`→`color`), omit `all` from `all and (color)`, drop a negated `all`. A small,
  self-contained gap now that the block serialization is correct.
- **(b)** a fresh `css/*/parsing/` dir — the mature value realms are mined out, so
  scout a whole-feature 0/N file.

**Reusable:** `_buildNestedItems` (ordered nesting-context descriptors with
invalid-drop + adjacent-run coalescing), the `CSSNestedDeclarations` class,
`_declBlockHasValid` + `_makeNestedDeclsFromText` (the bare-decl-block insert gate),
and the empty-child-skip serialization rule (a child serializing `''` never appears in
its parent's block).
