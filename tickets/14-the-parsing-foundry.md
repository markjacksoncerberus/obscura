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

| Test | Start | Inc 1 | Note |
|------|:-----:|:-----:|------|
| `DOMParser-parseFromString-html` | 4/10 | **9/10** | only scripting-disabled-parser case left |
| `DOMParser-parseFromString-xml`  | 0/20 | 0/20 | needs a real namespace-aware XML parser |
| `XMLSerializer-serializeToString`| 1/29 | **3/29** | needs XML parser + spec XML serializer |
| `createContextualFragment`       | 1/35 | 1/35 | fragment-parsing-in-context |
| `insert_adjacent_html`           | 6/31 | 6/31 | (HTML fragment parse edges) |
| `outerhtml-01`                   | 0/1  | 0/1  | |
| `style_attribute_html`           | 1/4  | 1/4  | |

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

## 🐉 Increment 2 — the hard build (the real keystone)

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
