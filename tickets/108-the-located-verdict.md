# 🎯 The Located Verdict — Quest #507

> **`elementFromPoint` · `elementsFromPoint` · `document.scrollingElement` — what
> is actually *at* a place, on the bridge from
> [`106-the-measured-verdict.md`](106-the-measured-verdict.md).**

---

## Why this one matters most for an agent

Quests #505 and #506 answer *"where is this element?"*. This one answers the
question an automation driver actually asks, which is the inverse: **"what is at
this point?"** Every click, every tap, every `test_driver` action resolves
through it. So does light-dismiss on a popover, and so does the WebDriver
"element is pointer-interactable" gate.

Obscura already had a hit test — it walked every element and compared the point
against `getBoundingClientRect()`. Against the synthetic grid that was a
self-consistent fiction: it reliably returned the element whose *own* invented
cell you asked about, which is exactly enough for Playwright to click the thing
it just measured, and no more. Two elements that genuinely overlapped on the real
page did not overlap in the grid, so "which one is on top" was a question the
engine never had to answer.

With real boxes it does. And the answer needs two things the rect alone cannot
give.

---

## ⭐⭐ Two ways to be present and yet untouchable

```html
<div class="overlay">   <!-- covers the button -->
```

- **`visibility: hidden`** — laid out, occupying space, painted nowhere. It has a
  box, and a box the hit test must look straight through.
- **`pointer-events: none`** — painted, deliberately transparent to the pointer.
  This is how a decorative overlay, a gradient scrim, a focus ring, or a
  drag-preview stays out of the way of the thing underneath it.

Both have a perfectly good rect. A hit test that only checks rects returns the
overlay, and the page's own decoration starts swallowing its clicks — the exact
bug `pointer-events: none` was invented to prevent. Both facts now ride along in
the box payload (`_LB_VIS_HIDDEN`, `_LB_PE_NONE`) and both are skipped.

## ⭐ `elementFromPoint(NaN, 0)` must **throw**, not answer `null`

The IDL is `Element? elementFromPoint(double x, double y)`. WebIDL `double` — as
opposed to `unrestricted double` — **rejects** a non-finite value with a
`TypeError`. The old code returned `null`.

`null` is a legitimate answer to this function: it means *nothing is there*. So
answering `null` for `NaN` makes the caller's arithmetic bug indistinguishable
from an empty patch of page, and it will be debugged as a layout problem for an
hour before anyone looks at the coordinate. **A wrong answer that is also a valid
answer is the expensive kind.**

---

## ⭐⭐ `document.scrollingElement`: the property that exists because of a quirk

In standards mode it is the root element. In **quirks mode** it is `<body>`.

That is the whole reason the property was added to the platform. Before it,
every page on the web shipped

```js
var s = document.documentElement.scrollTop || document.body.scrollTop;
```

because there was genuinely no way to ask which of the two the browser would
honour, and the answer depended on a doctype the author often did not control.

Obscura returned `documentElement` unconditionally — it could not have done
better, because until Quest #500 it had never once been in quirks mode.

Two details that are easy to get wrong:

- **The quirks answer is `null` when `<body>` is itself "potentially
  scrollable"** — an overflow other than `visible`/`clip`, with the root not
  hiding its own overflow. In that case the body scrolls its *own* content and
  the viewport scroll belongs to nobody, so returning the body would move the
  wrong thing.
- **It is the spec's "body element", not `document.body`.** The first
  html-namespace `body`/`frameset` child of the root. The WPT test appends a
  `foobarNS`-namespaced `<body>` specifically to check that it counts for
  nothing.

---

## Results

| Test | Before | After |
| --- | :---: | :---: |
| `elementFromPoint-parameters.html` | 0/4 | **4/4** |
| `elementFromPosition.html` | 6/16 | **11/16** |
| `elementFromPoint-001.html` | 0/1 | **1/1** |
| `elementFromPoint.html` | 3/11 | **4/11** |
| `scrollingElement.html` | 0/8 | **4/8** |
| `scrolling-quirks-vs-nonquirks.html` | 10/30 | **10/30** (regression closed) |
| `HTMLBody-ScrollArea_quirksmode.html` | 3/10 | **7/10** |

### ⭐⭐ The root cause behind `scrollingElement`: Quest #500's trap, one path over

The first `scrollingElement` implementation made `scrolling-quirks-vs-nonquirks`
go **10/30 → 7/30**, and the reason was not in the new code:

```
assert_equals: scrollingElement should be documentElement
  expected <html>…  but got null
```

**`compatMode` reported `BackCompat` for every iframe ever loaded** — including
frames that opened with `<!DOCTYPE html>`. `_docCompatFrom` derives the mode from
`doc.doctype`, and `_IframeDocument` parses its markup into a **synthetic
`<html>/<head>/<body>` scaffold that discards the doctype**. By the time the tree
exists there is nothing left to ask.

That is precisely the trap Quest #500 found in `document.write()`, sitting in a
second code path nobody had looked at, and it had been silently mis-classifying
every framed document in the engine. The fix is the same one: **sniff the mode
from the markup while the doctype is still in it.** XHTML is excluded on purpose
— quirks mode is a property of the HTML *parser*, and no HTML parser runs over an
XHTML document.

One line, three files:

| | before | after |
| --- | :---: | :---: |
| `scrolling-quirks-vs-nonquirks.html` | 7/30 | **10/30** |
| `scrollingElement.html` | 0/8 | **4/8** |
| `HTMLBody-ScrollArea_quirksmode.html` | 3/10 | **7/10** |

**A correct implementation surfacing an old bug is the implementation doing its
job.** The regression was real, the cause was not where the change was, and the
per-file diff is the only reason it was ever visible.

---

## ⛔ Honest caps

`css/cssom-view/elementFromPoint.html` is a single file that needs a good deal
more than a box tree, and it is honest to name what:

- **image maps** (`<area shape="poly" coords=…>` hit regions),
- **`border-radius`** — a rounded corner is outside the element even though it is
  inside the rect,
- **SVG hit testing** — a `<path>`'s stroke, and shapes under a `transform`,
- **z-index / stacking contexts** — the hit test still resolves overlap by tree
  order (later and deeper wins), which is correct for the common case and wrong
  wherever `z-index` reorders things.

`elementFromPoint` also still falls back to `<body>` for a point that hits no
box, rather than `null`. That is a deliberate holdover from issue #63 (a null
return breaks ad/analytics bootstraps); the spec says `null`, and unpicking it
wants its own measurement.
