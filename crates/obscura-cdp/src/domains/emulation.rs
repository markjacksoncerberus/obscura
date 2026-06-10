//! CDP `Emulation` domain.
//!
//! Most methods are accepted as no-ops (clients call many of them on connect),
//! but the ones that change how a page is laid out and painted —
//! `setDeviceMetricsOverride` and `setEmulatedMedia` — update the page's
//! viewport so subsequent renders (screenshots, layout metrics, geometry)
//! reflect them. Because the render cache is keyed by viewport, changing it here
//! transparently invalidates any cached layout.

use serde_json::{json, Value};

use crate::dispatch::CdpContext;

pub async fn handle(
    method: &str,
    params: &Value,
    ctx: &mut CdpContext,
    session_id: &Option<String>,
) -> Result<Value, String> {
    match method {
        "setDeviceMetricsOverride" => {
            if let Some(page) = ctx.get_session_page_mut(session_id) {
                if let Some(w) = params.get("width").and_then(|v| v.as_u64()) {
                    if w > 0 {
                        page.viewport.width = w as u32;
                    }
                }
                if let Some(h) = params.get("height").and_then(|v| v.as_u64()) {
                    if h > 0 {
                        page.viewport.height = h as u32;
                    }
                }
                if let Some(dsf) = params.get("deviceScaleFactor").and_then(|v| v.as_f64()) {
                    if dsf > 0.0 {
                        page.viewport.device_scale_factor = dsf;
                    }
                }
            }
            Ok(json!({}))
        }
        "clearDeviceMetricsOverride" => {
            if let Some(page) = ctx.get_session_page_mut(session_id) {
                page.viewport = page.context.default_viewport;
            }
            Ok(json!({}))
        }
        "setEmulatedMedia" => {
            if let Some(page) = ctx.get_session_page_mut(session_id) {
                if let Some(media) = params.get("media").and_then(|v| v.as_str()) {
                    page.viewport.print = media.eq_ignore_ascii_case("print");
                }
                if let Some(features) = params.get("features").and_then(|v| v.as_array()) {
                    for f in features {
                        let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let value = f.get("value").and_then(|v| v.as_str()).unwrap_or("");
                        if name.eq_ignore_ascii_case("prefers-color-scheme") {
                            page.viewport.dark = value.eq_ignore_ascii_case("dark");
                        }
                    }
                }
            }
            Ok(json!({}))
        }
        // Everything else (setUserAgentOverride, setTouchEmulationEnabled,
        // setScriptExecutionDisabled, …) is accepted but has no effect here.
        _ => Ok(json!({})),
    }
}
