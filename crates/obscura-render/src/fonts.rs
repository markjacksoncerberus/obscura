//! Deterministic, bundle-only font setup.
//!
//! Obscura targets headless servers and the distroless container, which ship no
//! fonts. Rather than depend on whatever the host happens to have installed
//! (which would make rendering non-reproducible), we embed a single permissive
//! font and register it as the fallback for every generic family, with
//! system-font discovery switched off.

use blitz_dom::{build_single_font_ctx, FontContext};

/// DejaVu Sans, embedded at compile time. Freely redistributable under the
/// Bitstream Vera license; see `assets/fonts/DejaVuSans.LICENSE.txt`.
const BUNDLED_FONT: &[u8] = include_bytes!("../../../assets/fonts/DejaVuSans.ttf");

/// Build a [`FontContext`] backed solely by the bundled font.
///
/// `build_single_font_ctx` constructs a collection with `system_fonts: false`
/// and points `sans-serif`, `serif`, `monospace`, and `system-ui` at the
/// bundled font, so every page resolves text to it regardless of the host.
pub fn bundled_font_context() -> FontContext {
    build_single_font_ctx(BUNDLED_FONT)
}
