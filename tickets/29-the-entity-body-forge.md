# Scroll 29 — The Entity-Body Forge ⚔️⚔️

> Realm: `xhr/*` — XMLHttpRequest **request body** extraction + Content-Type
> Hold at open: scattered (send body coerced with `String(body)`, no Content-Type)
> **SECURED — +19.** Status: the WHATWG "extract a body" algorithm + the XHR
> §send() request Content-Type rules, all pure-JS in `bootstrap.js` (+ one small
> shared `ops.rs` transport fix for `Content-Length: 0`).

## The gap

`XMLHttpRequest.send(body)` was coercing **every** body type with `String(body)`
and never deriving a request `Content-Type` from the body. So:

- a `String` body sent no `text/plain;charset=UTF-8`;
- a `Document`/`Blob`/`FormData`/`URLSearchParams` body sent garbage
  (`"[object Blob]"`, …) and the wrong (or no) Content-Type;
- an author-set `Content-Type` was never charset-adjusted to UTF-8;
- GET/HEAD requests wrongly carried a body;
- a null/empty POST/PUT body sent no `Content-Length: 0`.

## The work (all in `crates/obscura-js/js/bootstrap.js` unless noted)

1. **`_extractRequestBody(body)`** — WHATWG "extract a body": returns
   `{ text, type, kind }`.
   - `null` → `null`
   - Document (nodeType 9) → serialize; `text/html;charset=UTF-8` for an HTML doc
     (by `contentType`), else `application/xml;charset=UTF-8`
   - `Blob`/`File` → the blob's own `type` (none when the blob has no type)
   - `ArrayBuffer`/any `ArrayBufferView` → no Content-Type
   - `FormData` → `multipart/form-data; boundary=…` (generated boundary)
   - `URLSearchParams` → `application/x-www-form-urlencoded;charset=UTF-8`
   - anything else → USVString → `text/plain;charset=UTF-8`
2. **`_applyRequestContentType(headers, extracted)`** — the XHR §send() step: if
   the author set no Content-Type, use the body's; if the author DID set one, then
   **for Document/string/URLSearchParams bodies only**, adjust an existing
   `charset` parameter to UTF-8 (Blob/BufferSource/FormData keep the author value
   verbatim).
3. **`_parseMimeType` / `_serializeMimeType` / `_adjustCharsetToUTF8`** — a real
   WHATWG MIME parser + serializer. The charset is rewritten to `UTF-8` **only**
   when the type parses, has a `charset`, and it isn't already an ASCII
   case-insensitive `utf-8`. Handles param dedup (first wins), name lowercasing,
   value-case preservation, quoted-string unescaping, and invalid-MIME
   passthrough (unchanged).
4. **GET/HEAD discard the body** — in both `send()` (async) and `_sendSync()`,
   the extracted body is forced to `null` when the method is GET or HEAD.
5. **`ops.rs` `perform_fetch_core`** — a null/empty body on **POST/PUT** now emits
   `Content-Length: 0` explicitly (`.header(CONTENT_LENGTH, "0")`); an empty body
   alone doesn't surface the header over HTTP/2.

Both the async `send()` and the blocking `_sendSync()` paths run the same
extraction + Content-Type application, so async and sync XHR agree.

## Results (before → after)

| Test | Before | After |
|------|:------:|:-----:|
| `xhr/send-content-type-charset.htm` | 12/19 | **19/19** ✅ |
| `xhr/send-content-type-string.htm` | 0/1 | **1/1** ✅ |
| `xhr/send-entity-body-none.htm` | 2/6 | **6/6** ✅ |
| `xhr/send-entity-body-empty.htm` | 1/3 | **3/3** ✅ |
| `xhr/send-entity-body-get-head.htm` | 0/2 | **2/2** ✅ |
| `xhr/send-entity-body-get-head-async.htm` | 0/2 | **2/2** ✅ |
| `xhr/setrequestheader-content-type.htm` | 3/34 | **4/34** ⬆️ (values all correct; name-case capped) |

**+19**, zero regressions (qsa 1975, classlist 1420, createElement 147, mark 22/22,
measures 119/119, structured-clone 141/152, getRandomValues 39/39,
url-setters-stripping 260/260, url-origin 403/403, buffer-full ×3 1/1,
open-method-case-insensitive 6/6, open-url-fragment 4/4, data-uri 10/10,
setrequestheader-bogus-name 71/71, open-method-bogus 8/8, response-json 4/4,
headers-normalize-response 15/15).

## Caps / Next leverage (honest)

- **`setrequestheader-content-type` (30 of 34) — request header NAME case.** Our
  Content-Type *values* are all verified correct (proven by the failure messages),
  but the test asserts the server echoed `Content-Type: …` while the server
  receives `content-type: …` — hyper/the `http` crate lowercases request header
  names on the wire (and HTTP/2 *requires* lowercase). Same transport cap as
  `setrequestheader-allow-empty-value`. **Unwinnable** without a header-name-case
  preserving HTTP client.
- **`status-*` (status-basic/-async ×27 each, status-error ×21) — custom HTTP
  reason phrase.** `statusText` must echo a server-set reason like "UNICORNSWIN".
  wpt.live serves over **HTTP/2 (no wire reason phrase)** and reqwest doesn't
  expose it anyway. **Unwinnable** (widest XHR tail, but architecturally capped).
- **`getallresponseheaders.htm` (0/7) — `.asis` raw-response files.** reqwest can't
  fetch wpt.live's `.asis` fixtures (local `curl` exit 56 too). Standing transport
  cap.
- **`send-entity-body-document` (3/7).** The 4 left need real **document
  serialization with the source charset** (XML-doc-vs-HTML-doc detection on a
  document *loaded from a server file* returned `text/html`; shift-jis body bytes
  came back mojibake). A separate "responseXML/document body charset" vein.
- **Next winnable leverage:** `responsexml-media-type.htm` (7/15) +
  `responsexml-get-twice.htm` (1/4) — the **response** side: build `responseXML`
  by parsing the response per its Content-Type (HTML vs XML vs unsupported), with
  caching. Pure-JS, name-case-independent. Then `responsetext-decoding` /
  `responsedocument-decoding` (charset-aware response decoding).
