# Quest #169 — The Reported-Error Verdict

> **onerror-as-listener + "report the error" for uncaught classic-script errors.**
> +16 subtests across 11 tests, ZERO regressions.

## The gap

Quest #168 named its own last cap: `compile-event-handler-lexical-scopes` **test 3**
needed `window.onerror` to fire as an *ordered* `error` listener. Pulling that thread
opened the whole **runtime-script-errors** realm — a wide onerror tail that had been
dark because two things were missing:

1. **`window.onerror` was a plain data property**, not a listener. It was invoked
   manually at the *end* of `_reportError` (after all real `error` listeners), so a
   `body.setAttribute("onerror")` handler — which should fire *before* a later
   `window.addEventListener("error")` — fired last (or, for an explicit
   `window.dispatchEvent(errorEvent)`, never). It also carried the bespoke
   `(message, source, lineno, colno, error)` calling convention nowhere near the
   dispatch path.
2. **Uncaught errors in a classic `<script>` were swallowed.** `page.rs` ran each
   `<script>` with `execute_script_guarded` and, on `Err`, only `tracing::warn!`-logged
   it. HTML's "report the error" step — fire an `error` event at the Window — never
   happened, so a page's own `window.onerror` / `error` listeners never saw a parse or
   runtime error in a `<script>`.

## The work — all in `bootstrap.js` + `page.rs`

### (1) `window.onerror` is a real OnErrorEventHandler `error` listener
- Removed `"error"` from `_WINDOW_ONHANDLER_DATA` (now empty) so the window on-handler
  loop installs an **accessor** for `onerror` (like `onload` did in #167).
- The accessor registers a **wrapper** listener (`_makeOnErrorListener(fn)`), not the
  raw fn. The wrapper implements HTML's "event handler processing algorithm" special
  error handling: when the dispatched event **is an `ErrorEvent` of type `error`**, it
  calls the underlying handler with **5 args** `(message, filename, lineno, colno,
  error)`; otherwise with the event. A `true` return (special) — or a `false` return
  (ordinary) — cancels. `get` returns the raw fn (native `.length` preserved: a
  body-compiled onerror keeps 5 params); the wrapper is tracked in `__winon_error_w`
  so a re-set removes the old listener.
- `_reportError` no longer calls `globalThis.onerror(...)` manually — the wrapper is in
  the window's `error` listener list, so the existing direct-fire loop invokes it in
  registration order, exactly once. `window.dispatchEvent(errorEvent)` reaches it the
  same way.

### (2) `_reportError` populates the ErrorEvent's filename
- The ErrorEvent now carries `filename = location.href` (document URL — a same-origin
  inline script's responsible URL) and numeric `lineno`/`colno` (0). This satisfies the
  `filename === location.href` assertion in the inline-attribute error tests. (Exact
  line/col is a cap — see below.)

### (3) `page.rs` reports uncaught classic-script errors
- New `Page::report_script_error(js, err)`: on an `Err` from `execute_script_guarded`
  (both the `<script src>` and inline paths), it runs
  `_reportError(new Error(<message>))` in the realm. The runtime's error string becomes
  the ErrorEvent's `message`; `_reportError` supplies filename + line/col. Defensively
  wrapped so a reporting failure can't cascade.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `compile-event-handler-lexical-scopes` | 2/3 | **3/3** |
| `compile-error` | 0/2 | **2/2** |
| `runtime-error` | 0/2 | **2/2** |
| `compile-error-in-attribute` | 1/2 | **2/2** |
| `runtime-error-in-attribute` | 1/2 | **2/2** |
| `body-onerror-compile-error` | 1/2 | **2/2** |
| `body-onerror-runtime-error` | 1/2 | **2/2** |
| `runtime-error-in-body-onerror` | 0/1 | **1/1** |
| `window-onerror-runtime-error` | 0/1 | **2/3** |
| `window-onerror-parse-error` | 0/1 | **2/3** |
| `window-onerror-runtime-error-throw` | 0/1 | **2/3** |

**= +16 subtests, ZERO regressions.**

Zero-regression sweep (all held): compile-event-handler-{sourcetext 5, form-owner 4,
symbol-unscopables 3}, event-handler-all-global-events 375, -processing-algorithm 7,
inline-event-handler-ordering 3, eventhandler-cancellation 14/15, body-window 140,
windowless-body 236, body-alt 118, window 118, body-onload 1, onerroreventhandler
0/3 (unchanged — separate cap), qsa 1975, classlist 1420, createElement 147,
dispatchEvent 25, mark 22, getRandomValues 39, Node-appendChild 11, custom-elements
Node 14, shadow-dom shadowRoot 3. **url-origin 406/7 and structured-clone 141/10 were
stash-proven identical to baseline** (their fails pre-exist this quest).

## Caps / Next

- **Exact error line/column** — `window-onerror-runtime-error` (line 36),
  `-parse-error`, `-runtime-error-throw` each have one remaining FAIL: they assert the
  exact `lineno`. We report `lineno: 0` because the runtime→Rust error boundary loses
  the throw site. Real line/col would need the runtime to surface an exception's
  location (v8 stack frame) back into the ErrorEvent — a runtime-layer change.
- **`onerroreventhandler.html` (0/3)** — blocked by a *separate* DOM bug:
  `document.body.outerHTML = "<body>"` leaves `document.body` null for the next set
  (t2/t3 throw "Cannot set properties of null"), and the replaced body's markup
  `onerror` doesn't reflect to `window.onerror` (t times out). Both are body-replacement
  / outerHTML issues, independent of error reporting.
- **`*-in-setTimeout` / `*-in-setInterval` (0/2 each)** — `setTimeout("code-string")`
  (the string-source timer form) is unsupported: `setTimeout` returns early unless the
  first arg is a function. Supporting string-code timers (and reporting their compile
  errors) is a distinct feature. The timer *callback*-error path
  (`catch(e){console.error}` in `setTimeout`/`setInterval`) could also route to
  `_reportError` for the runtime-in-timer tests — deferred (blast-radius: a spurious
  engine throw inside a timer would surface as a harness error).

**NEXT: timer-callback error reporting** (`setTimeout`/`setInterval` `catch → _reportError`,
with a hard regression sweep), then the `body.outerHTML` body-replacement bug (unlocks
onerroreventhandler + likely other outerHTML tests). Real line/col tracking is the
bigger, runtime-layer lever behind the exact-lineno caps.
