# 🧭 Scroll #21 — The Navigator's Almanac

> *The Observer's Gallery (Scroll #20) could watch the timeline — but the timeline
> had no record of the voyage that brought the document here. We wrote the
> almanac: a `PerformanceNavigationTiming` entry for the navigation itself.*

**Realm:** `navigation-timing/*`
**Hold:** nav2-test-attributes-exist **1/1**, nav2-test-instance-accessible-from-the-start
**1/1**, nav2-test-navigation-type-navigate **1/1**, po-navigation **1/1**,
buffered-flag.window **1/1**, test-navigation-attributes-exist **4/4**,
test-navigation-redirectCount-none **5/5**, test-document-onload **3/3**,
test-document-readiness-exist **3/3**, idlharness **36/161**. **~+20.**
**Location:** `crates/obscura-js/js/bootstrap.js` (`PerformanceResourceTiming` /
`PerformanceNavigationTiming` classes ~4958, `__navTimingDCL`/`__navTimingLoad`,
nav-entry creation in `__obscura_init`) + `crates/obscura-browser/src/page.rs`
(body-size plumbing, `readystatechange` dispatch, lifecycle hook calls).

## What we built

### The entry classes
- **`PerformanceResourceTiming extends PerformanceEntry`** — all the network-phase
  attributes (`fetchStart`, `domainLookupStart/End`, `connectStart/End`,
  `secureConnectionStart`, `requestStart`, `responseStart/End`, `transferSize`,
  `encodedBodySize`, `decodedBodySize`, `nextHopProtocol`, `workerStart`,
  `redirectStart/End`, `initiatorType`, `serverTiming`, …) as settable properties.
- **`PerformanceNavigationTiming extends PerformanceResourceTiming`** — adds the
  document-lifecycle attributes (`domInteractive`, `domContentLoadedEventStart/End`,
  `domComplete`, `loadEventStart/End`, `unloadEventStart/End`, `type`,
  `redirectCount`). `entryType` "navigation", `initiatorType` "navigation",
  `type` "navigate", `nextHopProtocol` "http/1.1".

### The lifecycle
1. **`__obscura_init`** (startup) creates the single nav entry with `startTime` 0 and
   pushes it to `performance._entries` — so `getEntriesByType('navigation')` is
   populated for the document's whole lifetime (this is what
   `nav2-test-instance-accessible-from-the-start` asserts — accessible from a head
   sync script).
2. The **`<ready-state>`** step in `page.rs` seeds the entry's body sizes from the
   **real Rust document response** — `document_body_size: Option<(encoded, decoded)>`
   captured at fetch time; `transferSize = encoded + 300` (the spec's header
   estimate). Honest values, not synthesized.
3. **`__navTimingDCL`** (called from the DCL step) fills `domInteractive` /
   `domContentLoadedEventStart/End`; **`__navTimingLoad`** (load step) fills
   `domComplete` / `loadEventStart/End`, sets `duration = loadEventEnd`, refreshes
   `name` to the now-final document URL, and **queues the entry to observers**
   (`_queuePerformanceEntry`) — so a `PerformanceObserver({entryTypes:['navigation']})`
   registered during parse fires at load (po-navigation, nav2-test-attributes-exist).
4. **`readystatechange`** is now dispatched on `document` (+ `document.onreadystatechange`)
   at interactive (DCL) and complete (load) — `test-document-readiness-exist`.

`'navigation'` was added to `PerformanceObserver.supportedEntryTypes`
(`['mark','measure','navigation']`, still alphabetical), so `observe({type:'navigation',
buffered:true})` pulls the entry from the timeline (buffered-flag.window).

## Honest caps (NOT the almanac)

- **nav2-test-attributes-values** / **nav2-test-instance-accessors** — hard-assert the
  exact wire byte size (`encodedBodySize === 5949`) and host-config URLs
  (`http://{ORIGINAL_HOST}:{HTTP_PORT}/…` via the WPT server's `get-host-info` /
  `.sub` substitution). Obscura loads from the live origin, so the `expectedUrl` /
  `getEntriesByName(expectedUrl)` and exact-size assertions can't match.
- **nav2-test-unique-nav-instances** — needs a *separate* `PerformanceNavigationTiming`
  on an **iframe's** `contentWindow.performance`. Frame windows don't have their own
  navigation entry yet (per-frame nav timing).
- **nav2-test-timing-persistent** — drives a real **redirect chain**
  (`common/redirect.py`) and asserts non-zero `redirectStart/End`, `fetchStart`,
  `responseEnd`. Needs real per-navigation network timing + redirect handling.
- **idlharness 36/161** — most misses are the engine-wide "JS class methods are
  non-enumerable, WebIDL operations must be enumerable" mismatch, plus members we don't
  populate.

The main-document network phases (`fetchStart` … `responseStart`) are left at 0 (the
document is fetched by the Rust layer before `timeOrigin`); only the body sizes and
document-lifecycle phases carry real values. No same-origin test asserts those phases
be non-zero except the redirect/persistent test above (a documented cap).

## Zero regressions

mark.any 22/22, measures 119/119, clearMarks 57/57, measure-exceptions 13/13,
po-takeRecords 1/1, po-entries-sort 1/1, multiple-buffered-flag-observers 1/1,
supportedEntryTypes 2/2, hr-time/basic 5/5, performance-tojson 1/1, qsa 1975,
classlist 1420, createElement 147, EventTarget-dispatchEvent 25/25, Node-properties
726/726, structured-clone 141/152, getRandomValues 39/39, base64 380/380, url-origin 403/403.

## To revisit

- **Resource Timing** (`PerformanceResourceTiming` entries for img/script/link/fetch/XHR
  loads) — the base class now exists; needs the resource-load paths to emit entries
  (+ a resource buffer with `clearResourceTimings`/`setResourceTimingBufferSize`/
  `resourcetimingbufferfull`). Unlocks `resource-timing/*`, `po-observe`, and the rest
  of `case-sensitivity`. The big cross-Rust follow-up.
- Per-iframe navigation entries (unique-nav-instances).
- Real per-navigation network timing + redirect chain (timing-persistent, the
  redirect-* family).
