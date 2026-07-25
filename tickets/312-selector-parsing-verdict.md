# Scroll 312 — The Selector-Parsing Verdict (Quests #312–#315)

> *A whole realm — `css/selectors/parsing/` — lay unconquered at **63/392**, and
> the css-view-transitions invalid-pseudo files sat at a stark **0/695**. Not for
> want of a selector engine (the Rust `selectors` crate already threw correctly in
> `querySelector`), but for two missing CSSOM primitives and one tree-abiding
> pseudo-element grammar. Four quests, ONE commit, ZERO regressions.*

Branch `engine-per-page-threads`. Session 2026-07-24. Base wpt.live.

## The gap

`css/support/parsing-testcommon.js` drives two harnesses:

- **`test_valid_selector(sel, ser)`** asserts (1) `querySelector(sel)` does not
  throw, (2) `sheet.insertRule(sel+"{}")` adds a rule, (3) `cssRules[0].selectorText`
  serializes canonically + round-trips, and (4) **`CSS.supports('selector('+sel+')')`
  is `true`**.
- **`test_invalid_selector(sel)`** asserts (1) `querySelector(sel)` throws
  SYNTAX_ERR and (2) **`sheet.insertRule(sel+"{}")` throws SYNTAX_ERR**.

Two primitives were absent, and each independently sank a whole assertion:

1. **`CSS.supports('selector(...)')` always returned `false`** — the one-argument
   form split on the first `:` (a `property:value` split) and never recognised the
   `selector()` function, so *every* valid-selector subtest failed its assertion #4.
2. **`insertRule` never validated the selector** — it parsed the rule and kept it
   regardless, so *every* invalid-selector subtest failed its assertion #2.

Plus a fully-lenient view-transition pseudo-element grammar in `_parseSelectorList`
(it accepted `::view-transition-group(*).a`, a bare `::view-transition-group`, `()`,
etc.), which meant even a working `insertRule` would not have thrown for the 695 VT
invalid cases.

**The valid VT files (`pseudo-elements-valid*.html`, 264 subtests) stay a CAP**: they
need `querySelector` to *not* throw for valid `::view-transition-*` selectors, which
is a Rust `selectors`-crate change (the crate currently rejects them, exactly like
`::marker`/`::placeholder`). The *invalid* VT files need only JS — `querySelector`
already throws there.

## The four quests (one commit)

### #312 The Selector-Support Verdict — `CSS.supports('selector(...)')`
A `selector(<complex-selector-list>)` branch in the one-argument `CSS.supports`,
checked **before** the `property:value` split (a selector can itself contain a `:`,
e.g. `:hover`). Validity flows through the same `_parseSelectorList` that backs
`CSSStyleRule.selectorText`; a `var()` inside a selector condition is never valid.
Greens the assertion-#4 across every `test_valid_selector`.

### #313 The Insert-Rule Validation Verdict — `insertRule` selector validation
`_assertRuleSelectorValid(parsedRule)` throws SyntaxError when a **style** rule's
prelude fails `_parseSelectorList` (CSSOM §insert-a-css-rule step 5). Wired into both
`insertRule` methods (CSSGroupingRule + CSSStyleSheet); at-rules carry no selector and
skip it. **The Rust matching engine cannot be reused here** — it rejects perfectly
valid stylesheet pseudo-elements (`::marker`, `::placeholder`, `::view-transition-*`)
that never *match* in a `querySelector` context, so validating via the Rust op would
wrongly throw on `li::marker {}`. Hence the JS parser.

Included here: **`:has()` relative-selector support.** The Rust matcher accepts
`:has(> img)` / `:has(+ p)` / `:has(~ a)`, but `_parseSelectorList` rejected the
leading combinator — so the new `insertRule` validation would have *over-rejected*
valid relative `:has()` (a real regression the moment insertRule started validating).
`_parseSelectorList(src, relative)` now consumes an optional leading combinator per
complex selector when `relative` (passed only for `:has`), and `_serComplex` prints a
leading combinator with no preceding space (`:has(> img)`, not `:has( > img)`).
`parse-has.html` 26→29.

### #314 The View-Transition Pseudo-Element Verdict — tree-abiding PE grammar
Tightened `_parseSelectorList`, scoped strictly to the VT pseudo-elements (non-VT PEs
untouched → zero blast radius on `::before`/`::marker`/…):
- **functional PEs** (`view-transition-group`/`-image-pair`/`-old`/`-new`) require a
  `(<pt-name-selector>)` argument = `* | <custom-ident>`, `<custom-ident>` excluding
  the CSS-wide keywords and `default`; empty `()` invalid.
- **`::view-transition`** (the root) takes **no** argument.
- a VT PE must **end its compound**: only `:only-child` may follow (and only on the
  functional ones); no type/class/id/attr, no other pseudo.
- a VT PE must be the **last compound** of its complex selector (no descendant/sibling).
- a VT PE is **disallowed inside** `:is()/:where()/:not()/:has()` (deep-scanned via
  `_selListHasVtPe`).

`pseudo-elements-invalid` 0→675, `pseudo-elements-invalid-with-classes` 0→20.

### #315 The Background-Size-Computed Verdict — calc px-resolution
`background-size` had no computed branch (it echoed the specified value), so
`calc(10px + 0.5em)` never resolved. Routed through the existing `_computeMaskSize`
(mask-size is identical grammar): each token → `_clampNegPx(_trComp(...))`, so
`calc(10px + 0.5em)`@40px → `30px`, `calc(10px - 0.5em)` → `0px` (clamp), while `auto`/
`cover`/`contain`/`%` stay identity. `background-size-computed` 14→16.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-view-transitions/parsing/pseudo-elements-invalid.html` | 0/675 | **675/675** |
| `css/css-view-transitions/parsing/pseudo-elements-invalid-with-classes.html` | 0/20 | **20/20** |
| `css/selectors/parsing/` (whole dir, 22 files) | 63/392 | **251/392** |
| `css/css-backgrounds/parsing/background-size-computed.html` | 14/16 | **16/16** |

**+885 subtests.** Representative selectors/parsing files: parse-attribute 0→16,
parse-not 0→23, parse-has 0→29, parse-is-where 0→27, parse-state 0→16, parse-heading
0→18, invalid-pseudos 0→12, parse-slotted 0→10, parse-part 4→14.

## Zero regressions

qsa 1975, classlist 1420, serialize-values 695/697, `CSSGroupingRule-insertRule` 7/7,
`cssom-cssText-serialize` 1/1, `CSSStyleRule-set-selectorText` 82/82, `selectorSerialize`
23/23, `serialize-namespaced-type-selectors` 60/60, `CSSStyleRule` 10/10, `Element-matches`
669/669, `Element-closest` 29/29, `CSSStyleSheet` 11/17 (the 6 = unrelated arity
behaviors), background-size-valid 9/9 / -invalid 3/3, mask-size-computed 16/16. The
whole selectors/parsing dir held its per-file gains exactly across the #314 and #313
`:has` follow-ups (stash-proved before/after: 63→251).

## Caps / Next

- **VALID VT files** (`pseudo-elements-valid.html` 0/100, `pseudo-elements-valid-with-classes.html`
  0/164) + `at-supports-selector-*` reftests need the **Rust `selectors` crate** to
  accept `::view-transition-*` (and `::marker`/`::placeholder`) in `querySelector`
  context — a selectors-crate quest (same family as `::scroll-button()` 0/37,
  `::column` 0/14). Once the crate accepts them, these ~264 subtests fall to the JS
  serializer already built here.
- **selectors/parsing remaining 141 fails**: `parse-anplusb` 48/112 (An+B canonical
  serialization edge cases — a self-contained JS vein, likely the next quest here),
  `parse-part` 14/32 + `parse-slotted` 10/19 (`::part()`/`::slotted()` arg grammar),
  `parse-state` 16/24, `parse-heading` 18/28, `parse-is-where` 27/33,
  `parse-not` 23/26 (forgiving/serialization edge cases), `parse-has-forgiving-selector`
  0/3 (`:has()` is non-forgiving in the current spec — invalid args should invalidate
  the whole `:has`), `parse-has-slotted.tentative` 4/23. All JS `_parseSelectorList`
  refinements — no Rust needed.
- `css-nesting/cssom` 0/14 is a separate architecture gap (`CSSStyleRule` must extend
  `CSSGroupingRule` — CSS Nesting), untouched here.

**NEXT LEVERAGE:** `parse-anplusb` 48/112 (An+B serialization — `_selSerAnB`) is the
fattest remaining pure-JS vein in the dir. Then the `::part()`/`::slotted()`/state arg
grammars. Reusable: `_assertRuleSelectorValid` (insertRule → SyntaxError on invalid
selector, JS parser not Rust op), the `selector()` branch in `CSS.supports`, the
`_parseSelectorList(src, relative)` relative-selector flag, and the VT tree-abiding
gate (`_selIsVtPe`/`_selListHasVtPe`, scoped so non-VT PEs are untouched).

**DEV-LOOP:** `test_valid_selector` needs BOTH `querySelector` (Rust) AND `insertRule`
(JS `_parseSelectorList`) to agree — a divergence is an over/under-reject bug; probe it
with a Playwright `connect_over_cdp` eval before trusting a green. The Rust engine
accepts `::before`/`::after`/`::first-line` but rejects `::marker`/`::placeholder`/VT
in `querySelector` context — never validate stylesheet selectors through it.
