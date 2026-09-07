# 🧲 The Snapped Verdict — `css/css-scroll-snap/`, and the carousel that stopped between slides

> *Quests #667–#672. Region: `css/css-scroll-snap/` — 202 files, an untouched
> realm whose behavioural half had nothing to stand on until
> [the scroll model](493-the-scrolled-verdict.md) existed.*

---

## The gap

The scroll-snap **properties** were already parsed and computed — an earlier arc
had done that work, and the whole `parsing/` subdirectory was green. What the
engine did with them was nothing at all.

`scroll-snap-type: y mandatory` on a container and `scroll-snap-align: start` on
its children described a set of positions that meant something, and every scroll
went straight past them. A carousel landed between two slides. A photo gallery
stopped half a picture along. The measured baseline was **510/788** over 166
scored files, and essentially all of the remainder were one-subtest behavioural
files reading `0/1`.

This is the arc that could not have been attempted before the previous one: there
was no scroll position to adjust.

---

## What was built

### 1. The snap model (Quest #667)

A snap position is an **alignment of one area inside the snapport** — which is
exactly what `scrollIntoView` computes. So there is one implementation of "put
this box there", not two that can disagree: `_lbAlignScroll` serves both.

* the **snapport** is the scrollport reduced by the container's `scroll-padding`;
* a **snap area** is an element's border box grown by its `scroll-margin`;
* `scroll-snap-align`'s two values are the container's **block** and **inline**
  axes, resolved to physical ones through the same `_lbFlow` the rest of the
  scroll model uses — so a right-to-left or vertical carousel snaps to the right
  end of itself.

Every scroll passes through `_lbPerformScroll`, so a `scrollTop =`, a `scrollTo`,
a `scrollIntoView` and a smooth glide all land on the same positions.

### 2. Snap scope, and why it is two rules (Quest #668)

⭐ When only **one** axis snaps, the other stays where it is, so a candidate can
be rejected outright for being off-screen along it. That is what stops a gallery
scrolling *down* from snapping to a picture parked far off to the right and
leaving the reader at a blank scrollport.

When **both** axes snap, neither cross position is known until both are chosen.
So the axes are picked independently first — different elements may supply them,
and often should — and the *pair* is then checked: if the two areas are not both
on screen at the position they jointly imply, the container falls back to the
single nearest area that can satisfy both axes at once. That two-step is what
`snap-to-visible-areas-both` and `snap-to-combination-of-two-elements` pin down
between them, and neither rule alone passes both.

### 3. Areas bigger than the snapport, and proximity (Quest #669)

An area larger than the snapport cannot be *aligned* to it — there is no one
position that shows it. So every position that keeps the snapport inside the area
is valid, and the nearest of those is wherever you already are. Without the rule,
scrolling within a full-bleed section snapped you back to its top edge on every
nudge.

`proximity` means "snap only if you are nearly there". The spec leaves the range
to the UA; 30% of the snapport is what the shipping engines use, and
`not-resnap-outside-proximity-threshold` is written around a threshold small
enough to leave the midpoint between two snap points alone.

### 4. Re-snapping is not an event, it is the truth (Quest #670)

A snapping container is never at rest between snap positions. It snaps the moment
it has areas to snap to — before any script has run — and it **re-snaps** when a
layout change moves them. So the reported position is *derived* rather than
stored: `scrollTop` returns the raw offset put through the snap model, memoized
against the layout snapshot and the raw offsets.

That one change is what makes a carousel that has never been scrolled start on a
slide, and what makes `resnap-on-layout-is-immediate`,
`snap-after-relayout/*` and `resnap-on-snap-alignment-change` work without any
of them needing a scroll at all.

Two things are deliberately exempt. Mid-glide the box really *is* between two
positions and a page watching a smooth scroll has to see that (the animation was
aimed at a snap position to begin with, so it still lands on one). And anything
the snap computation itself measures gets the raw position, or deciding where to
snap would ask where we snapped to.

### 5. The snap events (Quest #671)

`scrollsnapchanging` fires while the target is still moving; `scrollsnapchange`
fires once the container has come to rest on a new one. Both are a real
`SnapEvent` carrying `snapTargetBlock` / `snapTargetInline` — because a carousel
that has snapped needs to know *which* slide it landed on, and the alternative
every page ships today is measuring every child's rect on every scroll.

⚠️ **Ordering**: scroll, then the snap events, then `scrollend`. A page waiting
for "the scroll is over" has to be able to read the target by then, and WPT's own
helper stops listening for snap events the moment `scrollend` arrives — put
`scrollend` first and every snap-event test reads `null`.

The resting target is seeded before the first scroll, or the initial snap that
every mandatory container performs on layout would read as a change and fire an
event nobody scrolled for.

### 6. Cost

Scanning every descendant for `scroll-snap-align` is the expensive half, and the
answer only changes when the layout does — so the area list is cached against the
layout snapshot. Without that cache, a page that reads a scroll position in a loop
re-ran a whole-subtree `getComputedStyle` sweep every time, and the snap-event
files went from passing to timing out.

---

### 7. A wheel action that actually scrolls (Quest #672)

⚠️ **A runner fix, not an engine one, and it was hiding whole files.** The
testdriver bridge in `scripts/wpt_run.py` knew about pointer and key action
sources and nothing else. WebDriver's **wheel** source — `scroll` actions with an
origin and a delta — simply fell on the floor, and because testdriver's action
promise then never settled, the *file* hung rather than the test failing. That is
why adding snap-event support turned `scrollsnapchange-on-user-root-scroll` from
`1/6` into a whole-file timeout: with the feature missing, its support check
failed fast; with it present, the test got as far as asking for input the bridge
could not deliver.

The bridge now fires a real cancelable `wheel` event at the origin and, unless the
page calls `preventDefault()` — which is exactly how a page says "I am handling
this scroll myself" — scrolls the nearest ancestor that can take the delta.

---

## Results

### Region: `css/css-scroll-snap/` (202 files)

**510/788 → 584/796. 43 files up, 1 down.**

| file | before | after |
|---|---|---|
| `scrollTo-scrollBy-snaps.html` | 0/40 | **15/40** |
| `overflowing-snap-areas.html` | 7/11 | **9/11** |
| `snap-inline-block.html` | 0/8 | **8/8** |
| `scroll-snap-stop-002.html` | 2/6 | **5/6** |
| `scroll-snap-type.html` | 2/4 | **4/4** |
| `snap-to-visible-areas-*` (6 files) | 0/1 each | **1/1** each |
| `snap-to-combination-of-two-elements-1` / `-2` | 0/1 each | **1/1** each |
| `snap-after-relayout/*` (8 files) | 0/1–0/4 | **1/1–3/3** |
| `resnap-on-layout-is-immediate` · `-snap-alignment-change` | 0/1 each | **1/1** each |
| `snap-to-zero-height-interior-area.html` | 1/3 | **3/3** |
| `unreachable-snap-positions-001.html` | 0/1 | **1/1** |
| `snapevent-constructor.html` | 0/4 | **3/4** |
| `snapevents-at-document-bubble-to-window.html` | 0/2 | **2/2** |
| `scrollsnapchange-on-programmatic-scroll.tentative.html` | could-not-run | **3/3** |
| `scrollsnapchanging-on-programmatic-scroll.tentative.html` | 0/3 | **3/3** |
| `input/mouse-wheel.html` · `overscroll-snap.html` | 0/1 each | **1/1** each |

⚠️ The one file down is `scrollsnapchange-on-user-root-scroll.tentative` (1/6 →
0/6), and the cause is worth naming: before, `checkSnapEventSupport` found
`window.onscrollsnapchange === undefined` and every test in the file failed
*immediately*, which let its last one — a scrollbar-drag test that early-returns
on platforms with no visible scrollbar — score its point. With the feature
present, the file's first test now gets as far as asking for a **touch** scroll,
which the runner cannot deliver, and hangs the whole file. One subtest, traded
for the 74 the feature won, and it comes back the day touch panning lands.

### Region: the scroll probe list (167 files) — held, and extended by the wheel action

**848/1690 → 856/1690, 11 files up, 0 down.** The gains are the
`wheel-event-*` family in `dom/events/scrolling/`, which had never had an input
source to run against. (One row the parallel sweep flagged as down,
`scroll-behavior-default-css` 3/3 → 0/3, re-measured **3/3 three times solo**.)

### Zero-regression ritual

`scripts/wpt-ritual.txt`, 360 rows shared with the base measurement, base binary
vs this one: **0 files down, 4 up** (`css-nesting/cssom` and
`container-queries/custom-property-style-queries` recovered from could-not-run,
`all-prop-revert-layer` and `trusted-types-event-handlers` each gained a
subtest). With the 20 scroll rows added to the list by the previous arc, the run
scores **55,962/56,543**.

---

## ⛔ Caps — honest, and not to be mistaken for failures

* **Touch panning.** A touch-pointer drag does not scroll. Making it do so is not
  hard, but it would pan on *every* touch drag in every realm, and the
  preventDefault/`touch-action` rules that decide when a drag is a pan are not
  modelled yet — a bigger risk than the rows it would win. The touch halves of
  the snap-event files stay out of reach until then.
* **Keyboard scrolling.** Arrow keys and PageUp/PageDown do not scroll a
  container (`input/keyboard*.html`, `scroll-snap-stop-*`).
* **Scrollbar dragging** needs a rendered scrollbar to grab.
* **`position: absolute`'s containing block.** `scrollTo-scrollBy-snaps.html`
  builds its whole document out of `position: absolute` boxes that, per spec,
  are laid out against the **initial containing block** — so they overflow the
  viewport. Taffy positions them against their parent instead, so they overflow
  the `<body>` scroller and the viewport has no scroll range at all. Same root
  cause as `position: fixed`; 25 of that file's 40 subtests wait on it.
* **The reftest half.** 204 of the realm's 202 probe rows could not be scored;
  the great majority are reftests, which need a real renderer comparison.

---

## 🧭 Next leverage

1. **⭐⭐⭐ The absolute/fixed containing block** — one fix, and it is now the top
   blocker in *two* realms (see the Scrolled Verdict's own list).
2. **⭐⭐ Touch panning and keyboard scrolling**, behind a `touch-action` model.
3. **⭐ `scroll-snap-stop: always`**, which only means anything once a gesture can
   fling past more than one snap position.
4. **⭐ The `scroll-initial-target` / `scroll-start` family** (`.tentative`,
   ~10 files) — a container that starts scrolled to a named child.
