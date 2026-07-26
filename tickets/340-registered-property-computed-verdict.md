# The Computed-Registration Verdict — Quests #340–#342

> *Registered custom properties finally reach computed style. A `@property` or
> `CSS.registerProperty` registration used to be parsed, validated… and then
> ignored by `getComputedStyle`. Now it flows all the way through: initial values,
> the inherits flag, per-syntax computed canonicalization, cascade determination,
> and computed-style enumeration.*

**Realm:** `css/css-properties-values-api/` (the computed-value half)
**Result:** **+68**, ZERO regressions, ONE commit, all JS (no Rust).

| Test | Before | After |
|------|:------:|:-----:|
| `determine-registration.html` | 0/15 | **15/15** |
| `registered-properties-inheritance.html` | 1/8 | **8/8** |
| `registered-property-cssom.html` | 4/8 | **8/8** |
| `get-computed-style-enumeration.html` | 2/5 | **5/5** |
| `at-property.html` (bonus) | 67/106 | **106/106** |

## The gap

The #334–#336 arc built the whole `@property`/`CSS.registerProperty` *parsing*
engine — a syntax-string grammar (`_parsePropSyntax`), a value matcher for every
data type (`_propMatchType`), and the `CSSPropertyRule` CSSOM primitive. But the
registrations were inert: `_registeredProps` recorded them for duplicate detection
only, and `@property` rules parsed to `CSSPropertyRule` objects that computed-style
never consulted. So `getComputedStyle(el).getPropertyValue('--registered')` always
returned `''`.

> The prior memory's "next leverage" named `register-property-computation.html`
> `0/75` — that path is a **404** (the file doesn't exist). The real winnable
> vein was the four files above, plus a fat bonus hiding in `at-property.html`.

## The work — three quests, one commit

### #340 — the registry + resolution + typed computation

- **`_effectivePropReg(el, name)`** — the effective registration for a custom
  property, or `null`. A `CSS.registerProperty` registration **always wins** over
  an `@property` rule; among `@property` rules, the **last in document order** wins.
- **`_computedRegisteredProp(el, name, reg, guard)`** — full resolution:
  - unset → the inherited value (if `inherits`) else the initial value;
  - `initial`/`inherit`/`unset` keywords resolve through the registry;
  - a real value is `var()`-substituted, then matched against the syntax and
    computed; a syntax-incompatible substitution → the inherited/initial value.
- **`_computeTypedSingle` / `_computeRegisteredValue`** — per-syntax computed
  canonicalization: `<length>`→px (via `_trComp`, em-absolutized + calc-folded),
  `<color>`→`rgb()` (via `_computeColorFull`), `<integer>` (via `_computeIntegerValue`).
- **`allowFontRel` flag** threaded through `_propMatchType`/`_propMatchComponent`:
  a *specified* value may use `10em` (absolutized to px later), while a registered
  property's *initial* value must stay computationally independent (font-relative
  units rejected) — the same restriction that already governed `<length>` now also
  covers `<transform-function>`/`<transform-list>` (`translateX(1em)` initial value
  rejected).
- **CSSOM style-rule → cascade wiring:** a `sheetRule.style.setProperty(…)` now
  reaches `getComputedStyle` — the rule's `.style` `_onChange` re-derives
  `_cascadeDecls` and flags the owning sheet `_cssomDirty` (set on the *raw*
  declaration, not through `_styleProxy`, which would route an unknown member to
  `setProperty`).

### #341 — the `@property` cascade determination

- **`_atPropRegsOf(styleEl)`** — the `@property` registrations a `<style>` declares,
  cached by its `textContent` (a text change → cache miss → re-parse). Drives
  `_effectivePropReg`'s document-order scan.
- Register-wins-over-`@property`; last-`@property`-in-document-order wins; an invalid
  rule doesn't overwrite a prior valid one; a registration is **cleared when its
  `<style>` is removed** (the scan is live each call). A registered `<length>`'s
  `calc(1px + 1px)` simplifies to `2px`, reverting to the token sequence when the
  rule is dropped.
- **`_atPropSeen`** gates the whole registry path so pages with no registration keep
  the fast custom-property computed path byte-for-byte (every existing `var()` test
  is unchanged). It is flipped in `_styleSheetRules` via a cheap `/@property/i` probe
  on the (cached) text, so markup `@property` works without ever touching the CSSOM
  `.sheet` — the only thing that otherwise parses `@property` rules and set the flag.

### #342 — computed-style enumeration + typed canonicalization

- **`_computedCustomPropNames(el)`** — the custom properties that appear when
  enumerating computed style: those declared on `el` or an inherited ancestor, plus
  registered properties with an initial value; each is computed and kept only if
  non-empty (so a non-inherited ancestor-only property, or a registration with no
  initial value and no specified value, is excluded). Wired into the `getComputedStyle`
  Proxy via `length`/`item`/indexed access/`Symbol.iterator`.
- Full typed canonicalization: `<angle>`→deg (`1turn`→`360deg`), `<time>`→s
  (`1000ms`→`1s`), `<resolution>`→dppx (`96dpi`→`1dppx`), `<string>`→canonical
  double-quoted (`_serCssString(_cssStringContent(t))`).
- Unregistered custom properties now substitute `var()` in their computed value too
  (`--x: var(--y)` computes to `--y`'s computed value).

## Zero-regression sweep

qsa 1975, classlist 1420, createElement 147, register-property-syntax-parsing 246,
at-property-cssom 40, register-property 6, variable-definition 71/73,
variable-definition-cascading 9, variable-definition-keywords 8,
CSSStyleRule-set-selectorText 82, serialize-values 695/697, cssom-pagerule 22,
keyframes-name-invalid 20, size-valid 15, font-palette-values-valid 36,
counter-style system-syntax 16, cloneNode 135.

**STASH-PROVED pre-existing** (identical on the baseline binary): `getComputedStyle-detached-subtree`
0/6, `color-computed-rgb` 79/99.

## Caps (honest)

- **Reftests:** `registered-property-computation-color-*`, `registered-property-change-style-*`
  compare rendered paint → need real layout, could-not-run / layout-capped.
- **Animation:** transitions/animations of registered properties need the animation
  engine (out of scope for a value-computation quest).

## Next leverage

The CSS Properties & Values API **computed** realm is now SECURED — only reftests
remain. Roads:
1. Scout a FRESH `css/*/parsing/` dir (re-baseline even green realms — a PARTIAL
   file, not just 0/N, is the tell).
2. Mine `css/cssom/` object realms: `cssimportrule` 3/11 (`@import` sheet-loading),
   `CSSStyleSheet` constructor arity, `cssstyledeclaration-csstext` 7/11.

**Reusable primitives:** `_effectivePropReg`/`_atPropRegsOf` (a live at-rule
registry consulted at compute time), `_computeTypedSingle` (per-syntax computed
canonicalization: length/color/angle/time/resolution/string/integer), the rule-style
`_onChange`→cascade wiring, `_computedCustomPropNames` (computed custom-prop
enumeration), the `allowFontRel` split on `_propMatchType` (specified vs
computationally-independent-initial matching).
