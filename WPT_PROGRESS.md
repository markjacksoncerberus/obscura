# WPT Conformance Progress — Campaign Ledger

Tracks the Web Platform Tests we've worked on and their latest pass/total ratios,
measured via `scripts/wpt_run.py` over CDP against a `--features render` server.

**How to reproduce a row:**
```sh
cargo build --release --features render
./target/release/obscura serve --port 9222 --render-mode on-demand --stealth &
.venv/bin/python scripts/wpt_run.py <test-path> --base https://wpt.live
```

Branch: `engine-per-page-threads`. Last updated: 2026-06-13.

## Scoreboard

| Test | Before | Latest | Status | Quest / commit |
|------|:------:|:------:|:------:|----------------|
| `url/url-constructor.any.html` | 1/890 | **833/890** | ⬆️ | URL Grimoire `656e7ea` + cleanup `2c67057` |
| `url/url-origin.any.html` | n/a¹ | **403/403** | ✅ 100% | URL Grimoire + cleanup `2c67057` |
| `dom/nodes/Element-classlist.html` | ~0 | **1315/1420** | ⬆️ | Real DOMTokenList |
| `dom/lists/DOMTokenList-value.html` | 0/1 | **1/1** | ✅ | ″ |
| `dom/lists/DOMTokenList-iteration.html` | 0/6 | **5/6** | ⬆️ | ″ |
| `dom/lists/DOMTokenList-coverage-for-attributes.html` | n/a | **150/175** | ⬆️ | ″ |
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
| `dom/nodes/Node-cloneNode.html` | 98/135 | Stable; unblocked from a render crash by `insertAdjacentText` `259fe6b`. |
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
