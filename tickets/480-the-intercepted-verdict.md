# 📜 Quest #489 — The Intercepted Verdict

> *`FetchEvent` — the event that lets a page answer its own requests.*
> **The cupboard was real since quest #485. This is the door.**

---

## The gap

Four scrolls in a row named this as the top of the leverage list, and #485 put it
most precisely: the Cache API became real, so there was finally *something to
serve from* — and no way to serve it. A service worker without `fetch`
interception is a background script with a message channel. With it, a site keeps
working on a train, in a blackout, on a prepaid connection that ran out — because
the page someone needs was already on the device and something was finally
allowed to say so.

The honest note left in the source read:

```
// HONESTLY NOT HERE, and named in the scroll: `fetch` event interception (the
// offline story itself), …
```

---

## The work

### `FetchEvent`

**⭐ `respondWith()` is not "return a response" — it is a CLAIM MADE DURING
DISPATCH.** The worker must stake it while the event is being handled, because by
the time any promise it returns settles, the browser has to *already know*
whether to go to the network. So the flag is set synchronously and the promise is
awaited afterwards; a second call, or a call after the handler returned, is an
`InvalidStateError` rather than a silent second answer.

Three more rules that are each one line and each load-bearing:

- **A worker that CLAIMED a request and then failed has produced a network
  error.** Falling back to the network there would be worse than useless — the
  page would silently receive the very thing the worker meant to replace.
- **`preloadResponse` resolves with `undefined`**, not a rejection. We perform no
  navigation preload, and `event.preloadResponse || fetch(event.request)` is the
  idiom every recipe is written around.
- **A worker must not intercept its own `fetch`.** `caches.match(e.request) ||
  fetch(e.request)` is the first line of every offline recipe, and without a
  re-entry guard it is an infinite loop.

### Which registration controls a request

Activated, same origin, and the **longest matching scope**. A worker registered
for `/app/` must not answer for `/` — the longest-prefix rule is what keeps two
workers on one origin from fighting over each other's pages. The same function
now backs `navigator.serviceWorker.controller`, which had been hardcoded `null`;
a page reads that to decide whether it is being served by a worker at all, and
`null` after a first load is exactly why every recipe reloads once.

### The hook

One block in `fetch()`, before anything touches the network.

---

## Results — measured both ways

**The capability, end to end.** A page registers a worker whose `install` fills a
cache and whose `fetch` handler serves from it:

```
registered  : true
controller  : true
fromCache   : "CACHED PAGE"                              ← served from the Cache API
fromWorker  : "FROM WORKER: /never-on-the-network-xyz"   ← a URL that does not exist
```

That second line is the one that matters: a request for a URL with nothing behind
it, answered by the page's own worker, without leaving the device.

**The WPT window, honestly:**

| file | before | after |
|---|---|---|
| `fetch-event.https` | 1/43 | **6/43** |
| `fetch-event-handled.https` | 0/8 | 0/8 |
| `fetch-request-fallback.https` | 2/17 | **2/17** |
| `fetch-event-respond-with-custom-response.https` | 0/11 | **5/11** |
| **total** | **3/79 (3.8%)** | **13/79 (16.5%)** |

**+10 subtests. That is a small number for a large capability, and the reason is
architectural, not incidental** — see the cap below. It is reported as measured
rather than rounded up.

---

## ⚠️ Caps, and the first one is the whole story

- **We intercept the JS `fetch()` only.** Every `service-workers/service-worker/*`
  test builds an `<iframe>`, lets it be controlled, and then checks that the
  *iframe's own navigation and subresource loads* were intercepted. Those loads
  are issued in Rust by the frame loader and the resource pipeline; they never
  pass through the JS `fetch()` this hooks. **Interception has to move into the
  network path in `obscura-net`/the frame loader before this realm's numbers
  move**, and that is the next quest, not a tweak to this one.
- **No persistence.** A registration and its caches live only as long as the
  page's JS realm — so the second visit, which is the one offline mode is *for*,
  starts empty. Four quests have now named storage-on-disk; it is the single
  biggest thing standing between this feature and the person it is meant to help.
- **The lifecycle is simplified**: `skipWaiting()` resolves and does nothing,
  `clients.claim()` is absent, and install/activate run on one later task rather
  than with the spec's real ordering. `fetch-event-handled` needs the promise
  ordering that comes with that.
- `respondWith` with a `ReadableStream`-bodied Response is untested here.
