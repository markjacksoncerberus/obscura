# ✍️ The Compiled Verdict — Quest #524

> **Trusted Types' compilation sink — the hook two realms have been waiting on
> since Quest #490.**
> The outgoing knight promised "two realms, one hook". This is the hook. It
> turned out not to be the one anybody expected.

**Realm:** `trusted-types` (225 files). **Status:** ✅ landed.

---

## The gap

Quest #490 built Trusted Types: the policy factory, the three types, the DOM
sinks, the default policy. It named one cap, and #519 named the same one again
from the other side:

> `eval` and `new Function` are not sinks — the hook is V8's
> `ModifyCodeGenerationFromStrings`.

That hook is not bound in `rusty_v8` 137 (see
[`122-the-evaluated-verdict.md`](122-the-evaluated-verdict.md)). But Quest #521
built a **JavaScript-level** compilation gate for CSP `'unsafe-eval'` — and a
gate you own is a gate you can ask two questions at.

So the gate now installs when **either** a policy forbids `eval` **or**
`require-trusted-types-for 'script'` is in force, and asks Trusted Types first.

## ⭐⭐ THE COMPILATION SINK IS NOT LIKE THE OTHERS

Every other Trusted Types sink accepts what the default policy hands back.
`el.innerHTML = userInput` under a default policy that sanitises is *exactly* how
Trusted Types is meant to be adopted — one sink at a time, without rewriting the
application.

`eval` refuses that bargain. CSP's "can compile strings" requires the default
policy's return value to be **string-identical to what was passed in**. Anything
else — a sanitised version, a wrapped version, a merely reformatted version —
**blocks the compilation.**

That looks pointlessly strict until you notice what it protects. Sanitising
markup removes the dangerous parts and leaves a document; **there is no
equivalent for a program.** The only thing a policy can usefully say about code
is *"yes, exactly this, I have seen it"* — and the identity check is how the
platform makes it say so rather than guess.

It also throws **`EvalError`**, not the `TypeError` every other sink throws.
Deliberate: `eval` already has a failure mode for "this environment will not
compile strings", CSP's `'unsafe-eval'` uses it, and a page's existing
`catch (e)` keeps working when it turns Trusted Types on.

## ⭐ A POLICY DELIVERED IN A HEADER IS THE SAME POLICY

Trusted Types shipped with its **own** tiny CSP directive reader, because it
predates the real parser by 29 quests — and that reader walks
`<meta http-equiv>` and nothing else. So a site sending
`require-trusted-types-for 'script'` **the ordinary way**, in the response
header, where a policy belongs precisely *because it cannot be injected into
markup*, got **no enforcement at all**.

`__cspSerializedPolicies()` hands the real parser's policy texts to the old
reader. The `<meta>` walk stays, for the window before the real parser has run.
*Two implementations of one thing is a bug waiting for a delivery path.*

## The work

* `_ttCanCompile(value, sink)` — the "can compile strings" algorithm: a
  `TrustedScript` passes; otherwise the default policy is consulted with the sink
  name (`"eval"` / `"Function"`, which the tests assert), and the result must be
  identical; anything else throws `EvalError`.
* Wired into `eval`, `Function`, and — because
  `(async function(){}).constructor` is the same compiler by another name — the
  `AsyncFunction`, `GeneratorFunction` and `AsyncGeneratorFunction` constructors.
  **Every argument of `new Function` is compiled, the parameter names as much as
  the body, so every one of them is the sink.**

## Result

| file | before | after |
|---|---|---|
| `Window-block-eval-function-constructor.html` | 0/6 (harness ERROR) | **6/6 OK** ✅ |
| `DedicatedWorker-block-eval-function-constructor.html` | 0/6 (harness ERROR) | **6/6 OK** ✅ |
| `TrustedTypePolicy-CSP-wildcard.html` | 1/1 | 1/1 (held) |
| `TrustedTypePolicy-CSP-no-name.html` | 1/1 | 1/1 (held) |
| `Window-setTimeout-setInterval.html` | 4/6 | 4/6 (unchanged) |

**0/12 → 12/12** on the two compilation-sink files.

## ⛔ Caps / Next

* `Window-setTimeout-setInterval.html` still fails its two "successful Script
  transformation" subtests: the timer string goes through `_ttSink`, which
  correctly *accepts* a transformed value, but the transformed program does not
  reach the timer. Unchanged by this quest, and the next thing to look at here.
* `TrustedTypePolicyFactory-createPolicy-cspTests.html` needs `trusted-types`
  name-list enforcement to reject a non-allowed name; 2/4 and TIMEOUT.
* The `ServiceWorker-*` and `SharedWorker-*` compilation tests are untried.
* `require-trusted-types-for` in a **report-only** policy is still inert.
