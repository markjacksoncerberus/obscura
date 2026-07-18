# 👁️ Scroll #20 — The Observer's Gallery

> *The Timekeeper kept a ledger (Scroll #18), but no one could subscribe to it.
> `PerformanceObserver` was a hollow shell — `observe()` did nothing, the callback
> never fired. We built the gallery: observers that watch the timeline and are
> notified as entries arrive.*

**Realm:** `performance-timeline/*`
**Hold:** supportedEntryTypes **2/2**, po-disconnect **3/3**, po-takeRecords **1/1**,
po-entries-sort **1/1**, observer-buffered-false **1/1**, buffered-flag-after-timeout
**1/1**, multiple-buffered-flag-observers **1/1**, case-sensitivity **1/3**,
idlharness **31→35/58**. **~+15.**
**Location:** `crates/obscura-js/js/bootstrap.js` — right after the `Performance`
class + `globalThis.performance` (~5093). Pure JS, builds on Scroll #18's entry buffer.

## The beast we slew

```js
globalThis.PerformanceObserver = class { constructor(){} observe(){} disconnect(){} };
```

`observe()` registered nothing, so `mark()`/`measure()` never notified anyone and the
callback was never invoked. Every `performance-timeline` test that subscribes timed out
or failed.

## The gallery (Performance Timeline Level 2)

- **`PerformanceObserver(callback)`** — non-function callback → `TypeError`.
- **`observe(options)`** — two mutually-exclusive forms:
  - `{entryTypes: [...]}` — **replaces** the observed set (filtered to supported types;
    unsupported silently dropped). Following an earlier `{type}` observe →
    `InvalidModificationError`.
  - `{type, buffered}` — **accumulates** one type. Following an earlier `{entryTypes}`
    observe → `InvalidModificationError`. Unsupported type → ignored. **`buffered: true`**
    seeds the observer's buffer with already-recorded entries of that type from the global
    timeline and queues delivery.
  - Both/neither of `entryTypes`/`type` → `SyntaxError`.
- **`disconnect()`** — unregister, clear buffer + observed types (idempotent).
- **`takeRecords()`** — return the pending buffer (startTime-sorted) and clear it.
- **`PerformanceObserver.supportedEntryTypes`** — a **frozen, cached** array
  `['mark', 'measure']` (strict alphabetical; the test asserts `types[i-1] < types[i]`
  and identity-stability across calls). Only the entry types Obscura actually generates.
- **`PerformanceObserverEntryList`** — `getEntries()` / `getEntriesByType(type)` /
  `getEntriesByName(name[, type])`, all startTime-sorted.

### Notification ("queue a PerformanceObserver task")

`performance.mark()` / `measure()` call **`_queuePerformanceEntry(entry)`**: append the
entry to every registered observer watching that `entryType`, then **`_schedulePerfTask`**
(a single `setTimeout(0)` task — HTML's "queue a PerformanceObserver task"). The flush
clears the scheduled flag *first* (so an observer queued from inside a callback schedules a
fresh task — this is what lets `multiple-buffered-flag-observers` chain), snapshots the
registered list, and for each observer with a non-empty buffer creates a
`PerformanceObserverEntryList`, drains the buffer, and invokes the callback with
`(list, observer)` (errors routed through `_reportError`). `takeRecords()` draining the
buffer before the task runs is exactly why the po-takeRecords callback never fires.

### idlharness tidy-ups (genuinely correct, +4)

- `Symbol.toStringTag` on both prototypes → `[object PerformanceObserver]` /
  `[object PerformanceObserverEntryList]`.
- Both interface objects defined **non-enumerable** on the global (matches real Chrome +
  WebIDL).
- `PerformanceObserverEntryList` reads its entries from `arguments[0]`, not a declared
  parameter, so its WebIDL interface-object **length is 0** (it has no constructor).

## Honest caps (NOT the observer)

- **`po-observe.html`** still TIMEOUTs and **`case-sensitivity`** is 1/3: both need
  **`resource`** (and `po-observe` also `navigation`) timeline entries — resource/navigation
  timing is not implemented (no entries are ever generated for those types). The observer
  machinery itself is complete; it has nothing to deliver for those types.
- **idlharness 35/58** — most remaining misses are the engine-wide mismatch that JS `class`
  methods are non-enumerable while WebIDL operations must be enumerable, plus
  `PerformanceEntry`/navigation/resource interface members we don't have.

## Zero regressions

mark.any 22/22, measure-exceptions 13/13, clearMarks 57/57, measures 119/119,
hr-time/basic 5/5, monotonic-clock 2/2, qsa 1975, classlist 1420, createElement 147,
structured-clone 141/152, getRandomValues 39/39, base64 380/380, url-origin 403/403,
XMLSerializer 27/29.

## To revisit

- **Resource Timing / Navigation Timing** entries (`PerformanceResourceTiming` /
  `PerformanceNavigationTiming`) — would unlock `po-observe`, the rest of
  `case-sensitivity`, and a wide swath of `resource-timing/*` + `navigation-timing/*`.
  Needs the network layer to emit timeline entries.
