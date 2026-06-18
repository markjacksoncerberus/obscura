# Scroll 32 — The Throwing Getter

> *`responseXML` already knew to refuse when the type was wrong. `responseText`
> did not — it answered politely no matter what you asked it. The spec says both
> must throw. So we taught the last attribute to say no.*

**Realm:** `xhr/*` — the `responseText` attribute.
**Quest #32. Difficulty ⚔️ (quick & decisive).** SECURED — **+4**, pure JS, no
new Rust.

---

## The gap

`XMLHttpRequest.responseText` was a plain **data property** (assigned in the
constructor, in `open()`, and on every send completion). Per the WHATWG XHR spec
§the-responsetext-attribute:

> The `responseText` getter steps are:
> 1. If `this`'s response type is not the empty string or `"text"`, then throw an
>    `InvalidStateError`.
> 2. If `this`'s state is not loading or done, then return the empty string.
> 3. Return the result of getting a text response …

Because it was a plain property, step 1 never happened — reading
`xhr.responseText` after setting `responseType = "arraybuffer"` returned a
string instead of throwing. (`responseXML` was already a getter that threw for
any `responseType` other than `""`/`"document"`, from Quest #30.)

`xhr/responsexml-non-document-types.htm` exercises exactly this: for each of the
5 response types it asserts `responseXML` throws when the type isn't `"document"`
and `responseText` throws when the type isn't `"text"`. Only the `"text"`
subtest passed (it never reads `responseText`); the other 4 needed the throw.

## The fix (bootstrap.js, all in the `XMLHttpRequest` class)

1. **`responseText` is now a getter** backed by a private `_responseText` field:

   ```js
   get responseText() {
     if (this.responseType !== '' && this.responseType !== 'text')
       throw new DOMException("…", 'InvalidStateError');
     if (this.readyState !== 3 && this.readyState !== 4) return '';
     return this._responseText || '';
   }
   ```

2. **Backing-field refactor.** Class bodies are strict mode, so a plain
   `this.responseText = …` assignment against a getter-only property would throw
   `TypeError`. Every former assignment site now writes `_responseText`:
   - constructor init (`""`)
   - `open()` reset (`""`)
   - async `send()` completion (`xhr._responseText = _xhrResponseText(xhr)`)
   - `_sendSync()` success (`this._responseText = text`) and its
     network-error reset (`''`)

   The async path also stored the decoded text in a local (`_text`) and uses it
   in the `responseType` switch (the `text`/`""`/default arms) instead of
   re-reading `xhr.responseText` — so the switch never trips the throwing getter
   for an unusual responseType. `_sendSync` already used a local `text`.

No behaviour change for `""`/`"text"` readers; the only new observable is the
throw for `arraybuffer`/`blob`/`json`/`document`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `xhr/responsexml-non-document-types.htm` | 1/5 | **5/5** ✅ |

**Zero regressions.** XHR sweep: responsetext-decoding 37/37,
responsexml-media-type 15/15, responsexml-get-twice 4/4, response-json 4/4,
data-uri 10/10, send-content-type-charset 19/19. Ritual: qsa 1975, classlist
1420, createElement 147, mark 22/22, measures 119/119, structured-clone 141/152,
getRandomValues 39/39, url-setters-stripping 260/260.

## Caps / Next

- **`responsexml-non-well-formed` 6/7** (named in #31) — "test 2" expects `null`
  but our XML parser accepts the malformed input (yields a 1-child doc). An
  XML-parser well-formedness edge, not a response-attribute issue.
- **`responsexml-document-properties`** (could-not-run, named in #30) — wants the
  full XML-document metadata surface on `responseXML`
  (`domain`/`URL`/`documentURI`/`baseURI`/`referrer`/`contentType`/`readyState`/
  `body`/`doctype`/`all`→HTMLAllCollection/`lastModified`/`redirect.py`). A wider
  separate quest.
- The standing XHR **transport caps** are unchanged: `setrequestheader-content-type`
  (request-header NAME case lowercased by hyper) + the `status-*` family (custom
  reason phrase over h2) + `.asis` raw-response + `buffer-full-eventually`
  wall-clock.
- **Next winnable region:** the response-attributes vein is now essentially
  clean — consider a fresh realm (`fetch/`, `dom/` heavy fixtures) or the
  `responsexml-document-properties` metadata quest.
