//! Content Security Policy enforcement for the RENDER path.
//!
//! The JS side gates everything a script can reach — but Blitz fetches fonts,
//! `<link>` stylesheets, `@import`s and CSS `url()` images itself, through the
//! [`crate::net::ResourceProvider`], where no JS gate can see them. A policy
//! that says `font-src 'none'` and still watches the renderer download the font
//! is a policy in name only; this module is the seam that makes it real.
//!
//! It deliberately mirrors `bootstrap.js`'s `_cspMatchesSource` (the JS side is
//! the reference — same scheme-upgrade allowance, same host/port/path rules) but
//! carries only what a *fetch* decision needs: no nonces, no hashes, no inline
//! logic — those never authorise a URL. Only ENFORCED policies belong here; a
//! report-only policy must not change what loads.

use blitz_traits::net::{ResourceKind, Url};

/// One parsed policy: `(directive-name, source-tokens)` in delivery order,
/// first occurrence of a directive wins (CSP §parse-a-serialized-policy).
type Policy = Vec<(String, Vec<String>)>;

/// The compiled, enforce-only CSP a render pass runs under.
#[derive(Debug, Default)]
pub struct RenderCsp {
    policies: Vec<Policy>,
    self_url: Option<Url>,
}

impl RenderCsp {
    /// `serialized`: the enforced policies' full header texts, delivery order.
    pub fn parse(serialized: &[String], page_url: &str) -> Self {
        let self_url = Url::parse(page_url).ok();
        let mut policies = Vec::new();
        for text in serialized {
            let mut dirs: Policy = Vec::new();
            for part in text.split(';') {
                let mut toks = part.split_ascii_whitespace();
                let Some(name) = toks.next() else { continue };
                let name = name.to_ascii_lowercase();
                if dirs.iter().any(|(n, _)| *n == name) {
                    continue; // duplicate directive: the first one stands
                }
                dirs.push((name, toks.map(str::to_string).collect()));
            }
            if !dirs.is_empty() {
                policies.push(dirs);
            }
        }
        Self { policies, self_url }
    }

    pub fn is_empty(&self) -> bool {
        self.policies.is_empty()
    }

    /// May a resource of `kind` be fetched from `url`? `Unknown` kinds are not
    /// gated — blocking a fetch whose destination we cannot name would break
    /// pages on a guess, which is worse than the miss.
    pub fn allows(&self, kind: ResourceKind, url: &Url) -> bool {
        let chain: &[&str] = match kind {
            ResourceKind::Style => &["style-src-elem", "style-src", "default-src"],
            ResourceKind::Font => &["font-src", "default-src"],
            ResourceKind::Image => &["img-src", "default-src"],
            ResourceKind::Media => &["media-src", "default-src"],
            ResourceKind::Unknown => return true,
        };
        for policy in &self.policies {
            // The governing list is the first directive present along the
            // fallback chain; a policy with none has no opinion (which is not
            // the same as forbidding).
            let governing = chain
                .iter()
                .find_map(|n| policy.iter().find(|(pn, _)| pn == n).map(|(_, l)| l));
            let Some(list) = governing else { continue };
            if !list_allows(list, url, self.self_url.as_ref()) {
                tracing::debug!(%url, ?kind, "render: blocked by Content Security Policy");
                return false;
            }
        }
        true
    }
}

fn list_allows(list: &[String], url: &Url, self_url: Option<&Url>) -> bool {
    for expr in list {
        let e = expr.as_str();
        if e.eq_ignore_ascii_case("'none'") {
            return false;
        }
        if e.starts_with('\'') {
            // 'self' is a URL matcher despite the quotes; every other quoted
            // token (nonces, hashes, unsafe-*) matches no URL.
            if e.eq_ignore_ascii_case("'self'") && self_matches(url, self_url) {
                return true;
            }
            continue;
        }
        if source_matches(e, url, self_url) {
            return true;
        }
    }
    false
}

fn self_matches(url: &Url, self_url: Option<&Url>) -> bool {
    let Some(s) = self_url else { return false };
    if url.origin() == s.origin() {
        return true;
    }
    // 'self' also permits the same host upgraded to a secure scheme.
    url.host_str() == s.host_str()
        && matches!(url.scheme(), "https" | "wss")
        && matches!(s.scheme(), "http" | "https")
}

/// "Scheme part match": http also matches https, ws also matches wss — the
/// allowance only ever runs toward the secure scheme.
fn scheme_matches(expr: &str, url_scheme: &str) -> bool {
    let a = expr.trim_end_matches(':').to_ascii_lowercase();
    let b = url_scheme;
    a == b
        || (a == "http" && b == "https")
        || (a == "ws" && matches!(b, "wss" | "http" | "https"))
        || (a == "https" && b == "wss")
}

fn host_matches(expr: &str, url_host: &str) -> bool {
    let eh = expr.to_ascii_lowercase();
    let uh = url_host.to_ascii_lowercase();
    if eh == "*" {
        return true;
    }
    if let Some(rest) = eh.strip_prefix('*') {
        // "*.example.com" -> ".example.com" suffix match
        return uh.len() > rest.len() && uh.ends_with(rest);
    }
    eh == uh
}

fn default_port(scheme: &str) -> Option<u16> {
    match scheme {
        "http" | "ws" => Some(80),
        "https" | "wss" => Some(443),
        "ftp" => Some(21),
        _ => None,
    }
}

fn source_matches(expr: &str, url: &Url, self_url: Option<&Url>) -> bool {
    if expr == "*" {
        // The wildcard covers NETWORK schemes only — data:/blob: carry their
        // payload in the URL, and "any host" must not mean "any bytes".
        return matches!(url.scheme(), "http" | "https" | "ws" | "wss" | "ftp");
    }
    // scheme-source: "https:", "data:"
    if expr.ends_with(':')
        && expr[..expr.len() - 1]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        && expr[..expr.len() - 1]
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
    {
        return scheme_matches(expr, url.scheme());
    }
    // host-source: [scheme "://"] host [":" port] [path]
    let (scheme, rest) = match expr.split_once("://") {
        Some((s, r)) => (Some(s), r),
        None => (None, expr),
    };
    let (host_port, path) = match rest.find('/') {
        Some(i) => (&rest[..i], Some(&rest[i..])),
        None => (rest, None),
    };
    let (host, port) = match host_port.rsplit_once(':') {
        Some((h, p)) if p == "*" || p.chars().all(|c| c.is_ascii_digit()) => (h, Some(p)),
        _ => (host_port, None),
    };
    if host.is_empty() {
        return false;
    }
    match scheme {
        Some(s) => {
            if !scheme_matches(s, url.scheme()) {
                return false;
            }
        }
        None => {
            // No scheme in the expression: the document's own scheme is
            // implied, and an https document does not reach down to http.
            if let Some(su) = self_url {
                if su.scheme() == "http" {
                    if !matches!(url.scheme(), "http" | "https") {
                        return false;
                    }
                } else if !scheme_matches(su.scheme(), url.scheme()) {
                    return false;
                }
            }
        }
    }
    if !host_matches(host, url.host_str().unwrap_or("")) {
        return false;
    }
    let url_port = url.port().or_else(|| default_port(url.scheme()));
    match port {
        Some("*") => {}
        Some(p) => {
            // A port is a number, not a string of digits: ":080" is ":80".
            let ep: u16 = match p.parse() {
                Ok(v) => v,
                Err(_) => return false,
            };
            // 80 permits 443 on an upgraded scheme, never the reverse.
            let upgraded =
                ep == 80 && matches!(url.scheme(), "https" | "wss") && url_port == Some(443);
            if url_port != Some(ep) && !upgraded {
                return false;
            }
        }
        None => {
            let ep = scheme
                .and_then(default_port)
                .or_else(|| self_url.and_then(|s| default_port(s.scheme())));
            let upgraded = ep == Some(80) && url_port == Some(443);
            if let Some(ep) = ep {
                if url_port != Some(ep) && !upgraded {
                    return false;
                }
            }
        }
    }
    if let Some(p) = path {
        if p != "/" {
            // A path ending in "/" is a prefix; anything else matches exactly.
            let up = url.path();
            if p.ends_with('/') {
                if !up.starts_with(p) {
                    return false;
                }
            } else if up != p {
                return false;
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn csp(texts: &[&str], page: &str) -> RenderCsp {
        RenderCsp::parse(
            &texts.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            page,
        )
    }

    #[test]
    fn font_none_blocks() {
        let c = csp(&["font-src 'none'"], "https://a.example/");
        let u = Url::parse("https://a.example/f.woff2").unwrap();
        assert!(!c.allows(ResourceKind::Font, &u));
        // ... but does not touch images (different directive, no default-src).
        assert!(c.allows(ResourceKind::Image, &u));
    }

    #[test]
    fn self_and_fallback() {
        let c = csp(&["default-src 'self'"], "https://a.example/");
        assert!(c.allows(
            ResourceKind::Style,
            &Url::parse("https://a.example/x.css").unwrap()
        ));
        assert!(!c.allows(
            ResourceKind::Style,
            &Url::parse("https://evil.example/x.css").unwrap()
        ));
    }

    #[test]
    fn host_wildcard_and_ports() {
        let c = csp(&["img-src *.cdn.example:80"], "http://a.example/");
        assert!(c.allows(
            ResourceKind::Image,
            &Url::parse("http://img.cdn.example/i.png").unwrap()
        ));
        // 80 permits 443 on the upgraded scheme…
        assert!(c.allows(
            ResourceKind::Image,
            &Url::parse("https://img.cdn.example/i.png").unwrap()
        ));
        // …but the bare host itself is not "*.host".
        assert!(!c.allows(
            ResourceKind::Image,
            &Url::parse("http://cdn.example/i.png").unwrap()
        ));
    }

    #[test]
    fn unknown_kind_and_no_policy_pass() {
        let c = csp(&["font-src 'none'"], "https://a.example/");
        let u = Url::parse("https://a.example/x").unwrap();
        assert!(c.allows(ResourceKind::Unknown, &u));
        let empty = RenderCsp::default();
        assert!(empty.allows(ResourceKind::Font, &u));
    }

    #[test]
    fn data_scheme_source() {
        let c = csp(&["img-src data:"], "https://a.example/");
        assert!(c.allows(
            ResourceKind::Image,
            &Url::parse("data:image/png;base64,AAAA").unwrap()
        ));
        assert!(!c.allows(
            ResourceKind::Image,
            &Url::parse("https://a.example/i.png").unwrap()
        ));
    }
}
