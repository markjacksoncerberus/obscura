# Scroll I — The Selector Sorcery ✅ SECURED

> Realm: `dom/nodes/ParentNode-querySelector-All.html`. Hold: **1975/1975 (100%)**
> as of 2026-06-15 (session #14). Engine: the real Servo `selectors` 0.26 crate;
> our glue lives in `crates/obscura-dom/src/selector.rs`. Measure with
> `scripts/wpt_run.py dom/nodes/ParentNode-querySelector-All.html`.
>
> **Conquered (session #14):** `::slotted()` parse-but-never-match; iframe docs
> preserve `<html>/<head>/<body>` attrs (fixing html/body/`:root`/`:lang` in the
> iframe ctx); `:link` only `a`/`area`; real `:target`; real `NodeList`
> (`extends Array`); `:root` distinguishes a real document from a fragment. The
> namespace-selector + `*-of-type` clusters had already fallen via the namespace
> work in Quests #02/#05/#11. **Total subtest count is now 1975 (was 1977; the
> harness reports two fewer with the realms fully resolved).**

## Won this campaign (2026-06-14)

- **Stable `Element::opaque()`** — was `OpaqueElement::new(self)` on a throwaway
  stack temporary; corrupted the crate's NthIndexCache → every `:nth-*` and
  `*-of-type` broke. Now derived from `(tree ptr, node index)`. **+151.**
- **CSS2 pseudo-elements** (`::before/::after/::first-line/::first-letter`, one-
  and two-colon) parse but never match → `querySelectorAll('::before')` returns
  empty instead of throwing. **+80.**
- **querySelector WebIDL**: selector stringified (null→"null", undefined→
  "undefined"), zero-arg → TypeError. Wrapper over all ParentNode impls in
  `bootstrap.js`. **+~6.**
- **`:lang()`** with ancestor `lang` inheritance + prefix match + multi-range. **+26.**
- **`:link`/`:any-link`** via `is_link()`; **`:visited`** never matches. **+8.**

Regression tests in `selector.rs` cover all of the above.

## The remaining ~60 (bucketed, all ×4 contexts: Document/Fragment/Detached/In-document)

| Cluster | Fails | Difficulty | Notes |
|---------|:-----:|:----------:|-------|
| `namespace \|` selectors | 16 | ⚔️⚔️⚔️ | `div`, `*\|div`, `\|div` namespace prefixes. Needs prefix→URI resolution in the parser (`Parser::namespace_for_prefix`/`default_namespace`, currently `None`) and real namespace data on nodes. |
| `::slotted` / `::part` etc. | 16 | ⚔️⚔️ | Functional + shadow-DOM pseudo-elements. Likely want `parse_functional_pseudo_element` to accept-and-never-match (mirror the CSS2 fix) so they stop throwing. Verify each WPT subtest expects empty (some may expect a throw). |
| `:target` | 8 | ⚔️⚔️ | Needs the document's URL fragment + matching the id'd element. No fragment state plumbed today. |
| type-selector `html`/`body` + `:root` (Document ctx) | 8 | ⚔️⚔️ | **NOT a matching bug** — `querySelectorAll('html'\|'body'\|':root')` returns the right element in isolation (verified). Failure is in the WPT harness assertion, probably node *identity* (`===`) between our qsa result wrapper and the test's reference node, or a context/ordering subtlety. Read the actual subtest before assuming. |
| real `NodeList` instance | 4 | ⚔️⚔️ | `qsa(...) instanceof NodeList`. We return a plain Array w/ `.item`/`.forEach`. A real `NodeList` class risks internal callers that treat the result as an Array (`.map`/`.filter`/spread) — audit those first. |
| `:lang` wildcard / `xml:lang` | ~6 | ⚔️ | Extended-filtering ranges like `*-CH` and `xml:lang` attribute (we only read `lang`). |
| WebIDL stragglers | 2 | ⚔️ | A couple of `no parameter` cases on a context not covered by the wrapper — re-check `arguments.length` reaches every entry. |

**Recommended order if resumed:** `:target` (8) and the `::slotted`/`::part` accept-
and-never-match (16) are the most tractable next; the type-selector/`:root` mystery
needs a read of the WPT source first; namespace + real NodeList are the deep work.
