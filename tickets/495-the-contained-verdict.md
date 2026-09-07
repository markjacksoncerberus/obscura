# 📐 The Contained Verdict — the containing block, and the fixed header that was never fixed

> *Quests #673–#675. Region: the layout engine itself — `stylo_taffy`'s
> `Position::Fixed => taffy::Position::Absolute`, carried as a ⭐⭐⭐ pointer
> across four arcs.*

---

## The gap

```rust
// TODO: support position:fixed and sticky
stylo::Position::Absolute => taffy::Position::Absolute,
stylo::Position::Fixed => taffy::Position::Absolute,
```

Taffy has no notion of a containing-block chain. It lays an
`Position::Absolute` child out against **its own parent's padding box**, full
stop — and both of CSS's out-of-flow positions were mapped onto it.

So:

* `position: fixed; left: 100px; top: 50px` on a header landed at **(108, 58)**
  on any page with the default `<body>` margin, and moved with whatever ancestor
  it happened to be written inside;
* `position: absolute; left: 10px` inside an unpositioned wrapper was offset by
  wherever that wrapper happened to sit, rather than measured from the nearest
  *positioned* ancestor.

That is every sticky header, every modal, every toast, every dropdown menu and
every tooltip on the web — the whole vocabulary of overlay UI, placed wrong. It
had been named as the top ⭐⭐⭐ pointer by four consecutive arcs and deferred by
each of them, and by the end of the scroll model it was the top blocker in **two**
realms at once.

---

## What was built

### 1. The hoist (Quest #673)

The layout tree is allowed to differ from the DOM tree — `layout_parent` exists
precisely because it already does (anonymous blocks, inline roots, table
wrappers). So the fix is not to teach Taffy about containing blocks; it is to
**reparent the box in the layout tree only**, after construction and before
layout. Taffy then positions it against the right padding box without knowing
anything new.

One pass, in the fork's `resolve_layout_children`: every out-of-flow box is moved
to the node that is actually its containing block — the nearest positioned
ancestor for `absolute`, the root element (standing in for the viewport) for
`fixed`.

⚠️ **The root ELEMENT, not the root NODE.** `root_node()` is the Document, whose
layout box is a wrapper that does not position absolute children at all —
hoisting to it silently dropped every inset and parked the box at the origin.
That cost one debugging round and is worth writing down.

### 2. The chain is the DOM's, not the layout tree's (Quest #674)

The first version walked the layout tree it was editing, and was therefore
one-way: a box hoisted to the root has no positioned ancestor left *in the layout
tree* to find, so when its real ancestor **became** positioned at runtime — which
is exactly what a page does when it adds a class to open a dropdown — it never
came back.

The containing block is now read from the **DOM** ancestor chain every pass,
which makes the whole thing idempotent and reversible. A box already sitting
inside its containing block, merely wrapped in an anonymous box the inline
machinery made, is left alone: pulling it out would rebuild an inline formatting
context for nothing.

### 3. A box with all-auto insets keeps its static position (Quest #675)

⭐ The find that stops this being a regression. An absolutely positioned box with
`top`, `right`, `bottom` and `left` all `auto` is placed at its **static
position** — where it would have sat had it stayed in flow — and only the box's
own parent knows where that is. Hoisting one of those throws the answer away and
pins it to the containing block's origin.

So only a box that actually asks to be placed is moved. `position: absolute` with
no insets stays exactly where the DOM put it, and
`position-absolute-container-dynamic-002` — which changes a sibling's height and
expects the untethered box to follow — keeps passing.

---

## Results

The headline is not a subtest count. It is this, measured on a page with the
default `<body>` margin:

| | before | after | correct |
|---|---|---|---|
| `position: fixed; left: 100px; top: 50px` | (108, 58) | **(100, 50)** | (100, 50) |
| `position: absolute; left: 10px; top: 20px` in an **unpositioned** wrapper at (40, 60) | (50, 80) | **(10, 20)** | (10, 20) |
| the same inside a `position: relative` parent at (78, 265) | (88, 285) | (88, 285) | (88, 285) |

Every measured region, base binary vs this one, same runner:

| region | before | after | files up | down |
|---|---|---|:--:|:--:|
| `css/css-position/` (373 files) | 1163/1488 | **1167/1488** | 1 | **0** |
| `css/css-scroll-snap/` (202 files) | 584/796 | **592/809** | 8 | **0** |
| the scroll probe list (167 files) | 856/1690 | **861/1690** | 2 | **0** |
| `scripts/wpt-layout-probe.txt` (74 files) | 551/1303 | **553/1305** | 2 | **0** |
| the ritual (420 rows) | — | — | 1 | **0** |

`position-absolute-dynamic-containing-block` went **0/8 → 4/8**; the snap realm's
`multiple-aligned-targets/*` family became reachable for the first time (three
files went from could-not-run to scored, one of them 0/10) because their absolute
snap areas finally sit where the test puts them.

⚠️ Four ritual rows were flagged by the parallel sweep and all four are known
flakes, proved by re-running them **on the base binary**:
`2d.pattern.basic.image` and `element-scroll-promise-interruption` both come back
at full marks solo on the new binary; `cookies/prefix/document-cookie.non-secure`
measures **20/35 on the base binary too**; and the campaign's documented
flaky-img file `naturalWidth-naturalHeight-width-height` measures **108/258 and
106/258 on the base binary** against 126/258 on this one — i.e. the new binary is
the *better* of the two.

---

## ⛔ Caps — honest, and not to be mistaken for failures

* **`position: sticky`** is still mapped to `Relative` and does nothing.
* **A transformed / filtered ancestor** becomes the containing block for
  `fixed` descendants. Not modelled; a fixed box inside a `transform` still goes
  to the viewport.
* **A mixed-inset box** — `top: 10px` with `left: auto` — is hoisted whole, so it
  gains the correct block position and loses the inline static position. The
  all-auto case (much the commoner one) is exempt and keeps both.
* **`css/css-position/` is 521 could-not-run of 373 probe rows** — reftests, which
  need a real renderer comparison, are most of that realm.

---

## 🧭 Next leverage

1. **⭐⭐⭐ `float` layout** — carried, and now the single biggest remaining wall
   in the scroll realm (five whole files) as well as in normal flow.
2. **⭐⭐ `position: sticky`** — the other half of the overlay vocabulary, and the
   one every table header and section index on the web uses.
3. **⭐⭐ Layout for iframe documents in the parent realm** (carried).
4. **⭐⭐ Touch panning and keyboard scrolling** behind a `touch-action` model.
5. **⭐ A transformed ancestor as a fixed containing block.**
