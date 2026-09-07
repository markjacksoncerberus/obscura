# 📌 The Stuck Verdict — `position: sticky`, and the header that never followed you down the page

> *Quests #676–#679. Region: `css/css-position/sticky/` — 118 files, 35 of them
> scoreable, chosen over `float` layout after measuring both.*

---

## Why here, and not floats

The outgoing pointer named `float` as the ⭐⭐⭐. It was measured first and the
answer was clear: `css/CSS2/floats*` is **378 probe rows of which 569 sub-rows
could not be scored at all** — 19 scoreable files, already at 120/128. Float
layout would win almost nothing on the scoreboard (it would unlock five
`scrollIntoView-*-writing-mode*` files elsewhere, and it would improve rendering
broadly, which still matters), while `position: sticky` sits on ~70 scoreable
subtests **and** is the second half of the overlay vocabulary the previous arc
started.

So: floats stay banked with an honest note about *why*, and this arc took sticky.

---

## The gap

`stylo_taffy` mapped `Position::Sticky` onto `taffy::Position::Relative` — which
is right, as far as it goes, because a sticky box does take part in flow — and
then handed Taffy the insets.

That is wrong in a way that is worse than doing nothing. A sticky box's insets
are **not** an offset from where it sits; they are the distance from the
**scrollport edge** it must keep once the scroll reaches it. Handing them to
Taffy shifts the box by them unconditionally, so a `top: 50px` sticky header sat
50px low before anything had scrolled at all — and any engine computing the real
sticky offset on top of that would double-count it.

Meanwhile nothing computed the real offset, so a sticky header never followed you
down the page: the table header lost its labels, the section index stopped at the
top of the document, the toolbar scrolled away.

---

## What was built

### 1. A sticky box is laid out IN FLOW (Quest #676)

One line in the fork: for `position: sticky`, the insets do not reach Taffy at
all. The box now sits exactly where the flow puts it, which is the only honest
starting point for computing where it has been pushed to.

### 2. The offset (Quest #677)

The layout engine has no idea any of this is happening — the box tree is a static
snapshot. What *can* be computed is the offset, from the same scroll positions
everything else now reads, and the offset is the whole of what a page can
observe. For each axis:

* the **scrollport** is the nearest scrollable ancestor's, or the viewport's,
  with its start edge in the document coordinates the layout gave us;
* the box is pushed so its edge keeps the inset's distance from the scrollport
  edge, and never backwards;
* it is then clamped to its **containing block's content box, inset by the box's
  own margins** — a sticky header with a 15px bottom margin stops 15px earlier,
  because the margin is part of what has to stay inside. That clamp is what makes
  each section's header hand over to the next one instead of piling up.

It is applied to `offsetTop`/`offsetLeft` — which is how every sticky test asks
"has it stuck yet" — and to `getBoundingClientRect`, which carries it into
hit-testing for free.

### 3. Nested sticky (Quest #678)

A sticky box inside another moves with it, and both its own constraint and its
`offsetTop` are measured from where the outer one **currently** sits — which is
what makes a sticky sub-heading hand over inside a sticky section header. So the
model accumulates ancestors' shifts into the natural position, into the
containing block, and into `offsetTop`'s subtraction of its `offsetParent`.

### 4. Cost (Quest #679)

Almost no page has a sticky box, and the answer only changes when the layout
does — so one scan per layout snapshot buys every other page out of the whole
model, and a document that has not scrolled at all skips even that.

---

## Results

### Region: `css/css-position/` (373 files)

**1167/1488 → 1200/1488. 13 files up, 0 down.** Taken with the previous arc's
containing-block work, the realm went **1163 → 1200**.

| file | before | after |
|---|---|---|
| `sticky/position-sticky-top.html` · `-bottom` · `-left` · `-right` | 1/3 each | **3/3** each |
| `sticky/position-sticky-nested-top.html` · `-bottom` | 0/5 each | **5/5** each |
| `sticky/position-sticky-nested-left.html` · `-right` | 1/5 · 2/5 | **5/5** each |
| `sticky/position-sticky-margins.html` | 0/3 | **3/3** |
| `position-sticky-dynamic-ancestor-001.html` | 0/1 | **1/1** |
| `sticky/position-sticky-horizontal-rtl-overconstrained.html` | 0/4 | **2/4** |
| `sticky/position-sticky-overflow-padding.html` | 1/3 | **2/3** |
| `sticky/position-sticky-top-and-bottom.html` | 0/2 | **1/2** |

### Everything else: held

The ritual (446 rows), the scroll probe list (167 files) and the scroll-snap
realm (202 files) were all re-swept. **Zero real regressions**: every row the
parallel sweeps flagged came back at or above its baseline when re-run solo —
`scroll-behavior-main-frame-window` 28/28, `after-transition-reload-no-scroll-anchoring`
1/1, `scroll-snap-type-change` 2/2 on two runs of three, and the campaign's
documented flaky-img file, which has been measured anywhere from 106/258 to
228/258 **on the base binary**.

---

## ⛔ Caps — honest, and not to be mistaken for failures

* **Painting.** The sticky offset reaches `offsetTop`, `getBoundingClientRect`
  and hit-testing. It does **not** reach the renderer, so a screenshot still
  draws the box where the flow put it. That is a paint-path change and this arc
  did not make it.
* **Single-axis nested scrollers** (`position-sticky-single-axis-basic`) need a
  sticky box to be constrained by a *different* scroller per axis; the model
  picks one nearest scrollable ancestor for both.
* **A transformed ancestor** does not become the sticky containing block.
* **`position-sticky-inflow-position`** asserts that a sticky box's shift does
  not move its siblings. It does not in our model either — the remaining failure
  there is an unrelated flow-position difference.
* **`float` layout**, measured and deliberately not taken this arc: 378 probe
  rows in `css/CSS2/floats*` of which the overwhelming majority are reftests, and
  the 19 scoreable files already sit at 120/128. It remains worth doing for
  *rendering* — and for the five `scrollIntoView-*-writing-mode*` files — but not
  for the scoreboard.

---

## 🧭 Next leverage

1. **⭐⭐ The sticky offset in the PAINT path** — the model is computed and only
   the renderer does not read it; a sticky header still draws in the wrong place.
2. **⭐⭐ Layout for iframe documents in the parent realm** (carried, realm-wide).
3. **⭐⭐ Touch panning and keyboard scrolling** behind a `touch-action` model.
4. **⭐ `float` layout** — for rendering and for the five writing-mode scroll
   files, not for the score.
5. **⭐ A transformed ancestor as a containing block** for both `fixed` and
   `sticky`.
