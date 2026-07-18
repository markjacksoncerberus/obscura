//! Issue #19 "Option 2" — proves two pages run V8 on their own OS threads
//! concurrently without the `heap->isolate() == Isolate::TryGetCurrent()`
//! abort that the single-thread model risked.
//!
//! Each `PageThread` owns its isolate on a dedicated OS thread; the router only
//! message-passes. Two concurrent async (event-loop-driven) evaluates here are
//! exactly the interleaving that tripped V8 under the old `LocalSet` model.

use std::sync::Arc;

use obscura_browser::BrowserContext;
use obscura_cdp::page_thread::PageThread;
use obscura_cdp::types::CdpRequest;
use serde_json::json;

fn eval_req(id: u64, expr: &str, await_promise: bool, session: &str) -> CdpRequest {
    CdpRequest {
        id,
        method: "Runtime.evaluate".into(),
        params: json!({
            "expression": expr,
            "returnByValue": true,
            "awaitPromise": await_promise,
        }),
        session_id: Some(session.into()),
    }
}

async fn eval_value(pt: &PageThread, id: u64, expr: &str, await_promise: bool) -> serde_json::Value {
    let out = pt
        .dispatch(eval_req(id, expr, await_promise, &pt.session_id))
        .await
        .expect("page thread should be alive");
    assert!(
        out.response.error.is_none(),
        "Runtime.evaluate errored: {:?}",
        out.response.error
    );
    out.response
        .result
        .expect("evaluate returns a result")
        .get("result")
        .and_then(|r| r.get("value"))
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

#[tokio::test]
async fn two_page_threads_run_v8_concurrently() {
    let shared = Arc::new(BrowserContext::with_options(
        "default".to_string(),
        None,
        false,
    ));

    // event_sink: async events (e.g. Fetch.requestPaused) would stream here; the
    // concurrency test drives no interception, so a detached channel is fine.
    let (sink1, _r1) = tokio::sync::mpsc::unbounded_channel::<String>();
    let (sink2, _r2) = tokio::sync::mpsc::unbounded_channel::<String>();
    let p1 = PageThread::spawn("page-1".into(), "sess-1".into(), shared.clone(), sink1)
        .expect("spawn page-1");
    let p2 = PageThread::spawn("page-2".into(), "sess-2".into(), shared.clone(), sink2)
        .expect("spawn page-2");

    // Synchronous evaluates on two distinct isolates/threads. (V8 numbers come
    // back as f64, so compare numerically rather than by JSON token.)
    assert_eq!(eval_value(&p1, 1, "1 + 1", false).await.as_f64(), Some(2.0));
    assert_eq!(eval_value(&p2, 1, "20 + 22", false).await.as_f64(), Some(42.0));

    // The real test: drive both isolates' event loops at the SAME time. Under
    // the old single-thread + global-lock model, interleaving two pages'
    // V8-touching futures across `.await` is what tripped the V8 fatal abort.
    let f1 = eval_value(&p1, 2, "new Promise(r => setTimeout(() => r(111), 10))", true);
    let f2 = eval_value(&p2, 2, "new Promise(r => setTimeout(() => r(222), 10))", true);
    let (a, b) = tokio::join!(f1, f2);
    assert_eq!(a.as_f64(), Some(111.0), "page-1 async eval");
    assert_eq!(b.as_f64(), Some(222.0), "page-2 async eval");

    // Each page keeps its own realm/state independently across calls (single
    // expressions: the evaluate wrapper parenthesizes, so multi-statement
    // bodies aren't valid here — assignment is itself an expression).
    assert_eq!(
        eval_value(&p1, 3, "globalThis.__x = 'one'", false).await,
        json!("one")
    );
    assert_eq!(
        eval_value(&p2, 3, "globalThis.__x = 'two'", false).await,
        json!("two")
    );
    assert_eq!(eval_value(&p1, 4, "globalThis.__x", false).await, json!("one"));
    assert_eq!(eval_value(&p2, 4, "globalThis.__x", false).await, json!("two"));

    // Dropping the handles joins the threads, dropping each isolate on its own
    // thread (the only safe place).
    drop(p1);
    drop(p2);
}
