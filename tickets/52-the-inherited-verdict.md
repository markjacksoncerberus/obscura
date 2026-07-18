# ⚔️ Quest #52 — The Inherited Verdict

> *Realm:* `css/css-cascade/inherit-initial` + `css/css-color/inheritance`
> (CSS-wide keyword resolution + per-property inheritance in `getComputedStyle`)
> *Hold:* **inherit-initial 4/4, css-color/inheritance 4/4** — **SECURED, +7**
> *Difficulty:* ⚔️⚔️
> *Session:* 2026-06-20

---

## The gap

`getComputedStyle` had a *cascade* (#47) and a computed-value engine for **colour**
and **opacity** (#49/#50), but no general handling of the **CSS-wide keywords** or
**per-property inheritance**. For any non-colour property, a specified `inherit`/
`initial`/`unset` was echoed back verbatim:

- `css/css-cascade/inherit-initial.html` **0/4** — `z-index:inherit` on the root
  computed to `"inherit"` (expected `"auto"`), likewise `position`/`overflow`/
  `background-color`.
- `css/css-color/inheritance.html` **1/4** — `opacity:initial` → `"initial"`
  (expected `"1"`), `opacity:inherit` → `"inherit"` (expected the parent's value).

And a latent **colour bug**: `_computedColorOf` treated `unset` as `initial`
(returning `rgb(0, 0, 0)`), but `color` *inherits* — so `color:unset` must inherit
the parent's colour. That was the third failing subtest in `inheritance.html`
(`Property color inherits`).

The shared helper `/css/support/inheritance-testcommon.js` (`assert_initial` /
`assert_inherited` / `assert_not_inherited`) drives the **whole** `css/*/inheritance.html`
family, setting values via `el.style[prop] = 'initial'|'unset'|'inherit'|<value>`
(the live CSSOM declaration, which does **not** reflect to the `style=""` attribute)
and reading `getComputedStyle(el)[prop]`. So winning it needs (a) CSS-wide keyword
resolution, (b) a per-property inheritance walk, and (c) the live-decl to be
consulted when the cascade is silent.

## The fix (pure JS, `bootstrap.js`, no new Rust)

Generalised the colour-only machinery into a property-agnostic computed-value engine,
built on #47's cascade + #49/#50's `_computeColor`/`_computeOpacity`:

- **`_specifiedValue(el, kebab)`** — the element's own specified value: `color`
  consults the live CSSOM decl first (a `el.style.color=` value lives only there),
  every other property stays **cascade-first** (so author `!important` resolves
  correctly via `_cascadeResolve`) and falls back to the live decl only when the
  cascade is silent. `_specifiedColor` is now a one-line wrapper.
- **`_INHERITED_PROPS`** — the set of properties that inherit by default
  (`color`, `font-size`, `font-weight`, `line-height`, `visibility`, `cursor`,
  `pointer-events` — only properties we actually model).
- **`_initialOf(kebab)`** — the initial (computed) value; `_GCS_DEFAULTS` doubles as
  the initial-values table, colour props fall back to `rgb(0,0,0)` /
  `rgba(0,0,0,0)` for `background-color`.
- **`_normComputed(el, kebab, v)`** — serialize a resolved specified value into its
  computed form (opacity → `_computeOpacity`, colour → `_computeColor`, `currentColor`
  on a non-`color` prop → the element's own colour; everything else passes through).
- **`_computedPropOf(el, kebab, guard)`** — the heart: resolve the CSS-wide keywords
  and per-property inheritance through the ancestor chain.
  - empty value → inherit (if inherited prop) else initial;
  - `currentColor` on `color` → inherit the parent's colour;
  - `initial` → initial value; `inherit` → parent's computed value (root → initial);
  - `unset`/`revert`/`revert-layer` → inherit for inherited props, else initial
    (`revert` approximated as `unset` — we model no UA/user origins or cascade layers).
  - `_computedColorOf` is now `_computedPropOf(el, 'color', 0)` — which fixes the
    `unset`-on-`color` bug for free.
- **`getComputedStyle`'s `resolve`** routes every modelled standard property
  (`_CSS_KNOWN_PROPS`/`_COLOR_PROPS`, non-custom) through `_computedPropOf`; custom
  properties and unmodelled properties keep the old verbatim cascade/inline echo.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-cascade/inherit-initial.html` | 0/4 | **4/4** |
| `css/css-color/inheritance.html` | 1/4 | **4/4** |

**+7. Zero regressions.** Swept the shared `getComputedStyle`/cascade paths:
color-computed 16/16, color-computed-named-color 455/455, color-computed-hex-color
6/6, color-computed-rgb 95/99, opacity-computed 30/30, has-specificity 8/8,
not-specificity 8/8, is-specificity 1/1, is-nested 2/2, is-where-pseudo-classes 1/1,
readwrite-readonly-type-change 1/1, checked-type-change 1/1,
inrange-outofrange-type-change 2/2; plus qsa 1975, classlist 1420, matches 669,
closest 29, disabled 7, readwrite-readonly 25, valid-invalid 30, mark/measures,
structured-clone 141/152; obscura-dom unit 40/40. (One mid-flight regression caught
and fixed: routing `color` through the new engine dropped `currentColor` to the
initial value instead of the inherited one — `color:currentColor` must inherit;
restored color-computed 16/16 + named 455/455.)

## Caps / Next

- The broader `css/*/inheritance.html` tail is gated NOT on the engine but on the
  **property model**: `assert_initial` asserts `prop in getComputedStyle(el)` first,
  which is false for any property not in `_CSS_KNOWN_PROPS`. css-text 0/42,
  css-ui 3/28, css-fonts 3/39 — each needs its properties added with a correct
  initial value, inherited flag, and computed-value serialization (font-size in px,
  font-family list serialization, etc.). **This is now the widest CSS tail**: every
  property family we model lights up its `inheritance.html` row through the engine
  built here.
- `var()` / custom-property substitution still uncovered (the 2 `color-computed-rgb`
  caps + `css-variables/`); the `var-parsing` 3/8 fails are a *specified-value
  validator* on the hot `CSSStyleDeclaration` setter (deferred since #50), a separate
  concern.
- **PATH GOTCHA (important):** wpt.live now **404s extensionless paths** — every test
  path must carry its `.html` (a 404 returns a 42-byte JSON body that reads as
  `bodyLen=42` / "testharness did not load". The runner joins `base + path` without
  appending `.html`. `color-computed-hsl.html` is a real 399 KB test but
  could-not-run even at 150 s (its own harness-gate quest, unrelated to colour).

**NEXT LEVERAGE:** (a) **model more property families** (start with css-ui /
css-fonts inheritance — add each property's initial value + inherited flag +
computed serialization; the engine here resolves the rest), the widest CSS tail;
(b) **CSS custom-property cascade + `var()` substitution** (closes the 2 rgb caps,
opens `css-variables/`); (c) a fresh realm (`fetch/`, `html/dom/` reflection).
