# 🗺️ Scroll #14 — The Parsing Foundry (`domparsing`)

> *Where markup becomes DOM and DOM becomes markup. `DOMParser`, `XMLSerializer`,
> `createContextualFragment`, `insertAdjacentHTML`, `outerHTML`. The realm the
> campaign long deferred as "needs a real XML DOMParser" — now opened.*

**Realm:** `domparsing/*`. Baseline measured 2026-06-16 (stratified sweep + direct runs).

**Code:** `globalThis.DOMParser` / `XMLSerializer` @ `crates/obscura-js/js/bootstrap.js`
~4459; HTML/XML doc machinery is `_IframeDocument` (~5328) extends `DetachedDocument`
(~2168). HTML parsing is html5ever (via the `innerHTML`/fragment op); there is **no
real XML parser** yet.

---

## 📊 Standing

| Test | Start | Inc 1 | Inc 2 | Note |
|------|:-----:|:-----:|:-----:|------|
| `DOMParser-parseFromString-html` | 4/10 | **9/10** | 9/10 | only scripting-disabled-parser case left |
| `DOMParser-parseFromString-xml`  | 0/20 | 0/20 | **20/20** ✅ | real namespace-aware XML parser |
| `XMLSerializer-serializeToString`| 1/29 | **3/29** | **27/29** | spec XML serializer; 2 left = hard spec edges |
| `createContextualFragment`       | 1/35 | 1/35 | 1/35 | fragment-parsing-in-context |
| `insert_adjacent_html`           | 6/31 | 6/31 | 6/31 | (HTML fragment parse edges) |
| `outerhtml-01`                   | 0/1  | 0/1  | 0/1 | |
| `style_attribute_html`           | 1/4  | 1/4  | 1/4 | |

**Retroactive (Inc 2 unlocked):** `Node-normalize` 3→**4/4** ✅ (XML + CDATA),
`Element-tagName` 5→**6/6** ✅ (XML DOMParser case).

---

## ⚔️ Increment 1 — SECURED (+7, zero regressions)

**Real `DOMParser.parseFromString` (was a stub returning the live `globalThis.document`
— a footgun: mutating a "parsed" doc mutated the real page).**
- `text/html` → a real detached HTML document via `_IframeDocument('html')`; sets
  `contentType='text/html'` and `compatMode` (no-quirks `CSS1Compat` iff a leading
  `<!DOCTYPE html>`, else `BackCompat`).
- XML types (`text/xml`/`application/xml`/`application/xhtml+xml`/`image/svg+xml`) →
  a detached doc carrying the right `contentType` + page URL (best-effort; full parse
  is Increment 2).
- Invalid `type` → `TypeError` (WebIDL enum).
- Made `_IframeDocument`'s `compatMode`/`contentType`/`location` getters honor the
  DOMParser-set fields (`_compatMode`/`_contentType`; `location` → `null` when there's
  no iframe element). **parseFromString-html 4→9, XMLSerializer 1→3.**

Held: qsa 1975, classlist 1420, createElement 147, iframe-load 2/2, content_document 1/1.

---

## ⚔️ Increment 2 — SECURED (the keystone, +46, zero regressions)

**A real namespace-aware XML parser + the W3C spec `XMLSerializer`** — the long-
deferred keystone. All in `bootstrap.js` (no new Rust): builds on the existing
`createElementNS` / `setAttributeNS` namespace-aware machinery.

- **`_parseXMLDocument(src, doc)`** — a hand-rolled XML tokenizer (NOT html5ever,
  which lowercases + HTML-namespaces). Tracks an xmlns scope stack, resolves
  element/attr prefixes to their declared URIs, builds the tree via
  `doc.createElementNS(uri, qname)` + `setAttributeNS` (xmlns decls kept as
  attributes so the serializer sees them), handles text/CDATA/comment/PI/entity
  refs + the `<?xml?>` decl. **Chose a JS parser over xml5ever deliberately:**
  xml5ever implements *XML5* (error-recovering, no fatal well-formedness errors),
  so it could never produce a `parsererror` for `<foo>` — the core test gate.
  Non-well-formed input → a Gecko-style `parsererror` document (root
  namespaceURI `http://www.mozilla.org/newlayout/xml/parsererror.xml`).
- **`globalThis.XMLDocument`** defined (Document subclass) so
  `!(doc instanceof XMLDocument)` evaluates — per the HTML spec, DOMParser's XML
  branch returns a plain `Document`, NOT an `XMLDocument` (unlike createDocument /
  XHR). DOMParser now routes ALL four XML types (incl. `application/xhtml+xml`,
  `image/svg+xml`) through the real XML parser.
- **The W3C "DOM Parsing and Serialization" XML serialization algorithm** —
  namespace prefix map (ns→prefix list) + `copy`/`add`/`found`/`retrieve`,
  `generate a prefix` (`ns${i}`), `record the namespace information`, the element
  qualified-name/xmlns logic (reset/redundancy, `ignore ns def attr`), per-attr
  prefix selection (nearest prefix, generated-prefix conflicts), attribute-value
  escaping (`&#x9;`/`&#xA;`/`&#xD;`), self-closing empty non-HTML elements
  (`<div/>`) vs HTML empty (`<div></div>`) vs HTML void (` />`).
- **Footgun fixed:** `new DocumentFragment()` (web-facing ctor, no nid) didn't
  allocate a backing node → `_nid` undefined → Rust ops fell back to node 0 (the
  LIVE page document!). Now allocates via `create_document_fragment`. Also added
  the ParentNode `append`/`prepend`/`childElementCount` to DocumentFragment
  (Element had them; DocumentFragment extends Node directly).

**parseFromString-xml 0→20/20, XMLSerializer 3→27/29, Node-normalize 3→4/4,
Element-tagName 5→6/6.** Held: qsa 1975, classlist 1420, createElement 147,
url-origin 403, encoding 3421, iframe-load 2/2, content_document 1/1,
isEqualNode 9/9, Range-clone/extract 177/159, cloneNode 103, appendChild 11/11.

**2 XMLSerializer tails left (hard spec edges, honest):**
1. *XLink prefix preservation* — `setAttributeNS(xlink, 'xl:type', 'v')` on a
   fresh element: spec/w3c-xmlserializer generate `ns1` (what we emit); Chrome
   preserves `xl`. Genuinely contradicts the "NOT preserved" subtest (which we
   pass per spec); they appear mutually exclusive across browsers.
2. *`xmlns=""` kept vs dropped* — DOM-Parsing issues #44/#52: keeping `xmlns=""`
   for the `<root xmlns="" xmlns:foo="urn:bar"/>` case is mutually exclusive with
   dropping redundant `xmlns=""` in `<root xmlns=""><child xmlns=""/></root>`
   (which we pass). One branch tweak trades one for the other — a wash.

---

## 🐉 (historical) Increment 2 plan — the hard build (the real keystone)

**A namespace-aware XML parser + a spec `XMLSerializer`.** This is THE deferred keystone
(cited across the campaign memory). Proof it's the gate: every `XMLSerializer-serializeToString`
subtest does `(new DOMParser()).parseFromString(xml, 'text/xml').documentElement` first, and
the asserts check namespace serialization (`xmlns` reset/redundancy rules, self-closing empty
elements `<div/>`). html5ever is an HTML parser — it lowercases + HTML-namespaces, so the XML
path needs either a real XML parser (a Rust op over `quick-xml`/`xml-rs`, producing
`createElementNS`-built nodes with true namespaces + a `parsererror` doc on non-well-formed
input) or a hand-rolled namespace-tracking XML→DOM in JS.

This also retroactively unlocks deferred tails in other quests:
`Node-normalize` 3/4→4/4 (XML + CDATA), `Element-tagName` 5/6→6/6, `isEqualNode` documents.

Remaining HTML-side veins (separate, html5ever-fragment work): `createContextualFragment`
(parse-in-context), `insert_adjacent_html` edges, `outerhtml`.
