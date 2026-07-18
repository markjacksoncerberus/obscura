# Quest #80 — The Reckoned Verdict

**`_evalMath` trigonometry + exponent extension — the CSS math primitive that
reckons `sin`/`cos`/`tan`/`pow`/… inside colour channels. +13.**

Session 2026-06-22. Branch `engine-per-page-threads`. Pure JS (`bootstrap.js`),
no new Rust.

## The gap

Quest #79 landed the COMPUTED cross-space colour engine and named its standing
"next leverage (1)": the `_evalMath` trig/exponent extension. The
`color-computed-relative-color` test carried ~13 fails whose relative channels
use math functions `_evalMath` didn't know:

```
hsl(from hsl(50 50 50) h s calc((sin(l) + 1) * 50))
hsl(from hsl(50 50 50) h s calc((sin(asin(sin(l))) + 1) * 50))
hsl(from hsl(50 50 50) h s calc((sin(l * (50rad / 50)) + 1) * 50))
hsl(from hsl(50 50 50) h s calc((sin(l * (50rad / (50deg * (180 / pi)))) + 1) * 50))
hsl(from hsl(200 50 50) h s calc(l + sin(3) * 100))
hsl(from hsl(200 50 50) h s calc(sin(pi / 4) * 100))
oklch(from green pow(l, 1) c h)
```

Because `_evalMath` returned `null` on the unknown `sin(`/`pow(`, the channel
was unresolvable → the whole colour was deemed invalid, so even the
`CSS.supports('color', …)` support check (the test's first assertion) failed.

## The fix

`_evalMath` already had `calc`/`min`/`max`/`clamp`/`sign`/`abs` + the
`pi`/`e`/`infinity`/`nan` constants. Extended its recursive-descent evaluator with:

- **Trigonometry** — `sin`/`cos`/`tan` (a bare number arg is radians; an
  `<angle>` arg is its degrees → radians), `asin`/`acos`/`atan`/`atan2` (return
  an `<angle>` whose canonical value is degrees).
- **Exponent / power** — `pow`/`sqrt`/`hypot`/`exp`/`log` (all `<number>` → `<number>`).

The hard part is **CSS `<angle>`-vs-`<number>` type tracking**. Each parse fn now
returns `[value, isAngle]` (an angle's `value` is its canonical degrees) and the
type propagates through the calc algebra restricted to `{number, angle}`:

| op | rule |
|----|------|
| `±` / `min` / `max` / `clamp` / `abs` | keep the type |
| `×` | `angle × number → angle` |
| `÷` | `angle ÷ number → angle`, `angle ÷ angle → number` |
| `sin`/`cos`/`tan` | → number; `asin`/`acos`/`atan`/`atan2` → angle (degrees) |

This lets the equivalent forms resolve identically:
- `50rad / 50` → an angle (`angle ÷ number`);
- `50rad / (50deg * (180 / pi))` → a **number** (`angle ÷ angle`, both equal 50rad);
- `sin(asin(sin(l)))` → `asin` returns an angle, the outer `sin` converts it back.

Angle units are recognized inside a trig argument **even without** an explicit
angle context (a `trigDepth` counter), so `sin(50rad)` works inside an hsl
lightness channel. An angle that **leaks into a non-angle context** (a stray
`asin()` where a plain number is required) is rejected at the top — matching the
prior behavior where an angle unit failed unless `opts.angle` was set.

**Zero-hot-path-risk by construction:** `isAngle` only ever becomes true under
`opts.angle` OR inside a trig argument. In every other call site (the
serialize-values calc tests, gradient stops/positions, length channels) it stays
`false` throughout, so the type algebra is cosmetic and the leak-check is a
no-op — numeric results are byte-identical to before.

## Result

`color-computed-relative-color` **1150 → 1163 (+13)**. All ~13 trig/`pow` cases
green (support check + computed value).

## Caps — the 6 residual (all distinct from this quest)

1. **2 `light-dark()`-wrapping** — `light-dark(rgb(from …), …)` not yet resolved
   to a branch at computed time.
2. **2 `var()` custom-property origins** — `var(--mygray)` / `var(--accent)` need
   registered custom-property resolution.
3. **1 `sibling-index()`** — `calc(h + 180 * sibling-index())`, a tree-counting
   function (DOM position).
4. **~4 out-of-gamut hsl xyz round-trips at ε=0.0001** — the documented
   double-Bradford / out-of-gamut precision cap from #79.

## Zero-regression sweep

color-computed-relative-color 1163/1169, color-valid-relative-color 1127/1147,
color-computed-color-mix-function 919/948, gradient-interpolation-method-valid
1398, gradient-position-computed 43, gradient-position-valid 18,
image-function-valid 13, color-valid 17, color-computed 16, color-computed-lab
112/120, color-valid-lab 116/150, color-computed-color-function 466/468,
color-computed-rgb 95/99, Document-createElement 147, Element-getElementsByTagName
19; `cargo test -p obscura-dom --lib` 40/40. (serialize-values came back wpt.live
HTTP 404 `bodyLen=42` — serving flux, NOT a regression; provably inert under this
change — its calc tests use only `calc`/`min`/`max`/`clamp` in non-angle contexts
where `isAngle` is always false.)

## Next leverage

1. **Wave-2 specified-`calc()` serializer** (~127 across `color-valid-{lab,
   color-function,hwb}` + ~20 relative `calc(g * 2)`→`calc(2 * g)` + cursor
   `calc(2 + 0)`) — number-first products, sum parenthesization. Carries the
   serialize-values hot-path risk → scope tight + sweep hard.
2. **`alpha(from …)`** (0/32) — relative-style alpha.
3. **`light-dark()` computed** resolution.
4. **`var()` custom-property** registration / `sibling-index()`.
5. Fresh realm.
