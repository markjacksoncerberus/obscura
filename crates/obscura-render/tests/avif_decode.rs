//! Gated on the `avif` feature (`cargo test -p obscura-render --features avif`),
//! which is the only configuration that links the AVIF decoder.
//!
//! Proves the build can DECODE AVIF, which the headless render path needs for
//! sites (notably Next.js `<Image>`) that serve `image/avif` by default.
//!
//! AVIF decode is not pure-Rust: it requires the `image` crate's `avif-native`
//! feature → the `dav1d` C library (libdav1d ≥ 1.3.0). This test guards that
//! the codec is actually wired in — a plain `cargo test` here fails to link if
//! libdav1d is missing, surfacing the build requirement loudly rather than
//! silently dropping AVIF support back to a blank box.
//!
//! It exercises the SAME entry point the browser uses to decode network image
//! bytes — `image::ImageReader::with_guessed_format().decode()` (see
//! `blitz-dom/src/net.rs`) — so a green here means real `<img src=*.avif>` and
//! `background-image: url(*.avif)` decode in the render pipeline too.
//!
//! Fixture: `tests/fixtures/fox.avif` — the canonical 8-bit 4:2:0 sample from
//! github.com/link-u/avif-sample-images (the most widely-served AVIF profile).
//! Expected pixel constants below were measured from that repo's reference
//! `fox.png`; the PNG itself is not committed (1.3 MB) — only the 80 KB AVIF is.

#![cfg(feature = "avif")]

use std::io::Cursor;

use image::{ImageFormat, ImageReader};

/// Decode a real-world AVIF photo through the exact code path the renderer's
/// net layer uses, and assert the pixels match the known reference.
#[test]
fn fox_avif_decodes_to_the_reference_image() {
    let bytes = include_bytes!("fixtures/fox.avif");

    // Decode via the SAME call the browser's net layer uses for image bytes:
    // guess the format from the magic bytes, then decode. This is the line that
    // returns a blank box (silent failure → white box on the page) when the
    // codec is absent.
    let reader = ImageReader::new(Cursor::new(bytes.as_slice()))
        .with_guessed_format()
        .expect("could not read image header");
    assert_eq!(
        reader.format(),
        Some(ImageFormat::Avif),
        "format autodetection did not recognise AVIF"
    );
    let img = reader
        .decode()
        .expect("AVIF DECODE FAILED — libdav1d not linked / avif-native off")
        .to_rgb8();

    // Exact dimensions — a stub/garbage decode would not land here.
    assert_eq!(img.dimensions(), (1204, 800), "decoded size mismatch");

    // Whole-image mean colour. AVIF here is lossy (YUV420 + quantisation), but
    // the mean is preserved tightly; a wrong colourspace/channel order or a
    // zeroed decode would blow past this tolerance. Reference mean = (51,56,57).
    let (mut sr, mut sg, mut sb) = (0u64, 0u64, 0u64);
    for p in img.pixels() {
        sr += p.0[0] as u64;
        sg += p.0[1] as u64;
        sb += p.0[2] as u64;
    }
    let n = (img.width() * img.height()) as u64;
    let (mr, mg, mb) = ((sr / n) as i32, (sg / n) as i32, (sb / n) as i32);
    assert!(
        (mr - 51).abs() <= 8 && (mg - 56).abs() <= 8 && (mb - 57).abs() <= 8,
        "mean colour off: got ({mr},{mg},{mb}), expected ~(51,56,57) — \
         channel swap or bad decode?"
    );

    // A few reference pixels (measured from fox.png), each within a generous
    // per-channel tolerance for lossy + chroma-subsampled decode. These span a
    // bright sky region and two dark regions, so a channel swap (BGR) or a
    // constant fill fails at least one.
    for &(x, y, er, eg, eb) in &[
        (400u32, 200u32, 137i32, 179, 217),
        (800, 600, 26, 31, 35),
        (100, 100, 8, 14, 12),
    ] {
        let [r, g, b] = img.get_pixel(x, y).0;
        let (r, g, b) = (r as i32, g as i32, b as i32);
        assert!(
            (r - er).abs() <= 30 && (g - eg).abs() <= 30 && (b - eb).abs() <= 30,
            "pixel ({x},{y}) off: got ({r},{g},{b}), expected ~({er},{eg},{eb})"
        );
    }
}
