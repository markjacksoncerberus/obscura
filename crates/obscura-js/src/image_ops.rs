//! The image decoder, reachable from the JavaScript realm.
//!
//! Obscura has always been able to *paint* an image — `obscura-render` decodes
//! PNG and JPEG for `<img>` and `background-image` inside Blitz's net layer. But
//! the JS realm had no way in. `createImageBitmap(blob)` resolved with a
//! zero-by-zero placeholder, `drawImage(img, …)` drew nothing, and `<img>` never
//! fired `load` or `error`, so every page that waits for a picture waited
//! forever.
//!
//! That is a bigger hole than it sounds. An image is not decoration:
//!
//! - A photo-upload form draws the file to a canvas to resize it *before*
//!   sending, so a 4 MB phone snapshot goes out as 80 KB. Without a decoder the
//!   page uploads the original — on a connection paid for by the megabyte.
//! - A scanned document viewer, a map tile layer, a QR code reader, a captcha:
//!   all of them are `createImageBitmap` and `drawImage`.
//! - `<img onerror>` is how half the web substitutes a placeholder. An engine
//!   that never fires it shows a broken image forever and never falls back.
//!
//! ## What this op is, and what it deliberately is not
//!
//! One op: bytes in, pixels out. It does no network, no caching and no policy —
//! the caller already has the bytes (a `Blob`, an `ArrayBuffer`, or a response
//! body the JS realm fetched through the normal, already-SSRF-checked path), so
//! there is nothing here for an attacker to point at a new origin.
//!
//! ## Decoding is parsing untrusted input, and this one has a budget
//!
//! This campaign has already found two whole-browser denial-of-service bugs in
//! ordinary-looking code that trusted a page-supplied number (`XMLHttpRequest`
//! in quest #493, `strokeRect(0, 0, Infinity, 50)` in #508). An image header is
//! the classic version of that mistake: a 30-byte PNG can honestly declare
//! itself 65535×65535, and a decoder that believes it asks the allocator for
//! 17 GB before it reads a single pixel. On the second-hand laptop this browser
//! exists for, that is not a slow tab — it is the OOM killer taking the whole
//! session.
//!
//! So every decode runs under explicit [`Limits`]. The caps are deliberately
//! sized for a modest machine rather than for the largest image anyone could
//! imagine wanting.

use deno_core::op2;
use deno_error::JsErrorBox;
use image::{ImageDecoder, ImageReader};
use std::io::Cursor;

/// Largest edge we will decode, in pixels.
///
/// Comfortably above any real photograph (a 100-megapixel medium-format frame
/// is ~11600 px on its long edge) and far below the point where the pixel
/// buffer alone would evict everything else on a low-memory device.
const MAX_EDGE: u32 = 16_384;

/// Largest pixel count we will decode: 2^25 ≈ 33.5 M pixels, which is 134 MB of
/// RGBA.
///
/// The edge cap alone is not enough — 16384×16384 passes it and is a gigabyte.
/// Area is the number that costs memory, so area is the number to bound.
const MAX_PIXELS: u64 = 1 << 25;

/// Ceiling on everything the decoder allocates, including its own scratch
/// buffers. `image`'s own limiter enforces this *during* decode, so a
/// progressive JPEG cannot sneak past the header check by growing as it goes.
const MAX_ALLOC: u64 = 256 * 1024 * 1024;

/// Bytes of header in front of the pixels. See [`op_image_decode`].
const HEADER: usize = 16;

/// Decode an encoded image into straight (non-premultiplied) RGBA8.
///
/// Returns one buffer so the whole thing crosses the boundary once:
///
/// | offset | bytes | meaning                              |
/// |--------|-------|--------------------------------------|
/// | 0      | 4     | width, u32 little-endian             |
/// | 4      | 4     | height, u32 little-endian            |
/// | 8      | 4     | EXIF orientation, 1–8 (1 = as-is)    |
/// | 12     | 4     | reserved, zero                       |
/// | 16     | w·h·4 | RGBA, straight alpha, row-major      |
///
/// The orientation is *reported, not applied*. `createImageBitmap` only honours
/// it when the caller asks for `imageOrientation: "from-image"`, and an op that
/// rotated eagerly would make the default case impossible to reach — the caller
/// cannot un-rotate what it never saw un-rotated.
///
/// Errors are returned as ordinary JS errors carrying the decoder's own message.
/// The JS side turns them into the spec's `InvalidStateError` rejection; it must
/// not surface the text, because "unsupported color type" tells a page rather
/// more about the build than it needs to know.
#[op2]
#[buffer]
pub fn op_image_decode(#[buffer] data: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    if data.is_empty() {
        return Err(JsErrorBox::type_error("empty image data"));
    }

    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_EDGE);
    limits.max_image_height = Some(MAX_EDGE);
    limits.max_alloc = Some(MAX_ALLOC);

    let mut reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| JsErrorBox::type_error(format!("unrecognised image data: {e}")))?;
    reader.limits(limits);

    let mut decoder = reader
        .into_decoder()
        .map_err(|e| JsErrorBox::type_error(format!("image decode failed: {e}")))?;

    // Read the orientation BEFORE consuming the decoder — it lives in the EXIF
    // block, which `into_decoder` has already parsed and `read_image` moves out.
    let orientation = decoder
        .orientation()
        .map(exif_tag_of)
        .unwrap_or(1);

    let (w, h) = decoder.dimensions();
    // The header said a size; check it against the area budget before asking for
    // the buffer. `Limits` bounds each edge and the total allocation, but the
    // area rule is ours and it is the one that matches how much of this device's
    // memory a page is allowed to claim for one picture.
    if w == 0 || h == 0 {
        return Err(JsErrorBox::type_error("image has zero dimensions"));
    }
    if u64::from(w) * u64::from(h) > MAX_PIXELS {
        return Err(JsErrorBox::type_error(format!(
            "image too large to decode: {w}×{h}"
        )));
    }

    let img = image::DynamicImage::from_decoder(decoder)
        .map_err(|e| JsErrorBox::type_error(format!("image decode failed: {e}")))?;
    // `to_rgba8` is a no-op clone when the source is already RGBA8 and a real
    // conversion otherwise (palette, greyscale, 16-bit, CMYK JPEG). Every one of
    // those exists on the real web and the JS realm should never have to know
    // which it got.
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    let mut out = Vec::with_capacity(HEADER + rgba.as_raw().len());
    out.extend_from_slice(&w.to_le_bytes());
    out.extend_from_slice(&h.to_le_bytes());
    out.extend_from_slice(&orientation.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(rgba.as_raw());
    Ok(out)
}

/// Map `image`'s orientation enum back to the raw EXIF tag value (1–8).
///
/// The JS side wants the tag rather than a named variant because the transform
/// it has to apply is defined by the tag number in every reference table an
/// author will look at, and because `imageOrientation: "none"` means "report it
/// and do nothing", which needs a value to report.
fn exif_tag_of(o: image::metadata::Orientation) -> u32 {
    use image::metadata::Orientation as O;
    match o {
        O::NoTransforms => 1,
        O::FlipHorizontal => 2,
        O::Rotate180 => 3,
        O::FlipVertical => 4,
        O::Rotate90FlipH => 5,
        O::Rotate90 => 6,
        O::Rotate270FlipH => 7,
        O::Rotate270 => 8,
    }
}
