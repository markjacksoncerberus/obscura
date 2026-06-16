# 🗺️ Scroll #04 — The URL Swamps

> *The foundational realm: every link, every fetch, every resolved resource passes
> through here. The `url` crate (Servo's rust-url) is wired through `op_url_parse` /
> `op_url_set`; most failures are rust-url **diverging from the WHATWG URL Standard**
> on edge cases the crate explicitly doesn't chase.*

**Realm:** `url/*` — `url-constructor`, `url-setters`, `url-setters-stripping`,
`url-statics-parse`; `url-origin` already 403/403 (keep green).

**Code:**
- Rust parser/setters: `crates/obscura-js/src/ops.rs` — `op_url_parse` (~1098),
  `op_url_set` (~1177), `apply_url_setter`, `url_components_json` (~1059).
- JS surface: `class URL` @ `crates/obscura-js/js/bootstrap.js` ~3319.

**Measure:** `scripts/wpt_run.py <path> --timeout 90`; bucket fails with the new
`scripts/wpt_fails.py <path>` (dumps each non-pass subtest's name + assert message).

---

## 📊 Standing (measured 2026-06-16)

| Test | Start | Inc 1 | Inc 2 | Note |
|------|:-----:|:-----:|:-----:|------|
| `url-statics-parse.any`        | 0/8     | **8/8** ✅   | 8/8 ✅ | `URL.parse`/`canParse` |
| `url-setters-stripping.any`    | 224/260 | **260/260** ✅ | 260/260 ✅ | userinfo no-strip |
| `url-setters.any`              | 226/279 | 232/279 | **241/279** | +15 |
| `url-constructor.any`          | 833/890 | 833/890 | **840/890** | +7 |
| `url-origin.any`               | 403/403 | 403/403 ✅ | 403/403 ✅ | held |

---

## ⚔️ Increment 1 — SECURED (+50, zero regressions)

Tractable keystones, all small & safe:
1. **userinfo setters don't strip tab/newline.** `op_url_set` stripped `\t\n\r`
   from *every* part; WHATWG only strips for the parser-based setters. The
   `username`/`password` setters percent-encode directly, so `\t`→`%09`, `\n`→`%0A`,
   `\r`→`%0D`. Moved stripping per-part into `apply_url_setter`; userinfo gets the
   raw value (rust-url's `set_username`/`set_password` already encode C0 controls).
   **stripping 224→260, setters userinfo +2.**
2. **`URL.parse` / `URL.canParse` statics** (were missing) — `parse` returns a URL
   or `null` (never throws); `canParse` returns a bool. **statics 0→8.**
3. **hostname `:` invalidates the whole value.** The hostname state rejects a `:`
   (host-invalid-code-point) → the setter is a no-op, not a truncation. `[IPv6]`
   literals still allowed. **setters +3** (incl. a `file://` hostname case).
4. **port whitespace-only → no-op.** `port='\n\t\t'` becomes empty *after* stripping
   but the raw value isn't empty → no-op (only the literal `''` clears the port).
   **setters +1.**

---

## ⚔️ Increment 2 — SECURED (+16, zero regressions)

Two spec-correct fix-ups in `url_components_json` (post-processing rust-url's output):
1. **Path `^`→`%5E`** (bucket G). rust-url's path percent-encode set omits U+005E;
   WHATWG encodes it. A bare `^` only occurs in the path, so encode it across the
   path region of `href`/`pathname` (a `^` in query/fragment stays literal).
   **constructor +2, setters +1.**
2. **Opaque-path trailing space → `%20`** (bucket C, partial). The WHATWG opaque-path
   serializer encodes the single space immediately before `?`/`#`/EOF. rust-url keeps
   the literal space only when a query/fragment follows (it trims a pure trailing
   space at EOF), so only the delimited cases are recoverable. **constructor +5,
   setters +8.** The pure-trailing (`data:space ?query`.search='') cases remain
   unrecoverable from rust-url output.

Held: url-origin 403/403, url-with-fetch 16, url-with-xhr 14, url-format 6,
stripping 260, statics 8, searchparams 4.

## 🐉 Remaining beasts (bucketed) — the hard ground

These are **rust-url vs WHATWG structural divergences**. rust-url normalizes more
aggressively than WHATWG and can't represent some states (empty-host-with-authority,
`//`-preserving paths), so output post-processing can't always recover them. The
clean long-term keystone is a **real WHATWG basic URL parser** (would unlock
constructor + setters together); piecemeal Rust patches are the alternative.

### A. `file:` URL quirks — **~30 (constructor), ~5 (setters)** — biggest bucket
- Windows drive letters: `file:///w|/m` → expected `file:///w:/m` (`|`→`:`); `C|`
  against `file://host/…` → `file://host/C:` (host kept, `|`→`:`); `..` must NOT
  pop a drive-letter segment (`file://x/C:/` stays).
- Empty-host / extra-slash preservation: `file://spider///`, `file:////foo`,
  `file://localhost//a//../..//` → rust-url collapses the empty path segments.
- Backslash normalization in file paths (`file:\\//` → `file:////`).
- `file://host/x`.host='' → `file:///x` (empty host OK for file); `loc%41lhost`
  must percent-decode → `localhost` → empty host.

### B. Non-special empty-host authority `sc:///` — **~16 (setters)**
- `sc://x/`.host/hostname = '' (or `\t`/`/`/`?`/`#`) → expected `sc:///` (authority
  retained, host empty); rust-url's `set_host(None)` drops the whole authority → `sc:/`.
- BUT `sc://test@test/` / `sc://test:12/` with host='' → **unchanged** (empty host
  rejected when credentials/port present). rust-url can't model `sc:///` distinctly.

### C. Opaque-path trailing space → `%20` — **~5 (constructor), ~10 (setters)**
- A space is encoded `%20` iff it's the **last char before `?`/`#`/EOF** in an opaque
  path: `non-special:opaque  ?hi` → `…opaque %20?hi` (only the final space encoded).
- Partly recoverable by post-processing href when a query/fragment follows, but
  rust-url **trims** the pure-trailing case (`data:space ?query`.search='' → loses
  the space), so those can't be recovered from rust-url output.

### D. `///` special-authority-ignore-slashes — **~7 (constructor)**
- `///test` / `///example.org/path` against `http://example.org/` should parse (skip
  ALL leading `/`\`\\` then read host) — currently throws "Invalid URL".

### E. Non-special backslash is literal — **~3 (constructor)**
- `\a` against `foo://foo/a` → `foo://foo/\a` (backslash kept); rust-url drops it or
  treats `\/` as an authority delimiter (`foo://a`).

### F. `/.` path-segment serialization — **~6 (setters)**
- `non-spec:/`.pathname='//p' → `non-spec:/.//p` (a leading `//` after the scheme gets
  a `/.` prefix so it doesn't read as authority on re-parse); inverse on drop.

### G. Path percent-encode set missing `^` — **~3 (constructor + setters)**
- `^` (0x5E) must be `%5E` in paths per current WHATWG; rust-url's path set omits it.

### H. Pathname-erase / `?`/`#` encode on non-special — **~4 (setters)**
- `foo:/some/path`.pathname='' → `foo:/` (path-only URLs can't erase to empty);
  `sc://example.net`.pathname='?' → `…/%3F` (encode `?`/`#` for non-special).
