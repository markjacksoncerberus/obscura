# Quest #132 — The Presentational Verdict

**Realms:** `html/dom/reflection-sections.html` and `html/dom/reflection-grouping.html`
— the section-element (`<body>`, `<h1>`–`<h6>`, `<hgroup>`, `<article>`, …) and
grouping-element (`<p>`, `<hr>`, `<pre>`, `<ol>`, `<ul>`, `<li>`, `<div>`,
`<blockquote>`, …) reflection suites.
**Result:**
- `reflection-sections` **4890/5604 → 5604/5604 (+714, 100%)**
- `reflection-grouping` **4797/5358 → 5314/5358 (+517, 99.2%)**
- **Combined +1231.** Zero regressions.

**Where:** `crates/obscura-js/js/bootstrap.js` only (no Rust).

## The gap

Quests #130/#131 unlocked the global + metadata-element reflectors on
`Element.prototype`. The sibling sections/grouping suites still had their own
*obsolete presentational* content-attribute reflectors unimplemented, so a large
cluster of IDL attributes returned `undefined`. By failure bucket:

**Sections (714 fails):**
- `<h1>`–`<h6>`.`align` (6 × 38) — DOMString
- `<body>`.`text`/`link`/`vLink`/`aLink`/`bgColor` (5 × 38) — `[LegacyNullToEmptyString]` DOMString
- `<body>`.`background` (38) — plain DOMString
- `document.dir` (68) — enum reflecting the document element's `dir`
- `document.fgColor`/`linkColor`/`vlinkColor`/`alinkColor`/`bgColor` (5 × 38) —
  obsolete Document members reflecting the `<body>` element's colour attributes
  (`[LegacyNullToEmptyString]`)

**Grouping (561 fails):**
- `<p>`/`<div>`/`<hr>`.`align`, `<hr>`.`color`/`size`/`width` — DOMString
- `<pre>`.`width` (71) — `long` (default 0)
- `<ol>`.`start` (71) — `long` (default **1**)
- `<li>`.`value` (71) — `long` (default 0)
- `<ol>`.`reversed`, `<hr>`.`noShade` — boolean
- `<blockquote>`.`cite` (44) — URL (the standing URL-origin cap, see below)

## The fix

All additive in `bootstrap.js`, riding the table-driven reflection machinery on
`Element.prototype` (each reflector inert on non-owning elements — the harness
only asserts owning elements).

1. **Generic DOMString reflectors** added to `__reflectedExtraStringAttrs`:
   `align`, `color`, `background`. Each is DOMString *wherever* it is reflected
   (e.g. `align` on `<hN>`/`<p>`/`<div>`/`<hr>`/table/img — all DOMString), so a
   single generic definition is correct.

2. **Boolean reflectors** added to `__reflectedExtraBoolAttrs`: `reversed`
   (`<ol>`), `noShade` → `noshade` (`<hr>`). Unique names, generic-safe.

3. **`[LegacyNullToEmptyString]` `<body>` colours** — a new body-gated block
   (`__bodyColorAttrs` = text/link/vLink→vlink/aLink→alink/bgColor→bgcolor).
   **Gated to `<body>`** because `.text`/`.link`/`.bgColor` name *entirely
   different* IDL members on other elements (`HTMLScriptElement.text` is the
   script's text content, not the `text` attribute), so a generic definition
   would corrupt them. The setter coerces **`null` → `""`** (LegacyNullToEmptyString)
   but **`undefined` → `"undefined"`** — so it uses strict `v === null`, *not*
   loose `v == null` (which would wrongly map `undefined` to `""`; that was a real
   bug in the first pass, surfaced by the 10 `IDL set to undefined` subtests).

4. **`width`** — a single tag-dispatched accessor: `long` (default 0) on `<pre>`,
   DOMString on `<hr>` (the same content-attribute name reflects different IDL
   types, so it cannot be table-driven). Every other element keeps `width`
   `undefined` (its prior behaviour).

5. **`size`** — tag-gated to `<hr>` (DOMString); `<input>`/`<select>`.`size` is an
   `unsigned long` we don't reflect here, so gating leaves them untouched.

6. **`start`** (`<ol>`, `long`, missing/invalid default **1**) — its own accessor
   (default differs from the generic 0).

7. **`<li>`.value`** (`long`, default 0) — a branch added at the top of the
   existing form-control `value` accessor (before the `_formValues` check and
   before the `textarea`/`select` paths), reflecting the `value` content attribute
   via `__parseHtmlSignedInt` rather than treating it as a form value.

8. **Document-level reflectors** on `Document.prototype` (after `get body()`),
   inherited by the page document and `DetachedDocument`, and forwarded through
   the §nameditem document Proxy (#127) since `Reflect.has(doc, prop)` is now true:
   - `dir` — enum reflecting the document element's `dir` (keywords ltr/rtl/auto,
     default `""`).
   - `fgColor`/`linkColor`/`vlinkColor`/`alinkColor`/`bgColor` — `[LegacyNullToEmptyString]`
     DOMString reflecting the `<body>` element's text/link/vlink/alink/bgcolor
     attributes (no body → getter `""`, setter no-op).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `html/dom/reflection-sections.html` | 4890/5604 | **5604/5604** ✅ |
| `html/dom/reflection-grouping.html` | 4797/5358 | **5314/5358** 🟡 |

## Caps

`<blockquote>.cite` (44 residual in grouping) is a **URL-typed** reflection: the
harness's *expected* value is built from the document URL/origin, which the
origin-less headless environment reports as `undefined`, so the expected string is
literal garbage (`"undefined//undefined…"`) — unwinnable without a real harness
origin, exactly as `cite`/`src` in #130/#131. This is the only grouping residual.

## Zero-regression sweep

qsa 1975, classlist 1420, createElement 147, Node-properties 726, aria-attribute
41, aria-element 22/27 (5 = shadow-scope cap), getElementById 18, attributes 67,
reflection-misc 4709, reflection-metadata 2994, DOMTokenList-coverage-for-attributes
168/175, Element-getElementsByTagName 19/19, select-value 4/4 — all unchanged.
(Note: the ritual's `dom/lists/DOMTokenList-coverage.html` and
`dom/nodes/getElementsByTagName.html` paths now 404 on wpt.live — bodyLen 42,
could-not-run — they were renamed to `DOMTokenList-coverage-for-attributes.html`
and `Element-getElementsByTagName.html`; the held values are identical under the
new paths.)

## Next

The three big loadable reflection suites (misc/sections/grouping) are now at /near
100% bar the URL-origin cap; metadata at 96.3%. The remaining `reflection-*`
suites (`-text`/`-embedded`/`-tabular`/`-obsolete`) are `meta timeout=long`
**could-not-run** even at 280 s — they share the same primitives but can't be
measured. The standing leads remain: shadow-tree scope discrimination
(aria-element 5 / CSSStyleSheet-constructable 6/13), namespaced cascade-match Rust
lift (`crates/obscura-dom/src/selector.rs`, set-selectorText-namespace 0/5), or a
sweep of fresh DOM/HTML ground.
