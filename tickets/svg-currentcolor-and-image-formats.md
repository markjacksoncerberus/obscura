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

Performance: the resolved tree is **memoized** on the image data
(`SvgImageData::resolve_tree`, keyed by the computed color), and SVGs that use no
`currentColor` short-circuit to the base tree with no re-parse. Repeated paints
of the same element are free; non-icon SVGs (photos/logos) pay nothing. No perf
caveat for the screenshot path.

Test coverage in the fork: unit tests for fill/stroke/alpha resolution, cache
hit/miss, currentColor-absence short-circuit, inline-SVG passthrough, and
case-insensitive detection; plus **pixel-level** integration tests
(`blitz-html/tests/svg_current_color.rs`) that render an `<img>` SVG through the
real renderer and assert the center pixel matches the CSS `color` (including
inheritance from an ancestor) and is not black.

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
   code change needed. (Resolved tree is memoized — no per-paint reparse.)
2. Add `ico`,`bmp` to `image` features in `obscura-render/Cargo.toml` for
   favicons (cheap, pure-Rust).
3. Decide on AVIF: C dep (`dav1d`) vs. rely on WebP fallback vs. `Accept`-header
   content negotiation. This is the likely cause of blank Next.js `<Image>`s.

---

## RESOLUTION (2026-06-22)

All three items done.

### 1. SVG `currentColor` — DONE (fork)
The `../blitz` fork already carries the fix. Verified end-to-end: the fork's
pixel-level tests pass `3/3` (`cargo test -p blitz-html --test svg_current_color`)
— icons render non-black, tint to the CSS `color`, and inherit from an ancestor.
No Obscura code change.

### 2. ICO + BMP favicons — DONE (pure-Rust)
Added `ico`,`bmp` to the `image` features in
`crates/obscura-render/Cargo.toml`. Cargo unifies image features across the
build, so blitz-dom's decode (`image::ImageReader::with_guessed_format`, used at
`blitz-dom/src/net.rs`) picks them up. Pure-Rust, zero new system deps. Confirmed
the resolved feature set now includes `ico`+`bmp`.

### 3. AVIF — DONE, behind an opt-in `avif` feature (accepts the C dep)
Decision (with the comrade): accept the C dependency, but keep it **opt-in** so
the default build stays pure-Rust and the campaign dev-loop
(`cargo build --features render`) is unaffected.

- New cargo feature `avif`, threaded cli → cdp → browser → render, enabling the
  `image` crate's `avif-native` → the `dav1d` C library. **OFF by default.**
- AVIF decode is correct, verified two ways:
  - `cargo test -p obscura-render --features avif --test avif_decode` decodes a
    real `fox.avif` (8-bit 4:2:0) through the browser's exact decode call and
    matches the reference image (dims `1204×800`, mean + sample pixels).
  - A real browser render (server → dav1d decode → blitz paint → CDP
    screenshot) of an AVIF `<img>` is pixel-accurate to the reference (e.g.
    `(400,200)` → `(138,178,217)` vs ref `(137,179,217)`); 0 blank pixels.
- Notes considered: the `Accept`-header negotiation option was *not* taken — the
  stealth subsystem (`crates/obscura-net/src/client.rs`) sends a fixed
  Chrome-emulation `Accept` advertising `image/avif`; stripping it would weaken
  the fingerprint. `cavif-rs`/`avif-decode` don't help (encoder-only / also a C
  dep). No pure-Rust AVIF *decoder* exists in the ecosystem today.

#### Building with AVIF
`dav1d` requires **libdav1d ≥ 1.3.0** (newer than Ubuntu 22.04's 0.9.2). A
sudo-free, pure-C (no nasm) build script is provided:

```sh
./scripts/build-dav1d.sh                  # builds static libdav1d → ~/.local/dav1d
export PKG_CONFIG_PATH="$HOME/.local/dav1d/lib/pkgconfig:$PKG_CONFIG_PATH"
cargo build --release --features render,avif
```

The static `libdav1d.a` links into the binary — no runtime `.so` path needed.

### Out-of-scope caveat observed (NOT introduced here)
`cargo test -p obscura-render --test font_face_subsets` fails on the current
tree **with or without these changes** (`B` shapes to ~61px fallback instead of
its 150px subset). It's a pre-existing issue in the blitz fork's WIP font path
(unrelated to images/currentColor) — flagged for whoever owns the fork.
