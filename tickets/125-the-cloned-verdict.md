# Quest #125 — The Cloned Verdict

> *A document, cloned, must answer to its own name — and the spells written
> within it must not cast themselves twice.*

**Realm:** Document cloning + cloned-script execution (`crates/obscura-js/js/bootstrap.js`)
**Banner test:** `dom/events/Event-dispatch-bubbles-true.html`
**Hold:** broken (harness ERROR) → **5/5, OK** — zero regressions.

---

## The gap

While sweeping after Quest #124, `dom/events/Event-dispatch-bubbles-true.html`
was failing en masse with the same row repeated:

```
[fail] In window.document.cloneNode(true)
    -> Cannot read properties of null (reading 'documentElement')
```

The test has only **5 real `test()` blocks**, yet the harness reported an
inflated `2112/2705` with status **ERROR** (the same failing subtest counted
thousands of times — a known harness artifact; do **not** quote a large "+N"
from it). The real subtests:

1. `In window.document with click event`
2. `In window.document with load event`
3. `In window.document.cloneNode(true)`  ← the broken one
4. `In new Document()`
5. `In DOMImplementation.createHTMLDocument()`

Subtest 3 does `var documentClone = document.cloneNode(true)` then walks
`documentClone.documentElement` / `.getElementById(...)`.

### Root cause #1 — `Document.cloneNode` returned `null`

`Node.prototype.cloneNode(deep, _targetDoc)` handled element (1), text (3) and
comment (8) nodes and fell through to `return null` for **document** nodes
(type 9). So `document.cloneNode(true)` → `null`, and
`targetsForDocumentChain(null)` threw on `null.documentElement`.

(The `DetachedDocument`/`XMLDocument` subclasses already had their own correct
`cloneNode` — only the **page document** and standalone `new Document()` were
missing one.)

### Root cause #2 — cloned `<script>` re-executed (infinite recursion)

`Node.appendChild` **evaluates** an inserted inline `<script>` (`(0,eval)(code)`,
~line 958). Deep-cloning the page reproduces its own inline `<script>` — the one
that *contains the test bodies* — and appending the clone re-ran it, which called
`document.cloneNode(true)` again → clone → re-run → … → JS stack overflow → V8
OOM → server core-dump.

This was **masked** before fix #1: with `document.cloneNode` returning `null`,
the re-executed inline script threw immediately (null `documentElement`) and
stopped. Making `cloneNode` correct unmasked the latent re-execution bug.

Per DOM §clone-a-node, a script's *"already started"* flag is copied to the
clone, so a clone of an already-run script must never auto-execute on insertion.

---

## The work (all in `bootstrap.js`, no Rust)

1. **`Document.prototype.cloneNode(deep)`** (in `class Document`, before
   `getElementById`). Produces a fresh **detached** document of the same kind —
   `new DetachedDocument('html')` for the page, `new Document()` (XML) for a
   standalone `new Document()` — strips the auto-built `<html><head><body>`,
   copies `_compatMode`/`_contentType`, and for a deep clone deep-clones each
   child **into the clone** (`k.cloneNode(true, copy)` so the cloned nodes' node
   document is `copy`; a doctype's `_ownerDoc` is repointed to `copy`). A shallow
   clone is an empty document (no `documentElement`/`head`/`body`), per spec.
   Modeled on the existing `DetachedDocument.cloneNode`.

2. **Cloned-script "already started" flag.** In `Node.cloneNode`'s element
   branch, after copying attributes: `if (this.localName === 'script')
   el._scriptAlreadyStarted = true;`. In `Node.appendChild`, the inline-script
   eval is gated `&& !c._scriptAlreadyStarted`. A dynamically *created* script
   (`createElement('script')`) has no flag → still runs; only **clones** are
   inert. `insertBefore` never evaluated scripts, so it needed no change.

---

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `dom/events/Event-dispatch-bubbles-true.html` | broken / ERROR (inflated 2112/2705) | **5/5 OK** |
| `dom/nodes/Node-cloneNode.html` | 135/135 | 135/135 (held) |

**Zero-regression sweep (all unchanged):** Node-cloneNode 135, Document-importNode 5,
Node-isEqualNode 9, qsa 1975, createElement 147, Node-properties 726,
getElementById 18, attributes 67, getElementsByTagName 19, Event-dispatch-order 1,
aria-attribute-reflection 41, aria-element-reflection 22/27 (cap), Range-cloneContents 187,
classlist 1420. (Every test page's own inline/external scripts still execute — proving
normal script execution is intact; only *cloned* scripts are inert.)

---

## Caps / Next

- **No cap on this realm** — the banner test is 100%, and the two primitives
  (document clone, cloned-script inertness) are now spec-correct root causes that
  any future page-clone / `createHTMLDocument` + script test inherits.
- **Honesty note:** the displayed pre-fix `2112/2705` is a harness inflation
  artifact (5 real subtests); the win is *harness ERROR→OK* + the `cloneNode(true)`
  subtest going green, not a literal `+593`.
- **Standing leads (unchanged):** shadow-tree scope discrimination shared by
  `aria-element-reflection` (5 residual) + `CSSStyleSheet-constructable` (6/13);
  the namespaced cascade-matching Rust lift (`crates/obscura-dom/src/selector.rs`,
  `set-selectorText-namespace` 0/5); or sweep another fresh DOM/HTML region —
  core DOM primitives keep paying off.
- **Possible follow-on:** scripts inserted into *any* non-active document (e.g.
  `createHTMLDocument().body.appendChild(scriptEl)`) should also not execute per
  spec (no browsing context). This quest fixes the *clone* path precisely via the
  "already started" flag; a broader "scripting-enabled document" gate on the
  `appendChild` eval is a separate, wider-scoped change if a test demands it.
