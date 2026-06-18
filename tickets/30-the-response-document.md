# Scroll 30 — The Response Document ⚔️⚔️

> Realm: `xhr/*` — XMLHttpRequest **responseXML** / the "document response"
> Hold at open: `responseXML` was a constant `null` (it was never built)
> **SECURED — +11.** Status: the XHR §"document response" algorithm, pure-JS in
> `bootstrap.js`, reusing the Quest #14 namespace-aware XML parser
> (`_IframeDocument` 'xml') and the Quest #29 MIME parser (`_parseMimeType`).

## The gap

`XMLHttpRequest`'s `responseXML` was a plain data property initialised to `null`
in the constructor and **never assigned**. For a `responseType` of `"document"`
the `response` getter just returned the raw response **text** ("simplified").
So:

- `responseXML` was always `null` even for a well-formed XML response;
- `response` for `responseType="document"` was a `String`, not a `Document`;
- `.response` and `.responseXML` were different values, breaking the
  object-identity contract.

## The spec (XHR §"document response", + "get a response MIME type")

The `responseXML` getter (and `response` when `responseType` is `"document"`)
return the **document response**, computed once and cached:

1. If the response body is null → return null.
2. **Final MIME type** = the override MIME type if set, else the *response* MIME
   type. Crucially, "get a response MIME type" **defaults a missing or
   unparseable `Content-Type` to `text/xml`**. This is why the media-type test
   expects `""`, `"bogus"`, `"application"`, `"bogus+xml"` (none a valid MIME
   type → extraction fails → `text/xml`) to all **parse**.
3. If the final MIME type is neither an **HTML MIME type** (`text/html`) nor an
   **XML MIME type** (subtype ends `+xml`, or essence `text/xml` /
   `application/xml`) → return null.
4. If `responseType` is `""` and the final MIME type is HTML → return null (the
   default response type never parses HTML; only an explicit `"document"` does).
5. Parse: HTML → an HTML document; otherwise → XML. If the XML is **not
   well-formed**, the document response is **null** (not a parsererror doc).

## The work (all in `crates/obscura-js/js/bootstrap.js`)

1. **`responseXML` is now a getter** (was a constructor data property — removed):
   throws `InvalidStateError` unless `responseType` is `""`/`"document"`, returns
   `null` until `DONE`, else the cached document response.
2. **`_getDocumentResponse()`** — runs the algorithm above. Final MIME type via
   `_parseMimeType` (override wins; failure → `text/xml`); XML vs HTML detection;
   parses through `new _IframeDocument(text, url, null, url, 'xml'|'html')`
   (the same real namespace-aware XML parser used by `DOMParser`); a parsererror
   root (`namespaceURI === _PARSERERROR_NS`) collapses to `null`.
3. **Caching for object identity**: the result is memoised in
   `_responseDocCache` (`_responseDocComputed` guard, reset in `open()`), and the
   `case 'document':` arms of **both** `send()` (async) and `_sendSync()` now do
   `this.response = this._getDocumentResponse()`. So `.response` and
   `.responseXML` are the very same object — `responsexml-get-twice`'s identity
   assertions hold.

No new Rust; built entirely on existing primitives.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `xhr/responsexml-media-type.htm` | 7/15 | **15/15** |
| `xhr/responsexml-get-twice.htm` | 1/4 | **4/4** |

**+11.** Zero regressions (fresh-server sweep: qsa 1975, classlist 1420,
createElement 147, mark 22/22, measures 119/119, structured-clone 141/152,
getRandomValues 39/39, url-setters-stripping 260/260; XHR held: response-json
4/4, data-uri 10/10, setrequestheader-bogus-name 71/71, open-method-bogus 8/8,
headers-normalize-response 15/15, send-content-type-charset 19/19,
open-method-case-insensitive 6/6).

## Caps / Next leverage

- **`responsexml-document-properties.htm` is a could-not-run (no-results).** The
  harness summary never completes — the test pulls in
  `html/.../document-lastModified-utils.js` + `redirect.py`-driven async tests and
  asserts the FULL XML-document metadata surface on `responseXML`: `domain`,
  `URL`/`documentURI`/`baseURI`, `referrer`, `contentType === 'application/xml'`,
  `readyState === 'complete'`, `body === null`, `doctype === null`,
  `all`'s prototype === `HTMLAllCollection`, `cookie`, `defaultView`/`location`
  null, plus `lastModified` parsing. That's a wider, separate quest (XML document
  metadata + `lastModified` + a `redirect.py` async path) — the contentType the
  getter already sets (`_serializeMimeType(rec)`) is correct, but the document
  needs the rest of the surface before this test will even tally.
- **Charset-aware response decoding** (`responsetext-decoding`,
  `responsedocument-decoding`): `_getDocumentResponse()` parses `responseText`,
  which is decoded as UTF-8. A response in a legacy charset (per `Content-Type`
  charset or `overrideMimeType`) needs `op_text_decode` on the raw bytes before
  parsing — `_sendSync` already keeps `respBytes`; the async path would need the
  raw bytes threaded through too.
- Standing XHR transport caps unchanged: request-header NAME case (hyper
  lowercases), `status-*` custom reason phrase (h2), `.asis` raw-response.

PATH GOTCHA: these are `.htm` (not `.html`/`.any.html`); `response-json.any.html`
404s (bodyLen=42) — the live path is `response-json.htm`.
