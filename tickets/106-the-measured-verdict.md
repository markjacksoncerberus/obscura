# 📐 The Measured Verdict — Quest #505

> **`css/cssom-view` + the whole geometry surface — a layout model reachable from JS.**
> Closes **F26**, the quest six realms named as their cap.
>
> Sibling scrolls: [`107-the-boxed-verdict.md`](107-the-boxed-verdict.md) (the
> box-metric families), [`108-the-located-verdict.md`](108-the-located-verdict.md)
> (hit testing and the scrolling element).

---

## The gap

`Element.prototype.getBoundingClientRect()` did not measure anything. It
**invented** a box:

```js
const VW = 1280, VH = 720, COLS = 12, CW = 100, CH = 20, GX = 110, GY = 30;
const cell = this._nid | 0;
const col = ((cell * 7) | 0) % COLS;
const row = (((cell * 13) | 0) >> 0) % rowsPerScreen;
return new DOMRect(10 + col * GX, 10 + row * GY, CW, CH);
```

Every element in the document was 100×20, parked in a distinct cell of a
12-column grid keyed by its node id. It was written for a good reason —
Playwright's actionability polling needs two elements to occupy two different
places or it cannot tell them apart — and it did that job faithfully for a long
time. But it is a **plausible-looking lie**, and this campaign has learned what
those cost: an API that *answers* wrong is worse than one that is missing,
because nothing the page can do will discover the mistake.

What the lie costs, concretely:

- **`IntersectionObserver` cannot know what is on screen.** It is the machinery
  under `loading="lazy"`: a gallery of 200 photographs should download the four
  you can see. Told every element sits at a grid cell, it downloads all 200 — on
  a connection paid for by the megabyte.
- **A chart library sizes its canvas to 100×20** and draws something illegible.
- **A sticky header, a virtualised list, a tooltip that must not run off the
  screen** — every one of them measures first, and every one of them measured a
  fiction.

And underneath it, a second bug that made the first unfixable.

---

## ⚠️⚠️ The find: a style the JS realm never wrote back is a style the layout never sees

```js
el.style.width = '123px';
el.getAttribute('style')   // → null
document.body.outerHTML    // → "<div id="d">hi</div>"   ← the width is GONE
```

Per-property CSSOM writes were **deliberately not reflected** into the `style`
content attribute, gated on `_ceGlobalDefCount === 0` — on the reasoning that a
`[CEReactions]` `attributeChanged` was the only spec-observable consequence, and
that only custom elements can see one.

That reasoning had a hole big enough to hide a layout engine in. **The Rust DOM
is what gets serialized and handed to the renderer.** A style the JS realm kept
privately is a style the box tree never learns about — so
`el.style.width='100px'` followed by `getBoundingClientRect()`, which is most of
CSSOM View and most of what a real page does, would have measured a box that
never got the width.

It was also just plainly wrong: CSSOM says the `style` content attribute **is**
the serialization of the inline declaration. `getAttribute('style')` and
`outerHTML` were both lying, in every browser-visible way, before any of this.

**A value the engine keeps privately is a value that does not exist.** The
writeback is now unconditional.

---

## The work

### 1. `obscura-render` learned to hand back a whole box, not just a rect

`ResolvedDoc::node_rect()` already existed — the CDP `DOM.getBoxModel` path has
used it since the renderer landed. It returns only x/y/w/h, which is not enough:
`offset*`, `client*` and `scroll*` measure to **different edges of the same
box**, and no amount of arithmetic recovers one from another after the fact.

New `NodeBox` carries the border-box rect *plus* the border and padding widths,
the scrollable extent, the scroll offsets, and the four style facts geometry
depends on (`has_box`, `positioned`, `fixed`, `inline_level`, `visibility`,
`opacity`, `pointer-events`). `ResolvedDoc::all_boxes()` returns every element's,
in document order, in one pass.

**`has_box` is the load-bearing one.** An element that generates no box
(`display:none`, or a descendant of one) and an element with a genuinely zero-sized
box look identical in a rect and could not be less alike to `getClientRects()`
(empty list vs. one zero rect), to `offsetParent` (null vs. an element), or to
hit testing. Stylo simply produces no primary style for such an element, which
is the only reliable tell — Blitz keeps the node in the tree, because the DOM is
not the box tree.

### 2. `obscura-js` gained an optional dependency on the renderer

`obscura-js` → `obscura-render` under a new `render` feature, enabled by
`obscura-browser/render`. No cycle: the renderer knows nothing about JS.

The alternative — a callback from the op back into `Page` — is impossible by
construction. The `Page` owns the JS runtime, so an op that reached back into it
would be a re-entrant borrow. That is precisely why the DOM is *moved into* the
runtime's state in the first place, and it is why the layout engine has to live
on the JS side of the fence rather than being called across it.

### 3. `op_layout('boxes', …)` — one layout, every box

Layout here is **not incremental**: each query re-parses and re-lays-out a fresh
snapshot. A per-element op would therefore re-lay-out the whole document once
per element, which is quadratic in the worst case and absurd in the common one.
So the op is batched by design, and three caches sit in front of it, cheapest
first:

| layer | where | what it skips |
| --- | --- | --- |
| `_treeGen`/`_styleGen` stamp | JS | the op call entirely |
| snapshot hash echoed as `key` | Rust → JS | shipping and re-parsing the payload (`{same:1}`) |
| the resolved document | Rust | style + layout |

The payload is two parallel flat arrays (`nids` and 18 numbers per element)
rather than an object per node, because on a page of a few thousand elements the
object form costs several times as much to serialize and to parse.

### ⭐ There must be only one viewport

The layout viewport comes from the **JS realm's** `innerWidth`/`innerHeight`, not
from the screenshot viewport (`ViewportConfig`, Chrome's headless 1280×720
default). The two disagreed. If layout had used its own, every test comparing a
rect against `innerWidth` would fail — and would be right to.

### ⭐ A re-layout must not re-fetch the stylesheet

The screenshot path renders once and throws the document away, so it never
needed a resource cache. The bridge rebuilds a Blitz document on **every**
mutate-then-measure pair — the classic layout-thrash loop every real page does at
least once — and each rebuild asked for the same unchanged CSS file again. A
600-iteration test was 600 network round trips. `CachingProvider` keyed by URL,
shared across every layout on the page, fixes it; the first fetch is the only
fetch.

The provider itself moved from `obscura-browser` into `obscura-render`, because
both callers need the identical one. **A box measured without the page's
stylesheet is a box in the wrong place**, so the screenshot path and the geometry
path must fetch the same way or they will disagree about where things are.

---

## Results

Probe list: [`scripts/wpt-layout-probe.txt`](../scripts/wpt-layout-probe.txt)
(69 files that load). Measured with the **stash → build → run → pop → build →
run** method, so the before column is the same binary minus exactly this work.

**⚠️ ZERO REGRESSIONS, THE STRONG PROOF: stash → rebuild → run → pop → rebuild → run over the 152-file ritual list, diffed PER FILE with `wpt_batch_diff.py`.** Both passes **0 could-not-run, 152 rows**; before **33,146/33,418**, after **33,147/33,418** — every row identical except `resize-observer/idlharness.window.html` 48/49 → **49/49**. This is the most shared primitive in the engine, so nothing less would do.

**Arc total over the 69 files that load: 438/1301 (33.7%) → 473/1302 (36.3%).**
22 files improved, 2 moved down — and *both* of those are examined honestly below,
because neither is what it looks like.

### What this quest moved

| Test | Before | After |
| --- | :---: | :---: |
| `cssom-getBoundingClientRect-002.html` | 0/1 | **1/1** |
| `cssom-getClientRects.html` | 0/1 | **1/1** |
| `client-props-root.html` | 0/1 | **1/1** |
| `cssom-getBoundingClientRect-001.html` | 2/2 | 2/2 |
| `ttwf-js-cssomview-getclientrects-length.html` | 3/3 | 3/3 |

The headline numbers for this arc land in the two sibling scrolls — the bridge
itself only has a handful of files that ask nothing but "where is this box".
That is the point: the bridge is a **primitive**, and its value is what #506 and
#507 could then be built out of.

### ⭐⭐⭐ Two "regressions" that were fake greens — the webaudio lesson again

The last arc found `webaudio` scoring **175/178 by comparing silence to silence**.
This arc found the same shape twice, and it is worth naming precisely because the
tell is identical: **a test that compares two of our own numbers to each other
passes for free while both are constants.**

```js
// css/cssom-view/table-with-border-client-width-height.html
assert_equals(table.clientWidth,  table.offsetWidth);    // 100 === 100  ✅
assert_equals(table.clientHeight, table.offsetHeight);   //  20 ===  20  ✅
```

```js
// css/cssom-view/scrollWidthHeight-overflow-visible-*.html   (190 subtests)
assert_equals(sh, ch + expectedOverflowY);   // 20 === 20 + 0  ✅ ×190
```

`scrollWidthHeight-overflow-visible-margin-collapsing.html` scored a perfect
**140/140** this way, and `-negative-margins.html` a perfect **50/50**. Making the
numbers real dropped them to 70 and 20. Two genuine bugs later (see below) the
first is back at a **true** 140/140 and the second sits at **40/50** — ten real
failures that were always there and could not be seen.

`table-with-border` is 1/1 → **0/1** and stays there: with real layout the table's
`clientWidth` is 27 and its `offsetWidth` 43, because Blitz puts the HTML `border`
attribute's border on the table box. That is a real disagreement with real
browsers, now visible. **A test that goes red when you make something correct was
never measuring the thing.**

### ⚠️ And three regressions that were mine

Found by the per-file diff, not by the total — which is exactly why the ritual
diffs per file:

1. **`display: inline-block` was treated as `display: inline`.** CSSOM zeroes
   `clientWidth`/`clientHeight` only for a *non-replaced inline* box. Checking
   `display.outside() == Inline` also catches `inline-block`, `inline-flex` and
   `inline-grid`, each of which has a perfectly ordinary padding box. Now
   requires `inside() == Flow` as well.
2. **Taffy measures `content_size` from the BORDER-box origin; CSSOM defines the
   scrolling area against the PADDING box.** Without subtracting the leading
   border, every bordered element reported a `scrollHeight` one border-width
   taller than its own `clientHeight` — claiming to overflow when it did not.
3. **`clientWidth` on an iframe's `<body>` returned the PARENT window's width** —
   a 300px iframe reporting 3840. The viewport-proxy rule now fires only for the
   current realm's document.

---

## ⛔ Honest caps

- **Layout is not incremental.** A forced reflow costs a full re-parse + style +
  layout of the document: measured at ~11 ms for 400 elements. Cached reads
  between mutations are free (400 reads in 19 ms), but a tight
  mutate-then-measure loop pays every time. Making this incremental means keeping
  a persistent Blitz document and mutating it, which is a project of its own.
- **Shadow trees have no boxes.** Shadow roots live only in the JS realm, so they
  never reach the serialized snapshot. Those elements fall back to the synthetic
  grid rather than reporting a false zero.
- **Blitz layout fidelity is now the ceiling, and it is a real one.** `<caption>`
  gets no box; `position: fixed` with a `left` offset is laid out at its static
  position; SVG text (`<tspan>`) has no geometry. We own the fork
  (`../blitz`), so these are reachable — but they are layout-engine work, not
  bridge work.
- **No scrolling.** `scrollTop`/`scrollLeft` report the box tree's offsets, and
  the setters remain no-ops: nothing in a static snapshot can scroll.
