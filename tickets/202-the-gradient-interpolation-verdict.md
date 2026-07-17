# Quest #202 — The Gradient Interpolation Verdict

> *A gradient's colours may travel through any colour space — but only if they
> speak the grammar. `in oklch longer hue` is a welcome; `hsl hue`, `lab lab`,
> `in to right` are impostors. Obscura learned to turn the impostors away.*

**Realm:** `css/css-images/parsing/` — the `<color-interpolation-method>` in gradients.
**Result:** **+292, ZERO regressions.**

---

## The gap

`gradient-interpolation-method-invalid` sat at **0/292**, while its sibling
`gradient-interpolation-method-valid` already passed **1398/1398** and
`-computed` **932/932**. The whole 292-subtest gap was pure invalid-rejection:
the existing `_canonGradients` / `_canonInterpolationMethod` engine already
*canonicalizes* every valid `in <color-space> [ <hue> hue ]?` clause (which is why
valid/computed were green), but it was **lenient** — an unrecognized first
argument just passed through as if it were a colour stop, so malformed
interpolation methods were silently accepted.

The invalid file (template-generated over linear/radial/conic × colour spaces ×
hue methods) probes:

| Pattern | Example | Why invalid |
|---|---|---|
| empty argument | `linear-gradient(, red, blue)` | leading/double comma |
| method after stops | `linear-gradient(red, blue, lab)` | colour space is not a stop |
| method after stops (polar) | `linear-gradient(red, blue, hsl shorter hue)` | ditto |
| duplicated space | `linear-gradient(lab lab, …)` | no `in`, stray spaces |
| rect space + hue | `linear-gradient(lab shorter hue, …)` | hue only for polar |
| bad hue method | `linear-gradient(hsl foo hue, …)` | `foo` not a hue method |
| `hue` w/o method | `linear-gradient(hsl hue, …)` | no `in`, stray keyword |
| method w/o `hue` kw | `linear-gradient(hsl shorter, …)` | missing `hue` |
| hue before space | `linear-gradient(shorter hue hsl, …)` | wrong order |
| `in` w/o space | `linear-gradient(in, …)`, `linear-gradient(45deg in, …)` | no colour space |
| space after `in` bad | `linear-gradient(in 45deg, …)`, `linear-gradient(in to right, …)` | `in` must be followed by a space |
| polar missing `hue` | `linear-gradient(90deg in hsl longer, …)` | `<hue> hue` incomplete |

## The fix — a rejection gate, canonicalizer untouched

Because the valid path already works, the safe move was **not** to touch
`_canonGradients` but to add a parallel predicate `_gradientInvalid(value)` used at
the `_GRADIENT_PROPS` setProperty gate (right beside `_imageFuncInvalid`). It
validates *only* the interpolation-method grammar and its placement — direction /
prelude / stops stay permissive — so no valid gradient can be affected.

New helpers (in `bootstrap.js`, next to `_imageFuncInvalid`):
- **`_interpIsh(t)`** — a token that can only ever be part of an `in` clause: `in`,
  `hue`, a hue method (`_HUE_METHODS`), or a colour space (`_GRADIENT_COLOR_SPACES`).
- **`_gradientConfigInvalid(toks)`** — the first argument. Find an `in`: it must be
  immediately followed by a valid colour space (plus, for a polar space, an optional
  well-formed `<hue> hue`). Remove that clause; if any interpolation-ish token
  remains among the residual direction/prelude tokens → invalid.
- **`_gradientInnerInvalid(inner)`** — split the argument list: an empty argument is
  invalid; argument 0 goes through `_gradientConfigInvalid`; every later argument is
  a colour stop and can never *begin* with a bare colour-space keyword.
- **`_gradientInvalid(value)`** — balanced-paren, token-boundary walk over every
  gradient function head; returns true for the first ill-formed one. Fast-paths out
  when there's no `gradient(`, and **defers on `var()`/`env()`** (substitution
  pending → never reject).

Wired identically in **both** setProperty paths:
```js
else if (_GRADIENT_PROPS.has(name)) {
  if (_imageFuncInvalid(value)) continue;
  if (_gradientInvalid(value)) continue;   // NEW
  value = _canonImageSet(_canonGradients(value, null, false));
}
```

`_wsTokens` is paren-aware, so `color(srgb 1 0 0)` is a single token — the exact
keyword-equality checks against the colour-space / hue-method sets never
false-match a colour function or named colour.

## Results

| Test | Before | After |
|---|:---:|:---:|
| `gradient-interpolation-method-invalid` | 0/292 | **292/292** |
| `gradient-interpolation-method-valid` | 1398/1398 | 1398/1398 (held) |
| `gradient-interpolation-method-computed` | 932/932 | 932/932 (held) |

**Zero-regression sweep held:** gradient-position-valid 18/18, image-function-valid
13/13, image-function-invalid 6/6, background-image-valid 13/13, background-valid
45/46 (pre-existing cap), background-computed 39/39, mask-computed 32/32,
list-style-image-valid 3/3, cursor-invalid 10/10, cursor-valid 46/46,
line-clamp-valid 18/18, will-change-invalid 127/127, contain-invalid 14/14, qsa 1975.

## Caps / Next

The gate is **surgical** — it addresses only the interpolation-method grammar. The
neighbours in the same dir remain untouched and are the natural next targets:
- **`gradient-position-invalid` 0/9** — malformed radial/conic direction & position
  preludes (a stricter direction validator; `_canonGradientDirection` currently
  canonicalizes leniently).
- **`conic-gradient-calc-angle-percentage-invalid` 0/4** (+ `-valid` 1/6) — `calc()`
  angle/percentage rules in conic stops.
- **`object-fit-invalid` 0/5, `image-orientation-invalid` 0/12,
  `image-rendering-invalid` 0/2** — plain enum longhands, a raw-store→validate task.
- **`background-image-invalid` 0/12** — a *different* gradient sub-grammar: negative
  radial radii (`radial-gradient(circle -10px …)`) + `cross-fade()` percentage rules
  (`cross-fade(-1% red, green)`). Would pair well with a `<radial-size>` /
  `cross-fade()` validity check.
- Or a NEW `css/*/parsing/` dir (baseline the `*-invalid` files first — 0/N = the
  raw-store tell).

grep `_gradientInvalid` / `_gradientConfigInvalid` / `_interpIsh`.
