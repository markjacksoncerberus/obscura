# Quest #142 — The Serialized Verdict

**`getHTML()` — HTML fragment serialization WITH shadow roots.**
**+6914 subtests across 4 tests. ZERO regressions.** Session 2026-07-04.

## The gap

`shadow-dom/declarative/gethtml.html` was **0/6908** — the single largest remaining
red test in the whole suite, and the #1 "next leverage" pointer left by Quest #141.
It cross-products ~110 HTML element types × shadow-config (mode, delegatesFocus,
serializable, clonable, empty-tree, declarative-vs-imperative, Element-vs-ShadowRoot)
and asserts, for each, the exact `getHTML()` serialization. `Element.getHTML()` and
`ShadowRoot.getHTML()` simply **did not exist** (`getHTML is not a function`), so every
subtest threw.

Three sibling tests were red for the same reason: `gethtml-ordering` (could-not-run),
`declarative-shadow-dom-serialization` (0/2), and
`declarative-shadow-dom-slot-assignment-serialization` (0/3).

## The algorithm

`getHTML(options)` = the HTML fragment-serialization of a node's **children** (like
`innerHTML`), extended so that an element hosting a *to-be-serialized* shadow emits the
shadow as a `<template shadowrootmode>` element **prepended to its content**, before its
light children. A shadow root is serialized when it is listed in `options.shadowRoots`,
OR when `options.serializableShadowRoots` is true and the shadow is `serializable`. The
rule is uniform: the inner serialization of ANY element (including the node getHTML is
called on directly) prepends that element's shadow template — which is why
`element.getHTML()` on a host yields `<template…>…light…` and
`wrapper.getHTML()` yields `<host><template…>…light…</host>`.

## The fix — reuse Rust for shadow-free subtrees (`bootstrap.js`)

Our shadow model lives in JS (`host._shadowRoot`), invisible to the Rust serializer —
so wherever a shadow must be injected we recurse in JS, but **any subtree with no
to-be-serialized shadow is handed to the Rust serializer** (`outer_html`), which already
implements HTML fragment serialization exactly as `innerHTML` does. That keeps
`getHTML()` byte-identical to `innerHTML` whenever no shadow is serialized (the default),
confines the hand-written JS to the small shadow-hosting spine, and reuses Rust's
escaping / void-element / raw-text handling for free.

- `_getHTMLImpl(node, options)` — parses options; **fast path**: if
  `_subtreeHasSerializableShadow` is false, return `node.innerHTML` verbatim.
- `_serializeShadowInclusiveInner(node)` — children serialization, prepending node's own
  shadow `<template>` when applicable.
- `_serializeChildShadowInclusive(child)` — a child with no serializable shadow anywhere
  in its subtree → `outer_html` (Rust); otherwise recurse to inject.
- `_serializeShadowTemplate(sh)` — `<template shadowrootmode="…"` + (in order)
  `shadowrootdelegatesfocus` / `shadowrootserializable` / `shadowrootclonable` + inner.
- `_serializeAttrsForShadowHost` matches the Rust escaper (only `&`,`"` in attr values).
- Both `Element.prototype.getHTML` and `ShadowRoot.prototype.getHTML` share `_getHTMLImpl`.

## The second fix — a pre-existing doc-proxy stack overflow (`bootstrap.js`)

With `getHTML()` in place, 10 subtests still failed — but with **`Maximum call stack size
exceeded`**, and ONLY on `embed`/`form`/`iframe`/`img`/`object` (exactly
`_DOC_NAMED_TAGS`). Root cause was **pre-existing and orthogonal** to getHTML:
*connecting* one of these named-access elements triggers a document **named-property**
lookup; `_docNamedItem` → `_docNamedElements` → `querySelectorAll`, whose selector-engine
path reads `document._isHTMLDoc` back through the named-access **Proxy** — and the proxy
routed that internal `_`-prefixed read to `_docNamedItem` again → infinite recursion.

Fix: WebIDL named properties only ever expose author-facing names (id / name attribute
values); an internal engine slot — every `_`-prefixed key — is NEVER a named property.
The doc-proxy `get`/`has`/`getOwnPropertyDescriptor` traps now skip the named-item path
for `_`-keys (`_isNamedKey`), breaking the cycle at the exact re-entry point AND hardening
the engine so `document.body.appendChild(document.createElement('img'))` can no longer
stack-overflow. Tightly scoped to the doc proxy; full named-access sweep unchanged.

## Results (stash-verified before/after)

| Test | Before | After | Δ |
|---|---|---|---|
| declarative/gethtml | 0/6908 | **6908/6908** | +6908 |
| declarative/gethtml-ordering | could-not-run | **3/3** | +3 |
| declarative/declarative-shadow-dom-serialization | 0/2 | **2/2** | +2 |
| declarative/…-slot-assignment-serialization | 0/3 | **1/3** | +1 |
| **Total** | | | **+6914** |

**ZERO regressions** (stash-verified identical): qsa 1975, classlist 1420,
createElement 147, Node-properties 726, cloneNode 135, getElementsByTagName 19,
template-content 216, insert_adjacent_html 31, slots 26, event-inside-slotted-node 20,
declarative-shadow-dom-attachment 654, basic 18/22, opt-in 111/117, ShadowRoot-interface
8/12, reset-form 12/12 (document.forms named access), and the full named-access series
(nameditem-01 7/7, -02 12/12, -05 12/12, -07 11/11, -names 15/16 — all identical, the
15/16 being the documented pre-existing cap).

## Caps / Next

- **slot-assignment-serialization 1/3** — the 2 residual assert getHTML output for a
  *manually*-slotted shadow (`slotAssignment: 'manual'`) where flattened assignment
  affects nothing serialized here; the remaining fails hinge on `shadowrootslotassignment`
  round-tripping + assign() interplay, a narrow tail.
- **Clone propagation** (declarative-shadow-dom-basic 18/22, still) — cloning a
  `<template>`'s content that contains a *clonable* declarative shadow must carry the
  shadow into the clone; needs `cloneNode`/`importNode` to clone shadow roots (a sensitive
  shared primitive — scope tight, stash-sweep). Now the single biggest self-contained
  shadow residual.
- **`ElementInternals`/`attachInternals`** — `available-to-element-internals` 0/1.
- **In-shadow focus** — `ShadowRoot.activeElement` (ShadowRoot-interface 4/12 residual +
  focus-within-shadow), same lift as constructable-stylesheets 6/13.
