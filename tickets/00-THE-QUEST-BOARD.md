# 🏰 The Quest Board — Web Platform Conformance Campaign

> *Hear ye! These scrolls chart every unconquered realm of the Web Platform Tests
> still standing between Obscura and a kingdom safe for all AI-agent travellers.
> Each scroll names a region, its current hold, the beasts within, and a battle
> plan. Choose thy banner.*

Measured via `scripts/wpt_run.py` over CDP against a `--features render` server.
Live scoreboard of conquered lands: [`../WPT_PROGRESS.md`](../WPT_PROGRESS.md).

---

## ⚔️ Open Quests

| # | Scroll | Realm | Hold | Difficulty | Bounty |
|---|--------|-------|:----:|:----------:|:------:|
| 01 | [The Selector Sorcery](01-the-selector-sorcery.md) | `dom/nodes/ParentNode-querySelector-All` | 1917/1977 | ⚔️⚔️ | ~60 left |
| ~~02~~ | ✅ [The Attr-Node Codex](02-the-attr-node-codex.md) | `dom/nodes/attributes` | **67/67** | ⚔️⚔️⚔️ | **SECURED** |
| 03 | [The ClassList Mutation-Echo](03-the-classlist-mutation-echo.md) | `dom/nodes/Element-classlist` | 1315/1420 | ⚔️⚔️ | ~105 |
| 04 | [The URL Swamps](04-the-url-swamps.md) | `url/url-constructor`, `url/url-setters` | 833+226 | ⚔️⚔️⚔️ | ~110 |
| ~~05~~ | ✅ [The Element Forge](05-the-element-forge.md) | `dom/nodes/Document-createElement` | **147/147** | ⚔️⚔️⚔️ | **SECURED** |
| 06 | [The Node-Smithing Vaults](06-the-node-smithing-vaults.md) | `dom/nodes/Node-*` | mixed | ⚔️⚔️ | ~150 |
| 07 | [The Event Amphitheater](07-the-event-amphitheater.md) | `dom/events/*` | mixed | ⚔️⚔️ | ~? |
| 08 | [The Encoding Cipher](08-the-encoding-cipher.md) | `encoding/*` | 2/6+ | ⚔️⚔️ | ~? |
| 09 | [The FileAPI Vault](09-the-fileapi-vault.md) | `FileAPI/*` | 4/8+ | ⚔️⚔️ | ~? |
| 10 | [The Traversal Labyrinth](10-the-traversal-labyrinth.md) | `dom/ranges`, `dom/traversal` | ⚔️ traversal **DONE**; ranges 90%+ | ⚔️⚔️⚔️ | iframe content-ops left |
| ~~11~~ | ✅ [The Collections Armory](11-the-collections-armory.md) | `dom/collections`, getElementsBy* | **getElementsBy\* all 100%** | ⚔️⚔️ | **SECURED** |
| 12 | [The Iframe Frontier](12-the-iframe-frontier.md) | `dom/ranges` content-ops (per-iframe realms) | ⚔️ **+2046** (5 tests 0→) | ⚔️⚔️⚔️ | surround/clone tails + re-land FIX B |
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
