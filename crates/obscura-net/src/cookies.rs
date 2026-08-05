use std::collections::HashMap;
use std::sync::RwLock;
use url::Url;

const DEFAULT_SAME_SITE: &str = "Lax";

pub struct CookieJar {
    cookies: RwLock<HashMap<String, HashMap<String, CookieEntry>>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct CookieEntry {
    name: String,
    value: String,
    path: String,
    domain: String,
    secure: bool,
    http_only: bool,
    expires: Option<u64>,
    same_site: String,
}

impl CookieJar {
    pub fn new() -> Self {
        CookieJar {
            cookies: RwLock::new(HashMap::new()),
        }
    }

    /// RFC 6265bis §5.6 "parse a set-cookie string", shared by the `Set-Cookie`
    /// header path and `document.cookie`. Returns None when the whole string is
    /// to be ignored — which, per spec, is the answer far more often than the old
    /// permissive parser believed.
    fn parse_set_cookie(
        set_cookie_str: &str,
        url: &Url,
        from_js: bool,
    ) -> Option<CookieEntry> {
        // §5.6 step 1: a control character ANYWHERE in the string — %x00-08 /
        // %x0A-1F / %x7F — kills the entire set-cookie string. Not the attribute
        // it appears in: the whole cookie. HTAB (%x09) is the one exception, and
        // it is legal even inside a cookie NAME.
        if has_forbidden_ctl(set_cookie_str) {
            return None;
        }

        let parts: Vec<&str> = set_cookie_str.splitn(2, ';').collect();
        let name_value = parts[0];
        // `document.cookie = "foo"` (no "=") sets a cookie with an EMPTY name and
        // "foo" as its value — it is not a no-op, and pages rely on reading it back.
        let (name, value) = match name_value.split_once('=') {
            Some((n, v)) => (n.trim().to_string(), v.trim().to_string()),
            None => (String::new(), name_value.trim().to_string()),
        };
        // A cookie with neither a name nor a value is nothing at all.
        if name.is_empty() && value.is_empty() {
            return None;
        }
        // §5.6: name + value longer than 4096 octets → ignore.
        if name.len() + value.len() > 4096 {
            return None;
        }

        let host = url.host_str().unwrap_or("").to_lowercase();
        let is_secure_origin = url.scheme() == "https"
            || host == "localhost"
            || host == "127.0.0.1"
            || host == "[::1]";

        let mut domain: Option<String> = None;
        let mut path: Option<String> = None;
        let mut secure = false;
        let mut http_only = false;
        let mut expires_at: Option<u64> = None;
        let mut max_age: Option<i64> = None;
        let mut same_site = DEFAULT_SAME_SITE.to_string();

        if parts.len() > 1 {
            for attr in parts[1].split(';') {
                let (key, val) = match attr.split_once('=') {
                    Some((k, v)) => (k.trim().to_lowercase(), v.trim()),
                    None => (attr.trim().to_lowercase(), ""),
                };
                match key.as_str() {
                    "domain" => {
                        // An empty Domain= is ignored (the cookie stays host-only).
                        let d = val.trim_start_matches('.').to_lowercase();
                        if !d.is_empty() {
                            domain = Some(d);
                        }
                    }
                    // §5.4: a Path that does not start with "/" is ignored, and the
                    // default-path is used instead.
                    "path" => {
                        if val.starts_with('/') {
                            path = Some(val.to_string());
                        } else {
                            path = None;
                        }
                    }
                    "expires" => expires_at = parse_http_date(val).ok(),
                    // Max-Age must be a plain integer; anything else is ignored
                    // (NOT "parse the leading digits").
                    "max-age" => {
                        if let Ok(secs) = val.parse::<i64>() {
                            max_age = Some(secs);
                        }
                    }
                    "samesite" => same_site = val.to_string(),
                    "secure" => secure = true,
                    "httponly" => http_only = true,
                    _ => {}
                }
            }
        }

        // Max-Age wins over Expires whenever both are present.
        let now = unix_now();
        let expires = match max_age {
            Some(secs) if secs <= 0 => Some(0),          // 0 == "delete me"
            Some(secs) => Some(now.saturating_add(secs as u64)),
            None => expires_at,
        };

        // §5.4: a non-secure origin may not set (or overwrite) a Secure cookie.
        if secure && !is_secure_origin {
            return None;
        }

        // §5.4 cookie name prefixes, matched CASE-INSENSITIVELY (`__SeCuRe-` is
        // just as reserved as `__Secure-`, and WPT checks exactly that spelling).
        // Violating a prefix is fatal to the cookie — that is the whole point of a
        // name prefix a server is allowed to trust.
        let lname = name.to_ascii_lowercase();
        if lname.starts_with("__secure-") && !(secure && is_secure_origin) {
            return None;
        }
        if lname.starts_with("__host-") {
            let host_ok = secure
                && is_secure_origin
                && domain.is_none()
                && path.as_deref() == Some("/");
            if !host_ok {
                return None;
            }
        }

        // §5.1.3: the Domain attribute must domain-match the host.
        let final_domain = match &domain {
            Some(d) => {
                if !domain_matches(&host, d) {
                    return None;
                }
                d.clone()
            }
            None => host.clone(),
        };

        let _ = from_js;
        Some(CookieEntry {
            name,
            value,
            path: path.unwrap_or_else(|| default_path(url)),
            domain: final_domain,
            secure,
            http_only: http_only && !from_js, // script cannot mint an HttpOnly cookie
            expires,
            same_site,
        })
    }

    /// Store (or, when already expired, remove) a parsed cookie.
    fn store(&self, entry: CookieEntry) {
        let key = cookie_key(&entry.name, &entry.path);
        let mut cookies = self.cookies.write().unwrap();
        if let Some(exp) = entry.expires {
            // An Expires in the past (or Max-Age<=0) DELETES the cookie — it does
            // not merely decline to set it, which is how every "log out" works.
            if exp == 0 || exp < unix_now() {
                if let Some(domain_cookies) = cookies.get_mut(&entry.domain) {
                    domain_cookies.remove(&key);
                }
                return;
            }
        }
        cookies.entry(entry.domain.clone()).or_default().insert(key, entry);
    }

    pub fn set_cookie(&self, set_cookie_str: &str, url: &Url) {
        if let Some(entry) = Self::parse_set_cookie(set_cookie_str, url, false) {
            self.store(entry);
        }
    }

    pub fn get_cookie_header(&self, url: &Url) -> String {
        let host = url.host_str().unwrap_or("");
        let path = url.path();
        let is_secure = url.scheme() == "https";
        let cookies = self.cookies.read().unwrap();

        // (path length, "name=value") — RFC 6265 §5.4 orders longer paths first.
        let mut matching: Vec<(usize, String)> = Vec::new();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        for (domain, domain_cookies) in cookies.iter() {
            if !domain_matches(host, domain) {
                continue;
            }
            for entry in domain_cookies.values() {
                if let Some(exp) = entry.expires {
                    if exp < now {
                        continue;
                    }
                }
                if entry.secure && !is_secure {
                    continue;
                }
                if !path_matches(path, &entry.path) {
                    continue;
                }
                matching.push((entry.path.len(), format!("{}={}", entry.name, entry.value)));
            }
        }

        matching.sort_by(|a, b| b.0.cmp(&a.0));
        matching
            .into_iter()
            .map(|(_, s)| s)
            .collect::<Vec<_>>()
            .join("; ")
    }

    pub fn get_all_cookies(&self) -> Vec<CookieInfo> {
        let cookies = self.cookies.read().unwrap();
        let mut result = Vec::new();
        for domain_cookies in cookies.values() {
            for entry in domain_cookies.values() {
                result.push(CookieInfo {
                    name: entry.name.clone(),
                    value: entry.value.clone(),
                    domain: entry.domain.clone(),
                    path: entry.path.clone(),
                    secure: entry.secure,
                    http_only: entry.http_only,
                    same_site: entry.same_site.clone(),
                    expires: entry.expires.map(|e| e as i64),
                });
            }
        }
        result
    }

    pub fn set_cookies_from_cdp(&self, cookies: Vec<CookieInfo>) {
        let mut jar = self.cookies.write().unwrap();
        for cookie in cookies {
            let same_site = if cookie.same_site.is_empty() {
                DEFAULT_SAME_SITE.to_string()
            } else {
                cookie.same_site
            };
            let expires = cookie.expires.and_then(|e| if e > 0 { Some(e as u64) } else { None });
            let entry = CookieEntry {
                name: cookie.name.clone(),
                value: cookie.value,
                path: cookie.path,
                domain: cookie.domain.clone(),
                secure: cookie.secure,
                http_only: cookie.http_only,
                expires,
                same_site,
            };
            let key = cookie_key(&entry.name, &entry.path);
            jar.entry(cookie.domain).or_default().insert(key, entry);
        }
    }

    pub fn get_js_visible_cookies(&self, url: &Url) -> String {
        let host = url.host_str().unwrap_or("");
        let path = url.path();
        let is_secure = url.scheme() == "https";
        let cookies = self.cookies.read().unwrap();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // (path length, "name=value") — RFC 6265 §5.4 orders longer paths first.
        let mut matching: Vec<(usize, String)> = Vec::new();

        for (domain, domain_cookies) in cookies.iter() {
            if !domain_matches(host, domain) {
                continue;
            }
            for entry in domain_cookies.values() {
                if entry.http_only {
                    continue;
                }
                if let Some(exp) = entry.expires {
                    if exp < now {
                        continue;
                    }
                }
                if entry.secure && !is_secure {
                    continue;
                }
                if !path_matches(path, &entry.path) {
                    continue;
                }
                matching.push((entry.path.len(), format!("{}={}", entry.name, entry.value)));
            }
        }

        matching.sort_by(|a, b| b.0.cmp(&a.0));
        matching
            .into_iter()
            .map(|(_, s)| s)
            .collect::<Vec<_>>()
            .join("; ")
    }

    pub fn set_cookie_from_js(&self, cookie_str: &str, url: &Url) {
        if let Some(entry) = Self::parse_set_cookie(cookie_str, url, true) {
            self.store(entry);
        }
    }

    pub fn delete_cookie(&self, name: &str, domain: &str) {
        let mut cookies = self.cookies.write().unwrap();
        // The map key carries the path now, so a delete-by-name has to look at
        // the entries rather than at the key.
        if domain.is_empty() {
            for domain_cookies in cookies.values_mut() {
                domain_cookies.retain(|_, e| e.name != name);
            }
        } else {
            let domains_to_try = [
                domain.to_string(),
                format!(".{}", domain.trim_start_matches('.')),
                domain.trim_start_matches('.').to_string(),
            ];
            for d in &domains_to_try {
                if let Some(domain_cookies) = cookies.get_mut(d.as_str()) {
                    domain_cookies.retain(|_, e| e.name != name);
                }
            }
        }
    }

    pub fn delete_cookies_filtered(&self, name: &str, domain: &str, path: Option<&str>) {
        let mut cookies = self.cookies.write().unwrap();
        let matches_path = |entry_path: &str| match path {
            Some(p) => entry_path == p,
            None => true,
        };
        if domain.is_empty() {
            for domain_cookies in cookies.values_mut() {
                domain_cookies.retain(|_, e| !(e.name == name && matches_path(&e.path)));
            }
        } else {
            let domains_to_try = [
                domain.to_string(),
                format!(".{}", domain.trim_start_matches('.')),
                domain.trim_start_matches('.').to_string(),
            ];
            for d in &domains_to_try {
                if let Some(domain_cookies) = cookies.get_mut(d.as_str()) {
                    domain_cookies.retain(|_, e| !(e.name == name && matches_path(&e.path)));
                }
            }
        }
    }

    pub fn clear(&self) {
        self.cookies.write().unwrap().clear();
    }

    /// Serialize all non-expired cookies to a JSON file.
    /// Writes atomically via tempfile then rename.
    pub fn save_to_file(&self, path: &std::path::Path) -> Result<(), std::io::Error> {
        use std::io::Write;

        let cookies = self.cookies.read().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut all: Vec<CookieInfo> = Vec::new();
        for domain_cookies in cookies.values() {
            for entry in domain_cookies.values() {
                if let Some(exp) = entry.expires {
                    if exp < now {
                        continue;
                    }
                }
                all.push(CookieInfo {
                    name: entry.name.clone(),
                    value: entry.value.clone(),
                    domain: entry.domain.clone(),
                    path: entry.path.clone(),
                    secure: entry.secure,
                    http_only: entry.http_only,
                    same_site: entry.same_site.clone(),
                    expires: entry.expires.map(|e| e as i64),
                });
            }
        }

        let json = serde_json::to_string_pretty(&all).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, e)
        })?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut tmp = tempfile::NamedTempFile::new_in(
            path.parent().unwrap_or(std::path::Path::new(".")),
        )?;
        tmp.write_all(json.as_bytes())?;
        tmp.persist(path).map_err(|e| e.error)?;
        Ok(())
    }

    /// Load cookies from a JSON file into the jar.
    /// Merges with existing cookies (does not clear).
    /// Returns the number of cookies loaded.
    pub fn load_from_file(&self, path: &std::path::Path) -> Result<usize, std::io::Error> {
        if !path.exists() {
            return Ok(0);
        }
        let data = std::fs::read_to_string(path)?;
        let cookies: Vec<CookieInfo> =
            serde_json::from_str(&data).map_err(|e| {
                std::io::Error::new(std::io::ErrorKind::InvalidData, e)
            })?;
        let count = cookies.len();
        self.set_cookies_from_cdp(cookies);
        Ok(count)
    }
}

impl Default for CookieJar {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CookieInfo {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub secure: bool,
    #[serde(rename = "httpOnly")]
    pub http_only: bool,
    #[serde(default, rename = "sameSite")]
    pub same_site: String,
    #[serde(default)]
    pub expires: Option<i64>,
}

fn parse_http_date(s: &str) -> Result<u64, ()> {
    let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

    let s = s.replace('-', " ");
    let parts: Vec<&str> = s.split_whitespace().collect();

    if parts.len() < 5 { return Err(()); }

    let day: u64 = parts[1].parse().map_err(|_| ())?;
    let month = months.iter().position(|m| parts[2].to_lowercase().starts_with(m))
        .ok_or(())? as u64 + 1;
    let year: u64 = parts[3].parse().map_err(|_| ())?;

    let time_parts: Vec<&str> = parts[4].split(':').collect();
    let hour: u64 = time_parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minute: u64 = time_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let second: u64 = time_parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);

    let mut days_total: u64 = 0;
    for y in 1970..year {
        days_total += if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
    }
    let days_in_month = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let is_leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    for m in 1..month {
        days_total += days_in_month[m as usize] + if m == 2 && is_leap { 1 } else { 0 };
    }
    days_total += day - 1;

    Ok(days_total * 86400 + hour * 3600 + minute * 60 + second)
}

/// RFC 6265bis: %x00-08 / %x0A-1F / %x7F anywhere in a set-cookie string makes
/// the whole string invalid. HTAB (%x09) is deliberately NOT in that set — a tab
/// is legal even inside a cookie name.
fn has_forbidden_ctl(s: &str) -> bool {
    s.chars().any(|c| {
        let c = c as u32;
        (c <= 0x08) || (0x0A..=0x1F).contains(&c) || c == 0x7F
    })
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// RFC 6265 §5.1.4 "default-path": the request URI's DIRECTORY, not its full
/// path. `/cookies/attributes/path.html` defaults to `/cookies/attributes`, so a
/// cookie set there is not visible from `/other/` — using the full path instead
/// made every cookie effectively page-scoped.
fn default_path(url: &Url) -> String {
    let p = url.path();
    if p.is_empty() || !p.starts_with('/') {
        return "/".to_string();
    }
    match p.rfind('/') {
        Some(0) | None => "/".to_string(),
        Some(i) => p[..i].to_string(),
    }
}

/// RFC 6265 §5.1.4 "path-match". A prefix test is not enough: `/foo` must not
/// match a cookie whose path is `/foobar`.
fn path_matches(request_path: &str, cookie_path: &str) -> bool {
    if request_path == cookie_path {
        return true;
    }
    if !request_path.starts_with(cookie_path) {
        return false;
    }
    cookie_path.ends_with('/') || request_path[cookie_path.len()..].starts_with('/')
}

/// Cookies are identified by (domain, path, name) — two cookies may share a name
/// as long as their paths differ, which is exactly what the path tests check.
fn cookie_key(name: &str, path: &str) -> String {
    format!("{}\u{1}{}", path, name)
}

fn domain_matches(host: &str, domain: &str) -> bool {
    let host = host.to_lowercase();
    let domain = domain.trim_start_matches('.').to_lowercase();
    host == domain || host.ends_with(&format!(".{}", domain))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_and_get_cookie() {
        let jar = CookieJar::new();
        let url = Url::parse("https://example.com/path").unwrap();
        jar.set_cookie("session=abc123; Path=/; Secure; HttpOnly", &url);

        let header = jar.get_cookie_header(&url);
        assert!(header.contains("session=abc123"));
    }

    #[test]
    fn test_cookie_domain_matching() {
        let jar = CookieJar::new();
        let url = Url::parse("https://www.example.com/").unwrap();
        jar.set_cookie("token=xyz; Domain=example.com", &url);

        let header = jar.get_cookie_header(&url);
        assert!(header.contains("token=xyz"));

        let sub_url = Url::parse("https://api.example.com/").unwrap();
        let header2 = jar.get_cookie_header(&sub_url);
        assert!(header2.contains("token=xyz"));

        let other_url = Url::parse("https://other.com/").unwrap();
        let header3 = jar.get_cookie_header(&other_url);
        assert!(header3.is_empty());
    }

    #[test]
    fn test_cdp_cookie_with_leading_dot_domain_matches_requests() {
        let jar = CookieJar::new();
        jar.set_cookies_from_cdp(vec![CookieInfo {
            name: "token".to_string(),
            value: "xyz".to_string(),
            domain: ".example.com".to_string(),
            path: "/".to_string(),
            secure: false,
            http_only: false,
            same_site: String::new(),
            expires: None,
        }]);

        let apex_url = Url::parse("https://example.com/").unwrap();
        let apex_header = jar.get_cookie_header(&apex_url);
        assert!(apex_header.contains("token=xyz"));

        let subdomain_url = Url::parse("https://api.example.com/").unwrap();
        let subdomain_header = jar.get_cookie_header(&subdomain_url);
        assert!(subdomain_header.contains("token=xyz"));

        let other_url = Url::parse("https://other.com/").unwrap();
        let other_header = jar.get_cookie_header(&other_url);
        assert!(other_header.is_empty());
    }

    #[test]
    fn test_secure_cookie_not_sent_over_http() {
        let jar = CookieJar::new();
        let https_url = Url::parse("https://example.com/").unwrap();
        jar.set_cookie("secure_token=secret; Secure", &https_url);

        let http_url = Url::parse("http://example.com/").unwrap();
        let header = jar.get_cookie_header(&http_url);
        assert!(header.is_empty());
    }

    #[test]
    fn test_max_age_zero_deletes_cookie() {
        let jar = CookieJar::new();
        let url = Url::parse("https://example.com/").unwrap();
        jar.set_cookie("session=abc", &url);
        assert!(jar.get_cookie_header(&url).contains("session=abc"));

        jar.set_cookie("session=abc; Max-Age=0", &url);
        assert!(jar.get_cookie_header(&url).is_empty());
    }

    #[test]
    fn test_max_age_sets_expiry() {
        let jar = CookieJar::new();
        let url = Url::parse("https://example.com/").unwrap();
        jar.set_cookie("token=xyz; Max-Age=3600", &url);
        assert!(jar.get_cookie_header(&url).contains("token=xyz"));
    }

    #[test]
    fn test_expired_cookie_not_sent() {
        let jar = CookieJar::new();
        let url = Url::parse("https://example.com/").unwrap();
        jar.set_cookie("old=gone; Expires=Thu, 01 Jan 2020 00:00:00 GMT", &url);
        assert!(jar.get_cookie_header(&url).is_empty());
    }

    #[test]
    fn test_samesite_parsed() {
        let jar = CookieJar::new();
        let url = Url::parse("https://example.com/").unwrap();
        jar.set_cookie("strict_cookie=val; SameSite=Strict", &url);
        assert!(jar.get_cookie_header(&url).contains("strict_cookie=val"));
    }

    #[test]
    fn test_clear_cookies() {
        let jar = CookieJar::new();
        let url = Url::parse("https://example.com/").unwrap();
        jar.set_cookie("a=1", &url);
        assert!(!jar.get_cookie_header(&url).is_empty());

        jar.clear();
        assert!(jar.get_cookie_header(&url).is_empty());
    }

    #[test]
    fn test_set_cookies_from_cdp_preserves_same_site_and_expires() {
        let jar = CookieJar::new();
        let future_expiry = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            + 3600;
        jar.set_cookies_from_cdp(vec![CookieInfo {
            name: "sid".to_string(),
            value: "abc".to_string(),
            domain: "example.com".to_string(),
            path: "/".to_string(),
            secure: true,
            http_only: true,
            same_site: "Strict".to_string(),
            expires: Some(future_expiry),
        }]);

        let cookies = jar.get_all_cookies();
        assert_eq!(cookies.len(), 1);
        assert_eq!(cookies[0].same_site, "Strict");
        assert_eq!(cookies[0].expires, Some(future_expiry));
    }

    #[test]
    fn test_set_cookies_from_cdp_session_when_expires_none() {
        let jar = CookieJar::new();
        jar.set_cookies_from_cdp(vec![CookieInfo {
            name: "n".to_string(),
            value: "v".to_string(),
            domain: "example.com".to_string(),
            path: "/".to_string(),
            secure: false,
            http_only: false,
            same_site: String::new(),
            expires: None,
        }]);
        let cookies = jar.get_all_cookies();
        assert_eq!(cookies[0].expires, None);
        assert_eq!(cookies[0].same_site, DEFAULT_SAME_SITE);
    }

    #[test]
    fn test_delete_cookies_filtered_path_mismatch_preserves_cookie() {
        let jar = CookieJar::new();
        jar.set_cookies_from_cdp(vec![CookieInfo {
            name: "sid".to_string(),
            value: "v".to_string(),
            domain: "example.com".to_string(),
            path: "/admin".to_string(),
            secure: false,
            http_only: false,
            same_site: String::new(),
            expires: None,
        }]);
        jar.delete_cookies_filtered("sid", "example.com", Some("/other"));
        assert_eq!(jar.get_all_cookies().len(), 1);

        jar.delete_cookies_filtered("sid", "example.com", Some("/admin"));
        assert!(jar.get_all_cookies().is_empty());
    }

    #[test]
    fn test_delete_cookies_filtered_no_path_deletes_regardless() {
        let jar = CookieJar::new();
        jar.set_cookies_from_cdp(vec![CookieInfo {
            name: "sid".to_string(),
            value: "v".to_string(),
            domain: "example.com".to_string(),
            path: "/admin".to_string(),
            secure: false,
            http_only: false,
            same_site: String::new(),
            expires: None,
        }]);
        jar.delete_cookies_filtered("sid", "example.com", None);
        assert!(jar.get_all_cookies().is_empty());
    }

    #[test]
    fn test_set_cookies_from_cdp_expired_does_not_persist() {
        let jar = CookieJar::new();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        jar.set_cookies_from_cdp(vec![CookieInfo {
            name: "old".to_string(),
            value: "v".to_string(),
            domain: "example.com".to_string(),
            path: "/".to_string(),
            secure: false,
            http_only: false,
            same_site: String::new(),
            expires: Some(now - 1),
        }]);
        let url = Url::parse("https://example.com/").unwrap();
        assert!(jar.get_cookie_header(&url).is_empty());
    }
    fn test_save_load_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("cookies.json");

        let jar = CookieJar::new();
        let url = Url::parse("https://example.com/").unwrap();
        jar.set_cookie("session=abc123; Domain=example.com; Path=/", &url);
        jar.set_cookie("token=xyz; Secure; HttpOnly", &url);

        jar.save_to_file(&path).unwrap();
        assert!(path.exists());

        let jar2 = CookieJar::new();
        let count = jar2.load_from_file(&path).unwrap();
        assert_eq!(count, 2);

        let header = jar2.get_cookie_header(&url);
        assert!(header.contains("session=abc123"));
        assert!(header.contains("token=xyz"));
    }

    #[test]
    fn test_load_nonexistent_file_returns_zero() {
        let jar = CookieJar::new();
        let count = jar
            .load_from_file(std::path::Path::new("/nonexistent/cookies.json"))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_domain_matches_subdomain_without_leading_dot() {
        let jar = CookieJar::new();
        jar.set_cookies_from_cdp(vec![CookieInfo {
            name: "session".to_string(),
            value: "abc".to_string(),
            domain: "xiaohongshu.com".to_string(),
            path: "/".to_string(),
            secure: false,
            http_only: true,
            same_site: String::new(),
            expires: None,
        }]);
        let url = Url::parse("https://www.xiaohongshu.com/explore").unwrap();
        let header = jar.get_cookie_header(&url);
        assert!(header.contains("session=abc"), "Cookie header was: '{}'", header);
    }

    #[test]
    fn test_cookie_from_file_load_then_send_in_request() {
        // Simulate what happens: load cookies from file → navigate → cookie should be in request
        use std::io::Write;
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("cookies.json");
        
        // Write cookies like we exported from Chrome
        let cookies = serde_json::json!([
            {"name": "a1", "value": "testval", "domain": "xiaohongshu.com", "path": "/", "secure": false, "httpOnly": false},
            {"name": "web_session", "value": "sess123", "domain": "xiaohongshu.com", "path": "/", "secure": false, "httpOnly": true},
        ]);
        std::fs::write(&path, serde_json::to_string(&cookies).unwrap()).unwrap();
        
        let jar = CookieJar::new();
        let count = jar.load_from_file(&path).unwrap();
        assert_eq!(count, 2, "Should load 2 cookies");
        
        let url = Url::parse("https://www.xiaohongshu.com/explore").unwrap();
        let header = jar.get_cookie_header(&url);
        assert!(header.contains("a1=testval"), "Missing a1 in: '{}'", header);
        assert!(header.contains("web_session=sess123"), "Missing web_session in: '{}'", header);
    }
}
