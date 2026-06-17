# Quest #24 — The Resolved Reflection

> *Scroll #23 (The Element Ledger) taught every loading element to write its
> line in the timeline — but the elements lied about their own address. Ask an
> `<img>` for its `src` and it handed back the raw markup string,
> `resources/status-code.py?status=200`, while the ledger had filed the resource
> under its true, absolute name. A page that asked "where did this image come
> from?" and then searched the ledger by that answer found nothing. This quest
> makes the elements tell the truth: a URL-reflecting IDL attribute returns the
> resolved absolute URL, the same name the ledger keeps.*

Realm: `resource-timing/status-codes-create-entry` + the whole
`getEntriesByName(element.src)` family. A foundational HTML IDL-reflection fix
(the widest-tail cap left standing by Scroll #23).

---

## The gap

The HTML spec says a content attribute that "reflects ... as a URL" does **not**
return its raw value from the IDL getter. On get it: returns `""` if the
attribute is absent; otherwise parses the value against the element's base URL
and returns the serialized **absolute** URL; only if parsing fails does it return
the raw value.

Obscura's shared `Element` getters returned the raw attribute:
```js
get src()  { return this.getAttribute("src")  || ""; }
get href() { return this.getAttribute("href") || ""; }
```
So `img.src` on `<img src="resources/status-code.py?status=200">` returned the
relative string, but `_loadElementResource` (Scroll #23) records the entry under
the **absolute** URL. `resource-timing/status-codes-create-entry.html` does:
```js
for (let img of document.getElementsByTagName("img")) {
  const entries = performance.getEntriesByName(img.src);   // relative → no match
  assert_greater_than(entries.length, 0, img.src);
}
```
`entries.length === 0` → the whole test failed (0/1).

## The work

### 1. URL-reflecting IDL getters (`crates/obscura-js/js/bootstrap.js`)
New module helper `_reflectURL(el, attr)` implementing the spec getter (absent →
`""`; present → `new URL(value, el.baseURI).href`; parse-fail → raw). The `src`
and `href` getters now resolve **only** for the elements whose IDL attribute is
genuinely URL-reflecting — scoped tight so non-URL `src`/`href` reads elsewhere
are untouched:
```js
const _URL_REFLECT_SRC  = new Set(['img','script','iframe','audio','video',
                                   'source','track','embed','input','frame']);
const _URL_REFLECT_HREF = new Set(['a','area','link']);
get src()  { return _URL_REFLECT_SRC.has(this.localName)
               ? _reflectURL(this,"src")  : (this.getAttribute("src")  || ""); }
get href() { return _URL_REFLECT_HREF.has(this.localName)
               ? _reflectURL(this,"href") : (this.getAttribute("href") || ""); }
```
The base is `el.baseURI` (the document base URL — honours `<base>`), the same
base `_loadElementResource` resolves against when no `<base>` is present, so the
getter and the entry name agree. The `set src`/`set href` setters are unchanged
(they still take the raw assigned value), and the iframe `contentDocument`
same-origin check (`this.src`) was verified safe under resolution.

### 2. Honest page-`<script src>` entry duration (`crates/obscura-browser/src/page.rs`)
The page-script `resource` entry was injected with `startTime === endTime ===
performance.now()` → `duration === 0`, but the test also asserts
`entries[0].duration > 0` for each `<script src>`. The per-script fetch is now
timed with `std::time::Instant`; the elapsed ms is threaded through the `fetched`
map and the entry is recorded as `startTime = now - elapsed`, `endTime = now`, so
`duration` reflects the **real** network time (`_addResourceEntry` sets
`_duration = endTime - startTime`).

## Results (measured)

| Test | Before | After |
|------|:------:|:-----:|
| `resource-timing/status-codes-create-entry.html` | 0/1 | **1/1** |

**Zero regressions** (clean-server sweep): qsa 1975, classlist 1420, createElement
147, url-origin 403, mark 22/22, structured-clone 141/152, getRandomValues 39/39,
po-disconnect 3/3, url-with-fetch 16/16, iframe-load 2/2, measures 119/119,
nav2-test-attributes-exist 1/1, test-navigation-attributes-exist 4/4,
**po-observe 1/1**, **case-sensitivity.any 3/3**, initiator-type/img 1/1,
link 5/8, dynamic-insertion 5/6, clear-resource-timings 1/1.
`the-img-element/relevant-mutations.html` holds at 70/113 (flaps 69↔70 across
identical runs — a 1s network-fetch timeout in the load-expecting subtests, not
this change; the `t()` harness never reads `.src`).

## Honest notes / caps

- **The win is +1 subtest, but the value is the IDL correctness foundation.** Most
  of the rest of the `getEntriesByName(element.src)` family is gated elsewhere:
  several tests are TAO/cross-origin (`resource_TAO_*`), and a number of
  `resource-timing/*` and `*.window.html`/`*.any.html` variants are could-not-run
  for harness-setup reasons unrelated to URL reflection.
- **Path gotcha confirmed again:** `performance-timeline/case-sensitivity.html`
  now 404s (body is the 42-byte 404 JSON); the live test is
  `case-sensitivity.any.html`. `buffered-flag.window.html` /
  `resource_TAO_zero.html` likewise return empty/404 bodies — none of these are
  regressions (a content-attribute getter cannot truncate a document body).
- **`<base>` divergence (latent, pre-existing):** `_loadElementResource` resolves
  against `_domParse("document_url")` while the new getter resolves against
  `el.baseURI`; on a page with a `<base href>` these differ, so an entry name and
  `img.src` could disagree. No test exercises this yet; aligning the loader to
  `baseURI` is the clean follow-up.

## The dev loop
Build `cargo build --release --features render`; restart the serve process;
measure ONE test at a time with `scripts/wpt_run.py <path> --timeout 90`.
`scripts/wpt_fails.py` for per-subtest detail. ⚠️ Restart the server between long
measurement runs — it degrades after many CDP sessions (could-not-run that clears
on a fresh server is degradation, not a regression).
