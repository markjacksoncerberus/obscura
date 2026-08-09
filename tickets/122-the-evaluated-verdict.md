# 🔒 The Evaluated Verdict — Quest #521

> **CSP `'unsafe-eval'` — the one directive that has to change the language
> itself.** And the discovery underneath it: **a page that correctly forbade
> `eval` was a page no agent could read.**

**Realm:** `content-security-policy/unsafe-eval` (11 files). **Status:** ✅ landed.
**Named as leverage #2 by the outgoing knight, who left it as the single biggest
follow-up in either of two realms.**

---

## The gap

Quest #519 shipped a real CSP: the parser, the fallback chain, nonces, hashes,
`report-uri`, inline-script gating, `img-src`. It named one honest cap:

> `eval`/`new Function` are **NOT** gated — wrapping `globalThis.eval` turns
> every DIRECT eval into an INDIRECT one, and the right hook is V8's
> `ModifyCodeGenerationFromStrings`.

Two things turned out to be true about that.

**First: the V8 hook is not reachable.** `rusty_v8` 137 binds
`Context::set_allow_generation_from_strings` — an on/off switch — and does not
bind `SetModifyCodeGenerationFromStringsCallback` at all. The switch alone is
useless here for two reasons: it fires **before any JavaScript runs**, so no
`securitypolicyviolation` report can be sent (and every one of these tests
asserts the report); and it would gag **the engine's own compilers**, which
compile inline `onclick=""` handlers, frame scripts, worker bodies and
AudioWorklet processors — none of which `'unsafe-eval'` governs. A policy that
forbids `eval` would have broken every inline event handler on the page.

**Second: the objection to wrapping `eval` does not apply to a BLOCKED eval.**
The direct/indirect distinction only matters when the call *runs code*. When the
policy says no, the wrapper throws and no scope is ever consulted, so the two are
indistinguishable. **The engine gives up exactly nothing.**

## The work

* `_NativeEval` / `_NativeFunction` captured at the very top of `bootstrap.js`,
  before anything else runs, and every one of the engine's own 6 `eval` and 7
  `new Function` call sites rewired to them. **The engine's compilers are not the
  page's `eval`.**
* `_cspInstallEvalGate()` — installed **only when a policy has an opinion**, so a
  page without CSP keeps the real `eval` with its real semantics and none of this
  code runs. Replaces `eval`, `Function`, `Function.prototype.constructor`, and
  the `AsyncFunction` / `GeneratorFunction` / `AsyncGeneratorFunction`
  constructors — because `({}).constructor.constructor('…')()` is the standard
  way around a gate that only replaces the global binding.
* `_cspReport` now **queues a task** to fire the event, as CSP3 says.
* `setTimeout("…")` / `setInterval("…")` ask at **schedule** time and return
  **`0`**, per HTML's timer initialisation steps.

## ⚠️⚠️ THE FIND: THE AUTOMATION CHANNEL IS NOT THE PAGE

The first working build made every CSP-protected page **completely unreadable**.
`page.evaluate("() => 1+1")` returned `undefined`. Not the test — *anything*.

Playwright's injected script compiles the caller's function with `eval`, **inside
the page**. A real browser runs that code in an **isolated world**: same DOM, no
policy of its own. Obscura has one JavaScript realm and cannot isolate by
construction.

So it asks Rust instead. `runtime::PrivilegedScript` is an RAII guard raised
around each CDP evaluation; `op_privileged_script` reports it; the gate lets the
embedder through and stops the page. **Without it, the browser locks itself out
of exactly the sites that took security seriously** — which is precisely
backwards, and it is a bug an agent-driving browser could only have found by
driving one.

## ⚠️ Two smaller traps, both expensive

* **`const blockedEval = function eval(source) {…}` is a SyntaxError.** Strict
  mode forbids `eval` as a binding identifier, and `bootstrap.js` is strict — so
  the snapshot build panicked and *the whole browser had no DOM*. The names are
  stamped on with `defineProperty` instead. (The build failure was invisible
  because `cargo build … | tail -3` reports **tail's** exit code, not cargo's.
  Grep for `^error|panicked|Finished`, never `tail`.)
* **A stale server produces a complete, plausible, entirely wrong table.** Two
  separate measurement cycles in this quest were spent on a server started before
  the rebuild. `strings target/release/obscura | grep <new symbol>` proves the
  binary; a one-line `eval_probe.py` on `typeof globalThis.__newThing` proves the
  *server*. Do the second one.

## Result — `content-security-policy/unsafe-eval`

| file | before | after |
|---|---|---|
| `eval-blocked.sub.html` | 0/3 | **1/1** ✅ |
| `eval-scripts-setTimeout-blocked.sub.html` | 0/1 | **1/1** ✅ |
| `eval-scripts-setInterval-blocked.sub.html` | 0/1 | **1/1** ✅ |
| `function-constructor-blocked.sub.html` | 0/1 | **1/1** ✅ |
| the four `-allowed` files | 4/4 | **4/4** (held) |

**4/10 → 8/8.** Every `-allowed` file was passing *for free* before: a browser
that never blocked anything satisfies every test that asks it not to block.

## ⛔ Caps / Next

* A **report-only** policy that forbids `eval` must report and then run the code,
  and that run goes through the wrapper — so on such a page, and only there, a
  direct `eval` behaves as an indirect one. One directive, one disposition,
  written down rather than hidden.
* The privilege guard is held across `await` points in the async CDP paths, so
  page microtasks that run during a CDP `awaitPromise` are briefly privileged.
* `'strict-dynamic'` still parses and fails open (#519's cap, unchanged).
* **Next:** `'wasm-unsafe-eval'`; and the same gate now hosts Trusted Types'
  compilation sink — see [`125-the-compiled-verdict.md`](125-the-compiled-verdict.md).
