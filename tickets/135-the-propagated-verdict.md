# 📜 The Propagated, Imported, Tagged, Provisioned & Pictured Arc — Quests #535–#539

> Five quests off the outgoing knight's "next leverage" list, in order:
> `'strict-dynamic'` (the last big fail-open in `script-src`), `@import` for the
> cascade, the two stuck `trusted-types` timer rows, a CSP hook on the render
> path's net provider (`font-src`), and the `<img>` refusal that had capped
> incremental layout since Quest #525.

Branch `engine-per-page-threads`. Measured over CDP against a `--features render`
server. **Zero regressions** proven by a 276-file pre/post sweep diffed per file
(one moved row named and proven a harness-origin artifact, below).

---

## #535 — `'strict-dynamic'`: trust is PROPAGATED, not matched

`content-security-policy/script-src/*strict_dynamic*` **16/55 → 52/55** over 22
files.

`'strict-dynamic'` was the last big fail-open in `script-src`. The old code, on
meeting the keyword in a URL directive, `continue`d — declining to block at all,
erring toward "let it load". That is the exact hole the keyword exists to close:
under `'strict-dynamic'` host sources and `'self'` **stop counting entirely**, and
what decides a script is not its URL but **how it came to exist**.

- A script the PARSER made (markup, `document.write`) must carry a matching nonce
  or hash. Without one it is blocked — and the report's `effectiveDirective` is
  `script-src-elem`.
- A script inserted BY already-trusted script (`document.createElement('script')`
  + `appendChild`) inherits that trust, **wrong nonce and all** — that is the
  propagation the keyword is named for.

The distinction lives in one flag: `_nonParserInserted`, set only on scripts, only
by `createElement`/`createElementNS`. `_cspURLAllowed` reads it; `_cspInlineAllowed`
reads it for a script built via `textContent`; `__cspAllowsScriptURL` keeps the
policy in play (instead of skipping it) so the URL gate decides by provenance.

⭐ Two whole fetch paths were **never gated at all** before this and are now: the
`appendChild`-a-`<script src>` path (the classic injection primitive) and the ES
**module** path in `page.rs` (classic scripts asked CSP; modules did not). ⭐ A
`javascript:` URI in an `<a href>` is an inline-script sink and is asked too.

⚠️ **THE FIND THAT WASN'T CSP: `window.postMessage` WAS A NO-OP STUB.** Every
`strict_dynamic` test relays its result through `simpleSourcedScript.js`, which
does `window.postMessage(document.currentScript.id, "*")`. Two bugs stood between
that and a passing test, neither in CSP:

1. **`globalThis.postMessage = function() {};`** — a page posting to itself heard
   nothing, so every relay test **timed out** rather than failed. Now a real
   `postMessage`: structured-clone synchronously (a `DataCloneError` is the
   caller's, now), a `targetOrigin` mismatch drops the message silently (that IS
   the feature), delivery on a task (the caller must be able to attach its
   listener on the next line and still hear it).
2. **`document.currentScript` was null inside an external dynamic `<script>`.** A
   dynamically-appended `<script src>` ran its body with `__currentScriptNid = -1`,
   so the helper posted `null` and the listener's `if (e.data === 'appendChild')`
   never matched. Now the external-eval path points `currentScript` at the element
   for the duration of its run (modules run it null, per spec).

> A whole realm can hang on a primitive two layers below it. `strict_dynamic` is a
> CSP feature; it was blocked by a missing `postMessage` and a wrong `currentScript`.

The three still-red rows are workers (`worker.https` shared/service worker, no
per-realm worker document here) and one module sub-row.

---

## #536 — `@import` for the CASCADE (not just the CSSOM)

`css/css-cascade/import-*` + `css/cssom/*import*` **14/81 → 62/81** over 9 scored
files.

`@import` existed as a CSSOM object with an **empty placeholder** stylesheet —
`.styleSheet` was a `CSSStyleSheet` with no rules, and the imported CSS reached
`getComputedStyle` **not at all**. `_cssSplitRules`, the flat cascade view every
computed-style read goes through, skipped every at-rule whole.

Now `_cssSplitRules` splices in the imported sheet's rules at the `@import`'s
position, and — the same seam — contributes the contents of `@media`/`@supports`
groups whose condition holds and `@layer` blocks in place. Imported text is fetched
once per absolute URL and cached; `data:` URLs decode synchronously (WPT leans on
this — the import is expected to apply within one style flush); a network arrival
bumps `_styleGen` (computed-style caches) and `_importGen` (the split-rule cache).
`CSSImportRule.styleSheet` fills its child sheet lazily from that same cache, so two
rules naming one URL get **distinct sheet objects sharing only the text** (CSSOM
requires the distinct objects).

⭐ **`@import`'s conditions** (`import-conditions.html` **0/29 → 29/29**): a
`supports(<condition>)` before the media list, evaluated by the real
`_evalSupportsCondition`. That pulled in the missing `<supports-feature>`
grammars — `font-tech()`, `font-format()`, and `at-rule()` — as **enumerated
keyword** checks (a known token is support, an unknown one is not; these are
grammars, not probes of a font engine).

⭐ **insertRule ordering** (`insertRule-import-no-index`, `layer-import`,
`cssimportrule-parent`): `@import` must precede every non-`@layer`-statement rule,
so inserting a normal rule above one — or an `@import` below one — is a
`HierarchyRequestError`, not a silent reorder. A constructed sheet refuses
`@import` outright (`SyntaxError`). Removing an `@import` unlinks its child sheet's
`parentStyleSheet`.

⛔ **Cap: cascade-LAYER ORDERING is not modelled** — a layered rule participates in
place, like an unlayered one (`layer-import` 14/24: the rows that need layer
priority still fail). That is closer to author intent than the old state (where
everything inside any at-rule was invisible) but it is not the layer cascade.

---

## #537 — the two stuck timer rows: `Object.prototype.toString.call(window)`

`trusted-types/Window-setTimeout-setInterval.html` **4/6 → 6/6**.

The two "successful Script transformation via default policy" rows failed with
`expected "WorkerGlobalScope setTimeout" but got "Window setTimeout"`. The sink
name was right; the test's own `getGlobalThisStr()` was wrong about where it was:
`globalThis.toString().split(" ")[1]` read `[object Object]`, so it decided it was
in a **Worker** and asserted the worker sink name.

One line: `Object.defineProperty(globalThis, Symbol.toStringTag, { value: 'Window' })`.
`Object.prototype.toString.call(window)` now says `[object Window]`. Feature
detection all over the platform branches on this.

---

## #538 — a CSP hook on the render path's net provider (`font-src`)

`content-security-policy/font-src/*` **2/5 → 3/5** (the two BLOCKING rows, the
security-meaningful half, both 0 → 1).

Fonts, `<link>` stylesheets, `@import`s and `url()` images are fetched by **Blitz**,
inside the renderer, through a `NetProvider` — where no JS CSP gate can see them.
`font-src 'none'` and a font that still downloaded is a policy in name only. Two
arcs named this seam; this is it.

- **blitz-traits** `Request` gained a `ResourceKind` (`Style`/`Font`/`Image`/
  `Media`/`Unknown`) — the URL alone cannot say whether bytes are about to become a
  stylesheet or a font. Stamped at all six `net_provider.fetch` sites in the fork.
- **obscura-render** grew `csp.rs`: a compiled, **enforce-only** policy that mirrors
  `bootstrap.js`'s `_cspMatchesSource` (same scheme-upgrade allowance, host/port/
  path rules) but carries only what a *fetch* needs — no nonces, hashes or inline
  logic, those never authorise a URL. Five unit tests. `ObscuraNetProvider` asks it
  **before** fetching (the request itself is the leak); a refused stylesheet gets
  empty bytes so the renderer does not wait on a load that will never come.
- The page hands its enforced policies over via a new
  `globalThis.__cspEnforcedPolicies()` (report-only excluded — it must never change
  what loads).

⭐ **A preload is governed by the directive of what it SAYS it is.**
`<link rel=preload as=font>` answers to `font-src`, `as=style` to `style-src-elem`,
etc. — otherwise preloading is a way around every resource directive at once. This
is what moved the font-src blocking rows: the tests preload the font.

⛔ **ONE MOVED ROW, PROVEN A HARNESS ARTIFACT: `font-match-allowed.sub.html`
1/1 → 0/1.** The test hardcodes `http://www1.wpt.live:80/…` and expects it to load
under `font-src www1.wpt.live:80`. Our harness serves the page over **`https://`
wpt.live**, so this is an `http` subresource on an `https` document — which CSP
(and mixed-content) **spec-correctly refuses**: a no-scheme host-source only allows
the page's own scheme, or `http`→`https`, never `https`→`http`. The pre-binary
"passed" solely because it did not gate fonts at all. Same class as the campaign's
documented `frame-ancestors :443` vs `:8443` cap — a harness origin/scheme
mismatch, not an engine regression. On an `http` origin the row passes.

⛔ Cap: `font-stylesheet-font-blocked` still `TIMEOUT` (the `url()` font inside a
fetched stylesheet needs the same kind on the CSS-`url()` fetch, which the fork
does not yet stamp).

---

## #539 — the `<img>` refusal, lifted (incremental layout keeps its speedup)

Quest #525 made layout incremental by patching whole elements into a persistent
Blitz document instead of re-parsing. It refused fifteen tags, `<img>` among them,
because a patch resolved the document **once** and could measure an image before
its bytes — and its intrinsic size — had arrived. Every arc since named narrowing
that list, `<img>` first, as the biggest remaining win.

`ResolvedDoc` now keeps the provider it laid out through, and `patch` waits on it
(bounded, 500 ms) and re-resolves — exactly as the initial layout does — so a
patched-in image is sized from its file. A **shared** resource cache means an image
the page already loaded (the common case: a gallery re-sorting, a lightbox opening)
is delivered synchronously and the loop never spins. `<img>`/`<picture>`/`<source>`
are off the refusal list (12 tags left).

**Equivalence:** a `<div>` mutated to hold `<img src=green.png>` (no explicit
dimensions) measures **100×50** via the patch path — byte-identical to the same
image in initial markup (full path) and to its true intrinsic size. `OBSCURA_LAYOUT_PROFILE`
confirms the mutation took the `patch` path, not a silent re-parse.

---

## Zero-regression proof

A 276-file sweep (the ritual list + the five quest regions), run against the
pre-arc binary and the final one and **diffed per file**:

```
before: 53601/54276  (276 files, 416 could-not-run)
after:  53689/54276  (276 files, 416 could-not-run)
23 rows improved, 1 moved down.
```

The one moved-down row is `font-match-allowed.sub.html` (§538), proven above to be
a harness scheme/origin artifact — the engine's behaviour is spec-correct where the
old behaviour was to not gate at all. Every other moved row is an improvement, and
`could-not-run` did not grow.

## ⛔ Caps / Next

* **`'strict-dynamic'` into workers** — shared/service worker rows still red (no
  per-realm worker document).
* **`@import` cascade LAYERS** — imported/`@layer` rules participate in place, not
  in layer priority order (`layer-import` 14/24).
* **`font-src` on CSS `url()`** — the fork stamps `ResourceKind` on the six element
  fetches; a `url()` font inside a fetched stylesheet is still `Unknown`
  (`font-stylesheet-font-blocked` TIMEOUT). Redirect hops on every render-path
  fetch are unchecked, same as the JS side.
* **Incremental layout** — `<video>`/`<audio>`/`<object>`/`<iframe>` still force a
  re-parse (each has a side effect a patch does not re-run); `<html>`/`<head>`
  changes still re-parse. The JSON round trip is still the largest single cost of a
  patch (#525's cap, unchanged).
