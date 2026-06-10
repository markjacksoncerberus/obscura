use obscura_browser::lifecycle::WaitUntil;
use serde_json::{json, Value};

use crate::dispatch::CdpContext;
use crate::types::CdpEvent;
use crate::util::url_is_file_scheme;

async fn do_navigate(
    url: &str,
    params: &Value,
    ctx: &mut CdpContext,
    session_id: &Option<String>,
) -> Result<Value, String> {
    let wait_until = params
        .get("waitUntil")
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                Some(WaitUntil::from_str(s))
            } else if let Some(arr) = v.as_array() {
                arr.iter()
                    .filter_map(|item| item.as_str())
                    .map(WaitUntil::from_str)
                    .max_by_key(|w| match w {
                        WaitUntil::DomContentLoaded => 0,
                        WaitUntil::Load => 1,
                        WaitUntil::NetworkIdle2 => 2,
                        WaitUntil::NetworkIdle0 => 3,
                    })
            } else {
                None
            }
        })
        .unwrap_or(WaitUntil::Load);

    // Block CDP-initiated file:// navigation by default.
    // Anyone who can reach the CDP port (default localhost,
    // but Docker images bind 0.0.0.0) could otherwise read
    // any file the obscura process can read. Opt in via
    // `obscura serve --allow-file-access` when local-HTML
    // testing is the intended workflow.
    if url_is_file_scheme(url) && !ctx.default_context.allow_file_access {
        return Err(
            "Page.navigate to file:// is disabled. Restart with `obscura serve --allow-file-access` to enable.".to_string()
        );
    }

    let preload_scripts: Vec<String> = ctx.preload_scripts.iter().map(|(_, s)| s.clone()).collect();

    let (frame_id, loader_id, network_events, page_url, page_id, reached_network_idle) = {
        let page = ctx
            .get_session_page_mut(session_id)
            .ok_or("No page for session")?;
        let frame_id = page.frame_id.clone();
        let loader_id = format!("loader-{}", uuid::Uuid::new_v4());

        let nav_method = params
            .get("__method")
            .and_then(|v| v.as_str())
            .unwrap_or("GET");
        let nav_body = params.get("__body").and_then(|v| v.as_str()).unwrap_or("");
        if nav_method == "POST" && !nav_body.is_empty() {
            page.navigate_with_wait_post(url, wait_until, nav_method, nav_body)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            page.navigate_with_wait(url, wait_until)
                .await
                .map_err(|e| e.to_string())?;
        }

        for source in &preload_scripts {
            if let Err(e) = page.execute_preload_script(source) {
                tracing::debug!("Preload script error: {}", e);
            }
        }

        let reached_network_idle = page.lifecycle.is_network_idle();
        let network_events: Vec<_> = page.network_events.drain(..).collect();
        let page_url = page.url_string();
        let page_id = page.id.clone();
        (
            frame_id,
            loader_id,
            network_events,
            page_url,
            page_id,
            reached_network_idle,
        )
    };

    let es = session_id.clone();
    let ts = timestamp();

    let mut phase1 = vec![
        CdpEvent {
            method: "Page.frameStartedLoading".into(),
            params: json!({"frameId": frame_id}),
            session_id: es.clone(),
        },
        CdpEvent {
            method: "Page.lifecycleEvent".into(),
            params: json!({"frameId": frame_id, "loaderId": loader_id, "name": "init", "timestamp": ts}),
            session_id: es.clone(),
        },
        CdpEvent {
            method: "Runtime.executionContextsCleared".into(),
            params: json!({}),
            session_id: es.clone(),
        },
        CdpEvent {
            method: "Page.frameNavigated".into(),
            params: json!({"frame": {"id": frame_id, "loaderId": loader_id, "url": page_url, "domainAndRegistry": "", "securityOrigin": page_url, "mimeType": "text/html", "adFrameStatus": {"adFrameType": "none"}}, "type": "Navigation"}),
            session_id: es.clone(),
        },
        CdpEvent {
            method: "Runtime.executionContextCreated".into(),
            params: json!({"context": {"id": 2, "origin": page_url, "name": "", "uniqueId": format!("ctx-nav-{}", page_id), "auxData": {"isDefault": true, "type": "default", "frameId": frame_id}}}),
            session_id: es.clone(),
        },
    ];
    let world_names: Vec<String> = if ctx.isolated_worlds.is_empty() {
        vec!["__puppeteer_utility_world__24.40.0".to_string()]
    } else {
        ctx.isolated_worlds.clone()
    };
    // The default realm we just announced. executionContextsCleared above
    // invalidated everything from the prior navigation, so reset the accepted
    // set to exactly the realms this navigation (re)creates — otherwise a
    // Runtime.evaluate against a re-announced isolated world (id 100, 101, ...)
    // is rejected with "Cannot find context with specified id", which wedges
    // every capture after the first one (#51 / one-capture-only bug).
    ctx.valid_context_ids.clear();
    ctx.valid_context_ids.insert(1);
    ctx.valid_context_ids.insert(2);
    for (idx, world_name) in world_names.iter().enumerate() {
        let world_ctx_id = 100 + idx as u32;
        ctx.valid_context_ids.insert(world_ctx_id as i64);
        phase1.push(CdpEvent {
            method: "Runtime.executionContextCreated".into(),
            params: json!({"context": {"id": world_ctx_id, "origin": page_url, "name": world_name, "uniqueId": format!("ctx-isolated-nav-{}-{}", page_id, idx), "auxData": {"isDefault": false, "type": "isolated", "frameId": frame_id}}}),
            session_id: es.clone(),
        });
    }
    phase1.push(CdpEvent { method: "Page.lifecycleEvent".into(), params: json!({"frameId": frame_id, "loaderId": loader_id, "name": "commit", "timestamp": ts}), session_id: es.clone() });
    ctx.pending_events.extend(phase1);

    if ctx.fetch_intercept.enabled {
        for net_event in &network_events {
            ctx.pending_events.push(CdpEvent {
                method: "Fetch.requestPaused".into(),
                params: json!({
                    "requestId": net_event.request_id,
                    "request": {
                        "url": net_event.url,
                        "method": net_event.method,
                        "headers": net_event.headers,
                    },
                    "frameId": frame_id,
                    "resourceType": net_event.resource_type,
                    "networkId": net_event.request_id,
                }),
                session_id: es.clone(),
            });
        }
    }

    for net_event in &network_events {
        ctx.pending_events.push(CdpEvent {
            method: "Network.requestWillBeSent".into(),
            params: json!({"requestId": net_event.request_id, "loaderId": loader_id, "documentURL": page_url, "request": {"url": net_event.url, "method": net_event.method, "headers": net_event.headers}, "timestamp": net_event.timestamp, "wallTime": net_event.timestamp, "initiator": {"type": "other"}, "type": net_event.resource_type, "frameId": frame_id}),
            session_id: es.clone(),
        });
        ctx.pending_events.push(CdpEvent {
            method: "Network.responseReceived".into(),
            params: json!({"requestId": net_event.request_id, "loaderId": loader_id, "timestamp": net_event.timestamp, "type": net_event.resource_type, "response": {"url": net_event.url, "status": net_event.status, "statusText": "", "headers": &*net_event.response_headers, "mimeType": net_event.response_headers.get("content-type").cloned().unwrap_or_default()}, "frameId": frame_id}),
            session_id: es.clone(),
        });
        ctx.pending_events.push(CdpEvent {
            method: "Network.loadingFinished".into(),
            params: json!({"requestId": net_event.request_id, "timestamp": net_event.timestamp, "encodedDataLength": net_event.body_size}),
            session_id: es.clone(),
        });
    }

    let mut phase3 = vec![
        CdpEvent {
            method: "Page.lifecycleEvent".into(),
            params: json!({"frameId": frame_id, "loaderId": loader_id, "name": "DOMContentLoaded", "timestamp": ts}),
            session_id: es.clone(),
        },
        CdpEvent {
            method: "Page.domContentEventFired".into(),
            params: json!({"timestamp": ts}),
            session_id: es.clone(),
        },
        CdpEvent {
            method: "Page.lifecycleEvent".into(),
            params: json!({"frameId": frame_id, "loaderId": loader_id, "name": "load", "timestamp": ts}),
            session_id: es.clone(),
        },
        CdpEvent {
            method: "Page.loadEventFired".into(),
            params: json!({"timestamp": ts}),
            session_id: es.clone(),
        },
    ];
    if reached_network_idle || matches!(wait_until, WaitUntil::Load | WaitUntil::DomContentLoaded) {
        let idle_ts = timestamp();
        phase3.push(CdpEvent { method: "Page.lifecycleEvent".into(), params: json!({"frameId": frame_id, "loaderId": loader_id, "name": "networkIdle", "timestamp": idle_ts}), session_id: es.clone() });
    }
    phase3.push(CdpEvent {
        method: "Page.frameStoppedLoading".into(),
        params: json!({"frameId": frame_id}),
        session_id: es,
    });
    ctx.pending_events.extend(phase3);

    Ok(json!({
        "frameId": frame_id,
        "loaderId": loader_id,
    }))
}

pub async fn handle(
    method: &str,
    params: &Value,
    ctx: &mut CdpContext,
    session_id: &Option<String>,
) -> Result<Value, String> {
    match method {
        "enable" => Ok(json!({})),
        "navigate" => {
            let url = params
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or("url required")?;
            do_navigate(url, params, ctx, session_id).await
        }
        "reload" => {
            let current_url = ctx
                .get_session_page(session_id)
                .map(|p| p.url_string())
                .unwrap_or_else(|| "about:blank".to_string());
            let reload_params = json!({
                "waitUntil": params.get("waitUntil").cloned().unwrap_or(json!("load"))
            });
            do_navigate(&current_url, &reload_params, ctx, session_id).await
        }
        "getFrameTree" => {
            let page = ctx
                .get_session_page(session_id)
                .ok_or("No page for session")?;
            Ok(json!({
                "frameTree": {
                    "frame": {
                        "id": page.frame_id,
                        "loaderId": "initial-loader",
                        "url": page.url_string(),
                        "domainAndRegistry": "",
                        "securityOrigin": page.url_string(),
                        "mimeType": "text/html",
                        "adFrameStatus": { "adFrameType": "none" },
                    },
                    "childFrames": [],
                }
            }))
        }
        "createIsolatedWorld" => {
            let page = ctx
                .get_session_page(session_id)
                .ok_or("No page for session")?;
            let frame_id_param = params
                .get("frameId")
                .and_then(|v| v.as_str())
                .unwrap_or(&page.frame_id)
                .to_string();
            let world_name = params
                .get("worldName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let page_url = page.url_string();
            let page_id = page.id.clone();
            let context_id: i64 = 100;
            // Track this world so Page.navigate can re-emit a context for it
            // post-navigation. Without this, Playwright (and Puppeteer)
            // hang in any operation that uses the utility world — including
            // page.title() — because their utility world is gone after
            // Runtime.executionContextsCleared and never re-created.
            if !world_name.is_empty() && !ctx.isolated_worlds.contains(&world_name) {
                ctx.isolated_worlds.push(world_name.clone());
            }
            // Register the isolated world's id so Runtime.evaluate /
            // Runtime.callFunctionOn accept it as a valid contextId (#51).
            ctx.valid_context_ids.insert(context_id);

            ctx.pending_events.push(CdpEvent {
                method: "Runtime.executionContextCreated".to_string(),
                params: json!({
                    "context": {
                        "id": context_id,
                        "origin": page_url,
                        "name": world_name,
                        "uniqueId": format!("ctx-isolated-{}", page_id),
                        "auxData": {
                            "isDefault": false,
                            "type": "isolated",
                            "frameId": frame_id_param,
                        }
                    }
                }),
                session_id: session_id.clone(),
            });

            Ok(json!({ "executionContextId": context_id }))
        }
        "setLifecycleEventsEnabled" => Ok(json!({})),
        "addScriptToEvaluateOnNewDocument" => {
            let source = params.get("source").and_then(|v| v.as_str()).unwrap_or("");
            ctx.preload_counter += 1;
            let identifier = format!("{}", ctx.preload_counter);
            if !source.is_empty() {
                ctx.preload_scripts
                    .push((identifier.clone(), source.to_string()));
            }
            Ok(json!({ "identifier": identifier }))
        }
        "removeScriptToEvaluateOnNewDocument" => {
            let identifier = params
                .get("identifier")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            ctx.preload_scripts.retain(|(id, _)| id != identifier);
            Ok(json!({}))
        }
        "setInterceptFileChooserDialog" => Ok(json!({})),
        "getLayoutMetrics" => {
            // Report the page's actual viewport. When rendering is active we
            // also return the real content size from layout; otherwise we fall
            // back to document.documentElement.scrollHeight for the height.
            // Playwright calls this before every page.screenshot(). With no page
            // yet, fall back to Chrome's default viewport.
            let (width, height, content_width, content_height) = match ctx
                .get_session_page_mut(session_id)
            {
                Some(page) => {
                    let w = page.viewport.width as f64;
                    let h = page.viewport.height as f64;
                    let (cw, ch) = match page.render_content_size() {
                        Some((rw, rh)) => (rw.max(w), rh.max(h)),
                        None => {
                            let sh = page
                                    .evaluate("document.documentElement && document.documentElement.scrollHeight")
                                    .as_f64()
                                    .filter(|n| *n > 0.0)
                                    .unwrap_or(h);
                            (w, sh)
                        }
                    };
                    (w, h, cw, ch)
                }
                None => {
                    let vp = obscura_browser::ViewportConfig::default();
                    let w = vp.width as f64;
                    let h = vp.height as f64;
                    (w, h, w, h)
                }
            };
            let layout_viewport = json!({
                "pageX": 0, "pageY": 0,
                "clientWidth": width, "clientHeight": height,
            });
            let visual_viewport = json!({
                "offsetX": 0.0, "offsetY": 0.0,
                "pageX": 0.0, "pageY": 0.0,
                "clientWidth": width, "clientHeight": height,
                "scale": 1.0, "zoom": 1.0,
            });
            let content_size = json!({
                "x": 0.0, "y": 0.0,
                "width": content_width, "height": content_height,
            });
            Ok(json!({
                "layoutViewport": layout_viewport,
                "visualViewport": visual_viewport,
                "contentSize": content_size,
                "cssLayoutViewport": layout_viewport,
                "cssVisualViewport": visual_viewport,
                "cssContentSize": content_size,
            }))
        }
        "getNavigationHistory" => {
            let page = ctx
                .get_session_page(session_id)
                .ok_or("No page for session")?;
            Ok(json!({
                "currentIndex": 0,
                "entries": [{
                    "id": 0,
                    "url": page.url_string(),
                    "userTypedURL": page.url_string(),
                    "title": page.title,
                    "transitionType": "typed",
                }]
            }))
        }
        "printToPDF" => {
            // Obscura has no layout/rendering engine, so PDF generation is
            // intentionally not implemented. Returning a distinct, descriptive
            // error (rather than the generic "Unknown Page method" fallback)
            // tells Playwright/Puppeteer/headless_chrome clients exactly why
            // the call failed and what to do instead.
            Err(
                "Page.printToPDF is not supported by Obscura: no layout engine. \
                 Use Runtime.evaluate (e.g. page.evaluate) to extract the rendered \
                 HTML, then render to PDF in your client (wkhtmltopdf, weasyprint, \
                 a separate headless Chromium pipeline, etc.)."
                    .to_string(),
            )
        }
        "captureScreenshot" => {
            let format = params.get("format").and_then(|v| v.as_str());
            let quality = params
                .get("quality")
                .and_then(|v| v.as_u64())
                .and_then(|n| u8::try_from(n).ok());
            let full_page = params
                .get("captureBeyondViewport")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            // `clip` is { x, y, width, height, scale } in CSS pixels.
            let clip = params.get("clip").and_then(|c| {
                let x = c.get("x")?.as_f64()?;
                let y = c.get("y")?.as_f64()?;
                let width = c.get("width")?.as_f64()?;
                let height = c.get("height")?.as_f64()?;
                Some((x, y, width, height))
            });
            let page = ctx
                .get_session_page_mut(session_id)
                .ok_or("No page for session")?;
            let data = page
                .capture_screenshot_base64(format, quality, clip, full_page)
                .map_err(|e| e.to_string())?;
            Ok(json!({ "data": data }))
        }
        "captureSnapshot" => {
            let format = params
                .get("format")
                .and_then(|v| v.as_str())
                .unwrap_or("mhtml");
            if !format.eq_ignore_ascii_case("mhtml") {
                return Err(format!(
                    "Page.captureSnapshot currently supports only format='mhtml' (got '{format}')"
                ));
            }
            let page = ctx
                .get_session_page_mut(session_id)
                .ok_or("No page for session")?;
            Ok(json!({ "data": page.capture_snapshot_mhtml() }))
        }
        "startScreencast" | "stopScreencast" | "screencastFrameAck" => Ok(json!({})),
        _ => Err(format!("Unknown Page method: {}", method)),
    }
}

fn timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dispatch::CdpContext;

    #[tokio::test]
    async fn get_layout_metrics_returns_chrome_default_viewport() {
        let mut ctx = CdpContext::new();
        let result = handle("getLayoutMetrics", &json!({}), &mut ctx, &None)
            .await
            .expect("getLayoutMetrics should succeed without a session");

        // CDP spec requires three top-level shapes; Playwright's screenshot
        // path reads contentSize.width/height to size the capture. Without
        // them the screenshot call panics with "cannot read property of
        // undefined".
        for key in [
            "layoutViewport",
            "visualViewport",
            "contentSize",
            "cssLayoutViewport",
            "cssVisualViewport",
            "cssContentSize",
        ] {
            assert!(result.get(key).is_some(), "missing key: {key}");
        }

        let layout = &result["layoutViewport"];
        assert_eq!(layout["clientWidth"].as_f64(), Some(1280.0));
        assert_eq!(layout["clientHeight"].as_f64(), Some(720.0));

        let visual = &result["visualViewport"];
        assert_eq!(visual["scale"].as_f64(), Some(1.0));
        assert_eq!(visual["clientWidth"].as_f64(), Some(1280.0));

        let content = &result["contentSize"];
        assert_eq!(content["width"].as_f64(), Some(1280.0));
        // Without a live page the content height falls back to the viewport.
        assert_eq!(content["height"].as_f64(), Some(720.0));
    }

    #[tokio::test]
    async fn unknown_page_method_still_errors() {
        let mut ctx = CdpContext::new();
        let err = handle("notARealMethod", &json!({}), &mut ctx, &None)
            .await
            .expect_err("unknown methods must surface as errors");
        assert!(err.contains("Unknown Page method"));
    }

    #[tokio::test]
    async fn print_to_pdf_returns_descriptive_unsupported_error() {
        // Regression for #53: Page.printToPDF must be handled explicitly so
        // Playwright clients receive a descriptive error rather than the
        // generic "Unknown Page method" fallback.
        let mut ctx = CdpContext::new();
        let err = handle("printToPDF", &json!({}), &mut ctx, &None)
            .await
            .expect_err("printToPDF must error until a real renderer exists");
        assert!(
            !err.contains("Unknown Page method"),
            "printToPDF must NOT fall through to the catch-all: {err}"
        );
        assert!(
            err.contains("not supported by Obscura"),
            "error must clearly state PDF is unsupported: {err}"
        );
        // Direct user to a workaround so the message is actionable.
        assert!(
            err.to_lowercase().contains("evaluate") || err.to_lowercase().contains("html"),
            "error must point to a workaround: {err}"
        );
    }

    #[tokio::test]
    async fn capture_screenshot_unavailable_under_default_render_mode() {
        // The default context uses render-mode=never, so screenshots are
        // unavailable until the operator opts in (and builds --features render).
        // This replaces the old behavior of returning a 1x1 placeholder PNG.
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = "session-1".to_string();
        ctx.sessions.insert(session_id.clone(), page_id);
        let err = handle("captureScreenshot", &json!({}), &mut ctx, &Some(session_id))
            .await
            .expect_err("screenshots require rendering to be enabled");
        assert!(
            err.to_lowercase().contains("render"),
            "error should explain rendering is required: {err}"
        );
    }

    #[cfg(feature = "render")]
    #[tokio::test]
    async fn capture_screenshot_renders_real_png_when_enabled() {
        use obscura_browser::{RenderMode, RenderSettings, ViewportConfig};

        let render = RenderSettings {
            mode: RenderMode::OnDemand,
            viewport: ViewportConfig {
                width: 120,
                height: 80,
                device_scale_factor: 1.0,
                dark: false,
                print: false,
            },
        };
        let mut ctx =
            CdpContext::new_with_security_and_render(None, false, None, false, None, render);
        let page_id = ctx.create_page();
        let session_id = "session-1".to_string();
        ctx.sessions.insert(session_id.clone(), page_id);

        let result = handle("captureScreenshot", &json!({}), &mut ctx, &Some(session_id))
            .await
            .expect("captureScreenshot should render");
        let data = result
            .get("data")
            .and_then(|v| v.as_str())
            .expect("response should include base64 screenshot data");
        // A real PNG of a 120x80 page — far larger than the old 1x1 stub.
        assert!(data.starts_with("iVBOR"), "should be PNG base64: {data}");
        assert!(
            data.len() > 500,
            "real screenshot should be sizeable, got {} chars",
            data.len()
        );
    }

    #[tokio::test]
    async fn capture_snapshot_returns_mhtml_data() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = "session-1".to_string();
        ctx.sessions.insert(session_id.clone(), page_id);
        let result = handle("captureSnapshot", &json!({}), &mut ctx, &Some(session_id))
            .await
            .expect("captureSnapshot should succeed");
        let data = result
            .get("data")
            .and_then(|v| v.as_str())
            .expect("response should include mhtml payload");
        assert!(
            data.contains("Content-Type: multipart/related"),
            "snapshot should be MHTML multipart payload"
        );
    }

    #[tokio::test]
    async fn screencast_control_methods_return_empty_response() {
        let mut ctx = CdpContext::new();
        for method in ["startScreencast", "stopScreencast", "screencastFrameAck"] {
            let result = handle(method, &json!({}), &mut ctx, &None)
                .await
                .expect("screenshot control method should succeed");
            assert_eq!(result, json!({}), "{method} should return empty object");
        }
    }
}
