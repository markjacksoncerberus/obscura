# Scroll 38 — The Document Charter

> *Realm:* `dom/nodes/DOMImplementation-createDocument` (+ `adoption.window`)
> *Status:* **SECURED — +116, zero regressions** (session 2026-06-18)
> *Difficulty:* ⚔️⚔️ a proper campaign (pure JS, no new Rust)

## The gap

`dom/nodes/DOMImplementation-createDocument.html` was **320/434** — the widest
single DOM frontier left, named as the "next leverage" pointer across Quests
#34–#37. The 114 fails were all document-**identity** `assert_equals` failures:

```
assert_equals: expected Document node with 2 children but got Document node with 2 children
```

— i.e. two *distinct* objects where the test wanted `===`. This is the
**`new Document()` footgun** flagged since Quest #34: `implementation.createDocument`
returned `new DetachedDocument('xml')`, but the returned wrapper's interface
identity / prototype and the WebIDL argument handling were wrong:

1. **Wrong prototype.** The suite asserts
   `Object.getPrototypeOf(doc) === XMLDocument.prototype` *exactly*. `XMLDocument`
   was defined as `class XMLDocument extends Document {}` — an abstract `Document`
   subclass with no real backing node — and `createDocument` returned a
   `DetachedDocument`, not an `XMLDocument`, so the prototype never matched.
2. **No argument validation.** `createDocument(ns, qname, doctype)` requires its
   first two arguments (calling with `<2` must throw `TypeError`), and the third
   is a nullable `DocumentType` (anything that isn't `null`/`undefined`/a real
   `DocumentType` must throw `TypeError` during argument conversion). Neither was
   checked.
3. **Wrong WebIDL coercion + node order.** `namespace` is `DOMString?`
   (`null`/`undefined` → `null`, else stringified); `qualifiedName` is
   `[LegacyNullToEmptyString] DOMString` (`null` → `""` but `undefined` →
   `"undefined"`). The old code used `namespace || null` and `if (qualifiedName)`,
   and created the doctype before the document element — but the spec creates the
   document element **first** (so an invalid qualified name throws *before* any
   node is appended).

## The fix (pure JS, `bootstrap.js`, no new Rust)

**1. `XMLDocument` is now a real fragment-backed detached document.**

```js
globalThis.XMLDocument = class XMLDocument extends DetachedDocument {};
```

`DetachedDocument` already allocates a real backing `document_fragment` node and
marks it a real document (`mark_real_document`), so an `XMLDocument` instance now
has a **distinct backing Document node** — tree ops no longer fall back to node 0
(the live page document). `DOMParser`'s XML branch keeps returning a plain
`_IframeDocument` (a *sibling* `extends DetachedDocument`), so the HTML-spec
assertion `!(doc instanceof XMLDocument)` for parsed documents still holds.

**2. `createDocument` returns `new XMLDocument('xml')`** and now runs the spec
algorithm in order:

- `arguments.length < 2` → `TypeError`.
- `doctype` not `null`/`undefined`/a `DocumentType` → `TypeError`.
- content type derives from `namespace` (XHTML → `application/xhtml+xml` +
  `_createMode='xhtml'`; SVG → `image/svg+xml`; else `application/xml`).
- WebIDL coercion: `ns = (ns==null) ? null : String(ns)`,
  `qname = (qname===null) ? "" : String(qname)`.
- create the document element **first** (`createElementNS(ns, qname)` — throws on
  an invalid name before any append), then append the doctype, then the element.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `dom/nodes/DOMImplementation-createDocument.html` | 320/434 | **434/434** ✅ 100% |
| `dom/nodes/adoption.window.html` | 1/6 | **3/6** ⬆️ |

**+116, zero regressions.** The `adoption.window` DocumentFragment subtests came
along for free: a real `new Document()`-shaped object (via `XMLDocument`) now has
its own backing node instead of aliasing node 0, so adopting into a fresh
document behaves.

### Zero-regression sweep

The `XMLDocument extends DetachedDocument` change is shared and risky (anything
doing `instanceof XMLDocument` / relying on its prototype). All held:

- DOMParser-parseFromString-xml **20/20**, XMLSerializer **27/29**
- xhr responsexml-media-type **15/15**, responsexml-non-document-types **5/5**
  (both return `XMLDocument`)
- Node-cloneNode **135/135**, Document-adoptNode **4/4**
- qsa **1975/1975**, TreeWalker **761/761**, classlist **1420/1420**
- createElement **147/147**, createElementNS **596/596**
- structured-clone **141/152**, url-setters-stripping **260/260**, mark **22/22**

## Caps / Next

- **`DOMImplementation-createDocumentType.html` is 1/82** — a freshly exposed,
  high-leverage frontier sitting right next door. `createDocumentType` is still
  naive (`new DocumentType(nid, String(qname), String(publicId ?? ""), …)`): it
  lacks the argument-count check (3 required), WebIDL `[LegacyNullToEmptyString]`
  coercion, the qualified-name validity check (`InvalidCharacterError` /
  `NamespaceError`), and the correct `ownerDocument` (a bare `createDocumentType`
  belongs to the page document). **Recommended next quest (#39).**
- `adoption.window` 3/6 — the remaining 3 need `attachShadow`/ShadowRoot and
  `window.open()` popup documents (each a wider quest, named since #34).
- `Document-constructor.html` 3/5 — the 2 fails are interface-identity edges
  (`new Document()` web ctor returning a plain `Document`, not yet a real backing
  node like `XMLDocument`); a small follow-up could make `new Document()` mirror
  the `XMLDocument`/`DetachedDocument` model.
- `createHTMLDocument` 12/13 (unchanged).
