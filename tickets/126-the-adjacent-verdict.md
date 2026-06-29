# Quest #126 — The Adjacent Verdict

> *To place a thing beside another, you must first know which side — and refuse,
> loudly, when there is no side to place it on.*

**Realm:** `Element.insertAdjacentHTML` (`crates/obscura-js/js/bootstrap.js`)
**Banner test:** `domparsing/insert_adjacent_html.html`
**Hold:** 2/31 → **31/31, OK** — zero regressions.

---

## The gap

Sweeping fresh ground after Quest #125, `domparsing/insert_adjacent_html.html`
sat at **2/31 (6.5%)** — the widest single-file tail on the board. Per-subtest
failures clustered into four root causes, all in one small method:

```
[fail] Afterbegin content without next sibling
    -> Cannot read properties of null (reading 'localName')
[fail] beforeBegin content without next sibling
    -> Should have had <i> as previous sibling expected "i" but got "p"
[fail] Should throw when inserting with invalid position string
    -> assert_throws_dom: function "...content.insertAdjacentHTML("bar","foo")" did not throw
[fail] When the parent node is null ... should throw for beforebegin and afterend
    -> assert_throws_dom: ...insertAdjacentHTML("afterend","") did not throw
[fail] When the parent node is a document ... should throw
    -> threw "HierarchyRequestError" code 3, expected NO_MODIFICATION_ALLOWED_ERR code 7
```

The old implementation:

```js
insertAdjacentHTML(position, html) {
  const parent = this.parentNode;
  switch (position) {                       // (a) raw, case-SENSITIVE
    case 'afterbegin': {
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      const children = tmp.childNodes;       // (b) LIVE NodeList
      const first = this.firstChild;
      for (let i = children.length-1; i>=0; i--) this.insertBefore(children[i], first);
      break;
    }
    case 'beforebegin':
      if (parent) { ... }                    // (c) no parent → silent no-op
      break;
    ...
  }
}
```

Four bugs:

1. **Case-sensitive position.** The switch matched the raw string; the test calls
   `"beforeBegin"`, `"Afterbegin"`, `"BeforeEnd"`, `"afterBegin"`, … (mixed case).
   A camelCase position fell through to the (missing) `default` → silent no-op.
2. **Live `childNodes` moved one-by-one.** `tmp.childNodes` is a *live* list;
   each `insertBefore`/`appendChild` removed a node from it, shrinking the list
   under the loop counter → it skipped every other node and eventually indexed
   past the end → `appendChild(undefined)` → "Cannot read properties of null".
3. **No `SyntaxError` for an unknown position.** A bad position string must throw,
   not no-op.
4. **No `NoModificationAllowedError` (code 7).** `beforebegin`/`afterend` with no
   parent, or a **Document** parent (`document.documentElement.insertAdjacentHTML`),
   must throw code 7 *before* touching the tree. The old code either silently
   no-op'd (null parent) or let `insertBefore` throw the wrong `HierarchyRequestError`
   (code 3) for a document parent.

A fifth, latent hazard: parsed `<script>` elements must **not execute** when the
parsed nodes are inserted — and a top-level `<script>` moved via `appendChild`
hits the Quest #125 inline-script eval gate.

---

## The work (all in `bootstrap.js`, no Rust)

Rewrote `insertAdjacentHTML` to the DOM §`insertAdjacentHTML` algorithm:

1. **ASCII case-insensitive position** (`replace(/[A-Z]/g, …)`, *not* `toLowerCase()`
   — the test feeds `"beforebegİn"`/`"beforebegın"` which must stay non-matching →
   `SyntaxError`; Unicode lowercasing would not change them either, but ASCII-only
   is the spec-correct fold).
2. **Resolve the insertion `context` and throw first.**
   - `beforebegin`/`afterend`: `context = parentNode`; if it's null or a Document
     (`nodeType === 9`) → `NoModificationAllowedError`.
   - `afterbegin`/`beforeend`: `context = this`.
   - otherwise → `SyntaxError`.
3. **Fragment parsing in the context's element kind** — a throwaway element named
   after the context's `localName` (`<html>` → `<body>` so the parser doesn't
   synthesize implied `<head>`/`<body>`), mirroring the `outerHTML` setter.
4. **Flag parsed `<script>`s "already started"** (`_scriptAlreadyStarted = true`,
   recursively) — the Quest #125 inertness flag — so they never auto-execute when
   inserted (matches HTML fragment parsing).
5. **Insert via a DocumentFragment, atomically.** Move the parsed nodes into a
   `DocumentFragment` and insert *that* once (`insertBefore(frag, …)` /
   `appendChild(frag)`). No live-NodeList hazard; text nodes are not merged with
   existing siblings.

---

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `domparsing/insert_adjacent_html.html` | 2/31 | **31/31** |

**Zero-regression sweep (all unchanged):** `domparsing/insert-adjacent.html` 4/4
(insertAdjacentElement/Text), outerhtml-01 1/1, outerhtml-02 5/5,
Event-dispatch-bubbles-true 5/5 (Quest #125 script-inertness still holds),
Node-cloneNode 135, Node-properties 726, classlist 1420, qsa 1975,
createElement 147, getElementById 18, attributes 67, aria-attribute-reflection 41,
dataset 8. (Every page's own inline/external scripts still execute — only the
parsed/cloned ones are inert.)

---

## Caps / Next

- **No cap on this realm** — the banner is 100%. The companion
  `insertAdjacentElement`/`insertAdjacentText` (`_insertAdjacentNode`) was already
  spec-correct (4/4) and is untouched.
- **Standing leads (unchanged):** shadow-tree scope discrimination shared by
  `aria-element-reflection` (5 residual) + `CSSStyleSheet-constructable` (6/13);
  the namespaced cascade-matching Rust lift (`crates/obscura-dom/src/selector.rs`,
  `set-selectorText-namespace` 0/5); or sweep another fresh DOM/HTML region —
  core DOM primitives keep paying off (this was +29 from one rewritten method).
