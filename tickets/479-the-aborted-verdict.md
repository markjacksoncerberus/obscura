# 📜 Quest #488 — The Aborted Verdict

> *IndexedDB's two banked blocks: what a database must do when a handler throws,
> and how to read the last N rows without walking the first N thousand.*

---

## The gap

Scroll 475 named both of these and left them on the board:

> **29 subtests wait on ONE rule** — an uncaught exception in an IDB event
> handler must ABORT the transaction — and **158 on ONE additive family**,
> `getAll(options)` / `getAllKeys(options)` / `getAllRecords()`.

Measured, window variant:

| file | ours | Chrome |
|---|---|---|
| `fire-error-event-exception.any` | **0/17** | 17/17 |
| `fire-success-event-exception.any` | **0/6** | 6/6 |
| `fire-upgradeneeded-event-exception.any` | **0/6** | 6/6 |
| `idbobjectstore_getAllRecords.any` | **4/25** | 25/25 |
| `idbindex_getAllRecords.any` | **5/29** | 29/29 |
| `idb{objectstore,index}_getAll{,Keys}-options.any` | 22–29 of 23–30 | all |

---

## ⭐ Part 1 — a handler that threw did not finish

DOM's "inner invoke" catches a listener's exception, reports it, and carries on:
one broken handler must not stop the others. But it also **records that it
happened** — the spec calls it `legacyOutputDidListenersThrowFlag` — because some
callers must not treat the dispatch as having gone fine.

IndexedDB is the caller that matters. `fire a success event` and `fire an error
event` both end with *"if that flag is set, abort the transaction with an
AbortError"*, and the reason is the plainest one in the database: **a handler
that threw did not finish whatever it was doing.** Committing its half of the
work is worse than committing none of it, because the page believes what it can
see was saved.

The engine swallowed the exception into `_reportError` and committed. Three lines
fixed it:

1. `_invokeListeners` sets `event._listenerThrew` in its catch.
2. `_idbFire` reads it back into `_idbFireThrew` — the one piece of information a
   boolean return value cannot carry.
3. `_idbRunTx` aborts on it, **and it takes precedence over `preventDefault()`**:
   the cancel says *"I have handled this error"*, and an exception is the proof
   that it did not.

The `upgradeneeded` case is the same rule with worse consequences. An upgrade
handler that threw did not finish building the schema — and committing a
half-built one is permanent, because **the next open sees the new version number
and skips the upgrade that never ran**. The database is then missing a store
nothing will ever create again.

The test file is careful about coverage and it is worth noting what it covers: a
throwing `onerror`, a throwing `onerror` that called `preventDefault()` first, a
throwing `addEventListener` callback, a listener object whose **`handleEvent`
getter** throws, and a listener object with a **non-callable `handleEvent`**. All
five land in the same catch, which is why one flag is enough.

**0/29 → 29/29.**

---

## ⭐ Part 2 — `getAll` grew a dictionary, and the reason is `direction`

```webidl
IDBRequest getAll(optional any query, optional unsigned long count);
IDBRequest getAll(IDBGetAllOptions options);
IDBRequest getAllRecords(optional IDBGetAllRecordsOptions options);
```

**Overload resolution is unambiguous because a dictionary is not a key.** The
valid IDB key types are number, string, `Date`, `ArrayBuffer`, `ArrayBufferView`
and `Array` — so an ordinary object could only ever have been meant as the
options bag. One predicate (`_idbIsOptionsDict`) decides it.

**`direction` is why the dictionary exists at all.** Reading the newest twenty
messages used to mean opening a `prev` cursor and stepping it one round trip at a
time, because `getAll` could only ever read forward from the start. On a slow
machine that is the difference between a chat log that opens and one that spins.

The collection walk is shared by all six methods (`_idbCollect`), and it has one
ordering rule that has to be right:

> **Uniqueness is decided in FORWARD key order and only then reversed.** The
> first record of each key run is the one a `nextunique` cursor would stop at,
> and `prevunique` visits *those same records* backwards — not the last of each
> run.

`getAllRecords()` answers `key` + `primaryKey` + `value` in one request. On an
object store the first two coincide, but the shape is the point: reading keys and
values used to mean two passes over the same rows, and the pair could disagree if
anything wrote between them. On an **index** all three genuinely differ — the
indexed value, the row's identity, the row — which is exactly the triple a
"sort by column, show the rows" screen needs.

**🔍 And a record is an interface, not a bag.** The first build returned plain
object literals and scored 4/25: `assert_class_string: The record must be an
IDBRecord`. `key`/`primaryKey`/`value` are **readonly** — a record is a report of
what is stored, and a page that rewrote `record.key` would be describing a row
that does not exist. A real `IDBRecord` with prototype accessors and a data
`@@toStringTag` took it to 24/25.

---

## Results

| test | before | after | |
|---|---|---|---|
| `fire-error-event-exception.any` | 0/17 | **17/17** | ✅ |
| `fire-success-event-exception.any` | 0/6 | **6/6** | ✅ |
| `fire-upgradeneeded-event-exception.any` | 0/6 | **6/6** | ✅ |
| `idbobjectstore_getAllRecords.any` | 4/25 | **24/25** | ⬆️ |
| `idbindex_getAllRecords.any` | 5/29 | **28/29** | ⬆️ |
| `idbindex_getAll-options.any` | — | **29/30** | |
| `idbindex_getAllKeys-options.any` | — | **28/29** | |
| `idbobjectstore_getAll-options.any` | — | **23/24** | |
| `idbobjectstore_getAllKeys-options.any` | — | **22/23** | |

Probe list: `scripts/wpt-idb-getall-probe.txt` (52 files platform-wide, 1,040
subtests; the window half is measured here and the worker/sharedworker/
serviceworker variants share the same code).

---

## ⚠️ Caps

- One subtest short in each `getAll*` file — the `-enforcerange` boundary
  (`[EnforceRange] unsigned long count` must throw `TypeError` on a negative or
  out-of-range count, where `_idbCount` currently clamps to "unbounded").
- Still no persistence: everything above lives in the page's JS realm.
