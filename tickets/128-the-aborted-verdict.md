# Quest #128 — The Aborted Verdict

**Realm:** `AddEventListenerOptions.signal` — AbortSignal-driven listener removal
**Files:** `crates/obscura-js/js/bootstrap.js` (no Rust)
**Result:** `dom/events/AddEventListenerOptions-signal.any.html` **4/11 → 11/11 (+7)**, zero regressions, no cap.

## The gap

After #127 took named-document-access to 80/82, swept the fresh `dom/events` /
`dom/abort` ground flagged as "implementable" in #127's next-leverage. The widest
single tail was `AddEventListenerOptions-signal.any.html` at **4/11**: Obscura
ignored the `signal` member of the `addEventListener` options dictionary entirely.

The DOM `addEventListener(type, callback, options)` spec accepts an `AbortSignal`
in `options.signal`. When that signal aborts, the listener is **removed** — the
declarative twin of `removeEventListener`. Obscura stored `capture`/`once`/`passive`
from the options dict but never read `signal`, so:

- aborting the controller never removed the listener (it kept firing);
- `{signal, once}`, `{signal, capture}`, multi-listener and abort-from-within-a-listener
  all left the listener live;
- passing `{signal: null}` did **not** throw `TypeError` (WebIDL requires it — see below).

## The spec primitive

`AddEventListenerOptions.signal` is a **non-nullable** `AbortSignal` WebIDL member.
Two consequences:

1. **Type coercion (argument processing, before the algorithm runs).** A *present*
   `signal` that isn't an `AbortSignal` fails interface conversion → `TypeError`.
   `null` is the test case: `addEventListener("foo", () => {}, {signal: null})` throws,
   and so does `addEventListener("foo", null, {signal: null})` — proving the signal
   check happens **before** the null-callback step.
2. **"add an event listener" steps.** If the signal is already **aborted**, the
   listener is not added at all. Otherwise it's added, and an abort algorithm is
   registered on the signal that **removes** this listener when the signal fires.

## The fix (all in `bootstrap.js`, no Rust)

Single edit to `_addListenerByKey` (~line 3974) — the **one** choke point every
`addEventListener` path funnels through (`EventTarget`/Node via `_addListener`, the
window, iframe window/document targets directly). After flattening the options:

```js
const signal = o.signal;
if (signal !== undefined && !(signal instanceof globalThis.AbortSignal))
  throw new TypeError("…member signal is not of type AbortSignal.");
if (handler == null) return;            // null-callback step, AFTER the signal check
if (signal && signal.aborted) return;   // aborted signal → never add
… push the listener …
if (signal) signal.addEventListener('abort', function() {
  _removeListenerByKey(key, type, handler, { capture: cap });
});
```

Key ordering details, each load-bearing:
- The `TypeError` precedes the `handler == null` early-return, so the
  `{signal:null}`-with-null-callback test throws (WebIDL coerces args before the
  algorithm sees the callback).
- The aborted-signal guard sits **after** the dedupe `return` paths would, but the
  abort-algorithm registration sits **after** the dedupe check too — so a duplicate
  add (same handler+capture) or a null-callback add returns *without* arming an abort
  algorithm, matching spec (no listener was added, so nothing to remove).
- Removal goes through the existing `_removeListenerByKey`, matching by
  handler+capture — exactly the entry that was pushed.

`AbortSignal` is defined later in the file (~line 13156) than `_addListenerByKey`,
but the reference is resolved at call time, so the forward reference is fine.

## Why the in-flight cases work (free, via existing dispatch)

`_invokeListeners` already snapshots the listener list and re-checks
`live.indexOf(e) === -1` before invoking each one. So "abort from inside a listener"
(`controller.abort()` in handler A removes handler B mid-dispatch) just works: the
abort fires the signal's registered removals, B leaves the live registry, and the
dispatch loop skips it. No dispatch changes were needed.

## Results

| Subtest | Before | After |
|---------|:------:|:-----:|
| allow removing a listener | ✗ | ✓ |
| does not prevent removeEventListener | ✗ | ✓ |
| works with the once flag | ✗ | ✓ |
| multiple listeners | ✗ | ✓ |
| works with the capture flag | ✗ | ✓ |
| aborting from a listener skips future listeners | ✗ | ✓ |
| null signal throws | ✗ | ✓ |
| null signal + null callback throws | ✗ | ✓ |
| (3 already-green) | ✓ | ✓ |
| **Total** | **4/11** | **11/11 (+7)** |

## Zero-regression sweep

Held (final binary): qsa 1975, Node-properties 726, createElement 147, nameditem-01
7/7, Event-dispatch-bubbles-true 5/5, Event-dispatch-order 1/1, EventListenerOptions-capture
4/4, AddEventListenerOptions-once 4/4, EventTarget-add-remove-listener 1/1,
EventTarget-addEventListener 1/1, EventTarget-removeEventListener 1/1,
EventListener-handleEvent 6/6, remove-all-listeners 2/2, dom/abort/event.any 15/16.

`AddEventListenerOptions-passive.any` (2/5) was verified to fail only on
**passive-`preventDefault`** subtests (defaultPrevented not suppressed when
`passive:true`) — a dispatch-time concern my signal-only edit never touches. Pre-existing,
and a clean next-quest candidate.

## No cap (realm 100%).

## Next leverage

- **`AddEventListenerOptions-passive.any.html` 2/5** — honor the `passive` flag during
  dispatch: a `preventDefault()` (and `returnValue=false`) from a passive listener must
  be ignored (and log a warning). `passive` is already stored per-listener; the gate
  belongs in `Event.preventDefault` / `_invokeListeners`. Small, well-scoped, ~+3.
- **Shadow-tree scope discrimination** — standing #1 cap (aria-element 5 residual,
  CSSStyleSheet-constructable 6/13).
- **Namespaced cascade-match Rust lift** (`crates/obscura-dom/src/selector.rs`,
  `set-selectorText-namespace` 0/5).
- **Sweep another fresh DOM/HTML region** — core DOM/event primitives keep paying off.
