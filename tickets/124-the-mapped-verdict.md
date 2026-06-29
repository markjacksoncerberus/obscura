# Quest #124 — The Mapped Verdict (DOMStringMap / `element.dataset`)

**Realm:** `html/dom/elements/global-attributes/dataset*` — the `HTMLElement.dataset`
DOMStringMap family.
**Result:** the whole dataset cluster **21/46 → 46/46 (+25)**, all seven tests now 100%.
**Touch:** `crates/obscura-js/js/bootstrap.js` only (no Rust). Session 2026-06-28.

## The gap

`element.dataset` is one of the most-used DOM conveniences on the real web — every
site that reads a `data-*` attribute from script goes through it. Obscura's
implementation was a stub:

```js
get dataset() {
  const el = this;
  return new Proxy({}, {
    get(_, k) { /* … */ return el.getAttribute("data-"+dashed); },  // returns null when absent
    set(_, k, v) { el.setAttribute("data-"+dashed, v); return true; },
  });
}
```

Four things were wrong, and they cascaded across the whole `dataset*` test cluster:

1. **No `DOMStringMap` interface.** The Proxy's target was a bare `{}`, so
   `dataset instanceof DOMStringMap` couldn't even be evaluated — `DOMStringMap`
   was not a global at all (`ReferenceError: DOMStringMap is not defined`). This
   alone zeroed `dataset.html`, the SVG/MathML cases, and `dataset-prototype`.
2. **Absent key returned `null`, not `undefined`.** `getAttribute` returns `null`
   for a missing attribute; the spec'd DOMStringMap getter must return `undefined`.
3. **No `has`/`ownKeys`/`getOwnPropertyDescriptor` traps.** `"foo" in el.dataset`,
   `for…in`, `Object.keys`, and `Object.getOwnPropertyDescriptor` all gave wrong
   answers (the bare-`{}` target answered them). Enumeration and delete tests failed.
4. **No namespace gate.** `dataset` is exposed only on HTMLElement / SVGElement /
   MathMLElement; a random-namespace element
   (`document.createElementNS("test","test")`) must have **no** `.dataset`
   (`=== undefined`). The stub handed one to every element.

Plus two subtle spec points the prototype/binding tests pin down:

- `get`/`has` must **fall through to the prototype chain** when the key isn't a
  `data-*` attribute, so `"toString" in dataset`, `dataset.toString ===
  Object.prototype.toString`, and accessor properties defined on
  `DOMStringMap.prototype` "shine through".
- `set` must **always create/update the content attribute** and must **not** invoke
  a setter inherited from the prototype (the named-property setter wins) — the
  binding test installs an `unreached_func` setter on `DOMStringMap.prototype` and
  asserts it is never called.

## The build (all additive, `bootstrap.js`)

Right before `class Element`:

- **`DOMStringMap` interface object** (`globalThis.DOMStringMap`) — an empty class
  whose only job is to be the `[[Prototype]]` of the live map so `instanceof` holds.
- **Two name converters** matching HTML §the-`dataset`-attribute:
  - `__datasetAttrToKey(a)` — strip `data-`, reject any uppercase ASCII letter
    (an attribute with one is *not* a supported name), fold each `-x` (x∈a-z) to
    uppercase `X`. `data-foo-bar` → `fooBar`.
  - `__datasetKeyToAttr(k)` — reject a `-` immediately followed by `a-z`
    (→ `SyntaxError` on set), fold each `A-Z` to `-` + lowercase, prefix `data-`.
    `fooBar` → `data-foo-bar`.

The `dataset` getter now:

- returns **`undefined`** unless `namespaceURI` is the HTML, SVG, or MathML namespace;
- builds the Proxy over `Object.create(DOMStringMap.prototype)` so
  `dataset instanceof DOMStringMap` is true;
- **`get`/`has`**: scan `getAttributeNames()`, matching by `__datasetAttrToKey`;
  on no match, fall through to the target (`target[k]` / `k in target`) so
  prototype-chain properties shine through;
- **`set`**: `__datasetKeyToAttr` (throw `SyntaxError` on an invalid name) →
  `setAttribute` — the named-property setter, never the prototype setter;
- **`deleteProperty`**: `removeAttribute` of the mapped attribute;
- **`ownKeys`/`getOwnPropertyDescriptor`**: project the element's `data-*`
  attributes to keys, each descriptor `{writable, enumerable, configurable}` true.

Data-attribute matches always take precedence over prototype lookups in `get`/`has`,
so once `data-foo` is set, `dataset.foo` is its value even if the prototype also
defines `foo`.

## Results (before → after, this session)

| Test | Before | After |
|------|:------:|:-----:|
| `dataset.html` | 0/8 | **8/8** |
| `dataset-delete.html` | 1/9 | **9/9** |
| `dataset-enumeration.html` | 0/2 | **2/2** |
| `dataset-get.html` | 10/10 | 10/10 |
| `dataset-prototype.html` | 0/2 | **2/2** |
| `dataset-set.html` | 10/11 | **11/11** |
| `dataset-binding.window.html` | 0/4 | **4/4** |
| **Total** | **21/46** | **46/46 (+25)** |

Baselines measured by stashing `bootstrap.js` and rebuilding (the standard
regression-proof trick).

## Zero regressions

qsa 1975, classlist 1420, createElement 147, Node-properties 726,
aria-attribute-reflection 41, aria-element-reflection 22/27 (unchanged cap),
getElementsByTagName 19, Document-getElementById 18, attributes 67,
Element-matches 669, Node-isEqualNode 9, insert-adjacent 14 — all unchanged.

## Caps / Next

- **No cap** — the dataset realm is now 100%.
- **NEXT-BEST OVERALL — a real `Document.cloneNode` (the next root-cause primitive):**
  while sweeping, found `dom/events/Event-dispatch-bubbles-true.html` failing en
  masse on `window.document.cloneNode(true)` → "Cannot read properties of null
  (reading 'documentElement')". The cause is a genuine primitive bug: the main-page
  `Document.cloneNode(deep)` (`bootstrap.js` ~line 3383) returns a **DocumentFragment**
  (`frag.innerHTML = this.innerHTML`) instead of a cloned **Document** — so the clone
  has no `documentElement`/`head`/`body` and no working `getElementById`. The right
  fix is to clone into a `DetachedDocument` (the standalone-doc class already supports
  documentElement/getElementById/factories) by deep-cloning each child of the source
  document. NB: that specific test reports an inflated/untrustworthy subtest count
  (its source has only 5 `test()` blocks yet the harness reports thousands, the same
  failing subtest repeated), so do **not** quote a "+N" from it — fix the primitive
  for its own sake and re-measure on the real `Node-cloneNode`/`Document`-clone tests.
- Other standing leads (unchanged): shadow-tree scope discrimination
  (aria-element 5 residual + CSSStyleSheet-constructable 6/13), the namespaced
  cascade-matching Rust lift (`selector.rs`, set-selectorText-namespace 0/5), or
  sweep another fresh DOM/HTML region.
