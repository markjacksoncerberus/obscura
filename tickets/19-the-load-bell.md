# 🔔 Scroll #19 — The Load Bell

> *Many a testharness page begins its tests not from a top-level script, but from
> `<body onload=onload_test()>` — waiting for a bell that never rang. The page
> parsed, the scripts loaded, the `load` event even fired on the window… but the
> body's `onload` was an orphan. We rang the bell.*

**Realm:** load-lifecycle (cross-realm); first wins banked in `user-timing/*`
**Hold:** `user-timing/clearMarks` **57/57**, `clearMeasures` **57/57**, `measures`
**119/119** (all were could-not-run). **+233.**
**Location:** `crates/obscura-js/js/bootstrap.js` (`__installBodyWindowHandlers`,
~2903) + `crates/obscura-browser/src/page.rs` (the `<ready-state>` step, ~472). Pure JS
+ one call site.

## The beast we slew

In HTML, an `on*` content attribute on `<body>` (or `<frameset>`) is **not** an
event handler for that element — it is an event handler for the **`Window`**
(the "Window-reflecting body element event handler set" plus the body/frameset
window event handlers). So `<body onload=onload_test()>` means
`window.onload = function(event){ onload_test(); }`.

Obscura never wired this. The engine's `<load-event>` step
(`page.rs`) already did the right thing —

```rust
if (typeof window.onload === 'function') { try { window.onload(); } catch(e) {} }
… _dispatchSpec(window, new Event('load')) …
```

— but `window.onload` was `undefined`, because nothing ever read the body's
`onload` content attribute. Tests that used `window.addEventListener('load', …)`
worked (real registered listeners on the window); tests that used `<body onload>`
silently never ran. With `setup({explicit_done:true})` the harness then waited
forever for a `done()` that lived inside the un-fired handler → **could-not-run**.

## The bell-rope

`__installBodyWindowHandlers()` scans `document.body` (and any `<frameset>`) for
the window-reflecting `on*` content attributes, compiles each with
`new Function('event', attrValue)`, and assigns it to `globalThis.on<name>`.

It runs at the `<ready-state>` step (`__documentReadyState__ = 'loading'`),
**before** parser-discovered scripts execute. Two reasons this timing is right:
- The whole document is parsed by html5ever into the static snapshot before any
  JS runs, so `document.body` already exists at the `'loading'` step.
- Installing *before* scripts means a later `window.onload = fn` in a page script
  **overrides** the body attribute (script-wins) — the safe ordering. (Strict
  spec order is parse-time-attribute-wins, but no real page sets both; script-wins
  never loses a test and avoids clobbering a script's handler.)

`onerror` is **deliberately excluded** from the set — the engine installs its own
`window.onerror` reporting bridge at the top of bootstrap, and a body `onerror`
content attribute is vanishingly rare on testharness pages; honoring it would risk
the error-event plumbing the harness itself relies on.

No double-fire: `_dispatchSpec` invokes only **registered listeners**, never
`on*` properties, so the explicit `window.onload()` call in `<load-event>` is the
single invocation.

## Honest caps (NOT the Load Bell)

- **`user-timing/measure_associated_with_navigation_timing.html`** now *runs*
  (onload fires) but yields **no-results**: it measures
  `navigationStart → loadEventEnd` / `domComplete` and expects positive durations.
  Those `PerformanceTiming` load-phase attributes are **0** in Obscura — and they
  must stay 0, because `measure-exceptions.html` (13/13, secured by Quest #18)
  asserts that a 0-valued timing attribute throws `InvalidAccessError`. Populating
  real navigation-timing values is a **separate quest** in direct tension with that
  secured test; not pursued here.
- This fix is **general** — any other realm's could-not-run test that gated on
  `<body onload>` now runs automatically. The user-timing trio is just where the
  ground truth was already mapped (Scroll #18 flagged this exact gap).

## Zero regressions

`user-timing/mark.any` 22/22, `measure-exceptions` 13/13, `hr-time/basic` 5/5,
qsa 1975, classlist 1420, createElement 147, structured-clone 141/152,
getRandomValues 39/39, base64 380/380, url-origin 403/403, XMLSerializer 27/29.

## To revisit

- Real navigation-timing population (unlocks `measure_associated_with_navigation_timing`)
  — must reconcile with the 0-valued-attribute `InvalidAccessError` contract.
- A real **`PerformanceObserver`** (the `performance-timeline/*` realm — `po-observe`
  currently TIMEOUTs on the no-op stub).
- Generic inline event-handler **content attributes on ordinary elements**
  (`<div onclick=…>`) are still not compiled into listeners — a separate, broader
  reflection feature.
