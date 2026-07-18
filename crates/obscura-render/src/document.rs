//! A resolved Blitz document: paint it to an image, or query node geometry.

use std::collections::HashMap;

use anyrender::{render_to_buffer, PaintScene};
use anyrender_vello_cpu::VelloCpuImageRenderer;
use blitz_dom::util::Color;
use blitz_dom::BaseDocument;
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::shell::Viewport;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder, RgbaImage};
use kurbo::{Affine, Rect};
use peniko::Fill;

use crate::{ImageFormat, PaintOptions, RenderError};

/// The attribute Obscura stamps on every element when serializing its DOM, so a
/// painted Blitz node can be mapped back to the originating Obscura node id.
const NID_ATTR: &str = "data-obscura-nid";

/// A box in CSS pixels (matching `getBoundingClientRect` / CDP box-model units).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LayoutRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A width/height pair in CSS pixels.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

/// A styled, laid-out document. Hold one of these to take multiple screenshots
/// or answer many geometry queries without re-resolving.
pub struct ResolvedDoc {
    doc: HtmlDocument,
    viewport: Viewport,
    /// Obscura `NodeId` → Blitz node id, built from the `data-obscura-nid`
    /// attributes once after layout.
    nid_map: HashMap<u64, usize>,
}

impl ResolvedDoc {
    pub(crate) fn new(doc: HtmlDocument, viewport: Viewport) -> Self {
        let nid_map = build_nid_map(&doc);
        Self {
            doc,
            viewport,
            nid_map,
        }
    }

    /// The size of the root element's layout box, in CSS pixels. For a normal
    /// document this is the full content size (the root grows to fit overflow),
    /// which is what a full-page screenshot and `getLayoutMetrics.contentSize`
    /// want.
    pub fn content_size(&self) -> Size {
        let root = self.doc.root_element();
        Size {
            width: root.final_layout.size.width as f64,
            height: root.final_layout.size.height as f64,
        }
    }

    /// Absolute layout box (CSS pixels, document coordinates) for the element
    /// that Obscura knows as `obscura_nid`, or `None` if it isn't laid out
    /// (e.g. `display: none`) or wasn't in the snapshot.
    pub fn node_rect(&self, obscura_nid: u64) -> Option<LayoutRect> {
        let &blitz_id = self.nid_map.get(&obscura_nid)?;
        let node = self.doc.get_node(blitz_id)?;
        let pos = node.absolute_position(0.0, 0.0);
        let size = node.final_layout.size;
        Some(LayoutRect {
            x: pos.x as f64,
            y: pos.y as f64,
            width: size.width as f64,
            height: size.height as f64,
        })
    }

    /// The Obscura-node-id → Blitz-node-id map for this document.
    pub fn nid_map(&self) -> &HashMap<u64, usize> {
        &self.nid_map
    }

    /// Paint the document and encode it per `opts`. The painted buffer always
    /// has an opaque background (Chrome's default), so premultiplied RGBA8 from
    /// the rasterizer is already straight alpha.
    pub fn render_image(&mut self, opts: &PaintOptions) -> Result<Vec<u8>, RenderError> {
        let scale = self.viewport.scale_f64();
        let (phys_w, viewport_h) = self.viewport.window_size;
        let width = phys_w.max(1);
        let height = if opts.full_page {
            let content_px = (self.content_size().height * scale).ceil() as u32;
            content_px.max(viewport_h).max(1)
        } else {
            viewport_h.max(1)
        };

        let doc: &mut BaseDocument = &mut self.doc;
        let rgba = render_to_buffer::<VelloCpuImageRenderer, _>(
            |scene| {
                // Opaque white page background, like a real browser.
                scene.fill(
                    Fill::NonZero,
                    Affine::IDENTITY,
                    Color::WHITE,
                    None,
                    &Rect::new(0.0, 0.0, width as f64, height as f64),
                );
                paint_scene(scene, doc, scale, width, height, 0, 0);
            },
            width,
            height,
        );

        encode_image(rgba, width, height, opts, scale)
    }
}

/// Walk the tree from the root, recording every element that carries a
/// `data-obscura-nid` attribute.
fn build_nid_map(doc: &HtmlDocument) -> HashMap<u64, usize> {
    let mut map = HashMap::new();
    let mut stack = vec![doc.root_node().id];
    while let Some(id) = stack.pop() {
        let Some(node) = doc.get_node(id) else {
            continue;
        };
        if let Some(element) = node.element_data() {
            if let Some(value) = element
                .attrs()
                .iter()
                .find(|a| a.name.local.as_ref() == NID_ATTR)
            {
                if let Ok(nid) = value.value.parse::<u64>() {
                    map.insert(nid, id);
                }
            }
        }
        stack.extend(node.children.iter().copied());
    }
    map
}

fn encode_image(
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    opts: &PaintOptions,
    scale: f64,
) -> Result<Vec<u8>, RenderError> {
    let img = RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| RenderError::InvalidBuffer(format!("expected {width}x{height} RGBA8")))?;

    let img = match opts.clip {
        Some(clip) => {
            // CDP clip is in CSS pixels; the buffer is physical pixels.
            let x = ((clip.x * scale).round().max(0.0) as u32).min(width.saturating_sub(1));
            let y = ((clip.y * scale).round().max(0.0) as u32).min(height.saturating_sub(1));
            let w = ((clip.width * scale).round().max(1.0) as u32).min(width - x);
            let h = ((clip.height * scale).round().max(1.0) as u32).min(height - y);
            image::imageops::crop_imm(&img, x, y, w, h).to_image()
        }
        None => img,
    };

    let (w, h) = (img.width(), img.height());
    let mut out = Vec::new();
    match opts.format {
        ImageFormat::Png => PngEncoder::new(&mut out)
            .write_image(&img, w, h, ExtendedColorType::Rgba8)
            .map_err(|e| RenderError::Encode(e.to_string()))?,
        ImageFormat::Jpeg => {
            // JPEG has no alpha; flatten to RGB (background is already opaque).
            let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
            JpegEncoder::new_with_quality(&mut out, opts.quality.clamp(1, 100))
                .encode_image(&rgb)
                .map_err(|e| RenderError::Encode(e.to_string()))?;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use blitz_traits::shell::{ColorScheme, Viewport};

    use crate::engine::{RenderEngine, RenderInput};
    use crate::{ImageFormat, MediaType, NoOpNetProvider, PaintOptions};

    fn render(html: &str, width: u32, height: u32) -> crate::ResolvedDoc {
        let engine = RenderEngine::new();
        engine.layout(RenderInput {
            html: html.to_string(),
            base_url: Some("https://example.test/".to_string()),
            viewport: Viewport::new(width, height, 1.0, ColorScheme::Light),
            media_type: MediaType::screen(),
            net_provider: Arc::new(NoOpNetProvider),
            resource_timeout: Duration::from_secs(1),
        })
    }

    #[test]
    fn renders_a_png_of_the_right_size() {
        let mut doc = render(
            r#"<!DOCTYPE html><html><body style="margin:0">
                 <div data-obscura-nid="42"
                      style="width:100px;height:50px;background:#ff0000"></div>
               </body></html>"#,
            200,
            120,
        );
        let png = doc
            .render_image(&PaintOptions {
                format: ImageFormat::Png,
                ..Default::default()
            })
            .expect("render");

        // A real PNG, far bigger than the old 1x1 stub.
        assert!(png.len() > 100, "png too small: {} bytes", png.len());
        let decoded = image::load_from_memory(&png).expect("decode").to_rgba8();
        assert_eq!(decoded.dimensions(), (200, 120));

        // The red box occupies the top-left 100x50; sample its middle.
        let px = decoded.get_pixel(50, 25);
        assert!(
            px[0] > 200 && px[1] < 60 && px[2] < 60,
            "expected red at (50,25), got {px:?}"
        );
        // Outside the box is the white page background.
        let bg = decoded.get_pixel(150, 100);
        assert!(
            bg[0] > 240 && bg[1] > 240 && bg[2] > 240,
            "expected white background, got {bg:?}"
        );
    }

    #[test]
    fn maps_node_geometry_back_to_obscura_ids() {
        let doc = render(
            r#"<!DOCTYPE html><html><body style="margin:0">
                 <div data-obscura-nid="7"
                      style="width:100px;height:50px"></div>
               </body></html>"#,
            200,
            120,
        );
        let rect = doc.node_rect(7).expect("node 7 laid out");
        assert!((rect.width - 100.0).abs() < 1.0, "width {rect:?}");
        assert!((rect.height - 50.0).abs() < 1.0, "height {rect:?}");
        assert!(doc.node_rect(999).is_none(), "unknown id should be None");
    }
}
