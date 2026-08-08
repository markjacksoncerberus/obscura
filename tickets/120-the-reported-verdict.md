# 📣 The Reported Verdict — Quest #519: CSP violations, and the URL directives

> *A policy that blocks and says nothing is a policy you cannot debug, cannot
> monitor, and cannot roll out. Report-only mode exists so a site can turn CSP on
> without turning its own page off — and it is useless without the report.*

**Realm:** `content-security-policy` (continued from quest #518)
**Result (jointly measured with #518): 88/219 → 141/279 over 106 files, could-not-run 19 → 3.**

---

## The gap

Quest #518 taught the engine to *decide*. This one makes it *say so*.

`SecurityPolicyViolationEvent` did not exist. Neither did `report-uri` delivery,
nor the `report-only` disposition as a distinct thing from enforcement, nor any
enforcement at all for the URL-bearing directives.

That matters more than it sounds. **Report-only is how CSP actually gets
deployed.** Nobody switches a strict policy on across a live site and hopes; they
ship it in `Content-Security-Policy-Report-Only`, watch the reports for a week,
fix what breaks, and only then enforce. An engine that cannot report is an engine
on which nobody can safely *adopt* CSP — so the feature's absence propagates
outward into sites that never turn it on at all.

---

## The work

- **`SecurityPolicyViolationEvent`**, with all twelve attributes
  (`blockedURI`, `disposition`, `documentURI`, `effectiveDirective`,
  `originalPolicy`, `referrer`, `sample`, `sourceFile`, `statusCode`,
  `violatedDirective`, `lineNumber`, `columnNumber`).
- **"Report a violation"** (CSP3 §5.3). ⭐ The event goes to the **element** that
  caused it when there is one, and **bubbles** — a page can watch one listener on
  `document` and still learn which `<img>` or `<script>` tripped it, which is the
  difference between a usable report and a line in a log nobody reads.
- **`report-uri`**, POSTing an `application/csp-report` JSON body. Deliberately
  unobservable to the page: a policy that reported its own failures back into the
  page it is protecting would be handing the attacker a channel.
- **The `report-only` disposition as a real thing**: a report-only policy reports
  and **does not block**, and one document can carry both dispositions at once,
  each reaching its own decision.
- **`img-src` enforcement**, and ⭐ **a blocked image fires `error`, not silence.**
  The page has to be able to tell, because the whole point of an `onerror`
  fallback is to put something in the hole; a blocked image that fires nothing
  leaves a permanently empty box and an alt text nobody wrote.
- **External `<script src>` enforcement**, asked from Rust. ⭐ **A nonce
  authorises an external script too** — that is the entire point of nonce-based
  policies, which never have to enumerate hosts at all, and it is why the question
  needs the node id and not just the URL.

---

## ⭐ The finds

**A `*` WILDCARD DOES NOT COVER `data:`.** `*` is a wildcard over *network*
schemes only. `data:`, `blob:` and `filesystem:` carry their payload **inside the
URL**, so permitting them by wildcard would permit arbitrary inline content
through a door marked "any host". `img-src-none-blocks-data-uri` and
`img-src-full-host-wildcard-blocked` both turn on exactly this.

**⭐ A PATH ENDING IN `/` IS A PREFIX; ANYTHING ELSE MUST MATCH EXACTLY.** That is
what stops `https://cdn/lib/` from also permitting `https://cdn/library-evil` —
one character of grammar carrying the whole difference between "a directory" and
"a string that starts the same way".

**⭐ AN UNPARSEABLE URL IS NOT OURS TO JUDGE.** The check returns *allowed* rather
than guessing, and the decision is left to whatever tries to fetch it.

**⭐ A POLICY WE CANNOT PARSE MUST NOT TAKE THE PAGE DOWN WITH IT.** Every entry
point is wrapped so that a malformed policy degrades to "no policy" rather than to
a thrown exception in the middle of document load. A security feature that can
break a page by being *present* is one authors learn to remove.

---

## Results (both CSP quests together)

| file | before | after |
|---|---|---|
| `securitypolicyviolation/constructor-required-fields.html` | 0/14 | **13/14** |
| `script-src-attr-elem/script-src-elem-allowed-attr-blocked` | could-not-run | **2/2** |
| `script-src-attr-elem/script-src-elem-blocked-attr-allowed` | could-not-run | **2/2** |
| `script-src-attr-elem/script-src-attr-allowed-src-blocked` | could-not-run | **1/1** |
| `script-src-attr-elem/script-src-elem-blocked-src-allowed` | 0/1 | **1/1** |
| `generic/inline-style-allowed-while-cloning-objects.sub` | could-not-run | **19/25** |
| `img-src/img-src-none-blocks-data-uri.html` | 0/1 | **1/1** |
| `img-src/img-src-full-host-wildcard-blocked.sub` | 0/1 | **1/1** |
| `img-src/img-src-4_1.sub.html` | 1/3 | **2/3** |
| `meta/meta-img-src.html` | 0/1 | **1/1** |
| `meta/meta-modified.html` | 0/1 | **1/1** |
| `unsafe-eval/eval-scripts-setTimeout-allowed.sub` | could-not-run | **1/1** |
| `unsafe-eval/eval-scripts-setInterval-allowed.sub` | could-not-run | **1/1** |
| `unsafe-eval/…-allowed-in-report-only-mode-and-sends-report` | could-not-run | **1/2** |
| `script-src/hash-always-converted-to-utf-8/iso-8859-3` | — | **1/1** |
| `script-src/hash-always-converted-to-utf-8/iso-8859-7` | — | **1/1** |
| `generic/directive-name-case-insensitive.sub` | 1/3 | **2/3** |
| `style-src/injected-inline-style-allowed.sub` | — | **1/1** |
| `script-src/script-src-1_1.html` | 0/3 | **2/3** |

**Probe total 88/219 → 141/279 over 106 files. 26 files improved, 15 new rows
appeared (files that previously could not run at all), could-not-run 19 → 3.**

⚠️ Read the denominators: the probe's *total* grew from 219 to 279 because tests
that used to hang waiting for a violation event that never came now complete and
register their subtests.

---

## ⛔ Caps / Next

The caps from [`119-the-declared-verdict.md`](119-the-declared-verdict.md) all
stand. Additionally:

- **`report-to` / the Reporting API is parsed and inert** — only the legacy
  `report-uri` actually posts.
- **`sample` is truncated to 40 characters** but is not the spec's
  `'report-sample'`-gated value; a policy that did not ask for a sample still gets
  one.
- **`sourceFile` / `lineNumber` / `columnNumber` are always empty/zero.** The JS
  realm does not carry a script position into the gate.
- **Violations from workers, and CSP inheritance into `blob:`/`srcdoc`/`about:blank`
  documents**, are unimplemented — the whole `inside-worker` and `inheritance`
  directories are still dark.
- **The biggest single follow-up in this realm is V8's
  `ModifyCodeGenerationFromStrings`**, which lands `'unsafe-eval'` properly *and*
  finishes `trusted-types` (quest #490's cap). Two realms, one hook.
