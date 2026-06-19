# Quest #40 — The Standalone Charter

**Realm:** `dom/nodes/Document-constructor.html` — the `new Document()` web constructor
**Hold before:** 3/5 · **Hold after:** **5/5** (+2)
**Difficulty:** ⚔️ quick & decisive · **Status:** ✅ SECURED
**Session:** 2026-06-19 · Pure JS (`bootstrap.js`), no new Rust.

---

## The gap

`new Document()` is the DOM §dom-document constructor: a fresh, empty, standalone
document of XML type (content type `application/xml`, NOT an HTML document). It was
the foundational primitive flagged as "next leverage" since Quests #34/#36/#38.

The two failing subtests:

```js
// "new Document(): interfaces"
var doc = new Document();
assert_equals(Object.getPrototypeOf(doc), Document.prototype);   // FAILED

// "new Document(): metadata"
assert_equals(doc.createElement("a").constructor, Element);       // FAILED
```

### Root cause

The old constructor returned a **subclass instance**:

```js
constructor(nid) {
  super(typeof nid === 'number' ? nid : -1);
  if (typeof nid !== 'number') return new DetachedDocument('xml');   // ← subclass
}
```

1. **Prototype identity.** `new Document()` → a `DetachedDocument`, so
   `Object.getPrototypeOf(doc)` is `DetachedDocument.prototype`, never
   `Document.prototype`. There is no prototype trick that gives both
   `Document.prototype` as the immediate prototype AND DetachedDocument's scoped
   method behavior — method resolution walks the *actual* chain.

2. **createElement interface.** DetachedDocument's XML `_createElementXML` used
   `_wrapEl(nid)`, which picks an HTML interface class by tag (`"a"` →
   `HTMLAnchorElement`). Per §createElement, a document whose namespace is null (an
   XML document, not HTML/XHTML) must create **plain `Element`** nodes.

## The fix

Make `new Document()` a genuine `Document` instance set up as **standalone**, with
the base class branching on an instance flag rather than delegating to a subclass.

### Constructor

```js
constructor(nid) {
  if (typeof nid === 'number') { super(nid); return; }   // page / wrapped node
  super(+_dom("create_document_fragment"));              // real backing node
  _cache.set(this._nid, this);                           // canonical wrapper
  _dom('mark_real_document', this._nid);                 // :root matches its root
  this._standalone = true;
  this._kind = 'xml';
  this._createMode = 'xml';
}
```

### Base-class `_standalone` branches

| Member | Page document | Standalone (`new Document()`) |
|---|---|---|
| `documentElement` | `_dom("document_element")` (global) | scan own children for an Element |
| `doctype` | cached `_doctype` | scan own children for nodeType 10 |
| `querySelector{,All}` / `getElementById` | global ops | `*_scoped` ops on `this._nid` |
| `URL` / `documentURI` | page URL | `about:blank` |
| `location` / `defaultView` | `globalThis.location` / `globalThis` | `null` |
| `contentType` | `text/html` | `application/xml` |
| `_isHTMLDoc` | `true` | `false` |
| `createElement` | lowercase + HTML | `_createElementXMLInto(this, t, null)` |
| `createCDATASection` | throws `NotSupportedError` | creates a CDATA node |
| `createTextNode`/`createComment`/`createDocumentFragment`/`createProcessingInstruction` | (no tag) | tag `_ownerDoc = this` |

`createElementNS` needed no change — it already tags `_ownerDoc = this` and picks an
HTMLElement subclass only for the HTML namespace (so the "URL parsing" subtest's
`createElementNS(xhtml, "a")` is `HTMLAnchorElement` and `href` parses).

### Shared XML-element helper

`DetachedDocument._createElementXML` and the standalone `createElement` now share one
module function:

```js
function _createElementXMLInto(doc, t, ns) {
  const name = (t === undefined) ? "undefined" : String(t);
  if (!_isValidElementName(name)) throw new DOMException(..., "InvalidCharacterError");
  const nid = +_dom("create_element", name);
  if (nid < 0 || isNaN(nid)) return null;
  let el = (ns === _HTML_NS)
    ? _wrapEl(nid)                                    // XHTML keeps HTMLElement iface
    : (_cache.get(nid) || new Element(nid));          // XML → plain Element
  _cache.set(nid, el);
  // pin case-preserved identity as own props; tag owner doc
  Object.defineProperty(el, 'localName',    { value: name, configurable: true });
  Object.defineProperty(el, 'tagName',      { value: name, configurable: true });
  Object.defineProperty(el, 'prefix',       { value: null, configurable: true });
  Object.defineProperty(el, 'namespaceURI', { value: ns,   configurable: true });
  el._ownerDoc = doc;
  return el;
}
```

The xhtml path is byte-identical to before (`_wrapEl`); the only behavior change is
that an XML (null-namespace) `createElement` now yields plain `Element` — more
spec-correct, and unobservable to existing tests (they parse rather than createElement
on XML detached docs).

## The latent landmine (caught in the regression sweep)

`dom/common.js` — the shared fixture for **TreeWalker, Range, and many `dom/` tests** —
does:

```js
const xmlDocument = new Document();
paras[5].appendChild(xmlDocument.createCDATASection("1234"));
```

The base `Document.createCDATASection` throws `NotSupportedError` on HTML documents.
A naïve standalone `new Document()` inherits that throw, so this line **threw during
common.js setup and aborted the entire harness** — `TreeWalker.html` dropped from
761/761 to could-not-run. Fixed by making standalone (XML-type) documents create a
real CDATA node. Lesson: `new Document()` is load-bearing far beyond its own test —
sweep the common-fixture consumers, not just the target.

(Also restored `adoption.window` to 3/6: its "appendChild() and DocumentFragment"
subtest needs `new Document().createDocumentFragment().ownerDocument === doc`, which
is why the standalone factories tag `_ownerDoc`.)

## Results

| Test | Before | After |
|---|---|---|
| `dom/nodes/Document-constructor.html` | 3/5 | **5/5** |

**Zero regressions** (fresh-server sweep): Document-createElement 147/147,
createElementNS 596/596, DOMImplementation-createDocument 434/434, -createDocumentType
82/82, -createHTMLDocument 12/13, Node-cloneNode 135/135, Document-adoptNode 4/4,
adoption.window 3/6 (restored), DOMParser-parseFromString-xml 20/20,
XMLSerializer-serializeToString 27/29, responsexml-media-type 15/15, TreeWalker
761/761, Range-cloneContents 181/187, ParentNode-querySelector-All 1975/1975,
Element-classlist 1420/1420, Element-tagName 6/6, structured-clone 141/152, mark
22/22, getRandomValues 39/39, url-setters-stripping 260/260.

## Caps / next leverage

- **`adoption.window` 3/6 tail** needs **template-content owner documents**
  (`template.content.ownerDocument !== document`) + **`attachShadow`/ShadowRoot** —
  both standing caps named since #34. The remaining ShadowRoot subtests also need
  `attachShadow` to exist.
- The `dom/nodes/` **document-creation vein is now fully clean** —
  `create{Document,DocumentType,Element,ElementNS,HTMLDocument}` and `new Document()`
  are all green or capped on a named architectural primitive.
- **Best next regions:** a **fresh realm** — `dom/` Node-* heavy fixtures, `fetch/`,
  or `html/dom/` reflection — or the standing **`replaceChildren` atomic-record Rust
  op** (#35 cap; also benefits innerHTML/textContent MutationObserver granularity).
- **PATH GOTCHA:** the bare `structured-clone.any.html` path now **404s on wpt.live**
  (bodyLen=42, could-not-run) — the live path is
  `html/webappapis/structured-clone/structured-clone.any.html` (141/152). Update the
  ritual sweep accordingly.
