# 📜 Quest #34 — The Adoption Papers

> *Realm:* `dom/nodes/Document-adoptNode` (+ the insert-time adopt step)
> *Hold:* **Document-adoptNode 4/4 (100%)**, Node-mutation-adoptNode 2/2 (100%)
> *Difficulty:* ⚔️
> *Bounty:* **+5** (adoptNode +4, deep insert-adopt +1)

## The gap

The named "next quick win" from Quest #33: `dom/nodes/Document-adoptNode.html`
was 0/4, with every subtest failing on the same line —

```
[fail] Adopting an Element called 'x<' should work.
    -> document.adoptNode is not a function
```

`document.adoptNode` was simply never implemented. The test exercises the four
corners of DOM §dom-document-adoptnode:

```js
document.adoptNode(y)            // same document → detach from parent, ownerDocument unchanged
doc.adoptNode(y)                 // cross document → ownerDocument (and descendants) become doc
document.adoptNode(doctype)      // a DocumentType adopts fine
document.adoptNode(someDocument) // a Document throws NotSupportedError (code 9)
```

A neighbouring test, `dom/nodes/Node-mutation-adoptNode.html` (1/2), exposed a
second, older gap: insertion only retargeted the **direct** child's node
document, so appending a *foreign* subtree left its descendants pointing at the
old document:

```js
const old = document.implementation.createHTMLDocument("");
const div = old.createElement("div");
div.appendChild(old.createTextNode("text"));
document.body.appendChild(div);
assert_equals(div.firstChild.ownerDocument, document);  // ← was still `old`
```

## How Obscura models a node's document

A node's **node document** is tracked JS-side by the wrapper's `_ownerDoc` tag —
`Node.ownerDocument` returns `this._ownerDoc || globalThis.document` (so an
untagged node defaults to the page document). Wrappers are cached by node id
(`_cache`), so the tag is stable across `firstChild`/`parentNode`/etc. accesses.
The Rust tree (`obscura-dom`) is a single shared arena; a detached subtree simply
lives there unparented. **Therefore adoption is a pure-JS operation: detach from
the parent, then deep-retag `_ownerDoc`** — no node ever has to physically move
between arenas, and a `DetachedDocument` (from `createDocument`/
`createHTMLDocument`) owns its nodes purely by virtue of the tag.

## The work (all in `bootstrap.js`, no new Rust)

1. **`_setNodeDocumentDeep(node, doc)`** + **`_adoptNodeInto(node, doc)`** (module
   functions before `class Document`) = DOM §concept-node-adopt: remove the node
   from any parent; when the destination document differs from the node's current
   node document, walk the node and every descendant (`firstChild`/`nextSibling`)
   setting `_ownerDoc = doc`.

2. **`Document.adoptNode(node)`** (inherited by `DetachedDocument`): WebIDL Node
   guard → `TypeError`; a Document (`nodeType === 9`) → `NotSupportedError`; else
   `_adoptNodeInto(node, this)` and return the node.

3. **Insert-adopt depth.** `appendChild`/`insertBefore` previously did
   `c._ownerDoc = <parent's document>` — only the direct child. Now they run the
   §insert "adopt node into the parent's node document" step deeply, but *only
   when the node actually crosses documents*:

   ```js
   const _adoptDoc = this.nodeType === 9 ? this : (this.ownerDocument || globalThis.document);
   if (c.ownerDocument !== _adoptDoc) _setNodeDocumentDeep(c, _adoptDoc);
   else c._ownerDoc = _adoptDoc;
   ```

   The cheap `ownerDocument !== _adoptDoc` compare keeps the overwhelmingly common
   same-document append/insert **walk-free** (a single pointer compare), so the
   hot path is untouched. An element's **attributes** need no extra work: an
   `Attr` with an owner element reports `_ownerEl.ownerDocument` (line ~990), so
   they follow the element automatically once it's retagged.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `dom/nodes/Document-adoptNode.html` | 0/4 | **4/4** |
| `dom/nodes/Node-mutation-adoptNode.html` | 1/2 | **2/2** |

**+5**, pure JS, **zero regressions** (qsa 1975, classlist 1420, createElement
147, createElementNS 596, Node-cloneNode 135/135, isEqualNode 9/9, appendChild
11/11, mark 22/22, measures 119/119, structured-clone 141/152, getRandomValues
39/39, url-setters-stripping 260/260).

## Caps (honest)

These remain failing because they need machinery Obscura doesn't model yet — each
a wider quest, not an adoption bug:

- **`dom/nodes/adoption.window.html` (1/6)** — the DocumentFragment/ShadowRoot
  subtests need:
  - a working **`new Document()` web constructor** (today `new Document()` gets a
    NaN `_nid` → Rust ops fall back to node 0, the *live* page document — the same
    footgun fixed for `DocumentFragment` in Quest #14). `doc.createDocumentFragment()`
    over such a document is broken, so the fragment/child ownerDocument asserts
    fail.
  - **template-content owner documents** — `template.content.ownerDocument` must
    differ from `document` (a "template contents owner" document). Obscura builds
    `template.content` from the *main* document's `createDocumentFragment`, so it
    reports `document`.
  - **`attachShadow`/ShadowRoot** — not implemented; the ShadowRoot subtests need
    `adoptNode(shadowRoot)` to throw `HierarchyRequestError`.
- **`dom/nodes/remove-and-adopt-thcrash.html` (0/1)** — needs `window.open()` to
  return a real popup with its own `document` (`popup.document` is null today).

## Next leverage

The **`new Document()` web constructor** is the highest-leverage follow-up: a real
backing fragment node + a distinct node document would unlock the `adoption.window`
DocumentFragment subtests *and* is a foundational primitive (template content
documents, `createDocumentFragment` identity, importNode targets). Else move to a
fresh region — the `dom/` Node-* family, or `fetch/`.
