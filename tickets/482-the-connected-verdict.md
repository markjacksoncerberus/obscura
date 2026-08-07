# 📜 Quest #491 — The Connected Verdict

> *`WebSocket` — the only way a page learns something it did not ask for.*
> **What was here was seven lines that accepted every URL, sent nothing, received
> nothing, and reported a clean close.**

---

## The gap

```js
if (typeof WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {
    constructor(url, protocols) { this.url = url; this.readyState = 0; … }
    send(data) {}
    close(code, reason) { this.readyState = 3; if (this.onclose) this.onclose({code:code||1000, wasClean:true}); }
    addEventListener() {} removeEventListener() {}
  };
}
```

Read that `close()` again. It reports **`wasClean: true`** — for a connection that
never existed. A page whose reconnect logic keys off `wasClean` (which is what
`wasClean` is *for*) would be told, forever, that everything ended fine.

**The eighth time this campaign has met "a feature that answers, and answers
wrong."** `send()` accepted every message and delivered none; `addEventListener`
registered nothing; every URL was accepted, including `mailto:` and `about:blank`.
There was no error for a developer to search for.

### Why it matters more on a poor connection, not less

HTTP is question-and-answer: the page asks, the server answers, the exchange
ends. Anything that must arrive **without being asked for** — the next message in
a chat, the bus that is four minutes away, a place in a clinic queue, another
person's cursor in a shared document — is either a WebSocket or it is polling.

Polling is the same page fetched again and again, forever. On a metered
connection that is a data bundle spent on nothing. On a slow CPU it is a tab that
never goes idle and a battery that never recovers. **A browser without WebSocket
does not fail to show those sites — it shows them, expensively, and drains the
device of the person least able to replace it.**

---

## The work

### Rust: `crates/obscura-js/src/ws_ops.rs` (new)

Six ops over `tokio-tungstenite`, which was **already in the workspace lockfile**
(the CDP server uses it to *accept* sockets; this is the first code that *opens*
one). `native-tls-vendored` matches what `reqwest` already pulls in, so `wss://`
costs no new system dependency.

**⭐ The sink and the stream are stored SEPARATELY (`StreamExt::split`), and that
is not tidiness.** A read is a long await — waiting for something that has not
happened yet *is* the feature — and if a pending read held the whole connection,
`send()` could not run until the server happened to speak first. Splitting is what
makes a full-duplex API actually full-duplex. Each half is taken **out** of the
handle table for the duration of its await, because holding a `RefCell` borrow
across an await point would deadlock the next op on the thread.

Ping/pong never surface to JS: a page has no say in keepalive, and handing it
those frames would only invite it to get them wrong.

### JS: a real `WebSocket` and a real `CloseEvent`

**⭐ A blocked port does NOT throw.** WPT's `Create-blocked-port` (84 subtests)
constructs 83 sockets on ports where a non-HTTP protocol lives and asserts each
one fires `error` — asynchronously. The spec says "fail the WebSocket
connection", which is the same shape a page already handles for a server that is
down, so a page needs no special case for it. Throwing would have been the
obvious implementation and it scores zero.

Why the list exists at all: those are ports where something that is not a web
server is listening, and a browser that can be talked into opening a socket to an
SMTP or IRC port can be talked into sending lines that the daemon on the other end
reads as **commands**. The block list is a cross-protocol-attack defence.

**⭐ The fragment check is "fragment is NON-NULL", not "non-empty" — and `.hash`
cannot tell those apart.** `ws://host/#` has an EMPTY fragment and reports
`hash === ""`, exactly like a URL with no fragment at all. The serialization keeps
the `#`, so that is what to look at. One character, one subtest, and the reason a
fragment is refused at all is that it is never sent to the server: a socket URL
carrying one was built by mistake, and dropping it silently hides the mistake
rather than fixing it.

**⭐ In `close(code)`, only `undefined` means "argument absent".** `null` is a
VALUE — the IDL is `optional [Clamp] unsigned short code` with no `[TreatNullAs]`
— so `close(null)` converts to 0 and is refused. **And `[Clamp]` CLAMPS: 65536+1000
becomes 65535, it does not wrap round to 1000.** Wrapping would turn a nonsense
code into the one code that means "clean shutdown" — the difference between a
server logging a protocol error and a server believing the client said goodbye.
(Third realm this campaign where `[Clamp]`'s exact rule is the test; see #487's
`Blob.slice`.)

**⭐ Closing while still CONNECTING is "FAIL the connection", not "close it
politely."** There is no established connection to send a close frame on, so the
state goes to CLOSING now and the close event reports `wasClean: false`
**promptly**, without waiting for a handshake that may take another ten seconds
(WPT's `close-connecting` points at a `/sleep_10_v13` endpoint precisely to catch
an implementation that waits). *A page that gave up on a connection needs to be
told it is gone while it still cares.*

**⭐ `send()` before OPEN throws; `send()` after close does not.** Sending while
CONNECTING is a programming error — the page has not been told it may speak yet.
Sending after close is not: the socket may have gone away between the check and
the call, and requiring every page to guard every send would mean every page gets
it wrong somewhere. That one is counted into `bufferedAmount` and discarded.

Also: `binaryType` ignores an unknown value rather than throwing (a WebIDL enum
attribute's job is to keep the value legal, not to punish); the constants are
non-writable on **both** the interface object and the prototype, because a page
that can redefine `WebSocket.OPEN` has broken every `readyState === WebSocket.OPEN`
comparison in every library it loaded; and subprotocol duplicates are refused
**case-insensitively**, because that is how the server matches them.

---

## Results

Top-80 window of the realm (`scripts/wpt-websockets-probe.txt`), run one file at a
time against a live `ws://wpt.live:8001` / `wss://wpt.live:8002`:

| file | before | after |
|---|---|---|
| `constructor/004` | **0/161** | **161/161** |
| `Create-blocked-port.any` | 0 (stub) | **84/84** |
| `idlharness.any` | **10/62** | **60/62** |
| `Create-invalid-urls.any` | — | **8/8** |
| `close-invalid.any` | — | **6/6** |
| `Create-non-absolute-url.any` | — | **5/5** |
| `interfaces/WebSocket/readyState/001–008` | — | **8×1/1** |
| `interfaces/WebSocket/send/001–012` | — | **11/11 + 10×1/1** |
| `closing-handshake/002–004` | — | **3×1/1** |
| `interfaces/WebSocket/events/*` | — | 7 files at 4/4 |
| `multi-globals/message-received` | — | **2/2** |

**Window total: 450 PASS / 485 run (92.8%) over 76 files**, from a stub that
scored 10/62 on the one interface file that could produce a number at all.

The connections are **real**: `Create-blocked-port`'s "Basic check" subtest only
passes if a socket actually opens to `wpt.live:8001` and fires `onopen`, and the
`send/*` and `closing-handshake/*` files echo data and complete a two-way close.

---

## Caps, named honestly

- **`websockets/cookies/*` — 9 files, 0/1 each.** The handshake does not carry the
  document's cookies. That is a plumbing job between `ws_ops.rs` and the engine's
  `CookieJar`, and it is what "stay logged in over a live connection" needs.
- **`Create-blocked-port.any.worker.html` nav-error; `idlharness.any.worker.html`
  no-results.** The window variants are fine, so this is worker-scope exposure,
  not the socket.
- **`security/002`, `events/013`, `unload-a-document/001,002,005`** — cross-origin
  and page-unload behaviours; the unload ones need a close on navigation.
- **`websockets/stream/*` (WebSocketStream) untouched** — a separate tentative API
  built on `ReadableStream`/`WritableStream`, ~370 subtests. Cheap follow-up now
  that the transport exists.
- **⚠️ MEASUREMENT TRAP, and it cost a debugging pass.**
  `Create-non-absolute-url.any.html` reported **0/5 on `--base https://wpt.live`
  and 5/5 on `--base http://wpt.live`.** The test forces `url.protocol = "ws"` on
  a URL built from `location`, so on an https page its own expectation is `ws://`
  while a correct WebSocket answers `wss://`. **The scheme the runner serves is
  part of the test's input** — the same trap scroll 465 banked for `.https.html`
  files, seen from the other side.

---

## One bug found on the way, in a different realm

`new URL(null, base)` returned **the base**. `url` is a required `USVString`, so
`null` converts to the four-character string `"null"` — it does not mean "no URL".
Folding it to `""` produced the one wrong answer a caller could mistake for
success: **a relative path built from a null variable silently resolved to the
current page** instead of failing or resolving to `/null`. Fixed; `base`, being
genuinely optional, keeps its absent-when-nullish reading.
