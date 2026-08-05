# 📜 The Selected Verdict — Quest #466

> *The frontier survey put `selection` at 6.0% on six files and moved on. It was
> the largest winnable block left on the map, and nobody had counted it.*

**Realm:** `selection/*` — the Selection API (frontier quest **F4**, first of three).
**Date:** 2026-08-05 · **Branch:** `engine-per-page-threads`

---

## The gap

`getSelection()` returned an **object literal**. Not a `Selection` — a bag:

```js
globalThis.getSelection = function getSelection() {
  return {
    rangeCount: 0, anchorNode: null, anchorOffset: 0, /* … */
    addRange(range) { this.rangeCount = 1; this._range = range; },
    collapse(node, offset) { this.anchorNode = node; /* …and never a range */ },
    selectAllChildren(node) {},        // ← literally nothing
    containsNode(node) { return false; },
    toString() { return ''; },
  };
};
```

A **fresh one on every call**, so `getSelection() === getSelection()` was false and
any page that stashed the selection was holding a corpse. `Selection` the global
existed separately, as a *different* stub, so `getSelection() instanceof Selection`
was false too. `collapse()` moved the anchor and left the focus behind. There was
no direction, so a backwards selection was indistinguishable from a forwards one.
`toString()` returned `''` — the empty string — which is what every
"copy the selected text" button on the web reads.

### The measured scale, and why the survey missed it

The survey sampled six files and recorded **24/403**. Chrome's own run summary
says the realm holds **34,349 scoreable subtests** across 98 files — `collapse-30.html`
alone is **5,133**. The combinatorial files (`collapse-NN`, `addRange-NN`,
`extend-NN`, `selectAllChildren`) are 97% of the realm's weight and not one of
them was on the survey list.

**Method worth reusing:** Chrome's run summary (`wpt.fyi/api/runs?product=chrome`
→ `results_url`) lists every WPT path with pass/total. Filtering it to
`selection/` with ≥2 subtests produces both a can't-404 file list *and* a Chrome
baseline per file, in one request. That list is committed at
[`scripts/wpt-selection-probe.txt`](../scripts/wpt-selection-probe.txt).

---

## The work

All of it in `crates/obscura-js/js/bootstrap.js`, on top of the **real live `Range`**
that was already there (the `dom/ranges` work paid for itself here).

### A selection is one range plus a DIRECTION

That pairing is the whole interface. `anchor` is the end you started from, `focus`
is the end that moves — so **which of the range's two boundary points each name
refers to FLIPS when the direction does**. Selecting "abc" left-to-right and
right-to-left yields the same range and opposite anchors, and that is precisely
what lets shift+arrow keep growing a selection *from the end you began at*.

### The range is held by IDENTITY, never copied

`getRangeAt(0)` returns the very object `addRange()` was given. Mutating either
mutates the other, and WPT asserts it from both sides. Page code depends on this:
find-in-page highlights a match, then walks the *same* Range forward to the next
one. A copy here fails silently and forever.

### The ordering asymmetry that is real, not a typo

`collapse()` validates the node and offset **before** it gives up on a node outside
the document. `extend()` gives up **first** and validates **second**. Both halves
are separately asserted, so a single "validate then check root" helper fails one
of them whichever order you pick. It reads like an inconsistency in the spec; it
is one, and it is normative.

### selectAllChildren counts CHILDREN, not length

`selectAllChildren(textNode)` selects its **zero children**, not its eight
characters — `node's length` and `number of children` diverge on exactly the node
type you would reach for first.

### The WebIDL shape, which an ES `class` gives you none of

`idlharness` went 37/112 → 80 → 98 → **112/112** across three passes, and every
step was the same lesson in a different costume:

| WebIDL requires | ES `class` gives |
|---|---|
| interface object is a **non-enumerable** global | `globalThis.X = …` is enumerable |
| members are **enumerable** own props of the prototype | class members are non-enumerable |
| every member **brand-throws `TypeError`** on a foreign `this` | `collapseToStart.call({})` threw `InvalidStateError` — the body's error, from the wrong object |
| `length` counts **required** args only | `collapse(node, offset)` reports 2, spec says 1 |
| `@@toStringTag` is a **data property** | `get [Symbol.toStringTag]()` is an accessor |

The brand-check one is the one with teeth outside the test suite: without it,
`Selection.prototype.collapseToStart.call(somethingElse)` reports a *plausible
domain error* instead of "you called this on the wrong object", and a page
debugging that chases the wrong bug.

### selectionchange, in both of its places

A **document's** selection announces itself at the document. A **text control's**
selection announces itself **at the element, bubbling** — a form field's selection
is its own, separate from the page's. Both are deliberately **asynchronous and
coalesced to one per task**, so a routine that sets `selectionStart` then
`selectionEnd`, or rewrites `value` and re-selects, produces ONE notification
describing where things ended up rather than a burst describing every
intermediate state. `_setSelRange` was already the single choke point, so the
text-control half is six lines.

### Also added

- **`StaticRange` / `AbstractRange`** (neither existed). A StaticRange does *not*
  move when the tree under it does — the right shape for reporting "where this
  was", where a live Range would silently drift out from under the reader.
  `getComposedRanges()` returns them.
- **`onselectionchange` / `onselectstart`** to the GlobalEventHandlers set.
- **`Selection.modify()`** for `character` granularity, honestly limited: `line`
  and `paragraph` need real line boxes and `word` needs locale segmentation, so
  those leave the selection where it is rather than move it somewhere plausible
  and wrong.
- **`document.getSelection()` returns `null`** when `defaultView` is null. A
  `DOMParser`/`createHTMLDocument`/XML document has no selection *at all* — not
  an empty one. That is the difference between "nothing is selected" and "there
  is nowhere to select".

---

## Results

**Controlled before/after** — the same 18-file probe, same server, the change
stashed and rebuilt for the baseline:

| | subtests |
|---|---|
| before (stashed build) | **3,170 / 22,342 (14.2%)** |
| after | **22,110 / 22,110 (100%)** |

*(The totals differ because the old build produced 464 subtests in `addRange-08`
where the spec produces 232: the stub let the "second addRange must do nothing"
half run when it must not. Our subtest counts now match Chrome's exactly, file
for file.)*

**Whole realm**, all 98 scoreable files:

| | subtests | files at 100% |
|---|---|---|
| survey (6 files, 2026-08-02) | 24 / 403 (6.0%) | — |
| **now** | **33,919 / 34,349 (98.75%)** | **52 / 98** |
| Chrome on the identical files | 34,292 / 34,349 (99.83%) | — |

Selected rows:

| file | before | after |
|---|---|---|
| `collapse-30.html` | 29/5133 | **5133/5133** |
| `collapse-00 / -15 / -45` | 15/2655 each | **2655/2655** each |
| `extend-20.html` | 0/2376 | **2376/2376** |
| `selectAllChildren.html` | 1652/2242 | **2242/2242** |
| `extend-00.html` | 0/2024 | **2024/2024** |
| `addRange-00.html` | 1392/1624 | **1624/1624** |
| `idlharness.window.html` | 37/112 | **112/112** |
| `setBaseAndExtent.html` | 2/120 | **120/120** |
| `removeAllRanges.html` | 2/116 | **116/116** |
| `collapseToStartEnd.html` | 0/57 | **57/57** |
| `textcontrols/selectionchange.html` | 16/60 | **60/60** |
| `textcontrols/selectionchange-bubble.html` | 0/4 TIMEOUT | **4/4** |
| `onselectstart-on-key-in-contenteditable` ×2 | — | **30/30** each (Chrome: 25/30, 23/30 — **ahead**) |

**Zero-regression sweep:** the 54-file ritual, run on the stashed build and the
new one at identical settings. Output **byte-identical**: **9,727 / 9,832** both
times.

> ⚠️ **The quest board recorded the ritual at 9227/9331. The real current figure
> is 9727/9832** — the list grew during quest #465 and the note was not refreshed.
> Corrected here; the *proof* of zero regressions is the before/after diff, not
> the absolute number.

---

## Caps, named honestly

Everything below needs a capability we do not have; none of it is a Selection bug.

- **`modify()` beyond `character` granularity** — `bidi/modify*`, `contenteditable/modify*`,
  `modify-line-*`, `move-by-word-*`, `caret/*`, `caret-position-should-be-correct-while-moveup-movedown`
  (~140 subtests). Word segmentation is locale data; line and paragraph movement
  needs real **line boxes**. This is the layout blind spot (**F7**) wearing a
  different hat.
- **`contenteditable/initial-selection-on-focus.tentative`** (1/100, 1/51 — 149
  subtests): where the caret lands when an editing host takes focus. Needs a real
  editing-host model.
- **`shadow-dom/tentative/Selection-getComposedRanges*`** (~36 subtests): the
  selection is not retargeted across shadow boundaries here, so composed ranges
  are the light-DOM truth. Correct-shaped, not shadow-aware.
- **`stringifier_editable_element.tentative.html` TIMEOUTs at 1/12** — worth a
  look before assuming it is a cap; it is the only remaining timeout in the realm.
- `user-select` / `toString-user-select-none` / `drag-selection-*` need `user-select`
  honoured in the selection algorithms, which needs layout.

---

## ⭐ Next

1. **The rest of F4** — `uievents` and `pointerevents`, which is what this quest
   was drawn for. Selection is how an agent knows *what it grabbed*; those are how
   it grabs.
2. **Banked, unchanged from #465:** make the HTTP response-header parse **lenient**
   (58 of the remaining 104 `cookies` failures, and off-suite a failed fetch
   instead of a page); **put storage on disk**; `Response.clone()` must **tee**;
   `FormData` cannot hold a `File`.
3. **`selection` itself is done** to the layout boundary. Do not come back here
   for the last 430 without a line-box model — that is quest **F7**, and it would
   pay out across `css/` far more than here.
