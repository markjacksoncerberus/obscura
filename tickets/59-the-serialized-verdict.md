# Scroll 59 — The Serialized Verdict ⚔️

> *Specified-value serialization for the inline `style` object — set a property,
> read it back exactly as the CSSOM would write it.*

**Realm:** `css/cssom/serialize-values.html` (+ `cssstyledeclaration-csstext.html`)
**Status:** SECURED — **+580** (session 2026-06-21)
**Difficulty:** ⚔️⚔️ (one root-cause primitive + a light value canonicaliser)

---

## The gap

`css/cssom/serialize-values.html` (697 subtests, the widest single CSS tail left)
stamps every standard property with a value via **two** routes and reads the
*specified-value serialization* back off the inline `style` object:

```js
elem.setAttribute('style', 'background-color: black');
assert_equals(elem.style.backgroundColor, 'black');     // raw inline declaration
elem.setAttribute('style', '');
elem.style.backgroundColor = 'black';
assert_equals(elem.style.backgroundColor, 'black');     // style property round-trip
```

This is the **specified** value (lightly canonicalised), NOT the computed value.
We sat at **118/697**.

### Root cause — two storage conventions that never met

The `style` Proxy stored & read CSS properties by the **raw JS accessor name**
(`backgroundColor`), but `setProperty` / `setAttribute('style', …)` / the `cssText`
setter all keyed `_props` by **kebab-case** (`background-color`). So after
`setAttribute('style','background-color: black')`, the read `elem.style.backgroundColor`
looked up `_props["backgroundColor"]` → `undefined` → `""`. **Single-word**
properties (`color`, `width`, `height`, `position`, …) passed because camelCase ==
kebab; every **hyphenated** property failed. That is exactly the 118-pass / 579-fail
split.

---

## The fix (pure JS, `bootstrap.js`, NO new Rust)

### 1. One canonical storage key — `_cssPropToKebab` (the +415 primitive)

`_cssPropToKebab(p)` maps a JS-side accessor to its CSS property name:
camelCase → kebab (`backgroundColor` → `background-color`), a leading capital →
vendor prefix (`WebkitTransform` → `-webkit-transform`), `cssFloat` → `float`,
and custom (`--x`) / already-kebab names pass through. The Proxy `get` now routes
through `getPropertyValue(_cssPropToKebab(p))` and `set` through
`setProperty(_cssPropToKebab(p), …)`, so `el.style.backgroundColor`,
`el.style['background-color']`, `setProperty('background-color', …)` and
`setAttribute('style', …)` **all land on one key**. (Also removes the old
mixed-key hazard where a camelCase set produced a `_props` key the kebab cascade
lookups missed.) **118 → 533.**

### 2. Light specified-value canonicalisation — `_canonStandardValue` (the +158 primitive)

The remaining 164 fails were numeric-token serialisation: `.5%`→`0.5%`,
`.1em`→`0.1em`, `-0px`→`0px`. `_canonStandardValue(value)` is a hand scan (not a
full tokeniser — it stays cheap on the hot inline-style setter) that rewrites each
**numeric token** via `_canonNumberLiteral` (a bare leading `.` gains a `0`; a `+`
sign is dropped; a negative zero loses its sign) while leaving idents, hex colours,
strings, `url()`s and structure **byte-for-byte intact**. It skips comments,
strings and `#hash` tokens, and consumes identifiers whole so digits embedded in an
ident (`par-num`, `Lucida2`) are never mistaken for numbers. Wired into
`_parseStyleDecls` and `setProperty` for **standard props only** (custom props
bypass — they must round-trip verbatim). **533 → 691.**

### 3. serialize-a-url + serialize-a-string (the +4 primitive)

Inside the same scan: `url(x)` / `url('x')` → `url("x")` (CSSOM quotes the URL with
double quotes, normalising unquoted/single-quoted args) and a single-quoted string
→ a double-quoted one. General CSSOM serialisation rules with a tail beyond this
test (`background-image`, `list-style-image`, `content`, …). **691 → 695.**

### 4. Regression repair — last-write-wins for re-set properties

The camelCase fix exposed that #58's `target9` was passing *by accident*:
`el.style.borderLeft = …` (a CSSOM re-set) used to append a **new** camelCase key
at the end of `_props`, so `_buildCascade`'s insertion-order iteration put it last
and it won the left edge. With storage now correctly keyed, the in-place overwrite
left `border-width` *later* in iteration, clobbering `border-left-width` (1px not
3px). Fix: `setProperty` now **deletes + reinserts** an existing key so the
live-decl cascade source (which expands shorthands to longhands in `_props`
insertion order) resolves shared longhands **last-write-wins** — matching the CSSOM
model where a re-set declaration is the latest write. `variable-substitution-shorthands`
restored to **51/51**.

---

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `css/cssom/serialize-values.html` | 118/697 | **695/697** | **+577** |
| `css/cssom/cssstyledeclaration-csstext.html` | 2/11 | **5/11** | **+3** |
| **Total** | | | **+580** |

**ZERO regressions** (swept: css-variables substitution-basic 11/13, -filters 7/7,
-background 8/10, -shorthands 51/51, -definition 71/73, -cssText 8/11,
legal-values 23/23; color-computed 16, rgb 95/99, named 455, opacity 30;
inheritance css-color 4, inherit-initial 4, css-text 42, css-ui 28, css-fonts 39,
flexbox 20, grid 20, scroll-snap 38, transitions 8; selectors valid-invalid 30,
has/not-specificity 8/8, disabled 7, readwrite-readonly 25; DOM qsa 1975,
classlist 1420, matches 669, closest 29, createElement 147; obscura-dom 40/40).
The `serialize-values` & `cssstyledeclaration-csstext` baselines were
stash+rebuild-verified at 118 and 2.

---

## Caps (honest)

- **serialize-values 695/697:** (a) `counter(par-num, decimal)` → `counter(par-num)`
  needs per-function default-argument dropping; (b) font-family
  `'Lucida Grande'` → `Lucida Grande` needs the font-family-specific
  *serialize-a-family-name* (drop quotes for identifier-safe names) — our generic
  serialize-a-string gives `"Lucida Grande"`.
- **Shorthand SERIALIZATION (the standing inverse engine)** — reconstructing
  `margin: 10px` from its four longhands (with the logical-group adjacency rules)
  is still unmodelled: `css/cssom/shorthand-serialization.html` 4/7,
  `variable-cssText` 8/11, and the two `cssstyledeclaration-csstext` margin
  subtests.
- **`cssstyledeclaration-csstext` 5/11** also gates on **unknown-property drop**
  (`style.unknown = …` must not appear) and **per-property value validation**
  (`color: unknown color` must be rejected) — neither modelled (we store any
  property/value verbatim).

---

## Next leverage

1. **Shorthand serialization engine** (the inverse of #58) — a `_serializeShorthand`
   that recombines longhands into `margin`/`padding`/`border-*`/`transition`
   shorthands for the `cssText` getter + computed shorthand round-trip, honouring
   the "don't serialize across a different logical group" rule. Opens
   `shorthand-serialization` (+3), `variable-cssText` (+3), and the margin subtests
   of `cssstyledeclaration-csstext`.
2. **Unknown-property drop + per-property value validation** on the
   `CSSStyleDeclaration` setter — closes the rest of `cssstyledeclaration-csstext`
   and is foundational for the `*-invalid` parsing family (careful: hot path,
   vendor-prefix tolerance).
3. **Gradient canonicalization** (standing #57 cap) — closes the 2 `-background`
   gradient subtests + foundational for `background-image`/`mask-image` computed.
4. A **fresh realm** (`fetch/`, `html/dom/` reflection).
