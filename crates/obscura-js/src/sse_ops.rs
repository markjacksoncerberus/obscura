//! The streaming HTTP transport behind `bootstrap.js`'s `EventSource`.
//!
//! **Why this is not just another fetch.** Server-Sent Events is the cheapest
//! way a page can be *told* something. It is one ordinary HTTP GET that the
//! server simply never finishes: a bus that is four minutes away, a place in a
//! clinic queue, an exam result, a delivery that has left the depot. The
//! alternative is polling — the same request re-sent every few seconds, forever
//! — and on a metered connection that is a data bundle spent on nothing, on a
//! slow CPU a tab that never goes idle, and on a phone a battery that dies
//! before the bus arrives.
//!
//! WebSocket can do this too, and does it better when both sides talk. But SSE
//! costs one connection, no upgrade handshake, no framing layer, no ping/pong
//! keepalive, and it reconnects *by itself* with the browser remembering where
//! it got to. For "the server talks, the page listens" it is the smaller tool,
//! and smaller is the whole point of this browser.
//!
//! **Why it needs its own op at all.** `op_fetch_url` reads the response to
//! completion and hands back a body. An event stream has no completion — a fetch
//! that waits for one waits forever, and a page built on it shows nothing until
//! the server gives up. So this module keeps the response OPEN and hands JS one
//! chunk at a time.
//!
//! **The split, as everywhere else here:** this moves bytes. Every web-facing
//! rule — the line-based stream format, which fields mean what, when to
//! reconnect, what `Last-Event-ID` should be — lives in `bootstrap.js` next to
//! the interface those rules belong to.

use std::cell::RefCell;
use std::collections::HashMap;
use std::pin::Pin;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use deno_core::op2;
use deno_core::OpState;
use deno_error::JsErrorBox;
use futures_util::{Stream, StreamExt};

type ByteStream = Pin<Box<dyn Stream<Item = Result<Vec<u8>, reqwest::Error>>>>;

struct Conn {
    /// Taken out for the duration of a read and put back afterwards, so the
    /// `RefCell` borrow is never held across an await — the same discipline
    /// `ws_ops` keeps, and for the same reason: a read on an event stream is a
    /// long wait by design.
    stream: Option<ByteStream>,
    /// Once the server has stopped talking there is nothing more to wait for, so
    /// a second read answers immediately instead of hanging on a dead socket.
    finished: bool,
}

thread_local! {
    static CONNS: RefCell<HashMap<u32, Conn>> = RefCell::new(HashMap::new());
    static NEXT_ID: RefCell<u32> = const { RefCell::new(1) };
}

fn err(msg: impl std::fmt::Display) -> JsErrorBox {
    JsErrorBox::type_error(msg.to_string())
}

/// Redirect hops followed before giving up — the same cap `op_fetch_url` uses,
/// and the same reason: a redirect loop is otherwise an unbounded request.
const REDIRECT_LIMIT: usize = 10;

/// Open an event stream.
///
/// Returns `{"id":N,"status":S,"contentType":"…","url":"…"}` on a connection that
/// was made — *whatever* the server said. A 404 or a `text/html` body is not a
/// transport failure, it is an answer, and it is JS that must decide the
/// difference between "retry this" and "stop, this will never work". A genuine
/// transport failure (DNS, refused, TLS) comes back as `Err`.
#[op2(async)]
#[string]
pub async fn op_sse_connect(
    state: std::rc::Rc<RefCell<OpState>>,
    #[string] url: String,
    #[string] last_event_id: String,
    #[string] origin: String,
    with_credentials: bool,
) -> Result<String, JsErrorBox> {
    let (cookie_jar, proxy_url) = {
        let state_borrow = state.borrow();
        let gs = state_borrow.borrow::<crate::ops::SharedState>().clone();
        let gs = gs.borrow();
        let jar = gs.cookie_jar.clone();
        let proxy = gs
            .http_client
            .as_ref()
            .and_then(|c| c.proxy_url().map(|s| s.to_string()));
        (jar, proxy)
    };

    // ⚠️ Redirects are followed BY HAND, and every hop is re-validated against the
    // same SSRF policy as the first. With reqwest's auto-follow an
    // attacker-controlled origin can answer `302 Location: http://127.0.0.1/…`
    // and the stream that comes back is an internal service, read out over an
    // API the page opened itself. `op_fetch_url` closed this door
    // (GHSA-8v6v-g4rh-jmcm); a new transport must not quietly reopen it.
    let mut builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
    if let Some(proxy) = proxy_url.as_deref() {
        builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(err)?);
    }
    let client = builder.build().map_err(err)?;

    let mut current = url::Url::parse(&url).map_err(err)?;
    crate::ops::validate_fetch_url(&current).map_err(err)?;

    let mut hops = 0usize;
    let resp = loop {
        let mut req = client
            .get(current.as_str())
            // The one header that says "I want the stream, not the page".
            .header("Accept", "text/event-stream")
            // An event stream must never be served from cache: a cached stream is
            // a recording of what was happening the last time, replayed as if it
            // were now.
            .header("Cache-Control", "no-store");
        if !origin.is_empty() {
            req = req.header("Origin", &origin);
        }
        // The whole point of `Last-Event-ID`: after a dropped connection the page
        // does not start again from nothing, it says where it got to and the
        // server resumes. That is what makes a flaky connection survivable rather
        // than a reason to reload the page.
        if !last_event_id.is_empty() {
            req = req.header("Last-Event-ID", &last_event_id);
        }
        if with_credentials {
            if let Some(ref jar) = cookie_jar {
                let cookies = jar.get_cookie_header(&current);
                if !cookies.is_empty() {
                    req = req.header("Cookie", cookies);
                }
            }
        }

        let resp = req.send().await.map_err(err)?;
        let status = resp.status().as_u16();
        let is_redirect = matches!(status, 301 | 302 | 303 | 307 | 308);
        if !is_redirect {
            break resp;
        }
        hops += 1;
        if hops > REDIRECT_LIMIT {
            return Err(err("too many redirects"));
        }
        let location = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let next = match location {
            // A redirect with no usable Location is not a redirect, it is a
            // broken response — hand it back as-is rather than guessing.
            None => break resp,
            Some(loc) => match current.join(&loc) {
                Ok(u) => u,
                Err(_) => break resp,
            },
        };
        crate::ops::validate_fetch_url(&next).map_err(err)?;
        current = next;
    };
    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let final_url = resp.url().to_string();

    let id = NEXT_ID.with(|n| {
        let mut n = n.borrow_mut();
        let id = *n;
        *n += 1;
        id
    });
    let stream: ByteStream = Box::pin(resp.bytes_stream().map(|r| r.map(|b| b.to_vec())));
    CONNS.with(|c| {
        c.borrow_mut().insert(
            id,
            Conn {
                stream: Some(stream),
                finished: false,
            },
        )
    });

    Ok(serde_json::json!({
        "id": id,
        "status": status,
        "contentType": content_type,
        "url": final_url,
    })
    .to_string())
}

/// Wait for the next chunk of the stream.
///
/// Returns `{"data":"<base64>"}` for bytes, `{"done":true}` when the server
/// finished or the connection dropped, and `{"error":"…"}` for a transport
/// failure mid-stream. The bytes come back base64 rather than as a string
/// because a chunk boundary can fall in the MIDDLE of a UTF-8 sequence — a
/// two-byte é split across two reads decodes to two replacement characters if
/// each half is decoded on its own. JS holds one streaming `TextDecoder` for the
/// whole connection, which is the only place that boundary can be handled.
#[op2(async)]
#[string]
pub async fn op_sse_read(id: u32) -> Result<String, JsErrorBox> {
    let mut stream = match CONNS.with(|c| {
        c.borrow_mut()
            .get_mut(&id)
            .and_then(|conn| if conn.finished { None } else { conn.stream.take() })
    }) {
        Some(s) => s,
        None => return Ok(r#"{"done":true}"#.to_string()),
    };

    let next = stream.next().await;

    // Put the stream back (unless it is spent) before answering, so a closed
    // connection frees its socket rather than waiting on a JS-side `close()`
    // that a page whose tab was thrown away will never make.
    let out = match next {
        Some(Ok(bytes)) => {
            CONNS.with(|c| {
                if let Some(conn) = c.borrow_mut().get_mut(&id) {
                    conn.stream = Some(stream);
                }
            });
            serde_json::json!({ "data": BASE64.encode(&bytes) }).to_string()
        }
        Some(Err(e)) => {
            CONNS.with(|c| {
                if let Some(conn) = c.borrow_mut().get_mut(&id) {
                    conn.finished = true;
                }
            });
            serde_json::json!({ "error": e.to_string() }).to_string()
        }
        None => {
            CONNS.with(|c| {
                if let Some(conn) = c.borrow_mut().get_mut(&id) {
                    conn.finished = true;
                }
            });
            r#"{"done":true}"#.to_string()
        }
    };
    Ok(out)
}

/// Drop the connection. Dropping the boxed stream closes the socket, which is
/// what makes `EventSource.close()` mean what it says: a page that stopped
/// caring stops costing the server a connection and the device a radio.
#[op2(fast)]
pub fn op_sse_close(id: u32) {
    CONNS.with(|c| c.borrow_mut().remove(&id));
}
