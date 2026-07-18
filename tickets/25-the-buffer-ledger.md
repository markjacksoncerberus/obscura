# Quest #25 — The Buffer Ledger

> *Scroll #22 (The Resource Ledger) opened the timeline so every fetch could write
> its line; Scrolls #23–#24 taught the loading elements to write theirs and to
> tell the truth about their names. But the ledger had no last page — it grew
> forever and never rang the bell when it filled. A page that watched for the
> `resourcetimingbufferfull` toll waited for a sound that could never come, and
> hung. This quest gives the ledger its bound, its bell, and its overflow book —
> the Resource Timing buffer.*

Realm: `resource-timing/buffer-full-*` — the Resource Timing Level 2 buffer
model (size limit, secondary buffer, `resourcetimingbufferfull` event).

---

## The gap

The Resource Timing spec keeps a bounded **resource timing buffer** (default size
limit **250**). When it fills, new resource entries go to a **secondary buffer**
and a task is queued to **fire a buffer full event** (`resourcetimingbufferfull`),
which then copies the secondary entries into the primary buffer as room frees up
(via `clearResourceTimings()` / `setResourceTimingBufferSize()` inside the
callback), dropping any that still don't fit.

Obscura had none of this. `performance._addResourceEntry` simply did:
```js
this._entries.push(e);
_queuePerformanceEntry(e);
```
— unbounded, with no event. So every `buffer-full-*` test, which awaits the
`resourcetimingbufferfull` event (or a promise gated on it), **hung until the
harness timeout**. `setResourceTimingBufferSize` set an unused field;
`clearResourceTimings` worked but had no buffer semantics around it.

## The work (all in `crates/obscura-js/js/bootstrap.js`, `Performance` class)

### Buffer state (constructor)
```js
this._resourceBufferSize = 250;   // §"resource timing buffer size limit"
this._resourceSecondary  = [];    // §"resource timing secondary buffer"
this._bufferFullPending  = false; // §"buffer full event pending flag"
this._onresourcetimingbufferfull = null;
```
The **primary buffer current size** is derived (`_resourceCount()` counts
`entryType === "resource"` entries already in `_entries`) — the spec's "current
size" and the actual entry count move together, so deriving it keeps them
consistent across `clearResourceTimings`.

### §"add a PerformanceResourceTiming entry" — `_storeResourceEntry(e)`
- If `_canAddResource()` (current size < limit) **and** no buffer-full task is
  pending → push to the primary buffer and queue it to observers.
- Else: if no task pending, set the pending flag and queue **`_fireResourceBufferFull`**
  on a **`setTimeout(0)`** macrotask (the performance timeline task source — so
  synchronous code after the overflowing load, e.g. `setResourceTimingBufferSize()`,
  runs *before* the event fires). Then push the entry to the **secondary** buffer.

`_addResourceEntry` now builds the entry (`_makeResourceEntry`, the old body) and
hands it to `_storeResourceEntry`.

### §"fire a buffer full event" — `_fireResourceBufferFull()`
```
while secondary not empty:
  excessBefore = secondary.length
  if not canAdd: dispatch new Event("resourcetimingbufferfull")   // bubbles:false
  while secondary not empty and canAdd:                            // copy secondary buffer
    entry = secondary.shift(); primary.push(entry); queue to observers
  excessAfter = secondary.length
  if excessBefore <= excessAfter: secondary = []; break            // no progress → drop & stop
pending = false
```
The event is dispatched at `performance`; the callback may call
`setResourceTimingBufferSize` (raising the limit so copies succeed) and/or
`clearResourceTimings` (freeing the primary). The `excessBefore <= excessAfter`
guard is the spec's infinite-loop backstop: if firing the event made no room, the
remaining secondary entries are dropped.

### Event plumbing
`Performance.dispatchEvent` now also invokes the matching `on<type>` handler
(so `performance.onresourcetimingbufferfull = fn` fires alongside
`addEventListener` listeners); added the `onresourcetimingbufferfull`
getter/setter. `setResourceTimingBufferSize(n)` coerces to an unsigned long and
just sets the limit (no event, no copy). `clearResourceTimings` is unchanged
(removes primary resource entries; deliberately does **not** touch the secondary
buffer, so a pending task still copies those in).

## Results (measured)

| Test | Before | After |
|------|:------:|:-----:|
| `buffer-full-then-decreased.html` | 0 (hang) | **1/1** |
| `buffer-full-when-populate-entries.html` | 0 (hang) | **1/1** |
| `buffer-full-set-to-current-buffer.html` | 0 (hang) | **1/1** |
| `buffer-full-decrease-buffer-during-callback.html` | 0 (hang) | **1/1** |
| `buffer-full-increase-buffer-during-callback.html` | 0 (hang) | **1/1** |
| `buffer-full-store-and-clear-during-callback.html` | 0 (hang) | **1/1** |
| `buffer-full-add-after-full-event.html` | 0 (hang) | **1/1** |
| `buffer-full-add-entries-during-callback-that-drop.html` | 0 (hang) | **1/1** |

**+8.** Zero regressions (fresh-server sweep): qsa 1975, classlist 1420,
iframe-load 2/2, mark.any 22/22, measures 119/119, structured-clone 141/152,
clear-resource-timings 1/1, buffered-flag 1/1, status-codes-create-entry 1/1,
po-disconnect 3/3, po-observe 5/6 (the 1 fail is the pre-existing
`observe({entryTypes:"mark"})` WebIDL coercion, unrelated to this change).

## Honest caps / next

- **✅ HARVESTED (session 2026-06-18, +4).** `buffer-full-then-increased`,
  `-add-then-clear`, `-add-entries-during-callback`, and
  `-inspect-buffer-during-callback` drive entries through `load.xhr_sync`
  (`xhr.open(..., /*async=*/false)`). They were capped here because sync XHR
  didn't exist. Quest #28 landed the blocking `op_fetch_url_sync` + `_sendSync`,
  but `_sendSync` populated status/headers/text and **never recorded a `resource`
  timeline entry**, so the buffer stayed empty. The fix: `_sendSync` now runs the
  same `performance._addResourceEntry` path the async `fetch()` uses (initiatorType
  `xmlhttprequest`, honest byte size, `_entryContentType` MIME essence) right before
  the DONE transition. All four 0→1/1; **all 12 `buffer-full-*` tests now green**.
- **`buffer-full-eventually`** fills the *default* 250-entry buffer by loading
  images recursively over the real network; ~250 sequential fetches to wpt.live
  exceed the harness wall-clock and the test times out. The algorithm is correct
  (it would fire the event); this is a network/timing cap, not a logic gap.
- **Next resource-timing veins** (unchanged from Scroll #24): css-embedded
  `@import`/`url()` → "css" entries (needs a CSS resource walker), font→"css"
  (`document.fonts`), same-origin redirect timing, TAO cross-origin.

## The dev loop
Build `cargo build --release --features render`; restart the serve process;
measure ONE test at a time with `scripts/wpt_run.py <path> --timeout 55`. ⚠️
Restart the server between long runs — it degrades after many CDP sessions, and a
heavy test like `buffer-full-eventually` (hundreds of loads) degrades it fast: an
all-Terminated sweep that clears on a fresh server is degradation, not a
regression.
