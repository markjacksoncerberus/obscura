# 📜 Quest #492 — The Streamed Verdict

> *`WebSocketStream`, the socket with backpressure — plus a correction I made
> mid-quest and would make again.*

---

## ⚠️ First, the correction — because it is the more useful half of this scroll

This quest began as **`mimesniff/mime-types/parsing.any.js`**: 1,898 subtests in a
single file, a pure string algorithm, and Chrome scoring only 712. It looked like
the cheapest large win on the map.

The test asserts the full **parse-and-serialize** answer for a MIME type through
two doors:

```js
assert_equals(new Blob([], { type: val.input }).type, output, "Blob");
new Response(null, { headers: [["Content-Type", val.input]] }).blob()
  .then(blob => assert_equals(blob.type, output))
```

Our `Blob.type` used the older FileAPI rule — *lowercase the whole string if it is
ASCII-printable, else empty*. Swapping in the parser took the file to
**1898/1898**, and for a while this scroll said so.

**Then the ritual sweep found two regressions**, and following them found a third:

| file | with parse-and-serialize | with the old rule |
|---|---|---|
| `FileAPI/blob/Blob-slice.any.html` | 129/150 | **150/150** |
| `FileAPI/file/File-constructor.any.html` | 49/51 | **51/51** |
| `fetch/api/response/response-consume.html` | 22/40 | **24/40** |

So the FileAPI spec text was read rather than guessed at, and it is unambiguous.
For the `Blob()` constructor, the `File()` constructor **and** `slice()`'s
`contentType`, all three say the same words:

> If t contains any characters outside the range U+0020 to U+007E, then set t to
> the empty string and return from these substeps. **Convert every character in t
> to ASCII lowercase.**

That rule is crude on purpose. It keeps `"nonparsable"` (which is not a MIME type)
and it folds `charset=UTF-8` to `charset=utf-8` (which is a parameter value, and
parameter values are not case-insensitive). It is nevertheless what FileAPI
specifies, and `File-constructor.any.js` asserts both of those exact cases.
`fetch`'s `response-consume.html` goes further and asserts
`blob.type === header.toLowerCase()` — a serializer can *never* satisfy that,
because serializing drops the space after the semicolon.

**Three WPT files and the normative text on one side; `mimesniff/parsing` on the
other. Chrome 153 scores 712/1898 there for precisely this reason.** The change was
reverted. We now score **712/1898 — bit-for-bit Chrome parity**, arrived at by
following the same specifications Chrome follows.

> **The lesson, and it is the reason this section is first: a big green number is
> not evidence on its own.** `mimesniff/parsing.any.js` is a real WPT file testing
> a real standard, and implementing it correctly *broke three other real WPT files
> testing other real standards. The zero-regression sweep is what caught it, and
> it caught it in my own work, one build before the commit.* A future knight who
> sees 712/1898 and reaches for the obvious fix should read
> `_normalizeBlobType`'s comment first — it is written for them.

### What the mimesniff corpus *did* pay for

Two genuine bugs in `_parseMimeType`, both found by running it against WPT's own
`mime-types.json` + `generated-mime-types.json` **offline, in a standalone Node
script, in under a second**:

- **⭐ An empty QUOTED parameter value is kept; an empty bare one is not.**
  `text/html;charset="";charset=GBK` → `text/html;charset=""`, but
  `text/html;charset=;charset=GBK` → `text/html;charset=GBK`. The standard only
  says "if parameterValue is the empty string, then continue" on the *unquoted*
  branch. `charset=` is a sender who failed to fill the value in, so the slot
  stays open; `charset=""` is a sender saying **explicitly nothing**, and it
  occupies the slot. **Ignoring the difference lets a crafted header's second
  `charset` override one the page meant to pin** — a content-sniffing bug with an
  XSS on the end of it.
- **⭐ The HTTP quoted-string range has an upper bound of U+00FF, and it is real.**
  The predicate ended at `x >= 0x80` with no ceiling. A header is a **byte**
  sequence, so a parameter value must be expressible one code point per byte;
  anything above U+00FF (a U+FFFD left over from a bad decode) could not have come
  off the wire and must not be allowed to travel back onto it.

Corpus result: **954/955 → 955/955.** Those fixes serve `fetch`'s Content-Type
handling, `formData()`'s boundary extraction and XHR's charset adjustment — they
are simply not what `parsing.any.js` measures. Measured WPT delta:
`mimesniff/mime-types/charset-parameter.window.html` **38/41 → 39/41**.

**⭐ The method that made this cheap is worth keeping:** when a realm is a pure
function of its input, lift the function out and test it offline. 955 cases in
under a second beats a 20-second-per-file CDP sweep, and the browser run becomes a
confirmation rather than a search.

---

## The quest that replaced it: `WebSocketStream`

With the real transport landed in quest #491, the streaming half of the realm was
suddenly cheap — and it is the half that matters most on a small machine.

**The event-based `WebSocket` has no way to say "stop, I cannot keep up."** A page
receiving faster than it can render just grows a queue until the tab dies, and on
a low-memory device that is not a slowdown — it is the OS killing the tab.
`WebSocketStream` hands the same connection over as a `ReadableStream` and a
`WritableStream`: **with backpressure**. The reader asks for the next message when
it is ready for one.

### What was built

`WebSocketStream` + `WebSocketError`, layered on the `WebSocket` from #491 so the
two APIs cannot disagree about what a legal socket is, and on the real
`ReadableStream`/`WritableStream` from quest #460–#462.

**⭐ `protocols` is a `sequence<USVString>`, and a bare string is REFUSED even
though a string is iterable.** WebIDL converts a sequence only from an Object.
That is not pedantry: `{protocols: 'chat'}` almost always means the author forgot
the brackets, and iterating a string would offer the server one subprotocol **per
character**.

**⭐ An abort is not a close.** `signal` rejects `opened` and `closed` with an
**`AbortError`**, never a `WebSocketError`. A `WebSocketError` says the connection
ended and how; an `AbortError` says *this side stopped caring* — and a page that
retries on connection failure must not retry a socket it deliberately cancelled.

**⭐ Cancelling the readable (or aborting the writable) with a `WebSocketError`
sends that error's code and reason ON THE WIRE.** The error is not decoration: it
is how a page says "4001, my token expired" instead of just vanishing. A reason
with no code defaults to 1000, because a reason needs a code to travel in.

**⭐ The writable's `close()` must not resolve until the closing HANDSHAKE
completes.** Resolving early would tell the page its last message was delivered
when it may still be in flight — and WPT times that promise against a one-second
floor precisely to catch an implementation that resolves eagerly.

**⭐ The public `WebSocketError` constructor validates the close code (1000 or
3000–4999) but the engine's internal factory does not.** The codes the engine has
to *report* include the protocol's own — 1006, "closed abnormally", above all,
which is the one a reconnecting page actually keys on. **Validation belongs on
what a page asserts, not on what the network did.**

---

## Results

`websockets/stream/tentative/*`, from a baseline of **0** (the interface did not
exist):

| file | after |
|---|---|
| `websocket-error.any.html` | **10/10** |
| `constructor.any.html` | **8/8** |
| `close.any.html` | **22/27** |
| `remote-close.any.html` | 4/7 |

Real connections throughout — `constructor.any.html` negotiates a subprotocol
against `wpt.live` and reads the server's reply back out of a `ReadableStream`.

Plus, from the correction above: `mimesniff/.../charset-parameter.window.html`
**38/41 → 39/41**, and `mimesniff/.../parsing.any.html` held at Chrome parity.

---

## One bug found on the way, in a different realm

`new URL(null, base)` returned **the base**. `url` is a required `USVString`, so
`null` converts to the four-character string `"null"` — it does not mean "no URL".
Folding it to `""` produced the one wrong answer a caller could mistake for
success: **a relative path built from a null variable silently resolved to the
current page** instead of failing or resolving to `/null`. Fixed; `base`, being
genuinely optional, keeps its absent-when-nullish reading.
(`websockets/Create-non-absolute-url.any.html` 4/5 → **5/5**.)

---

## Caps, named honestly

- **`mimesniff/mime-types/parsing.any.{html,worker.html}` is capped at 712/1898
  and that cap is CORRECT.** Winning it requires contradicting FileAPI's normative
  text and breaking three other WPT files. Do not "fix" it.
- **`websockets/stream/tentative/abort.any.html` 0/3 and
  `backpressure-receive.any.html` 0/1.** The abort path now rejects with
  `AbortError`, but the tests also require that an already-aborted signal prevent
  the connection from being *attempted* (verified via a server-side stash), and
  our connect op has already been dispatched by then.
- **`remote-close.any.html` 4/7** — the remaining rows are about a server-initiated
  close arriving mid-read.
- **`websockets/cookies/*` (9 files) still 0/1 each** — the handshake carries no
  cookies (banked from #491).
