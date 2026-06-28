# Scroll 116 — The Self-Same Verdict (Quest #116)

**Realm:** `dom/nodes/Node-*` — The Node-Smithing Vaults (Quest 06), the Captain's
Counsel #1 lead after the Range frontier was exhausted by #111–#115.

**Result: +49.** Four bankable correctness fixes, all pure-JS (`bootstrap.js`),
all additive.

| Test | before → after |
| --- | --- |
| `dom/nodes/Node-isSameNode.html` | **0 → 9 (100%)** |
| `dom/nodes/Node-contains.html` | **1444 → 1482 (100%)** |
| `dom/nodes/Node-cloneNode-XMLDocument.html` | **0 → 1 (100%)** |
| `dom/nodes/Node-cloneNode-document-with-doctype.html` | **2 → 3 (100%)** |

## The gaps & the fixes

The Node-Smithing realm baselined far greener than the quest board's "~150"
estimate — `compareDocumentPosition` (1444), `lookupNamespaceURI` (75),
`textContent` (81), `properties` (726), `nodeName`, `appendChild`, `replaceChild`,
`baseURI`, `parentElement`, `isEqualNode`, the `ChildNode-*`/`ParentNode-*` family
were already 100%. Four pockets of red remained:

### 1. `isSameNode` — the falsy-arg leak (+9, the whole test was dark)
`Node.prototype.isSameNode(other) { return other && this._nid === other._nid; }`
returned the **argument verbatim** (`null`) when `other` was nullish, but WebIDL
`boolean` must coerce — WPT asserts `assert_false(node.isSameNode(null))` and `null`
is not `false`. Also `Attr` is **not a Node subclass** here, so `attr.isSameNode`
was missing entirely (`is not a function`).
- `Node.isSameNode`: `return other != null && this._nid === other._nid;` — a real
  `false` for the null case; identity-by-`_nid` unchanged for real nodes.
- `Attr.isSameNode(other) { return other === this; }` — Attr objects are
  identity-cached on their element (and held directly when detached), so a plain
  reference compare *is* the spec's "otherNode is this".

### 2. `contains` — strict vs inclusive descendant (+38)
DOM §4.4: `contains(other)` is true iff `other` is an **inclusive** descendant of
`this` — a node contains *itself*. Ours delegated to the Rust `contains` op which
tests strict descendant only (the internal callers at 4 sites already added their
own `node._nid === this._nid || node.contains(this)` self-check to compensate, which
was the tell). Every one of the 38 fails was `node.contains(node)` → false.
- `contains(o) { return o ? (o._nid === this._nid || _dom("contains",…) === "true") : false; }`
  Folding the self case into the method makes the internal callers' manual
  self-checks redundant (still correct) and is more correct for MutationObserver
  subtree matching (an observed node *is* in its own subtree).

### 3. `cloneNode` on an XMLDocument returned the wrong interface (+1)
`DetachedDocument.cloneNode` hardcoded `new DetachedDocument(this._kind)`, so cloning
an `XMLDocument` (createDocument's product) produced a bare `DetachedDocument` and
`clone.constructor === XMLDocument` failed. §clone-a-node makes a node implementing
the **same interface**. Fix: branch `(this instanceof XMLDocument) ? new XMLDocument(...) : new DetachedDocument(...)`.
`XMLDocument` inherits DetachedDocument's `(kind)` constructor, so the call is valid.
Branched explicitly (not via `this.constructor`) because `_IframeDocument` is a
sibling subclass with a *different* constructor signature `(html,url,el,…)` — a blind
`this.constructor(this._kind)` would break iframe-document clones.

### 4. DOMParser HTML drops the `<!DOCTYPE>` (+1)
The HTML parse path in `_IframeDocument` strips `<!DOCTYPE …>` (it parses into a
synthetic html/head/body scaffold) and never re-creates a DocumentType child, so a
DOMParser-parsed `<!DOCTYPE html><html></html>` had **1** child (the root) where the
spec wants **2** (doctype + root). Fix: parse the doctype name/publicId/systemId out
of the source in `DOMParser.parseFromString` and `insertBefore` a real
`createDocumentType` node ahead of `documentElement`. **Scoped to the DOMParser entry
point on purpose** — adding a doctype inside `_IframeDocument`'s ctor would perturb
the child counts the Range content-op harness (insertNode/surroundContents, 1840
each) relies on for iframe documents.

## Zero-regression sweep
Held: Node-cloneNode 135, Node-properties 726, Node-isEqualNode 9,
compareDocumentPosition 1444, qsa 1975, classlist 1420, createElement 147,
surroundContents 1840, insertNode 1840, extractContents 187, deleteContents 125,
cloneNode-svg 4, disabled 7/7. **Stash-proved** the two at-risk suspects pre-existed:
`MutationObserver-childList` could-not-run on old code too (harness cap, not the
`contains` change), and `DOMParser-parseFromString-html` was already 9/10 (the lone
fail is `<noscript>` scripting-disabled parsing, unrelated).

## Caps / Next
- **`Node-removeChild.html`** — heavy-test HANG (could-not-run even fresh-first; the
  harness *loads* per `harness_probe` but never completes). Same family as the
  `Node-insertBefore.html` / `Range-mutations-insertBefore.html` hangs (#111/#115).
- **`ParentNode-querySelector-escapes.html`** 66/68 — the 2 fails are lone-surrogate
  element IDs (`\ud83d…`). CSS `\d83d ` escape consumes to U+FFFD; the element ID is
  the lone surrogate U+D83D, so they must NOT match. Our Rust DOM stores attribute
  strings as UTF-8, which **cannot represent a lone surrogate** → it's coerced to
  U+FFFD on storage, so both sides become FFFD and wrongly match. A Rust-string
  encoding cap.
- **`ParentNode-replaceChildren.html`** 25/29 — the known atomic "replace all"
  MutationObserver-record cap (needs a Rust suppress-observers flag).
- **`Node-parentNode.html`** 4/5 — the lone fail is "Removed iframe":
  `iframe.parentNode` is `undefined` inside the markup `onload` handler — an
  iframe-realm wrapper issue, deferred.
- **`MutationObserver-*`** — could-not-run (harness cap), worth a separate look if a
  fresh harness gate opens.
- **NEXT best leads:** the Node-Smithing realm is now ~exhausted of cheap wins.
  Broaden to a fresh CSS region or revisit the `MutationObserver-*` / iframe-realm
  harness gates. CSS `%`→used-px stays layout-capped (#109/#110).
