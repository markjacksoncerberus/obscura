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
| `dom/nodes/Node-isEqualNode.html` | 4/9 | Deep equality — now that Attr nodes + namespaces are real, make `isEqualNode` compare ns/prefix/localName + attribute sets correctly. |
| `dom/nodes/Node-normalize.html` | 0/4 | Coalesce adjacent Text nodes, drop empty ones. Self-contained. |
| `dom/nodes/Node-baseURI.html` | 0/9 | `baseURI` via `<base href>` resolution + document URL. |
| `dom/nodes/Node-replaceChild.html` | 28/29 | Last fail = **cross-document doctype replace**; needs `DetachedDocument` to track its doctype as a real adoptable child (the `_doctype` cache goes stale). Shared with several `createHTMLDocument` tests. |
| `dom/nodes/Node-properties.html` | 710/726 | A grab-bag tail — `--verbose` to bucket. |

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
