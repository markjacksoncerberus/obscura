# 📜 Quest #485 — The Cached Verdict

> *The Cache API — the cupboard a page fills so it can be read again tomorrow,
> on a connection that may not be there.*
> **`caches.open()` handed back an object whose `put()` resolved and whose
> `match()` always said "nothing here".**

---

## The gap

This is what stood in `bootstrap.js`, in full:

```js
globalThis.caches = {
  open() { return Promise.resolve({ match(){return Promise.resolve(undefined);},
                                    put(){return Promise.resolve();},
                                    delete(){return Promise.resolve(false);},
                                    keys(){return Promise.resolve([]);} }); },
  match() { return Promise.resolve(undefined); },
  has()   { return Promise.resolve(false); },
  delete(){ return Promise.resolve(false); },
  keys()  { return Promise.resolve([]); },
};
```

Five methods, and every one of them a polite lie. **`put()` RESOLVED.**

That is the shape this campaign has now found six times over — not a missing
feature but *a feature that answers, and answers wrong*. `caches` in `globalThis`
means every feature detection on the planet says yes. `await cache.put(req, res)`
resolving means the page's own install step reports success. And then the next
load finds the cupboard bare, with **no error anywhere to search for**.

There is no version of this that is a small bug. The whole point of the Cache
API is the second visit — and the reader who needs the second visit to be free
is the one on a metered plan, the one whose signal drops on the train, the one
paying by the megabyte for a page they already downloaded once.

Baseline over the `service-workers/cache-storage/` window window: **23/152 over
12 files** (the 13th, `cache-storage-buckets`, belongs to Quest #486's Storage
Buckets cap), against a Chrome at ~96% on the same files. The 23 were the handful
of subtests that assert a *rejection* — which the stub got right by never doing
anything at all.

---

## The work

~330 lines of `bootstrap.js` replacing the seven above: real `Cache` and
`CacheStorage` classes over the real `Request`/`Response`/`Headers` that Quests
#457–#459 built, plus the query algorithm the whole API turns on.

### The store is a request key plus a fully-read response

The body is copied out at `put()` time on purpose. A cache holding a live stream
would hand the *second* reader an already-drained one — the failure mode where a
page works on first load and renders blank ever after.

Reading it through `response.body` rather than the internal byte field is
deliberate, and it does three jobs at once: it drains a response built over a
`ReadableStream` (which the internal field does not hold), it leaves the original
**disturbed**, and it leaves the stream **locked** — which is what makes the
spec's `getReader() after Cache.put throws` true for the right reason rather than
by accident.

### ⭐ `Vary` is the server saying "this answer depended on that request header"

The matching algorithm is not URL equality. Unless the entry's response said
otherwise, the headers that response *named in `Vary`* have to match too:

```js
const vary = entry.response._headers.get('vary');
if (vary === null) return true;
for (const raw of vary.split(',')) {
  const field = raw.trim();
  if (field === '*') return false;          // "depends on everything" is never re-servable
  if (queryReq._headers.get(field) !== entry.request._headers.get(field)) return false;
}
```

Honouring it is not pedantry. Serving a cached English page to a request that
asked for French is not a cache hit, it is a **wrong answer** — and it is exactly
the bug users experience as *"the site is stuck in the wrong language"*. The same
rule is why `put()` refuses a response carrying `Vary: *`: there is no key under
which that entry could ever be correctly re-served, so storing it would be
storing a guarantee the cache cannot keep.

### The refusals are each a different kind of wrong

- **scheme not `http`/`https`** — only what a browser could have fetched may be
  replayed as though it had been. A `file:` or `data:` entry in a cache is a page
  inventing provenance for its own bytes.
- **method not `GET`** — a cache is keyed by things that are safe to replay.
- **status 206** — a 206 is a *fragment* of a resource. Stored under the
  resource's own key it would later serve the middle of a file as the whole file.
- **body already used** — there is nothing left to store, and resolving anyway
  would be the original lie in miniature.

### A put REPLACES what it would have matched

Not "appends". Otherwise the cache grows a second copy on every refresh and
`match` keeps handing back the stalest one — a cache that gets slower and wronger
the more carefully the page maintains it.

### `open()` returns a NEW handle onto a SHARED store

Two `open()` calls for one name must see each other's writes (WPT asserts both
halves: `assert_not_equals(result, cache)` *and* that their `keys()` agree). A
`Cache` is a handle; the entries live in the named store.

### A named cache that does not exist is a MISS, not an error

`caches.match(req, {cacheName: 'v3'})` before `v3` has ever been created resolves
to `undefined`. That is the ordinary first run of a versioned cache, and
rejecting there would make every upgrade path begin with a caught exception.

---

## Results

12-file `service-workers/cache-storage/` window window, list committed at
`scripts/wpt-cachestorage-probe.txt`.

**23/152 → 131/152 (86.2%).** Zero rows lost, zero rows down, 9 files up.

| file | before | after |
|---|---|---|
| `cache-storage.https.any.html` | 2/10 | **10/10** ✅ |
| `cache-abort.https.any.html` | 3/9 (TIMEOUT) | **9/9** ✅ |
| `cache-put.https.any.html` | 4/27 | **26/27** |
| `cache-add.https.any.html` | 0/22 | **21/22** |
| `cache-match.https.any.html` | 5/25 | **21/25** |
| `cache-keys.https.any.html` | 5/16 | **14/16** |
| `cache-matchAll.https.any.html` | 0/16 | **14/16** |
| `cache-storage-match.https.any.html` | 3/11 | **9/11** |
| `cache-delete.https.any.html` | 1/8 | **7/8** |

Note the *shape* of the before column: several of those baselines were **not
zero**, and the non-zeros were the subtests that assert a **rejection** — which
the stub passed by never doing anything at all. A cache that refuses correctly
and stores nothing is not 15% of a cache.

**Zero-regression ritual: 23,711/23,897 over the 87 pre-existing files, 186 fails
— `CHANGED: 0`, `LOST: 0` on the per-file diff.**

---

## Caps / Next

**Named honestly:**

- **NO PERSISTENCE.** The store lives in this realm's memory and dies with the
  page. This is the same missing piece `webstorage` and `IndexedDB` are waiting
  on — one profile directory, one shared follow-up — and it is the difference
  between "the cache works" and "the cache works *tomorrow*", which is the whole
  point. It is now named by four quests.
- **NO `fetch` INTERCEPTION**, so a service worker still cannot *serve* from
  these caches. The cupboard is real now; the door is not. That is the single
  biggest remaining piece of the offline story and it wants the network stack to
  consult a registration before going to the wire.
- **`cross-partition` and `sandboxed-iframes` TIMEOUT (0/4, 0/2)** — both need
  cross-origin/partitioned storage the engine has no model for.
- **`cache-storage-buckets` 0/2 and `cache-keys-attributes-for-service-worker`
  0/2** — Storage Buckets (see Quest #486's caps) and a service-worker-scoped
  request-attribute check.
- **The remaining 21 subtests are mostly `fetch()`-backed**: `cache-add` and
  `cache-match` cases that fetch a real resource from `wpt.live` and assert on
  what comes back (opaque responses, redirects, `Vary` from the server). Those
  are network-shaped failures, not Cache API ones.

**⭐ NEXT:** service-worker `fetch` interception, which now has a real cache
behind it to serve from.
