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
