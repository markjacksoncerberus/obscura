# 📜 Quest #484 — The Yielded Verdict

> *`IndexedDB`, and the bug that did not make a page render badly — it made the
> whole browser die.*
> **`Fatal JavaScript out of memory` at 1.4 GB in eighteen seconds, taking every
> other tab with it.**

---

## The gap

The previous arc's scroll ended with a warning rather than a score:

> ⚠️⚠️ **ENGINE CRASH FOUND, PRE-EXISTING, NOT OURS:**
> `IndexedDB/event-dispatch-active-flag.any.html` kills the process with
> `Fatal JavaScript out of memory: Ineffective mark-compacts near heap limit`
> (~1.4 GB, inside `_idbFire`). Verified IDENTICAL on the WINDOW variant, so it
> is an IndexedDB bug, not a worker one. **It takes the whole browser down.**

Reproduced first thing this session, and it is exactly as described:

```
[2866121] 18100 ms: Mark-Compact 1385.6 (1400.9) -> 1382.0 (1400.9) MB …
#
# Fatal JavaScript out of memory: Ineffective mark-compacts near heap limit
#
```

`curl -s -m 5 http://127.0.0.1:9222/json/version` → **DEAD**. Not the page. The
browser.

### And it was not one file

Before touching anything, the whole realm was swept — 143 `IndexedDB/*.any.html`
files, one at a time, with a runner that restarts the server when it notices the
server has stopped answering. The baseline came back:

```
files measured   123 of 143
pass/total       879/1234
could-not-run      5
server deaths      4      ← the runner had to restart the engine four times
no output at all  20      ← ran past 105 s and were killed
```

**24 of 143 files either killed the engine or hung it.** The recorded finding
named one file. It was a fifth of the realm.

---

## The work

One bound, in `_idbRunTx`.

### ⭐ THE PRIMITIVE: a request's event is fired from a TASK, so a handler that queues more work has queued it for a LATER task

The transaction's run loop was:

```js
function _idbRunTx(tx) {
  if (tx._state === 'finished') return;
  while (tx._queue.length) {
    const req = tx._queue.shift();
    …perform, then fire success/error…
  }
  …commit…
}
```

Read it as a browser rather than as a loop. IndexedDB says *"queue a task to
fire a success event at request"*. A **task**. So when a `success` handler issues
another request, that request's event belongs to a future turn of the event
loop — not to the tail of the loop currently running.

`while (tx._queue.length)` lets a handler **feed the loop it is running inside**.
And then control never returns to the event loop: no timer fires, no microtask is
checkpointed, no paint happens. The page is not slow, it is gone, and so is
every other page in the process.

WPT measures this precisely, with an idiom that is not exotic at all. From
`IndexedDB/resources/support.js`:

```js
function keep_alive(tx, store_name) {
  let keepSpinning = true;
  function spin() {
    if (!keepSpinning) return;
    tx.objectStore(store_name).get(0).onsuccess = spin;   // ← re-arms itself
  }
  spin();
  return () => { keepSpinning = false; };
}
```

That is the ordinary way to hold an IndexedDB transaction open across some
asynchronous work — and the stop signal arrives from a `setTimeout`. Against the
greedy loop, that timer could never run. The spin never stopped, the microtask
queue was never drained, and the undrained jobs grew until V8 gave up.

The fix is to shift exactly the requests that were pending when the task began:

```js
let generation = tx._queue.length;
while (generation-- > 0 && tx._queue.length) {
  const req = tx._queue.shift();
  …
}
```

Requests issued **together** — the bulk write, the upgrade that seeds a store —
still land together, which is the shape that has to stay fast. A chain of
dependent requests costs one task per link, which is what it costs in every
other browser too.

Everything downstream was already right and did not move: the transaction stays
`active` across the microtask checkpoint (Quest #464's bounded 32-hop chain), and
goes `inactive` before the next task — which is the other half of what
`event-dispatch-active-flag` asserts.

---

## Results

Full 143-file `IndexedDB/*.any.html` window sweep, one file at a time, same
runner before and after. File list committed at `scripts/wpt-indexeddb-probe.txt`
(built from Chrome's own run summary, so no path can 404).

| | before | after |
|---|---|---|
| files producing a result | 123 | **142** |
| subtests | **879/1234** | **958/1339** |
| files at 100% | — | **84** |
| could-not-run | 5 | 1 |
| **engine deaths during the sweep** | **4** | **0** |
| harness TIMEOUT | 4 | 4 |

**Per-file diff: 0 rows lost, 0 rows down, 3 rows up, 19 files that produced no
output at all now score.** Every subtest gained is a subtest that was never
measured, not one that changed answer.

The files that came back from silence:

| | |
|---|---|
| `event-dispatch-active-flag.any.html` | **killed the engine** → **4/4** |
| `idb-explicit-commit.any.html` | killed the engine → 6/12 |
| `transaction-deactivation-timing.any.html` | killed the engine → 4/5 |
| `idbobjectstore-query-exception-order.any.html` | hung → **12/12** |
| `idbobjectstore-add-put-exception-order.any.html` | hung → **6/6** |
| `idbdatabase-transaction-exception-order.any.html` | hung → **4/4** |
| `idbcursor-direction-objectstore-keyrange.any.html` | hung → **4/4** |
| `reading-autoincrement-indexes-cursors.any.html` | hung → **4/4** |
| `transaction-abort-object-store-metadata-revert.any.html` | hung → **4/4** |
| `upgrade-transaction-deactivation-timing.any.html` | hung → **3/3** |
| `upgrade-transaction-lifecycle-committed.any.html` | hung → **2/2** |
| `idbobjectstore-clear-exception-order.any.html` | hung → **2/2** |
| …and 10 more | hung → scoring |

**Zero-regression ritual: 23,711/23,897 over the 87 pre-existing files, 186 fails
— byte-identical to the previous commit's recorded post-measurement, with
`CHANGED: 0` and `LOST: 0` on the per-file diff.** With this arc's 7 new guards
the list is 94 files at 23,821/24,014.

---

## Caps / Next

**Named honestly — still broken, and none of it is this quest's bug:**

- **`fire-error-event-exception` 0/17, `fire-success-event-exception` 0/6,
  `fire-upgradeneeded-event-exception` 0/6 — 29 subtests, one rule.** An
  **uncaught exception in an IDB event handler must abort the transaction** with
  `AbortError` (IDB §fire-error-event: *"if the exception was not caught, abort
  the transaction"*). We report the error and carry on. This is the single
  largest self-contained block left in the realm and it is a genuine safety rule
  — a handler that threw halfway through did not finish its work, and committing
  its half is worse than committing nothing.
- **The `getAll`/`getAllKeys`/`getAllRecords` *options* family — 158 subtests at
  0.** `getAll(options)` (the dictionary form, with `direction` and `count`) and
  `getAllRecords()` do not exist; only the older positional `getAll(query, count)`
  does. Purely additive, no risk to anything already passing — the biggest cheap
  block left here.
- **`idlharness.any.html` 90/207 and TIMEOUT.** Both halves matter: the timeout
  means the file does not even finish, so the 207 is a floor rather than a score.
- **`nested-cloning-large.any.html` still produces no row** (single remaining
  silent file) — a genuinely enormous payload, not a hang of this shape.
- **4 harness TIMEOUTs remain, unchanged in count from the baseline** —
  different files may now be the slow ones; none of them killed the engine.

**⭐ NEXT, in this realm:** the uncaught-exception abort rule (29 subtests, one
place), then the `getAll` options family (158 subtests, purely additive).

**⭐ AND THE GENERAL LESSON, worth carrying past IndexedDB:** *a file that
produces no output is not a file that fails — it is a file that was never asked.*
The recorded finding named one crashing file. Sweeping the whole realm with a
runner that survives the engine's death found **24 of 143** in that state. Before
believing a realm's score, count the rows.
