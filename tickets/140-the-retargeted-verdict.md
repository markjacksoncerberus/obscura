# Quest #140 — The Retargeted Verdict (+107)

**Realm:** `shadow-dom/event-*` — event retargeting, `composedPath()`, and the full
DOM §2.9 dispatch algorithm across shadow trees.

**Session:** 2026-07-04. All `bootstrap.js`, no Rust.

## The gap

Obscura's event dispatch built a **flat propagation path** — `target → parentNode
ancestors → document → window` — with no notion of shadow trees:

- `event.target` was set **once** to the dispatch target and never retargeted, so a
  listener on a shadow host saw the deep in-shadow node instead of the host.
- `composedPath()` returned that flat path verbatim — no closed-tree hiding, and it
  didn't cross slots or shadow boundaries.
- `event.relatedTarget` was never retargeted per node.
- The path never entered a shadow tree from a slotted node, nor climbed from a
  shadow root to its host.

This left the whole `shadow-dom/event-*` frontier almost entirely red (~14/110).

## The work

Rewrote the three dispatch primitives to the DOM Standard §2.9 "dispatch"
algorithm. New shadow-aware helpers (next to the old `_eventParent`, which this
replaced):

- `_isSR(n)` — a node is a ShadowRoot iff it has a `_shadowHost`.
- `_nodeRoot(n)` — topmost node via `parentNode` (bottoms out at a ShadowRoot).
- `_shadowIncAncestor(anc, node)` — shadow-including inclusive ancestor (parent
  chain, jumping shadow-root → host).
- `_retarget(A, B)` — DOM "retarget A against B": climb A out of each shadow tree to
  its host until A's root isn't a shadow root, or B lives at/under A's root.
- `_assignedSlotOf(n)` — the slot a slottable is assigned to (`_findSlotFor(n,
  false)` — closed slots included, unlike the public `assignedSlot` getter).
- `_getEventParent(node, event, firstIT)` — DOM "get the parent": assigned slottable
  → its slot; shadow root → host (or null when non-composed and we'd escape the
  origin tree); document → window; window → null.

**`_dispatchSpec`** now builds an **event path of structs** `{it, sat, rt, rct,
sct}` (invocation target, shadow-adjusted target, retargeted relatedTarget,
root-of-closed-tree, slot-in-closed-tree) via the spec's `while (parent)` walk,
tracking the evolving `target` for the shadow-inclusive-ancestor branch, the
slottable/slot-in-closed-tree bookkeeping, and the §2.9-step-5 skip gate (target
retargets onto its own related target). `event.target` per struct = the last
non-null shadow-adjusted target at-or-before it (precomputed as `s.et`).

**`_invokeListeners`** takes a struct, sets `event.currentTarget = struct.it`,
`event.target = struct.et`, and (only when the event already has one)
`event.relatedTarget = struct.rt`. It also manages **`window.event` per struct** —
exposed only when the invocation target is **not** in a shadow tree (saved/restored
around each struct's listeners), so shadow internals don't leak through the legacy
global.

**`composedPath()`** reimplemented as the spec algorithm: find the current target's
struct and its closed-subtree nesting level, then walk inward (prepend) and outward
(append) emitting only invocation targets no deeper in a closed tree than the
current target (via the `rct`/`sct` hidden-level counters).

**clear-targets** is computed **before** any listener runs (a listener may move the
target across a shadow boundary; the decision must reflect the tree as it stood at
dispatch) and nulls `event.target`/`relatedTarget` on cleanup when the outermost
shadow-adjusted struct's target/related is still inside a shadow tree.

Plus a one-liner: `Element.click()` now dispatches its synthetic `MouseEvent` with
`composed: true` (UA click events are composed).

## Results (+107 across 13 tests, ZERO regressions)

| Test | Before | After |
| --- | --- | --- |
| `event-inside-slotted-node` | 0/20 | **20/20** |
| `event-with-related-target` | 0/18 | **18/18** |
| `event-post-dispatch` | 3/16 | **16/16** |
| `Extensions-to-Event-Interface` | 8/16 | **16/16** |
| `event-composed-path-with-related-target` | 4/13 | **13/13** |
| `event-inside-shadow-tree` | 0/12 | **12/12** |
| `event-composed-path` | 1/11 | **11/11** |
| `event-composed` | 5/9 | **9/9** |
| `capturing-and-bubbling-…-across-shadow-trees` | 1/5 | **5/5** |
| `event-post-dispatch-no-listeners` | 0/5 | **5/5** |
| `event-composed-path-after-dom-mutation` | 0/2 | **2/2** |
| `event-dispatch-order.tentative` | 0/1 | **1/1** |
| `dom/events/event-global` | 4/8 | **5/8** |

**ZERO regressions** (stash-verified baselines, all held): qsa 1975, classlist 1420,
Node-properties 726, cloneNode 135, createElement 147, DOMTokenList-value 1,
getElementsByTagName 19, slots 26, slots-fallback 13, ShadowRoot-interface 8/12,
type-change-state 380, EventTarget-dispatchEvent 25, Event-propagation 7,
Event-dispatch-bubbles-false 5, Event-dispatch-order 1, Event-dispatch-reenter 1.
`event-global` 4→5 (improved), `Event-dispatch-detached-input-and-change` 4/12 and
`checkbox` 1/6 both **identical before and after** (their fails are the separate
input/change-on-activation feature, not dispatch).

## Caps / Next

- **`focus-within-shadow` (0/1)** — needs real in-shadow focus tracking
  (`ShadowRoot.activeElement`); same cap as the ShadowRoot-interface residual 4/12.
  NOT touched by this quest.
- **`slotchange` events** (still unfired) — the query-lazy slot model has no mutation
  bookkeeping; `imperative-slot-api` residual 9/16 and the `slotchange*.html` tests
  (which HANG on a 90s timeout — keep them out of batch runs) need a "signal a slot
  change" queue + microtask flush. Biggest self-contained shadow residual left.
- **Declarative shadow DOM** (`<template shadowrootmode>`) — parser attaches a shadow
  at parse time; gates `attachShadow-with-ShadowRoot` (0/2).
- **`ShadowRoot.activeElement` / `styleSheets`** on connected shadow trees — shadow
  trees never enter the render tree (same lift as `CSSStyleSheet-constructable`
  `adoptedStyleSheets`).
- **Input activation behavior** — `checkbox`/`detached-input` want `input`+`change`
  events fired by the click activation algorithm; a separate forms-events realm.
