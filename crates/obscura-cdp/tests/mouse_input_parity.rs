use obscura_cdp::dispatch::{dispatch, CdpContext};
use obscura_cdp::types::CdpRequest;
use serde_json::{json, Value};

async fn cdp(
    ctx: &mut CdpContext,
    id: u64,
    method: &str,
    params: Value,
    session_id: &str,
) -> Value {
    let resp = dispatch(
        &CdpRequest {
            id,
            method: method.to_string(),
            params,
            session_id: Some(session_id.to_string()),
        },
        ctx,
    )
    .await;
    assert!(
        resp.error.is_none(),
        "CDP {method} failed: {:?}",
        resp.error
    );
    resp.result.unwrap_or_else(|| json!({}))
}

async fn setup_session() -> (CdpContext, String, String) {
    let mut ctx = CdpContext::new();
    let page_id = ctx.create_page();
    let session_id = "session-1".to_string();
    ctx.sessions.insert(session_id.clone(), page_id.clone());
    (ctx, page_id, session_id)
}

async fn read_log(ctx: &mut CdpContext, session_id: &str, id: u64) -> Vec<String> {
    let value = cdp(
        ctx,
        id,
        "Runtime.evaluate",
        json!({"expression": "JSON.stringify(globalThis.__mouseLog || [])", "returnByValue": true}),
        session_id,
    )
    .await;
    let encoded = value["result"]["value"].as_str().unwrap_or("[]");
    serde_json::from_str(encoded).unwrap_or_default()
}

#[tokio::test(flavor = "current_thread")]
async fn mouse_right_middle_and_wheel_map_to_standard_events() {
    let (mut ctx, _page_id, session_id) = setup_session().await;
    cdp(
        &mut ctx,
        1,
        "Runtime.evaluate",
        json!({
            "expression": r#"
                (() => {
                    document.body.innerHTML = '<button id="btn">button</button>';
                    const btn = document.getElementById('btn');
                    globalThis.__mouseLog = [];
                    ['mousedown','mouseup','click','auxclick','contextmenu','wheel'].forEach((type) => {
                        btn.addEventListener(type, (e) => {
                            globalThis.__mouseLog.push(type + ':' + e.button + ':' + (e.deltaY || 0));
                        });
                    });
                    btn.focus();
                    globalThis.__obscura_click_target = btn;
                })()
            "#
        }),
        &session_id,
    )
    .await;

    cdp(
        &mut ctx,
        2,
        "Input.dispatchMouseEvent",
        json!({"type":"mousePressed","x":10,"y":10,"button":"right","clickCount":1}),
        &session_id,
    )
    .await;
    cdp(
        &mut ctx,
        3,
        "Input.dispatchMouseEvent",
        json!({"type":"mouseReleased","x":10,"y":10,"button":"right","clickCount":1}),
        &session_id,
    )
    .await;
    cdp(
        &mut ctx,
        4,
        "Input.dispatchMouseEvent",
        json!({"type":"mousePressed","x":10,"y":10,"button":"middle","clickCount":1}),
        &session_id,
    )
    .await;
    cdp(
        &mut ctx,
        5,
        "Input.dispatchMouseEvent",
        json!({"type":"mouseReleased","x":10,"y":10,"button":"middle","clickCount":1}),
        &session_id,
    )
    .await;
    cdp(
        &mut ctx,
        6,
        "Input.dispatchMouseEvent",
        json!({"type":"mouseWheel","x":10,"y":10,"deltaX":0,"deltaY":120}),
        &session_id,
    )
    .await;

    let log = read_log(&mut ctx, &session_id, 7).await;
    assert!(
        log.iter().any(|line| line.starts_with("contextmenu:2")),
        "expected right click to emit contextmenu; got {:?}",
        log
    );
    assert!(
        log.iter().any(|line| line.starts_with("auxclick:1")),
        "expected middle click to emit auxclick; got {:?}",
        log
    );
    assert!(
        log.iter().any(|line| line == "wheel:-1:120"),
        "expected mouse wheel delta to be surfaced; got {:?}",
        log
    );
}

#[tokio::test(flavor = "current_thread")]
async fn mouse_hold_and_drag_do_not_force_click() {
    let (mut ctx, _page_id, session_id) = setup_session().await;
    cdp(
        &mut ctx,
        10,
        "Runtime.evaluate",
        json!({
            "expression": r#"
                (() => {
                    document.body.innerHTML = '<div id="src">source</div><div id="dst">dest</div>';
                    const src = document.getElementById('src');
                    const dst = document.getElementById('dst');
                    globalThis.__mouseLog = [];
                    ['mousedown','mouseup','click','dragstart','drag','dragover','drop','dragend'].forEach((type) => {
                        src.addEventListener(type, () => globalThis.__mouseLog.push(type + ':src'));
                        dst.addEventListener(type, () => globalThis.__mouseLog.push(type + ':dst'));
                    });
                    src.focus();
                    globalThis.__obscura_click_target = src;
                })()
            "#
        }),
        &session_id,
    )
    .await;

    cdp(
        &mut ctx,
        11,
        "Input.dispatchMouseEvent",
        json!({"type":"mousePressed","x":5,"y":5,"button":"left","clickCount":1}),
        &session_id,
    )
    .await;
    let hold_log = read_log(&mut ctx, &session_id, 12).await;
    assert!(
        hold_log.iter().any(|line| line == "mousedown:src"),
        "expected mousedown from click-and-hold; got {:?}",
        hold_log
    );
    assert!(
        !hold_log.iter().any(|line| line == "click:src"),
        "click must not fire on hold before release; got {:?}",
        hold_log
    );

    cdp(
        &mut ctx,
        13,
        "Runtime.evaluate",
        json!({"expression": "document.elementFromPoint = () => document.getElementById('dst')"}),
        &session_id,
    )
    .await;
    cdp(
        &mut ctx,
        14,
        "Input.dispatchMouseEvent",
        json!({"type":"mouseMoved","x":30,"y":30,"button":"left","buttons":1}),
        &session_id,
    )
    .await;
    cdp(
        &mut ctx,
        15,
        "Input.dispatchMouseEvent",
        json!({"type":"mouseReleased","x":30,"y":30,"button":"left","clickCount":1}),
        &session_id,
    )
    .await;

    let log = read_log(&mut ctx, &session_id, 16).await;
    assert!(
        log.iter().any(|line| line == "dragstart:src"),
        "expected dragstart on source; got {:?}",
        log
    );
    assert!(
        log.iter().any(|line| line == "drop:dst"),
        "expected drop on destination; got {:?}",
        log
    );
    assert!(
        log.iter().any(|line| line == "dragend:src"),
        "expected dragend on source; got {:?}",
        log
    );
    assert!(
        !log.iter().any(|line| line == "click:src"),
        "dragging should not force click on source; got {:?}",
        log
    );
}
