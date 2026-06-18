# Scroll #27 — The XHR Foundry

> *Realm: `xhr/*` (XMLHttpRequest). A 231-test frontier sitting right beside the
> resource-timing lands we've been mining. Most of it is dark. This scroll opens
> it.*

Status: **OPENED** — session 2026-06-18, +94 subtests, zero regressions.

---

## The lay of the land (baseline, 2026-06-18)

`xhr/*` has **231 HTML tests**. A stratified baseline (curl-verified paths only —
~⅓ of guessed `.htm` names 404, and a 404 body is the 42-byte JSON that reads as a
`bodyLen=42` could-not-run, NOT a regression) showed the realm largely dark:

| Test | Baseline | Note |
|------|:--------:|------|
| `response-json.htm` | 4/4 ✅ | the happy async path already works |
| `getresponseheader-unsent-opened-state.htm` | 1/1 ✅ | |
| `getresponseheader-error-state.htm` | 1/1 ✅ | |
| `data-uri.htm` | **0/10** | `data:` URLs fail — reqwest can't fetch them |
| `setrequestheader-bogus-name.htm` | **0/71** | `setRequestHeader` did **zero** validation |
| `setrequestheader-bogus-value.htm` | **0/5** | same |
| `open-method-bogus.htm` | **0/8** | `open()` didn't validate the method |
| `open-method-case-insensitive/sensitive.htm` | 0/6, 0/9 | **sync XHR** (cap) |
| `headers-normalize-response.htm` | 0/15 | response-header value normalization |
| `getallresponseheaders.htm` | 0/7 | `.asis` raw responses (cap, see below) |
| `responseurl.html` | 0/2 | **sync XHR** (cap) |

**Method note:** tests are served from real `wpt.live` (the `.py` / `.asis`
server-side handlers run), so a 0% is a real correctness gap, not a missing
handler — *except* the `.asis` raw-response tests (see Caps).

---

## Increment 1 (this session, +94) — async correctness, no new architecture

Three self-contained fixes in `crates/obscura-js/js/bootstrap.js`, all pure JS.

### 1. `data:` URLs in `fetch()` (+10 — `data-uri.htm` 0→10/10)

`op_fetch_url` is backed by **reqwest** (HTTP only), so a `data:` URL fetch errored
and XHR fired its `error` event (`t.unreached_func` → "Reached unreachable code").
Now `fetch()` handles `data:` URLs in-process, mirroring the existing `blob:` branch:

- New `_processDataURL(url)` = the WHATWG **"data: URL processor"**: strip `data:`
  + fragment, split on the first `,`, trim the MIME type, percent-decode the body
  (`_percentDecodeBytes`), handle the `;base64` suffix (isomorphic-decode →
  `_base64ToUint8Array`, then strip `";base64"` + trailing `;`/spaces off the MIME
  type), prepend `text/plain` for a leading-`;` type, default to
  `text/plain;charset=US-ASCII` for an empty type.
- The synthesized `Response` carries `content-type` only (so
  `getAllResponseHeaders()` includes Content-Type but **not** Content-Length, per the
  test) and a `HEAD` request yields an empty body.

### 2. `setRequestHeader()` validation (+76 — bogus-name 0→71, bogus-value 0→5)

`setRequestHeader(name, value)` was `this._headers[name] = value` — no checks. Now it
runs the §setRequestHeader steps:

- **WebIDL ByteString coercion** of both args (`_toByteString`): any code unit
  > 0xFF → `TypeError` (catches `"ﾃｽﾄ"`, `"X-ﾃｽﾄ"`); a missing 2nd arg → `TypeError`.
- State must be OPENED → else `InvalidStateError`.
- **Normalize** the value (strip leading/trailing HTTP whitespace).
- `name` must be an **HTTP token** (`_isHTTPToken`, RFC 7230 tchar set) and `value`
  must be a **header value** (no `\0`/`\r`/`\n`) → else `SyntaxError`.
- **Combine** with any case-insensitive existing name (`a, b`), per spec.

### 3. `open()` method validation/normalization (+8 — `open-method-bogus.htm` 0→8/8)

`open(method, url)` now ByteString-coerces the method, rejects non-token methods with
`SyntaxError` (`""`, `">"`, `" GET"`, `"G T"`, `"@GET"`, `"G:ET"`, `"GET?"`,
`"GET\n"`), rejects the **forbidden** methods CONNECT/TRACE/TRACK with `SecurityError`,
and **byte-uppercases** the well-known methods (DELETE/GET/HEAD/OPTIONS/POST/PUT).

### New shared helpers

`_HTTP_TOKEN_RE` / `_isHTTPToken`, `_toByteString`, `_isHeaderValue` /
`_normalizeHeaderValue`, `_XHR_NORMALIZE_METHODS` / `_XHR_FORBIDDEN_METHODS`,
`_percentDecodeBytes`, `_processDataURL`.

### Results

| Test | Before | After |
|------|:------:|:-----:|
| `xhr/data-uri.htm` | 0/10 | **10/10** ✅ |
| `xhr/setrequestheader-bogus-name.htm` | 0/71 | **71/71** ✅ |
| `xhr/setrequestheader-bogus-value.htm` | 0/5 | **5/5** ✅ |
| `xhr/open-method-bogus.htm` | 0/8 | **8/8** ✅ |

**Zero regressions** (fresh-server sweep): qsa 1975, classlist 1420, createElement
147, mark 22/22, measures 119/119, structured-clone 141/152, getRandomValues 39/39,
url-setters-stripping 260/260, url-with-xhr 14/14, url-with-fetch 16/16,
clear-resource-timings 1/1, status-codes 1/1, buffered-flag.any 1/1, response-json
4/4, content-type 16/21 (peak; bounces 13↔16 on cross-origin network timing — a
documented flaky cap, unchanged by this work).

---

## Caps / Next leverage

- **Synchronous XHR** is the single widest remaining lever in this realm — and it's
  the *same* architectural cap already named in Quest #25 (×4 buffer-full) and #26
  (×2 no-cors XHR). Obscura's `XMLHttpRequest.send` is always async
  (`fetch().then()`). A blocking sync-XHR Rust op (the per-page thread can block)
  would unlock: `open-method-case-insensitive`/`-sensitive` (15),
  `setrequestheader-allow-empty-value` (3, echoes the header back synchronously),
  `responseurl.html` (2), the `*-sync.htm` family (~18), plus the resource-timing
  tails. **This is the recommended next increment for the realm** (⚔️⚔️⚔️).
- **`.asis` raw-response tests** (`getallresponseheaders.htm`, etc.) — wpt.live serves
  these as raw HTTP responses with odd reason phrases / no Content-Length; reqwest
  (and even local `curl`, exit 56) chokes on the connection. Likely an
  environmental/serving cap, not a JS gap.
- **Async correctness still on the table (no architecture):**
  `headers-normalize-response.htm` (15 — response-header value normalization on the
  way *in*), `open-url-fragment`/`open-url-encoding` (URL handling at open),
  `response-method.htm` (1 left). These are good next async increments.
- **Forbidden request-headers** (`setRequestHeader` should silently drop
  `Host`/`Origin`/`Sec-*`/etc.) — not yet implemented; needed by some header tests.
- **A real send flag** (`this._sendFlag`) — referenced but never set; harmless today
  (undefined → falsy), but needed for the "setRequestHeader after send →
  InvalidStateError" subtests.

See [[wpt-conformance-campaign]] memory for the live realm pointer.
