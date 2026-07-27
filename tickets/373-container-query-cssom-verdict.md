# 🏳️ The Container-Query CSSOM Verdict — Quests #373–#375

> *CSS Conditional 5 CSSOM object model — the `@container` rule, its `CSSContainerRule`
> interface, container-query serialization, and at-rule validity.
> `css/css-conditional/container-queries/container-rule-cssom.html` **0→8**,
> `idlharness.html` **2→28**, `at-container-serialization.html` **CNR→19**,
> `at-container-parsing.html` **CNR→66**. **+119, ONE commit, ZERO regressions.***

Session 2026-07-27. Took #372's next-leverage (b) — "`CSSContainerRule`/`@container`
object-model (curl-verify the real paths first)." The scout paths were stale (`css/
css-contain/container-queries/` 404s); the real dir is
**`css/css-conditional/container-queries/`**. There, `@container` was mis-modelled:
the parser routed it through the group-rule fallback to a **`CSSMediaRule`** — the
wrong class, with no `containerName`/`containerQuery`/`conditions` — and it wrongly
kept *every* prelude (no validity). So `container-rule-cssom` / `idlharness` sat at
0/8 and 2/28, and the two parsing/serialization files were **could-not-run**: their
`assert_implements_size_container_queries()` setup asserts `CSS.supports("container-
type:size")`, which was false.

This is the classic "one primitive unlocks a whole feature" shape, and pure-JS (CSSOM
structure + WebIDL surface + text serialization, no layout). It reuses the
`CSSMediaRule`/`CSSSupportsRule` at-rule template and #368/#371's WebIDL scaffolding.

## The gap (baseline)

| File | Before | Cause |
|------|:------:|-------|
| `container-rule-cssom.html` | 0/8 | `@container` → `CSSMediaRule`; no `containerName`/`containerQuery`/`conditions` |
| `idlharness.html` | 2/28 | interfaces `CSSContainerRule`, `CSSSupportsConditionRule` both missing |
| `at-container-serialization.html` | CNR | setup gate: `CSS.supports("container-type:size")` false; no `conditionText` serialization |
| `at-container-parsing.html` | CNR | setup gate false; `@container` never dropped an invalid prelude |

The css-conditional-5 WebIDL that `idlharness` pulls:
```webidl
dictionary CSSContainerCondition { required CSSOMString name; required CSSOMString query; };
[Exposed=Window] interface CSSContainerRule : CSSConditionRule {
  readonly attribute CSSOMString containerName;
  readonly attribute CSSOMString containerQuery;
  readonly attribute FrozenArray<CSSContainerCondition> conditions;
};
[Exposed=Window] interface CSSSupportsConditionRule : CSSGroupingRule {
  readonly attribute CSSOMString name;
};
```

## The work (all `crates/obscura-js/js/bootstrap.js`)

### #373 — the `CSSContainerRule` primitive + container-* property recognition
- **The class.** `class CSSContainerRule extends CSSConditionRule` — `containerName`
  and `containerQuery` (both `''` when the rule carries a comma-separated condition
  list, per spec — a single condition's name/query otherwise), a `conditions`
  FrozenArray of frozen `{name, query}` dictionaries (fresh each read), a
  `conditionText` that reserializes the list, and a `cssText` of `@container ` +
  conditionText + `_serializeGroupBlock(this)`. Brand-checked getters (TypeError on
  the prototype). `_makeRule` routes `desc.type === 'group' && desc.name === 'container'`
  to it (before the `CSSMediaRule` fallback).
- **Prelude parse.** `_parseContainerConditions` → `_splitTopLevelCommas` (paren/
  string/escape-aware) → `_parseOneContainerCondition`: a leading token that isn't
  `(`, `style(`, or the `not` combinator is peeled off as the `<container-name>`; the
  remainder (if any) is the query, serialized via `_serContainerQuery`.
- **The setup gate.** `container-type`/`container-name`/`container` added to
  `_CSS_KNOWN_PROPS` so `CSS.supports("container-type:size")` is true (unblocks the two
  parsing/serialization files' `setup()`).

### #374 — WebIDL for the css-conditional-5 interfaces
- `CSSContainerRule` exposed NON-enumerable (`_exposeIface`); non-author-constructible
  (it chains through the `_allowCssCondCtor`-guarded `CSSConditionRule` ctor via
  `super()`, so author `new` throws but `_makeRule` builds internally) with interface-
  object `.length` 0 (`...args`); `Symbol.toStringTag`; accessors re-stamped ENUMERABLE
  (`_enumAccessors` — ES class getters are non-enumerable); proto chain
  `CSSContainerRule`→`CSSConditionRule`→`CSSGroupingRule`→`CSSRule`.
- **`CSSSupportsConditionRule`.** The css-conditional-5 IDL also declares this grouping
  interface (`.name`). No Obscura object builds one yet, but the interface must EXIST
  (idlharness checks its object, prototype chain, and `name` attribute), so it's a
  `class … extends CSSGroupingRule` exposed the same way. Non-author-constructible.

### #375 — container-query serialization + `@container` validity
- **Serialization.** `_serContainerQuery` normalizes a `<container-query>`: tokenize
  at the top level (`_tokenizeContainerQuery`, paren-aware), then per token —
  recurse into `(…)` (a nested condition when it contains a paren/combinator, else a
  size feature via `_serContainerFeature`), lowercase a `style(` function name (inner
  style query kept as-authored), lowercase bare combinators, leave other
  `<general-enclosed>` verbatim. `_serContainerFeature` lowercases the feature name,
  emits `feature: value` for `<mf-plain>`, and puts single spaces around the range
  comparators (`<`/`<=`/`=`/`>`/`>=`) — values (`calc(1em + 1px)`, `max(10em, 10px)`)
  preserved verbatim by paren-aware operator scanning. Conditions joined by `, `.
- **Validity.** `_isValidContainerConditionList` (gated into both `_cssParseRuleList`
  and `_buildNestedItems`, `container`-only) drops an invalid `@container`:
  - `_isValidContainerName` — a `<custom-ident>` (allowing `--foo`/escaped `\!-name`)
    that isn't reserved (`none`/`and`/`or`/`not`/`default` + the CSS-wide keywords;
    `normal`/`auto` ARE valid names here).
  - `_isValidContainerQuery` — `not <one q-in-parens>` OR a `<q-in-parens>` combined
    via `and`/`or`; each operand must be a parenthesized/functional token (a bare
    media-type ident like `screen`/`print` at operand position → invalid). Inner
    size-feature known/unknown validity is NOT judged (both parse).

## Results

| File | Before | After |
|------|:------:|:-----:|
| `container-rule-cssom.html` | 0/8 | **8/8** ✅ |
| `idlharness.html` | 2/28 | **28/28** ✅ |
| `at-container-serialization.html` | CNR | **19/19** ✅ |
| `at-container-parsing.html` | CNR | **66/117** 🔶 |

**+119 subtests, ONE commit, ZERO regressions.**

## Zero-regression sweep

css-conditional/idlharness 45/45 · at-supports-matches 2/2 · serialize-media-rule
12/12 · css-cascade/idlharness 34/34 · layer-rules-cssom 9/9 · css-nesting/cssom
12/14 (held) · nested-declarations-cssom 12/12 · CSSGroupingRule-insertRule 7/7 ·
CSSGroupingRule-cssRules 1/1 · cssimportrule 11/11 · register-property-syntax-parsing
246/246 · serialize-values 696/697 (held cap) · cssstyledeclaration-csstext 11/11 ·
qsa 1975/1975 · classlist 1420/1420 · createElement 147/147. **All held.**

## Caps / Next

- **CAP (the wall):** `at-container-parsing`'s 51 remaining `test_cq_condition_valid`
  subtests assert a computed `--match` value from an *actually-evaluated* container
  query (`@container name (cond) or (not (cond)) { main { --match:true } }` must apply
  to `#cq-main`). That needs the Rust cascade + real container-query matching through
  layout — the same wall as `@media`/`@supports` `matches` and `layer-basic`. Not
  winnable in pure JS.
- **Also could-not-run for us (unwinnable):** the ~200 other `container-queries/*`
  files are size/layout/paint reftests and dynamic-invalidation harnesses (real
  container evaluation).
- **NEXT LEVERAGE:**
  - (a) **`at-container-style-parsing` / `at-container-style-serialization`** — the
    `style()` container-query family. Baseline first: `style(--x: y)` conditions parse
    into our model already, but the style-query *validity* + serialization (`style()`
    normalization) is unbuilt. Curl-verify + measure before committing.
  - (b) A fresh whole-feature `css/*/*/idlharness.html` or `*/cssom.html` at 0/N — the
    WebIDL + at-rule-primitive template (`_exposeIface`/`_enumAccessors`/
    `_allowCssCondCtor` + a `_cssParseRuleList` branch + a class with descriptor
    accessors) is now very mature and ports in ~one session. Scout with the GitHub
    contents API and curl-verify every wpt.live path (⅓ of guessed paths 404).

Reusable this session: `_splitTopLevelCommas`, `_tokenizeContainerQuery`,
`_serContainerQuery`/`_serContainerFeature`, `_isValidContainerName`/
`_isValidContainerQuery`, and the non-author-constructible-condition-rule pattern.
