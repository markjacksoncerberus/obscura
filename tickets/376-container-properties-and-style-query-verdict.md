# 🏳️‍⚧️⚔️ Quest #376–#378 — The `@container` Property Family & `style()`-Query Serialization Verdict

> *Session 2026-07-27. Took #375's next-leverage (a): the `style()` container-query
> family. Scouting the whole `css/css-conditional/container-queries/` directory turned
> up a fat pure-parse vein alongside it — the `container-*` **properties**, registered
> as known but validating NOTHING. Three quests, one commit, +89, zero regressions.*

## The gap

`css/css-conditional/container-queries/` had four winnable-without-a-cascade files:

| File | Before | After | What was wrong |
|------|:------:|:-----:|----------------|
| `container-type-parsing.html` | 7/30 | **30/30** | `container-type` accepted ANY value |
| `container-name-parsing.html` | 12/30 | **29/29** | `container-name` accepted ANY value |
| `container-parsing.html` | 16/48 | **48/48** | `container` shorthand unmodelled (stored raw) |
| `at-container-style-serialization.html` | CNR | **17/17** | `style()` query `conditionText` not normalized |

`container-type`/`container-name`/`container` had been added to `_CSS_KNOWN_PROPS` back in
#373 (to unblock `CSS.supports("container-type:size")`) but with **no grammar** — so
`container-type: foo`, `container-name: none none`, `container: 10px / inline-size` all
"set" the property. And `at-container-style-serialization` was could-not-run because its
`setup()` gate (`assert_implements_style_container_queries()`) requires
`@container STYLE(--foo: bar)` to serialize its `containerQuery` as `style(--foo: bar)`
AND all 17 `@container style(…)` rules to be kept.

## The work (all `crates/obscura-js/js/bootstrap.js`, one commit)

### #376 — the `container-type` + `container-name` longhands (+40)

Both grammars are pure specified-value parse/serialize (no cascade):

- **`_canonContainerType`** — `normal | [ [ size | inline-size ] || scroll-state ]`.
  `normal` stands alone; the `||` allows one size keyword and one `scroll-state`, each at
  most once; canonical serialization is size-then-scroll-state. Invalid (`none`, `auto`,
  `block-size`, `size inline-size`, `style`, …) → ignore.
- **`_canonContainerName`** — `none | <custom-ident>+`. `none` stands alone (case-folded);
  otherwise one or more space-separated non-reserved `<custom-ident>`s. Reserved-as-ident:
  the query combinators `and`/`or`/`not` (case-insensitive — `Not`/`aNd`/`oR` all invalid),
  `none`, `default`, and the CSS-wide keywords; strings/`#fff`/`1px` fail `<custom-ident>`;
  `auto`/`normal` are ordinary valid names; escapes like `\!escaped` survive. Joined
  single-spaced with each ident's authored case preserved.

Wired into BOTH declaration paths — the `CSSStyleDeclaration.setProperty` else-if
validator chain (next to `_POSITION_PROPS`/`_CSSUI_VALIDATED`) and the rule-style
`_parseStyleDecls` parser (next to `flex-flow`). Invalid → ignore / drop.

### #377 — the `container` shorthand (+32)

`container = <'container-name'> [ '/' <'container-type'> ]?`. Modelled exactly like
`flex-flow` (expand-to-longhands, no shorthand key kept):

- **`_expandContainerShorthand`** splits on the first top-level `/` (name before, type
  after; no `/` → type defaults to `normal`), validates each half, returns
  `{container-name, container-type}` or null.
- **`setProperty`** stores the two longhands (a CSS-wide keyword / `var()` is kept as one
  `container` blob key instead); **`removeProperty`** clears both; **`getPropertyValue`**
  reconstructs via **`_serContainerShorthand`** — `<name>` when the type is the initial
  `normal`, else `<name> / <type>`. So `none / normal`→`none`, `FOO/size`→`FOO / size`,
  `  FOO  /size`→`FOO / size`, and invalids (`none none`, `10px / inline-size`,
  `size 1 / name`, `none / block-size`, …) → ignore.

### #378 — `style()`-query serialization (+17)

New **`_serStyleQuery`** serializes the interior of `style(…)` — a `<style-query>`: a bare
`<style-feature>` or a boolean (`and`/`or`/`not`) of `<style-in-parens>`. It:

- **Preserves parenthesis nesting** and strips insignificant whitespace
  (`( (  (( (--foo )) )  ))` → `((((((--foo))))))`).
- **Lowercases** the boolean combinators and the `style` function name
  (`STyle`/`OR` → `style`/`or`).
- **Normalizes a recognized `<style-feature>`** (`_isStyleFeature`: a declaration on a
  custom property or a KNOWN standard property, or a `<style-range>` comparison) via
  **`_serStyleFeature`** — `name: value` with a single space after the colon,
  custom-property NAMES and VALUES kept verbatim (`--FOO: BAR` stays, `--foo: bar   baz`
  keeps its inner spaces, `--foo:2.100` stays `2.100`), an empty value → `name: `, range
  operators `<`/`<=`/`=`/`>`/`>=` single-spaced (`100px  > --\{foo >10px` →
  `100px > --\{foo > 10px`).
- **Keeps an unknown-property `<general-enclosed>` exactly as authored** — `( prop: val  )`
  stays `( prop: val  )` (leading/trailing spaces and all), because `prop` is neither a
  custom nor a known property.

Helpers: `_topLevelColon` / `_hasTopLevelCompare` (paren- and escape-aware scanners),
`_styleQueryIsBoolean`, `_serStyleInParens`.

**The subtle bug:** the missing 17th rule. `@container style (--foo: bar)` — with a **space**
before `(` — is *not* the `style()` function; it's container-name `style` + query
`(--foo: bar)`. The old `/^style\s*\(/i` regex (in `_parseOneContainerCondition` and
`_isValidContainerConditionList`) matched the space and mis-parsed it as the function,
whose interior `--foo: bar` then failed `_isValidContainerQuery` → the rule was dropped,
so the sheet had 16 rules and `setup()` failed. Tightening to `/^style\(/i` (function `(`
must be immediate) restored it: name `style`, query `(--foo: bar)`, `conditionText`
`style (--foo: bar)`.

## Results

| File | Before → After |
|------|:--------------:|
| `container-type-parsing.html` | 7 → **30/30** |
| `container-name-parsing.html` | 12 → **29/29** |
| `container-parsing.html` | 16 → **48/48** |
| `at-container-style-serialization.html` | CNR → **17/17** |
| **Total** | **+89** |

## Zero-regression sweep

Held, all matched: `at-container-parsing` 66/117, `at-container-serialization` 19/19,
`container-rule-cssom` 8/8, `container-queries/idlharness` 28/28, `css-conditional/idlharness`
45/45, `serialize-media-rule` 12/12, `cssom-setProperty-shorthand` 76/76, `serialize-values`
696/697, `register-property-syntax-parsing` 246/246, `shorthand-serialization` 6/7,
`flex-flow-shorthand` 6/6, `css-nesting/cssom` 12/14, `nested-declarations-cssom` 12/12,
`css-cascade/idlharness` 34/34, qsa 1975, classlist 1420, createElement 147.

`css/cssom/all-shorthand.html` read could-not-run — but `curl` confirms wpt.live is
transiently 404ing that path (a 42-byte error body reads as a harness-did-not-load). Not a
regression: my changes are additive `container`/`container-type`/`container-name`-only
branches, and `flex-flow-shorthand` 6/6 proves the parser edits adjacent to `flex-flow`
are clean.

## Caps (the wall) & next leverage

- **CAP — `at-container-style-parsing` stays 6/41.** Its 35 `test_cq_condition_known`
  subtests assert a computed `--match` from a really-evaluated `(cond) or (not (cond))`
  container query (a tautology that only lights up once the cascade *matches* the
  container). That's the Rust cascade + container-query matching through layout — the same
  wall as `at-container-parsing`'s 51 and `@media`/`@supports` `matches`. The 6 `unknown`
  cases already pass.
- **CAP — the rest of `container-queries/*`** (~200 files) are size/layout/paint reftests
  or `-computed`/`-invalidation` tests that need the same cascade + layout engine.

**NEXT LEVERAGE:**
1. **A fresh whole-feature `idlharness`/`cssom`/`parsing` dir at 0/N.** The three templates
   are now mature: (a) the WebIDL non-author-constructible interface pattern
   (`_exposeIface`/`_enumAccessors`/`_allowCssCondCtor`); (b) the typed at-rule/rule
   primitive (`_cssParseRuleList` prelude branch + `_makeRule` branch + descriptor-accessor
   class); (c) the property grammar + shorthand expand/reconstruct pattern (this quest).
   Scout with the GitHub contents API and **curl-verify every wpt.live path** (⅓ of guesses
   404; a 404 body is 42 bytes → reads as could-not-run).
2. The container-queries realm's remaining wins all need the Rust cascade — the wall.

**Reusable this session:** `_canonContainerType`/`_canonContainerName`/
`_expandContainerShorthand`/`_serContainerShorthand` (property grammar + shorthand
expand-to-longhands + canonical reconstruct); `_serStyleQuery`/`_serStyleFeature`/
`_isStyleFeature`/`_topLevelColon`/`_hasTopLevelCompare` (`style()`-query serialization,
paren/escape-aware).
