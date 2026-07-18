# Quest #171 — The Framed-Error Verdict

> **Realm:** `html/webappapis/scripting/events/onerroreventhandler.html` — in-frame
> `document.body.outerHTML` body replacement + the frame-window `OnErrorEventHandler`.
> **Bounty:** +3 across 1 test (0/3 → 3/3). **Difficulty:** ⚔️⚔️⚔️ (five stacked bugs).

## The target

`onerroreventhandler.html` loads `onerroreventhandler-frame.html` in an iframe. The
frame runs three async tests, each of the shape:

```js
parent.t.step(function() {
  document.body.outerHTML = "<body onerror='check1(arguments, arguments.callee)'></body>";
  window.dispatchEvent(reference_error);   // an ErrorEvent (t1) or plain Event (t2)
});
// t3: <span onerror='check3(...)'> + span.dispatchEvent(...)
```

It asserts the `OnErrorEventHandler` special behaviour: a `<body onerror>` reflects onto
the frame Window and fires with the 5-arg splat for an `ErrorEvent`, the 1-arg form for a
plain `Event`; a `<span onerror>` is a normal 1-arg element handler.

Baseline: **0/3 TIMEOUT** — `t1` timed out (onerror never fired) and `t2`/`t3` threw
`Cannot set properties of null (setting 'outerHTML')`.

## Five stacked bugs

This one test exercised five independent gaps. Each was found by narrowing: the harness
error → a faithful same-origin `srcdoc` repro → probing frame internals.

**Reproduction lore (saves the next knight hours):**
- Nested data-URLs (`parent data: → iframe src=data:`) **double-encode and corrupt** the
  frame content — an invalid repro. Use `srcdoc` for a same-origin frame, and escape
  `</script>` → `<\/script>` in the srcdoc string.
- `DOMParser.parseFromString(…, "text/html")` builds the **same `_IframeDocument` class**
  as a real iframe, but is fully observable from the top-level realm — the key trick for
  isolating the parse/ownerDocument bugs without an iframe at all.
- `eprintln!` inside `ops.rs` did **not** reach a `2>` redirect of the server here — don't
  infer "op not called" from missing stderr; verify with a Rust unit test instead.

### (1) Main-document fragment context (Rust — the primitive)

`element.innerHTML` and the `outerHTML` setter parsed with a **hardcoded `body`**
fragment-parsing context (`parse_fragment` in `crates/obscura-dom/src/tree_sink.rs`). Under
a `body`/`div` context a `<body …>` token is a stray body start-tag and is **dropped**. But
`document.body.outerHTML = "<body …></body>"` fragment-parses with the **parent `<html>`**
as context (HTML §html-fragment-parsing-algorithm), where `<body …>` yields a real
`head`+`body`. So the setter produced an empty fragment → `replaceChild` removed the body,
added nothing → `document.body === null`.

**Fix:** thread the target element's own local name as the context.
- `parse_fragment_ctx(html, context_local)` + `fragment_root()` (returns the synthetic-html
  root whose children ARE the fragment, never descending into `body`).
- `set_inner_html` (`ops.rs`) reads `dom.get_node(target).as_element().local` for the context.
- Verified pure and correct via a `parse_fragment_ctx_html_yields_body` unit test:
  `<body>` is dropped under `body` context, kept under `html` context.

This fixed the **main-document** path (proven with a top-level DOMParser repro: `body=BODY`,
both sets survive) — but the iframe test was still 0/3.

### (2) The real iframe root cause (`_IframeDocument` raw-text corruption)

Iframes over `src`/`srcdoc` are synthetic `_IframeDocument`s (bootstrap), NOT the Rust
`set_inner_html` op. Their constructor strips `<html>/<head>/<body>` with a **naive global
regex**, which also ate those tags appearing as literal TEXT inside the frame's `<script>`:

```js
var x = "A<body onerror=q>B</body>C";   // → "ABC"   (proven via DOMParser)
```

So the frame's `document.body.outerHTML = "<body onerror=…></body>"` became
`document.body.outerHTML = "onerror=…>"` → parsed to a text node → body replaced by nothing
→ `null`. **This** was the `Cannot set properties of null`.

**Fix:** mask raw-text (`script/style/textarea/title`) blocks to opaque `\x00RAW<n>\x00`
sentinels before the structural strip, then restore. The strip now only touches real
document structure. `_copyStartTagAttrs` matches on the masked markup too.

### (3) Frame-window `onerror` as a real listener

With the body replaced, the reflected `<body onerror>` did `frameWin.onerror = fn` — but
`_IframeWindow` had no `onerror` accessor, so it was a plain data prop that
`dispatchEvent` never fires (the main window got the OnErrorEventHandler accessor in Quest
#169; frame windows were left out).

**Fix:** define the OnErrorEventHandler accessor on each `_IframeWindow` instance —
`this.addEventListener('error', _makeOnErrorListener(fn))` — with own `__winon_error`/
`__winon_error_w` null slots so the frame Proxy doesn't fall through to the top window's
onerror when the frame's is unset.

### (4) Which Window, and which scope

Two sub-bugs, both because a freshly-parsed frame body isn't `_ownerDoc`-tagged (that tag is
applied only when custom elements are live), so its `ownerDocument` mis-resolves to the MAIN
document:

- **Wrong window:** the reflect targeted the top window. New `_windowForNode(node)` walks to
  the tree ROOT (the frame `_IframeDocument`, or the throwaway `<html>` context element —
  which IS tagged) and returns its `defaultView`. `_bodyReflectWin` now delegates to it.
- **Wrong scope:** a frame's top-level `function check1(){}` lives on the frame WINDOW (see
  bug 5), not the realm global. So the reflected handler (compiled global-scope) and the
  `<span onerror='check3()'>` element handler couldn't resolve them → uncaught
  `ReferenceError` that leaked to the parent harness (`ERROR` status even at 3/3 subtests).
  `_ehScopeChain` now PREPENDS the frame window (outermost `with`) for in-frame nodes, and
  `_bodyWinSetContentAttr` compiles the reflected handler with the frame window in its chain.

### (5) Synchronous frame-script globals

Frame classic scripts run via `new Function` (Option C shared-realm), and `_runFrameProgram`
hoisted top-level decls onto the window only in a **`finally`** — AFTER the body ran. But the
test dispatches the error **synchronously during** the script, so `frameWin.check1` didn't
exist yet at fire time. Function declarations are hoisted, so we now ALSO mirror them onto the
window at the **START** of the program body (`_scanTopLevelDecls` returns which names are
functions; `_runFrameProgram` emits a head-hoist for them).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `onerroreventhandler.html` | 0/3 TIMEOUT | **3/3 OK** |

**+3 subtests, ZERO regressions.**

## Zero-regression sweep (all held)

- **Event-handler realm — 1027/1027:** all-global-events 375, body-window 140,
  windowless-body 236, body-alt 118, window 118, sourcetext 5, lexical-scopes 3,
  lexical-scopes-form-owner 4, symbol-unscopables 3, processing-algorithm 7,
  inline-ordering 3, **cancellation now 15/15** (was 14/15).
- **Scripting-errors / timers realm:** compile/runtime-error(-in-attribute) 2/2,
  body-onerror-* 2/2, runtime-error-in-body-onerror 1/1, all setTimeout/setInterval 2/2;
  window-onerror-runtime-error 2/3 (pre-existing exact-`lineno` cap).
- **Core DOM:** qsa 1975, classlist 1420, createElement 147, createElementNS 596,
  dispatchEvent 25.
- **Blast radius (fragment context + iframe parse):** DOMParser html 9/10 (noscript pre-existing)
  + xml 20/20, insertAdjacentElement 6/6, insertAdjacentText 6/6, template innerhtml 4/4 +
  outerhtml 3/3, table insertRow 3/3, tBodies 1/1, table-rows 5/5.
- **Frame path:** iframe-load 2/2, srcdoc_process_attributes 3/3, srcdoc-attribute-reset 1/1,
  Range-comparePoint 5580, Range-isPointInRange 5733, Range-intersectsNode 2356 (these drive
  frames via `contentWindow.run()` + `eval(window.testRangeInput)` — the hoist path).
- **Misc held realms:** mark 22/22, getRandomValues 39/39, url-origin 406/413,
  structured-clone 141/152 (last two pre-existing).

## Caps / Next

- **Exact error `lineno` still 0** — the runtime→Rust error boundary drops the throw site, so
  the `window-onerror-*` exact-line tests remain 2/3. The last lever behind the exact-`lineno`
  cap family; needs a v8 stack-frame location surfaced into the ErrorEvent.
- **Frame-node `_ownerDoc` gap** — a frame-parsed element's `ownerDocument` still mis-resolves
  to the main document for NON-reflect consumers (the reflect + handler-scope paths walk to the
  root to compensate). Tagging parsed frame children's `_ownerDoc` unconditionally (currently
  gated on live custom elements) would fix it at the source, but the retag runs AFTER wrapping
  (activation), so ordering must be solved first.
- **Next:** real error line/col tracking, or the frame-node `_ownerDoc` tagging gap.

## Dev notes

- `grep parse_fragment_ctx | fragment_root` before touching innerHTML/outerHTML: the fragment
  context is now the element's own tag, so a non-`body`/`div` element parses under its real
  insertion mode.
- `grep _windowForNode | _bodyReflectWin | _ehScopeChain` before touching handler scope or
  body/frameset reflection: in-frame handlers now carry the frame window in their `with` chain.
- `grep _runFrameProgram | _scanTopLevelDecls` before touching frame scripting: top-level
  `function`s are now on the frame window from the START of the program.
- The `_IframeDocument` raw-text mask (`\x00RAW<n>\x00`) must stay ahead of the structural
  `<html>/<head>/<body>` strip — re-check it before editing the frame-document constructor.
