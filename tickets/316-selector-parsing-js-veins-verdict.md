# Scroll 316 — The Selectors-Parsing JS-Veins Verdict (Quests #316–#318)

> *#315 left a pointer: the remaining 141 `css/selectors/parsing/` fails are all
> pure-JS `_parseSelectorList` refinements. Three of them were the fattest veins —
> An+B whitespace, `::slotted()` structure, and `:state()` after a pseudo-element.
> Three quests, ONE commit, ZERO regressions, +76.*

Branch `engine-per-page-threads`. Session 2026-07-25. Base wpt.live.

## The gaps

Three files, three distinct lenient spots in the JS selector parser:

| File | Before | After | Root cause |
|------|:------:|:-----:|------------|
| `parse-anplusb.html` | 48/112 | **112/112** | `_selSerAnB` accepted invalid An+B + the stylesheet-text parser validated nothing |
| `parse-slotted.html` | 10/19 | **17/19** | `::slotted` internal structure unmodelled |
| `parse-state.html` | 16/24 | **21/24** | `:state()` allowed after any pseudo-element |

## Quest #316 — The An+B Verdict (+64)

`parse-anplusb.html` uses its OWN inline harness (`add_selector_style`) that sets a
`<style>` element's text and reads `sheet.cssRules[0]` — the **stylesheet-text**
parse path, NOT `insertRule`. Two bugs stacked:

1. **`_selSerAnB` over-accepted.** It canonicalised An+B by `t.replace(/\s+/g,'')`
   (strip ALL whitespace) then regex-matching. But the An+B microsyntax (CSS Syntax
   §5.5) is defined over CSS **tokens**: whitespace is legal *between* tokens
   (`n + 3`, `23n\n\n+\n\n123`) but illegal *inside* one. Stripping it made
   `+ 1n`, `12 n`, `n- 1 2`, `+12 N`, `+ n + 7` all look valid. Rewrote it as a real
   CSS-token parser: tokenise into `num`/`dim`/`ident`/`delim`/`ws`, then match the
   grammar (a `'+'? n` sign must be adjacent to the `n`; an `n-`/`-n-` ident or an
   `n-`-unit dimension forces a following signless integer to a NEGATIVE `b`). All 12
   valid serializations preserved (`1n+0`→`n`, `-n\n- 1`→`-n-1`, `  N- 123`→`n-123`),
   all 16 invalid forms rejected.

2. **`_cssParseRuleList` validated NO selectors.** It pushed every style rule with
   `{ type:'style', selectorText: prelude }` regardless of prelude validity, so even
   a correct `_selSerAnB` was never consulted on that path. Added the CSSOM
   §consume-a-qualified-rule drop: `if (_parseSelectorList(prelude) !== null) rules.push(...)`.
   This is the primitive that made #316–#318 land — the JS parser (not the Rust
   matcher, which rejects valid stylesheet PEs like `::marker`) is the validator.

## Quest #317 — The Slotted Verdict (+7)

Pseudo-element internal structure (Selectors-4 §3.6) for `::slotted()`:

- **Bare `::slotted` is invalid** — a functional PE needs its `()` (added `part`/
  `slotted` to the args-required check alongside the VT functional PEs).
- **No pseudo-class may follow `::slotted()`** — `:first-child`/`:hover`/`:focus`/
  `:lang`/`:dir` are all invalid after it (even the user-action ones).
- **`::slotted()` must be the last compound** — `::slotted(a) + ::slotted(b)` is
  invalid (extended the VT "no descendant/sibling" guard in `parseComplex`).

## Quest #318 — The State Verdict (+5)

Generalised the previously VT-only "what may follow a pseudo-element" block into a
left-to-right walk of the compound with an `activeLeaf` state:

- **`::part()` is element-backed** — permissive: any pseudo-class (incl. `:state()`)
  and even a further pseudo-element may follow it, so `::part(x):state(y)` and
  `::part(x):state(y)::before` stay valid.
- **Every other "leaf" PE** (`::before`/`::after`/`::first-letter`/`::marker`/
  `::selection`/`::slotted()`/…) admits only the **user-action** pseudo-classes
  (`_SEL_USER_ACTION_PC` = `hover`/`active`/`focus`/`focus-visible`/`focus-within`).
  So `::after:state(foo)`, `::before:state(foo)`, `::first-letter:state(foo)` are now
  rejected, while `::before:hover` stays valid.

## Zero regressions

qsa 1975, classlist 1420, Element-matches 669, Element-closest 29,
CSSStyleRule-set-selectorText 82 (the big `_parseSelectorList` canary),
serialize-values 695/697, selectorSerialize 23, serialize-namespaced-type-selectors
60, CSSGroupingRule-insertRule 7/7, parse-has 29, parse-is-where 27, parse-not 23,
parse-part 14 (all unchanged — their fails are Rust-side). **Stash-proved** the
parse-anplusb 48 baseline + getComputedStyle-pseudo 2/28 (pre-existing, not this
change). A **15-selector CDP probe** confirmed the boundary: `::before:hover`,
`::after:focus-within`, `div::first-line`, `input::placeholder`, `li::marker`,
`::part(x):state(y)`, `::part(x)::before`, `p:hover::before`, `h1::before:hover` all
valid; `::before:state(y)`, `::slotted(x):hover`, `::slotted`, `::before:first-child`
all rejected.

## Caps (honest)

- **parse-slotted `::slotted()` / `::slotted(0)`** and **parse-state's 3 valid-selector
  fails** (`my-input[type="foo"]:state(--0)::part(inner):state(bar)`,
  `::part(inner):state(bar)::before`, `…::after`) are **QUERYSELECTOR-side** — the
  Rust `selectors` crate over-/under-accepts there. `test_valid_selector` /
  `test_invalid_selector` require BOTH querySelector (Rust) AND insertRule (JS) to
  agree, so the JS side alone can't finish them.
- **parse-part 14/32** — ALL fails are Rust rejecting *valid* selectors
  (`::part(foo)::before`, `::part(foo):focus-within`, `:dir(ltr)::part(foo)`).
- **parse-heading 18/28** — Rust doesn't know the selectors-5 `:heading` pseudo-class.

All three are the same `selectors`-crate family as `::scroll-button()`/`::column`.

## Next leverage

The remaining pure-JS selectors/parsing veins are thinner AND riskier now that
`_cssParseRuleList` validates EVERY stylesheet (over-rejection silently drops real
rules): **parse-is-where 27/33** (forgiving `:is()`/`:where()` — accept-but-
`CSS.supports`-false for `::before` inside; `:host()` complex-arg rejection) +
**parse-not 23/26** (`:not(::before)` — pseudo-elements forbidden inside `:not`/`:is`/
`:where`, a generalisation of `_selListHasVtPe` to ALL PEs — but mind the forgiving
semantics). Or scout a fresh `css/*/parsing/` dir.

**Reusable:** the An+B CSS-token parser (`_selSerAnB`), the `_cssParseRuleList`
selector-drop primitive, `_SEL_USER_ACTION_PC` + the leaf/element-backed/slotted
PE-internal-structure walk in `parseCompound`.
