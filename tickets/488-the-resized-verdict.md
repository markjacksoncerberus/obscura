# 📜 Quest #497 — The Resized Verdict

> *`ResizeObserver` was declared twice, eleven thousand lines apart, and the
> second declaration was a total no-op that silently replaced the first.*

---

## Why this realm

`resize-observer` sat at **17.9%** on the frontier survey against a Chrome at
100%, untouched. It is the sibling quest to #496 and it shares the machinery, so
it was nearly free once the frame tail existed.

What it buys is the responsive web without the polling. Before ResizeObserver, a
component that had to re-lay-itself-out when its container changed had exactly
one option: a `resize` listener on the window plus a `setInterval` measuring
itself, forever, on every device. That is a battery cost paid continuously to
answer a question that is almost always "nothing changed" — and on a second-hand
phone it is the difference between a page that scrolls and one that stutters.

---

## What was there

Two things, and the second one won:

```js
// bootstrap.js:11202 — plausible, and wrong
globalThis.ResizeObserver = class ResizeObserver {
  observe(el) { Promise.resolve().then(() => this._callback([{ …hard-coded 100×20… }], this)); }
};

// bootstrap.js:32628 — twenty-one thousand lines later
globalThis.ResizeObserver = class { constructor(){} observe(){} unobserve(){} disconnect(){} };
```

The later assignment wins, so the shipping behaviour was the second one:
**`observe()` did nothing at all.** A component that re-lays-itself-out on resize
simply never did. Nothing threw, nothing logged, and the first implementation —
the one somebody wrote on purpose — had been dead code for however long.

`ResizeObserverEntry` and `ResizeObserverSize` did not exist as interfaces.

**Measured baseline: 16/62 over 9 files.**

---

## What was built

`ResizeObserver`, `ResizeObserverEntry` and `ResizeObserverSize`, with the full
processing model: observations, active and skipped target lists, the depth-gated
delivery loop, and the loop-error notification.

### ⭐⭐ The depth bound is not bookkeeping, it is the thing that stops the tab freezing

A ResizeObserver callback is allowed to resize things. Which can resize things.
Which fires the observer again. The spec's answer is not a re-entrancy guard — it
is that delivery repeats only ever **downward**, at strictly increasing depth:

```
gather at depth 0
while there are active observations:
    depth = broadcast()          # returns the SHALLOWEST depth broadcast
    gather at depth
if anything was skipped: report "ResizeObserver loop completed with
                                 undelivered notifications"
```

Anything that would resize something at or above the current depth is *skipped*,
reported once, and dropped. Without that bound, two elements sizing each other is
an infinite loop inside the rendering steps — which is not a console warning, it
is a frozen tab, and on a slow device it is the OS killing it.

### ⭐ "Calculate depth for node" is over the FLATTENED tree

This is the whole of `calculate-depth-for-node.html`, and it is easy to get
subtly wrong. If depth is computed by walking `parentNode` naively, a node inside
a shadow root terminates at the `ShadowRoot` — a `DocumentFragment`, not an
Element — and comes out *shallow*. Then a callback that observes something inside
a shadow root it just attached looks like it is resizing something above itself,
gets skipped, and the page receives a loop error it did nothing to deserve.

The walk crosses the shadow boundary via `host`. That one line is the test.

### ⭐ `(-1, -1)` is not a size, and that is deliberate

A new observation's last-reported size is `(-1, -1)`, which no box can have. That
is what guarantees the **first** observation always fires — including for a `0×0`
element, whose appearance is precisely the event a page is waiting for.

### ⭐ Re-observing is a way to ask again

`observe()` on an already-observed target calls `unobserve()` first, which resets
the last-reported size. So `observe(el)` on something already being watched is a
deliberate request for a fresh reading, not a no-op.

### ⭐ A FrozenArray must be the SAME array every time

`entry.contentBoxSize` returns one cached frozen array. If it minted a new one per
read, `entry.contentBoxSize === entry.contentBoxSize` would be false and a page
that cached it would be comparing two different objects for the rest of its life.

### ⭐ Neither entry type is constructible

`ResizeObserverEntry` and `ResizeObserverSize` declare no constructor in IDL, so
`new ResizeObserverSize()` from a page is a TypeError. The engine mints them
through a guard flip — the same pattern `MediaQueryList` already uses here.

### One deliberate deviation from the spec, and why

The spec adds every observer to the Document's list at construction. We register
one only while it is actually watching something, and unregister when its last
target goes. Same observable answer; an observer a page built and never used
costs nothing per frame instead of being walked forever.

---

## Results

| file | before | after |
|---|---:|---:|
| `resize-observer/idlharness.window.html` | 14/49 | **48/49** |
| `resize-observer/calculate-depth-for-node.html` | 0/1 | **1/1** |
| `resize-observer/ordering.html` | 0/1 | **1/1** |
| `resize-observer/observe-002.html` | 0/1 | **1/1** |
| `resize-observer/observe-003.html` | 0/1 | **1/1** |
| `resize-observer/notify.html` | 1/4 | 2/5 |
| `resize-observer/svg.html` | 1/3 | 1/12 |
| `resize-observer/observe-001.html` | 0/1 | 0/1 |
| `resize-observer/change-layout-in-error.html` | 0/1 | 0/1 |

**16/62 → 55/72 over the same 9 files.**

Together with #496: **34/142 → 138/184** across the 23 observer files.

---

## And an old quest closed on the way — F6

`resize-observer/eventloop.html` has been an open quest since the frontier
survey, filed as **"HANGS THE ENGINE"**: it wedged the harness twice, Playwright
could not open a new page afterwards, and it was excluded from the survey probe
list as a workaround.

It no longer hangs. **Re-measured on the shipping build: 1/3, one subtest
TIMEOUT, and the server still answers `/json/version` afterwards** — an ordinary
partial score.

The cause is worth writing down, because it was not where the quest said it was.
The old `ResizeObserver` was a no-op, so nothing could hang *inside* it. The hang
was `requestAnimationFrame` being `setTimeout(fn, 0)`: one task per callback,
with nothing bounding a self-rescheduling chain driven from the event loop. The
real frame queue plus the spec's depth bound is what terminates it. **A hang
attributed to a feature turned out to belong to the primitive underneath it** —
which is an argument for fixing primitives rather than the thing that reported
the symptom.

The remaining 2 subtests are the layout cap.

---

## Caps, named honestly

- **⛔ THE SAME LAYOUT CAP (F26).** `observe-001` sets `style.width = "5px"` and
  asserts `contentRect.width === 5`; we report the synthetic box and answer 100.
  The one remaining `idlharness` failure is the same assertion. Every
  `observe-0NN` file beyond the three that pass is a size assertion, and `svg.html`
  needs SVG bounding boxes. The machinery is right; the ruler is not real yet.
- **`change-layout-in-error.html`** times out: it changes layout from inside an
  error handler and waits for the resulting notification, which needs a relayout
  between delivery passes that we cannot perform.
- **`device-pixel-content-box`** is `content-box × devicePixelRatio`, rounded.
  Correct in form; a real engine snaps to the device pixel grid after layout.
- **Border, padding and content boxes are all the same box.** With no computed
  box model there is nothing to subtract, so `contentRect` is positioned at the
  origin rather than at the padding edge.

---

## Next

F26, again and louder. Between #496 and #497 there are now roughly 40 subtests in
two realms whose only obstacle is that `getBoundingClientRect` is a grid.
