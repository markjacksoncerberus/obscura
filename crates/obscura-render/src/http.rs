//! The [`ResourceProvider`] that fetches Blitz's sub-resources through
//! Obscura's own HTTP client, so cookies, proxy settings and request blocking
//! all apply to a stylesheet or web font exactly as they do to a page.
//!
//! This lives here rather than in `obscura-browser` because *two* callers need
//! it: the screenshot path (`obscura-browser`) and the layout bridge that
//! answers `getBoundingClientRect()` for the JS realm (`obscura-js`). A page
//! whose geometry is computed without its stylesheet is a page laid out wrong,
//! so the two must fetch identically or they will disagree about where things
//! are.

use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use blitz_traits::net::{Bytes, NetHandler, NetProvider, Request};
use obscura_net::ObscuraHttpClient;

use crate::net::ResourceProvider;

/// Multi-thread runtime that drives render-time resource fetches.
///
/// Rendering runs synchronously inside a CDP handler (or a JS op) on Obscura's
/// main `current_thread` runtime, which is therefore blocked while we wait for
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
/// images, web fonts) through Obscura's HTTP client. `data:` URIs are decoded
/// inline; non-http(s) schemes are dropped.
pub struct ObscuraNetProvider {
    client: Arc<ObscuraHttpClient>,
    block_patterns: Vec<String>,
    inflight: Arc<Inflight>,
}

impl ObscuraNetProvider {
    pub fn new(client: Arc<ObscuraHttpClient>, block_patterns: Vec<String>) -> Self {
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

/// Decode a `data:` URI's payload, base64 or percent-encoded.
pub fn decode_data_uri(uri: &str) -> Option<Vec<u8>> {
    let rest = uri.strip_prefix("data:")?;
    let comma = rest.find(',')?;
    let meta = &rest[..comma];
    let payload = &rest[comma + 1..];
    if meta.split(';').any(|t| t.eq_ignore_ascii_case("base64")) {
        let cleaned: String = payload.chars().filter(|c| !c.is_whitespace()).collect();
        BASE64.decode(cleaned).ok()
    } else {
        Some(percent_decode(payload))
    }
}

fn percent_decode(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex_val(b[i + 1]), hex_val(b[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    out
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

impl NetProvider for ObscuraNetProvider {
    fn fetch(&self, _doc_id: usize, request: Request, handler: Box<dyn NetHandler>) {
        let url = request.url;
        match url.scheme() {
            // Inline data: payloads never hit the network.
            "data" => {
                if let Some(bytes) = decode_data_uri(url.as_str()) {
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
