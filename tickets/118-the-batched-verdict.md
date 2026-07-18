# Scroll 118 — The Batched Verdict (Quest #118)

**Realm:** `dom/nodes/MutationObserver-childList`, `dom/nodes/MutationObserver-inner-outer`,
`dom/nodes/ParentNode-replaceChildren`, and `domparsing/outerhtml-*` — the
MutationObserver **atomic childList record batching** cap named as the next lead
in #117.

**Result: +20.** Five tests, all → 100%. One root-cause mechanism (Rust
suppress-then-synthesize) plus a missing `outerHTML` setter.

| Test | before → after |
| --- | --- |
| `dom/nodes/MutationObserver-childList.html` | **31 → 38 (100%)** |
| `dom/nodes/MutationObserver-inner-outer.html` | **0 → 3 (100%)** |
| `dom/nodes/ParentNode-replaceChildren.html` | **25 → 29 (100%)** |
| `domparsing/outerhtml-02.html` | **0 → 5 (100%)** |
| `domparsing/outerhtml-01.html` | **0 → 1 (100%)** |

## The gap

Phase 0c makes the **Rust DOM** the authoritative mutation source: each tree
primitive (`append_child` / `insert_before` / `detach`) pushes its own
`MutationRecord`, and the JS observer drains them. That is correct for a single
primitive, but a **compound** DOM operation must, per DOM "queue a tree mutation
record", emit exactly **ONE** childList record for a parent (added ∪ removed) —
not one per primitive. So:

- `textContent = "x"` (replace-all) → we emitted a removal **and** an addition
  record ("expected 1 but got 2").
- inserting a `DocumentFragment` → one record per child, not one for the lot;
  and the **fragment** itself (when observed) must see one removal record for all
  its children.
- `replaceChild` → two records instead of the spec's one combined record; and the
  subtle *internal* replacement (`n.replaceChild(n.lastChild, n.firstChild)`,
  where the new node is already a child) needs **two** records in a specific
  order — the new node's removal from its old position **first** (recorded on the
  old parent), then the combined replace — where we emitted only one ("expected 2
  but got 1").
- `innerHTML` / `replaceChildren` (replace-all) → many records, not one.
- `el.outerHTML = "…"` produced **no** record at all: there was **no setter** —
  assigning to a getter-only accessor was a silent no-op, so the observer never
  fired and the whole `inner-outer` test **timed out**.

## The mechanism — Rust suppress-then-synthesize

`DomTreeInner` gained a `suppress_mutations: u32` **depth counter**. While
`suppress_mutations > 0`, the three childList primitives skip their per-step
record push. A new `record_childlist_mutation(target, added, removed, prev, next)`
pushes the single synthesized record (gated only on recording being on — it *is*
the replacement for the suppressed primitives). Three ops expose it:
`push_suppress_mutations`, `pop_suppress_mutations`, `record_childlist`
(payload packed `added_csv\0removed_csv\0prev\0next`). Attribute/characterData
records are untouched.

In `bootstrap.js`, a `__obscura_batchDepth` counter + `__obscura_enterBatch` /
`__obscura_exitBatch` / `__obscura_recordChildList` helpers let a compound method
open a batch scope. **Only the OUTERMOST scope synthesizes** — so a compound op
nested inside another (e.g. `outerHTML` → `replaceChild` → fragment insert)
collapses to the outer op's single record instead of each level emitting its own.
**Everything is gated on an active observer** (`__mutationObservers.length`): a
page with no observer runs the original fast paths byte-for-byte unchanged — the
key property that kept the held realms (qsa 1975, classlist 1420, the Range
content-ops 1840 each) green.

### Per-method synthesis (all in `bootstrap.js`)
- **`set textContent` (element branch):** suppress the remove-all + append-text
  primitives, synthesize one `{removed: old children, added: [new text]}`.
- **`appendChild` / `insertBefore` fragment branch:** synthesize **two** records
  per DOM "insert" — a removal on the fragment (all its children) and an addition
  on the parent (those children; `previousSibling` = parent's old last child for
  an append, the node before the reference for an insert).
- **`replaceChild` (observed path):** capture the spec's `referenceChild` /
  `previousSibling`; (a) if the new node has a parent, remove it there FIRST,
  **unsuppressed**, so its old parent gets its own record (this is the DOM
  "insert"→adopt removal, and is what makes the *internal replacement* emit its
  first record with the right `previousSibling`); (b) then remove child + insert
  node under one batch and synthesize the single combined record. The unobserved
  fast path is preserved verbatim, and both paths produce the identical tree.
- **`set innerHTML`:** batched **inside the Rust `set_inner_html` op** — capture
  the old children, suppress, detach+import, synthesize one `{removed: old,
  added: new}` (only when recording; otherwise a no-op wrapper).
- **`_pnReplaceChildren` (replace-all):** one record on the parent; a lone node's
  removal from an old parent stays a separate visible record (done before the
  batch); a multi-node fragment's old-parent removals already happened during
  `_convertNodesIntoNode`.
- **`set outerHTML` (NEW):** §dom-element-outerhtml — parse the value with the
  parent element as context and `replaceChild(fragment, this)`, which routes
  through the batched replaceChild for the single record. `[LegacyNullToEmptyString]`:
  `null`→`""`, everything else via ToString (so `outerHTML = undefined` parses
  the text `"undefined"`). Detached element = no-op; document child throws.

## Zero-regression sweep
Held (restored binary): qsa `ParentNode-querySelector-All` 1975, classlist 1420,
Document-createElement 147, Node-properties 726, Node-cloneNode 135,
Node-normalize 4, attributes 67, MutationObserver-attributes 42 / characterData
23 / takeRecords 3 / disconnect 2, Range-surroundContents 1840, Range-insertNode
1840, Range-extractContents 187, Range-deleteContents 125, Range-cloneContents
187, Text-splitText 6, the Range-mutations-{removeChild 20, appendChild 70,
splitText 116, replaceChild 60} node-hooks, DOMParser-parseFromString-html 9/10,
insert-adjacent 4. `domparsing/outerhtml-01/02` STASH-PROVED 0/1 & 0/5 on the
pre-change binary → 1/1 & 5/5 after (the setter was entirely missing). Rust
`obscura-dom` unit tests 40/40.

## Caps / Next
- **`MutationObserver-document.html` 1/4** — observing the document *during* the
  HTML parse (parser-inserted nodes don't fire the observer): a parse-time
  observation gate, a separate mechanism from this batching.
- The MutationObserver realm's childList/innerHTML/replaceChildren/outerHTML tail
  is now **exhausted**. Next-best leads: revisit the `MutationObserver-document`
  parse-time gate, or sweep a fresh DOM/CSS region for the next root-cause
  primitive (CSS `%`→used-px stays layout-capped, #109/#110).
