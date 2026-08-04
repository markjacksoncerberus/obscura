# 🪧 Quests #457–#459 — The Data Layer Verdict

> *A page whose `fetch()` fails does not render badly. It renders **empty**.*
>
> Everything a modern page shows arrives through three objects: `Headers`,
> `Request`, `Response`. Obscura had all three. All three were **stubs wearing
> the name of a class** — a `{}` map, and two bags of writable fields. On the
> 31 object-model files that measure them we scored **130/566 (23.0%)** against
> a Chrome at 92.3% on the same realm.

**Session:** 2026-08-03 · **Branch:** `engine-per-page-threads` · **Quests:** #457, #458, #459
**Result:** the `fetch` object-model band **130/566 → 527/598 (88.1%)**, **27 of 32 files at 100%**,
two more at exact Chrome parity, **zero regressions**

---

## Why this region

The standing order (set 2026-08-02 after the frontier survey) says to prioritise
untouched realms over deepening held ones. The survey's own recommended order put
**`fetch` + `streams` at number 1** — *"the largest winnable block on the map"* —
and the previous session took number 3 (`accname`). So this was next by the map,
not by a hunch.

The banked ⭐ from #456 pointed at pseudo-element computed style, inside a CSS
realm already above 90%. It stays banked (see **Caps / Next**).

`fetch` also earns it on mission grounds. Every other capability in this browser
is downstream of the data layer: a form that submits, a lesson that loads, a
government service that answers. When `fetch()` is wrong the user does not see a
slightly wrong page — they see nothing at all.

---

## The measured baseline (before)

31 files, **130 PASS / 353 FAIL / 83 other = 566**, and — the important part —
**zero could-not-run**. Nothing was missing. `Headers`, `Request` and `Response`
all existed, were all constructible, and were all wrong. That is the cheapest
shape a big failing realm can have: the fix is *build the class properly*, the
same shape that took `css-typed-om` from 65 to 10,815 in #446.

Here is what was actually there, in full:

```js
globalThis.Headers = class Headers {
  constructor(init={}) { this._h={}; /* … */ }
  get(n) { return this._h[n.toLowerCase()]??null; }
  append(n,v) { this._h[n.toLowerCase()]=String(v); }   // ← "append"
  /* … */
};
```

---

## #457 — The header list

**`Headers` is not a map, and the difference is not academic.**

A header list is an **ordered list of name/value pairs in which two entries may
share a name**. `Set-Cookie` routinely does. `Accept` does. The stub stored
`{name: value}`, so:

- `append()` **overwrote** instead of appending. Two cookies arrived, one
  survived, and which one survived was whichever came last — so a login that set
  a session cookie alongside a preferences cookie lost one of them, silently.
- `get()` returned a single value where the spec **combines** every matching one
  with `", "`.
- Iteration came out in insertion order; the spec **sorts** it.
- Nothing was validated at all, so a header value carrying a CR — which is not a
  header value, it is a **second, forged request** — went straight to the
  transport.

The rewrite is a real list plus the four things built on it:

| Piece | What it turns on |
|---|---|
| **Sort-and-combine** | Names byte-lowercased and sorted; values joined `", "` — **except `set-cookie`**, which yields one entry per value, because two cookies glued together are no longer two cookies. `getSetCookie()` is the one door back. |
| **The live iterator** | A WebIDL default iterator holding a **live index**, re-deriving the pairs on every `next()`. This is why deleting a header mid-loop *skips* an entry and prepending one *repeats* the current entry — four WPT tests check exactly those, and only a live index gets all four. |
| **Validation** | Name is an RFC 7230 token, value has no NUL/CR/LF, both are ByteStrings (a code unit above 0xFF is refused outright, which is what makes a Symbol record key throw). |
| **The guards** | `none` / `request` / `request-no-cors` / `response` / `immutable`. A guard **refuses silently** rather than throwing — setting a forbidden header is a no-op, not an exception in the middle of somebody's library. |

**The subtlety worth writing down: the `no-cors` safelist is checked against
what the header WOULD BECOME, not against what you appended.** Appending a
second, individually-harmless value can push the *combined* pair past the
128-byte limit, and the test proves it by appending `""` to a 127-byte value and
expecting the append to be refused. Check the argument and you pass the first
assertion and fail the second.

**Result: all eight `fetch/api/headers/headers-*` files to 100% on the first
build — 31/102 → 102/102** — plus `header-setcookie.any.html` at **24/24**, a
file the campaign had never measured because `getSetCookie` did not exist.

### The Rust half: a header value is a ByteString

Two transport bugs surfaced once JS stopped being the bottleneck.

1. **Values went out UTF-8-encoded.** A header value is a ByteString — one byte
   per code unit — so `"x\u{e9}x"` is three bytes, not the four Rust's
   `as_bytes()` produces. Now latin-1 encoded when every char fits in a byte
   (byte-identical to UTF-8 for the ASCII everything internal sends).
2. **Response header values were VANISHING.** `HeaderValue::to_str()` accepts
   only visible ASCII, and we mapped everything else to `""`. Any response header
   carrying a byte outside that range was silently emptied before script could
   read it. Now decoded latin-1, one code unit per byte, which is what a
   ByteString is and what every browser hands back.

Also: `reqwest`'s checked `HeaderValue` constructor is **stricter than HTTP** —
fetch admits every byte but NUL/CR/LF; `http` also refuses the other C0
controls, which made `fetch()` fail with an opaque `builder error`. We re-check
the three bytes that actually matter (the ones that could forge a second
request) and then bypass the stricter check, rather than failing a whole request
over a `\x01`.

And, because "error sending request for url (…)" says nothing about *why*,
`op_fetch_url` now walks the error's source chain into the message. That is how
the remaining cap below got diagnosed in one run instead of five.

---

## #458 — The Request

Every attribute became a **read-only accessor on the prototype**. That is not
tidiness: a request that can be mutated after construction can be **re-aimed
after it has been vetted**. The stub had `this.url = …`, writable, so
`request.url = "http://evil"` worked.

Fifteen attributes were added or corrected (`destination`, `referrerPolicy`,
`integrity`, `keepalive`, `isReloadNavigation`, `isHistoryNavigation`, `duplex`,
…), `headers` became `[SameObject]`, and — the substantive half — **every init
the engine cannot honour is now refused at construction**:

- a URL that fails to parse, or **carries credentials** (a phishing primitive the
  spec refuses outright rather than stripping),
- `mode: "navigate"` — a mode the *browser* assigns; a page asking for it is
  claiming to be a navigation it is not,
- `window` set to anything non-null — it exists in the IDL so a caller can
  **detach** a request from its window, never to attach it to another one,
- a method that is not a token, or is `CONNECT`/`TRACE`/`TRACK`,
- **`no-cors` with any method but GET/HEAD/POST** — the three a plain HTML form
  could already have sent, so they add no new capability. A `no-cors` request
  that quietly became a PUT is a request nobody audited.
- `cache: "only-if-cached"` outside `same-origin`,
- a bad enum for any of `referrerPolicy`/`mode`/`credentials`/`cache`/`redirect`.

The header list is guarded **by the mode**, and the guard is applied **before the
fill** — a Request must *drop* the `Host` its author tried to send, not accept it
and notice afterwards.

`_fetchExtractBody` landed here too: it returns the bytes **and the Content-Type
the body implies**. That second half is why `new Response("hi")` reports
`text/plain;charset=UTF-8` when nobody set a header. The body knows what it is,
and a server that has to guess gets it wrong. An author's explicit Content-Type
still wins — the implied one only fills a gap.

**Result: the request band 49/139 → 124/139**, with `request-error` 3→22,
`request-headers` 22→60, `forbidden-method` 0→6.

### The hang: 83 blocked ports

`request-bad-port.any.html` was **0/83 with the whole file TIMEOUT** — we opened
a connection to port 25, port 6667, port 2049, and waited. One `fetch()` could
wedge a tab.

Fetch's port-blocking list is not conformance trivia. Every entry is a protocol
whose server **can be driven by a carefully shaped HTTP request** — SMTP, IMAP,
IRC, SSH, NFS. A browser without the list is a cross-protocol attack proxy: a
page posts a form whose body is a valid SMTP conversation and mails from the
user's own machine.

Implemented in Rust in `validate_fetch_url`'s neighbourhood, so it covers XHR and
subresources too and not just JS `fetch()`, and reported as a *distinct* signal
so script sees the ordinary `TypeError` a network error deserves rather than the
generic block path's abort. **0/83 TIMEOUT → 83/83, and the hang is gone.**

---

## #459 — The Response, and the body

The Response class got the same treatment — read-only accessors, and refusals
that distinguish **which kind of wrong** an init is:

- a status outside 200–599 is a **RangeError** ("that number is out of range"),
- a reason phrase carrying a newline is a **TypeError** ("that is not a status
  line at all"),
- a body on 204/205/304 is a TypeError — those statuses *say* there is no body,
  so attaching one contradicts the status rather than merely being unusual.

Statics were all wrong and are now right: `error()` has type `"error"`, status 0
and **immutable headers** (script must not be able to dress a failure up as a
success by adding headers to it afterwards); `redirect()` validates the URL and
the status; `json()` lets an explicit Content-Type win over the serializer's.

And a network response now goes through an **internal** constructor, because a
response that came off the wire was not built by script and is not script's to
validate: its status may legitimately be 0, which `new Response()` must refuse,
and its headers are **immutable** — a record of what the server said, not a draft.

### The Body mixin, and the one rule that matters

A body may be read **once**. `bodyUsed` is not bookkeeping — a body is a stream
arriving off the network, and a second reader would find nothing there. Every
consumer checks *disturbed or locked* first and **rejects with a TypeError**,
rather than quietly handing back an empty string that reads like valid data.

Three distinctions the first cut flattened, each found by a test:

1. **"Unusable" is body-aware.** A request with *no* body can be read, and
   cloned, any number of times — there is no stream to exhaust. `bodyUsed` must
   stay `false` for a bodyless response even after `text()`. Getting this wrong
   makes an empty response *look spent*, and `clone()` then throws on a response
   that was never read. (This one row appears 7 times across two files.)
2. **Constructing a Request from a Request consumes the input's body** — the
   input keeps its stream *object* (callers compare identity) but is spent
   afterwards. And taking a body that is *already* spent is a TypeError, unless
   the init supplies a new one.
3. **`text()` is "UTF-8 decode", not "decode" — it strips a leading BOM.**
   `JSON.parse` chokes on a stray U+FEFF, so JSON served with a BOM (which is
   most JSON written on Windows) was unreadable.

A related root cause fell out of the same row: **the `data:` URL processor was
running on the raw string instead of a parsed URL.** The spec's processor
operates on a URL whose opaque path is already percent-encoded UTF-8; ours took
the raw string, so a non-ASCII character reached the percent-decoder as a code
*unit* and came out as one mangled byte. `data:,﻿{…}` became `0xFF`, and the
JSON behind the BOM was unreadable.

---

## Results

| Test | Before | After | Status |
|---|---|---|---|
| `fetch/api/headers/headers-basic.any.html` | 10/23 | **23/23** | ✅ 100% |
| `fetch/api/headers/headers-combine.any.html` | 1/6 | **6/6** | ✅ 100% |
| `fetch/api/headers/headers-errors.any.html` | 5/18 | **18/18** | ✅ 100% |
| `fetch/api/headers/headers-record.any.html` | 2/13 | **13/13** | ✅ 100% |
| `fetch/api/headers/headers-normalize.any.html` | 0/3 | **3/3** | ✅ 100% |
| `fetch/api/headers/headers-no-cors.any.html` | 1/27 | **27/27** | ✅ 100% |
| `fetch/api/headers/headers-casing.any.html` | 4/4 | **4/4** | ✅ 100% |
| `fetch/api/headers/headers-structure.any.html` | 8/8 | **8/8** | ✅ 100% |
| `fetch/api/headers/header-setcookie.any.html` | *(unmeasured)* | **24/24** | ✅ 100% |
| `fetch/api/headers/header-values.any.html` | 3/8 | 6/8 | ⬆️ cap |
| `fetch/api/headers/header-values-normalize.any.html` | 7/62 | 10/62 | ⬆️ cap |
| `fetch/api/request/request-structure.any.html` | 7/24 | **24/24** | ✅ 100% |
| `fetch/api/request/request-error.any.html` | 3/22 | **22/22** | ✅ 100% |
| `fetch/api/request/request-init-002.any.html` | 3/8 | **8/8** | ✅ 100% |
| `fetch/api/request/request-init-contenttype.any.html` | 14/18 | **18/18** | ✅ 100% |
| `fetch/api/request/request-headers.any.html` | 22/61 | **61/61** | ✅ 100% |
| `fetch/api/request/request-consume.any.html` | 8/45 | **45/45** | ✅ 100% |
| `fetch/api/request/request-disturbed.any.html` | 0/1 (ERROR) | **9/9** | ✅ 100% |
| `fetch/api/request/forbidden-method.any.html` | 0/6 | **6/6** | ✅ 100% |
| `fetch/api/request/request-bad-port.any.html` | 0/83 (TIMEOUT) | **83/83** | ✅ 100% |
| `fetch/api/request/request-consume-empty.any.html` | 0/14 | 13/14 | ✅ Chrome parity |
| `fetch/api/response/response-init-001.any.html` | 7/9 | **9/9** | ✅ 100% |
| `fetch/api/response/response-init-002.any.html` | 2/8 | **8/8** | ✅ 100% |
| `fetch/api/response/response-init-contenttype.any.html` | 14/18 | **18/18** | ✅ 100% |
| `fetch/api/response/response-error.any.html` | 0/10 | **10/10** | ✅ 100% |
| `fetch/api/response/response-static-error.any.html` | 0/2 | **2/2** | ✅ 100% |
| `fetch/api/response/response-static-json.any.html` | 6/16 | **16/16** | ✅ 100% |
| `fetch/api/response/response-static-redirect.any.html` | 0/11 | **11/11** | ✅ 100% |
| `fetch/api/response/response-headers-guard.any.html` | 0/1 | **1/1** | ✅ 100% |
| `fetch/api/response/json.any.html` | 1/2 | **2/2** | ✅ 100% |
| `fetch/api/response/response-consume-empty.any.html` | 0/14 | 13/14 | ✅ Chrome parity |
| `fetch/api/response/response-clone.any.html` | 2/21 | 6/21 | ⬆️ cap |
| **Band total** | **130/566** | **527/598 (88.1%)** | **27 files at 100%** |

**Zero regressions.** Sweep: the committed ritual (`scripts/wpt-ritual.txt`,
qsa 1975/1975, classlist 1420/1420, createElementNS 596/596, …) **widened with
the whole `xhr` ledger**, because this change touched shared transport paths.
**7332 subtests, 98.3%, every held row at or above its recorded value.**

### The regression the sweep caught — and this is why the sweep exists

The first sweep pass came back with **four XHR rows collapsed**: `data-uri`
10/10 → 1/10, `responsetext-decoding` 37/37 → 8/37, `responsedocument-decoding`
6/6 → 0/6, `responsexml-get-twice` 4/4 → 0/4.

One line. XHR reads the **raw response bytes** for charset-aware decoding (it
cannot use `resp.text()`, which is UTF-8-only) and it reached in through
`resp._bodyBytes` — a field the old stub Response happened to expose and the new
one does not. Every charset-decoding test in the XHR realm rode on it.

Two things worth carrying forward: **a rewrite of a shared class breaks whoever
was reaching into its internals**, and *the ledger's recorded value is what makes
that visible* — 1/10 does not look wrong on its own. It looks wrong next to a
row that says 10/10.

---

## Caps / Next

### Named caps — not failures, do not burn a session on them

- **`header-values-normalize.any.html` 10/62 and `header-values.any.html` 6/8 —
  54 rows blocked in the TRANSPORT, not in the engine.** Fully diagnosed: the
  request now goes out correctly (the old `builder error` is gone) and *the
  server accepts and echoes it* — verified by hand over `openssl s_client`, which
  returns `200 OK` with the control byte echoed back. What fails is **reading the
  echo**: `hyper`'s HTTP/1 response parser (httparse) rejects a C0 control byte
  in a response header value, and reqwest is built here without the `http2`
  feature so every response goes through it. Chrome's parser is lenient there and
  passes. **Enabling reqwest's `http2` feature was tried and changes nothing** —
  ALPN still lands on h1 — so it was reverted rather than left as a no-op
  dependency change. Winning these needs a lenient HTTP/1 response parser (a
  vendored/patched hyper), which is a transport quest, not a fetch quest.
- **`request-consume-empty` 13/14 and `response-consume-empty` 13/14 are at
  exact Chrome parity** — verified against wpt.fyi (`chrome 153.0.7979.3`,
  13/14 on the identical file). The one row asserts an empty `FormData`
  serializes to an empty string; it serializes to `--boundary--\r\n`, and the
  WPT source **carries its own FIXME saying the assertion is not clearly right**.
  Not a defect.

### ⭐ NEXT — `streams`, and it is right underneath us

**`response-clone.any.html` 6/21 is the pointer, and it is not a Response bug.**
Fifteen of its rows need a **real `ReadableStream`**: `tee()` that actually
duplicates, `cancel()` that does not affect the clone, and structured-clone of
teed chunks. Obscura's `ReadableStream` (bootstrap.js, ~line 40390) is a
~25-line stub — `tee()` literally returns two *empty* streams:

```js
tee() { return [new ReadableStream(), new ReadableStream()]; }
```

The frontier survey put `streams` at **13.2% (77/585)** against a Chrome at
99.5%, and named it as one half of quest **F1** *precisely because it sits
underneath `response.body`*. The body mixin built in #459 now hands out real
streams for real bodies, so the class is the only thing left in the way. **This
is the highest-leverage next move on the map: one class, 585 subtests in its own
realm, plus the tail it unblocks in `fetch`.**

### Behind it, in order

1. **The rest of `fetch/api/basic/` + `fetch/api/cors/`** — spot-checked this
   session and *not* could-not-run (so scoreable, not blocked):
   `request-headers.any.html` 1/25, `response-url.sub.any.html` 0/4,
   `mode-same-origin.any.html` 3/8, `request-head.any.html` 0/1. These are
   network *behaviour* rather than object model — the next layer down.
2. **`FormData` cannot hold a File.** `FormData.append` coerces every value with
   `String(v)`, so a file upload becomes the literal text `[object File]`. The
   multipart serializer written this session handles files correctly and will
   start working the moment `FormData` stops flattening them. That is *file
   upload*, which is a real thing real people do.
3. **`cookies` (0.8%) + `webstorage` (34.9%) + `IndexedDB` (2.9%)** — frontier
   quest **F2**, staying logged in and working offline, still unclaimed.

### Still banked from #456 (a CSS row, not the next move under the standing order)

`getComputedStyle(el, '::before')` accepts the pseudo argument and **ignores**
it, so `content` is `normal` for every pseudo-element. Worth ~21 `accname` rows,
the pseudo-element transition rows, and the untouched `css/css-pseudo`. Behind
it: a UA default stylesheet for `display` — every element currently reports
`block`.
