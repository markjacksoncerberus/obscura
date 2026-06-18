# Scroll 31 — The Charset Decipher (`xhr/*` response decoding)

**Status: SECURED — +19 (session 2026-06-18).** Realm: `xhr/*` response decoding.
Difficulty: ⚔️⚔️.

## The gap

`XMLHttpRequest` decoded *every* response body as UTF-8:
- Async path: `const text = await resp.text();` (`Response.text()` is utf-8-only).
- Sync path: `new TextDecoder().decode(respBytes)` (default utf-8).
- `_getDocumentResponse()` parsed `this.responseText` (already utf-8).

So a `Content-Type: …;charset=windows-1252` response, a UTF-16 BOM, or an XML
`encoding=` declaration were all ignored — `responseText`/`responseXML` came back
mojibake.

The fetch core (`perform_fetch_core`, used by both `op_fetch_url` and the blocking
`op_fetch_url_sync`) already returns the **raw bytes** as `bodyBase64`, and `fetch()`
stores them on `Response._bodyBytes`. So this is a pure-JS bootstrap.js change —
**no new Rust** — wiring charset selection over bytes JS already had.

## The work (all in `bootstrap.js`)

New helpers before the `XMLHttpRequest` class:
- **`_xhrFinalMimeRec(xhr)`** — "get a final MIME type": override MIME > response
  Content-Type, missing/unparseable → `text/xml`.
- **`_xhrFinalEncoding(xhr)`** — "get a final encoding": charset of the override
  MIME, else of the final MIME, mapped through `_getEncodingName` (the Quest #08
  WHATWG label table). Returns a canonical name or null.
- **`_xhrDecode(bytes, fallbackEnc)`** — Encoding §"decode": BOM-sniff to pick the
  encoding (a BOM **overrides** the fallback — `EF BB BF`→utf-8, `FE FF`→utf-16be,
  `FF FE`→utf-16le), then `new TextDecoder(enc).decode(bytes)`. `TextDecoder` strips
  a leading *matching* BOM for the Unicode encodings, so feeding it the whole buffer
  is correct; legacy encodings (windows-1252 …) route to `op_text_decode`.
- **`_sniffXMLEncoding(bytes)`** — read the ASCII XML declaration for `encoding=…`.
- **`_prescanMetaCharset(bytes)`** — simplified HTML "prescan a byte stream":
  `<meta charset=…>` in the first 1024 bytes (utf-16→utf-8, x-user-defined→
  windows-1252 per the algorithm).
- **`_xhrResponseText(xhr)`** — §"text response": `_xhrFinalEncoding`, and for the
  **default `""` responseType only** sniff an XML-ish response's declared encoding;
  the explicit `"text"` type never sniffs. Then `_xhrDecode`.

Wiring:
- Both send paths now store `this._responseBytes` and set
  `responseText = _xhrResponseText(this)`; `arraybuffer`/`blob` build from the raw
  bytes, `json` is utf-8-decoded.
- **`_getDocumentResponse`** decodes the bytes for the *document* (distinct rules):
  Content-Type/override charset wins; else HTML `<meta>` prescan / XML declaration;
  else UTF-8 (BOM still wins). Then parses via `_IframeDocument`.
- `open()` resets `_responseBytes`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `xhr/responsetext-decoding.htm` | 22/37 | **37/37** |
| `xhr/responsedocument-decoding.htm` | 2/6 | **6/6** |

**Zero regressions.** XHR held: responsexml-media-type 15/15, get-twice 4/4,
basic 2/2, response-json 4/4, response-data-arraybuffer 1/1, -blob 1/1, data-uri
10/10, send-content-type-charset 19/19, headers-normalize-response 15/15. Core
ritual: qsa 1975, classlist 1420, createElement 147, mark 22/22, measures 119/119,
structured-clone 141/152, getRandomValues 39/39, url-setters-stripping 260/260.

## Caps / Next leverage

- **`responsexml-non-document-types` 1/5** — wants `responseText`/`responseXML` to
  be **throwing getters** (`InvalidStateError`) for the arraybuffer/blob/json/
  document responseTypes. `responseText` is a plain data property today (set in
  several places); making it a getter over a backing field is a small, self-
  contained refactor — the clean next XHR win.
- **`responsexml-non-well-formed` 6/7** — "test 2" expects `null` but the XML
  parser accepts the malformed input (yields a 1-child Document). XML-parser
  well-formedness edge, unrelated to decoding.
- Standing XHR transport caps unchanged (#28–#30): request-header-NAME case
  (hyper lowercases), custom `statusText` reason phrase over h2, `.asis` raw
  responses, `buffer-full-eventually` wall-clock.
