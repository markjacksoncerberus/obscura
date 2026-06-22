# Handoff: black/blank icons & images (SVG `currentColor` + image formats)

Context: investigation into why some icons and React `<img>`s render as **black
boxes** (or **blank/white** boxes) under the Blitz render path.

Key framing fact: Obscura paints onto an **opaque white** page background
(`obscura-render/src/document.rs` — `Color::WHITE` fill before `paint_scene`).
So a failed/transparent image flattens to **white**, never black. That splits
the symptom into two distinct causes:

- **Black box → SVG `currentColor` resolving to black** (fixed in the Blitz fork, see below).
- **Blank/white box → image format Blitz can't decode** (Obscura-side config decision below).

---

## 1. SVG `currentColor` (the black icons) — FIXED in the Blitz fork

Root cause: external `<img src="*.svg">` and `background-image: url(*.svg)` were
parsed by `blitz-dom`'s `parse_svg` with `usvg::Options::default()`. usvg 0.46
has **no current-color option**; it resolves `currentColor` from the SVG's own
`color` presentation attribute, **defaulting to black**. Blitz never fed the
element's computed CSS `color` in, so every `fill="currentColor"` /
`stroke="currentColor"` icon (Lucide, Heroicons, Feather, Tabler, react-icons,
Material Symbols, …) rendered solid black. Inline `<svg>` was already fine — it
substitutes `currentColor` during DOM serialization (`Node::write_outer_html`).

Fix (in `../blitz`, already implemented + unit-tested):
- `parse_svg_with_current_color(source, color)` injects `svg { color: <rgba> }`
  via usvg's `style_sheet` hook; usvg applies it as the root `color` attribute
  and `currentColor` inherits from there (correct CSS semantics).
- SVG image data now retains its raw source bytes so the color can be resolved
  per-referencing-element at **paint time** (the same SVG can appear in elements
  with different `color`).
- Both paint paths (`<img>` in `blitz-paint/src/render.rs::draw_svg`,
  `background-image` in `render/background.rs::draw_svg_image_layer`) resolve
  against `self.style.clone_color()`.

**What Obscura needs to do:** just pull the updated fork. No Obscura code change.

⚠️ Known caveat to be aware of (flagged as `TODO(currentColor prototype)` in
`blitz-paint/src/render.rs::resolve_svg_tree`): the prototype **re-parses the SVG
on every paint**. Fine for one-shot screenshots; for an interactive/repeated-
paint path it should be cached (keyed by resolved color) before relying on it
heavily. Worth a perf check if you render the same page many times.

Does **not** help: icon *fonts* (FontAwesome/Material via `@font-face`) — those
are a separate font-loading concern, not SVG.

---

## 2. Missing image formats (the blank/white boxes) — Obscura decision

The `image` crate in Obscura's build (`obscura-render/Cargo.toml`,
`default-features = false`) currently resolves to codecs: **png, jpeg, gif,
webp** (per `Cargo.lock`). Decode happens in `blitz-dom`'s net layer; on failure
nothing is drawn → blank box on the white background.

Not currently decodable:
- **ICO** — favicons (`<link rel="icon">`). Pure-Rust in the `image` crate
  (`ico` feature, needs `bmp`). Cheap to add.
- **BMP** — pure-Rust (`bmp`). Cheap.
- **AVIF** — **this is the big one for React apps.** Next.js `<Image>` serves
  AVIF by default (`formats: ['image/avif','image/webp']`). ⚠️ AVIF *decoding*
  in the `image` crate requires the `avif-native` feature, which pulls in
  **`dav1d` (a C library)** — it breaks the pure-Rust build Obscura
  deliberately keeps (see the comment in `obscura-render/Cargo.toml`). So this
  is a real tradeoff, not a free feature flag. Options:
    1. Accept the C dependency for AVIF coverage.
    2. Leave AVIF unsupported and rely on sites' WebP fallback (many serve both).
    3. Negotiate content (send an `Accept:` header without `image/avif`) so
       servers return WebP/PNG instead — avoids the decoder entirely.

Suggested cheap win regardless: add `ico` + `bmp` to the `image` features for
favicon coverage. Decide AVIF separately.

To confirm which images are hitting this, grep render logs for
`Could not parse image (...)` (emitted by `blitz-dom/src/net.rs`).

---

## TL;DR for Obscura

1. Pull the updated `../blitz` fork → black `currentColor` SVG icons fixed, no
   code change needed. (Watch the per-paint re-parse perf TODO.)
2. Add `ico`,`bmp` to `image` features in `obscura-render/Cargo.toml` for
   favicons (cheap, pure-Rust).
3. Decide on AVIF: C dep (`dav1d`) vs. rely on WebP fallback vs. `Accept`-header
   content negotiation. This is the likely cause of blank Next.js `<Image>`s.
