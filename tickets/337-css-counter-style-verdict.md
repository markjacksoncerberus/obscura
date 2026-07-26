# 🎖️ Scroll #337–#339 — The Counter-Style Verdict

> *Realm:* `css/css-counter-styles/counter-style-at-rule/` (the `@counter-style`
> at-rule descriptor grammars) + the `CSSCounterStyleRule` CSSOM primitive.
> *Banner drawn:* 2026-07-26. *Result:* **+110, three quests, ONE commit, zero regressions.**

## The gap

Obscura had **no** `@counter-style` support. An `@counter-style foo { … }` rule fell
through `_cssParseRuleList`'s `else` branch to a bare `CSSGenericRule` — no `.name`,
no descriptor accessors, `constructor.name === 'CSSGenericRule'`. Every parsing test
in the realm reads `style.sheet.cssRules[0]`, asserts `rule.constructor.name ===
'CSSCounterStyleRule'`, then checks `rule.cssText` contains (valid) / lacks (invalid)
the descriptor under test — so all nine `*-syntax` files sat at **0**:

| File | Before |
|------|:------:|
| `name-syntax` | 0/17 |
| `system-syntax` | 0/16 |
| `symbols-syntax` | 0/11 |
| `negative-syntax` | 0/3 |
| `prefix-suffix-syntax` | 0/26 |
| `pad-syntax` | 0/9 |
| `additive-symbols-syntax` | 0/8 |
| `range-syntax` | 0/8 |
| `speak-as-syntax` | 0/12 |

The whole realm hinges on one primitive: a `CSSCounterStyleRule` whose declaration
block round-trips through named descriptor accessors, each canonicalized by its
grammar — the SAME typed-at-rule template as `@page` (#328) / `@font-face` (#331) /
`@property` (#334). All JS, no Rust.

## The work (three quests, one commit)

### #337 — the `CSSCounterStyleRule` primitive + name grammar + `system` descriptor
- **Name gating.** `_isValidCounterStyleName` — a `<counter-style-name>` is a
  `<custom-ident>` (`_GRID_CI_RE`) that is not a CSS-wide keyword / `default` / `none`,
  and not one of the six predefined non-overridable styles
  (`decimal`/`disc`/`square`/`circle`/`disclosure-open`/`disclosure-closed`,
  `_CS_PREDEFINED_INVALID`). An invalid name drops the whole at-rule in
  `_cssParseRuleList` (like `@keyframes`/`@font-palette-values`). → `name-syntax` 17/17.
- **The rule class.** `CSSCounterStyleRule extends CSSRule` — readonly `.name`
  (unescaped), a getter/setter per descriptor, `.type === 11`
  (`COUNTER_STYLE_RULE`), and a `.cssText` that serializes the kept descriptors in a
  fixed canonical order. Descriptors are applied in source order via `_fpvSplitDecls`
  (reused from `@font-palette-values`), last-valid-wins, invalid dropped. Wired into
  `_cssParseRuleList` (`type: 'counter-style'`) + `_makeRule`.
- **`system`** = `cyclic | numeric | alphabetic | symbolic | additive | [fixed
  <integer>?] | [extends <counter-style-name>]` (`_csCanonSystem`). `fixed` takes an
  optional `<integer>`; `extends` requires a valid `<counter-style-name>` (so `extends
  none`/`extends initial` reject). → `system-syntax` 16/16.

### #338 — the `<symbol>`-based descriptors
Built one `<symbol>` primitive and shared it across five descriptors. `_csCanonSymbol`
= `<string>` (verbatim, via `_propMatchString`) | `<custom-ident>` (verbatim, via
`_propMatchType('custom-ident', …)` so CSS-wide keywords/`default` reject) | `<image>`
(canonicalized — `url(x)` → `url("x")`, gradients/image-set via
`_canonImageSet(_canonGradients(…))`).
- **`symbols`** = `<symbol>+` (`_csCanonSymbols`, whitespace-split via `_wsTokens`). → 11/11.
- **`negative`** = `<symbol> <symbol>?` (1–2). → 3/3.
- **`prefix`/`suffix`** = `<symbol>` (exactly one — `_csCanonSymbol` itself). → 26/26.
- **`pad`** = `<integer [0,∞]> && <symbol>` (either order, serialized int-first;
  `"X" 10` → `10 "X"`). → 9/9.
- **`additive-symbols`** = `[<integer [0,∞]> && <symbol>]#` with **strictly
  decreasing** weights (`1 "I", 5 "V"` and `1 "X", 1 "Y"` reject). → 8/8.

### #339 — `range` + `speak-as`
- **`range`** = `[[<integer> | infinite]{2}]# | auto` (`_csCanonRange`), each pair's
  lower bound not exceeding its upper — `infinite` is −∞ as the lower slot, +∞ as the
  upper, so `0 -1` (lower > upper) rejects while `infinite 0` / `0 infinite` pass. → 8/8.
- **`speak-as`** = `auto | bullets | numbers | words | spell-out |
  <counter-style-name>` (`_csCanonSpeakAs`) — a keyword wins, else a valid
  counter-style-name (`spellout` is a name; `none`/`initial` reject). → 12/12.

`fallback` = `<counter-style-name>` was implemented alongside (accessor + setter) for
the CSSOM interface, though its own parsing test is a reftest.

## Results

**+110** — all nine `*-syntax` files 0 → 100%. ONE commit, all JS.

## Zero-regression sweep

qsa 1975, cssom-pagerule 22, register-property-syntax-parsing 246, at-property-cssom
40, size-valid 15, keyframes-name-invalid 20, font-palette-values-valid 36 + -invalid
27, serialize-values 695/697 (pre-existing 2). No path I touched
(`_cssParseRuleList`/`_makeRule` gained a branch; everything else is new symbols) fed
an existing green.

## Caps / Next

- **CAP — the `cssom/*-setter*.html` and `system-*-invalid` / `descriptor-*` files
  are rendering REFTESTS** (each has a `-ref.html`); they could-not-run for us (no
  testharness). The setter accessors are implemented and correct, but these tests
  assert rendered glyph output — LAYOUT-capped, not winnable here. The named-style
  reftests (`arabic-indic` … `trad-chinese-formal`, ~40 dirs) are likewise the
  layout implementation of counter styles, out of scope.
- **CAP — `descriptor-calc`** (calc in `pad`/`range` integer slots) is a reftest;
  the syntax tests use only literal integers, so `_csIntNonNeg`/`_csCanonRange` stay
  literal-only.
- **NEXT LEVERAGE:** the `@counter-style` PARSING surface is now MINED OUT (the rest
  of the realm is layout reftests). Remaining typed-at-rule families are exhausted
  (`@page`/`@font-face`/`@property`/`@font-palette-values`/`@counter-style` all done).
  Two roads left: (a) **wire the registries into computed-style** — the biggest held
  cap is `register-property-computation` 0/75 + `registered-property-cssom` 4/8, which
  need `_registeredProps` to canonicalize a registered custom property's computed value
  through the cascade (layout-adjacent, harder); or (b) **scout a fresh `css/*/parsing/`
  dir** — re-baseline even green realms (a PARTIAL file, not just 0/N, is the tell).
- **Reusable:** the whole `@counter-style` engine — `_isValidCounterStyleName`,
  `_csCanonSymbol` (the `<symbol>` = string|image|custom-ident primitive),
  `_csIntNonNeg`, and the `_CS_DESCRIPTORS` table-driven rule class (canon fn +
  accessor field per descriptor) — a clean pattern for any future descriptor at-rule.
