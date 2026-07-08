# Quest #155 — The Dialoged Verdict (+~164)

**Realm:** `html/semantics/interactive-elements/the-dialog-element/` — the `<dialog>`
element API — plus the previously-blocked `command`/`commandfor` **dialog tail**.
**Files:** `crates/obscura-js/js/bootstrap.js`, `crates/obscura-dom/src/tree.rs`,
`crates/obscura-dom/src/selector.rs`, `crates/obscura-js/src/ops.rs`.
**Result:** **+~164, ZERO regressions.** Includes fixing **two pre-existing DOM
tree-corruption bugs** that hung the browser (OOM), surfaced by this realm's tests.

## The gap

Memory #154 named the `<dialog>` element API as the next leverage: it unlocks BOTH
the standalone `the-dialog-element/` realm AND the dialog tail of the command-invoker
realm (`on-dialog-behavior` 0/104, `on-dialog-invalid-behavior` 1/40), which `#154`'s
`_runCommandInvoker` already dispatched show-modal/close into but which failed on
`dialog.showModal is not a function`.

The session opened with the dialog API already drafted in the working tree from a
prior session (uncommitted): `show()`/`showModal()`/`close()`/`requestClose()`, the
`open`/`returnValue`/`closedBy` IDL, cancel/close/toggle events, and the `:modal`
pseudo-class. This quest **verified, debugged, regression-swept, and completed** it.

## The dialog API (all in the popover IIFE, reusing `_fireToggleEvent` etc.)

- **`show()`** — fires cancelable opening `beforetoggle`, re-checks `[open]`, queues the
  async `toggle`, sets `[open]`, hides superseded popovers. Throws `InvalidStateError`
  if already open as modal.
- **`showModal()`** (`_showModalDialog`) — the modal path: connected + not-already-a-
  popover checks, cancelable `beforetoggle` with a re-check after each event step, sets
  `[open]` + flips the `:modal` flag (Rust `set_dialog_modal`), hides popovers.
- **`close(returnValue?)`** / **`requestClose(returnValue?)`** — `close` fires the async
  non-cancelable `close` event (never synchronous — `dialog-close-event-async` asserts
  the handler doesn't run inline), drops `[open]` + modal state, sets `returnValue`.
  `requestClose` fires a cancelable `cancel` first; unless prevented, closes.
- **`open`** boolean reflection, **`returnValue`** internal string slot (not a reflected
  attribute — `dialog-close` asserts a prototype setter shadow never fires), **`closedBy`**
  enumerated reflection (`any`/`closerequest`/`none`; Auto computes `closerequest` for a
  modal, else `none`).
- **`:modal`** pseudo-class — a non-monotonic `dialog_modal: HashSet<NodeId>` in
  `tree.rs`, a `"modal" => is_dialog_modal(nid)` arm in `selector.rs`, a `set_dialog_modal`
  op, and disconnection-removal steps that drop modal state when a modal dialog leaves
  the tree (gated on a `_dialogModalCount` so non-dialog pages pay nothing).
- **UA `dialog:not([open]) { display: none }`** synthesized in `getComputedStyle` — with
  an escape hatch for a `<dialog popover>` currently **showing as a popover** (which has
  no `[open]` attribute but must be visible).

## The bugs this realm exposed (the real story)

`on-dialog-behavior` reliably **OOM-killed the server** (~750 MB/s allocation, ~70% CPU,
navigation never committed). A long bisection (section → sub-test → pairwise) plus a
Rust `op_dom` entry log pinned it to a single op: **`insert_before(19, 19)`** — inserting
a node *before itself*. Root cause: two independent tree bugs.

1. **`insertBefore` was missing DOM "pre-insert" step 3** — *"if referenceChild is node,
   set referenceChild to node's next sibling."* So `document.body.prepend(dialog)` when
   the dialog is **already** `body.firstChild` called `insert_before(node, node)`, wiring
   the node's `next_sibling`/`prev_sibling` to itself → a **self-cycle** that hung every
   later tree walk. Fixed in `bootstrap.js` (advance the reference to `n.nextSibling`,
   degrading to `appendChild` when null) **and** with a defensive Rust guard
   (`if existing_id == new_sibling_id { return }`).

2. **Rust `insert_before` captured `prev_id` BEFORE detaching the moving node.** Exposed
   by fix #1: moving a node to just before its own next sibling (a no-op move) left
   `prev_id` pointing at the moving node itself → another self-cycle that **dropped the
   rest of the sibling list** (`Node-insertBefore` "before itself should not move" lost a
   node). Fixed by reordering: `detach` first, then read the reference's parent/prev.
   **Bonus: `Node-insertBefore` 38→39.**

Both are **pre-existing DOM bugs** (not introduced by the dialog work) that could hang or
corrupt any page doing `prepend`/`insertBefore` of an already-positioned node.

## The command dialog tail + the invoker gate

With the dialog API live, the command tail lit up. One remaining cascade: a **detached
invoker** (`commandForElement = liveDialog`, button never connected) still opened the
modal, leaving it open and breaking every later test's precondition. Fixed by gating
`_runCommandInvoker` on the invoker being **shadow-including connected** —
`getRootNode({composed:true}).nodeType === 9` (NOT `isConnected`, which stops at the
shadow boundary and would have broken the shadow-DOM retargeting test).
`requestClose()` also now bails when the dialog's document isn't fully active
(`ownerDocument.defaultView == null`) per the "request to close" algorithm.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `command-and-commandfor/on-dialog-behavior` | 0/104 (CNR) | **104/104** |
| `command-and-commandfor/on-dialog-invalid-behavior` | 1/40 | **40/40** |
| `command-and-commandfor/on-dialog-disconnect` | 1/1 | 1/1 |
| `the-dialog-element/dialog-open` | — | **3/3** |
| `the-dialog-element/dialog-open-2` | — | **1/1** |
| `the-dialog-element/dialog-close` | — | **5/5** |
| `the-dialog-element/dialog-close-event` | — | **1/1** |
| `the-dialog-element/dialog-close-event-async` | — | **1/1** |
| `the-dialog-element/dialog-no-throw-requested-state` | — | **1/1** |
| `the-dialog-element/dialog-enabled` | — | **1/1** |
| `the-dialog-element/dialog-requestclose-2` | — | **1/1** |
| `the-dialog-element/dialog-requestclose-3` | — | **1/1** |
| `the-dialog-element/toggle-events` | 0 (CNR) | **5/12** |
| `dom/nodes/Node-insertBefore` (bonus) | 38/40 | **39/40** |

**Zero regressions** — swept qsa 1975, classlist 1420, createElement 147, appendChild 11,
replaceChild 29, ParentNode-append 25, ParentNode-prepend 22, ChildNode-before/after/
replaceWith 45/45/33, popover all-elements 1101, invoking 1400/1402, toggleevent 39,
attribute-basic 113 (stash-verified against clean HEAD; a −2 `<dialog popover>` regression
from the display:none rule was **caught and fixed** with the showing-popover escape hatch),
command realm interface 11, command-reflection 16, event-interface 22, button-type-behavior
23, button-type-reflection 27, on-popover-behavior 28, on-popover-invalid 16,
source-attribute-retargeting 3, on-popover-disconnect 1.

## Caps / Next

- **Escape-key / light-dismiss** (`dialog-canceling`, `dialog-cancel-events`) need a real
  close watcher fed by a `test_driver`→CDP **input bridge** (still missing) — the widest
  single lever left for both dialog AND the whole popover dismiss/focus tail.
- **`*-crash` reftests** (`dialog-requestclose-*-crash`, `dialog-not-in-tree-crash`, …)
  are `test_driver`-gated (CNR).
- **`toggle-events` 5/12** — the residual `showModal()` toggle sub-tests fail on a subtle
  testharness `step_timeout` ordering interaction (the isolated primitives all pass); a
  bounded polish item.
- **Top-layer painting / backdrop / autofocus / focus restoration** are out of scope
  without a render + focus path (all the `top-layer-*`, `backdrop-*`, `*-focus*` reftests).
- **Next:** a `test_driver`→CDP input bridge unlocks the light-dismiss/focus tail across
  dialog + popover; or continue the standalone dialog script tail (`dialog-focus*` needs
  focus, `submit-dialog-close-event` needs form submission wiring).
