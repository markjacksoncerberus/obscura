# 📦 The Boxed Verdict — Quest #506

> **`offsetWidth` · `clientHeight` · `scrollWidth` · `offsetParent` ·
> `checkVisibility()` — the box-metric families, on the bridge from
> [`106-the-measured-verdict.md`](106-the-measured-verdict.md).**

---

## The gap

With the bridge in place, `getBoundingClientRect()` told the truth and every
other way of asking the same question still did not:

```js
get offsetWidth()  { return 100; }
get offsetHeight() { return 20; }
get offsetTop()    { return 0; }   get offsetLeft()  { return 0; }
get clientWidth()  { return 100; } get clientHeight(){ return 20; }
get scrollWidth()  { return 100; } get scrollHeight(){ return 20; }
get offsetParent() { return null; }
```

Constants — and constants that **disagreed with the rect**. A page that measured
one way got the truth and a page that measured the other got 100×20, which is
worse than both being wrong the same way: library code routinely cross-checks
them (`el.offsetWidth !== el.getBoundingClientRect().width` is a common zoom or
transform probe) and would now take a branch neither author ever tested.

`offsetParent` returning `null` is its own bug. It is how you walk up to the
element a position is relative to; answering `null` says "the document", so every
coordinate computed through it is off by however far the real containing block
sits from the origin.

---

## ⭐⭐ The lesson: three families, three edges of the same box

This is the part that cannot be fudged, and it is why the bridge hands back
border and padding widths alongside the rect rather than just x/y/w/h:

```
        ┌──────────────────────────── margin ────────────────────────────┐
        │   ┌──────────────────── border ─────────────────────┐          │
        │   │  ┌──────────────── padding ───────────────┐     │          │
        │   │  │                                        │     │          │
        │   │  │              content                   │     │          │
        │   │  └────────────────────────────────────────┘     │          │
        │   └─────────────────────────────────────────────────┘          │
        └────────────────────────────────────────────────────────────────┘
              ▲                  ▲
              │                  └─ client* measures HERE  (the padding box)
              └─ offset* and getBoundingClientRect measure HERE (the border box)

              scroll* = the padding box, unioned with everything overflowing it
```

`clientWidth = width − borderLeft − borderRight`. `clientTop = borderTop`. You
cannot recover either from a rect, because a rect has already forgotten where the
border ended. So `NodeBox` carries all four border widths and all four padding
widths, and each getter measures to its own edge.

Verified end to end on a box with `width:200px; padding:10px; border:5px`:

| | expected | got |
| --- | --- | --- |
| `offsetWidth` | 230 | 230 |
| `clientWidth` | 220 | 220 |
| `clientTop` / `clientLeft` | 5 | 5 |
| child `offsetTop` (7px margin inside 10px padding) | 17 | 17 |
| child `offsetParent` | the positioned parent | the positioned parent |

---

## ⚠️ An inline box has no padding box to report — but `inline-block` does

`clientWidth`/`clientHeight` are defined as **zero** for a **non-replaced inline**
box, however far its text actually runs: an inline has no single padding box,
only a chain of line fragments.

The obvious implementation of that rule is the wrong one, and it cost a
measurement cycle. `display.outside() == Inline` is true for `inline-block`,
`inline-flex` and `inline-grid` as well — and every one of those has a perfectly
ordinary padding box. Zeroing them reports `clientHeight === 0` for elements that
are plainly boxes, which is how a 244px-tall `inline-grid` came to claim it had no
height at all.

The condition is `display: inline` **exactly** — `outside() == Inline` **and**
`inside() == Flow`. "Inline-level" and "inline" are not the same word.

## ⭐ The viewport proxy swaps between the root and `<body>`

`document.documentElement.clientWidth` does not report the root element's box; it
reports the **layout viewport**. And in **quirks mode** that duty moves to
`<body>` instead.

That swap is not a curiosity. It is exactly why a quirks-mode page's
`document.body.clientHeight` is the window height while a standards-mode page's is
the content height — and why layout code written against one silently breaks on
the other. It is also why `document.scrollingElement` had to exist at all (see
[`108-the-located-verdict.md`](108-the-located-verdict.md)): before it, every page
shipped `documentElement.scrollTop || body.scrollTop` because there was no way to
ask which one the browser would honour.

Obscura only became able to answer this at all because Quest #500 gave it a real
`compatMode`.

## ⭐ `offsetParent` measures from the PADDING edge

Not the border edge, and not the viewport. `offsetTop = box.y − parent.y −
parent.borderTop`. Getting this wrong is invisible until someone puts a border on
a container, and then everything inside it shifts by the border width.

The walk itself:

- **null** for the root, for `<body>`, for anything unrendered, and for
  `position: fixed` — which is laid out against the viewport, and the viewport is
  not an element.
- otherwise the nearest ancestor that is positioned, **or** is `<body>`, **or** —
  only when the element itself is statically positioned — is a `td`/`th`/`table`.
  That last clause is the one place the old table-layout world leaks into the
  modern API.

## ⭐ `checkVisibility()`'s options are opt-in, and that is deliberate

The plain call asks only *"does this generate a box"*. `visibility` and `opacity`
are behind `visibilityProperty` / `opacityProperty`, because an element that is
transparent or invisible is still laid out, still occupies space, and still
receives events. Treating it as absent by default would answer a different
question than the one most callers are asking.

Opacity had to become a **walk**: it multiplies down the tree, so a fully
transparent ancestor makes every descendant invisible however opaque the
descendant declares itself. A single read of the element's own opacity is the
obvious implementation and the wrong one.

The existing computed-style implementation was kept (it handles
`display: contents` and `content-visibility` on ancestors, which the box tree
cannot distinguish) and the box tree was added **in front of** it as the
authority on whether a box exists at all.

---

## Results

| Test | Before | After |
| --- | :---: | :---: |
| `table-offset-props.html` | 1/13 | **5/13** |
| `table-client-props.html` | 1/15 | **4/15** |
| `table-scroll-props.html` | 1/13 | **4/13** |
| `scrollWidthHeight-negative-margin-001.html` | 0/4 | **4/4** |
| `scrollLeftTop.html` | 6/6 (constants) | **6/6** (real, and clamped per writing mode) |
| `scrollWidthHeight-overflow-visible-margin-collapsing.html` | 140/140 (`20===20`) | **140/140** (real) |
| `scrollWidthHeight-flex-column-padding-001.html` | 0/2 | **1/2** |
| `client-props-root.html` | 0/1 | **1/1** |
| `quirks/table-cell-width-calculation-applies-to.html` | 0/1 | **1/1** |
| `scrollWidthHeight-contain-layout.html` | 128/128 | 128/128 |
| `resize-observer/observe-001.html` | 0/1 | **1/1** |
| `resize-observer/eventloop.html` | 1/3 | **4/5** |
| `resize-observer/notify.html` | 2/5 | **3/5** |

`observe-001` is the one the quest board called out by name: it wants
`contentRect.width === 5` and used to get 100.

### ⭐ `scrollTop`/`scrollLeft` became real state, with a sign

The box tree is a static snapshot and cannot scroll — but the scroll *position* is
**state, not geometry**: a number the page sets and reads back. With a real
scrolling area it can finally be held correctly instead of pinned to zero, and
clamped to the range the box actually allows.

The range is **not always `[0, max]`**. The scrolling origin sits at the
block-start/inline-start corner, so when writing-mode or direction puts that corner
on the right (or the bottom), the offsets run **negative**:

| writing-mode | direction | `scrollLeft` range | `scrollTop` range |
| --- | --- | --- | --- |
| `horizontal-tb` | ltr | 0 → +max | 0 → +max |
| `horizontal-tb` | rtl | −max → 0 | 0 → +max |
| `vertical-lr` | rtl | 0 → +max | −max → 0 |
| `vertical-rl` | ltr | −max → 0 | 0 → +max |

A page that clamps `scrollLeft` to positive numbers scrolls Arabic and Hebrew
content to the wrong end. That is the whole of `scrollLeftTop.html`, and it is
6/6 — where the old 6/6 was six comparisons of `0` against a `0` computed from
the same constants.

---

## ⛔ Honest caps

- **`content-visibility` is not in this Stylo build.** `clone_content_visibility`
  does not exist on the computed `Box` struct as compiled, so the box tree cannot
  report it and `checkVisibility({contentVisibilityAuto:true})` still answers
  from computed style alone. The field was **removed** from `NodeBox` rather than
  shipped as a hardcoded `false` — a struct field that always lies is exactly the
  fingerprinting-costume failure mode this campaign keeps finding.
- **`scrollWidth`/`scrollHeight` are Taffy's `content_size`**, floored at the
  padding box. CSSOM View defines the scrolling area as the union of the padding
  box with every descendant's *margin* box; the two agree in the common case and
  diverge on negative margins and unusual writing modes.
- **`scrollTop`/`scrollLeft` setters remain no-ops.** Nothing in a static
  snapshot can scroll.
- **`currentCSSZoom` is still `1`.** No zoom in the pipeline.
