# 🅱️ Quest #515 — The Styled Verdict

> *Twelve commands, one algorithm — and the step everybody skips is the one that
> stops un-bolding a word from un-bolding the paragraph.*

**Realm:** `editing/run/{bold,italic,underline,strikethrough,subscript,`
`superscript,fontname,fontsize,forecolor,backcolor,hilitecolor,createlink,`
`unlink,removeformat}.html`
**Date:** 2026-08-08 · **Status:** ✅ taken

---

## ☀️ Why this one

Quest #514 taught the engine to *read* a document's formatting. This one teaches
it to *change* it — the twelve commands a toolbar actually has buttons for.

The thing worth saying out loud is what these algorithms are protecting against.
Naive answers to "make this bold" all work on the first keystroke and all rot:

- Wrap the selection in a `<b>` every time and a paragraph a person edited for
  ten minutes becomes tens of kilobytes of nested wrappers. That is the classic
  *"why is this email 2 MB"* bug — and on a metered connection it is somebody's
  money.
- Skip the push-down step and **un-bolding one word silently un-bolds the whole
  sentence it lives in**, which is the kind of bug a person notices only after
  they have hit Save.

Getting this right is not pedantry. It is the difference between a text box that
degrades and one that does not.

---

## ⚒️ The work

All twelve commands funnel into **one** algorithm, *set the selection's value*.
They differ only in the value they ask for. Its four steps, none of them
guessable:

| step | what it does | what breaks without it |
|---|---|---|
| **CLEAR** | strip the formatting the selected elements declare themselves | the old value fights the new one |
| **PUSH DOWN** | take formatting the selection *inherits* and move it onto the ancestor's **other** children | un-bolding one word un-bolds the paragraph |
| **FORCE** | wrap in the smallest element that carries the value, **merging into an adjacent one that already does** | unbounded wrapper growth |
| **REORDER** | keep nested wrappers in a canonical order | `<b><i>` and `<i><b>` compare unequal and never merge |

Plus the supporting machinery: `_edMovePreservingRanges`, `_edSetTagName`,
`_edWrap`, `_edSplitParent`, `_edClearValue`, `_edPushDownValues`,
`_edForceValue`, `_edRecordValues` / `_edRestoreValues`, the modifiable-element
predicates, and the override record/restore pair.

---

## ⭐ Finds worth keeping

> ⭐⭐⭐ **"Modifiable" is a permission, not a shape.** An element is only
> rewritable by these algorithms if it exists *solely* to carry formatting. One
> with an `id`, a `class` or a handler is **not** modifiable — the page is using
> it for something, and quietly dissolving it breaks a script that was there
> first. "Simple modifiable" is stricter still: it carries exactly one piece of
> formatting, so unwrapping loses exactly that one thing. Everything the engine
> is allowed to destroy is gated on those two predicates.

> ⭐⭐ **The DOM's range mutation rules are wrong for an editor — on purpose.**
> Moving a node moves boundary points *out of the way*, which is right for an
> observer and exactly wrong for a caret, which has to follow the text it is on.
> So `_edMovePreservingRanges` captures the endpoints, transforms them by hand,
> and puts them back. Every single move in the engine goes through it; one that
> did not would drop the user's cursor on the floor mid-command.

> ⭐⭐ **An override is the memory of a formatting choice made with nothing
> selected.** Press Bold with a bare caret and then type: the bold has to survive
> until you type, and die the instant the caret moves — or the next word you type
> three paragraphs away comes out bold for no reason the reader can see. It is
> the only part of editing that stores an *intention* rather than acting on one.
> `backColor` and `hiliteColor` share one override, because they are two names
> for one command and always have been.

> ⭐⭐ **Read the state BEFORE the first edit.** Every toggle is "read state, then
> set the opposite". Computing the state after the first mutation reads a
> document that is already half-changed, and the toggle latches.

> ⭐ **`<b>` beats `<span style="font-weight:bold">` when the CSS styling flag is
> off** — smaller on the wire, and what every legacy consumer of this API expects
> to read back. `styleWithCSS` and `useCSS` are the same switch wired backwards
> from each other, which is a genuine trap: passing `"false"` to one is passing
> `"true"` to the other.

> ⭐ **Nested `<a>` cannot be expressed in HTML**, so `createLink` inside an
> existing link turns the ancestor into a `<span>`. Losing the outer href is the
> lesser evil against a DOM that cannot survive being serialized and re-parsed.

> ⭐ **`text-decoration` is a list.** Removing underline from
> `"underline line-through"` must remove the *word*, not the declaration.

---

## 📊 Results

Full realm, 43 files, 96,682 subtests: **77,803 → 82,962 (+5,159).**

The files this quest is wholly responsible for:

| file | baseline | after #514 | after #515 |
|---|---|---|---|
| `removeformat.html` | 172/1832 | 1565/1832 | **1831/1832** |
| `bold.html` | 236/3048 | 2435/3048 | **3022/3048** |
| `italic.html` | 141/2073 | 1626/2073 | **2018/2073** |
| `strikethrough.html` | 162/2147 | 1721/2147 | **2018/2147** |
| `superscript.html` | 91/1273 | 1000/1273 | **1260/1273** |
| `misc.html` | 102/423 | 422/423 | **422/423** |

Note that the realm-wide gain looks modest next to #514's because most of these
files' *query* subtests were already green — what #515 adds is the third of each
test that asks whether the document actually changed, and it adds it to a dozen
files rather than to all 43.

---

## ⛔ Caps / Next

- `fontName` values are compared as strings, so `Arial` and `arial, sans-serif`
  are different fonts to the engine. The spec says the same; real browsers
  disagree with each other here.
- The colour commands accept anything the CSS colour parser accepts plus the
  legacy hex-without-`#` form. `currentColor` is deliberately refused (it has no
  fixed value to store).
- Block commands, insertion and deletion are quest **#516**.
