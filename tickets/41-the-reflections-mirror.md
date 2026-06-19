# Scroll 41 — The Reflection's Mirror

> *Realm:* `dom/nodes/Element-matches`, `Element-webkitMatchesSelector`,
> `Element-closest` — the `Element.matches()` family.
> *Hold (after):* matches **669/669**, webkitMatchesSelector **669/669**,
> closest **25/29** (capped).
> *Difficulty:* ⚔️ quick & decisive.
> *Bounty:* **+700.**

## The gap

Three sibling tests exercise the same algorithm — "match an element against a
selector list":

| Test | Before | After |
|------|:------:|:-----:|
| `Element-webkitMatchesSelector.html` | 8/669 | **669/669** |
| `Element-matches.html` | 630/669 | **669/669** |
| `Element-closest.html` | 25/29 | 25/29 (caps) |

### Root causes

1. **`webkitMatchesSelector` did not exist** (`element.webkitMatchesSelector is
   not a function`) — 661 dark subtests. It's a legacy vendor-prefixed alias of
   `matches()` that the platform still exposes; the WPT file is a byte-for-byte
   copy of `Element-matches.html` that calls the prefixed name.

2. **`matches()` was structurally wrong.** It did:
   ```js
   const parent = this.parentNode;
   if (!parent || !parent.querySelectorAll) return false;   // ← detached → false, no parse
   const matches = parent.querySelectorAll(s);
   for (...) if (matches[i]._nid === this._nid) return true;
   return false;
   ```
   Defects:
   - **Detached (parentless) element → `return false` without ever parsing the
     selector.** So all 33 "Detached Element.matches: Invalid …" subtests (which
     expect a `SyntaxError` for an empty string / invalid character / bad
     combinator / unknown pseudo / undeclared namespace) silently passed through
     as `false` instead of throwing.
   - **No arg-count check** — `element.matches()` with no argument must throw
     `TypeError`; it didn't (`s` was `undefined`, coerced downstream).
   - **Wrong coercion** — `matches(null)` / `matches(undefined)` must coerce the
     required DOMString to `"null"` / `"undefined"` (and thus match an element of
     that tag name); the old path mishandled them.
   - **Subtly wrong even with a parent** — querying the *parent's* descendants and
     checking membership ignores combinators that reach above the parent
     (`html > body div`); `matches()` must evaluate the element against the
     selector in the element's true tree position.

3. **`closest()`** delegated to the old `matches()`, inheriting the no-arg and
   detached-validation gaps.

## The work (pure leverage — 1 small Rust fn + 1 op + a JS rewrite)

**Rust — `crates/obscura-dom/src/selector.rs`:** new `DomTree::element_matches`,
a one-element analogue of `query_selector_from`. It `parse_selector(selector)?`
(so an invalid selector is `Err` → `"ERR"` → JS throws), returns `false` for a
non-element node, and otherwise runs `matches_selector_list` against the
`DomElement` for that node. Because the matcher walks the *real* arena ancestors,
combinators are correct even for a detached subtree.

**Rust — `crates/obscura-js/src/ops.rs`:** new `"element_matches"` op (sibling of
`query_selector_all_scoped`) returning `"ERR"` (invalid selector) / `"true"` /
`"false"`.

**JS — `crates/obscura-js/js/bootstrap.js`:** `matches`, `closest`, and the new
`webkitMatchesSelector` all route through the op:
- `arguments.length < 1` → `TypeError`.
- `String(s)` coercion (`null`→`"null"`, `undefined`→`"undefined"`, per a required
  WebIDL DOMString).
- `"ERR"` → `_qsThrow(sel)` (the same `SyntaxError` helper `querySelectorAll` uses).
- `closest` walks `el = el.parentNode` while `el.nodeType === 1`, returning the
  first ancestor whose `element_matches` is `"true"`.
- `webkitMatchesSelector` added to the `_markNative` list (so `toString` reads
  native, matching the IDL-attribute / function-identity subtests).

## Results

- `Element-webkitMatchesSelector.html` **8 → 669/669** (+661)
- `Element-matches.html` **630 → 669/669** (+39)
- `Element-closest.html` 25/29 (unchanged)
- **+700, zero regressions.**

Sweep (fresh server): qsa `ParentNode-querySelector-All` 1975/1975, classlist
1420/1420, createElement 147/147, createElementNS 596/596, Element-tagName 6/6,
Node-cloneNode 135/135, getElementsByTagNameNS 16/16, TreeWalker 761/761, mark
22/22, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
260/260.

## Caps / Next

- **`Element-closest.html` 25/29** — the 4 left are not in the matches family's
  reach:
  - `:scope` (×3: `:scope`, `select > :scope`, `:has(> :scope)`) needs a
    **scope-element MatchingContext** — the matcher must be told which element is
    `:scope` (today `:scope` matches nothing in a bare `matches()`/`closest()`).
    Would also help any `querySelector(":scope …")` call.
  - `:invalid` (×1) needs the **form-validity pseudo-classes** (`:invalid`/
    `:valid`) — a constraint-validation gap, not a selector-parse gap.
- **Next leverage (fresh realm):** the document-creation + selector-matching veins
  in `dom/nodes/` are now clean. Candidates measured this session that are already
  green (no work): `Node-isEqualNode` 9/9, `Node-properties` 726/726,
  `Element-getElementsByTagName` 19/19, `Node-lookupNamespaceURI` 75/75. Look to
  `fetch/`, `html/dom/` reflection (idlharness — the distinct interface objects
  from #33 are the foundation), or the standing `replaceChildren` atomic-record
  Rust op (#35 cap).
