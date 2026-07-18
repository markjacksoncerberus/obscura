# Scroll 42 — The Logical Lens

> *Realm:* `css/selectors/{is-where-*,has-*}`, `dom/nodes/ParentNode-querySelector-scope`,
> `dom/nodes/Element-closest` — the Selectors-4 logical / relative pseudo-classes
> (`:is()`, `:where()`, `:has()`) and the `:scope` scoping root.
> *Hold (after):* is-where-basic **15/15**, is-where-not **18/18**, has-basic **18/18**,
> has-relative-argument **35/35**, has-matches-to-uninserted **12/12**,
> has-argument-with-explicit-scope **13/13**, querySelector-scope **4/4**,
> Element-closest **28/29** (one form-validity cap).
> *Difficulty:* ⚔️ quick & decisive (root-cause primitive, wide tail).
> *Bounty:* **+116.**

## The gap

Three modern selector-engine primitives were entirely dark — every test that
used them returned 0 because the selector simply failed to **parse** (→ the
querySelector / matches call threw `SyntaxError`, blanking the whole test):

| Test | Before | After |
|------|:------:|:-----:|
| `css/selectors/is-where-basic.html` | 0/15 | **15/15** |
| `css/selectors/is-where-not.html` | 0/18 | **18/18** |
| `css/selectors/has-basic.html` | 0/18 | **18/18** |
| `css/selectors/has-relative-argument.html` | 0/35 | **35/35** |
| `css/selectors/has-matches-to-uninserted-elements.html` | 0/12 | **12/12** |
| `css/selectors/has-argument-with-explicit-scope.html` | 0/13 | **13/13** |
| `dom/nodes/ParentNode-querySelector-scope.html` | 2/4 | **4/4** |
| `dom/nodes/Element-closest.html` | 25/29 | **28/29** (cap) |

### Root causes

The selector engine is the real Servo `selectors` crate (v0.26). It **already
implements** the matching for all of these (`Component::Is` / `Where` / `Has`
in `matching.rs`; `Component::Scope` keyed on `MatchingContext.scope_element`).
Three small things gated them off:

1. **`:is()` / `:where()` did not parse.** The crate's `Parser` trait method
   `parse_is_and_where()` defaults to `false`; our `ObscuraSelectorParser` never
   overrode it. So `:is(...)`/`:where(...)` were rejected as unknown → every
   is/where test blanked.

2. **`:has()` did not parse.** Same story — `parse_has()` defaults to `false`.
   The crate has a whole `relative_selector/` module and `match_relative_selectors`
   that walks the candidate's descendants/siblings via `first_element_child` /
   `next_sibling_element` (both already implemented on our `DomElement`), so
   `:has()` matching works the moment parsing is allowed.

3. **`:scope` never matched the right element.** Every `MatchingContext` was
   built with `scope_element: None`, which makes the crate fall back to
   `:scope == :root` (the document element). That's correct for a
   *document-rooted* query (`document.querySelector(":scope")`) but wrong for an
   *element-rooted* one — `div.querySelector(":scope > p")` must scope to `div`,
   and `el.closest(":scope")` / `:has(> :scope)` must scope to `el`.

## The fix (1 Rust primitive, no new architecture)

All in `crates/obscura-dom/src/selector.rs` + a one-line op tweak + a one-line
JS tweak. **Pure selector-engine plumbing — no DOM model changes.**

1. **Enable parsing.** Two `Parser` hooks on `ObscuraSelectorParser`:
   ```rust
   fn parse_is_and_where(&self) -> bool { true }
   fn parse_has(&self) -> bool { true }
   ```

2. **`:scope` scoping root.** New helper `DomTree::scope_opaque_for(node)` →
   `Some(opaque)` when `node` is an element, else `None` (preserving the
   `:scope == :root` fallback for document-rooted queries). Threaded into all
   four matching entry points by setting the public `context.scope_element`
   field after constructing the `MatchingContext`:
   - `query_selector_from` / `query_selector_all_from` — scope = the root
     element (the element `el.querySelector*` was called on). Document-rooted
     `document.querySelector*` passes the document node → `scope_opaque_for`
     returns `None` → `:scope` stays `:root`. **No qsa regression.**
   - `element_matches(node, selector, scope)` — now takes an explicit scope
     `Option<NodeId>`. For `matches()` the scope is the element itself; for
     `closest()` it is the **fixed context element**, held constant across the
     ancestor walk so `:has(> :scope)` resolves `:scope` to the context node,
     not the ancestor under test.

3. **Thread the closest scope through the op.** The `op_dom` bridge has only two
   string args, and `closest` needs both the ancestor-under-test *and* the fixed
   scope element. Encoded in `arg1` as `"<node>,<scope>"` (plain `"<node>"` still
   means scope == node, used by `matches()`); the `element_matches` op splits on
   the comma. `Element.closest` in `bootstrap.js` now passes
   `el._nid + "," + this._nid`.

### Why `:scope` is safe for the held suites

`dom/nodes/ParentNode-querySelector-All.html` (1975/1975) and
`Element-matches.html` (669/669) use **no** `:is`/`:where`/`:has`/`:scope`
(verified by grepping the live sources), so enabling the parse hooks cannot
flip any "invalid-selector → SyntaxError" subtest, and the document-rooted
`:scope` fallback is unchanged.

## Results

**+116, zero regressions.** Held the full ritual list on a fresh server:
qsa **1975/1975**, Element-matches **669/669**, webkitMatchesSelector **669/669**,
classlist **1420/1420**, createElement **147/147**, createElementNS **596/596**,
Element-tagName **6/6**, cloneNode **135/135**, TreeWalker **761/761**, mark
**22/22**, structured-clone **141/152**, getRandomValues **39/39**,
url-setters-stripping **260/260**. Selector unit tests 19/19. Crash tests
(`has-nth-of-crash`, `is-where-error-crash`, `has-sibling-chrome-crash`) are
no-testharness "must not crash" reftests → could-not-run is expected; the server
stayed alive (removed-elements ran green after).

## Caps / Next

- **`Element-closest` 28/29** — the last fail is `:invalid` (closest from
  `test11` should reach the invalid `<fieldset>` `test2`). Needs **form
  constraint-validation pseudo-classes** (`:valid`/`:invalid`), a separate quest
  (constraint validation is unmodeled). `:invalid` is already in
  `is_known_pseudo_class` so it parses-and-never-matches today.
- **`getComputedStyle`-driven specificity/cascade tests are caps** —
  `has-specificity` 0/8, `is-nested` 0/2, `is-where-pseudo-classes` 0/1,
  `is-specificity` 0/1 all assert *applied colours* via `getComputedStyle`,
  which needs a real CSS cascade engine (apply author stylesheets + compute
  specificity). This is the CSS-cascade frontier, **not** selector matching —
  our `:is`/`:where`/`:has` *matching* is correct, but we don't cascade styles.
- **`css/selectors/has-style-sharing-*` + `*-ref.html` pairs** are render
  reftests — need real layout/paint, unwinnable headless.
- **`is-default-ns-00{1,2,3}` / `is-where-pseudo-elements` could-not-run** —
  XHTML/namespace or pseudo-element fixtures the harness can't load for us.
- **`:has` did NOT need `parse_parent_selector` (`&` nesting)** — left default
  `false`; CSS Nesting `&` is a separate (cascade-adjacent) feature.

**Next leverage:** the selector-matching realm is now broad and clean
(`:is`/`:where`/`:has`/`:scope` + the `Element.matches` family from #41). The
recurring wall is **CSS cascade / `getComputedStyle`** (specificity, applied
values) — a large architectural realm. Otherwise a fresh realm (`fetch/`,
`html/dom/` reflection) or the standing form constraint-validation pseudo-classes
(`:valid`/`:invalid`/`:required` live state) which would also close the closest
cap.
