//! Headless HTML/CSS rendering for Obscura, backed by the [Blitz](https://github.com/DioxusLabs/blitz)
//! engine.
//!
//! This crate is only compiled when the host enables Obscura's `render` feature.
//! It takes a serialized HTML snapshot of a page (Obscura keeps ownership of HTML
//! parsing and JavaScript; Blitz runs neither) plus a resource provider, and
//! produces a rasterized image and per-node geometry using a CPU-only pipeline
//! (`anyrender_vello_cpu` — no GPU/wgpu required, so it runs on a headless
//! server with no display or graphics adapter).
//!
//! ## Pipeline
//!
//! ```text
//! HTML snapshot ──▶ HtmlDocument::from_html ──▶ resolve() (style + layout)
//!                                                   │
//!                              ┌────────────────────┴───────────────────┐
//!                              ▼                                         ▼
//!                   paint_scene ▶ RGBA8 ▶ PNG/JPEG            Node::absolute_position
//!                   (screenshots)                            (getBoundingClientRect, …)
//! ```
//!
//! Fonts are deterministic: a single bundled font is registered as the fallback
//! for every generic family and system-font discovery is disabled, so identical
//! input renders identically across machines and containers.

pub mod csp;
mod document;
mod engine;
mod fonts;
mod http;
mod net;

pub use csp::RenderCsp;
pub use document::{ElementPatch, LayoutRect, NodeBox, ResolvedDoc, Size};
pub use engine::{RenderEngine, RenderInput};
pub use http::{decode_data_uri, ObscuraNetProvider};
pub use net::{NoOpNetProvider, ResourceProvider};

// Re-export the Blitz/`anyrender` types embedders need to build a [`RenderInput`]
// so callers (obscura-browser) don't have to depend on the Blitz crates directly.
pub use blitz_dom::MediaType;
pub use blitz_traits::net::{Body, Bytes, NetHandler, NetProvider, Request};
pub use blitz_traits::shell::{ColorScheme, Viewport};

/// Output image format for a screenshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
}

/// A region to crop the rendered image to, in CSS pixels (matching CDP
/// `Page.captureScreenshot`'s `clip`). Converted to physical pixels internally.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Clip {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Options controlling a single paint.
#[derive(Debug, Clone)]
pub struct PaintOptions {
    pub format: ImageFormat,
    /// JPEG quality, 1-100. Ignored for PNG.
    pub quality: u8,
    /// Render the full content height rather than just the viewport
    /// (CDP `captureBeyondViewport`).
    pub full_page: bool,
    /// Optional crop region in CSS pixels.
    pub clip: Option<Clip>,
}

impl Default for PaintOptions {
    fn default() -> Self {
        Self {
            format: ImageFormat::Png,
            quality: 80,
            full_page: false,
            clip: None,
        }
    }
}

/// Errors produced while rendering.
#[derive(Debug, thiserror::Error)]
pub enum RenderError {
    #[error("render produced an invalid pixel buffer ({0})")]
    InvalidBuffer(String),
    #[error("image encoding failed: {0}")]
    Encode(String),
}
