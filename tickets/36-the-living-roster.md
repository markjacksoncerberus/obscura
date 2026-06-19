# Scroll 36 — The Living Roster (`Node.childNodes` as a live, cached NodeList)

**Realm:** `dom/nodes/Node-childNodes.html` (+ the `childNodes` primitive used
across the whole DOM)
**Hold:** 1/6 → **6/6**. **+5.** Foundational live-collection primitive.
**Difficulty:** ⚔️⚔️ (hot-path primitive — wide regression surface, tight scope).

---

## The gap

`Node.childNodes` was implemented as:

```js
get childNodes() {
  const ids = _domParse("child_nodes", this._nid) || [];
  const list = ids.map(_wrap).filter(Boolean);
  list.item = (i) => list[i] || null;
  return list;
}
```

A **fresh plain array** on every read. Three spec violations, all asserted by
`Node-childNodes.html`:

1. **No caching / identity.** `node.childNodes === node.childNodes` must hold
   (the spec returns the *same* object). A new array each call → `false`.
2. **Not live.** Holding `var children = node.childNodes` then mutating the tree
   must be reflected in `children` (`children.length`, `children[i]`,
   `children.item(i)`). A snapshot array never updated. (The confusing
   `expected [] but got [Element node <p>]` failure messages were exactly this:
   the test compared a *stale* captured snapshot against a fresh read after an
   append.)
3. **Iterator identities.** The test asserts
   `list[Symbol.iterator] === Array.prototype[Symbol.iterator]`,
   `list.keys/values/entries/forEach === Array.prototype.*`, and
   `list instanceof NodeList`. (`NodeList extends Array` already gave us this —
   but only if the returned object actually *is* a NodeList instance.)

## The fix — pure JS, no new Rust

A **cached, live `NodeList` Proxy** per node (`bootstrap.js`):

- **Target** is a real `new NodeList()` (which `extends Array`), so
  `instanceof NodeList` holds and every non-intercepted member
  (`Symbol.iterator`, `keys`, `values`, `entries`, `forEach`, `slice`, …)
  resolves to `Array.prototype.*` with the **exact identity** the test demands.
- **Proxy traps** serve the live data: `get`/`has`/`ownKeys`/
  `getOwnPropertyDescriptor` recompute integer indices and `length` from the
  current tree (`child_nodes` op → `_wrap`). Indexed slots are read-only;
  expandos pass through. This gives the WebIDL semantics the test checks
  (`2 in children` false at length 2, `children[2] === undefined`,
  `children.item(2) === null`).
- **Identity cache:** `_childNodesCache` (a `WeakMap` node→proxy). Node wrappers
  are already stable per-nid, so the same caller sees the same proxy →
  `node.childNodes === node.childNodes`.
- **Performance:** a module-global generation counter `_treeGen` is bumped by the
  **five structural `op_dom` mutators** (`append_child`, `remove_child`,
  `insert_before`, `set_inner_html`, `set_text_content`) inside the `_dom`
  wrapper. Each live NodeList caches its snapshot against `_treeGen`, so a hot
  loop that reads `childNodes` repeatedly **without** mutating (serialization,
  `Array.prototype.slice.call`, isEqualNode, tree walks) re-queries Rust **once**,
  not per index. Any mutation invalidates all snapshots the instant it happens —
  conservative and correct.

The old in-getter `.item` monkey-patch is gone; `NodeList.prototype.item`
(`i < length ? this[i] : null`, reading through the proxy → live) covers it.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `dom/nodes/Node-childNodes.html` | 1/6 | **6/6** |

All six subtests green: caching, childNodes-on-Element/DocumentFragment/Document
(all three inherit the base `Node` getter and have real `_nid`s), iterator
behavior, and the live-collection length test.

## Zero regressions (swept fresh server)

qsa **1975/1975**, classlist **1420/1420**, createElement **147/147**,
createElementNS **596/596**, Node-appendChild **11/11**, Node-replaceChild
**29/29**, Node-cloneNode **135/135**, Node-isEqualNode **9/9**, attributes
**67/67**, Node-normalize **4/4**, Element-getElementsByTagName **19/19**,
ParentNode-append **25/25**, ChildNode-before **45/45**, ChildNode-replaceWith
**33/33**, **TreeWalker 761/761** (heavy `childNodes` consumer — key signal),
mark **22/22**, measures **119/119**, structured-clone **141/152**,
getRandomValues **39/39**, url-setters-stripping **260/260**, XMLSerializer
**27/29**, MutationObserver-childList **31/38** (= baseline),
Range-cloneContents **181/187** (≥ 177 baseline — live `childNodes` nudged it up).

`ParentNode-replaceChildren` **25/29** is the documented Quest #35 cap (atomic
"replace all" MutationObserver record). `Node-removeChild.html` /
`Range-mutations.html` are pre-existing could-not-runs (heavy `frames[0].document`
fixtures), not regressions.

## Caps / Next leverage

- **No cap on this test** — 6/6.
- The same live-Proxy + `_treeGen` pattern is now available for any other
  **live NodeList** surface that still returns a static snapshot (e.g.
  `querySelectorAll` is correctly *static* and must stay so; but
  `getElementsByName`, label/radio NodeLists, etc., if any are static today,
  could adopt `_makeLiveChildNodes`-style liveness).
- **Next leverage** (unchanged frontier from #35): the `replaceChildren` atomic
  "replace all" MutationObserver record (Rust suppress-observers flag); the
  standing `new Document()` web ctor tail (`Document-constructor.html` 3/5 — the
  two fails are interface-identity edges from #33, `adoption.window` 1/6); or a
  fresh realm (`dom/` Node-* heavy fixtures, `fetch/`).
