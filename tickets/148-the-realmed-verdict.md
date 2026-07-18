# Quest #148 — The Realmed Verdict

> **Per-window `CustomElementRegistry`** — each iframe/window owns its own registry,
> and every custom-element reaction resolves the registry of the node's *owner
> document* instead of the single global one.
>
> **+36 subtests, ZERO regressions.** All `bootstrap.js`.

## The gap

Quests #144–#147 built the entire custom-elements realm behind **one global
registry** (`globalThis.customElements`). But HTML gives *each Window* its own
`CustomElementRegistry`, and the `custom-elements/reactions/` + `parser/` suites lean
on that hard. The shared WPT helper `test_with_window(f)` runs each test in a **fresh
iframe** and calls `contentWindow.customElements.define('custom-element', C)`. Because
our iframe window's `customElements` fell through a `Proxy` to the global registry,
the **second** test's `define('custom-element')` threw
`NotSupportedError: the name "custom-element" has already been used with this
registry` — so `reactions/Document.html` was **0/12** and
`parser-uses-registry-of-owner-document.html` **1/10**.

Two root causes underneath:
1. **No per-window registry.** `iframe.contentWindow.customElements === globalThis.customElements`.
2. **`Document.createElement` gated custom construction on `this.defaultView === globalThis`** — literally "only the main document constructs customs" — so
   `contentDocument.createElement('custom-element')` in a frame never ran the
   constructor, and every reaction hook hard-coded `globalThis.customElements`.

## The work (all `bootstrap.js`)

### 1. Per-document registry association
- New module helpers `_ceRegistryForDoc(doc)` / `_ceRegistryForNode(node)`: the main
  document → the global registry; an iframe document → its own (`doc._ceRegistry`); a
  **window-less** document (createHTMLDocument / `new Document` / DOMParser / template
  contents) → **null** (never constructs/upgrades — matches "importNode into a
  window-less document must not construct").
- `CustomElementRegistry` constructor now takes its document (`this._document`);
  `define()`'s upgrade-candidates step walks **its own** document, not `globalThis.document`.
- `_IframeWindow` mints `this.customElements = new CustomElementRegistry(doc)` and
  back-links `doc._ceRegistry`. Two frames defining `'custom-element'` no longer collide.

### 2. Fast global gate + shared constructor resolution (zero cost preserved)
- A single `_ceGlobalDefCount` (total defs across **all** registries) replaces every
  `globalThis.customElements._defs.size` gate — the whole machinery stays **inert**
  until the first `define()` anywhere, so non-custom pages pay nothing.
- A global `_ceGlobalByCtor` map lets the ONE shared `HTMLElement` constructor resolve
  `new.target` regardless of which window's registry defined the class (a class can be
  defined in only one registry, so it's unambiguous). Fresh construction's node
  document now follows the registry's document (`def._document`).

### 3. Per-node registry in every reaction path
`createElement` (now `_ceRegistryForDoc(this)`, no `defaultView === globalThis`
gate), `_ceTryUpgrade` (`_ceRegistryForNode(el)`), `attachInternals`, `attachShadow`
disabled-features, `createContextualFragment`; the insertion/removal/adoption/attribute
gates all switched to `_ceGlobalDefCount`. **`importNode`/`adoptNode` come free** —
they delegate to `cloneNode(deep, targetDoc)` → `targetDoc.createElement`, which now
consults the target document's registry.

### 4. Fragment-parse node-document retag
`innerHTML`-parsed nodes belong to the **context element's** node document (DOM
fragment parsing). For a non-main document we now `_setNodeDocumentDeep` the parsed
subtree before running insertion steps — otherwise `frameBody.innerHTML =
'<custom-element>'` upgraded against the *main* registry (empty) and never
constructed. Gated to non-main docs, so the common case is untouched.

### 5. `Document.body` setter + `document.write`/`open` clear semantics
- **`Document.body` setter** (shared `_documentSetBody`, re-exposed on
  Document/DetachedDocument/`_IframeDocument` since each overrides `get body()`):
  WebIDL `HTMLElement?` → non-element value throws **TypeError**, non-body/frameset
  element throws **HierarchyRequestError**, else `replaceChild`/`appendChild` (CE
  removal→disconnected + insertion→connected + adoption fire for free).
- **`_IframeDocument.write`/`open`/`writeln`/`close`**: `write()` on a loaded
  document implicitly `open()`s (empties → disconnected) then appends the parsed
  markup via a fragment (only the new subtree runs insertion steps); an explicit
  `open()` sets a write-session flag so later `write()`s append instead of re-clearing.

## Results (+36, ZERO regressions)

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `reactions/Document.html` | 0/12 | **10/12** | +10 |
| `parser/parser-uses-registry-of-owner-document.html` | 1/10 | **10/10** | +9 |
| `upgrading.html` | 17/28 | **25/28** | +8 |
| `pseudo-class-defined.html` | 27/35 | **31/35** | +4 |
| `Document.body.html` | 7/26 | **11/26** | +4 |
| `custom-element-reaction-queue.html` | 0/6 | **1/6** | +1 |

Regression sweep (all held): qsa 1975, Document-createElement 147,
DOMTokenList-stringifier, reactions/Element 47, HTMLElement 20, Node 14, NamedNodeMap
14, ChildNode 7, ParentNode 4, Range 10, Attr 2, adopted-callback 32,
CustomElementRegistry 31, connected 24, disconnected 24, Node-appendChild 11,
Element-setAttribute 2, structured-clone 141, innerhtml-04/06.

## Caps / Next

- **reactions/Document 10/12** — the last 2 are a different feature area:
  `execCommand('delete')` in a contenteditable (editing engine, out of scope) and
  `HTMLTitleElement.text` (element-reflection primitive; small, but needs the per-tag
  class machinery).
- **custom-element-reaction-queue 1/6** — the rest need the **reaction-queue microtask
  model** (backup element queue): our flush-per-step FIFO gives wrong ordering.
  `enqueue-...-inside-another-callback` (0/8), `throw-on-dynamic-markup-...` (0/11) are
  the same lift — highest tail, highest risk (all reaction machinery flows through it).
- **NEXT:** the reaction-queue microtask model; then `HTMLTitleElement.text` +
  `Document.body` frameset/root cases (Document.body.html 11/26); then `popover`
  (reactions/HTMLElement 20/22).
