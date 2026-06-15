# ✅ Quest #02 — The Attr-Node Codex

> *Realm:* `dom/nodes/attributes.html`
> *Hold at start:* **11/67** · *Hold now:* **67/67 (100%)** — **SECURED**
> *Difficulty:* ⚔️⚔️⚔️ (an architectural siege)

---

## The beast

Obscura had no real `Attr` node. `el.attributes` returned a list of throwaway
plain objects; `getAttributeNS`/`setAttributeNS` ignored the namespace and just
lowercased like the non-NS variants; there were no `getAttributeNode`,
`setAttributeNode`, `createAttribute`, or `NamedNodeMap`. The Rust DOM stored
attributes in a `Vec<Attribute>` whose `QualName` already carried `ns`/`prefix`,
but every lookup keyed on the **local name only** — so an element could not hold
two attributes that share a local name across namespaces, which the spec (and
this test) demand.

Reading the real test source was decisive. `productions.js` ships **stub** name
lists (`// XXX`): `invalid_names = [""]`, `valid_names` includes `"0"`, `":"`,
`"~"`, `"invalid^Name"`, `"'"`, `'"'`, and `invalid_qnames = ["b:"]`. So the
"basic functionality" failures weren't a namespace problem at all — our
`_validateAttrName` enforced the full XML Name production and **rejected names
the test expects accepted**.

## The campaign

A two-front siege: namespace-aware **Rust storage** as the single source of
truth, plus a real **Attr/NamedNodeMap model in JS** layered over it.

**Rust (`tree.rs`, `ops.rs`).** The `QualName` already had the fields, so the
work was adding namespace/qualified-name-aware methods alongside the existing
local-keyed `get_attribute`/`set_attribute` (kept for the selector engine +
serializer, which only ever look up bare locals):
`get/set/remove_attribute_qualified`, `get/set/remove_attribute_ns`, and
`Attribute::qualified_name()`. New ops `get_attribute_ns`, `set_attribute_ns`,
`remove_attribute_ns`, and `attribute_list` (ordered `{ns,prefix,local,name,value}`
for building the JS wrappers); the existing `get/set/remove_attribute` ops were
switched to qualified-name matching. Args packed into `arg2` with `\0`.

**JS (`bootstrap.js`).**
- A real `globalThis.Attr` (nodeType 2): `value`/`nodeValue`/`textContent` read
  live through the owner element's NS ops while attached, and from an own
  `_detachedValue` while detached (`createAttribute`, or after removal);
  `name`/`localName`/`prefix`/`namespaceURI`/`ownerElement`/`specified`.
- A real `globalThis.NamedNodeMap`. Crucially, **all state lives off-instance in
  a `WeakMap`**, so the only own properties are the numeric indices (enumerable)
  and the qualified-name keys (non-enumerable, lowercase-only for HTML-in-HTML) —
  `length`/`item`/`getNamedItem` are prototype members. That exactly matches the
  `Object.getOwnPropertyNames` ordering the test asserts (`["0","1","a","b"]`,
  no `length`).
- A **per-element identity cache** (`_attrNodes`, keyed `ns|local`) so
  `el.attributes[i] === el.getAttributeNode(name)` and an Attr keeps its identity
  as it moves between elements, losing `ownerElement` on removal.
- `getAttributeNode(NS)`, `setAttributeNode(NS)` (with `InUseAttributeError` +
  replace-by-self + order preservation), `removeAttributeNode`, `getAttributeNames`.
- Namespace-aware `get/set/remove/hasAttributeNS` (case-sensitive), and the DOM
  **validate-and-extract** with the full `xml`/`xmlns`/prefix `NamespaceError`
  rules. `_validateAttrName` relaxed to reject only empty/whitespace names;
  `_validateQName` added for the QName production. ASCII-lowercasing now happens
  only for elements in the HTML namespace inside an HTML document (`_htmlAttr`),
  fixing the `createElementNS` / non-HTML-document cases.
- `document.createAttribute` / `createAttributeNS`.

## The last three

After the bulk landed (64/67), a CDP probe pinned the stragglers exactly:
1. **`setAttributeNode`/`NS`** — a moved Attr lost its value. `removeAttribute`
   deleted from Rust *before* the cache reconcile snapshotted the value, so the
   snapshot read `""`. Fixed by snapshotting the doomed Attr's value **before**
   the removal op.
2. **"Toggling element with inline style…"** — `el.style = "…"` set the
   standalone `CSSStyleDeclaration` but never the `style` content attribute, so
   `toggleAttribute("style")` couldn't see it. The `style` setter now reflects to
   the attribute (a rendering-fidelity win too — inline styles set via `el.style`
   are now actually serialized/rendered).

## Spoils

- **`dom/nodes/attributes.html` 11 → 67/67 (100%).**
- **Bonus:** `Node-cloneNode` 99 → 101 (namespace-aware clone attribute copy).
- **Zero regressions:** `Document-createElement` 147/147, `Node-appendChild`
  11/11, `querySelector-All` 1923/1975, `Element-classlist` 1315/1420,
  `EventListener-handleEvent` 6/6, `Element-setAttribute` 2/2, `iframe-load-event`
  2/2, `Range-insertNode` 909/1840 — all held. Real-page captures clean.

## New leverage for the campaign

The namespace-aware Rust attribute layer + the real `Attr`/`NamedNodeMap` model
are now foundational: any realm that touches `Attr` nodes, `NamedNodeMap`, or
namespaced attributes (Collections, more of Node-*, XML/foreign-content tests)
can build on this rather than the old throwaway-object stubs.
