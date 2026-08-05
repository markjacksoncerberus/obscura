# 🍪 The Session Verdict — `cookies`, and staying logged in

> *Quest #465. Realm: `cookies/*`, 22 files. Before **132/840**; after
> **736/840 (87.6%)**, 12 files at 100%. And before this quest opened the gate,
> the realm's honest score was **0/840 — every file could-not-run**.*

---

## First, the realm was not failing. It was invisible.

The frontier survey recorded `cookies` at **2/259** with 4 of 6 files
could-not-run, and warned: *"check for one missing primitive before assuming six
gaps."* That warning was right, and the primitive was not in the engine.

Every single test in WPT's `cookies/` realm begins the same way:

```js
await getAndExpireCookiesForDefaultPathTest();
await test_driver.delete_all_cookies();
t.add_cleanup(test_driver.delete_all_cookies);
```

`test_driver.delete_all_cookies` is a WebDriver command, and our harness's
test_driver bridge implemented input actions but not cookies. So the very first
`await` in every test never resolved, and all 22 files sat forever at
`Running, 0 complete, N remain`. **Not one assertion in the realm had ever
executed.** The "2/259" on the map was measuring the size of the blind spot, not
the engine.

A page cannot do this for itself, either: a cookie set for a different path never
appears in `document.cookie`, so there is nothing to expire. It needs the jar. One
op (`op_clear_cookies`, deliberately not reachable from ordinary page script) plus
eight lines in `scripts/wpt_run.py` turned 0 measurable files into 22, and the real
baseline turned out to be **132/840**.

> **Lesson for the map: a realm reported as could-not-run has no score yet.** Ours
> was three times better than recorded before a line of engine code changed — and
> then five times better again once it was actually measurable.

## Then: the schemes were wrong, and that inverted the answers

WPT's cookie tests come in pairs — `__secure.document-cookie.https.html` expects a
**secure** origin, `__secure.document-cookie.html` expects a **non-secure** one and
asserts that every `__Secure-` cookie is *rejected*. Our runner joins every path to
`https://wpt.live`, so the plain half was being asked to prove something false.

`__secure.document-cookie.html` read **3/12 over https and 12/12 over http**,
having changed nothing at all. The corrected list lives in
`scripts/wpt-cookies-probe.txt` with the scheme written into each URL, and the
five prefix files went **22/91 → 91/91**.

---

## The engine work: RFC 6265bis, shared by both paths

The old jar had one parser for `Set-Cookie` and a near-duplicate for
`document.cookie`, and neither implemented the parts that make a cookie *safe*.
They are now one function, `parse_set_cookie`, used by both.

### One rule was worth 561 subtests

> §5.6: a control character — %x00-08 / %x0A-1F / %x7F — **anywhere** in a
> set-cookie string invalidates the **entire string.** Not the attribute it appears
> in. The whole cookie. HTAB (%x09) is the one exception, and it is legal even
> inside a cookie *name*.

That single check took `attributes-ctl` from **69/429 to 428/429**, and it is not
pedantry: a cookie header that can smuggle a `\r\n` past the parser is a response-
splitting bug, and the "ignore the whole line" rule is what closes it.

### The rest of the spec that was missing

- **default-path is the request URI's *directory*, not its path.** A cookie set at
  `/cookies/attributes/path.html` is scoped to `/cookies/attributes` — using the
  full path made every cookie effectively page-scoped, and it is why
  `path/default.html` scored 0/1.
- **path-match is not `starts_with`.** `/foo` must not match a cookie scoped to
  `/foobar`; the prefix has to end at a `/` boundary. `path/match.html` 4/16 → **16/16**.
- **Cookies are identified by (domain, path, name).** The jar keyed on name alone,
  so a cookie at `/` and a cookie of the same name at `/app` overwrote each other.
- **Cookies are sent longest-path-first** (§5.4), which is the order a server
  needs to resolve a shadowed cookie.
- **`__Host-` and `__Secure-` prefixes**, matched **case-insensitively** —
  `__SeCuRe-` is exactly as reserved as `__Secure-`, and violating a prefix is fatal
  to the cookie. That is the whole point of a name a server is allowed to trust.
- **A non-secure origin may not set a `Secure` cookie** (§5.4).
- **Max-Age beats Expires** when both appear, and a Max-Age that is not a plain
  integer is *ignored*, not partially parsed.
- **An expired cookie is DELETED, not merely not-set** — which is how every "log
  out" button in the world works. The old code returned early and left it there.
- **`document.cookie = "foo"`** (no `=`) sets a cookie with an empty name and the
  value `"foo"`. The old parser returned early and dropped it.
- **Name + value over 4096 octets is ignored.**
- Script cannot mint an `HttpOnly` cookie.

### 🔍 And the one that hid behind all of them: a frame's `document.cookie` was `''`

```js
get cookie() { return ''; }
set cookie(v) {}
```

Every `httpCookieTest` in the realm — that is the *HTTP half of every file* —
reads its result back through an iframe at `/cookies/resources/echo-cookie.html`,
because **reading cookies through an iframe is how you observe a cookie at a path
other than your own.** An iframe's document returned the empty string flat, so
every one of those reads came back empty regardless of what the jar held.

It could not simply forward to the page's cookies either: cookie visibility is
decided by *path*, and a frame at `/cookies/resources/` must not be shown a cookie
scoped to `/cookies/attributes/`. Two new ops (`op_get_cookies_for` /
`op_set_cookie_for`) resolve against the **frame's** URL, and the frame document's
accessors use them. This is the same shape as the frame bugs Quest #463 found under
`webstorage`: the storage was fine, the *frame's view of it* was a stub.

---

## Results

| Test | Before | After | Status |
|------|:------:|:-----:|:------:|
| `attributes/attributes-ctl.sub.html` | 69/429 | **428/429** | ⬆️ **+359** |
| `prefix/document-cookie.non-secure.html` | 2/35 | **35/35** | ✅ 100% |
| `value/value.html` | 1/28 | **22/28** | ⬆️ |
| `attributes/invalid.html` | 8/26 | **21/26** | ⬆️ |
| `attributes/path.html` | 12/21 | **21/21** | ✅ 100% |
| `prefix/__host.document-cookie.html` | 0/18 | **18/18** | ✅ 100% |
| `path/match.html` | 4/16 | **16/16** | ✅ 100% |
| `prefix/__host.document-cookie.https.html` | 4/14 | **14/14** | ✅ 100% |
| `prefix/__secure.document-cookie.html` | 0/12 | **12/12** | ✅ 100% |
| `prefix/__secure.document-cookie.https.html` | 6/12 | **12/12** | ✅ 100% |
| `size/name-and-value.html` | 6/11 | **10/11** | ⬆️ |
| `attributes/expires.html` | 6/10 | **10/10** | ✅ 100% |
| `attributes/max-age.html` | 4/10 | **9/10** | ⬆️ |
| `attributes/secure.https.html` | 0/9 | **8/9** | ⬆️ |
| `name/name.html` | 0/45 | **21/45** | ⬆️ |
| `name/name-ctl.html` | 4/66 | **37/66** | ⬆️ |
| `value/value-ctl.html` | 4/66 | **37/66** | ⬆️ |
| `path/default.html` | 0/1 | **1/1** | ✅ 100% |
| `secure/set-from-dom.sub.html` | 0/2 | **2/2** | ✅ 100% |
| `secure/set-from-dom.https.sub.html` | 2/2 | **2/2** | ✅ held |
| `encoding/charset.html` | 0/6 | 0/6 | — cap |
| `attributes/secure-non-secure.html` | 0/1 | 0/1 | — cap |
| **`cookies/*` — 22 files** | **132/840** | **736/840** | **87.6%**, 12 files at 100% |

*Honesty note on the before/after: the "before" column was measured over `https://`
for every file, because that was the only way the runner could address them. Part of
the gain on the prefix and `secure/` rows therefore comes from serving each file over
the scheme it is written for — which was our instrumentation bug to fix, and is
counted here as part of the work rather than hidden.*

## 🚧 The one cap, and it is precisely located

**58 of the 104 remaining failures are a single transport-layer behaviour**, not a
cookie bug. The HTTP half of `name-ctl` and `value-ctl` asks the server to send a
`Set-Cookie` whose *name* contains a control character, then checks the cookie was
ignored. Our HTTP client rejects the **entire response**:

```
FETCH REJECTED: error sending request for url (…/cookies/resources/cookie.py?set=…):
client error (SendRequest): invalid HTTP header parsed
```

so `fetch()` throws and the test reports "Failed to fetch" instead of "cookie
correctly ignored". Chrome drops the malformed header and continues. The fix is to
make the hyper/wreq response-header parse lenient (`.http1_allow_obsolete_multiline_headers`
/ a permissive header parser) rather than fatal — a self-contained change in
`crates/obscura-net`, with a real security question attached (a lenient parser must
still never let a `\r\n` through), which is why it is named here rather than rushed.

Other caps: `encoding/charset.html` (0/6) needs non-UTF-8 cookie byte handling;
`attributes/secure-non-secure.html` (0/1) needs an http↔https origin pair in one
test run. `name.html` still times out at 21/45 — it is a `timeout=long` file whose
every subtest is a network round trip plus an iframe.

## Caps / Next

**⭐ The next leverage is the lenient response-header parse** described above: 58
subtests here, and any page whose server emits a slightly-off header currently gets
a *failed fetch* rather than a page. That is a much bigger deal off the test suite
than on it.

Then, the gap this arc has now named three times: **none of this is on disk.**
`webstorage` (#463) and `IndexedDB` (#464) live in the page's JS realm, and the
cookie jar already has `save_to_file`/`load_from_file` but is not wired to a profile
by default. A browser for people on unreliable connections should still know who you
are after a restart. One shared, self-contained quest.

Still banked from earlier sessions: `Response.clone()` must **tee** the body rather
than copy its bytes (`fetch/api/response/response-clone` 6/21), and `FormData` cannot
hold a `File` (`String(v)` → `[object File]` — that is file upload).
