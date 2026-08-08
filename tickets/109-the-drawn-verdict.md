# 🎨 The Drawn Verdict — Quest #508

> **`html/canvas` — the surface, the state, the colour and the transform.**
> Opens the realm: **5,733 subtests in 3,853 files, Chrome 88.8%, and ZERO ledger
> rows** before this arc.
>
> Sibling scrolls: [`110-the-pathed-verdict.md`](110-the-pathed-verdict.md)
> (paths, winding, the stroker, hit testing),
> [`111-the-composited-verdict.md`](111-the-composited-verdict.md) (compositing,
> gradients, shadows, pixels, a real PNG).

---

## Why this realm, and why now

The standing order (2026-08-02) is to take **untouched realms** over deepening
held ones. A fresh survey of the whole platform against the current Chrome run
left four realms at exactly zero ledger rows: `editing` (116,600 subtests),
`content-security-policy` (4,354), `mathml` (3,472) and **`html/canvas`
(5,733)**.

`editing` is the largest realm on all of WPT and is banked as the next pointer —
it is also a swamp of layout- and selection-dependent behaviour that could eat
three quests and show little. `html/canvas` was chosen instead for a reason that
only appeared once we read the code: it was not missing. **It was lying.**

---

## The gap: a fingerprinting costume with a renderer's name

`_Canvas2D` in `bootstrap.js` was 240 lines. Here is what a page got:

```js
fill() {}
stroke() {}
clip() {}
closePath() {}
bezierCurveTo() {} quadraticCurveTo() {}
translate() {} rotate() {} scale() {}
setTransform() {} resetTransform() {} transform() {}
createLinearGradient(x0,y0,x1,y1) { return { addColorStop(){}, … }; }
isPointInPath() { return false; }
```

Every path-painting operation and **the entire transform stack** was an empty
function. `rect()` did not add to the path — it filled immediately. `arc()`
pushed a marker object nothing ever read.

Two things were worse than empty:

```js
// the constructor
this._buf[i*4+0] = 255 + Math.floor(_fpNoise(i % this._w, …, 0));
```

**The bitmap was born full of per-pixel noise**, when the specification says a
canvas begins as transparent black.

```js
fillText(text, x, y) {
  …
  const on = ((_fpRand(code * 100 + row * 10 + col) > 0.45) && …
```

**`fillText` drew pseudo-random noise from the fingerprint PRNG.** It was a
fingerprint spoofer wearing a font renderer's name.

And `toDataURL()` returned a hand-assembled base64 string with a PNG signature
glued to the front and **no image behind it** — so a page that let you export a
chart, or POST a signature, or set that data: URL as an `<img src>`, got a broken
image and got it silently.

This is the **eleventh** recorded instance of *a feature that answers, and answers
wrong*, and canvas is a bad place for it. Nothing on the page can find out. There
is no exception to catch, no `null` to feature-detect, no console warning. The
chart library asks for a context, gets one, draws its axes, calls `stroke()` —
and is told everything went fine.

Who pays: every chart on every dashboard, every game, every signature pad, every
image cropper, every QR code, every `<canvas>`-based PDF viewer. On the
hand-me-down laptop this browser exists for, those are not decoration — they are
the bank statement, the homework, the form that has to be signed.

---

## ⚠️⚠️ The find underneath it: the canvas was the wrong size, always

```js
this._w = canvas.width || 300;
```

`Element.prototype.width` had **no `canvas` branch** — it returned `undefined`
for every canvas that ever existed. So `canvas.width || 300` was always `300`,
and `<canvas width="100" height="50">` — which is what nearly every canvas test
and a great many real pages write — got a **300 × 150 bitmap**.

That is not a getter returning the wrong number. It is that **the coordinates the
page draws at and the coordinates it measures at were different coordinates**, and
nothing said so. A page that fills its full canvas and reads back
`ctx.getImageData(0, 0, canvas.width, canvas.height)` was passing `undefined` for
both dimensions.

`width` and `height` are now `unsigned long` content-attribute reflections with
the specified 300 × 150 defaults, and assigning either — **even the value it
already had** — resets the bitmap *and* the whole drawing state. `c.width =
c.width` is the canonical "clear the canvas" idiom, and it is a reset, not an
erase: the transform, the clip and the styles go back to their defaults with the
pixels.

---

## The work

**A real `CanvasRenderingContext2D`.** An interface object whose prototype
descends straight from `Object.prototype`, whose instances actually have it as
their prototype, with every member an enumerable own property of the prototype
and every accessor named `get x` / `set x`. The bitmap hangs off a private symbol,
so no page script can reach in and rewrite pixels through a property it guessed.

**The state stack.** `save()` copies the drawing state — not the pixels; conflating
the two is how `save(); fillRect(); restore()` starts un-drawing things. An
**underflowing `restore()` is a no-op**, not an error and not a reset: pages
over-restore in loops all the time and must not have their state wiped for it.
`reset()` clears the bitmap, the stack, the path and the state together.

**Colour.** `fillStyle`/`strokeStyle`/`shadowColor` resolve through the engine's
existing CSS Color 4 parser (`_resolveColorStruct` → `_csConvert`), so canvas gets
`color-mix()`, relative colour syntax, `lab()`/`oklch()` and `currentColor` for
free instead of growing a second, worse colour parser beside the first one.

⭐ **Canvas does NOT serialize colours the way CSSOM does.** `el.style.color =
'#fa0'` reads back `rgb(255, 170, 0)`; `ctx.fillStyle = '#fa0'` reads back
`'#ffaa00'`. Opaque colours serialize as lowercase hex, translucent ones as
`rgba()` with the alpha in its shortest round-tripping form. Two serializers for
one colour, and which one applies depends only on where the colour was written.

⭐ **An unparseable colour is IGNORED, not an error and not a reset.**
`ctx.fillStyle = 'invalid'` leaves the previous fill in place. So does
`ctx.fillStyle = null`. This is the canvas rule for nearly every attribute on the
interface — `lineWidth = -1`, `globalAlpha = 2`, `lineCap = 'wibble'`,
`font = 'nonsense'` all silently keep what was there — and expressing it once, in
a single accessor factory, is what stopped twenty attributes each inventing their
own version of it.

⭐⭐ **An enumerated ATTRIBUTE is silently ignored; the same string as an ARGUMENT
throws.** `ctx.lineCap = 'foo'` is a no-op. `ctx.fill('foo')` is a TypeError.
Same word, two behaviours, decided entirely by where it appears — WebIDL §3.7.10,
and the same lesson quest #502 learned on `PannerNode`.

**The transform stack, for real.** `scale`/`rotate`/`translate`/`transform`/
`setTransform`/`resetTransform`/`getTransform`, with the CTM **baked into every
point at the moment it joins the path** — so `moveTo(); scale(2); lineTo()` really
does produce a path carrying two different transforms. A non-finite argument makes
the call a silent no-op; a singular matrix paints nothing at all.

⭐ **`setTransform(1)` is a TypeError, not an identity transform.** The
one-argument overload takes a `DOMMatrix2DInit` *dictionary*, and WebIDL refuses
to convert a primitive to a dictionary. Accepting it would make a six-argument
call with five arguments missing look like a success.

**Rectangles**, sharing the path machinery rather than duplicating it, so they
cannot drift from it: `fillRect` obeys the transform, the clip, `globalAlpha`,
the composite operator and shadows; `clearRect` obeys the transform and the clip
and **nothing else** — it is a hole punched in the bitmap, not a paint; `strokeRect`
degenerates to a **line** when one dimension is zero and to **nothing** when both
are.

**Arity checks throughout.** `2d.conformance.requirements.missingargs` alone
exercises 78 of them, and they are not pedantry: a canvas call with a missing
argument that silently succeeds is a drawing that silently does not appear.

---

## ⭐⭐⭐ The lesson: the canvas was never measuring the thing

The old `fillRect` **passed** `2d.fillRect.basic`. So did `2d.fillRect.zero`,
`2d.clearRect.basic`, `2d.conformance.requirements.basics`. Four green rows from
an engine that could not draw a triangle, could not rotate anything, and filled
its bitmap with static.

They passed because a test that only ever fills axis-aligned rectangles at the
origin and samples one pixel in the middle is a test that a `for` loop over
`_setPixel` can satisfy. The rows were true and they were not *about* anything.

This is the `webaudio` silence-vs-silence shape (#503) and the
`scrollHeight === clientHeight` shape (#505) in a third realm, and it now has a
general form worth writing down:

> **A green row proves the engine agreed with the test. It does not prove the
> engine did the work.** Ask what the test would have to do to tell the
> difference — and if the answer is "nothing it does", the row is scenery.

The corollary that kept this arc honest: the per-file diff, again. Nothing in the
totals would have shown that four of the rows we already held were free.

---

## Results

Measured over `scripts/wpt-canvas-probe.txt` — 126 files sampled across every
subdirectory of `html/canvas/element`, before and after, per file, on the same
list and the same timeout. Full numbers in
[`../WPT_PROGRESS.md`](../WPT_PROGRESS.md) and in the sibling scrolls; the
headline for this quest's territory:

**Probe total: 55/123 → 119/127 over 126 files, 60 files improved, ZERO
regressions.** This quest's territory:

| directory | before | after |
|---|---:|---:|
| `canvas-context` (context object, prototype, identity) | 3/5 | **5/5** |
| `conformance-requirements` (arity, basics, drawings) | 2/3 | **3/3** |
| `drawing-rectangles-to-the-canvas` | 5/11 | **12/12** |
| `the-canvas-state` (save/restore/underflow) | 8/9 | **9/9** |
| `transformations` | 1/7 | **7/7** |
| `reset` | 0/3 | **3/3** |
| `fill-and-stroke-styles` (colour parse + serialization, gradients) | 2/14 | **15/17** |

The `before` denominators are smaller than the `after` ones in two places, and
that is not a rounding artefact — **four files could not be scored at all before**,
because the engine hung on them. See
[`111-the-composited-verdict.md`](111-the-composited-verdict.md).

---

## ⛔ Honest caps

- **No glyph outlines.** `fillText`/`strokeText` get the geometry right — position,
  `textAlign`, `textBaseline`, `maxWidth` — and paint **nothing**, because this
  engine has no font rasterizer reachable from the JS realm. Painting nothing is a
  deliberate downgrade from painting noise: noise cannot be told apart from a font
  that failed to load, and an empty box can. `measureText` returns **approximate**
  metrics from a built-in advance table and says so here. Bridging `parley` out of
  `obscura-render` is the named fix.
- **`font` accepts the shorthand but resolves `em`/`%` against a fixed 16px**, since
  canvas font sizes are relative to the *element's* computed style and that path is
  not wired up.
- **WebGL is still a stub** and is now honestly labelled as one in the source.
- **`filter`** is stored and serialized but not applied.

## ▶️ Next

The image decoder — see [`111-the-composited-verdict.md`](111-the-composited-verdict.md).
