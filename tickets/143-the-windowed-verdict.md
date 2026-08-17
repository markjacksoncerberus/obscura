# Scroll 143 — The Windowed Verdict (Quests #590–#594)

**Date:** 2026-08-16 · **Region:** popup-gated realms after #588
(`html/browsers/the-window-object` + the six `webstorage` `window.open` caps)
· **Branch:** `engine-per-page-threads`

## The verdict, in one breath

`window.open` started returning a window in #588, and every realm that used
to die on `null` immediately walked one step further and fell over. The
window it handed back was the **unproxied target**, not the object the page
holds: `w.window !== w`, `w.globalThis` was the *opener*, `w.name` was a
dead data field, `w.close()` set a flag and fired nothing, two
`window.open("", "foo")` calls produced two windows, and every popup
shared the opener's `sessionStorage` bottle. Five primitives: a Window's
identity is the proxy; a name finds a browsing context; `close()` has a
lifetime; sessionStorage is per top-level context; `window.length` is
live on every window, including after a nested discard.

## Quest #590 — the Window the page holds IS the Window

`_IframeWindow` built `this.self = this; this.window = this; this.frames
= this` and then `return new Proxy(this, …)`. The page only ever sees the
proxy, so `w.window === w` was false on every iframe and every popup —
and `w.globalThis` was not set at all, so the proxy fell through to the
embedder. `self-et-al` was 0/8 for exactly that reason.

After the Proxy is built, `self` / `window` / `frames` / `globalThis`
are stamped with **the proxy**. They survive removal and close (they are
data properties on the target). **0/8 → 8/8.**

## Quest #591 — a name is a browsing context

`window.open(undefined, "foo")` skipped the named-frame path because
`url != null` was false, and opened a fresh popup instead
(`window-open-defaults`). Named popups were not remembered, so
`window.open("", "n")` twice was two windows (`storage_session_window_reopen`,
`close-method`'s second test).

Now: empty / omitted URL means "just hand me that window"; a non-empty
URL navigates it. Auxiliary windows are registered by name and forgotten
**synchronously** on `close()` so a second `open` with that name is a
new context. `window.name` starts as the host iframe's `name` attribute,
does not write the attribute back, and becomes `""` (writes ignored)
once the host is gone. An invalid URL (NUL, unparseable) throws
`SyntaxError`. `window.opener` on the main window is a real
`[Replaceable]` accessor (non-configurable write → TypeError).

`window-open-defaults` 0/1→**1/1**, `name-attribute` 0/1→**1/1**,
`window-open-invalid-url` 0/1→**1/1**, `window-opener-unconfigurable`
0/1→**1/1**, `storage_session_window_reopen` 0/1→**1/1**.

## Quest #592 — `close()` has a lifetime

`close()` set `closed = true` and returned. No `pagehide`, no discard,
`opener` stayed set, so `close-method` timed out waiting for a handler
that never ran.

HTML: `closed` is true immediately; discard is a queued task. During
`pagehide`, `opener` is still the opener; the next task sees `opener ===
null`. Removing an `<iframe>` discards its nested browsing context
**immediately** (and every nested context inside that window's
*document* — walking the host element's children misses srcdoc
descendants). `closed-after-close` needs the popup's child frames to
stay reachable *until* that discard task.

`close-method` 0/2 TIMEOUT→**2/2**, `closed-attribute` 3/6→**6/6**
(cross-origin/cross-site rows came along because discard does not care
about origin), `closed-after-close` 0/1→**1/1**.

## Quest #593 — sessionStorage is per top-level browsing context

One shared session bottle meant a popup saw the opener's writes after
`open()`, and the opener heard the popup's `storage` events. HTML:
sessionStorage is per-origin **per top-level browsing context**, cloned
from the opener at creation (empty under `noopener`), then independent.
`storage` events stay inside one bottle.

`noopener` popups return `null` to the caller (no handle) and still
load, with an empty session. The child talks back through
`BroadcastChannel`, which was a no-op stub — now same-name peers deliver
on a task. That single pipe took `storage_session_window_noopener`
TIMEOUT→**1/1**.

`storage_session_window_open` 0/1→**1/1**,
`event_session_window_open_scope` 0/1→**1/1**. Combined with #588's two
localStorage popup rows, **the six `window.open` caps named in #463 are
gone.** `webstorage/*` 1281/1288 → **1287/1288**. The last fail is the
cross-origin one, still a real cap.

## Quest #594 — `window.length` is live on every Window

The main window already had live `length` / `window[i]`. Iframe and
popup windows stored `this.length = 0` as a data field, so
`other_window.length` stayed 0 after you appended an iframe to the
popup, and `frameW[0]` was accidentally the *embedder's* `window[0]`
(the proxy fell through to `globalThis`).

`length` is now a getter over that window's own `iframe`/`frame`
children; the proxy trap serves numeric indices and named child access
(`frameW.x`) from the same list. After discard the list is empty, even
if the detached document still has `<iframe>` children in the tree.

`window_length` 5/7→**7/7**, `length-attribute` 0/1→**1/1**.

## Results

| Test | Before | After |
|---|---|---|
| `webstorage/storage_session_window_open.window.html` | 0/1 | **1/1** |
| `webstorage/storage_session_window_noopener.window.html` | 0/1 TIMEOUT | **1/1** |
| `webstorage/storage_session_window_reopen.window.html` | 0/1 | **1/1** |
| `webstorage/event_session_window_open_scope.html` | 0/1 | **1/1** |
| `webstorage/storage_local_window_open.window.html` | 1/1 (#588) | **1/1** |
| `webstorage/event_local_window_open_oldvalue.html` | 1/1 (#588) | **1/1** |
| `html/browsers/the-window-object/self-et-al.window.html` | 0/8 | **8/8** |
| `html/browsers/the-window-object/name-attribute.window.html` | 0/1 | **1/1** |
| `html/browsers/the-window-object/window-open-defaults.window.html` | 0/1 | **1/1** |
| `html/browsers/the-window-object/window-open-invalid-url.html` | 0/1 | **1/1** |
| `html/browsers/the-window-object/window-opener-unconfigurable.window.html` | 0/1 | **1/1** |
| `html/browsers/the-window-object/closed-attribute.window.html` | 3/6 | **6/6** |
| `html/browsers/the-window-object/close-method.window.html` | 0/2 TIMEOUT | **2/2** |
| `html/browsers/the-window-object/open-close/closed-after-close.html` | 0/1 | **1/1** |
| `html/browsers/the-window-object/length-attribute.window.html` | 0/1 | **1/1** |
| `html/browsers/the-window-object/accessing-other-browsing-contexts/window_length.html` | 5/7 | **7/7** |
| `html/browsers/the-window-object/window-open-noopener.html?indexed` | 0/9 | **1/9** |

**Region probe (38 files):** 50/174 → **76/174**, 15 files up, 0 down.
`webstorage/*` window.open family: **6/6**, realm **1287/1288**.

## ⛔ Caps / next (named honestly)

* **Window reuse across iframe navigation** — `Window-document` 0/1.
  Navigating an `<iframe>` currently builds a *new* `_IframeWindow`. The
  spec's browsing context keeps the same Window and replaces the
  Document. Widest remaining primitive in this realm; shared path, stash-
  prove it.
* **`window.open` features** — `window-open-popup-behavior` 0/51
  TIMEOUT (BarProp / size / `isPopup`). Popups are still a behavioral
  model with no chrome and no real viewport. `BarProp` 0/2.
* **`noopener`/`noreferrer` targeting keywords** — `?_self`/`?_parent`/
  `?_top` still TIMEOUT; `?indexed` 1/9. The features tokenizer is
  enough for `noopener` as a token, not for the full tokenization suite.
* **Named access on the *main* window** is still the `#id` getter
  (`__defineNamedGlobal`), not a live named-properties object. The
  `named-access-on-the-window-object/` tail (basics 4/6, named-objects
  3/6, window-named-properties 2/7) waits on a `WindowProperties`
  prototype (window-prototype-chain 1/5).
* **`object`/`embed`/`frame` as browsing contexts** —
  `indexed-browsing-contexts-02` 0/3. An `<object type=text/html>` is
  not a child browsing context here.
* **`webstorage` last fail** — `localstorage-share-data-unrelated-origins`
  needs two real origins.
* **Carried:** `@container` in the render path (5×); `::marker { content }`
  via stylo lazy pseudo; Range rects; scroll-on-focus; webm/ogg.

## Zero-regression proof

`scripts/wpt-ritual.txt` via `wpt_batch_par.sh` (4 shards, chunk 4,
timeout 25s) on the POST binary: **330 scored files, 55126/55719**.
Held cores exact: qsa **1975/1975**, classlist **1420/1420**,
createElement **147/147**, createElementNS **596/596**, attributes
**67/67**, appendChild **11/11**, storage_setitem **1106/1106**,
cssom-setProperty **76/76**, serialize-values **696/697**,
event_no_duplicates **8/8**, event_basic **2/2**. The last ritual on
this branch was 55091/55690 over 331 rows; the denominator moved with
wpt.live content, the held ratios did not drop. Extra neighbor sweep
(same binary): the seven ritual `webstorage` files 100%,
`Document-createElement` 147/147, `EventTarget-dispatchEvent` 25/25.
`iframe-loading-lazy` 1/5 TIMEOUT — **identical to the #463/#588
recorded baseline**, not a regression.

**Zero real regressions.**
