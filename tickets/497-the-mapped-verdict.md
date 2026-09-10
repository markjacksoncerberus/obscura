# ⚔️ Scroll 497 — The Mapped Verdict

> **Quests #680–#697 · 2026-09-10 · `html-aam/` + `accname/` + `wai-aria/`**
>
> **`html-aam/` 736/888 → 885/888** (35 files; 20 files up, 0 down)
> **`accname/name/comp_name_from_content.html` 49/79 → 67/79**
> Everything else in the accname/wai-aria realm held at 100%.

---

## Why this region, and why now

The frontier survey's realms are almost all taken. The outgoing knight's ⭐ list
pointed at the **paint path for `position: sticky`** and at **iframe layout in the
parent realm** — both real, both still worth doing, and both renderer work with
little scoreboard behind them.

So the region was chosen by **measuring first**. `html-aam/` had never had a
ledger row of its own: it was picked up incidentally by the accessible arc
(quests #454–#456, which built `computedRole`/`computedLabel`) and never
measured as a realm. A cold baseline said **736/888 across 35 files, zero
could-not-run** — 152 real, reachable subtests, no harness work needed, and the
infrastructure (`test_driver.get_computed_role` / `get_computed_label`) already
wired up.

And it is the most on-mission ground left on the map. `html-aam` is the mapping
from **an HTML element to what it IS** — the table that lets a screen reader say
"button, Submit" instead of "clickable", and the same table an AI agent uses to
find the button it was told to press. Obscura is a browser agents drive. A
browser that cannot say what its own elements are is a browser an agent has to
guess at.

---

## What was wrong — eighteen findings

### The name computation

**#680 — ⭐ Naming was PROHIBITED where it should only have been discouraged.**
`<b aria-label="…">`, `<code>`, `<em>`, `<i>`, `<q>`, `<s>`, `<span>`, `<sub>`,
`<sup>`, `<u>`, `<bdi>`, `<bdo>` — every phrasing element — **ignored its own
`aria-label` and `aria-labelledby` and fell through to `title`.** The code had a
`_NAME_PROHIBITED` set (ARIA's "Name From: prohibited" roles) and used it to skip
steps 2B/2D/2E of the computation.

That is a misreading of what the prohibition is for. ARIA says an assistive
technology **SHOULD NOT ANNOUNCE** a name for these roles — they are prose, not
controls. It does not say the name fails to compute. `computedLabel` is the
*computation*; the decision whether to speak it belongs to the consumer. An
author who writes `<code aria-label="the verbose flag">-v</code>` is owed the
answer they asked for. **46 subtests** in one deletion.

**#681 — ⭐⭐ The root of a computation was hidden from itself.** Two elements are
`display:none` in every UA stylesheet on earth — **`<area>` and `<rp>`** — and
`_computedLabel` opened with "if this element is hidden it has no name to give",
so both returned `""` for every name source they had.

For `<area>` that is the whole element: the areas of an image map **are** the
links on the picture, and an agent handed a clickable region with no name has
nothing to match on. AccName's hidden rule governs what a computation may
**harvest from other nodes** — it is not a refusal to answer about the node you
asked about. The check now applies to recursion and to `aria-labelledby`
traversal, and never to the root.

**#682 — A hidden label labels nothing, and the visible caption wins.** A
`<label hidden>`, a `<caption hidden>`, a `<legend hidden>` still contributed
their text — so a control the sighted user sees unlabelled was announced with
text that had been deliberately removed from the page. And where a hidden
caption was followed by a **visible** one, the hidden one won. Both are now
skipped, and the first *rendered* legend/caption is the name. (`hidden-names.html`
**0/5 → 5/5**.)

⚠️ Note the asymmetry, because it is the subtle part: a hidden element
**referenced by `aria-labelledby`** *is* read — authors routinely park a label in
a `display:none` span and point at it, and refusing that strands those pages. But
a `<label for>` association is the *label* pointing at the control, not the
control pointing at the label, so it earns no exemption.

**#683 — ⭐ The `<label>` outranks the value printed on the button.**
`<input type=button value="OK">` inside `<label>Cancel the order</label>` was
named "OK". HTML-AAM's order is aria-labelledby → aria-label → **the host
language's label** → the element's own attribute; the code had the attribute
first for `button`/`submit`/`reset`/`image`, and `<button>` was not treated as a
labelable control at all. The value is the word *printed on* the button; the
label is what the page *calls* it, and a page that supplies both meant the label.

**#684 — `input[type=image]`: `alt` present is an answer even when it is empty.**
`<input type=image alt="" title="Search">` was named "Search". An empty `alt` is
the author saying *this button's picture needs no words*; it stops the search,
and the tooltip below must not overrule it.

**#685 — `aria-placeholder` did not exist in the computation.** HTML-AAM puts it
one step below the real `placeholder`, which is itself below `title` — the very
last resort. Eight files, one row each.

**#686 — `<figure>` and `<details>` were named by their caption and summary.**
Neither is correct: a `<figcaption>` is content the user reads *in place*, and a
`<summary>` is the disclosure control, not a label announced ahead of the group.
A figure with a caption and no `aria-*` has **no name**, which is the honest
answer. ⭐ The one exception is real and worth keeping: an `<img>` with **no
`alt` at all**, alone in a figure that has a caption, takes the caption as its
name — because there is nothing else in the figure for the caption to be
describing. Put any other content in the figure and it goes back to having no
name.

**#687 — `<optgroup label="Europe">` was named from its contents** — that is,
from the options inside it, which are emphatically not its label.

**#697 — ⭐ The table roles are not named from their contents.** `cell`, `row`,
`columnheader` and `rowheader` were in the "Name From: contents" set. They read
as though they belong there, and the result is that a cell's *name* is the text
the screen reader is about to read out **anyway** as the cell's value — the user
hears everything twice, and a row announces itself by reciting every figure in it
before you have entered it. (`tr-td-th.tentative.html` **24/30 → 30/30**, with
`comp_name_from_content`, `comp_label` and both `table-roles` files unmoved.)

### The role computation

**#688 — ⭐ The `<img>` role: a blank `alt` is a declaration, and an image with no
source is not an image.** The rule was `alt === '' && no aria-* && no title →
none`. Three things wrong with it: a **whitespace-only** `alt` is just as much a
declaration as an empty one (w3c/aria#2706); a **`title`** does not rescue a
decorative image, because a tooltip is a courtesy and not a claim that the
picture carries meaning; and an `<img>` with **no `src` and no `srcset`** (or
empty ones) represents nothing at all per HTML, so calling it an image points the
user at a picture that is not there. Also: an `aria-labelledby` that resolves to
a missing, empty or whitespace element is **not a name**.
(`img-src-srcset-roles.tentative.html` **25/49 → 49/49**.)

**#689 — An author name must survive being read out loud.** `_hasAuthorName` —
the gate on whether `region`/`form` are landmarks at all — asked *is the attribute
present*. So `aria-labelledby="typo-in-this-id"` made a landmark that announces
itself as blank, which is worse than no landmark. It now asks *does anything come
back*: the referenced elements must exist and yield non-blank text. The same
question now gates `<section>` (which had its own, laxer copy of the check).

**#690 — ⭐ The nested `<aside>` is not complementary to anything.** Every
`<aside>` was `complementary`. An aside inside an `<article>`/`<aside>`/`<nav>`/
`<section>` is complementary to *what*, exactly — to a thing the user cannot
navigate to? HTML-AAM's answer: unless the author named it, it is a wrapper.
(`roles-contextual.html` **25/38 → 38/38**, and it takes
`aside-in-prefixed-article.html` with it — an `<article>` built through
`createElementNS(xhtml, "foo:article")`, whose identity is its expanded name and
not its prefix.)

**#691 — `<header>`/`<footer>` inside a section were nothing.** They were mapped
to `generic`, which is true only of the "not a page landmark" half. They head or
close the section they are in, and ARIA's new `sectionheader`/`sectionfooter`
(w3c/aria#1931) is how a reader jumping by landmark knows which section they
landed in.

**#692 — ⭐ The minimum role.** Three attributes make an element something the
user can **act on** — `draggable`, `autofocus`, `popover` — and an element you
can act on cannot be `generic` or `none`, because those are precisely the roles a
screen reader steps over. HTML-AAM floors such an element at `group`. It applies
*after* the presentational conflict resolution, so `<div role=none autofocus>` is
a `group` too. (`roles-minimum.tentative.html` **4/14 → 13/14**.)

**#693 — `<li>` outside a list was still a listitem**, announcing membership of a
list the user was never told about. It is now `generic` — but the list need not be
the immediate parent (`<ul><div><li>` is markup every framework emits, and the
wrappers between are generic), and a list can claim an item from anywhere in the
document with `aria-owns`, which is how a virtualised list keeps its rows in the
tree.

**#694 — Which axis an unscoped `<th>` heads.** Without `scope`, every `<th>` was
a `columnheader`. A `<th>` in a body row that also holds data cells is the label
**for that row** — the leftmost cell of "Tuesday | 14 | 3" names the row, and
calling it a column header files every figure in the table under the wrong
heading. Now: explicit `scope` first, then `<thead>` → columnheader, then
"my row has data cells" → rowheader.

**#695 — Three roles the map never had:** `<address>` → `group`, `<mark>` →
`mark`, `<dir>` → `list`.

**#696 — `<input type=checkbox switch>` is a `switch`** — "on/off", not
"checked/unchecked". Same element, different sentence.

---

## Results

| test | before | after | |
|---|---|---|---|
| `html-aam/accname-computation-by-element/phrasing-elements.html` | 89/135 | **135/135** | ✅ |
| `html-aam/img-src-srcset-roles.tentative.html` | 25/49 | **49/49** | ✅ |
| `html-aam/roles-contextual.html` | 25/38 | **38/38** | ✅ |
| `html-aam/accname-computation-by-element/input-button-submit-reset.html` | 14/23 | **23/23** | ✅ |
| `html-aam/accname-computation-by-element/tr-td-th.tentative.html` | 24/30 | **30/30** | ✅ |
| `html-aam/roles-minimum.tentative.html` | 4/14 | 13/14 | ⬆️ |
| `html-aam/accname-computation-by-element/inputs-with-placeholders.html` | 72/80 | **80/80** | ✅ |
| `html-aam/figure-name-no-figcaption.tentative.html` | 5/9 | **9/9** | ✅ |
| `html-aam/accname-computation-by-element/input-image.html` | 5/9 | **9/9** | ✅ |
| `html-aam/hidden-names.html` | 0/5 | **5/5** | ✅ |
| `html-aam/roles-contextual.tentative.html` | 0/4 | **4/4** | ✅ |
| `html-aam/accname-computation-by-element/button.html` | 6/9 | **9/9** | ✅ |
| `html-aam/accname-computation-by-element/area.html` | 2/7 | 5/7 | ⬆️ cap |
| `html-aam/roles.html` | 58/60 | **60/60** | ✅ |
| `html-aam/names.html` | 126/128 | **128/128** | ✅ |
| `html-aam/roles-generic.tentative.html` | 4/5 | **5/5** | ✅ |
| `html-aam/table-roles.html` | 6/7 | **7/7** | ✅ |
| `html-aam/roles.tentative.html` | 3/4 | **4/4** | ✅ |
| `html-aam/accname-computation-by-element/img.html` | 7/8 | **8/8** | ✅ |
| `html-aam/accname-computation-by-element/other-form-elements.html` | 82/83 | **83/83** | ✅ |
| `html-aam/aside-in-prefixed-article.html` | 0/1 | **1/1** | ✅ |
| `html-aam/dir-role.tentative.html` | 0/1 | **1/1** | ✅ |
| `accname/name/comp_name_from_content.html` | 49/79 | 67/79 | ⬆️ |
| **`html-aam/` probe (35 files)** | **736/888** | **885/888** | **+149** |

---

## ⛔ Caps — honest, and not to be mistaken for failures

* **`html-aam/accname-computation-by-element/area.html` — 2 subtests are an
  UPSTREAM TEST BUG, not ours.** `html-aam-accname-utils.js` builds the `<area>`
  cases through `handleSpecialCases`, which sets
  `alt="Mapped image alt attribute value"` on the element **unconditionally**,
  while the name-source loop only *adds* an `alt` for the "from alt" permutation
  and never removes the one the special case left behind. So the "from title" and
  "to be empty" subtests present an `<area>` that genuinely still carries a
  non-empty `alt` and expect the `alt` to be ignored. No conforming engine can
  pass both those and "from alt". Verified by reading the harness source, not
  guessed.
* **`el-cite-draggable-attr` expects `html-cite`** — a proposed `html-*` role
  family we do not model. The minimum-role rule is deliberately floored only from
  `generic`/`none`/`presentation`, so `<cite>` keeps its empty role rather than
  becoming a `group` and failing differently.
* **`comp_name_from_content.html`'s remaining 12** are not accessibility at all —
  they are **CSS generated content**: `counter()` and `counters()` inside
  `content` with an alt-text fallback, `attr()` inside `content`, and the ordering
  of `::before`/`::after` under `direction: rtl`. `getComputedStyle(el, '::before')
  .content` does not resolve them. That is a style-engine gap and the next quest
  in this direction, not an accname one.
* The role computation is a **JS walk over the DOM on every call**. It is correct
  and it is not cached. Nothing measured slow enough to care, but a page that
  asks for a thousand roles will pay for a thousand walks.

---

## Caps / Next

1. ⭐⭐ **`counter()` / `attr()` / rtl in `content`** — the 12 remaining
   `comp_name_from_content` rows are all one style-engine gap, and generated
   content reaches far past accname (list markers, breadcrumbs, `::before`
   iconography).
2. ⭐⭐ **`core-aam/` and the other `*-aam` realms** (`svg-aam`, `dpub-aam`,
   `graphics-aam`) — the same `get_computed_role` bridge, unmeasured.
   `core-aam/role/roles-contextual.html` already reads 8/8 cold, so the
   infrastructure is there.
3. ⭐⭐ **The sticky offset in the PAINT path** (carried from scroll 496 — the
   model is computed and only the renderer does not read it).
4. ⭐⭐ **Layout for iframe documents in the parent realm** (carried, realm-wide).
5. ⭐ **`aria-*` state and property reflection** (`ariaLabel`, `ariaChecked`, …) —
   the IDL half of the same story.
