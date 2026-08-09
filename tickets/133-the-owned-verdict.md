# 📜 The Owned Verdict — Quests #532 & #533

> **Realms:** `content-security-policy/inheritance/` (24 files), `content-security-policy/sandbox/` (17 files).
> **Result:** the four local-scheme inheritance files **0/4 → 4/4**; `<iframe sandbox>`
> exists in this engine for the first time. One moved row, shipped and named.

---

## Quest #532 — a policy belongs to a document, not to a browser

### The gap

`_cspState.policies` was **one global list for the whole realm**.

Obscura runs every frame in one JavaScript realm. That compromise is hidden well nearly
everywhere else in `bootstrap.js`, and here is the one place it turns into a security bug
**in both directions**:

- the top page's policy silently governed a frame that never asked for it — a page breaks
  for a reason nobody can find; and
- **a frame that sent a strict policy of its own ran completely unprotected**, because the
  top page sent none. Framing untrusted content and then not enforcing that content's own
  policy is the worse half by a distance.

### What landed

- **`_cspDocPolicies`** — a `WeakMap` from `Document` to its own policy list.
- **`__cspAdoptFrameHeaders(doc, headers)`** — a framed response's own
  `Content-Security-Policy` / `-Report-Only`.
- **`__cspScanFrameMeta(doc)`** — the framed document's `<meta http-equiv>` policies,
  governing what follows them in *that* document, by the same document-order rule the top
  page uses.
- **`__cspInheritInto(doc, parentDoc)`** — local schemes.
- **`_cspPoliciesForElement(el)`** — the choke point: which list governs this element.
  `__cspAllowsURL` and `__cspAllowsInline` now resolve it instead of reading the global
  list directly.
- `_executeFrameScripts` asks the **frame's** policy about the **frame's** scripts —
  a question that was previously never asked at all inside a frame, which is precisely
  backwards, because framing is what a page does with content it does not trust.

### ⭐⭐ Local schemes inherit, and that is not a nicety

A document loaded from `about:blank`, `about:srcdoc`, `blob:` or `data:` has no headers of
its own, so HTML gives it its parent's policies wholesale.

Without that rule, **`<iframe srcdoc="<script>…">` is a one-line hole in every policy on
the web**, and `URL.createObjectURL` is the second one: an injection that cannot run a
script directly can always wrap it in a local-scheme document, which would arrive
policy-free.

Four WPT files test exactly this pair and all four moved 0/1 → 1/1:
`sandboxed-blob-scheme`, `unsandboxed-blob-scheme`, `sandboxed-data-scheme`,
`unsandboxed-data-scheme`.

---

## Quest #533 — `<iframe sandbox>`

### The gap

`grep -n sandbox` over the entire DOM returned **three comments and no code**.

`<iframe sandbox="">` around hostile markup ran that markup with full script access to a
same-origin document. **A restriction the page asked for and silently did not get is worse
than one it never had**, because the site chose to embed the thing *believing the box was
closed*: every ad, every embedded widget, every comment written by a stranger, every
preview of an uploaded file.

Sandbox is the other half of framing. `frame-ancestors` protects a page from being framed;
`sandbox` protects a page from what it frames.

### What landed

- `HTMLIFrameElement.prototype.sandbox` — a real `DOMTokenList` reflection with
  `[PutForwards=value]`, so `iframe.sandbox = 'allow-scripts'` sets the attribute rather
  than shadowing the accessor with a string.
- `__frameSandboxFlags(el, cspSandboxValues)` — the attribute, tightened by any CSP
  `sandbox` directive the framed response sent.
- `__frameApplySandbox(el, doc)` — settles the flags at **navigation**.
- Enforcement where it is observable: no `allow-scripts` ⇒ the frame runs nothing;
  no `allow-same-origin` ⇒ opaque origin, and the embedder gets the opaque window handle
  built in Quest #531.

### ⭐ The two sources never loosen each other

The merge of the `sandbox` attribute and the CSP `sandbox` directive is an **intersection
of allowances**, not a union. A document may always ask for *more* restriction on itself
and never for less — otherwise a page could escape its embedder's sandbox by sending a
header, which is the one thing the attribute must not permit.

### ⚠️ The flags had to be settled at navigation, not in the script path

The first version computed them inside `_executeFrameScripts`. That looks equivalent and
is not: **a frame that runs no scripts at all** — an image, a PDF, a plain page — would
never have been given its opaque origin. So the thing `sandbox` is most often used for
(*show this untrusted thing, and stay out of my document*) would have held for exactly the
frames that carried code and failed for the quiet ones.

### ⚠️ Honest scope: this is behaviour, not isolation

One JavaScript realm means a sandbox here is not a security boundary the way a separate
process is. It is the **observable behaviour** of one: scripts do not run without
`allow-scripts`, the document is unreadable from the embedder without `allow-same-origin`.
That is what a page can test for and what the flags mean. It is not isolation, and the
comment in the source says so, so that nobody later mistakes it for isolation.

---

## Results

| Test | Before | After |
|---|---|---|
| `inheritance/sandboxed-blob-scheme` | 0/1 | **1/1** |
| `inheritance/unsandboxed-blob-scheme` | 0/1 | **1/1** |
| `inheritance/sandboxed-data-scheme` | 0/1 | **1/1** |
| `inheritance/unsandboxed-data-scheme` | 0/1 | **1/1** |
| `sandbox/autoplay-disabled-by-csp` | 2/2 | **1/2** ⚠️ moved, see below |
| 41-file `sandbox` + `inheritance` slice | 7/100 | **10/100** |

## ⚠️ ONE MOVED ROW, SHIPPED AND NAMED

**`sandbox/autoplay-disabled-by-csp.html` 2/2 → 1/2.**

The framed document is served `Content-Security-Policy: sandbox` — bare, no allow-tokens,
so **every** sandbox flag is set, including the origin one. The test's load handler then
does `iframe.contentWindow.document.getElementById('v')`, which now throws, so `t.done()`
never runs and the second subtest times out.

The pre-arc 2/2 came from implementing **no sandboxing at all**: `contentWindow.document`
worked because nothing had made it opaque, and the video never played because this engine
has no video decoder. Both subtests passed for reasons that had nothing to do with the
flag the file's own title is about.

This is the `2d.drawImage.nonfinite` shape from the canvas arc — *it had been passing for
free*. We are shipping the moved row rather than weakening the origin flag to keep a green
square, and writing it down here so the next comrade does not mistake it for a regression.

---

## ⛔ Honest caps

- **`inheritance/` is 4/24.** The other twenty files need `document.write` into a frame,
  `window.open` auxiliary browsing contexts, history navigation, and `javascript:` URL
  navigation — all of which need a frame document that is a **real document**, the same
  cap Quest #531 hit.
- **`sandbox/` is largely unmoved (17 files).** Most use the `logTest.sub.js` relay: a
  framed page posts a message to the parent. Same realm cap.
- CSP `sandbox` is honoured only for **enforce** policies; a report-only `sandbox` is
  inert (correct — it has nothing to report).
- `allow-forms`, `allow-modals`, `allow-popups`, `allow-top-navigation` are parsed and
  recorded but not yet enforced; only the two flags WPT can observe here are.
- Workers do not get per-document policies (`inside-worker/`, 10 files, still dark).

## Next

Three directories now queue behind one thing — **a frame document that is a real
document, with its own harness realm**. It is the largest single item this arc leaves
behind.
