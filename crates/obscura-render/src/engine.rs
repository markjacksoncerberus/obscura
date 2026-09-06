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

/// The MathML Core user-agent stylesheet (MathML Core Appendix A), expressed in the
/// display values this engine's layout actually has.
///
/// WHY IT IS NOT THE SPEC'S SHEET VERBATIM. MathML Core writes `display: block math`
/// and `display: inline math` — the `math` INNER display type, whose layout is the
/// custom mrow algorithm. Stylo, in the Servo configuration this build uses, has no
/// `math` inner display and this engine has no MathML layout mode. So the sheet below
/// maps each MathML element onto the CSS box that behaves closest to its MathML box:
///
///   * a grouping element (`mrow` and everything that lays its children out in a
///     row — `math`, `msqrt`, `mstyle`, `merror`, `mpadded`, `mphantom`, `maction`,
///     `semantics`, the token elements and unknown MathML elements) becomes an
///     `inline-block`. Its children are themselves inline-level, so they flow left to
///     right on one line and align on their baselines, which is what an mrow does.
///   * `mspace` becomes an `inline-block` whose size comes from its attributes
///     (see the MathML presentational hints in blitz-dom's stylo glue).
///   * the table elements keep the CSS table displays the spec itself gives them.
///
/// This is an HONEST APPROXIMATION, not MathML layout: it gets boxes, sizes, spacing
/// and baseline alignment right for horizontal content, and it does NOT do fraction
/// bars, radical signs or script raising/lowering — those need the real algorithms.
/// The point of it is that until MathML elements had boxes at all, every single
/// MathML test in WPT failed at the same first line: the shared feature-detection
/// helper decides "does this browser support MathML?" by measuring whether
/// `<mspace width="20px">` is 20px wide, so a MathML element with no box meant every
/// test in the realm reported "mspace is not supported" and stopped.
///
/// The `!important` resets are the spec's, and they are load-bearing: MathML Core
/// says these CSS properties do not apply to MathML elements, and UA-origin
/// `!important` is the one declaration an author cannot override — which is exactly
/// the precedence "this property is ignored inside maths" needs.
const MATHML_UA_CSS: &str = r#"
@namespace mathml url(http://www.w3.org/1998/Math/MathML);

/* Universal rules (MathML Core A.) */
mathml|* {
  display: inline-flex;
  align-items: baseline;
  writing-mode: horizontal-tb !important;
  float: none !important;
  align-self: auto !important;
  justify-self: auto !important;
  align-content: normal !important;
  justify-content: normal !important;
  vertical-align: baseline;
}

/* WHY inline-FLEX and not inline-block. An mrow lays out only its ELEMENT children;
   the whitespace a human puts between `<mn>1</mn>` and `<mo>+</mo>` in the source is
   not rendered. Inline layout would turn that whitespace into a real space box, and
   every spacing measurement in the realm would come back one space-width too wide —
   which is exactly what the operator-spacing tests saw. A flex container generates no
   anonymous item for whitespace-only text, so the row contains what MathML says it
   contains, and `align-items: baseline` keeps the children sitting on the same
   baseline the way an mrow does. */

/* Token elements hold TEXT, so they stay inline-block: their whitespace IS content,
   and a flex container would drop a `<mtext> </mtext>` on the floor. */
mathml|mi, mathml|mn, mathml|mo, mathml|ms, mathml|mtext, mathml|mspace,
mathml|annotation {
  display: inline-block;
}

/* The <math> element */
mathml|math {
  direction: ltr;
  text-indent: 0;
  letter-spacing: normal;
  line-height: normal;
  word-spacing: normal;
  font-style: normal;
  font-weight: normal;
}
mathml|math[display="block" i] {
  display: flex;
}

/* <mrow>-like elements */
mathml|semantics > :not(:first-child) { display: none; }
mathml|maction > :not(:first-child) { display: none; }
mathml|merror {
  border: 1px solid red;
  background-color: lightYellow;
}
mathml|mphantom { visibility: hidden; }

/* Tables */
mathml|mtable { display: inline-table; }
mathml|mtr { display: table-row; }
mathml|mtd {
  display: table-cell;
  text-align: center;
  padding: 0.5ex 0.4em;
}

/* Radicals. MathML Core draws a stretchy radical glyph from the math font and an
   overbar across the base; the closest thing this engine can express is the radical
   character itself as generated content. It is not the stretchy construction, but it
   puts a square root sign where a square root sign belongs — and it is what makes
   `<msqrt>` measurably wider than the `<mrow>` with the same content, which is how
   every MathML test in WPT asks whether radicals exist at all.

   Only `<msqrt>`, deliberately: an `<mroot>` with a child count other than two is
   invalid markup that must lay out as a plain mrow, and a UA sheet cannot count an
   element's own children without `:has()`. Since the feature-detection helper reads
   radical support off `<msqrt>` alone, giving `<mroot>` a radical would buy nothing
   and would make every invalid-markup row 11px too wide. CAP: a well-formed
   `<mroot>` therefore draws no radical sign and no index. */
mathml|msqrt::before {
  content: "\221A";
}

/* Fractions. An mfrac stacks its numerator over its denominator — a flex COLUMN —
   but ONLY when it is well-formed: MathML Core says an mfrac whose child count is
   anything other than two is invalid markup that lays out as a plain mrow, i.e. a
   row. */
mathml|mfrac {
  padding-inline: 1px;
}
/* (the stacking direction of a well-formed `<mfrac>`, `<munder>`, `<mover>` or
   `<munderover>` — and the over/base/under reordering of the last — is decided in
   blitz-dom's style flush: it has to count the element's IN-FLOW children, which
   means reading the children's computed styles, which no stylesheet rule here can
   do.) */
"#;

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
        doc.add_user_agent_stylesheet(MATHML_UA_CSS);

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

        ResolvedDoc::with_provider(doc, input.viewport, Some(provider))
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
