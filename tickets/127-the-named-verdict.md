# Quest #127 — The Named Verdict

**Realm:** Named access on the Document object (HTML §nameditem)
**Files:** `crates/obscura-js/js/bootstrap.js` (no Rust)
**Result:** `nameditem` cluster **16/82 → 80/82 (+64)**, zero regressions, 2 honest caps.

## The gap

After #126 took `insertAdjacentHTML` to 100%, swept fresh ground past the (now
near-saturated) `dom/nodes` realm and found the widest unimplemented tail on the
board: **named property access on the `document` object** — `document.foo`,
`document['foo']`, `'foo' in document`, `Object.getOwnPropertyNames(document)`.

The HTML spec exposes certain elements as *named properties of the Document*
(§named-access-on-the-Document-object / "dom-document-nameditem"). Obscura had
**none** of it — `document.someName` simply returned `undefined`, so the whole
`html/dom/documents/dom-tree-accessors/nameditem-*` cluster was failing:

| Test | Before |
|------|:------:|
| `nameditem-01` (img id & name) | 0/7 |
| `nameditem-02` (iframes) | 2/12 |
| `nameditem-03` (applets) | 0/1 |
| `nameditem-04` (embed) | 3/12 |
| `nameditem-05` (form) | 3/12 |
| `nameditem-06` (mixed) | 2/9 |
| `nameditem-07` (objects) | 0/11 |
| `nameditem-08` | 0/2 |
| `nameditem-names` (supported property names) | 6/16 |

## The spec primitive

The supported property names of a `Document`, in tree order, are:
- the **`name`** of every *exposed* `embed`/`form`/`iframe`/`img`/`object` with a
  non-empty `name`;
- the **`id`** of every *exposed* `object` with a non-empty `id`;
- the **`id`** of every `img` that has BOTH a non-empty `id` AND a non-empty `name`.

The *value* for a name:
- **0 matches** → not a supported name (`undefined`, `in` → false).
- **1 match** → the element — UNLESS it's an `iframe` with a non-null nested
  browsing context, in which case its **`contentWindow`** (WindowProxy).
- **>1 match** → a **live `HTMLCollection`** of all matches in tree order.

Named properties are *legacy platform object* named properties: they're shadowed by
any real property of the object or its prototype chain (interface members like
`document.body`, and expandos) — those always win.

## The fix (all in `bootstrap.js`, no Rust)

1. **Helpers** (next to the `HTMLCollection` machinery, after `_gebClassName`):
   - `_docElemExposed(el)` — an `object`/`embed` is "exposed" iff it has no `object`
     element ancestor (a simplified reading of the spec's exposure rule, enough for
     ordinary non-plugin content; nested `<object><object>` de-exposes the inner).
   - `_docElemHasName(el, name)` — does this HTML-namespaced element contribute the
     supported name? Encodes the name-set / id-set rules above.
   - `_docNamedElements(doc, name)` — `querySelectorAll('embed,form,iframe,img,object')`
     (tree order) filtered by `_docElemHasName`.
   - `_docSupportedNames(doc)` — the de-duplicated supported-names list (name first,
     then id, per element).
   - `_docNamedItem(doc, name)` — the §nameditem value: `undefined` / element /
     `contentWindow` (single iframe) / **live** `_makeHTMLCollection(() => _docNamedElements(...))`.

2. **A transparent Proxy over the document** (in `__obscura_init`, right after the
   wrapper-cache seed). Traps:
   - `get` — if the prop is a string NOT already real (`!Reflect.has(target, p)`),
     return `_docNamedItem`; else forward. (Real props & expandos win.)
   - `has` — real OR a supported name.
   - `getOwnPropertyDescriptor` — real OR `{value, writable:false, enumerable:true,
     configurable:true}` for a supported name (so `Object.getOwnPropertyNames`/`in`
     see them; `configurable:true` keeps the Proxy invariant happy on the extensible
     document target).
   - `ownKeys` — real keys ∪ supported names.
   - `set` — `Reflect.set(t, p, v)` (expandos land on the target; explicit trap
     avoids any receiver-recursion subtlety).

   The Proxy is installed BOTH as `globalThis.document` AND in the wrapper cache
   (`_cache.set(_docNid, _docProxy)`) so node-identity stays intact —
   `document === node.ownerDocument === _wrap(docNid)` all resolve to the same Proxy.
   This is the load-bearing detail: without re-caching, `_wrap(docNid)` would hand
   out the raw document while `globalThis.document` is the Proxy, and every
   `node.ownerDocument === document` check (ranges, adoption, getRootNode) would break.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `nameditem-01` | 0/7 | **7/7** |
| `nameditem-02` | 2/12 | **12/12** |
| `nameditem-03` | 0/1 | 0/1 (cap) |
| `nameditem-04` | 3/12 | **12/12** |
| `nameditem-05` | 3/12 | **12/12** |
| `nameditem-06` | 2/9 | **9/9** |
| `nameditem-07` | 0/11 | **11/11** |
| `nameditem-08` | 0/2 | **2/2** |
| `nameditem-names` | 6/16 | **15/16** |
| **Total** | **16/82** | **80/82 (+64)** |

## Caps (2 — honest)

1. **`nameditem-03` (applets, 0/1):** asserts `applet.name === undefined`. Obscura's
   generic `get name()` (`bootstrap.js` ~line 2506) returns `getAttribute("name") || ""`
   for *every* element, so `<applet name=test1>.name` is `"test1"`. `applet` is an
   `HTMLUnknownElement` with no `name` IDL attribute. The `in document` half passes
   (applet isn't a named tag) — only the `applet.name` reflection breadth fails.
   Narrowing `name` to only the elements that reflect it is a wide, regression-prone
   refactor (forms/inputs/selects all lean on it) for one obsolete-element subtest.
   **Not worth the risk; capped.**
2. **`nameditem-names` (15/16):** the one fail is "an embed name does not appear if the
   embed is inside another embed". `embed` is a void element, so the parser makes the
   two embeds **siblings** (both exposed → both names appear). Even a plain spec read
   of "exposed" only de-exposes an embed via an *object* ancestor, not an embed
   ancestor — so this hinges on plugin/parser exposure semantics we don't model.
   **Capped.**

## Zero-regression sweep

Held (final binary): qsa 1975, classlist 1420, createElement 147, Node-properties
726, getElementById 18, attributes 67, aria-attribute-reflection 41, dataset-get 10,
insert_adjacent_html 31, Document-createElementNS 596, Event-dispatch-bubbles-true 5,
Element-getElementsByTagName 19, getElementsByName-newelements 27,
getElementsByName-interface 0/1 (pre-existing, unaffected).

`Document.currentScript` (0/18 TIMEOUT) and `document.title-01` (1/4) were verified
**identical on the stashed baseline binary** — pre-existing, NOT regressions from the
document Proxy.

## Next leverage

- **Shadow-tree scope discrimination** — the standing #1 cap (aria-element 5 residual,
  CSSStyleSheet-constructable 6/13). Needs real shadow-inclusive-ancestor vs
  crossing-into-shadow scoping.
- **Namespaced cascade-match Rust lift** (`crates/obscura-dom/src/selector.rs`,
  `set-selectorText-namespace` 0/5).
- **Sweep another fresh DOM/HTML region** — core DOM primitives keep paying off
  (#123 +10, #124 +25, #125, #126 +29, #127 +64 all from one small correct primitive).
  Candidate seen in passing: `css/cssom/getComputedStyle-pseudo.html` 2/28 (likely
  layout-capped — verify before committing), `dom/abort/event.any.html` 15/16,
  `dom/events/AddEventListenerOptions-signal.any.html` 4/11 (AbortSignal listener
  removal — implementable).
