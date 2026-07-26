# Scroll 319 — The Forgiving-Selector Verdict (Quests #319–#321)

> *#318 left a pointer: parse-is-where 27/33 + parse-not 23/26 are the remaining
> pure-JS `_parseSelectorList` veins — forgiving `:is()`/`:where()`, PEs-in-`:not`.
> Three quests, ONE commit, ZERO regressions, +10.*

Branch `engine-per-page-threads`. Session 2026-07-25. Base wpt.live.

## The gaps

Four files, all sunk by one missing distinction: WPT selector-parsing tests check
**three** validity levels that must agree, and our parser conflated the last two:

1. **querySelector** — the Rust `selectors` crate (throws on invalid).
2. **insertRule** — the JS `_parseSelectorList` (throws on invalid).
3. **`CSS.supports(selector(…))`** — must be **stricter**: `false` whenever the
   selector only parses because a *forgiving* pseudo-class (`:is()`/`:where()`)
   dropped or tolerated an unsupported member — even though it is a perfectly
   valid selector for querySelector/insertRule.

| File | Before | After | Root cause |
|------|:------:|:-----:|------------|
| `parse-not.html` | 23/26 | **25/26** | `:not()` tolerated a PE inside; `:host()` args unvalidated for combinators |
| `parse-is-where.html` | 27/33 | **31/33** | forgiving `:is()`/`:where()` reported `CSS.supports` true |
| `parse-has-forgiving-selector.html` | 0/3 | **3/3** | `:is(.a, 123)` inside `:has()` threw instead of forgiving |
| `parse-has-disallow-nesting-has-inside-has.html` | 1/2 | **2/2** | `.a:has(.b:has(.c))` (nested `:has`) did not throw in insertRule |

## Quest #319 — Forgiving `:is()`/`:where()` + nested-`:has()` rejection (the primitive)

`:is()`/`:where()` (and the legacy `:matches()`/`-webkit-any()`/`:any()`) take a
**`<forgiving-selector-list>`**: each complex selector is parsed on its own, and an
invalid one is **dropped** rather than failing the whole selector. Rebuilt the
`_SEL_NESTING_FN` arm of `parsePseudoArgs`:

- **Forgiving fns** split the argument on its top-level commas (`_splitSelectorCommas`,
  paren/bracket/string-aware), parse each member, and drop the failures. The list is
  valid even when it empties. `:has(:is(.a, 123))` no longer throws — `123` is dropped,
  `.a` kept.
- Any drop **or** a tolerated-but-unsupported pseudo-element raises a shared
  `ctx.f.forgiving` flag (threaded through the parse context) **and** makes the pseudo
  serialize its argument **back verbatim** (the invalid parts preserved as authored) —
  so `:is(.a, 123)` round-trips as `:is(.a, 123)`, not a re-canonicalised form.
- **`:has()` cannot nest inside a `:has()`** — a new `ctx.inHas` scope flag makes a
  nested `:has()` fail to parse. Directly (`​.a:has(.b:has(.c))`) that throws;
  indirectly through a forgiving `:is()` (`​:has(:is(:has(*)))`) the `:is()` swallows it.

## Quest #320 — `CSS.supports(selector())` reports forgiving selectors as unsupported

Wired the `forgiving` accumulator out to the `selector()` support query: it now returns
`true` only if the selector parses **with no forgiving recovery**. `:is(::before)`,
`:where(::before)`, `:has(:is(:has(*)))`, `:has(:where(:has(*)))`, `:has(:is(.a, 123))`
are all valid selectors (no throw) but **not supported** (`CSS.supports` → false).

## Quest #321 — `:not()` non-forgiving PE rejection + `:host()` argument validation

- **`:not()` is non-forgiving** — a pseudo-element as a direct member is a hard error.
  Generalised the old view-transition-only check to `_selListHasDirectPe` (any PE, but
  **not** descending into a nested forgiving `:is()` — that pseudo-class's own concern),
  applied to `:not()`/`:has()`/`:host()`. `:not(::before)` now throws.
- **`:host()`/`:host-context()` arguments are validated** as a `<compound-selector>`
  with **no combinators** (the shadow host is featureless). A new `ctx.noComb` scope
  flag, set on entering a `:host()` arg and propagated into nested pseudos, rejects a
  combinator wherever it appears: hard-fail inside a non-forgiving `:not()`
  (`:host(:not(.a .b))` throws) and a forgiving drop inside `:is()`/`:where()`
  (`:host(:is(div .foo))` is valid but `CSS.supports` → false).

## Zero regressions

qsa 1975, classlist 1420, Element-matches 669, Element-closest 29,
CSSStyleRule-set-selectorText 82 (the big `_parseSelectorList` canary), serialize-values
695/697, selectorSerialize 23, serialize-namespaced-type-selectors 60,
CSSGroupingRule-insertRule 7/7, createElement 147, parse-anplusb 112, parse-slotted 17,
parse-state 21, parse-part 14, parse-heading 18, parse-has 29. **Critically the
view-transition PE tests held exactly** — `pseudo-elements-invalid` 675/675 and
`-with-classes` 20/20 — the PE-handling refactor (VT-specific → general direct-PE)
still rejects `:not(<VT>)`/`:has(<VT>)`. A 21-selector CDP probe confirmed the whole
boundary (forgiving `sup=false`, non-forgiving throws, `:host` combinator rules).

## Caps (honest)

- **`:not(:host)`** (parse-not's last fail) — `document.querySelector(":not(:host)")`
  **throws** in the Rust `selectors` crate, so the `test_valid_selector` gate fails
  there before insertRule/`CSS.supports` are reached. QUERYSELECTOR-side (Rust), like
  the parse-part/parse-heading family.
- **`::part(foo):is([attr='value'])`** (parse-is-where's 2 fails) — a `:is()` in the
  **post-pseudo-element position** must forgivingly drop members that aren't valid after
  a PE (`[attr='value']` is not; `:hover` is). That needs the `activeLeaf` post-PE
  context threaded into the forgiving member parse — deferred (a third context flag,
  higher regression surface).
- **`parse-has-disallow-nesting`'s `matches()` block** already passed (the Rust engine
  matches the forgiving nested-`:has` correctly); #319 landed the insertRule subtest.

## Next leverage

The pure-JS `css/selectors/parsing/` veins are now essentially mined (what remains is
QUERYSELECTOR-side — the Rust `selectors` crate: `::part()`/`:heading`/`:host` in
`:not`, `::view-transition-*`/`::scroll-button()`/`::column` acceptance). The
`::part(foo):is(...)` post-PE forgiving case is the one pure-JS scrap left here. Scout a
**fresh `css/*/parsing/` dir** — re-baseline even green realms (a PARTIAL file, not just
0/N, is the tell) and batch-scan `*-invalid`/`*-computed`.

**Reusable:** the `ctx` parse-context (`{ f:{forgiving}, inHas, noComb }`) threaded
through `_parseSelectorList` recursion (shared upward accumulator + scoped downward
flags); `_splitSelectorCommas` (top-level comma split); `_selListHasDirectPe`
(non-descending PE scan); the forgiving-verbatim serialization (`a.raw` on a nesting-fn
node). Scroll `tickets/319-forgiving-selector-verdict.md`.
