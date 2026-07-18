# Quest #123 — The Identified Verdict

**Realm:** `dom/nodes/Document-getElementById.html`
**Result:** 8/18 → **18/18** (+10, 100%)
**Date:** 2026-06-28
**Files:** `crates/obscura-dom/src/tree.rs`, `crates/obscura-js/js/bootstrap.js`

## The gap

`getElementById` is one of the most-leaned-on primitives in the DOM (the cascade's
form-owner resolution, ARIA element reflection, named-element access all call it),
yet its implementation was fundamentally broken. The Rust side
(`tree.rs::get_element_by_id`) was a single-entry `HashMap<String, NodeId>` lookup:

```rust
self.inner.borrow().id_index.get(id).copied()
```

That map cannot honour **tree order** across duplicate ids (it holds one NodeId per
id, last-writer-wins), does not check **connectedness** (a detached element with an
id was still returned), goes **stale** across `innerHTML`/`outerHTML`/subtree
mutations (not every removal path updated it), and happily indexed `id=""`.

The JS side compounded it: `_dom("get_element_by_id", id)` flows through the shared
`_dom` helper, whose `String(a1 ?? "")` collapses `null`/`undefined` → `""`,
violating the WebIDL `DOMString` coercion (should be `"null"` / `"undefined"`).

The 10 failures: empty-string arg should be null; null/undefined args mis-coerced;
no tree order (returned "3rd" not "1st"); duplicate-id insertion-vs-tree-order;
disconnected nodes returned; and liveness across innerHTML-remove / outerHTML-add /
insert-parent.

## The fix

**Rust (`tree.rs`).** Replaced the index lookup with a **live pre-order tree walk**
from the document root (`inner.document`), returning the first element whose live
`id` attribute equals the (non-empty) target:

```rust
pub fn get_element_by_id(&self, id: &str) -> Option<NodeId> {
    if id.is_empty() { return None; }
    let inner = self.inner.borrow();
    let mut stack = Vec::new();
    push_children_rev(&inner, inner.document, &mut stack);
    while let Some(cur) = stack.pop() {
        if let Some(Some(node)) = inner.nodes.get(cur.index()) {
            if let NodeData::Element { ref attrs, .. } = node.data {
                if attrs.iter().any(|a| a.name.local.as_ref() == "id" && a.value.as_str() == id) {
                    return Some(cur);
                }
            }
            push_children_rev(&inner, cur, &mut stack);
        }
    }
    None
}
```

Walking the live tree makes **every** broken property correct at once:
- **Tree order** — pre-order DFS, first match wins (new `push_children_rev` helper
  pushes children reversed so `stack.pop()` visits them left-to-right).
- **Connectedness** — only nodes reachable from the document root are visited, so a
  detached element (appended to a fragment / another orphan) is excluded for free.
- **Liveness** — the tree is read each call; innerHTML/outerHTML/insert/remove are
  honoured with no index to keep in sync.
- **Empty id** — `id.is_empty()` returns `None` (an element's ID is its *non-empty*
  id attribute).

The old `id_index` is left in place (still maintained on insert/remove) — it is now
unused by the lookup but harmless; the form-owner consumer in `selector.rs` reads
through the same corrected `get_element_by_id` and only improves.

**JS (`bootstrap.js`).** `getElementById` now coerces its argument to a string
itself — `const eid = String(id)` — before handing it to `_dom`, so `null`→`"null"`
and `undefined`→`"undefined"` survive the `_dom` `?? ""` guard. The standalone-doc
and DetachedDocument paths additionally short-circuit `eid === ""` → `null` (instead
of building the invalid selector `#`).

## Results

| Test | Before | After |
| --- | --- | --- |
| `dom/nodes/Document-getElementById.html` | 8/18 | **18/18 ✅** |

**+10.**

## Zero-regression sweep

qsa 1975/1975 · classlist 1420/1420 · createElement 147/147 · Node-properties
726/726 · aria-attribute-reflection 41/41 · aria-element-reflection 22/27 ·
getElementsByTagName 19/19 · getElementsByClassName 1/1 — all unchanged.

## Caps / Next

No cap here — the realm is 100%. The live-walk is O(n) worst-case (vs the old O(1)
stale hint); fine for modest pages and the only certainly-correct option, but if a
hot-path profile ever flags it, the right optimization is a `HashMap<String,
Vec<NodeId>>` superset index re-validated (connected + live id) at lookup, never a
single-entry map.

**Next-best overall** (unchanged from #122): the shadow-tree scope discrimination
lift shared by `aria-element-reflection` (5 residual) + `CSSStyleSheet-constructable`
(6/13); the namespaced cascade-matching Rust lift (`selector.rs`,
`set-selectorText-namespace` 0/5); or sweep another fresh DOM/HTML region — core
DOM primitives keep paying off (this one was a 10-subtest flood from one root cause).
