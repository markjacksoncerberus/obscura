# Quest #115 — The Shifted Verdict

> *A range is a promise about a place in the tree. Move the tree, and the promise
> must move with it — node by node, offset by offset, exactly as the spec swears.*

**Realm:** `dom/ranges/Range-mutations-removeChild.html`, `-appendChild.html`,
`-splitText.html`, `-replaceChild.html` (and `-insertBefore.html`) — the #112/#113/
#114-named "next leverage": wire the `__obscura_liveRanges` registry into the
*other* spec range-mutation hooks (node insert/remove, `splitText`).
**Result:** removeChild **11/20 → 20/20**, appendChild **56/70 → 70/70**,
splitText **95/116 → 116/116**, replaceChild **56/60 → 60/60**. **+48 total.**
(insertBefore is a pre-existing heavy-test hang — see Caps.)

## The gap

Quest #113 gave us a live-range registry (`__obscura_liveRanges`) and wired it into
the DOM **"replace data"** primitive so CharacterData edits shift range boundaries.
But the *node*-mutation algorithms — **remove**, **insert**, and **split** — each
have their OWN live-range steps in the DOM spec, and ours touched none of them. So a
range survived a `removeChild`/`appendChild`/`insertBefore`/`splitText` pointing at
the wrong place.

Three spec algorithms, all keyed on the same registry:

- **DOM "remove"** (<https://dom.spec.whatwg.org/#concept-node-remove>): when `node`
  leaves `parent` at `index`, a boundary whose node is an inclusive descendant of
  `node` collapses to `(parent, index)`; a boundary in `parent` with offset `> index`
  decrements. Drives `removeChild`, and the remove half of a *move* (`appendChild`/
  `insertBefore` of an already-parented node).
- **DOM "insert"** (<https://dom.spec.whatwg.org/#concept-node-insert> step 5): when a
  node is inserted before a **non-null** reference child at `index`, every boundary in
  `parent` with offset `> index` increments. **Appends (null reference) do NOT adjust**
  — which is exactly why `appendChild` needed only the remove half.
- **DOM "split"** (<https://dom.spec.whatwg.org/#concept-text-split> step 8): after the
  new node is inserted, a boundary on the original node past `offset` moves to the new
  node (offset −= `offset`); a boundary in the parent exactly at `index+1` increments.

`replaceChild` is `remove(child)` + `insert(node, ref)`, so it fell out for free once
remove and insert were correct — including the subtle `replaceChild(x, x)` (replace a
node with itself): remove decrements the trailing offset, the non-null-ref insert puts
it right back. That round trip is *only* correct if insert adjusts too.

## The fix (pure JS, additive, `bootstrap.js`)

Two small helpers beside `__obscura_replaceData`, mirroring its WeakRef-pruning loop:

- `__obscura_adjustRangesForRemove(node, parent, index)` — the four "remove" steps.
  Called in `removeChild` (before the tree op) and in `appendChild`/`insertBefore`
  when the node already has a parent (the remove half of a move), with the node's OLD
  parent + index.
- `__obscura_adjustRangesForInsert(node, parent, index)` — the "insert" step 5.
  Called in `insertBefore` only (non-null reference), AFTER the tree op, with the
  node's NEW index. `appendChild` deliberately skips it (null reference → no shift).

`splitText` was rewritten to follow the spec "split" order: create the new node,
insert it, run steps 8.2–8.5 against the registry, then truncate the original via
`__obscura_replaceData(this, offset, count, "")` (step 9) — routing the truncation
through the "replace data" primitive so a **detached** text node's own ranges (parent
null → steps 8 skipped) still collapse correctly, matching the spec's final step.

Each call site is guarded on `__obscura_liveRanges.length` so the overwhelmingly
common no-range page mutation pays nothing.

## Why no regression in the Range content-ops

`extractContents`/`deleteContents`/`surroundContents` all call `removeChild`/
`insertBefore`/`splitText` internally — but each **explicitly resets `this`'s
boundary points at the end** of its algorithm, so any mid-op adjustment to the range
being operated on is overwritten. `insertNode` only sets its end-if-collapsed, and the
new split/insert steps are provably no-ops for *its* boundary (the split offset equals
the start offset, so `> offset` never fires). Verified by the sweep below.

## Caps / Next

- **`Range-mutations-insertBefore.html` is a pre-existing heavy-test hang** — it never
  produced a result on the baseline (before any of this work) either, timing out past
  5 minutes. Independent of these changes; the same family as the `Node-insertBefore.html`
  hang noted in #111. Its logic is exercised by `replaceChild` (which moves nodes via
  `insertBefore` and passes 60/60), so the insert/remove range steps are confirmed
  correct even though this specific harness can't be measured.
- The registry is now wired into replace-data + remove + insert + split. The remaining
  spec range hook is **`normalize`** (Node-normalize already 4/4 here, but the
  dedicated mutation harness for it does not exist in WPT).
- CSS `%`→used-px stays layout-capped (#109/#110).
