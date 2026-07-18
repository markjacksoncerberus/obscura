# Quest #157 — The Watched Verdict (+65)

**Realm:** the **`CloseWatcher` API** (`close-watcher/` — found ENTIRELY red) plus the
root-cause fix that unblocked its keyboard tail: **Window `on*` event-handler IDL
attributes that actually register listeners.**
**Files:** `crates/obscura-js/js/bootstrap.js` (the `CloseWatcher` class + close-watcher
manager + the Window on-handler accessors + the `_processCloseRequest` close-watcher
ranking), `scripts/wpt_run.py` (the bridge grants user activation on `click`/`bless()`).
**Result:** **+65, ZERO regressions** (stash-verified against clean HEAD).

## The gap

The whole `close-watcher/` realm was dark: `new CloseWatcher()` threw (undefined), so
`basic`/`abortsignal`/`event-properties`/`frame-removal`/`inside-event-listeners` and
every `esc-key`/`user-activation` test failed. `CloseWatcher` is HTML §6.10 — the
anti-abuse infrastructure behind *close requests* (the Esc key / platform "close"
gesture). It is also the model that modal dialogs and popovers are *supposed* to be built
on: `showModal()`/`showPopover()` establish a close watcher, and one close request closes
the whole group of watchers created without intervening user activation.

Most of the API was **already drafted uncommitted in the working tree** from a prior
session (the close-watcher manager + the `CloseWatcher` class + a `_cwTopSeq` ranking
splice into `_processCloseRequest`, plus a `__obscuraUserActivation` hook in the bridge).
This quest **verified, measured, root-cause-fixed, regression-swept, and completed** it.

## The two pieces

### 1. The `CloseWatcher` API + close-watcher manager (prior-session draft, verified)

A per-Window "close watcher manager": a list of GROUPS (each a list of watchers), an
"allowed number of groups" (starts at 1), and a "next user interaction allows a new
group" flag.

- **Establish** appends the watcher as its own new group if `groups.length <
  allowedGroups`, else onto the last group — so watchers created WITHOUT intervening
  activation pile into ONE group and a single Esc closes them all.
- **User activation** (`__obscuraUserActivation`, called by the bridge's `click`/`bless()`
  — never by the Esc key itself) banks room for one more group.
- **Request-to-close** fires a cancelable `cancel` (cancelable only when the request
  doesn't require activation OR there's banked activation room); a prevented cancel
  consumes the activation. Otherwise fires `close`.
- **Process** runs the LAST group in reverse order until one prevents, then decrements
  the allowed group count (floor 1).
- `CloseWatcher` itself: `requestClose()`/`close()`/`destroy()`, `cancel`/`close`
  events over the shared listener registry, `oncancel`/`onclose` event-handler attrs
  (persistent-listener pattern so handler position is stable), the `signal` option
  (abort → destroy).

`_processCloseRequest` (the Esc entry point from #156) already ranked popovers vs modal
dialogs by the monotonic `_topLayerSeq`; the draft added: a close-watcher group ranks by
its topmost watcher's stamp, and if it sits above any popover/dialog the request routes to
`_cwProcessCloseWatchers()` instead. No watchers → `cwSeq` is −1 and the popover/dialog
path is untouched (provably inert off-CloseWatcher — regression-swept).

### 2. Window `on*` handlers as real accessors (this session's root-cause fix)

`close-watcher/esc-key/keydown` stayed red: `window.onkeydown = e => e.preventDefault()`
should suppress the close request, but the events still fired. **Root cause:** the Window
`on*` handler IDL attributes were installed purely for feature detection
(`("on"+ev) in window`) as inert `null` data properties — assigning `window.onkeydown =
fn` never registered a listener, so the handler never ran. (`window.addEventListener(
'keydown', …)` worked fine; the on-attribute path was dead.)

Fixed by making them **accessor properties** that register/unregister a listener via the
shared Window listener path (mirroring the FileReader on-handler pattern) — so
`window.onkeydown`, `onresize`, `onpopstate`, `onhashchange`, … now actually fire during
dispatch. This is broadly useful browser behavior, not just a test fix.

**EXCLUSIONS (kept as plain data properties):** `onload` — the load driver both calls
`win.onload(...)` directly AND dispatches a `load` event, so registering a listener would
**double-fire** (this would have regressed `iframe-load-event` 2/2); and `onerror` — it is
invoked manually with its bespoke `(message, source, lineno, colno, error)` signature. The
only event dispatched to the window in the whole engine is `load` (verified by grep), so
excluding those two makes the change safe. The forward reference to `_addListener`/
`_removeListener` (`const`s declared later) is fine — the setter only touches them at call
time, long after bootstrap runs.

## Results (stash-verified before → after)

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `close-watcher/basic.html` | 0/7 | 7/7 | +7 |
| `close-watcher/event-properties.html` | 0/1 | 1/1 | +1 |
| `close-watcher/abortsignal.html` | 0/9 | 9/9 | +9 |
| `close-watcher/frame-removal.html` | 0/6 | 5/6 | +5 |
| `close-watcher/inside-event-listeners.html` | 0/12 | 12/12 | +12 |
| `close-watcher/esc-key/{keydown,keypress,keyup,not-user-activation,synthetic-keyboard-event}.html` | 0/5 | 5/5 | +5 |
| `close-watcher/user-activation/*.html` (28 files) | 2/37 | 28/37 | +26 |
| **Total** | | | **+65** |

(`user-activation` before = 2: `y-dialog-disconnected` + `y-popover-disconnected` were
already green at HEAD via the existing single-element close path — honestly subtracted.)

**Zero-regression sweep** (all held with the restored work): qsa 1975, createElement 147,
dispatchEvent 25, Node-appendChild 11, Node-insertBefore 39, structured-clone 141,
url-origin 406, mark 22, getRandomValues 39, **iframe-load-event 2/2** (the `load`
exclusion held), popover-attribute-basic 159, toggleevent-interface 39, command
event-interface 22 / on-dialog-behavior 104 / button-type-behavior 23, dialog-open 3,
dialog-close 5. `event-handler-attributes-body-window` stayed 0/140 (already 0 at HEAD —
a separate body↔window handler-reflection feature we don't implement).

## Caps / Next

- **The 9 `-dialog`/`-popover` `user-activation` variants** need modal dialogs and
  popovers wired into the close-watcher manager AS close watchers (a `showModal()` /
  `showPopover()` establishes a close watcher; hide destroys it), so a single Esc closes a
  whole group of them in LIFO order — currently `_processCloseRequest` closes only the
  single topmost top-layer element. This is the **spec-correct root architecture** (the
  `_topLayerSeq` ranking is a workaround the close-watcher model supersedes) and the widest
  next lever *within* close-watcher — **but it touches the hot `_showPopover`/`_hidePopover`/
  `_showModalDialog` paths**, so it must be done surgically with a full regression sweep of
  the ~1200-subtest popover/dialog suites. Deferred this session to bank the clean +65.
- **`close-watcher/frame-removal` last subtest** + **`close-watcher/iframes/*`** are
  cross-realm/cross-frame (constructing in a detached iframe realm should throw
  `InvalidStateError`; close requests should route to the focused frame) — a per-realm
  fully-active check we can't do while `CloseWatcher` is one class on the top global.
- **NEXT:** dialogs/popovers as close watchers (the grouping integration above), then a
  focus/`activeElement` model (the Tab/focus tail across popovers/dialogs/forms — still the
  widest lever overall).
