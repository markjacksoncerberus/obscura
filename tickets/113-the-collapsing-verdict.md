# Quest #113 — The Collapsing Verdict

> *When you cut text from under a cursor, the cursor must fall with it — that fall
> is the spec's, not an afterthought.*

**Realm:** `dom/ranges/Range-extractContents.html` + `dom/ranges/Range-deleteContents.html`
— the remaining 19 from each, the #111/#112-named range-collapse-offset bug.
**Result:** extractContents **168/187 → 187/187 (+19, 100%)**, deleteContents
**106/125 → 125/125 (+19, 100%)**, +2 bonus on `CharacterData-insertData`. **+40 total.**

## The gap

Every one of the 19+19 failures was a "Resulting cursor position" subtest whose
range starts and ends in the **same CharacterData node**:

```
range 1  [paras[0].firstChild, 0, paras[0].firstChild, 1]
range 2  [paras[0].firstChild, 2, paras[0].firstChild, 8]
range 27 [comment, 2, comment, 3]
range 32 [detachedTextNode, 0, detachedTextNode, 8]
range 39 [processingInstruction, 0, processingInstruction, 4]
…
```

After `extractContents()`/`deleteContents()` the range must be **collapsed**
(`startOffset === endOffset`). Ours left it un-collapsed → the test's
`assert_equals(startOffset, endOffset)` failed ("expected 8 but got 2", &c.).

The *first* read of the failure looked like a missing collapse in our native
`extractContents`/`deleteContents` same-node early-return branch — but adding an
explicit `this._sc = sc; this._eo = so; …` there did **not** move the count. The
real tell was the assertion that *did* keep failing afterwards: the one prefixed
**"Test bug!"**:

```js
assert_equals(expectedRange.startOffset, expectedRange.endOffset,
  "Test bug!  Expected startOffset and endOffset must always be the same after deleteContents()");
```

That assertion is on the **expected** range — the one produced by WPT's *own* JS
reference implementation `myDeleteContents`, running in our engine. So the bug
was reproducible *through pure WPT JS*, independent of our native Range methods.

## Root cause — `deleteData()` didn't adjust live ranges

WPT's reference `myDeleteContents`, in the same-node CharacterData case, does:

```js
originalStartNode.deleteData(originalStartOffset, originalEndOffset - originalStartOffset);
return;   // NOTE: no setStart/setEnd — it relies on deleteData collapsing the range
```

Per the DOM spec, the **"replace data"** primitive
(<https://dom.spec.whatwg.org/#concept-cd-replace>) — which underlies
`appendData`/`insertData`/`deleteData`/`replaceData` — must, after rewriting the
string, **shift the boundary points of every live range** that lands in the
replaced span:

- start/end offset in `(offset, offset+count]` → set to `offset`
- start/end offset `> offset+count` → add `data.length − count`

For `[node, 2, node, 8]` deleting offset 2 count 6: end offset 8 is in `(2, 8]` →
collapses to 2 → range becomes `[node, 2, node, 2]`. **That collapse is the spec's
range-mutation, done by `deleteData` itself.**

Our `CharacterData.deleteData`/`insertData`/`replaceData`/`appendData` just rewrote
`this.data` and **never touched live ranges** → the reference range never
collapsed, and our native methods had to compensate by hand (which they only did
in the general path, not the same-node early-return).

## The fix (pure JS, bootstrap.js, additive)

A live-range registry (WeakRefs, mirroring the existing
`__obscura_liveNodeIterators` pattern) + one shared "replace data" primitive that
all four CharacterData mutators now route through:

```js
const __obscura_liveRanges = [];
function __obscura_replaceData(node, offset, count, data) {
  const old = node.data;
  if (offset > old.length) throw new DOMException("offset out of bounds", "IndexSizeError");
  if (offset + count > old.length) count = old.length - offset;
  node.data = old.slice(0, offset) + data + old.slice(offset + count);
  const dl = data.length, end = offset + count, delta = dl - count;
  for (… each live range r …) {
    if (r._sc === node) { if (r._so > offset && r._so <= end) r._so = offset; else if (r._so > end) r._so += delta; }
    if (r._ec === node) { if (r._eo > offset && r._eo <= end) r._eo = offset; else if (r._eo > end) r._eo += delta; }
  }
}

appendData(s)            { __obscura_replaceData(this, this.data.length, 0, String(s)); }
insertData(offset, s)    { __obscura_replaceData(this, offset, 0, String(s)); }
deleteData(offset, count){ __obscura_replaceData(this, offset, count, ""); }
replaceData(offset,c,s)  { __obscura_replaceData(this, offset, c, String(s)); }
```

`Range`'s constructor registers `new WeakRef(this)`. Now both the native Range
methods *and* WPT's JS reference collapse the range for free through `deleteData`
— no hand-written collapse in the early-return branch needed (it was reverted).

Bonus: the spec-correct `IndexSizeError` for `offset > length` fixed 2 subtests in
`CharacterData-insertData` (12→14).

## Results

| Test | Before | After | Δ |
|------|-------:|------:|--:|
| `dom/ranges/Range-extractContents.html` | 168/187 | **187/187** | **+19** |
| `dom/ranges/Range-deleteContents.html` | 106/125 | **125/125** | **+19** |
| `dom/nodes/CharacterData-insertData.html` | 12/18 | **14/18** | **+2** |

## Zero-regression sweep

Stash-compared the four CharacterData mutators (old code rebuilt on a fresh
server): `deleteData` 12/18 → 12/18, `insertData` 12/18 → **14/18 (+2)**,
`replaceData` 30/34 → 30/34, `appendData` 12/14 → 12/14 — no regression, +2 bonus.

Range family + ritual realms all held byte-for-byte:
`Range-surroundContents` 1840, `Range-insertNode` 1840, `Range-cloneContents` 187,
`Range-comparePoint` 5580; `Text-splitText` 6/6, `Node-normalize` 4/4 (both use
these primitives internally), `Node-appendChild` 11, `Node-cloneNode` 135,
`Node-properties` 726, `Element-classlist` 1420, `Document-createElement` 147,
`ParentNode-querySelector-All` 1975.

**Note:** `dom/ranges/Range-mutations.html` is a 404 on wpt.live (body 42 = stale
path, the test does not exist there) — not a regression.

## Caps / Next (ROI)

- **`Range-extractContents`/`deleteContents` are now 100%.** With
  `surroundContents`/`insertNode`/`cloneContents`/`comparePoint` already 100%, the
  major Range content-operation tests are fully green.
- **Live-range adjustment is now a real primitive** — the same `__obscura_liveRanges`
  registry can power the *other* spec range-mutation hooks (node insert/remove,
  `splitText`, `normalize`, `Text.wholeText`) that more Range/`*-mutations` tests
  exercise. The next-best DOM lead.
- `CharacterData-*` remaining tails (`deleteData` 12/18, `substringData` 14/28,
  `replaceData` 30/34) are **WebIDL unsigned-long / arg-count coercion** (e.g.
  `deleteData(-1, 10)` must treat −1 as `4294967295` and throw) — a separate,
  self-contained primitive (`[EnforceRange]`/unsigned-long conversion) worth a
  small focused quest.
- The standing CSS `%`→used-px tail remains layout-capped (Quests #109/#110).
