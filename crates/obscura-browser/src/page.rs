use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use obscura_dom::{parse_html, DomTree};
use obscura_js::runtime::ObscuraJsRuntime;
use obscura_net::{ObscuraHttpClient, ObscuraNetError, Response};
use url::Url;

use crate::context::BrowserContext;
use crate::lifecycle::LifecycleState;
use crate::render_mode::ViewportConfig;

pub(crate) fn decode_data_uri(uri: &str) -> Option<Vec<u8>> {
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
            let hi = hex_val(b[i + 1]);
            let lo = hex_val(b[i + 2]);
            if let (Some(h), Some(l)) = (hi, lo) {
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

#[cfg(feature = "stealth")]
use obscura_net::StealthHttpClient;

/// Returns true when a JS-initiated navigation would step from a
/// non-file scheme into a file: URL. We treat that move as an SOP
/// violation because the existing realm survives the navigation and
/// can read the new document's body.
fn cross_scheme_to_file(from: &str, to: &str) -> bool {
    let to_is_file = Url::parse(to)
        .map(|u| u.scheme().eq_ignore_ascii_case("file"))
        .unwrap_or(false);
    if !to_is_file {
        return false;
    }
    Url::parse(from)
        .map(|u| !u.scheme().eq_ignore_ascii_case("file"))
        .unwrap_or(true)
}

/// Sub-resource fetch policy. A page may only pull a `<script src>` /
/// `<link rel=stylesheet href>` / etc. when the URL scheme is safe for
/// the page's origin. http(s) pages cannot reach into file: or data:
/// to fabricate scripts, and pages with no origin only get http/https.
fn subresource_allowed(page_url: Option<&Url>, resource: &str) -> bool {
    let Ok(target) = Url::parse(resource) else {
        return false;
    };
    let scheme = target.scheme().to_ascii_lowercase();
    match scheme.as_str() {
        "http" | "https" => true,
        "file" => page_url
            .map(|u| u.scheme().eq_ignore_ascii_case("file"))
            .unwrap_or(false),
        _ => false,
    }
}

/// Escape a value for safe inclusion inside a JavaScript template
/// literal. The previous implementation only escaped `\`, `` ` `` and
/// `${`; that left U+2028 / U+2029 (the JS-specific line terminators)
/// and other control characters as breakout vectors. Done at the
/// callsite means future tweaks come back to one function.
fn escape_for_js_template_literal(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '`' => out.push_str("\\`"),
            '$' => out.push_str("\\$"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            '\u{0000}' => out.push_str("\\0"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

#[derive(Debug, Clone)]
pub struct NetworkEvent {
    pub request_id: String,
    pub url: String,
    pub method: String,
    pub resource_type: String,
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub response_headers: Arc<std::collections::HashMap<String, String>>,
    pub body_size: usize,
    pub timestamp: f64,
}

pub struct Page {
    pub id: String,
    pub frame_id: String,
    pub url: Option<Url>,
    pub dom: Option<DomTree>,
    pub js: Option<ObscuraJsRuntime>,
    pub lifecycle: LifecycleState,
    pub http_client: Arc<ObscuraHttpClient>,
    pub context: Arc<BrowserContext>,
    pub title: String,
    pub network_events: Vec<NetworkEvent>,
    network_event_counter: u32,
    pub intercept_enabled: bool,
    pub intercept_block_patterns: Vec<String>,
    /// CDP `Page.addScriptToEvaluateOnNewDocument` sources, run on every navigation
    /// right after the JS context is created and BEFORE the document's own scripts —
    /// the correct "on new document" ordering (Playwright's addInitScript relies on
    /// it, e.g. to install a test_driver backend before testharness runs).
    pending_preloads: Vec<String>,
    intercept_tx: Option<tokio::sync::mpsc::UnboundedSender<obscura_js::ops::InterceptedRequest>>,
    /// The viewport this page lays out and paints against. Starts from the
    /// context's default; `Emulation.setDeviceMetricsOverride` mutates it.
    pub viewport: ViewportConfig,
    /// (encoded, decoded) byte size of the last main-document response body —
    /// feeds the PerformanceNavigationTiming entry's encoded/decoded/transfer
    /// body sizes. `None` until the first document loads.
    document_body_size: Option<(usize, usize)>,
    /// The encoding the last main-document response was decoded with, as its
    /// Encoding-Standard name ("UTF-8", "EUC-KR", "Shift_JIS"). Reported by
    /// `document.characterSet` and used to serialise forms and link queries —
    /// a page decoded as EUC-KR must also ANSWER in EUC-KR.
    document_charset: String,
    /// Cached resolved layout/paint, keyed by a hash of the last snapshot.
    /// `None` until the first render in `on-demand`/`always` mode.
    #[cfg(feature = "render")]
    render_cache: Option<crate::render::RenderCache>,
    #[cfg(feature = "stealth")]
    pub stealth_client: Option<Arc<StealthHttpClient>>,
}

impl Page {
    pub fn new(id: String, context: Arc<BrowserContext>) -> Self {
        // Per-page HTTP client: its own in-flight request counter so
        // network-idle detection isn't cross-contaminated by other pages'
        // requests. Pages run concurrently on their own OS threads (issue #19),
        // so a shared client's `active_requests()` would see *every* page's
        // traffic and a page could wait on unrelated requests. Shares the
        // context's cookie jar + proxy, and copies its resolved user-agent.
        let http_client = {
            let mut client = ObscuraHttpClient::with_options(
                context.cookie_jar.clone(),
                context.proxy_url.as_deref(),
            );
            if let Ok(mut ua) = client.user_agent.try_write() {
                *ua = context.user_agent.clone();
            }
            Arc::new(client)
        };
        let viewport = context.default_viewport;
        // Chromium convention: the main frame's frameId == the targetId.
        // Playwright's frame manager looks up the main frame by targetId
        // (via target._targetInfo.targetId), so any divergence here makes
        // Page.getFrameTree return a frame the client cannot match,
        // triggering a Target.closeTarget and "Frame has been detached".
        let frame_id = id.clone();
        #[cfg(feature = "stealth")]
        let stealth_client = if context.stealth {
            // The wreq client backing StealthHttpClient does not speak SOCKS5.
            // Callers must validate the proxy scheme up front and fail loudly
            // (see obscura-cli) rather than silently rewriting socks5:// to
            // http://, which only works when the upstream happens to be a
            // Clash-style mixed-mode proxy and breaks plain SOCKS5 servers
            // like `ssh -ND` (#160).
            Some(Arc::new(StealthHttpClient::with_proxy(
                context.cookie_jar.clone(),
                context.proxy_url.as_deref(),
            )))
        } else {
            None
        };

        Page {
            id,
            frame_id,
            url: None,
            dom: None,
            js: None,
            lifecycle: LifecycleState::Idle,
            http_client,
            context,
            title: String::new(),
            network_events: Vec::new(),
            network_event_counter: 0,
            intercept_enabled: false,
            intercept_block_patterns: Vec::new(),
            pending_preloads: Vec::new(),
            intercept_tx: None,
            viewport,
            document_body_size: None,
            document_charset: "UTF-8".to_string(),
            #[cfg(feature = "render")]
            render_cache: None,
            #[cfg(feature = "stealth")]
            stealth_client,
        }
    }

    fn should_block_url(&self, url: &str) -> bool {
        if !self.intercept_enabled || self.intercept_block_patterns.is_empty() {
            return false;
        }
        for pattern in &self.intercept_block_patterns {
            if pattern == "*" {
                return true;
            }
            if pattern.starts_with('*') && pattern.ends_with('*') {
                if url.contains(&pattern[1..pattern.len() - 1]) {
                    return true;
                }
            } else if pattern.starts_with('*') {
                if url.ends_with(&pattern[1..]) {
                    return true;
                }
            } else if pattern.ends_with('*') {
                if url.starts_with(&pattern[..pattern.len() - 1]) {
                    return true;
                }
            } else if url.contains(pattern) {
                return true;
            }
        }
        false
    }

    async fn do_fetch(&self, url: &Url) -> Result<Response, ObscuraNetError> {
        #[cfg(feature = "stealth")]
        if let Some(ref stealth) = self.stealth_client {
            return stealth.fetch(url).await;
        }
        self.http_client.fetch(url).await
    }
    fn init_js(&mut self) {
        // Drop any existing runtime so the JS realm starts clean on
        // every navigation. The old code reused the V8 isolate and
        // only re-bound `globalThis.document`, leaving window.onload,
        // custom window properties and event handlers from the prior
        // page in place. That made it possible for a page to set
        // attacker-controlled state, trigger a navigation, and then
        // run code in the next document's context.
        if self.js.is_some() {
            let _ = self.js.take();
        }

        // Thread the BrowserContext's proxy through to the ES-module loader
        // and op_fetch_url so dynamic imports and JS fetch() honour the
        // configured upstream proxy (#139). When proxy_url is None this is
        // equivalent to with_base_url() (direct connection).
        let mut rt = ObscuraJsRuntime::with_base_url_and_proxy(
            &self.url_string(),
            self.context.proxy_url.clone(),
        );
        rt.set_url(&self.url_string());
        rt.set_title(&self.title);
        rt.set_charset(&self.document_charset);

        #[cfg(feature = "stealth")]
        if self.stealth_client.is_some() {
            rt.set_user_agent(obscura_net::STEALTH_USER_AGENT);
        } else if let Ok(ua) = self.http_client.user_agent.try_read() {
            rt.set_user_agent(&ua);
        }
        #[cfg(not(feature = "stealth"))]
        if let Ok(ua) = self.http_client.user_agent.try_read() {
            rt.set_user_agent(&ua);
        }

        rt.set_cookie_jar(self.context.cookie_jar.clone());
        rt.set_http_client(self.http_client.clone());

        if let Some(tx) = &self.intercept_tx {
            rt.set_intercept_tx(tx.clone());
        }

        if let Some(dom) = self.dom.take() {
            rt.set_dom(dom);
        }

        self.js = Some(rt);
    }

    /// HTML "report the error": an uncaught error from a classic script's evaluation
    /// (parse or runtime) fires an `error` event on the Window (i.e. invokes
    /// `window.onerror` and any `error` listeners). We swallowed these before — the
    /// engine only logged them — so a page's own error handling never ran. Reconstruct
    /// a carrier Error from the runtime's error string (its `.message` becomes the
    /// ErrorEvent's message; `_reportError` supplies filename = document URL, line/col
    /// 0). The whole report is defensively wrapped so a reporting failure can't cascade.
    fn report_script_error(js: &mut ObscuraJsRuntime, err: &str) {
        let msg = serde_json::to_string(err).unwrap_or_else(|_| "\"Script error.\"".to_string());
        let code = format!(
            "try {{ if (typeof _reportError === 'function') _reportError(new Error({})); }} catch (e) {{}}",
            msg
        );
        let _ = js.execute_script("<report-error>", &code);
    }

    async fn execute_scripts(&mut self) {
        tracing::info!(
            "execute_scripts called, js runtime exists: {}",
            self.js.is_some()
        );

        #[derive(Debug)]
        struct ScriptInfo {
            src: Option<String>,
            inline: String,
            is_defer: bool,
            is_async: bool,
            is_module: bool,
            nid: u32,
        }

        let all_scripts = match &self.js {
            Some(js) => js
                .with_dom(|dom| {
                    let script_ids = dom.query_selector_all("script").unwrap_or_default();
                    let mut scripts = Vec::new();

                    for sid in script_ids {
                        if let Some(node) = dom.get_node(sid) {
                            let src = node.get_attribute("src").map(|s| s.to_string());
                            let script_type = node.get_attribute("type").unwrap_or("").to_string();
                            let is_defer = node.get_attribute("defer").is_some();
                            let is_async = node.get_attribute("async").is_some();
                            let is_module = script_type == "module";

                            if !script_type.is_empty()
                                && script_type != "text/javascript"
                                && script_type != "application/javascript"
                                && script_type != "module"
                            {
                                continue;
                            }

                            let inline_code = if src.is_none() {
                                dom.text_content(sid)
                            } else {
                                String::new()
                            };

                            if src.is_some() || !inline_code.trim().is_empty() {
                                scripts.push(ScriptInfo {
                                    src,
                                    inline: inline_code,
                                    is_defer,
                                    is_async,
                                    is_module,
                                    nid: sid.raw(),
                                });
                            }
                        }
                    }
                    scripts
                })
                .unwrap_or_default(),
            None => return,
        };

        let mut regular = Vec::new();
        let mut deferred = Vec::new();
        let mut async_scripts = Vec::new();

        let mut module_scripts = Vec::new();

        for script in all_scripts {
            if script.is_module {
                module_scripts.push(script);
                continue;
            }
            if script.is_defer {
                deferred.push(script);
            } else if script.is_async {
                async_scripts.push(script);
            } else {
                regular.push(script);
            }
        }

        let scripts = regular;

        tracing::info!(
            "Found {} regular + {} deferred + {} async scripts",
            scripts.len(),
            deferred.len(),
            async_scripts.len()
        );
        let all_to_execute: Vec<ScriptInfo> = scripts
            .into_iter()
            .chain(deferred.into_iter())
            .chain(async_scripts.into_iter())
            .collect();

        let mut resolved: Vec<(usize, String)> = Vec::new();
        let mut fetch_tasks: Vec<(usize, String)> = Vec::new();

        for (i, script) in all_to_execute.iter().enumerate() {
            if let Some(src_url) = &script.src {
                let full_url = if src_url.starts_with("http://") || src_url.starts_with("https://")
                {
                    src_url.clone()
                } else if let Some(base) = &self.url {
                    base.join(src_url)
                        .map(|u| u.to_string())
                        .unwrap_or_else(|_| src_url.clone())
                } else {
                    src_url.clone()
                };

                if !subresource_allowed(self.url.as_ref(), &full_url) {
                    // Block file://, data:, javascript:, and other
                    // off-origin schemes from being injected as a
                    // <script src>. Without this an http page can
                    // include <script src="file:///etc/passwd"> and
                    // see the body parsed as JS source.
                    tracing::warn!(
                        "blocking cross-scheme <script src>: page={} src={}",
                        self.url_string(),
                        full_url,
                    );
                    continue;
                }
                if self.should_block_url(&full_url) {
                    tracing::info!("Blocked script by interception: {}", full_url);
                    continue;
                }
                resolved.push((i, full_url.clone()));
                fetch_tasks.push((i, full_url));
            }
        }

        let client = self.http_client.clone();
        let fetch_futures: Vec<_> = fetch_tasks
            .iter()
            .map(|(idx, url)| {
                let client = client.clone();
                let url = url.clone();
                let idx = *idx;
                async move {
                    let parsed =
                        Url::parse(&url).unwrap_or_else(|_| Url::parse("about:blank").unwrap());
                    let t0 = std::time::Instant::now();
                    match client.fetch(&parsed).await {
                        Ok(resp) => {
                            let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
                            Some((idx, url, resp, elapsed_ms))
                        }
                        Err(e) => {
                            tracing::warn!("Failed to fetch script {}: {}", url, e);
                            None
                        }
                    }
                }
            })
            .collect();

        let fetch_results = futures::future::join_all(fetch_futures).await;

        let mut fetched: std::collections::HashMap<
            usize,
            (String, String, obscura_net::Response, f64),
        > = std::collections::HashMap::new();
        for result in fetch_results {
            if let Some((idx, url, resp, elapsed_ms)) = result {
                // Script bodies: only the HTTP Content-Type charset matters
                // (no in-band meta-charset for JS).
                let code = obscura_net::decode_non_html(&resp.body, resp.content_type());
                fetched.insert(idx, (url, code, resp, elapsed_ms));
            }
        }

        // Spec: readyState is "loading" while parser-discovered scripts execute.
        // Scripts that check readyState === 'loading' will register DOMContentLoaded
        // listeners instead of calling their callback immediately.
        // Seed the navigation entry's body sizes from the real document response
        // (transferSize = encoded body + a ~300-byte header estimate, per the
        // Resource Timing spec). Empty when no document size is known.
        let nav_sizes_js = match self.document_body_size {
            Some((enc, dec)) => format!(
                " try {{ var __n=performance&&performance._navEntry; if(__n){{ __n.encodedBodySize={}; __n.decodedBodySize={}; __n.transferSize={}; __n.responseStatus=200; __n.responseEnd=performance.now(); }} }} catch(e) {{}}",
                enc, dec, enc + 300
            ),
            None => String::new(),
        };
        if let Some(js) = &mut self.js {
            let _ = js.execute_script(
                "<ready-state>",
                // Also expose markup id'd elements as Window-named globals
                // (<el id=foo> -> window.foo) before page scripts run.
                &format!("globalThis.__documentReadyState__ = 'loading'; try {{ _processDeclarativeShadowRoots(document.documentElement); }} catch(e) {{}} __exposeNamedGlobals(); __installBodyWindowHandlers();{}", nav_sizes_js),
            );
        }

        for (i, script) in all_to_execute.iter().enumerate() {
            // Point document.currentScript at this classic <script> for the duration
            // of its synchronous execution (cleared after the loop; modules run null).
            if let Some(js) = &mut self.js {
                let _ = js.execute_script(
                    "<current-script>",
                    &format!("globalThis.__currentScriptNid = {};", script.nid),
                );
            }
            if script.src.is_some() {
                if let Some((url, code, resp, elapsed_ms)) = fetched.remove(&i) {
                    tracing::info!("Executing script ({} bytes): {}", code.len(), url);
                    self.record_network_event(
                        &url,
                        "GET",
                        "Script",
                        resp.status,
                        &resp.headers,
                        resp.body.len(),
                    );
                    if let Some(js) = &mut self.js {
                        // Resource Timing: record this <script src> on the timeline
                        // before executing it, so a later inline script observes it.
                        // startTime = end - (real fetch elapsed) so duration reflects
                        // the actual network time (> 0), not a collapsed instant.
                        let rt = format!(
                            "try {{ if (performance._addResourceEntry) {{ var __e=performance.now(); var __s=__e-{:.6}; if (__s<0) __s=0; performance._addResourceEntry({:?}, \"script\", __s, __e, {{ enc:{}, dec:{}, status:{} }}); }} }} catch(e) {{}}",
                            elapsed_ms, url, resp.body.len(), code.len(), resp.status
                        );
                        let _ = js.execute_script("<resource-timing>", &rt);
                        if let Err(e) = js.execute_script_guarded(&url, &code) {
                            tracing::warn!("Script error ({}): {}", url, e);
                            Self::report_script_error(js, &e);
                        }
                    }
                }
            } else if !script.inline.is_empty() {
                if let Some(js) = &mut self.js {
                    if let Err(e) = js.execute_script_guarded("<inline>", &script.inline) {
                        tracing::warn!("Inline script error: {}", e);
                        Self::report_script_error(js, &e);
                    }
                }
            }
        }

        // Classic scripts done: document.currentScript is null during module
        // evaluation and for the rest of the lifecycle.
        if let Some(js) = &mut self.js {
            let _ = js.execute_script("<current-script>", "globalThis.__currentScriptNid = -1;");
        }

        for module_script in &module_scripts {
            if let Some(ref src) = module_script.src {
                let full_url = if src.starts_with("http://") || src.starts_with("https://") {
                    src.clone()
                } else if let Some(base) = &self.url {
                    base.join(src)
                        .map(|u| u.to_string())
                        .unwrap_or_else(|_| src.clone())
                } else {
                    src.clone()
                };

                tracing::info!("Loading ES module: {}", full_url);
                if let Some(js) = &mut self.js {
                    match js.load_module(&full_url).await {
                        Ok(()) => {
                            tracing::info!("ES module loaded: {}", full_url);
                            self.record_network_event(
                                &full_url,
                                "GET",
                                "Script",
                                200,
                                &std::collections::HashMap::new(),
                                0,
                            );
                        }
                        Err(e) => {
                            tracing::warn!("ES module error ({}): {}", full_url, e);
                        }
                    }
                }
            } else if !module_script.inline.is_empty() {
                let base = self.url_string();
                if let Some(js) = &mut self.js {
                    if let Err(e) = js.load_inline_module(&module_script.inline, &base).await {
                        tracing::warn!("Inline ES module error: {}", e);
                    }
                }
            }
        }

        if let Some(js) = &mut self.js {
            // Spec order: readyState -> interactive, fire DOMContentLoaded on both
            // document and window, then start loading any markup <iframe>s so they
            // can populate BEFORE the parent load event (a connected iframe is a
            // "delay the load event" resource — the load event must wait for it).
            let _ = js.execute_script("<dcl-events>",
                "globalThis.__documentReadyState__ = 'interactive';\n\
                 try { if (typeof document.onreadystatechange === 'function') document.onreadystatechange(); } catch(e) {}\n\
                 try { var __rsc=new Event('readystatechange'); __rsc.isTrusted=true; _dispatchSpec(document, __rsc); } catch(e) {}\n\
                 try { var __dcl=new Event('DOMContentLoaded', {bubbles:false,cancelable:false}); __dcl.isTrusted=true; _dispatchSpec(document, __dcl); } catch(e) {}\n\
                 try { var __dclw=new Event('DOMContentLoaded', {bubbles:false,cancelable:false}); __dclw.isTrusted=true; _dispatchSpec(window, __dclw); } catch(e) {}\n\
                 try { if (typeof __navTimingDCL === 'function') __navTimingDCL(); } catch(e) {}\n\
                 try { if (typeof __startFrameLoads === 'function') __startFrameLoads(); } catch(e) {}\n\
                 try { if (typeof __startResourceLoads === 'function') __startResourceLoads(); } catch(e) {}");
        }

        // Drain in-flight subresource/iframe fetches so frame documents are
        // populated before load fires.
        self.pump_until_idle().await;

        if let Some(js) = &mut self.js {
            // readyState -> complete, fire load (now that delaying resources settled).
            let _ = js.execute_script("<load-event>",
                "globalThis.__documentReadyState__ = 'complete';\n\
                 try { if (typeof document.onreadystatechange === 'function') document.onreadystatechange(); } catch(e) {}\n\
                 try { var __rsc=new Event('readystatechange'); __rsc.isTrusted=true; _dispatchSpec(document, __rsc); } catch(e) {}\n\
                 try { var __ld=new Event('load', {bubbles:false,cancelable:false}); __ld.isTrusted=true; _dispatchSpec(window, __ld); } catch(e) {}\n\
                 try { if (typeof __navTimingLoad === 'function') __navTimingLoad(); } catch(e) {}");
        }

        // Pump again so async work kicked off by load handlers settles.
        self.pump_until_idle().await;
    }

    /// Run the JS event loop until network goes idle (no in-flight requests for two
    /// consecutive checks) or a short deadline elapses. Used to drain post-
    /// DOMContentLoaded and post-load async work (subresource/iframe fetches, etc.).
    async fn pump_until_idle(&mut self) {
        if let Some(js) = &mut self.js {
            let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_millis(500);
            let mut idle_count = 0u32;
            loop {
                let result = tokio::time::timeout(
                    tokio::time::Duration::from_millis(10),
                    js.run_event_loop(),
                )
                .await;

                match result {
                    Ok(Ok(())) => {
                        if self.http_client.active_requests() == 0 {
                            idle_count += 1;
                            if idle_count >= 2 {
                                break;
                            }
                            tokio::task::yield_now().await;
                        } else {
                            idle_count = 0;
                            tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                        }
                    }
                    Ok(Err(_)) => break,
                    Err(_) => {
                        idle_count = 0;
                        if tokio::time::Instant::now() >= deadline {
                            break;
                        }
                    }
                }
            }
        }
    }

    pub async fn navigate(&mut self, url_str: &str) -> Result<(), PageError> {
        self.navigate_with_wait(url_str, crate::lifecycle::WaitUntil::Load)
            .await
    }

    pub async fn navigate_with_wait(
        &mut self,
        url_str: &str,
        wait_until: crate::lifecycle::WaitUntil,
    ) -> Result<(), PageError> {
        self.navigate_with_wait_post(url_str, wait_until, "GET", "")
            .await
    }

    pub async fn navigate_with_wait_post(
        &mut self,
        url_str: &str,
        wait_until: crate::lifecycle::WaitUntil,
        method: &str,
        body: &str,
    ) -> Result<(), PageError> {
        let mut current_url = url_str.to_string();
        let mut current_method = method.to_string();
        let mut current_body = body.to_string();
        const REDIRECT_LIMIT: usize = 10;
        for chain in 0..REDIRECT_LIMIT {
            self.navigate_single(&current_url, wait_until, &current_method, &current_body)
                .await?;
            if let Some((next_url, next_method, next_body)) = self.take_pending_navigation() {
                if cross_scheme_to_file(&current_url, &next_url) {
                    // SOP gate. A web page must not be able to drive
                    // a navigation to file:// and then read the loaded
                    // document. Without this an http(s) page sets
                    // window.onload, calls location.href = "file:..."
                    // and harvests document.body from a local file
                    // once the new document loads.
                    tracing::warn!(
                        "blocking JS-initiated cross-scheme navigation to file: {} -> {}",
                        current_url,
                        next_url,
                    );
                    break;
                }
                tracing::info!(
                    "JS-triggered navigation chain: {} {} -> {}",
                    current_method,
                    current_url,
                    next_url
                );
                current_url = next_url;
                current_method = next_method;
                current_body = next_body;
                if chain + 1 == REDIRECT_LIMIT {
                    // Hit the cap and the page still wants to keep
                    // chaining. Surface that as an error instead of
                    // returning Ok(()) so callers can distinguish a
                    // successful load from a redirect storm.
                    return Err(PageError::TooManyRedirects(REDIRECT_LIMIT));
                }
                continue;
            }
            break;
        }
        // In `always` mode, resolve layout eagerly now so the first screenshot /
        // geometry query has no build latency. A no-op in other modes / builds.
        self.prewarm_render();
        Ok(())
    }

    async fn navigate_single(
        &mut self,
        url_str: &str,
        wait_until: crate::lifecycle::WaitUntil,
        method: &str,
        body: &str,
    ) -> Result<(), PageError> {
        let url = Url::parse(url_str).map_err(|e| PageError::InvalidUrl(e.to_string()))?;

        self.lifecycle = LifecycleState::Loading;
        self.url = Some(url.clone());
        self.network_events.clear();

        if self.context.obey_robots {
            if let Some(domain) = url.host_str() {
                if self.context.robots_cache.is_allowed(domain, "/robots.txt") {
                    let robots_url = format!("{}://{}/robots.txt", url.scheme(), domain);
                    if let Ok(robots_url) = Url::parse(&robots_url) {
                        if let Ok(resp) = self.http_client.fetch(&robots_url).await {
                            if resp.status == 200 {
                                let body = String::from_utf8_lossy(&resp.body);
                                self.context.robots_cache.parse_and_store(
                                    domain,
                                    &body,
                                    &self.context.user_agent,
                                );
                            }
                        }
                    }
                }

                if !self.context.robots_cache.is_allowed(domain, url.path()) {
                    self.lifecycle = LifecycleState::Failed;
                    return Err(PageError::NetworkError(format!(
                        "Blocked by robots.txt: {}",
                        url
                    )));
                }
            }
        }

        if url.scheme() == "about" {
            self.navigate_blank();
            self.init_js();
            return Ok(());
        }

        let response = if url.scheme() == "data" {
            let content_type = url_str
                .strip_prefix("data:")
                .and_then(|s| s.split(',').next())
                .unwrap_or("text/html")
                .split(';')
                .next()
                .unwrap_or("text/html")
                .to_string();
            let body_bytes = decode_data_uri(url_str).unwrap_or_default();
            let mut headers = std::collections::HashMap::new();
            headers.insert("content-type".to_string(), content_type);
            Ok(obscura_net::Response {
                url: url.clone(),
                status: 200,
                headers,
                body: body_bytes,
                redirected_from: Vec::new(),
            })
        } else if method == "POST" {
            self.http_client.post_form(&url, body).await
        } else {
            self.do_fetch(&url).await
        }
        .map_err(|e| {
            self.lifecycle = LifecycleState::Failed;
            PageError::NetworkError(e.to_string())
        })?;

        self.record_network_event(
            url.as_str(),
            "GET",
            "Document",
            response.status,
            &response.headers,
            response.body.len(),
        );

        if !response.redirected_from.is_empty() {
            self.url = Some(response.url.clone());
        }

        // Honor the response charset: HTTP Content-Type → <meta charset> sniff
        // in the first 1KB → UTF-8 fallback. Without this, every non-UTF-8
        // page (GBK, Big5, Shift-JIS, Windows-125x, EUC-KR, ISO-8859-x)
        // came through as replacement characters.
        let (doc_encoding, _src) =
            obscura_net::detect_encoding(&response.body, response.content_type());
        self.document_charset = doc_encoding.name().to_string();
        let body_text = obscura_net::decode_response(&response.body, response.content_type());
        // Encoded = the bytes received over the wire (content-decoded by the HTTP
        // client); decoded = after charset decoding. Feeds PerformanceNavigationTiming.
        self.document_body_size = Some((response.body.len(), body_text.len()));
        let dom = parse_html(&body_text);

        self.title = dom
            .query_selector("title")
            .ok()
            .flatten()
            .map(|title_id| dom.text_content(title_id))
            .unwrap_or_default();

        let stylesheet_urls: Vec<String> = dom
            .query_selector_all("link")
            .unwrap_or_default()
            .iter()
            .filter_map(|&nid| {
                let node = dom.get_node(nid)?;
                let rel = node.get_attribute("rel")?;
                if rel.to_lowercase() != "stylesheet" {
                    return None;
                }
                node.get_attribute("href").map(|s| s.to_string())
            })
            .collect();

        let mut css_fetch_urls: Vec<String> = Vec::new();
        for href in &stylesheet_urls {
            let full_url = if href.starts_with("http://") || href.starts_with("https://") {
                href.clone()
            } else if let Some(base) = &self.url {
                base.join(href)
                    .map(|u| u.to_string())
                    .unwrap_or_else(|_| href.clone())
            } else {
                href.clone()
            };
            if !subresource_allowed(self.url.as_ref(), &full_url) {
                tracing::warn!(
                    "blocking cross-scheme <link rel=stylesheet href>: page={} href={}",
                    self.url_string(),
                    full_url,
                );
                continue;
            }
            if self.should_block_url(&full_url) {
                tracing::info!("Blocked stylesheet by interception: {}", full_url);
                continue;
            }
            css_fetch_urls.push(full_url);
        }

        let client = self.http_client.clone();
        let css_futures: Vec<_> = css_fetch_urls
            .iter()
            .map(|full_url| {
                let client = client.clone();
                let url_str = full_url.clone();
                async move {
                    let parsed =
                        Url::parse(&url_str).unwrap_or_else(|_| Url::parse("about:blank").unwrap());
                    match client.fetch(&parsed).await {
                        Ok(resp) => Some((url_str, resp)),
                        Err(e) => {
                            tracing::debug!("Failed to fetch stylesheet {}: {}", url_str, e);
                            None
                        }
                    }
                }
            })
            .collect();

        let css_results = futures::future::join_all(css_futures).await;
        let mut css_sources = Vec::new();
        for result in css_results {
            if let Some((url_str, resp)) = result {
                // CSS bodies: honor the Content-Type charset; CSS @charset is
                // out of scope for the current scrape-focused pipeline.
                let css = obscura_net::decode_non_html(&resp.body, resp.content_type());
                self.record_network_event(
                    &url_str,
                    "GET",
                    "Stylesheet",
                    resp.status,
                    &resp.headers,
                    resp.body.len(),
                );
                css_sources.push(css);
            }
        }

        self.dom = Some(dom);
        self.lifecycle = LifecycleState::DomContentLoaded;

        if wait_until == crate::lifecycle::WaitUntil::DomContentLoaded {
            self.init_js();
            self.run_pending_preloads();
            return Ok(());
        }

        self.init_js();
        self.run_pending_preloads();

        if !css_sources.is_empty() {
            if let Some(js) = &mut self.js {
                let combined_css = css_sources.join("\n");
                // Use the thorough template-literal escape that
                // covers U+2028 / U+2029 and other control chars.
                // The previous escaper only handled `, \, and ${,
                // letting attacker-controlled CSS containing a raw
                // U+2028 break out of the template literal and run
                // arbitrary JS in the page's V8 realm.
                let escaped = escape_for_js_template_literal(&combined_css);
                let code = format!("globalThis.__obscura_css = `{}`;", escaped);
                let _ = js.execute_script("<css>", &code);
            }
        }
        if let Some(js) = &mut self.js {
            let _ = js.execute_script("<iframe-load>",
                "(function() { var iframes = document.querySelectorAll('iframe[src]'); for (var i = 0; i < iframes.length; i++) { var src = iframes[i].getAttribute('src'); if (src && src !== 'about:blank') iframes[i]._loadIframeSrc(src); } })()");
        }

        self.execute_scripts().await;

        if let Some(js) = &mut self.js {
            if let Ok(new_title) = js.evaluate("document.title") {
                if let Some(t) = new_title.as_str() {
                    self.title = t.to_string();
                }
            }
        }

        self.lifecycle = LifecycleState::Loaded;

        if matches!(
            wait_until,
            crate::lifecycle::WaitUntil::NetworkIdle0 | crate::lifecycle::WaitUntil::NetworkIdle2
        ) {
            let threshold = match wait_until {
                crate::lifecycle::WaitUntil::NetworkIdle0 => 0,
                crate::lifecycle::WaitUntil::NetworkIdle2 => 2,
                _ => 0,
            };

            let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(5);
            let mut idle_since: Option<tokio::time::Instant> = None;

            loop {
                let active = self.http_client.active_requests();
                let now = tokio::time::Instant::now();

                if active <= threshold {
                    if idle_since.is_none() {
                        idle_since = Some(now);
                    }
                    if now.duration_since(idle_since.unwrap())
                        >= tokio::time::Duration::from_millis(500)
                    {
                        break;
                    }
                } else {
                    idle_since = None;
                }

                if now >= deadline {
                    tracing::debug!(
                        "Network idle timeout reached with {} active requests",
                        active
                    );
                    break;
                }

                if let Some(js) = &mut self.js {
                    let _ = tokio::time::timeout(
                        tokio::time::Duration::from_millis(50),
                        js.run_event_loop(),
                    )
                    .await;
                } else {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }

            self.lifecycle = LifecycleState::NetworkIdle;
        }

        Ok(())
    }

    pub fn navigate_blank(&mut self) {
        self.js = None;
        self.url = Some(Url::parse("about:blank").unwrap());
        self.dom = Some(parse_html(
            "<!DOCTYPE html><html><head></head><body></body></html>",
        ));
        self.title = String::new();
        self.lifecycle = LifecycleState::Loaded;
    }

    pub fn url_string(&self) -> String {
        self.url
            .as_ref()
            .map(|u| u.to_string())
            .unwrap_or_else(|| "about:blank".to_string())
    }

    pub fn with_dom<R>(&self, f: impl FnOnce(&DomTree) -> R) -> Option<R> {
        if let Some(js) = &self.js {
            return js.with_dom(f);
        }
        self.dom.as_ref().map(f)
    }

    pub fn dom(&self) -> Option<&DomTree> {
        self.dom.as_ref()
    }

    pub fn evaluate(&mut self, expression: &str) -> serde_json::Value {
        if let Some(js) = &mut self.js {
            match js.evaluate(expression) {
                Ok(val) => val,
                Err(e) => {
                    tracing::debug!(
                        "JS eval error for '{}': {}",
                        &expression[..expression.len().min(80)],
                        e
                    );
                    serde_json::Value::Null
                }
            }
        } else {
            match expression.trim() {
                "document.title" => serde_json::Value::String(self.title.clone()),
                "document.URL" | "document.location.href" | "window.location.href" => {
                    serde_json::Value::String(self.url_string())
                }
                _ => serde_json::Value::Null,
            }
        }
    }

    /// Serialize the page's *current* (post-JavaScript) DOM to HTML, stamping
    /// every element with `data-obscura-nid` so a renderer can map geometry back
    /// to Obscura node ids. Reads through to the live DOM whether it currently
    /// lives on the page or inside the JS runtime.
    pub fn build_render_snapshot(&self) -> Option<String> {
        self.with_dom(|dom| dom.outer_html_with_obscura_ids(dom.document()))
    }

    /// Resolve (and cache) the current DOM into a paintable/queryable document.
    /// Rebuilds only when the snapshot or viewport has changed since the last
    /// render, so repeated screenshots and geometry reads are cheap. Returns an
    /// error in `never` mode.
    #[cfg(feature = "render")]
    pub fn ensure_render(&mut self) -> Result<&mut obscura_render::ResolvedDoc, PageError> {
        if !self.context.render_mode.is_enabled() {
            return Err(PageError::RenderUnavailable(
                "rendering disabled (render-mode=never); start with \
                 --render-mode on-demand|always"
                    .to_string(),
            ));
        }

        let html = self.build_render_snapshot().unwrap_or_default();
        let viewport = self.viewport;
        let key = crate::render::cache_key(&html, &viewport);

        let stale = self.render_cache.as_ref().is_none_or(|c| c.key != key);
        if stale {
            let provider = self.make_net_provider();
            let input = crate::render::build_input(html, self.url_string(), viewport, provider);
            let doc = crate::render::with_engine(|engine| engine.layout(input));
            self.render_cache = Some(crate::render::RenderCache { key, doc });
        }

        Ok(&mut self
            .render_cache
            .as_mut()
            .expect("cache populated above")
            .doc)
    }

    /// Pre-warm the render cache. Called after navigation in `always` mode so
    /// layout is ready before the first screenshot / geometry query.
    #[cfg(feature = "render")]
    pub fn prewarm_render(&mut self) {
        if self.context.render_mode == crate::render_mode::RenderMode::Always {
            if let Err(e) = self.ensure_render() {
                tracing::debug!("prewarm_render skipped: {e}");
            }
        }
    }

    #[cfg(not(feature = "render"))]
    pub fn prewarm_render(&mut self) {}

    /// Absolute layout box (CSS px) for an Obscura node id, via the renderer.
    /// `None` if rendering is off or the node isn't laid out.
    #[cfg(feature = "render")]
    pub fn render_node_rect(&mut self, obscura_nid: u64) -> Option<(f64, f64, f64, f64)> {
        let doc = self.ensure_render().ok()?;
        doc.node_rect(obscura_nid)
            .map(|r| (r.x, r.y, r.width, r.height))
    }

    /// The full content size (CSS px) from real layout, or `None` if rendering
    /// is off. Used by `Page.getLayoutMetrics`.
    #[cfg(feature = "render")]
    pub fn render_content_size(&mut self) -> Option<(f64, f64)> {
        let doc = self.ensure_render().ok()?;
        let s = doc.content_size();
        Some((s.width, s.height))
    }

    #[cfg(not(feature = "render"))]
    pub fn render_content_size(&mut self) -> Option<(f64, f64)> {
        None
    }

    #[cfg(not(feature = "render"))]
    pub fn render_node_rect(&mut self, _obscura_nid: u64) -> Option<(f64, f64, f64, f64)> {
        None
    }

    /// Capture a screenshot of the page's current rendering as base64.
    ///
    /// `clip` is `(x, y, width, height)` in CSS pixels; `full_page` renders the
    /// whole content height (CDP `captureBeyondViewport`). Requires the `render`
    /// feature and a non-`never` render mode.
    pub fn capture_screenshot_base64(
        &mut self,
        format: Option<&str>,
        quality: Option<u8>,
        clip: Option<(f64, f64, f64, f64)>,
        full_page: bool,
    ) -> Result<String, PageError> {
        let format_str = format.unwrap_or("png").to_ascii_lowercase();
        // Validate the format the same way for every build so callers get a
        // consistent error for a bad format string.
        let is_png = format_str == "png";
        let is_jpeg = format_str == "jpeg" || format_str == "jpg";
        if !is_png && !is_jpeg {
            return Err(PageError::ParseError(format!(
                "Unsupported screenshot format: {format_str}. Supported formats: png, jpeg, jpg"
            )));
        }

        #[cfg(feature = "render")]
        {
            let opts = obscura_render::PaintOptions {
                format: if is_png {
                    obscura_render::ImageFormat::Png
                } else {
                    obscura_render::ImageFormat::Jpeg
                },
                quality: quality.unwrap_or(80),
                full_page,
                clip: clip.map(|(x, y, width, height)| obscura_render::Clip {
                    x,
                    y,
                    width,
                    height,
                }),
            };
            let doc = self.ensure_render()?;
            let bytes = doc
                .render_image(&opts)
                .map_err(|e| PageError::RenderUnavailable(e.to_string()))?;
            Ok(BASE64.encode(bytes))
        }
        #[cfg(not(feature = "render"))]
        {
            let _ = (quality, clip, full_page);
            Err(PageError::RenderUnavailable(
                "screenshots require the `render` feature (build with --features render)"
                    .to_string(),
            ))
        }
    }

    /// Build the resource provider Blitz uses to fetch sub-resources (external
    /// CSS, images, web fonts). Routes through Obscura's HTTP client so cookies,
    /// proxy, and request-blocking all apply.
    #[cfg(feature = "render")]
    fn make_net_provider(&self) -> std::sync::Arc<dyn obscura_render::ResourceProvider> {
        let patterns = if self.intercept_enabled {
            self.intercept_block_patterns.clone()
        } else {
            Vec::new()
        };
        // Use a *fresh* client, not `self.http_client`. The page's client lazily
        // initialized its reqwest connection pool on the main `current_thread`
        // runtime during navigation. Reusing it from the render fetch runtime —
        // while the main runtime is blocked inside the synchronous render —
        // makes concurrent sub-resource fetches stall/fail ("error sending
        // request"). A fresh client (empty pool) initializes on the fetch
        // runtime instead. The cookie jar and proxy are still shared.
        let client = std::sync::Arc::new(ObscuraHttpClient::with_options(
            self.context.cookie_jar.clone(),
            self.context.proxy_url.as_deref(),
        ));
        std::sync::Arc::new(crate::render::ObscuraNetProvider::new(client, patterns))
    }

    pub fn capture_snapshot_mhtml(&self) -> String {
        let boundary = "----obscura-boundary";
        let html = self
            .with_dom(|dom| dom.outer_html(dom.document()))
            .unwrap_or_else(|| {
                "<!DOCTYPE html><html><head></head><body></body></html>".to_string()
            });
        let url = self.url_string();
        let title = if self.title.is_empty() {
            "Obscura Snapshot".to_string()
        } else {
            self.title.clone()
        };
        format!(
            "From: <Saved by Obscura>\r\n\
Subject: {title}\r\n\
Date: Thu, 01 Jan 1970 00:00:00 +0000\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/related;\r\n\
\ttype=\"text/html\";\r\n\
\tboundary=\"{boundary}\"\r\n\
\r\n\
--{boundary}\r\n\
Content-Type: text/html\r\n\
Content-Location: {url}\r\n\
\r\n\
{html}\r\n\
--{boundary}--\r\n"
        )
    }

    pub async fn evaluate_for_cdp(
        &mut self,
        expression: &str,
        return_by_value: bool,
        await_promise: bool,
    ) -> obscura_js::runtime::RemoteObjectInfo {
        if let Some(js) = &mut self.js {
            match js
                .evaluate_for_cdp(expression, return_by_value, await_promise)
                .await
            {
                Ok(info) => info,
                Err(e) => {
                    tracing::debug!("evaluate_for_cdp error: {}", e);
                    obscura_js::runtime::RemoteObjectInfo {
                        js_type: "undefined".into(),
                        subtype: None,
                        class_name: String::new(),
                        description: String::new(),
                        object_id: None,
                        value: None,
                    }
                }
            }
        } else {
            let val = self.evaluate(expression);
            obscura_js::runtime::RemoteObjectInfo {
                js_type: match &val {
                    serde_json::Value::String(_) => "string".into(),
                    serde_json::Value::Number(_) => "number".into(),
                    serde_json::Value::Bool(_) => "boolean".into(),
                    _ => "undefined".into(),
                },
                subtype: None,
                class_name: String::new(),
                description: String::new(),
                object_id: None,
                value: Some(val),
            }
        }
    }

    pub async fn call_function_on_for_cdp(
        &mut self,
        function_declaration: &str,
        object_id: Option<&str>,
        args: &[serde_json::Value],
        return_by_value: bool,
        await_promise: bool,
    ) -> obscura_js::runtime::RemoteObjectInfo {
        if let Some(js) = &mut self.js {
            match js
                .call_function_on_for_cdp(
                    function_declaration,
                    object_id,
                    args,
                    return_by_value,
                    await_promise,
                )
                .await
            {
                Ok(info) => info,
                Err(e) => {
                    tracing::debug!("callFunctionOn error: {}", e);
                    obscura_js::runtime::RemoteObjectInfo {
                        js_type: "undefined".into(),
                        subtype: None,
                        class_name: String::new(),
                        description: String::new(),
                        object_id: None,
                        value: None,
                    }
                }
            }
        } else {
            obscura_js::runtime::RemoteObjectInfo {
                js_type: "undefined".into(),
                subtype: None,
                class_name: String::new(),
                description: String::new(),
                object_id: None,
                value: None,
            }
        }
    }

    pub fn set_blocked_urls(&mut self, patterns: Vec<String>) {
        if let Some(js) = &self.js {
            js.set_blocked_urls(patterns);
        }
    }

    pub fn release_object(&mut self, object_id: &str) {
        if let Some(js) = &mut self.js {
            js.release_object(object_id);
        }
    }

    fn record_network_event(
        &mut self,
        url: &str,
        method: &str,
        resource_type: &str,
        status: u16,
        response_headers: &std::collections::HashMap<String, String>,
        body_size: usize,
    ) {
        self.network_event_counter += 1;
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();
        self.network_events.push(NetworkEvent {
            request_id: format!("{}.{}", self.id, self.network_event_counter),
            url: url.to_string(),
            method: method.to_string(),
            resource_type: resource_type.to_string(),
            status,
            headers: std::collections::HashMap::new(),
            response_headers: Arc::new(response_headers.clone()),
            body_size,
            timestamp,
        });
    }

    pub fn execute_preload_script(&mut self, source: &str) -> Result<(), String> {
        if let Some(js) = &mut self.js {
            js.execute_script("<preload>", source)
        } else {
            Err("No JS runtime".to_string())
        }
    }

    /// Set the preload scripts (CDP `addScriptToEvaluateOnNewDocument` sources) to run
    /// on the next navigation, before the document's own scripts.
    pub fn set_pending_preloads(&mut self, preloads: Vec<String>) {
        self.pending_preloads = preloads;
    }

    /// Run the pending preload scripts against the freshly-created JS context. Called
    /// right after `init_js()` and before the document's `<script>`s execute.
    fn run_pending_preloads(&mut self) {
        if self.pending_preloads.is_empty() {
            return;
        }
        let preloads = self.pending_preloads.clone();
        for source in &preloads {
            if let Err(e) = self.execute_preload_script(source) {
                tracing::debug!("Preload script error: {}", e);
            }
        }
    }

    pub fn suspend_js(&mut self) {
        if let Some(js) = &self.js {
            if let Some(dom) = js.take_dom() {
                self.dom = Some(dom);
            }
        }
        self.js = None;
    }

    pub fn resume_js(&mut self) {
        if self.js.is_some() {
            return;
        }
        self.init_js();
    }

    pub fn has_js(&self) -> bool {
        self.js.is_some()
    }

    pub fn release_object_group(&mut self) {
        if let Some(js) = &mut self.js {
            js.release_object_group();
        }
    }

    pub fn take_pending_navigation(&self) -> Option<(String, String, String)> {
        if let Some(js) = &self.js {
            js.take_pending_navigation()
        } else {
            None
        }
    }

    pub async fn process_pending_navigation(&mut self) -> Result<bool, PageError> {
        if let Some((url, method, body)) = self.take_pending_navigation() {
            self.navigate_with_wait_post(&url, crate::lifecycle::WaitUntil::Load, &method, &body)
                .await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn set_intercept_tx(
        &mut self,
        tx: tokio::sync::mpsc::UnboundedSender<obscura_js::ops::InterceptedRequest>,
    ) {
        self.intercept_tx = Some(tx.clone());
        if let Some(js) = &self.js {
            js.set_intercept_tx(tx);
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PageError {
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Too many redirects (limit {0})")]
    TooManyRedirects(usize),

    #[error("Rendering unavailable: {0}")]
    RenderUnavailable(String),
}

impl From<ObscuraNetError> for PageError {
    fn from(e: ObscuraNetError) -> Self {
        PageError::NetworkError(e.to_string())
    }
}

#[cfg(all(test, feature = "render"))]
mod render_tests {
    use std::sync::Arc;

    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    use obscura_dom::parse_html;

    use super::{Page, PageError};
    use crate::context::BrowserContext;
    use crate::render_mode::{RenderMode, ViewportConfig};

    fn page_with_mode(mode: RenderMode) -> Page {
        let mut ctx = BrowserContext::new("test".to_string());
        ctx.render_mode = mode;
        ctx.default_viewport = ViewportConfig {
            width: 200,
            height: 100,
            device_scale_factor: 1.0,
            dark: false,
            print: false,
        };
        Page::new("p".to_string(), Arc::new(ctx))
    }

    #[test]
    fn screenshot_reflects_current_dom_and_changes_on_mutation() {
        let mut page = page_with_mode(RenderMode::OnDemand);
        page.dom = Some(parse_html(
            r#"<!DOCTYPE html><html><body style="margin:0">
                 <div style="width:80px;height:40px;background:#ff0000"></div>
               </body></html>"#,
        ));

        let shot_a = page
            .capture_screenshot_base64(Some("png"), None, None, false)
            .expect("screenshot a");
        let bytes_a = BASE64.decode(&shot_a).expect("valid base64");
        assert!(bytes_a.starts_with(&[0x89, b'P', b'N', b'G']), "not a PNG");
        assert!(bytes_a.len() > 200, "png too small: {}", bytes_a.len());

        // Identical DOM → cache hit → identical output.
        let shot_a2 = page
            .capture_screenshot_base64(Some("png"), None, None, false)
            .unwrap();
        assert_eq!(shot_a, shot_a2, "unchanged DOM should reuse cached render");

        // Mutate the DOM (as JS-loaded content would). The screenshot must
        // reflect the new content, not the cached old one.
        page.dom = Some(parse_html(
            r#"<!DOCTYPE html><html><body style="margin:0">
                 <div style="width:160px;height:80px;background:#0000ff"></div>
               </body></html>"#,
        ));
        let shot_b = page
            .capture_screenshot_base64(Some("png"), None, None, false)
            .unwrap();
        assert_ne!(shot_a, shot_b, "changed DOM must produce a new screenshot");
    }

    #[test]
    fn never_mode_errors() {
        let mut page = page_with_mode(RenderMode::Never);
        page.dom = Some(parse_html("<html><body>hi</body></html>"));
        let err = page
            .capture_screenshot_base64(Some("png"), None, None, false)
            .unwrap_err();
        assert!(matches!(err, PageError::RenderUnavailable(_)));
    }

    #[test]
    fn jpeg_output_and_invalid_format() {
        let mut page = page_with_mode(RenderMode::OnDemand);
        page.dom = Some(parse_html(
            "<html><body style=\"margin:0\"><p>hello</p></body></html>",
        ));
        let jpeg = page
            .capture_screenshot_base64(Some("jpeg"), Some(70), None, false)
            .unwrap();
        let jbytes = BASE64.decode(&jpeg).unwrap();
        assert!(jbytes.starts_with(&[0xFF, 0xD8, 0xFF]), "not a JPEG");

        let bad = page
            .capture_screenshot_base64(Some("gif"), None, None, false)
            .unwrap_err();
        assert!(matches!(bad, PageError::ParseError(_)));
    }

    /// Minimal blocking HTTP/1.1 server that returns `css` as `text/css` for any
    /// request. Returns the bound port. Leaks its thread (fine for a test).
    fn serve_css(css: &'static str) -> u16 {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let body = css.as_bytes();
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/css\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(body);
                let _ = stream.flush();
            }
        });
        port
    }

    #[test]
    fn external_css_is_fetched_and_applied() {
        // The local test server is on loopback, which Obscura's HTTP client
        // blocks as SSRF by default — opt in for the test. (That the fetch goes
        // through that client at all is the point: cookies/proxy/blocking apply.)
        std::env::set_var("OBSCURA_ALLOW_PRIVATE_NETWORK", "1");

        // The box's size + green background live only in the external sheet, so
        // a green viewport proves the stylesheet was fetched through Obscura's
        // network stack and applied by the renderer.
        let port = serve_css("body{margin:0}.box{width:200px;height:100px;background:#00ff00}");
        let mut page = page_with_mode(RenderMode::OnDemand);
        page.dom = Some(parse_html(&format!(
            r#"<!DOCTYPE html><html><head>
                 <link rel="stylesheet" href="http://127.0.0.1:{port}/s.css">
               </head><body><div class="box"></div></body></html>"#
        )));

        let shot = page
            .capture_screenshot_base64(Some("png"), None, None, false)
            .expect("screenshot");
        let bytes = BASE64.decode(&shot).unwrap();
        let img = image::load_from_memory(&bytes).unwrap().to_rgba8();
        let px = img.get_pixel(100, 50);
        assert!(
            px[1] > 200 && px[0] < 80 && px[2] < 80,
            "expected green from external CSS at center, got {px:?}"
        );
    }
}
