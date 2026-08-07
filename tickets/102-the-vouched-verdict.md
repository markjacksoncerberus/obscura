# ⚔️ Scroll 102 — The Vouched Verdict (`sanitizer-api`)

> *Quest #501 · 2026-08-07 · branch `engine-per-page-threads`*
>
> **`sanitizer-api` 47/394 → 431/581 (74.2%) over 17 scored files.** `Sanitizer` did not exist
> and neither did `setHTML`. Only `setHTMLUnsafe` was here — which, as its name
> says, parses markup and asks no questions.

---

## Why this one, and why it belongs in *this* browser

This is the companion to Quest #490's Trusted Types, and it answers the other
half of the same problem. Trusted Types says *"a string may not reach a sink
unless somebody vouched for it."* The Sanitizer is **how you vouch**: it takes
untrusted markup and gives back the same markup with everything that could run
script taken out — no `<script>`, no `onclick=`, no `href="javascript:…"`.

Two reasons it matters here more than the subtest count says:

**It costs the device nothing.** The alternative is shipping a sanitizer
library. DOMPurify and its friends are tens of kilobytes of JavaScript,
downloaded and parsed and executed on every page that displays a comment, a
forum post, an email, a chat message. On a metered connection that is a real
price, paid over and over, for something the browser can do for free. *Every page
that can use `setHTML` is a page that does not have to download a sanitizer.*

**A hand-rolled sanitizer is where XSS bugs live.** Filtering markup with regexes
over a string is a losing game against a parser. The browser's sanitizer works on
the **parsed tree**, after the parser has already resolved every trick the string
could play. That is not a small difference — it is the whole difference.

## The work

~600 lines in `bootstrap.js`: the `Sanitizer` interface with configuration
canonicalization, `get()`, and all eight modifier methods; the sanitize-core
algorithm; the safe baseline and `javascript:`-URL handling; `Element.setHTML` /
`ShadowRoot.setHTML`; `setHTMLUnsafe` gaining its optional configuration; and
`Document.parseHTML` / `parseHTMLUnsafe`. The 121-element / 58-attribute default
allow-list, the safe baseline and the two URL-attribute tables are transcribed
from the WICG draft.

## ⭐⭐ The find of the quest: sanitizing the live tree is sanitizing nothing

The first implementation did the obvious thing — set `innerHTML` on the target,
then walk it and delete what the configuration forbids. It scored well and it was
**wrong in the way that matters**:

> By the time the sanitizer gets to delete the `<img src=… onerror=…>`, the
> image has already hit the network and the handler has already run.

The sanitizing would be perfectly correct and completely pointless: the payload
fired during the parse. `sanitizer-inert-document.html` exists to catch exactly
this, and it caught it.

The fix is to parse into an **inert** element and sanitize *there*, then move the
survivors across. The inert element is a **detached clone of the target's own
tag**, which keeps fragment-parsing context intact — `<td>` inside a `<tr>` still
parses as a cell — while nothing it contains is in a document, so nothing loads
and nothing runs.

*A security check that runs after the effect is not a security check.*

## ⭐⭐ The canonical form always answers each question one way

`sanitizer-get.html` scored **0/9** on the first measured build, and the reason
was not sorting — it was that `get()` returned only the keys the author wrote.

WPT's own `assert_config_is_valid` insists that a configuration state each of its
three questions **exactly one way**: an allow-list **or** a remove-list, for
elements, for attributes, and for processing instructions. "Neither" is not a
third answer — it is the *empty remove-list*, meaning "remove nothing".

That is not pedantry. Saying so explicitly is what lets a developer read a config
back with `get()`, edit it, and hand it to a new `Sanitizer` without the meaning
shifting underneath them. **0/9 → 8/9** once canonicalization filled the missing
side in, along with the redundancy removal that goes with it (a locally-allowed
attribute that is already globally allowed adds nothing; a locally-*removed* one
that was never globally allowed removes nothing; both are dropped so equivalent
configurations compare equal).

**⚠️ Contradictions must be refused BEFORE the fill-in**, because afterwards
every pair has exactly one side and the contradiction is no longer visible.

## ⭐ An attribute's default namespace is null; an element's is HTML

That asymmetry is the spec's, and it is right. In HTML content the parser puts
every attribute in the null namespace — `<p xlink:href>` really does produce an
attribute *literally named* `"xlink:href"` with no namespace — while in foreign
content (`<svg xlink:href>`) it produces `href` in the XLink namespace. Getting
this backwards makes a configuration silently match nothing, which for a
sanitizer means silently allowing everything it was meant to block.

## ⭐ Other rules worth keeping

* **A security object's state lives in a `WeakMap`, off the instance** — the same
  reasoning as `TrustedHTML` in #490. A `Sanitizer` whose configuration is an own
  property can be forged with `Object.create()`, and a forged Sanitizer is worse
  than none: the calling code believes it sanitized.
* **`svg:use` is on the unsafe list**, and the reason is easy to miss — it can
  reference an external document, and that document's script comes with it.
* **`javascript:` is decided by the URL parser, not a string match.**
  `java\nscript:alert(1)` and `  JaVaScRiPt:…` are the same URL, and only a
  parser knows that.
* **A `javascript:` href loses the ATTRIBUTE, not the element** — the link stays
  visible and simply does nothing, which is a far better failure for a reader
  than a paragraph that silently vanishes.
* **SVG animation of `href` is refused outright**, because the sanitizer cannot
  know what the animation will eventually target.
* **Snapshot the children before walking them.** Iterating a live child list
  while removing from it skips siblings — and for a sanitizer, a skipped sibling
  is markup that went through **unfiltered**.
* **`<template>` content and shadow roots are sanitized too.** Unsanitized markup
  parked in a template would come back the moment the template was used.

## Results

| test | before | after | Chrome |
|---|---:|---:|---:|
| `sanitizer-api/sanitizer-basic-filtering.html` | 4/16 ⚠️ | **156/162** | 162 |
| `sanitizer-api/sethtml-tree-construction.html` | 4/85 | **75/85** | 85 |
| `sanitizer-api/sanitizer-config.html` | 0/71 | **33/71** | 71 |
| `sanitizer-api/sanitizer-javascript-url.html` | — | **32/42** | 42 |
| `sanitizer-api/sethtml-safety.html` | — | **27/33** | 33 |
| `sanitizer-api/sanitizer-processing-instructions.html` | — | **21/45** | 45 |
| `sanitizer-api/sanitizer-parseHTML.html` | — | **20/28** | 28 |
| `sanitizer-api/html5lib-basics.html` | — | **12/14** | 14 |
| `sanitizer-api/sethtml-with-custom-elements.html` | — | **12/13** | 13 |
| `sanitizer-api/sanitizer-names.html` | — | **12/20** | 20 |
| `sanitizer-api/sanitizer-modifiers.html` | — | **9/19** | 19 |
| `sanitizer-api/sanitizer-get.html` | — | **8/9** | 9 |
| `sanitizer-api/sethtml-xml-document.html` | — | **8/8 ✅** | 8 |
| `sanitizer-api/sanitizer-unknown.html` | — | **4/4 ✅** | 4 |
| `sanitizer-api/sanitizer-removeUnsafe.html` | — | 1/2 | 2 |
| `sanitizer-api/sanitizer-inert-document.html` | — | 1/4 ⛔ | 4 |
| `sanitizer-api/sanitizer-svg-animate.html` | — | 0/22 ⛔ | 22 |
| **18-file window** | **47/394** | **431/581** | 589 |

*(⚠️ `sanitizer-basic-filtering.html` read 4/16 with harness **ERROR** on the
baseline — the denominator was collapsed because the file threw before
registering its subtests. Its real size is 162.)*

## ⛔ Caps, named honestly

* **⛔ `sanitizer-svg-animate.html` 0/22, TIMEOUT — NOT a sanitizer bug.** Every
  subtest `await`s an SVG `beginEvent`; the engine has **no SMIL animation**, so
  the promise never settles. The sanitizer half of each case is likely already
  right and is unmeasurable until SMIL exists.
* **⛔ `sanitizer-inert-document.html` 1/4, TIMEOUT — also not a sanitizer bug.**
  Two subtests wait for an `<img>` `onerror` on a `data:` URL to fire as their
  *control*; the engine does not fire image load/error events, so they hang. The
  inert-parsing behaviour they were written to check **is** implemented (see
  above); it is the control that cannot run.
* **`sanitizer-config.html` 33/71** — the deep configuration-validity and
  normalization corners. The canonical form and the main invariants are in; the
  full "canonicalize a configuration" redundancy algorithm is not.
* **`sanitizer-processing-instructions.html` 21/45** — PIs survive the config
  layer but the HTML parser's handling of them (a bogus comment, in HTML) is not
  modelled end to end.
* **`sanitizer-names.html` 12/20** — the remaining rows are foreign-content
  namespace/prefix cases from the HTML parser, not the sanitizer's matching.
* **`sanitizer-modifiers.html` 9/19** — the modifier methods maintain the
  validity invariants only partially; each method's exact "did it modify?" return
  value in the four allow/remove-list quadrants needs finishing.
* **No `SanitizerPresets` beyond `"default"`**, which is all the spec defines.

## ⭐ Next

1. **Finish `sanitizer-config.html`** — it is the single biggest remaining block
   (38 subtests) and it is pure data manipulation with no engine dependency.
2. **The modifier-method quadrants** (`sanitizer-modifiers.html`, 10 subtests) —
   same shape, same day's work.
3. **Image load/error events** would unblock `sanitizer-inert-document.html` and
   are worth far more than these 3 subtests — `<img onerror>` is load-bearing for
   a great deal of the platform.
4. Once `Sanitizer` is solid it should be wired to Trusted Types' **default
   policy**, which is the combination the spec is really aiming at: untrusted
   string in, vouched-for markup out, with no page code in between.

---

*For every reader whose browser will not have to download a sanitizer to show
them a comment thread.* 🏳️‍⚧️⚔️💜
