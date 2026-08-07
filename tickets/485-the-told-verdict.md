# 📜 Quest #494 — The Told Verdict

> *Server-Sent Events: the cheapest way a page can be **told** something. It was
> six lines whose `addEventListener` was `{}`.*

---

## Why this realm, and why it is not a smaller WebSocket

HTTP is a question-and-answer protocol. Anything that has to arrive *without
being asked for* — the bus that is four minutes away, a place in a clinic queue,
an exam result, a delivery that has left the depot — is either pushed or it is
polled, and polling is the same request re-sent every few seconds, forever. On a
metered connection that is a data bundle spent on nothing; on a slow CPU it is a
tab that never goes idle; on a phone it is a battery that dies before the bus
arrives.

Quest #491 built `WebSocket` for this. **SSE is the smaller tool, and small is
the point**: one ordinary HTTP GET that the server never finishes. No upgrade
handshake, no framing layer, no keepalive ping, no second protocol for a proxy or
a corporate firewall to mishandle — and it **reconnects by itself**, with the
browser remembering where it got to via `Last-Event-ID`. On a connection that
drops every few minutes, that last property is the whole feature.

The frontier survey had `eventsource` at **0/18 with 3 of 3 files could-not-run,
Chrome 100%** — an untouched realm under the standing order.

---

## What was there

```js
if (typeof EventSource === 'undefined') {
  globalThis.EventSource = class EventSource {
    constructor(url) { this.url = url; this.readyState = 0; … }
    close() { this.readyState = 2; }
    addEventListener() {} removeEventListener() {}
    static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
  };
}
```

A page that wrote `es.addEventListener('update', render)` registered nothing, got
nothing, and **received no error**. The eighth time this campaign has met *a
feature that answers, and answers wrong*.

**Measured baseline: `0/15` over 9 files, 6 of them TIMEOUT.**

---

## The transport: `crates/obscura-js/src/sse_ops.rs`

`op_fetch_url` reads a response to completion and hands back a body. **An event
stream has no completion** — a fetch that waits for one waits forever, and a page
built on it shows nothing until the server gives up. So this is the first code in
the engine that keeps an HTTP response *open*: `reqwest`'s `bytes_stream()` (one
added cargo feature), the stream held in a thread-local and taken out across each
await exactly as `ws_ops` does.

**⚠️ Redirects are followed BY HAND, and every hop is re-validated against the
same SSRF policy as the first.** With reqwest's auto-follow, an
attacker-controlled origin can answer `302 Location: http://127.0.0.1/…` and the
stream that comes back is an internal service, read out through an API the page
opened itself. `op_fetch_url` closed that door (GHSA-8v6v-g4rh-jmcm); a new
transport must not quietly reopen it. `validate_fetch_url` is now
`pub(crate)` and called on the initial URL and on every hop, with the same
10-hop cap.

**⭐ Chunks come back base64, not as text.** A chunk boundary can fall in the
middle of a UTF-8 sequence — a two-byte `é` split across two reads decodes to two
replacement characters if each half is decoded on its own. JS holds **one**
streaming `TextDecoder` for the whole connection, which is the only place that
boundary can be handled.

---

## ⭐⭐ Verify a pure algorithm offline first — and it found two real bugs

The SSE stream format is a pure function of its bytes. So it was lifted out of
`bootstrap.js` into a Node script (`scripts/sse_parse_test.mjs`) and run against
WPT's own inputs — **36 assertions in under a second**, each input fed twice:
once whole, and once **one byte at a time**, because a streaming parser that only
works on whole responses is exactly the bug the test exists to catch.

It found two things before a single CDP cycle:

**⭐⭐ The last-event-ID BUFFER and the last-event-ID STRING are two different
things.** An `id:` line writes the *buffer*. The *string* is only ever copied from
it when an event is actually **dispatched**, and it is what both
`event.lastEventId` and the `Last-Event-ID` header on the next reconnect report.
So an id that arrived inside a block the connection cut off **never becomes the
resume point**: on reconnect the page asks for the events after the last one it
*delivered*, not after the last one it *glimpsed*. Collapsing the two into one
variable silently loses an event on every dropped connection — and dropped
connections are the entire reason this API reconnects. WPT
`format-data-before-final-empty-line` asserts exactly this.

**⭐ A held trailing `\r` must be flushed at end of stream.** While the
connection is live, a lone CR at the end of a chunk might be the first half of a
CRLF, so it waits. At end of stream nothing more is coming and it *is* a
terminator. Without the flush, a server whose last blank line ends in a bare CR
loses its final event — every time.

Two more the corpus pinned down:

- **⭐ `retry: 03000` is three thousand milliseconds, not octal 1536.** Digits
  only, base ten. Reading a leading zero as an octal prefix turns a server's
  polite "wait three seconds" into half a second of hammering.
- **⭐ A BOM is stripped ONCE, at the very start of the stream.** A U+FEFF that
  turns up later is *data*, so `<BOM>data:2` is not a `data` field at all and
  that event never fires. WPT's `format-bom` asserts the **absence** of the
  second event.

And one that is security, not formatting: **an `id:` containing U+0000 is
dropped, silently, leaving the buffer unchanged** — that value goes back out as a
`Last-Event-ID` *request header*, and a NUL in a header is where header injection
starts.

---

## Results

Same 9 files, before and after:

| file | before | after |
|---|---|---|
| `eventsource-onmessage.any.html` | 0/1 TIMEOUT | **1/1** |
| `eventsource-onopen.any.html` | 0/1 TIMEOUT | **1/1** |
| `eventsource-eventtarget.any.html` | 0/1 TIMEOUT | **1/1** |
| `eventsource-onmessage-trusted.any.html` | 0/1 TIMEOUT | **1/1** |
| `event-data.any.html` | 0/1 TIMEOUT | **1/1** |
| `eventsource-close.window.html` | 0/2 TIMEOUT | **1/2** |
| `eventsource-constructor-empty-url.any.html` | 0/1 | **1/1** |
| `eventsource-constructor-url-bogus.any.html` | 0/1 | **1/1** |
| `eventsource-cross-origin.window.html` | 0/6 TIMEOUT | **2/6** |

**0/15 → 10/15. Every TIMEOUT gone.** Verified against live `text/event-stream`
responses from `wpt.live`, not a mock.

---

## Caps / Next

- **The offline parser suite is 36/36 but only 9 files were swept.** The realm has
  44 runnable files; the remaining 35 (`format-*`, `request-*`,
  `eventsource-reconnect`, the `dedicated-worker/` and `shared-worker/` subdirs)
  are **unmeasured, not passing**, and the probe list is
  `scripts/…/es-probe.txt`. Every one of them exercises the parser that is
  already verified offline, so the expectation is good — but an expectation is
  not a measurement, and this scroll does not claim one.
- **`eventsource-cross-origin` is 2/6** — the remaining four need real CORS on
  the stream (`Access-Control-Allow-Origin` checked before the first byte is
  believed) plus `withCredentials`.
- **`eventsource-close` is 1/2** — the second half drives `reconnect-fail.py`
  through several reconnects and asserts the `readyState` at each `error`.
- **No `Last-Event-ID` round trip has been measured end to end.** The header is
  sent and the buffer/string split is right offline; `format-field-id-*` would
  prove it on the wire.
- **Default reconnection time is 3000 ms.** The spec leaves it to the
  implementation; this matches other browsers.
