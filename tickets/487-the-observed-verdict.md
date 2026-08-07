# 📜 Quest #496 — The Observed Verdict

> *`IntersectionObserver` reported `isIntersecting: true` for every target, on
> the first microtask, forever.*

---

## Why this realm

Chosen under the standing order — `intersection-observer` sat at **18.1%** on the
frontier survey against a Chrome at 94.0%, untouched — and then the baseline
turned up something worse than a low score.

IntersectionObserver exists for exactly one reason: **to not spend somebody's
data.** It is the machinery under `loading="lazy"`, under every infinite-scroll
list, under every "don't decode the video until it's on screen". A gallery of two
hundred photographs is supposed to download the four you can actually see.

Told that everything is intersecting, it downloads two hundred.

That is the whole argument for this quest. On the connection this campaign is
for — metered, slow, paid for by the megabyte — the API whose purpose is to save
someone's data was the thing spending it, and reporting success while it did.

---

## What was there

Twelve lines, and they answered every question the same way:

```js
globalThis.IntersectionObserver = class {
  constructor(callback) { this._callback = callback; }
  observe(el) {
    Promise.resolve().then(() => {
      this._callback([{ target: el, isIntersecting: true, intersectionRatio: 1, … }], this);
    });
  }
  unobserve() {}
  disconnect() {}
};
```

Read it as a page would: `observe()` fires once, on a microtask, says *yes,
visible, fully, ratio 1* — and then nothing ever again. `unobserve()` and
`disconnect()` are no-ops, so the observer cannot even be turned off. There is no
`takeRecords()`, no `root`, no `rootMargin`, no `thresholds`, and
`IntersectionObserverEntry` does not exist as an interface, so
`entry instanceof IntersectionObserverEntry` throws rather than returning false.

This is the **tenth** recorded instance of the campaign's worst failure mode: a
feature that *answers, and answers wrong*. A missing API is caught by feature
detection in one line. A lying one is not caught at all.

**Measured baseline: 18/80 over 14 files, 1 could-not-run.**

---

## What was built

A real `IntersectionObserver` and a real `IntersectionObserverEntry`, built
against the spec text rather than against the tests.

- **`rootMargin` / `scrollMargin`** — the spec's *parse a margin* algorithm: one
  to four components, each an absolute length or a percentage, expanded the way
  CSS `margin` expands, and serialized back to four components with units.
- **`threshold`** — the `(double or sequence<double>)` union, validated,
  range-checked, sorted, defaulted to `[0]` when empty, and frozen.
- **`root`** — `(Element or Document)?`, with the root intersection rectangle
  computed from it and dilated by `rootMargin`.
- **`takeRecords()` / `unobserve()` / `disconnect()`** — which is to say, the
  ability to stop.
- **The update algorithm** — registration records with a previous threshold
  index, the entry queue, and delivery as a task.

### ⭐ `requestAnimationFrame` was a timer, and a frame needs a tail

The delivery machinery needed somewhere to live, and there was nowhere to put it:

```js
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
```

That gets the delay about right and the **structure** wrong. HTML collects every
callback registered before a frame begins and runs them all in ONE frame, in
registration order; a callback that asks for another frame is served by the
**next** one. With one task per callback, `rAF(() => rAF(f))` meant "two tasks
from now" instead of "two frames from now" — and, more to the point, there was no
*after the frame*. The rendering steps have a defined tail: the frame's callbacks
run, layout settles, and *then* the geometry observers take their readings.

So `requestAnimationFrame` is now a real frame queue with a tail hook
(`_frameTailSteps`), and both observers register into it. This is the piece that
makes the ordering the WPT helpers assume — double-`rAF`, then a timeout —
actually mean what it means in a browser.

Handles come from the same counter as `setTimeout`, so a frame handle can never
collide with a timer id.

### ⭐ `-1` is not `0`, and that is the first notification

A registration's `previousThresholdIndex` starts at **-1**, not 0. "Never
observed" has to be distinguishable from "observed, and below the first
threshold" — otherwise the very first notification, the one that tells a page
what is on screen at load, never fires at all.

### ⭐ A target that left the tree is not intersecting

`isConnected === false` produces a zero rect and `isIntersecting: false`, which is
what makes `remove-element` mean something: a page watching an element is told
when it goes away, rather than being left believing it is still on screen.

### ⭐ `["foo"]` is a TypeError and `[1.1]` is a RangeError

Two different complaints about two different mistakes — "that is not a number"
versus "a ratio above 1 cannot happen" — and getting them the right way round is
the difference between a useful console message and a confusing one. It falls out
of doing the WebIDL conversion *first* and the range check *second*.

### ⭐ `rootMargin: "1"` is a SyntaxError, not one pixel

A bare number token is not a dimension token. `em` is not an absolute length.
`calc()` is a function. All three fail, and `" "` — zero components — is *not* a
failure: it is `"0px 0px 0px 0px"`, the default.

---

## Results

| file | before | after |
|---|---:|---:|
| `intersection-observer/idlharness.window.html` | 15/50 | **50/50** |
| `intersection-observer/observer-attributes.html` | 1/9 | **9/9** |
| `intersection-observer/observer-exceptions.html` | 0/9 | **9/9** |
| `intersection-observer/observer-callback-arguments.html` | could-not-run | **1/1** |
| `intersection-observer/disconnect.html` | 0/1 | **3/3** |
| `intersection-observer/client-rect.html` | 0/1 | **2/2** |
| `intersection-observer/timestamp.html` | 2/3 | 2/3 |
| `intersection-observer/multiple-targets.html` | 0/1 | 2/5 |
| `intersection-observer/remove-element.html` | 0/1 | 1/6 |
| `intersection-observer/multiple-thresholds.html` | 0/1 | 1/9 |
| `intersection-observer/root-margin.html` | 0/1 | 1/5 |
| `intersection-observer/same-document-no-root.html` | 0/1 | 1/4 |
| `intersection-observer/edge-inclusive-intersection.html` | 0/1 | 1/5 |
| `intersection-observer/display-none.html` | 0/1 | 0/1 |

**18/80 → 83/120 over the same 14 files, 0 could-not-run.**

Note the denominator *grew*. That is not drift: the geometry files chain their
test cycles, and the first cycle used to die on `observer.takeRecords is not a
function`, so the later cycles never registered a subtest at all. Adding the
machinery makes the rest of each file *run* — and then fail on pixels.

---

## Caps, named honestly

- **⛔ THE PIXELS ARE NOT REAL, AND THAT IS THE LAYOUT CAP, NOT AN OBSERVER BUG.**
  Obscura has no layout engine reachable from JS: `getBoundingClientRect` returns
  a stable *synthetic* box per element (a grid keyed by node id — see
  `Element.prototype.getBoundingClientRect`). Everything structural above is real
  and spec-exact; every remaining failure in the table is a rect assertion.
  `display-none.html` wants an all-zero rect for a `display:none` target, which
  needs the same thing. This is quest **F26** — distinct from F7, which is about SCORING reftests; this is about the engine knowing where things are.
- **`timestamp.html` 2/3** — the third subtest compares timestamps across a
  same-origin iframe's own time origin.
- Cross-origin / iframe / scroll-margin / SVG / multicol files were not swept:
  they are geometry files and would score on the same cap.
- **`trackVisibility`** is accepted, clamps `delay` to 100 per spec, and reports
  `isVisible` — but the real visibility algorithm (occlusion, transforms,
  filters, opacity) needs a compositor. It answers `false` unless the target
  intersects, which is the conservative direction: never claim visible.

---

## Next

The observers are now blocked on the same thing four other realms are blocked on.
**F26 — a layout model reachable from JS** — is worth more here than anywhere else on
the map, because IntersectionObserver is the one API where a wrong number costs
the reader money.
