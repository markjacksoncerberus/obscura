# 📜 The Scrolled Verdict — `css/cssom-view/scroll*`, `dom/events/scrolling`, and the browser that could not move the page

> *Quests #650–#666. Region: the scroll model — `css/cssom-view/` (100 scroll
> files), `navigation-api/scroll-behavior/` (29 files), `dom/events/scrolling/`
> (38 files). Three realms, one primitive.*

---

## The gap

`window.scrollTo` was an empty function.

```js
globalThis.scrollTo = function(x, y) {};
globalThis.scrollBy = function(x, y) {};
globalThis.scrollX = 0; globalThis.scrollY = 0;
```

`window.scrollY` was the literal `0` — not "0 because the page is at the top",
but 0 forever, because nothing in the engine could hold a scroll position for the
viewport at all. `Element.prototype.scroll` / `scrollTo` / `scrollBy` existed and
took their arguments through a full WebIDL dictionary conversion, and then
**deliberately did nothing**; `scrollIntoView` set a click target and returned.
There was no `scroll` event and no `scrollend` event anywhere in the engine.
`scroll-behavior` was not a CSS property.

An element could hold a scroll position — `_scrollLeftPos`/`_scrollTopPos` — but
it would hold one whether or not it had a scrolling box, so an
`overflow: visible` section that overflowed reported positions no reader could
ever be shown; and nothing else in the engine read those numbers, so a scrolled
element's `getBoundingClientRect()` came back exactly where it had been.

That is the load-bearing primitive under an enormous amount of the web. Not
"scrolling" as a gesture — we have no compositor and this arc does not pretend to
add one — but **scroll position as state a page can read, write, and be told
about**: the header that sticks, the list that loads more at the bottom, the
"skip to content" link, the validation error that jumps you to the field you got
wrong, the back button that returns you to the paragraph you were reading. Every
one of those is a page asking where it is and being told zero.

Three realms were parked on it. The Traversable Arc's own scroll ledger
(`navigation-api/scroll-behavior/`, 29 files) capped out with the note *"all
assert `window.scrollY` moved — no JS-reachable scroll model"*.

---

## What was built

### 1. The scrolling box (Quest #650)

One abstraction, used everywhere: a *scrolling box* is either an element or
`_SCROLL_VIEWPORT` (the document's own), and four functions answer everything
about it — its range, its position, a clamped write, and whether it moved. The
viewport and an `overflow: auto` div can no longer drift apart in behaviour,
because there is only one implementation of the behaviour.

An element only has a scrolling box when its **computed overflow** says so
(`visible` and `clip` do not scroll). That single gate is what
`dom-element-scroll.html` is written to check, and it needed the cascade fix
below before it could be asked.

### 2. `overflow` never reached computed style (Quest #651)

`getComputedStyle(el).overflowX` answered `visible` on an element a stylesheet
had declared `overflow: hidden` on. The shorthand was expanded on the **CSSOM
setter path only** — `_SHORTHAND_LONGHANDS` did not name it, so the cascade never
split it into `overflow-x`/`overflow-y`. This is the `background` bug of Quest
#547 for the fourth time (after `background`, `outline`, `column-rule`), and it
mattered more than usual here: *everything* that asks "is this a scroll
container" now reads that answer. `overscroll-behavior` had the same hole and was
fixed alongside it.

### 3. `scrollWidth`/`scrollHeight` were arithmetically wrong (Quest #652)

Taffy measures `content_size` from the **content-box** origin — it counts neither
border nor padding — while CSSOM View defines the scrolling area against the
**padding box**, with the box's own padding inside it on both sides. The bridge
subtracted the leading border instead of adding the padding, so:

| element | reported | correct |
|---|---|---|
| 300×500, 3px border, 700px child | 697 | 700 |
| 300×500, `padding-top: 10px`, 700px child | 700 | 710 |
| 300×500, `padding: 10px`, 3px border, 700px child | 697 | 720 |

A bordered scroller's maximum `scrollTop` was one border-width short of the
bottom of its own content — invisible while nothing could scroll, and wrong the
moment anything could.

### 4. Overflow propagates to the viewport (Quest #653)

⭐ The find under the realm. CSS Overflow: **the root element's overflow is
applied to the viewport, not to the root's own box**; and when the root's own
overflow is `visible`, the `<body>`'s is taken for the viewport instead and the
body is left `visible`. So in that case *neither* element is a scroll container
of its own.

`body { overflow: hidden }` is how a page says "the window must not scroll".
Without the rule, `<body>` looked like a scroll container, and `scrollIntoView`
walking outward stopped at it, scrolled it (range zero — it does not overflow
itself), and moved nothing. `scrollintoview.html` went **0/40 → 40/40** on this
one rule.

The same rule, read from the other side, is CSSOM View's *potentially
scrollable*: a quirks-mode `<body>` keeps its own scrolling box exactly when the
root has already claimed one. The two conditions are **not** the same test — the
root only has to stop being `visible` (a `clip` root has already taken the
viewport's box), while the body has to actually scroll, and `clip` does not.
`scrollingElement.html` pins all sixteen combinations; the engine had the root
condition inverted.

### 5. The scroll operations, and their promises (Quests #654–#655)

`scroll` / `scrollTo` / `scrollBy` on `Element` and on `Window` now perform the
scroll. They return the CSSOM View promise, which settles **when the scroll
finishes** — several frames later for `behavior: "smooth"` — and carries
`interrupted`, which is `true` when something else took the box over. A page that
awaits `scrollTo(...)` and then finds it was overridden needs to be told it never
arrived.

One in-flight smooth scroll per box; anything arriving at the same box interrupts
it — another smooth scroll, an instant one, or a bare `scrollTop =`. An unrelated
box's scroll interrupts nothing.

### 6. `scroll-behavior` (Quest #656)

Registered as a real CSS property (`auto | smooth`, not inherited). `auto` is not
a synonym for "instant": it defers to the scrolling box's own `scroll-behavior`,
which is how a stylesheet — with no script at all — makes every in-page anchor
jump glide instead of teleport. Smooth scrolls run over `requestAnimationFrame`
with an ease-in-out curve, so a page that measures the position immediately after
the call correctly sees that it has not arrived.

### 7. `scroll` and `scrollend` (Quest #657)

Neither event existed. Both are queued as tasks, at most once per box per
opportunity, so a hundred writes in one turn produce one event and not a hundred.
The viewport's are fired at the **Document** and **bubble** — that is the only
reason `window.onscroll` ever sees them; an element's are fired at the element
and do not bubble. `scrollend` is queued after the scroll it ends and only when
the position actually moved.

### 8. `scrollIntoView`: the outward walk (Quests #658–#659)

The most-used scroll API on the web, and it is not one scroll. It walks
**outward**, scrolling each ancestor scrolling box in turn and then the viewport,
and after each step the thing being revealed becomes *that box*. That walk is what
makes it work inside a scrollable panel inside a scrollable page — which is where
it matters most, and where a one-level implementation quietly does nothing.

With it: `scroll-margin` on the target (the gap it asks to keep around itself),
`scroll-padding` on each scroller (the strip a sticky header covers), the legacy
boolean overload, and `block`/`inline` resolved through the element's writing
mode.

### 9. Logical directions are not `x` and `y` (Quest #660)

`block` and `inline` ride on different physical axes in a vertical writing mode,
and in a reversed flow the logical *start* is the *high* physical edge. The same
answer places the scrolling origin, which is why an `rtl` scroller's `scrollLeft`
runs 0 → −150 rather than 0 → 150. One `_lbFlow` now answers both, including
`sideways-lr`, whose inline direction runs bottom-to-top.

### 10. Every measured coordinate moved with it (Quest #661)

`getBoundingClientRect` is viewport-relative, so the viewport's offset and every
scrolling ancestor's come off the document-space box the layout engine hands us.
That is what makes a rect read differently after a scroll — which is what every
sticky header, lazy-loader and `IntersectionObserver` polyfill on the web is
written around.

A `position: fixed` box is the one that does **not** move: it is anchored to the
viewport, so the viewport scroll is not taken off it. Hit-testing through
pseudo-element boxes takes the same offsets off, so a list bullet stays clickable
after the page moves.

Cost control: on a page where no element has ever held a non-zero scroll
position, the ancestor walk returns zero without touching `getComputedStyle` at
all. A page that never scrolls pays nothing for the model.

### 11. The session history remembers where you were (Quests #662–#664)

A session history entry now carries **scroll position data**. It is saved into
the entry being left, at the commit, before the index moves; a traversal restores
it rather than scrolling to the fragment. That is the difference between a back
button that returns you to the paragraph you were reading and one that dumps you
at the top of a long article — on a phone, on a slow connection, that difference
*is* the feature.

`history.scrollRestoration` is now **per entry**, as the spec has it, not per
`History` object: going back to an entry that asked for manual restoration gets
manual restoration even if the page has since flipped the flag on a later entry.
A push inherits the mode from the entry it grew out of; a replace is the same
slot, so both the mode and the reader's place carry over.

An **intercepted** navigation owns its own scroll — it happens when the
transition finishes, or, for `intercept({ scroll: "manual" })`, never, because
the page said it would place the reader itself. A one-field handshake
(`_shScrollOwner`) keeps the document-side effects from scrolling anyway and
quietly undoing that decision. ⚠️ The handshake carries the session history that
is *committing*, which for an iframe is the frame's own — never the top-level
page's.

### 12. The fragment names the document (Quest #665)

An empty fragment, or the literal `#top`, scrolls to the top of the document —
that is what makes the "back to top" link every long page ships actually work,
and it is the only fragment that is not an id lookup (`#top` still yields to a
real element named `top`). A legacy `<a name>` is honoured before giving up.

### 13. `position: fixed` ends the walk (Quest #666)

A fixed box is anchored to the viewport, so no amount of page scrolling brings it
— or anything inside it — further into view; scrolling the page to "reveal" it
just drags the reader somewhere else for nothing. The `scrollIntoView` walk now
stops at the first fixed ancestor, itself included, while scrollers *inside* the
fixed subtree still move.

---

## Results

*(filled in below)*


### Region: the scroll probe list (129 files: `css/cssom-view/scroll*` + `navigation-api/scroll-behavior/`)

**462/1579 → 814/1618.** 50 files up, 0 down. Files that could be scored at all
went 116 → 123: several had been reading as could-not-run because the very first
line of the test scrolled something and then waited for it.

(The one row the sweep flagged as down, `element-scroll-promise-after-removal`
3/5 → 2/5, re-measured **5/5 three times solo** on the new binary — a load flake
in an eight-shard parallel sweep, and in fact a two-subtest gain.)

| file | before | after |
|---|---|---|
| `scrollintoview.html` | 0/40 | **40/40** |
| `scroll-behavior-main-frame-root.html` | 5/40 | **40/40** |
| `scroll-behavior-main-frame-window.html` | could-not-run | **28/28** |
| `scroll-behavior-element.html` | 4/39 | **31/39** |
| `element-scroll-promises.html` | 12/24 | **24/24** |
| `element-scroll-promise-interruption.html` | 0/14 | **14/14** |
| `window-scroll-promises.html` | 9/18 | **18/18** |
| `window-scroll-promise-interruption.html` | 0/4 | **4/4** |
| `scroll-offsets-fractional-zoom.html` | 27/72 | **72/72** |
| `scroll-behavior-smooth-positions.html` | 3/23 | **19/23** |
| `elementScroll.html` | 1/8 | **8/8** |
| `HTMLBody-ScrollArea_quirksmode.html` | 7/10 | **10/10** |
| `dom-element-scroll.html` | 2/4 | **4/4** |
| `scrollIntoView-multiple.html` / `-multiple-nested.html` | 0/4 each | **4/4** each |
| `scrollIntoView-scrollMargin.html` / `-scrollPadding.html` | 0/3 each | **3/3** each |
| `scrollIntoView-root-overflow-clip.html` | 0/2 | **2/2** |
| `scrollIntoView-container.html` | 0/5 | **3/5** |
| `scrollWidthHeight-child-border-within-padding.tentative.html` | 0/5 | **5/5** |
| `scrollWidthHeight-overflow-visible-negative-margins.html` | 40/50 | **50/50** |
| `scrollWidthHeight-negative-margin-002.html` | 0/600 | **40/600** |
| `getBoundingClientRect-scroll.html` | 1/6 | **4/6** |
| `navigation-api/scroll-behavior/` (14 files) | 0/1 each | **1/1** each |
| `smooth-scroll-in-load-event.html` | 0/1 | **1/1** |
| `scroll-behavior-smooth.html` · `-default-css` · `-smooth-navigation` | 0–1/3 | **3/3** each |

### Region: `dom/events/scrolling/` — an untouched realm the model unlocked

38 files, measured base-binary vs this one with the same runner:
**9/71 → 34/72, 22 files up, 0 down.**

| file | before | after |
|---|---|---|
| `scrollend-event-fired-for-programmatic-scroll.html` (8 variants) | 0/1 each | **1/1** each |
| `scrollend-event-fired-for-scroll-attr-change.html` (8 variants) | 0/1 each | **1/1** each |
| `scrollend-event-handler-content-attributes.html` | 0/4 | **4/4** |
| `scroll-event-fired-to-element.html` | 2/4 | **4/4** |
| `scrollend-event-not-fired-on-no-scroll.html` | 0/4 | **4/4** |
| `scrollIntoView-in-onscroll-to-sticky.html` | 0/1 | **1/1** |

### Zero-regression ritual

`scripts/wpt-ritual.txt`, 360 scored rows, base binary vs this one, same runner:
**55,257/55,814 → 55,272/55,829. 1 file up, 0 files down.**

⚠️ Four `editing/run/*` rows (each 1000+ subtests) read `could-not-run` in the
after sweep and not in the base one. All four were re-run **solo** on the new
binary and came back **identical to base** (`removeformat` 1831/1832 in 19.6s
against a 25s timeout). They are eight-shard-parallel timeouts, not regressions —
which is the cost of running the ritual at 8× and worth naming so the next
comrade does not chase them.


---

## ⛔ Caps — honest, and not to be mistaken for failures

* **⭐ `float` is not laid out.** Every `scrollIntoView-*-writing-mode*.html` file
  (5 files, 45 subtests) builds its grid out of `float: left` boxes; the engine
  stacks them vertically instead, so the target sits at (0, 800) where the test
  expects (200, 200). The scroll model computes the right answer for the geometry
  it is given — the geometry is wrong. This is the single biggest remaining
  blocker in the realm and it is a **layout** quest, not a scroll one.
* **⭐ `vertical-align: <length>` is not implemented** anywhere in the fork
  (`grep vertical_align blitz-dom` finds nothing). It is the only thing left in
  `scroll-behavior-element.html` (8 subtests): an inline-block with
  `vertical-align: -15px` sits 15px too high, so `scrollIntoView` lands at 235
  where the test wants 250.
* **Iframe documents have no layout in the parent realm.** Every metric on an
  element inside an `<iframe>` read from the embedder falls back to the
  synthetic 100×20 grid, which is why `scrolling-quirks-vs-nonquirks.html`
  (12/30) and the `-in-iframe` half of `scrollIntoView-fixed.html` cannot pass.
  Pre-existing, realm-wide, and much bigger than scrolling.
* **No compositor, so no user scrolling.** `scrollend-event-for-user-scroll`,
  the whole `wheel-event-transactions-*` family and anything driven by a real
  gesture need input that actually moves a scroller. `test_driver`'s scroll
  action is not wired to the model.
* **Scroll snapping** (`scrollend-event-fired-after-snap`,
  `scrollend-with-snap-on-fractional-offset`) — `css-scroll-snap` is unbuilt.
* **`visualViewport`** is still a static object literal, so
  `scrollend-event-fires-on-visual-viewport` cannot pass.
* **Zoom.** `scroll-zoom`, `scrollTo-zoom`, `scroll-offsets-fractional-zoom`'s
  siblings need a real page-zoom factor.
* **`createElementNS("foobarNS", "body")` in an iframe document** reports the
  HTML namespace, so the last four assertions of `scrollingElement.html` see a
  body where the spec sees none. A namespace bug, not a scroll one.

---

## 🧭 Next leverage

1. **⭐⭐⭐ `float` layout.** Named above; it gates five whole scroll files and is
   one of the last big holes in normal-flow layout. Everything downstream of a
   float — text wrapping around an image, a classic two-column page — is wrong
   until it lands.
2. **⭐⭐⭐ `position: fixed` is not viewport-relative** — carried, unchanged, and
   now measurable: `stylo_taffy` maps `Position::Fixed` to Taffy `Absolute`, so a
   fixed box is positioned against its parent's padding box. `getBoundingClientRect`
   already refuses to scroll fixed boxes, and `scrollIntoView` already stops at
   them, so the remaining error is purely the placement.
3. **⭐⭐ A scroll gesture.** The model is there and nothing drives it: wire
   `test_driver`'s scroll action (and CDP `Input.dispatchMouseEvent` wheel) to
   `_lbPerformScroll`, and `dom/events/scrolling`'s user-scroll half plus the
   whole `wheel-event-transactions-*` family become reachable.
4. **⭐⭐ Layout for iframe documents in the parent realm** — realm-wide, and
   worth far more than the scroll rows it would take.
5. **⭐ `vertical-align: <length>`** in the fork's inline layout.
6. **⭐ `visualViewport` as a real object** tied to the model.
7. `css-scroll-snap` (93 files, untouched) now has a scroll model to snap.
