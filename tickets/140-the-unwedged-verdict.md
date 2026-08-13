# 🏰 Scroll #140 — The Unwedged, Redirected, Reflected, Minted, Filtered & Attributed Verdict (Quests #560–#569)

> **Banner taken 2026-08-13, third sortie.** Ten quests: the three page-load
> wedges (top pointer from #555–#559), the redirect truth `Response` had never
> told, dynamic `<meta>` CSP, blob: element resources, the css-conditional
> testharness region to 103/103, ::first-line/::first-letter property
> filtering, the `CSSPseudoElement` interface, ::marker's outside display,
> `postMessage`'s source identity, and Web Animations on pseudo-elements.

## Quest #560 — the three wedges were ONE while-loop, and the loop was ours

`to-javascript-url-script-src`, `frame-src-blocked-path-matching`,
`frame-src-redirect` — all three wedged the page thread at load (~100% CPU,
`page.goto` never resolved), and every CSP batch they sat in lost their whole
chunk to the spin.

**The thread dump was the quest.** ptrace is blocked on this box
(`ptrace_scope=1`, no sudo) and `perf` too (`perf_event_paranoid=4`); what
worked was running the server as a GDB CHILD (`gdb -batch -ex run -ex 'thread
apply all bt'`) and SIGINT-ing the inferior once wedged. Three samples of the
spinning `obscura-page-pa` thread: `op_url_parse` under JS, `RegExpReplace`
under JS, `FindOrderedHashSetEntry` under JS — a JS loop doing URL parsing +
CSP matching + event dispatch per iteration.

⭐⭐⭐ **A navigation BLOCKED by CSP must not fire a fresh `load` event on a
frame that has already fired one.** The engine fired `load` for every blocked
`frame.src` assignment ("the frame is left holding about:blank and fires load
for it"), and WPT — like real pages — sets `frame.src` from inside a load
handler: blocked assignment → load → handler runs again → blocked assignment →
… an infinite synchronous-ish loop dressed as a hang. A blocked navigation
loads NOTHING; only the INITIAL about:blank of a never-loaded frame announces
itself. One captured flag (`_hadLoaded`) in `_loadIframeSrc`, honoured by the
`javascript:` branch, the frame-src branch, and the post-fetch redirect branch.
All three files unwedged in one edit: to-javascript-url-script-src TIMEOUT →
**4/4**, frame-src-redirect TIMEOUT → **1/1** (after #561), blocked-path
1 real row green (see #568), the other 2 rows = the **`:443` harness artifact**
(the suite hardcodes `https://www1.wpt.live:443`; origin serialization drops a
default port, so those rows fail in any spec-correct browser on `:443`).

## Quest #561 — a Response that never admitted it was redirected

`frame-src-redirect` needed CSP re-asked per redirect hop — and the probe
showed the re-ask COULD NOT WORK: **our fetch follows redirects internally
(SSRF-validating each hop, correctly) but reported `url` = the ORIGINAL
request URL and `redirected: false`, always.** Fetch §4.6: a Response's `url`
is the LAST url in its url list. Every page that checks `resp.redirected` or
compares `resp.url` was blind, and CSP with it.

Fix in `perform_fetch_core` (ops.rs): the final JSON carries `current_url`
(the loop variable that already tracked the hops) and
`redirected: redirects_followed > 0`; the JS `_makeResponse` call passes
`parsed.redirected` through. Then `_loadIframeSrc` re-asks `frame-src` on the
final URL when it differs — a policy that allows `/common/redirect.py` must
still refuse the cross-origin document it bounces to, or any allowed
same-origin endpoint becomes a hole through frame-src. Violation reports the
ORIGIN (navigation rule from #557). `frame-src-redirect` TIMEOUT → **1/1**
(both report-only violations + the enforced one, original AND redirected).

## Quest #562 — the meta that was never a policy, and the window.open that was never a window

`frame-src-same-document-meta` TIMEOUT → **1/1**, three roots deep:

1. ⭐⭐ **`meta.httpEquiv` and `meta.content` were not reflected IDL attributes
   at all** — `document.createElement('meta'); meta.httpEquiv = "…"` built an
   attributeless `<meta>`, so the policy the page believed it had installed
   NEVER EXISTED. (The `content` getter existed only for `<template>`.) WPT
   builds runtime CSP metas exactly this way; so do real pages.
2. **A runtime-inserted `<meta http-equiv=Content-Security-Policy>` must start
   governing RESOURCE loads too** — the script gates called
   `__obscuraScanMetaCSP()` but `__cspAllowsURL` never did, so a page that
   turned on `frame-src 'none'` mid-life kept navigating frames.
3. **`window.open(url, "framename")` targeting an existing frame is a
   NAVIGATION of that frame**, through the same gated path as
   `iframe.src = url` — implemented on the previously-stub `window.open`
   (popups still return null, which is what a popup blocker looks like).

## Quest #563 — blob: URLs for element resources

`<script src=URL.createObjectURL(blob)>` silently never ran:
`_loadElementResource` handed every URL to `op_fetch_url`, and reqwest cannot
fetch `blob:`. The in-page object-URL store (`__blobStore`) — which `fetch()`
and the worker path already consulted — now serves element loads too, on a
task (same load/error-event contract as `data:`): scripts eval, images adopt
bytes, revoked URLs fire `error`. The whole `content-security-policy/blob/`
directory is green — `blob-urls-match-blob` 0/1 → **1/1**, the other five
files 1/1 (workers already handled blob: via `_workerFetchScriptSync`).

## Quest #564 — css-conditional's testharness half, finished

The region is 84 REFTESTS (honest cap: render-compare) + 6 testharness files.
The two imperfect ones:

* `at-supports-at-rule-serialization` 23/26 → **26/26**: css-conditional-5
  `at-rule()` serializes its at-keyword CANONICALLY — whitespace dropped,
  ident unescaped and minimally re-escaped (`at-rule( @supports )` →
  `at-rule(@supports)`, `@--\31 23` → `@--123`, while `@\31 23` keeps its
  escape because a leading digit needs one). `_normalizeAtRuleFns` at
  CSSSupportsRule construction.
* `match-container.tentative` 0/8 → **8/8**: `Element.matchContainer(query)`
  (csswg-drafts#13551) — a LIVE `.matches` getter over `_cqRuleApplies(el,
  [query])`, so container resizes, custom-property flips, and re-parenting are
  all visible without an event model. #550's machinery made this a 12-line
  method.

css-conditional testharness: **103/103 over all 6 files.**

## Quest #565 — ::first-line and ::first-letter accept a SUBSET of properties

The #549 carried pointer. `::first-line { margin: 10px }` must compute as if
absent; typography/background apply; ::first-letter additionally takes
border/margin/padding/float/box-shadow. `_pseudoFilterDecls` filters the
EXPANDED longhands in the pseudo cascade branch (so a filtered shorthand drops
whole). Also unblocked: **`background-blend-mode`, `mix-blend-mode`,
`isolation`, and `box-shadow` were missing from `_GCS_DEFAULTS` entirely**
(computed "" on every element on every page), and the computed **`border`,
`border-top/right/bottom/left`, and `border-image` shorthands had no
reconstruction** (border: all-four-edges-agree × three components;
border-image: `source [slice [/ width [/ outset]]] [repeat]` with
trailing-initial parts dropped).
`first-line-allowed-properties` 88/112 → **112/112**,
`first-letter-allowed-properties` 28/36 → **36/36**.

## Quest #566 — CSSPseudoElement: the stub becomes an API

`Element.pseudo('::before')` returns a STABLE handle (identity per
element×type — the observable contract), `type`/`element`/`parent` filled, and
the 2015-era `window.getPseudoElements()` + `CSSPseudoElementList` that the
WPT idlharness file still loads. `CSSPseudoElement-identity` 0/1 → **1/1**,
css-pseudo `idlharness` 19/29 → **29/29**.

## Quest #567 — an outside ::marker is a block container

css-lists: an OUTSIDE marker computes `display: inline-block`; an INSIDE one
is an ordinary inline. The position is the ORIGINATING element's computed
`list-style-position` — inherited from the list, so it must be READ (one
`getComputedStyle(owner)` in the marker UA seat), not assumed.
`marker-display-computed` 4/8 → **8/8**; `marker-default-styles` held 32/32.

## Quest #568 — `e.source === frame.contentWindow`, the identity that routes replies

Cross-origin frame relay probe: the frame's `PASS` arrived… and the test row
still hung, because **`postMessage`'s `source` was `globalThis` no matter who
called it**, and the parent compares `e.source === frame.contentWindow` —
which for a cross-origin frame is the OPAQUE handle (#531). The source must be
the CALLER's window AS THE RECEIVER SEES IT. Narrow incumbent tracking:
`_runFrameScript`/`_runFrameProgram` set `__frameIncumbent` around frame
script execution; `postMessage` captures it AT CALL TIME and stamps
`source = frameElement.contentWindow` (the opaque handle when cross-origin)
and `origin` = the caller's origin. `frame-src-blocked-path-matching` row 1
("Cross-origin frame with allowed path loads") TIMEOUT → **pass** — the
multi-frame reply-routing pattern every embedded-widget page uses.

## Quest #569 — Web Animations reach the pseudo-elements

`el.animate(kf, {pseudoElement: '::marker'})` existed and was filtered OUT of
everything: `_waAnimatedDecls` kept only principal-box effects even when the
asker WAS a pseudo view. Now a pseudo view collects exactly the effects
declared for its type against its originating element (and a plain element
still never sees pseudo effects — a ::marker animation must not tint the list
item). Plus the marker property filter on animated declarations: `color`
animates, `opacity` does not take (css-pseudo-4 §marker-pseudo).
`marker-animate` 1/3 → **3/3**.

## ⛔ Caps / next (named honestly)

* `at-supports-NNN` (84 files) are REFTESTS — render-compare needed, same cap
  as every visual region.
* css-pseudo geometry/events/hit-testing (`CSSPseudoElement-getBoxQuads`,
  `events-on-*`, `marker-hit-testing`, `marker-computed-size`,
  `marker-intrinsic-contribution`) need pseudo-element BOXES in the render
  path — the #549-carried "pseudo-element rendering" pointer, still the
  biggest css-pseudo unlock.
* `focus-visible-originating-element` needs Tab-key sequential focus
  navigation (testdriver keyDown Tab → move focus + :focus-visible).
* `text-selection` needs Selection endpoints inside pseudo content.
* `pseudo-replaced-elements` needs `::before`/`::after` box generation
  decisions on replaced elements (render).
* Two navigation files (`javascript-url-navigation-evaluated-to-string-…`,
  `to-javascript-parent-initiated-check-csp-order`) need `window.open` POPUPS
  + the report-cookie infrastructure (`checkReport.sub.js`) — out of reach in
  one realm without a second top-level context.
* `input-element-pseudo-open` is `.optional` (UA-specific `::open`).
* The `frame-src` `:443` rows are the documented harness artifact (suite
  hardcodes `:8443`-era URLs; a spec-correct browser fails them on `:443`).

## Zero-regression proof

496-file ritual list (`scripts/wpt-ritual.txt`), PRE binary (stash of
a6c7cc4 + this arc's two files) vs POST, per-file diff — see the chronicle
entry and `WPT_PROGRESS.md` for the numbers recorded at land time.
