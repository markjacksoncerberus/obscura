# Quest #68 — The Tinctured Verdict

**Realm:** `css/css-color/parsing/color-valid.html` — specified-value `<color>` serialization
**Hold:** 7/17 → **17/17** (+10)
**Difficulty:** ⚔️
**Status:** ✅ SECURED — +10. Pure JS (`bootstrap.js`), NO new Rust.

## The gap

`color-valid.html` sets a `<color>` via `el.style.color = …` and reads the **specified**
serialization back off `el.style.color`. Obscura stored the inline value verbatim (only
the generic `_canonStandardValue` numeric-token pass ran), so every legacy sRGB form that
must canonicalize stayed unchanged:

| input | expected (specified) | was |
|---|---|---|
| `#234` | `rgb(34, 51, 68)` | `#234` |
| `#FEDCBA` | `rgb(254, 220, 186)` | `#FEDCBA` |
| `rgb(100%, 0%, 0%)` | `rgb(255, 0, 0)` | verbatim |
| `rgba(2, 3, 4, 50%)` | `rgba(2, 3, 4, 0.5)` | verbatim |
| `hsl(120, 100%, 50%)` | `rgb(0, 255, 0)` | verbatim |
| `hsla(120, 100%, 50%, 0.25)` | `rgba(0, 255, 0, 0.25)` | verbatim |
| `rgb(-2, 3, 4)` | `rgb(0, 3, 4)` | verbatim |
| `rgb(100, 200, 300)` | `rgb(100, 200, 255)` | verbatim |
| `rgb(20, 10, 0, -10)` | `rgba(20, 10, 0, 0)` | verbatim |
| `rgb(100%, 200%, 300%)` | `rgb(255, 255, 255)` | verbatim |

The 7 already-green subtests are the values that must stay **verbatim** at specified time:
`currentcolor`, `transparent`, `red`, `magenta`, `rgb(2, 3, 4)`, `rgba(2, 3, 4, 0.5)`,
`light-dark(black, white)`.

## The key distinction (specified vs computed)

Obscura already had the colour engine — `_computeColor` powers `color-computed` (16/16) and
gradient stops. But the **computed** serialization resolves *named colours, `currentcolor`,
and `transparent`* to `rgb()`/`rgba()` (`red`→`rgb(255, 0, 0)`, `transparent`→`rgba(0, 0, 0,
0)`). At **specified** time those keywords are kept as written; only the legacy *functional /
hex* forms canonicalize. Modern colour functions (`light-dark()`, `color-mix()`, `lab()`,
relative `rgb(from red r g b)`) and `var()` are likewise kept verbatim — they only resolve at
computed-value time.

## The fix

New `_canonColorSpecified(value)` (placed right after `_computeColor`):

```js
const _canonColorSpecified = (value) => {
  if (!value) return value;
  const s = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const low = s.toLowerCase();
  if (low === 'transparent' || low === 'currentcolor' || _CSS_WIDE.has(low) || _CSS_NAMED_COLORS[low]) return value;
  const out = _computeColor(s);
  return out === s ? value : out;            // modern fn / var() / unparseable → original bytes
};
```

It short-circuits the keywords/named-colours/CSS-wide values to verbatim, then delegates the
legacy hex/`rgb`/`hsl` conversion to `_computeColor` (which already clamps channels, resolves
`%`→0-255, folds 4-arg/slash-alpha → rgba, and clamps alpha). `_computeColor` returns its
argument unchanged for anything it doesn't recognise as a legacy sRGB colour, so the
`out === s` guard preserves the original bytes (incl. comments) for modern functions/`var()`.

Wired into the two SPECIFIED paths for `_COLOR_PROPS`, alongside the existing
`_POSITION_PROPS`/`_ORIGIN_PROPS`/`_GRADIENT_PROPS` branches:
- `_parseStyleDecls` (inline `style="…"` / `cssText`)
- `CSSStyleDeclaration.setProperty` (`el.style.color = …`)

## Why zero-regression (the hot-path proof)

`css/cssom/serialize-values.html` (695/697) sets its `_COLOR_PROPS` via the list
`['black', 'red', 'rgb(50, 75, 100)', 'rgba(5, 7, 10, 0.5)']` + `'transparent'` + `'inherit'`
— **every one is a fixed point** under `_canonColorSpecified` (named/keyword kept verbatim;
the `rgb()`/`rgba()` forms are already canonical). Verified 695/697 held.

`color-computed` is unaffected: the computed path reads the specified value then runs
`_computeColor` over it, and `_computeColor` is idempotent on the canonical `rgb()`/`rgba()`
we now store (`_computeColor('rgb(0, 255, 0)')` === `_computeColor('hsl(120, 100%, 50%)')`).
Verified 16/16 held.

## Results

| Test | Before | After |
|---|:---:|:---:|
| `css/css-color/parsing/color-valid.html` | 7/17 | **17/17** |
| `css/css-color/parsing/color-computed.html` | 16/16 | 16/16 (hold) |

**ZERO regressions** — swept serialize-values 695/697, gradient-position valid/computed
18/43, image-function valid/computed 12·1 (unchanged), var-substitution-background 10/10,
css-color/inheritance 4, inherit-initial 4, Element-matches 669, Document-createElement 147;
`cargo test -p obscura-dom` 40/40. (3 pre-existing runtime unit failures — blob-url /
document.write / iframe-lifecycle — proven present on baseline with the change stashed;
unrelated to colour.)

## Caps / Next leverage

This is the foundational specified-`<color>` primitive — every `*-color-valid` test
(`background-color`, `border-color`, `outline-color`, `caret-color`, `text-decoration-color`,
…) now canonicalizes for free once wpt.live serves them (all were **HTTP 404** this session —
serving flux, not regressions).

1. **`image(<color>)` canon** — `image-function-valid` 12/13 (`image(rgb(0 128 255))`→
   `image(rgb(0, 128, 255))`, specified) + `image-function-computed` 1/3 (`image(red)`→
   `image(rgb(255, 0, 0))`, computed). The `image()` `<image>` wrapper isn't recognised by
   `_canonGradients` (it scans for `gradient(`); extend it to also canonicalize an `image()`
   colour argument with `_canonColorSpecified` (specified) / `_computeColor` (computed). Small,
   the natural sibling, reuses this quest's helper.
2. **`cross-fade()` specified canon** — `background-image-valid` 9/13 (wpt.live 404 this
   session). Reorder `<percentage>` after the image, ws-normalize.
3. **URL absolutization** — `url("a.b#c")`→`url("https://…/a.b#c")` against the document base
   URL; foundational across the `*-computed` `<url>` family (border-image-source-computed cap).
4. **Comprehensive valid-property registry** (csstext unknown-prop drop — serialize-values
   hot-path risk; standing since #60).
5. **Colour-value validation / invalid drop** — `color-invalid` (drop an unparseable colour so
   the prior declaration survives); we currently keep any value verbatim.
