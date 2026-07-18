//! Spike for issue-#19 "Option 2": pin each page's V8 runtime to its own OS
//! thread. The open question this de-risks: deno_core's V8 *platform* init is
//! process-global and lazy. Does it synchronize when several OS threads call
//! `JsRuntime::new` at once, or does it race / abort?
//!
//! Strategy: spawn N std::threads, each with its OWN current-thread tokio
//! runtime + LocalSet. A `Barrier` forces all N threads to call
//! `ObscuraJsRuntime::new()` at the same instant to maximize the init-race
//! window. Each thread then runs a sync `1+1` eval and an async
//! `setTimeout`-backed Promise driven to completion via the event loop.
//!
//! Run with TRUE parallelism (the test spawns threads itself):
//!   cargo test -p obscura-js --test multithread_spike -- --nocapture

use std::sync::{Arc, Barrier};

use obscura_js::runtime::ObscuraJsRuntime;

const N: usize = 4;

#[test]
fn v8_multithread_spike() {
    let barrier = Arc::new(Barrier::new(N));
    let mut handles = Vec::with_capacity(N);

    for tid in 0..N {
        let barrier = barrier.clone();
        let handle = std::thread::Builder::new()
            .name(format!("page-v8-{tid}"))
            .spawn(move || -> Result<(i64, i64), String> {
                // Each OS thread gets its OWN current-thread tokio runtime.
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| format!("tokio build: {e}"))?;

                let local = tokio::task::LocalSet::new();
                local.block_on(&rt, async move {
                    // Maximize the race: all N threads hit new() together.
                    barrier.wait();

                    let mut js = ObscuraJsRuntime::new();

                    // (a) trivial synchronous eval.
                    let one_plus_one = js
                        .evaluate("1 + 1")
                        .map_err(|e| format!("eval 1+1: {e}"))?;
                    let sync_val = one_plus_one
                        .as_f64()
                        .ok_or_else(|| format!("1+1 not a number: {one_plus_one:?}"))?
                        as i64;

                    // (b) async Promise driven to completion via the event
                    // loop (evaluate_for_cdp with await_promise=true pumps
                    // run_event_loop under the hood).
                    let info = js
                        .evaluate_for_cdp(
                            "new Promise(r => setTimeout(() => r(42), 5))",
                            true,
                            true,
                        )
                        .await
                        .map_err(|e| format!("eval promise: {e}"))?;
                    let async_val = info
                        .value
                        .ok_or_else(|| "promise produced no value".to_string())?
                        .as_f64()
                        .ok_or_else(|| "promise value not a number".to_string())?
                        as i64;

                    // Drop the runtime (and its isolate) on this same thread.
                    drop(js);

                    Ok((sync_val, async_val))
                })
            })
            .expect("spawn thread");
        handles.push(handle);
    }

    let mut results = Vec::with_capacity(N);
    for h in handles {
        // join() returns Err if the thread panicked (e.g. a Rust-level
        // panic). A V8 *fatal* abort would kill the whole process and this
        // assert would never be reached — the test binary would die.
        let r = h.join().expect("thread panicked");
        results.push(r);
    }

    for (i, r) in results.iter().enumerate() {
        let (sync_val, async_val) = r
            .as_ref()
            .unwrap_or_else(|e| panic!("thread {i} errored: {e}"));
        assert_eq!(*sync_val, 2, "thread {i}: 1+1 should be 2");
        assert_eq!(*async_val, 42, "thread {i}: promise should resolve to 42");
    }

    eprintln!("OK: {N} threads each created+used+dropped a V8 isolate concurrently");
}
