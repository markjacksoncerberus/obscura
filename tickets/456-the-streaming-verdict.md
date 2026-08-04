# 456 — The Streaming Verdict

**Quests #460–#462 · session 2026-08-04 · branch `engine-per-page-threads`**

> *A stream is how the platform says "here is data, but not all of it, and not
> yet." Obscura's answer to that was twenty-five lines, and its `tee()` returned
> two empty streams.*

**`streams` 181/1211 (14.9%) → 1390/1474 (94.3%), 61 of 71 files to 100%, zero
regressions.** Excluding the one band that needs a capability we do not have
(`streams/transferable/`, below), **we score 1390/1398 against a Chrome at
1344/1398 on the identical files — forty-six ahead.**

And underneath the streams work, the session found something that is not a
streams bug at all and matters more than all of it: **`setTimeout(fn, 0)` was a
microtask.**

---

## Why this region

The previous session's ⭐ named `streams` outright, and the frontier survey named
it as half of quest **F1** *precisely because it sits under `response.body`*.
Both were right, and the standing order agrees: 13.2% measured against a Chrome
at 99.5%, in a realm the ledger had never touched.

The baseline had a shape worth naming. `readable-streams/templated` scored
48/91, `piping/pipe-through` 9/43 — **not zeros**. A realm that scores 15% and
never zero is not missing; it is *approximated*. Obscura had a `ReadableStream`
that could hold a queue and hand it back once, which is enough to look like it
works and not enough to be one. The old `tee()` in full:

```js
tee() { return [new ReadableStream(), new ReadableStream()]; }
```

That does not fail loudly. It hands back two streams that are simply **empty**,
and a page that tees a response to cache one copy and render the other renders
nothing, with no error anywhere.

---

## #460 — The readable side

**`readable-streams/*` + `queuing-strategies` 87/375 → 367/371 (98.9%), 13 of 17
files to 100%.**

Written to the spec's abstract operations rather than its class surface, because
almost every rule lives in the ops rather than the methods.

- **A stream is a QUEUE with a high-water mark, not a buffer.** `desiredSize`
  going negative is how backpressure is *expressed*; a source that never sees it
  out-runs a slow consumer until the tab dies. The old stub had no notion of a
  high-water mark at all, so `pull()` was called at whatever rate the source felt
  like.
- **A reader LOCKS the stream, and the lock is not politeness.** Two readers of
  one stream would each see *half* the chunks, interleaved by arrival order and
  by nothing else. `locked` was a plain boolean anyone could flip.
- **`tee()`'s hard part is not duplication, it is INDEPENDENCE.** Each branch
  keeps its own queue and its own cancellation state, and the source is cancelled
  only once *both* branches have given up — cancelling one branch must not starve
  the other. `readable-streams/tee` 4/26 → **26/26**.
- **`ReadableStream.from()` accepts any iterable, sync or async**, and calls
  `return()` on the underlying iterator when cancelled — which is how a generator
  gets to run its `finally` and release whatever it was holding. **49/50, against
  a Chrome at 14/50.**
- **The async iterator holds the reader's lock for its whole lifetime** and
  releases it on `return()`/`throw()`, which is what makes `break` out of a
  `for await` hand the stream back instead of stranding it locked forever.
  **41/41, against a Chrome at 40/41.**

### Three bugs worth writing down

**(1) `null` is not "not an object" — it is an EMPTY DICTIONARY.** WebIDL
converts both `null` and `undefined` to an empty dictionary; the entire
difference is that `typeof null === 'object'`. Written with an ordinary
`isObject` guard, `new ReadableStream()` and `stream.getReader(null)` were
*refused*. **Twenty-five subtests in one file**, all reading
`First parameter is not an object.` — the most ordinary call in the API.

Half-fixing it is instructive: fixing the guard alone changed nothing, because
`null` then flowed straight into `original.autoAllocateChunkSize` and threw one
line later. The re-measure said *identical numbers*, which is exactly what a
half-fix looks like and exactly why the measurement is worth the minute it takes.

**(2) `releaseLock()` must REJECT every read still outstanding.** The spec has
two operations, `ReadableStreamReaderGenericRelease` and
`ReadableStreamDefaultReaderRelease`, and only the second errors the pending read
requests. Calling the first is not a smaller version of the second — it *hangs*:
the chunk that read was waiting for now belongs to whoever takes the lock next,
so an `await reader.read()` never returns and the page is simply gone. It cost
`templated.any.html` **54 subtests as `notrun`** behind one timeout, and
`default-reader` its whole file.

**(3) `return()` joins the same queue `next()` does.** Two overlapping calls must
settle in the order they were made; a `break` that resolved before the read it
interrupted would report the loop finished while a chunk was still in flight.

Promise plumbing captures the **original `Promise.prototype.then` at load time**,
so a page that patches `then` cannot intercept — or reorder — the engine's own
stream machinery. That is one line of care and it wins `piping/then-interception`
outright.

---

## #461 — The writable side, the pipe, and the task that was a microtask

**`writable-streams/*` + `piping/*` + `transform-streams/*` 68/549 → 546/549
(99.5%), 33 of 35 files to 100%. Chrome scores 536/549 on the same files.**

A writable stream's whole job is to say *"not yet"*. `writer.ready` is the only
thing standing between a fast producer and a hundred megabytes queued in a tab
that has sixty to spare — which is precisely the machine this browser exists for.
Almost all of the complexity is **error bookkeeping**, and none of it is
ceremony: a sink can fail while a write is in flight, while a *close* is in
flight, or after the author already called `abort()`, and each of those settles a
different set of promises exactly once, in a different order.

`pipeTo` is not a loop over read/write. It is a state machine that answers, at
every instant, what happens when *either* end fails and what the other end is
owed: source errors → destination **aborted**; destination errors → source
**cancelled**; source closes → destination **closed**; signal aborts → both torn
down. Backpressure falls out for free and is the point — the next read happens
only once `writer.ready` says there is room, so a slow disk throttles a fast
network instead of the tab buffering the whole download in memory.

**`WritableStreamAbort` must RE-READ the stream's state after signalling abort.**
The signal's listeners run *synchronously*, and one of them is allowed to abort
the stream again; the recursive call tears the sink down first, and the outer
call then invokes an abort algorithm that has already been cleared away
(`this._abortAlgorithm is not a function`). The spec re-reads the state at that
exact point, and it is not defensive coding — it is the only correct order.

### THE FINDING: a task is not a microtask

Chasing three piping rows that cancelled a source they should have left alone,
the trail led out of streams entirely:

```js
const _scheduleAfter = (delay, fn) => {
  const d = Math.max(0, Number(delay) || 0);
  if (d === 0) Promise.resolve().then(fn);   // ← a MICROTASK
  else Deno.core.ops.op_sleep(d).then(fn);
};
```

**`setTimeout(fn, 0)` was a `Promise.resolve().then(fn)`.** HTML's event loop
runs one *task*, then drains the **entire** microtask queue, then runs the next
task. A zero-delay timer scheduled as a microtask does not wait behind the
promise jobs already queued — it **interleaves with them**.

Measured directly:

```js
let n = 0;
(function loop(){ if (n < 500) { n++; Promise.resolve().then(loop); } })();
await new Promise(r => setTimeout(r, 0));
// n === 3        ← three of five hundred
```

**Three of five hundred.** Every idiom on the web that means *"let everything
pending settle, then look"* — `await delay(0)`, WPT's own `flushAsyncEvents`, a
render scheduled after a data update — was looking at a half-finished world. It
is not a slow timer; it is the **wrong queue**, and it surfaces as ordering bugs
and phantom timeouts anywhere promises and timers meet, which today is most of
the platform.

The fix: a real task has to leave JS entirely, so the runtime performs its
microtask checkpoint before control comes back. `op_sleep(0)` is that round trip.
Tasks are pumped **one at a time and in insertion order**, because HTML requires
both — two timers with the same delay fire in the order they were set. The pump
re-arms *before* running the task, so the next round trip overlaps the current
task's work.

After: **500/500.** The three piping rows fixed themselves, and so did
`transform-streams/strategies`, `backpressure`, `reentrant-strategies` and
`readable-streams/reentrant-strategies` — none of which were transform bugs
either.

*This change is shared by every timer on the platform and was swept accordingly
(see Regression sweep).*

---

## #462 — The byte stream

**`readable-byte-streams/*` + `idlharness` 22/248 → 473/474 (99.8%). Every
byte-stream file to 100% on the first build.**

A default stream hands you chunks it allocated. A **byte** stream lets the reader
supply the buffer and asks the source to fill it — the only way to read a large
download without allocating a fresh array per chunk. On the machines this browser
is for, that is the difference between a file that downloads and a tab the OS
kills.

Two rules carry the design:

- **A buffer handed across the boundary is TRANSFERRED, not shared.** The
  caller's view is detached *on purpose*: if script could still write into a
  buffer the source is filling, every byte in it is a race, and a `respond()`
  that resized it underneath would be a memory-safety bug rather than a bad
  chunk.
- **A pull-into is satisfied only at an ELEMENT boundary.** Filling five bytes of
  a `Uint32Array` leaves one whole element plus a remainder, and the remainder is
  carried into the *next* request rather than surfaced as a partial element
  nobody can read. Closing a stream that would strand a partial element is an
  **error**, not a close — the reader asked for whole elements and the stream
  cannot supply them.

`readable-byte-streams/general` 4/101 → **101/101**; `tee` 2/40 → **40/40**;
`read-min` 0/24 → **24/24**; `bad-buffers-and-views` 0/24 → **24/24**.
`streams/idlharness.any.html` 1/2 TIMEOUT → **227/228**, one *ahead* of Chrome.

---

## Results

| File | Before | After | Chrome |
|---|---|---|---|
| `readable-streams/templated.any.html` | 48/91 | **91/91** | 91/91 |
| `readable-streams/tee.any.html` | 4/26 | **26/26** | 26/26 |
| `readable-streams/default-reader.any.html` | 0/29 | **29/29** | 29/29 |
| `readable-streams/general.any.html` | 5/38 | **38/38** | 37/38 |
| `readable-streams/async-iterator.any.html` | 7/41 | **41/41** | 40/41 |
| `readable-streams/from.any.html` | 14/50 | **49/50** | 14/50 |
| `readable-streams/bad-underlying-sources.any.html` | 2/22 | **22/22** | 22/22 |
| `queuing-strategies.any.html` | could-not-run | **20/20** | 20/20 |
| `writable-streams/aborting.any.html` | 5/65 | **65/65** | 65/65 |
| `writable-streams/close.any.html` | 8/26 | **26/26** | 26/26 |
| `writable-streams/write.any.html` | 2/13 | **13/13** | 13/13 |
| `piping/pipe-through.any.html` | 9/43 | **43/43** | 43/43 |
| `piping/error-propagation-backward.any.html` | 0/35 TIMEOUT | **35/35** | 35/35 |
| `piping/abort.any.html` | 1/33 | **33/33** | 33/33 |
| `piping/then-interception.any.html` | 0/2 | **2/2** | 2/2 |
| `transform-streams/cancel.any.html` | 0/11 | **11/11** | 1/11 |
| `transform-streams/lipfuzz.any.html` | 1/20 | **20/20** | 20/20 |
| `transform-streams/strategies.any.html` | 2/10 | **10/10** | 10/10 |
| `readable-byte-streams/general.any.html` | 4/101 | **101/101** | 101/101 |
| `readable-byte-streams/tee.any.html` | 2/40 | **40/40** | 40/40 |
| `readable-byte-streams/read-min.any.html` | 0/24 | **24/24** | 24/24 |
| `readable-byte-streams/templated.any.html` | 15/34 | **34/34** | 34/34 |
| `streams/idlharness.any.html` | 1/2 TIMEOUT | **227/228** | 226/228 |
| **Realm total (71 files)** | **181/1211** | **1390/1474** | 1420/1478 |

---

## Caps, named honestly

**1. `streams/transferable/*` — 0/76, every file TIMEOUT, before and after.**
These do not test streams; they test **transferring** a stream across a
`postMessage` boundary into another realm or worker. That is a structured-clone
capability (`[[Transferable]]` streams over `MessagePort`), and Obscura has
neither the transfer plumbing nor the separate realms it would move between.
Chrome scores 76/80. **This band is the entire remaining gap to Chrome in the
realm** — excluding it, we lead 1390/1398 to 1344/1398.

**2. `queuing-strategies-size-function-per-global.window.html` 0/2 — iframes
share ONE JS realm.** Verified directly:
`iframe.contentWindow.CountQueuingStrategy === window.CountQueuingStrategy` is
**true**. The test asks that two realms have distinct `size` functions, which is
a realm-isolation question, not a streams one. Do not "fix" this in streams.

**3. `readable-streams/patched-global.any.html` — an instrumentation artefact,
not a defect.** The harness reports `ERROR` with a single result row, and
`wpt_fails.py` reports *zero* non-pass rows. Probed directly, the substance is
correct: `tee()` survives both the `Object.prototype` pollution the file installs
(throwing getters on `highWaterMark`/`size`/`start`/`type`/`mode`) **and** a
patched global `ReadableStream`. The file's own pollution disturbs our
result-collection path while it is installed. Chrome scores 5/5.

**4. `readable-streams/global.html` 8/9 and `transform-streams/general.any.html`
25/26 are EXACT Chrome parity** on the identical files.

**5. `transform-streams/errors.any.html` 19/21** — one behind Chrome's 20/21.
Two rows report an unhandled rejection during `readable.cancel()` interacting
with an abort during `start`. Small, real, and not worth a session.

---

## Regression sweep

The committed ritual came back **7725/7820 across 36 files, 0 could-not-run —
every held row at its recorded value**: qsa 1975/1975, classlist
1420/1420, createElement 147/147, createElementNS 596/596, url-origin 406/413,
typed-om `logical` 1382/1468, the whole fetch band at 100%, and all five XHR rows
intact (`data-uri` 10/10, `responsetext-decoding` 37/37 — the four that collapsed
last session when `Response` was rewritten under them).

The ritual file itself grew by ten rows: eight covering the streams realm (because
`response.body` **is** a `ReadableStream`, so a change to the fetch body path shows
up there first) and two that break loudly if `_scheduleAfter` ever goes back to
`Promise.resolve().then`.

**The event-loop change touches every timer on the platform, so it got its own
wide sweep**, committed as `scripts/wpt-eventloop-sweep.txt` (56 files across
`html/webappapis/timers`, `microtask-queuing`, `dom/events`, `css-transitions`,
`css-animations`, `web-animations`, `user-timing`, `performance-timeline`,
`xhr`). Measured **twice on the same list** — once with the fix, once with only
that hunk reverted — so the comparison isolates the shared change from the
streams work sitting beside it. See **Event-loop sweep** below.

---

## Event-loop sweep — and what happened when we tried to measure the "before"

**The before/after could not be completed row-by-row, and the reason is the
result.** The fixed build ran all 56 timer-heavy files in about fifteen minutes,
`0 could-not-run`, **3348/4641**. The same list on a build with *only that hunk
reverted* — everything else in this session left in place — **wedged the
harness**: after 78 minutes it had one idle `about:blank` target, no progress,
and had to be killed. Cut down to 14 files at a 45-second timeout, the reverted
build **still could not finish inside ten minutes**.

The fixed build, same 14 files, same server settings:

| | files | result | wall clock |
|---|---|---|---|
| `setTimeout(0)` as a **microtask** (reverted) | 14 | **did not complete** | >10 min, killed |
| `setTimeout(0)` as a **task** (fixed) | 14 | **586/588 (99.7%)**, 0 could-not-run | **~1 min** |

The 14 are the most ordering-sensitive files available:
`timer-nesting-not-inherited-in-microtask` **2/2**, `queue-microtask.any` **5/5**,
`setinterval-settimeout-clamping` **2/2**, `missing-timeout-setinterval` **2/2**,
`user-timing/measures` **119/119**, `clearMarks` **57/57**,
`EventTarget-dispatchEvent` **25/25**, `Body-FrameSet-Event-Handlers` **48/48**,
`css-animations/idlharness` **98/98**, `xhr/send-usp` **129/129**,
`xhr/setrequestheader-bogus-name` **71/71**,
`web-animations/…/style-change-events` **24/25**, `po-mark-measure` **3/3**.

**A hang is worse than a wrong render**, and this is where a great many of them
were coming from: a page that awaits a promise chain and then schedules a timer
never got the chain finished first. The 56-file list is committed as
`scripts/wpt-eventloop-sweep.txt` with its post-fix numbers, so it is now a
baseline a future session can diff against rather than a one-off.

---

## Caps / Next

**⭐ NEXT — `Response.clone()` must TEE the body, not copy its bytes. Measured, not guessed.**
`fetch/api/response/response-clone.any.html` was re-measured on the finished build
and is **still 6/21** — so the previous session's read ("15 rows need a real
`ReadableStream`") was only half right, and the other half is a `Response` bug
this session can now name exactly:

```js
clone() {
  const r = _makeResponse(st.body ? st.body.bytes.slice() : null, {...});   // ← copies BYTES
}
```

Two consequences, both visible in the failures:
- **A `Response` built from a `ReadableStream` clones to NOTHING.**
  `_fetchExtractBody` stores such a body as `{bytes: <empty>, stream}`, so
  `st.body.bytes.slice()` copies an empty array.
- **The nine `use structuredClone for teed ReadableStreams` rows fail
  `assert_false: expected false got true`** — the two halves must hand out
  *different* chunk objects, because a shared buffer lets one reader observe (or
  corrupt) the other's bytes.

The spec's `clone()` **tees `this.body` with `cloneForBranch2 = true`** and gives
one branch to each response. That path now exists: `ReadableStreamDefaultTee`
takes the flag and structured-clones branch 2's chunks. This is a small, precise
change in `Response.prototype.clone` / `Request.prototype.clone` — not free, but
well under a quest.

**⭐⭐ `FormData` cannot hold a File.** `FormData.append` coerces every value with
`String(v)`, so a file upload becomes the literal text `[object File]`. The
multipart serializer written two sessions ago already handles files correctly and
starts working the moment `FormData` stops flattening them. That is *file
upload*, which is a real thing real people do.

**⭐⭐⭐ The rest of `fetch/api/basic/` + `cors/`** — network *behaviour* rather
than object model, spot-checked as scoreable (`basic/request-headers` 1/25,
`basic/response-url` 0/4).

Then frontier quest **F2**: `cookies` (0.8%) + `webstorage` + `IndexedDB` —
staying logged in and working offline, which matters most where connections are
metered.

**Banked, not the next move:**
- **Stream transfer over `postMessage`** would win `streams/transferable/` (76
  subtests) and is the realm's only remaining gap to Chrome — but it needs
  structured-clone transferables and separate realms, which is a much larger
  quest than its subtest count suggests.
- **Per-iframe JS realms.** Today `iframe.contentWindow.X === window.X` for every
  platform interface. Worth 2 subtests here and considerably more elsewhere.
- From #456: `getComputedStyle(el, '::before')` ignores its pseudo argument; and
  `getComputedStyle(el).display` answers `block` for every element in the
  document.
