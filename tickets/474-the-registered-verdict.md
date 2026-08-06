# 📜 Quest #483 — The Registered Verdict

> *The `.any.serviceworker.html` variant family — the last of the four worker
> variants, and the one nobody had opened.*
> **636 files / 8,930 subtests platform-wide. We scored zero on every one.**

---

## The gap

Quest #478 found that aggregating Chrome's run summary **by variant** rather than
by realm put 1,740 `.any.worker.html` files on the platform that we had never
scored. The same aggregation names three more families, and this is the last of
them:

```
.any.html            1,387 files   53,473 subtests
.any.worker.html     1,389 files   50,771 subtests   ← Quest #478–#480
.any.sharedworker.html 657 files    9,108 subtests   ← already scoring
.any.serviceworker.html 636 files   8,930 subtests   ← THIS QUEST, at 0
```

Every one of those 636 files reported **`no-results` — the page ran, the harness
loaded, and no summary ever appeared.** Which is the fifth time this campaign
has found that shape, and the fifth time it was the biggest thing on the map.

The reason is four lines long. A `.any.serviceworker.html` file is:

```html
<script>
(async function() {
  const scope = 'does/not/exist';
  let reg = await navigator.serviceWorker.getRegistration(scope);
  if (reg) await reg.unregister();
  reg = await navigator.serviceWorker.register("/…/foo.any.worker.js", {scope});
  fetch_tests_from_worker(reg.installing);
})();
</script>
```

and `navigator.serviceWorker` was:

```js
serviceWorker: { ready: Promise.resolve(), register(){return Promise.resolve();},
                 getRegistrations(){return Promise.resolve([]);}, controller: null }
```

`register()` resolved with **`undefined`**. `reg.installing` threw. The async
function rejected into nothing, and the page sat there, harness loaded, waiting
for results from a worker that was never started.

---

## The work

Almost all of it was already built. Quests #478–#480 gave the engine a real
`WorkerGlobalScope`, a blocking `importScripts`, the top-level-declaration
mirror, `MessagePort` with its queue, and `SharedWorkerGlobalScope`. A service
worker is that same machinery behind a different front door.

New in `bootstrap.js`: `ServiceWorkerGlobalScope`, `ServiceWorker`,
`ServiceWorkerRegistration`, `ServiceWorkerContainer`, `Client`, `Clients`, and
`ExtendableEvent` — plus the lifecycle that walks a freshly registered worker
from `installing` to `activated`.

### ⭐ THE PRIMITIVE: a service worker has no handle, so it answers its CLIENT

This is the one structural difference between this worker and the other two, and
it decides the whole design.

A **dedicated** worker is born holding an implicit message channel — the `Worker`
object you constructed is the other end, and `self.postMessage()` in the worker
lands on `worker.onmessage` on the page. A **shared** worker hands you a port at
connect time. A **service** worker has neither: it was registered against a
*scope*, it outlives the page that installed it, and there may be many pages
listening or none.

So the directions are asymmetric, and both halves had to be built:

| direction | how it travels |
| --- | --- |
| page → worker | `ServiceWorker.postMessage()` fires `message` on the worker's global scope, with **`source` set to a `Client`** — not a port |
| worker → page | `client.postMessage()` fires `message` on **`navigator.serviceWorker`**, the container — because there is no worker object on that side to hear it |

testharness reads exactly that pair. In the worker:

```js
self.addEventListener("message", function(event) {
    if (event.data && event.data.type === "connect")
        this_obj._add_message_port(event.source);   // ← the Client
});
```

and on the page, `create_remote_worker` sets `message_port = navigator.serviceWorker`.
The container therefore has to be an `EventTarget`, and — the detail that would
have cost a cycle — **`navigator.serviceWorker` must be the same object on every
access**, because a page adds its listener to it once and expects to keep
hearing. It is defined as a getter over a single instance.

### ⭐ The script must run BEFORE `register()`'s promise resolves

The page posts `{type: "connect"}` in the microtask immediately after `await
register(...)`. If the worker's script has not run by then, its `message`
listener does not exist and the connect is lost forever — with no error, because
posting into a scope with no listener is a no-op.

So `register()` fetches and evaluates the script **synchronously** (over the same
blocking `op_fetch_url_sync` that `importScripts` uses, which is not a shortcut:
it is what the API specifies) and only then returns `Promise.resolve(reg)`.

Conversely, the **lifecycle runs on a later task**, so the registration handed
back still has `installing` set — which is precisely the property the page grabs.
`install` → `installed` → `activate` → `activated` all happen after the caller
has had its turn.

### The rest, briefly

* `Object.prototype.toString.call(worker) === '[object ServiceWorker]'` is how
  testharness identifies one (deliberately not `instanceof`, since the object may
  come from another realm) — so the `@@toStringTag` is load bearing, not cosmetic.
* `getRegistration(url)` returns the **longest** scope that prefixes the URL. A
  registration for `/app/` must not answer for `/`.
* `_newWorkerScope` already exposes **only the scope interface the worker
  actually is** (`def(Ctor.name, Ctor)`), which is what lets testharness's
  four-way `create_test_environment` cascade land on `ServiceWorkerTestEnvironment`
  — it checks Dedicated, then Shared, then Service, then generic Worker, by
  `instanceof`.
* `ExtendableEvent.waitUntil()` exists and is inert. Nothing in these files uses
  it, but a worker that calls it must not crash and a worker that feature-detects
  it must find it.

---

## Results

Every one of these files reported **`no-results`** before this quest: the page
ran, testharness loaded, and no summary ever came. The measured window is **195
files across the realms this campaign already holds** (see the caps below for
what is deliberately *not* in it), and the Chrome column is Chrome 151's own run
over the same files.

| realm | files | **ours (was 0)** | Chrome 151 |
| --- | ---: | ---: | ---: |
| `streams` | 72 | **1390/1410** | 1349/1415 |
| `urlpattern` | 7 | **815/815** ✅ | 756/815 |
| `service-workers` | 16 | 165/449 | 421/458 |
| `compression` | 18 | **318/318** ✅ | 245/318 |
| `encoding` | 15 | 175/316 | 252/316 |
| `wasm` | 14 | 215/250 | 250/250 |
| `dom` | 1 | 145/219 | 219/219 |
| `html` | 11 | 131/152 | 152/155 |
| `web-locks` | 14 | 17/110 | 109/110 |
| `storage` | 6 | 17/93 | 90/93 |
| `performance-timeline` | 1 | 35/58 | 57/58 |
| `workers` | 14 | 42/47 | 47/47 |
| `user-timing` | 1 | 25/36 | 36/36 |
| `hr-time` | 1 | 20/29 | 29/29 |
| `FileAPI` | 2 | 4/12 | 12/12 |
| `webidl` | 2 | 1/8 | 5/8 |
| **TOTAL** | **195** | **3,515/4,322 (81.3%)** | 4,029/4,339 |

**Three realms come out ahead of Chrome** on this variant: `streams`
(1390 vs 1349), `urlpattern` (815 vs 756) and `compression` (318 vs 245) — the
last two from the sibling quests in this same commit, reaching a third realm for
free because the scope they run in is now real.

Four files remain could-not-run out of 195.

The weakest rows are honest and expected: **`service-workers` itself at 165/449**
is the realm that tests `fetch` interception, which this quest does not
implement; `web-locks` (17/110) and `storage` (17/93) need APIs that do not exist
yet in any realm.

---

## Caps / Next — honest, and there is real substance here

**This quest gives service workers a real global scope and a real message
channel. It does NOT give them the thing service workers are famous for.**

* **No `fetch` event interception.** The offline story — the reason the API
  exists — is not here. A page that registers a worker and talks to it gets the
  real thing; a page that expects a cached response served from one does not,
  yet. That is the single biggest remaining gap in this realm and it is a whole
  quest of its own (it needs the network stack to consult a registration before
  it goes to the wire).
* **No persistence.** Registrations live in the page's isolate and vanish with
  it. A real service worker survives the page that installed it; that is what
  makes it useful on a second visit, and it needs storage on disk (already a
  banked item).
* **The lifecycle is simplified.** `install` and `activate` fire in order and
  `waitUntil` does not actually extend anything; there is no waiting worker, no
  update check, no `skipWaiting` semantics beyond a resolved promise.
* **⚠️ PRE-EXISTING, FOUND BY THIS SWEEP, NOT CAUSED BY IT:**
  `IndexedDB/event-dispatch-active-flag.any.html` **crashes the engine with a V8
  out-of-memory** (`Fatal JavaScript out of memory: Ineffective mark-compacts
  near heap limit`, ~1.4 GB, inside `_idbFire`). Verified identical on the
  **window** variant, so it is an IndexedDB bug and not a worker one. The whole
  `IndexedDB` serviceworker family (185 files, 1,341 Chrome subtests) is excluded
  from the measured sweep for that reason — it is **unmeasured, not failing**, and
  it is the obvious next bug to chase because it takes the whole browser down.
* **`.any.sharedworker.html` (657 files / 9,108) was already scoring** before this
  quest — the gains this commit makes there belong to Quests #481 and #482, not
  to this one.
* **The measured window is 195 of the 636 files**, chosen as the realms this
  campaign already holds. The 441 not measured are mostly `fetch` (124),
  `IndexedDB` (185, see the crash above), `webtransport` (19), `cookiestore` (26)
  and `fs` (19) — network-behaviour realms that hang on our stack today. They are
  **unmeasured, not passing**, and the file list is reproducible from Chrome's run
  summary by filtering on the `.any.serviceworker.html` suffix.

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
