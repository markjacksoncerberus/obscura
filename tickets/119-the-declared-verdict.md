# 🛡️ The Declared Verdict — Quest #518: Content Security Policy, the parser

> *`grep -rn "content-security-policy" crates/ --include=*.rs` returned nothing.
> Not one line. Every site on the web that ships a policy was being read here with
> its defences silently switched off.*

**Realm:** `content-security-policy` (4,354 subtests, 1,362 files, zero ledger
rows before this quest)
**Probe:** `scripts/wpt-csp-probe.txt` (106 files across 15 directories)
**Result (with quest #519): 88/219 → 141/279, could-not-run 19 → 3, 26 files improved.**

---

## The gap

A CSP is a site telling the browser, **in advance**, which code it is willing to
run and where it is willing to fetch from. It is the single most effective defence
a site has against cross-site scripting: the attacker gets their string into the
page, and the browser declines to execute it anyway.

This engine had **none** of it. Not a partial implementation — no Rust at all, and
in the JS realm only a reader that picked the Trusted Types directives out of a
`<meta>` and ignored every other word of the policy.

**⭐ AND THE FAILURE IS INVISIBLE FROM BOTH SIDES.** The site cannot tell: it sent
the header, it got a 200, and no report arrived — but no report arrives when
nothing is blocked, either. The reader cannot tell: the page looks right, because
a page with its protection removed looks **exactly** like a page with its
protection working, right up until the day it doesn't. That is the twelfth
*feature that answers, and answers wrong* this campaign has found, and it is the
worst kind, because the wrong answer is **"yes, run it"**.

It is also **free**. CSP costs the device nothing: no download, no script, no
frame of work. It is protection you get by parsing a header — which is exactly the
kind of protection that should reach a second-hand phone on a metered connection
*first*, not last.

---

## The work

New block in `bootstrap.js` between `// ===== CSP-BEGIN/END =====`, plus header
delivery and two enforcement gates in `crates/obscura-browser/src/page.rs`.

- **The parser.** Serialized policy list → policies → directives → source
  expressions. ⚠️ A directive named twice is **ignored the second time**, and that
  is a security rule, not a tidiness one: if the later copy won, an injected
  `<meta>` could weaken a policy the server sent by repeating one of its
  directives with a looser value.
- **The fallback chain** (`script-src-elem` → `script-src` → `default-src`, and
  the other fourteen). The chain is the whole design: an author writes
  `default-src 'self'` and gets a policy for a dozen kinds of fetch they have
  never heard of, which is how a policy stays correct as the platform grows new
  ways to load things.
- **Source-expression matching**: keywords, nonces, hashes, scheme-sources,
  host-sources with `*` wildcards, ports and path prefixes.
- **Header delivery.** `Content-Security-Policy` and `-Report-Only` are collected
  off the main-document response and installed **before the first script runs** —
  a policy that arrives after the script it was meant to stop has stopped nothing.
  A header policy is the one an attacker cannot touch: it never appears in the
  markup they are injecting into.
- **`<meta>` delivery**, with both of its rules.
- **The inline-script gate**, asked from Rust by node id before the string is
  executed. This is the one gate that matters: an inline `<script>` is exactly
  what an injection produces, and *"we ran it and then noticed"* is not a security
  control.
- **The inline event-handler gate** — `<img src=x onerror=…>`, the most common
  XSS payload there is, because it needs no `<script>` tag and survives most naive
  sanitisers.
- **Nonces and SHA-256/384/512 hashes** (`op_crypto_digest` is a synchronous op,
  so no JS hash implementation was needed).

---

## ⭐⭐⭐ The finds

**A NONCE OR A HASH IN THE LIST TURNS `'unsafe-inline'` OFF.** It looks like a
contradiction and it is the most important line in the whole spec: it is how a
site ships **one** policy that both old browsers and new ones read correctly. An
old browser that does not understand nonces sees `'unsafe-inline'` and at least
runs the page; a new one ignores it and enforces the nonce. Honouring both would
enforce neither — and a policy that is enforced by nobody is the exact state this
engine was already in.

**⭐⭐ A `<meta>` POLICY GOVERNS ONLY WHAT COMES AFTER IT — AND THAT IS A RULE
ABOUT TIME, NOT ABOUT MARKUP.** In a streaming parser it is automatic: the scripts
above the tag have already run by the time the parser reaches it. **This engine
parses the whole document before it runs the first script**, so without an
explicit document-order check a `<meta>` near the bottom of `<head>` retroactively
blocked the scripts above it — which no real browser does, and which broke every
page that declares its policy after loading a library. The whole `nonce-hiding`
directory is built exactly that way. Fixed with `compareDocumentPosition`.

**⭐ THE META MUST BE A CHILD OF `<head>`.** `<head>` is the part of the document
that has finished before any of the content it governs exists; a policy found
lower down would be arriving *after* some of the page it claims to protect had
already run, and a policy that is sometimes too late is worse than none, because
the page believes it is covered.

**⚠️⚠️ `'self'` IS A URL MATCHER EVEN THOUGH IT IS QUOTED LIKE A KEYWORD.** The
first version skipped every quoted token when matching URLs — which skips the
single most common source expression on the web. The failure looked nothing like a
bug in the matcher: the page simply could not load its own scripts, `testharness.js`
never arrived, and **29 files flipped from scoring to could-not-run at once**. A
mass conversion to could-not-run is a *load-bearing* symptom, not noise.

**⭐ A HASH CAN AUTHORISE AN ATTRIBUTE ONLY WITH `'unsafe-hashes'`.** An
`onclick=` handler is a string the author can hash, but an event handler runs with
the element as its subject — so the spec makes you say out loud that you meant to
allow that, and the keyword is named to be uncomfortable to type.

**⚠️ AND THE MARKUP-HANDLER FALLBACK WAS A HOLE.** `_fireElementError` and
`_fireIframeElementLoad` compile an un-activated markup `onload`/`onerror`
attribute by `eval`ing its source directly, bypassing the handler gate entirely —
so `script-src-attr` would have stopped every handler *except the one on the
element that failed to load*, which is precisely the `<img src=x onerror=…>`
payload it exists to stop. Both now ask the same question.

**⭐ `setTimeout("…")` IS `eval` WITH A DELAY**, and CSP treats it as one: it turns
a string into code at runtime, which is the step an injection needs. Without
`'unsafe-eval'` the string form now does nothing — silently, because the timer has
no caller left to throw at.

**⭐ THE UPGRADE ALLOWANCE, IN PORT FORM.** CSP already lets `http` in an
expression match `https` in a URL, so an author who wrote `http://cdn:80` before
their site moved to https does not have to rewrite their policy. The **port** has
to follow that allowance or the scheme allowance is dead letter. It only ever goes
one way: 80 permits 443, never the reverse.

---

## ⛔ Caps / Next

Everything below **fails open** — it errs toward letting something load, which is
the status quo, and never toward breaking a page a correct implementation would
have allowed. Each is deliberate and each is a real gap.

- **`eval` and `new Function` are not gated.** Wrapping `globalThis.eval` would
  turn every *direct* eval into an indirect one and change its scope — a
  correctness regression traded for a security check. The right hook is V8's
  `ModifyCodeGenerationFromStrings`, **the same hook `trusted-types` has been
  waiting on since quest #490**. Doing it once serves both. Only the string forms
  of `setTimeout`/`setInterval` are gated today.
- **`'strict-dynamic'` is not implemented.** It changes the meaning of every other
  expression in the list; rather than approximate it, a list containing it does
  not block on URL at all.
- **SRI integrity-hash matching for external scripts is not implemented**, so a
  list containing hash sources does not block on URL either.
- **`style-src` is parsed but not enforced** — blocking a `<style>` element or a
  `style=` attribute has to reach the CSS cascade and the Blitz layout path, not
  just the CSSOM.
- **`frame-ancestors`, `sandbox`, `base-uri`, `form-action`,
  `upgrade-insecure-requests` are parsed and inert.** `frame-ancestors` in
  particular needs a decision made by the *framing* document.
- Workers, `connect-src` on `fetch`/XHR/EventSource/WebSocket, and
  `frame-src` are unenforced.
- ⚠️ `img-src/img-src-host-partial-wildcard-allowed.sub.html` reads 1/1 → 0/1.
  It asserts that `http://www.wpt.live:80/…` loads under `img-src *.wpt.live:80`
  from a document that **wpt.live serves over https** — mixed content, which CSP
  correctly refuses when the expression carries no scheme. The fixture is written
  for the local http wpt server. It was green here only because nothing was
  enforced at all.
