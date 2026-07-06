# Quest #147 — The Reactive Verdict

**CEReactions on the remaining DOM mutation entry points, +51 (session 2026-07-05)**

## The gap

Quest #144 built the custom-element reaction machinery (`_ceEnqueueReaction`/`_ceFlush`,
`_ceInsertionSteps`/`_ceRemovalSteps`/`_ceAdoptedSteps`/`_ceAttributeChanged`) and wired
it into the *primary* mutation paths — `setAttribute`/`removeAttribute`, `appendChild`/
`insertBefore`/`removeChild`, `innerHTML`. But the DOM has many MORE ways to mutate a
tree, and every one is `[CEReactions]` in the IDL. The `custom-elements/reactions/` suite
tests each interface, and a fat tail was red:

| test | before | missing |
|---|---|---|
| reactions/Element | 38/47 | `setAttributeNS`/`removeAttributeNS`/`setAttributeNode(NS)`/`removeAttributeNode`, cross-doc disconnected |
| reactions/HTMLElement | 12/22 | reflected `translate`/`draggable`/`spellcheck`, `innerText`/`outerText` disconnected |
| reactions/Node | 9/14 | `Attr.nodeValue`/`textContent`, cross-doc disconnected |
| reactions/NamedNodeMap | 8/14 | `setNamedItem(NS)`/`removeNamedItem(NS)` |
| reactions/ChildNode | 4/7 | `before`/`after`/`replaceWith` cross-doc disconnected |
| reactions/ParentNode | 2/4 | `append`/`prepend` cross-doc disconnected |
| reactions/Range | 8/10 | `extractContents` disconnected, `createContextualFragment` |
| reactions/Attr | 1/2 | `Attr.value` setter |

All the failures were `expected ["attributeChanged"] got []`, or a cross-document move
producing `["adopted","connected"]` when the spec wants `["disconnected","adopted","connected"]`.

## The work (all `bootstrap.js`, all gated on `customElements._defs.size`)

**Theme 1 — the attribute funnel.** `setAttributeNS`, `setAttributeNode(NS)`,
`NamedNodeMap.setNamedItem(NS)`, and the `Attr.value`/`Attr.nodeValue`/`Attr.textContent`
setters ALL funnel through `Element._rawSetNS`; the remove siblings through
`_rawRemoveNS`. So the entire attribute-node / namespaced-attribute tail collapsed to ONE
hook in each: read the old value (only when the element is `"custom"` and a def exists),
run the op, then `_ceAttributeChanged(this, local, oldValue, newValue, ns||null)`. The
plain `setAttribute` path keeps its own hook against the `set_attribute` op — different op,
no double-fire. Fixed Element (attrs), Attr, NamedNodeMap, and the Attr-node cases of Node
in one stroke.

**Theme 2 — moved connected nodes run removing steps.** DOM "adopt" step 2 ("if node has
a parent, remove node") runs the removing steps, which enqueue `disconnectedCallback` for
every custom element in the moved subtree — BEFORE the adopted/connected reactions. Our
`appendChild`/`insertBefore` re-parented in Rust without firing removal steps, so moving a
*connected* custom element (especially across documents) dropped the leading `disconnected`.
Fix: capture `_wasConnected = (node is element/fragment) && node.isConnected` before the
tree op (gated on a live registry so non-custom pages skip the `isConnected` walk), then
`_ceRemovalSteps(node)` right after. `replaceChild` and all the ChildNode/ParentNode
convenience methods (`before`/`after`/`replaceWith`/`remove`/`append`/`prepend`/
`replaceChildren`) delegate to these cores, so they were fixed for free. Also taught the
`textContent` setter to run `_ceRemovalSteps` on the connected children it detaches (this is
what `innerText=''`/`outerText=''` rely on).

**Theme 3 — HTMLElement reflectors.** `translate` (↔ yes/no), `draggable` (↔ true/false),
`spellcheck` (↔ true/false) are IDL booleans reflecting ENUMERATED content values — added
via a new `__reflectedBoolEnumAttrs` loop whose setter writes the keyword through
`setAttribute` (so the reaction fires). Added a real `outerText` getter/setter (rendered
text fragment; `''` just removes the element via `replaceChild`). `popover` is a legit cap
(its test precondition is `'popover' in HTMLElement.prototype`, and implementing it needs
the whole Popover API — the 2 subtests stay `notrun`, not `fail`).

**Theme 4 — `Range.createContextualFragment`.** New method: fragment-parse the markup using
the range's start node as context, move the parsed children into a `DocumentFragment`, then
upgrade the subtree in tree order (`_ceTryUpgrade` + `_ceFlush`) so inline customs get
`constructed`+`attributeChanged` even though the fragment is disconnected.

## Results

| test | before | after | Δ |
|---|:---:|:---:|:---:|
| reactions/Element | 38/47 | **47/47** | +9 |
| reactions/HTMLElement | 12/22 | **20/22** | +8 |
| reactions/NamedNodeMap | 8/14 | **14/14** | +6 |
| reactions/Node | 9/14 | **14/14** | +5 |
| reactions/ChildNode | 4/7 | **7/7** | +3 |
| reactions/ParentNode | 2/4 | **4/4** | +2 |
| reactions/Range | 8/10 | **10/10** | +2 |
| reactions/Attr | 1/2 | **2/2** | +1 |
| **adopted-callback** (bonus) | 20/71 | **32/71** | +12 |
| **attribute-changed-callback** (bonus) | 9/13 | **12/13** | +3 |

**+51 total, ZERO regressions.** Swept: qsa 1975, classlist 1420, createElement 147,
Range-surroundContents 1840, Range-cloneContents 187, Node-appendChild 11, connected-callbacks
24, disconnected-callbacks 24, upgrading 17, pseudo-class-defined 27, CustomElementRegistry 31,
DOMTokenList reactions 19, Element-removeAttributeNS 1. Every held number identical; the two
bonus tests only rose. All new code is gated on `customElements._defs.size` (and, for the
attribute hooks, `_ceState === "custom"`) so non-custom pages pay ZERO cost — the guards make
the changes *provably inert* for the entire DOM-core suite.

## Caps / Next

- **Per-document/per-window `CustomElementRegistry`** — the standing next lead. `reactions/
  Document.html` (0/12), `parser-uses-registry-of-owner-document.html` (1/10), and 2 of the
  6 `custom-element-reaction-queue.html` cases all fail on `define("...") already used`: each
  iframe/created-document needs its OWN registry, but we have one global `customElements`.
  Architectural (touches every `globalThis.customElements` reference), so scoped separately.
- **Reaction-queue microtask model** — `custom-element-reaction-queue` (0/6),
  `enqueue-inside-callback` (0/8), `throw-on-dynamic-markup...reactions` (0/11): the remaining
  ordering cases ("expected Document node with 2 children but got Document node with 2
  children") need the full backup-element-queue microtask model, not our flush-per-step FIFO.
  Highest tail, highest regression risk (all reaction machinery flows through it).
- **`popover`** — the Popover API (`popover` reflector + showPopover/hidePopover/togglePopover
  + `:popover-open` + top layer). Unblocks reactions/HTMLElement 22/22 and a whole popover suite.
- **`:nth-child(of S)`** — clean standalone selector quest (Servo `selectors` has `NthOf`, our
  parser doesn't plumb it); state-css-selector-nth-of 1/3.
