# Scroll 367 — The Conditional-Rules Verdict (Quests #367–#369)

> *A student on a hand-me-down laptop opens a page whose stylesheet gates its
> layout behind `@media` and `@supports`. A script reads `rule.media.mediaText`
> to show which breakpoint is active, checks `supportsRule.matches` to pick a
> fallback, and feature-detects with `CSS.supports("(display: grid)")`. If the
> media text isn't normalized, the interface objects aren't spec-shaped, or
> `matches` is a lie, the page's own logic breaks before a pixel is drawn. This
> scroll makes the whole `@media`/`@supports` CSSOM surface honest.*

**Realm:** `css/cssom/serialize-media-rule.html` **9/12 → 12/12**,
`css/css-conditional/idlharness.html` **30/45 → 45/45**,
`css/css-conditional/at-supports-matches.html` **0/2 → 2/2**.
**Bounty:** **+20**, three quests, ONE commit, ZERO regressions (stash-proved).
**Session:** 2026-07-27. Took #366's next-leverage (a) — media-query text
normalization — then followed the sibling files the `css-conditional` realm opened.
All pure-JS, all `bootstrap.js`.

## The gap

Scrolls #343–#345 made `MediaList` a real interface and `@import` a real rule, and
#361–#366 built out the nesting/grouping CSSOM. But the `@media`/`@supports`
condition surface itself was still rough:

- **`_makeMediaList` never serialized its queries.** It split the text on commas,
  trimmed, and stored the raw fragments. `@media spEech {}` kept `spEech`;
  `@media all and (color) {}` kept the redundant `all and`; `@media screen and
  (cOLor) {}` kept the wrong-case feature name. CSSOM §serialize-a-media-query
  requires all three normalized.
- **The conditional-rule interfaces failed WebIDL.** `CSSConditionRule`,
  `CSSMediaRule`, `CSSSupportsRule` were exposed as enumerable globals; their
  interface objects were author-constructible with `.length === 1`; their
  prototype getters didn't brand-check (reading `media` on the prototype returned
  `undefined` instead of throwing); there was no `matches` attribute (CSS
  Conditional 4) and no `Symbol.toStringTag`; the attribute accessors were
  non-enumerable (ES class getters are), when WebIDL requires them enumerable;
  `conditionText` had a setter it shouldn't; and `CSS.supports` had `.length === 2`
  (the WebIDL overload minimum is 1).
- **`CSSSupportsRule.matches` didn't exist**, so a script could not feature-detect
  through a live rule at all.

## The work (one commit, three quests)

### #367 — media-query serialization (`serialize-media-rule` 9→12)
New `_serMediaQuery(raw)` implements CSSOM §serialize-a-media-query:

- A **paren-depth-aware tokenizer** (`_tokenizeMQ`) splits a single query into
  top-level tokens — bare idents and parenthesized groups — so `(max-width: 0px)`
  stays ONE token including its internal space.
- Lowercase a leading `not`/`only` **modifier**, then the **media type** ident
  (unknown types like `projection` are kept, just lowercased), then each **feature
  name** — the leading ident inside a `(…)` via `_lcMediaFeature` — while the value
  text (`480px`, `#foo`) is preserved verbatim.
- Drop a redundant non-negated `all and`: `all and (color)` → `(color)`, but a bare
  `all` (no features) and a negated `not all` / `not all and (color)` are kept.
- Re-join with single spaces and ` and `. `_splitMediaText` centralizes the
  comma-split-and-map; the `mediaText` setter and `appendMedium` route through it
  too (so appended media are normalized and deduped consistently).

`matchMedia` echoes its raw argument (a separate stub) and does NOT use
`_makeMediaList`, so `mediaquery-sort-dedup` (no sorting / no dedup) is unaffected.

### #368 — CSSConditionRule/CSSMediaRule/CSSSupportsRule WebIDL (`idlharness` 30→45)
A cluster of WebIDL conformance fixes:

- **`_exposeIface(name, ctor)`** — defines the interface global as a data property
  that is writable + configurable but **non-enumerable** (a plain assignment is
  enumerable, which idlharness flags). Applied to all four rule interfaces.
- **Non-author-constructible.** A module-level `_allowCssCondCtor` flag guards the
  shared `CSSConditionRule` constructor: author `new CSSMediaRule()` chains through
  `super()` → `CSSConditionRule` → sees the flag off → throws "Illegal
  constructor"; `_makeRule` flips the flag on around its internal construction. The
  constructors use `...args` (not a named `condition`) so the interface-object
  `.length` is 0.
- **Brand-checked getters.** `media`, `conditionText`, and `matches` throw a
  TypeError when read on the prototype (or any non-instance) via `this instanceof
  …` — `Ctor.prototype instanceof Ctor` is false, real instances are true.
- **The `matches` attribute** (CSS Conditional 4) added to both `CSSMediaRule` and
  `CSSSupportsRule` (a real evaluation for supports in #369; a conservative stub
  for media, since Obscura has no viewport engine — matchMedia likewise reports
  `matches: false`).
- **`Symbol.toStringTag`** → `[object CSSMediaRule]` / `[object CSSSupportsRule]`.
- **`_enumAccessors(proto, ...names)`** re-stamps the named accessors ENUMERABLE
  (preserving get/set) after class definition — ES `class get x()` accessors are
  non-enumerable, but WebIDL regular attributes must be enumerable own accessors on
  the prototype.
- **`conditionText` made readonly** (setter removed — CSS Conditional 4; no internal
  code assigned it).
- **`CSS.supports` arity** — signature changed to `supports(prop)` reading the second
  argument via `arguments[1]`, so `.length === 1` (the minimum across the
  `(property, value)` and `(conditionText)` overloads).

### #369 — real `CSSSupportsRule.matches` (`at-supports-matches` 0→2)
`_evalSupportsCondition(text)` evaluates a `<supports-condition>` (CSS Conditional
§3) to a boolean:

- Paren-depth-aware tokenize into top-level parts: keywords (`not`/`and`/`or`),
  parenthesized groups, and functional operands (`selector(…)`).
- `not X` → `!eval(X)`; `A and B …` / `A or B …` compose; **mixing `and` with `or`
  at one level → false** (a parse error).
- An operand that is a group is: a nested condition (recurse) when it starts with
  `(` / `not` / `selector(`; else a `( <declaration> )` — strip parens, split on the
  first `:`, and defer to `CSS.supports(prop, value)`. A `selector(…)` operand runs
  the selector parser (forgiving-flag aware, like the existing `CSS.supports`
  selector query). Anything unrecognized is general-enclosed → false.

Wired into `CSSSupportsRule.matches` (replacing the #368 stub) and into one-arg
`CSS.supports("(color: green)")` / `"not (x:y)"` / `"(a:b) and (c:d)"` — only for
`(`/`not`-leading inputs the old bare `property:value` split mishandled, so it is a
strict improvement.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `css/cssom/serialize-media-rule.html` | 9/12 | **12/12** ✅ |
| `css/css-conditional/idlharness.html` | 30/45 | **45/45** ✅ |
| `css/css-conditional/at-supports-matches.html` | 0/2 | **2/2** ✅ |

**ZERO regressions — STASH-PROVED** (built the pre-change binary and measured):
`idlharness` 30/45 → 45 GAIN, `serialize-media-rule` 9/12 → 12 GAIN,
`at-supports-matches` 0/2 → 2 GAIN, and `at-supports-named-feature-001` 5/6
IDENTICAL before and after (its 1 fail is a layout capability —
anchor-position-follows-transforms — not a regression). Held baselines all matched:
`at-supports-whitespace` 16/16, MediaList 1/1, mediaquery-sort-dedup 2/2,
cssimportrule 11/11, CSSStyleSheet 17/17, serialize-values 696/697,
shorthand-serialization 6/7, cssom-setProperty-shorthand 76/76, css-nesting
parsing 32/32 + cssom 12/14 + nested-declarations-cssom 12/12 +
serialize-group-rules-with-decls 15/15, all-shorthand 27/27,
CSSStyleRule-set-selectorText 82/82, CSSKeyframesRule 2/2, qsa 1975, classlist 1420,
createElement 147.

## Caps (honest)

- **`at-supports-named-feature-001` 5/6** — the last subtest measures whether anchor
  positioning follows transforms via real geometry; a layout capability, not a
  CSSOM gap.
- **at-supports-selector / at-supports-content families** — reftests, `.xht`, or
  stale wpt.live paths (could-not-run); not conformance-harness winnable here.
- **`CSSMediaRule.matches`** returns a conservative `false` — Obscura has no
  viewport/media evaluation engine (consistent with the matchMedia stub). No test
  in this realm asserts its value; the type is correct.

## Next leverage

- (a) A fresh `css/*/parsing/` dir — the mature value realms are mined out; scout a
  whole-feature 0/N file.
- (b) `CSSMediaRule` / `CSSContainerRule` object-model files if a winnable pure-JS
  vein exists (the WebIDL scaffolding from #368 is now reusable).

**Reusable:** `_serMediaQuery` (CSSOM serialize-a-media-query), `_exposeIface`
(non-enumerable interface global), `_enumAccessors` (re-stamp class getters
enumerable per WebIDL), the `_allowCssCondCtor` construction-guard pattern (author
`new` throws while internal build passes), `_evalSupportsCondition` (a
`<supports-condition>` boolean evaluator).
