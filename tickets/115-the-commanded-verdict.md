# ✍️ Quest #514 — The Commanded Verdict

> *`execCommand() { return false; }` — one line, standing in for the largest
> realm on the Web Platform Tests.*

**Realm:** `editing/run/*` (43 files, 96,682 subtests)
**Date:** 2026-08-08 · **Status:** ✅ taken

---

## ☀️ Why this one

`editing` is **116,600 subtests — the largest realm on all of WPT**, and it had
**zero ledger rows**. It was surveyed and deliberately passed over by the arc
before last, and passed over again by the last one. The standing memory entry
said, in capitals, that it must not be passed over a third time.

It earns that. `document.execCommand` is the engine underneath every rich-text
box on the web: the comment field, the CMS, the webmail composer, the bug
tracker, the school assignment form, the "describe your symptoms" box on a
health service's website. It is a 2001 API that every modern editor still falls
back to, and a great many sites — especially the older, cheaper, less-maintained
ones that people on old hardware are most likely to be using — have no fallback
at all.

Our entire answer was:

```js
execCommand() { return false; }
```

A page asks *"please make this bold"* and is told **no**, with no way to find out
why. An editor that trusts the return value draws a dead toolbar. One that does
not draws a toolbar whose buttons do nothing. Either way the person cannot write.

---

## 🔍 The gap, and the root cause underneath it

`execCommand` returned false. `queryCommandEnabled`, `queryCommandIndeterm`,
`queryCommandState`, `queryCommandSupported` and `queryCommandValue` **did not
exist at all** — five methods, absent, so feature detection could not even
discover that the feature was missing.

But the first thing the spec asks turned out to be a question the engine could
not answer, and *that* is the find of this quest.

### ⚠️⚠️ `getComputedStyle(anything).display` was `"block"`. Every element.

The editing spec's very first predicate is:

> *"A block node is either an Element whose `display` is not `inline`,
> `inline-block`, `inline-table` or `none`, or a Document, or a
> DocumentFragment."*

Asked this about a `<span>`, a `<b>`, an `<a>`, a `<sub>` — about **every element
on every page** — the engine answered `block`. There were no inline nodes
anywhere in any document. Not one algorithm below could have worked.

The cause was a single table entry:

```js
const _GCS_DEFAULTS = {
  display: 'block', …          // ← the INITIAL value
```

CSS's initial `display` is **`inline`**. `block` is a **UA stylesheet rule**. The
defaults table doubles as the initial-values table, and somebody reasonably wrote
down the value most elements end up with — but "most elements" is not "all
elements", and the difference is precisely the inline ones.

The same gap ran much wider than `display`. `<b>` computed `font-weight: 400`.
`<i>` computed `font-style: normal`. `<u>` computed `text-decoration: none`.
**An element whose entire purpose is to carry one declaration reported that it
did not carry it.** And `<font color=red>` — which is what `execCommand` itself
writes — computed black, so the engine could not read back formatting it had
applied one line earlier.

> ⭐⭐⭐ **A DEFAULTS TABLE IS NOT A STYLESHEET.** The initial value is what a
> property has when *nothing* says otherwise; the UA stylesheet is one of the
> things that says otherwise. Collapsing the two makes the common case right and
> the interesting case impossible — and the interesting case is every inline
> element on the web.

---

## ⚒️ The work

### A real UA stylesheet (`// ===== UA-STYLESHEET-BEGIN/END =====`)

HTML §15 "Rendering", as a **table** rather than as CSS text: every rule is a
bare type selector, so matching is one map lookup on the local name and the
selector engine is never involved.

- `_UA_DISPLAY` — the full display table (block / list-item / the seven table
  displays / inline-block / `none` for metadata content / inline for everything
  else).
- `_UA_DECLS` — the typographic declarations: `b,strong,h1–h6,th` → bold;
  `i,cite,em,var,address,dfn` → italic; `u,ins` → underline; `s,strike,del` →
  line-through; `sub`/`sup` → vertical-align + smaller; heading sizes;
  `pre,code,kbd,samp,tt` → monospace; `center`/`th` → centred; `mark` → yellow.
- `_UA_LINK_DECLS` — the one rule that is not a bare type selector, because a
  link's blue-and-underlined is the most load-bearing default on the web and the
  editing spec reads exactly those two properties off an `<a>` ancestor.

It is wired into the cascade at `spec: 0, order: -2` — **below** presentational
hints (order −1) and below every author rule, so any author declaration wins and
no UA rule can ever beat one. That is what an origin *is*.

> ⭐ **`text-decoration` does not inherit, and that is deliberate.** A `<span>`
> inside a `<u>` computes `none` and is still drawn underlined, because
> decoration propagates to the *line box*, not to the computed style. Every
> algorithm that wants "is this text underlined" walks the ancestors itself —
> which is exactly what the editing spec does.

### Presentational hints the spec reads by name

`<font color>` / `<font face>` joined `<font size>`; plus `align`, `bgcolor` and
`<body text>`. These needed HTML's **"rules for parsing a legacy colour value"**,
which did not exist in the engine — famously permissive by design, because it
exists to render the old web where colours were typed by hand and often typed
wrong. `chucknorris` really is a colour, and it is `rgb(192, 0, 0)`.

> ⭐ **Refusing a malformed colour is worse than guessing at it.** The algorithm
> rejects exactly two things (`transparent`, and the empty string) because an
> invisible `<body text>` is a page with no text at all. Everything else gets
> padded to a multiple of three and read as hex. A typo should cost you a hue,
> not the page.

### The editing engine's foundation (`// ===== EDITING-ENGINE-BEGIN =====`)

~1,200 lines: the tree-walking primitives, editable-ness and editing hosts, the
containment and **effective containment** predicates, the visibility layer
(collapsed whitespace, extraneous line breaks), block boundary points and
`blockExtend`, the content model (`_edIsAllowedChild`), colour and legacy
font-size normalization, the state/value override machinery, `_edEffectiveValue`
/ `_edSpecifiedValue`, the command table, and all five methods on
`Document.prototype`.

**Quest #514 ships every READ path and the four always-enabled miscellaneous
commands.** The write paths are #515 and #516. That order is deliberate: roughly
two-thirds of what these tests assert is what the engine *believes* about a
document it has not touched, and **an engine that cannot read formatting
correctly cannot possibly write it.**

---

## 📊 Results

Full realm, 43 files, before → after quest #514:

| | subtests |
|---|---|
| before | **7,538 / 96,682** (7.8%) |
| after | **77,803 / 96,682** (80.5%) |

**+70,265 subtests. Every one of the 43 files improved. Zero could-not-run.**

Selected rows:

| file | before | after |
|---|---|---|
| `misc.html` | 102/423 | **422/423** |
| `bold.html` | 236/3048 | 2435/3048 |
| `delete.html` | 706/7842 | 6489/7842 |
| `insertparagraph.html` | 514/7195 | 6165/7195 |
| `formatblock.html` | 473/5046 | 4077/5046 |
| `justifycenter.html` | 309/6203 | 5126/6203 |
| `multitest.html` | 660/10092 | 7223/10092 |

The remaining failures at this point were checked by hand and are exactly the
right ones: `execCommand` return values, `compare innerHTML`, and the *after*
queries — i.e. everything that needs the document to actually change. The
*before* queries pass. That is an honest 80%, not a scenery 80%.

---

## ⛔ Caps / Next

- The write paths are not here — that is quests **#515** (inline) and **#516**
  (block, insertion, deletion).
- The UA stylesheet deliberately ships **no margins, paddings or borders**. Those
  are box geometry, the Rust renderer has its own UA sheet for them, and a margin
  invented in the JS realm would disagree with the one laid out in Blitz. A
  computed style that contradicts the layout is worse than one that admits it
  does not know.
- `font-family` has no UA default, so `queryCommandValue("fontName")` on
  unstyled text answers `""` where a real browser names its default font.
- `_edIsExtraneousLineBreak` / `_edIsCollapsedLineBreak` answer by **measuring**
  — they set a style, read `offsetHeight`, and restore. That is honest (the spec
  defines them by their visual effect and there is no structural test) but it
  costs a reflow per `<br>`, and the layout bridge is not incremental.
