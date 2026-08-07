# 📜 Quest #493 — The Requested Verdict

> *`XMLHttpRequest` was one object pretending to be four — and a page could hang
> the whole browser with three lines of it.*

---

## Why this realm

XHR is the oldest way a page asks for something after it has loaded, and an
enormous amount of the working web still runs on it. `fetch()` is newer and
nicer; a library written in 2013 and never touched since is XHR. And the sites
least likely to have been rewritten are exactly the ones a person on an old
machine is most likely to be *sent* to by a government letter: the benefits
portal, the exam-results page, the clinic booking form.

The realm is **2,002 subtests**, and the previous arc's leverage list named it
fourth. The interface was measured before it was chosen.

---

## The baseline, measured

30 files, pristine build, fresh server per two files:

```
scored files=27   could-not-run=3   PASS 120/283
```

`idlharness.any.html` **92/196**. `setrequestheader-header-allowed` **1/10**.
`status-async` **0/27**. Eight event-order files at **0/1**.

---

## ⚠️⚠️ The find: three lines of XHR kill the whole browser

`xhr/setrequestheader-header-forbidden.htm` does this and then sends
**synchronously**:

```js
client.setRequestHeader("Host", "TEST")
client.setRequestHeader("Content-Length", "TEST")
client.setRequestHeader("Transfer-Encoding", "TEST")
client.setRequestHeader("Connection", "TEST")
client.send(null)          // ← synchronous: blocks the engine thread
```

The old `setRequestHeader` had **no forbidden-header rule at all**. It stored
every one of those and handed them to the HTTP client on the *blocking* path. The
engine wedged. Because the request is synchronous, it took **the whole browser**
with it, not just the page:

| | pristine build | after |
|---|---|---|
| `setrequestheader-header-forbidden.htm` | **killed the server; still hung after 12 minutes; unmeasurable** | runs in 30 s, **1/2** (60 s timeout) |

**And that is what had been poisoning every long measurement in this campaign.**
Once one file wedges the server, every file after it reads as `nav-error` or
`testharness did not load` — which is *indistinguishable from a regression* if
you only read the table. A single sweep of `xhr` managed **five files in
twenty-five minutes**; the same first file on a fresh server takes **ten
seconds**. New tool: **`scripts/wpt_batch.sh`**, which runs a probe list in small
chunks each against a freshly started server, so no one file can silently
invalidate the rows below it.

The fix is Fetch's own rule, which the old code simply did not have: a
**forbidden request-header is ignored, silently** — not refused. These are
headers the user agent owns, and a page that could set `Host` or `Cookie` could
impersonate another page. Ignoring rather than throwing also denies a page a way
to *enumerate* what the browser guards.

---

## The structural change: one object pretending to be four

`XMLHttpRequest` was **not an `EventTarget`**. It kept a private `{type: [fn]}`
bag and called the functions itself. So:

- `xhr.addEventListener('load', h, {once: true})` ignored the options,
- `dispatchEvent` did not exist,
- `xhr instanceof EventTarget` was false,
- a `readystatechange` "event" was an **object literal with three properties**,
- every attribute was a **writable own data property** — `xhr.status = 200`
  worked, and `Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'status')`
  was `undefined`,
- **`upload` was the literal `{addEventListener(){}, removeEventListener(){}}`** —
  an upload progress bar wired to it received nothing, forever, silently,
- and **`timeout` was stored and never read**: a request to a server that had
  gone away hung until the tab was closed, which on a flaky connection is most of
  them.

Rebuilt on the spec's own division:

```
EventTarget
 └ XMLHttpRequestEventTarget   — the seven progress handlers, shared by both ends
    ├ XMLHttpRequestUpload     — the request side (what YOU are sending)
    └ XMLHttpRequest           — the response side (+ readyState, the response)
```

`onloadstart`/`onprogress`/`onabort`/`onerror`/`onload`/`ontimeout`/`onloadend`
are declared **once**, on `XMLHttpRequestEventTarget`, which is why
`xhr.onprogress` and `xhr.upload.onprogress` are the same code. That is the point
of the interface existing at all.

---

## ⭐ What the event-order tests actually pin down

WPT's `resources/xmlhttprequest-event-order.js` asserts a literal sequence, and
three details in it are not guessable:

**⭐ An upload's completion events fire when the RESPONSE arrives.** This
transport sends the whole body and waits, so that is the first moment we can
honestly say the request body finished going out. It is also exactly what WPT
asserts on both sides:

```
success: 1, loadstart(0,0,false), upload.loadstart(0,12,true),
         upload.progress(12,12,true), upload.load, upload.loadend, 2, 3,
         progress(12,12,true), 4, load, loadend
timeout: 1, loadstart(0,0,false), upload.loadstart(0,12,true),
         4, upload.timeout(0,0,false), upload.loadend, timeout, loadend
```

A request that **times out never reports `upload.load`** — reporting it would
claim bytes arrived that did not.

**⭐ `LOADING` is entered by a body CHUNK, so an empty response never reaches
readyState 3.** `send-response-event-order` expects `2, 3, progress, 4` for a
12-byte body; `send-no-response-event-order` expects `2, progress, 4` for none.

**⭐ `abort()` inside the `loadstart` handler must stop `upload.loadstart` from
ever firing** — an upload cannot start after the request it belongs to has
already ended. That is one guard between two adjacent lines.

**⭐ `abort()` returns the object to `UNSENT` *without* firing
`readystatechange`.** A handler reacting to state 0 there would be reacting to a
request nobody made. WPT asserts the silence directly.

---

## ⚠️ Two regressions the ritual caught in my own work — both fixed

The first after-run was **+103 with two files DOWN**. Both were mine:

**`overridemimetype-invalid-mime-type` 2/3 → 0/3.** I made `overrideMimeType`
throw `SyntaxError` on an unparseable type. It does not. The spec sets the
override to **`application/octet-stream`** instead — and that distinction is the
whole test: an override of `"bogus"` must still **override** (so an XML response
stops being parsed as a document) while carrying **no charset of its own** (so
the response's own `charset=windows-1252` still decodes the bytes). Throwing and
ignoring each get exactly one of those two halves wrong. Fixed → **3/3**.

**`progressevent-constructor` 9/10 → 7/10.** I coerced `loaded`/`total` as
`unsigned long long`. **They are `double`.** WPT asserts `{loaded: 1.5, total:
3.5}` comes back as 1.5 and 3.5, and `{loaded: -1}` as −1. They *were* unsigned
integers once, which is what makes this a live trap. Fixed → **10/10**, and
`progressevent-interface` 2/7 → **7/7** with the members as brand-checked
readonly prototype accessors via `_idlEventAttrs`.

*A big green delta is not evidence on its own — this is the second arc running
where the sweep caught the knight, not the code.*

---

## Results

| file | before | after |
|---|---|---|
| `xhr/idlharness.any.html` | 92/196 | **183/196** |
| `xhr/progressevent-interface.html` | 2/7 | **7/7** |
| `xhr/progressevent-constructor.html` | 9/10 | **10/10** |
| `xhr/overridemimetype-invalid-mime-type.htm` | 2/3 | **3/3** |
| `xhr/event-timeout.any.html` | 0/1 | **1/1** |
| `xhr/event-timeout-order.any.html` | 0/1 | **1/1** |
| `xhr/timeout-sync.htm` | 1/2 | **2/2** |
| `xhr/event-loadstart-upload.any.html` | 0/1 | **1/1** |
| `xhr/abort-upload-event-abort.any.html` | 0/1 | **1/1** |
| `xhr/abort-upload-event-loadend.any.html` | 0/1 | **1/1** |
| `xhr/abort-event-order.htm` | 0/1 | **1/1** |
| `xhr/send-response-event-order.htm` | 0/1 | **1/1** |
| `xhr/send-no-response-event-order.htm` | 0/1 | **1/1** |
| `xhr/send-sync-response-event-order.htm` | 0/1 | **1/1** |
| `xhr/event-upload-progress.any.html` | 1/4 | **2/4** |
| `xhr/setrequestheader-header-forbidden.htm` | **hangs the browser** | **runs** (1/2) |

**120/283 → 229/283 over the same 27 scored files. 0 files down, 0 files lost.**

---

## Caps / Next

- **`status-async.htm` is 0/27 both before and after.** Untouched by this quest —
  it wants `resources/status.py` echoing arbitrary status codes and reason
  phrases, and our `statusText` comes back empty from the sync/async envelope.
  **27 subtests in one file, and the cheapest thing left in the realm.**
- **`getallresponseheaders.any.html` and `response-json.any.html` are
  could-not-run on both builds** — unchanged, not a regression, and not yet
  diagnosed.
- **Only ONE `progress` event fires per response**, at the end, because
  `fetch()` buffers the whole body before JS sees a byte. `response-data-progress`
  and `firing-events-http-*` want several. The transport to fix this now exists
  (`sse_ops.rs`, Quest #494) — this is a **streaming download body**, and it is
  worth far more than the subtests: on a slow connection, buffering the whole
  response before the page can render is the difference between something on
  screen in two seconds and nothing for forty.
- **`_isWorkerScope()` answers `false` unconditionally.** In this engine a worker
  shares the page's V8 context, so there is nothing to inspect; the Window rules
  (a synchronous request may carry neither a timeout nor a responseType) apply
  everywhere. That is *stricter* than the spec inside a worker. No WPT file
  currently measures the difference.
- **`event-upload-progress` is 2/4 and TIMEOUTs** — the remaining two are
  cross-origin (`HTTP_REMOTE_ORIGIN`) and a 307 redirect that must re-send the
  upload.
- `xhr` has 310 files; this quest measured 30. The realm is far from finished.
