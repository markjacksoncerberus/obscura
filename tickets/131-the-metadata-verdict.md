# Quest #131 — The Metadata Verdict

**Realm:** `html/dom/reflection-metadata.html` (the metadata-element reflection
suite — `link`, `meta`, `base`, `style`, `script`, `title`, `head`, `html`).
**Result:** `reflection-metadata` **2282/3110 → 2994/3110 (+712)**. Zero regressions.
**Where:** `crates/obscura-js/js/bootstrap.js` only (no Rust).

## The gap

Quest #130 unlocked the *global* HTMLElement reflectors (`title`/`dir`/`hidden`/…)
on `Element.prototype` and a first batch of element-specifics, lifting
`reflection-misc` to 4709/4877. The same primitive raised every sibling
`reflection-*` suite, but those suites still had their *own* element-specific
content-attribute reflectors unimplemented. The metadata suite — which exercises
`<link>`, `<meta>`, `<base>`, `<style>`, `<script>` — sat at **2282/3110 (73.4%)**
because a cluster of metadata-element IDL attributes still returned `undefined`:

- `link.as` / `link.media` / `link.hreflang` / `link.rev` (and the obsolete `rev`)
- `referrerPolicy` (shared by `<a>`/`<area>`/`<img>`/`<iframe>`/`<link>`/`<script>`)
- `media` (`<link>`/`<style>`/`<meta>`/`<source>`), `scheme` (`<meta>`, obsolete),
  `target` (`<base>`/`<a>`/`<area>`/`<form>`), `nonce` (global)
- `meta.content` — overloaded against the already-implemented
  `template.content` (the template-contents `DocumentFragment`).

## The fix

All additive in `bootstrap.js`, riding the table-driven reflection machinery
#130 established on `Element.prototype` (so each reflector is inert on elements
that don't own the attribute — the harness only asserts owning elements, exactly
as #130 relied on).

1. **Two enum reflectors** added to `__reflectedEnumAttrs`:
   - `as` → `as` (`<link>`-only; keyword set fetch/audio/document/embed/font/
     image/manifest/object/report/script/sharedworker/style/track/video/worker/
     xslt). Missing/invalid default `""`, which the getter already returns.
   - `referrerPolicy` → `referrerpolicy` (keywords include `""` itself, plus
     no-referrer / no-referrer-when-downgrade / same-origin / origin /
     strict-origin / origin-when-cross-origin / strict-origin-when-cross-origin
     / unsafe-url). `""` is both a valid keyword and the missing/invalid default.

2. **Six DOMString reflectors** added to `__reflectedExtraStringAttrs`:
   `media`, `scheme`, `target`, `rev`, `hreflang`, `nonce` — each a plain
   `getAttribute(x) ?? ''` / `setAttribute(x, String(v))` reflector.

3. **`content` overload** — a single `Object.defineProperty(Element.prototype,
   'content', …)` replacing the template-only getter `class Element` defined.
   The template branch (`localName === 'template'`) is byte-identical to the old
   getter (lazily creates and returns `_templateContent`); every other element
   gets `meta`-style string reflection (`getAttribute('content') ?? ''`). The
   setter is a no-op on `<template>` (template.content is read-only) and
   `setAttribute('content', …)` elsewhere.

## Results

| Suite | Before | After | Δ |
|-------|:------:|:-----:|:-:|
| `html/dom/reflection-metadata.html` | 2282/3110 | **2994/3110** | **+712** |
| `html/dom/reflection-grouping.html` | 4797/5358 | 4797/5358 | 0 |
| `html/dom/reflection-sections.html` | 4890/5604 | 4890/5604 | 0 |
| `html/dom/reflection-misc.html` | 4709/4877 | 4709/4877 | 0 |

Delta confirmed by stash-baseline (build without the change → 2282; with → 2994).

**Zero regressions** — swept qsa 1975/1975, classlist 1420/1420,
createElement 147/147, Node-properties 726/726, aria-attribute 41/41,
aria-element 22/27 (5 = standing shadow-scope cap), getElementsByTagName 19/19.
The riskiest change — the `content` overload — was stash-baselined against
`template-content.html`: **108/216 both with and without** the change (the 108
fails are a pre-existing template-fragment-via-`innerHTML` parsing gap, unrelated
to `content` reflection; the no-op `content` setter on template introduced no
new failure).

## Caps / Next

- **CAP (unwinnable here):** the bulk of the residual 116 metadata fails is the
  same URL-origin cap documented in #130 — `link.href` URL reflection (~42
  fails) expects the harness's *computed* value built from the document URL /
  origin, which the origin-less headless env reports as `undefined`, so the
  expected string is literal garbage (`"undefined//undefinedundefined…"`).
  Obscura returns the *correct* resolved URL and is marked wrong. Unwinnable
  without a real harness origin. A long tail of `.cite`/`.src`/`.data`/`.poster`
  URL reflectors across grouping/sections share this cap.
- **NEXT-BEST:** grouping (4797/5358, ~10.5% tail) and sections (4890/5604,
  ~12.7% tail) still carry their own element-specific reflectors (table-cell /
  form-control / list reflectors, plus the shared URL cap) — the same flat
  additive style keeps paying. THEN the standing leads: shadow-tree scope
  discrimination (aria-element 5 / CSSStyleSheet-constructable 6/13), namespaced
  cascade-match Rust lift (`crates/obscura-dom/src/selector.rs`,
  set-selectorText-namespace 0/5). The `reflection-text`/`-embedded`/`-tabular`/
  `-obsolete` files remain `meta timeout=long` could-not-run even at 280 s
  (harness/size limit, pre-existing) — they benefit from this primitive but
  can't be measured.
