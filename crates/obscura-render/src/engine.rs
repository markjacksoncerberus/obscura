//! The render engine: turns an HTML snapshot into a resolved, paintable document.

use std::sync::Arc;
use std::time::{Duration, Instant};

use blitz_dom::{BaseDocument, DocumentConfig, MediaType, StyleThreading};
use blitz_html::{HtmlDocument, HtmlProvider};
use blitz_traits::net::NetProvider;
use blitz_traits::shell::Viewport;

use crate::document::ResolvedDoc;
use crate::fonts::bundled_font_context;
use crate::net::ResourceProvider;

/// UA stylesheet that collapses all CSS transitions and animations to their end
/// state, so a static screenshot reflects the settled page rather than a frame
/// captured at t=0. See the usage site in [`RenderEngine::layout`] for why this
/// matters (async stylesheet loads turn `transition`s into wrong-colour paints).
const ANIMATION_DISABLING_UA_CSS: &str = "*, ::before, ::after, ::backdrop { \
     transition-duration: 0s !important; transition-delay: 0s !important; \
     animation-duration: 0s !important; animation-delay: 0s !important; \
}";

/// Owns the expensive, reusable state for rendering — currently the bundled
/// [`FontContext`](blitz_dom::FontContext). Build one per process and reuse it
/// across every page and every render; each [`layout`](RenderEngine::layout)
/// clones the font context into a fresh document.
pub struct RenderEngine {
    font_ctx: blitz_dom::FontContext,
}

impl RenderEngine {
    pub fn new() -> Self {
        Self {
            font_ctx: bundled_font_context(),
        }
    }

    /// Parse, style, and lay out `input`, driving the resource provider until it
    /// goes idle (or `input.resource_timeout` elapses), and return the resolved
    /// document ready to paint or query for geometry.
    pub fn layout(&self, input: RenderInput) -> ResolvedDoc {
        let provider = input.net_provider;
        // Upcast for blitz-dom, which only needs the bare `NetProvider`.
        let net: Arc<dyn NetProvider> = provider.clone();

        let config = DocumentConfig {
            viewport: Some(input.viewport.clone()),
            base_url: input.base_url,
            net_provider: Some(net),
            font_ctx: Some(self.font_ctx.clone()),
            media_type: Some(input.media_type),
            // Obscura dispatch serializes renders (one at a time under the V8
            // lock), and a headless server values predictable memory over the
            // global rayon pool. Sequential traversal also sidesteps Stylo's
            // "already mutably borrowed" panic (blitz issue #430) outright.
            style_threading: StyleThreading::Sequential,
            // Blitz's default is `DummyHtmlParserProvider`, whose `parse_inner_html`
            // is an empty function body. Anything that later sets an element's
            // inner HTML on this document — which is how the layout bridge patches
            // a mutation in instead of re-parsing the page — would then drop the
            // old children and add none, silently: no error, no log, just an
            // element that quietly became empty and a box measured off it. Give
            // the document the same real parser that built it.
            html_parser_provider: Some(Arc::new(HtmlProvider)),
            ..Default::default()
        };

        tracing::debug!(html_len = input.html.len(), "render: laying out snapshot");

        let prof = std::env::var_os("OBSCURA_LAYOUT_PROFILE").is_some();
        let tp = Instant::now();
        let mut doc = HtmlDocument::from_html(&input.html, config);
        let t_parse = tp.elapsed();

        // Render the *settled* state, not a mid-transition frame. Blitz has no
        // animation clock: a CSS `transition`/`animation` is evaluated at t=0,
        // so a property still renders at its pre-transition value. This bites
        // real sites hard — external stylesheets load asynchronously, and when
        // they finally apply, any property under `transition` (e.g. a link's
        // `color` going from the UA default to the author colour) animates from
        // its old value. The screenshot then captures the *start* of that
        // animation: e.g. Tailwind links with `transition-colors` paint in the
        // UA default link blue instead of their real colour. Forcing zero
        // duration/delay collapses every transition/animation to its end state.
        // `!important` in the UA origin outranks even author `!important`, so it
        // wins regardless of how the page declares its transitions. This is the
        // same trick headless screenshotters (Playwright/Puppeteer) use.
        doc.add_user_agent_stylesheet(ANIMATION_DISABLING_UA_CSS);

        // Resolve repeatedly: each pass applies bytes delivered since the last
        // one and may request further resources. Stop when the provider is idle
        // or the deadline passes, then do one final resolve to fold in anything
        // that landed during the last wait.
        {
            let base: &mut BaseDocument = &mut doc;
            // Initial resolve discovers `<link>`/`<img>`/etc. and triggers their
            // fetches. Then re-resolve only when a fetch actually completes —
            // re-running Stylo + layout on every tick would burn the whole
            // budget on a complex page (and we'd never wait long enough for the
            // resources to land).
            let tr = Instant::now();
            base.resolve(0.0);
            let t_first_resolve = tr.elapsed();
            let deadline = Instant::now() + input.resource_timeout;
            let mut iters = 1u32;
            while provider.pending() > 0 {
                let now = Instant::now();
                if now >= deadline {
                    break;
                }
                let budget = (deadline - now).min(Duration::from_millis(250));
                provider.wait_for_progress(budget);
                base.resolve(0.0);
                iters += 1;
            }
            let tr2 = Instant::now();
            base.resolve(0.0);
            if prof {
                eprintln!(
                    "[layout-profile]   engine parse={:?} resolve1={:?} resolveN+final={:?} iters={}",
                    t_parse,
                    t_first_resolve,
                    tr2.elapsed(),
                    iters
                );
            }
            let root = base.root_element();
            tracing::debug!(
                resolve_iters = iters,
                pending_at_end = provider.pending(),
                root_w = root.final_layout.size.width,
                root_h = root.final_layout.size.height,
                "render: resolved"
            );
        }

        ResolvedDoc::new(doc, input.viewport)
    }
}

impl Default for RenderEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Everything needed to render one snapshot.
pub struct RenderInput {
    /// Serialized HTML for the page's current DOM. Elements carry a
    /// `data-obscura-nid` attribute so geometry can be mapped back to Obscura
    /// node ids (see [`ResolvedDoc::node_rect`](crate::ResolvedDoc::node_rect)).
    pub html: String,
    /// Base URL for resolving relative resource references.
    pub base_url: Option<String>,
    /// Physical viewport (size already multiplied by the device scale factor).
    pub viewport: Viewport,
    /// CSS media type (`screen` for normal rendering, `print` for print media).
    pub media_type: MediaType,
    /// Where Blitz fetches sub-resources from.
    pub net_provider: Arc<dyn ResourceProvider>,
    /// Upper bound on time spent waiting for resources before painting anyway.
    pub resource_timeout: Duration,
}
