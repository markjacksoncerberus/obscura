# ⚔️ Quest #35 — The Insertion Concord

> *The ParentNode and ChildNode mutation methods — `append`, `prepend`,
> `before`, `after`, `replaceWith`, and the never-built `replaceChildren` —
> each carried their own crooked copy of "convert nodes into a node". Where the
> spec says "stringify the stranger and seat it as a Text node," ours turned it
> away at the door. And `before`/`after`/`replaceWith`, lacking the viable-sibling
> rite, struck down the engine itself when a node was handed its own context.*

**Realm:** `dom/nodes/{ParentNode-append,ParentNode-prepend,ParentNode-replaceChildren,ChildNode-before,ChildNode-after,ChildNode-replaceWith}.html`
**Status:** ✅ **SECURED — +177** (session 2026-06-18)
**Difficulty:** ⚔️⚔️

---

## The gap

Every variant of the DOM mutation-method family implemented the WHATWG
"convert nodes into a node" step ad-hoc, and all of them only handled
`typeof n === "string"`:

```js
append(...nodes) { for (const n of nodes) { if (typeof n === "string") this.appendChild(document.createTextNode(n)); else this.appendChild(n); } }
```

Three distinct defects flowed from this:

1. **Non-Node, non-string arguments were rejected instead of stringified.**
   The WebIDL signature is `(Node or DOMString)... nodes`; a `null`, `undefined`,
   or number argument is coerced by WebIDL to a *string* (`"null"`,
   `"undefined"`, `"5"`) and must become a Text node. Ours passed them straight
   to `appendChild`, which threw `"parameter 1 is not of type 'Node'"`.

2. **`before`/`after`/`replaceWith` had no "viable sibling" algorithm.**
   They inserted naïvely relative to `this`, so `child.before(x, child)` — the
   context node appearing among its own arguments — produced `insertBefore(child,
   child)` and **crashed the engine**. `ChildNode-before/after/replaceWith` were
   entirely dark (could-not-run, the server died mid-test).

3. **`replaceChildren` did not exist at all** (`replaceChildren is not a
   function`).

A fourth, adjacent gap surfaced via the shared `preInsertionValidateHierarchy`
helper these tests use: `appendChild`/`insertBefore` were missing
§ensure-pre-insertion-validity **steps 5–6** (a Text node may not be a
document's child; a doctype may *only* be a document's child; a document may
hold at most one element child and one doctype, doctype first). `replaceChild`
already had them — append/insert did not.

---

## The work (pure JS, `crates/obscura-js/js/bootstrap.js`, no new Rust)

**One shared core, six methods.** Replaced the scattered/duplicated
implementations with a single set of module functions, all built on the spec
"convert nodes into a node":

- **`_isNodeArg(x)`** — a real Node (has `_nid` or numeric `nodeType`).
- **`_convertNodesIntoNode(nodes, doc)`** — map each non-Node argument to
  `doc.createTextNode(String(n))` (so `null`→"null", `undefined`→"undefined",
  `5`→"5"); a single node returns as-is, multiple gather into one
  `DocumentFragment` (atomic insertion).
- **`_insertDoc(node)`** — the node document to mint Text nodes in (a document is
  its own; otherwise `ownerDocument`).
- **ParentNode:** `_pnAppend`, `_pnPrepend`, `_pnReplaceChildren`.
- **ChildNode:** `_cnBefore`, `_cnAfter`, `_cnReplaceWith` (each with the
  viable-sibling walk — the nearest sibling NOT among the inserted nodes),
  `_cnRemove`.

These are installed once onto every interface that exposes them:
- **ParentNode** (append/prepend/replaceChildren) → `Element`,
  `DocumentFragment`, `Document` prototypes.
- **ChildNode** (before/after/replaceWith/remove) → `Element`, `CharacterData`,
  `DocumentType` prototypes. (`DocumentType` previously had *none* of these —
  `doctype.remove()` threw.)

The old in-class `append`/`prepend` (on `Element` and `DocumentFragment`) and
the post-hoc `Element.prototype.before/after/replaceWith` block were removed in
favour of this consolidated mixin.

**Pre-insertion validity (steps 5–6).** New hoisted
`_checkInsertConstraints(parent, node, child)` (mirroring the logic already in
`replaceChild`), called from `appendChild` (child = null) and `insertBefore`
(child = ref) **before** fragment expansion so a multi-element fragment into a
document is rejected atomically. Step 5 is two cheap `nodeType` comparisons on
the hot path; step 6 only runs for the rare document-parent case. Also added the
missing `nodeType === 9` (Document) rejection to `insertBefore`.

`_pnReplaceChildren` runs `_checkInsertConstraints` **before** removing the old
children (per §replace-all "ensure pre-insertion validity" precedes the
removal), so e.g. a second element into a document is rejected while the
existing element child is still present.

---

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `ChildNode-before.html` | 0 (crash) | **45/45** | **+45** |
| `ChildNode-after.html` | 0 (crash) | **45/45** | **+45** |
| `ChildNode-replaceWith.html` | 0 (crash) | **33/33** | **+33** |
| `ParentNode-append.html` | 11/25 | **25/25** | **+14** |
| `ParentNode-prepend.html` | 9/22 | **22/22** | **+13** |
| `ParentNode-replaceChildren.html` | 0 (none) | **25/29** | **+25** |
| `Element-insertAdjacentElement.html` | 5/6 | **6/6** | **+1** |
| `Element-insertAdjacentText.html` | 5/6 | **6/6** | **+1** |

**Total: +177.** (The two insertAdjacent wins are a bonus — their
`_insertAdjacentNode` rides on the now spec-correct `before`/`after`.)

**Zero regressions** (fresh-server sweep): qsa 1975/1975, classlist 1420/1420,
createElement 147/147, createElementNS 596/596, Node-appendChild 11/11,
Node-replaceChild 29/29, Node-cloneNode 135/135, Node-isEqualNode 9/9,
attributes 67/67, mark 22/22, measures 119/119, structured-clone 141/152,
getRandomValues 39/39, url-setters-stripping 260/260, Document-adoptNode 4/4,
Document-constructor 3/5 (unchanged), adoption.window 1/6 (unchanged).

---

## Caps / Next leverage

- **`replaceChildren` atomic "replace all" (the last 4 of 29).** The 2 "should
  move nodes in the right order" fails + 2 "MutationRecords … removed from
  another parent" timeouts all need the spec's atomic replace-all: per-node
  removals/inserts run with the **suppress-observers** flag, then ONE combined
  `childList` MutationObserver record is queued (removed = old children, added =
  new). Obscura's MutationObserver records come **entirely from the Rust queue**
  (`op drain_mutations`); each tree op records its own. Producing one combined
  record needs a **Rust suppress-observers flag (or a `replace_all` op)** — a
  change to the shared mutation system (classlist 1420 / attributes 67 depend on
  it), so it's deferred as a scoped follow-up rather than risked here for +4.
- **`Node-removeChild.html` is a PRE-EXISTING no-results** (verified by
  stash-rebuild on the un-patched binary — same no-results). It references
  `frames[0].document`; not a Quest #35 regression.
- The document-parent `preInsertionValidateHierarchy` cases that involve
  `new Document()` (not `createHTMLDocument`) remain capped on the `new
  Document()` web-ctor footgun (NaN `_nid` → node 0) — same cap named by Quest
  #34's `adoption.window`. These tests happen to use `createHTMLDocument`, so
  they passed; a `new Document()` web ctor is still the standing foundational
  next leverage (template content, DocumentFragment adoption, importNode
  targets).
