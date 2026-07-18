# Scroll 120 — The Canonical Verdict

**Realm:** CSSOM selector serialization (`css/cssom/`) — `CSSStyleRule.selectorText`
**Hold before:** selectorSerialize 14/23 · serialize-namespaced 31/60 · set-selectorText 24/82 · set-selectorText-namespace 0/5
**Hold after:** selectorSerialize **23/23** · serialize-namespaced **60/60** · set-selectorText **82/82** · set-selectorText-namespace 0/5 (cap)
**Bounty:** **+96.** Difficulty ⚔️⚔️⚔️

## The gap

Quest #119 built a real CSSOM rule tree, but `CSSStyleRule.selectorText` was a stub:
the getter returned the raw authored prelude and the setter just stored
`String(v).trim()`. So:

- **No validation** — `rule.selectorText = "!!"` stored `"!!"`; the spec requires an
  unparseable value to be a **no-op** (the old selector is retained).
- **No serialization** — a parsed selector must round-trip through the CSSOM
  *"serialize a group of selectors"* algorithm: identifier escaping, An+B
  canonicalisation, functional-pseudo whitespace collapse, legacy `:before`→`::before`,
  and the namespace-prefix omission rules. We returned the source bytes verbatim.
- **No cascade reflection** — even once serialization was right, `set-selectorText`
  also asserts (via `getComputedStyle`) that the *modified* rule re-matches the live
  DOM. The cascade re-parses `<style>` `textContent`, which a CSSOM edit never touches.

These four tests share **one root**: a CSS *selector* parser + serializer (the matching
engine is the real Servo `selectors` crate, so this is pure syntax + serialization).

## The work (all additive in `bootstrap.js`, no `ops.rs`/Rust change)

**A recursive-descent selector parser + CSSOM serializer.**

- `_serIdent` / `_serString` — CSSOM *serialize-an-identifier* / *serialize-a-string*
  (NULL→U+FFFD, control/leading-digit/lone-hyphen hex escapes `\xx `, `\char` escapes).
- `_selReadEscape` / `_selReadIdent` / `_selReadString` — CSS escape-aware token readers
  (hex `\30 ` with one trailing-whitespace swallow, `\@` char escapes).
- `_selSerAnB` — `<an+b>` microsyntax → canonical (`even`→`2n`, `odd`→`2n+1`,
  `+10`→`10`, `1n + 5`→`n+5`, `-1n - 5`→`-n-5`, `3n - 0`→`3n`).
- `_parseSelectorList` — parses a group of complex→compound→simple selectors:
  type/universal with namespace prefix (`ns|`, `*|`, `|`, none), `.class`, `#id`,
  `[ns|attr op value flag]`, pseudo-classes/elements (known-name sets → unknown is
  invalid, so `:gibberish`/`::gibberish` reject), combinators (` `, `>`, `+`, `~`, `||`),
  functional pseudos (`:not()`/`:is()` recurse into a nested selector list; `:nth-*()`
  parse An+B + optional `of S`; `:lang()` comma idents/strings). Returns `null` on any
  syntax error → the setter no-ops.
- `_serSelList`/`_serComplex`/`_serCompound`/`_serSub`/`_serPseudoArgs` — serialize the
  AST. The **type/universal namespace rule**: prefix `null`→omit, `''`→`|`, `*`→`*|`
  only when a default namespace is declared (else omit), a **named prefix that resolves
  to the default-namespace URL is omitted**. A bare universal `*` with an empty
  namespace head is dropped when other simple selectors follow (`*.c`→`.c`) but kept
  alone (`*`). Attribute null-ns prefix `[|x]`→`[x]`, any-ns kept `[*|x]`.
- `_parseNamespacePrelude` / `_sheetNsInfo` — read the owning sheet's `@namespace`
  rules into `{ defUrl, map: {prefix→url} }` (needed for the default-namespace omission).

**Wiring `CSSStyleRule`:** store `_selectorSource` (raw); `get selectorText` parses +
serializes with the sheet's namespace info, **falling back to the raw text if parsing
fails** (so an exotic real-page selector can never break); `set selectorText` validates
and no-ops on parse failure; `cssText` uses the serialized form.

**Cascade reflection (dirty-gated, zero-regression).** `_styleSheetRules(styleEl)` —
the function the cascade uses — now, *only* when the node's live CSSOM sheet has
`_cssomDirty` set (flipped by `set selectorText`) **and** still matches the element's
`textContent`, serves the cascade from the live `CSSStyleRule` objects
(`{selectorText: _selectorSource, decls: _cascadeDecls}`) instead of re-parsing the
text. Untouched pages keep the byte-for-byte text-parse fast path. `_setRules` clears
the flag when a sheet is rebuilt from source. The adopted-stylesheet cascade path now
matches on `_selectorSource` (raw) so serialization never perturbs matching.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/cssom/CSSStyleRule-set-selectorText.html` | 24/82 | **82/82** |
| `css/cssom/serialize-namespaced-type-selectors.html` | 31/60 | **60/60** |
| `css/cssom/selectorSerialize.html` | 14/23 | **23/23** |

**+96.** Zero regressions — qsa 1975, classlist 1420, createElement 147,
Node-properties 726, MO-attributes 42, MO-childList 38, getElementsByTagName 19,
serialize-values 696/697, shorthand 7/7, CSSStyleRule 10/10, CSSStyleSheet 11/17,
constructable 6/13, constructable-duplicate 2/4, getComputedStyle-pseudo 2/28,
CSSStyleDeclaration-iterator 1/1 — all unchanged.

## Caps / Next

- **`CSSStyleRule-set-selectorText-namespace` 0/5 is a SEPARATE cap — namespace-aware
  *matching*, not serialization.** The serializer handles `svg|*.style1` correctly, but
  the rule never matches the SVG element even at parse time (`getComputedStyle` returns
  transparent `rgba(0,0,0,0)`), so all 5 fail on `assertColors`. The Rust `selectors`
  glue (`crates/obscura-dom/src/selector.rs`) needs `@namespace`-prefix resolution fed
  into the match — a Rust-side lift, distinct from this JS serializer.
- **Nested namespace omission in matching** would also unblock namespaced cascade tests
  generally.
- The `css/cssom/` serialization tail is now essentially exhausted (selectorSerialize +
  serialize-namespaced + set-selectorText all 100%). **Next-best:** the namespaced
  cascade-matching lift above, or sweep a fresh DOM/CSS region. The `CSSStyleSheet`
  constructable shadow-DOM scoping (constructable 6/13 + duplicate 2/4) remains the
  #119-named larger lift.
