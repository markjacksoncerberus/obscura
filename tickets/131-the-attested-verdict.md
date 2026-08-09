# 📜 The Attested Verdict — Quest #530

> **Realm:** `subresource-integrity/` — a whole WPT realm, zero ledger rows before today.
> **Result:** `subresource-integrity/subresource-integrity.html` **33/48 → 48/48**.

---

## The gap

`integrity` was a string this browser reflected and never read.

Every `<script src="https://cdn.example/lib.js" integrity="sha384-…">` on every page
loaded whatever the CDN sent. The attribute parsed, reflected, round-tripped through
`getAttribute` — and no byte of the response was ever hashed. The author believed the
file was pinned. It was not.

That is the thirteenth *"feature that answers, and answers wrong"* this campaign has
found, and the wrong answer is the same one Content Security Policy used to give:
**"yes, this is the file you asked for."**

## Why this one matters most to the people we are building for

A page on a slow or metered connection leans **hardest** on shared CDNs. One copy of a
framework, cached across every site that uses it, is the cheapest byte on the web —
and on a second-hand phone in a place where data is sold by the megabyte, that is not
an optimisation, it is the difference between a page that loads and a page that does
not.

The whole arrangement rests on trusting a server the author does not run. `integrity`
is the one attribute that removes the trust. **And it is free**: the bytes have already
arrived, and hashing them is work the device does anyway. It is protection you get by
reading an attribute — exactly the kind that should reach the cheapest device first,
not last.

## What landed

A new `SRI-BEGIN/END` block in `crates/obscura-js/js/bootstrap.js`:

- **`_sriParseMetadata`** — SRI §3.3.2 "parse metadata". `sha256|sha384|sha512-<base64>`,
  with everything after the first `?` treated as options and ignored.
- **`_sriStrongest`** — only the strongest algorithm in the list counts.
- **`__sriMatches(integrity, bytes, corsOk)`** — the check itself.
- **`__sriNeedsCheck(nid)` / `__sriAllowsScript(nid, bodyBase64, corsOk)`** — asked from
  Rust for the markup `<script src>` path.

Wired at three seams:

| Seam | What it covers |
|---|---|
| `_loadElementResource` | `<script src>` and `<link rel=stylesheet>` inserted by script |
| `__obscuraAdoptLinkSheet` | markup `<link rel=stylesheet integrity>` (the Rust prefetch) |
| `page.rs` `execute_scripts` | markup `<script src integrity>` |

That last one is the important one. **Almost every real `integrity` attribute on the web
is in markup**, next to the CDN URL it guards — a check that only covered scripts inserted
by JavaScript would have covered the rare half.

---

## ⭐ The findings

### ⭐⭐ Only the strongest algorithm counts, and the weaker ones are not a fallback

`integrity="sha512-<wrong> sha256-<right>"` must **block**.

That reads backwards until you see what a list is *for*: an author lists several so a
browser that only knows sha256 can still check something, and one that knows sha512
checks the strong one. If a weak match could rescue a strong mismatch, an attacker who
can only forge sha256 would simply **append a sha256 token** — and every integrity
attribute on the web would be worth exactly its weakest entry.

WPT tests this in both directions: *"sha256 mismatch, sha512 match"* must load,
*"sha256 match, sha512 mismatch"* must not.

### ⭐⭐ An integrity check on an opaque response is not a check, it is an oracle

A no-cors cross-origin response is a body the page may **use** but not **read**. If we
hashed it and let the load succeed or fail accordingly, any page could learn the contents
of any cross-origin file one guess at a time — a slow but perfectly reliable read
primitive across every origin boundary in the browser.

So the spec makes the answer **blocked**, regardless of the bytes. Which is also the
reason every correctly written `<script integrity>` on a CDN carries
`crossorigin="anonymous"` beside it: without it the check cannot be performed, and a
check that cannot be performed must fail.

Four WPT subtests turn on exactly this (`Cross-origin, not CORS request, with correct hash`
→ **must not load**).

### ⭐ The promise is read at *prepare*, not when the bytes land

HTML snapshots `integrity` at "prepare a script". WPT tests the seam in both directions:

- a script appended with a **wrong** hash whose attribute is removed on the very next
  line must **still be blocked**;
- one appended with an **empty** integrity that is then set to a wrong hash must
  **still run**.

Read the attribute in the response callback instead — the obvious place — and both go
the other way, which means a page could disarm its own promise a statement after making
it. That is not a promise.

### ⭐ Anything we do not understand is ignored, not rejected

An unknown algorithm (`foo666-…`) or a value that is not base64 (`sha256-...`) is
**dropped from the metadata list**, and a list that ends up empty means *no integrity was
requested* — the resource loads.

This is deliberate in the spec and load-bearing: a page written for a future hash function
must keep working in a browser that does not know it yet, and **the only safe way to not
know is to say nothing**. Treating an unparseable token as a failed check would break
tomorrow's pages on today's browsers; treating it as a *passed* check would be worse.

### ⭐ A failed check is a network error, not a runtime one

The element fires `error`, exactly as if the file had never arrived. That is what makes
the careful page's fallback — the local copy of the library, the `onerror` that swaps in
a bundled asset — the thing that runs next. A page whose CDN was tampered with should
degrade, not die.

---

## ⛔ Honest caps

- **`subresource-integrity/signatures/`, `integrity-policy/` and `unencoded-digest/` are
  untouched.** Those are the newer Ed25519-signature drafts, a different mechanism.
- **The markup `<link>` path hashes decoded TEXT, not response bytes.** The Rust
  stylesheet prefetch (`page.rs`) decodes before handing the CSS to JS, so a stylesheet in
  a non-UTF-8 encoding would hash as its decoding. Same-origin ASCII CSS — which is
  very nearly all of it — is byte-identical, and the script path (the one that matters)
  hashes real bytes via `bodyBase64`.
- **`integrity` on `<img>` is not checked.** Newer SRI extends to images; the main suite
  does not test it and the engine does not implement it.
- **CSP's hash-source-authorises-an-external-script rule is still open.** Quest #519 named
  it as a cap ("a list containing hashes is one we cannot decide"). The digest machinery
  now exists to close it; wiring `__sriMatches` into `__cspAllowsScriptURL` is a small,
  well-scoped follow-up.

## Next

The SRI digest path and the CSP hash path now compute the same thing in two places.
Merging them closes the #519 cap and removes a duplicate — *two implementations of one
thing is a bug waiting for a delivery path* (Quest #524).
