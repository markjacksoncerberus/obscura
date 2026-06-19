# 🏰 The Quest Board — Web Platform Conformance Campaign

> *Hear ye! These scrolls chart every unconquered realm of the Web Platform Tests
> still standing between Obscura and a kingdom safe for all AI-agent travellers.
> Each scroll names a region, its current hold, the beasts within, and a battle
> plan. Choose thy banner.*

Measured via `scripts/wpt_run.py` over CDP against a `--features render` server.
Live scoreboard of conquered lands: [`../WPT_PROGRESS.md`](../WPT_PROGRESS.md).

> 🤝 **New here?** Start with [`AGENT-HANDOFF.md`](AGENT-HANDOFF.md) — the dev loop,
> hard-won gotchas, architecture map, and concrete next moves.

---

## ⚔️ Open Quests

| # | Scroll | Realm | Hold | Difficulty | Bounty |
|---|--------|-------|:----:|:----------:|:------:|
| ~~01~~ | ✅ [The Selector Sorcery](01-the-selector-sorcery.md) | `dom/nodes/ParentNode-querySelector-All` | **1975/1975** | ⚔️⚔️ | **SECURED 100%** |
| ~~02~~ | ✅ [The Attr-Node Codex](02-the-attr-node-codex.md) | `dom/nodes/attributes` | **67/67** | ⚔️⚔️⚔️ | **SECURED** |
| ~~03~~ | ✅ [The ClassList Mutation-Echo](03-the-classlist-mutation-echo.md) | `dom/nodes/Element-classlist` | **1420/1420** | ⚔️⚔️ | **SECURED 100%** |
| 04 | [The URL Swamps](04-the-url-swamps.md) | `url/url-constructor`, `url/url-setters` | ⚔️ stripping **260/260** + statics **8/8** DONE; constructor 847, setters 241 | ⚔️⚔️⚔️ | Inc 1–3: **+73** (userinfo no-strip, statics, hostname/port, path `^`, opaque-space, `///` slash-skip); remaining = rust-url-vs-WHATWG `file:`/empty-host/`/.` divergences (real WHATWG parser is the keystone) |
| ~~05~~ | ✅ [The Element Forge](05-the-element-forge.md) | `dom/nodes/Document-createElement` | **147/147** | ⚔️⚔️⚔️ | **SECURED** |
| 06 | [The Node-Smithing Vaults](06-the-node-smithing-vaults.md) | `dom/nodes/Node-*` | mixed | ⚔️⚔️ | ~150 |
| 07 | [The Event Amphitheater](07-the-event-amphitheater.md) | `dom/events/*` | ⚔️ spec dispatch **DONE**; core 100% | ⚔️⚔️ | +110 this session (capturing/bubbling, event classes, trusted); tails = heavy cloneNode fixtures + synthetic-click |
| 08 | [The Encoding Cipher](08-the-encoding-cipher.md) | `encoding/*` | ⚔️ TextEncoder/Decoder + **legacy encodings DONE** (~7800) | ⚔️⚔️ | #08b: +3900 (all single-byte + gb18030/gbk/big5/euc/sjis/iso-2022-jp via `encoding_rs` op); tails = SAB, utf-16-truncated, iso-2022-jp fatal-stream state |
| 09 | [The FileAPI Vault](09-the-fileapi-vault.md) | `FileAPI/*` | ⚔️ Blob/File/FileReader + **blob: URL store DONE** (~365) | ⚔️⚔️ | #09b: +34 (blob:{origin}/{uuid}, byte store, fetch/XHR/Request snapshot); tails = element-toString, SAB, url-reload/in-tags (navigation), FileList |
| 10 | [The Traversal Labyrinth](10-the-traversal-labyrinth.md) | `dom/ranges`, `dom/traversal` | ⚔️ traversal **DONE**; ranges 90%+ | ⚔️⚔️⚔️ | iframe content-ops left |
| ~~11~~ | ✅ [The Collections Armory](11-the-collections-armory.md) | `dom/collections`, getElementsBy* | **getElementsBy\* all 100%** | ⚔️⚔️ | **SECURED** |
| 12 | [The Iframe Frontier](12-the-iframe-frontier.md) | `dom/ranges` content-ops (per-iframe realms) | ⚔️ insertNode **1531**, surround **1247** | ⚔️⚔️⚔️ | +1171 this session (validity + live doctype); tails = doctype-order + range-setup IndexSizeError |
| ~~13~~ | ✅ [The Harness Gates](13-the-harness-gates.md) | *meta* — could-not-run / no-results | **SECURED** | ⚔️⚔️ | unlocked #10 |
| ~~18~~ | ✅ [The Timekeeper's Ledger](18-the-timekeepers-ledger.md) | `user-timing/*`, `hr-time/*` | **mark 22/22 + realm** | ⚔️⚔️ | **SECURED** — real User Timing L3 (was a no-op `performance`): mark/measure/getEntries/clear + PerformanceEntry/Mark/Measure/Timing + ~70 realm subtests. Caps: obsolete L1/L2 `mark(timingAttr)`-throws subtests; `<body onload>` load-event gap |
| ~~17~~ | ✅ [The Entropy Gate](17-the-entropy-gate.md) | `WebCryptoAPI/getRandomValues` | **39/39** | ⚔️ | **SECURED 100%** — real `crypto.getRandomValues` contract (was a `Math.random` fill @ 23/39); **+16**. Added `TypeMismatchError:17` to `DOMException._codes` + the modern `QuotaExceededError` interface |
| ~~16~~ | ✅ [The Clone Forge](16-the-clone-forge.md) | `html/webappapis/structured-clone` | **141/152** | ⚔️⚔️ | **SECURED 93%** — real structuredClone (was a `JSON` stub @ 29/152); **+112**. 10 left are engine gaps (FileList/MessagePort/ImageBitmap/OffscreenCanvas/OOB-TA) |
| 23 | [The Element Ledger](23-the-element-ledger.md) | `resource-timing/*` element loads (+ perf-timeline) | ⚔️ po-observe 1/1, dynamic-insertion 5/6, img 1/1, link 5/8 | ⚔️⚔️ | **inc 1+2 ~+16.** Element subresource loads (`<img>`, `<link>`, `<script>`, `<object>` — both JS-inserted AND markup) emit `resource` entries + fire load/error; iframe/XHR report correct initiatorType. Next: css-embedded "css" entries, `img.src` resolved-URL reflection, font→css, redirect timing, buffer-full |
| ~~24~~ | ✅ [The Resolved Reflection](24-the-resolved-reflection.md) | `resource-timing/status-codes-create-entry` (+ `getEntriesByName(el.src)` family) | **status-codes 0→1/1** | ⚔️ | **SECURED — +1, foundational.** URL-reflecting IDL getters (`img/script/iframe.src`, `a/link/area.href`) now return the RESOLVED absolute URL (was the raw attribute), so `getEntriesByName(img.src)` matches the absolute entry name. Page `<script src>` `resource` entries carry the real fetch-elapsed `duration` (was a collapsed 0). Scoped tight (per-localName sets), zero regressions. Caps: TAO/cross-origin family, `<base>`-loader divergence |
| ~~26~~ | ✅ [The Content-Type Ledger](26-the-content-type-ledger.md) | `resource-timing/content-type` | **0→16/21** | ⚔️ | **SECURED — +16.** New `PerformanceResourceTiming.contentType` (MIME essence of the response Content-Type), exposed for non-opaque responses (same-origin + crossorigin CORS loads; opaque cross-origin → ""). `_loadElementResource` now honors the element `crossOrigin` attr → CORS fetch mode. Bug fix: `XMLHttpRequest.open(url)` coerces a `URL`-object url to string (was `url.includes is not a function`). Caps: cross-origin no-cors XHR (our XHR is cors-mode → blocked) + cross-origin redirect TAO |
| ~~25~~ | ✅ [The Buffer Ledger](25-the-buffer-ledger.md) | `resource-timing/buffer-full-*` | **12 tests 0→1/1** | ⚔️⚔️ | **SECURED — +8, then +4 harvest (post-#28).** Real Resource Timing buffer (was unbounded, no event): primary buffer w/ size limit 250 + secondary buffer; `resourcetimingbufferfull` event + `onresourcetimingbufferfull` handler + the "fire a buffer full event" task (copy-secondary-buffer + no-progress overflow guard); `setResourceTimingBufferSize`/`clearResourceTimings` per spec. **Harvest:** the ×4 `xhr_sync`-ordering tails (add-then-clear, then-increased, add-entries-during-callback, inspect-buffer-during-callback) — capped on #25 because sync XHR didn't exist — turned green once `_sendSync` was taught to record a `resource` entry (#28 landed sync XHR; this added the entry). Zero regressions. Cap left: `buffer-full-eventually` times out (250 sequential network loads exceed harness wall-clock) |
| ~~22~~ | ✅ [The Resource Ledger](22-the-resource-ledger.md) | `resource-timing/*` (+ perf-timeline) | **buffered-flag 1/1, clear-resource-timings 1/1, case-sensitivity 3/3** | ⚔️⚔️ | **SECURED — +4.** `PerformanceResourceTiming` entries for `fetch()`/XHR + page `<script src>` loads; real `clearResourceTimings`. Caps: element loads (img/link/iframe), TAO cross-origin, buffer-full family |
| ~~21~~ | ✅ [The Navigator's Almanac](21-the-navigators-almanac.md) | `navigation-timing/*` | **~20 subtests across 9 tests** | ⚔️⚔️ | **SECURED — ~+20.** Real `PerformanceNavigationTiming` (+ `PerformanceResourceTiming` base): nav entry present from the start, queued to observers at load; honest body sizes from the Rust response; `readystatechange` at interactive/complete. Caps: exact-byte-size/host-URL value tests, per-iframe nav timing, real redirect-chain timing |
| ~~20~~ | ✅ [The Observer's Gallery](20-the-observers-gallery.md) | `performance-timeline/*` | **PO suite 11/11 + idl 35/58** | ⚔️⚔️ | **SECURED — ~+15.** Real `PerformanceObserver` (was a no-op stub): observe(entryTypes/type+buffered), disconnect/takeRecords, supportedEntryTypes, PerformanceObserverEntryList, task-queued delivery from mark()/measure(). Cap: po-observe + 2 case-sensitivity subtests need resource/navigation timing entries |
| ~~19~~ | ✅ [The Load Bell](19-the-load-bell.md) | *load-lifecycle* — `<body onload>` → `window.onload` | **clearMarks 57/57, clearMeasures 57/57, measures 119/119** | ⚔️⚔️ | **SECURED — +233.** `<body onload=…>` is an HTML *window* event handler; it was never wired to `window.onload`, so testharness pages running tests from `<body onload>` came back could-not-run. `__installBodyWindowHandlers()` compiles body/frameset window-reflecting on\* content attrs onto `window.on*` before parser scripts run. General fix — unlocks any load-gated test |
| 27 | [The XHR Foundry](27-the-xhr-foundry.md) | `xhr/*` (XMLHttpRequest) | ⚔️ data-uri 10/10, setrequestheader-bogus-name 71/71, -value 5/5, open-method-bogus 8/8 | ⚔️⚔️ | **OPENED — +94.** Async correctness, no new architecture: `fetch()` resolves `data:` URLs in-process (WHATWG data: URL processor); real `setRequestHeader` validation (ByteString→TypeError, token/value→SyntaxError, normalize+combine); `open()` method validation (non-token→SyntaxError, CONNECT/TRACE/TRACK→SecurityError, uppercase well-known) |
| 28 | [The Synchronous XHR Keystone](28-the-sync-xhr-keystone.md) | `xhr/*` synchronous (`open(...,false)`) | ⚔️ headers-normalize 15/15, open-method-case-{in,}sensitive 6/6+9/9, responsetype-set-sync 5/5, sync-event/sequencing all green | ⚔️⚔️⚔️ | **SECURED — ~+49.** Blocking Rust op `op_fetch_url_sync` (factored out of `op_fetch_url`'s network core) makes `send()` block until the response — safe on per-page threads. `open()` records `_async` + InvalidAccessError + state-change-gated readystatechange; new `_sendSync()` (data:/blob: in-process, NetworkError on failure); `_fireEvent` builds real ProgressEvents. Zero regressions. Caps: charset-aware query encoding, `.asis` raw-response, hyper-lowercased request header names |
| 29 | [The Entity-Body Forge](29-the-entity-body-forge.md) | `xhr/*` request body + Content-Type | ⚔️ send-content-type-charset 19/19, send-content-type-string 1/1, send-entity-body-{none,empty,get-head,get-head-async} all green | ⚔️⚔️ | **SECURED — +19.** WHATWG "extract a body" + XHR §send() Content-Type: `_extractRequestBody` (String/Document/Blob/BufferSource/FormData/URLSearchParams), real `_parseMimeType`/`_serializeMimeType` + charset→UTF-8 adjustment (only when present & not already utf-8), GET/HEAD discard the body, POST/PUT null body emits `Content-Length: 0`. Caps: request-header-NAME case (hyper lowercases → `setrequestheader-content-type` values correct but capped), `status-*` custom reason phrase (h2), `.asis` |
| ~~31~~ | ✅ [The Charset Decipher](31-the-charset-decipher.md) | `xhr/*` response decoding | **responsetext-decoding 37/37, responsedocument-decoding 6/6** | ⚔️⚔️ | **SECURED — +19.** XHR decoded every response as UTF-8; the fetch core already hands JS the raw bytes (`bodyBase64`). New §"text response" + document decoding: `_xhrFinalEncoding` (override>Content-Type charset), `_xhrDecode` (Encoding §decode — BOM sniff picks the encoding, `TextDecoder` strips it), XML-declaration sniff (default `""` type) + HTML `<meta charset>` prescan (document). Pure JS, no new Rust. Caps: `responseText` throwing-getter for non-text responseTypes (next), XML-parser well-formedness edge |
| ~~30~~ | ✅ [The Response Document](30-the-response-document.md) | `xhr/*` `responseXML` | **media-type 15/15, get-twice 4/4** | ⚔️⚔️ | **SECURED — +11.** XHR §"document response": `responseXML` was a constant `null`. New lazy, cached `_getDocumentResponse()` — final MIME type via `_parseMimeType` (missing/unparseable Content-Type → `text/xml`), XML/HTML detection, parse via `_IframeDocument` (parsererror→null), default `""` type never parses HTML; `.response`/`.responseXML` share one cached object (identity). Caps: `responsexml-document-properties` (full XML doc metadata + lastModified/redirect.py); charset-aware response decoding |
| ~~32~~ | ✅ [The Throwing Getter](32-the-throwing-getter.md) | `xhr/*` `responseText` | **non-document-types 5/5** | ⚔️ | **SECURED — +4.** `responseText` was a plain data property (never threw); per §the-responsetext-attribute it must throw `InvalidStateError` when `responseType` is not `""`/`"text"`. Refactored to a getter backed by `_responseText` (all send paths assign the backing field) — empty string until LOADING/DONE, else the decoded text. `responseXML` already threw. Pure JS, no new Rust. The response-attributes vein is now clean. Caps: `responsexml-document-properties` (full XML doc metadata quest) |
| ~~33~~ | ✅ [The Interface Armory](33-the-interface-armory.md) | `dom/nodes/Node-cloneNode*` (+ HTML element interface objects) | **Node-cloneNode 135/135** | ⚔️⚔️ | **SECURED — +34.** Most `HTML*Element` interface objects were a single shared alias of `HTMLElement` and a large tail was missing → `typeName in window` false. Now each is a distinct subclass of `HTMLElement` + a canonical `_HTML_IFACE_BY_TAG` tag→interface map, so `createElement(t) instanceof HTMLXxxElement` is honest. Added `DocumentType.cloneNode` + `DetachedDocument.cloneNode`. Caps: DOMParser HTML doc drops `<!DOCTYPE>` (parse-path gap); `document.adoptNode` unimplemented (next quick win) |
| ~~34~~ | ✅ [The Adoption Papers](34-the-adoption-papers.md) | `dom/nodes/Document-adoptNode` (+ insert-adopt) | **Document-adoptNode 4/4, Node-mutation-adoptNode 2/2** | ⚔️ | **SECURED — +5.** `document.adoptNode` was unimplemented (`adoptNode is not a function`). Real DOM §dom-document-adoptnode: detach from any parent, deep-retarget the node document of the whole subtree (`_setNodeDocumentDeep`), adopting a Document throws `NotSupportedError`; inherited by `DetachedDocument`. Also fixed insertion (`appendChild`/`insertBefore`) to run the §insert "adopt into the parent's node document" step **deeply** when crossing documents (was retagging only the direct child) — hot-path safe via a same-document cheap compare. Pure JS, no new Rust. Caps: DocumentFragment/ShadowRoot adopt subtests (need a working `new Document()` web ctor, template-content owner document, `attachShadow`), `remove-and-adopt-thcrash` (`window.open()` popup document) |
| ~~35~~ | ✅ [The Insertion Concord](35-the-insertion-concord.md) | `dom/nodes/{ParentNode-append,prepend,replaceChildren,ChildNode-before,after,replaceWith}` | **before/after/replaceWith 45/45+45/45+33/33, append 25/25, prepend 22/22, replaceChildren 25/29** | ⚔️⚔️ | **SECURED — +177.** The whole ParentNode/ChildNode mutation family shared crooked, duplicated "convert nodes into a node" logic that only handled `typeof === "string"` (so `null`/`undefined`/numbers threw instead of becoming Text nodes), `before`/`after`/`replaceWith` lacked the viable-sibling algorithm (so `child.before(x, child)` **crashed the engine** → the three suites were dark), and `replaceChildren` was missing entirely. One shared spec-correct core (`_convertNodesIntoNode` + `_cn*`/`_pn*` mixins on Element/CharacterData/DocumentType/DocumentFragment/Document) + §ensure-pre-insertion-validity steps 5–6 added to `appendChild`/`insertBefore`. Bonus: insertAdjacentElement/Text 5→6 each. Caps: `replaceChildren` atomic "replace all" MutationObserver record (needs a Rust suppress-observers flag) |
| 14 | [The Parsing Foundry](14-the-parsing-foundry.md) | `domparsing/*` | ⚔️⚔️ KEYSTONE SECURED — XML parser + serializer (xml 20/20, serializer 27/29, html 9/10) | ⚔️⚔️⚔️ | Inc 1 +7 (detached HTML doc, was returning the LIVE document!); **Inc 2 +46** (real namespace-aware XML parser + W3C XMLSerializer; unlocked Node-normalize 4/4 + Element-tagName 6/6). Tails: createContextualFragment/insert_adjacent_html (HTML fragment-in-context) |

Difficulty: ⚔️ quick & decisive · ⚔️⚔️ a proper campaign · ⚔️⚔️⚔️ an architectural siege.

---

## 🗺️ Captain's Counsel (recommended order — updated 2026-06-14, session 5)

With **#02 Attr-Node Codex SECURED (67/67)** — a real `Attr`/`NamedNodeMap` model
over namespace-aware Rust attribute storage — the field stands thus:

1. **The Collections Armory (11)** + **Node-Smithing Vaults (06)** — now the most
   leveraged ground: `getElementsByTagName(NS)` and the `Node-*` family are
   measurable and the new `Attr`/`NamedNodeMap`/namespace machinery directly
   supports them (`Element-getElementsByTagName` sits at 4/19 today).
2. **The Selector Sorcery (01)** — finish the tail (see Scroll 01 for the bucketed ~52):
   namespace selectors, shadow-DOM pseudo-elements, a real `NodeList` type, and a
   harness node-identity mystery. Namespaced attributes are now real, which helps.
3. **The ClassList Mutation-Echo (03)** (1315/1420) — bankable tail on held ground.
4. **The Iframe Frontier (12) tails** — `Range-insertNode`/`surroundContents`
   per-subtest correctness (909/698 of 1840). Grinding but bankable.
5. The smaller self-contained realms (08 Encoding, 09 FileAPI) for breadth.
6. **Standing leverage:** XML-document mode + iframes-delay-load (#05) and the new
   namespace-aware attribute layer (#02) may unblock OTHER XML/foreign-content tests.

## 📜 Lands already secured this campaign (for the chronicles)

**Session 2026-06-18 (Quest #35 The Insertion Concord — ParentNode/ChildNode
mutation methods, +177):**
- The DOM mutation-method family — `append`/`prepend`/`before`/`after`/
  `replaceWith`, plus the entirely-missing `replaceChildren` — each carried its
  own ad-hoc "convert nodes into a node" that only handled `typeof === "string"`.
  Three defects: (a) non-Node args (`null`/`undefined`/numbers) were *rejected*
  by `appendChild` instead of WebIDL-stringified into Text nodes; (b)
  `before`/`after`/`replaceWith` had no viable-sibling algorithm, so
  `child.before(x, child)` (context node among its own args) **crashed the
  engine** — `ChildNode-before/after/replaceWith` were dark (could-not-run);
  (c) `replaceChildren` didn't exist.
- **Fix (pure JS, no new Rust):** one shared spec core — `_convertNodesIntoNode`
  (stringify non-Nodes, gather multiples into a DocumentFragment) + `_pnAppend/
  _pnPrepend/_pnReplaceChildren` (ParentNode) + `_cnBefore/_cnAfter/
  _cnReplaceWith/_cnRemove` (ChildNode, with the viable-sibling walk) — installed
  once onto Element/DocumentFragment/Document (ParentNode) and Element/
  CharacterData/DocumentType (ChildNode; doctype had *none* of these before).
  Also added §ensure-pre-insertion-validity **steps 5–6** to
  `appendChild`/`insertBefore` (Text-into-document, doctype-into-non-document,
  document element/doctype cardinality → `HierarchyRequestError`); cheap on the
  hot path (gated to document parents).
- Wins: ChildNode-before/after/replaceWith **0→45/45/33** (+123), append
  11→**25/25** (+14), prepend 9→**22/22** (+13), replaceChildren 0→**25/29**
  (+25), insertAdjacentElement/Text 5→**6/6** each (+2 bonus). **+177**, zero
  regressions (qsa 1975, classlist 1420, createElement 147, createElementNS 596,
  Node-appendChild 11, Node-replaceChild 29, cloneNode 135, isEqualNode 9,
  attributes 67, mark 22/22, measures 119/119, structured-clone 141/152,
  getRandomValues 39/39, url-setters-stripping 260/260). Scroll
  `35-the-insertion-concord.md`.
- **Caps (honest):** `replaceChildren`'s last 4/29 (2 "right order" fails + 2
  MutationRecord timeouts) need the spec's **atomic "replace all"** — per-node
  ops with the suppress-observers flag + ONE combined `childList` record. Records
  come entirely from the Rust queue, so that needs a **Rust suppress-observers
  flag / `replace_all` op** (touches the shared mutation system classlist/
  attributes depend on) — deferred, not risked for +4. `Node-removeChild.html`
  is a PRE-EXISTING no-results (verified via stash-rebuild — `frames[0].document`
  fixture, not a regression).
- **Next leverage:** the `replaceChildren` atomic-record Rust op (also unlocks
  spec-correct innerHTML/textContent replace-all granularity); else the standing
  `new Document()` web ctor (Quest #34's named foundational primitive —
  `adoption.window` DocumentFragment subtests, template content, importNode); or
  a fresh realm.

**Session 2026-06-18 (Quest #34 The Adoption Papers — `document.adoptNode` +
deep insert-adopt, +5):**
- `dom/nodes/Document-adoptNode.html` was 0/4 — `document.adoptNode` was simply
  **unimplemented** (`adoptNode is not a function`). The named next quick win
  from Quest #33.
- **Fix (pure JS, no new Rust):** Obscura tracks a node's node document with the
  wrapper's `_ownerDoc` tag (default = the page document; cached wrappers keep it
  stable). So adoption is a *detach + deep retag* — the backing nodes stay in the
  shared Rust arena (an adopted-but-not-inserted subtree just lives there
  unparented). New `Document.adoptNode(node)` (inherited by `DetachedDocument`):
  TypeError for non-Nodes, `NotSupportedError` for a Document, else run
  `_adoptNodeInto(node, this)` = DOM §concept-node-adopt (remove from parent; when
  the destination differs from the node's current document, `_setNodeDocumentDeep`
  retargets the node and every descendant).
- **Second win — insert-adopt depth:** `appendChild`/`insertBefore` only retagged
  the **direct** child's `_ownerDoc`, so a foreign subtree's descendants kept
  their old `ownerDocument` after insertion. Now insertion runs the §insert
  "adopt into the parent's node document" step deeply (and an element's attributes
  follow via `_ownerEl`), but only when the node actually crosses documents — a
  cheap `ownerDocument !== targetDoc` compare keeps the hot same-document path
  walk-free. Fixed `Node-mutation-adoptNode` "simple append of foreign div" +
  "owner docs of attributes".
- Wins: Document-adoptNode 0→**4/4**, Node-mutation-adoptNode 1→**2/2**. **+5**,
  zero regressions (qsa 1975, classlist 1420, createElement 147, createElementNS
  596, cloneNode 135, isEqualNode 9/9, appendChild 11/11, mark 22/22, measures
  119/119, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
  260/260). Scroll `34-the-adoption-papers.md`.
- **Caps (honest):** `adoption.window` (1/6) + the `remove-and-adopt-thcrash`
  test need machinery Obscura doesn't model yet — a working `new Document()` web
  constructor (its `_nid` is NaN → ops fall back to node 0, the live document),
  template-content owner documents (`template.content.ownerDocument !==
  document`), `attachShadow`/ShadowRoot, and `window.open()` popup documents
  (`popup.document` is null). Each is a wider quest.
- **Next leverage:** the `new Document()` web constructor (a real backing
  fragment node + a distinct node document) would unlock the `adoption.window`
  DocumentFragment subtests AND is a foundational primitive (template content,
  `createDocumentFragment` identity); else a fresh realm (`dom/` Node-* family,
  `fetch/`).

**Session 2026-06-18 (Quest #33 The Interface Armory — HTML element interface
objects + Node/Document/DocumentType cloning, +34):**
- `dom/nodes/Node-cloneNode.html` sat at 103/135; the 32 fails were all
  `HTMLXxxElement is not supported`. Obscura defined most `HTML*Element`
  interfaces as a **single shared alias of `HTMLElement`**, and a large tail
  (`HTMLAreaElement`, `HTMLBaseElement`, `HTMLTableColElement`, `HTMLModElement`,
  `HTMLObjectElement`, the deprecated `HTMLDirectoryElement`/`HTMLFontElement`/
  `HTMLFrameElement`/`HTMLFrameSetElement`, …) was simply **missing** →
  `typeName in window` was false.
- **Root-cause fix (pure JS):** each `HTML*Element` is now a distinct subclass of
  `HTMLElement` (`HTMLAreaElement !== HTMLDivElement`, as the platform requires;
  behaviour stays shared on `Element.prototype`), `HTMLMediaElement` is the base
  of audio/video, and a canonical `_HTML_IFACE_BY_TAG` tag→interface map drives
  `_htmlClassForLocal`, so `createElement('area') instanceof HTMLAreaElement` is
  genuinely true.
- The last 3 cloneNode fails were a different bug: cloning a `DocumentType` or a
  `Document` (createDocument/createHTMLDocument) returned `null` (no `cloneNode`).
  Added `DocumentType.cloneNode` + `DetachedDocument.cloneNode(deep)` (same
  kind/contentType/compatMode/title; clone starts empty; children only when deep).
- Wins: Node-cloneNode 103→**135/135**, cloneNode-document-with-doctype 0→**2/3**.
  **+34**, no new Rust, zero regressions (qsa 1975, classlist 1420, createElement
  147, createElementNS 596, isEqualNode 9/9, Element-tagName 6/6, mark 22/22,
  structured-clone 141/152, getRandomValues 39/39, url-setters-stripping 260/260,
  XMLSerializer 27/29). Scroll `33-the-interface-armory.md`.
- **Next leverage:** `document.adoptNode` is unimplemented (`Document-adoptNode`
  0/4 — a small self-contained sibling of cloneNode, good next quick win); the
  DOMParser HTML-doc `<!DOCTYPE>` drop (`_IframeDocument` parse-path gap) caps the
  last doctype-clone subtest; the new distinct interface objects are the
  foundation for the html/dom element idlharness tail.

**Session 2026-06-18 (Quest #32 The Throwing Getter — XHR `responseText`, +4):**
- `responseText` was a plain **data property** (assigned in the constructor,
  `open()`, and every send completion), so it never threw. Per §the-responsetext-
  attribute it must throw `InvalidStateError` when `responseType` is not `""` or
  `"text"`. (`responseXML` already threw for non-`""`/`"document"` since #30.)
- Refactored to a **getter backed by `_responseText`**: throws for the wrong
  responseType; empty string until LOADING/DONE; else the decoded text. All five
  former assignment sites now write the backing field (a plain assignment against
  a getter-only property throws `TypeError` in a class body's strict mode). The
  async path also stores the decoded text in a local and uses it in the
  `responseType` switch so the switch never trips the throwing getter.
- Wins: `responsexml-non-document-types` 1→5/5. **+4**, pure JS, no new Rust,
  zero regressions (responsetext-decoding 37/37, responsexml-media-type 15/15,
  get-twice 4/4, response-json 4/4, data-uri 10/10, send-content-type-charset
  19/19; ritual qsa 1975, classlist 1420, createElement 147, mark 22/22, measures
  119/119, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
  260/260). Scroll `32-the-throwing-getter.md`.
- **Next leverage:** the response-attributes vein is now clean. Consider a fresh
  realm (`fetch/`, `dom/` heavy fixtures) or the `responsexml-document-properties`
  full-XML-document-metadata quest (named in #30).

**Session 2026-06-18 (Quest #31 The Charset Decipher — XHR response decoding, +19):**
- XHR decoded every response body as UTF-8 (`await resp.text()` / `new
  TextDecoder().decode()`); a `charset=windows-1252`, a UTF-16 BOM, or an XML
  `encoding=` declaration all came back mojibake. The fetch core already returns
  the raw bytes (`bodyBase64` → `Response._bodyBytes`), so this was a pure-JS
  bootstrap.js change.
- New §"text response": `_xhrFinalEncoding` (override-MIME charset > Content-Type
  charset, via the Quest #08 `_getEncodingName` label table), XML-declaration
  sniff for the default `""` responseType only, `_xhrDecode` = Encoding §decode
  (BOM-sniff picks the encoding — `TextDecoder` strips the matching BOM; legacy
  encodings route to `op_text_decode`). `_getDocumentResponse` decodes the bytes
  for the document with its own rules (charset > HTML `<meta>` prescan / XML
  declaration > UTF-8). Both send paths store `this._responseBytes`.
- Wins: responsetext-decoding 22→37, responsedocument-decoding 2→6. **+19**, zero
  regressions, no new Rust. Scroll `31-the-charset-decipher.md`.
- **Next leverage:** `responseText`/`responseXML` throwing getters
  (`InvalidStateError`) for arraybuffer/blob/json/document responseTypes
  (`responsexml-non-document-types` 1/5 — a small backing-field refactor).

**Session 2026-06-18 (Quest #30 The Response Document — XHR `responseXML`, +11):**
- `responseXML` was a constant `null` (never built); `response` for
  `responseType="document"` returned the raw text. Implemented the XHR
  §"document response" algorithm as a lazy, cached `_getDocumentResponse()`:
  final MIME type via `_parseMimeType` (a missing/unparseable `Content-Type`
  defaults to `text/xml` per "get a response MIME type" — so `""`/`bogus`/
  `application`/`bogus+xml` all parse), XML vs HTML detection, parse through the
  Quest #14 `_IframeDocument` 'xml'/'html' parser (parsererror root → null), and
  the default `""` responseType never parses HTML.
- Made `responseXML` a getter (InvalidStateError off-type, null until DONE) and
  wired the `case 'document':` arms of both `send()` and `_sendSync()` to the same
  cached document so `.response` and `.responseXML` are object-identical.
- Wins: responsexml-media-type 7→15, responsexml-get-twice 1→4. **+11**, zero
  regressions. Pure JS, no new Rust.
- **Next leverage:** `responsexml-document-properties` is a could-not-run needing
  the full XML-document metadata surface (`domain`/`baseURI`/`all`→HTMLAllCollection/
  `lastModified`/`redirect.py`) — a wider separate quest; and charset-aware
  response decoding (`responsetext-decoding`) via `op_text_decode` on raw bytes.

**Session 2026-06-18 (Quest #29 The Entity-Body Forge — XHR request body + Content-Type, +19):**
- `send(body)` was coercing every body type with `String(body)` and deriving no
  request `Content-Type`. Implemented the WHATWG "extract a body" algorithm
  (`_extractRequestBody`: String/Document/Blob/BufferSource/FormData/URLSearchParams)
  + the XHR §send() Content-Type rules, with a real `_parseMimeType`/
  `_serializeMimeType` MIME parser so the charset→UTF-8 adjustment is exact
  (param dedup, name-lowercasing, value-case preservation, quoted-string
  unescaping, already-`utf-8` and invalid-MIME passthrough).
- GET/HEAD now discard `send()`'s body argument; a null/empty POST/PUT body emits
  `Content-Length: 0` (set explicitly in `perform_fetch_core` — h2 omits it for an
  empty body). Both async `send()` and blocking `_sendSync()` share the logic.
- Wins: send-content-type-charset 12→19, send-content-type-string 0→1,
  send-entity-body-none 2→6, -empty 1→3, -get-head 0→2, -get-head-async 0→2,
  setrequestheader-content-type 3→4 (values all correct, rest capped). **+19**,
  zero regressions.
- **Honest caps named:** `setrequestheader-content-type` (30 left) + the whole
  `status-*` family (~73 subtests, widest XHR tail) are **transport caps** —
  request-header NAME case is lowercased by hyper/`http` (and h2 requires it), and
  custom HTTP reason phrases don't exist over h2 / aren't exposed by reqwest. Not
  failures — architecturally unwinnable for us. Next winnable = the **response**
  side: `responsexml-media-type` (7/15) + charset-aware response decoding.

**Session 2026-06-18 (Quest #25 harvest — sync XHR resource entries, +4):**
- With sync XHR landed in #28, harvested the ×4 `buffer-full-*` tails that #25 named as
  its widest cap (`add-then-clear`, `then-increased`, `add-entries-during-callback`,
  `inspect-buffer-during-callback`). These tests drive the Resource Timing buffer *only*
  through `load.xhr_sync()`.
- **Root cause:** `_sendSync` populated status/headers/responseText but never called
  `performance._addResourceEntry`, so a synchronous XHR added **zero** timeline entries
  → every assertion saw an empty buffer. The async path (`fetch()`) already recorded an
  entry; sync was the gap.
- **Fix (bootstrap.js, ~3 lines + a start-time capture):** `_sendSync` now records a
  completed `resource` entry on the timeline (initiatorType `xmlhttprequest`, honest
  byte size from the response bytes, `_entryContentType` MIME essence) right before the
  DONE transition — exactly mirroring the async fetch path. Pure JS, no new Rust.
- **Wins:** the 4 tails 0→1/1 each (**+4**). All 12 `buffer-full-*` tests now green.
  Zero regressions (qsa 1975, classlist 1420, createElement 147, mark 22/22, measures
  119/119, structured-clone 141/152, getRandomValues 39/39, url-setters-stripping
  260/260, data-uri 10/10, setrequestheader-bogus-name 71/71, open-method-bogus 8/8,
  buffered-flag/clear-resource-timings/status-codes 1/1, content-type 16/21 unchanged).
- **Cap left:** `buffer-full-eventually` (250 sequential network loads exceed harness
  wall-clock). Content-type cross-origin no-cors XHR tail still capped (sync XHR is
  cors-mode). Scroll [`25-the-buffer-ledger.md`](25-the-buffer-ledger.md).

**Session 2026-06-18 (Quest #28 — The Synchronous XHR Keystone, ~+49):**
- **The root-cause primitive behind the whole `xhr/*` realm.** WPT's XHR suite leans
  heavily on `open(method, url, false)` (sync) because it lets a test `send()` then read
  `responseText`/`getResponseHeader()` on the next line. Obscura's `send()` was *always*
  async (`fetch().then()`), so the next-line read saw `""`/`null` — files that looked
  like header/method/URL tests were all blocked on one missing thing: a **blocking
  `send()`**. This was the single widest Cap named across #25, #26, and #27.
- **Rust:** factored `op_fetch_url`'s network core into a standalone async
  `perform_fetch_core` (preflight + SSRF-revalidated redirect loop + cookies + envelope),
  and added a blocking **`op_fetch_url_sync`** (`#[op2]`) that runs the core on a
  throwaway worker-thread runtime and **blocks the page's JS thread** on a channel.
  Safe on `engine-per-page-threads`: only that page blocks, never the engine. Interception
  is skipped (would deadlock the one thread; WPT never intercepts); cookies/proxy/CORS/SSRF
  all still apply. The async `op_fetch_url` now delegates to the same core — **behaviour
  preserving** (every async XHR/fetch realm held).
- **JS:** `open()` records `_async` (was dropped) + throws `InvalidAccessError` for sync +
  timeout/responseType + only fires `readystatechange` on a real state change (redundant
  `open()` is silent → `[1,4]`). New `_sendSync()` blocks via the op, handles `data:`/`blob:`
  in-process, populates state synchronously, fires DONE + `load`/`loadend` (no loadstart for
  sync), and throws `NetworkError` on a transport/CORS/SSRF failure or malformed response
  header. `_fireEvent` now builds real `ProgressEvent`s for the progress family.
- **Wins:** headers-normalize-response 0→15, open-method-case-insensitive 0→6,
  open-method-case-sensitive 0→9, open-method-responsetype-set-sync 0→5, open-url-fragment
  0→4, response-method 1→3, event-readystate-sync-open 0→2, open-open-sync-send 0→1,
  open-sync-open-send 0→1, send-sync-no-response-event-{load,loadend} 0→1 each,
  send-redirect-infinite-sync 0→1, responseurl 0→1. **Zero regressions** (qsa 1975, classlist
  1420, createElement 147, mark 22/22, measures 119/119, structured-clone 141/152,
  getRandomValues 39/39, url-setters 260/260, url-with-fetch 16/16, url-with-xhr 14/14;
  async XHR held: data-uri 10/10, setrequestheader 71/71+5/5, open-method-bogus 8/8,
  response-json 4/4). Caps: `open-url-encoding` (charset-aware query encoding), `.asis`
  raw-response (reqwest/serving), `setrequestheader-allow-empty-value` (hyper lowercases
  request header names), `send-data-unexpected-tostring` (re-entrant mid-stringify).
  Scroll `tickets/28-the-sync-xhr-keystone.md`.

**Session 2026-06-18 (Quest #27 — The XHR Foundry OPENED, +94):**
- **A new realm.** With the resource-timing vein (#21–#26) thinning to architectural
  caps (sync XHR, cross-origin TAO), opened `xhr/*` (231 tests, baselined largely
  dark). Three pure-JS fixes in `bootstrap.js`, **no new architecture**:
- **`data:` URLs in `fetch()` (+10, `data-uri.htm` 0→10/10).** `op_fetch_url` is
  reqwest-backed (HTTP only), so a `data:` fetch errored and XHR fired `error`. New
  `_processDataURL` runs the WHATWG **"data: URL processor"** (MIME essence +
  percent-decode + `;base64`); the synthesized `Response` carries `content-type` only
  (no Content-Length, per the test) and a `HEAD` request yields an empty body.
- **`setRequestHeader` validation (+76, bogus-name 0→71, bogus-value 0→5).** Was a
  bare `_headers[name]=value`. Now: WebIDL ByteString coercion (code unit >0xFF →
  `TypeError`; missing 2nd arg → `TypeError`), OPENED-state check, value normalized,
  name must be an HTTP **token** + value a **header value** (no `\0`/`\r`/`\n`) → else
  `SyntaxError`, then case-insensitive **combine**.
- **`open()` method validation (+8, `open-method-bogus.htm` 0→8/8).** Non-token method
  → `SyntaxError`; forbidden CONNECT/TRACE/TRACK → `SecurityError`; byte-uppercase the
  well-known methods (DELETE/GET/HEAD/OPTIONS/POST/PUT).
- **Zero regressions** (fresh-server sweep): qsa 1975, classlist 1420, createElement
  147, mark 22/22, measures 119/119, structured-clone 141/152, getRandomValues 39/39,
  url-setters-stripping 260/260, url-with-xhr 14/14, url-with-fetch 16/16,
  clear-resource-timings 1/1, status-codes 1/1, buffered-flag.any 1/1, response-json
  4/4, content-type 16/21 (peak; bounces 13↔16 on cross-origin network timing — a
  documented flaky cap, not this work).
- **Caps / Next:** **synchronous XHR** (blocking Rust op) is the widest remaining
  lever — it's the *same* cap named in #25 (×4) and #26 (×2), and would unlock the
  `*-sync.htm` family (~18), `open-method-case-*` (15), `responseurl` (2),
  `allow-empty-value` (3), plus the resource-timing tails. Also: `.asis` raw-response
  tests (reqwest/serving cap), `headers-normalize-response` (async, winnable), forbidden
  request-headers, a real send flag. Scroll `tickets/27-the-xhr-foundry.md`.

**Session 2026-06-17 (Quest #26 — The Content-Type Ledger, +16):**
- **`PerformanceResourceTiming.contentType` now exists.** Resource entries had no
  `contentType` member, so `entry.contentType` was `undefined` for every resource —
  `content-type.html` was 0/21. Added the attribute (the MIME **essence** —
  `type/subtype`, params stripped, lowercased — of the response `Content-Type`,
  which `op_fetch_url` already returns in `headers`), exposed for **non-opaque**
  responses only: same-origin loads, and crossorigin **CORS** loads that pass the
  access-control check; opaque cross-origin (no-cors) → `""`.
- **`crossOrigin` → CORS fetch mode.** `_loadElementResource` hard-coded `no-cors`,
  so a `crossOrigin="anonymous"` image/script/stylesheet got an opaque response and
  `contentType: ""`. It now honors the element's `crossOrigin` attribute and fetches
  in **cors** mode, making the CORS-allowed cross-origin responses non-opaque (and
  exposing their content-type) — won 4 cross-origin subtests.
- **Bug fix: `XMLHttpRequest.open(URL)`** — the `xhr_async` loader passes a `URL`
  object as the url; `open` stored it verbatim and `send()` then threw
  `url.includes is not a function`. `open` now coerces a non-string url to a string
  (the spec parses it anyway). Unblocks any test that opens an XHR with a URL object.
- **Results:** `content-type.html` **0→16/21** (+16: 7 same-origin, 5 cross-origin
  no-cors `""`, 4 cross-origin CORS). **Zero regressions** (fresh-server sweep: qsa
  1975, classlist 1420, mark 22/22, measures 119/119, structured-clone 141/152,
  getRandomValues 39/39, url-with-xhr 14/14, url-with-fetch 16/16, buffered-flag 1/1,
  clear-resource-timings 1/1, status-codes 1/1, initiator-type-for-script 1/1,
  image-sequence 3/3, po-observe 5/6 [pre-existing fail]).
- **Caps (the remaining 5):** cross-origin **no-cors XHR** (×2) — Obscura's XHR is
  always cors-mode, so a cross-origin XHR without ACAO is blocked → no entry →
  timeout; cross-origin **redirect TAO** (×3) — after a cross-origin redirect the
  final URL can be same-origin, so the origin check over-exposes; needs real
  redirect-chain origin/TAO tracking. Scroll `tickets/26-the-content-type-ledger.md`.

**Session 2026-06-17 (Quest #25 — The Buffer Ledger, +8):**
- **The Resource Timing buffer is real.** `performance._addResourceEntry` used to
  push every resource entry straight onto the timeline with no size limit and no
  `resourcetimingbufferfull` event — so every `buffer-full-*` test hung forever
  waiting for an event that could never fire. Implemented the Resource Timing
  Level 2 buffer model in the `Performance` class (bootstrap.js): a primary buffer
  (the resource entries already in `_entries`) with a **size limit of 250**, a
  **secondary buffer** for overflow, the **`resourcetimingbufferfull`** event +
  **`onresourcetimingbufferfull`** handler attribute, and the **"fire a buffer
  full event"** task (queued on `setTimeout(0)` so synchronous follow-up code —
  e.g. a `setResourceTimingBufferSize()` — runs first). The task fires the event
  while the primary is full, copies the secondary buffer in while there is room,
  and drops the remainder when no progress can be made (the spec's overflow
  guard). `setResourceTimingBufferSize` now just sets the limit; `clearResourceTimings`
  resets the primary (untouched secondary still copies in afterward).
- **8 tests 0→1/1:** `buffer-full-then-decreased`, `-when-populate-entries`,
  `-set-to-current-buffer`, `-decrease-buffer-during-callback`,
  `-increase-buffer-during-callback`, `-store-and-clear-during-callback`,
  `-add-after-full-event`, `-add-entries-during-callback-that-drop`.
- **Zero regressions** (fresh-server sweep): qsa 1975, classlist 1420, iframe-load
  2/2, mark.any 22/22, measures 119/119, structured-clone 141/152, clear-resource-timings
  1/1, buffered-flag 1/1, status-codes-create-entry 1/1, po-disconnect 3/3,
  po-observe 5/6 (the 1 fail = pre-existing `observe({entryTypes:"mark"})` WebIDL
  coercion, not this change).
- **Honest caps:** four `buffer-full-*` tests drive entries through `load.xhr_sync`
  and assert on **synchronous-XHR** ordering; Obscura's `XMLHttpRequest.send` is
  always async (`fetch().then()`), so those orderings can't be honored without a
  blocking Rust sync-XHR op (architectural). `buffer-full-eventually` loads ~250
  images sequentially over the real network to fill the default buffer — it
  exceeds the harness wall-clock and times out (the algorithm is correct; this is
  a network/timing cap). Scroll `tickets/25-the-buffer-ledger.md`.

**Session 2026-06-17 (Quest #24 — The Resolved Reflection, +1, foundational):**
- **URL-reflecting IDL attributes now return the resolved absolute URL.** The
  shared `Element` `src`/`href` getters returned the raw content attribute, so
  `img.src` on `<img src="resources/foo.py">` gave the relative string while the
  Resource Timing ledger (Scroll #23) filed the entry under the absolute URL —
  `getEntriesByName(img.src)` matched nothing. New `_reflectURL(el, attr)`
  (bootstrap.js) implements the HTML "reflect as a URL" getter (absent → `""`;
  else `new URL(value, el.baseURI).href`; parse-fail → raw), gated to the
  genuinely URL-reflecting elements via `_URL_REFLECT_SRC`
  (img/script/iframe/audio/video/source/track/embed/input/frame) and
  `_URL_REFLECT_HREF` (a/area/link) so non-URL reads stay raw.
- **Honest page-`<script src>` entry duration.** The page-script `resource` entry
  was injected with `startTime === endTime` (`duration 0`); the test also asserts
  `duration > 0`. `page.rs` now times each script fetch with `std::time::Instant`
  and records `startTime = now - elapsed`, so `duration` is the real network time.
- **Results:** `resource-timing/status-codes-create-entry` 0→**1/1**. Zero
  regressions (clean-server sweep: qsa 1975, classlist 1420, createElement 147,
  url-origin 403, mark 22/22, structured-clone 141/152, getRandomValues 39/39,
  po-disconnect 3/3, url-with-fetch 16/16, iframe-load 2/2, measures 119/119,
  nav2-attributes 1/1, po-observe 1/1, case-sensitivity.any 3/3, img 1/1, link
  5/8, dynamic-insertion 5/6, clear-resource-timings 1/1; relevant-mutations
  70/113, flaky 69↔70 unrelated). **Caps:** TAO/cross-origin `getEntriesByName`
  family; `<base>`-tag divergence between the getter (`baseURI`) and the loader
  (`document_url`). Scroll `tickets/24-the-resolved-reflection.md`.

**Session 2026-06-17 (Quest #23 — The Element Ledger, inc 2, ~+6):**
- **Markup subresource scan.** Inc 1 only loaded elements inserted via JS; MARKUP
  `<img src>`/`<link rel=stylesheet>` (parsed by html5ever) never did. New
  `__startResourceLoads()` (beside `__startFrameLoads`) scans `img[src]`/`link`/`object`
  and loads them, wired into `page.rs`'s `<dcl-events>` step so the fetches settle
  before `load` (bounded by `pump_until_idle`'s 500ms). `modulepreload` → "other".
- **Results:** initiator-type/img 0→1/1, link 0→5/8, the-img-element/relevant-mutations
  70→71. Zero regressions (verified by stashing inc 2 and re-measuring on inc 1).
- **Caps:** css-embedded resources ("css", needs a CSS resource walker); `getEntriesByName(img.src)`
  tests need `img.src` IDL to return the *resolved* URL (broad shared-getter change, deferred);
  svg/embed/video/audio/input element types. Scroll `tickets/23-the-element-ledger.md`.

**Session 2026-06-17 (Quest #23 — The Element Ledger, inc 1, ~+10):**
- **Element subresource loads now emit `PerformanceResourceTiming` entries** (the #22 cap).
  New `bootstrap.js` helper `_loadElementResource(el, url, initiatorType, {eval})` fetches the
  resource via `op_fetch_url`, records an honest-size `resource` entry (`_addResourceEntry`),
  then fires the element's trusted `load`/`error` event (new `_fireElementError`). Wired to:
  `<img>`.src setter (incl. `new Image()`, now a real `<img>` factory), `<script src>` appendChild
  (refactored to use the helper + emit an entry), and `_connectResourceElement` on appendChild/
  insertBefore for JS-inserted `<link rel=stylesheet/preload/prefetch/icon/manifest/modulepreload>`
  + `<object data>`. Added `rel` IDL reflection to Element (`link.rel = "stylesheet"` was setting a
  plain property, so the link never loaded). iframe + XHR fetches now pass an internal
  `_initiatorType` so their entries read "iframe"/"xmlhttprequest" instead of "fetch".
- **Results:** performance-timeline/po-observe 0→1/1 (the headline); resource-timing/initiator-type/
  dynamic-insertion 0→5/6; entry-attributes 0→1/3; xhr-resource-timing →1/2. Zero regressions
  (qsa 1975, classlist 1420, createElement 147, url-origin 403, mark.any 22/22, measure-exceptions
  13/13, structured-clone 141/152, getRandomValues 39/39, po-disconnect 3/3, po-takeRecords 1/1,
  url-with-fetch 16/16, iframe-load 2/2, nav2-test-attributes-exist 1/1).
- **Caps / Next (inc 2):** MARKUP `<img src>`/`<link rel=stylesheet>` (parsed by Rust, never go
  through the JS appendChild hook) still don't emit entries → initiator-type/img.html + link.html
  capped; needs a `__startResourceLoads()` markup scan (watch load-event timing / regression risk).
  Also: font→"css" (`<style>@font-face` + `document.fonts`), same-origin redirect timing
  (collapsed-phase entry has redirectStart=0), TAO cross-origin, buffer-full family. Scroll
  `tickets/23-the-element-ledger.md`.

**Session 2026-06-17 (Quest #22 — The Resource Ledger, +4):**
- **`PerformanceResourceTiming` entries** for fetched resources (building on Scroll #21's
  base class). `bootstrap.js`: `Performance._addResourceEntry` (collapses network sub-phases,
  `responseEnd` = completion so `duration > 0`, queues to observers), real `clearResourceTimings`,
  `'resource'` added to `supportedEntryTypes`, and a `fetch()` hook (XHR rides on fetch). `page.rs`:
  each page `<script src>` injects a "script" resource entry as it loads, before executing, so a
  later inline script sees it.
- **Results:** resource-timing/buffered-flag 1/1, clear-resource-timings 1/1,
  performance-timeline/case-sensitivity 1/3→3/3. Zero regressions (url-with-fetch 16/16, mark.any
  22/22, measures 119/119, po suite, nav timing, qsa 1975, base64 380/380).
- **Caps:** element resource loads (img/link/iframe/dynamic .src) don't emit entries → entry-attributes,
  po-observe, most of resource-timing/* remain capped; no TAO cross-origin machinery; no
  resourcetimingbufferfull buffer-full family; XHR initiatorType is "fetch" not "xmlhttprequest".
  **Next: element-load resource entries + the buffer-full family.** Scroll `tickets/22-the-resource-ledger.md`.

**Session 2026-06-17 (Quest #21 — The Navigator's Almanac, ~+20):**
- **A real `PerformanceNavigationTiming` entry** (+ `PerformanceResourceTiming` base class)
  for the document navigation. `bootstrap.js` (classes ~4958, `__navTimingDCL`/`__navTimingLoad`,
  nav-entry creation in `__obscura_init`) + `page.rs` (body-size plumbing, readystatechange,
  hook calls).
  - The nav entry is created at startup and pushed to `performance._entries` so
    `getEntriesByType('navigation')` is populated from the very start (head sync script);
    its document-lifecycle phases (`domInteractive`…`loadEventEnd`) are filled at the real
    DCL/load moments; at load it's queued to observers (so an observer registered during
    parse fires). `'navigation'` added to `supportedEntryTypes`.
  - **Honest body sizes** from the real Rust document response: a new `Page.document_body_size:
    Option<(encoded,decoded)>` captured at fetch, seeded into the entry at the `<ready-state>`
    step (`transferSize = encoded + 300`). Not synthesized.
  - **`readystatechange`** now dispatched on `document` (+ `document.onreadystatechange`) at
    interactive (DCL) and complete (load).
  - **Results:** nav2-test-attributes-exist 1/1, nav2-test-instance-accessible-from-the-start
    1/1, nav2-test-navigation-type-navigate 1/1, po-navigation 1/1, buffered-flag.window 1/1,
    test-navigation-attributes-exist 4/4, test-navigation-redirectCount-none 5/5,
    test-document-onload 0/2→3/3, test-document-readiness-exist 1→3/3, idlharness 36/161.
    Zero regressions (mark.any 22/22, measures 119/119, measure-exceptions 13/13, po-* suite,
    qsa 1975, classlist 1420, createElement 147, EventTarget-dispatchEvent 25/25, Node-properties
    726, structured-clone 141/152, base64 380/380, url-origin 403/403).
  - **Caps:** exact-byte-size (5949) + host-config-URL value tests (nav2-test-attributes-values /
    instance-accessors), per-iframe nav timing (unique-nav-instances), real redirect-chain timing
    (timing-persistent). **Next: Resource Timing entries** (base class now exists; needs the
    resource-load paths to emit entries) — unlocks resource-timing/*, po-observe, case-sensitivity.
    Scroll `tickets/21-the-navigators-almanac.md`.

**Session 2026-06-17 (Quest #20 — The Observer's Gallery, ~+15):**
- **A real `PerformanceObserver`** replacing `class{constructor(){} observe(){} disconnect(){}}`.
  All in `bootstrap.js` after the `Performance` class (~5093), built on Scroll #18's entry buffer.
  - `observe({entryTypes})` (replaces observed set) / `observe({type, buffered})` (accumulates;
    buffered:true seeds from the global timeline) with `InvalidModificationError` on mode-mix and
    `SyntaxError` on both/neither; `disconnect()`; `takeRecords()`; cached frozen
    `supportedEntryTypes = ['mark','measure']`; `PerformanceObserverEntryList`
    (getEntries/ByType/ByName, startTime-sorted).
  - **Delivery:** `mark()`/`measure()` call `_queuePerformanceEntry` → append to matching observers'
    buffers → one `setTimeout(0)` task (`_schedulePerfTask`/`_flushPerfObservers`); the flush clears
    the scheduled flag first so a callback that observes() schedules a fresh task (chains
    `multiple-buffered-flag-observers`). `takeRecords()` drains before the task → callback skipped.
  - idlharness tidy-ups: `Symbol.toStringTag` on both, non-enumerable interface objects (matches
    real Chrome), EntryList WebIDL length 0 (reads `arguments[0]`).
  - **Results:** supportedEntryTypes 2/2, po-disconnect 3/3, po-takeRecords 1/1, po-entries-sort 1/1,
    observer-buffered-false 1/1, buffered-flag-after-timeout 1/1, multiple-buffered-flag-observers 1/1,
    case-sensitivity 1/3, idlharness 31→35/58. Zero regressions (mark.any 22/22, measure-exceptions
    13/13, clearMarks 57/57, hr-time/basic 5/5, monotonic-clock 2/2, qsa 1975, classlist 1420,
    createElement 147, structured-clone 141/152, getRandomValues 39/39, base64 380/380, url-origin
    403/403, XMLSerializer 27/29).
  - **Cap:** `po-observe` (TIMEOUT) + the other 2 `case-sensitivity` subtests need `resource`/`navigation`
    timeline entries (resource/navigation timing — not implemented). The observer is complete; it has
    nothing to deliver for those types. Scroll `tickets/20-the-observers-gallery.md`.

**Session 2026-06-17 (Quest #19 — The Load Bell, +233):**
- **`<body onload>` is a *window* event handler — now wired.** Testharness pages
  that run their tests from `<body onload=onload_test()>` + `setup({explicit_done:true})`
  came back **could-not-run**: the document `load` event fired on the window, but the
  body's `onload` content attribute (an HTML window event handler) was never wired to
  `window.onload`, so the handler — and its `done()` — never ran.
- **`__installBodyWindowHandlers()`** (`bootstrap.js` ~2903) scans `document.body`
  (and `<frameset>`) for the window-reflecting `on*` content attribute set, compiles
  each with `new Function('event', attr)`, and assigns it to `globalThis.on<name>`.
  Called from the `<ready-state>` step in `page.rs` (~472), **before** parser scripts
  run — body already exists in the static snapshot, and a later `window.onload = fn`
  in a page script overrides it (safe script-wins ordering). `onerror` excluded to
  preserve the engine's error-reporting bridge. No double-fire (`_dispatchSpec` invokes
  only registered listeners, not `on*` props; the explicit `window.onload()` in
  `<load-event>` is the single call).
- **Results:** `user-timing/clearMarks` 0→**57/57**, `clearMeasures` 0→**57/57**,
  `measures` 0→**119/119** (all were could-not-run). General fix — any load-gated test
  now runs. Zero regressions (mark.any 22/22, measure-exceptions 13/13, hr-time/basic
  5/5, qsa 1975, classlist 1420, createElement 147, structured-clone 141/152,
  getRandomValues 39/39, base64 380/380, url-origin 403/403, XMLSerializer 27/29).
- **Honest cap:** `measure_associated_with_navigation_timing.html` now runs but
  no-results — it needs nonzero `loadEventEnd`/`domComplete`, which must stay 0 for the
  secured `measure-exceptions` (0-valued attr → `InvalidAccessError`). Real
  navigation-timing population is a separate quest. Scroll `tickets/19-the-load-bell.md`.

**Session 2026-06-17 (Quest #18 — The Timekeeper's Ledger, User Timing L3, ~+70):**
- **A real User Timing Level 3** replacing a no-op `performance` (mark()/measure() did
  nothing; getEntries* always returned `[]`). All in `bootstrap.js`, pure JS:
  - **`PerformanceEntry` / `PerformanceMark` / `PerformanceMeasure` / `PerformanceTiming`**
    classes (+ globals) and a **`Performance`** class with an entry buffer.
  - `mark(name, opts)` → a `PerformanceMark` (opts validated: non-object/negative
    `startTime` → `TypeError`); `measure(name, startOrOptions, endMark)` with the L3
    options dict (`start`/`end`/`duration`/`detail`) AND positional mark names;
    `getEntries`/`getEntriesByName`/`getEntriesByType` (startTime-sorted),
    `clearMarks`/`clearMeasures`; `mark()`/`measure()` with no name → `TypeError`.
  - **`now()` is now relative to `timeOrigin`** (high-res, monotonic, ≥0) — was the raw
    `Date.now()`. `performance.toJSON()` + `PerformanceTiming.toJSON()` (full 21-attribute
    set). `performance` gained a minimal **EventTarget** (addEventListener/dispatchEvent
    with `once`) so `hr-time/basic` "extends EventTarget" passes.
  - **"Convert a mark to a timestamp"**: a PerformanceTiming attribute name resolves to its
    value (0 → `InvalidAccessError`); positional start/end are DOMStrings (a number is
    string-coerced, so `51.15` → not-a-mark → `SyntaxError`); unknown name → `SyntaxError`.
    Load-phase timing attrs (DOMContentLoaded/load/unload/redirect/TLS) are 0 — realistic
    mid-load AND what the spec treats as empty.
  - **Results:** `user-timing/mark.any` **0→22/22**; `measure-exceptions` **→13/13**;
    `mark-errors` 10/10, `mark-measure-return-objects` 5/5, `measure_exceptions_navigation_timing`
    4/4, `measure_navigation_timing` 1/1, `measure` 1/1, `user-timing-tojson` 2/2,
    `mark-measure-feature-detection` 2/2, `invoke_without_parameter` 2/2; `hr-time/basic`
    4→5, `hr-time/performance-tojson` 0→1. Zero regressions (structured-clone 141/152,
    getRandomValues 39/39, hr-time/monotonic-clock 2/2, qsa 1975, classlist 1420, base64
    380/380, url-origin 403/403, createElement 147, encoding 3421).
  - **Honest caps (not the algorithm):** `mark_exceptions` (1/22) and
    `invoke_with_timing_attributes` (21/42) are gated by OBSOLETE L1/L2 subtests that assert
    `mark(timingAttribute)` throws `SyntaxError` — removed in L3, so current browsers fail
    them too. `clearMarks`/`clearMeasures`/`measures`/`measure_associated_with_navigation_timing`
    are **could-not-run**: they run tests from `<body onload=…>`, and the load event isn't
    firing for testharness pages — a separate load-lifecycle gap (a future quest), not User
    Timing. Scroll `tickets/18-the-timekeepers-ledger.md`.

**Session 2026-06-17 (Quest #17 — The Entropy Gate, getRandomValues 23→39/39, +16):**
- **A real `crypto.getRandomValues` contract** replacing a `Math.random` fill that honored
  none of the spec (no type check, no quota, and it *threw* on BigInt arrays because it
  assigned `Math.floor(...)` numbers to a `BigInt64Array`). Now: non-`ArrayBufferView` →
  `TypeError`; a float/`DataView` view (`Float16Array`/`Float32Array`/`DataView`) →
  `TypeMismatchError`; `byteLength > 65536` → `QuotaExceededError`; otherwise fill the
  bytes through a `Uint8Array` view over the buffer (so every integer view — incl.
  `BigInt64Array`/`BigUint64Array` and subclasses — fills cleanly) and return the SAME view.
- **Two shared-surface fixes the test demanded:** (1) `DOMException._codes` was missing
  `TypeMismatchError: 17`, so its `code` getter returned 0 (the legacy `TYPE_MISMATCH_ERR`
  constant existed but the name→code map didn't) — added it. (2) WPT's
  `assert_throws_quotaexceedederror` requires the **modern `QuotaExceededError` interface**
  (a `DOMException` subclass with nullable `quota`/`requested`, and `e.constructor ===
  self.QuotaExceededError`), not a bare `new DOMException(…, "QuotaExceededError")` — added
  the class + global.
- **getRandomValues 23→39/39 (100%).** `randomUUID` was already 3/3 (its old format was
  valid). Zero regressions (structured-clone 141/152, qsa 1975, classlist 1420, base64
  380/380, url-origin 403/403, createElement 147, encoding 3421, parseFromString-xml 20/20,
  Element-tagName 6/6, Node-normalize 4/4).
- **Honest caveat:** entropy is still `Math.random`, not a CSPRNG — a real security
  follow-up (needs a Rust-exposed secure RNG op). This change is conformance only and does
  not weaken anything vs. the prior stub. Scroll `tickets/17-the-entropy-gate.md`.

**Session 2026-06-17 (Quest #16 — The Clone Forge, structuredClone 29→141/152, +112):**
- **A real WHATWG StructuredSerialize/StructuredDeserialize** replacing the
  `globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v))` footgun (which
  dropped `undefined`/`NaN`/`±Infinity`, corrupted `-0`, threw on `BigInt` and **every
  cyclic ref**, and lost all platform types). Pure JS @ `bootstrap.js`, no new Rust.
  - Recursive `_clone(value, memory, transferSet)` with a **`memory` Map** keyed by the
    original → clone (checked before recursing, container inserted before its contents)
    so cycles and shared references are preserved.
  - **Brand dispatch** via `Object.prototype.toString`: primitives & BigInt survive
    verbatim; boxed Boolean/Number/String/BigInt; Date; RegExp (lastIndex→0); the Error
    family (name→standard ctor, own message + own cause only, custom props dropped);
    ArrayBuffer (resizable-aware) + all TypedArrays + DataView (length-tracking preserved);
    Map/Set; Blob/File (copy the `_bytes` store directly — byte-exact for invalid-UTF-8
    blobs; `Object.create(proto)` collapses subclasses to the closest serializable type);
    arrays (holes + non-index props); ordinary objects (own enumerable string keys only,
    clone proto = `%Object.prototype%`).
  - **`DataCloneError`** for symbols, functions, non-serializable platform objects
    (`Response`/`Request`), and `SharedArrayBuffer` (we're not cross-origin-isolated).
  - **ArrayBuffer transfer** using V8's `ArrayBuffer.prototype.transfer()`/`.detached`
    (copy bytes → build fresh buffer w/ preserved `maxByteLength` → detach source);
    detached/non-ArrayBuffer entries in the transfer list → `DataCloneError`.
  - Interface objects (`Blob`/`File`/`Response`/`Request`) captured at load so a clone
    still works after the page deletes the global; added `crossOriginIsolated = false`.
  - **structured-clone.any 29→141/152 (+112).** Zero regressions (qsa 1975, classlist
    1420, createElement 147, base64 380/380, url-origin 403/403, encoding 3421,
    parseFromString-xml 20/20, XMLSerializer 27/29, Element-tagName 6/6, Node-normalize 4/4).
  - **10 honest losses, all engine gaps (not the algorithm):** 3× FileList (no FileList
    interface), 2× OOB-TypedArray (V8 reports an OOB TA as length-0/offset-0 — undetectable
    in pure JS; the OOB **DataView** cases DO pass since `.byteLength` throws), MessagePort
    /ImageBitmap/OffscreenCanvas transfer + detached/deleted MessagePort (no real
    transferable-platform machinery). Bonus `structuredclone_0.html` still TIMEOUTs — it's
    a cross-document `postMessage`/`MessageChannel` test, unrelated to the clone algorithm.

**Session 2026-06-16 (knight Claudius — Base64 Cipher, atob/btoa 164→380/380, +216):**
- **Real HTML-spec `btoa`/`atob` over a BYTE string.** The old `btoa` stub
  TextEncoder-encoded its arg (UTF-8!), so `btoa("\x80")` gave `"woA="` instead of
  `"gA=="`. Now `btoa` validates each code unit ≤ 0xFF (else InvalidCharacterError) and
  base64-encodes the latin1 bytes; `atob` implements WHATWG Infra **forgiving-base64
  decode** (strip ASCII whitespace, strip ≤2 trailing `=` only when len%4==0, fail on
  len%4==1 / stray `=` / non-alphabet junk, streaming 6→8-bit decode). **base64.any
  164→380/380 (100%).** Zero regressions (readAsDataURL 4/4, url-with-fetch 16/16, Blob
  69/73, filereader_result 8/12, qsa 1975, classlist 1420). Pure JS, ~10 lines each.

**Session 2026-06-16 (knight Claudius — Quest #14 Inc 2: the XML keystone, +46):**
- **A real namespace-aware XML `DOMParser` + the W3C `XMLSerializer`** — the keystone
  the campaign deferred for many sessions. All in `bootstrap.js`, no new Rust, built on
  the existing `createElementNS`/`setAttributeNS` namespace machinery.
  - **`_parseXMLDocument`** — a hand-rolled XML tokenizer (deliberately NOT html5ever
    nor xml5ever: html5ever lowercases + HTML-namespaces; xml5ever implements *XML5*
    which is error-recovering and can never emit a `parsererror`). Tracks an xmlns scope
    stack, resolves element/attr prefixes to declared URIs, builds the tree with real
    namespaces; text/CDATA/comment/PI/entity-ref/`<?xml?>` handling; non-well-formed →
    a Gecko-style `parsererror` document.
  - **`globalThis.XMLDocument`** defined so `!(doc instanceof XMLDocument)` holds — per
    the HTML spec, DOMParser's XML branch returns a plain `Document` (unlike
    createDocument/XHR). All four XML types route through the real parser.
  - **The W3C XML serialization algorithm** — namespace prefix map, generate-a-prefix
    (`ns${i}`), record-namespace-information, xmlns reset/redundancy, nearest-prefix
    selection, attr `&#x9;/&#xA;/&#xD;` escaping, `<div/>` self-close vs HTML `<div></div>`.
  - **Footgun fixed:** `new DocumentFragment()` (no nid) didn't allocate a backing node →
    `_nid` undefined → Rust ops read node 0 (the LIVE page!). Now allocates; also added
    DocumentFragment `append`/`prepend`/`childElementCount`.
  - **parseFromString-xml 0→20/20 (100%), XMLSerializer 3→27/29**; retroactively
    **Node-normalize 3→4/4**, **Element-tagName 5→6/6**. Zero regressions (qsa 1975,
    classlist 1420, createElement 147, url-origin 403, encoding 3421, iframe-load 2/2,
    content_document 1/1, isEqualNode 9/9, Range-clone/extract 177/159, cloneNode 103,
    appendChild 11/11). 2 serializer tails left are hard spec edges (XLink prefix =
    Chrome-specific; `xmlns=""` keep-vs-drop = mutually exclusive DOM-Parsing spec issue).

**Session 2026-06-16 (knight Claudius — Quest #14 The Parsing Foundry opened, +7):**
- **Real `DOMParser.parseFromString`** (was a stub returning the LIVE `globalThis.document`
  — a footgun where mutating a "parsed" doc mutated the real page). `text/html` now builds
  a real detached HTML document via `_IframeDocument`; `compatMode` reflects the DOCTYPE
  (CSS1Compat vs BackCompat); XML types build a detached doc with the right contentType +
  page URL; invalid type → TypeError. Made `_IframeDocument`'s compatMode/contentType/location
  getters honor the parser-set fields. **parseFromString-html 4→9/10, XMLSerializer 1→3/29.**
  Zero regressions (qsa 1975, classlist 1420, createElement 147, iframe-load 2/2). Inc 2 (the
  real keystone) = a namespace-aware XML parser + spec XMLSerializer — Scroll #14.
- **Also: the honest territory map.** A 25-realm stratified WPT baseline sweep
  (`scripts/wpt_baseline.py`) — the scriptable DOM core is 90–100% (traversal/events/
  collections/encoding/FileAPI), the frontiers are `fetch` (~18%), `domparsing` (~11%),
  CSSOM (~6%, needs render), `html/webappapis` (~36%: structuredClone is a JSON stub).

**Session 2026-06-16 (knight Claudius — Quest #04 The URL Swamps — Increment 3, +7):**
- **`///` special-authority-ignore-slashes.** For a special (non-`file`) base, a
  scheme-relative ref with 3+ leading slashes/backslashes skips them all before the
  authority (`///host` ≡ `//host`); rust-url rejects it. `collapse_special_authority_slashes`
  collapses the leading run to `//` before `b.join`. **constructor 840→847.** Zero
  regressions. Remaining constructor fails are `file:` drive-letter/slash + non-special
  backslash — rust-url structural divergences (a real WHATWG parser is the keystone).

**Session 2026-06-16 (knight Claudius — Quest #04 The URL Swamps — Increment 2, +16):**
- Two spec-correct post-processing fix-ups in `url_components_json`:
  **(1) path `^`→`%5E`** — rust-url's path percent-encode set omits U+005E; encode it
  across the path region only (query/fragment `^` stays literal). **(2) opaque-path
  trailing space → `%20`** — the WHATWG opaque-path serializer encodes the single
  space before `?`/`#`/EOF; recoverable only when a delimiter follows (rust-url trims
  the pure-trailing case). **constructor 833→840, setters 232→241.** Zero regressions.

**Session 2026-06-16 (knight Claudius — Quest #04 The URL Swamps — Increment 1, +50):**
- **userinfo setters stop stripping tab/newline.** `op_url_set` stripped `\t\n\r`
  from *every* part; WHATWG only strips for parser-based setters. The `username`/
  `password` setters percent-encode the value directly, so `\t`→`%09`, `\n`→`%0A`,
  `\r`→`%0D`. Strip moved per-part into `apply_url_setter`; userinfo gets the raw
  value (rust-url already C0-encodes). **`url-setters-stripping` 224→260/260 (100%).**
- **`URL.parse` / `URL.canParse` statics** added (`parse`→URL|null, never throws).
  **`url-statics-parse` 0→8/8 (100%).**
- **hostname `:` invalidates the whole value** (host-invalid-code-point → no-op,
  not truncation; `[IPv6]` still allowed) and **port whitespace-only → no-op**
  (only literal `''` clears). **`url-setters` 226→232.**
- Zero regressions (url-origin 403/403, url-with-fetch 16, url-with-xhr 14,
  url-format 6, Element-classlist 1420, Node-baseURI 9). New tool `scripts/wpt_fails.py`
  (dumps each non-pass subtest's name + assert message for bucketing). The remaining
  ~105 are rust-url-vs-WHATWG structural divergences (file: URLs, non-special empty-host
  `sc:///`, opaque trailing-space `%20`, `///` authority-slash-skip) — see Scroll #04.


**Session 2026-06-16 (knight Claudius — solidifying the tails, ~+34):**
- **#09b blob: URL byte store.** `createObjectURL` now mints spec `blob:{origin}/{uuid-v4}`
  and snapshots the byte-backed Blob's bytes; `fetch` strips the fragment, allows only GET,
  and rejects with TypeError on revoked/query/path. `Request`/XHR `open()` snapshot the blob
  at construction so a revoke-before-fetch still works. Surfaced + fixed an XHR hang (error
  path skipped `onreadystatechange`) and statusText. url-format 3→6/6, url-with-fetch
  1→16/16, url-with-xhr ~0→14/14. Tails: url-reload/in-tags need navigation/tag-loading.
- **#08b utf-16 EOF fix.** The utf-16 decoder coalesces a pending lead-surrogate and/or odd
  trailing byte into ONE U+FFFD at end-of-queue (was emitting two) — `textdecoder-mistakes`
  84→86/87 (only `fatal stream: iso-2022-jp` left).

**Session 2026-06-16 (knight Claudius — Quest #08b Legacy Encodings — ~+3900):**
- **The expensive ground: legacy encodings via `encoding_rs`.** Instead of embedding the
  large WHATWG index tables in JS, added a Rust op `op_text_decode` backed by `encoding_rs`
  (Gecko's reference encoder, already a workspace dep) and routed every non-utf encoding
  through it. `textdecoder-fatal-single-byte` ~half→**7168/7168** (all ISO-8859-*/KOI8/
  windows-125x, every byte), `gb18030-decoder` **275/275**, `gbk-decoder` **82/82**,
  `iso-2022-jp-decoder` **34/34**.
- **Stateless streaming trick:** with `last=false` `encoding_rs` holds back partial
  trailing sequences, so re-decoding a growing buffer only extends prior output — JS
  slices the new suffix. Wins `textdecoder-eof` Big5 `stream:true` (1/2→**2/2**) with no
  persistent Rust decoder state.
- **ASCII-only label lowercasing** — JS `.toLowerCase()` folds U+212A KELVIN→'k' and
  wrongly validated `'Koi8-r'`; fixed (`textdecoder-mistakes` 83→**84/87**).
- Tails (documented): SharedArrayBuffer; 2 utf-16-truncated subtests (JS utf-16 decoder);
  `fatal stream: iso-2022-jp` (needs decoder state to survive a mid-stream throw); the
  Ishida `*-decode.html` (HTML-parser charset) and XHR `overrideMimeType` suites are
  separate subsystems.

**Session 2026-06-16 (knight Claudius — Quests #08 Encoding + #09 FileAPI — ~+4000):**
- **#08 The Encoding Cipher — real TextEncoder/TextDecoder (~101 → ~3900).** Embedded
  the WHATWG label table (40 names, 228 labels) → `_getEncodingName` (trim ASCII ws,
  lowercase) powers RangeError on unknown/replacement labels (`api-invalid-label`
  0→**3421/3421**) and the `encoding` attribute (`textdecoder-labels` 0→**222/222**).
  Full WHATWG **utf-8** decoder (per-byte lower/upper bounds, fatal→TypeError;
  `textdecoder-fatal` 0→36/36), **utf-16le/be** with unpaired-surrogate handling,
  **windows-1252** + **x-user-defined**; **stateful streaming** (`{stream:true}` +
  flush; `textdecoder-streaming` 32/32, `-arguments` 4/4); BOM removal + ignoreBOM;
  code-point-aware `encodeInto` + lone-surrogate→U+FFFD (44→110/111).
- **#09 The FileAPI Vault — byte-backed Blob/File + real FileReader (~153 → ~330).**
  `Blob` over a `Uint8Array` (WebIDL sequence/dict guards — primitives throw,
  `Blob.length===0`; type normalization; `slice`/`text`/`arrayBuffer`/`bytes`/`stream`;
  native-EOL `endings`); `File extends Blob` (name/lastModified, `File.length===2`);
  `FileReader` on the unified event machinery — async reads (`readAsText`/`ArrayBuffer`/
  `DataURL`/`BinaryString`), `ProgressEvent`, on* handler attributes, abort, events as
  separate tasks. Blob-array-buffer/text/bytes/endings + readAs*/multiple-reads/events/
  event-handler-attributes/abort all **100%**.
- Zero regressions (events 25/25, classlist 1420, qsa 1975, Node-properties 726,
  handleEvent 6, iframe-load 2). Tails: Big5/legacy multi-byte (index tables),
  SharedArrayBuffer, element-`toString`, blob-URL byte store, `filereader_result`'s
  last 4 (event-loop microtask-drain timing).

**Session 2026-06-16 (knight Claudius — Quest #07 The Event Amphitheater — spec dispatch, +110):**
- **Unified spec-compliant event dispatch (DOM §2.9).** Replaced a bubble-only
  recursion (no capturing phase, no path to window, plus a stale `addEventListener(){}`
  no-op stub on `Node` that surfaced once Element/Document's own copies were removed)
  with one `_dispatchSpec`: every EventTarget (node / Document / window / iframe
  win+doc) stores listeners in one `_eventRegistry` keyed by `_evtRegKey`, and
  dispatch runs capturing (root→target) then bubbling (target→root) over a path
  built by `_eventParent` (parentNode → document.defaultView → window).
- **Event surface:** eventPhase constants, `cancelBubble`/`returnValue`,
  `composedPath()`, instance `isTrusted`, `type` coercion, `initEvent`/
  `initCustomEvent` mandatory-arg + `_initialized` flag; WebIDL guards
  (`dispatchEvent(null)`→TypeError, uninitialized/in-flight→InvalidStateError);
  option flattening before the null-callback check.
- **Event-class hierarchy:** UIEvent(view/detail) → Mouse/Keyboard/Focus/Composition/
  Input; Wheel/Pointer → Mouse; null-options → empty dict.
- **Trusted model:** public dispatch clears `isTrusted` (after the state check);
  UA events (frame load, main DOMContentLoaded/load) dispatch directly to stay
  trusted; legacy `window.event` set during dispatch.
- **Headline:** Event-subclasses-constructors 10→**49/49**, EventTarget-dispatchEvent
  4→**25/25**, Event-cancelBubble 0→**8/8**, Event-returnValue **7/7**, Event-propagation
  4→**7/7**, Event-constants 0→**4/4**, CustomEvent 1→**3/3**, EventListenerOptions-capture
  2→**4/4**, ~15 dispatch tests 0→1/1. **~110+ subtests, zero regressions.**


URL realm (`constructor 1→833`, `origin →403/403`, `setters 5→226`, `searchparams 1→4/4` + family),
`Element-classlist ~0→1315/1420`, `Node-appendChild 1→11/11`, `EventListener-handleEvent 1→6/6`,
iframe increments 1–4, `insertAdjacentText`, named-window access, frame-window realm fallback, and the
engine **hardened against URL-triggered crashes**.

**Session 2026-06-14 (knight Claudius):**
- **#13 Harness Gates — SECURED.** `createCDATASection`/`createProcessingInstruction` +
  real `DetachedDocument` (for `new Document()`, `implementation.createDocument`/
  `createHTMLDocument`/`createDocumentType`) replacing stubs that returned the live page;
  fixed a latent `Comment`/`PI` `textContent` bug. Unblocked all of `dom/ranges` +
  `dom/traversal` (no-results → ~7,600 measurable; `TreeWalker` 0→300/761).
  Bonus: `Node-cloneNode` 98→99. Tool added: `scripts/harness_probe.py`.
- **#01 Selector Sorcery — 1646 → 1917/1977 (97.0%).** Stable `Element::opaque()` identity
  (the keystone — un-corrupted the selectors-crate NthIndexCache, fixing all `:nth-*` /
  `*-of-type`, +151); CSS2 pseudo-elements parse-but-never-match (+80); `querySelector`
  WebIDL coercion (+~6); `:lang()` with ancestor inheritance (+26); `:link`/`:any-link`/
  `:visited` (+8). Commits `1342890`, `a6d8257`, `bc515c1`, `60b138d`.

**Session 2026-06-15 #13 (knight Claudius — Quest #06 Node-* — `Node-properties` 710→726/726 CONQUERED + `Node-replaceChild` →29/29):**
- **Four small spec-correctness fixes** bucketed from the tail:
  1. `nodeValue` (get/set) now covers every CharacterData kind — ProcessingInstruction(7)
     and CDATASection(4), not just Text(3)/Comment(8). Fixes PI `nodeValue`.
  2. `textContent` is `null` for Document(9) and DocumentType(10) — getter returns
     null, setter is a no-op (it used to wipe the document's children).
  3. `charset`/`inputEncoding` added as aliases of `characterSet` on all Document classes.
  4. `DocumentType.ownerDocument` honors its real node document (`_ownerDoc`), and
     `createDocument` sets the adopted doctype's `_ownerDoc`. (createHTMLDocument
     already did.)
- **710 → 726/726 (full conquest).** **Bonus:** fix #4 also closed the last
  `Node-replaceChild` subtest (cross-document doctype replace) — **28 → 29/29**.
- Zero regressions (createElement 147, createElementNS 596, attributes 67, appendChild
  11, cloneNode 103, normalize 3, isEqualNode 9, baseURI 9, lookupNamespaceURI 75, qsa
  1939, classlist 1315, getElementsByTagName 19, **Node-textContent 81/81**,
  Range-insertNode 909, Range-extractContents 159, iframe 2).

**Session 2026-06-15 #12 (knight Claudius — Quest #06 Node-* — `Node-baseURI` 0→9/9 CONQUERED):**
- **`baseURI` on `Node` and `Attr`** (was undefined → 0/9). New `_documentBaseURL(doc)`
  helper implements HTML's "document base URL": the first `<base>` with an `href`
  attribute resolved against the document URL (via the real `URL` parser), else the
  document's own URL (fallback base). `Node.baseURI` resolves the node document
  (a document node is its own node document); `Attr.baseURI` delegates through its
  `ownerDocument`. The iframe-doc `baseURI` getter still overrides for srcdoc/about:blank.
- **0 → 9/9.** Zero regressions (createElement 147, createElementNS 596, attributes
  67, appendChild 11, replaceChild 28, cloneNode 103, normalize 3, isEqualNode 9,
  lookupNamespaceURI 75, qsa 1939, classlist 1315, getElementsByTagName 19,
  Node-properties 710 unchanged).

**Session 2026-06-15 #16 (knight Claudius — Quest #12 Range content-ops — `Range-insertNode` 909→1531, `Range-surroundContents` 698→1247, +1171):**
- **Pre-insertion validity before the text split.** `Range.insertNode` split the
  start Text node *before* validating the node, so an invalid insert (Document,
  misplaced doctype, ancestor) threw only after mutating — failing the "resulting
  DOM unchanged" checks. New `__obscura_ensurePreInsertionValidity` (throw-only:
  parent type, host-including ancestor, reference-child, node-type, Text-in-Document
  / doctype-outside-Document) runs first. **insertNode +200.**
- **Live `DetachedDocument.doctype`.** The getter returned a construction-time cache,
  so a doctype appended/moved later (the Range tests' iframe setup does exactly this)
  was invisible — the tree comparison saw a null `.doctype` and the whole subtree
  mismatched. Now it scans children for a DocumentType. **insertNode +422,
  surroundContents +549** — one small primitive, ~970 subtests.
- Zero regressions (replaceChild 29, isEqualNode 9, Node-properties 726, classlist
  1420, qsa 1975, extractContents 159, cloneContents 177). Remaining ~309 insertNode
  tails are thin & varied: a doctype-ordering mismatch in the tree compare + an
  IndexSizeError in some range setups (e.g. paras[5] CDATA offsets).

**Session 2026-06-15 #15 (knight Claudius — Quest #03 The ClassList Mutation-Echo — `Element-classlist` 1315→1420/1420 SECURED 100%):**
The whole tail was three fixes, all rooted in mutation timing + DOMTokenList spec edges:
- **Eager mutation drain.** `__notifyMutation` now drains the Rust mutation queue
  immediately (then schedules async delivery) instead of only scheduling. A
  synchronous `takeRecords()` — which the classList test calls right after each op —
  now sees the record, and mutations that no *current* observer targets (e.g. a
  setup `setAttribute` before `observe()`) are discarded rather than leaking into a
  later observer. The classList `replace()` mutation-count assertion is the only
  DOMTokenList method whose count the test checks. **+90.** (A first attempt that
  drained inside `takeRecords()` regressed to 949 — it pulled *stale* pre-`observe()`
  records; draining at mutation time, when target lists are accurate, is the fix.)
- **`_write` doesn't materialize an empty attribute** when the attribute is absent
  and the token set is empty (DOM update steps), so `remove()` on a null class
  leaves it null. **+10.**
- **`replace()` validates empty (SyntaxError) on both tokens before whitespace
  (InvalidCharacterError)**, so `replace(" ", "")` throws SyntaxError. **+5.**
- **Bonus, zero regressions:** the eager drain also lifted MutationObserver-childList
  26→31, -takeRecords 1→3, -disconnect 1→2 (+8). Verified by rebuilding the parent
  commit to compare. qsa 1975, attributes 67, Node-properties 726, createElement 147 held.

**Session 2026-06-15 #14 (knight Claudius — Quest #01 The Selector Sorcery — `ParentNode-querySelector-All` 1939→1975/1975 SECURED 100%):**
Five increments cleared the entire tail:
- **`::slotted()`** functional pseudo-element parses-but-never-matches (mirror of
  the CSS2 pseudo-element fix; cssparser auto-closes the unterminated-paren form). **+16.**
- **Iframe docs preserve `<html>/<head>/<body>` attributes.** `_IframeDocument`
  regex-stripped those start tags (with their attrs) before parsing into a synthetic
  scaffold; now it copies the start-tag attributes onto the scaffold first. Fixes
  the html/body type selectors, `:root`, AND `:lang` inheritance (lang lived on
  `<html>`) in the iframe Document context. Paired with **`:link` matches only
  `a`/`area`** (not `<link>` elements). **+10.**
- **Real `:target`** — DomTree `target_id` + `PseudoClass::Target`; JS primes the
  queried document's URL fragment (resolved by walking the node to its document
  root) before a `:target` query. **+4.**
- **Real `NodeList`** — `extends Array` (keeps indexing/iteration/spread/array
  methods internal callers rely on), `Symbol.species → Array`; qsa returns it. **+4.**
- **`:root` distinguishes a real document from a fragment** — `create_document_fragment`
  backs both, so a `real_documents` set (DetachedDocument marks its node; main doc
  is implicit) lets `is_root()` match a document's root element but not a fragment's
  child. **+2.**
- Zero regressions throughout; selector.rs unit tests 17→19; obscura-dom 40/40.
  Bonus: Element-matches 624→630.

**Session 2026-06-15 #11 (knight Claudius — Quest #06 Node-* — `Node-isEqualNode` 4→9/9 CONQUERED):**
- **Spec per-interface `isEqualNode`** (was a nodeName/nodeValue approximation).
  DOM §4.5: switch on nodeType — DocumentType (name/publicId/systemId), Element
  (namespaceURI + prefix + localName, then attribute-**set** equality matched by
  ns+localName+value, *ignoring prefix*), ProcessingInstruction (target/data),
  Text/CDATA/Comment (data) — then equal child count + recursive child equality.
- **Root-cause the documents subtest:** `createDocument(xhtmlNS, …)` now sets the
  doc's content type to `application/xhtml+xml`, so its `createElement` produces
  HTML-namespace head/body — structurally identical to `createHTMLDocument`. (SVG
  ns → image/svg+xml.) The 'xhtml' createMode + `_contentType` plumbing already
  existed; createDocument just wasn't using it.
- **4 → 9/9.** Zero regressions (createElement 147, createElementNS 596, attributes
  67, appendChild 11, replaceChild 28, cloneNode 103, normalize 3, lookupNamespaceURI
  75, qsa 1939, classlist 1315, Range-insertNode 909, getElementsByTagName 19, iframe 2).

**Session 2026-06-15 #10 (knight Claudius — Quest #06 Node-* — `Node-normalize` 0→3/4):**
- **Real `normalize()`** (was a no-op stub). DOM §4.5: walk every descendant
  exclusive Text node in tree order; drop it if empty, else absorb its following
  contiguous Text siblings (`nodeType === 3`) and remove them. CDATASection is
  nodeType 4, so the same predicate skips it for free. Snapshot-then-process with a
  `parentNode` liveness check so nodes already absorbed by an earlier run are skipped
  (and removed nodes keep their old `data`, as the test asserts). Range-endpoint
  adjustment intentionally omitted — the WPT test doesn't exercise it.
- **0 → 3/4.** Zero regressions (createElement 147, attributes 67, appendChild 11,
  replaceChild 28, cloneNode 103, isEqualNode 4). Last fail = the XML subtest
  (`new DOMParser().parseFromString(…, "text/xml")` + `createCDATASection`/
  `createProcessingInstruction`) — the deferred XML realm, not a normalize gap.

**Session 2026-06-15 #9 (knight Claudius — Quest #06 Node-* — `Node-replaceChild` 5→28/29):**
- **Full DOM "replace" algorithm.** Pre-replacement validity (parent type, node
  inclusive-ancestor, child-is-a-child → NotFoundError, valid node type, Text-in-
  Document / doctype-outside-Document) + the Document-parent constraints evaluated
  excluding `child` (at-most-one element child, doctype/element ordering, fragment
  element/text limits). Then the reference-child adjustment + remove/insert via our
  existing primitives. Caught a Rust `insert_before` adjacency quirk (replace-with-
  next-sibling dropped the node) — guarded by skipping the re-insert when the node
  is already correctly placed after removal.
- **5 → 28/29.** Zero regressions (appendChild 11, cloneNode 103, lookupNamespaceURI
  75, createElementNS 596, Range-insertNode 909, attributes 67, classlist 1315, qsa
  1939, iframe 2, getElementsByTagName 19). Last fail = cross-document doctype
  replace (needs DetachedDocument doctype node tracking — a distinct fix).

**Session 2026-06-15 #8 (knight Claudius — Quest #06 Node-* — `Node-lookupNamespaceURI` 0→75/75):**
- **DOM namespace resolution** (`lookupNamespaceURI`/`lookupPrefix`/`isDefaultNamespace`
  on Node + the standalone Attr). Recursive "locate a namespace"/"locate a prefix":
  an element's own namespace (when its prefix matches) wins over its `xmlns`
  attributes; `xml`/`xmlns` are built-in at the element level; Attr resolves through
  its owner element; Document through its documentElement; DocumentType/Fragment → null.
  Directly leverages the real namespace/Attr/HTMLElement machinery from #02/#11.
- **0 → 75/75 (100%).** Zero regressions (createElementNS 596, attributes 67,
  appendChild 11, cloneNode 103, getElementsByTagName 19). Two bugs caught in the
  loop: `lookupNamespaceURI(null)` was `String(null)`→"null" (default-namespace
  lookups broke), and Attr (a standalone class) needed the methods mirrored.
- Remaining Node-* veins for next time: `Node-replaceChild` 5/29 (mutation
  pre-insertion validity), `Node-isEqualNode` 4/9, `Node-normalize` 0/4.

**Session 2026-06-15 #7 (knight Claudius — the createElementNS tail — CONQUERED 587→596/596):**
- **`importNode` into the target document** (Tail A): `cloneNode(deep, _targetDoc)`
  threads the importing document so the copy's `ownerDocument` (and `tagName`
  casing) reflects it; `document.importNode` passes `this`. `Element-tagName` 3→5.
- **Real `HTMLElement` hierarchy** (Tail B): `HTMLElement` is now a true subclass
  of `Element` (was an alias, so everything was an HTMLElement); added
  `HTMLUnknownElement`/`HTMLSpanElement`; `createElementNS` picks the wrapper class
  by namespace (non-HTML → `Element`; HTML → specific by lowercase tag, else
  `HTMLUnknownElement`), `_elementClassFor` maps the parsed/createElement path.
  Closed the 9 `instanceof` subtests → **`Document-createElementNS` 596/596 (100%)**.
- **Bonus** `Node-cloneNode` 101→103. **Zero regressions** (appendChild 11,
  classlist 1315, handleEvent 6, qsa 1939, children 2, getElementsByClassName 3,
  iframe-load 2, Range 909, createElement 147, attributes 67); capture + instanceof
  sanity clean. Last `Element-tagName` fail (1) needs real `DOMParser` XML parsing.

**Session 2026-06-15 #6 (knight Claudius — foreign-namespace createElementNS — Quest #11 SECURED, createElementNS 85→587):**
- **Real foreign-namespace element creation.** New Rust op `create_element_ns`
  builds a node with a true `QualName` (namespace + prefix + case-preserved local)
  instead of a faked HTML node. JS `Document.createElementNS` rewritten:
  validate-and-extract (the real algorithm — split on first colon, local must be a
  valid element name, colon needs a non-empty prefix; xml/xmlns `NamespaceError`
  rules), then create the real node and pin `_ns`/`_nsSet`/`_prefix`/`_localName`
  on the wrapper. Getters fixed: `namespaceURI` (honours an explicit null),
  `localName`/`tagName` (case-preserved; HTML-ns-in-HTML-doc uppercases),
  **`nodeName` now === `tagName`** (was a separate uppercasing op — the keystone:
  +250 createElementNS subtests). `cloneNode` recreates foreign/case-preserved
  elements via `createElementNS`.
- **Results:** `Document-createElementNS` 85→**587/596**; **`getElementsByTagName`
  19/19, `getElementsByTagNameNS` 16/16, `Document-getElementsByTagName` 18/18 —
  all 100% (Quest #11 SECURED)**; `querySelector-All` 1923→**1939** (+16, foreign-ns
  helps namespace/type selectors); `cloneNode` held 101. **Zero regressions**
  across createElement/attributes/appendChild/classlist/TreeWalker/
  compareDocumentPosition/iframe/Range; captures clean. Tail (12 subtests) needs
  `importNode`/`adoptNode` (tagName recompute on ownerDocument change).

**Session 2026-06-14 #5 (knight Claudius — Quest #11 The Collections Armory — increment 1, +33):**
- **A live `HTMLCollection` (Proxy) + Rust matching ops.** New Rust ops
  `get_elements_by_tag_name` (spec match: HTML-ns case-folded vs non-HTML
  case-sensitive, `*` = all), `get_elements_by_tag_name_ns` (`*` wildcards, ``=null
  ns), `get_elements_by_class_name` — all over `dom.descendants`, tree order.
  JS `globalThis.HTMLCollection` + a Proxy giving WebIDL semantics: live indexed
  access, supported-property-name access (id of any element + name of any HTML-ns
  element, single tree-order pass), expandos, index-set protection,
  `ownKeys`/`getOwnPropertyDescriptor`. Wired `getElementsByTagName(NS)`,
  `getElementsByClassName`, and `.children` on Element + Document. Added a minimal
  `globalThis.NodeList` so `x instanceof NodeList` is answerable.
- **Results:** `getElementsByClassName` 1→3/3, `Element-children` 0→2/2,
  `HTMLCollection-empty-name` 0→7/7 (all 100%); `getElementsByTagName` 4→12/19,
  `Document-getElementsByTagName` 3→11/18, `getElementsByTagNameNS` 0→7/16.
  **Zero regressions.** The remaining ~23 all need **real foreign-namespace
  `createElementNS`** (today it fakes `_ns` on the JS wrapper; the Rust node stays
  HTML-ns lowercased) — the clear next lever (also helps namespaceURI/cloneNode).

**Session 2026-06-14 #5 (knight Claudius — Quest #02 The Attr-Node Codex — CONQUERED 11 → 67/67):**
- **A real `Attr` node model over namespace-aware Rust storage.** Rust (`tree.rs`/
  `ops.rs`): namespace + qualified-name attribute methods alongside the local-keyed
  ones the selector/serializer use; ops `get/set/remove_attribute_ns` +
  `attribute_list`; existing get/set/remove switched to qualified-name matching.
  JS (`bootstrap.js`): real `Attr` (live value while attached, own value while
  detached) + `NamedNodeMap` (off-instance `WeakMap` state → correct
  `getOwnPropertyNames` shape) + per-element identity cache
  (`el.attributes[i] === getAttributeNode(name)`) + `get/setAttributeNode(NS)` +
  `removeAttributeNode` + `createAttribute(NS)` + DOM validate-and-extract
  (`xml`/`xmlns` `NamespaceError` rules) + HTML-only attribute lowercasing.
- **Two stragglers pinned by CDP probe:** moved-Attr value loss (snapshot the
  value *before* the removal op) and `el.style = "…"` now reflecting to the
  `style` content attribute (also a rendering-fidelity win).
- **Bonus** `Node-cloneNode` 99→101 (namespace-aware clone copy). **Zero
  regressions** across every held realm; real-page captures clean.

**Session 2026-06-14 #4 (Quest #05 The Element Forge — CONQUERED 0 → 147/147):**
- **The XML siege — XML+XHTML document iframes.** The remaining 98 subtests needed
  real XML-document mode in frames. `_IframeDocument` now takes a `kind`
  (html/xhtml/xml from content-type or `.xml`/`.xhtml` extension): an **xml** doc gets
  NO synthetic scaffold — its `documentElement` is the parsed root (`<foo>`); **xhtml**
  scaffolds like html but creates elements case-sensitively. `DetachedDocument` gained
  a `_createMode` + `_createElementXML` (case-preserved `localName`===`tagName`,
  `prefix` null, `namespaceURI` null for XML / HTMLNS for XHTML — pinned as own-props
  shadowing the HTML-casing getters). **Keystone:** the parent `load` event now WAITS
  for markup iframes (HTML "delay-the-load-event") — a new `__startFrameLoads()` fires
  at DOMContentLoaded and `page.rs` pumps to network-idle (`pump_until_idle`) BEFORE
  dispatching `load`; without this the test reads the frames before they finish loading.
  XHTML trailing-`</html>\n` text-node trimmed. Zero regressions (Quest #12 range
  iframes 909/177/103 intact, all held realms green, 104+35 unit, real-page capture OK).
- **HTML doc (the first 49).** WebIDL string coercion — `createElement(null)`→`"null"`,
  `undefined`→`"undefined"` (was crashing on `arg.toLowerCase()`); `_isValidElementName`
  → `InvalidCharacterError` for the invalid set; **ASCII-only** `_asciiLower`/`_asciiUpper`
  (so `marK`(KELVIN)/`İ`/`ı` survive); real `namespaceURI` (new Rust `op_dom "namespace_uri"`
  reading `QualName.ns` — `createElement('svg')` is HTML-ns) + `prefix`→`null`. Bonus:
  lifted `querySelector-All` 1917→1923. Commit `db7f923`.

**Session 2026-06-14 #4-prior (Quest #05 The Element Forge — HTML doc taken):**
- **`Document-createElement` 0 → 49/147.** Every HTML-document subtest passes.
  Four fixes: (1) WebIDL string coercion — `createElement(null)`→`"null"`,
  `undefined`→`"undefined"` (was crashing on `arg.toLowerCase()`); (2) element-name
  validation throwing `InvalidCharacterError` for the `invalid` set (empty / leading
  digit·`-`·`.`·`<`·`}` / whitespace / `>`), via `_isValidElementName`; (3) **ASCII-only**
  case folding (`_asciiLower`/`_asciiUpper`) so `marK` (KELVIN), `İ`, `ı` survive
  instead of being Unicode-folded by `String.prototype.toLowerCase`; (4) real
  `namespaceURI` (new Rust `op_dom "namespace_uri"` reading the node's actual `QualName.ns`
  — so `createElement('svg')` is HTML-namespaced, not mistaken for a parsed `<svg>`) +
  a `prefix` getter returning `null` not `undefined`. **Bonus:** the real `namespaceURI`
  lifted `querySelector-All` 1917→1923. Zero regressions (104 unit + held realms green).
- **Left for #05:** the XML (49) + XHTML (49) subtests — they need real **XML-document
  mode in iframes**. `_IframeDocument` is hardcoded `super('html')` with a synthetic
  `<html><head><body>` and HTML parsing; the `.xml`/`.xhtml` fixtures need a document
  whose `documentElement` is the parsed root (`<foo>`) and an XML-mode `createElement`
  (case-preserved `localName`/`tagName`, `namespaceURI` `null`/HTMLNS). A distinct siege.

**Session 2026-06-14 #3 (Quest #12 The Iframe Frontier):**
- **Content-op ranges — +2046 subtests, all 5 tests 0→.** `Range-insertNode`
  0→909/1840, `surroundContents` 0→698/1840, `cloneContents` 0→177/187,
  `deleteContents` 0→103/125, `extractContents` 0→159/187. Root unlock: real
  per-iframe JS realms — frame classic scripts run as one concatenated program and
  their top-level declarations are hoisted onto the frame window (in a `finally`, so
  a mid-script throw still attaches `run`/`setupRangeTests`); the parent realm drives
  the frame via `contentWindow.run()`. Plus a **node-backed `_IframeDocument`**
  (extends `DetachedDocument` → real childNodes/firstChild/appendChild/removeChild/
  doctype, live documentElement/head/body) and a **recursive `cloneNode(deep)`**
  (was `outerHTML`-into-`<div>`, which dropped `<html>/<head>/<body>` and was O(N²)).
  Zero regressions; 143 unit tests green. See Scroll #12 for the deferred FIX-B fork
  (frame platform-globals snapshot — reverted; exposed a clone node-identity hang in
  `surroundContents`).

**Session 2026-06-14 #2 (Quest #10 The Traversal Labyrinth):**
- **Traversal — CONQUERED.** Real `NodeIterator` (1→766/766, was a TreeWalker alias),
  spec `TreeWalker` (300→761/761, real FILTER_REJECT subtree-pruning vs SKIP, active
  flag, validating currentNode), `NodeIterator-removal` 0→23/23 (pre-removing steps +
  WeakRef live-iterator registry), full `NodeFilter` constant set, `createHTMLDocument`
  now prepends `<!DOCTYPE html>`. Commits `070ab6f`, `1f7a428`.
- **Range — built from a no-op stub.** Boundary-point model + all comparison/positioning/
  selection/mutation algorithms (content ops verified correct in isolation):
  `comparePoint` 0→5518/5580, `Range-set` 0→10838/10920, `compareBoundaryPoints`
  0→8665/9313, `isPointInRange` 0→5521/5733, `intersectsNode` 0→2356/2356,
  `stringifier` 5/5, + selectNode/collapse/cloneRange/commonAncestor 96–100%. `828ee41`.
- **Node identity — the keystone bug, fixed.** The global `document`, `DetachedDocument`
  fragments, and `DocumentType` nodes now each have ONE canonical wrapper (seeded into
  `_cache`), so `documentElement.parentNode === document`, `doctype === childNodes[i]`,
  etc. This was the long-standing "harness node-identity mystery" — it gated traversal,
  un-hung `Range-set`, and as a bonus made `compareDocumentPosition` real (hardcoded `4`
  → true tree order; +DOCUMENT_POSITION_* consts) → `Node-compareDocumentPosition`
  →1444/1444. Zero regressions; 143 unit tests green.
- **Left for #12:** the iframe-harness ranges content-op tests (~6k subtests) and the
  CDATA-in-HTML fixture (`paras[5]`, ~few hundred subtests, needs real CDATA nodes in
  the Rust DOM rather than coalescing text nodes).
