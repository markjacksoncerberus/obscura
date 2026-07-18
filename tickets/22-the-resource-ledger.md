# 📒 Scroll #22 — The Resource Ledger

> *The Navigator's Almanac (Scroll #21) recorded the voyage that brought the
> document here, but said nothing of the cargo it fetched along the way. We opened
> the ledger: a `PerformanceResourceTiming` entry for each resource the page loads.*

**Realm:** `resource-timing/*` (+ cross-realm `performance-timeline/case-sensitivity`)
**Hold:** resource-timing/buffered-flag **1/1**, clear-resource-timings **1/1**,
performance-timeline/case-sensitivity **1/3 → 3/3**. **+4.**
**Location:** `crates/obscura-js/js/bootstrap.js` (`Performance._addResourceEntry`,
real `clearResourceTimings`, the `fetch()` hook) + `crates/obscura-browser/src/page.rs`
(per-`<script src>` resource-entry injection in the execute-scripts loop).

## What we built

Building directly on Scroll #21's `PerformanceResourceTiming` base class:

- **`Performance._addResourceEntry(name, initiatorType, startTime, endTime, sizes)`**
  — creates a `PerformanceResourceTiming` (entryType "resource"), collapses the
  network sub-phases (`fetchStart` === lookup/connect/request === `startTime`),
  sets `responseStart`/`responseEnd` to the completion time (so `duration > 0` for
  any real round-trip), fills body sizes, pushes it to `performance._entries`, and
  **queues it to observers** (`_queuePerformanceEntry`).
- **`clearResourceTimings()`** is now real (was a no-op) — drops all "resource"
  entries from the buffer. `setResourceTimingBufferSize(n)` records the size.
- **`fetch()` hook** — on the network path (not blob:), records a "resource" entry
  with `initiatorType` "fetch", `startTime` captured before the op and `responseEnd`
  at completion, body size from the response. **XHR routes through `fetch()`, so it
  is covered too** (currently also labelled "fetch" — see caps).
- **Page `<script src>` loads** (`page.rs` execute-scripts loop) inject a "script"
  resource entry as each external script is fetched, *before* it executes — so a
  later inline script (e.g. the `clear-resource-timings` test) observes the entries.
  `'resource'` was added to `PerformanceObserver.supportedEntryTypes`.

## Why these tests pass

- **buffered-flag** — `fetch('resources/empty.js')` now produces a resource entry;
  the first observer fires, the buffered second observer pulls it from the timeline.
- **clear-resource-timings** — the page's two `<script src>` (testharness.js +
  testharnessreport.js) are exactly the 2 expected resource entries;
  `clearResourceTimings()` then empties them.
- **case-sensitivity** (1/3 → 3/3) — `getEntriesByType("resource")` is now non-empty
  and `getEntriesByName("…/resources/testharness.js")` matches exactly one entry
  (case-sensitively).

## Honest caps (NOT the ledger)

- **`entry-attributes.html`** and most of `resource-timing/*` use multi-type resource
  **loaders** (`<img>`, `<iframe>`, `<link>`, `<object>`, dynamic element `.src`) plus
  detailed timing **invariants** and **TAO** (`Timing-Allow-Origin`) cross-origin
  checks. We only emit entries for `fetch`/XHR and page `<script src>` — element
  resource loads don't yet produce entries, and there's no TAO machinery — so these
  remain capped.
- **`po-observe`** still TIMEOUTs: it needs a `square.png` **`resource`** entry from a
  dynamically-created `<img>` (we don't hook image loads) alongside navigation/mark/
  measure.
- **XHR `initiatorType`** is "fetch" (XHR is implemented over `fetch()`), not
  "xmlhttprequest" — fine for the tests here, but a known fidelity gap for any test
  that asserts the XHR initiator type.
- The network sub-phases are collapsed to `startTime` (no real DNS/connect/TLS
  timing); same-origin tests asserting strict sub-phase ordering beyond
  `start ≤ response` are not targeted.

## Zero regressions

mark.any 22/22, measures 119/119, clearMarks 57/57, po-entries-sort 1/1,
multiple-buffered-flag-observers 1/1, supportedEntryTypes 2/2, nav2-test-attributes-exist
1/1, po-navigation 1/1, qsa 1975, base64 380/380, **url-with-fetch 16/16** (the fetch
hook is side-effect-only).

## To revisit

- **Element resource loads** (`<img>`/`<link>`/`<iframe>`/dynamic `.src`) → resource
  entries: unlocks `po-observe`, `entry-attributes`, and much of `resource-timing/*`.
- **Resource buffer + `resourcetimingbufferfull`** event + `setResourceTimingBufferSize`
  enforcement (the `buffer-full-*` family).
- **TAO** (`Timing-Allow-Origin`) for cross-origin entries — most of the cross-origin
  `resource-timing/*` suite; needs server-header awareness.
- XHR `initiatorType` "xmlhttprequest"; real per-resource network sub-phase timing.
