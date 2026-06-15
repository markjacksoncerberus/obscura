# ✅ Quest #11 — The Collections Armory — SECURED

> *Realm:* `dom/collections`, `dom/nodes/Element-getElementsBy*`, `.children`
> *Difficulty:* ⚔️⚔️
> *Status:* **getElementsByTagName 19/19, getElementsByTagNameNS 16/16,
> Document-getElementsByTagName 18/18 — all 100%.** Bonus: `createElementNS`
> 85→587/596, `querySelector-All` +16.

---

## Increment 2 — real foreign-namespace `createElementNS` (the keystone)

The Collections tail was blocked because `createElementNS` faked the namespace on
the JS wrapper while the Rust node (which the matching ops read) stayed
HTML-namespaced and lowercased. Fixed at the root:

- **Rust** `create_element_ns` op builds a node with a true `QualName`
  (namespace + prefix + case-preserved local).
- **JS** `Document.createElementNS` rewritten with the real DOM validate-and-extract
  (split on first colon; local must be a valid element name; a colon requires a
  non-empty prefix; `xml`/`xmlns` `NamespaceError` rules), then creates the real
  node and pins `_ns`/`_nsSet`/`_prefix`/`_localName` on the wrapper.
- **Getters** fixed: `namespaceURI` honours an explicit null namespace;
  `localName`/`tagName` are case-preserved (HTML-namespace elements in an HTML
  document uppercase the qualified name); **`nodeName` now returns `tagName`**
  (it had been a separate uppercasing op — fixing it alone recovered ~250
  `createElementNS` subtests).
- `cloneNode` recreates foreign / case-preserved elements via `createElementNS`.

This unblocked the getElementsByTagName family to 100% (the matching ops now see
real namespaces), lifted `querySelector-All` by 16 (namespace/type selectors), and
took `Document-createElementNS` 85 → 587/596. Zero regressions; captures clean.

## Increment 3 — the tail: `importNode` + a real `HTMLElement` hierarchy

- **`importNode` into the target document.** `cloneNode(deep, _targetDoc)` threads
  the importing document so the copy's `ownerDocument` (hence `tagName` casing)
  reflects it; `document.importNode(node, deep)` passes `this`. (`Element-tagName`
  3 → 5/6.)
- **A real `HTMLElement` hierarchy.** `HTMLElement` was an alias for `Element`, so
  *every* element was an `instanceof HTMLElement`. Now `HTMLElement extends Element`,
  with `HTMLUnknownElement`/`HTMLSpanElement` subclasses; `createElementNS` picks
  the wrapper class by namespace (non-HTML → plain `Element`; HTML → the specific
  class by exact lowercase tag, else `HTMLUnknownElement`), and `_elementClassFor`
  maps the parsed/`createElement` path. This closed the 9 `instanceof` subtests →
  **`Document-createElementNS` 596/596 (100%)**.

Bonus: `Node-cloneNode` 101 → 103. Zero regressions. The single remaining
`Element-tagName` subtest needs a real `DOMParser` (XML parseFromString) — a
distinct feature, not part of this realm.

---

## Increment 1 — the live HTMLCollection

---

## The beast

`getElementsByTagName`/`ClassName` were thin `querySelectorAll` aliases — they
returned static plain arrays (CSS-parsed, so weird tag names broke), not a live
`HTMLCollection`. There was no `HTMLCollection`, no `getElementsByTagNameNS`, no
`NodeList` global, and `.children` was a static array. The named-property model
(`collection.namedItem("x")`, `collection["x"]`, supported property names) was
entirely absent.

## Increment 1 — the live HTMLCollection

**Rust (`ops.rs`, over `dom.descendants`, tree order):**
- `get_elements_by_tag_name` — spec match: `*` → all; in an HTML document,
  HTML-namespace elements match the **ASCII-lowercased** argument while other
  namespaces match case-sensitively.
- `get_elements_by_tag_name_ns` — `(namespace, localName)` with `*` wildcards and
  `""` = null namespace; always case-sensitive.
- `get_elements_by_class_name` — elements having **all** the given classes.

**JS (`bootstrap.js`):**
- `globalThis.HTMLCollection` with prototype `length`/`item`/`namedItem`/iterator,
  fronted by a **Proxy** (`_makeHTMLCollection(refresh)`) for the WebIDL surface:
  live indexed access, index-set protection (silent non-strict / throws strict),
  expandos that shadow prototype members, supported-property-name access, and
  correct `ownKeys` / `getOwnPropertyDescriptor` (indices enumerable+configurable,
  named non-enumerable+configurable, no own `length`).
- **Supported property names**: a single tree-order pass — the non-empty `id` of
  *any* element, then the non-empty `name` of any element **in the HTML namespace**
  (the restricted a/applet/img/object/… tag list is `Document`'s rule, not
  HTMLCollection's). This precise single-pass order is what the `children`
  edge-case test asserts (`[foo, bar, baz]`).
- Wired `getElementsByTagName(NS)` / `getElementsByClassName` / `.children` on
  `Element` and `Document` (DetachedDocument inherits). Minimal `globalThis.NodeList`
  so `x instanceof NodeList` is answerable (our static results are deliberately
  plain arrays, not NodeList instances).

## Spoils

- `Element-getElementsByClassName` 1 → **3/3** ✅
- `Element-children` 0 → **2/2** ✅
- `HTMLCollection-empty-name` 0 → **7/7** ✅
- `Element-getElementsByTagName` 4 → **12/19**
- `Document-getElementsByTagName` 3 → **11/18**
- `Element-getElementsByTagNameNS` 0 → **7/16**
- **Zero regressions** across every held realm.

## The remaining tail (the next lever)

Almost all ~23 remaining fails need **real foreign-namespace `createElementNS`**.
Today `createElementNS(ns, name)` calls `createElement` (which lowercases and
creates an **HTML-namespace** node in Rust) and then pins `_ns` on the *JS
wrapper* only. So the Rust node — which the matching ops read — has the wrong
namespace and a lowercased local name. The blocked subtests are exactly the ones
that create elements in non-HTML namespaces, with prefixes, with uppercase or
non-ASCII names, or HTML-namespace elements with uppercase tag names.

The fix is an element-creation concern (a `create_element_ns` Rust op that builds
a node with the real `ns`/`prefix`/case-preserved `local`), which also improves
`namespaceURI`/`tagName`/`cloneNode`/serialization — worth its own increment.
