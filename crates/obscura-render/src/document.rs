//! A resolved Blitz document: paint it to an image, or query node geometry.

use std::collections::HashMap;

use std::sync::Arc;
use std::time::{Duration, Instant};

use anyrender::{render_to_buffer, PaintScene};
use anyrender_vello_cpu::VelloCpuImageRenderer;
use blitz_dom::util::Color;
use blitz_dom::BaseDocument;
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::shell::Viewport;

use crate::net::ResourceProvider;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder, RgbaImage};
use kurbo::{Affine, Rect};
use peniko::Fill;

use crate::{ImageFormat, PaintOptions, RenderError};

/// The attribute Obscura stamps on every element when serializing its DOM, so a
/// painted Blitz node can be mapped back to the originating Obscura node id.
const NID_ATTR: &str = "data-obscura-nid";

/// One element's current state, as the page's own serializer sees it: the
/// attributes it carries and the markup of its children.
///
/// The unit of an incremental layout update. Note there is no "what changed"
/// here — only "what it is now". The journal that produces these knows which
/// element was touched but not how, and rebuilding an element from the page's
/// own serialization is the only patch that provably agrees with what a full
/// re-parse would have built.
pub struct ElementPatch {
    /// The Obscura node id, as stamped in `data-obscura-nid`.
    pub nid: u64,
    /// `(local name, value)` pairs, in document order — the same names the
    /// Obscura serializer emits, so the patched element matches a re-parse.
    pub attrs: Vec<(String, String)>,
    /// The element's children, serialized with `data-obscura-nid` stamps.
    pub inner_html: String,
}

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

/// A pseudo-element's box: border-box geometry plus the edge widths needed to
/// derive the content/padding/margin boxes (GeometryUtils' four `box` options).
/// Edges are `[top, right, bottom, left]`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PseudoBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub border: [f64; 4],
    pub padding: [f64; 4],
    pub margin: [f64; 4],
}

/// Everything CSSOM View needs to know about one laid-out element, in CSS
/// pixels, read straight off the box the layout engine computed.
///
/// The rect is the **border box** in document coordinates — the same box
/// `getBoundingClientRect()` reports (minus the scroll offset, which the caller
/// applies). The border/padding edges come along separately because the
/// `client*` and `offset*` families measure to *different* edges of the same
/// box, and reconstructing one from the other is impossible after the fact.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NodeBox {
    /// Border-box position and size in document coordinates.
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Border widths (`clientTop` is `border_top`, and `clientWidth` subtracts
    /// `border_left + border_right` from `width`).
    pub border_top: f64,
    pub border_right: f64,
    pub border_bottom: f64,
    pub border_left: f64,
    /// Padding widths, kept so a caller can derive the content box.
    pub padding_top: f64,
    pub padding_right: f64,
    pub padding_bottom: f64,
    pub padding_left: f64,
    /// Union of the border box and everything overflowing it — the basis for
    /// `scrollWidth`/`scrollHeight`.
    pub scroll_width: f64,
    pub scroll_height: f64,
    /// How far this box is currently scrolled.
    pub scroll_left: f64,
    pub scroll_top: f64,
    /// False when the element generates no box at all (`display: none`, or an
    /// ancestor is). Such an element must report an all-zero rect *and* be
    /// invisible to hit-testing — a zero-sized box that still exists is a
    /// different thing, so the two cases cannot share a representation.
    pub has_box: bool,
    /// True when this element establishes a containing block for absolutely
    /// positioned descendants (`position` is not `static`), which is what
    /// `offsetParent` walks the tree looking for.
    pub positioned: bool,
    /// True for `visibility: hidden` / `collapse` — laid out, occupying space,
    /// but not painted and not hit-testable. `checkVisibility()` asks this.
    pub visibility_hidden: bool,
    /// Resolved `opacity`, so `checkVisibility({opacityProperty: true})` can
    /// answer without a second round trip.
    pub opacity: f64,
    /// `position: fixed`. Kept apart from `positioned` because `offsetParent`
    /// treats the two oppositely: a positioned ancestor is what the walk is
    /// looking FOR, and a fixed element is one the walk refuses to start from.
    pub fixed: bool,
    /// `display: inline` EXACTLY — not merely inline-*level*.
    ///
    /// CSSOM View zeroes `clientWidth`/`clientHeight` for a non-replaced inline
    /// box, which has no single padding box to report (only a chain of line
    /// fragments). `inline-block`, `inline-flex` and `inline-grid` are
    /// inline-level but each has a perfectly ordinary padding box, so lumping
    /// them in reports zero for elements that are plainly boxes.
    pub inline_level: bool,
    /// `pointer-events: none` — the element is painted but transparent to hit
    /// testing, so `elementFromPoint` must look straight through it. An overlay
    /// that decorates without intercepting is the whole point of the property.
    pub pointer_events_none: bool,
}

/// What an element that generates no box reports: all zeros, `has_box: false`.
const EMPTY_BOX: NodeBox = NodeBox {
    x: 0.0,
    y: 0.0,
    width: 0.0,
    height: 0.0,
    border_top: 0.0,
    border_right: 0.0,
    border_bottom: 0.0,
    border_left: 0.0,
    padding_top: 0.0,
    padding_right: 0.0,
    padding_bottom: 0.0,
    padding_left: 0.0,
    scroll_width: 0.0,
    scroll_height: 0.0,
    scroll_left: 0.0,
    scroll_top: 0.0,
    has_box: false,
    positioned: false,
    visibility_hidden: false,
    opacity: 1.0,
    fixed: false,
    inline_level: false,
    pointer_events_none: false,
};

/// A styled, laid-out document. Hold one of these to take multiple screenshots
/// or answer many geometry queries without re-resolving.
pub struct ResolvedDoc {
    doc: HtmlDocument,
    viewport: Viewport,
    /// Obscura `NodeId` → Blitz node id, built from the `data-obscura-nid`
    /// attributes once after layout.
    nid_map: HashMap<u64, usize>,
    /// The provider this document fetches through, kept so an incremental
    /// [`patch`](Self::patch) can wait on a newly-referenced resource (a
    /// patched-in `<img>`'s bytes) the same way the initial layout does —
    /// otherwise a patch would measure an image before its intrinsic size
    /// is known. `None` for documents built without one (tests).
    provider: Option<Arc<dyn ResourceProvider>>,
}

impl ResolvedDoc {
    pub(crate) fn new(doc: HtmlDocument, viewport: Viewport) -> Self {
        Self::with_provider(doc, viewport, None)
    }

    pub(crate) fn with_provider(
        doc: HtmlDocument,
        viewport: Viewport,
        provider: Option<Arc<dyn ResourceProvider>>,
    ) -> Self {
        let nid_map = build_nid_map(&doc);
        Self {
            provider,
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

    /// Bring this document back in step with the page by rewriting a handful of
    /// elements, instead of parsing the whole page again.
    ///
    /// This is what makes layout incremental. A re-parse throws away a styled,
    /// laid-out document and rebuilds an identical one to change a single width;
    /// the cost is paid by every page that measures after it mutates, which is
    /// every page with an editor, a sticky header, or an autosizing textarea.
    /// Patching keeps the document — and with it Stylo's rule tree, the parsed
    /// stylesheets and Taffy's cached measurements — so the work left is
    /// proportional to what actually changed.
    ///
    /// Each patch replaces one element's attributes and children wholesale. That
    /// is deliberately blunt: the journal upstream only knows *which* element was
    /// touched, not how, and rewriting it from the page's own serialization is
    /// the one form of patch that cannot drift from what a re-parse would have
    /// produced.
    ///
    /// Returns `false` — having changed nothing — when any target is missing from
    /// this document. The caller must then re-parse. A partial patch is the one
    /// outcome worse than a slow one.
    pub fn patch(&mut self, patches: &[ElementPatch]) -> bool {
        use blitz_dom::{ns, LocalName, QualName};

        // Resolve every target BEFORE touching anything, so a miss costs nothing.
        let mut targets = Vec::with_capacity(patches.len());
        for p in patches {
            match self.nid_map.get(&p.nid) {
                Some(&id) => targets.push(id),
                None => return false,
            }
        }

        // Read the current attribute names first: `mutate()` takes the document
        // mutably, so nothing can be read off it once the mutator exists.
        let stale: Vec<Vec<QualName>> = patches
            .iter()
            .zip(targets.iter())
            .map(|(p, &id)| {
                let Some(el) = self.doc.get_node(id).and_then(|n| n.element_data()) else {
                    return Vec::new();
                };
                el.attrs()
                    .iter()
                    .filter(|a| {
                        a.name.local.as_ref() != NID_ATTR
                            && !p
                                .attrs
                                .iter()
                                .any(|(n, _)| n.as_str() == a.name.local.as_ref())
                    })
                    .map(|a| a.name.clone())
                    .collect()
            })
            .collect();

        {
            let mut m = self.doc.mutate();
            for ((p, &id), drop_names) in patches.iter().zip(targets.iter()).zip(stale.iter()) {
                // Set what the page has, drop what it no longer has, and always
                // (re)write `data-obscura-nid` — it is how this element will be
                // found next time, so it is never a candidate for clearing.
                for (name, value) in &p.attrs {
                    m.set_attribute(id, QualName::new(None, ns!(), LocalName::from(&**name)), value);
                }
                for name in drop_names {
                    m.clear_attribute(id, name.clone());
                }
                m.set_attribute(
                    id,
                    QualName::new(None, ns!(), LocalName::from(NID_ATTR)),
                    &p.nid.to_string(),
                );
                m.set_inner_html(id, &p.inner_html);
            }
            m.flush();
        }

        self.doc.resolve(0.0);
        // A patched-in element may reference a resource whose bytes decide its
        // box — an `<img>` with no width/height is sized by the file. The first
        // resolve only DISCOVERS the fetch; wait for it (bounded) and re-resolve,
        // exactly as the initial layout does, so the box the caller reads is the
        // settled one rather than the zero-size placeholder. A shared cache means
        // an image the page already loaded is delivered synchronously and this
        // loop never spins. No provider (tests) → the single resolve above is it.
        if let Some(provider) = &self.provider {
            let deadline = Instant::now() + Duration::from_millis(500);
            while provider.pending() > 0 {
                let now = Instant::now();
                if now >= deadline {
                    break;
                }
                let budget = (deadline - now).min(Duration::from_millis(250));
                provider.wait_for_progress(budget);
                self.doc.resolve(0.0);
            }
        }
        // The patched subtrees are new Blitz nodes with new ids, so the map has to
        // be rebuilt. Walking the tree is cheap next to laying it out.
        self.nid_map = build_nid_map(&self.doc);
        true
    }

    /// The full CSSOM-View box for `obscura_nid`, or `None` if the element
    /// wasn't in the snapshot at all.
    ///
    /// An element that *is* in the snapshot but generates no box (`display:
    /// none`, or a descendant of one) comes back with `has_box: false` and zero
    /// geometry — deliberately distinct from `None`, because "not rendered" and
    /// "not here" are different answers to `getBoundingClientRect()` only in
    /// how they arise, but very different to `offsetParent` and hit-testing.
    pub fn node_box(&self, obscura_nid: u64) -> Option<NodeBox> {
        let &blitz_id = self.nid_map.get(&obscura_nid)?;
        Some(self.box_for_blitz_id(blitz_id).unwrap_or(EMPTY_BOX))
    }

    /// Every laid-out element in the document, in tree order, as
    /// `(obscura_nid, box)`. One call answers a whole page's worth of geometry,
    /// which is what makes an `IntersectionObserver` frame affordable: the
    /// alternative is one round trip per observed element per frame.
    pub fn all_boxes(&self) -> Vec<(u64, NodeBox)> {
        let mut out = Vec::with_capacity(self.nid_map.len());
        let mut stack = vec![self.doc.root_node().id];
        // Reverse-push so children come out in document order; hit-testing and
        // `elementsFromPoint` both depend on that ordering being real.
        while let Some(id) = stack.pop() {
            let Some(node) = self.doc.get_node(id) else {
                continue;
            };
            if let Some(element) = node.element_data() {
                if let Some(attr) = element
                    .attrs()
                    .iter()
                    .find(|a| a.name.local.as_ref() == NID_ATTR)
                {
                    if let Ok(nid) = attr.value.parse::<u64>() {
                        out.push((nid, self.box_for_blitz_id(id).unwrap_or(EMPTY_BOX)));
                    }
                }
            }
            stack.extend(node.children.iter().rev().copied());
        }
        out
    }

    /// The document-relative fragment rect of an inline element (the union of
    /// its glyph runs in the inline root's text layout) — computed in the fork,
    /// where the Parley types live.
    fn inline_fragment_rect(&self, node_id: usize) -> Option<(f64, f64, f64, f64)> {
        let (x, y, w, h) = self.doc.inline_fragment_rect(node_id)?;
        Some((x as f64, y as f64, w as f64, h as f64))
    }

    /// Every pseudo-element box in the document, as `(originating nid, which, box)`
    /// with `which` 0 = `::before`, 1 = `::after`, 2 = `::marker`.
    ///
    /// `::before`/`::after` are real Blitz layout nodes (the `node.before/.after`
    /// slots `flush_pseudo_elements` fills), so their boxes read exactly like an
    /// element's — margins included, because a pseudo has no DOM node for JS to
    /// ask `getComputedStyle` used values from. An outside `::marker` is NOT a
    /// box in Blitz — it is text painted at an offset left of the list item
    /// (`draw_marker`) — so its box is reconstructed here with the same
    /// arithmetic the painter uses; inside markers ride in the item's inline
    /// flow and get no entry.
    pub fn pseudo_boxes(&self) -> Vec<(u64, u8, PseudoBox)> {
        use blitz_dom::node::{ListItemLayout, ListItemLayoutPosition, Marker};
        let mut out = Vec::new();
        let mut stack = vec![self.doc.root_node().id];
        while let Some(id) = stack.pop() {
            let Some(node) = self.doc.get_node(id) else {
                continue;
            };
            let Some(element) = node.element_data() else {
                stack.extend(node.children.iter().rev().copied());
                continue;
            };
            let nid = element
                .attrs()
                .iter()
                .find(|a| a.name.local.as_ref() == NID_ATTR)
                .and_then(|a| a.value.parse::<u64>().ok());
            if let Some(nid) = nid {
                if let Some(before) = node.before {
                    if let Some(b) = self.pseudo_box_for(before) {
                        out.push((nid, 0, b));
                    }
                }
                if let Some(after) = node.after {
                    if let Some(b) = self.pseudo_box_for(after) {
                        out.push((nid, 1, b));
                    }
                }
                // Outside ::marker: mirror blitz-paint's draw_marker placement.
                if let Some(ListItemLayout {
                    marker,
                    position: ListItemLayoutPosition::Outside(layout),
                }) = element.list_item_data.as_deref()
                {
                    let x_padding = match marker {
                        Marker::Char(_) => 8.0f32,
                        Marker::String(_) => 0.0,
                    };
                    let m_width = layout.full_width() / layout.scale();
                    let m_height = layout
                        .lines()
                        .next()
                        .map(|l| l.metrics().line_height / layout.scale())
                        .unwrap_or(0.0);
                    let pos = node.absolute_position(0.0, 0.0);
                    let l = &node.final_layout;
                    // The painter anchors at the content-box origin of the item.
                    let content_x = pos.x + l.border.left + l.padding.left;
                    let content_y = pos.y + l.border.top + l.padding.top;
                    out.push((
                        nid,
                        2,
                        PseudoBox {
                            x: (content_x - m_width - x_padding) as f64,
                            y: content_y as f64,
                            width: m_width as f64,
                            height: m_height as f64,
                            border: [0.0; 4],
                            padding: [0.0; 4],
                            margin: [0.0; 4],
                        },
                    ));
                }
            }
            stack.extend(node.children.iter().rev().copied());
        }
        out
    }

    fn pseudo_box_for(&self, blitz_id: usize) -> Option<PseudoBox> {
        use style::values::specified::box_::DisplayOutside;
        let node = self.doc.get_node(blitz_id)?;
        let styles = node.primary_styles();
        let styles = styles.as_ref()?;
        if styles.clone_display().outside() == DisplayOutside::None {
            return None;
        }
        let l = &node.final_layout;
        // An INLINE pseudo (`div::after { content: "A" }` with no display) is an
        // inline participant with no Taffy box of its own — reconstruct its rect
        // from the glyph runs, exactly like an inline element's.
        if l.size.width == 0.0 && l.size.height == 0.0 {
            if let Some((x, y, w, h)) = self.inline_fragment_rect(blitz_id) {
                return Some(PseudoBox {
                    x,
                    y,
                    width: w,
                    height: h,
                    border: [0.0; 4],
                    padding: [0.0; 4],
                    margin: [0.0; 4],
                });
            }
        }
        let pos = node.absolute_position(0.0, 0.0);
        Some(PseudoBox {
            x: pos.x as f64,
            y: pos.y as f64,
            width: l.size.width as f64,
            height: l.size.height as f64,
            border: [
                l.border.top as f64,
                l.border.right as f64,
                l.border.bottom as f64,
                l.border.left as f64,
            ],
            padding: [
                l.padding.top as f64,
                l.padding.right as f64,
                l.padding.bottom as f64,
                l.padding.left as f64,
            ],
            margin: [
                l.margin.top as f64,
                l.margin.right as f64,
                l.margin.bottom as f64,
                l.margin.left as f64,
            ],
        })
    }

    fn box_for_blitz_id(&self, blitz_id: usize) -> Option<NodeBox> {
        use style::computed_values::visibility::T as Visibility;
        use style::values::specified::box_::{DisplayInside, DisplayOutside};

        let node = self.doc.get_node(blitz_id)?;
        let styles = node.primary_styles();

        // No primary style means Stylo never generated a box for this element:
        // it is `display: none`, or it is inside something that is. Blitz still
        // keeps the node in the tree (the DOM is not the box tree), so this is
        // the only reliable tell.
        let Some(styles) = styles.as_ref() else {
            return Some(EMPTY_BOX);
        };
        let display = styles.clone_display();
        if display.outside() == DisplayOutside::None {
            return Some(EMPTY_BOX);
        }

        let l = &node.final_layout;
        let pos = node.absolute_position(0.0, 0.0);
        // A non-replaced INLINE element gets no box from Taffy (its size stays
        // 0×0): its fragments live in the inline root's Parley layout, where
        // every glyph run's brush carries the id of the node whose style it
        // renders. Union those runs to reconstruct the fragment rect — without
        // this, every <span>/<a>'s getBoundingClientRect was 0×0, and WebDriver's
        // pointer-interactable check ("does elementFromPoint(center) hit the
        // element?") rejected every automation click on inline content.
        let mut frag: Option<(f64, f64, f64, f64)> = None;
        if l.size.width == 0.0 && l.size.height == 0.0 {
            frag = self.inline_fragment_rect(blitz_id);
        }
        let (fx, fy, fw, fh) = frag.unwrap_or((
            pos.x as f64,
            pos.y as f64,
            l.size.width as f64,
            l.size.height as f64,
        ));
        // `scroll_offset` is subtracted by `absolute_position` on the way up, so
        // this box is already in the same coordinate space the spec calls
        // "viewport-relative before the viewport's own scroll is applied".
        Some(NodeBox {
            x: fx,
            y: fy,
            width: fw,
            height: fh,
            border_top: l.border.top as f64,
            border_right: l.border.right as f64,
            border_bottom: l.border.bottom as f64,
            border_left: l.border.left as f64,
            padding_top: l.padding.top as f64,
            padding_right: l.padding.right as f64,
            padding_bottom: l.padding.bottom as f64,
            padding_left: l.padding.left as f64,
            // ⚠️ Taffy measures `content_size` from the BORDER-box origin, but
            // CSSOM View defines the scrolling area against the PADDING box —
            // so the leading border has to come off before the two can be
            // compared. Skip that subtraction and every bordered element
            // reports a scrollHeight one border-width taller than its own
            // clientHeight, i.e. claims to overflow when it does not.
            scroll_width: (l.content_size.width as f64 - l.border.left as f64)
                .max(l.size.width as f64 - l.border.left as f64 - l.border.right as f64),
            scroll_height: (l.content_size.height as f64 - l.border.top as f64)
                .max(l.size.height as f64 - l.border.top as f64 - l.border.bottom as f64),
            scroll_left: node.scroll_offset.x,
            scroll_top: node.scroll_offset.y,
            has_box: true,
            positioned: !matches!(
                styles.clone_position(),
                style::computed_values::position::T::Static
            ),
            visibility_hidden: styles.clone_visibility() != Visibility::Visible,
            opacity: styles.clone_opacity() as f64,
            fixed: matches!(
                styles.clone_position(),
                style::computed_values::position::T::Fixed
            ),
            // A REPLACED inline element (img/iframe/video/…) is inline-level but
            // is not an "inline box": it has a perfectly ordinary padding box,
            // and CSSOM View's zero-rule must not apply to it — Chrome reports
            // an <img width=44>'s clientWidth as 44, not 0.
            inline_level: display.outside() == DisplayOutside::Inline
                && display.inside() == DisplayInside::Flow
                && !node
                    .element_data()
                    .map(|el| {
                        matches!(
                            el.name.local.as_ref(),
                            "img" | "iframe" | "video" | "canvas" | "embed" | "object"
                                | "input" | "textarea" | "select" | "button" | "audio" | "svg"
                        )
                    })
                    .unwrap_or(false),
            pointer_events_none: styles.clone_pointer_events()
                == style::computed_values::pointer_events::T::None,
        })
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
