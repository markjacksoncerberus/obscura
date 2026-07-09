# Quest #165 — The Handler Verdict

> **GlobalEventHandlers: `on*` event handler IDL attributes + content-attribute
> reflection.** `<div onclick="…">` and `el.onclick = fn` now actually fire.
> **+383, zero regressions.**

Region: `html/webappapis/scripting/events/` (the event-handler processing realm), the
named "next leverage" out of Quest #164.

## The gap

`el.onclick = fn` set a plain expando that fired **nowhere** — the spec dispatch loop
(`_invokeListeners`) never reads `on<type>` handlers, and there were **no** general
`on*` accessors on any element/document interface (only `window`, `FileReader`,
`CloseWatcher` had bespoke ones). A handful of manual-dispatch sites (popover toggle,
dialog events, `select`, form `reset`) hand-invoked `el['on'+type]` **after**
`_dispatchSpec`, so an IDL-set handler on those specific events worked — but every other
`onclick`/`onblur`/`onkeydown`/… did nothing, and **content attributes** (`<div
onclick>`) fired nothing at all. `event-handler-all-global-events.html` was **0/375**.

## The fix (all `bootstrap.js`)

A single event-handler model, mirroring the HTML spec and the in-repo
`_cwEventHandlerAttr` idiom:

1. **One installed listener per (target, name), at first activation.** The first time a
   handler becomes non-null — via a content attribute (`setAttribute`) OR an IDL set —
   a stable listener is registered through the normal `_addListener` path (keyed by
   nid) and **never moved**. Later value changes only rewrite the slot `__eh_<name>`, so
   on-handlers keep their registration order relative to `addEventListener` even across
   reassignment or a compile failure (this is exactly what `inline-event-handler-ordering`
   pins down).
2. **Lazy compilation.** A content attribute stores a `_RawHandler(source)`; the IDL
   getter / the listener compiles it on first read via `new Function('event', source)`,
   caching the result. A **compile error is reported and nulls the value WITHOUT
   deregistering** the listener — so a later valid re-set fires in the original slot.
3. **Return-value processing.** A handler returning `false` cancels a cancelable event
   (`event-handler-processing-algorithm`: `onmouseover`/`onclick`/`onblur`/`ondblclick`
   returning false → `defaultPrevented`; returning true does not).
4. **The accessors land on HTMLElement/SVGElement/Document/window — NOT Element.** The
   GlobalEventHandlers test asserts `name in Element.prototype === false`. `SVGElement`
   was a bare `= Element` alias (so `SVGElement.prototype === Element.prototype`), which
   would have leaked the handlers onto `Element.prototype`; it is now a **distinct
   `class SVGElement extends Element`** (+ `SVGSVGElement`), and `createElementNS` in the
   SVG namespace wraps with it so `svg.onclick` defaults to `null`. `_ehDefineOnProto`
   skips a name that already has an own accessor, so window's existing `__winon_` set and
   CloseWatcher keep their bespoke definitions and only window's *missing* names get added.
5. **Double-fire removed.** The four manual `el['on'+type]` invocations (popover
   `_fireToggleEvent`, dialog `_fireDialogEvent`, `_fireSelectEvent`, form reset) were
   deleted — those handlers now fire as installed listeners during `_dispatchSpec`, and
   the reset's `if (ev.defaultPrevented) return` still sees a `return false`/`preventDefault`.
   The two UA-fired subresource paths (`_fireIframeElementLoad`, `_fireElementError`) keep
   their markup `on{load,error}` eval fallback but gate it on `!el['__ehon_<name>']` so an
   IDL/JS-set handler (now a listener) isn't run twice.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `event-handler-all-global-events.html` | 0/375 | **375/375** | **+375** |
| `event-handler-processing-algorithm.html` | 2/7 | **7/7** | **+5** |
| `inline-event-handler-ordering.html` | 0/3 | **3/3** | **+3** |

**+383 total, zero regressions.**

Zero-regression sweep (all held): qsa 1975, classlist 1420, dispatchEvent 25,
insertBefore 39/40, createElement 147, focus-pseudo-matches-on-shadow-host 20,
focus-method-delegatesFocus 15, toggleevent-interface 39, textfieldselection/select-event
270, resetting-a-form/reset-form 12, reset-event 1. `popover-events` 5/6 was proven
**pre-existing** via a stash-A/B rebuild (its 1 fail — a popover removed during
focus/blur — is unrelated to on-handlers and red on the baseline binary too).

## Caps / Next

- **Scope-chain compilation (follow-up lever).** `compile-event-handler-lexical-scopes`
  (0/3), `compile-event-handler-symbol-unscopables` (0/3), `event-handler-sourcetext`
  (0/5) need the compiled body to run with the element / form-owner / document in scope
  (nested `with`) and to expose the exact source text via `.toString()`. Deliberately
  deferred — a plain `new Function('event', src)` greens every all-global-events subtest;
  scoping is its own increment (touches how bareword identifiers resolve inside handlers).
- **Markup activation (the direct route to `focus-within-focus-move`).** Content-attribute
  handlers from **HTML markup** (`<div onblur="…">`) are NOT yet activated — only the JS
  `setAttribute`/IDL paths are. Elements created by createElement + setAttribute/IDL (i.e.
  every all-global-events subtest) work; parsed markup on-handlers still fire nothing
  (except `on{load,error}` via the eval fallback). The clean fix is to activate an
  element's `on*` content attributes at **wrapper construction** (registration then
  precedes any later `addEventListener`, so ordering stays correct) — ideally gated on a
  cheap Rust "has event-handler attrs" node flag so the hot createElement/append paths pay
  nothing. That unlocks `focus-within-focus-move` (needs markup `onblur`) and a broad
  inline-handler markup tail.
- **`onerror` special form.** `eventhandler-cancellation` 14/15 — the 1 fail wants an
  ErrorEvent `onerror` on the iframe **window** to cancel on `return true` (the
  `OnErrorEventHandler` inversion). Narrow, lives in the iframe-window onerror subsystem;
  a pre-existing cap.
