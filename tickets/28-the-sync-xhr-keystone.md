# ⚔️ Quest #28 — The Synchronous XHR Keystone

> Realm: `xhr/*` (XMLHttpRequest, synchronous mode)
> Hold before: most of the realm dark — every `open(method, url, false)` test failed
> Hold after: **~+49** across the sync surface; zero regressions
> Difficulty: ⚔️⚔️⚔️ (architectural — a blocking Rust op)

## The gap

WPT's `xhr/` suite leans **heavily** on synchronous XHR (`open(method, url, false)`)
because it makes assertions trivial: `client.send()` then read `responseText` /
`getResponseHeader()` on the very next line, no EventWatcher, no `async_test`. But
Obscura's `XMLHttpRequest.send()` was **always** async — `fetch().then(...)` — so
`send()` returned before the response arrived and the next-line read saw `""` / `null`.
Whole files that *looked* like header / method / URL tests were really blocked on one
missing primitive: **a `send()` that blocks until the response is in hand.**

This was the single widest lever named across three prior quests' Caps:
- #25 The Buffer Ledger — ×4 `buffer-full` tests assert on sync-XHR ordering.
- #26 The Content-Type Ledger — ×2 cross-origin no-cors XHR.
- #27 The XHR Foundry — `*-sync.htm` (~18), `open-method-case-*` (15), `responseurl`, etc.

## The work

### Rust (`crates/obscura-js/src/ops.rs`)

The XHR spec says a sync request **blocks the calling thread** until the response
arrives. On the `engine-per-page-threads` model each page owns its JS thread, so
blocking there freezes only that page — never the engine. So a blocking op is *safe*
here in a way it would not be on a shared event loop.

1. **Factored the network core** of `op_fetch_url` into a standalone
   `async fn perform_fetch_core(url, method, headers_json, origin, mode, body,
   cookie_jar, in_flight, proxy_url) -> Result<String, String>` — everything from
   building the per-request client through preflight, the manual redirect loop
   (SSRF-revalidated per hop, GHSA-8v6v-g4rh-jmcm), cookie threading, and the JSON
   response envelope. The async `op_fetch_url` now just gathers state + runs the
   intercept dance, then `await`s the core. **Behaviour-preserving** (verified: every
   async fetch/XHR realm held).
2. **New blocking op `op_fetch_url_sync`** (`#[op2]`, sync). It does SSRF validation +
   the blocked-URL check synchronously, clones the `Send` pieces out of `SharedState`
   (which holds `Rc`s — not `Send`), then spawns a throwaway worker thread with its own
   `current_thread` Tokio runtime, `block_on`s `perform_fetch_core`, and **blocks the JS
   thread** on a `std::sync::mpsc` channel for the result. Running on a fresh runtime
   (not the page's) avoids the "cannot start a runtime from within a runtime" panic.
   Request **interception is intentionally skipped** (sync XHR + CDP interception on a
   single thread would deadlock, and WPT never intercepts); cookies, proxy, CORS, and
   SSRF all still apply via the shared core.

### JS (`crates/obscura-js/js/bootstrap.js`)

- **`open()` records the async flag** — `this._async = (async_ === undefined) ? true :
  !!async_` (WebIDL `optional boolean async = true`: absent / explicit `undefined` →
  async; explicit `false` → sync). Previously the 3rd arg was dropped entirely.
- **`open()` throws `InvalidAccessError`** for a sync request once a non-default
  `timeout` or a `responseType` has been set (open-method-responsetype-set-sync), before
  any state change so no `readystatechange` leaks.
- **`open()` only fires `readystatechange` when the state actually changes** — a
  redundant `open()` on an already-OPENED object is now silent (open-open-sync-send
  expects `[1, 4]`, not `[1, 1, 4]`).
- **New `_sendSync(body)`** — blocks via `op_fetch_url_sync`, handles `data:` and `blob:`
  in-process (same WHATWG processors the async path uses), populates `status` /
  `statusText` / `responseURL` / response headers / `responseText` / `response`
  (per `responseType`) synchronously, then fires the DONE transition + `load` +
  `loadend`. No `loadstart` / progress for sync (per §send). A network error (transport
  failure, CORS/SSRF block, or a malformed response header — e.g. hyper rejecting a
  null byte) moves the object to DONE and **throws a `NetworkError` DOMException**,
  exactly as the spec and the `headers-normalize-response` `error()` cases require.
- **`_fireEvent` now builds real `ProgressEvent`s** for the progress-family events
  (loadstart/progress/load/loadend/error/abort/timeout); `readystatechange` stays a plain
  Event. Handlers that test `e instanceof ProgressEvent` (send-sync-no-response-event-*)
  now see the right type. (General correctness win — applies to async XHR too.)

## Results (measured, wpt.live)

| Test | Before | After |
|------|:------:|:-----:|
| `headers-normalize-response.htm` | 0/15 | **15/15** ✅ |
| `open-method-case-insensitive.htm` | 0/6 | **6/6** ✅ |
| `open-method-case-sensitive.htm` | 0/9 | **9/9** ✅ |
| `open-method-responsetype-set-sync.htm` | 0/5 | **5/5** ✅ |
| `open-url-fragment.htm` | 0/4 | **4/4** ✅ |
| `response-method.htm` | 1/3 | **3/3** ✅ |
| `event-readystate-sync-open.any.html` | 0/2 | **2/2** ✅ |
| `open-open-sync-send.htm` | 0/1 | **1/1** ✅ |
| `open-sync-open-send.htm` | 0/1 | **1/1** ✅ |
| `send-sync-no-response-event-load.htm` | 0/1 | **1/1** ✅ |
| `send-sync-no-response-event-loadend.htm` | 0/1 | **1/1** ✅ |
| `send-redirect-infinite-sync.htm` | 0/1 | **1/1** ✅ |
| `responseurl.html` | 0/2 | **1/2** ⬆️ |

**≈ +49 subtests.** Also confirmed green (state checks, pre-existing or incidental):
`getresponseheader-unsent-opened-state` 1/1, `getresponseheader-error-state` 1/1,
`getallresponseheaders-status` 1/1.

**Zero regressions** (fresh-server sweep): qsa 1975, classlist 1420, createElement 147,
mark 22/22, measures 119/119, structured-clone 141/152, getRandomValues 39/39,
url-setters-stripping 260/260, url-with-fetch 16/16, url-with-xhr 14/14, **data-uri 10/10,
setrequestheader-bogus-name 71/71, -value 5/5, open-method-bogus 8/8, response-json 4/4**
(the async XHR surface — proof the `op_fetch_url` refactor is behaviour-preserving),
content-type 16/21 (peak, unchanged).

## Caps / Next leverage

- **`responseurl.html` last subtest** + cross-origin/redirect `responseURL` — the final
  URL after a cross-origin redirect needs redirect-chain origin tracking (same cap named
  in #26). 1/2 for now.
- **`open-url-encoding.htm`** (0/2) — document-**charset-aware** query encoding: a
  `windows-1252` document encodes `?ß` as `%DF`, a lone surrogate as `%26%2365533%3B`;
  our URL resolver is UTF-8 only (`%C3%9F`). Needs `<meta charset>`-aware query encoding
  in the URL/encoding layer. **Now reaching the server** — purely an encoding gap, not a
  sync gap.
- **`.asis` raw-response tests** (`getallresponseheaders.htm` ×7, etc.) — wpt.live serves
  these as raw HTTP with odd reason phrases / no Content-Length; reqwest (and local
  `curl`, exit 56) choke on the connection. Environmental/serving cap, not a JS gap.
  (These are *async* tests anyway.)
- **`setrequestheader-allow-empty-value.htm`** (0/3) — server echoes the request header
  **name** case-preserved (`X-Empty`), but reqwest/hyper lowercase request header names
  on the wire (`x-empty`). Transport cap (hyper normalizes `HeaderName`).
- **`header-user-agent-sync.htm`** (0/1) — needs a `User-Agent` request header to be sent
  and reflected; we don't set one on op_fetch_url requests.
- **`send-data-unexpected-tostring.htm`** (0/3) — re-entrant `abort()`/`open()`/`send()`
  *during body `toString()` stringification*; deep edge cases (need a real send() flag
  + state guards mid-stringify).
- **The #25 `buffer-full` xhr_sync tails + #26 no-cors XHR content-type tails** — now
  unblocked in principle by sync XHR; revisit those scrolls to harvest them.

See [[wpt-conformance-campaign]] memory for the live realm pointer.
