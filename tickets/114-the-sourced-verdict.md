# 📐 Quest #513 — The Sourced Verdict

> *`srcset` is how a page offers a small file to a small device. We were
> declining to ask for it.*

**Realm:** `html/semantics/embedded-content/the-img-element` (responsive images
+ SVG natural dimensions)
**Date:** 2026-08-08 · **Status:** ✅ taken

---

## ☀️ Why this one

This is the most on-mission feature in the whole arc.

`srcset` is how a page says *"here is the same picture at three sizes; take the
one that suits your screen."* A phone with a 360-pixel display on a pay-per-
megabyte connection is supposed to download the 360-pixel file. An engine that
reads only `src` downloads the 1600-pixel desktop original — often ten times the
bytes, for an image that will be scaled down and thrown away.

Every responsibly built site on the web **already ships the small file**. The
author did the work. We just weren't asking for it.

The other half of the quest is SVG. Logos, icons and charts are SVG now, and it
is the format a slow connection benefits from most — a few hundred bytes instead
of three resolutions of PNG. We reported **0×0** for every one of them, which
makes the header collapse and the page reflow as each arrives.

---

## 🔍 The gap

- `srcset`, `sizes` and `<picture>` were **entirely absent**. `currentSrc` did not
  exist. `update-the-source-set.html` scored 0/89.
- An SVG `<img>` had no size. Quest #512 had made it *load* rather than error
  (the file is fine; we merely cannot paint it) — but with `naturalWidth === 0`,
  which is a different lie.

---

## ⚒️ The work

### An SVG image's natural size, without rasterizing it

`_svgNaturalSize` reads the root `<svg>` element's `width`, `height` and
`viewBox` and runs **CSS Images §default-sizing-algorithm** against HTML's
default object size of 300×150 — the same numbers a `<canvas>` defaults to, and
for the same reason. No rasterizer needed: the size is written down in the file.

### The three responsive-images algorithms, in order

1. **Parse a srcset attribute** — URL, then at most one descriptor per axis,
   with parenthesis-aware descriptor tokenizing.
2. **Update the source set** — walk a `<picture>` parent's children, honouring
   `media`, `type` and namespace, falling back to the `<img>`'s own
   `srcset`/`src`.
3. **Select an image source** — normalise every candidate to a density and take
   the **smallest one that still covers the display**, largest as fallback, ties
   to the first.

Plus `parse a sizes attribute` (media conditions through `matchMedia`, lengths
through a small unit table), `currentSrc`, and density-corrected
`naturalWidth`/`naturalHeight`.

---

## 📊 Results

| Test | Before arc | After |
|---|---|---|
| `update-the-source-set` | 0/89 | **88/89** |
| `naturalWidth-naturalHeight-width-height` | 0/258 | **206/258** (fresh server) |
| `img.complete` | 0/19 | **16/19** |
| `picture-loading-lazy` | 0/4 | 3/4 |
| `img-picture-ancestor` | 0/4 | 1/4 |

**Whole arc, both realms, 233 files: 189/1036 → 601/1036, 76 files improved,
ZERO regressions.**

---

## ⭐ What was learned

### ⭐⭐⭐ Choosing the SMALLEST sufficient density is the entire point

On a 1× screen, `srcset="a.jpg 1x, a@3x.jpg 3x"` must fetch `a.jpg`. Fetching the
3× file spends nine times the bytes to draw exactly the same pixels. "Pick the
last one", "pick the biggest" and "pick the first" are all one line of code and
all three are the wrong line — and none of them would fail a correctness test
that only checks *an* image appeared.

### ⭐⭐ Density correction is what stops a retina image laying out at double size

`srcset="photo@2x.jpg 2x"` means the file has twice as many pixels as the space
it occupies, so a 640-pixel-wide file reports `naturalWidth === 320`: the size it
will **draw** at, which is the number every layout decision needs. Report the raw
pixel count and every high-DPI image is twice as big as intended — the classic
"everything is huge on my phone" bug.

**⚠️ And only dimensions that came from the FILE are corrected.** An SVG that
declares no width falls back to 300×150, and those are not the image's own
pixels; dividing them by the density shrinks a picture nobody ever measured. The
bitmap therefore carries an `intrinsic: {w, h}` pair saying which axes are its
own. A dimension derived from a declared one *through the aspect ratio* counts as
the image's own — because the ratio is the image's own too.

### ⭐⭐ A degenerate `viewBox` gives NO aspect ratio — not a 0:0 one

`viewBox='0 0 10 0'` must leave every other rule untouched: `width='60'` with
that viewBox is 60×150, not 60×0. But `width='0'` with a *real* 3:1 viewBox
really is 0×0, because zero is a natural dimension and negative is not.

That distinction — **zero is a value, negative is an absence** — runs through the
whole algorithm. `width="0"` means "this image is zero pixels wide"; `width="-5"`
means "there is no width here, use the default 300". Collapse them and eighteen
subtests move in opposite directions.

### ⭐⭐ `<source>` is an HTML element, and an SVG one is not it

The suite really does put a `<source srcset>` inside an inline `<svg>` to check
the engine does not pick it up. Matching on `localName` alone takes the bait; the
namespace check is one line and it is the difference between honouring a
`<picture>` and hallucinating one.

### ⭐ A vector image is "not fully decodable", which is a state the spec already has

An SVG now has an honest size and no pixels. `drawImage` draws nothing and throws
nothing — exactly the spec's wording for a source that is not fully decodable.
Reporting it as *broken* would be a lie: the file is fine. That single
distinction is what keeps `2d.pattern.image.zerowidth`, `2d.drawImage.zerosource.image`
and `2d.pattern.svgimage.zerowidth` green while the realm around them changed
underneath.

### ⚠️ A TIMEOUT that clears on a fresh server is degradation, not a regression

`naturalWidth-…` read 56/258 TIMEOUT at the end of a long batch and **206/258 OK**
on a fresh server thirty seconds later. The campaign has documented this before;
it is worth re-stating because the first reading looked exactly like a
catastrophic regression in work that had just been measured green.

---

## ⛔ Honest caps

- **No SVG rasterizer from the JS realm.** We now know how big an SVG is and
  still cannot paint it. Bridging `usvg`/`resvg` out of `obscura-render` — the
  same shape of bridge quest #505 built for layout and #511 built for the
  decoder — is the third and last piece.
- `sizes` resolves `em`/`rem` as a flat 16px (no font resolution) and does not
  understand `calc()`.
- Source selection does not re-run on a **`<source>`** attribute mutation, only
  on the `<img>`'s own `src`/`srcset`/`sizes`.
- `loading="lazy"` is parsed and ignored — it wants wiring to
  `IntersectionObserver`, which #496 made real.
- Density-corrected `img.width` **while rendered** should come from layout.

---

## ▶️ NEXT LEVERAGE — in order

1. **⭐⭐⭐ `editing` — 116,600 subtests, the LARGEST realm on all of WPT, still
   zero ledger rows.** It was surveyed and deliberately passed over by the
   previous arc, and passed over again by this one because the image decoder was
   a named root-cause primitive with a wider tail. **It must not be passed over a
   third time.** `document.execCommand` and friends are what every rich-text
   editor, comment box and CMS on the web runs on.
2. **⭐⭐ AN SVG RASTERIZER REACHABLE FROM JS.** `obscura-render` already has the
   pieces. It closes `drawImage` of an SVG, `createImageBitmap` of an SVG, real
   SVG `<img>` painting, and `sanitizer-svg-animate`.
3. **⭐ `loading="lazy"` → `IntersectionObserver`.** The observer became real in
   #496 and the attribute is still inert — and lazy loading is the *other* half
   of "do not download what nobody will see". ~15 subtests plus every gallery.
4. **The canvas image tail:** `2d.shadow.pattern.*` (4), `2d.pattern.modify.canvas*`
   (2), `2d.drawImage.self.2`, `2d.pattern.transform.invalid`,
   `createImageBitmap-drawImage` 10/55 and `-flipY` 4/22 (both still gated behind
   the video factory in their shared helper).
5. **Structured-clone transfer of `ImageBitmap`** — unlocks `-transfer`,
   `-in-worker-transfer`, `-serializable`.
6. **`content-security-policy` (4,354 subtests, zero rows)** and **`mathml`
   (3,472, zero rows)** remain the biggest untouched realms after `editing`.
7. **STORAGE ON DISK** — ten quests have now named it.
