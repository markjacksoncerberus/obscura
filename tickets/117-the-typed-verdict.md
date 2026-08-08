# ⏎ Quest #516 — The Typed Verdict

> *Nobody clicks the bold button as often as they press Enter.*

**Realm:** `editing/run/{delete,forwarddelete,insertparagraph,insertlinebreak,`
`inserttext,inserthtml,insertimage,inserthorizontalrule,formatblock,indent,`
`outdent,insertorderedlist,insertunorderedlist,justify*}.html`
**Date:** 2026-08-08 · **Status:** ✅ taken

---

## ☀️ Why this one

The inline commands change how text *looks*. These change what the document
*is* — where the paragraphs are, what is a list, and what happens when you press
Backspace at the start of a line.

This is the half of editing a person actually operates. A comment box where the
bold button is broken is annoying. A comment box where **Enter does nothing** is
not a comment box.

---

## ⚒️ The work

Two ideas the inline half did not need:

**A LINE is the unit.** You cannot centre half a paragraph or make half a line a
bullet, so every block command starts by *block-extending* the selection outward
to whole lines. `blockExtend` is the first thing `formatBlock`, `indent`,
`outdent`, the list commands and all four `justify*` commands call.

**Deletion is a MERGE, not a removal.** Deleting the boundary between two
paragraphs has to decide which one survives, move the other's contents into it,
carry the formatting across, and leave the caret somewhere the next keystroke
will go where the user expects. That is why `deleteSelection` is the longest
algorithm in the spec, and why **every insertion command begins by calling it**.

Shipped: `deleteSelection`, `canonicalizeWhitespace` + the canonical space
sequence, the equivalent-point walkers, `fixDisallowedAncestors`,
`normalizeSublists`, `indentNodes`/`outdentNode`, `toggleLists`,
`justifySelection`, `autolink`, and the actions for `delete`, `forwardDelete`,
`insertParagraph`, `insertLineBreak`, `insertText`, `insertHTML`, `insertImage`,
`insertHorizontalRule`, `formatBlock`, `indent`, `outdent`, both list commands
and all four justify commands.

---

## ⭐ Finds worth keeping

> ⭐⭐⭐ **A `<br>` at the very end of a block draws NOTHING.** The line it would
> start does not exist yet, so the caret has nowhere to sit. That is why every
> editor on the web emits *two* `<br>`s for one Enter, and why deleting one of
> them appears to do nothing at all. `insertLineBreak` checks
> `isCollapsedLineBreak` and adds the second — and that check is answered by
> **measuring**: set the style, read `offsetHeight`, restore. The spec defines
> these predicates by their visual effect and gives no structural test, so
> measuring is the honest implementation, not a shortcut. It is only possible at
> all because quest #505 made `offsetHeight` real.

> ⭐⭐⭐ **HTML collapses runs of spaces, so an editor that stores what the user
> typed renders something different from what they see.** The fix since 1996 is
> alternating normal and non-breaking spaces — and the sequence has to be
> *canonical*, or two editors produce different bytes for the same visible text
> and every diff of an edited document is noise.

> ⭐⭐ **`fixDisallowedAncestors` is what stops a document changing shape every
> time it is saved.** An element that ends up somewhere HTML does not allow — a
> `<p>` inside a `<p>`, a `<div>` inside a `<span>` — serializes to one thing and
> re-parses as another. Lifting it out until it is legal is the difference
> between a document that survives a round trip and one that quietly rots.

> ⭐⭐ **Enter on an EMPTY list item ends the list.** That is the second Enter
> everybody uses to stop making bullets, and it is a *specified* behaviour, not a
> convention. Likewise Enter at the end of a **heading** starts a paragraph — no
> one wants the line after the title to be a title — and in `<pre>` Enter is a
> line break rather than a new block, because the whole point of preformatted
> text is that its line structure is its own.

> ⭐⭐ **Two adjacent lists must become one list.** After a delete removes what
> separated them, they read as one list to a person; leaving them as two restarts
> the numbering at 1 in the middle of what looks like a single list.

> ⭐ **Backspace deletes a CHARACTER, not a node.** The walk skips backwards past
> everything the reader cannot see — empty spans, collapsed whitespace,
> extraneous breaks — so one press removes one visible thing. And forwardDelete
> consumes a whole **grapheme**: a combining mark left behind after its base
> character renders as a stray accent on the next letter.

> ⭐ **A table is never partially deleted by a keystroke.** Backspace in front of
> one *selects* it, so destroying it is a second, deliberate decision.

> ⭐ **`insertHTML` parses in CONTEXT** (`createContextualFragment`), so
> `"<td>x</td>"` inserted into a `<tr>` parses as a cell. A plain `innerHTML`
> parse throws the cell away and inserts the bare text.

> ⭐ **`insertHorizontalRule` deletes with block merging OFF**, and `insertImage`
> / `insertText` / `insertLineBreak` delete with **stripWrappers off**. An `<hr>`
> divides, so joining the blocks either side would undo the only thing the
> command is for; and an image dropped into a bold run stays bold because the
> wrappers around the deleted selection are what carried that.

> ⭐ **`formatBlock` accepts both `p` and `<p>`.** The angle brackets are how
> every toolbar built against this API in 2004 spelled it, and refusing them
> breaks pages that are otherwise fine.

---

## ⚠️ The harness find that nearly published a fake table

The first `#516` probe pass came back with **all 43 files at exactly their
pre-arc baselines** — from a binary that scored `bold.html` **3022/3048** when
run by hand thirty seconds later.

The cause: six `obscura-pre` servers from the previous ritual pass had been
orphaned onto ports 9400–9405. The new run's servers each exited with *"Address
already in use"* — and the runner's ready-check `curl` then **succeeded against
the stale server**. Every row was a pre-arc measurement wearing the new run's
name.

> ⭐⭐⭐ **A STALE SERVER ON THE PORT DOES NOT ERROR — IT PRODUCES A COMPLETE,
> PLAUSIBLE, ENTIRELY WRONG TABLE.** That is the worst failure a measurement tool
> can have, and it is the same shape as this campaign's recurring engine lesson
> (*a green row proves the engine agreed with the test, not that it did the
> work*) relocated into the harness. A ready-check that only asks "is something
> answering on this port" is not a ready-check.

`scripts/wpt_batch_par.sh` now has **two** guards: a pre-flight refusal if any
shard port is already serving, and a per-chunk `kill -0` on the server PID so a
server that died on bind is a **FATAL**, not a silent substitution.

---

## 📊 Results

Full realm, 43 files, 96,682 subtests:

| stage | subtests | |
|---|---|---|
| baseline | **7,538 / 96,682** | 7.8% |
| after #514 (read paths) | **77,803 / 96,682** | 80.5% |
| after #515 (inline writes) | **82,962 / 96,682** | 85.8% |
| **after #516 (block writes)** | **94,468 / 96,682** | **97.7%** |

**+86,930 subtests over the arc. All 43 files improved. Zero regressions.**

Rows this quest owns:

| file | baseline | after #516 |
|---|---|---|
| `createlink.html` | 63/441 | **441/441** |
| `inserthorizontalrule.html` | 114/1348 | **1347/1348** |
| `justifyleft.html` | 203/2503 | **2500/2503** |
| `outdent.html` | 181/2550 | **2540/2550** |
| `insertparagraph.html` | 514/7195 | **7088/7195** |
| `justifycenter.html` | 309/6203 | **6137/6203** |
| `formatblock.html` | 473/5046 | **4885/5046** |
| `indent.html` | 148/1329 | **1312/1329** |
| `insertorderedlist.html` | 150/1761 | **1716/1761** |
| `insertunorderedlist.html` | 166/2065 | **2025/2065** |
| `inserttext.html` | 331/3009 | **2860/3009** |
| `delete.html` | 706/7842 | **7633/7842** |
| `forwarddelete.html` | 673/7491 | **7273/7491** |
| `multitest.html` | 660/10092 | **9753/10092** |

### Zero regressions, the strong proof

The 199-file ritual list, run against the **pre-arc binary** and the new one and
diffed **per file**. Both passes: 0 could-not-run, 199 rows. 198 rows identical.

The single moved row was
`the-img-element/naturalWidth-naturalHeight-width-height` (210 → 188) — the file
the campaign memory already flags as flaky under batch load. Re-measured on
**fresh servers**, the pre-arc binary scores **189/258** and the new one
**210/258**: not a regression, an **improvement of 21** that the batch happened to
catch in opposite directions. This is precisely why the per-file diff exists and
why a moved row is investigated rather than reverted.

---

## ⛔ Caps / Next

- **The three biggest files time out before finishing** — `delete.html`
  7633/7842, `forwarddelete.html` 7273/7491, `multitest.html` 9753/10092 all
  report TIMEOUT, and the numbers are *stable* at a 900-second per-test budget
  because what fires is the page's own `<meta name="timeout" content="long">`.
  The engine is correct here and simply too slow: the visibility predicates force
  a reflow per `<br>`, and the layout bridge is not incremental (quest #505's
  named cap). **Making layout incremental would be worth ~600 subtests in this
  realm alone**, and is the largest single follow-up.
- `undo` / `redo` are not implemented (`undo-redo.html` 1/18) — they need an edit
  transaction log, which is a different piece of architecture from anything here.
- The caret-navigation files need real key event handling and hit-testing
  against laid-out line boxes, not just DOM edits.
- `cut` / `copy` / `paste` are declared supported but do nothing: the clipboard
  store is page-local (quest #498's cap) and there is no OS clipboard binding.
- Editing fires **no `input` / `beforeinput` events**. Every modern editor
  listens for them; this is the single most valuable follow-up in the realm.
- `deleteSelection`'s loops carry explicit iteration guards. They should never
  fire on a well-formed document, and they exist because an unbounded loop over
  page-controlled structure is how this campaign has already found two
  browser-wide denials of service.
