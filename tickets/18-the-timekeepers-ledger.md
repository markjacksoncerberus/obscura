# ⏱️ Scroll #18 — The Timekeeper's Ledger

> *The clock had no ledger. `performance.mark()` and `performance.measure()` were
> hollow no-ops, and `getEntries()` always handed back an empty page. We gave the
> Timekeeper a real book to write in.*

**Realm:** `user-timing/*` (+ `hr-time/*`)
**Hold:** `user-timing/mark.any` **22/22**, `measure-exceptions` **13/13**, and ~70 realm
subtests now passing (was a no-op stub). `hr-time/basic` 4→5, `performance-tojson` 0→1.
**Location:** `crates/obscura-js/js/bootstrap.js` — the `performance` block (~4875) +
the startup `timeOrigin`/`timing` init (~7130). Pure JS.

## The beast we slew

```js
globalThis.performance = {
  now: () => Date.now(),
  mark(){}, measure(){},
  getEntries(){return [];}, getEntriesByName(){return [];}, getEntriesByType(){return [];},
  …
};
```
mark/measure did nothing, the entry buffer didn't exist, and `now()` returned the raw
epoch (not a high-res value relative to `timeOrigin`).

## The ledger (User Timing Level 3)

- **`PerformanceEntry`** (name/entryType/startTime/duration + `toJSON`), **`PerformanceMark`**
  (entryType `"mark"`, duration 0, nullable `detail`), **`PerformanceMeasure`** (entryType
  `"measure"`), **`PerformanceTiming`** (21 navigation-timing attributes + `toJSON`), and a
  **`Performance`** class holding the entry buffer — all exposed as globals.
- **`mark(name, markOptions)`** → a `PerformanceMark`. `markOptions` is a WebIDL dictionary:
  a non-nullish non-object (`123`/`NaN`/`Infinity`/`"str"`) → `TypeError`; negative
  `startTime` → `TypeError`. No `name` argument at all → `TypeError`.
- **`measure(name, startOrOptions, endMark)`** — supports the L3 options dict
  (`start`/`end`/`duration`/`detail`, with the illegal all-three combo → `TypeError`) and
  the positional `(startMark, endMark)` form. Returns a `PerformanceMeasure`.
- **`getEntries` / `getEntriesByName(name[, type]) / getEntriesByType`** — startTime-sorted
  (stable), **`clearMarks([name]) / clearMeasures([name])`**.
- **`now()`** is now `Date.now() - timeOrigin` (high-res, monotonic, clamped ≥ 0).
- **`performance.toJSON()`** + **`PerformanceTiming.toJSON()`** (full attribute set).
- **`performance` is a minimal EventTarget** (addEventListener/removeEventListener/
  dispatchEvent, honoring `{once}`) — a self-contained listener list, deliberately NOT the
  global `EventTarget` (which in this engine aliases `Node`).

### "Convert a mark to a timestamp"

The crux of the exception tests. For a string mark name:
1. If it's a **PerformanceTiming attribute** name → its value; **0 → `InvalidAccessError`**
   (the attribute is "empty" — e.g. `loadEventEnd` mid-load).
2. else the most-recent **mark entry** of that name → its `startTime`.
3. else **`SyntaxError`**.

Positional `startMark`/`endMark` are **DOMStrings**, so `measure("m", 51.15, "mark")`
coerces `51.15` → `"51.15"` → not a mark → `SyntaxError` (only the options-dict
`start`/`end` accept a raw number). Load-phase timing attributes (DOMContentLoaded / load /
unload / redirect / TLS-on-http) are 0 — realistic for a page still loading, and exactly
what `measure-exceptions.html` asserts.

## Honest caps (NOT the algorithm)

- **`mark_exceptions.html` (1/22)** and **`invoke_with_timing_attributes.html` (21/42)**
  assert that `performance.mark("navigationStart")` (and other reserved timing-attribute
  names) throws `SyntaxError`. That was User Timing **L1/L2** behavior, **removed in L3** —
  marks may use any name now. Current Chrome/Firefox fail these obsolete subtests too, so we
  correctly do not implement the throw (and it would conflict with the L3 measure tests).
- **`clearMarks.html` / `clearMeasures.html` / `measures.html` /
  `measure_associated_with_navigation_timing.html`** are **could-not-run**: they run their
  tests from `<body onload=onload_test()>` with `setup({explicit_done:true})`, and the
  document **`load` event isn't firing** for testharness pages in this engine. That's a
  separate load-lifecycle gap, not User Timing.
- **`measure_exception.html` (9/10)** — the straggler asserts `measure(name, {detail:…})`
  throws `TypeError`; L3 explicitly allows a detail-only options object, so this is an
  obsolete expectation.

## To revisit

A real **`PerformanceObserver`** (buffered delivery, `supportedEntryTypes`, `takeRecords`)
would extend this realm further, and — bigger leverage — making the **`load` event fire**
for testharness pages would unlock the could-not-run trio here plus many tests elsewhere
that gate on `window.onload`/`<body onload>`.
