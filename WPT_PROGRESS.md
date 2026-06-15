# WPT Conformance Progress — Campaign Ledger

Tracks the Web Platform Tests we've worked on and their latest pass/total ratios,
measured via `scripts/wpt_run.py` over CDP against a `--features render` server.

**How to reproduce a row:**
```sh
cargo build --release --features render
./target/release/obscura serve --port 9222 --render-mode on-demand --stealth &
.venv/bin/python scripts/wpt_run.py <test-path> --base https://wpt.live
```

Branch: `engine-per-page-threads`. Last updated: 2026-06-14.

## Scoreboard

| Test | Before | Latest | Status | Quest / commit |
|------|:------:|:------:|:------:|----------------|
| `url/url-constructor.any.html` | 1/890 | **833/890** | ⬆️ | URL Grimoire `656e7ea` + cleanup `2c67057` |
| `url/url-origin.any.html` | n/a¹ | **403/403** | ✅ 100% | URL Grimoire + cleanup `2c67057` |
| `dom/nodes/ParentNode-querySelector-All.html` | 1396/1977 | **1969/1975** | ⬆️ | Quest #01 + #05 `namespaceURI`; +16 real foreign-ns `createElementNS` (Quest #11); +16 `::slotted()` parse-but-never-match; +10 iframe docs preserve `<html>/<head>/<body>` attrs + `:link` only `a`/`area`; +4 real `:target` (URL-fragment id, primed onto the tree per query) (Quest #01) |
| `dom/nodes/Document-createElement.html` | 0/147 | **147/147** | ✅ 100% | Quest #05: WebIDL coercion + InvalidCharacterError validation + ASCII-only casing + real `namespaceURI`/`prefix`; XML-document iframes (case-sensitive createElement, parsed-root documentElement) + iframes-delay-parent-load |
| `dom/nodes/Element-classlist.html` | ~0 | **1315/1420** | ⬆️ | Real DOMTokenList |
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
| `dom/nodes/Element-tagName.html` | 3/6 | **5/6** | ⬆️ | Quest #11: case-preserved tagName + `importNode` clones into the target document; last needs real `DOMParser` XML |
| `dom/nodes/Node-lookupNamespaceURI.html` | 0/75 | **75/75** | ✅ 100% | Quest #06: `lookupNamespaceURI`/`lookupPrefix`/`isDefaultNamespace` (locate-a-namespace walk; element own-ns before xmlns attrs; `xml`/`xmlns` built-ins; Attr delegates to owner) |
| `dom/nodes/Node-replaceChild.html` | 5/29 | **29/29** | ✅ 100% | Quest #06: full DOM "replace" algorithm (pre-replacement validity + Document doctype/element constraints + reference-child adjacency); last subtest (cross-document doctype replace) closed by the doctype `ownerDocument`/adoption fix |
| `dom/nodes/Node-normalize.html` | 0/4 | **3/4** | ⬆️ | Quest #06: real `normalize()` (drop empty exclusive Text nodes; absorb following contiguous Text siblings; CDATASection skipped via nodeType); last needs XML `DOMParser`+`createCDATASection`/`createProcessingInstruction` |
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
| `dom/ranges/Range-insertNode.html` | 0/1840 | **909/1840** | ⬆️ | Quest #12: real per-iframe JS realms (frame-script decl hoist) + node-backed iframe doc + recursive cloneNode |
| `dom/ranges/Range-surroundContents.html` | 0/1840 | **698/1840** | ⬆️ | Quest #12 ″ |
| `dom/ranges/Range-cloneContents.html` | 0/187 | **177/187** | ⬆️ | Quest #12 ″ |
| `dom/ranges/Range-deleteContents.html` | 0/125 | **103/125** | ⬆️ | Quest #12 ″ |
| `dom/ranges/Range-extractContents.html` | 0/187 | **159/187** | ⬆️ | Quest #12 ″ (+2046 content-op subtests total, from 0) |
| `url/url-setters.any.html` | 5/279 | **226/279** | ⬆️ | Setters' Sigil + host/port/tab-strip batch |
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
