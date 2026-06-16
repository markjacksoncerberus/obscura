# ⚔️ Quest #07 — The Event Amphitheater

> *The crowd roars in the stands, but the games were rigged — every contest of
> capture and bubble decided before a single combatant took the field. The naive
> dispatch knew only how to climb; it had never learned to descend.*

Realm: `dom/events/*` · Difficulty: ⚔️⚔️ a proper campaign

## The siege (session 2026-06-16, knight Claudius)

**Root cause.** `Node.dispatchEvent` was a bubble-only recursion (walk `parentNode`
up, fire listeners) with **no capturing phase**, no real `eventPhase`, no event
path to `document`/`window`, and a stale `addEventListener() {}` **no-op stub** still
hiding on the `Node` base (Element/Document each had their own real copy; removing
those surfaced the stub). The window kept a separate `__windowListeners` map with no
capture/options support.

**The rebuild — one unified spec dispatch (DOM §2.9).** Every EventTarget —
element/text node, `Document`, the window (`globalThis`), and the synthetic iframe
window/document — now stores listeners in the single `_eventRegistry` keyed by
`_evtRegKey(target)` (`'window'` / node `_nid` / synthetic `_evtKey`) and dispatches
through `_dispatchSpec`:
- `_eventParent` builds the propagation path: `parentNode`, then a document's
  `defaultView` (→ window), nothing above a window.
- **Capturing pass** root→target, **bubbling pass** target→root; at the target the
  capture listeners fire (capturing pass) before the bubble listeners (bubbling pass),
  matching `Event-dispatch-order-at-target`.
- `stopPropagation` checked at each struct (set-before-dispatch → zero listeners fire);
  the stop flags are **cleared on completion** so the event re-dispatches fresh
  (`Event-propagation`'s "after first dispatch").
- `once`/`stopImmediatePropagation`/removed-since-snapshot honored in the inner loop.

**Event surface.** `eventPhase` constants (NONE/CAPTURING_PHASE/AT_TARGET/
BUBBLING_PHASE) on the interface object + prototype; `cancelBubble`/`returnValue`
get/set; `composedPath()` (frozen path during dispatch, `[]` otherwise); instance
`isTrusted` (was a getter hard-wired `true`); `type` String-coercion; `initEvent`/
`initCustomEvent` mandatory-arg TypeError + `_initialized` flag.

**WebIDL guards.** `dispatchEvent(null)` → TypeError; an uninitialized event (from
`createEvent` without `initEvent`) or an in-flight event → InvalidStateError. Listener
options are *flattened* (capture/once/passive getters read) **before** the
null-callback check, and a non-dictionary options value is the capture boolean.

**Event-class hierarchy.** `UIEvent` (view + type-check, detail) → `MouseEvent`/
`KeyboardEvent`/`FocusEvent`/`CompositionEvent`/`InputEvent`; `WheelEvent`/
`PointerEvent` → `MouseEvent`; shared `getModifierState`. Null options → empty dict
across all.

**Trusted model.** Public `dispatchEvent` clears `isTrusted` (after the state check,
so a throwing re-dispatch leaves it intact); UA-fired events (a frame's `load` via
`_fireIframeElementLoad`, the main `DOMContentLoaded`/`load` from `page.rs`) call
`_dispatchSpec` directly to keep trusted. Legacy `window.event` is set during dispatch.

## Scoreboard

| Test | Before | After |
|------|:------:|:-----:|
| Event-subclasses-constructors | 10/49 | **49/49** |
| EventTarget-dispatchEvent | 4/25 | **25/25** |
| Event-cancelBubble | 0/8 | **8/8** |
| Event-returnValue | 0/7 | **7/7** |
| Event-propagation | 4/7 | **7/7** |
| Event-constants | 0/4 | **4/4** |
| Event-initEvent | 11/12 | **12/12** |
| CustomEvent | 1/3 | **3/3** |
| EventListenerOptions-capture | 2/4 | **4/4** |
| Event-dispatch-redispatch | 2/4 | **3/4** |
| ~15 single-subtest dispatch tests | mostly 0/1 | **all 1/1** |

**~110+ subtests gained. Zero regressions** (qsa 1975, classlist 1420, Node-properties
726, createElement 147, attributes 67, appendChild 11, replaceChild 29, isEqualNode 9,
handleEvent 6, MutationObserver-childList 31/38, Range-insertNode 1531,
surroundContents 1247, cloneNode 103, iframe-load 2/2).

## The honest tail
- `Event-dispatch-{click,bubbles-false,bubbles-true}` and a few heavy fixtures use
  whole-`document` `cloneNode(true)` / `new Document()` event chains that balloon the
  results table to multi-MB — a testharness heaviness, not a dispatch gap (the first
  subtests pass). The `cloneNode(true)`-of-document subtest is a genuine miss.
- `Event-dispatch-redispatch`'s last fail is a synthetic mouseup→click (CDP input),
  not the dispatch algorithm.
- Not pursued: `EventListener-incumbent-global-*` (cross-realm incumbent settings
  object), `Event-timestamp-*` high-res timing.
