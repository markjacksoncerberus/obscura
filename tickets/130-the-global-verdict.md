# Quest #130 — The Global Verdict

**Realm:** `html/dom/reflection-misc.html` (and, by the same primitive, every
`reflection-*` suite).
**Result:** `reflection-misc` **563/4877 → 4709/4877 (+4146)**. Zero regressions.
**Where:** `crates/obscura-js/js/bootstrap.js` only (no Rust).

## The gap

After #129 exhausted the `dom/events` AddEventListenerOptions fruit, a sweep of
fresh ground found the single widest unimplemented tail on the board:
`html/dom/reflection-misc.html` at **563/4877 (11.5%)** — **4314 failing
subtests**. Reflection-misc is the authoritative IDL-attribute reflection suite
for miscellaneous elements (`html`, `script`, `template`, `slot`, `details`,
`dialog`, `ins`, `del`, `menu`, `summary`, `noscript`, and the unknown element).

The failures clustered overwhelmingly on the **global HTMLElement attributes** —
properties every HTML element must expose, reflecting a content attribute:

| IDL attr | type | failing subtests |
|----------|------|:----------------:|
| `dir` | enum (ltr/rtl/auto) | 816 |
| `hidden` | boolean | 468 |
| `autofocus` | boolean | 468 |
| `title` | DOMString | 456 |
| `lang` | DOMString | 456 |
| `accessKey` | DOMString | 456 |
| `tabIndex` | long | 336 |
| `inputMode` | enum | 120 |
| `enterKeyHint` | enum | 114 |

Obscura's `HTMLElement` is an empty subclass of `Element`, and none of these
were defined anywhere, so `element.title`, `element.dir`, etc. all returned
`undefined` — every reflection subtest for them failed (`typeof`, IDL get/set,
`setAttribute` round-trips). The remaining tail was element-specific attributes
(`version`, `open`, `dateTime`, `crossOrigin`, the `<script>` family…).

## The fix

All in `bootstrap.js`, right after the existing `__ariaReflectedAttrs` loop, in
the same table-driven style. Defined on `Element.prototype` (HTMLElement is an
empty subclass, so every HTML element instance inherits from Element directly;
SVG/foreign elements inherit too but the getters just yield `""`/`false`/the
default when the attribute is absent, so the addition is inert for them).

Four reflector kinds, matching the WPT `reflection.js` harness semantics exactly:

- **DOMString** (`title`, `lang`, `accessKey`) — getter returns the attribute or
  `""` when absent; setter always writes `String(value)` (never removes).
- **enum** (`dir`, `inputMode`, `enterKeyHint`) — getter ASCII-case-insensitively
  matches the keyword list and returns the canonical lowercase keyword, else `""`
  (the shared missing/invalid default). **ASCII-only lowercasing** (`__asciiLower`,
  a `/[A-Z]/g` replace — NOT `toLowerCase()`) so Unicode lookalikes the harness
  throws at it (U+017F ſ, U+217F ⅿ) never spuriously match an ASCII keyword.
- **boolean** (`hidden`, `autofocus`) — getter is `hasAttribute`; setter writes
  `""` when truthy (WebIDL ToBoolean via JS truthiness), removes when falsy.
- **long** (`tabIndex`) — getter parses an HTML signed integer
  (`__parseHtmlSignedInt`: skip ASCII whitespace, optional sign, ASCII digits;
  `null` on failure or out of the signed-32-bit range → default −1); setter writes
  `String(value | 0)` (ToInt32). The harness uses `defaultVal:null` ("too
  complicated, skip the test") so the absent default is never asserted.

Then the **winnable element-specific** reflectors (same flat style):

- DOMString: `version` (`<html>`), `dateTime` (`<ins>/<del>/<time>`),
  `integrity`/`event`/`charset` (`<script>` family).
- boolean: `open` (`<details>/<dialog>`), `defer`/`noModule` (`<script>`),
  `compact` (`<ol>/<ul>/<dl>/<menu>`).
- **`crossOrigin`** — a *nullable* enumerated reflection: keywords
  `["anonymous","use-credentials"]`, **missing default `null`** (getter returns
  `null` when absent, hence `typeof` is `"object"`), **invalid default
  `"anonymous"`** (any present-but-unrecognised value, including `""`). Setter
  removes the attribute for `null`, else writes `String(value)`.

### One subtle bug fixed mid-quest

`tabIndex` getter for `setAttribute("-0")` returned **−0**; testharness's
`assert_equals` distinguishes ±0 (it checks `1/actual === 1/expected` for zeros),
so `-0` failed against expected `0`. Normalised with `num || 0` (−0 is falsy → +0).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `html/dom/reflection-misc.html` | 563/4877 | **4709/4877 (+4146)** |

The same primitive lifts every other reflection suite that exercises the global
attributes — measured after the change (no clean before-baseline taken, so not
scored): `reflection-grouping` 4797/5358 (89.5%), `reflection-sections`
4890/5604 (87.3%), `reflection-metadata` 2282/3110 (73.4%).

**Zero regressions** (fresh-server sweep): qsa 1975, createElement 147,
Node-properties 726, getElementById 18, attributes 67, aria-attribute-reflection
41, aria-element-reflection 22/27 (unchanged — the 5 are the standing shadow-scope
cap), Event-dispatch-bubbles-true 5/5, AddEventListenerOptions-passive 5/5 /
-signal 11/11, DOMTokenList-coverage 168/175 (the 7 fails are `relList`/`htmlFor`/
`sandbox`/`sizes` DOMTokenList reflections — untouched, pre-existing).

## Caps / Next

- **URL-typed reflections (`cite`, `src`) — environmental CAP (~130 subtests).**
  These reflect as URLs and the harness's *expected* value is built from the
  document's URL/origin, which the headless test environment reports as
  `undefined` → the expected string is literal garbage
  (`"undefined//undefinedundefinedundefinedundefined"`). `src` is already URL-
  reflecting and still fails these; nothing we can do without a real document
  origin in the harness. The IDL-*set* half of `cite` is technically winnable
  (raw `getAttribute` round-trip) but entangled with the capped GET half.
- `<script for>` `htmlFor` (1 subtest) — obscure legacy, DOMTokenList-ish; skipped.
- `reflection-text` / `reflection-embedded` / `reflection-tabular` /
  `reflection-obsolete` are enormous `meta timeout=long` files that **could-not-run**
  even at a 280 s timeout (harness/size limit, pre-existing — not a regression).
  They also benefit from this primitive but can't be measured here.
- **NEXT-BEST:** the reflection realm is now broadly unlocked by ONE primitive —
  the standing leads remain: shadow-tree scope discrimination (aria-element 5
  residual / CSSStyleSheet-constructable 6/13), namespaced cascade-match Rust lift
  (`crates/obscura-dom/src/selector.rs`, set-selectorText-namespace 0/5), or sweep
  the still-loadable reflection siblings (grouping/sections/metadata each have a
  ~10–27% tail — likely more element-specific reflectors + the form/control
  attributes).
