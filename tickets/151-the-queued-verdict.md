# Quest #151 — The Queued Verdict (+12)

**Realm:** `custom-elements/` — the custom element **reactions stack** (processing model).
**Files:** `crates/obscura-js/js/bootstrap.js` only. No Rust.
**Result:** **+12, ZERO regressions.**

## The gap

Quests #144–#150 built the whole custom-elements realm on a **single global FIFO**
reaction queue (`_ceQueue`) drained by a re-entrancy-guarded `_ceFlush()` at the end of
each mutating op. That model is correct for a single flat mutation but WRONG the moment a
reaction callback itself mutates the DOM: the nested mutation's reactions were appended to
the SAME outer drain instead of running to completion first. Two structural bugs:

1. **No element-queue stack.** `instance.setAttribute()` whose `attributeChangedCallback`
   calls `anotherInstance.setAttribute()` must run `anotherInstance`'s reactions fully
   (begin→end) *inside* the first callback. The single FIFO produced
   `instance{begin,end}` then `another{begin,end}` — the two boundaries flattened.
2. **Upgrade ran eagerly and enqueued in the wrong order.** `_ceUpgrade` ran the
   constructor synchronously and THEN enqueued attributeChanged/connected — and the whole
   `define()` candidate loop upgraded every element before ANY reaction fired, giving
   `ctor1, ctor2, attrChanged1, connected1, …` instead of the spec's per-element
   `ctor1, attrChanged1, connected1, ctor2, …`. Worse, it captured the POST-constructor
   attribute list / connected state, so an attribute the ctor set spuriously fired
   attributeChanged, and a `this.remove()` in the ctor wrongly suppressed connectedCallback.

Baselines: `custom-element-reaction-queue` **1/6**, `reaction-timing` **1/3**,
`enqueue-custom-element-callback-reactions-inside-another-callback` **4/8**.

## The fix (all `bootstrap.js`)

**The reactions stack (HTML §custom-element-reactions-stack).** Replaced the single FIFO
with:
- `_ceStack` — a stack of **element queues** (each an array of elements). A `[CEReactions]`
  boundary pushes a fresh queue (`_cePush`), runs, then pops and invokes it (`_cePop`).
- Each element carries its own **reaction queue** `el._ceReactionQueue` (FIFO of `{cb,args}`
  callback reactions or `{up:def}` upgrade reactions).
- `_ceEnqueueElement(el)` adds `el` to the top element queue, or — when the stack is empty
  (only reachable from within an invoke) — to the **backup element queue**, drained by a
  `queueMicrotask`. A spec-faithful safety net that is inert in practice (every
  author-facing mutation is itself a boundary).
- `_ceInvokeElement(el)` drains `el._ceReactionQueue` with a `while (rq.length)` loop, so a
  reaction that enqueues MORE reactions on the same element (an upgrade enqueuing
  attributeChanged/connected) is picked up in place → per-element
  `constructor, attributeChanged, connected`.

**Upgrade is now a queued reaction.** `_ceTryUpgrade` / `define()` / `upgrade()` /
`createContextualFragment` **enqueue** an upgrade reaction (`_ceEnqueueUpgrade`) instead of
upgrading synchronously; `_ceDoUpgrade` runs during invoke and — critically — enqueues
attributeChanged (for the PRE-construction observed attributes) and connectedCallback (on
the PRE-construction connected state) **before** running the constructor (spec steps 6–7
precede step 8). `define()` wraps its candidate loop in one boundary so each element fully
upgrades+reacts before the next.

**Per-step vs single boundary.** The four step functions (`_ceInsertionSteps`,
`_ceRemovalSteps`, `_ceAdoptedSteps`, `_ceAttributeChanged`) own a boundary only when the
stack is empty (`_own = _ceStack.length === 0`). `appendChild`/`insertBefore` open ONE
boundary (gated on `_ceGlobalDefCount > 0`) spanning the removing + adopting + inserting
steps, so a reaction fired inside an `adoptedCallback` sees the still-pending `connected`
reactions of sibling elements (reaction-queue test 6). If a public method doesn't open a
boundary, each step self-bounds — graceful degradation.

**Zero-cost off custom elements.** Every new path is gated behind `_ceGlobalDefCount` (the
step functions early-return; the appendChild/insertBefore boundary is skipped). A page that
never calls `define()` touches none of it.

## Results

| Test | Before | After | Δ |
|---|---|---|---|
| `custom-element-reaction-queue.html` | 1/6 | **6/6** | +5 |
| `reaction-timing.html` | 1/3 | **3/3** | +2 |
| `enqueue-custom-element-callback-reactions-inside-another-callback.html` | 4/8 | **8/8** | +4 |
| **Total** | | | **+12** |

## Zero-regression sweep

Held across the whole `custom-elements/reactions/` dir + the canonical list:
`reactions/Element 47`, `HTMLElement 20/22`, `Node 14`, `NamedNodeMap 14`, `Attr 2`,
`Document 11/12`, `DOMTokenList 19`, `CSSStyleDeclaration 22/30`, `ChildNode 7`,
`ParentNode 4`, `Range 10`, `HTMLTableElement 7/10`, `HTMLTableRowElement 1`,
`HTMLTableSectionElement 2`; `upgrading 25/28`, `adopted-callback 32/71`,
`connected-callbacks 24/40`, `disconnected-callbacks 24/40`, `attribute-changed-callback 13`,
`pseudo-class-defined 31/35`, `CustomElementRegistry 31/46`, `parser-uses-registry 10/10`,
`HTMLElement-constructor 11/12`; broad DOM: `qsa 1975`, `classlist 1420`, `createElement 147`,
`Node-appendChild 11`. **A git-stash baseline** confirmed `microtasks-and-constructors`
(1/5), `range-and-constructors` (0/2), `disconnected`/`connected` (24), `Document` (11),
`upgrading` (25) are IDENTICAL pre and post — the two low ones were already failing at HEAD.

## Caps / Next

- **reaction-queue 6/6, timing 3/3, enqueue-inside 8/8 — fully secured.**
- **`throw-on-dynamic-markup-insertion-counter-{construct,reactions}.html` (0/11 each) —
  CAPPED (separate feature).** They need a real `document.write` HTML parser that
  constructs customs from parser tokens, a per-document throw-on-dynamic-markup-insertion
  counter (incremented around ctor invocation) making `document.open/write/writeln/close`
  throw `InvalidStateError`, AND the `document.open(URL, name, features)` navigation form —
  subtest 3 (`document.open(URL) must NOT throw`) hard-**times out** (no navigation +
  postMessage 'didNavigate'), cascading the rest to `notrun`. Big lift, navigation cap.
- **`reactions/HTMLElement` 20/22 — `popover`** (the last 2). Now the top custom-elements
  lead: `popover` attribute + `showPopover`/`hidePopover`/`togglePopover` + the popover
  reactions. Self-contained, no navigation.
- **`reactions/HTMLTableElement` 7/10** — the 3 need custom-element construction when
  `innerHTML` is set on a *detached iframe-owned* element (#148-era innerHTML-upgrade gap).
- NOTE: `dom/nodes/Node-insertBefore.html` / `Node-cloneNode.html` / `MutationObserver-childList.html`
  could-not-run this session from **server OOM** (SIGKILL, not panic) after many CDP
  sessions — the documented degradation; `classlist 1420` + `Node-appendChild 11` passed on
  fresher servers, and the change is provably inert on non-custom pages.
