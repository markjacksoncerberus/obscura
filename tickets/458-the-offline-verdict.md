# 🗄️ The Offline Verdict — `IndexedDB`, and a page that works without the network

> *Quest #464. Realm: `IndexedDB/*`. On a 45-file core list measured identically
> before and after: **3/556 → 552/576 (95.8%)**, 33 of 45 files at 100%,
> could-not-run 0.*

---

## The gap: `open()` returned a mime

This was the whole of IndexedDB in Obscura:

```js
globalThis.indexedDB = {
  open(name, version) {
    const req = { result: null, error: null, onsuccess: null, … };
    Promise.resolve().then(() => {
      req.result = { name, version: version||1,
        objectStoreNames: { contains(){return false;}, length:0 },
        createObjectStore(){ return {createIndex(){}}; },
        transaction(){ return {objectStore(){ return {
          get(){ return {onsuccess:null,onerror:null}; },   // a request that never fires
          put(){ return {onsuccess:null}; }, … }; }}; },
        close(){} };
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  },
  deleteDatabase() { return { onsuccess: null, onerror: null }; },
};
globalThis.IDBKeyRange = { only(v){return v;}, … };
```

Every call succeeded. Nothing threw. `createObjectStore` handed back an object
with a `createIndex` that did nothing, `put()` returned a request whose
`onsuccess` was never called, and `get()` returned one that never fired either —
so an offline-first page opened its database, wrote its data, asked for it back,
and simply **waited forever**. It did not render badly. It rendered *empty*, and
looked like a slow network.

This is the same shape as the `tee()` that returned two empty streams (Quest #460)
and the `Storage` that was a `_data` bag (Quest #463): **a realm that never scores
zero is not missing, it is approximated** — and an approximation that fails
silently is worse than one that throws.

## What replaces it

The whole object model, in memory, ~1400 lines:

- **Keys.** Stored as `{t, v}` where the type tag *is* the spec's cross-type
  ordering: number < date < string < binary < array. Conversion rejects a NaN
  number, an invalid Date, a detached buffer, a hole in an array, and a cycle.
  A binary key is copied on the way in and on the way out, so a reader can never
  reach into the store's own bytes.
- **Key paths** — evaluation (own properties only, with the `String.length`,
  `Array.length` and `Blob.size`/`type` specials), validation, and injection for
  a generated key.
- **Object stores** as key-sorted record lists with binary-search insertion, and
  **indexes** as `(key, primaryKey)`-sorted lists, including `multiEntry` (one
  entry per array element, deduplicated, invalid elements dropped rather than
  failing the write) and `unique` (pre-checked *before* anything is mutated).
- **Transactions** with real abort: a snapshot taken at transaction start,
  restored *into the live objects* so the `IDBObjectStore` wrappers a page is
  holding stay valid. Schema changes inside a `versionchange` roll back too.
- **Cursors** — `next`/`prev`/`nextunique`/`prevunique`, `advance`,
  `continue(key)`, `continuePrimaryKey`, `update`, `delete`. `prevunique` lands
  on the **lowest** primary key of each index key, which the reversed walk would
  otherwise get backwards.
- **The version dance** — `upgradeneeded`, `versionchange` at the other
  connections, `blocked` when one refuses to close, and a retry when it finally does.

IDB's event path — request → transaction → connection — is a real propagation path
(it is how `db.onerror` catches a failed `put`), so instead of a private
dispatcher these objects name their event parent via `_idbEventParent` and ride
the engine's one spec-compliant dispatcher, with a `_evtPassThrough` marker so the
transaction and the database stay *on* the path without becoming the target.

---

## 🔍 The finding: IDB and promises meet **after** the microtask checkpoint

The first build scored 416/576 — with `structured-clone` at **4/125**, all 121
failures identical:

```
promise_test: Unhandled rejection with value: object
  "TransactionInactiveError: The transaction has finished."
```

The test is ordinary modern IDB code, and it is the shape every real application
uses:

```js
await promiseForRequest(t, store.put(value, 'key'));
const result = await promiseForRequest(t, store.get('key'));   // must still work
```

A transaction goes inactive when *control returns to the event loop* — and IDB's
cleanup step runs **after** the microtask checkpoint, not inside it. That one
detail is the entire reason IndexedDB composes with promises at all: the `await`
resumes several microtask hops after the success event (event → EventWatcher
promise → `.then` → async continuation), and the transaction has to still be alive
when it lands.

Deactivating in a single `Promise.resolve().then(…)` is **one hop too early**, and
one hop is the difference between a working database and 121 identical rejections.
Worse, the request loop drained its queue and committed synchronously, so the
transaction was gone before the continuation could even ask.

JS offers no "the microtask queue is now empty" hook. What it offers is the shape
of the checkpoint itself: microtasks all run before the next **task**. So
deactivation walks a bounded chain of microtask hops — long enough for any
realistic await chain, still strictly before any `setTimeout`, which keeps the
other half of the contract intact (a timer callback *must* see the transaction
inactive). `structured-clone` went 4/125 → **116/125** on that one change, and it
took the realm from 72.2% to 91.7%.

## Three smaller ones, each with the same lesson: *when* is part of the contract

- **`abort` and `complete` are QUEUED TASKS, not synchronous calls.** The state
  change is immediate — a finished transaction must reject the very next call —
  but the event is queued. WPT writes `tx.abort(); assert_throws_dom(…); t.done();`
  and relies on `db.onabort` landing *after* `t.done()`, where testharness ignores
  it. Firing it synchronously made passing tests report "unexpected db.abort" from
  a helper three files away.
- **Aborting fires `error` at every request still queued** — AbortError, one event
  each. Dropping them silently reads as "events lengths differ" in the ordering tests.
- **Key-generator exhaustion has to be a FLAG, not `current > 2**53`.** `2**53 + 1`
  is not a representable double — it rounds straight back to `2**53` — so the
  spec's "greater than 2^53" test can never become true in floating point, and the
  generator would hand out `2**53` forever. `keygenerator` 15/21 → **21/21** once
  exhaustion became a boolean.

And one ordering nit worth keeping: `createIndex` reports a **name clash before it
parses the key path** (ConstraintError precedes SyntaxError), and an aborted
upgrade must roll `db.version` back — which means the transaction has to snapshot
the database *before* the version is bumped, not after.

---

## Results (45-file core, identical list before and after)

| Test | Before | After | Status |
|------|:------:|:-----:|:------:|
| `structured-clone.any.html` | 0/125 | **116/125** | ⬆️ **+116** |
| `idbfactory_open.any.html` | 0/29 | **29/29** | ✅ 100% |
| `idbdatabase_createObjectStore.any.html` | 0/27 | **27/27** | ✅ 100% |
| `keyorder.any.html` | 0/24 | **24/24** | ✅ 100% |
| `keygenerator.any.html` | 0/1 ⏱ | **21/21** | ✅ 100% |
| `idbobjectstore_createIndex.any.html` | 0/21 ⏱ | **16/21** | ⬆️ |
| `idbindex_getAll.any.html` | 0/19 | **18/19** | ⬆️ |
| `idbobjectstore_getAll.any.html` | 0/18 | **17/18** | ⬆️ |
| `idbindex_getAllKeys.any.html` | 0/18 | **17/18** | ⬆️ |
| `key_valid.any.html` | 0/18 | **18/18** | ✅ 100% |
| `idbobjectstore_getKey.any.html` | 0/17 | **17/17** | ✅ 100% |
| `idbobjectstore_add.any.html` | 0/16 | **16/16** | ✅ 100% |
| `idbobjectstore_put.any.html` | 0/16 | **16/16** | ✅ 100% |
| `idbobjectstore_getAllKeys.any.html` | 0/16 | **15/16** | ⬆️ |
| `key_invalid.any.html` | 0/35 | **34/35** | ⬆️ |
| `idbfactory_cmp.any.html` | 1/12 | **12/12** | ✅ 100% |
| `idbkeyrange-includes.any.html` | 0/11 | **11/11** | ✅ 100% |
| `idbkeyrange.any.html` | 0/10 | **10/10** | ✅ 100% |
| `idbcursor_continue_index.any.html` | 0/10 | **10/10** | ✅ 100% |
| `idbcursor_update_objectstore.any.html` | 0/9 | **8/9** | ⬆️ |
| `idbcursor_continue_objectstore.any.html` | 0/8 | **8/8** | ✅ 100% |
| `idbindex_get.any.html` | 0/8 | **8/8** | ✅ 100% |
| `idbindex_getKey.any.html` | 0/8 | **8/8** | ✅ 100% |
| `value.any.html` | 0/8 | **8/8** | ✅ 100% |
| `idbtransaction_objectStoreNames.any.html` | 1/8 ⏱ | **7/8** | ⬆️ |
| `idbobjectstore_get.any.html` | 0/7 | **7/7** | ✅ 100% |
| `idbobjectstore_delete.any.html` | 0/7 | **7/7** | ✅ 100% |
| `idbcursor_advance_objectstore.any.html` | 0/5 | **5/5** | ✅ 100% |
| `idbcursor_delete_objectstore.any.html` | 0/5 | **4/5** | ⬆️ |
| `idbdatabase_transaction.any.html` | 0/5 | **5/5** | ✅ 100% |
| `idbobjectstore_clear/count.any.html` | 0/4 each | **4/4** each | ✅ 100% |
| `idbindex_count.any.html` | 0/4 | **4/4** | ✅ 100% |
| `idbfactory_deleteDatabase.any.html` | 0/4 ⏱ | **4/4** | ✅ 100% |
| `idbdatabase_deleteObjectStore.any.html` | 0/3 | **3/3** | ✅ 100% |
| `idbindex_openCursor.any.html` | 0/3 | **3/3** | ✅ 100% |
| `idbtransaction_abort.any.html` | 0/3 ⏱ | **2/3** | ⬆️ |
| `idbdatabase_close.any.html` | 0/2 | **2/2** | ✅ 100% |
| `idbtransaction.any.html` | 0/2 ⏱ | **1/2** | ⬆️ |
| `idbobjectstore_{deleteIndex,index,openCursor}.any.html` | 0/1 each | **1/1** each | ✅ 100% |
| `idbindex_indexNames.any.html` | 0/1 | **1/1** | ✅ 100% |
| `error-attributes.any.html` | 0/1 | **1/1** | ✅ 100% |
| `globalscope-indexedDB-SameObject.any.html` | 1/1 | **1/1** | ✅ held |
| **45-file core, total** | **3/556** | **552/576** | **95.8%**, 33 files at 100% |

## Caps / Next — honestly named

- **Not on disk.** The databases live in the page's JS realm, so nothing survives
  a navigation or a restart. Every WPT file runs inside one page, so it costs
  nothing measurable — and it is the whole point of the feature. Persisting through
  the Rust side (as the cookie jar already does) is the honest next step, and it is
  shared with the same gap named for `webstorage` in
  [the previous scroll](457-the-remembered-verdict.md).
- **`structured-clone` 116/125.** The 9 left are `structuredClone` gaps, not IDB
  ones — the same primitive the held `html/…/structured-clone` row exercises.
  Worth a look there rather than here.
- **`createIndex` 16/21.** The remainder are event-ordering subtleties around a
  uniqueness violation discovered during the index back-fill: the add that
  *creates* the duplicate must succeed and the *transaction* must fail later, and
  our back-fill notices too early. A precise, well-specified fix; not large.
- **No `IDBObjectStore.getAllRecords` / `IDBIndex.getAllRecords`** (a newer API);
  no explicit `IDBTransaction.commit()` semantics beyond "stop accepting work";
  no cross-page `versionchange` (there is only ever one page).
- **`idbtransaction.any.html` 1/2, `idbtransaction_abort.any.html` 2/3** —
  request-event-ordering detail, same family as `createIndex`.
