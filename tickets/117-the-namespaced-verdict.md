# Scroll 117 — The Namespaced Verdict (Quest #117)

**Realm:** `dom/nodes/MutationObserver-attributes` — the MutationObserver realm,
found red on a fresh baseline sweep after the Collections Armory (Captain's Counsel
#1) turned out to already be 100% green (the board's "4/19" was stale — the Attr /
Node-Smithing work lifted it).

**Result: +6.** `MutationObserver-attributes` 36 → **42/42 (100%)**. Two
root-cause correctness fixes in the Rust mutation recorder + a JS carry-through,
all additive.

| Test | before → after |
| --- | --- |
| `dom/nodes/MutationObserver-attributes.html` | **36 → 42 (100%)** |

## The gaps & the fixes

Every one of the 6 fails was one of two primitives in how attribute mutation
records are produced (the Rust DOM is the authoritative mutation source — Phase 0c
— and the JS `MutationObserver` drains its queue):

### 1. `attributeNamespace` was hardcoded `null` (+3)
A `MutationRecord` for `setAttributeNS`/`removeAttributeNS` must carry the
attribute's namespace as `attributeNamespace` (DOM §"queue a mutation record" of
"attributes"). The Rust `MutationRecord` had no namespace field, the drain op never
emitted one, and `_enqueue` in `bootstrap.js` literally set `attributeNamespace:
null`. So `setAttributeNS("http://example.org/", "private", "42")` produced a record
with `attributeNamespace === null` where the test asserts `"http://example.org/"`.
- Added `attr_namespace: Option<String>` to the Rust `MutationRecord`.
- `record_attribute_mutation` takes a `namespace` arg; the two namespace-aware ops
  (`set_attribute_ns`, `remove_attribute_ns`) pass `Some(ns)` (or `None` for the
  empty-string null namespace); the two non-namespaced ops pass `None`.
- `drain_mutations` serializes `"attributeNamespace": r.attr_namespace`.
- `bootstrap.js` carries it through `__drainMutations` (`attributeNamespace:
  m.attributeNamespace ?? null`) and `_enqueue` (`rec.type === 'attributes' ?
  (rec.attributeNamespace ?? null) : null`).

### 2. A no-op attribute removal queued a spurious record (+3)
`removeAttribute("class")` / `removeAttributeNS(ns, local)` on an element that has
**no such attribute** must queue **no** record (DOM §"remove an attribute by ..."
returns early when the attribute is null). The ops recorded unconditionally, so a
no-op removal followed by an `id` change produced **2** records where the test
expects **1**.
- `remove_attribute` and `remove_attribute_ns` now guard `record_attribute_mutation`
  on `old.is_some()` — the `old` value is `None` exactly when the attribute was
  absent, so the no-op removal records nothing. (Set still records unconditionally,
  which is correct: creation *and* same-value change both queue a record.)

## Zero-regression sweep
Held: classlist 1420 (heavy `setAttribute("class")` user), Document-createElement
147, Node-properties 726, attributes 67, Element-getElementsByTagName 19,
Range-surroundContents 1840, Range-insertNode 1840, qsa
(`ParentNode-querySelector-All`) 1975, and the MutationObserver siblings that were
already green (characterData 23, takeRecords 3, disconnect 2). The new
`attr_namespace: None` was added to the characterData and three childList
`MutationRecord` constructors — purely additive.

## Caps / Next
- **`MutationObserver-childList.html`** 31/38 — the 7 fails are all **atomic record
  batching**: a compound op (textContent / innerHTML replace-all, DocumentFragment
  insertion, `replaceChild`) must emit ONE childList record (added ∪ removed) but we
  emit one per Rust primitive ("expected 1 but got 2"). Needs a Rust
  suppress-then-synthesize mechanism (the same cap named for `ParentNode-replaceChildren`
  25/29 and `MutationObserver-inner-outer`). **The next-best lead in this realm.**
- **`MutationObserver-document.html`** 1/4 — observing the document during the HTML
  parse (parser-inserted nodes don't fire the observer; a parse-time mutation gate).
- **`MutationObserver-inner-outer.html`** 0/3 — same atomic-record cap as childList
  (`innerHTML` should emit fewer records than our per-primitive count), plus an
  `outerHTML` heavy-test timeout.
