# 🖼️ Quest #511 — The Decoded Verdict

> *`createImageBitmap()` resolved with a picture that was zero pixels wide, and
> told nobody.*

**Realm:** `html/canvas/element/drawing-images-to-the-canvas`,
`html/canvas/element/manual/imagebitmap`, `.../compositing`, `.../shadows`,
`.../fill-and-stroke-styles` (the pattern family)
**Date:** 2026-08-08 · **Status:** ✅ taken

---

## ☀️ Why this one

An image is not decoration. It is the homework diagram, the bus timetable, the
photograph of the form you have to fill in, the QR code at the clinic door.

And it is the single biggest thing a page downloads. The APIs in this quest are
the ones a page uses to spend FEWER bytes on it:

- A photo-upload form draws the file to a canvas to resize it **before** sending,
  so a 4 MB phone snapshot goes out as 80 KB. With no decoder the page uploads
  the original — on a connection paid for by the megabyte.
- A map tile layer, a sprite sheet, a QR reader, a scanned-document viewer: all
  `createImageBitmap` and `drawImage`.

The previous arc built a real canvas rasterizer and then named its largest cap:
**no image decoder was reachable from the JS realm.** This quest closes it.

---

## 🔍 The gap

`createImageBitmap` was two lines:

```js
globalThis.ImageBitmap = class ImageBitmap { constructor(){this.width=0;this.height=0;} close(){} };
globalThis.createImageBitmap = function() { return Promise.resolve(new ImageBitmap()); };
```

The **eleventh** *feature that answers, and answers wrong* this campaign has
found. The page's `await` returned. Its `drawImage` threw nothing. The picture
was not there, and there was no error anywhere for anyone to catch.

`drawImage(img, …)` had the matching hole: every `<img>`, `<video>` and
`ImageBitmap` source resolved to the sentinel `'incomplete'` — "draw nothing,
quietly" — which is the *right* answer for an image that has not loaded and the
wrong one for an image that has.

---

## ⚒️ The work

### One Rust op — `crates/obscura-js/src/image_ops.rs`

`op_image_decode(bytes) -> [w:u32][h:u32][exif:u32][pad][RGBA…]`. The `image`
crate is now a **direct** dependency of `obscura-js` rather than something
borrowed from the optional `render` feature: every codec is pure Rust, so a
build with no renderer still shows pictures.

Feature set `png, jpeg, ico, bmp, **gif**, **webp**` — the last two are new to
the whole browser. Cargo unifies features across crates, so `obscura-render`'s
paint path gained animated-GIF first frames and WebP at the same time. **Both
are formats the real web is full of, and neither was decodable before.**

### Decoding is parsing untrusted input, and this one has a budget

A 30-byte PNG can honestly declare itself 65535×65535, and a decoder that
believes it asks the allocator for 17 GB before reading a pixel. Every decode
runs under explicit `image::Limits` (16384 px per edge, 2²⁵ pixels of area,
256 MB of total allocation). This campaign has already found two whole-browser
denial-of-service bugs in code that trusted a page-supplied number — XHR in
#493, `strokeRect(0, 0, Infinity, 50)` in #508 — and an image header is the
classic version of that mistake.

### A real `ImageBitmap` and a real `createImageBitmap`

Both overloads, both error timings, the crop rect, `resizeWidth`/`resizeHeight`/
`resizeQuality`, `imageOrientation`, `premultiplyAlpha`, `colorSpaceConversion`,
`close()`, and sources: Blob, ImageData, canvas, OffscreenCanvas, ImageBitmap.

`OffscreenCanvas` was rebuilt on the way past: its `getContext` used to create a
**brand-new `<canvas>` on every call**, so a page could draw into one and read
back an empty one.

---

## 📊 Results

| Test | Before | After |
|---|---|---|
| `drawing-images-to-the-canvas` (37 files) | 12/37 | **34/37** |
| `2d.composite.image.*` + `.uncovered.image.*` (18) | 0/18 | **18/18** |
| `2d.pattern.*` (paint / basic / modify, 40) | 13/40 | **35/40** |
| `createImageBitmap-premultiplyAlpha` | 0/12 | **12/12** |
| `createImageBitmap-exif-orientation` | 0/7 | **7/7** |
| `createImageBitmap-bounds` | 0/4 | **4/4** |
| `createImageBitmap-sizeOverflow` | 5/7 | **7/7** |
| `createImageBitmap-invalid-args` | 4/93 | **21/93** |

---

## ⭐ What was learned

### ⭐⭐⭐ `drawImage` has mirrored images for its whole life, and no test could see it

`drawImage` normalised a negative width by flipping the sampler:

```js
const flipX = (sw < 0) !== (dw < 0), flipY = (sh < 0) !== (dh < 0);
```

That is the intuitive reading and it is **wrong**. Both rectangles are defined by
their four corners, so `(100, 78, -100, 50)` and `(0, 78, 100, 50)` are the same
box; `2d.drawImage.negativedir` says so in its title — *"Negative dimensions do
not affect the direction of the image."*

The branch had **never once been evaluated against a real expectation**. With no
decoder there were no pixels, so every test in the family scored 0/1 for a reason
that had nothing to do with the bug underneath it. A green row proves the engine
agreed with the test; a red row does not prove you know *why*.

### ⭐⭐ A CROP is cheap; a RESIZE is not — and the budget belongs on the expensive one

`createImageBitmap(img, 10, 10, 4294967400, 10)` must produce a bitmap 4.3
billion pixels wide that is almost entirely transparent. Refusing costs five
subtests; allocating costs 160 GB.

The answer is a **windowed bitmap**: a logical `w × h` with a smaller `data`
covering only the rectangle that overlaps the source, and transparent black
everywhere else (`_bmIndex`). A crop then costs its *overlap*, not its request.
The pixel budget moves to the resize, which genuinely has to materialise every
output pixel — and that is exactly the seam
`createImageBitmap-sizeOverflow` tests: the huge crop must succeed and scaling it
up must fail with an `InvalidStateError`.

### ⭐⭐ An option you validate and then ignore is still an implementation

`premultiplyAlpha` selects the bitmap's internal storage format. The only
consumer that can tell is a WebGL `texImage2D` upload, which this build does not
have — and WPT's own test asserts that **all nine combinations produce the same
pixel**. So it is validated (a bad enum is a TypeError) and then deliberately not
acted on, with the reason written down. Storing straight alpha under `"none"` and
forgetting to tell `drawImage` would darken every semi-transparent image: a bug
invisible on the opaque squares most suites use, and glaring on a photograph with
a soft edge.

### ⭐ The spec splits this method in two, and WPT tests the seam

Argument mistakes reject **before the first microtask checkpoint** — the caller
should learn about them at the call site. The decode resolves **on a task**,
because a promise that settles inside the current microtask drain means a page
can never yield between "ask for the image" and "have the image": that is how a
gallery of 60 thumbnails freezes a slow device for a second instead of filling in
progressively. A Blob's *usability* is decided by decoding it, so a Blob rejects
async and everything else rejects sync.

### ⭐ Three sentinels, not one

`_c2dBitmapOf` now distinguishes **broken** (throw `InvalidStateError`),
**not-yet-decodable** (draw nothing, silently) and **detached** (throw). HTML's
"check the usability of the image argument" gives three different answers and
they are not interchangeable — collapsing the first into the second is how
`2d.drawImage.nonexistent` passes for free while the engine has no opinion at all.

---

## ⛔ Honest caps

- **No SVG rasterizer reachable from the JS realm.** `drawImage` of an SVG draws
  nothing. (Quest #513 gives it a real *size*.)
- **No video decoder.** `drawImage(video, …)` and `createImageBitmap(video)`
  answer "no current frame", which is the spec's own wording for `HAVE_NOTHING`.
- **Image sampling is nearest-neighbour** in `drawImage`; `createImageBitmap`'s
  resize path is bilinear. `imageSmoothingEnabled` is stored, not honoured.
- **AVIF stays behind `obscura-render`'s optional `avif` feature** — its decoder
  pulls a C library, and a portable build matters more than one format.
- `createImageBitmap-origin.sub.html` (cross-origin) and the `-transfer` /
  `-in-worker-transfer` files need structured-clone transfer of bitmaps.

---

## ▶️ Next

The pattern and shadow families still have a tail (`2d.shadow.pattern.*`,
`2d.pattern.modify.canvas*`, `2d.drawImage.self.2`). See
[`114-the-sourced-verdict.md`](114-the-sourced-verdict.md) for the arc's full
next-leverage list.
