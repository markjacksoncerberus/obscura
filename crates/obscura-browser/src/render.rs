//! Feature-gated glue between `obscura-browser` and the Blitz-backed
//! `obscura-render` engine. Compiled only with the `render` feature.
//!
//! The bridge is deliberately stateless about the DOM: every render starts from
//! a fresh HTML snapshot of the page's *current* (post-JavaScript) DOM, so a
//! screenshot always reflects the most recent content — including anything JS
//! has loaded or mutated. A per-page cache keyed by a hash of that snapshot
//! skips re-running Stylo/Taffy when nothing has changed.

use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::Duration;

use obscura_net::ObscuraHttpClient;
use obscura_render::{
    Bytes, ColorScheme, MediaType, NetHandler, NetProvider, RenderEngine, RenderInput, Request,
    ResolvedDoc, ResourceProvider, Viewport,
};

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

/// Multi-thread runtime that drives render-time resource fetches.
///
/// Rendering runs synchronously inside a CDP handler on Obscura's main
/// `current_thread` runtime, which is therefore blocked while we wait for
/// resources. Fetches must run on their own threads, so we keep a small
/// dedicated runtime — created once, shared across every render.
fn fetch_runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .thread_name("obscura-render-net")
            .build()
            .expect("build render-net runtime")
    })
}

/// In-flight fetch counter with a condvar so the render loop can sleep until a
/// fetch completes instead of busy-spinning.
struct Inflight {
    count: Mutex<usize>,
    cv: Condvar,
}

impl Inflight {
    fn new() -> Self {
        Self {
            count: Mutex::new(0),
            cv: Condvar::new(),
        }
    }

    fn inc(&self) {
        *self.count.lock().unwrap() += 1;
    }

    fn dec(&self) {
        let mut c = self.count.lock().unwrap();
        *c = c.saturating_sub(1);
        self.cv.notify_all();
    }

    fn get(&self) -> usize {
        *self.count.lock().unwrap()
    }

    fn wait(&self, timeout: Duration) {
        let guard = self.count.lock().unwrap();
        if *guard == 0 {
            return;
        }
        let _ = self.cv.wait_timeout(guard, timeout);
    }
}

/// A [`ResourceProvider`] that fetches Blitz's sub-resources (external CSS,
/// images, web fonts) through Obscura's HTTP client, so cookies, proxy, and
/// request-blocking all apply. `data:` URIs are decoded inline; non-http(s)
/// schemes are dropped.
pub(crate) struct ObscuraNetProvider {
    client: Arc<ObscuraHttpClient>,
    block_patterns: Vec<String>,
    inflight: Arc<Inflight>,
}

impl ObscuraNetProvider {
    pub(crate) fn new(client: Arc<ObscuraHttpClient>, block_patterns: Vec<String>) -> Self {
        Self {
            client,
            block_patterns,
            inflight: Arc::new(Inflight::new()),
        }
    }

    fn is_blocked(&self, url: &str) -> bool {
        self.block_patterns.iter().any(|p| glob_match(p, url))
    }
}

/// The same simple `*`-glob matching Obscura uses for request interception.
fn glob_match(pattern: &str, url: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    let starts = pattern.starts_with('*');
    let ends = pattern.ends_with('*');
    match (starts, ends) {
        (true, true) => url.contains(&pattern[1..pattern.len() - 1]),
        (true, false) => url.ends_with(&pattern[1..]),
        (false, true) => url.starts_with(&pattern[..pattern.len() - 1]),
        (false, false) => url.contains(pattern),
    }
}

impl NetProvider for ObscuraNetProvider {
    fn fetch(&self, _doc_id: usize, request: Request, handler: Box<dyn NetHandler>) {
        let url = request.url;
        match url.scheme() {
            // Inline data: payloads never hit the network.
            "data" => {
                if let Some(bytes) = crate::page::decode_data_uri(url.as_str()) {
                    handler.bytes(url.to_string(), Bytes::from(bytes));
                }
            }
            "http" | "https" => {
                if self.is_blocked(url.as_str()) {
                    tracing::debug!("render: blocked sub-resource {url}");
                    return;
                }
                self.inflight.inc();
                let client = self.client.clone();
                let inflight = self.inflight.clone();
                fetch_runtime().spawn(async move {
                    match client.fetch(&url).await {
                        Ok(resp) => {
                            tracing::debug!(%url, status = resp.status, bytes = resp.body.len(), "render: fetched");
                            let final_url = resp.url.to_string();
                            handler.bytes(final_url, Bytes::from(resp.body));
                        }
                        Err(e) => {
                            tracing::debug!(%url, error = %e, "render: fetch failed");
                            // Deliver empty bytes so Blitz stops treating this
                            // render-blocking resource (e.g. a <link> stylesheet)
                            // as still-loading and proceeds to paint the page.
                            handler.bytes(url.to_string(), Bytes::new());
                        }
                    }
                    inflight.dec();
                });
            }
            // file:// and other schemes are not fetched for rendering.
            other => tracing::debug!("render: ignoring {other}: sub-resource {url}"),
        }
    }
}

impl ResourceProvider for ObscuraNetProvider {
    fn pending(&self) -> usize {
        self.inflight.get()
    }

    fn wait_for_progress(&self, timeout: Duration) {
        self.inflight.wait(timeout);
    }
}
