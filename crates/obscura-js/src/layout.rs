//! The layout bridge: a real box tree, reachable from JavaScript.
//!
//! Obscura has always *had* a layout engine — `obscura-render` runs Blitz and
//! Taffy over a snapshot of the DOM, and the screenshot path has used its boxes
//! since the renderer landed. What it did not have was a way for the *page* to
//! ask where anything is: `getBoundingClientRect()` answered from a synthetic
//! 12-column grid keyed by node id, invented so Playwright's actionability
//! polling could tell two elements apart.
//!
//! That grid is a plausible-looking lie, and a lie in geometry is expensive.
//! `IntersectionObserver` cannot know what is on screen, so a gallery downloads
//! every image instead of the four you can see — on a connection paid for by
//! the megabyte. A sticky header cannot measure itself. A chart library sizes
//! its canvas to 100×20 and draws nothing you can read.
//!
//! This module closes the gap. It serializes the live DOM, hands it to the same
//! render engine the screenshot path uses, and returns every element's box in
//! one call.
//!
//! ## Why one call for the whole document
//!
//! A round trip per element would be affordable if layout were incremental. It
//! is not: each query re-runs style and layout over a fresh snapshot. So the op
//! is batched by design — one layout, every box — and the JS side caches the
//! result until the DOM changes. An `IntersectionObserver` frame over 200
//! targets then costs one layout, not two hundred.

use std::cell::RefCell;
use std::sync::Arc;
use std::time::Duration;

use std::collections::HashMap;
use std::sync::Mutex;

use obscura_dom::DomTree;
use obscura_net::ObscuraHttpClient;
use obscura_render::{
    Bytes, ColorScheme, MediaType, NetHandler, NetProvider, NoOpNetProvider, ObscuraNetProvider,
    RenderEngine, RenderInput, ResolvedDoc, ResourceProvider, Request, Viewport,
};

/// A [`ResourceProvider`] that remembers what it already fetched.
///
/// The screenshot path renders once and throws the document away, so it never
/// needed this. The layout bridge re-lays-out the WHOLE document every time the
/// page mutates and then measures — which is the classic layout-thrash loop
/// every real page does at least once — and each of those rebuilds is a fresh
/// Blitz document that asks for the stylesheet again. Without a cache, a loop
/// of 600 `style.width = …; el.scrollWidth` pairs is 600 network round trips
/// for the same unchanged CSS file. With one, it is one.
///
/// The cache is keyed by URL and lives as long as the page's JS realm. Entries
/// are only ever *added*, which is the right trade for a subresource a layout
/// pass needs synchronously: a stylesheet that changed under us would be a
/// stale box, but re-fetching it would be a frozen tab.
struct CachingProvider {
    inner: Arc<dyn ResourceProvider>,
    cache: Arc<Mutex<HashMap<String, Bytes>>>,
}

/// Intercepts the delivery so a fetch that goes to the network on a miss still
/// lands in the cache on its way to Blitz.
struct CachingHandler {
    inner: Box<dyn NetHandler>,
    url: String,
    cache: Arc<Mutex<HashMap<String, Bytes>>>,
}

/// Upper bound on cached sub-resources. The cache is thread-local and the server
/// runs every page on one thread, so without a bound a long-lived process would
/// accumulate every stylesheet and image of every page it ever laid out. On
/// overflow the whole map is dropped rather than evicted one entry at a time:
/// this is a warm-start optimisation, not a correctness mechanism, and a simple
/// rule that is obviously safe beats a clever one that is only probably safe.
const MAX_CACHED_RESOURCES: usize = 512;

impl NetHandler for CachingHandler {
    fn bytes(self: Box<Self>, final_url: String, bytes: Bytes) {
        if let Ok(mut c) = self.cache.lock() {
            if c.len() >= MAX_CACHED_RESOURCES {
                c.clear();
            }
            c.insert(self.url.clone(), bytes.clone());
        }
        self.inner.bytes(final_url, bytes);
    }
}

impl NetProvider for CachingProvider {
    fn fetch(&self, doc_id: usize, request: Request, handler: Box<dyn NetHandler>) {
        let url = request.url.to_string();
        let hit = self.cache.lock().ok().and_then(|c| c.get(&url).cloned());
        if let Some(bytes) = hit {
            // Deliver synchronously: the caller never counted this as pending,
            // so the render loop must not be left waiting on it.
            handler.bytes(url, bytes);
            return;
        }
        self.inner.fetch(
            doc_id,
            request,
            Box::new(CachingHandler {
                inner: handler,
                url,
                cache: self.cache.clone(),
            }),
        );
    }
}

impl ResourceProvider for CachingProvider {
    fn pending(&self) -> usize {
        self.inner.pending()
    }
    fn wait_for_progress(&self, timeout: Duration) {
        self.inner.wait_for_progress(timeout)
    }
}

thread_local! {
    /// One engine — and its bundled `FontContext` — per thread, so the font is
    /// parsed once for the whole process rather than once per query.
    static ENGINE: RenderEngine = RenderEngine::new();
    /// The last resolved document, plus the hash of the snapshot and viewport it
    /// came from. Repeated reads between mutations reuse it.
    static CACHE: RefCell<Option<(u64, ResolvedDoc)>> = const { RefCell::new(None) };
    /// Sub-resources (stylesheets, fonts, images) fetched by any layout on this
    /// page, shared across every re-layout. See [`CachingProvider`].
    static RESOURCES: RefCell<Option<Arc<Mutex<HashMap<String, Bytes>>>>> = const { RefCell::new(None) };
}

/// Inputs that change the layout, hashed into the cache key.
fn cache_key(html: &str, w: u32, h: u32, dsf: f64) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    html.hash(&mut hasher);
    w.hash(&mut hasher);
    h.hash(&mut hasher);
    dsf.to_bits().hash(&mut hasher);
    hasher.finish()
}

/// Lay out the current DOM and return every element's box as compact JSON.
///
/// The shape is two parallel flat arrays rather than an object per node —
/// `{"nids": [...], "boxes": [x, y, w, h, …, x, y, w, h, …]}` — because the JS
/// side turns them straight into a `Map` and the object form costs several
/// times as much to serialize and parse on a page with a few thousand elements.
///
/// `vw`/`vh` come from the *JS* realm's `innerWidth`/`innerHeight`, not from the
/// screenshot viewport. There must only be one viewport as far as a page is
/// concerned: if layout used a different one, every test comparing a rect
/// against `innerWidth` would fail, and correctly so.
/// `last_key` is the key of the payload the caller already holds. When the
/// document has not changed since, the answer is `{"key":N,"same":1}` and the
/// caller reuses what it parsed before. This is what makes the bridge
/// affordable: hashing a serialized snapshot is cheap, shipping and re-parsing
/// several thousand boxes is not, and between two reads a page usually has not
/// touched a thing.
pub fn layout_boxes(
    dom: &DomTree,
    base_url: &str,
    client: Option<&Arc<ObscuraHttpClient>>,
    blocked: &[String],
    vw: u32,
    vh: u32,
    dsf: f64,
    last_key: u64,
) -> String {
    let html = dom.outer_html_with_obscura_ids(dom.document());
    let key = cache_key(&html, vw, vh, dsf);
    if key == last_key && last_key != 0 {
        return format!("{{\"key\":{key},\"same\":1}}");
    }

    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let fresh = cache.as_ref().is_none_or(|(k, _)| *k != key);
        if fresh {
            let base: Arc<dyn ResourceProvider> = match client {
                Some(c) => Arc::new(ObscuraNetProvider::new(c.clone(), blocked.to_vec())),
                None => Arc::new(NoOpNetProvider),
            };
            let resources = RESOURCES.with(|r| {
                let mut r = r.borrow_mut();
                r.get_or_insert_with(|| Arc::new(Mutex::new(HashMap::new()))).clone()
            });
            let provider: Arc<dyn ResourceProvider> = Arc::new(CachingProvider {
                inner: base,
                cache: resources,
            });
            let doc = ENGINE.with(|engine| {
                engine.layout(RenderInput {
                    html,
                    base_url: Some(base_url.to_string()),
                    viewport: Viewport::new(
                        (vw as f64 * dsf).round().max(1.0) as u32,
                        (vh as f64 * dsf).round().max(1.0) as u32,
                        dsf as f32,
                        ColorScheme::Light,
                    ),
                    media_type: MediaType::screen(),
                    net_provider: provider,
                    // A geometry read is synchronous from the page's point of
                    // view — `getBoundingClientRect()` cannot await a font.
                    // Keep the ceiling far below the screenshot path's 5s: a
                    // late web font moves a box, but a frozen tab loses the
                    // whole page.
                    resource_timeout: Duration::from_millis(500),
                })
            });
            *cache = Some((key, doc));
        }
        let (_, doc) = cache.as_ref().expect("populated above");
        serialize_boxes(doc, key)
    })
}

/// Drop the cached layout. Called when the document is replaced, so a new page
/// can never be measured against the old one's boxes.
pub fn invalidate() {
    CACHE.with(|c| *c.borrow_mut() = None);
    RESOURCES.with(|r| *r.borrow_mut() = None);
}

fn serialize_boxes(doc: &ResolvedDoc, key: u64) -> String {
    let boxes = doc.all_boxes();
    let size = doc.content_size();
    // 18 numbers per element, each up to ~10 chars with its separator.
    let mut out = String::with_capacity(boxes.len() * 180 + 64);
    out.push_str("{\"key\":");
    out.push_str(&key.to_string());
    out.push_str(",\"cw\":");
    push_num(&mut out, size.width);
    out.push_str(",\"ch\":");
    push_num(&mut out, size.height);
    out.push_str(",\"nids\":[");
    for (i, (nid, _)) in boxes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&nid.to_string());
    }
    out.push_str("],\"boxes\":[");
    for (i, (_, b)) in boxes.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        // Bit flags rather than three booleans: they ride along in the same
        // numeric array, so the whole payload stays one JSON number list.
        let flags = (b.has_box as u32)
            | ((b.positioned as u32) << 1)
            | ((b.visibility_hidden as u32) << 2)
            | ((b.fixed as u32) << 3)
            | ((b.inline_level as u32) << 4)
            | ((b.pointer_events_none as u32) << 5);
        for v in [
            b.x,
            b.y,
            b.width,
            b.height,
            b.border_top,
            b.border_right,
            b.border_bottom,
            b.border_left,
            b.padding_top,
            b.padding_right,
            b.padding_bottom,
            b.padding_left,
            b.scroll_width,
            b.scroll_height,
            b.scroll_left,
            b.scroll_top,
            flags as f64,
            b.opacity,
        ] {
            push_num(&mut out, v);
            out.push(',');
        }
        out.pop();
    }
    out.push_str("]}");
    out
}

/// Serialize a float the way JSON wants it, with non-finite values (which a
/// degenerate layout can produce) flattened to 0 rather than emitting `NaN`,
/// which is not JSON and would poison the whole response.
fn push_num(out: &mut String, v: f64) {
    if !v.is_finite() {
        out.push('0');
    } else if v == v.trunc() && v.abs() < 1e15 {
        out.push_str(&(v as i64).to_string());
    } else {
        // Two decimal places: CSS pixels are subpixel-precise but no test
        // depends on more, and shorter numbers make the payload smaller.
        out.push_str(&format!("{:.2}", v));
    }
}
