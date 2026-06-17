# Quest #23 — The Element Ledger

> *Scroll #22 (The Resource Ledger) taught the timeline to remember every
> resource that `fetch()` and XHR pulled across the wire — but the elements
> themselves still loaded in silence. An `<img>` would fetch its pixels, a
> `<link>` its stylesheet, and the ledger recorded nothing. This quest gives
> every loading element a line in the book.*

Realm: `resource-timing/*` (the element-load tail) + `performance-timeline/po-observe`.
Builds directly on Scroll #22's `Performance._addResourceEntry` + `PerformanceResourceTiming`.

---

## Increment 1 — JS-path element resource loads (~+10), SECURED

### The gap
Scroll #22 emitted `resource` entries for `fetch()`/XHR and page `<script src>`
loads, but **element subresource loads emitted nothing** — so any test that
created an `<img>`/`<link>`/`<script>`/`<object>` and waited for its Resource
Timing entry either timed out or saw an empty timeline. This capped
`performance-timeline/po-observe`, the whole `resource-timing/initiator-type/*`
family, and `entry-attributes`.

### The work (all `crates/obscura-js/js/bootstrap.js`, no new Rust)
- **`_loadElementResource(el, url, initiatorType, {eval})`** (new, near
  `_fireIframeElementLoad`): resolves the URL against the document base, fetches
  via `op_fetch_url` (GET, no-cors), records an honest-size `resource` entry via
  `performance._addResourceEntry(name, initiatorType, start, end, {enc, dec, status})`,
  then fires the element's trusted `load` (or `error`) event. A per-element
  `_resLoadGen` token supersedes a stale load if `src` is reassigned mid-flight.
  For scripts (`{eval: true}`) the fetched body is executed before the load event.
- **`_fireElementError(el)`** (new): the `error`-event twin of `_fireIframeElementLoad`.
- **Wiring:**
  - `<img>`.src setter → `_loadElementResource(this, v, 'img')` (whether or not
    connected — images load on `src` assignment).
  - **`new Image()`** rewritten as a real `<img>` factory (`document.createElement('img')`)
    so it flows through the same setter path (was a fake stub class).
  - `<script src>` in `appendChild` → refactored to call the helper with `{eval:true}`
    so it now also emits a `script` entry (previously fetched+ran but logged nothing).
  - `_connectResourceElement(el)` (new), called from `appendChild`/`insertBefore` on
    every inserted Element: JS-inserted `<link rel=stylesheet/preload/prefetch/icon/
    manifest/modulepreload>` (initiatorType "link") and `<object data>` (initiatorType
    "object") begin loading on connection.
- **`rel` IDL reflection** added to Element (`get rel`/`set rel`). `link.rel = "stylesheet"`
  was setting a plain JS property, so `getAttribute('rel')` stayed null and the link
  never matched the resource-fetching relations → never loaded → test hung. THE bug
  behind the stylesheet timeout.
- **`_initiatorType` internal init field** on `fetch()`: iframe navigation
  (`_loadIframeSrc`) passes `'iframe'` and XHR `send()` passes `'xmlhttprequest'`,
  so their entries report the correct element type instead of the public-fetch
  default `"fetch"`.

### Results (measured)
| Test | Before | After |
|------|:------:|:-----:|
| `performance-timeline/po-observe.html` | 0/1 (TIMEOUT) | **1/1** |
| `resource-timing/initiator-type/dynamic-insertion.html` | 0/6 (TIMEOUT) | **5/6** |
| `resource-timing/entry-attributes.html` | 0/3 (TIMEOUT) | **1/3** |
| `resource-timing/xhr-resource-timing.html` | 0–1 | **1/2** |

**Zero regressions:** qsa 1975, classlist 1420, createElement 147, url-origin 403,
mark.any 22/22, measure-exceptions 13/13, structured-clone 141/152, getRandomValues
39/39, po-disconnect 3/3, po-takeRecords 1/1, clearMarks 57/57, url-with-fetch 16/16,
iframe-load 2/2, nav2-test-attributes-exist 1/1.

### Caps (honest)
- **MARKUP `<img src>` / `<link rel=stylesheet>` still emit no entry.** They are
  parsed by html5ever in Rust and never travel through the JS `appendChild`/setter
  hooks, so `initiator-type/img.html` (markup `<img>`) and `link.html` (markup
  `<link>` in `<head>`) stay capped. **Inc 2 = a `__startResourceLoads()` markup
  scan** (mirror `__startFrameLoads`), driven from the Rust load sequence — but
  watch the load-event timing (markup-resource fetches counted in-flight could delay
  `load`; regression risk on image-heavy pages, so measure broadly).
- **font → "css"** (`load.font` builds a `<style>@font-face` + waits `document.fonts.ready`)
  — needs a real `document.fonts` FontFaceSet + CSS-driven font fetch.
- **same-origin redirect timing** (entry-attributes): our collapsed-phase entry has
  `redirectStart = 0`; honest redirect timing needs the Rust fetch to surface the
  redirect chain.
- **TAO cross-origin**, **`resourcetimingbufferfull` buffer-full family** — untouched,
  as in #22.

---

## Increment 2 — markup subresource scan (~+6), SECURED

### The gap
Inc 1 only loaded elements that travelled through the JS `appendChild`/setter
hooks. MARKUP `<img src>` and `<link rel=stylesheet>` (parsed by html5ever in
Rust) never do, so `initiator-type/img.html` (markup `<img>`) and `link.html`
(markup `<link>` in `<head>`) stayed capped.

### The work
- **`globalThis.__startResourceLoads()`** (new, beside `__startFrameLoads`):
  scans the static document for `img[src]` (not already loading), `link`, and
  `object`, and starts each load via `_loadElementResource` /
  `_connectResourceElement`. Idempotent per element.
- Wired into `page.rs` at the `<dcl-events>` step, right after `__startFrameLoads()`,
  so the markup-resource fetches are counted in-flight and (bounded by
  `pump_until_idle`'s 500ms deadline) settle before the load event — subresources
  delay load, like iframes.
- **`modulepreload` → initiatorType "other"** (all other resource-fetching link
  rels → "link").

### Results
| Test | Before | After |
|------|:------:|:-----:|
| `resource-timing/initiator-type/img.html` | 0/1 | **1/1** |
| `resource-timing/initiator-type/link.html` | 0/8 | **5/8** |
| `the-img-element/relevant-mutations.html` | 70/113 | **71/113** |

**Zero regressions** (full core sweep re-run: qsa 1975, classlist 1420, createElement
147, url-origin 403, mark.any 22/22, structured-clone 141/152, getRandomValues 39/39,
po-disconnect 3/3, url-with-fetch 16/16, iframe-load 2/2, measures 119/119,
nav2-test-attributes-exist 1/1; relevant-mutations *gained* 1). Verified the markup
scan is timing-safe by stashing inc 2 and re-measuring relevant-mutations on inc 1.

### Caps (inc 2)
- **css-embedded resources → "css"** (link.html's last 3): `@import`/`url()` inside a
  loaded stylesheet should emit "css"-initiated entries — needs a CSS resource walker.
- **`status-codes-create-entry`** and friends query `performance.getEntriesByName(img.src)`:
  our `img.src` getter returns the RAW attribute, but the IDL `src`/`href` reflection
  should return the *resolved absolute URL*. Fixing that is a broad, separate change
  (the getter is shared across all elements) — left as-is to avoid regression risk.
- **svg/embed/video/audio/input** initiator-type tests use other element types — varied,
  not pursued.

## The dev loop
Build `cargo build --release --features render`; restart the serve process; measure
ONE test at a time with `scripts/wpt_run.py <path> --timeout 90`, `scripts/wpt_fails.py`
for per-subtest detail. `resource-timing/resources/resource-loaders.js` is the shared
loader used by most resource-timing tests (read it: `new Image()`, `createElement('link')`,
etc.); `entry-invariants.js` holds `attribute_test` (observes `{type:"resource"}` then
checks the matched entry's attributes).
