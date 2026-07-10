# Quest #175 — The Fullscreen Verdict ⚔️

> **SECURED — +10 across 2 tests, zero regressions.** Dialog/fullscreen ↔ popover
> top-layer interactions. A partial Fullscreen API (state machine only, no real
> render) + the spec-correct "modal dialog, not merely open dialog" popover-validity
> gate.

## The realm

`popover-top-layer-combinations.html` (**0/5**) and `popover-top-layer-interactions.html`
(**4/9**) — the two tests that exercise how the three top-layer element types (auto
popover, modal `<dialog>`, fullscreen element) supersede one another. Named the widest
untouched popover lever by Quest #174's Caps/Next.

## The gaps (two distinct root causes)

### 1. `showPopover()` on a non-modal open `<dialog>` wrongly threw

`popover-top-layer-combinations` opens a dialog non-modally via `ex.show()` (sets the
`open` attribute but NOT the is-modal flag) and then calls `ex.showPopover()` — which
"should not throw." Our `_checkPopoverValidity` threw *InvalidStateError: "Not supported
on <dialog> elements that are open as a dialog"* for ANY `open` attribute. Per the
current HTML "check popover validity" algorithm, the throw is gated on the dialog's
**is-modal flag**, not the bare `open` attribute:

> throw InvalidStateError if … *element is a dialog element and element's is modal flag
> is true* … or *element's fullscreen flag is set*.

A dialog opened via `show()` (non-modal) can still be shown as a popover; only a
`showModal()` dialog (or a fullscreen element) is blocked.

### 2. `requestFullscreen` didn't exist

`ex.requestFullscreen is not a function` — a synchronous TypeError. Both tests `await`
a promise from it, so the synchronous throw escaped the `.then/.catch` and rejected the
whole `promise_test`. This blocked **all 5** interactions fails and **2/5** combinations
fails (and the fullscreen-flag popover-validity throw was needed for a 3rd combination).

## The fix

**Rust (additive, mirrors `:modal`):**
- `tree.rs` — new `fullscreen: HashSet<NodeId>` + `set_fullscreen`/`is_fullscreen`.
- `ops.rs` — `set_fullscreen` op.
- `selector.rs` — `:fullscreen` match arm (`is_fullscreen`). Every element on the stack
  matches, not just the topmost (spec: the fullscreen element stack).

**`bootstrap.js`:**
- `_checkPopoverValidity` — dialog throw now gates on `el._isModal` (not
  `hasAttribute('open')`); added a parallel fullscreen throw gated on `el._fullscreenFlag`.
- `globalThis._topLayerHidePopovers(el)` — extracted the "topmost popover ancestor →
  hide-stack-until" logic (identical to the dialog show path's `_dialogHidePopovers`) and
  exposed it globally, so a fullscreen request supersedes open popovers.
- **Fullscreen API (partial), defined after `globalThis.Element`/`Document` exist:**
  - `Element.prototype.requestFullscreen()` → Promise. Rejects with **TypeError** if the
    element is disconnected or is a showing popover (it already occupies the top layer as
    a popover — this is the combinations "should not succeed" expectation). Otherwise
    pushes onto `globalThis._fullscreenStack`, sets `_fullscreenFlag` + the Rust flag,
    supersedes open popovers, queues a `fullscreenchange`, resolves.
  - `Document.prototype.exitFullscreen()` (+ `webkitExitFullscreen` alias) → Promise;
    pops the top of the stack, clears its flag.
  - `Document.prototype.fullscreenElement` getter (top of stack | null),
    `fullscreenEnabled` getter (`true`).

There is **no real fullscreen rendering** — this is a top-layer STATE machine, which is
all these DOM-state tests (`matches(':fullscreen')`, `:popover-open`, `:modal`) observe.

## Why entering fullscreen closes popovers but not dialogs/fullscreen

`_topLayerHidePopovers` only touches the popover auto/hint stack, so a fullscreen request
supersedes open popovers ("A Fullscreen Element should close a Popover") but leaves modal
dialogs and other fullscreen elements untouched ("should *not* close a Modal Dialog /
Fullscreen Element"). A second fullscreen element pushes onto the stack while the first
keeps its flag, so both still match `:fullscreen` (the F-should-not-close-F case).
Opening a popover or dialog never touches the fullscreen stack, so
popover/dialog-should-not-close-fullscreen fall out for free.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `popover-top-layer-combinations.html` | 0/5 | **5/5** |
| `popover-top-layer-interactions.html` | 4/9 | **9/9** |

**Zero regressions** (matched baseline): popover-attribute-basic 195, popover-invoking-attribute
1402, popover-light-dismiss 25, popover-shadow-dom 3, popover-focus 20/30, dialog-showModal
8/10 (pre-existing layout cap), dialog-close 5, qsa 1975, classlist 1420, createElement 147,
dispatchEvent 25, Element-matches 669.

## Caps / Next

- **The Fullscreen API is a state machine, not a renderer.** No `::backdrop` layout, no
  real fullscreen paint, no keyboard-Escape-exits-fullscreen, no
  `fullscreenerror`/activation gating. `requestFullscreen` resolves whenever the element
  is a connected non-popover — it does not check transient activation (the tests bless via
  `test_driver`, so activation is always present). Fine for the top-layer DOM-state tests;
  a real fullscreen reftest would need render support.
- **`Node.isConnected` is still shadow-blind** (see #174) — untouched, too broad to risk.
- **Next popover levers:** cross-document pointerdown/up pairing in
  `popover-light-dismiss` (needs the `_popoverLightDismissDown/Up` state + trusted-input
  bridge to span an iframe boundary); popover Tab-focus (`popover-focus` 20/30 — sequential
  focus into/out of an open popover). Beyond popovers, the scripting-errors realm's exact
  error line/col was the last narrow lever there.
- **DEV NOTES:** grep `requestFullscreen` / `_fullscreenStack` / `_fullscreenFlag` /
  `_topLayerHidePopovers` before touching fullscreen or the top-layer supersede logic. The
  `:fullscreen` flag is mirrored via `set_fullscreen` (ops.rs); the popover-validity gate
  now keys on `_isModal` + `_fullscreenFlag`, NOT the dialog `open` attribute.
