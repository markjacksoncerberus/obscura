# 🖊️ The Intended Verdict — Quest #517: `input-events`

> *`InputEvent` was a complete, correct, fully-built interface. A constructor,
> four attributes, `getTargetRanges()`, a place in the IDL harness. Nothing in the
> entire browser ever dispatched one.*

**Realm:** `input-events` (26 files, zero ledger rows before this quest)
**Probe:** `scripts/wpt-input-events-probe.txt` (33 entries — four files carry
`<meta name="variant">` and are expanded)
**Result: 180/3240 → 1805/2978. 17 files improved.**

---

## The gap

Quest #516 taught this engine to **edit**. Nothing told the page.

Every rich editor written since about 2018 — ProseMirror, Slate, Quill, Lexical,
CKEditor 5, TinyMCE 6, and the comment box on most forums, CMSes and school
portals — is a `beforeinput` listener over a `contenteditable`. The editor lets
the UA describe the edit it is *about* to perform, then either allows it or
cancels it and does its own instead. Told nothing, those editors do nothing at
all: the box takes focus, the caret blinks, and every keystroke vanishes.

That is not a degraded experience. It is a dead one — and it lands hardest on the
older, cheaper, less-maintained sites, because those are the ones that cannot
afford to rewrite their editor every two years.

Worse, **a keystroke inside a `contenteditable` did nothing whatsoever.** The
engine dispatched `keydown` and `keyup` faithfully and then stopped, because the
UA half — the *default action* of a key inside an editing host — had never been
written. A page could hear the key and could not see the letter, which is worse
than either alone: an editor that implements its own handling worked, and one
that relied on the browser got an empty box that looked like it was working.

---

## The work

New block in `bootstrap.js` between `// ===== INPUT-EVENTS-BEGIN/END =====`.

**The two events, and why the split is the whole design.**
`beforeinput` fires **before** the change, is **cancelable**, and carries
`getTargetRanges()` — the ranges the edit is about to replace. That is the
editor's veto, and the ranges are what it needs in order to implement the edit
itself instead. `input` fires **after**, is **not** cancelable, and its
`getTargetRanges()` is **empty** — not an oversight: the ranges it would describe
have already stopped existing.

The ranges are `StaticRange`s, and that is load-bearing too — a live `Range`
would be moved by the very edit the handler is being warned about, so by the time
the handler looked at it, it would be describing the aftermath.

**What landed:**

- The command → `inputType` table, wired into `execCommand`. ⭐ **`execCommand`
  fires `input` and NEVER `beforeinput`** — not an omission: `beforeinput` exists
  so a page can *veto* input, and this edit **is** the page. There is nobody for
  it to ask.
- `data` reported as the engine understood it (`#FF0000` → `rgb(255, 0, 0)`),
  except when it understood nothing, in which case it comes back verbatim rather
  than as a guess.
- **The keyboard's default action inside an editing host** — Enter, Shift+Enter,
  Backspace, Delete, and every printable character — installed as a bubble-phase
  `document` listener so it runs *after* every page handler, which is what makes
  `preventDefault()` in a page handler actually prevent the edit.
- The same two events from `<input>` and `<textarea>`, over a value string and a
  caret, because a page listening for `input` on a form field must not have to
  care which kind of box it is watching.
- **`DataTransfer` / `DataTransferItem` / `DataTransferItemList`** — listed in the
  engine's own worker-exposure table as window-only (i.e. the engine already
  claimed to have them) and never actually defined, so `new DataTransfer()` threw.
  Needed here because an `insertFromPaste` event carries what was pasted, and a
  page that cannot read that cannot implement paste sanitisation.
- **`cut` / `copy` / `paste` became real**, against quest #498's page-local
  clipboard. `paste` inserts **plain text deliberately**: re-parsing stored markup
  into an editable region is the exact shape of a self-XSS.

---

## ⭐⭐⭐ The finds

**A FOCUSED EDITABLE BOX ALWAYS HAS A CARET, AND OURS DID NOT.** `execCommand`
failed for five whole families of commands for a reason that had nothing to do
with any of them: `element.focus()` on a `contenteditable` left the document with
**no selection at all**, and every editing command is defined over the selection.
The box had focus, looked ready, and refused every command in silence. Worse, an
`innerHTML` write leaves the Selection holding a range into a *detached* subtree —
`rangeCount` is still 1 and every boundary point in it is meaningless. Both shapes
now recover.

**⚠️ AND THE FIX HAD TO GO IN THE RIGHT PLACE.** The first version put the
detached-node check inside `_edActiveRange`. `isConnected` walks `parentNode` to
the root and **every hop is a round trip into the Rust DOM**, while
`_edActiveRange` is called hundreds of times inside a single editing command — the
two largest files in the realm went from OK to TIMEOUT. It belongs where a *user
action* begins: once per keystroke, once per `execCommand`. **A correctness fix in
a hot path is a performance bug wearing a correctness fix's clothes.**

**⚠️⚠️ THE CDP KEY PATH WAS DOING ITS OWN, WRONG, EDITING.**
`crates/obscura-cdp/src/domains/input.rs` appended `text` to the **end** of an
`<input>`/`<textarea>`'s value and made Backspace chop the **last** character off —
both ignoring the caret and any selection entirely. So an agent driving Obscura to
fill in a form typed at the end of the field no matter where the caret was, and
every correction deleted the wrong character. It fired a bare `Event('input')`, so
`e.inputType` was `undefined` and `e instanceof InputEvent` was false; it fired
even when the page had `preventDefault()`ed the keydown; and it did nothing at all
inside a `contenteditable`. All of it is deleted: the key is now dispatched
trusted and the engine's own default action does the work. **One implementation,
so a key means the same thing however it arrived.**

**⭐⭐ THE TARGET RANGE OF A DELETION IS NOT ALWAYS A CHARACTER.** Three shapes,
and the third is the one everybody forgets: a *selection* (itself, verbatim); a
*character* (one code point, with combining marks and surrogate halves travelling
with the character they belong to); and a **block boundary** — the empty span
between the end of one block and the start of the next. Nothing is inside it.
Deleting it is a **merge**, and the range says so by being empty of content while
spanning two different parents.

**⭐⭐ DELETING THE LAST CHARACTER OF A WRAPPER DELETES THE WRAPPER.**
`<span>b</span>` with the `b` gone is not an empty span the reader can see — it is
nothing, and leaving it behind is how a document accumulates a thousand empty tags
over a week of editing. So the target range grows outward over every inline
ancestor the deletion would empty. ⭐ The **end** is grown first and the **start**
measured against the grown end, because each step of the start's growth asks "is
the rest of this element inside the range?" — and after the end has moved, more of
it is. Getting that order backwards costs half the file.

**⭐⭐ A SELECTION IS NOT ALWAYS ONE TARGET RANGE.** Drag across a widget the
author marked `contenteditable="false"` — an embedded map, a mention chip, a
signature block — and the selection spans it, but the deletion **cannot**: that
island is not yours to remove. What is about to be deleted is the editable text on
either side, which is **two ranges with a hole in the middle**. And the input type
becomes `deleteContent`, **without a direction**: the direction of a Backspace
describes where the caret was going, and once the deletion is "these islands,
wherever they are", there is no direction left to describe.

**⭐ A MODIFIER ONLY CHANGES GRANULARITY WHEN NOTHING IS SELECTED.**
Ctrl+Backspace means "delete the word behind the caret" — but if text is already
selected, the selection has said exactly what to delete and there is no word to
reach for.

**⭐ `input` MEANS THE DOCUMENT CHANGED, SO THE ONLY HONEST TEST IS TO LOOK.** A
command's return value says "I ran", not "I altered something" — Backspace at a
boundary runs the whole algorithm and correctly does nothing. A page told its
content changed will re-serialise, re-validate, mark itself dirty and enable its
Save button over a keystroke that moved not one character. But a **deletion key
with nothing to delete still announces itself**: `beforeinput` fires carrying the
*collapsed* caret, which says precisely "this is where you are and there is
nothing behind you".

**⚠️ `_edPreviousNode` ALREADY DESCENDS.** It is "the previous node in tree
order", not "the previous sibling". Descending again after calling it walks
straight back to where you started — a loop that terminates only on its guard and
reports "there is nothing before this caret" for the single most common case
there is: the start of a paragraph with another paragraph above it. That one line
was worth ~60 subtests.

---

## Results

| file | before | after |
|---|---|---|
| `input-events-exec-command.html` | 123/195 | **290/305** |
| `input-events-delete-selection.html` | 0/6 | **6/6** |
| `…get-target-ranges-during-and-after-dispatch` | 0/3 | **3/3** |
| `…get-target-ranges-backspace.tentative` | 16/161 | **99/161** |
| `…get-target-ranges-forwarddelete.tentative` | 20/176 | **74/158** |
| `…joining-dl-elements?Backspace` | 0/440 | **177/340** |
| `…joining-dl-elements?Delete` | 0/440 | **195/338** |
| `…joining-dl-element-and-another-list?Backspace` | 0/144 | **100/144** |
| `…joining-dl-element-and-another-list?Delete` | 0/152 | **128/152** |
| `…deleting-in-list-items?Backspace,ul` | 0/316 | **151/286** |
| `…deleting-in-list-items?Backspace,ol` | 0/316 | **148/284** |
| `…deleting-in-list-items?Delete,ul` | 0/316 | **128/269** |
| `…deleting-in-list-items?Delete,ol` | 0/316 | **132/273** |
| `…non-collapsed-selection?Backspace` | 1/70 | **52/70** |
| `…non-collapsed-selection?Delete` | 1/70 | **52/70** |
| `…non-collapsed-selection?TypingA` | 1/70 | **49/70** |
| `input-events-typing.html` | 0/13 | **4/13** |

**Total 180/3240 → 1805/2978.**

⚠️ **The denominator FALLS where a file now times out mid-run** — because the
engine is now doing real work per keystroke instead of none. Those files
previously "completed" by doing nothing at all.

### The one moved row, honestly

`…deleting-range-across-editing-host-boundaries.tentative.html` went **5/5 → 4/5.**

It was 5/5 **because the engine did nothing.** With no `beforeinput` fired and no
deletion performed, the editor's `innerHTML` matched the file's
`kNothingDeletedCase` branch, whose assertions are `assert_true(true)` and
"no `input` event was fired" — five free greens for not implementing the feature.
Four of the five now pass on the real behaviour. The fifth encodes a
Gecko-specific answer on a case **the WPT file's own comment says is not
specified**: *"The behavior should be defined by editing API.
https://github.com/w3c/editing/issues/283"*. It is not chased.

---

## ⛔ Caps / Next

- **The three biggest files still TIME OUT**, and now for a *better* reason than
  before: each keystroke costs ~7 ms because the editing visibility predicates
  force a reflow and **layout is still not incremental** (quest #505's named cap,
  re-confirmed here by direct measurement — `innerHTML` reads cost 0.02 ms, the
  edit algorithm costs the rest). **This is now the second arc to name incremental
  layout as its largest single follow-up.**
- **`undo` / `redo` fire nothing.** Chrome fires `beforeinput`+`input` with
  `historyUndo`/`historyRedo` even with an empty history; we decline to, because
  firing `input` when nothing changed is the lie this quest exists to stop. Needs
  an edit transaction log (quest #516's cap).
- **`test_driver.click` on an inline element fails** with "element click
  intercepted error" — testdriver checks `elementFromPoint(centre) === element`,
  and our hit testing does not resolve inline boxes (issue #63 / the Blitz cap).
  Four subtests in `input-events-typing.html`.
- **⚠️ `scripts/wpt_run.py` does not expand `<meta name="variant">`.** Four files
  here carry variants and *throw* `"Unhandled variant"` without the query string —
  scoring 0 for a reason that has nothing to do with the engine. The expansion is
  written out by hand in the probe list. **Teaching the runner to expand variants
  is a cheap, realm-wide win for whoever comes next** — but it will change what a
  "file" means in the ledger, so it wants its own measured pass.
- Composition events (`isComposing`, `insertCompositionText`) are not modelled;
  `beforeinput` from drag-and-drop is not either.
