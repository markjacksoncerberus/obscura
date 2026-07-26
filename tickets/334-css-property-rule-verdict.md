# 🎛️ The Property-Rule Verdict — Quests #334–#336

> Realm: `css/css-properties-values-api/` — `CSS.registerProperty` + the `@property`
> at-rule (→ `CSSPropertyRule`).
> Banner: the `@property` syntax-string parser + registered-value matcher + the
> `CSSPropertyRule` CSSOM primitive. **+282, ONE commit, ZERO regressions.**

## The gap

Obscura had **no** CSS Properties & Values API at all — `CSS.registerProperty` was
undefined and `@property` fell through to a bare `CSSGenericRule`. Everything in the
realm hinges on one engine: parse a `syntax` string into a grammar, then validate a
value (an `initialValue`) against it (including "computational independence" — no
font-relative units, no `var()`).

Baselines (all `--stealth`, `wpt.live`):

| File | Before |
|------|:------:|
| `register-property-syntax-parsing` | 0/246 |
| `at-property-cssom` | 7/40 |
| `register-property` | 2/6 |

## The work — 3 quests, 1 commit

A single self-contained engine (all JS, no Rust) behind both `CSS.registerProperty`
and the `@property` at-rule, plus a typed CSSOM rule class (the same primitive template
as `CSSPageRule`/`CSSFontFaceRule`).

### #334 — the syntax-string parser + `CSS.registerProperty` primitive + universal/ident/numeric matching
- `_parsePropSyntax(str)` → `null` (invalid), `{ universal:true }` (`*`), or
  `{ components:[{kind,name|ident,mult}] }`. Whitespace around the whole string and
  between `|`-alternatives is allowed; a component is `<type>` (a **known lowercase**
  data-type name — `<Number>`/`<banana>`/`< length>`/`<\6c ength>` all reject) or a
  single `<custom-ident>` keyword (escapes/`--`/non-ASCII via `_GRID_CI_RE`, but not a
  CSS-wide keyword or `default`). A trailing `+`/`#` multiplier; `<transform-list>` is
  pre-multiplied so it may carry **no** multiplier. `*` is valid only as the *sole*
  syntax (`*+`, `<length>|*`, `*|banana` reject).
- `_isValidDeclValue` — the universal `*` value grammar: balanced brackets, no
  bad-string (newline inside a string), no bad-url (`url(moo '')`), no top-level `;`
  or `!`; auto-closes unmatched opening brackets/strings at EOF.
- `CSS.registerProperty(def)` throws a **SyntaxError** DOMException on every validity
  failure (the `test_initial_value_invalid` contract).

### #335 — the full typed value matcher (all data types + multipliers + computational independence)
- `_propMatchType(type, part)` for every type: `<length>`/`<length-percentage>`
  (bare `0` OK; font-relative units rejected — `10em`/`calc(4px+3em)` invalid, `10vmin`
  valid — via `_PROP_FONTREL_UNITS` + `_hasFontRelUnit`), `<percentage>`, `<number>`,
  `<integer>` (literal `/^[+-]?\d+$/`; a `calc()` may round), `<angle>`/`<time>`
  (unit required — angle `0` invalid), `<resolution>` (non-negative), `<color>`
  (`_isValidColor`), `<image>` (`_propMatchImage`: url/gradient/image-set/cross-fade/
  `light-dark`), `<url>`, `<custom-ident>`, `<string>` (`_propMatchString` — closed or
  EOF-auto-closed), `<transform-function>` (single), `<transform-list>`
  (`_isValidTransform`). Math via the existing `_mathValid` + the `_MATH_UNIT_TYPE`
  table.
- `_propMatchComponent` applies the multiplier: `+` → string-aware whitespace split
  (`_wsTokens`), `#` → string-aware comma split (`_splitCommasTopLevel`), each part
  matched independently. Comments stripped (string-aware `_stripCssComments`) before
  matching; the universal path validates the **untrimmed** value so a newline right
  after an opening quote is caught as a bad-string. This completed
  `register-property-syntax-parsing` → **246/246**.

### #336 — the `@property` at-rule → `CSSPropertyRule` + registerProperty WebIDL arg-validation
- `@property NAME { … }` routes to `type:'property'` in `_cssParseRuleList` (validated
  by `_validatePropertyRule`; **invalid rules are dropped**, so `find_at_property_rule`
  returns null) + a `CSSPropertyRule` branch in `_makeRule`.
- `CSSPropertyRule` (css-properties-values-api §CSSOM): read-only `.name` (unescaped
  `--foo`), `.syntax` (the string **verbatim**, incl. surrounding whitespace — unquoted
  via `_unescapeCssIdent`), `.inherits` (boolean), `.initialValue` (authored text or
  `null`), `.type === 0`, and `.cssText` (`@property NAME { syntax: "…"; inherits: X;
  initial-value: Y; }`, name via `_serializeCssIdent`, syntax via `_serCssString`).
  Rule validity: name is a dashed-ident, `syntax` + `inherits` required, `initial-value`
  required unless the syntax is universal. `at-property-cssom` 7→**40**.
- WebIDL arg-validation on `CSS.registerProperty` (bonus, `register-property` 2→**5**):
  a non-object argument or a missing required member (`name`/`inherits`) is a
  **TypeError**; `syntax` defaults to `"*"`; a `<custom-property-name>` need only begin
  with `--` (need not be a full ident — `--a, b` and `['--name',3]` are valid names);
  a re-registered name throws **InvalidModificationError**.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `register-property-syntax-parsing` | 0/246 | **246/246** |
| `at-property-cssom` | 7/40 | **40/40** |
| `register-property` | 2/6 | **5/6** |

**+282, ZERO regressions.** Held: qsa 1975, classlist 1420, createElement 147,
cssom-pagerule 22, cssom-fontfacerule 1, CSSFontFaceRule 1, font-palette-values-valid
36 + -invalid 27, serialize-values 695/697, CSSStyleRule-set-selectorText 82,
CSSGroupingRule-insertRule 7/7, size-valid 15, keyframes-name-invalid 20,
font-family-valid 11, transform-valid 42, color-valid 17. Stash-proved
CSSKeyframesRule 0/2 + cssimportrule 3/11 are pre-existing.

## Caps / Next

- **CAP:** the `register-property` transition subtest + all of `registered-property-cssom`
  (5 fails) and `register-property-computation` (0/75) need the registry wired into the
  **cascade / getComputedStyle** — a registered property must canonicalize its computed
  value (`red`→`rgb(255,0,0)`, an out-of-syntax value → the unset/guaranteed-invalid
  value). `_registeredProps` records the registration but does NOT yet feed
  computed-style; that is the next (bigger, layout-adjacent) quest for this realm.
- **NEXT LEVERAGE:** either (a) wire `_registeredProps` into computed-style to crack
  `registered-property-cssom`/`-computation`, or (b) the `@counter-style` at-rule family
  (`CSSCounterStyleRule` + descriptors — the SAME typed-at-rule template as `@property`/
  `@page`/`@font-face`), or (c) scout a fresh `css/*/parsing/` dir. Reusable: the whole
  `@property` engine (`_parsePropSyntax`, `_propMatchType`/`_propMatchComponent`,
  `_isValidDeclValue`, `_matchDim`+`_MATH_UNIT_TYPE`, `_stripCssComments`,
  `_PROP_FONTREL_UNITS`+`_hasFontRelUnit`), the `CSSPropertyRule`/`_validatePropertyRule`
  typed-rule template.
