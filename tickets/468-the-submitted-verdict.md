# 📮 Scroll 468 — The Submitted & Linked Verdicts

> **Quests #476–#477** · realm `encoding/legacy-mb-*` — the ENCODE half · 2026-08-05
> The 66-file encode window: **could-not-run / 0** → **64,303 / 64,303 (100%)**
> The window those files shard into is **766,835 subtests across 815 variant files**.
> Baselines on the pre-change binary: the form files were **could-not-run** (not 0 — see below); `euckr-encode-href` **0/1000**; `gbk-encoder` **0/49**; `gb18030-encoder` **0/254**.

---

## The gap: a page must ANSWER in the encoding it was written in

Quest #475 taught the engine to *read* a legacy page. This is the other
direction, and it is the half that decides whether the page still **works**.

A Korean page from 2004 is decoded as EUC-KR. When the reader types into its
search box and presses enter, the browser must send those characters back **as
EUC-KR bytes**, because the server on the other end has been parsing EUC-KR
query strings for twenty years and will not be updated for us. Send UTF-8
instead and nothing errors: the form submits, the page loads, and the results
are empty. The user concludes the site is broken. It isn't — we are.

The same rule governs links. `<a href="?검색">` on that page carries a query in
EUC-KR too, which is why the URL standard singles the query out as **the one
component that is not always utf-8**.

## ⚠️ A form test that "scores 0" may not be scoring at all

The pre-change baseline for the 45 form files was not a low number. It was
**`testharness did not load / run`** — five for five.

`form.submit()` ignored the form's `target` and called `op_navigate`, which
navigates the **top-level page**. So the test page submitted a form into what
should have been a hidden iframe, and instead **navigated itself away**, taking
the running harness with it. No results were ever reported.

That is the same trap this campaign has now hit five separate times, in a fifth
new costume: `cookies` (a missing `test_driver` bridge), `WebCryptoAPI` (a
missing global), `wrapKey_unwrapKey` (a denominator that shrank because the
subtests did not exist), `selection` (a survey list that sampled 0.07% of the
realm) — and now **a test that destroys its own page**. The shape is always the
same: *a realm reporting no score is not a realm scoring badly.*

## The work

### Quest #476 — form submission (`bootstrap.js`, `ops.rs`)

* **`_pickFormEncoding(form)`** — HTML's "pick an encoding for the form".
  `accept-charset` is a space-separated list of **candidates** (the author naming
  which encodings their server can read), so the first label naming a real
  encoding wins; with none usable, the form submits in **the document's own
  encoding**. That fallback is the rule that makes a legacy page
  self-consistent.
* **`_formEncodeIn(s, enc)`** — the urlencoded serialiser over the bytes of that
  encoding. **A character the encoding cannot represent becomes its HTML numeric
  character reference** (`&#8364;`) before escaping, so `€` in a EUC-KR form
  arrives as `%26%2318364%3B`. Lossy, but *recoverable*: the server is told which
  character was meant instead of receiving a silent `?`.
* **`op_text_encode`** (new) — `encoding_rs`'s `encode()` implements exactly that
  numeric-reference rule, and folds the encodings with no encoder (utf-16be/le,
  `replacement`) to their spec output encoding, utf-8.
* **`form.target` now selects the browsing context.** A named `<iframe>` in the
  document takes the submission; only an absent or `_`-prefixed target navigates
  the page. This is what un-blinded the 45 files.
* `acceptCharset` and `target` gained attribute reflection — **guarded by tag
  name**, because `target` is an IDL attribute of exactly `a`/`area`/`base`/`form`
  and putting it on `Element.prototype` would make `'target' in div` wrongly true.

### Quest #477 — links, and the truth about `document.characterSet`

* **`<a>` and `<area>` had no `HTMLHyperlinkElementUtils` at all.** No `search`,
  no `hostname`, no `protocol`, no `origin` — `a.search` was `undefined`, so the
  entire href suite threw on its first line. These are not exotic: `a.hostname`
  is how a page tells its own links from outbound ones, and `a.href = x;
  a.search` is the standard way to normalise a URL without constructing one.
  All nine components plus `origin` and `toString`, installed on both prototypes.
* **`document.characterSet` was the literal string `"UTF-8"`** for the top-level
  document — a page decoded as Shift_JIS in Rust reported utf-8 to JS, so any
  form or link relying on the document fallback would have re-encoded wrongly.
  Plumbed `Page.document_charset` → `ObscuraState.charset` →
  `op_dom("document_charset")`.
* **`op_query_encode`** (new) — URL §"percent-encode after encoding" for a query.

Three details in that op that are each their own bug if missed:

* **🔍 The trail byte of a multi-byte character is often plain ASCII, and must
  stay literal.** GBK encodes U+4E02 as `81 40`, and `0x40` is `@` — outside the
  query percent-encode set. Escaping every byte gives `%81%40`, which decodes to
  the same bytes but is *not the string any other browser sends*. That single
  rule was the difference between 35/49 and 49/49 on `gbk-encoder`.
* **The unmappable escape hatch is escaped in FULL** — `%26%23<decimal>%3B`,
  even though `&`, `#` and `;` are outside the set. Written literally, `&` would
  start a new query parameter: one lost character would become a corrupt form.
* **Characters go through ONE encoder in sequence, not one encoder each.**
  ISO-2022-JP is stateful; its mode escapes belong to the run. A per-character
  encoder re-announces the mode before every character, and the run owes a
  return-to-ASCII escape at the end.

The special-scheme distinction is honoured too (`'` is escaped in a query for
http/https/ws/wss/ftp/file and not otherwise) — and it is reachable, because
ISO-2022-JP emits bytes in the `0x21–0x7E` range where `'` lives.

## Results

| Block | Files | Before | After |
|---|---|---|---|
| `*-encode-form-*` (all 5 families) | 45 | **could-not-run** | **45,000 / 45,000 (100%)** |
| `*-encode-href*` (all 5 families) | 19 | 0 / 19,000 | **19,000 / 19,000 (100%)** |
| `gb18030-encoder` | 1 | 0 / 254 | **254 / 254** |
| `gbk-encoder` | 1 | 0 / 49 | **49 / 49** |
| `big5-enc-ascii` | 1 | — | **123 / 123** |
| **Total** | **66** | **could-not-run / 0** | **64,303 / 64,303 (100%)** |

As in Scroll 467, the realm's 815 variant files are these 66 documents sharded
into 1,000-subtest slices. **The measured number is 64,303.**

## Caps / Next — honest

* **A POST into a target frame loads as a GET-shaped navigation.** The frame
  loader (`_loadIframeSrc`) has no request-body channel, so a `method=POST` form
  aimed at a frame reaches the right frame with the right URL but without its
  body. No test in this realm uses POST-into-frame; a real page would notice.
  This is the honest next piece of the form work.
* **`target` resolves against `<iframe>`/`<frame>` elements in the same
  document only** — not `_blank`, not a named window opened by `window.open`,
  not a parent or sibling context. Keywords are treated as "navigate the page".
* **The undeclared-document fallback is still utf-8, not locale-dependent**
  (carried over from Scroll 467).
* **Next leverage after this arc:** the `.any.worker.html` blind spot — every
  `.any.js` test on the platform generates a worker variant, and ours report no
  results at all. Two showed up inside this realm alone; across the platform it
  is thousands of subtests that are invisible rather than failing, which is the
  exact shape of gap this campaign has repeatedly found to be the largest.
