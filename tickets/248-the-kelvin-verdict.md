# Quest #248 — The Kelvin Verdict

> Realm: `css/css-color/parsing/color-invalid-named-color.html` — ASCII-case-
> insensitive keyword matching in `_isValidColor`. **Result: +31, ZERO regressions.**

## The gap

`color-invalid-named-color` sat at 153/184. All 31 fails were "Unicode modification
shouldn't parse" cases — `blacK`, `pinK`, `Khaki`, `darKblue`, … where the `K` is
the **KELVIN SIGN (U+212A)**, a Unicode look-alike, not ASCII `K`.

CSS keyword/identifier matching is defined as **ASCII**-case-insensitive. But
`_isValidColor` lowercased the value with JS's Unicode-aware `String.prototype
.toLowerCase()`, which folds U+212A → ASCII `k`. So `blac` + U+212A became the
string `black`, matched `_CSS_NAMED_COLORS['black']`, and was wrongly accepted.

```js
'blacK'.toLowerCase() === 'black'   // true in JS — the bug
```

## The fix (one line, `bootstrap.js`)

Swap the Unicode `.toLowerCase()` in `_isValidColor` for the existing ASCII-only
`_asciiLower` (it maps only `A`–`Z`, leaving every other code point untouched):

```js
const low = _asciiLower(String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim());
```

`_asciiLower('blacK')` → `'blacK'` (Kelvin unchanged) → not in the named-
colour map → invalid. Every real CSS colour keyword, system-colour name, and
function name is ASCII, so `_asciiLower` is identical to `.toLowerCase()` for all
valid inputs — and it correctly rejects **any** non-ASCII look-alike, not just
Kelvin. `_isValidColor` is the setProperty gate for `_COLOR_PROPS`, so this closes
the whole `test_invalid_value` sweep.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `color-invalid-named-color.html` | 153/184 | **184/184** ✅ |

**+31.**

## Zero-regression sweep

color-valid 17/17, color-valid-system-color 19/19, color-computed 16/16,
color-valid-rgb 48/70, color-valid-hsl 21/59, color-valid-hwb 26/38, color-valid-lab
150/150, color-computed-rgb 79/99 — all held exactly. #246/#247 held:
color-invalid-rgb 30/30, color-invalid-hsl 23/23, color-invalid-hwb 6/6,
color-invalid-lab 18/18, color-invalid 10/11. Cross-realm colour consumers:
background-color-valid 9/9, border-color-valid 7/7, gradient-interpolation-method-
valid 1398/1398. Held realms: qsa 1975, classlist 1420, serialize-values 695/697
(2 pre-existing), shorthand-serialization 7/7.

## Caps / Next

- This completes the `css/css-color/parsing/` **invalid** vein for the sRGB/HSL/
  hwb/lab/named families (color-invalid-rgb/hsl/hwb/lab/named-color/color-function
  all 100%; color-invalid 10/11, the lone cap being the `<angle>²` calc from #246).
- **NEXT** — the big remaining colour vein is valid-side unresolvable-`calc()`
  **serialization**: color-valid-rgb 48/70, color-valid-hsl 21/59, color-valid-hwb
  26/38 all fail identically — a channel holding a non-foldable math fn (e.g.
  `calc(50% + (sign(1em - 10px) * 10%))`) must serialize the WHOLE colour
  symbolically in modern form (`rgb(calc(50% + (10% * sign(1em - 10px))) 0 0 / 0.5)`)
  instead of resolving it to `rgba(153, 0, 0, 0.5)`. A meatier feature (specified-
  time symbolic colour serialization) — likely its own multi-quest arc. Otherwise a
  NEW `css/*/parsing/` dir.
- grep `_asciiLower` (in `_isValidColor`).
