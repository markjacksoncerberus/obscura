//! End-to-end regression test for `@font-face` `unicode-range` subset handling.
//!
//! A single CSS `font-family` is routinely split across many `@font-face` rules
//! whose font files each carry a disjoint slice of the alphabet (next/font emits
//! ~14 such subsets for "Inter"). Fontique offers at most two faces per named
//! family to the shaper, so without special handling every character outside
//! those two subsets renders in the wrong font (or as `.notdef`).
//!
//! This test registers one family, `Split`, backed by three single-glyph fonts —
//! `A`, `B`, and `C`, each given a distinctive advance width (100px / 150px /
//! 200px at a 100px font size). If per-subset selection works, each letter is
//! laid out at *its own* subset's advance; if the family collapsed to one face,
//! at least one letter would fall back to the bundled font's (~68px) advance.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use obscura_render::{
    Bytes, ColorScheme, MediaType, NetHandler, NetProvider, RenderEngine, RenderInput, Request,
    ResourceProvider, Viewport,
};

/// Each subset font contains exactly one ASCII letter, with its advance width
/// overridden so the laid-out box size reveals which font shaped the glyph.
const FONT_A: &[u8] = include_bytes!("fonts/split_a.ttf"); // 'A' @ 100px advance
const FONT_B: &[u8] = include_bytes!("fonts/split_b.ttf"); // 'B' @ 150px advance
const FONT_C: &[u8] = include_bytes!("fonts/split_c.ttf"); // 'C' @ 200px advance

/// A net provider that serves a fixed map of URL → font bytes synchronously and
/// fetches nothing else.
struct FontServer {
    fonts: HashMap<String, &'static [u8]>,
}

impl NetProvider for FontServer {
    fn fetch(&self, _doc_id: usize, request: Request, handler: Box<dyn NetHandler>) {
        if let Some(bytes) = self.fonts.get(request.url.as_str()) {
            handler.bytes(request.url.to_string(), Bytes::from(*bytes));
        }
        // Unknown URLs: drop the handler, delivering nothing.
    }
}

impl ResourceProvider for FontServer {
    fn pending(&self) -> usize {
        0
    }
    fn wait_for_progress(&self, _timeout: Duration) {}
}

#[test]
fn each_unicode_range_subset_shapes_its_own_character() {
    let mut fonts = HashMap::new();
    fonts.insert("https://fonts.test/a.ttf".to_string(), FONT_A);
    fonts.insert("https://fonts.test/b.ttf".to_string(), FONT_B);
    fonts.insert("https://fonts.test/c.ttf".to_string(), FONT_C);

    // One family, three faces, each a single glyph. `inline-block` makes every
    // span an atomic box that shrink-wraps to its glyph's advance width, so the
    // box geometry reports which subset shaped the letter.
    let html = r#"<!DOCTYPE html><html><head><style>
        @font-face { font-family: 'Split'; src: url(https://fonts.test/a.ttf) format('truetype'); }
        @font-face { font-family: 'Split'; src: url(https://fonts.test/b.ttf) format('truetype'); }
        @font-face { font-family: 'Split'; src: url(https://fonts.test/c.ttf) format('truetype'); }
        body { margin: 0; }
        .g { font-family: 'Split'; font-size: 100px; display: inline-block; }
        </style></head><body
        ><span class="g" data-obscura-nid="1">A</span
        ><span class="g" data-obscura-nid="2">B</span
        ><span class="g" data-obscura-nid="3">C</span
        ></body></html>"#;

    let engine = RenderEngine::new();
    let doc = engine.layout(RenderInput {
        html: html.to_string(),
        base_url: Some("https://page.test/".to_string()),
        viewport: Viewport::new(1000, 300, 1.0, ColorScheme::Light),
        media_type: MediaType::screen(),
        net_provider: Arc::new(FontServer { fonts }),
        resource_timeout: Duration::from_secs(5),
    });

    let width = |nid: u64| doc.node_rect(nid).unwrap_or_else(|| panic!("node {nid} laid out")).width;
    let (wa, wb, wc) = (width(1), width(2), width(3));

    // Each letter must be shaped by its *own* subset font: 100 / 150 / 200px.
    // The bundled fallback's advance for these letters is ~68px, so any collapse
    // to a single face would miss one of these by a wide margin.
    assert!((wa - 100.0).abs() < 3.0, "A should be 100px (split_a), got {wa}");
    assert!((wb - 150.0).abs() < 3.0, "B should be 150px (split_b), got {wb}");
    assert!((wc - 200.0).abs() < 3.0, "C should be 200px (split_c), got {wc}");
}
