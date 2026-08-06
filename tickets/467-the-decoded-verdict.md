# 🈶 Scroll 467 — The Decoded Verdict

> **Quest #475** · realm `encoding/legacy-mb-{japanese,korean,tchinese,schinese}/*` — the DECODE half · 2026-08-05
> Every distinct decode file in the realm: **~0%** → **29,402 / 29,402 (100%)**
> The window those files shard into is **361,145 subtests across 389 variant files**, all of which Chrome passes.
> Baselines measured on the pre-change binary: `eucjp-decode-x-euc-jp` **2/1000**, `euckr-decode` **0/1000**, `big5-decode` **0/1000**, `sjis-decode-errors` **4/10**.

---

## Why this realm, and why it was invisible

The standing order says take the untouched realms. This one did not look
untouched — `encoding` has a row on the scoreboard from Quest #08, and
`TextDecoder` has been correct for a long time. But running the Chrome-summary
method over the whole run put **1,152,339 subtests** under `/encoding/`, more
than any other realm on the platform, and **1,127,087 of them** live in
`legacy-mb-*`: the Japanese, Korean, Traditional and Simplified Chinese legacy
encodings.

We scored **2 / 1000** on the first one measured.

This is not a footnote realm. It is the web that Japan, Korea, Taiwan and China
actually wrote between about 1995 and 2010, and an enormous amount of it is
still up and still linked: university course pages, government forms, local
library catalogues, the archives of newspapers that have since closed. A browser
that cannot decode EUC-KR does not render those pages *badly* — it renders every
single character as `�`. The page is not degraded, it is gone.

And it is gone specifically for the people this project exists for. A reader on
a new laptop in Seoul does not care, because they read the modern UTF-8 mirror.
The person who lands on the 2004 original is the one following an old link, on
an old machine, from a search result — and that is exactly the reader we said we
would not leave behind.

## The gap

`TextDecoder` was never the problem. **Document loading was.**

Obscura's iframe navigation did this:

```js
const html = await resp.text();
```

`Response.text()` is *specified* to always decode UTF-8. That is correct for
fetch — a `Response` is data, and the fetch standard says utf-8. But a
navigation is not a fetch of data, it is the load of a **document**, and a
document says what encoding it is written in. HTML has an entire algorithm for
this (§13.2.3.2, "encoding sniffing"), and we ran none of it.

So an iframe served with `Content-Type: text/html; charset=x-euc-jp`, whose
markup opens `<meta charset="x-euc-jp">`, was decoded as UTF-8. Every two-byte
character became two U+FFFDs:

```
assert_equals: expected "§" but got "��"
```

…998 times per file, across 389 files.

**🔍 The lesson worth carrying: `Response.text()` is the wrong tool for a
document, and it is wrong in a way that looks right.** It returns a string. It
does not throw. Every test that only checks "did the frame load" passes. The
only thing that reveals it is looking at a character.

## The work

`crates/obscura-js/js/bootstrap.js` — the encoding sniffing algorithm, and the
navigation path made to use it.

* **`_documentEncodingFor(bytes, contentTypeHeader)`** — confidence order: a BOM
  (byte-level and unambiguous, so it outranks every declaration), then the
  transport charset from `Content-Type`, then a `<meta charset>` prescan of the
  first 1024 bytes, then the fallback.
* **`_decodeDocumentBytes`** returns `{text, encoding}` — the encoding is kept
  because two other things need it: `document.characterSet`, and the form/link
  serialisation that Quests #476–#477 build on.
* **`_loadIframeSrc`** now takes `resp.arrayBuffer()` and the `Content-Type`
  header instead of `resp.text()`.
* **`_IframeDocument.characterSet`** was the literal string `'UTF-8'`. It now
  reports what the bytes were really decoded with.
* Rust-side, `obscura_net::detect_encoding` gained the BOM check and is exported,
  so the top-level path agrees with the frame path about what a document is.

The prescan and the label table already existed (built for XHR in Quest #08 and
#31) and needed no changes. **The whole realm was one wiring gap.**

Two spec details that are load-bearing:

* **A `<meta charset>` naming utf-16 means utf-8.** The algorithm rewrites it,
  and it is not a quirk: the declaration arrived as ASCII bytes, so the document
  has already disproved its own claim to be utf-16.
* **A label resolving to the `replacement` encoding decodes the WHOLE document
  to a single U+FFFD.** Those labels (ISO-2022-CN, HZ-GB-2312) name encodings in
  which ASCII-looking bytes can be re-read as markup — honouring them is an XSS
  vector, so refusing to render is the *secure* answer, not a lazy one.

## Results

Every distinct decode file in the realm, one variant each (38 files):

| Family | Files | Result |
|---|---|---|
| `legacy-mb-japanese/euc-jp` | 4 | **100%** (3 × 1000/1000, errors 11/11) |
| `legacy-mb-japanese/shift_jis` | 9 | **100%** (8 × 1000/1000, errors 10/10) |
| `legacy-mb-japanese/iso-2022-jp` | 3 | **100%** (2 × 1000/1000, errors 8/8) |
| `legacy-mb-korean/euc-kr` | 11 | **100%** (10 × 1000/1000, errors 8/8) |
| `legacy-mb-tchinese/big5` | 7 | **100%** (6 × 1000/1000, errors 8/8) |
| `legacy-mb-schinese/gb18030` + `gbk` | 2 (+2) | **275/275**, **82/82** |
| **Total measured** | **36 loaded** | **29,402 / 29,402 (100%)** |

The realm's 389 variant files are the same 38 documents sharded into 1,000-subtest
slices by `subset-tests.js`; each distinct file is measured above at 100%. A full
389-file sweep is ~4 hours of page loads and was not run — **that number is
therefore stated as the measured 29,402, not as 361,145.**

## Caps / Next — honest

* **`gb18030-decoder.any.worker.html` and `gbk-decoder.any.worker.html` are
  could-not-run.** That is the worker realm, not this one: `.any.worker.html`
  variants do not report results here at all. Worth a quest of its own — it is a
  systematic invisibility across every `.any.js` test on the platform.
* **The undeclared-document fallback is utf-8, where the spec says
  locale-dependent (windows-1252 for an `en` locale).** No test in this realm
  depends on it, and changing it risks every UTF-8-without-a-declaration page in
  the suite. Left deliberately, and named here so it is not mistaken for an
  oversight.
* **Only the iframe path was changed.** The top-level navigation already decoded
  correctly in Rust; what it did *not* do was tell JS which encoding it used, and
  that is Quest #477.
