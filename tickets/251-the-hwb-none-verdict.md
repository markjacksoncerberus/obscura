# Quest #251 — The HWB-None Verdict

**Realm:** `css/css-color/parsing/color-valid-hwb.html`
**Result:** 26/38 → **38/38 (+12), ZERO regressions.**

## The gap

Took #250's next-leverage (the last of the three symbolic-serialization families).
color-valid-hwb was 26/38; all 12 fails were an hwb() with a **`none`** component,
which must keep its own modern `hwb(...)` form (a `none` can't survive conversion to
sRGB):

```
hwb(none none none)          → hwb(none none none)
hwb(120 30% 50% / none)      → hwb(120 30 50 / none)   (w/b %-stripped)
hwb(none 100% 50% / none)    → hwb(none 100 50 / none)
```

We instead treated `none`→0 and resolved to sRGB (`hwb(none none none)`→`rgb(255,0,0)`).

## Why this was a one-liner

`_hwbSpecified` (the own-space serializer, from Quest #81) ALREADY produces exactly the
right output — `none` kept, `%` whiteness/blackness → bare `<number>`, alpha per the
modern rule. And the **unresolvable-calc** hwb cases already routed to it (a `sign()`
channel makes `num()` return null → `_computeHwb` falls back to `_hwbSpecified`). The
only missing trigger was `none`: `_computeHwb`'s inner `num('none')` returns **0** (not
null), so a bare-`none` hwb sailed past the null-fallback and resolved to sRGB.

## The fix (`bootstrap.js`, one guard)

At the top of `_computeHwb`, before the `num()`-based resolution, in SPECIFIED mode:

```js
if (specified && parts.some((p) => String(p).trim().toLowerCase() === 'none'))
  return _hwbSpecified(parts);
```

Gated on `specified` so the COMPUTED sRGB path (`getComputedStyle`) is untouched — a
computed hwb still resolves `none`→0 as before. The folding-`calc(infinity)` cases stay
on the resolve path (no `none`, calc folds → num returns a finite/∞ value, not null).

## Zero-regression sweep

color-valid-hwb 26→38 (100%). Held: color-computed-hwb 47/56 (pre-existing computed
caps — my trigger is specified-only), color-valid-rgb 70/70 (#249), color-valid-hsl
59/59 (#250), color-valid-lab 150/150, color-computed-color-function 466/468,
color-computed-lab 112/120, color-valid 17/17, color-computed 16/16, color-invalid-hwb
6/6, color-invalid 10/11, qsa 1975, classlist 1420, serialize-values 695/697,
gradient-interpolation-method-valid 1398/1398.

## The three-quest arc (#249–#251) — css-color VALID symbolic vein SECURED

CSS Color 4 resolved-value serialization for the sRGB-family functions is now complete
across all three:
- **rgb()** — legacy sRGB normally (bare `none`→0); MODERN symbolic only for an
  unresolvable calc.
- **hsl()** — own-space for `none` OR unresolvable calc; folding calc resolves to sRGB.
- **hwb()** — own-space for `none` OR unresolvable calc; folding calc resolves to sRGB.

## Next leverage

The css-color/parsing INVALID and VALID veins are now fully secured (color-valid-rgb/
hsl/hwb/lab/color-function all 100%; the invalid sweep all 100% bar the one `<angle>²`
cap). Remaining css-color gaps are COMPUTED-side and largely unwinnable:
- `color-computed-rgb` 79/99, `color-computed-hwb` 47/56, `color-computed-lab` 112/120,
  `color-computed-color-function` 466/468 — the fails are `2cqw`/container-query units
  (no layout) and a handful of other computed-only edge cases.
- `color-computed-hsl.html` could-not-run (pre-existing harness page-load gap).

**NEXT: a NEW `css/*/parsing/` dir.** The tell in a mature dir: a `-invalid` at 0/N
(raw-store) or a `-valid`/`-computed` canon gap. grep `_hwbSpecified`/`_hslSpecified`/
`_rgbModern`.
