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

use obscura_dom::{DomTree, NodeId};
use obscura_net::ObscuraHttpClient;
use obscura_render::{
    Bytes, ColorScheme, ElementPatch, MediaType, NetHandler, NetProvider, NoOpNetProvider,
    ObscuraNetProvider, RenderEngine, RenderInput, ResolvedDoc, ResourceProvider, Request, Viewport,
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

/// The live document, and the exact inputs it currently reflects.
///
/// Kept between queries rather than rebuilt, so a mutation can be *patched* into
/// it (see [`plan_patches`]). The viewport rides along because a viewport change
/// is not something a patch can express: the whole document has to be laid out
/// again against the new one.
struct Cached {
    key: u64,
    doc: ResolvedDoc,
    vw: u32,
    vh: u32,
    dsf: f64,
}

thread_local! {
    /// One engine — and its bundled `FontContext` — per thread, so the font is
    /// parsed once for the whole process rather than once per query.
    static ENGINE: RenderEngine = RenderEngine::new();
    /// The last resolved document, plus the hash of the snapshot and viewport it
    /// came from. Repeated reads between mutations reuse it.
    static CACHE: RefCell<Option<Cached>> = const { RefCell::new(None) };
    /// Sub-resources (stylesheets, fonts, images) fetched by any layout on this
    /// page, shared across every re-layout. See [`CachingProvider`].
    static RESOURCES: RefCell<Option<Arc<Mutex<HashMap<String, Bytes>>>>> = const { RefCell::new(None) };
}

/// Elements a patch will not touch, in the markup it is about to install or as
/// the patched element itself.
///
/// Every one of them does something on insertion beyond occupying a box: register
/// a stylesheet, run a program, retarget the document, decode audio/video Blitz
/// cannot play here anyway. The patch keeps the document — it does not re-run
/// these side effects — so an element whose whole point IS a side effect must
/// take the slow path.
///
/// ⭐ `<img>`/`<picture>`/`<source>` used to be here (Quest #525's cap): a patch
/// resolved once and could measure an image before its bytes — and its intrinsic
/// size — had arrived. Quest #539 lifted them: `ResolvedDoc::patch` now waits on
/// the same provider the full layout does, so a patched-in image is sized from
/// its file, and one the page already loaded (the common case — a gallery
/// re-sorting, a lightbox) is delivered from the shared cache with no wait at
/// all. So the biggest incremental-layout win the campaign kept naming is taken:
/// a page whose mutations carry an `<img>` gets the fast path now.
///
/// This is the honest cost of the fast path, and it is why the list still errs
/// long.
const PATCH_UNSAFE_TAGS: [&str; 12] = [
    "style", "link", "script", "base", "meta", "iframe", "frame", "object", "embed", "video",
    "audio", "track",
];

/// Does `html` contain a start tag we refuse to patch? A byte scan rather than a
/// lowercase-and-search: this runs on every mutation of a page that measures, and
/// the markup can be the whole body.
fn has_unsafe_tag(html: &str) -> bool {
    let bytes = html.as_bytes();
    let mut i = 0;
    while let Some(off) = bytes[i..].iter().position(|&b| b == b'<') {
        let start = i + off + 1;
        i = start;
        let rest = &bytes[start..];
        if PATCH_UNSAFE_TAGS.iter().any(|tag| {
            let t = tag.as_bytes();
            rest.len() > t.len()
                && rest[..t.len()].eq_ignore_ascii_case(t)
                // A tag name ends at whitespace, '/' or '>'; without this
                // `<sourceCode>` would read as `<source>`.
                && matches!(rest[t.len()], b' ' | b'\t' | b'\n' | b'\r' | b'/' | b'>')
        }) {
            return true;
        }
        if i >= bytes.len() {
            break;
        }
    }
    false
}

/// Turn the DOM's journal of touched nodes into a set of whole-element rewrites,
/// or `None` when the change cannot be expressed as one and the document must be
/// parsed again.
///
/// The rules that make this safe, each earning its place:
///  * a touched node resolves to its nearest **element** ancestor — character
///    data has no box of its own, its parent draws it;
///  * anything no longer connected to the document is dropped, because it is not
///    in the snapshot either (whatever detached it journalled the losing parent,
///    so the removal is still accounted for);
///  * an element inside another dirty element is dropped, since rewriting the
///    outer one rebuilds it anyway;
///  * `<html>`/`<head>` and the document node are refused outright — patching
///    them means re-installing the page's stylesheets, which is a re-parse
///    wearing a disguise.
fn plan_patches(dom: &DomTree, dirty: &[NodeId]) -> Option<Vec<ElementPatch>> {
    let doc_id = dom.document();
    let mut roots: Vec<NodeId> = Vec::with_capacity(dirty.len());

    'next: for &id in dirty {
        // Walk up to the nearest element, checking connectivity on the way. One
        // pass answers both questions.
        let mut cur = Some(id);
        let mut element: Option<NodeId> = None;
        while let Some(c) = cur {
            if c == doc_id {
                break;
            }
            let Some(node) = dom.get_node(c) else {
                // Freed by `remove()`. Its parent was journalled on detach, so
                // the change is not lost by skipping it.
                continue 'next;
            };
            if element.is_none() && node.as_element().is_some() {
                element = Some(c);
            }
            match node.parent {
                Some(p) => cur = Some(p),
                // Ran out of ancestors without reaching the document: detached,
                // so it is not in the snapshot and cannot move a box.
                None => continue 'next,
            }
        }
        let Some(el) = element else { continue 'next };
        // The document element and its head are refused: see the doc comment.
        let name = dom
            .get_node(el)
            .and_then(|n| n.as_element().map(|q| q.local.as_ref().to_ascii_lowercase()));
        match name.as_deref() {
            Some("html") | Some("head") => return None,
            Some(tag) if PATCH_UNSAFE_TAGS.contains(&tag) => return None,
            None => return None,
            _ => {}
        }
        if !roots.contains(&el) {
            roots.push(el);
        }
    }

    if roots.is_empty() {
        return Some(Vec::new());
    }

    // Drop any root that sits inside another root.
    let mut out: Vec<ElementPatch> = Vec::with_capacity(roots.len());
    'root: for &el in &roots {
        let mut cur = dom.get_node(el).and_then(|n| n.parent);
        while let Some(c) = cur {
            if roots.contains(&c) {
                continue 'root;
            }
            cur = dom.get_node(c).and_then(|n| n.parent);
        }
        let inner_html = dom.inner_html_with_obscura_ids(el);
        if has_unsafe_tag(&inner_html) {
            return None;
        }
        // The patch has to agree with the serializer about what the renderer is
        // allowed to see, or a CSP-blocked `style` would be quietly re-applied by
        // the very mechanism that exists to keep the two in step.
        let style_blocked = dom.csp_style_attr_blocked(el);
        let attrs = dom
            .get_node(el)
            .and_then(|n| {
                n.attrs().map(|a| {
                    a.iter()
                        .filter(|at| !(style_blocked && at.name.local.as_ref() == "style"))
                        .map(|at| (at.name.local.as_ref().to_string(), at.value.clone()))
                        .collect::<Vec<_>>()
                })
            })
            .unwrap_or_default();
        out.push(ElementPatch {
            nid: el.raw() as u64,
            attrs,
            inner_html,
        });
    }
    Some(out)
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
    let prof = std::env::var_os("OBSCURA_LAYOUT_PROFILE").is_some();
    let t0 = std::time::Instant::now();
    let html = dom.outer_html_with_obscura_ids(dom.document());
    let t_ser = t0.elapsed();
    let key = cache_key(&html, vw, vh, dsf);
    let t_hash = t0.elapsed() - t_ser;
    if key == last_key && last_key != 0 {
        // The caller's copy is current, so the cached document is too: whatever
        // the journal is holding has already been accounted for (a mutation that
        // was undone before anyone looked). Drop it rather than replaying it.
        dom.clear_layout_dirty();
        if prof {
            eprintln!(
                "[layout-profile] SAME serialize={:?} hash={:?} len={}",
                t_ser,
                t_hash,
                html.len()
            );
        }
        return format!("{{\"key\":{key},\"same\":1}}");
    }

    let html_len = html.len();
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let stale = cache.as_ref().is_none_or(|c| c.key != key);
        let mut how = "hit";
        if stale {
            // ── The fast path: patch the document we already have ────────────
            // Only when the journal is a complete account of what changed, the
            // viewport has not moved (a patch cannot express that), and the
            // change is one whole-element rewrite can describe.
            let (dirty, overflow) = dom.take_layout_dirty();
            let viewport_same = cache
                .as_ref()
                .is_some_and(|c| c.vw == vw && c.vh == vh && c.dsf == dsf);
            let patched = !overflow
                && viewport_same
                && !incremental_disabled()
                && match plan_patches(dom, &dirty) {
                    // An EMPTY patch list is not "nothing changed" — the snapshot
                    // hash says something did, and the journal simply could not
                    // account for it (every touched node had been detached, or
                    // the change was one the DOM does not model as a mutation at
                    // all). Re-parsing is the only honest answer: claiming the
                    // document already matches would freeze the box tree at the
                    // last state it happened to be in.
                    Some(patches) if !patches.is_empty() => {
                        cache.as_mut().is_some_and(|c| c.doc.patch(&patches))
                    }
                    _ => false,
                };
            if patched {
                how = "patch";
                if let Some(c) = cache.as_mut() {
                    c.key = key;
                }
            } else {
                how = "reparse";
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
                *cache = Some(Cached { key, doc, vw, vh, dsf });
            }
        } else {
            // The document already matches; nothing in the journal can be news.
            dom.clear_layout_dirty();
        }
        let t_layout = t0.elapsed() - t_ser - t_hash;
        let doc = &cache.as_ref().expect("populated above").doc;
        let out = serialize_boxes(doc, key);
        if prof {
            eprintln!(
                "[layout-profile] {how} serialize={:?} hash={:?} layout={:?} boxes={:?} htmlLen={} outLen={}",
                t_ser,
                t_hash,
                t_layout,
                t0.elapsed() - t_ser - t_hash - t_layout,
                html_len,
                out.len()
            );
        }
        out
    })
}

/// The kill switch. Incremental layout is a correctness-critical optimisation:
/// if a box ever looks wrong, this turns the whole patch path off in one
/// environment variable and sends every query back down the re-parse road, so a
/// bug here can be confirmed or ruled out without a rebuild.
fn incremental_disabled() -> bool {
    thread_local! {
        static OFF: bool = std::env::var_os("OBSCURA_LAYOUT_NO_INCREMENTAL").is_some();
    }
    OFF.with(|o| *o)
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
