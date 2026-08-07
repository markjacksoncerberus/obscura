//! Feature-gated glue between `obscura-browser` and the Blitz-backed
//! `obscura-render` engine. Compiled only with the `render` feature.
//!
//! The bridge is deliberately stateless about the DOM: every render starts from
//! a fresh HTML snapshot of the page's *current* (post-JavaScript) DOM, so a
//! screenshot always reflects the most recent content — including anything JS
//! has loaded or mutated. A per-page cache keyed by a hash of that snapshot
//! skips re-running Stylo/Taffy when nothing has changed.

use std::sync::Arc;
use std::time::Duration;

use obscura_render::{
    ColorScheme, MediaType, RenderEngine, RenderInput, ResolvedDoc, ResourceProvider, Viewport,
};

// The provider that fetches sub-resources through Obscura's HTTP client now
// lives in `obscura-render`, because the JS layout bridge needs the identical
// one: a box measured without the page's stylesheet is a box in the wrong
// place. Re-exported here so the rest of `obscura-browser` keeps its old path.
pub(crate) use obscura_render::ObscuraNetProvider;

use crate::render_mode::ViewportConfig;

thread_local! {
    // One engine — and its bundled `FontContext` — per thread. Obscura runs all
    // pages on a single OS thread, so this is effectively process-wide and the
    // font is parsed once for the entire run.
    static ENGINE: RenderEngine = RenderEngine::new();
}

/// Run `f` with the thread-local render engine.
pub(crate) fn with_engine<R>(f: impl FnOnce(&RenderEngine) -> R) -> R {
    ENGINE.with(|e| f(e))
}

/// A resolved document plus the snapshot hash it was built from, so repeated
/// screenshots / geometry queries reuse the layout until the DOM changes.
pub(crate) struct RenderCache {
    pub(crate) key: u64,
    pub(crate) doc: ResolvedDoc,
}

impl ViewportConfig {
    /// Convert to the physical-pixel [`Viewport`] Blitz lays out against.
    pub(crate) fn to_render_viewport(self) -> Viewport {
        let (pw, ph) = self.physical_size();
        let scheme = if self.dark {
            ColorScheme::Dark
        } else {
            ColorScheme::Light
        };
        Viewport::new(pw, ph, self.device_scale_factor as f32, scheme)
    }

    pub(crate) fn media_type(self) -> MediaType {
        if self.print {
            MediaType::print()
        } else {
            MediaType::screen()
        }
    }
}

/// Hash the inputs that affect the rendered output, so we only re-resolve when
/// the snapshot HTML or viewport actually changes.
pub(crate) fn cache_key(html: &str, vp: &ViewportConfig) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    html.hash(&mut h);
    vp.width.hash(&mut h);
    vp.height.hash(&mut h);
    vp.device_scale_factor.to_bits().hash(&mut h);
    vp.dark.hash(&mut h);
    vp.print.hash(&mut h);
    h.finish()
}

/// Assemble a [`RenderInput`] for the engine.
pub(crate) fn build_input(
    html: String,
    base_url: String,
    vp: ViewportConfig,
    provider: Arc<dyn ResourceProvider>,
) -> RenderInput {
    RenderInput {
        html,
        base_url: Some(base_url),
        viewport: vp.to_render_viewport(),
        media_type: vp.media_type(),
        net_provider: provider,
        resource_timeout: Duration::from_secs(5),
    }
}
