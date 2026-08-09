# 🎨 The Cascaded Verdict — Quest #522

> **`style-src` — because a stylesheet is not decoration.**
> CSS can read the page and phone home. A policy that stops injected script and
> lets injected style through has closed the front door and left the window open.

**Realm:** `content-security-policy/style-src` (42 files). **Status:** ✅ landed.

---

## Why this directive exists

`style-src` is in the spec for reasons that have nothing to do with looks:

* an attribute selector plus a `background-image` URL **exfiltrates a CSRF token
  one character at a time**, with no JavaScript at all;
* `position: fixed; inset: 0` over a login form is a **pixel-perfect phishing
  overlay**;
* and `style=""` is the injection that **survives every sanitizer that only
  strips `<script>`** — which is most of them.

The parser and the checker for all of this already existed (#519 built
`_cspInlineAllowed`, which has understood `'style'` and `'style-attribute'` since
the day it landed). **Nothing called them.** Every `-blocked` test failed and
every `-allowed` test passed for free.

## The work

`__obscuraApplyStyleCSP()` — one sweep of the document, the first time anything
needs the answer, and only when a policy actually governs `style-src-elem` or
`style-src-attr` (so a page without CSP never walks its own tree for this):

* `<style>` → `style-src-elem`, nonce- and hash-able;
* `<link rel=stylesheet>` → `style-src-elem`, a URL;
* `[style]` → `style-src-attr`.

**A blocked style is MARKED, not deleted.** CSP stops a declaration *applying*;
it does not edit the document, and `el.getAttribute('style')` must still return
exactly what the markup said. A page that reads its own markup back and finds it
altered would be a much stranger thing to debug than one that finds its colours
missing.

## ⚠️ THE FIND: A GATE IS ONLY A GATE IF EVERY ROAD GOES THROUGH IT

The style attribute took **three** patches, and each one looked complete.

1. Skip the attribute source in `_buildCascadeUncached`. → still `2px`.
2. **The live declaration block is SEEDED FROM THE ATTRIBUTE** the first time
   anything touches `el.style` — and `getComputedStyle` itself can cause that. So
   the blocked attribute walked back in through the CSSOM. Skip that source too.
   → still `2px`.
3. `_specifiedDecl` has a **fallback that reads `el.style` directly, around the
   cascade**, for properties the cascade did not resolve. The value arrived there
   having been correctly refused twice.

One declaration, three doors. The lesson is not "check three places" — it is that
a value with more than one home needs the gate at the *value*, and if you cannot
put it there you must go and count the doors.

## ⚠️ `violatedDirective` IS `effectiveDirective`

Every `style-src` file has a second subtest asserting the violation event, and
every one of them failed on a **string**: we reported `style-src` (the directive
as the policy spelled it) where the spec and every browser report
`style-src-elem` (the effective directive). CSP3 keeps `violatedDirective` as a
historical **alias of the same value**. Reporting the declared name looks more
informative and is wrong: a report consumer grouping by that field would file
inline-`<style>` and `<link>` violations under one heading and never be able to
tell them apart — which is the one distinction the pair of names exists to make.
The declared spelling is still carried, as `declaredDirective`, for the report
body and for anyone debugging which line of the policy fired.

## Result

| file | before | after |
|---|---|---|
| `style-src-inline-style-blocked.html` | 0/2 | **2/2** ✅ |
| `style-src-inline-style-attribute-blocked.html` | 0/2 | **2/2** ✅ |
| `style-src-inline-style-nonce-blocked.html` | 0/2 | **2/2** ✅ |
| `style-src-hash-blocked.html` | 1/3 | **3/3** ✅ |
| `style-src-none-blocked.html` | 1/2 | **2/2** ✅ |
| the four `-allowed` files | 4/4 | **4/4** (held) |

**6/16 → 15/16** over the nine measured, plus `base-uri` (below).

## ⛔ Caps / Next

* **External stylesheets are not in the JS cascade at all.** `<link
  rel=stylesheet>` is fetched by the *layout* engine (Blitz), so a blocked link
  reports its violation correctly and `getComputedStyle` never saw it either way.
  `style-src-star-allowed.html` fails for exactly this reason — the `*` is
  matched correctly and the sheet still does not reach the cascade. **Not a CSP
  bug; the oldest gap in the JS computed-style path.**
* The same seam means a **blocked style still reaches layout**: the Rust DOM,
  which is what gets serialized for Blitz, keeps the markup (correctly), and
  nothing tells the layout side to ignore it. `getComputedStyle` is right;
  `getBoundingClientRect` is not.
* A genuine CSSOM write (`el.style.color = 'red'`, which CSP does **not** govern)
  on an element whose *attribute* was blocked is dropped with it. Separating them
  needs the block to remember which properties came from the markup.
* The sweep is one-shot: a `<style>` inserted after it is never checked.
