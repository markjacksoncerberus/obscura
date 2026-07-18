# Quest #170 — The Timer-Source Verdict

> **String-source timers + timer-callback error reporting.**
> +8 subtests across 4 tests, ZERO regressions.

## The gap

Quest #169 named its own next cap: the four `*-in-setTimeout` / `*-in-setInterval`
tests in `html/webappapis/scripting/processing-model-2/` were all `0/2`, blocked on
**string-source timers**. Each does, e.g.:

```js
window.onerror = t.step_func(function(a, b, c, d){
    ran = true; col_value = d;
    assert_equals(typeof a, 'string', 'first arg');   // message
    assert_equals(b, location.href, 'second arg');    // filename
    assert_equals(typeof c, 'number', 'third arg');   // lineno
});
setTimeout("undefined_variable;", 10);   // runtime error   (or "{" for a compile error)
setTimeout(function(){ /* assert ran === true, typeof col_value === 'number' */ }, 20);
```

Two things were missing:

1. **A string first argument was silently ignored.** `setTimeout`/`setInterval` bailed
   with `if (typeof fn !== "function") return ++_tid;` — a `TimerHandler` is actually
   `(Function or DOMString)`; a string handler must be *compiled as a classic script and
   run in global scope* at fire time (§timer-initialisation-steps).
2. **A timer callback's uncaught exception was swallowed** to `console.error("Timer
   error:", e)` — so even the compiled string's throw never reached HTML's "report the
   error", and `window.onerror` never fired.

Crucially, the tests only assert `typeof lineno === 'number'` and
`typeof colno === 'number'` — **not** exact values — so the `lineno:0`/`colno:0` cap
inherited from #169 doesn't block them. And they assert `filename === location.href`,
which `_reportError` already sets. So the whole region was reachable with no
runtime-layer line/col work.

## The work — all in `bootstrap.js`

A single shared helper compiles-or-calls the handler and reports any throw:

```js
const _runTimerHandler = (fn, code, args) => {
  try {
    if (code !== null) (0, eval)(code); else fn(...args);
  } catch (e) { _reportError(e); }
};
```

- **String source → `(0, eval)(code)`.** An *indirect* eval evaluates the string as a
  classic script in **global** scope (not the caller's lexical scope), exactly matching
  the timer-initialisation "compile" semantics: `"undefined_variable;"` throws a
  ReferenceError at run, `"{"` throws a SyntaxError at compile — both synchronously
  inside the fire-time callback, so the `catch` sees them.
- **`_reportError(e)`** (from #169) fires an `error` event at the Window with
  `filename = location.href` and numeric `lineno`/`colno` (0), delivered through the real
  ordered `error`-listener path — so `window.onerror` (itself an OnErrorEventHandler
  listener since #169) fires with `(message, filename, lineno, colno, error)`.
- Both `setTimeout` and `setInterval` now compute `code = (typeof fn === "function") ?
  null : String(fn)` once at schedule time and route every fire through
  `_runTimerHandler`. The function-callback path also now reports its uncaught
  exceptions (was `console.error`) — a thrown timer callback is a reportable error either
  way per spec.

For the `setInterval` runtime-error test, the interval re-fires every 10ms; the page's
`window.onerror` calls `clearInterval(interval)` on the first report, and `tick`'s
existing `if (!_intervals.has(id)) return;` guard (checked *after* the handler runs)
stops the reschedule the same turn — no runaway.

## Results

| Test | Before | After |
| --- | --- | --- |
| `compile-error-in-setTimeout.html` | 0/2 | **2/2** |
| `compile-error-in-setInterval.html` | 0/2 | **2/2** |
| `runtime-error-in-setTimeout.html` | 0/2 | **2/2** |
| `runtime-error-in-setInterval.html` | 0/2 | **2/2** |

**= +8, ZERO regressions.**

## Zero-regression sweep

The risky part was routing the **function-callback** throw to `_reportError`: any
internal engine timer that threw would now surface a Window `error` event and could fail
a test that didn't `setup({allow_uncaught_exception:true})`. Swept hard, all held:

- **DOM primitives:** qsa 1975/1975, classlist 1420/1420, createElement 147/147,
  createElementNS 596/596, dispatchEvent 25/25.
- **Timing/crypto (timer-heavy):** mark 22/22, measure-l3 3/3, getRandomValues 39/39.
- **Event-handler realm:** all-global-events 375/375, body-window 140/140,
  windowless-body 236/236, eventhandler-cancellation 14/15 (pre-existing 1F),
  processing-algorithm 7/7, lexical-scopes 3/3.
- **Scripting-errors realm (#169):** compile-error 2/2, runtime-error 2/2,
  compile-error-in-attribute 2/2, runtime-error-in-attribute 2/2,
  body-onerror-compile-error 2/2, runtime-error-in-body-onerror 1/1,
  window-onerror-{runtime-error,parse-error} 2/3 (pre-existing exact-lineno cap).
- **Load lifecycle / misc:** iframe-load 2/2, url-origin 406/7 (pre-existing),
  structured-clone 141/152 (pre-existing).

(`event-handler-cancellation.html` / `event-handler-processing-first-run.html` /
`measure.any.html` are NOT real paths — the live names are `eventhandler-cancellation`,
`event-handler-processing-algorithm`, `measure-l3.any` — a 404 reads as could-not-run,
not a regression. `iframe-load-event` could-not-run on a stale server and cleared on a
fresh one = degradation.)

## Caps / Next

- **`onerroreventhandler.html` 0/3** — still blocked by the *separate*
  `document.body.outerHTML = "<body …></body>"` body-replacement bug: after the first
  such assignment `document.body` goes `null`, so the next test's `.outerHTML =` throws
  "Cannot set properties of null". The `outerHTML` setter (`bootstrap.js` ~L2529) parses
  the value with a throwaway `<html>` context element (`createElement('html')`); parsing
  `"<body …></body>"` inside `<html>` doesn't yield a findable body child. **NEXT:** fix
  the body-context parse (mirror `insertAdjacentHTML`, which maps an `html` context to
  `body` at ~L2896) — a real DOM-primitive fix with a broader `outerHTML`/body tail.
- **Exact error line/col** — the runtime→Rust error boundary still drops the throw site,
  so `_reportError` reports `lineno:0`/`colno:0`. Harmless here (these tests only check
  `typeof`), but the three `window-onerror-*` exact-`lineno` fails still need the runtime
  to surface a v8 stack-frame location into the ErrorEvent.
- **Cross-origin / data-URL timer error tests** (`compile-error-cross-origin-setTimeout`
  etc.) are the muted-error / opaque-origin cap family — filename must be `"about:blank"`
  or the error muted; separate origin-tracking work.
