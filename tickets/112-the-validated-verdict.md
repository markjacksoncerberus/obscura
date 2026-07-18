# Quest #112 — The Validated Verdict

> *Validate the whole insertion before you move a single node — or the tree pays
> for your haste.*

**Realm:** `dom/ranges/Range-insertNode.html` — the remaining 48 from Quest #111.
**Result:** **1792/1840 → 1840/1840 (+48, 100%).**

## The gap

Quest #111's Caps/Next named the remaining 48 as "cross-document **adoption** +
niche document-insertion validity." Measuring the actual failures showed all 48
shared one trait: **the range's start container is a Document node** — the only
document-container ranges in `testRangesShort`:

```
25  [document, 0, document, 1]
26  [document, 0, document, 2]
29  [foreignDoc, 1, foreignComment, 2]
31  [xmlDoc, 1, xmlComment, 0]
```

× 7 inserted nodes: same-doc element (`paras[0]`), foreign element
(`foreignPara1`/`foreignPara2`), detached element (`detachedPara1`),
`xmlElement`, `doctype`, `foreignDoctype`.

Most of these *should throw* `HierarchyRequestError`: you cannot insert a second
element or a second doctype into a Document that already has one. The test then
asserts the DOM is **unchanged** after the throw.

## Root cause — mutate-before-validate

`Range.insertNode` (DOM spec "insert") does:

1. ensure pre-insertion validity (throw-only, **no mutation**)
2. split a Text start node
3. **remove `node` from its old parent**
4. `parent.insertBefore(node, referenceNode)`

Our `__obscura_ensurePreInsertionValidity` (step 1) was **incomplete**: it checked
parent type, ancestor, NotFound reference, valid node type, and Text/doctype-into-
Document — but **NOT** the Document-parent cardinality rules (one element child,
doctype placement). A comment even said *"Document-parent cardinality rules are
handled by insertBefore"* — i.e. deferred to step 4's `_checkInsertConstraints`.

So for `paras[0]` (element) into a Document that already has a documentElement:
step 1 passed → step 3 **removed `paras[0]` from its parent** → step 4's
`insertBefore` threw `HierarchyRequestError`. The throw was correct, but the node
was already gone from the tree → **DOM mutated**, failing the "unchanged after
throw" comparison. Worse, the orphaned `paras[0]` then corrupted *later* subtests
that reused it (which is why even the genuine-adoption cases on `xmlDoc` — where
the insert should succeed — were failing as collateral damage; adoption itself
already worked, verified by CDP probe).

## The fix (pure JS, bootstrap.js, additive)

Append one call at the end of `__obscura_ensurePreInsertionValidity`:

```js
// Document-parent cardinality (element/doctype/fragment rules) — same machinery
// insertBefore/appendChild use, but evaluated up-front so insertNode can't mutate
// before detecting an invalid Document insertion.
_checkInsertConstraints(parent, node, child);
```

`_checkInsertConstraints` (already shared by `appendChild`/`insertBefore`) holds
exactly the Document cardinality branch. Calling it here makes
`__obscura_ensurePreInsertionValidity` the *complete* spec pre-insertion validity,
so every invalid Document insertion throws **before** the text split / removeChild.
`__obscura_ensurePreInsertionValidity` is called ONLY by `Range.insertNode`, so the
blast radius is `insertNode` + `surroundContents` (which calls it). For non-Document
parents `_checkInsertConstraints` returns early → no behavior change.

## Results

| Test | Before | After | Δ |
|------|-------:|------:|--:|
| `dom/ranges/Range-insertNode.html` | 1792/1840 | **1840/1840** | **+48** |

## Zero-regression sweep

Range family + ritual realms, all byte-for-byte held:
`Range-surroundContents` 1840, `Range-cloneContents` 187, `Range-extractContents`
168/187 (19 pre-existing), `Range-deleteContents` 106/125 (19 pre-existing),
`Range-comparePoint` 5580; `Node-appendChild` 11, `Node-cloneNode` 135,
`Element-classlist` 1420, `Document-createElement` 147,
`ParentNode-querySelector-All` 1975.

**Dev-loop note:** `Range-cloneContents` (187, heavy) TIMES OUT on a degraded
server — it passed 187/187 on a *fresh* server with the change as the first test,
and 187/187 on the stashed baseline. The timeout is server degradation, NOT a
regression (stash-confirmed). Keep heavy Range tests first on a fresh server.

## Caps / Next (ROI)

- **`Range-insertNode` is now 100%.** `surroundContents` is 100% (#111).
- **`Range-extractContents`/`deleteContents` remaining 19 each** — "startOffset and
  endOffset must be the same after" — a range-collapse-offset correctness bug,
  independent of the insertNode validity work. The next-best Range lead.
- The standing CSS `%`→used-px tail remains layout-capped (Quests #109/#110).
