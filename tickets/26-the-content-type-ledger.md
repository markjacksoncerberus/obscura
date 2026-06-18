# Quest #26 — The Content-Type Ledger

> *Scrolls #22–#25 built the Resource Timing ledger: every fetch writes its line,
> the loading elements write theirs, the names tell the truth, and the ledger has
> its bound and its bell. But each line was missing a column — what KIND of thing
> was fetched. A page asking "what content-type did that image arrive as?" got
> `undefined`. This quest adds the column: `PerformanceResourceTiming.contentType`.*

Realm: `resource-timing/content-type.html` — the Resource Timing 2
`PerformanceResourceTiming.contentType` attribute (+ the CORS-mode and
`XMLHttpRequest.open(URL)` plumbing it exposed).

---

## The gap

`resource-timing/content-type.html` was **0/21**. Three distinct causes:

1. **No `contentType` attribute.** `PerformanceResourceTiming` had no `contentType`
   member, so `entry.contentType` was `undefined` for every same-origin resource —
   all the same-origin subtests asserted `entry.contentType === "image/png"` (etc.)
   and got `undefined`.
2. **`url.includes is not a function`.** The `xhr_async` loader does
   `xhr.open("GET", new URL(path, ORIGIN))` — a **URL object**, not a string.
   `XMLHttpRequest.open` stored it verbatim into `this._url`, and `send()` then did
   `url.includes('://')` → `TypeError`. The XHR subtests rejected.
3. **Cross-origin CORS resources reported `""`.** The "content-type is exposed for
   CORS requests" subtests load a cross-origin resource with
   `crossOrigin="anonymous"` (CORS mode) + `Access-Control-Allow-Origin`, and expect
   the real content-type. `_loadElementResource` always fetched **no-cors**, so the
   response was opaque → `""`.

## The work (all in `crates/obscura-js/js/bootstrap.js`)

### 1. `PerformanceResourceTiming.contentType`
- New `this.contentType = ""` field (constructor) + included in `toJSON()`.
- `Performance._makeResourceEntry` honors `sizes.contentType` (default `""`).
- New module helper `_mimeEssence(headers)` — the MIME **essence** (`type/subtype`,
  parameters stripped, trimmed, lowercased) of the response `Content-Type` header.
  (`op_fetch_url` already returns the response `headers` with lowercased keys.)

### 2. Exposure rule — non-opaque responses only
`contentType` is exposed for a **same-origin** response, or a **CORS** request that
passed the access-control check; an opaque cross-origin (no-cors) response → `""`.
- **fetch() / XHR path** (the global `fetch` hook): `_entryContentType(url, headers,
  pageOrigin)` returns the essence only when the resource origin === document origin.
  (`fetch()`/XHR are already cors-mode by default, but `_entryContentType` keeps the
  conservative same-origin gate; opaque no-cors fetches still get `""`.)
- **Element loads** (`_loadElementResource`): new `_useCors` flag from the element's
  `crossOrigin` attribute (`"anonymous"`/`"use-credentials"`). When set, the
  subresource is fetched in **CORS mode** (was hard-coded `no-cors`); since we only
  reach the entry-recording branch when the request was *not* `corsBlocked`, a CORS
  response is non-opaque, so `contentType` is exposed even cross-origin. Same-origin
  loads expose it as before; cross-origin **no-cors** loads still get `""`.

### 3. `XMLHttpRequest.open` URL coercion
`open(method, url)` now coerces a non-string `url` (e.g. a `URL` object) to a string
before storing it, so the `.startsWith`/`.includes` string ops in `open`/`send` work.
(The HTML spec parses the url argument to a string anyway.)

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `resource-timing/content-type.html` | 0/21 | **16/21** |

Breakdown of the 16 wins: 7 same-origin (image ×2, script, stylesheet, xhr ×2,
iframe), 5 cross-origin **no-cors → ""** (the empty-string expectations), 4
cross-origin **CORS** (image ×2, script, stylesheet — won by the `crossOrigin`→cors
change).

**+16**, zero regressions.

## Caps (the remaining 5 — honest)

- **Cross-origin no-cors XHR (×2, subtests 9/11): timeout.** Obscura's
  `XMLHttpRequest.send` always fetches in **cors** mode, so a cross-origin XHR with
  no `Access-Control-Allow-Origin` is `corsBlocked` → no entry is ever recorded →
  the test waits forever. Fixing this needs XHR to honor a no-cors request mode
  (and even then the entry would be opaque) — a broader XHR-mode change.
- **Cross-origin redirect TAO (subtests 18–20): timeout / wrong value.** "content-type
  should be empty for iframes having cross-origin redirects" — after a cross-origin
  redirect the final URL can be same-origin, so our origin check exposes
  `text/html` where the spec wants `""` because the **redirect chain** crossed
  origins without TAO. Needs real redirect-chain origin/TAO tracking (the standing
  cross-origin-redirect cap shared with `entry-attributes` redirectStart).

## Zero-regression sweep (fresh server)

qsa 1975, classlist 1420, mark.any 22/22, measures 119/119, structured-clone
141/152, getRandomValues 39/39, url-with-xhr 14/14, url-with-fetch 16/16,
buffered-flag 1/1, clear-resource-timings 1/1, status-codes-create-entry 1/1,
initiator-type-for-script 1/1, image-sequence-of-events 3/3, po-observe 5/6 (the 1
fail = the pre-existing `observe({entryTypes:"mark"})` coercion, not this change).

## Next leverage

The `contentType` column now exists for every entry. The biggest standing
resource-timing veins remain the **cross-origin** family (TAO opt-in reading +
redirect-chain origin tracking — would unlock the content-type tails,
`entry-attributes` redirect, and the TAO-* tests) and **synchronous XHR** (a
blocking Rust op — unlocks the buffer-full xhr_sync tails + the no-cors XHR
content-type tails + sync-XHR fetch/encoding paths). Same-origin veins:
css-embedded "css" entries (CSS resource walker), font→css (`document.fonts`).
