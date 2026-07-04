# Quest #141 — The Declared Verdict

**Declarative Shadow DOM: `<template shadowrootmode>` → a real shadow root at parse time.**
**+793 subtests across 6 tests. ZERO regressions.** Session 2026-07-04.

## The gap

`shadow-dom/declarative/` was almost entirely red: attachment 0/654, opt-in 0/117,
basic 1/22, slot-assignment 0/8, repeats 0/3. The frontier had two visible blockers:
`setHTMLUnsafe is not a function` (every attachment subtest) and — subtler — a parser
bug where `<template shadowrootmode>` had its content **dumped into the light DOM** with
the template wrapper deleted (`div.innerHTML` of a declarative template produced a bare
`<span>`, no `<template>`).

**Root cause of the parser bug:** html5ever **0.39 natively supports declarative shadow
DOM.** It calls two `TreeSink` hooks — `allow_declarative_shadow_roots` (default **true**)
and `attach_declarative_shadow` (default **false**, a no-op). Our sink implemented neither,
so the parser took the "attach" path, the sink's attach returned false, and the fallback
mis-handled the floating template — losing the wrapper.

## The fix — one Rust line + all-JS conversion

Our shadow-root model lives in **JS** (`ShadowRoot`/`attachShadow`), not the Rust tree, so
the sink can't build a real shadow. The clean split:

1. **`crates/obscura-dom/src/tree_sink.rs`** — override `allow_declarative_shadow_roots`
   to return **`false`**. Now the parser leaves every `<template shadowrootmode>` as an
   ordinary template (markup preserved in `template_contents`). This ONE method fixed the
   light-DOM-dump bug and, by itself, took **opt-in 0→110** (its ~100 element-loop subtests
   only need `innerHTML` to leave the template alone — which it now does).

2. **`crates/obscura-js/js/bootstrap.js`** — the declarative conversion, run only in the
   opt-in contexts (main-document load + `setHTMLUnsafe`), never plain `innerHTML`:
   - `_processDeclarativeShadowRoots(node, skipDirect)` — a tree-order DFS. For each
     `<template>` with a valid `shadowrootmode`, `attachShadow` on its parent, move the
     template's content into the shadow, drop the template; recurse into the new shadow.
     `skipDirect` skips the target's DIRECT template children — in fragment parsing the
     context element is the topmost open element and its direct declarative templates are
     NOT attached (this ALSO correctly leaves a template alone when its host is a void
     element like `<area>`, where the parser makes the template a wrapper sibling).
   - `Element.prototype.setHTMLUnsafe` / `ShadowRoot.prototype.setHTMLUnsafe` — set
     `innerHTML`, then convert with `skipDirect = true`.
   - `attachShadow` reattach: an element that already hosts a **declarative** shadow of the
     SAME mode is emptied and returned (declarative flag cleared) rather than throwing;
     the shadow's ORIGINAL options are preserved (per whatwg/dom#1246 — the new init is
     ignored). A non-declarative shadow, or a mode mismatch, still throws NotSupportedError.
   - `attachShadow` also now honours a custom element's `disabledFeatures` including
     `"shadow"` (throws NotSupportedError).
   - `HTMLTemplateElement.prototype` IDL reflection: `shadowRootMode` (enumerated
     open/closed, invalid→""), `shadowRootDelegatesFocus` / `shadowRootClonable` /
     `shadowRootSerializable` (boolean), `shadowRootSlotAssignment` (enumerated
     named/manual, invalid+missing→"named"). `slotAssignment` is carried into the shadow.

3. **`crates/obscura-browser/src/page.rs`** — the `<ready-state>` script (runs after parse,
   before page scripts) now calls `_processDeclarativeShadowRoots(document.documentElement)`
   before `__exposeNamedGlobals()`.

## Results (stash-verified before/after)

| Test | Before | After | Δ |
|---|---|---|---|
| declarative-shadow-dom-attachment | 0/654 | **654/654** | +654 |
| declarative-shadow-dom-opt-in | 0/117 | **111/117** | +111 |
| declarative-shadow-dom-basic | 1/22 | **18/22** | +17 |
| declarative-shadow-dom-slot-assignment | 0/8 | **7/8** | +7 |
| declarative-shadow-dom-repeats | 0/3 | **3/3** | +3 |
| declarative-shadow-dom-repeats-2 | 0/1 | **1/1** | +1 |
| **Total** | | | **+793** |

**ZERO regressions** (stash-verified identical before/after): qsa 1975, classlist 1/1,
createElement 147, Node-properties 726, cloneNode 135, getElementsByTagName 18, slots 26,
slots-fallback 13, ShadowRoot-interface 8/12, attachShadow 6/6, event-inside-slotted-node 20,
template-content 216, insert_adjacent_html 31, DOMParser-html 9/10.

## Caps / Next

- **Clone propagation** (basic 4/22 residual, `template-content-*`): cloning a `<template>`'s
  content that contains a *clonable* declarative shadow must carry the shadow into the clone.
  Needs `cloneNode`/`importNode` to clone shadow roots (a sensitive shared primitive — scope
  tight, stash-sweep). This also wants the walk to recurse into unconverted template contents.
- **`getHTML()` serialization** — `shadow-dom/declarative/gethtml.html` is **6908** subtests,
  all red, gated on `Element.getHTML({serializableShadowRoots})` + shadow-root serialization.
  The single largest remaining shadow tail; a separate feature from parse-time attachment.
  Also `declarative-shadow-dom-serialization` 0/2.
- **`ElementInternals`/`attachInternals`** — gates `available-to-element-internals` 0/1 and
  slot-assignment's last subtest (a closed-shadow attachInternals path).
- **Streaming-parse ordering** — `declarative-with-disabled-shadow` 0/1: our conversion runs
  in ONE batch after full parse but before page scripts, so a `customElements.define` that
  sets `disabledFeatures` hasn't run yet. True fix needs interleaved (streaming) processing.
- **`document.write` / iframe declarative / `Range.createContextualFragment`** — opt-in's
  remaining 6 residual, each a separate feature.
