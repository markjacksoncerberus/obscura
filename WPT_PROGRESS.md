# WPT Conformance Progress — Campaign Ledger

Tracks the Web Platform Tests we've worked on and their latest pass/total ratios,
measured via `scripts/wpt_run.py` over CDP against a `--features render` server.

**How to reproduce a row:**
```sh
cargo build --release --features render
./target/release/obscura serve --port 9222 --render-mode on-demand --stealth &
.venv/bin/python scripts/wpt_run.py <test-path> --base https://wpt.live
```

Branch: `engine-per-page-threads`. Last updated: 2026-06-18.

## Scoreboard

| Test | Before | Latest | Status | Quest / commit |
|------|:------:|:------:|:------:|----------------|
| `url/url-constructor.any.html` | 1/890 | **847/890** | ⬆️ | URL Grimoire `656e7ea` + cleanup `2c67057`; Quest #04 Inc 2 (path `^`→`%5E`, opaque trailing-space `%20`) + Inc 3 (`///` special-authority slash-skip) |
| `url/url-origin.any.html` | n/a¹ | **403/403** | ✅ 100% | URL Grimoire + cleanup `2c67057` |
| `user-timing/mark.any.html` | 0/22 | **22/22** | ✅ 100% | **Quest #18 The Timekeeper's Ledger.** Real User Timing L3 (was a no-op `performance`): `PerformanceEntry`/`Mark`/`Measure`/`Timing` classes + an entry buffer + `mark`/`measure`/`getEntries`/`getEntriesByName`/`getEntriesByType`/`clearMarks`/`clearMeasures`, `now()` relative to `timeOrigin`, and a minimal EventTarget on `performance` |
| `user-timing/measure-exceptions.html` | ~1 (no-op stub) | **13/13** | ✅ 100% | Quest #18: `measure` resolves PerformanceTiming attribute names (0-valued → `InvalidAccessError`) and treats positional start/end as DOMStrings (number→string→`SyntaxError`); `mark()`/`measure()` no-arg → `TypeError` |
| `user-timing/{mark-errors,mark-measure-return-objects,measure_exceptions_navigation_timing,measure_navigation_timing,user-timing-tojson,measure,mark-measure-feature-detection,invoke_without_parameter}` | 0 / could-not-run | **10/10, 5/5, 4/4, 1/1, 2/2, 1/1, 2/2, 2/2** | ✅ | Quest #18: all built on the real `PerformanceMark`/`PerformanceMeasure` + buffer |
| `user-timing/{clearMarks,clearMeasures,measures}.html` | 0 / could-not-run | **57/57, 57/57, 119/119** | ✅ | **Quest #19 The Load Bell.** These run their tests from `<body onload=onload_test()>` + `setup({explicit_done:true})`; the document `load` event never reached them because `<body onload>` (an HTML *window* event handler) wasn't wired to `window.onload`. Now `__installBodyWindowHandlers()` compiles body/frameset window-reflecting on\* content attributes onto `window.on*` before parser scripts run. **+233** |
| `performance-timeline/{supportedEntryTypes,po-disconnect,po-takeRecords,po-entries-sort,observer-buffered-false,buffered-flag-after-timeout,multiple-buffered-flag-observers}.any.html` | 0 (no-op stub) | **2/2, 3/3, 1/1, 1/1, 1/1, 1/1, 1/1** | ✅ | **Quest #20 The Observer's Gallery.** Real `PerformanceObserver` (was `class{constructor(){} observe(){} disconnect(){}}`): `observe({entryTypes})`/`observe({type,buffered})` w/ InvalidModificationError on mode-mix, `disconnect`/`takeRecords`, `supportedEntryTypes` (frozen `['mark','measure']`), `PerformanceObserverEntryList`, buffered-flag pulls existing entries, task-queued delivery via `_queuePerformanceEntry` from `mark()`/`measure()`. **+10** |
| `performance-timeline/case-sensitivity.any.html` | 0 | **3/3** | ✅ 100% | Quest #20 (observer case-sensitivity) + **Quest #22** (the 2 `resource`-entry subtests now pass: page `<script src>` loads emit `resource` entries) |
| `resource-timing/{buffered-flag.any,clear-resource-timings}.html` | 0 (TIMEOUT / no entries) | **1/1, 1/1** | ✅ | **Quest #22 The Resource Ledger.** `fetch()`/XHR completions emit `PerformanceResourceTiming` entries; page `<script src>` loads emit entries (Rust→JS at load); real `clearResourceTimings()`. **+4** (incl. case-sensitivity +2) |
| `performance-timeline/po-observe.html` | 0/1 (TIMEOUT) | **1/1** | ✅ | **Quest #23 The Element Ledger (inc 1).** Element subresource loads now emit `resource` entries: `<img>`.src (incl. `new Image()`), JS-inserted `<link rel=stylesheet/preload/...>`, `<script src>`, `<object data>`. po-observe needs a `resource` entry from a created+appended `<img>`. |
| `resource-timing/initiator-type/dynamic-insertion.html` | 0/6 (TIMEOUT) | **5/6** | ⬆️ | Quest #23 inc 1: correct `initiatorType` for JS-inserted image/stylesheet(link)/script/iframe + XHR. iframe/XHR fetches carry an internal `_initiatorType` so they report "iframe"/"xmlhttprequest" not "fetch". Last fail = font→"css" (needs `<style>@font-face` + `document.fonts`). |
| `resource-timing/entry-attributes.html` | 0/3 (TIMEOUT) | **1/3** | ⬆️ | Quest #23 inc 1: `load.image` (`new Image()`) now generates a conformant entry. Remaining 2 = font (`document.fonts`) + same-origin redirect timing (collapsed-phase entry has redirectStart=0). |
| `resource-timing/xhr-resource-timing.html` | 0–1 | **1/2** | ⬆️ | Quest #23 inc 1: XHR completion emits an `xmlhttprequest`-initiated `resource` entry. |
| `resource-timing/initiator-type/img.html` | 0/1 | **1/1** | ✅ | **Quest #23 inc 2.** `__startResourceLoads()` markup scan (driven from the Rust load sequence at DCL, like `__startFrameLoads`) loads MARKUP `<img src>`/`<link>`/`<object>` that never travel through the JS appendChild hook. |
| `resource-timing/initiator-type/link.html` | 0/8 | **5/8** | ⬆️ | Quest #23 inc 2: markup `<link rel=stylesheet/prefetch/preload/manifest>` → "link"; `modulepreload` → "other". Remaining 3 = css-embedded resources (`@import`/`url()` → "css", needs a CSS resource walker) — separate. |
| `resource-timing/status-codes-create-entry.html` | 0/1 | **1/1** | ✅ | **Quest #24 The Resolved Reflection.** `img.src`/`script.src` IDL getters now return the RESOLVED absolute URL (URL-reflecting attrs) so `getEntriesByName(img.src)` matches the absolute entry name; page `<script src>` `resource` entries carry the real fetch-elapsed `duration` (was a collapsed 0). |
| `resource-timing/buffer-full-{then-decreased,when-populate-entries,set-to-current-buffer,decrease-buffer-during-callback,increase-buffer-during-callback,store-and-clear-during-callback,add-after-full-event,add-entries-during-callback-that-drop}.html` | 0 (TIMEOUT) | **1/1 ×8** | ✅ | **Quest #25 The Buffer Ledger.** Real Resource Timing buffer: `_addResourceEntry` runs the spec "add a PerformanceResourceTiming entry" algo (primary buffer w/ size limit 250 + secondary buffer); `resourcetimingbufferfull` event + `on…` handler + `fire a buffer full event` task (copy-secondary + overflow guard); `setResourceTimingBufferSize` just sets the limit. **+8** |
| `resource-timing/buffer-full-{add-then-clear,then-increased,add-entries-during-callback,inspect-buffer-during-callback}.html` | 0/1 ×4 (FAIL) | **1/1 ×4** | ✅ | **Quest #25 harvest (post-#28).** These 4 buffer-full tests drive the buffer purely through `load.xhr_sync()`; they were the named xhr_sync cap of #25. With sync XHR landed (#28), the missing piece was that `_sendSync` never recorded a `resource` entry — now it runs the same "add a PerformanceResourceTiming entry" path as the async fetch (initiatorType `xmlhttprequest`). **+4** |
| `resource-timing/content-type.html` | 0/21 | **16/21** | ⬆️ | **Quest #26 The Content-Type Ledger.** New `PerformanceResourceTiming.contentType` (MIME essence of the response Content-Type), exposed for non-opaque responses: same-origin loads + crossorigin (CORS) loads now report it, opaque cross-origin → "". `_loadElementResource` honors the element `crossOrigin` attr → CORS fetch mode (was always no-cors). Also fixed `XMLHttpRequest.open(url)` to coerce a `URL`-object `url` to string (was `url.includes is not a function`). **+16.** Remaining 5 = cross-origin no-cors XHR (our XHR is cors-mode → blocked) + cross-origin redirect TAO (caps) |
| `xhr/data-uri.htm` | 0/10 | **10/10** | ✅ 100% | **Quest #27 The XHR Foundry.** `fetch()` now handles `data:` URLs in-process (reqwest is HTTP-only, so they errored → XHR fired `error`): WHATWG "data: URL processor" (`_processDataURL`) — MIME-type + percent-decode + `;base64` handling; synthesized Response carries `content-type` only (no Content-Length), `HEAD` → empty body |
| `xhr/setrequestheader-bogus-name.htm` | 0/71 | **71/71** | ✅ 100% | Quest #27: real `setRequestHeader` validation (was `_headers[name]=value`). WebIDL ByteString coercion (>0xFF → TypeError), name must be an HTTP token + value a header value → else SyntaxError, value normalized, case-insensitive combine |
| `xhr/setrequestheader-bogus-value.htm` | 0/5 | **5/5** | ✅ 100% | Quest #27: header-value validation (no `\0`/`\r`/`\n` → SyntaxError; non-ByteString → TypeError; omitted value → TypeError) |
| `xhr/open-method-bogus.htm` | 0/8 | **8/8** | ✅ 100% | Quest #27: `open()` method validation — non-token method → SyntaxError; forbidden CONNECT/TRACE/TRACK → SecurityError; byte-uppercase the well-known methods |
| `xhr/headers-normalize-response.htm` | 0/15 | **15/15** | ✅ 100% | **Quest #28 The Synchronous XHR Keystone.** A blocking Rust op (`op_fetch_url_sync`, factored out of `op_fetch_url`'s network core) makes `open(...,false)` + `send()` actually block until the response arrives — safe on `engine-per-page-threads` (only that page's JS thread blocks). Response-header value normalization comes from hyper; a malformed header (null byte) → `NetworkError` DOMException |
| `xhr/{open-method-case-insensitive,open-method-case-sensitive}.htm` | 0/6, 0/9 | **6/6, 9/9** | ✅ 100% | Quest #28: these are sync tests — now the request actually reaches the server with the right (byte-uppercased / preserved) method |
| `xhr/open-method-responsetype-set-sync.htm` | 0/5 | **5/5** | ✅ 100% | Quest #28: `open(...,false)` throws `InvalidAccessError` when `timeout`/`responseType` is set, before any `readystatechange` |
| `xhr/open-url-fragment.htm` | 0/4 | **4/4** | ✅ 100% | Quest #28: sync — fragment stripped from the request URL, reflected back by the server |
| `xhr/response-method.htm` | 1/3 | **3/3** | ✅ 100% | Quest #28: sync GET/POST now read the echoed method synchronously |
| `xhr/{event-readystate-sync-open.any,open-open-sync-send,open-sync-open-send}.html/.htm` | 0/2, 0/1, 0/1 | **2/2, 1/1, 1/1** | ✅ | Quest #28: sync readyState sequencing — a redundant `open()` on an already-OPENED object fires no `readystatechange` (`[1,4]` not `[1,1,4]`) |
| `xhr/{send-sync-no-response-event-load,send-sync-no-response-event-loadend}.htm` | 0/1, 0/1 | **1/1, 1/1** | ✅ | Quest #28: sync `send()` fires `load`/`loadend` as real `ProgressEvent`s (`_fireEvent` now builds ProgressEvents for the progress family) |
| `xhr/send-redirect-infinite-sync.htm` | 0/1 | **1/1** | ✅ | Quest #28: sync redirect-limit handling (core's manual SSRF-revalidated redirect loop, cap 10) |
| `xhr/responseurl.html` | 0/2 | **1/2** | ⬆️ | Quest #28: `responseURL` set synchronously (fragment stripped). Last fail = cross-origin/redirect final-URL (redirect-chain origin tracking, cap) |
| `xhr/send-content-type-charset.htm` | 12/19 | **19/19** | ✅ 100% | **Quest #29 The Entity-Body Forge.** Real WHATWG MIME parse/serialize (`_parseMimeType`/`_serializeMimeType`) + XHR §send() charset adjustment: an author Content-Type's `charset` is set to UTF-8 *only* when the type parses, has a charset, and it isn't already `utf-8` (case-insensitive). Handles param dedup, name-lowercasing, value-case preservation, quoted-string unescaping, invalid-MIME passthrough |
| `xhr/send-content-type-string.htm` | 0/1 | **1/1** | ✅ 100% | Quest #29: a string body derives `text/plain;charset=UTF-8` (was `String(body)` with no Content-Type) |
| `xhr/{send-entity-body-get-head,send-entity-body-get-head-async}.htm` | 0/2, 0/2 | **2/2, 2/2** | ✅ | Quest #29: GET/HEAD discard `send()`'s body argument (no entity body sent) |
| `xhr/{send-entity-body-none,send-entity-body-empty}.htm` | 2/6, 1/3 | **6/6, 3/3** | ✅ | Quest #29: a null/empty body on POST/PUT still emits `Content-Length: 0` (set explicitly in the op — h2 omits it for an empty body) |
| `xhr/setrequestheader-content-type.htm` | 3/34 | **4/34** | ⬆️ | Quest #29: every body type now derives the correct Content-Type **value** (String/Document/Blob/BufferSource/FormData/URLSearchParams — verified by the failure messages). The remaining 30 are **capped on the request header NAME case** (the server echoes `content-type` lowercased; hyper/`http` lowercases request header names — same cap as `setrequestheader-allow-empty-value`) |
| `performance-timeline/idlharness.any.html` | 31/58 | **35/58** | ⬆️ | Quest #20: `PerformanceObserver`/`PerformanceObserverEntryList` `Symbol.toStringTag`, non-enumerable interface objects, EntryList WebIDL length 0. Remaining = engine-wide non-enumerable class methods + navigation/resource members |
| `navigation-timing/{nav2-test-attributes-exist,nav2-test-instance-accessible-from-the-start,nav2-test-navigation-type-navigate,po-navigation,buffered-flag.window}.html` | 0 | **1/1 ×5** | ✅ | **Quest #21 The Navigator's Almanac.** A real `PerformanceNavigationTiming` entry (entryType "navigation", from the start in `getEntriesByType('navigation')`, queued to observers at load) + `PerformanceResourceTiming` base class. **+5** |
| `navigation-timing/{test-navigation-attributes-exist,test-navigation-redirectCount-none}.html` | 0 | **4/4, 5/5** | ✅ | Quest #21: legacy `performance.navigation` (type/redirectCount) namespace verified |
| `navigation-timing/test-document-onload.html` | 0/2 (no body sizes) | **3/3** | ✅ | Quest #21: honest `encoded/decoded/transferSize` plumbed from the real Rust document response (`document_body_size`) into the nav entry at the `<ready-state>` step |
| `navigation-timing/test-document-readiness-exist.html` | 1/3 | **3/3** | ✅ | Quest #21: `readystatechange` now dispatched on `document` (+ `document.onreadystatechange`) at interactive (DCL) and complete (load) |
| `navigation-timing/idlharness.window.html` | (n/a, interfaces absent) | **36/161** | ⬆️ | Quest #21: `PerformanceNavigationTiming`/`PerformanceResourceTiming` interface objects now exist. Remaining = engine-wide non-enumerable class methods + unimplemented members |
| `hr-time/basic.any.html` | 4/5 | **5/5** | ✅ 100% | Quest #18: `performance` is now an EventTarget (addEventListener/dispatchEvent) |
| `hr-time/performance-tojson.html` | 0/1 | **1/1** | ✅ 100% | Quest #18: `performance.toJSON()` + `PerformanceTiming.toJSON()` (full attribute set) |
| `WebCryptoAPI/getRandomValues.any.html` | 23/39 | **39/39** | ✅ 100% | **Quest #17 The Entropy Gate.** Real `crypto.getRandomValues` semantics (was a `Math.random` fill with no contract): non-`ArrayBufferView`→TypeError, Float16/Float32/DataView→`TypeMismatchError`, `byteLength>65536`→`QuotaExceededError`, else fill bytes via a `Uint8Array` view (so BigInt64/BigUint64 arrays fill without "Cannot convert to BigInt") + return same view. Added `TypeMismatchError:17` to `DOMException._codes` + the modern `QuotaExceededError` interface (DOMException subclass w/ nullable `quota`/`requested`). `randomUUID` already 3/3 |
| `html/webappapis/structured-clone/structured-clone.any.html` | 29/152 | **141/152** | ⬆️ 93% | **Quest #16 The Clone Forge.** Real WHATWG StructuredSerialize/Deserialize (replaced the `JSON.parse(JSON.stringify)` footgun): `memory` Map for cycles/identity, brand dispatch over primitives/BigInt/boxed/Date/RegExp/Error-family/ArrayBuffer+TypedArrays+DataView/Map/Set/Blob/File, DataCloneError for symbols·functions·non-serializable platform objects (Response/Request)·SAB, ArrayBuffer transfer (V8 `.transfer()`/`.detached`) + `crossOriginIsolated=false`. 10 left = engine gaps (FileList iface, OOB-TypedArray detection, real MessagePort/ImageBitmap/OffscreenCanvas transferables) |
| `dom/nodes/ParentNode-querySelector-All.html` | 1396/1977 | **1975/1975** | ✅ 100% | **Quest #01 SECURED.** `namespaceURI` + foreign-ns `createElementNS`; `::slotted()` parse-but-never-match; iframe docs preserve `<html>/<head>/<body>` attrs; `:link` only `a`/`area`; real `:target` (URL-fragment id); real `NodeList` (`extends Array`, species→Array); `:root` matches a real document's root but not a fragment's child (Rust `real_documents` set) |
| `dom/nodes/Document-createElement.html` | 0/147 | **147/147** | ✅ 100% | Quest #05: WebIDL coercion + InvalidCharacterError validation + ASCII-only casing + real `namespaceURI`/`prefix`; XML-document iframes (case-sensitive createElement, parsed-root documentElement) + iframes-delay-parent-load |
| `dom/nodes/Element-classlist.html` | ~0 | **1420/1420** | ✅ 100% | **Quest #03 SECURED.** Real DOMTokenList + eager mutation drain (synchronous `takeRecords()` sees the record; `replace()` mutation-count) + `_write` skips materializing an empty attr when absent (`remove()` keeps null class null) + `replace()` empty-before-whitespace token validation |
| `dom/nodes/MutationObserver-childList.html` | 26/38 | **31/38** | ⬆️ | bonus: eager `__notifyMutation` drain (synchronous `takeRecords`) |
| `dom/nodes/MutationObserver-takeRecords.html` | 1/3 | **3/3** | ✅ 100% | ″ |
| `dom/nodes/MutationObserver-disconnect.html` | 1/2 | **2/2** | ✅ 100% | ″ |
| `dom/lists/DOMTokenList-value.html` | 0/1 | **1/1** | ✅ | ″ |
| `dom/lists/DOMTokenList-iteration.html` | 0/6 | **5/6** | ⬆️ | ″ |
| `dom/lists/DOMTokenList-coverage-for-attributes.html` | n/a | **150/175** | ⬆️ | ″ |
| `dom/nodes/attributes.html` | 4/67 | **67/67** | ✅ 100% | Quest #02: real `Attr` node + `NamedNodeMap` + namespace-aware Rust storage/ops + get/setAttributeNode(NS) + createAttribute(NS) + validate-and-extract + style-attr reflection |
| `dom/nodes/Element-getElementsByClassName.html` | 1/3 | **3/3** | ✅ 100% | Quest #11: live `HTMLCollection` + Rust class-match op |
| `dom/nodes/Element-children.html` | 0/2 | **2/2** | ✅ 100% | Quest #11: `.children` → live `HTMLCollection` (named props, single-pass tree order) |
| `dom/collections/HTMLCollection-empty-name.html` | 0/7 | **7/7** | ✅ 100% | Quest #11: empty-name guard in named access |
| `dom/nodes/Element-getElementsByTagName.html` | 4/19 | **19/19** | ✅ 100% | Quest #11: `HTMLCollection` + spec tag-match + real foreign-ns `createElementNS` |
| `dom/nodes/Document-getElementsByTagName.html` | 3/18 | **18/18** | ✅ 100% | Quest #11 ″ |
| `dom/nodes/Element-getElementsByTagNameNS.html` | 0/16 | **16/16** | ✅ 100% | Quest #11: `get_elements_by_tag_name_ns` op + foreign-ns elements |
| `dom/nodes/Document-createElementNS.html` | 85/596 | **596/596** | ✅ 100% | Quest #11: real `create_element_ns` op + validate-and-extract + case-preserved `localName`/`tagName`/`nodeName`/`prefix` + real `HTMLElement`/`HTMLUnknownElement`/`HTMLSpanElement` hierarchy (ns-aware class) |
| `dom/nodes/Element-tagName.html` | 3/6 | **6/6** | ✅ 100% | Quest #11 + **#14 Inc 2** (real XML `DOMParser` closed the last subtest); case-preserved tagName + `importNode` clones into the target document |
| `dom/nodes/Node-lookupNamespaceURI.html` | 0/75 | **75/75** | ✅ 100% | Quest #06: `lookupNamespaceURI`/`lookupPrefix`/`isDefaultNamespace` (locate-a-namespace walk; element own-ns before xmlns attrs; `xml`/`xmlns` built-ins; Attr delegates to owner) |
| `dom/nodes/Node-replaceChild.html` | 5/29 | **29/29** | ✅ 100% | Quest #06: full DOM "replace" algorithm (pre-replacement validity + Document doctype/element constraints + reference-child adjacency); last subtest (cross-document doctype replace) closed by the doctype `ownerDocument`/adoption fix |
| `dom/nodes/Node-normalize.html` | 0/4 | **4/4** | ✅ 100% | Quest #06 + **#14 Inc 2** (real XML `DOMParser` closed the last subtest — XML doc + CDATA); real `normalize()` (drop empty exclusive Text; absorb contiguous Text siblings; CDATASection skipped via nodeType) |
| `dom/nodes/Node-isEqualNode.html` | 4/9 | **9/9** | ✅ 100% | Quest #06: spec per-interface `isEqualNode` (DocumentType name/publicId/systemId; Element ns/prefix/localName + attr-set equality by ns+localName+value ignoring prefix; PI target/data; Text/Comment data; deep child recursion) + `createDocument(xhtml-ns)`→`application/xhtml+xml` so its `createElement` yields HTML-ns elements |
| `dom/nodes/Node-baseURI.html` | 0/9 | **9/9** | ✅ 100% | Quest #06: `Node`/`Attr` `baseURI` via HTML "document base URL" (first `<base href>` resolved against the doc URL, else the doc URL); a document node is its own node document |
| `dom/nodes/Node-properties.html` | 710/726 | **726/726** | ✅ 100% | Quest #06: `nodeValue` covers PI(7)/CDATA(4); `textContent` null for Document(9)/DocumentType(10) (getter + no-op setter); `charset`/`inputEncoding` alias `characterSet`; `DocumentType.ownerDocument` honors its real node document |
| `dom/traversal/TreeWalker.html` | 300/761 | **761/761** | ✅ 100% | Quest #10: real spec TreeWalker (REJECT/SKIP) + node identity `828ee41`/`070ab6f` |
| `dom/traversal/NodeIterator.html` | 1/766 | **766/766** | ✅ 100% | Quest #10: real NodeIterator (was a TreeWalker alias) `070ab6f` |
| `dom/traversal/NodeIterator-removal.html` | 0/23 | **23/23** | ✅ 100% | Quest #10: pre-removing steps + live-iterator registry `1f7a428` |
| `dom/traversal/{reject,skip,skip-most,acceptNode,basic,currentNode,...}` | mixed | **all green** | ✅ | Quest #10 |
| `dom/ranges/Range-comparePoint.html` | 0/5580 | **5518/5580** | ⬆️ | Quest #10: real Range + boundary-point compare `828ee41` (rest = CDATA-in-HTML fixture) |
| `dom/ranges/Range-set.html` | 0/10920 | **10838/10920** | ⬆️ | Quest #10: real setStart/End + doctype identity (un-hung the test) `828ee41` |
| `dom/ranges/Range-compareBoundaryPoints.html` | 0/9313 | **8665/9313** | ⬆️ | Quest #10: compareBoundaryPoints + `how` unsigned-short coercion `828ee41` |
| `dom/ranges/Range-isPointInRange.html` | 0/5733 | **5521/5733** | ⬆️ | Quest #10 `828ee41` |
| `dom/ranges/Range-intersectsNode.html` | 0/2356 | **2356/2356** | ✅ 100% | Quest #10 `828ee41` |
| `dom/ranges/Range-stringifier.html` | 0/5 | **5/5** | ✅ 100% | Quest #10: Range.toString `828ee41` |
| `dom/ranges/Range-{selectNode,collapse,cloneRange,commonAncestorContainer,constructor,attributes,detach}` | stub | **96–100%** | ⬆️ | Quest #10 `828ee41` |
| `dom/nodes/Node-compareDocumentPosition.html` | n/a | **1444/1444** | ✅ 100% | Quest #10: real compareDocumentPosition + DOCUMENT_POSITION_* consts `828ee41` |
| `dom/ranges/Range-insertNode.html` | 0/1840 | **1531/1840** | ⬆️ | Quest #12: real per-iframe JS realms + node-backed iframe doc; +200 spec pre-insertion-validity run BEFORE the text split; +422 from a **live `DetachedDocument.doctype`** getter (scan children, not a stale cache) so the test's appended doctype shows up in the tree comparison |
| `dom/ranges/Range-surroundContents.html` | 0/1840 | **1247/1840** | ⬆️ | Quest #12 ″; +549 from the same live `doctype` getter |
| `dom/ranges/Range-cloneContents.html` | 0/187 | **177/187** | ⬆️ | Quest #12 ″ |
| `dom/ranges/Range-deleteContents.html` | 0/125 | **103/125** | ⬆️ | Quest #12 ″ |
| `dom/ranges/Range-extractContents.html` | 0/187 | **159/187** | ⬆️ | Quest #12 ″ (+2046 content-op subtests total, from 0) |
| `url/url-setters.any.html` | 5/279 | **241/279** | ⬆️ | Setters' Sigil + Quest #04 Inc 1 (userinfo no-strip, hostname `:` reject, port whitespace) + Inc 2 (path `^`, opaque trailing-space) |
| `url/url-setters-stripping.any.html` | 224/260 | **260/260** | ✅ 100% | **Quest #04 Increment 1.** userinfo (username/password) setters percent-encode tab/LF/CR (`%09`/`%0A`/`%0D`) instead of stripping — strip moved per-part into `apply_url_setter` |
| `url/url-statics-parse.any.html` | 0/8 | **8/8** | ✅ 100% | **Quest #04 Increment 1.** `URL.parse`/`URL.canParse` statics (parse→URL\|null, never throws) |
| `url/url-searchparams.any.html` | 1/4 | **4/4** | ✅ 100% | Real URLSearchParams (form codec + URL two-way sync) |
| `url/urlsearchparams-sort.any.html` | n/a | **17/17** | ✅ 100% | ″ |
| `url/urlsearchparams-stringifier.any.html` | n/a | **14/14** | ✅ 100% | ″ |
| `url/urlsearchparams-foreach.any.html` | 2/6 | **6/6** | ✅ 100% | live (index) iteration |
| `url/urlsearchparams-{append,set,getall,has}.any.html` | n/a | **4/4, 2/2, 2/2, 4/4** | ✅ | ″ |
| `url/urlsearchparams-constructor.any.html` | n/a | **22/27** | ⬆️ | ″ + FormData iterator |
| `url/urlsearchparams-delete.any.html` | n/a | **6/8** | ⬆️ | (data: opaque trailing-space cases remain) |
| `html/.../the-iframe-element/srcdoc_process_attributes.html` | 0/3 | **3/3** | ✅ | blob: src `cf483fe` + reprocessing `609cdd4` |
| `html/.../the-iframe-element/srcdoc-attribute-reset.html` | 0/1 | **1/1** | ✅ | named-window `6822deb` + reprocessing `609cdd4` |
| `html/.../the-iframe-element/iframe-load-event.html` | 0/2 | **2/2** | ✅ | load-on-insertion `229ff83` |
| `html/.../the-iframe-element/content_document_changes_only_after_load_matures.html` | 1/1 | **1/1** | ✅ | held (gen-guard `229ff83`) |
| `dom/nodes/Node-appendChild.html` | 1/11² | **11/11** | ✅ | iframe increments 1–3 (prior) |
| `dom/events/EventListener-handleEvent.html` | 1/6² | **6/6** | ✅ | spec dispatch (prior) |
| `dom/events/Event-subclasses-constructors.html` | 10/49 | **49/49** | ✅ 100% | **Quest #07.** Event-class hierarchy: UIEvent (view/detail) → Mouse/Keyboard/Focus/Composition/Input; null-options → empty dict; `view` type-check |
| `dom/events/EventTarget-dispatchEvent.html` | 4/25 | **25/25** | ✅ 100% | **Quest #07.** WebIDL TypeError on non-Event; `_initialized` flag → InvalidStateError; spec dispatch |
| `dom/events/Event-cancelBubble.html` | 0/8 | **8/8** | ✅ 100% | **Quest #07.** `cancelBubble` get/set + spec capturing/bubbling |
| `dom/events/Event-returnValue.html` | 0/7 | **7/7** | ✅ 100% | **Quest #07.** `returnValue` get/set |
| `dom/events/Event-propagation.html` | 4/7 | **7/7** | ✅ 100% | **Quest #07.** dispatch clears stop-flags on completion |
| `dom/events/Event-initEvent.html` | 11/12 | **12/12** | ✅ 100% | **Quest #07.** mandatory-arg TypeError |
| `dom/events/Event-constants.html` | 0/4 | **4/4** | ✅ 100% | **Quest #07.** eventPhase NONE/CAPTURING/AT_TARGET/BUBBLING constants |
| `dom/events/CustomEvent.html` | 1/3 | **3/3** | ✅ 100% | **Quest #07.** `detail` defaults null; initCustomEvent mandatory-arg |
| `dom/events/EventListenerOptions-capture.html` | 2/4 | **4/4** | ✅ 100% | **Quest #07.** flatten options (read getters) before null-callback check; non-dict opts → capture bool |
| `dom/events/Event-type.html` / `Event-type-empty.html` | — | **3/3, 2/2** | ✅ | **Quest #07.** `type` String-coercion |
| `dom/events/Event-stopPropagation-cancel-bubbling.html` | 0/1 | **1/1** | ✅ | **Quest #07.** legacy `window.event` set during dispatch |
| `dom/events/Event-dispatch-{order,order-at-target,omitted-capture,propagation-stopped,bubble-canceled,handlers-changed,reenter,target-removed,target-moved,multiple-stopPropagation,multiple-cancelBubble}.html` | mostly 0/1 | **all 1/1** | ✅ | **Quest #07.** capturing→target→bubbling path to window |
| `dom/events/Event-dispatch-detached-click.html` / `Event-defaultPrevented-after-dispatch.html` / `EventTarget-this-of-listener.html` / `Event-stopImmediatePropagation.html` / `EventTarget-dispatchEvent-returnvalue.html` | — | **2/2, 2/2, 6/6, 1/1, 2/2** | ✅ | **Quest #07.** |
| `dom/events/Event-dispatch-redispatch.html` | 2/4 | **3/4** | ⬆️ | **Quest #07.** trusted DOMContentLoaded/load; public dispatch clears isTrusted (last fail = synthetic click) |
| `encoding/api-invalid-label.any.html` | 0/3421 | **3421/3421** | ✅ 100% | **Quest #08.** WHATWG label table + RangeError on unknown/replacement labels |
| `encoding/textdecoder-labels.any.html` | 0/222 | **222/222** | ✅ 100% | **Quest #08.** label→name normalization (trim ASCII ws, lowercase) |
| `encoding/textdecoder-fatal.any.html` | 0/36 | **36/36** | ✅ 100% | **Quest #08.** WHATWG utf-8 decoder, per-byte bounds, fatal→TypeError |
| `encoding/textdecoder-streaming.any.html` | n/a | **32/32** | ✅ 100% | **Quest #08.** stateful streaming decoder (`{stream:true}` + flush) |
| `encoding/encodeInto.any.html` | 44/111 | **110/111** | ⬆️ | **Quest #08.** code-point-aware encodeInto + lone-surrogate→U+FFFD |
| `encoding/textencoder-constructor-non-utf.any.html` | 54/79 | **79/79** | ✅ 100% | **Quest #08.** |
| `encoding/{api-basics,textdecoder-arguments,textdecoder-ignorebom,textdecoder-byte-order-marks,textdecoder-utf16-surrogates,api-surrogates-utf8,textdecoder-fatal-streaming,textencoder-utf16-surrogates}.any.html` | mixed/low | **all 100%** | ✅ | **Quest #08.** utf-8/utf-16le/utf-16be/windows-1252 decode, BOM, fatal |
| `encoding/textdecoder-fatal-single-byte.any.html` (8 variants) | ~half | **7168/7168** | ✅ 100% | **Quest #08b.** every byte × every single-byte encoding (ISO-8859-*, KOI8, windows-125x, …) via `encoding_rs` Rust op |
| `encoding/legacy-mb-schinese/gb18030/gb18030-decoder.any.html` | best-effort | **275/275** | ✅ 100% | **Quest #08b.** gb18030/gbk via `encoding_rs` op |
| `encoding/legacy-mb-schinese/gbk/gbk-decoder.any.html` | best-effort | **82/82** | ✅ 100% | **Quest #08b.** |
| `encoding/iso-2022-jp-decoder.any.html` | best-effort | **34/34** | ✅ 100% | **Quest #08b.** stateful ISO-2022-JP via `encoding_rs` op |
| `encoding/textdecoder-eof.any.html` | 1/2 | **2/2** | ✅ 100% | **Quest #08b.** legacy streaming via whole-buffer re-decode + suffix diff (Big5 `stream:true`) |
| `encoding/textdecoder-mistakes.any.html` | 83/87 | **86/87** | ⬆️ | **Quest #08b.** ASCII-only label lowercasing (U+212A KELVIN no longer folds to 'k') + utf-16 EOF coalesces pending lead-surrogate/odd-byte into ONE U+FFFD; tail = iso-2022-jp fatal-stream state |
| `html/webappapis/atob/base64.any.html` | 164/380 | **380/380** | ✅ 100% | **Quest #15 (Base64 Cipher).** Real HTML-spec base64 over a BYTE string (the old `btoa` UTF-8-encoded via TextEncoder → `btoa("\x80")` gave `woA=` not `gA==`); `btoa` throws InvalidCharacterError on code units >0xFF; `atob` = WHATWG forgiving-base64 decode (strip ASCII ws, ≤2 trailing `=`, length/junk → InvalidCharacterError) |
| `FileAPI/url/url-format.any.html` | 3/6 | **6/6** | ✅ 100% | **Quest #09b.** blob: URL = `blob:{origin}/{uuid-v4}` |
| `FileAPI/url/url-with-fetch.any.html` | 1/16 | **16/16** | ✅ 100% | **Quest #09b.** byte-backed blob store; fragment-strip, GET-only, reject (TypeError) on revoked/query/path; Request snapshots blob at construction |
| `FileAPI/url/url-with-xhr.any.html` | ~0/14 | **14/14** | ✅ 100% | **Quest #09b.** same store via XHR→fetch; XHR `open()` snapshots blob; catch path now fires `onreadystatechange` (was a hang) + statusText 'OK' |
| `FileAPI/blob/Blob-constructor.any.html` | 36/73 | **69/73** | ⬆️ | **Quest #09.** byte-backed Blob; WebIDL sequence/dict guards; type normalization |
| `FileAPI/blob/Blob-slice.any.html` | 60/150 | **144/150** | ⬆️ | **Quest #09.** spec slice (relative start/end, contentType) |
| `FileAPI/blob/{Blob-array-buffer,Blob-text,Blob-bytes,Blob-constructor-endings}` | low | **all 100%** | ✅ | **Quest #09.** arrayBuffer()/text()/bytes(); native-EOL endings |
| `FileAPI/file/File-constructor.any.html` | 23/51 | **49/51** | ⬆️ | **Quest #09.** File extends Blob; name/lastModified; arg validation |
| `FileAPI/reading-data-section/{readAsText,readAsArrayBuffer,readAsDataURL,readAsBinaryString,FileReader-multiple-reads,filereader_events,filereader_abort,FileReader-event-handler-attributes}` | low | **all 100%** | ✅ | **Quest #09.** real FileReader: async reads, ProgressEvent, on* handler attrs, abort |
| `FileAPI/reading-data-section/filereader_result.any.html` | 0/12 | **8/12** | ⬆️ | **Quest #09.** result/readyState semantics (4 left = event-loop microtask-drain timing) |

| `domparsing/DOMParser-parseFromString-html.html` | 4/10 | **9/10** | ⬆️ | **Quest #14 Inc 1.** Real `DOMParser.parseFromString('text/html')` → detached HTML doc (was a stub returning the live `document`!) + `compatMode` (DOCTYPE→CSS1Compat else BackCompat) + invalid-type TypeError; last = scripting-disabled noscript parse |
| `domparsing/DOMParser-parseFromString-xml.html` | 0/20 | **20/20** | ✅ 100% | **Quest #14 Inc 2.** Real namespace-aware XML parser (`_parseXMLDocument`, hand-rolled — NOT html5ever/xml5ever) building the tree via `createElementNS`/`setAttributeNS`; xmlns scope resolution; non-well-formed → Gecko `parsererror` doc; `XMLDocument` global defined so DOMParser returns a plain Document (not XMLDocument) |
| `domparsing/XMLSerializer-serializeToString.html` | 1/29 | **27/29** | ⬆️ | **Quest #14 Inc 2.** W3C XML serialization algorithm (namespace prefix map, generate-a-prefix, xmlns reset/redundancy, nearest-prefix selection, attr escaping, `<div/>` self-close vs HTML `<div></div>`); + `new DocumentFragment()` ctor footgun fix + DocumentFragment `append`/`prepend`. 2 left = XLink-prefix (Chrome-specific) + `xmlns=""` spec-issue (mutually exclusive with the redundant-xmlns subtest) |

¹ url-origin was never measured under the old regex URL parser (would have been low). ² baseline from earlier sessions, logged for context.

## Open quests (measured, not yet tackled)

| Test | Latest | Next move |
|------|:------:|-----------|
| `url/url-setters.any.html` (remaining) | 188/279 | The remaining ~91 are host/port special-scheme edge cases + finer setter-rejection nuances (not searchParams). |
| `url/urlsearchparams-foreach.any.html` | 2/6 | forEach must observe live list mutations during iteration (spec re-indexing), not a snapshot. |

## Regression baselines (touched-adjacent, watched for regressions)

| Test | Latest | Notes |
|------|:------:|-------|
| `dom/nodes/Node-cloneNode.html` | 103/135 | 99→101 (Quest #02 ns-aware attr copy) → 103 (Quest #11 foreign-element + importNode clone). |
| `dom/nodes/Node-isConnected.html` | 1/2 | Pre-existing gap, unchanged. |
| `dom/nodes/Document-getElementById.html` | 4/18 | Pre-existing getElementById edge cases. |
| `dom/nodes/Node-insertBefore.html` | ⚠️ timeout | Heavy test; separate perf issue (not a correctness regression). |

## Known hard swamps (left as-is — diminishing returns / high risk)

- **url-constructor remaining ~57 fails**: deep `url`-crate-vs-WHATWG divergences —
  ~39 `file:` scheme arcana (Windows drive letters `w|`→`w:`, backslash/slash
  normalization, `file:////` empty host), non-special-path whitespace `%20`
  encoding, and path-only-with-slashes inputs (`<///test>`) the `url` crate rejects.
- A proper fix path would be a more spec-aligned URL parser; chasing these risks
  the 833 that already pass.
