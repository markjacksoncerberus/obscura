# 🪟 Quest #166 — The Body-Window Verdict

> *The Window-reflecting body element event handler set: on `<body>`/`<frameset>`,
> the reflecting `on*` handlers act on the Window, not the element.*

**SECURED — +234 across 4 tests, zero regressions (session 2026-07-09).**

Took Quest #165's named next lever's neighbour. #165 landed the general
GlobalEventHandlers `on*` model (element-scoped). This quest lands the HTML special
case layered on top of it: the **Window-reflecting body element event handler set**.

## The gap

HTML §"event handlers on elements, Document objects, and Window objects" defines a
special set of on-handlers that, **on `HTMLBodyElement` / `HTMLFrameSetElement`**,
do NOT act on the element — they act on the element's **Window** (its node
document's browsing-context Window). The set is:

```
{blur, error, focus, load, resize, scroll}  ∪  WindowEventHandlers
```

i.e. the 6 core names plus `afterprint beforeprint beforeunload hashchange
languagechange message messageerror offline online pagehide pagereveal pageshow
pageswap popstate rejectionhandled storage unhandledrejection unload` — **24 names**.

So `document.body.onblur = f` must be `window.onblur = f`; `body.onafterprint`
reads `window.onafterprint`; `<body onload=…>` installs `window.onload`; and a
**windowless** body (DOMParser / template contents, no browsing context) reflects
NOWHERE — its reflecting handlers read `null` and its setter is inert.

Before this quest: `#165` gave every element (incl. body) the GlobalEventHandlers
accessors for the 6 core names acting **on the element**, and no accessors at all
for the WindowEventHandlers names on elements — so `body.onblur = f` set a body
handler (window untouched) and `body.onafterprint` was `undefined`. The
`event-handler-attributes-*` reflection matrix was ~64% red.

## The fix (all `bootstrap.js`, one Rust-free increment)

1. **Canonical reflecting set + Window resolver** (early EH helper block). A
   `_BODY_WIN_REFLECT_SET` of the 24 `on*` names; `_bodyReflectWin(el)` =
   `el.ownerDocument.defaultView || null` (the browsing-context Window, `null` for a
   windowless document → inert reflection, matching spec); `_isBodyWinReflect(el,
   name)` gates on a set-membership check **plus `instanceof HTMLBodyElement /
   HTMLFrameSetElement`** — no bridge crossing on the setAttribute hot path.

2. **IDL accessors** installed on `HTMLBodyElement.prototype` and
   `HTMLFrameSetElement.prototype` (`_installBodyWinReflectAccessors`), shadowing
   HTMLElement's element-scoped accessors for these names: get/set forward to
   `window.on<name>` (or null/no-op when windowless).

3. **Content-attribute reflection** in `setAttribute`/`removeAttribute`: a reflecting
   name on a body/frameset routes to `_bodyWinSetContentAttr` (eager-compile the
   source, assign to `window.on<name>` — whose accessor registers the listener so a
   dispatch on the Window fires it) instead of the element-scoped `_ehSetContentAttr`.

4. **Window on-handler set completed**: added `afterprint`, `messageerror`,
   `pagereveal`, `pageswap` to the window on* accessor installer (they were missing,
   so `window.onafterprint` etc. were `undefined`/data-props → the body reflection had
   no live listener to fire).

5. **`window.onerror` / `window.onunhandledrejection` default to `null`** per HTML.
   They used to be seeded with internal reporter/no-op stubs, which made them
   **non-null** and visible to pages (the reflection tests read `window.onerror` and
   expect `null` after removal). The uncaught-listener capture into `__obscura_errors`
   moved into `_reportError` directly; a page-supplied `window.onerror` is still
   invoked there (5-arg form preserved). Verified nothing else calls either name
   (only `_reportError` reads `onerror`; nothing invokes `onunhandledrejection`).

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `event-handler-attributes-body-window.html` | 75/140 | **139/140** | **+64** |
| `event-handler-attributes-windowless-body.html` | 152/236 | **236/236** | **+84** |
| `event-handler-attributes-body-alt.html` | 75/118 | **118/118** | **+43** |
| `event-handler-attributes-window.html` | 75/118 | **118/118** | **+43** |
| **Total** | | | **+234** |

**Zero regressions** — held at baseline: `event-handler-all-global-events` 375,
`event-handler-processing-algorithm` 7, `inline-event-handler-ordering` 3,
`onerroreventhandler` 0/3, `eventhandler-cancellation` 14/15, qsa 1975, classlist
1420, createElement 147, dispatchEvent 25, dialog-open 3. body-alt / window /
windowless baselines proven via stash-A/B rebuild.

## Caps / Next

- **`window.onload` is a data property, not a listener** — the 1 remaining
  body-window fail (`shadowed load on body fires when event dispatched on window`)
  and **`body-onload.html`** (0/1) both need `window.onload` to fire *through
  dispatch* with `currentTarget === window`. Today the load-event driver
  (`page.rs:626` for the main window, `bootstrap.js:5735` for frames) invokes
  `window.onload()` **directly** (no event arg → `e.currentTarget` is undefined) and
  separately dispatches a `load` event that the data-prop onload never sees. The
  root-cause fix is to **convert `window.onload` to a real event-handler accessor**
  (register a `load` listener, like the other window on-handlers) and **remove both
  direct `window.onload()` calls**, so it fires once, through dispatch, with the
  correct `currentTarget`. This touches the core load-machinery and its listener
  ordering (onload would fire in registration order rather than always-first) — its
  own careful increment with a full load-sequence regression sweep. Unlocks
  body-onload + the load-fires subtest. **This is the named next lever.**
- **`event-handler-attributes-window-frameset.html`** 0/118 and
  **`-frameset-window.html`** could-not-run — proven **pre-existing** (stash baseline
  0/118): they need a real **frameset document** (`document.body` === the root
  `<frameset>` in a frames document), a parsing/document-model gap unrelated to this
  quest.
- **Scope-chain compilation** (from #165) still open: `compile-event-handler-lexical-scopes`
  / `-symbol-unscopables` / `event-handler-sourcetext` need the handler body run with
  element/form-owner/document in scope + exact `.toString()` source.
