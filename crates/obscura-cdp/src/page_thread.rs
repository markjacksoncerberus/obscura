//! Per-page V8 thread — issue #19 "Option 2".
//!
//! A V8 `Isolate` is `!Send`: it must be created, used, and dropped on one OS
//! thread, never moved. `PageThread` spawns a dedicated OS thread running its
//! own current-thread tokio runtime + `LocalSet`; the `Page` (and the
//! `JsRuntime`/Isolate it owns) is created on that thread and never leaves it.
//!
//! The router/main thread talks to a page purely by message passing: a
//! `CdpRequest` goes in, a `PageOutput` (response + the events the handler
//! queued) comes back over a `oneshot`. Because each isolate lives on its own
//! thread, two pages' V8-touching futures can never interleave on a single
//! thread, so the process-wide V8 serialization lock the old single-thread
//! model needed is gone entirely — see the multithread spike in
//! `crates/obscura-js/tests/multithread_spike.rs`.
//!
//! Each page thread runs its OWN single-page `CdpContext`, which lets every
//! existing domain handler work unchanged; per-page state (isolated worlds,
//! valid execution-context ids, fetch interception) is naturally scoped to that
//! context. Shared browser state (cookie jar, proxy, robots cache) stays shared
//! via the `Arc<BrowserContext>` handed to the thread at spawn.

use std::sync::Arc;
use std::collections::HashMap;
use std::thread::JoinHandle;

use obscura_browser::BrowserContext;
use obscura_js::ops::{InterceptResolution, InterceptedRequest};
use tokio::sync::{mpsc, oneshot};

use serde_json::json;

use crate::dispatch::{dispatch_routed, CdpContext};
use crate::types::{CdpEvent, CdpRequest, CdpResponse};

/// Result of running one CDP request on a page thread.
pub struct PageOutput {
    pub response: CdpResponse,
    /// Events the handler queued (`ctx.pending_events`), drained for the router
    /// to forward to the WebSocket client in order, before the response.
    pub events: Vec<CdpEvent>,
}

enum PageCommand {
    Dispatch {
        req: CdpRequest,
        reply: oneshot::Sender<PageOutput>,
    },
    Shutdown,
}

/// Handle to a page that lives on its own OS thread.
///
/// `Send` — it holds only channels, strings, and a join handle. The `!Send`
/// `Page`/`JsRuntime` it controls never crosses this boundary.
pub struct PageThread {
    pub id: String,
    pub session_id: String,
    cmd_tx: mpsc::UnboundedSender<PageCommand>,
    join: Option<JoinHandle<()>>,
}

impl PageThread {
    /// Spawn a dedicated OS thread owning a single-page `CdpContext` built over
    /// the shared `BrowserContext`. The page is created on the thread with the
    /// caller-assigned `page_id` and bound to `session_id` so session routing
    /// from the main thread lines up.
    ///
    /// `event_sink` is the owning connection's reply channel. The page thread
    /// streams asynchronous CDP events to it directly — chiefly the
    /// `Fetch.requestPaused` / `Network.requestWillBeSent` events emitted
    /// *during* a navigation while subresource fetches are parked waiting for
    /// the client's `Fetch.continueRequest` (request-scoped replies can't carry
    /// those, since they must reach the client before that nav's response).
    pub fn spawn(
        page_id: String,
        session_id: String,
        shared: Arc<BrowserContext>,
        event_sink: mpsc::UnboundedSender<String>,
    ) -> std::io::Result<Self> {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel::<PageCommand>();
        let thread_id = page_id.clone();
        let thread_session = session_id.clone();
        let join = std::thread::Builder::new()
            .name(format!("obscura-page-{}", page_id))
            .spawn(move || {
                run_page_thread(thread_id, thread_session, shared, cmd_rx, event_sink);
            })?;
        Ok(PageThread {
            id: page_id,
            session_id,
            cmd_tx,
            join: Some(join),
        })
    }

    /// Send a CDP request to the page thread and await its response + queued
    /// events. Commands are processed FIFO on the thread, preserving per-session
    /// ordering. Returns `None` if the page thread has gone away (closed channel
    /// or a panic that dropped the reply sender) — the router maps that to a CDP
    /// error rather than aborting the process.
    pub async fn dispatch(&self, req: CdpRequest) -> Option<PageOutput> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.cmd_tx
            .send(PageCommand::Dispatch {
                req,
                reply: reply_tx,
            })
            .ok()?;
        reply_rx.await.ok()
    }
}

impl Drop for PageThread {
    fn drop(&mut self) {
        // Ask the thread to stop, then join so the Isolate is dropped on its own
        // thread (the only safe place). Dropping `cmd_tx` alone also ends the
        // recv loop; the explicit Shutdown just makes it prompt.
        let _ = self.cmd_tx.send(PageCommand::Shutdown);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

fn is_fetch_resolution(method: &str) -> bool {
    matches!(
        method,
        "Fetch.continueRequest" | "Fetch.fulfillRequest" | "Fetch.failRequest"
    )
}

/// Flip the resolver of a request parked inside `op_fetch_url`. This only
/// touches the local `paused` map — never the page/V8 — so it's safe to run
/// concurrently with an in-flight navigation that borrows the context.
fn resolve_fetch(
    req: &CdpRequest,
    paused: &mut HashMap<String, oneshot::Sender<InterceptResolution>>,
) {
    let request_id = req
        .params
        .get("requestId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let Some(resolver) = paused.remove(request_id) else {
        return;
    };
    let resolution = match req.method.as_str() {
        "Fetch.continueRequest" => InterceptResolution::Continue {
            url: req.params.get("url").and_then(|v| v.as_str()).map(String::from),
            method: req.params.get("method").and_then(|v| v.as_str()).map(String::from),
            headers: None,
            body: req.params.get("postData").and_then(|v| v.as_str()).map(String::from),
        },
        "Fetch.fulfillRequest" => {
            let status = req
                .params
                .get("responseCode")
                .and_then(|v| v.as_u64())
                .unwrap_or(200) as u16;
            let body = decode_base64(req.params.get("body").and_then(|v| v.as_str()).unwrap_or(""));
            let headers = req
                .params
                .get("responseHeaders")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|h| {
                            Some((
                                h.get("name")?.as_str()?.to_string(),
                                h.get("value")?.as_str()?.to_string(),
                            ))
                        })
                        .collect()
                })
                .unwrap_or_default();
            InterceptResolution::Fulfill { status, headers, body }
        }
        _ => InterceptResolution::Fail {
            reason: req
                .params
                .get("errorReason")
                .and_then(|v| v.as_str())
                .unwrap_or("Failed")
                .to_string(),
        },
    };
    let _ = resolver.send(resolution);
}

/// Stream the `Network.requestWillBeSent` + `Fetch.requestPaused` pair for a
/// parked subresource to the owning connection so the client can resolve it.
fn emit_request_paused(
    intercepted: &InterceptedRequest,
    session_id: &Option<String>,
    frame_id: &str,
    event_sink: &mpsc::UnboundedSender<String>,
) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();
    let request = json!({
        "url": intercepted.url,
        "method": intercepted.method,
        "headers": intercepted.headers,
        "initialPriority": "High",
        "referrerPolicy": "strict-origin-when-cross-origin",
    });
    let rws = json!({
        "method": "Network.requestWillBeSent",
        "params": {
            "requestId": intercepted.request_id,
            "loaderId": "",
            "documentURL": "",
            "request": request,
            "timestamp": now,
            "wallTime": now,
            "initiator": {"type": "script"},
            "type": intercepted.resource_type,
            "frameId": frame_id,
        },
        "sessionId": session_id,
    });
    let paused = json!({
        "method": "Fetch.requestPaused",
        "params": {
            "requestId": intercepted.request_id,
            "request": request,
            "frameId": frame_id,
            "resourceType": intercepted.resource_type,
            "networkId": intercepted.request_id,
            "responseErrorReason": null,
            "responseStatusCode": null,
            "responseHeaders": null,
        },
        "sessionId": session_id,
    });
    let _ = event_sink.send(rws.to_string());
    let _ = event_sink.send(paused.to_string());
}

fn run_page_thread(
    page_id: String,
    session_id: String,
    shared: Arc<BrowserContext>,
    mut cmd_rx: mpsc::UnboundedReceiver<PageCommand>,
    event_sink: mpsc::UnboundedSender<String>,
) {
    let rt = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            tracing::error!("page {} failed to build tokio runtime: {}", page_id, e);
            return;
        }
    };
    let local = tokio::task::LocalSet::new();
    local.block_on(&rt, async move {
        // The Page + its JsRuntime are created HERE and never leave this thread.
        let mut ctx = CdpContext::with_shared_context(shared);
        ctx.insert_page_with_id(page_id, Some(session_id));

        // Channel `op_fetch_url` emits parked subresource requests on when this
        // page has Fetch interception enabled. Owned by this thread's loop.
        let (itx, mut irx) = mpsc::unbounded_channel::<InterceptedRequest>();
        ctx.intercept_tx = Some(itx);
        // request_id -> resolver for requests currently paused in the op.
        let mut paused: HashMap<String, oneshot::Sender<InterceptResolution>> = HashMap::new();

        'outer: while let Some(cmd) = cmd_rx.recv().await {
            let (req, reply) = match cmd {
                PageCommand::Dispatch { req, reply } => (req, reply),
                PageCommand::Shutdown => break,
            };

            // Fetch resolutions flip a parked op's resolver directly; they must
            // NOT go through dispatch_routed (whose fetch handler resolves a
            // different, unused resolver map).
            if is_fetch_resolution(&req.method) {
                resolve_fetch(&req, &mut paused);
                let resp = CdpResponse::success(req.id, json!({}), req.session_id.clone());
                let _ = reply.send(PageOutput { response: resp, events: vec![] });
                continue;
            }

            // Navigation with interception on: drive the nav while concurrently
            // servicing intercept events and Fetch resolutions on this thread.
            // Other commands that need the page are deferred until the nav ends.
            if req.method == "Page.navigate" && ctx.fetch_intercept.enabled {
                let frame_id = ctx
                    .get_session_page(&req.session_id)
                    .map(|p| p.frame_id.clone())
                    .unwrap_or_default();
                let es = req.session_id.clone();
                let mut deferred: Vec<(CdpRequest, oneshot::Sender<PageOutput>)> = Vec::new();
                let mut shutdown_requested = false;
                let response;
                {
                    let nav_fut = dispatch_routed(&req, &mut ctx);
                    tokio::pin!(nav_fut);
                    // The loop only breaks when the navigation completes, so
                    // `response` is always set. A Shutdown that arrives mid-nav
                    // just flags us to exit once the in-flight nav finishes.
                    loop {
                        tokio::select! {
                            r = &mut nav_fut => { response = r; break; }
                            Some(intercepted) = irx.recv() => {
                                emit_request_paused(&intercepted, &es, &frame_id, &event_sink);
                                paused.insert(intercepted.request_id.clone(), intercepted.resolver);
                            }
                            Some(cmd2) = cmd_rx.recv() => {
                                match cmd2 {
                                    PageCommand::Shutdown => { shutdown_requested = true; }
                                    PageCommand::Dispatch { req: r2, reply: reply2 } => {
                                        if is_fetch_resolution(&r2.method) {
                                            resolve_fetch(&r2, &mut paused);
                                            let resp = CdpResponse::success(r2.id, json!({}), r2.session_id.clone());
                                            let _ = reply2.send(PageOutput { response: resp, events: vec![] });
                                        } else {
                                            // Needs the page (borrowed by the nav) — defer.
                                            deferred.push((r2, reply2));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                let events = std::mem::take(&mut ctx.pending_events);
                let _ = reply.send(PageOutput { response, events });

                // Now that the nav is done and the context is free, drain any
                // commands deferred during it.
                for (r2, reply2) in deferred {
                    let resp = dispatch_routed(&r2, &mut ctx).await;
                    let evs = std::mem::take(&mut ctx.pending_events);
                    let _ = reply2.send(PageOutput { response: resp, events: evs });
                }
                if shutdown_requested {
                    break 'outer;
                }
                continue 'outer;
            }

            // Normal path (no interception): dispatch, then the JS-triggered
            // navigation follow-up (window.location =, form submit, meta
            // refresh) the page surfaced.
            let response = dispatch_routed(&req, &mut ctx).await;
            let mut events = std::mem::take(&mut ctx.pending_events);
            if let Some((url, method, body)) = ctx
                .get_session_page_mut(&req.session_id)
                .and_then(|p| p.take_pending_navigation())
            {
                let nav_req = CdpRequest {
                    id: 0,
                    method: "Page.navigate".to_string(),
                    params: json!({"url": url, "__method": method, "__body": body}),
                    session_id: req.session_id.clone(),
                };
                let _ = dispatch_routed(&nav_req, &mut ctx).await;
                events.extend(std::mem::take(&mut ctx.pending_events));
            }
            let _ = reply.send(PageOutput { response, events });
        }
        // `ctx` (and the Page / V8 Isolate) drop here, on this thread.
    });
}

/// Minimal base64 decode for `Fetch.fulfillRequest` bodies (CDP sends them
/// base64-encoded). Mirrors the standard alphabet; ignores non-alphabet bytes.
fn decode_base64(input: &str) -> String {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bytes: Vec<u8> = input.bytes().filter_map(val).collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let b = [
            chunk.first().copied().unwrap_or(0),
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
            chunk.get(3).copied().unwrap_or(0),
        ];
        out.push((b[0] << 2) | (b[1] >> 4));
        if chunk.len() > 2 {
            out.push((b[1] << 4) | (b[2] >> 2));
        }
        if chunk.len() > 3 {
            out.push((b[2] << 6) | b[3]);
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

// Compile-time guarantee that the handle crosses threads even though the Page
// it controls cannot.
#[allow(dead_code)]
fn _assert_send() {
    fn assert_send<T: Send>() {}
    assert_send::<PageThread>();
    assert_send::<Arc<BrowserContext>>();
}
