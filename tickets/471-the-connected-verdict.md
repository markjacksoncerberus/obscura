# 🔌 Scroll 471 — The Connected Verdict

> **Quest #480** · `MessagePort` / `MessageChannel` / `SharedWorker`, and the MIME rule on `importScripts` · 2026-08-05
> `…/messagechannel.any.html` (**window**) **32/152 → 136/152** · the `.any.sharedworker.html` probe **0 (all could-not-run) → 1,477/2,537** across 24 files · `workers/importscripts_mime_local.any.worker.html` **12/48 → 48/48**
> Baselines measured on the **stashed, unmodified tree**, rebuilt — not remembered.

---

## Why

Quest #478 gave the platform a worker global scope; Quest #479 proved the realms
we hold flow through it. What was still missing is the **channel**: the object a
page uses to talk to a worker on purpose, rather than through the one implicit
`postMessage` a dedicated worker gets for free.

`MessagePort` was this:

```js
globalThis.MessagePort = class MessagePort {
  constructor(){} postMessage(){} close(){} addEventListener(){} removeEventListener(){}
};
```

Five methods, all of them no-ops. `MessageChannel` was a shade better — two object
literals whose `postMessage` reached across and called the peer's `onmessage` with
a bare `{data}` — but it had no events, no listeners, no structured clone, and, most
importantly, **no queue**.

And `SharedWorker` was a constructor that built a `port` out of the same five no-ops.

## The three things that were wrong, in order of how much they matter

### 1. ⭐ A port starts DISABLED, and that is the whole feature

The part that is easy to miss and impossible to fake: a `MessagePort`'s message
queue is **not enabled** until someone calls `start()`. Messages posted to it pile
up. Nothing is delivered, and nothing is lost.

That is precisely what makes handing a port to someone else safe. A page mints a
channel, keeps `port1`, ships `port2` to a worker, and can start posting
immediately — because everything it sends before the worker gets around to
listening is **waiting there**, in order, rather than fired into a void. Without
the queue, "transfer a port" is a race, and the loser is whoever is on the slower
machine.

The implementation is small and the one subtlety is spec'd for exactly this
reason: **assigning `onmessage` implicitly starts the port** (HTML
§handler-messageport-onmessage). Most real code never calls `start()` — it writes
`port.onmessage = …` and expects delivery. A queue with no implicit start would sit
there full forever, which looks exactly like a dead channel.

### 2. A shared worker is keyed by (URL, name), and that IS the point

`new SharedWorker(url)` twice does **not** start two workers. The second call
connects to the one already running, by sending it a `connect` event carrying a
fresh port. Five tabs of the same site, one worker.

That sharing is not a nicety on a low-spec machine — it is the difference between
one worker's memory and five. So the registry is keyed by `(script URL, name)`,
the first construction starts the scope, and every construction — first or
fiftieth — gets a port. Connections that arrive before the script has run are
queued and fired **after** it, so a shared worker never receives a `connect` its
`onconnect` handler is not yet installed to hear.

Per HTML the `connect` event carries the port in **both** `ports` and `source` —
the two spellings that real code and `testharness.js` respectively reach for, and
missing either one makes the event useless to half the world.

### 3. `importScripts` must refuse a script that is not served as JavaScript — and the rule is not network-only

This is a real security boundary, not bookkeeping. A site that lets users upload a
`.csv` and serves it back as `text/csv` is safe right up until something agrees to
**execute** it. HTML fails the load outright for any non-JavaScript MIME type, and
notably `text/plain` and `text/html` are on the blocked list precisely because they
are what an unsuspecting endpoint hands back.

**The gap worth naming: we applied it only to the network path.** A `data:` URL
carries its type inside the URL and a `blob:` URL carries it in the Blob's `type`,
and both of those are attacker-reachable — a page that turns user content into a
Blob and imports it is the exact shape the rule exists to stop. `data:` and `blob:`
are the two cases where the check *looks* unnecessary because there is no server
involved, and they are the two cases where the content came from the page itself.

`workers/importscripts_mime_local` measures all three, twelve MIME types deep,
including the funky-capitalisation set (`TeXt/HtMl`) — a MIME essence is compared
case-insensitively, and an **empty** essence fails too: no declared type is not a
JavaScript type.

### ⭐ 4. A port can be MOVED but never COPIED — and the test for it had been passing for the wrong reason

The zero-regression ritual came back **21,427 / 21,539 against a recorded 21,428**.
One subtest. Worth chasing, and it turned out to be the most interesting thing in
the quest.

The missing row was `IndexedDB/structured-clone.any.html`'s
*"Not serializable: MessageChannel"*, which asserts that
`store.put(new MessageChannel(), 'key')` throws `DataCloneError`.

**It had been passing by accident.** The old stub kept `port1` and `port2` as *own
enumerable properties* holding object literals full of functions — and structured
clone throws on a function. So the right exception came out for entirely the wrong
reason. Replacing the stub with a real `MessageChannel`, whose ports live behind
prototype getters, left the cloner nothing own-enumerable to walk: it produced a
cheerful empty object and threw nothing.

Fixed with the actual rule rather than by restoring the accident. **A `MessagePort`
is `[Transferable]` but NOT `[Serializable]`.** It can cross a boundary only by
being *moved*; two live copies of one end of a channel is not a thing the model can
express. So a port passed without a transfer list is an **error**, and a
`MessageChannel` — not transferable at all — can never cross. Refusing loudly is
the entire point: **a page handed a dead port instead of a `DataCloneError` has no
way to find out its channel never connected.**

**The lesson, and it generalises past this quest: replacing a stub can LOSE a test
that the stub was passing for the wrong reason.** A green row is evidence that the
right thing happened, not that it happened for the right cause — and the moment to
find out is when a correct implementation makes the row go red. This is the same
family as the arc lesson from Quest #469 (*182 subtests were passing because the
stub lied*), seen from the other side: there, becoming honest **removed** points;
here, becoming honest removed one and handed back the real rule that earns it.

### Two smaller fixes, both about base URLs

* A **blob: worker's** location has an **opaque path**, so it cannot be a base at
  all — `new URL('/x', 'blob:https://h/uuid')` throws. Its origin is its creator's,
  so `importScripts('/…')` resolves against the creating document's URL, which is
  what every other browser does.
* `_dispatchSpec`, not `_dispatchPublic`, for every UA-originated port and worker
  event, so `isTrusted` survives.

## The results

Baselines measured by stashing `bootstrap.js`, rebuilding, and re-running — the
campaign's regression-proof, run in both directions:

| test | before (stashed build) | after |
|---|---|---|
| `html/…/messagechannel.any.html` (**window**) | **32/152** | **136/152** (+104) |
| `webmessaging/message-channels/close.any.html` | 2/6 | **4/6** |
| `workers/importscripts_mime_local.any.worker.html` | 12/48 | **48/48** |
| `html/webappapis/structured-clone/structured-clone.any.html` | 141/152 | **141/152** — unchanged |
| `webmessaging/MessageEvent.any.html` | 9/9 | **9/9** — unchanged |
| `streams/idlharness.any.sharedworker.html` | **could-not-run** | **227/228** |
| `…/messagechannel.any.sharedworker.html` | **could-not-run** | **124/137** |
| `encoding/encodeInto.any.sharedworker.html` | **could-not-run** | **110/111** |
| `streams/readable-streams/templated.any.sharedworker.html` | **could-not-run** | **91/91** |

The 24-file `.any.sharedworker.html` probe, all previously could-not-run:
**1,477 / 2,537 (58.2%), zero could-not-run.** Of the remainder, the two
`compression/*` files (0/60 each) and most of the `fetch/data-urls/*` shortfall are
realm gaps that fail identically on the window side; five files time out on slow
`fetch` suites.

**Zero regressions, proved.** The full 76-file ritual: **21,428 / 21,539, 111 fails —
the recorded baseline to the subtest.** The eight imperfect files were stash-compared
individually against the unmodified tree and come back **3,332 / 3,443, 111 FAIL,
identical in both directions.**

**Note the row that matters most: `messagechannel.any.html` is a WINDOW test.**
The port work paid off four times over on the main thread before a single worker
was involved — 32/152 was what a page got from `MessageChannel` before today.

## Caps — honest

* **A `MessagePort` cannot be transferred.** `structuredClone`'s transfer list
  accepts `ArrayBuffer` only, so `worker.postMessage(x, [port])` throws
  `DataCloneError`. That is why `webmessaging/message-channels/worker.any.html`
  times out, and it is the single biggest remaining item in the messaging story.
* **`BroadcastChannel`** is untouched (~40 subtests in `webmessaging`).
* **Cross-window `postMessage` with ports** (`webmessaging/with-ports/*`) still
  times out — a different feature (window-to-window messaging), not port plumbing.
* A shared worker is shared **within one page**, since our registry is per-JS-realm
  and a realm is per page. Two tabs get two workers. Real sharing needs the
  registry in Rust, above the page threads.
* Everything inherited from Quest #478 still applies: no parallelism, shared
  intrinsics, classic scripts only.

## Next

1. **Transferable `MessagePort`** — unlocks `webmessaging/message-channels/worker`
   and the port half of the structured-data suite.
2. **`.any.serviceworker.html`: 661 files / 9,092 subtests**, wholly untouched, and
   the last of the four worker variant families.
3. The remaining reachable-but-unmeasured worker realms named in scroll 470.
4. Two realm gaps the worker sweep surfaced and did not own, both large and both
   currently near-zero **on the window side too**: **`URLPattern` is a four-line
   stub** (3,266 subtests platform-wide; 1/370 on both variants) and
   **`CompressionStream`/`DecompressionStream` do not exist** (1,312 subtests).
   Either is a clean, self-contained next quest.
