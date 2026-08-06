# 📜 Quest #481 — The Compressed Verdict

> *`compression/` — `CompressionStream` and `DecompressionStream`.*
> **4/338 → 338/338 (100%) window · 0 → 338/338 worker · 676/676 total.**
> Chrome 151 scores **265/338 on each of those same two variants**. We are **146 subtests ahead.**

---

## The gap

The frontier survey and the worker arc both named this realm and neither owned it:
**`CompressionStream` and `DecompressionStream` did not exist.** Not stubbed —
absent. Nineteen files, four formats, 338 subtests per variant, and the only
thing scoring was 4 rows of `idlharness` that pass for any missing interface.

That is not an abstract hole. A page that can compress before it uploads and
decompress what it caches moves a fraction of the bytes. On a metered connection
that is the difference between a page a reader can afford and one they cannot —
and it is *exactly* the kind of feature a site adopts precisely because it helps
the readers with the worst connections.

Baseline, measured before a line was written:

```
compression/compression-bad-chunks.any.html                   0/28  OK
compression/decompression-split-chunk.any.html                0/60  OK
compression/idlharness.https.any.html                         4/20  OK
…
Subtests: 4 PASS / 334 FAIL = 338 total  (1.2% pass)
```

---

## The work

New `crates/obscura-js/src/compress_ops.rs` (five ops, ~470 lines with tests),
and a `CompressionStream`/`DecompressionStream` pair in `bootstrap.js` built on
the `TransformStream` the streams quest already made real.

**DEFLATE is `flate2` over the pure-Rust `miniz_oxide` backend** — deliberately
`default-features = false, features = ["rust_backend"]`, so the browser still
builds with no C toolchain anywhere near it. **Brotli is the `brotli` crate.**
Both were already in the lock file, pulled in by `reqwest`; the cost of this
whole realm in new dependency surface was two lines of `Cargo.toml`.

### ⭐ The gzip framing is written out, and that is a feature, not a workaround

`flate2`'s own gzip helpers are compiled only with a C zlib backend, so RFC 1952
— the ten-byte header, `FEXTRA`/`FNAME`/`FCOMMENT`/`FHCRC`, and the CRC-32 +
ISIZE trailer — is written out in `compress_ops.rs`. That turned out to be the
better position: `decompression-corrupt-input` walks *every field of the header*
and asserts exactly which mutations are survivable and which are fatal, and with
the parser in our hands each of those answers is one visible line.

Two details worth keeping:

* **`FHCRC` is the only place gzip checks itself before spending work on the
  payload.** Flip one byte of the header with `FHCRC` set and the 16-bit check
  catches it. WPT tests precisely that (`FLG` = 2 → error).
* **The header we *write* has MTIME 0 and OS `0xff` ("unknown").** A real
  timestamp and a real OS byte are two bits of fingerprint the format does not
  need and no reader of the data ever wants.

### ⭐⭐ THE PRIMITIVE: a chunk can be BOTH PRODUCTIVE AND FATAL

This is the shape that decides the API. `decompression-extra-input` writes a
valid compressed stream **with one pad byte appended, in a single chunk**, and
then asserts:

```js
const { done, value } = await reader.read();
assert_array_equals(Array.from(value), expectedChunkValue);      // the payload arrives
await promise_rejects_js(t, TypeError, reader.read());           // …and THEN it errors
```

A push that returns `Result<Vec<u8>, Error>` cannot express that. Reporting the
error throws away the bytes that were legitimately decoded; returning the bytes
loses the error. So **`op_compress_push` never fails**: it returns whatever it
produced and *records* the error, and JS asks for it separately with
`op_compress_errored`.

The JS side then has to enqueue **before** it throws — and that ordering is load
bearing for a reason that is pure streams semantics: a reader already waiting on
`read()` is fulfilled *directly*, bypassing the queue, so it receives the chunk;
erroring first would run `ResetQueue` and drop it. Enqueue, then throw.

### The other rules that only show up in the tests

* **Every failure is the same `TypeError` with the same message.** That is not
  the spec being lazy. Telling a page *how* its input was malformed tells anyone
  who can feed it input something about what is on the other side.
* **A `SharedArrayBuffer` is not a `BufferSource`.** Its contents can change
  under the codec mid-read, so the standard excludes it rather than let a race
  decide what got compressed. The whole test is
  `view.buffer instanceof ArrayBuffer` — a shared buffer answers false.
* **The bytes are copied into Rust synchronously, before control returns to the
  page.** `compression-with-detach` detaches the input buffer from an
  `Object.prototype.then` getter, which can only run at an await boundary. A
  codec that reads the bytes first cannot be handed an emptied buffer; one that
  awaits first can.
* **An empty tail is not a chunk.** "If buffer is empty, return" — a page
  reading a stream of an empty gzip member must see `done`, not a zero-length
  `Uint8Array`.
* **A truncated stream is an error at `close()`, not a short read.** A
  decompressor that returned what it had would hand the page a silently
  half-read file — the worst possible outcome, because nothing reports it.

---

## Results

| Test (both `.any.html` and `.any.worker.html`) | Before | After |
| --- | --- | --- |
| `compression-bad-chunks` | 0/28 | **28/28** |
| `compression-constructor-error` | 0/3 | **3/3** |
| `compression-including-empty-chunk` | 0/12 | **12/12** |
| `compression-large-flush-output` | 0/4 | **4/4** |
| `compression-multiple-chunks` | 0/60 | **60/60** |
| `compression-output-length` | 0/4 | **4/4** |
| `compression-stream` | 0/13 | **13/13** |
| `compression-with-detach` | 0/1 | **1/1** |
| `decompression-bad-chunks` | 0/36 | **36/36** |
| `decompression-buffersource` | 0/48 | **48/48** |
| `decompression-constructor-error` | 0/3 | **3/3** |
| `decompression-correct-input` | 0/4 | **4/4** |
| `decompression-corrupt-input` | 0/29 | **29/29** |
| `decompression-empty-input` | 0/4 | **4/4** |
| `decompression-extra-input` | 0/4 | **4/4** |
| `decompression-split-chunk` | 0/60 | **60/60** |
| `decompression-uint8array-output` | 0/4 | **4/4** |
| `decompression-with-detach` | 0/1 | **1/1** |
| `idlharness.https.any` | 4/20 | **20/20** |
| **window total** | **4/338** | **338/338 (100%)** |
| **worker total** | **0** (unmeasured) | **338/338 (100%)** |

Five Rust unit tests in `compress_ops.rs` cover the round trip for all four
formats, trailing garbage, truncation, a corrupted CRC, and a gzip header
delivered one byte at a time.

### Chrome comparison — measured, not assumed

Chrome 151.0.7922.76 on the same directory (from its own wpt.fyi run summary):

```
window          265 / 338
worker          265 / 338
sharedworker    245 / 318
serviceworker   245 / 318
```

Chrome fails **73 subtests per variant** — the `brotli` format, which it does not
implement in `CompressionStream`. We do, so **676/676 against Chrome's 530 on
the same two variants: 146 ahead.**

---

## Caps / Next — honest

* **Brotli quality is 6, not 11.** Quality 11 is where brotli earns its
  reputation and also where it costs seconds of CPU per megabyte. On the
  hardware this browser exists for, that is the wrong trade. No test measures
  it; a site that wants the last few percent cannot ask for it.
* **The codec table is per-isolate and freed explicitly** from flush, error and
  cancel. A stream that is dropped without any of those — abandoned mid-write and
  garbage collected — leaks its codec state (tens of KB). A `FinalizationRegistry`
  would close that, and is the natural follow-up.
* **`compression-output-length` and `compression-stream` fetch a multi-megabyte
  `.webm` from wpt.live.** They pass, but they are the slow rows in the sweep.
* **Not touched:** `.any.sharedworker.html` / `.any.serviceworker.html` variants
  of this realm — 318 subtests each. The sharedworker half already scores (see
  Quest #483); the serviceworker half is that quest's subject.

---

## Zero-regression proof (all three quests, one commit)

Not a recorded total compared from memory — a **stash / rebuild / re-measure /
per-file diff**, which is the only version of this claim that means anything:

| | files | subtests | fails |
| --- | ---: | ---: | ---: |
| **before** (tree stashed to `1b43d34`, rebuilt) | 81 | 22,884 / 23,070 | **186** |
| **after** (this commit) | 87 | 23,711 / 23,897 | **186** |

**80 files compared, 0 changed** — every single row byte-identical. The
denominator grew by exactly **827**, which is exactly the six new guard files,
all at 100%:

```
+ compression/decompression-corrupt-input.any.html          29/29
+ compression/decompression-extra-input.any.html             4/4
+ compression/compression-bad-chunks.any.worker.html        28/28
+ urlpattern/urlpattern.any.html                          370/370
+ urlpattern/urlpattern-compare.tentative.any.html          26/26
+ urlpattern/urlpattern.any.serviceworker.html            370/370
```

23,070 + 827 = 23,897. 22,884 + 827 = 23,711. Both reconcile to the byte.

⚠️ **A note for the next comrade on the recorded baseline.** The campaign memory
records the previous ritual as *21,428/21,539, 111 fails over 81 files*, and this
run measured *22,884/23,070, 186 fails* over the **same 81 files on the unmodified
tree**. That is not a regression that predates us — it is wpt.live moving under
the ledger. **A recorded ritual total is only comparable against a run of the same
snapshot**, which is why the before/after above was measured fresh rather than
read off the page.
