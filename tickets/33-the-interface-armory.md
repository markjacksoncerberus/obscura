# 🛡️ Quest #33 — The Interface Armory

> *Realm:* `dom/nodes/Node-cloneNode*` (and the platform-wide HTML element
> interface objects)
> *Hold:* **Node-cloneNode 135/135 (100%)**, cloneNode-document-with-doctype 2/3
> *Difficulty:* ⚔️⚔️
> *Bounty:* **+34** (cloneNode +32, doctype-clone +2)

## The gap

`dom/nodes/Node-cloneNode.html` sat at 103/135. The failing 32 were all the same
shape:

```
[fail] createElement(area)  -> assert_true: HTMLAreaElement is not supported
```

The test does, per tag:

```js
function create_element_and_check(localName, typeName) {
  test(function() {
    assert_true(typeName in window, typeName + " is not supported");   // ← failed here
    var element = document.createElement(localName);
    var copy = element.cloneNode();
    check_copy(element, copy, window[typeName]);                       // instanceof typeName
  }, "createElement(" + localName + ")");
}
```

Obscura defined ~40 `HTML*Element` interface objects, but **all but
HTMLForm/HTMLSpan/HTMLUnknown were a single shared alias of `HTMLElement`**
(`const _HTMLEl = HTMLElement; globalThis.HTMLDivElement = _HTMLEl; …`), and a
large set of interfaces (`HTMLAreaElement`, `HTMLBaseElement`,
`HTMLTableColElement`, `HTMLModElement`, `HTMLObjectElement`, the deprecated
`HTMLDirectoryElement`/`HTMLFontElement`/`HTMLFrameElement`/`HTMLFrameSetElement`,
…) **were simply missing** → `typeName in window` was false.

A further 3 fails were a different bug: cloning a **DocumentType** or a
**Document** (from `DOMImplementation.createDocument`/`createHTMLDocument`)
returned `null` — neither had a `cloneNode`, so the base `Node.cloneNode` (which
handles only element/text/comment) returned `null` and the harness blew up on
`null.nodeType`.

## The work (all `bootstrap.js`, no new Rust)

1. **Distinct HTML interface constructors.** Replaced the shared-alias block with
   data-driven definitions: each `HTML*Element` is now a *real* subclass of
   `HTMLElement` (`HTMLAreaElement !== HTMLDivElement`, as the platform requires),
   with the correct `.name`. Behaviour (`src`/`href` reflection, etc.) lives on
   `Element.prototype` and is shared, so an empty subclass body loses nothing.
   Added the whole previously-missing tail + `HTMLMediaElement` as the shared base
   of `HTMLAudioElement`/`HTMLVideoElement`. `HTMLForm`/`HTMLSpan` (which carry
   behaviour) are left intact.

2. **Canonical tag→interface map.** New `_HTML_IFACE_BY_TAG` (HTML-spec element
   index: `a→HTMLAnchorElement`, `blockquote`/`q→HTMLQuoteElement`,
   `del`/`ins→HTMLModElement`, `td`/`th→HTMLTableCellElement`,
   `tbody`/`tfoot`/`thead→HTMLTableSectionElement`, `dir→HTMLDirectoryElement`, …)
   consulted by `_htmlClassForLocal`; recognized-but-generic tags still map to
   `HTMLElement`, unknown names to `HTMLUnknownElement`. Interface objects resolve
   on `globalThis` at call time, so the map (defined early, next to
   `_KNOWN_HTML_TAGS`) stays independent of the definition-order block far below.
   `createElement('area')` now genuinely produces an `HTMLAreaElement` instance.

3. **`DocumentType.cloneNode()`** — a fresh detached doctype with the same
   `name`/`publicId`/`systemId`.

4. **`DetachedDocument.cloneNode(deep)`** — a new document of the same kind
   carrying the same content type / compat mode / create mode / title; the
   kind-`'html'` auto-built `<html><head><body>` scaffolding is stripped (a clone
   starts empty), and children are copied only for a deep clone.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `dom/nodes/Node-cloneNode.html` | 103/135 | **135/135** ✅ |
| `dom/nodes/Node-cloneNode-document-with-doctype.html` | 0/3 | **2/3** ⬆️ |

**+34.** Zero regressions (qsa 1975, classlist 1420, createElement 147,
createElementNS 596, isEqualNode 9/9, Element-tagName 6/6, mark 22/22,
structured-clone 141/152, getRandomValues 39/39, url-setters-stripping 260/260,
XMLSerializer 27/29, xhr responsexml-non-document-types 5/5).

## Caps / Next leverage

- **`cloneNode-document-with-doctype` "Created with DOMParser" (1/3 remaining):**
  `DOMParser.parseFromString("<!DOCTYPE html><html></html>", "text/html")`
  produces a document whose `childNodes` is just `[HTML]` — **the doctype is
  dropped during the HTML parse** (`doc.doctype === null`). A representational gap
  in the `_IframeDocument` HTML parse path (the doctype isn't materialised as a
  child node), not in cloning. Fixing it means making the parsed HTML document
  expose its `<!DOCTYPE>` as a real first child.
- **`Document-adoptNode.html` 0/4** — `document.adoptNode` is *not implemented*
  (`adoptNode is not a function`). A small, self-contained sibling of cloneNode
  (move a node + its subtree to a new node document; adopting a Document throws
  `NotSupportedError`). Good next quick win.
- The new distinct interface objects are the foundation for the
  `html/dom` / element idlharness tail (interface-object-exists subtests), though
  member-level idlharness still needs per-element IDL attributes.
