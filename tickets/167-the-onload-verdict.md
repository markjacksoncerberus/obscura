# 🔔 Quest #167 — The Onload Verdict

> *`window.onload` as a real `load`-event listener: it fires once, through
> dispatch, with `currentTarget === window` — not a data-property invoked by
> hand.*

**SECURED — +2 across 2 tests, zero regressions (session 2026-07-09).**

Took Quest #166's named next lever. #166 landed the Window-reflecting body
element event handler set (`body.onload` reflects to `window.onload`), but left
one honest cap: **`window.onload` was a data property, not a listener.** This
quest converts it to a real accessor and rewires the load-event driver so onload
fires through dispatch.

## The gap

`window.onload` was one of two names (`load`, `error`) deliberately excluded from
the window on-handler *accessor* machinery — they kept plain data-property
semantics. The reason (recorded in the exclusion comment) was that the main
load-event driver **both** called `window.onload()` **directly** **and**
dispatched a `load` event; making onload a listener would have double-fired it.

But the direct call passed **no event argument**, so inside the handler
`event.currentTarget` was `undefined`. Two subtests pinned exactly this:

- **`body-onload.html`** — creates a *detached* `<body>`, sets `b.onload = fn`
  (which reflects to `window.onload` per #166), and asserts `e.currentTarget ===
  window`. With a data-prop invoked by hand and no event arg, `e` was undefined →
  0/1.
- **`event-handler-attributes-body-window.html`** — its one remaining fail,
  *"shadowed load on body fires when event dispatched on window"*, needs
  `window.onload` to fire when a `load` event is **dispatched** at the window.

## The fix (one `bootstrap.js` line + one `page.rs` line)

1. **`window.onload` is now a real listener accessor.** Removed `"load"` from
   `_WINDOW_ONHANDLER_DATA` (`bootstrap.js`) — the set that keeps a window
   on-handler as a plain data property. Now the accessor install loop gives
   `onload` the same get/set-registers-a-`load`-listener behaviour as
   `onresize`/`onpopstate`/etc.: `window.onload = fn` registers a `load`
   listener; re-assigning removes the old one and adds the new (so the
   `assert_unreached` first handler in `body-onload` is correctly replaced).
   **`error` stays a data property** — `window.onerror` has the bespoke
   `OnErrorEventHandler` `(message, source, lineno, colno, error)` signature and
   is not a plain `error`-type listener.

2. **The load driver no longer calls `window.onload()` directly.** Removed the
   `if (typeof window.onload === 'function') { window.onload(); }` line from the
   `<load-event>` step in `page.rs`. The very next line already dispatches a
   trusted, non-bubbling `load` at the window (`_dispatchSpec(window, __ld)`) —
   which now fires the onload listener once, in registration order, with
   `currentTarget === window`.

### Why the frame path was left untouched

The frame load driver (`bootstrap.js` `_runFrameScripts`, ~line 5735) also
directly invokes `win.onload(new Event('load'))`, but **that line stays.** Frame
windows are `_IframeWindow` instances behind a Proxy that falls through to
`globalThis` for un-owned props; `frameWin.onload = fn` sets a **plain own data
property** (no accessor), and `frameWin.dispatchEvent(load)` — keyed by the
frame's `_evtKey` listener store — would never fire it. So for frames the direct
call is the *only* thing that fires onload, and there is no double-fire to
remove. The two target tests both run in the **main** window (the detached body's
`ownerDocument.defaultView` is the main window), so only the main path needed
changing. `iframe-load-event.html` held 2/2.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `body-onload.html` | 0/1 | **1/1** | **+1** |
| `event-handler-attributes-body-window.html` | 139/140 | **140/140** | **+1** |
| **Total** | | | **+2** |

**Zero regressions** — the load lifecycle is exercised heavily and all held:
`iframe-load-event` 2/2, `user-timing/measures` 119/119 (runs from `<body
onload>` → `window.onload`), `user-timing/clearMarks` 57/57,
`navigation-timing/test-document-onload` 3/3, `nav2-test-attributes-exist` 1/1
(entry queued at load), `event-handler-all-global-events` 375, `-processing-
algorithm` 7, `inline-event-handler-ordering` 3, `onerroreventhandler` 0/3
(pre-existing TIMEOUT cap), `eventhandler-cancellation` 14/15 (pre-existing),
`event-handler-attributes-{window,body-alt,windowless-body}` 118/118/118/236,
qsa 1975, classlist 1420, createElement 147, dispatchEvent 25.

## Caps / Next

- **Frame-window `onload` as a listener** — the symmetric change for
  `_IframeWindow` would require giving frame windows the on-handler accessors
  (they currently proxy to `globalThis` and store onload as a bare data
  property). Not needed for any current red test; deferred until a frame-onload
  test demands it.
- **`event-handler-attributes-window-frameset.html`** 0/118 + `-frameset-window`
  could-not-run remain the pre-existing **frameset-document** cap (a real
  `<frameset>`-rooted frames document; proven pre-existing in #166).
- **Scope-chain compilation** (from #165) still open:
  `compile-event-handler-lexical-scopes` / `-symbol-unscopables` /
  `event-handler-sourcetext` (0/3, 0/3, 0/5) need the handler body run with
  element/form-owner/document in scope (nested `with`) + exact `.toString()`
  source. **This is the named next lever** — the last structural gap in the
  event-handler realm.
- **Markup on-handler activation** (from #165): `<div onblur>` from *parsed* HTML
  still fires nothing (only JS `setAttribute`/IDL paths activate a listener).
