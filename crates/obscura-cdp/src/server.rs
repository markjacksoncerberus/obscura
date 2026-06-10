use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use obscura_browser::BrowserContext;
use serde_json::json;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info, warn};

use crate::dispatch::{self, CdpContext};
use crate::page_thread::PageThread;
use crate::types::{CdpEvent, CdpRequest, CdpResponse};

// The WS-stream forwarding channel must be bounded: if the LocalSet (CDP
// router) stalls, the accept thread keeps pushing `std::net::TcpStream`s into
// the queue. An unbounded channel would let that queue grow without limit and
// OOM the process. With a bounded capacity, when the LocalSet is saturated the
// accept thread closes the new connection on the spot instead of buffering it —
// the kernel TCP backlog still absorbs short-term spikes, but a long-term stall
// now fails loudly at accept time rather than silently piling up FDs.
const MAX_PENDING_WS_HANDOFFS: usize = 128;

/// Domains whose handlers touch a page's V8 `JsRuntime` and therefore run on
/// that page's dedicated OS thread (issue #19 "Option 2").
const PAGE_DOMAINS: &[&str] = &[
    "Page",
    "DOM",
    "Runtime",
    "Network",
    "Fetch",
    "Input",
    "Accessibility",
    "Emulation",
    "LP",
];

struct CdpMessage {
    text: String,
    reply_tx: mpsc::UnboundedSender<String>,
}

enum ServerMessage {
    Cdp(CdpMessage),
    NewConnection {
        reply_tx: mpsc::UnboundedSender<String>,
    },
}

pub async fn start(port: u16) -> anyhow::Result<()> {
    start_with_options(port, None, false).await
}

pub async fn start_with_options(
    port: u16,
    proxy: Option<String>,
    stealth: bool,
) -> anyhow::Result<()> {
    start_with_full_options(port, proxy, stealth, None, None).await
}

pub async fn start_with_full_options(
    port: u16,
    proxy: Option<String>,
    stealth: bool,
    user_agent: Option<String>,
    storage_dir: Option<std::path::PathBuf>,
) -> anyhow::Result<()> {
    start_with_host(port, "127.0.0.1", proxy, stealth, user_agent, storage_dir).await
}

pub async fn start_with_host(
    port: u16,
    host: &str,
    proxy: Option<String>,
    stealth: bool,
    user_agent: Option<String>,
    storage_dir: Option<std::path::PathBuf>,
) -> anyhow::Result<()> {
    start_with_host_and_security(port, host, proxy, stealth, user_agent, false, storage_dir).await
}

pub async fn start_with_host_and_security(
    port: u16,
    host: &str,
    proxy: Option<String>,
    stealth: bool,
    user_agent: Option<String>,
    allow_file_access: bool,
    storage_dir: Option<std::path::PathBuf>,
) -> anyhow::Result<()> {
    start_with_host_security_storage_and_render(
        port,
        host,
        proxy,
        stealth,
        user_agent,
        allow_file_access,
        storage_dir,
        obscura_browser::RenderSettings::default(),
    )
    .await
}

pub async fn start_with_host_security_and_storage(
    port: u16,
    host: &str,
    proxy: Option<String>,
    stealth: bool,
    user_agent: Option<String>,
    allow_file_access: bool,
    storage_dir: Option<std::path::PathBuf>,
) -> anyhow::Result<()> {
    start_with_host_security_storage_and_render(
        port,
        host,
        proxy,
        stealth,
        user_agent,
        allow_file_access,
        storage_dir,
        obscura_browser::RenderSettings::default(),
    )
    .await
}

/// Like [`start_with_host_security_and_storage`], but also configures the
/// render mode and default viewport for every page in this server.
pub async fn start_with_host_security_storage_and_render(
    port: u16,
    host: &str,
    proxy: Option<String>,
    stealth: bool,
    user_agent: Option<String>,
    allow_file_access: bool,
    storage_dir: Option<std::path::PathBuf>,
    render: obscura_browser::RenderSettings,
) -> anyhow::Result<()> {
    let ip: std::net::IpAddr = host
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid --host '{}': {}", host, e))?;
    let addr = SocketAddr::new(ip, port);

    // Issue #62: the HTTP control plane (/json/version, /json) must remain
    // reachable even while V8 JS evaluation blocks the tokio LocalSet thread.
    //
    // We use a dedicated OS thread with a blocking std::net::TcpListener so
    // the kernel's accept backlog is always drained promptly. HTTP endpoints
    // are served directly via blocking I/O; WebSocket connections are
    // forwarded to the existing LocalSet for CDP processing.
    let std_listener = std::net::TcpListener::bind(addr)
        .map_err(|e| anyhow::anyhow!("bind {}:{}: {}", host, port, e))?;
    std_listener
        .set_nonblocking(false)
        .map_err(|e| anyhow::anyhow!("set_nonblocking: {}", e))?;

    info!("Obscura CDP server listening on ws://{}:{}", host, port);
    info!("DevTools endpoint: ws://{}:{}/devtools/browser", host, port);
    if allow_file_access {
        info!("file:// navigation enabled (--allow-file-access). Do not expose this port to untrusted networks.");
    }

    let (ws_tx, mut ws_rx) = mpsc::channel::<std::net::TcpStream>(MAX_PENDING_WS_HANDOFFS);

    // Dedicated accept thread: drains the kernel backlog immediately and
    // handles HTTP endpoints (/json/version, /json, /json/protocol) with
    // blocking I/O so they never contend with the LocalSet's V8 work.
    //
    // Lifecycle note: this thread is spawned detached (no `join` handle).
    // It is intended to run for the entire process lifetime — the same
    // contract Chromium DevTools / Playwright clients expect from a CDP
    // server. When `start_with_*` returns (whether by Ok or panic in the
    // LocalSet), `ws_rx` drops; the next `ws_tx.blocking_send` then
    // returns `SendError`, which `accept_dispatch` surfaces as
    // "accept channel closed" and the loop logs+continues. The listener
    // FD stays bound until the process exits. If we ever need to support
    // graceful shutdown for embedded/library use, add an
    // `Arc<AtomicBool>` shutdown flag checked between `accept()`s and
    // switch to a non-blocking `set_nonblocking(true)` + poll loop.
    // For the standalone `obscura serve` binary the detached lifetime is
    // correct.
    std::thread::Builder::new()
        .name("obscura-cdp-accept".into())
        .spawn(move || {
            for stream in std_listener.incoming() {
                match stream {
                    Ok(stream) => {
                        if let Err(e) = accept_dispatch(stream, port, &ws_tx) {
                            if !format!("{}", e).contains("close") {
                                error!("Accept dispatch error: {}", e);
                            }
                        }
                    }
                    Err(e) => error!("Accept error: {}", e),
                }
            }
        })?;

    let local = tokio::task::LocalSet::new();
    local
        .run_until(async {
            let (msg_tx, msg_rx) = mpsc::unbounded_channel::<ServerMessage>();

            let _processor_handle = tokio::task::spawn_local(cdp_processor(
                msg_rx,
                proxy,
                stealth,
                user_agent,
                allow_file_access,
                storage_dir,
                render,
            ));

            while let Some(stream) = ws_rx.recv().await {
                // Convert std TcpStream → tokio TcpStream inside the LocalSet
                // where the tokio runtime is active.
                stream
                    .set_nonblocking(true)
                    .map_err(|e| error!("set_nonblocking on WS stream: {}", e))
                    .ok();
                let tokio_stream = match TcpStream::from_std(stream) {
                    Ok(s) => s,
                    Err(e) => {
                        error!("TcpStream::from_std failed: {}", e);
                        continue;
                    }
                };
                let tx = msg_tx.clone();
                tokio::task::spawn_local(async move {
                    if let Err(e) = handle_connection_ws(tokio_stream, tx).await {
                        error!("WebSocket connection error: {}", e);
                    }
                });
            }
        })
        .await;

    Ok(())
}

const HTTP_PEEK_BUF: usize = 4096;
const WS_PEEK_BUF: usize = 4;

/// Dispatch a freshly-accepted TCP connection on the dedicated accept thread.
///
/// Peek at the first bytes to decide HTTP vs WebSocket:
/// - HTTP (`GET /json/*`): serve synchronously via blocking I/O so the
///   response is never stalled by the LocalSet.
/// - WebSocket: set non-blocking, convert to tokio `TcpStream`, and forward
///   to the LocalSet for CDP processing.
fn accept_dispatch(
    stream: std::net::TcpStream,
    port: u16,
    ws_tx: &mpsc::Sender<std::net::TcpStream>,
) -> anyhow::Result<()> {
    let mut buf = [0u8; WS_PEEK_BUF];
    let n = stream.peek(&mut buf)?;

    if n >= 4 && &buf == b"GET " {
        let mut peek_buf = [0u8; HTTP_PEEK_BUF];
        let n = stream.peek(&mut peek_buf)?;
        let line = String::from_utf8_lossy(&peek_buf[..n]);

        let endpoint = if line.contains("/json/version") {
            Some("version")
        } else if line.contains("/json/list")
            || line.contains("/json\r\n")
            || line.contains("/json HTTP")
        {
            Some("list")
        } else if line.contains("/json/protocol") {
            Some("protocol")
        } else {
            None
        };

        if let Some(ep) = endpoint {
            return handle_http_json_blocking(stream, port, ep);
        }
        // Fall through: GET request that isn't a /json endpoint → treat as
        // WebSocket upgrade (Chromium DevTools clients issue GET with
        // Upgrade: websocket).
    }

    // Try to hand off the WS stream to the LocalSet. If the bounded channel
    // is full the LocalSet is saturated — drop the connection cleanly
    // rather than blocking the accept thread (which would freeze the HTTP
    // control plane that this whole rework exists to keep alive). The
    // dropped `stream` closes itself; the client will see ECONNRESET and
    // can retry.
    ws_tx.try_send(stream).map_err(|e| match e {
        mpsc::error::TrySendError::Full(_) => {
            warn!(
                "WS handoff channel full ({}); dropping new WebSocket connection",
                MAX_PENDING_WS_HANDOFFS
            );
            anyhow::anyhow!("ws handoff channel full")
        }
        mpsc::error::TrySendError::Closed(_) => anyhow::anyhow!("accept channel closed"),
    })
}

/// Serve an HTTP `/json/*` endpoint with blocking I/O on the accept thread.
fn handle_http_json_blocking(
    mut stream: std::net::TcpStream,
    port: u16,
    endpoint: &str,
) -> anyhow::Result<()> {
    use std::io::{Read, Write};

    let mut buf = vec![0u8; 4096];
    let _ = stream.read(&mut buf)?;

    let body = match endpoint {
        "version" => serde_json::to_string_pretty(&json!({
            "Browser": "Obscura/0.1.0",
            "Protocol-Version": "1.3",
            "User-Agent": "Obscura/0.1.0 (Headless Browser)",
            "V8-Version": "N/A",
            "WebKit-Version": "N/A",
            "webSocketDebuggerUrl": format!("ws://127.0.0.1:{}/devtools/browser", port),
        }))?,
        "list" => serde_json::to_string_pretty(&json!([{
            "description": "",
            "devtoolsFrontendUrl": "",
            "id": "page-1",
            "title": "",
            "type": "page",
            "url": "about:blank",
            "webSocketDebuggerUrl": format!("ws://127.0.0.1:{}/devtools/page/page-1", port),
        }]))?,
        "protocol" => {
            serde_json::to_string_pretty(&json!({ "version": { "major": "1", "minor": "3" } }))?
        }
        _ => "{}".to_string(),
    };

    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body,
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()?;
    Ok(())
}

/// A page that lives on its own OS thread, plus the small bit of metadata the
/// router answers `Target.*` queries with (so they don't round-trip to the
/// thread).
struct PageEntry {
    thread: PageThread,
    url: String,
    title: String,
}

/// The CDP router. Owns NO `Page`/V8 state itself — each page lives on its own
/// OS thread (issue #19 "Option 2"). The router holds a `CdpContext` purely for
/// server-local domains (Browser/Storage and the bookkeeping Target methods),
/// which shares its `BrowserContext` (cookie jar / proxy) with every page
/// thread via the `Arc`.
struct Router {
    ctx: CdpContext,
    shared: Arc<BrowserContext>,
    browser_context_id: String,
    allow_file: bool,
    pages: HashMap<String, PageEntry>,    // page_id -> entry
    sessions: HashMap<String, String>,    // session_id -> page_id
    page_counter: u32,
}

impl Router {
    async fn route(&mut self, text: &str, reply_tx: &mpsc::UnboundedSender<String>) {
        let req: CdpRequest = match serde_json::from_str(text) {
            Ok(r) => r,
            Err(e) => {
                warn!("Invalid CDP: {}: {}", e, &text[..text.len().min(200)]);
                return;
            }
        };
        self.route_req(req, reply_tx).await;
    }

    async fn route_req(&mut self, req: CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        // headless_chrome / older Puppeteer wrap every call inside
        // Target.sendMessageToTarget; unwrap and re-route the inner request.
        if req.method == "Target.sendMessageToTarget" {
            self.route_send_message_to_target(req, reply_tx).await;
            return;
        }

        let (domain, method) = match req.method.split_once('.') {
            Some(x) => x,
            None => {
                let r = CdpResponse::error(
                    req.id,
                    -32601,
                    format!("Invalid method format: {}", req.method),
                    req.session_id.clone(),
                );
                forward(reply_tx, &[], &r);
                return;
            }
        };

        // Page-routed domains → the page's own thread.
        if PAGE_DOMAINS.contains(&domain) {
            self.route_to_page(req, reply_tx).await;
            return;
        }

        // Target lifecycle the router owns directly (pages live in threads).
        if domain == "Target" {
            match method {
                "createTarget" => {
                    self.create_target(req, reply_tx).await;
                    return;
                }
                "closeTarget" => {
                    self.close_target(&req, reply_tx);
                    return;
                }
                "attachToTarget" => {
                    self.attach_to_target(&req, reply_tx);
                    return;
                }
                "getTargets" => {
                    self.get_targets(&req, reply_tx);
                    return;
                }
                "setDiscoverTargets" => {
                    self.set_discover_targets(&req, reply_tx);
                    return;
                }
                "getTargetInfo" => {
                    self.get_target_info(&req, reply_tx);
                    return;
                }
                // attachToBrowserTarget / setAutoAttach / *BrowserContext are
                // page-agnostic bookkeeping — handle on the router context.
                _ => {}
            }
        }

        // Everything else is server-local (Browser.*, Storage.*, the remaining
        // Target.* bookkeeping, no-op domains). No page V8 work, so no lock.
        let resp = dispatch::dispatch_routed(&req, &mut self.ctx).await;
        let events = std::mem::take(&mut self.ctx.pending_events);
        forward(reply_tx, &events, &resp);
    }

    async fn route_send_message_to_target(
        &mut self,
        req: CdpRequest,
        reply_tx: &mpsc::UnboundedSender<String>,
    ) {
        let session_id = req
            .params
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let message = match req.params.get("message").and_then(|v| v.as_str()) {
            Some(m) => m.to_string(),
            None => {
                let r = CdpResponse::error(
                    req.id,
                    -32602,
                    "sendMessageToTarget requires a message string".into(),
                    req.session_id.clone(),
                );
                forward(reply_tx, &[], &r);
                return;
            }
        };
        let inner: CdpRequest = match serde_json::from_str(&message) {
            Ok(r) => r,
            Err(e) => {
                let r = CdpResponse::error(
                    req.id,
                    -32700,
                    format!("sendMessageToTarget message is not a valid CDP request: {e}"),
                    req.session_id.clone(),
                );
                forward(reply_tx, &[], &r);
                return;
            }
        };
        let inner_with_session = CdpRequest {
            id: inner.id,
            method: inner.method,
            params: inner.params,
            session_id: session_id.clone().or(inner.session_id),
        };
        // The inner call forwards its own response/events to the client via
        // reply_tx. Box the recursion to sidestep the async-fn size limit.
        Box::pin(self.route_req(inner_with_session, reply_tx)).await;

        // Ack the wrapper itself.
        let r = CdpResponse::success(req.id, json!({}), req.session_id);
        forward(reply_tx, &[], &r);
    }

    async fn route_to_page(&mut self, req: CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        let page_id = req
            .session_id
            .as_ref()
            .and_then(|sid| self.sessions.get(sid))
            .cloned();
        let page_id = match page_id {
            Some(id) => id,
            None => {
                let r = CdpResponse::error(
                    req.id,
                    -32000,
                    "No page for session".into(),
                    req.session_id.clone(),
                );
                forward(reply_tx, &[], &r);
                return;
            }
        };

        // Keep the router's cached URL roughly current for Target.* queries.
        if req.method == "Page.navigate" {
            if let Some(u) = req.params.get("url").and_then(|v| v.as_str()) {
                if let Some(e) = self.pages.get_mut(&page_id) {
                    e.url = u.to_string();
                }
            }
        }

        let id = req.id;
        let session_id = req.session_id.clone();
        let out = match self.pages.get(&page_id) {
            Some(entry) => entry.thread.dispatch(req).await,
            None => None,
        };
        match out {
            Some(out) => forward(reply_tx, &out.events, &out.response),
            None => {
                // The page thread died (closed channel or a panic that dropped
                // the reply sender). Surface a CDP error instead of aborting —
                // a strict improvement over the old single-thread model where a
                // V8 abort took the whole server down.
                let r = CdpResponse::error(
                    id,
                    -32000,
                    "Page thread is no longer available".into(),
                    session_id,
                );
                forward(reply_tx, &[], &r);
            }
        }
    }

    async fn create_target(&mut self, req: CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        let url = req
            .params
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("about:blank")
            .to_string();

        // Same file:// gate as Page.navigate (GHSA-q55h-vfv9-qcr5).
        if crate::util::url_is_file_scheme(&url) && !self.allow_file {
            let r = CdpResponse::error(
                req.id,
                -32000,
                "Target.createTarget to file:// is disabled. Restart with `obscura serve --allow-file-access` to enable.".into(),
                req.session_id.clone(),
            );
            forward(reply_tx, &[], &r);
            return;
        }

        self.page_counter += 1;
        let page_id = format!("page-{}", self.page_counter);
        let session_id = format!("{}-session", page_id);

        let thread = match PageThread::spawn(
            page_id.clone(),
            session_id.clone(),
            self.shared.clone(),
            reply_tx.clone(),
        ) {
            Ok(t) => t,
            Err(e) => {
                let r = CdpResponse::error(
                    req.id,
                    -32000,
                    format!("failed to spawn page thread: {e}"),
                    req.session_id.clone(),
                );
                forward(reply_tx, &[], &r);
                return;
            }
        };
        self.pages.insert(
            page_id.clone(),
            PageEntry {
                thread,
                url: if url == "about:blank" || url.is_empty() {
                    "about:blank".to_string()
                } else {
                    url.clone()
                },
                title: String::new(),
            },
        );
        self.sessions.insert(session_id.clone(), page_id.clone());

        // If a non-blank URL was given, navigate on the page thread now (the
        // blank page is already loaded on spawn). Forward the navigation's
        // lifecycle events to the client.
        if !(url == "about:blank" || url.is_empty()) {
            let nav = CdpRequest {
                id: 0,
                method: "Page.navigate".to_string(),
                params: json!({ "url": url }),
                session_id: Some(session_id.clone()),
            };
            if let Some(entry) = self.pages.get(&page_id) {
                if let Some(out) = entry.thread.dispatch(nav).await {
                    for e in &out.events {
                        if let Ok(j) = serde_json::to_string(e) {
                            let _ = reply_tx.send(j);
                        }
                    }
                }
            }
        }

        let cached_url = self
            .pages
            .get(&page_id)
            .map(|e| e.url.clone())
            .unwrap_or_default();

        let created = CdpEvent::new(
            "Target.targetCreated",
            json!({
                "targetInfo": {
                    "targetId": page_id,
                    "type": "page",
                    "title": "",
                    "url": cached_url,
                    "attached": false,
                    "canAccessOpener": false,
                    "browserContextId": self.browser_context_id,
                }
            }),
        );
        let attached = CdpEvent::new(
            "Target.attachedToTarget",
            json!({
                "sessionId": session_id,
                "targetInfo": {
                    "targetId": page_id,
                    "type": "page",
                    "title": "",
                    "url": cached_url,
                    "attached": true,
                    "canAccessOpener": false,
                    "browserContextId": self.browser_context_id,
                },
                "waitingForDebugger": false,
            }),
        );
        let resp = CdpResponse::success(req.id, json!({ "targetId": page_id }), req.session_id);
        forward(reply_tx, &[created, attached], &resp);
    }

    fn close_target(&mut self, req: &CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        let target_id = match req.params.get("targetId").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => {
                let r = CdpResponse::error(req.id, -32602, "targetId required".into(), req.session_id.clone());
                forward(reply_tx, &[], &r);
                return;
            }
        };
        let session_id = format!("{}-session", target_id);
        let detached = CdpEvent::new(
            "Target.detachedFromTarget",
            json!({ "sessionId": session_id, "targetId": target_id }),
        );
        let destroyed = CdpEvent::new("Target.targetDestroyed", json!({ "targetId": target_id }));

        // Dropping the PageThread sends Shutdown and joins, dropping the
        // Isolate on its own thread (the only safe place).
        self.pages.remove(&target_id);
        self.sessions.retain(|_, v| v != &target_id);

        let resp = CdpResponse::success(req.id, json!({ "success": true }), req.session_id.clone());
        forward(reply_tx, &[detached, destroyed], &resp);
    }

    fn attach_to_target(&mut self, req: &CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        let target_id = match req.params.get("targetId").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => {
                let r = CdpResponse::error(req.id, -32602, "targetId required".into(), req.session_id.clone());
                forward(reply_tx, &[], &r);
                return;
            }
        };
        let session_id = format!("{}-session", target_id);
        let (url, exists) = match self.pages.get(&target_id) {
            Some(e) => (e.url.clone(), true),
            None => (String::new(), false),
        };
        if exists {
            self.sessions.insert(session_id.clone(), target_id.clone());
        }
        let attached = CdpEvent::new(
            "Target.attachedToTarget",
            json!({
                "sessionId": session_id,
                "targetInfo": {
                    "targetId": target_id,
                    "type": "page",
                    "title": "",
                    "url": url,
                    "attached": true,
                    "canAccessOpener": false,
                    "browserContextId": self.browser_context_id,
                },
                "waitingForDebugger": false,
            }),
        );
        let resp = CdpResponse::success(req.id, json!({ "sessionId": session_id }), req.session_id.clone());
        forward(reply_tx, &[attached], &resp);
    }

    fn get_targets(&mut self, req: &CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        let targets: Vec<_> = self
            .pages
            .iter()
            .map(|(id, e)| {
                json!({
                    "targetId": id,
                    "type": "page",
                    "title": e.title,
                    "url": e.url,
                    "attached": true,
                    "canAccessOpener": false,
                    "browserContextId": self.browser_context_id,
                })
            })
            .collect();
        let resp = CdpResponse::success(req.id, json!({ "targetInfos": targets }), req.session_id.clone());
        forward(reply_tx, &[], &resp);
    }

    fn set_discover_targets(&mut self, req: &CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        let mut events = vec![CdpEvent::new(
            "Target.targetCreated",
            json!({
                "targetInfo": {
                    "targetId": "browser",
                    "type": "browser",
                    "title": "",
                    "url": "",
                    "attached": true,
                    "canAccessOpener": false,
                    "browserContextId": "",
                }
            }),
        )];
        for (id, e) in &self.pages {
            events.push(CdpEvent::new(
                "Target.targetCreated",
                json!({
                    "targetInfo": {
                        "targetId": id,
                        "type": "page",
                        "title": e.title,
                        "url": e.url,
                        "attached": false,
                        "canAccessOpener": false,
                        "browserContextId": self.browser_context_id,
                    }
                }),
            ));
        }
        let resp = CdpResponse::success(req.id, json!({}), req.session_id.clone());
        forward(reply_tx, &events, &resp);
    }

    fn get_target_info(&mut self, req: &CdpRequest, reply_tx: &mpsc::UnboundedSender<String>) {
        let info = match req.params.get("targetId").and_then(|v| v.as_str()) {
            Some(id) => match self.pages.get(id) {
                Some(e) => json!({
                    "targetInfo": {
                        "targetId": id,
                        "type": "page",
                        "title": e.title,
                        "url": e.url,
                        "attached": true,
                        "canAccessOpener": false,
                        "browserContextId": self.browser_context_id,
                    }
                }),
                None => {
                    let r = CdpResponse::error(req.id, -32000, "Target not found".into(), req.session_id.clone());
                    forward(reply_tx, &[], &r);
                    return;
                }
            },
            None => json!({
                "targetInfo": {
                    "targetId": "browser",
                    "type": "browser",
                    "title": "",
                    "url": "",
                    "attached": true,
                    "canAccessOpener": false,
                }
            }),
        };
        let resp = CdpResponse::success(req.id, info, req.session_id.clone());
        forward(reply_tx, &[], &resp);
    }
}

/// Forward a handler's queued events (Chromium semantics: events that are a
/// side-effect of a command arrive BEFORE the command response) and then the
/// response itself, to the connection's writer.
fn forward(reply_tx: &mpsc::UnboundedSender<String>, events: &[CdpEvent], response: &CdpResponse) {
    for event in events {
        if let Ok(json) = serde_json::to_string(event) {
            let _ = reply_tx.send(json);
        }
    }
    if let Ok(json) = serde_json::to_string(response) {
        let _ = reply_tx.send(json);
    }
}

async fn cdp_processor(
    mut rx: mpsc::UnboundedReceiver<ServerMessage>,
    proxy: Option<String>,
    stealth: bool,
    user_agent: Option<String>,
    allow_file_access: bool,
    storage_dir: Option<std::path::PathBuf>,
    render: obscura_browser::RenderSettings,
) {
    let router_ctx = CdpContext::new_with_security_and_render(
        proxy,
        stealth,
        user_agent,
        allow_file_access,
        storage_dir,
        render,
    );
    let shared = router_ctx.default_context.clone();
    let browser_context_id = shared.id.clone();
    let allow_file = shared.allow_file_access;

    let mut router = Router {
        ctx: router_ctx,
        shared,
        browser_context_id,
        allow_file,
        pages: HashMap::new(),
        sessions: HashMap::new(),
        page_counter: 0,
    };

    // Subscribe to Ctrl-C once so cookies are persisted on shutdown.
    let mut shutdown = Box::pin(tokio::signal::ctrl_c());

    loop {
        let msg = tokio::select! {
            msg = rx.recv() => match msg {
                Some(m) => m,
                None => break,
            },
            _ = &mut shutdown => {
                info!("Shutdown signal received");
                break;
            }
        };

        match msg {
            ServerMessage::NewConnection { reply_tx } => {
                let _ = reply_tx.send(json!({"__init": true}).to_string());
            }
            ServerMessage::Cdp(cdp_msg) => {
                router.route(&cdp_msg.text, &cdp_msg.reply_tx).await;
            }
        }
    }

    // Dropping the router drops every PageThread (each joins its thread and
    // drops its Isolate there). Persist cookies from the shared context.
    router.ctx.default_context.save_cookies();
    drop(router);
}

fn fast_path_response(text: &str) -> Option<String> {
    let req: CdpRequest = serde_json::from_str(text).ok()?;

    let result = match req.method.as_str() {
        "Network.enable"
        | "Network.setCacheDisabled"
        | "Network.setRequestInterception"
        | "Page.enable"
        | "Page.setLifecycleEventsEnabled"
        | "Page.setInterceptFileChooserDialog"
        | "Runtime.runIfWaitingForDebugger"
        | "Runtime.discardConsoleEntries"
        | "Performance.enable"
        | "Log.enable"
        | "Security.enable"
        | "Emulation.setDeviceMetricsOverride"
        | "Emulation.setTouchEmulationEnabled"
        | "CSS.enable"
        | "Accessibility.enable"
        | "ServiceWorker.enable"
        | "Inspector.enable"
        | "Debugger.enable"
        | "Profiler.enable"
        | "HeapProfiler.enable"
        | "Overlay.enable"
        | "Storage.enable"
        | "Target.setAutoAttach" => Some(json!({})),
        "Browser.getVersion" => Some(json!({
            "protocolVersion": "1.3",
            "product": "Obscura/0.1.0",
            "revision": "0",
            "userAgent": "Obscura/0.1.0",
            "jsVersion": "V8",
        })),
        "Browser.setDownloadBehavior" | "Browser.getWindowBounds" => Some(json!({})),
        // Critical: Puppeteer calls this as the *first* CDP command on connect
        // (`BrowserConnector._connectToCdpBrowser`). If another client or a long
        // `Page.navigate` holds the single `cdp_processor` task, queued Target
        // commands starve and Puppeteer hits protocolTimeout on
        // `Target.getBrowserContexts`. Fast-path bypasses the queue — same
        // payload as `domains::target::handle` when default context id is
        // `"default"`.
        "Target.getBrowserContexts" => Some(json!({ "browserContextIds": ["default"] })),
        _ => None,
    };

    if let Some(value) = result {
        let resp = CdpResponse::success(req.id, value, req.session_id);
        serde_json::to_string(&resp).ok()
    } else {
        None
    }
}

async fn handle_connection_ws(
    stream: TcpStream,
    msg_tx: mpsc::UnboundedSender<ServerMessage>,
) -> anyhow::Result<()> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    info!("WebSocket connected");
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    let (reply_tx, mut reply_rx) = mpsc::unbounded_channel::<String>();

    let _ = msg_tx.send(ServerMessage::NewConnection {
        reply_tx: reply_tx.clone(),
    });
    if let Some(init_msg) = reply_rx.recv().await {
        tracing::debug!("Connection init: {}", &init_msg[..init_msg.len().min(100)]);
    }

    let send_task = tokio::task::spawn_local(async move {
        while let Some(msg) = reply_rx.recv().await {
            if msg.contains("\"__init\"") {
                continue;
            }
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(msg) = ws_receiver.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                warn!("WS read error: {}", e);
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                if text.contains("\"Browser.close\"") {
                    if let Ok(req) = serde_json::from_str::<CdpRequest>(&text) {
                        let resp = CdpResponse::success(req.id, json!({}), None);
                        if let Ok(json) = serde_json::to_string(&resp) {
                            let _ = reply_tx.send(json);
                        }
                    }
                    break;
                }

                if let Some(resp) = fast_path_response(&text) {
                    let _ = reply_tx.send(resp);
                } else {
                    let _ = msg_tx.send(ServerMessage::Cdp(CdpMessage {
                        text: text.to_string(),
                        reply_tx: reply_tx.clone(),
                    }));
                }
            }
            Message::Close(_) => {
                info!("WS closed by client");
                break;
            }
            _ => {}
        }
    }

    send_task.abort();
    Ok(())
}
