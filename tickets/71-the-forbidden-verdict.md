# Quest #71 — The Forbidden Verdict

> *Scoped per-property value validation: an invalid `image()` value is rejected,
> leaving the property unset — the narrow first slice of the standing valid-property
> registry cap.*

**Realm:** `css/css-images/parsing/image-function-invalid.html`
**Hold:** 0/6 → **6/6** · **+6**
**Difficulty:** ⚔️
**Status:** ✅ SECURED — session 2026-06-21

---

## The gap

Quest #70 named **per-property value validation** (the `image-function-invalid` /
valid-registry cap) as a standing leverage. A reachability sweep this session ruled out
the alternatives:

- `resolve-relative-to-stylesheet.sub.html` 0/3 — wpt.live **404** this session, and it
  needs external-CSS loading with a per-stylesheet base URL anyway (bigger build).
- `cross-fade-valid.html` / `cross-fade-computed.html` — wpt.live **404**; confirmed via
  the GitHub contents API that **no `cross-fade-*` test files exist** in
  `css/css-images/parsing` (the #69 cross-fade canon is exercised by
  `background-image-valid`, which was itself 404 this session). Dead pointers.

The clean, loadable, winnable target: **`image-function-invalid.html`** at 0/6.

`test_invalid_value` (from `css/support/parsing-testcommon.js`) is:

```js
div.style[property] = "";
div.style[property] = value;          // the invalid value
assert_equals(div.style.getPropertyValue(property), "");   // must be REJECTED
```

The 6 cases — image() takes a single `<color>`:

```js
test_invalid_value("background-image", "image()");
test_invalid_value("background-image", "image(none)");
test_invalid_value("background-image", "image(red, blue)");
test_invalid_value("background-image", "image(notacolor)");
test_invalid_value("background-image", "image(url(foo.png))");
test_invalid_value("background-color", "image(red)");   // image() is an <image>, never a <color>
```

Obscura stored every declaration value verbatim (the `_GRADIENT_PROPS`/`_COLOR_PROPS`
branches canonicalized but never *rejected*), so `getPropertyValue` read back the
invalid value non-empty → all 6 failed.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

A scoped value-validation gate for `image()`, kept deliberately narrow so it can't
regress the ~95 properties `serialize-values` round-trips (the reason the general
valid-property registry has stayed a cap since #60).

- **`_isColorish(s)`** — a *permissive, head-only* `<color>` check:
  `transparent`/`currentcolor`, `_CSS_NAMED_COLORS`, hex, or a function whose head is in
  **`_COLOR_FUNC_NAMES`** (`rgb`/`rgba`/`hsl`/`hsla`/`hwb`/`lab`/`lch`/`oklab`/`oklch`/
  `color`/`color-mix`/`light-dark`). It does **not** re-validate the deep colour grammar
  that `_canonColorSpecified`/`_computeColor` already accept — head recognition is enough
  to reject `none`/`url()`/bare idents while still accepting every valid form
  (`light-dark(black, white)`, `color-mix(in srgb, red, blue)`, `rgb(from red r g b)`, …).
- **`_imageFuncInvalid(value)`** — balanced-paren scan for `image(` heads (token-boundary
  so `-webkit-image-set(` is skipped); for each, top-level-comma-split the inner and
  reject unless it is **exactly one** `_isColorish` argument. `image()` (empty),
  `image(none)`, `image(a, b)`, `image(notacolor)`, `image(url(…))` all reject; a valid
  nested image() inside a gradient/cross-fade is validated, the rest scanned past
  untouched.
- **`_hasImageFunc(value)`** — detects any image() token; used by the `<color>`-property
  path (image() is an `<image>`, never a `<color>`, so its presence is invalid).

Wired into both decl paths, only inside the existing `_GRADIENT_PROPS`/`_COLOR_PROPS`
branches:

```js
// _parseStyleDecls (style attribute / cssText)
else if (_GRADIENT_PROPS.has(name)) {
  if (_imageFuncInvalid(value)) continue;          // invalid image() → drop declaration
  value = _canonGradients(value, null, false);
} else if (_COLOR_PROPS.has(name)) {
  if (_hasImageFunc(value)) continue;              // image() is not a <color> → drop
  value = _canonColorSpecified(value);
}

// setProperty (CSSOM) — invalid → return (keep prior value, per CSSOM)
```

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-images/parsing/image-function-invalid.html` | 0/6 | **6/6** |

**+6. ZERO regressions** — swept the `<image>`/`<color>`/gradient family and the hot
serialization path:

- image-function-valid 13/13 (**the proof** the permissive check accepts every valid
  image() form, incl. `light-dark()`/`color-mix()`/`rgb(from …)`/layered with a
  gradient/`cross-fade(image(green), red)`), image-function-computed 3/3.
- color-valid 17/17, color-computed 16/16, gradient-position-valid 18/18,
  gradient-interpolation-method-valid 1398, serialize-values 695/697,
  cssstyledeclaration-csstext 7/11 (unchanged — its 4 fails are the standing
  unknown-prop/value-validation caps), resolve-relative-to-base 2/2,
  Document-createElement 147/147; `cargo test -p obscura-dom` 40/40.
- `background-image-valid`/`background-image-computed.sub`/`mask-image-computed.sub` came
  back wpt.live **HTTP 404** (`bodyLen=42`, curl-confirmed) — serving flux, NOT
  regressions; their identical `_GRADIENT_PROPS` path is proven safe by
  image-function-valid 13/13 holding.

## Caps / Next leverage

1. **Comprehensive valid-property registry** — the standing cap behind csstext 7/11
   (unknown-property drop) and general per-property value validation. This quest is the
   narrow `image()` slice; the general version must be a *superset* of every property
   `serialize-values` sets (~95, many obscure) or it regresses that 695. Big finite data
   set; high leverage for the `*-invalid` parsing family.
2. **`resolve-relative-to-stylesheet`** (0/3) — relative `url()` in an external stylesheet
   resolves against the *stylesheet's* URL; needs external-CSS loading into the cascade
   with a per-stylesheet base URL. Bigger build, broader prize.
3. **Broaden `_canonUrls` to non-image `<url>` props** — `cursor`/`content`/`offset-path`/
   `@font-face src`; register each for computed serialization (`_GCS_DEFAULTS`) first.
4. Fresh realm (`fetch/`, `html/dom/` reflection).
