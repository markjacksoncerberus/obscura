# 📜 Quest #486 — The Locked Verdict

> *`navigator.locks` and `navigator.storage` — how two copies of a page agree to
> take turns, and how a page finds out whether what it saved is safe.*
> **Neither existed. Not stubbed — absent.**

---

## The gap

```js
> navigator.locks
undefined
> navigator.storage
undefined
```

An absence is quieter than a lying stub, and it costs the same thing in the end.

**Web Locks** is the primitive every offline-first app uses to serialise its sync
pass. Without it, a page with two tabs open — or a page and its worker — has no
way to say *"only one of us may touch this at a time"*, so the two of them write
over each other's changes. On a flaky connection that does not merely delay a
save. It can **lose** one.

**`navigator.storage`** is how a page asks the two questions it needs before it
commits to caching anything: *how much room do I have* (`estimate()`) and *is
what I already saved safe from eviction* (`persisted()`). A page that cannot ask
either has to guess — and on a small device a wrong guess means either a wasted
download or a cache the browser quietly threw away.

Baselines, window variant:

| realm | files | ours | Chrome |
|---|---|---|---|
| `web-locks` | 17 | **17/139** | 139/139 |
| `storage` (non-bucket) | 7 | **17/56** | 56/56 |
| `storage/buckets` | 4 | **17/84** | 84/84 |

Every one of those pre-existing passes came from `idlharness` — the subtests that
check something *other* than the missing interface.

---

## The work

Both APIs, written to spec in `bootstrap.js`, plus `Lock`, `LockManager` and
`StorageManager` exposed as real interfaces (so `idlharness` can see them) and
hung off `navigator` as `[SameObject]` accessors.

### ⭐ Granting is DEFERRED even when the lock is free

This is the one design decision the whole implementation turns on, and WPT proves
it:

```js
const p = navigator.locks.request(res, {signal: controller.signal},
                                  lock => { got_lock = true; });
controller.abort();                       // ← the very next line
await promise_rejects_dom(t, 'AbortError', p);
assert_false(got_lock, 'Request should be aborted if signal is synchronous');
```

The lock is available. The callback must still not have run. So the grant is
scheduled on a microtask rather than performed inline — an abort that has not yet
had a chance to arrive must not be too late. Granting synchronously would make
`request()` a function you cannot safely cancel, which is the entire reason the
`signal` option exists.

### ⭐ The fairness rule is what stops readers from starving a writer

"Grantable" has two halves, and the second is easy to miss:

```js
for (const h of _lockHeld)   { if (h.name === rec.name && (rec.mode === 'exclusive' || h.mode === 'exclusive')) return false; }
for (let i = 0; i < idx; i++) { const q = _lockQueue[i];
                                if (q.name === rec.name && (rec.mode === 'exclusive' || q.mode === 'exclusive')) return false; }
```

The first loop is mutual exclusion. The second — *no request queued **before**
this one with a conflicting mode* — is fairness, and without it a steady stream
of shared readers can hold a resource open forever while the one writer that
needs it waits out the whole session. A sync pass that never runs is a sync pass
that loses data.

### The lock is held until the callback's result SETTLES — including rejection

A lock that outlived a failed operation would deadlock the next attempt to retry
it, which is the worst possible moment to deadlock.

### `steal` jumps the queue, and breaks the holder rather than waiting for it

Every current holder of the name is released and **its promise rejected with
`AbortError`** — a stolen lock has to tell its holder it is no longer held, or
the holder goes on believing it has exclusive access. The stealer then goes to
the **front** of the queue: one that merely joined the back would be granted
after requests that were already waiting, which is not what "take it now" means.

### The name is a DOMString, deliberately

WPT tests a lone surrogate (`'\uD800'`) and asserts it is neither mangled nor
merged with `'�'`. A resource name is an opaque identifier the page chose;
USVString conversion would silently fold two names the page kept distinct into
one — and two things that were meant to be independently lockable would start
blocking each other for no reason the author could ever find.

A leading `-` is reserved and refused (`NotSupportedError`): a page that could
mint one could collide with a lock it was never meant to see.

### `navigator.storage` answers honestly rather than flatteringly

Storage here is in-memory, so `persisted()` says **false** and `persist()`
refuses. Claiming otherwise would invite a page to skip its own re-download
safety net on a promise we cannot keep.

---

## Results

Lists committed at `scripts/wpt-weblocks-probe.txt` and
`scripts/wpt-storage-probe.txt`.

**`web-locks` 17/139 → 114/139 (82.0%)** over 17 files.
**`storage` (non-bucket) 17/56 → 36/56.**

Every behavioural `web-locks` file is at 100%:

| file | before | after |
|---|---|---|
| `signal.https.any.html` | 0/13 | **13/13** ✅ |
| `acquire.https.any.html` | 0/11 | **11/11** ✅ |
| `ifAvailable.https.any.html` | 0/10 | **10/10** ✅ |
| `resource-names.https.any.html` | 0/8 | **8/8** ✅ |
| `steal.https.any.html` | 0/5 | **5/5** ✅ |
| `held.https.any.html` | 0/4 | **4/4** ✅ |
| `mode-mixed.https.any.html` | 0/3 | **3/3** ✅ |
| `mode-shared` / `mode-exclusive` / `lock-attributes` | 0/2 each | **2/2** each ✅ |
| `query-empty.https.any.html` | — | **1/1** ✅ |
| `query.https.any.html` | 0/9 | **8/9** |
| `idlharness.https.any.html` | 17/47 | **43/47** |
| `storage/idlharness.https.any.html` | 17/33 | **31/33** |
| `storage/persisted.https.any.html` | 0/2 | **2/2** ✅ |
| `storage/storagemanager-estimate.https.any.html` | 0/2 | **2/2** ✅ |

**Zero rows lost, zero rows down.**

**Zero-regression ritual: 23,711/23,897 over the 87 pre-existing files, 186 fails
— `CHANGED: 0`, `LOST: 0` on the per-file diff.**

### ⚠️ Two ordering bugs the first measurement caught, both worth keeping

**1. `steal` timed out at 2/5, and the cause was my own deferral.** With one
shared pump, the holder, the waiter and the stealer all queued and *then* a
single pump ran — so the stealer found **nothing held**, stole from nobody, took
the lock, released it, and handed it straight to a holder whose promise never
settles. The waiter then waited forever. Fixed by enqueuing each request in **its
own microtask, in call order**, so the holder is genuinely holding by the time
the steal is processed. `steal` 2/5 TIMEOUT → **5/5**, `mode-mixed` → **3/3**.

**2. `query()` was reporting the world as it was *before the line above it*.**
`query()` snapshotted `_lockHeld` synchronously at call time — but the requests
it is being asked about are granted asynchronously, so the ordinary idiom

```js
navigator.locks.request(res, …);              // ask for the lock
const state = await navigator.locks.query();  // now, what is held?
```

saw an empty manager. The snapshot is now taken after the enqueue microtasks
have run, which is what the caller meant and what "in parallel" permits.
`signal` 11/13 → **13/13**, `query` 7/9 → **8/9**.

*Both bugs were invisible in the code and obvious in the measurement.*

---

## Caps / Next

**Named honestly:**

- **⚠️ `clientId` IS THE SAME FOR EVERY CONTEXT.** Obscura runs its workers
  inside one JS context, so a page and its workers genuinely *share* the lock
  queue — the coordination is real and `workers.https.html` scores 3/4. But
  `query()` cannot tell them apart, so `query() reports different ids for held
  locks from different contexts` fails, and it is the only failure left in
  `query.https.any.html`. Fixing it means a per-scope `LockManager` over a shared
  registry.
- **The five `.https.html` frame tests TIMEOUT (`frames` 0/8, `non-fully-active`
  0/5, `opaque-origin` 0/4, `partitioned-web-locks` 0/2, plus
  `storage/opaque-origin` 0/6)** — all need cross-document or opaque-origin
  behaviour the engine has no model for. Not lock bugs.
- **`idlharness` 43/47 and 31/33** — the residue is `[SecureContext]` / exposure
  assertions, the same shape named in earlier scrolls.
- **STORAGE BUCKETS IS NOT IMPLEMENTED — 17/84 over 4 files, unchanged.**
  `navigator.storageBuckets` is a *tentative* spec (`bucket_names` 0/29,
  `storage_bucket_object` 0/9, `buckets_basic` 0/3, `buckets/idlharness-worker`
  17/50). Deliberately left: it is a moving target and it is the only part of
  `/storage/` that is.
- **`persist()` says false and storage is in-memory**, which is honest today and
  becomes wrong the moment persistence lands. It is wired to one place.

**⭐ NEXT:** per-context `clientId` (one `LockManager` per scope over the shared
registry) would finish `query`; Storage Buckets is 84 subtests of largely
mechanical surface if the spec is judged stable enough to chase.
