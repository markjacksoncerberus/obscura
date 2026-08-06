# 🧵 Scroll 469 — The Scoped Verdict

> **Quest #478** · frontier quest **F10** — `.any.worker.html`, the variant that reported nothing · 2026-08-05
> The `encoding` worker window: **0 / 11,796 (every file could-not-run)** → **11,648 / 11,796 (98.7%)**, 46 files, zero could-not-run.
> The platform-wide pool this opens: **1,740 files, 76,395 subtests**, all previously could-not-run.
> Baseline measured on the pre-change binary: `encoding/textdecoder-fatal.any.worker.html` **could-not-run**, while its twin `…any.html` scored **36/36**. Same file. Same assertions.

---

## Why this region

Quest #477's scroll named F10 on the way out: two `.any.worker.html` files turned
up inside `legacy-mb-schinese` reporting **no results at all**, and the note said
that shape — invisible rather than failing — is the one this campaign has now
five times found to be the largest thing on the map.

It was. Aggregating Chrome's run summary **by variant** rather than by realm:

| | |
|---|---|
| `.any.worker.html` files on the platform | **1,740** |
| Subtests inside them | **76,395** |
| Our score | **0** — every single one could-not-run |

And the top of that list is land we already hold on the window side:
**WebCryptoAPI 39,722** · **encoding 11,796** · **fetch 2,734** · **url 2,154** ·
**html 1,881** · **IndexedDB 1,540** · **streams 1,419** · **dom 534**. Three
arcs of this campaign wrote that code. None of it could be reached from a worker.

**A `.any.worker.html` is not a bonus copy of a test.** Every `.any.js` file on
the platform generates one, and the question it asks is different from the window
variant's: *does this API still work when there is no document?* That is the
question that matters for the machine at the bottom of the pile — a worker is how
a page does its expensive work (parsing, crypto, decompression, image work)
without freezing the one thread the user is looking at. On a fast laptop a
main-thread hash is a hitch. On a hand-me-down laptop it is the browser going
grey for four seconds. Workers are the mechanism by which a heavy site stays
usable on light hardware, and we did not have them.

## The gap

`bootstrap.js` had a `Worker` class. It was 68 lines and it was a diorama:

```js
const workerSelf = {
  onmessage: null,
  postMessage: (msg) => { … },
  addEventListener: (type, fn) => { workerSelf['on' + type] = fn; },
  close: …, crypto, TextEncoder, TextDecoder, atob, btoa,
  setTimeout, setInterval, clearTimeout, clearInterval, fetch, console,
};
const fn = new Function('self', 'postMessage', 'addEventListener', 'close', worker._code);
```

Twelve properties, an `addEventListener` that overwrites rather than appends, and
**no `importScripts`**. Line 7 of every generated worker test is
`importScripts("/resources/testharness.js")`, so the harness never loaded. Line 1
of `testharness.js`'s environment selection is `'document' in global_scope` — and
`global_scope` here would have been an object literal with no scope interface at
all, so even had it loaded it could not have chosen a test environment.

Nothing was failing. Nothing ran.

## The work

`crates/obscura-js/js/bootstrap.js` — a real **DedicatedWorkerGlobalScope**.

### 1. The scope is an object, and the script runs *against* it

We have one V8 context per page (deno_core 0.350 removed the public realm API),
so a worker here cannot be a separate isolate. But almost nothing a worker test
asks about is isolation. What a worker *is*, observably, is a **separate global
scope**: an object that exposes the worker surface, hides the window surface, and
reaches the page only through `postMessage`.

So we build that object for real — `WorkerGlobalScope` → `DedicatedWorkerGlobalScope`,
extending `EventTarget` the way `MediaQueryList` and `Animation` do — and run the
worker's scripts inside it:

```js
with (scopeProxy) { …worker script… }
```

**`with`, and not the parameter-shadowing trick our same-realm iframes use.** The
iframe realm can shadow `window`/`document`/`location` as function parameters
because it knows the list in advance. A worker cannot: `testharness.js` installs
`test`, `assert_equals`, `done` and forty other names onto `self` at runtime, and
the *very next* `importScripts()` has to see them as bare identifiers. Parameter
shadowing cannot express "look this name up on that object."

And getting it wrong is worse than not running: if a worker's free identifiers
fell through to the page's globals, `test()` inside the worker would be the
**page's** `test()`, and the worker's subtests would register in the page's
harness. Green, and meaningless.

The proxy's `has` trap answers **true for every name**, so every free identifier
resolves on the worker global. An unknown name reads as `undefined` there —
`typeof document` in a worker is `"undefined"`, which is the whole point of the
variant.

### 2. The exposure set is a deny list, deliberately

The scope is populated by copying the page's globals onto it as own properties,
minus a curated window-only set (the DOM, the CSSOM, `HTML*`/`SVG*`/`MathML*`,
window-only events, navigation, storage, the view). So `'X' in self` inside a
worker answers the exposure question the same way it does in a real one.

A deny list rather than an allow list on purpose: **an allow list that forgets one
ES intrinsic breaks a worker in a way that looks like an engine bug, while a deny
list that forgets one interface merely over-exposes it — which is visible, and is
exactly what the idlharness worker variants are there to report.**

### 3. `importScripts` blocks, because it is specified to

Over `op_fetch_url_sync` — the same op Quest #28 built for synchronous XHR. That
is not a shortcut: `importScripts` *is* a blocking API, and the op already carries
cookies, CORS, SSRF revalidation and the redirect loop.

Fetch-all-then-run-in-order, per HTML §8.6.1: a failure to fetch any one URL
throws before *any* of them runs, so a worker never half-loads its dependencies
and then reports a confusing `x is not a function` instead of the network error
that actually happened.

### 4. ⭐ The primitive that unlocked the idlharness family

Every `idlharness.any.worker.html` on the platform scored **0/1** — one subtest,
`idl_test setup`, failing with `undefined is not a function`. The harness loaded.
`WebIDL2` parsed. `idl_test` existed. And then:

```js
Promise.all(srcs.concat(deps).map(globalThis.fetch_spec))
```

`idlharness.js` ends with `globalThis.idl_test = idl_test;` — an explicit export —
but leaves `function fetch_spec(spec)` as a bare top-level declaration, and reaches
it as `globalThis.fetch_spec`.

**In a classic script, a top-level `var` or `function` declaration BECOMES A
PROPERTY OF THE GLOBAL OBJECT.** That is the mechanism by which one script hands a
name to the next — the thing `importScripts` exists to do. Inside a `new Function`
wrapper they are function-locals, and they vanish the moment the script ends.

So the wrapper mirrors them back onto the worker global. Three placements, and
each one is load-bearing:

* **at the head** — function declarations are hoisted, and a callback can fire
  before the script's last line;
* **at the end of the `try`** — the only place a top-level `let`/`const`/`class`
  is still in scope. They are block-scoped to the try, so a mirror that ran *only*
  in the `finally` silently published nothing for them. That is what left
  `const formats` (compression) and `const encodings_table` (encoding) invisible
  to the test file importing them: **every `// META: script=resources/*.js` helper
  written in modern style vanished between the two `importScripts` calls**;
* **in the `finally`** — so a script that throws part-way still publishes the
  `var`s and functions it managed to build.

Each write is guarded by `typeof`, so a name the scanner over-matched writes
nothing rather than shadowing a real global with `undefined`. The scanner itself
matches declarations at **column zero only** — unlike the iframe scanner, which
allows leading whitespace — because these names get published on a global, and an
indented (nested) `function foo` mirrored up there would do real damage.

One missing primitive. `api-invalid-label.any.worker.html?1-1000` went
**could-not-run → 1000/1000**, and the whole idlharness family came alive.

### 5. The message channel

`worker.postMessage` and `scope.postMessage` both structured-clone and deliver on
a later task. Messages posted before the worker's script has run are **queued**
and drained *after* it runs, so a message sent while the worker was still loading
finds its `onmessage` handler already installed — exactly as for a real worker
still fetching its script. Errors follow HTML's "report the error": fire at the
`WorkerGlobalScope` first, and only if nothing there canceled it does the `Worker`
object hear about it.

Both use `_dispatchSpec` directly rather than `_dispatchPublic`, so these
UA-originated events keep `isTrusted` true.

## The results

The `encoding` worker window — all 46 files, measured end to end:

| | before | after |
|---|---|---|
| **`encoding/*.any.worker.html`** | **0 / 11,796** (46 could-not-run) | **11,648 / 11,796 — 98.7%** |

Chrome scores **11,728 / 11,796** on the same 46 files. The 80-subtest difference
is entirely `encoding/streams/*` (`TextDecoderStream` / `TextEncoderStream`), which
fails **identically on the window side** — a realm gap, not a worker gap.

Highlights: `api-invalid-label` **3,421/3,421** across four variants ·
`textdecoder-fatal-single-byte` **7,168/7,168** across eight ·
`gb18030-decoder` 275/275 · `textdecoder-labels` 222/222 ·
`textdecoder-fatal` 36/36 · `iso-2022-jp-decoder` 34/34.

### The spread probe — worker vs. window, side by side

Run on the same binary, to separate "the worker is broken" from "the realm is":

| test | worker | window | verdict |
|---|---|---|---|
| `url/url-constructor` | 724/735 | 724/735 | **parity** |
| `url/url-setters` | 214/246 | 214/246 | **parity** |
| `streams/idlharness` | 227/228 | 227/228 | **parity** |
| `FileAPI/blob/Blob-slice` | 144/150 | 144/150 | **parity** |
| `webidl/idlharness` | 94/159 | 93/159 | worker **ahead by 1** |
| `user-timing/idlharness` | 25/36 | 24/36 | worker **ahead by 1** |
| `WebCryptoAPI/digest` | 116/116 | 116/116 | **parity** |
| `css/geometry/idlharness` | 357/360 | 372/372 | 3 worker-specific |
| `urlpattern/urlpattern` | 1/370 | **1/370** | realm gap (URLPattern is a stub) |
| `compression/…multiple-chunks` | 0/60 | **0/60** | realm gap (no CompressionStream) |
| `dom/idlharness` | **145/219** | *could-not-run* | worker **beats window** |
| `html/dom/idlharness` | **451/805** | *could-not-run* | worker **beats window** |

**The worker scope is at window parity.** Everything still red in that column is a
realm gap that was already there, and two of them the worker variant now measures
*better* than the window variant does.

## Caps — honest

Named up front in the code, so nobody mistakes them for conformance:

* **No parallelism.** A worker's code runs on the page's thread. A worker that
  spins forever hangs the page, where a real one would not. Every worker test we
  have looked at asks about exposure and behaviour, not concurrency — but a test
  that genuinely measures off-thread progress cannot pass here.
* **Shared intrinsics.** `[] instanceof Array` holds across the boundary; a real
  worker has its own `Array`. Structured clone still copies, so mutation does not
  leak — only the identity of the intrinsics does.
* **Top-level `let`/`const`/`class` are published as global properties.** In a real
  script they are global *lexical* bindings: visible to later scripts, never
  properties of the global. Visibility (what scripts need) is right; the reflection
  is one notch too generous, so `'x' in self` can answer true where a real worker
  says false. The iframe realm made the same trade.
* **`"use strict"` at the top of a worker script is inert** — inside the `with`
  wrapper it is no longer a directive prologue.
* **`fetch()` inside a worker resolves relative URLs against the DOCUMENT's base**,
  not the worker's. Same-origin WPT never notices; a real cross-directory worker
  would.
* **Module workers** (`new Worker(url, {type:'module'})`) run as classic scripts.

## Next

1. **The WebCryptoAPI worker window — 39,722 subtests, 155 files.** The single
   largest pool the scope opens, on a realm we finished last arc. → Quest #479.
2. **`MessagePort` is still an object literal with four no-op methods**, which
   blocks `SharedWorker` (**688 files / 9,315 subtests**), `MessageChannel`, and
   the `webmessaging` realm. → Quest #480.
3. **`.any.serviceworker.html`: 661 files / 9,092 subtests**, untouched.
4. Realm gaps the worker variants surfaced but do not own: **URLPattern is a
   four-line stub** (3,266 subtests platform-wide, 1/370 on both variants) and
   **CompressionStream/DecompressionStream do not exist** (1,312 subtests).
5. `dom/idlharness.any.html` and `html/dom/idlharness.any.html` are **could-not-run
   in the WINDOW** — worth a look now that the worker twins prove the IDL loads.
