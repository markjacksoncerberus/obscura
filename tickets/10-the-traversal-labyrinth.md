# Scroll X — The Traversal Labyrinth

> Realm: `dom/ranges/*` + `dom/traversal/*`. **Unlocked by Quest #13** on
> 2026-06-14 — these were *no-results* (unmeasurable) until `createCDATASection`
> let `setupRangeTests` complete. Now they produce results (~7,600 subtests) but
> mostly fail because the underlying objects are stubs.

## Current hold (2026-06-14)

| Test | Hold | Note |
|------|:----:|------|
| `dom/traversal/TreeWalker.html` | 300/761 | real `createTreeWalker` exists; gaps remain |
| `dom/traversal/NodeIterator.html` | 1/766 | **aliases TreeWalker** — not a real NodeIterator |
| `dom/ranges/Range-comparePoint.html` | 0/5580 | loads; `Range` is a stub |
| `dom/ranges/Range-{clone,delete,extract}Contents.html` | run → TIMEOUT | heavy; do real work against stubs |

## The beasts (all in `crates/obscura-js/js/bootstrap.js`)

1. **`Range` is a no-op stub** — `globalThis.Range` (≈ line 3290) and
   `Document.createRange()` (the method on the Document class) have empty
   `setStart`/`setEnd`/`collapse`/etc. and `cloneContents()` returns an empty
   fragment. A real Range needs start/end boundary points (container + offset),
   the comparison/positioning algorithms, and the extract/clone/delete/insert/
   surround content operations per the DOM spec. This is the bulk of the bounty
   (`Range-*` tests total many thousands of subtests).
2. **`createNodeIterator` aliases `createTreeWalker`** (≈ line 1441 region) — a
   real `NodeIterator` has different semantics (reference node + pointer-before-
   reference, `detach()` as a no-op, `previousNode`/`nextNode` over a flat order)
   and its own WPT suite (766 subtests, currently 1).
3. **TreeWalker gaps** — 300/761 already; the failures are worth bucketing with
   `scripts/wpt_run.py -v` to find which `whatToShow`/filter/traversal cases break.

## Battle plan

- Start with **NodeIterator** as its own object (don't alias TreeWalker) — well-
  scoped, 766 subtests, and shares the filter machinery TreeWalker already has.
- Then build a **real Range** — large, but the single highest-bounty target on the
  whole Quest Board now. Consider backing boundary points with `(NodeId, offset)`
  and implementing the spec algorithms in JS over the existing tree ops, or push
  some into Rust (`obscura-dom`) for correctness with live mutation.
- The foreign-doc nodes from `setupRangeTests` (xml/foreign documents,
  `DetachedDocument`) already work post-#13, so range tests that span documents
  have valid fixtures to operate on.
