# Scroll 358 — The CSS-Nesting Parsing Verdict (Quests #358–#360)

> *A browser for the whole world must speak the CSS authors actually write today.
> CSS Nesting shipped across every major engine years ago; a homework page, a
> component library, a government form built with a modern toolchain all lean on
> `& { … }`. Obscura understood none of it — a nested rule leaked into the parent's
> declaration block as garbage. This scroll teaches the engine to nest.*

**Realm:** `css/css-nesting/parsing.html` — **0/32 → 32/32 (100% file conquest).**
**Bounty:** **+32**, three quests, ONE commit, ZERO regressions.
**Session:** 2026-07-26. Took #357's next-leverage (d) — a fresh region — after a
broad re-baseline proved the mature `css/*/parsing/` value realms were mined out
(transforms/filter/images/motion/text/ui all 100%). `css-nesting/parsing.html`
stood at a stark **0/32** — a whole unimplemented feature, and (crucially) an
entirely **pure-JS** one: CSSOM structure + selector serialization, no layout, no
selector *matching*. The classic "one primitive unlocks a whole file" shape.

## The gap

CSS Nesting (CSS Nesting §nested-style-rules, §serialize) lets a style rule contain
*nested* style rules whose selectors reference the parent via the **nesting selector
`&`**. Obscura had three holes:

1. **The selector parser rejected `&`.** `_parseSelectorList('&')` → null, so every
   nesting selector was invalid. (Live probe: top-level `&{…}` threw "insertRule
   expects exactly one rule" because the rule was dropped as unparseable.)
2. **`CSSStyleRule` had no `.cssRules`.** A style rule's body was fed wholesale to
   the declaration serializer, so `.foo { & { color: green } }` stored the literal
   garbage declaration `& { color: green` and exposed no child rule.
3. **No nesting serialization.** Even once parsed, a nested selector must be
   *absolutized* — the implicit `&` made explicit — when read back via
   `innerRule.selectorText` (`> .bar` → `& > .bar`, `.foo` → `& .foo`).

## The work (all `bootstrap.js`, all pure-JS)

### Quest #358 — the `&` nesting selector in the parser
`parseCompound`'s simple-selector loop now accepts `&` as a `{kind:'nest'}` sub,
usable anywhere a class/id/pseudo can go. Because it is a *simple* selector (not a
type), the existing compound grammar naturally enforces the spec's rule that a type
selector must lead its compound: `&div` fails to parse (the `div` can't follow a
simple selector → the whole selector is invalid → the nested rule is dropped),
while `div&`, `&.bar`, `&&` are all valid. `_serSub` serializes `{kind:'nest'}` → `&`.

### Quest #359 — nested-rule CSSOM structure
- **`_splitNestedRuleBody(body)`** — a brace/paren/string-aware scan that splits a
  style rule's body into its declaration text and its nested `{prelude, body}` rules.
  A top-level `{` ends a nested rule's prelude; a top-level `;` ends a declaration.
  A **custom property** whose value carries a block (`--x: { … }`) is kept as a
  declaration (guarded by a leading-`--` check), so it is never mistaken for a
  nested rule. A declaration-only body (no `{` — the overwhelming common case) is
  returned unchanged, so non-nesting pages are byte-identical.
- **`CSSStyleRule`** gained `_ruleListObj`/`_ruleList` + `get cssRules()`, and its
  constructor now runs the splitter: the declaration text feeds `_styleDecl.cssText`
  and the cascade decls (`_cascadeDecls`), while each nested rule becomes a child
  descriptor (invalid nested selectors dropped — a valid one is validated as a
  `<relative-selector-list>`). `_makeRule` builds the child rules *after* the parent
  links exist, so each nested rule inherits the owning sheet and points its
  `parentRule` at its container. `cssText` now serializes declarations then nested
  rules.

### Quest #360 — nested-selector serialization (absolutization)
A nested rule serializes its selector as a `<relative-selector-list>` with `&` made
explicit (`_serNestedSelList` / `_serNestedComplex`). Per-complex-selector rule,
derived empirically from all 32 subtests:
- **leads with a combinator** (relative — `> .bar`, `+ .bar &`) → prefix `& ` →
  `& > .bar`, `& + .bar &`;
- **contains no `&` anywhere** (deep — including inside `:is()` args) → prefix `& ` →
  `.foo` → `& .foo`, `:is(.bar, .baz)` → `& :is(.bar, .baz)`;
- **already contains `&`** and has no leading combinator → serialize as authored →
  `.a > & .b`, `div&`, `&&`, `:is(.bar, &.baz)`.

`_complexHasNest`/`_subHasNest` do the deep `&`-detection (recursing into functional
pseudo-class arguments). The nested `selectorText` getter/setter parse relative
(`_parseSelectorList(src, true)`); top-level rules keep the normal `_serSelList`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-nesting/parsing.html` | 0/32 | **32/32** ✅ 100% |

## Zero-regression sweep (all held)

qsa **1975/1975**, classlist **1420/1420**, createElement **147/147**,
CSSStyleRule-set-selectorText **82/82**, cssom-setProperty-shorthand **76/76**,
serialize-values **696/697** (pre-existing 1), shorthand-serialization **6/7**
(pre-existing 1), cssstyledeclaration-csstext **11/11**, all-shorthand **27/27**,
cssimportrule **11/11**, CSSKeyframesRule **2/2**, CSSStyleSheet **17/17**,
register-property-syntax-parsing **246/246**, font-valid **315/315**,
**all-prop-initial-xml 382/382** (the `all` cascade path — confirms the CSSStyleRule
body-splitter didn't disturb `_cascadeDecls` derivation).
Selector-parser sweep (most exposed to the `&` change): parse-is-where **31/33**,
parse-not **25/26**, parse-anplusb **112/112**, parse-slotted **17/19** — every count
identical to the held baseline (the fails are known pre-existing caps).

## Caps / Next

**CAP (this session):** `set-selector-text.html`, `nested-declarations-matching`,
invalidation-* need nested rules to participate in the **cascade / selector
matching** (the `&` must resolve against the parent and apply computed values) —
that reaches the Rust matcher and getComputedStyle, layout/matching-adjacent.

**NEXT LEVERAGE — a rich vein just opened.** With `&` and nested-rule structure in
place, many sibling files now partially pass and are winnable in pure JS:
- **(a) Make `CSSStyleRule` a `CSSGroupingRule`** — `cssom.html` (1/14) asserts
  `CSSStyleRule instanceof CSSGroupingRule` and needs `insertRule`/`deleteRule` on a
  style rule (with **relative** selector validation for nested inserts). This is the
  fattest next target (`cssom.html`, `invalid-inner-rules.html` 0/2,
  `nested-rule-cssom-invalidation.html`). Requires reordering `CSSGroupingRule` above
  `CSSStyleRule` and a hard regression sweep of all group rules (@media/@supports/
  @container) — a real quest of its own, deliberately deferred to keep this commit's
  zero-regression promise.
- **(b) The `CSSNestedDeclarations` rule** — `nested-declarations-cssom.html` (2/12),
  `nested-declarations-cssom-whitespace.html` (0/2), `mixed-declarations-rules.html`
  (0/1): declarations that appear *after* a nested rule are wrapped in a
  `CSSNestedDeclarations` rule in the CSSOM.
- **(c) `serialize-group-rules-with-decls.html`** (3/15) — group-rule (@media/…)
  serialization when the group directly contains declarations (nesting-in-conditionals).

Reusable: the `_splitNestedRuleBody` body-splitter (declarations vs nested rules,
custom-property-block-safe); the `{kind:'nest'}` selector sub + `_serNestedSelList`
absolutization rule (leading-combinator / contains-`&` / neither); the deep
`_complexHasNest` detector.
