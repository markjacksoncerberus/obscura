# 📜 The Unframed Verdict — Quest #531

> **Realm:** `content-security-policy/frame-ancestors/` (34 files) + `X-Frame-Options`.
> **Result:** the twelve non-nested files **4/11 → 14/14**. The twenty-two nested files
> remain blocked on an architectural cap, named below.

---

## The gap

`frame-ancestors` is the only CSP directive that is not about what a page may **load**.
It is about **who may load the page**.

It is the standards-track answer to clickjacking: an invisible frame over a real bank,
a transfer button positioned under the reader's cursor, and the reader never sees the
page they actually clicked. It is also the modern replacement for `X-Frame-Options`,
which Obscura did not implement either — `grep -rn "x-frame-options"` over the whole
tree returned nothing.

**⭐ It is the one protection a site cannot enforce itself.** Every other defence a site
ships runs inside the site's own document, where the site's own code is in charge. This
one has to be honoured by the browser of a reader who is visiting *somebody else's* page.
A browser that ignores it is not weakening its own user's settings — it is handing an
attacker every site that believed it was protected.

## What landed

A `FRAME-ANCESTORS-BEGIN/END` block in `bootstrap.js`, asked from `_loadIframeSrc` with
the response in hand:

- `_faAncestorURLs(el)` — walks the frame element's document chain to the top page.
- `_faAllows(policies, resourceURL, ancestors)` — every ancestor must match, or the load
  is refused.
- `_xfoAllows(xfo, …)` — `DENY` / `SAMEORIGIN`; `ALLOW-FROM` is obsolete and ignored.
- `__cspFrameLoadAllowed(el, url, headers)` — the single entry point.

A refused frame is left holding its initial `about:blank` with an **opaque origin**, and
still fires `load`. That is the observable shape of the protection: the embedder sees an
`<iframe>` element and gets its event, and reaching into it throws — which is what makes
the clickjacking overlay useless.

---

## ⭐ The findings

### ⚠️⚠️ A cross-origin frame's `location` was readable — and that is not a CSP bug

Chasing `frame-ancestors-star-allow-crossorigin` turned up a hole in something much
older than CSP.

`contentDocument` has always been guarded for cross-origin frames. **`contentWindow`
never was.** Any page could embed any site and read back where that frame had ended up:
whether a session was live, which account, which order number, which article. The
same-origin policy is not a CSP feature — it is the floor everything else in that file
stands on, and this was a hole in the floor.

The WPT file that found it says so in its own comment: *"we can't distinguish blocked URLs
from allowed cross-origin URLs due to the same-origin policy"* — the test is written
entirely around the assumption that reading into a cross-origin frame **throws**.

### ⚠️⚠️ The opacity belongs to the HANDLE, not to the window

The first fix made the frame window's `location` throw. It passed the test and it was
wrong.

Obscura runs every frame in **one JavaScript realm**, so the object an embedder receives
from `contentWindow` is the *same object* the framed page's own scripts call `window`.
Make that object's `location` throw and you have not implemented the same-origin policy —
you have broken the framed page, which is entitled to read its own URL and is usually the
only code that ever does.

So the wall goes on the handle: `contentWindow` returns `_makeOpaqueWindowHandle(...)`, a
real object carrying exactly the cross-origin window surface — `postMessage`, `closed`,
`length`, `frames`, `top`, `parent`, `blur`/`focus`/`close` — and everything else throws.

This is the same shape as Quest #521's biggest find (*the automation channel is not the
page*): **when one realm has to model two principals, the distinction lives in the
reference, not in the object.**

### ⭐ Reading a cross-origin `location` throws; assigning one navigates

That asymmetry is the whole same-origin policy in one property. An embedder may **send** a
frame somewhere and may not **find out** where it already is. A property that threw for
both would break every page that steers its own iframe — an OAuth popup, a payment frame,
a docs viewer.

### ⚠️⚠️ The embedder must hear nothing

The first working version reported the violation at the **parent** document — which is
where a global report helper naturally puts it, and which is a security bug.

Every other CSP violation fires `securitypolicyviolation` at the document that broke the
rule. This one belongs to the **framed** document, whose policy it is; from that policy's
point of view the framing page is the *suspect*. Firing the event at the parent hands an
attacker a reliable oracle for **"is this site framable?"** — the exact question
`frame-ancestors` exists to stop them answering.

So: the endpoint named by the policy gets its report, and the page gets silence.
(`frame-ancestors-none-block` asserts precisely this: *"No securitypolicyviolation event
should be raised in the parent."*)

### ⭐ A source expression with a path matches no ancestor at all

`frame-ancestors https://site.example/some/path` must **block**, not behave like the
origin the author probably meant.

The check compares **origins** — an ancestor is not a URL you fetch, it is a document you
are inside, and it has no path as far as this directive is concerned. Quietly widening a
path expression to its origin would silently grant framing rights the author never wrote.
`frame-ancestors-path-ignored.window.js` tests both halves: the path form blocks, and the
same policy without the path allows.

### ⭐ A `frame-ancestors` overrides `X-Frame-Options` entirely

When both headers are present, the modern one wins **outright** — not "the stricter of the
two". The CSP header is the author's considered answer; the XFO header is very often what
their proxy or framework adds. Honouring both would break exactly the migration the
override was written to make possible.

### ⚠️ A `<meta>` policy still cannot say this

`frame-ancestors` stays in `_CSP_META_IGNORED`. The check happens on the **response**,
before a document exists — by the time markup is parsed, the framing decision was made
long ago. Honouring it from markup would let a policy claim an authority it never had.

---

## Results

| Test | Before | After |
|---|---|---|
| `frame-ancestors-self-block` | 0/1 | **1/1** |
| `frame-ancestors-self-allow` | 1/1 | 1/1 |
| `frame-ancestors-none-block` | 1/2 | **2/2** |
| `frame-ancestors-url-block` | 0/1 | **1/1** |
| `frame-ancestors-url-allow.sub` | 1/1 | 1/1 |
| `frame-ancestors-path-ignored.window` | 0/1 | **1/1** |
| `frame-ancestors-overrides-xfo` | 1/2 | **2/2** |
| `frame-ancestors-star-allow-sameorigin` | 1/1 | 1/1 |
| `frame-ancestors-star-allow-crossorigin` | 0/1 | **1/1** |
| `report-blocked-frame.sub` | 0/1 | **1/1** |
| `report-only-frame.sub` | 0/1 | **1/1** |
| `frame-ancestors-from-serviceworker.https` | 0/1 | **1/1** |
| **total (12 flat files)** | **4/11** | **14/14** |

---

## ⛔ Honest caps

### ⚠️ The suite hard-codes `https://wpt.live:8443`, and that changes what is measured

`frame-ancestors-test.sub.js` sets `SAMEORIGIN_ORIGIN = "https://wpt.live:8443"` — the
WPT standard TLS port, which is what `wptrunner` serves on. Our runner's default base is
`https://wpt.live` (port 443).

**Every "same-origin" frame in this directory is therefore cross-origin to the page under
test**, and the allow-cases fail for a reason that has nothing to do with the engine.
`frame-ancestors-url-allow.sub` demonstrates it exactly: **0/1 on `:443`, 1/1 on `:8443`,
same binary**. `scripts/wpt-csp-dark-probe.txt` now carries full `:8443` URLs for this
directory, with the reason written above the list.

*A test measured against the wrong origin is not measuring the engine.*

### ⛔ The twenty-two nested files stay red — iframe documents share the page's realm

`frame-ancestors-nested-*` (22 files) all time out. They load
`support/frame-in-frame.sub.html` into a frame, which loads **its own copy of
`testharness.js` and `testharnessreport.js`**, runs its own `async_test`, injects a
second frame, and relays the result up by `postMessage`.

Obscura has one JavaScript realm for all frames, so a second `testharness.js` inside a
frame collides with the top-level harness rather than standing beside it. This is the
same architectural cap that keeps `iframe` documents from having their own layout, and it
is not a CSP problem — the flat files prove the directive itself is right.

`frame-ancestors-sandbox-same-origin-self` fails for the same reason.

### Also open

- The blocked frame fires **no** `securitypolicyviolation` event anywhere. A real browser
  fires one inside the blocked frame, where nobody outside can see it; we have no document
  there to fire it at. The `report-uri` report *is* sent.
- Redirect hops are not re-checked against the ancestor chain.
- `X-Frame-Options: ALLOW-FROM` is ignored (obsolete, and no browser honours it).

## Next

The nested files, the `inheritance/` directory and `inside-worker/` all queue behind the
same thing: **a frame document that is a real document**. That is the largest single item
this arc leaves behind, and it is now named by three separate directories.
