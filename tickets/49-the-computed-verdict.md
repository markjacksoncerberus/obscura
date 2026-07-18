# Quest #49 — The Computed Verdict

**Realm:** `css/css-color/parsing/*-computed.html` (the shared `computed-testcommon.js`
computed-value harness) · **Status:** SECURED, +536 · **Session:** 2026-06-19

## The gap

After #47 built an author-stylesheet cascade for `getComputedStyle`, the *computed-value*
side of CSS was still dark. The entire `css/*/parsing/*-computed.html` family runs through
the shared helper `/css/support/computed-testcommon.js`, whose `test_computed_value(prop,
specified, computed)` gates **every** subtest on two assertions *before* it ever reads a value:

```js
assert_true(property in getComputedStyle(target), "… supported in the computed style");
assert_true(CSS.supports(property, specified),     "… is a supported value …");
target.style[property] = specified;
assert_equals(getComputedStyle(target)[property], computed);
```

Both gates failed for us:
- **`'color' in getComputedStyle(el)`** → `false`. The computed-style Proxy had no `has`
  trap, so the `in` operator fell through to the backing `CSSStyleDeclaration`, which has no
  own `color` slot. Every computed-value subtest died on the first assert (`color-computed.html`
  was a clean **0/16**, all 16 on this identical message).
- **`CSS.supports`** was hardcoded `() => false` (`bootstrap.js:7102`), failing the second gate.

So a wide, shared tail was blocked by two tiny shared primitives — the campaign's favourite
shape (one root-cause fix, a flood of greens).

## The work (pure JS, `bootstrap.js`, no new Rust)

1. **Computed-style Proxy `has` trap** + a property registry `_CSS_KNOWN_PROPS` (every
   `_GCS_DEFAULTS` key + `_COLOR_PROPS`, in both kebab and camelCase). `'color' in gCS` is now
   true for known properties.
2. **Real `CSS.supports`** — two-argument `CSS.supports(prop, value)` (known-property gate;
   for `<color>` properties it validates the value via the new `_isValidColor`) and the
   one-argument `CSS.supports("prop: value")` condition form. Unknown properties still return
   `false`, so the false→true change is bounded to the ~30 properties we model (keeps the
   blast radius small for feature-detection tests).
3. **`color` is inherited.** `getComputedStyle(el).color` now resolves through the ancestor
   chain (`_computedColorOf` / `_specifiedColor`): the element's live inline `style.color`
   wins, then the author cascade; a missing / `inherit` / `currentColor` value inherits the
   parent's computed color; the document root falls back to the initial `rgb(0, 0, 0)`. This
   is what makes `color: currentColor` (inside `#container { color: rgb(255,0,0) }`) compute
   to `rgb(255, 0, 0)`. `currentColor` on a *non*-`color` property resolves to the element's
   own computed color.
4. **`_computeColor` extended** (built on #47's serializer): `hsl()`/`hsla()` → sRGB (new
   `_hslToRgb`), alpha clamped to `[0,1]` in `_serColor` (so `rgb(20, 10, 0, -10)` →
   `rgba(20, 10, 0, 0)`), the CSS Color 4 **`none`** keyword treated as the missing-component
   value 0 (`rgb(none none none)` → `rgb(0, 0, 0)`), and CSS comments stripped from values
   (`/**/transparent` → `transparent`, `rgb(/* R */ 10%, …)` → valid). Percentage components and
   over/under-range clamping were already handled by `_serColor`.

## Results (all from baseline 0 — every subtest was gated on the first `in` assert)

| Test | Before | After |
|------|:------:|:------:|
| `css/css-color/parsing/color-computed.html` | 0/16 | **16/16** |
| `css/css-color/parsing/color-computed-hex-color.html` | 0/6 | **6/6** |
| `css/css-color/parsing/color-computed-named-color.html` | 0/455 | **455/455** |
| `css/css-color/parsing/color-computed-rgb.html` | 0/99 | **59/99** |

**+536, zero regressions.** Swept: has-specificity 8/8, is-specificity 1/1, not-specificity
8/8, is-nested 2/2, important-vs-inline-001 4/4, inrange-outofrange-type-change 2/2,
checked-type-change 1/1 (all #47 colour-via-cascade tests — the highest risk), qsa 1975,
classlist 1420, matches 669, closest 29, valid-invalid 30, readwrite-readonly 25, disabled 7,
createElement 147, mark 22, structured-clone 141/152, getRandomValues 39; obscura-dom unit 40/40.

## Caps (honest)

- **`color-computed-rgb` 59/99** — the remaining 40 are `calc()` (with `sign()`/`infinity`/
  `NaN`/container-query units `cqw`/`em`), `var(--x)` custom properties, and CSS-escaped
  identifiers (`r\67 b`). They need a real calc evaluator + a CSS value tokenizer — out of
  scope for a colour quest.
- **`alpha-color-computed` 0/32** — the `alpha(from … )` relative-color function (CSS Color 5,
  bleeding edge). `CSS.supports` correctly returns `false`; the test asserts `true`. Genuine cap.
- **`opacity-computed` 3/30** — needs `opacity` computed-value normalization (clamp `[0,1]`,
  percentage→number, calc). A *different* property than colour — clean follow-up, deferred.
- **`color-computed-hsl.html`** — could-not-run for a **harness** reason (the harness probe
  shows bootstrap features not attaching at all — unrelated to colour). Our hsl math is proven
  by `color-computed.html`'s `hsl(120, 100%, 50%)` → `rgb(0, 255, 0)` subtest passing.
- This is a computed-VALUE engine for colour, not a layout/units engine: no `em`/`%`/`calc`
  length resolution, no shorthand expansion, no `initial`/`inherit` for non-colour properties.

## Next leverage

The `has`-trap + `CSS.supports` primitives are now a **foundation** for the whole
`*-computed.html` family. Best next steps, all building on this:
- **`opacity-computed`** + other simple numeric computed values (clamp/percentage; small).
- **CSS inheritance + initial values for non-colour properties** — `inherit-initial.html` 0/4
  and `css-color/inheritance.html` 1/4 need an initial-values table + `inherit`/`initial`/
  `unset` keyword resolution + an inheritance walk generalised beyond `color` (the architectural
  follow-up; widest `css/css-cascade` tail).
- A **fresh realm** (`fetch/`, `html/dom/` reflection / idlharness) if the CSS computed-value
  tail thins out.
