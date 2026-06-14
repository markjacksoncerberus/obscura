# Scroll XII — The Iframe Frontier

> *The keystone realm. The remaining ~6,000 `dom/ranges` content-op subtests
> (`Range-insertNode`, `surroundContents`, `cloneContents`, `deleteContents`,
> `extractContents`) are NOT blocked by Range — verified correct in isolation in
> Quest #10. They are blocked by their **cross-iframe comparison harness**, which
> demands real per-frame JavaScript realms. This scroll charts that frontier.*

Realm: `dom/ranges/Range-{insertNode,surroundContents,cloneContents,deleteContents,extractContents}.html`
(+ the `html/.../the-iframe-element` increments already mostly held). Difficulty: ⚔️⚔️⚔️
(architectural siege). Date scouted: 2026-06-14 (session #3, knight Claudius).

---

## How the content-op harness works (from wpt.live)

The test (`Range-insertNode.html` + `../common.js` + `Range-test-iframe.html`):

1. Creates **two** real iframes: `actualIframe`, `expectedIframe`, each
   `src="Range-test-iframe.html"`, appended to `<body>`.
2. Waits for `actualIframe.onload` → builds `referenceDoc` from
   `actualIframe.contentDocument.documentElement.cloneNode(true)` → sets
   `expectedIframe.src` → waits for `expectedIframe.onload` → runs the i×j matrix.
3. `Range-test-iframe.html` loads `../common.js` **inside the iframe realm** (which
   defines `setupRangeTests` + ~30 test vars there) and an inline `<script>` that
   defines `run()` and writes results to `window.testRange` / `window.testNode` /
   `window.unexpectedException`. `<body onload=run()>` kicks it.
4. For each (range i, node j): `restoreIframe(iframe,i,j)` rebuilds the iframe doc
   from `referenceDoc`, calls `iframe.contentWindow.setupRangeTests()`, sets
   `iframe.contentWindow.testRangeInput/testNodeInput`, calls
   `iframe.contentWindow.run()`, then reads back `contentWindow.testRange` etc.
5. The actual op runs in `actualIframe`; a hand-simulated reference runs in
   `expectedIframe`; the two DOM **trees are compared structurally**.

The design's load-bearing requirement: **each iframe is an independent JS realm
holding its own `setupRangeTests`, `run`, and ~30 test variables on ITS window.**

---

## Root-cause diagnosis (verified by probe, 2026-06-14)

Probe (`/tmp/iframe_probe.py`) against the live `Range-insertNode.html`:
```
cw_is_separate_realm = true        # contentWindow !== window  ✓
has_setupRangeTests  = "function"  # but this is a MIRAGE (see below)
has_run              = "undefined" # ✗ frame inline script's run() never attached
has_testRange        = "undefined" # ✗
cd_firstChild        = undefined   # ✗ document node-child interface missing
cd_childNodes.length = THREW       # ✗ contentDocument.childNodes is undefined
cd_documentElement   = "HTML"      # ✓ documentElement/head/body do work
```

### 🜂 Blocker #1 — frame-script declarations never reach the frame window
`crates/obscura-js/js/bootstrap.js`:
- **Option C realm model** (`_runFrameScript`, ~line 1826): one V8 context per page
  (deno_core 0.350 removed the public realm API). Frame scripts run via
  `new Function('window','document',…, code)` with the frame globals as params.
- **Top-level `function run(){}` / `var testDiv` stay LOCAL to that `new Function`
  body.** They never attach to `win`, and they are not shared across the frame's
  successive scripts (common.js's `var testDiv` is gone before the inline script
  runs).
- **`_IframeWindow` is a `Proxy` that falls through to `globalThis`** for unowned
  props (~line 4103). So `af.contentWindow.setupRangeTests` resolves to the
  *parent page's* `globalThis.setupRangeTests` (the parent test ALSO loads
  common.js) — a mirage. `run` has no parent global, so it reads `undefined`.
- **Fatal:** `actualIframe` and `expectedIframe` both proxy to the SAME parent
  globals, so they cannot hold independent `testRange`/`testNode`/`testDiv` state.
  The actual-vs-expected comparison is structurally impossible until frame scripts
  define their state ON their own window.

### 🜁 Blocker #2 — `_IframeDocument` has no Node-level child interface
`_IframeDocument` (~line 3945) is a hand-rolled shim exposing `documentElement`,
`head`, `body`, factories, and queries — but **no `childNodes`, `firstChild`,
`lastChild`, `appendChild`, `removeChild`, `insertBefore`, or `doctype`**. So
`restoreIframe`'s `while (iframe.contentDocument.firstChild …) removeChild(…)`
loop and the doctype juggling cannot run. Independently valuable to fix (any code
treating a frame document as a Node hits this).

---

## Battle plan (proposed)

**Fix #2 first (self-contained, low-risk):** give `_IframeDocument` a real
document-as-Node container — back it with a real document node (like
`DetachedDocument` from Quest #13) OR add `childNodes`/`firstChild`/`lastChild`/
`appendChild`/`removeChild`/`insertBefore`/`doctype` over `[doctype?, documentElement]`.
Verifiable on its own.

**Fix #1 — the siege.** Two routes:
- **Route A (faithful): per-frame V8 `Context` on the Rust side.** Real isolation,
  real top-level-decl semantics. Big change to how `obscura-js` dispatches scripts;
  must confirm whether rusty_v8 `Context::new` is reachable despite deno_core's
  removed public realm API.
- **Route B (pragmatic JS transform): make decls attach to `win`.** Rewrite
  `_runFrameScript` to evaluate each frame script inside `with (win) { … }`
  (sloppy mode — inject before any `"use strict"` so it's demoted to a no-op
  expression) and append `win.NAME = NAME` for each top-level `function`/`var`/
  `let`/`const`/`class` name (scanned from source). A persistent per-frame `win`
  then shares state across that frame's scripts AND keeps the two frames
  independent (each has its own `win`; only intrinsics fall through to globalThis).
  Lower effort, no Rust; fragile on exotic source but covers the WPT patterns.

Recommendation: ship Fix #2 + Route B, measure against one test
(`Range-insertNode.html`), iterate. Escalate to Route A only if cross-frame node
identity / structural comparison needs true isolation.

Beware also: the CDATA-in-HTML fixture (`paras[5]` in common.js, via
`new Document().createCDATASection`) — separate, smaller (Quest #10 leftover).

---

## ⚔️ Siege results — 2026-06-14 (session #3, knight Claudius): +2046 subtests

Route B + node-backed iframe doc landed. **All five content-op tests went from 0 →**

| Test | Before | After |
|------|:------:|:-----:|
| `Range-insertNode` | 0/1840 | **909/1840** |
| `Range-surroundContents` | 0/1840 | **698/1840** |
| `Range-cloneContents` | 0/187 | **177/187** |
| `Range-deleteContents` | 0/125 | **103/125** |
| `Range-extractContents` | 0/187 | **159/187** |

Zero regressions on held iframe tests / `Node-appendChild` / `Node-cloneNode`; 143
unit tests green.

**What shipped (`bootstrap.js`):**
1. **Frame-script declaration hoist (`_runFrameProgram`).** A frame's classic
   scripts now run as ONE concatenated program (shared scope, like a real frame's
   global), and each top-level declaration is copied onto the frame window — so the
   parent realm can reach `iframe.contentWindow.run()`/`setupRangeTests`. The hoist
   runs in a `finally`, so it still attaches the declarations even when a frame
   script throws part-way (the `testDiv.style` throw at load no longer loses `run`).
2. **Node-backed `_IframeDocument`** (extends `DetachedDocument`): real
   `childNodes`/`firstChild`/`appendChild`/`removeChild`/`insertBefore`/`doctype`
   (Blocker #2), with LIVE `documentElement`/`head`/`body` getters (the harness
   rebuilds the tree). Also fixed `DetachedDocument`'s getters to be live (the
   `referenceDoc = createHTMLDocument()` round-trip mutates it).
3. **Recursive `cloneNode(deep)`**: clones over real children instead of
   `outerHTML`-into-a-`<div>` (that DROPPED `<html>/<head>/<body>` wrappers, so a
   document root cloned to its first descendant) — and via `this.attributes`
   instead of per-element `outerHTML` serialization (was O(N²), stalled
   cloneContents/extractContents).

### Follow-up — 2026-06-14 (session #4): harness ERROR→OK via frame error isolation

The session-#3 plan ("fix a cloned-node identity bug, re-land FIX B") rested on two
wrong premises — both disproven this session:

- **There is no cloned-node identity bug.** An invariant checker that replicates
  restoreIframe's exact clone round-trip and walks the rebuilt tree asserting
  `child.parentNode === node` found **0 violations** (the `comment` testNode is fully
  canonical). The session-#3 "hang" was not node identity.
- **FIX B (pristine platform-globals snapshot, so a frame doesn't see page globals
  like testharness `setup`) is net-negative.** It recovers ZERO subtests — the
  `testDiv` it lets `setupRangeTests` build at frame load goes into `referenceDoc`,
  which restoreIframe then deep-clones EVERY subtest only for `setupRangeTests` to
  immediately remove + rebuild it (pure wasted clone work) → big tests ~2× slower and
  an intermittent iframe-load-race TIMEOUT (delete/surround, moved between runs).
  Committed (no-FIX-B) state stress-tested 3× = rock-stable; FIX B = flaky. Reverted.

**What the harness ERROR actually was, and the real fix.** The ERROR was the frame's
own `testDiv.style` throw at load (testDiv undefined under the `"setup" in window`
mirage) being surfaced via `_reportError` to the PARENT page's window `error`
listeners — exactly what testharness listens on — so the whole harness was flagged
Errored even though every subtest ran. In a real browser a frame-script error fires
the FRAME window's error event, not the parent's. Added **`_reportFrameError(err,
win)`** (dispatches to the frame window's own listeners + console; never touches
globalThis/parent), used by `_runFrameScript`/`_runFrameProgram`. Result: all five
content-op tests now **harness OK**, identical pass counts (909/698/177/103/159),
**zero timeouts**, rock-stable across runs. FIX B abandoned.

