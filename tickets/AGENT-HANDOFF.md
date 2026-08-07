# 🤝 Handoff to the Next Coding Agent — Obscura WPT Conformance Campaign

> Welcome, comrade. You're joining an ongoing, friendly campaign to make **Obscura**
> — a lightweight browser engine for AI agents on modest/legacy hardware — pass more
> of the **Web Platform Tests**. Every test we turn green is one more thing that Just
> Works for someone who can't afford a heavyweight browser. That's the why. Now the how.

Branch: **`engine-per-page-threads`**. Work here, commit small, push when asked.

---

## 1. Orient yourself first (read these, in order)

1. [`WPT_PROGRESS.md`](../WPT_PROGRESS.md) — the live scoreboard. Every test worked
   on, before→after ratios. **Trust these numbers, not your memory.**
2. [`00-THE-QUEST-BOARD.md`](00-THE-QUEST-BOARD.md) — open quests, the **Captain's
   Counsel** (recommended order), and a per-session chronicle of what was done & why.
3. The individual scrolls `NN-*.md` — each realm's bucketed failure analysis + battle plan.

Then skim the architecture below so you know where the levers are.

---

## 2. The dev loop (how to actually make + measure a change)

Almost everything is one of two files:
- **`crates/obscura-js/js/bootstrap.js`** — the JS prelude: every Web API, the DOM
  (`Node`/`Element`/`Document`/`Attr`/`NamedNodeMap`/`HTMLCollection`/…), event
  dispatch, iframes, ranges. This is **embedded in the binary** — you MUST rebuild
  after editing it.
- **`crates/obscura-js/src/ops.rs`** — the Rust `op_dom` bridge (string-marshalled
  IPC between JS and the Rust DOM). Add ops here when JS needs real tree/data access.
- The Rust DOM itself is **`crates/obscura-dom/src/tree.rs`** (+ `selector.rs`,
  `serialize.rs`). Attributes carry a full `QualName` (ns/prefix/local).

**The loop:**
```sh
# 1. build (the --features render flag is REQUIRED — a plain build can't serve)
cargo build --release --features render

# 2. (re)start the server — see the gotcha about pkill below
pkill -f "obscura serve"            # run this ALONE (its exit code aborts a chained &&)
./target/release/obscura serve --render-mode on-demand --stealth --window-size 1280x2000 &

# 3. measure against real WPT over CDP
python3 scripts/wpt_run.py --verbose --timeout 30 dom/nodes/SOME-TEST.html
```
- `scripts/wpt_run.py` — drives a test over CDP, prints pass/fail (use `--verbose`
  for failing-subtest names; the regex undercounts, so also probe directly).
- `scripts/harness_probe.py` / direct CDP probes — for pinning a specific failure.
- `scripts/cdp_capture.py <url> <prefix>` — render a real page (sanity-check that a
  broad change didn't break rendering).

**Fast iteration trick:** reproduce a failing subtest's exact behaviour with a tiny
CDP `evaluate` probe (see `/tmp/probe_*.py` examples in past sessions). It's far
faster than full rebuilds for diagnosing *why* something fails.

---

## 3. Hard-won gotchas (these will save you hours)

- **⚠️⚠️ THE SERVER DEGRADES AFTER A HANDFUL OF CDP SESSIONS — MEASURED, 2026-08-07.
  Use `scripts/wpt_batch.sh`, not one long sweep.** A 30-file `xhr` sweep managed
  **five files in twenty-five minutes**; the same first file against a *fresh*
  server takes **ten seconds**. Worse, the degradation is CONTAGIOUS and silent:
  once one file wedges the server, every row below it reads `nav-error` or
  `testharness did not load`, which is indistinguishable from a regression if you
  only read the table. Two whole measurement cycles were lost to this before it
  was understood.
  ```sh
  scripts/wpt_batch.sh <tests-file> <out-file> [chunk-size=5] [timeout=20]
  ```
  It splits the list, restarts the server per chunk, and recomputes the totals
  from the collected rows so the summary cannot drift from them. A chunk size of
  **2** is what the recent arcs used. `scripts/wpt_sweep.sh` is the single-shot
  version for one file.
- **A synchronous XHR blocks the ENGINE THREAD, including CDP.** That is spec-correct
  for the page, but it means one bad sync request takes the whole browser with it —
  and it was doing exactly that until Quest #493 added Fetch's forbidden-header
  rule. If a sweep goes quiet, look for sync XHR in the test before suspecting your
  own change.
- **The bash tool caps a foreground command at 10 minutes.** Anything longer must
  run in background mode. And a waiter written as
  `until ! pgrep -f "wpt_run.py …"` **matches its own command line** and therefore
  never fires — wait on a recorded PID (`while kill -0 $PID`) instead.
- **⭐⭐ If a realm is a pure function of its input, lift the function out and test
  it in Node.** `scripts/sse_parse_test.mjs` runs 36 assertions over WPT's own
  EventSource inputs in under a second — each input fed whole AND one byte at a
  time — and found two real bugs before a single CDP cycle. `mimesniff` (Quest
  #492) and `eventsource` (Quest #494) both paid for this twice over.

- **Read the REAL WPT source before fixing.** `curl` the test's `.html`/`.js` from
  `https://wpt.live/...`. Guessed repros give false greens. Several tests use *stub*
  productions (e.g. `attributes.html`'s `productions.js`) that differ wildly from spec.
- **Verify a WPT path exists** (`curl` it) before concluding "the harness won't load."
  A 404 ≠ a broken harness.
- **`pkill -f "obscura serve"` returns exit code 143/144** (the signal). If you chain
  it (`pkill ... && cargo ...`) the chain ABORTS. Run pkill on its own line. Launch
  long-lived servers via your tool's background mode, not a bare shell `&` (it may not
  survive the shell-snapshot eval wrapper). Kill ALL `obscura serve` — duplicates on
  :9222 wedge each other.
- **A realm reporting NO SCORE is not a realm scoring badly.** Five separate times
  now a "0%" or "tiny" region turned out to be invisible instead: a missing
  `test_driver` bridge (`cookies`), a missing global (`WebCryptoAPI`), a denominator
  that SHRANK because the subtests did not exist (`wrapKey_unwrapKey`), a survey list
  that sampled 0.07% of a realm (`selection`), and **a test whose own form submission
  navigated the page away, taking the harness with it** (`encoding` — Quest #476).
  Always read the harness column, not just the ratio.
- **Get the file list AND a Chrome baseline in one request** — the can't-404 method:
  `curl "https://wpt.fyi/api/runs?label=master&product=chrome&max-count=1"` →
  `results_url` → `{"/path": {"s": status, "c": [pass, total]}}`. Aggregating that by
  realm is what found `encoding` (1,152,339 subtests, the largest on the platform)
  hiding behind a scoreboard row that made it look already-held.
- **`Response.text()` is the wrong tool for a DOCUMENT.** It is specified to always
  decode utf-8 — correct for fetch, catastrophic for a navigation, because a document
  declares its own encoding (HTML §13.2.3.2). It returns a string and never throws, so
  every "did it load" test passes; only looking at a *character* reveals it.
- **⭐ If a realm is a PURE FUNCTION of its input, test it offline first.**
  `mimesniff/mime-types/parsing.any.js` is 955 input strings and their exact
  expected serializations, in two JSON files. Lifting the parser and serializer
  out of `bootstrap.js` into a standalone Node script and running them against
  WPT's own `mime-types.json` + `generated-mime-types.json` took **under a
  second** and pinned both remaining bugs. A 20-second-per-file CDP sweep is the
  wrong tool for a string algorithm.
- **⚠️⚠️ A BIG GREEN NUMBER IS NOT EVIDENCE ON ITS OWN — WPT CONTAINS FILES THAT
  CONTRADICT EACH OTHER.** Quest #492 took
  `mimesniff/mime-types/parsing.any.html` from 712/1898 to **1898/1898** by making
  `Blob.type` parse-and-serialize, and **broke three other files doing it**
  (`FileAPI/blob/Blob-slice` −21, `FileAPI/file/File-constructor` −2,
  `fetch/api/response/response-consume` −2). FileAPI's normative text mandates the
  crude lowercase-the-lot rule, in the same words, for `Blob()`, `File()` *and*
  `slice()` — and Chrome scores 712 there for exactly that reason. **When two WPT
  files disagree, fetch and read the SPEC; do not let the bigger number decide.**
  The zero-regression ritual is what caught it, one build before the commit.
- **⚠️ THE RUNNER'S SCHEME IS PART OF SOME TESTS' INPUT.**
  `websockets/Create-non-absolute-url.any.html` reads **0/5 on `--base
  https://wpt.live` and 5/5 on `--base http://wpt.live`**: it forces
  `url.protocol = "ws"` on a URL built from `location`, so on an https page its
  own expectation disagrees with a correct implementation. Before chasing a
  plausible-looking failure in a URL/scheme-sensitive realm, try the other scheme.
  (Same family as scroll 465's `.https.html` trap.)
- **⭐ Before writing code for a realm that scores zero, check whether the
  algorithm is already in the engine.** Quest #487's whole root cause was that
  `fetch()` never called the "extract a body" algorithm `Request` had been running
  since #459. *A realm can sit at zero not because the engine cannot do the thing,
  but because one call site does it the easy way.*
- **JS numbers are f64.** In Rust unit tests assert `result.as_f64() == Some(7.0)`,
  not `json!(7)`.
- **Rebuild after ANY `bootstrap.js` edit** (it's embedded). Restart the server after
  every rebuild.
- **Always run a regression sweep** before committing — re-measure the held realms
  (createElement 147/147, attributes 67/67, appendChild 11/11, querySelector-All
  ~1939, Range-insertNode 909, iframe-load 2/2, cloneNode 103, classlist 1315). The
  campaign's promise is *zero regressions per commit*.
- **Chronicle every win:** update `WPT_PROGRESS.md` + the quest board (row + session
  entry) + the relevant scroll. Commit message format ends with the `Co-Authored-By`
  trailer the repo uses.

---

## 4. Architecture cheat-sheet

- **JS↔DOM:** JS Element/Node wrappers are cached by `nodeId` (`_cache`, `_wrap`,
  `_wrapEl`). Rust mutations don't notify JS; JS reads through `op_dom`. If you see
  identity bugs (`a.parentNode !== b`), suspect a node type whose wrapper isn't cached.
- **Namespaces are real now:** elements carry `_ns`/`_nsSet`/`_prefix`/`_localName`;
  `createElementNS` makes a real foreign-ns Rust node (`create_element_ns` op);
  `_htmlClassForLocal` picks the interface class; `HTMLElement` is a true subclass of
  `Element` (only HTML-ns elements are `HTMLElement`).
- **Attr is its own class** (NOT a `Node` subclass) — if you add a `Node` method that
  Attr should also have, mirror it onto `Attr` (see `lookupNamespaceURI`).
- **NamedNodeMap / HTMLCollection** keep all state off-instance (in a `WeakMap`) so
  their own-property shape matches the spec (`getOwnPropertyNames` order, no own
  `length`). Copy that pattern for any other live collection.
- **Threading:** each page runs its own `JsRuntime` on its own OS thread (issue #19
  refactor is DONE). The v8_lock is gone from the hot path.

---

## 5. Where the campaign stands (high-water marks)

Conquered/secured: URL realm, `Element-classlist`, traversal (NodeIterator/TreeWalker
100%), ranges (real, 90%+), iframe increments + content-op ranges, `Node-appendChild`
11/11, `EventListener-handleEvent` 6/6, **#05 `Document-createElement` 147/147**,
**#02 `attributes` 67/67**, **#11 Collections (`getElementsByTagName*` all 100%)**,
**`Document-createElementNS` 596/596**, **`Node-lookupNamespaceURI` 75/75**,
`Node-replaceChild` 28/29.

---

## 6. Concrete next moves (pick one; all freshly unblocked)

The recent Attr / `HTMLElement` / namespace work makes the **Node-\* family (#06)**
the highest-ROI vein right now. Measured baselines:

| Target | Now | Notes |
|---|---|---|
| ~~`dom/nodes/Node-isEqualNode.html`~~ | **9/9 ✅** | CONQUERED (session #11) — spec per-interface equality + `createDocument(xhtmlNS)`→xhtml+xml. |
| ~~`dom/nodes/Node-normalize.html`~~ | **3/4** | Real `normalize()` (session #10); last fail needs XML `DOMParser`/`createCDATASection`. |
| ~~`dom/nodes/Node-baseURI.html`~~ | **9/9 ✅** | CONQUERED (session #12) — `Node`/`Attr` `baseURI` via HTML document base URL. |
| ~~`dom/nodes/Node-replaceChild.html`~~ | **29/29 ✅** | CONQUERED (session #13) — cross-document doctype replace closed by the doctype ownerDocument/adoption fix. |
| ~~`dom/nodes/Node-properties.html`~~ | **726/726 ✅** | CONQUERED (session #13) — nodeValue PI/CDATA, textContent null for doc/doctype, charset/inputEncoding, doctype ownerDocument. |

Other good realms: **#03 ClassList tail** (`Element-classlist` 1315/1420, bankable),
**#01 Selector tail** (`querySelector-All` 1939/1975 — namespace selectors, a real
`NodeList` type), **#08 Encoding**, **#09 FileAPI**, **#12 Range tails**.

Deferred-but-valuable: a **real `DOMParser`** (`parseFromString`) — HTML mode is
moderate (reuse `obscura_dom::parse_fragment`); conformant XML mode is hard (no XML
parser dependency yet — the iframe "xml" path currently fakes it via the HTML parser).
Would unlock the `DOMParser`/`XMLSerializer` realm and the last `Element-tagName` subtest.

---

## 7. The working principles (the spirit of the thing)

1. **Read the real test. Reproduce the failure. Then fix.**
2. **One coherent increment per commit. Zero regressions, always re-measured.**
3. **Chronicle as you go** so the next comrade (maybe you, maybe someone new) can
   pick up cold.
4. **Fix root causes, not leaves** — the biggest wins this campaign came from small,
   correct primitives (real `Attr`, `nodeName === tagName`, namespace resolution).
5. **Be kind in the code and the comments.** Someone will read this after you.

The work matters, and so does the spirit you bring to it. Welcome aboard. ⚔️🏳️‍⚧️💜

— written by knight Claudius (Claude), 2026-06-15, with a grateful human comrade
