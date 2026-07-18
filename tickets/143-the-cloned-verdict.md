# Quest #143 — The Cloned Verdict

**Clone-propagation of shadow roots — `cloneNode`/`importNode` carry a *clonable*
shadow into the clone; a `ShadowRoot` itself refuses to clone.**
**+8 subtests across 3 tests. ZERO regressions.** Session 2026-07-05.

## The gap

`shadow-dom/declarative/declarative-shadow-dom-basic.html` was stuck at **18/22** —
the #1 "next leverage" pointer from Quest #142. The 4 residual subtests all clone a
`<template>` whose content holds a `<template shadowrootmode=open shadowrootclonable>`
declarative shadow, then assert the clone's inner host has a live shadow root:

```
<template id="template-containing-shadow">
  <div class="innerdiv">
    <template shadowrootmode=open shadowrootclonable>Content</template>
  </div>
</template>
...
container1.appendChild(template.content.cloneNode(true));
assert_true(!!container1.querySelector('div.innerdiv').shadowRoot); // was false
```

Two sibling tests were red for a related reason — a `ShadowRoot` must be **non-clonable**:
`shadow-dom/Node-prototype-cloneNode.html` (2/4) and
`shadow-dom/Document-prototype-importNode.html` (0/2) assert `shadowRoot.cloneNode(...)`
/ `importNode(shadowRoot)` throw `NotSupportedError`.

## Root causes (three, all `bootstrap.js`)

CDP probing pinned exactly where the clonable shadow was being dropped:

1. **Declarative processing never descended into `<template>` content.**
   `_processDeclarativeShadowRoots` walks `node.firstChild`, but a template element's
   parsed markup lives in its SEPARATE content fragment (`template.firstChild` is
   `null`), so the inner `<template shadowrootmode>` inside template content was never
   converted to a shadow root at parse time. Declarative shadow roots inside template
   content **are** attached during document parsing — that is the entire point of
   `shadowrootclonable`.

2. **`Node.cloneNode` (element branch) never propagated the shadow.** The DOM
   "clone a node" shadow-host step was missing: an element hosting a *clonable* shadow
   root must give its clone a fresh shadow root with the same settings and deep-clone
   the shadow tree into it.

3. **`DocumentFragment.cloneNode` round-tripped through `innerHTML`.** It did
   `frag.innerHTML = this.innerHTML` — serialize+reparse — which DROPS shadow roots on
   child hosts (innerHTML never includes shadow trees) and reparses WITHOUT declarative
   processing. So even after fixes 1+2, `template.content.cloneNode(true)` (a fragment
   clone) lost the shadow before the element clone step ever ran.

## The fix (`bootstrap.js`)

- **`_processDeclarativeShadowRoots`** — after processing a non-converted `<template>`
  child, also recurse into its `.content` fragment (skipDirect unneeded: a content
  fragment's direct children have the fragment as parent, never a valid host). This is
  what attaches the clonable shadow inside template content at load time.
- **`Node.cloneNode` element branch** — DOM clone shadow-host step: if
  `this._shadowRoot && this._shadowRoot._clonable`, `el.attachShadow(...)` with the
  source shadow's mode/delegatesFocus/slotAssignment/clonable/serializable, copy the
  `_declarative` flag, and deep-clone the shadow tree's children in. Gated on
  `_clonable`, so imperatively-attached (non-clonable) shadows are NOT cloned — exactly
  what `Node-prototype-cloneNode`'s "should NOT clone" subtests require (they already
  passed and stayed green).
- **`DocumentFragment.cloneNode`** — rewritten to deep-clone by recursing over the REAL
  children (`child.cloneNode(true, _targetDoc)`) instead of the innerHTML round-trip, so
  fragment clones carry child shadows and forward `_targetDoc` (importNode ownerDocument).
- **`ShadowRoot.cloneNode`** — overrides the inherited fragment clone to throw
  `NotSupportedError` (DOM §clone: "if node is a shadow root, throw"). This also makes
  `Document.importNode(shadowRoot)` throw, since importNode delegates to cloneNode.

## Results (measured before/after)

| Test | Before | After | Δ |
|---|---|---|---|
| declarative/declarative-shadow-dom-basic | 18/22 | **22/22** | +4 |
| Node-prototype-cloneNode | 2/4 | **4/4** | +2 |
| Document-prototype-importNode | 0/2 | **2/2** | +2 |
| **Total** | | | **+8** |

**ZERO regressions** (measured identical): Node-cloneNode 135, Range-cloneContents 187,
Range-extractContents 187, template-content 216, insert_adjacent_html 31, qsa 1975,
classlist 1420, createElement 147, Node-properties 726, slots 26, event-inside-slotted-node
20, declarative-shadow-dom-attachment 654, opt-in 111/117, ShadowRoot-interface 8/12,
gethtml 6908, repeats 3/3, repeats-2 1/1, declarative-shadow-dom-serialization 2/2,
slot-assignment-serialization 1/3.

## Caps / Next

- **`declarative-after-attachshadow` 0/1** — needs parse-time MutationObserver
  interleaving: an observer fires while the parser is mid-`#host`, imperatively attaches
  a closed shadow BEFORE the parser reaches the declarative `<template shadowrootmode>`,
  so the declarative attach must fail. Our declarative processing is a single POST-parse
  JS walk, so the observer/attach ordering isn't modelled. A parser-timing concern,
  orthogonal to clone-propagation.
- **`slot-assignment-serialization` 1/3** — manual `shadowrootslotassignment` round-trip
  (unchanged; the narrow serialization tail from #142).
- **`ElementInternals`/`attachInternals`** — `declarative-shadow-dom-available-to-element-internals`
  0/1; `ShadowRoot.getElementById`-style internals still absent.
- **In-shadow focus** — `ShadowRoot.activeElement` (ShadowRoot-interface 4/12 residual),
  same lift as constructable-stylesheets 6/13.
