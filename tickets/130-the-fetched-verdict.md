# 130 — The Fetched Verdict

> **Quest #529** · realm: `content-security-policy` (`object-src`, `frame-src`,
> `worker-src`, `manifest-src`, `prefetch-src`)
> *Directives that parsed, understood, and never asked.*

## The gap

Quest #519 built the CSP parser: the source-expression grammar, the fifteen-deep
fallback chain, nonces, hashes, both delivery paths, the violation event. It
covered `script-src` and `img-src` and then said, in its Caps, that the rest
**"parse and fail OPEN, deliberately"** — the right call at the time, because a
half-built matcher that blocks a legal resource breaks pages, and the campaign's
rule is never to break a page a correct implementation would allow.

The parser has been correct for two quests now. The directives were still not
being asked.

That is the specific shape this campaign keeps finding, in its worst form: **a
security feature that is present, configured, reported as active, and does
nothing.** The site sends `object-src 'none'`, gets a 200, sees no violation
report — and no violation report is also what a correctly-enforced policy
produces. There is no way to tell from either side.

## The work

**One gate, at the one place every element resource goes through.**
`_loadElementResource` already handled `<link>` (every `rel`), `<object>`, and
`<img>`. It now asks `_cspResourceDirective(el)` first:

| element | directive |
|---|---|
| `<object>`, `<embed>` | `object-src` |
| `<iframe>`, `<frame>` | `frame-src` |
| `<video>`, `<audio>`, `<source>`, `<track>` | `media-src` |
| `<link rel=stylesheet>` | `style-src-elem` |
| `<link rel=manifest>` | `manifest-src` |
| `<link rel=icon>` | `img-src` |
| `<link rel=modulepreload>` | `script-src-elem` |
| `<link rel=preload/prefetch>` | `prefetch-src` |

⭐ CSP names a directive per **destination**, not per element, which is why a
`<link>` has five possible answers depending on what it says it is for.

⭐ **Ask before fetching, not after.** The request itself is the leak the
directive exists to stop. And the element still hears `error`, on a task, so a
page with a fallback shows it — the same rule #519 established for a blocked
image.

**`frame-src`** is gated in `_loadFrameFromAttributes`. A blocked frame does not
navigate; per CSP it keeps its initial `about:blank` document and fires `load`
for that, so a page framing an ad network under a policy gets an empty frame
rather than a hung one.

## ⭐⭐ `new Worker` does not throw

The first version threw a `SecurityError` from the constructor. It seemed
obviously right — there is no element to fire `error` at — and the test that
should have passed **timed out instead**.

The check happens inside *fetch a classic worker script*, so a refusal is a
**network error**, and HTML says a failed worker script fetch fires `error` at
the Worker — asynchronously, because the constructor has to return the object the
listener is about to be attached to.

> **A constructor that throws where the spec fires an event looks right and
> breaks every page that wrapped the call in a `try`/`catch` it never expected to
> reach.** The page catches an exception it has no handler for, and its `onerror`
> — the code actually written for this — never runs.

That correction alone moved two more files.

## Results

37-file probe (`scripts/wpt-csp-fetch-probe.txt`), pre/post per file:

| file | before | after |
|---|---:|---:|
| `object-src/object-src-url-blocked.html` | 0/1 | **1/1** |
| `frame-src/frame-src-blocked.sub.html` | 0/1 | **1/1** |
| `worker-src/dedicated-none.sub.html` | 0/2 | **1/2** |
| `worker-src/dedicated-worker-src-child-fallback-blocked.sub.html` | 0/1 | **1/1** |

**16/52 → 20/52, 4 files improved, 0 regressions.**

⚠️ Small, and worth being precise about why: most files in these directories test
that a resource *loads* under an allowing policy, and those need a working
`<object>`, a real worker script fetch, or a font engine — none of which this
quest touched. The rows that moved are the **blocking** rows, which is exactly
the half that was failing open, and the half where a wrong answer is a security
hole rather than a missing feature.

## ⛔ Caps / Next

* **`media-src` is wired but unobservable**: media elements already fail resource
  selection (there is no decoder), so the gate cannot change an outcome. It is in
  place for when one arrives.
* **`font-src` is not wired at all** — fonts are fetched by Blitz, inside the
  renderer, where the JS gate cannot see them. Same seam as the blocked-`<link>`
  problem in `129`; both want a CSP check on the render path's net provider.
* **`blob:` worker URLs** are not matched correctly against a source list
  (`dedicated-none` still fails its second subtest).
* **Redirect hops are unchecked** for every directive — a policy that allows the
  first URL allows wherever it leads.
* `'strict-dynamic'`, SRI, `frame-ancestors`, `sandbox` and CSP inheritance into
  workers and frames remain open, unchanged from #524.
