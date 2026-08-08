# 🖇️ The Composited Verdict — Quest #510

> **`html/canvas` — Porter-Duff and the blend modes, gradients and patterns,
> shadows, pixel manipulation, and a PNG that is actually a PNG.**
>
> Sibling scrolls: [`109-the-drawn-verdict.md`](109-the-drawn-verdict.md) (the
> surface, state, colour, transforms),
> [`110-the-pathed-verdict.md`](110-the-pathed-verdict.md) (paths, the stroker,
> hit testing).

---

## ⚠️⚠️ First, the thing that stopped the measurement

The baseline run wedged. Not slowly — one shard sat on a single file for
**thirty-four minutes** with a 25-second per-test timeout, and every earlier
attempt at this baseline had died the same way with `Target page, context or
browser has been closed`.

The file was `2d.strokeRect.nonfinite.html`. The old `strokeRect`:

```js
strokeRect(x, y, w, h) {
  …
  for (let px = Math.round(x); px < Math.round(x + w); px++) { … }
```

`ctx.strokeRect(0, 0, Infinity, 50)` ⇒ `px = 0; px < Infinity; px++`.

**Three lines of canvas hang the whole browser, permanently.** Not the page —
the runtime. The tab never returns, the CDP session dies, and the server has to
be killed. The old `fillRect` happened to clamp its loop bounds against the
bitmap size and survived; `strokeRect` did not clamp, and nobody had looked.

This is the second time this campaign has found a **whole-browser denial of
service reachable from a few lines of ordinary JavaScript** (the first was XHR,
quest #493). Both had the same shape: an unbounded loop over a value the page
controls, in code nobody thought of as parsing untrusted input. A canvas call is
untrusted input. Every drawing entry point now rejects non-finite arguments
before it does anything, which the specification required anyway — the spec's
"if any argument is infinite or NaN, return" is not tidiness, it is the bound on
the loop.

The honest baseline row for that file is therefore **HANG**, not a score.

---

## Compositing

Twelve Porter-Duff operators, expressed as the only two numbers any of them
actually are:

```js
'source-over':      (as, ab) => [1, 1 - as],
'destination-atop': (as, ab) => [1 - ab, as],
'xor':              (as, ab) => [1 - ab, 1 - as],
'copy':             ()       => [1, 0],
```

…plus the eleven separable CSS blend modes and the four non-separable ones
(`hue`, `saturation`, `color`, `luminosity`), which cannot be computed one channel
at a time because they are properties of the triple. Leaving those four out would
have been quieter than getting them wrong, but not by much: a page that sets
`globalCompositeOperation = 'luminosity'` and is silently handed `source-over`
gets a picture that is merely incorrect, with nothing to detect.

⭐⭐ **Six operators change pixels the shape never touched.** `copy`,
`source-in`, `source-out`, `destination-in`, `destination-atop` and `clear` must
sweep the **entire clip region**, not the drawn shape's bounding box. Skip that
and `globalCompositeOperation = 'copy'` quietly stops erasing everything it is
supposed to erase — which is the whole point of the ten `2d.composite.uncovered.*`
files. This is why the clip carries a bounding box (see #509): without one, every
`copy` would sweep a full bitmap.

⭐ **A partial clip applies the operation partially, rather than not at all.**
Coverage folds into the source alpha (so an antialiased shape erases softly under
`destination-out`); the clip mask lerps the whole *result* against the original
destination (so a clipped edge antialiases instead of stairstepping). They are two
different maskings and collapsing them into one gets both wrong.

The bitmap is stored **premultiplied, 8 bits per channel** — what every shipping
engine stores, and what the WPT expectations are written against — with all the
arithmetic inside an operation done in floats.

---

## Gradients and patterns

⭐ **A gradient with no colour stops paints NOTHING** — and so does a linear
gradient whose two endpoints coincide, and a radial gradient whose two circles are
identical. "Paints nothing" is not "paints black"; the difference is a chart with
a missing series versus a chart with a black rectangle over it.

⭐ **Colour stops interpolate in PREMULTIPLIED sRGB.** A fade to transparent that
interpolates un-premultiplied detours through the un-premultiplied colour of the
transparent stop — usually black — so every soft edge picks up a grey halo.

⭐ **Equal offsets keep insertion order**, which is how a hard colour band is
built from two stops at the same position, and reversing them reverses the band.

⭐⭐ **A radial gradient wants the LARGEST ω whose circle passes through the
point and still has a non-negative radius.** Taking the smaller root of the
quadratic instead turns a cone gradient inside out — it renders, it looks
plausible, and it is backwards.

Patterns sample through the inverse of `CTM ∘ patternTransform`, with
`repeat`/`repeat-x`/`repeat-y`/`no-repeat` and an out-of-range sample returning
*nothing* rather than a clamped edge pixel.

---

## Shadows

The drawn shape's alpha, offset, blurred, painted in `shadowColor` **under** the
shape itself — and only when the shadow is genuinely switched on, which includes
"opaque colour, zero blur, zero offset" (`2d.shadow.enable.*` pins exactly that
boundary).

The blur is **three box passes**, the standard Gaussian approximation the CSS
filter spec itself sanctions, done separably: `O(W·H)` per pass instead of
`O(W·H·r²)`. That is the difference between a shadow you can afford on a netbook
and one you cannot.

The shadow's alpha is the *content's* alpha — coverage times the paint's alpha —
not the coverage alone, so a half-transparent fill casts a half-transparent
shadow.

---

## Pixels

`ImageData` is a real class with a real `Uint8ClampedArray`, and both facts are
load-bearing: `putImageData` is specified to reject anything that is not genuinely
one, and `instanceof ImageData` is how libraries tell a raw buffer from a wrapped
one. The constructor's two forms and their five distinct error cases are all
implemented, including the one where the data length must be a non-zero multiple
of four *and* of the width.

⚠️ **The pixel methods take `[EnforceRange] long`, and EnforceRange is the whole
difference.** A plain `long` folds `Infinity` to `0`, and then `getImageData(0, 0,
Infinity, 50)` reports an `IndexSizeError` about a **zero-width rectangle** —
blaming the caller for a mistake they did not make. EnforceRange throws a
`TypeError` at the boundary and names the argument that was actually wrong. That
distinction is a whole WPT file (`2d.imageData.get.nonfinite`, 44 assertions), and
it is the difference between a diagnosable bug and a baffling one.

⭐ **Reading outside the bitmap yields transparent black, not an error**, and
negative widths normalise.

⭐ **`putImageData` writes RAW pixels** — no transform, no clip, no `globalAlpha`,
no composite operator. It is the deliberate escape hatch out of the drawing model,
and routing it through the compositor would quietly break every image editor on
the web.

---

## A PNG that is actually a PNG

`toDataURL()` returned a fabricated base64 string with a PNG signature glued to
the front and no image behind it. Anyone who tried to save a chart, POST a
signature, or set that data URL as an `<img src>` got a broken image, silently.

It now writes a genuine PNG: IHDR/IDAT/IEND with real CRC-32s, and a zlib stream
of **uncompressed ("stored") deflate blocks** with a real Adler-32. That keeps the
encoder to fifty lines and needs no compressor, at the cost of a larger file. For
a browser aimed at slow, metered links that is normally the wrong trade — but a
`data:` URL never crosses the network. It is handed straight back to the page that
asked for it.

⭐⭐ **And the anti-fingerprint jitter moved to where the fingerprint is actually
read.** It used to live in the bitmap, where the specification pins every value
and the page's own code has to live with whatever we did to it. It now lives in
the `toDataURL`/`toBlob` export path — the sink a canvas fingerprinter reads —
while `getImageData` returns exactly what was drawn.

This is the `webaudio` lesson again, third time: **a DECLARED value is the wrong
place to hide.** Quest #502 had to move the jitter off
`DynamicsCompressorNode.threshold` because `-24` is specified. A canvas's initial
contents are specified too, and so is the result of filling it green. Defending
against fingerprinting by corrupting values the spec pins does not protect the
reader — it just breaks the image editor, the chart hit-test and the pixel-diff,
and leaves the fingerprinter free to read the same noise every time anyway.

---

## Results

| directory | before | after |
|---|---:|---:|
| `compositing` (10 files sampled) | 6/10 | **10/10** |
| `shadows` (5 files sampled) | 3/5 | **5/5** |
| `pixel-manipulation` (13 files sampled) | 6/13 | **12/13** |
| `drawing-images-to-the-canvas` (6 files sampled) | 2/6 | **4/6** |
| `2d.strokeRect.nonfinite` | **HANG** | **1/1** |

Full per-file numbers in [`../WPT_PROGRESS.md`](../WPT_PROGRESS.md).

### ⚠️ And a regression the per-file diff caught

The first after-pass showed **one** row moving the wrong way:
`2d.drawImage.nonfinite` 1/1 → 0/1.

It had been passing **for free**. The old `drawImage` did nothing for any source
it did not recognise, so a test that draws from an `ImageBitmap` purely to check
that *non-finite coordinates are ignored* passed without the engine ever having
an opinion. The new code correctly rejects unknown source types with a TypeError
— and `ImageBitmap` was not in its list, so it threw on the source and never
reached the question being asked.

A valid `CanvasImageSource` we cannot yet decode must answer **"draw nothing"**,
not **"wrong type"**. Those are different sentences and only one of them is true.
Third instance in this arc of a green row that was never about anything.

---

## ⛔ Honest caps

- **No image decoder reachable from the JS realm.** `drawImage` from an `<img>`,
  a `<video>` or an `ImageBitmap` draws **nothing** — which is exactly what the
  spec says to do for an image that has not finished loading, so it is at least
  the *right* nothing. Canvas-to-canvas `drawImage` works fully.
- **`imageSmoothingEnabled` is stored but sampling is nearest-neighbour**, so a
  scaled `drawImage` has hard edges where Chrome interpolates. Identical on the
  solid-colour sources WPT uses; visible on a photograph.
- **`createImageBitmap`** is not wired to a decoder either.
- **`ctx.filter`** parses and serializes but does not apply.

---

## ▶️ NEXT LEVERAGE — the image decoder is the top of the list

One Rust op unlocks four things at once, and the pieces are already in the tree:

- `crates/obscura-render` already depends on `image` 0.25 with `png`, `jpeg`,
  `ico` and `bmp` features, and `obscura-js` already has an optional `render`
  feature pointing at it — **the bridge built for the layout work in quest #505 is
  the same bridge this needs.**
- `op_image_decode(bytes) -> { w, h, rgba }` gives:
  1. **`createImageBitmap(blob)`** — blobs already hold their bytes in the JS
     realm, so this needs no network work at all. It is the shortest path to the
     whole `drawing-images-to-the-canvas` family (37 files), `2d.composite.image.*`
     (12), `2d.shadow.image.*` (6), and the image `createPattern` tests.
  2. **`<img>` load/error events**, which the previous arc already had at #6 on
     its list and which `sanitizer-inert-document` is blocked on.
  3. **Real favicons and real `<img>` painting** in the renderer path.
  4. **`toBlob` round-tripping** through a decoder we can test against our own
     encoder.

After that: **`editing` — 116,600 subtests, the largest realm on all of WPT, at
zero ledger rows.** It was surveyed and deliberately passed over this arc; it
should not be passed over twice.
