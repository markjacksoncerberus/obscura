//! The real WebSocket transport behind `bootstrap.js`'s `WebSocket`.
//!
//! **Why a browser needs this at all.** HTTP is a question-and-answer protocol:
//! the page asks, the server answers, the connection ends. Anything that has to
//! arrive *without being asked for* — a message in a chat, the next bus, a
//! doctor's queue position, a live score, a collaborative edit — is either a
//! WebSocket or it is polling. Polling is the same page fetched over and over,
//! every few seconds, forever. On a metered connection that is the difference
//! between a page that costs a few kilobytes and one that quietly eats a data
//! bundle; on a slow CPU it is the difference between an idle tab and one that
//! never stops working. A browser without WebSocket does not fail to show those
//! sites — it shows them, expensively and badly.
//!
//! **What is here and what is not.** This module moves bytes and nothing else.
//! Every web-facing rule — which URLs are legal, which subprotocol strings are
//! tokens, which close codes a page may send, when `send()` throws — lives in
//! `bootstrap.js`, next to the interface those rules belong to. The split is the
//! same one the crypto and compression ops keep.
//!
//! **Handles, not objects.** A connection is stateful and long-lived, so JS gets
//! an integer and the connection lives in a thread-local table. The sink and the
//! stream are stored SEPARATELY (`StreamExt::split`) for one specific reason: a
//! read is a long await — that is the entire point of a WebSocket, it waits for
//! something that has not happened yet — and if a pending read held the whole
//! connection, `send()` could not run until the server happened to say
//! something. Splitting is what makes a full-duplex API actually full-duplex.

use std::cell::RefCell;
use std::collections::HashMap;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use deno_core::op2;
use deno_error::JsErrorBox;
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

struct Conn {
    sink: Option<SplitSink<WsStream, Message>>,
    stream: Option<SplitStream<WsStream>>,
    /// Set once the peer's close frame (or a transport failure) has been seen, so
    /// a second `op_ws_recv` answers immediately instead of hanging on a socket
    /// that will never speak again.
    finished: bool,
}

thread_local! {
    static CONNS: RefCell<HashMap<u32, Conn>> = RefCell::new(HashMap::new());
    static NEXT_ID: RefCell<u32> = const { RefCell::new(1) };
}

fn err(msg: impl std::fmt::Display) -> JsErrorBox {
    JsErrorBox::type_error(msg.to_string())
}

/// Open a connection. Returns `{"id":N,"protocol":"…","extensions":"…"}`.
///
/// The subprotocol list is sent as one comma-separated `Sec-WebSocket-Protocol`
/// header and the server picks at most one; whatever it picked is handed back so
/// `ws.protocol` can report it. A server that picks something we did not offer is
/// a protocol violation, but it is JS's business to notice — this op reports what
/// arrived.
#[op2(async)]
#[string]
pub async fn op_ws_connect(
    #[string] url: String,
    #[string] protocols: String,
) -> Result<String, JsErrorBox> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let mut request = url.as_str().into_client_request().map_err(err)?;
    if !protocols.is_empty() {
        let value = protocols
            .parse::<tokio_tungstenite::tungstenite::http::HeaderValue>()
            .map_err(err)?;
        request
            .headers_mut()
            .insert("Sec-WebSocket-Protocol", value);
    }

    let (ws, response) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(err)?;

    let header = |name: &str| -> String {
        response
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string()
    };
    let protocol = header("sec-websocket-protocol");
    let extensions = header("sec-websocket-extensions");

    let (sink, stream) = ws.split();
    let id = NEXT_ID.with(|n| {
        let mut n = n.borrow_mut();
        let id = *n;
        *n += 1;
        id
    });
    CONNS.with(|c| {
        c.borrow_mut().insert(
            id,
            Conn { sink: Some(sink), stream: Some(stream), finished: false },
        )
    });

    Ok(serde_json::json!({
        "id": id,
        "protocol": protocol,
        "extensions": extensions,
    })
    .to_string())
}

/// Await the next message. Answers one of:
///   `{"type":"text","data":"…"}`
///   `{"type":"binary","data":"<base64>"}`
///   `{"type":"close","code":N,"reason":"…","clean":true}`
///   `{"type":"error","message":"…"}`
///
/// Ping/pong are answered by the library and never surface: a page has no say in
/// keepalive, and handing it those frames would only invite it to get them wrong.
#[op2(async)]
#[string]
pub async fn op_ws_recv(id: u32) -> Result<String, JsErrorBox> {
    // Take the read half OUT of the table for the duration of the await. Holding
    // a RefCell borrow across an await point would deadlock the next op on this
    // thread — and `send()` running while a read is pending is the normal case.
    let mut stream = match CONNS.with(|c| {
        let mut map = c.borrow_mut();
        match map.get_mut(&id) {
            Some(conn) if conn.finished => None,
            Some(conn) => conn.stream.take(),
            None => None,
        }
    }) {
        Some(s) => s,
        None => return Ok(r#"{"type":"close","code":1006,"reason":"","clean":false}"#.to_string()),
    };

    let next = stream.next().await;

    // Put it back before answering, unless the conversation is over.
    let mut done = false;
    let out = match next {
        Some(Ok(Message::Text(t))) => {
            serde_json::json!({ "type": "text", "data": t.as_str() }).to_string()
        }
        Some(Ok(Message::Binary(b))) => {
            serde_json::json!({ "type": "binary", "data": BASE64.encode(&b) }).to_string()
        }
        Some(Ok(Message::Close(frame))) => {
            done = true;
            let (code, reason) = match frame {
                Some(CloseFrame { code, reason }) => (u16::from(code), reason.to_string()),
                // A close with no payload is still a clean close; 1005 is the
                // code the spec reserves for "no status was actually present",
                // and it must never be sent on the wire.
                None => (1005u16, String::new()),
            };
            serde_json::json!({ "type": "close", "code": code, "reason": reason, "clean": true })
                .to_string()
        }
        Some(Ok(_)) => {
            // Ping / Pong / Frame — handled beneath us; ask again.
            serde_json::json!({ "type": "skip" }).to_string()
        }
        Some(Err(e)) => {
            done = true;
            serde_json::json!({ "type": "error", "message": e.to_string() }).to_string()
        }
        None => {
            // The stream ended without a close frame: the connection was cut.
            // 1006 exists precisely to say "this did not end properly", and a
            // page that syncs on reconnect needs to be able to tell the
            // difference.
            done = true;
            r#"{"type":"close","code":1006,"reason":"","clean":false}"#.to_string()
        }
    };
    CONNS.with(|c| {
        if let Some(conn) = c.borrow_mut().get_mut(&id) {
            conn.stream = Some(stream);
            if done {
                conn.finished = true;
            }
        }
    });
    Ok(out)
}

async fn send_message(id: u32, msg: Message) -> Result<(), JsErrorBox> {
    let mut sink = match CONNS.with(|c| c.borrow_mut().get_mut(&id).and_then(|x| x.sink.take())) {
        Some(s) => s,
        // Either the handle is gone or a send is already in flight. Dropping the
        // payload silently is the right answer for the closing case (the spec
        // says a send after close is discarded, not an error) and the only safe
        // one for a racing send.
        None => return Ok(()),
    };
    let res = sink.send(msg).await;
    CONNS.with(|c| {
        if let Some(conn) = c.borrow_mut().get_mut(&id) {
            conn.sink = Some(sink);
        }
    });
    res.map_err(err)
}

#[op2(async)]
pub async fn op_ws_send_text(id: u32, #[string] text: String) -> Result<(), JsErrorBox> {
    send_message(id, Message::Text(text.into())).await
}

#[op2(async)]
pub async fn op_ws_send_binary(id: u32, #[buffer(copy)] data: Vec<u8>) -> Result<(), JsErrorBox> {
    send_message(id, Message::Binary(data.into())).await
}

/// Send a close frame. `code == 0` means "no code" — the spec's "close the
/// connection with no status", which is NOT the same as sending 1005 (that code
/// is reserved for the *receiver* to report an absent status and is illegal on
/// the wire).
#[op2(async)]
pub async fn op_ws_close(
    id: u32,
    code: u16,
    #[string] reason: String,
) -> Result<(), JsErrorBox> {
    let frame = if code == 0 {
        None
    } else {
        Some(CloseFrame { code: CloseCode::from(code), reason: reason.into() })
    };
    let _ = send_message(id, Message::Close(frame)).await;
    Ok(())
}

/// Drop the handle. Called when the JS object has seen its close event, so the
/// table cannot grow for the lifetime of a long-lived page.
#[op2(fast)]
pub fn op_ws_forget(id: u32) {
    CONNS.with(|c| c.borrow_mut().remove(&id));
}
