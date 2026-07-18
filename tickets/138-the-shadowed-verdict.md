# 🗡️ Quest #138 — The Shadowed Verdict

> *The standing lead named since Quest #34 — a real shadow tree — falls at last.*
> **Realm:** Shadow DOM (`shadow-dom/*`) + `Node.getRootNode` + the fragment
> tree-scoping it shares with `<label>`/ARIA reflection.
> **Result: +21 across 9 tests. Zero regressions.**

## The gap

`attachShadow` returned a **fake object literal** (a stealth-era stub), `ShadowRoot`
was `class ShadowRoot {}` (empty, not `instanceof DocumentFragment`, web-constructible),
there was **no `Element.prototype.shadowRoot` getter**, and `Node.getRootNode()` was a
**hard stub** always returning `document`. Because the shadow was a plain object — not a
real DOM node — nothing about it flowed through the Rust tree: `parentNode` walks, scoped
`querySelector`, `getElementById`, node identity, and `instanceof` all failed. This one
missing primitive had been deferred since Quest #34 and named as the "standing shadow-tree
lead" by a dozen subsequent quests (label association, ARIA element reflection,
constructable stylesheets).

## The fix — a real `ShadowRoot`, all in `bootstrap.js` (no Rust)

The engine already had a **real `DocumentFragment`** (`class DocumentFragment extends Node`,
line ~3845) with a genuine backing node (`create_document_fragment`), scoped
`query_selector_scoped`, and real `appendChild`/`innerHTML`. The whole quest rides on it.

1. **`Node.prototype.getRootNode(options)`** (was `return globalThis.document`) — walk the
   `parent` chain to the topmost node (a parentless node is its own root); with
   `composed:true`, if the plain root is a shadow root (`root._shadowHost`), continue the
   walk from its host. Fixes the detached / single-ancestor / in-fragment / in-shadow cases.
   *No internal code called `getRootNode()`, so this is pure gain — zero regression surface.*

2. **`class ShadowRoot extends DocumentFragment`** (replaced the empty stub) — a real
   fragment-backed node, so `Object.getPrototypeOf(ShadowRoot.prototype) ===
   DocumentFragment.prototype` and `instanceof DocumentFragment` both hold. Not
   web-constructible: `new ShadowRoot()` throws `TypeError` unless the module-scoped
   `_allowShadowConstruct` gate is set (only `attachShadow` sets it). Exposes
   `host`/`mode`/`delegatesFocus`/`slotAssignment`; `getRootNode` returns itself
   (non-composed) or the host's tree (composed); `activeElement`→null and `styleSheets`→
   empty StyleSheetList (both connectedness-gated, deferred — see Caps).

3. **`Element.prototype.attachShadow(init)`** rewritten to DOM §4.9 "attach a shadow root":
   - `ShadowRootInit.mode` is a required WebIDL enum → missing / non-`{open,closed}`
     value throws **`TypeError`** (during dictionary conversion, before any DOM step).
   - Non-shadow-host-candidate → **`NotSupportedError`**. A valid host is a safelisted
     HTML-namespace name (`article,aside,blockquote,body,div,footer,h1–h6,header,main,nav,
     p,section,span`) **or** a valid custom element name (contains `-`).
   - Already hosts a shadow → **`NotSupportedError`**.
   - Otherwise create a real fragment node, build a `ShadowRoot` over it (through the
     `_allowShadowConstruct` gate), store it as `host._shadowRoot`, return it.

4. **`Element.prototype.shadowRoot`** getter — the element's **open** shadow root, else
   null (a closed shadow root is hidden from script). Defined **only** on `Element.prototype`
   (not Node/Document/DocumentFragment), matching where `attachShadow` lives, so
   `'shadowRoot' in Node.prototype` etc. stay false.

5. **`DocumentFragment.prototype.getElementById`** made real (was a `null` stub) — first
   element in tree order with that id, empty-string id never matches, scoped to the backing
   node. `ShadowRoot` inherits it, so `host.shadowRoot.getElementById(...)` keeps working
   after the host is detached (the fragment retains its children).

## Results (stash-verified baselines, zero regressions)

| Test | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `shadow-dom/Element-interface-attachShadow.html` | 2/6 | **6/6** | +4 |
| `shadow-dom/Element-interface-shadowRoot-attribute.html` | 0/3 | **3/3** | +3 |
| `dom/nodes/rootNode.html` | 1/5 | **5/5** | +4 |
| `shadow-dom/ShadowRoot-interface.html` | 6/12 | **8/12** | +2 |
| `shadow-dom/Element-interface-attachShadow-custom-element.html` | 1/6 | **4/6** | +3 |
| `shadow-dom/getElementById-dynamic-001.html` | 0/1 | **1/1** | +1 |
| `dom/nodes/DocumentFragment-getElementById.html` | 3/5 | **4/5** | +1 |
| `html/dom/aria-element-reflection.html` | 22/27 | **24/27** | +2 |
| `html/semantics/forms/the-label-element/label-attributes.sub.html` | 19/20 | **20/20** | +1 |
| **Total** | | | **+21** |

`getElementById-dynamic-002.html` was **already 1/1** at baseline (the fake happened to
pass it) — not counted. Zero regressions (stash-verified; held: qsa 1975, Node-properties
726, createElement 147, cloneNode 135, DOMTokenList-value 1, aria-attribute 41,
type-change-state 380, select-value 4/4, DocumentFragment-constructor 2/2,
insert_adjacent_html 31, Range-cloneContents 187).

## Caps / Next

- **`ShadowRoot.activeElement`** (2 subtests, ShadowRoot-interface) — needs in-shadow focus
  tracking (`element.focus()` → shadow's active element, cleared on host removal).
- **`ShadowRoot.styleSheets`** (2 subtests) — needs connectedness-gated `<style>.sheet` and
  a live StyleSheetList over a *connected* shadow tree (shadow trees never enter our render
  tree today). This is the same lift that gates **`CSSStyleSheet-constructable` 6/13**
  (`adoptedStyleSheets`).
- **Slots** (`Slottable-mixin` 0/4, `HTMLSlotElement-interface` 2/18) — the slot-assignment
  algorithm (`assignedSlot`/`assignedNodes`/`assign()`/`slotchange`). The next-biggest
  shadow tail; a self-contained realm.
- **aria-element 24→27** — shadow-inclusive-ancestor scope discrimination (crossing INTO a
  shadow tree disallowed vs. a shadow-inclusive ancestor allowed).
- **Composed events** across shadow boundaries (event retargeting / `composedPath`) — a
  large separate realm (`shadow-dom/event-*`).
- **Declarative shadow DOM** (`<template shadowrootmode>`) — gates
  `attachShadow-with-ShadowRoot` 0/2.
- **`<template>.content.getElementById`** — the 1 residual on DocumentFragment-getElementById
  (template content scoping).
