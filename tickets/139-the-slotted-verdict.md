# Quest #139 — The Slotted Verdict (+185)

**Session 2026-07-04.** Following Quest #138's "next leverage" pointer straight into
**slots** — the slot-assignment algorithm that the real `ShadowRoot` of #138 finally
made reachable. What the slot realm exposed, though, was a second, deeper prize hiding
underneath: **`<template>` content was silently broken across the whole engine.**

---

## The gap

Two independent defects, discovered in sequence:

### 1. No slot-assignment algorithm at all
`HTMLSlotElement` existed only as an empty interface name. There was **no**
`assignedNodes()`, `assignedElements()`, `assign()`, `name`, no `element.slot`
reflection, and no `Slottable.assignedSlot` on Element/Text. Slot distribution — the
core of `<slot>`/shadow composition — simply did not exist.

### 2. `<template>` content was dropped everywhere (the bigger fish)
The `slots.html` / `slots-fallback.html` suites build their trees with
`createTestTree`, which leans on `<template>` + `document.importNode(template.content)`.
Probing revealed `template.content.childNodes.length === 0` for **every** template:

- **The HTML parser** stashed a template's children in a separate `template_contents`
  node (html5ever does this correctly) — but **`template.content` in JS returned a
  fresh, disconnected empty `DocumentFragment`**, never wired to that real node. The
  parsed markup was stranded in the Rust tree, unreachable.
- **`import_children_from`** (the `innerHTML` path) cloned a template element's data
  verbatim — keeping the *source tree's* `template_contents` id (a dangling reference)
  — and then recursed over `source.children(template)`, which is **empty** (a
  template's children live under its content subtree, not under the element). Nested
  `<template>` content was dropped on every `innerHTML` assignment.
- **HTML serialization** emitted `<template></template>` — it serialized a template's
  (always-empty) direct children, never its content subtree. So `outerHTML` and every
  serialize→reparse round-trip lost template bodies.
- **`cloneNode(deep)`** recursed over `childNodes` (empty for a template) and never
  cloned the content fragment — so `div.cloneNode(true)` produced templates with empty
  content, which is exactly what `createTestTree` does first.

Any one of these alone breaks templates; all four together meant `<template>` content
never survived a parse, a clone, a serialize, or an import.

---

## The fix

**Slots (all `bootstrap.js`, computed lazily — no dirty tracking):**
The whole slot model is computed **on every query** by walking the tree, so any DOM
mutation is reflected the next time `assignedNodes()`/`assignedSlot` is read (which is
exactly how the WPT mutation tests probe it). No imperative "assign slottables for a
tree" pass, no `slotchange` bookkeeping.

- `element.slot` added to the global string-attribute reflections (`slot` ⇄ `slot`).
- `HTMLSlotElement.prototype`: `name` (reflects `name`), `assignedNodes({flatten})`,
  `assignedElements({flatten})`, `assign(...nodes)` (manual assignment).
- `Slottable.assignedSlot` on **Element.prototype and Text.prototype only** (not
  Comment / ProcessingInstruction — they extend `CharacterData` directly, not `Text`).
- The DOM algorithms, faithfully: **find-a-slot** (with the open flag so `assignedSlot`
  hides slots in a *closed* shadow tree), **find-slottables** (a host's slottable
  children assigned to a slot), **find-flattened-slottables** (recursively expand
  assigned slots; fall back to a slot's own slottable children when nothing is
  assigned). Named **and** manual (`assign()`) modes. A slot only has assigned nodes
  when its topmost `parentNode` ancestor is a `ShadowRoot`.

**Template content (Rust + `bootstrap.js`):**
- **New op `template_content`** (`ops.rs`): returns the element's real Rust
  `template_contents` node id, lazily creating one for a programmatically-built
  template. `_templateContentFragment` (`bootstrap.js`) wraps that live node as a
  cached `DocumentFragment`, so `template.content` / `.content.querySelector` /
  `importNode(template.content)` see the actual parsed markup.
- **`import_node_from`** (`tree.rs`): reset a cloned template's `template_contents`
  (never keep the source id), and when the source had contents, build a fresh content
  node and import the *source content's* children into it.
- **`serialize_node`** (`serialize.rs`): a `<template>`'s serialized body is its
  `template_contents` children (HTML fragment-serialization). Byte-identical for every
  non-template element.
- **`cloneNode`** (`bootstrap.js`): the HTML "cloning steps" for a template — deep-clone
  the content fragment into the clone's own fresh content.

---

## Results (stash-verified baselines)

| Test | Before | After | Δ |
| --- | --- | --- | --- |
| `shadow-dom/Slottable-mixin.html` | 0/4 | **4/4** | +4 |
| `shadow-dom/HTMLSlotElement-interface.html` | 2/18 | **18/18** | +16 |
| `shadow-dom/slots.html` | 1/26 | **26/26** | +25 |
| `shadow-dom/slots-fallback.html` | 0/13 | **13/13** | +13 |
| `shadow-dom/imperative-slot-api.html` | 1/16 | **7/16** | +6 |
| `shadow-dom/imperative-slot-api-cross-shadow-root.html` | 0/2 | **1/2** | +1 |
| `shadow-dom/slots-outside-shadow-dom.html` | 0/1 | **1/1** | +1 |
| `shadow-dom/slots-fallback-in-document.html` | 0/2 | **2/2** | +2 |
| `shadow-dom/assign-slottables-after-removing-shadow-tree-from-document.html` | 0/1 | **1/1** | +1 |
| `.../additions-to-the-steps-to-clone-a-node/template-clone-children.html` | 2/3 | **3/3** | +1 |
| `.../additions-to-the-steps-to-clone-a-node/templates-copy-document-owner.html` | 3/5 | **5/5** | +2 |
| `.../serializing-html-templates/outerhtml.html` | 0/3 | **3/3** | +3 |
| `.../innerhtml-on-templates/innerhtml.html` | 3/4 | **4/4** | +1 |
| `.../the-template-element/template-element/template-content.html` | 108/216 | **216/216** | **+108** |
| `dom/nodes/DocumentFragment-getElementById.html` | 4/5 | **5/5** | +1 |

**Total: +185 across 15 tests.** The `template-content.html` +108 is the single biggest
line — the template primitive was broken engine-wide and now round-trips cleanly.

**ZERO regressions** (stash-verified): qsa 1975/1975, classlist 1420/1420, cloneNode
135/135, Node-properties 726/726, getElementsByTagName 19/19, Range-cloneContents
187/187, Document-createElement 147/147, insert_adjacent_html 31/31, innerhtml-04 1/1,
attachShadow 6/6, ShadowRoot-interface 8/12, shadowRoot-attribute 3/3, Document-
createElement 147/147, DOMParser-html 9/10, XMLSerializer 27/29 — all unchanged.

---

## Caps / Next

- **`slotchange` events** — not fired (the slot model is query-lazy, no mutation
  bookkeeping). `slotchange.html`, `slotchange-event.html`,
  `imperative-slot-api-slotchange.html` hang/fail on this; `imperative-slot-api.html`
  residual 9/16 is largely slotchange + connected-tree signalling. Firing `slotchange`
  needs a "signal a slot change" queue tied to DOM mutations + a microtask flush.
- **Composed events / event retargeting** (`shadow-dom/event-*`) — the next big shadow
  realm; `composedPath()` retargeting through slots.
- **Shadow-inclusive-ancestor scope** (`aria-element-reflection` 24→27).
- **Declarative shadow DOM** (`<template shadowrootmode>`) — the parser would need to
  attach a shadow root at parse time; gates `attachShadow-with-ShadowRoot` 0/2.
- **ShadowRoot `activeElement` / `styleSheets`** (ShadowRoot-interface 8/12) — needs
  in-shadow focus + connected-shadow stylesheets (same lift as constructable-stylesheet
  `adoptedStyleSheets`).
