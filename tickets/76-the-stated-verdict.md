# Quest #76 — The Stated Verdict

> *A colour declared is a colour kept. When an author writes `lab(50% 50% -20%)`
> or `color(srgb 10% 10% 10%)`, the page that reads it back deserves the canonical
> truth — not the raw bytes echoed. Today Obscura speaks the specified value of the
> modern tongues plainly, and names — honestly — the calc()-shaped tail it leaves
> for the next knight.*

**Realm:** `css/css-color/parsing/color-valid-{lab,color-function,hwb}` (the
**specified** value of the modern `<color>` functions — `lab`/`lch`/`oklab`/`oklch`/
`color(<space> …)`/`hwb()`)
**Hold:** color-valid-lab **116/150**, color-valid-color-function **277/340**,
color-valid-hwb **28/38** (+286)
**Status:** ✅ SECURED — pure JS (`crates/obscura-js/js/bootstrap.js`), no new Rust.

---

## The gap

Quest #75 landed the **computed** value of the modern colour functions, but
deliberately left the **specified** path (`_canonColorSpecified`) keeping them
verbatim — the `*-valid-*` tests assert a *different* serialization than the
`*-computed-*` tests, so #75 scoped its change to `_normComputed` only to guarantee
zero regression on the valid tests.

That left the valid tests un-canonicalized:

- `color-valid-lab` **54/150** — `lab(50% 50% -20%)` echoed verbatim instead of
  `lab(50 62.5 -25)`.
- `color-valid-color-function` **81/340** — `color(srgb 10% 10% 10%)` echoed
  instead of `color(srgb 0.1 0.1 0.1)`.
- `color-valid-hwb` **0/38** — `hwb(120 30% 50%)` echoed instead of
  `rgb(77, 128, 77)` (hwb's specified value is sRGB).

~393 fails — the widest clean tail on the frontier, named by #75 as "next leverage (1)".

## The insight

For the modern colour functions whose channels are all **plain**
`<number>`/`<percentage>`/`<angle>`/`none` — i.e. **no nested math function** — the
SPECIFIED value serializes **identically** to the computed value:

- resolve each `%` against the channel's reference (lab L → 100, a/b → ±125; oklab
  L → 1, a/b → ±0.4; lch C → 150; oklch C → 0.4; `color()` → 1),
- clamp per channel where the spec clamps (L ∈ [0,100]; **`color()` channels are
  unclamped** — `color(srgb 200 200 200)` stays, `color(srgb 400%)`→`4`),
- normalize a polar hue into [0, 360) at 6 significant figures
  (`lch(10 20 1.28rad)`→`lch(10 20 73.3386)`),
- drop an alpha ≥ 1, clamp alpha into [0,1], `%`→number,
- and `hwb()` converts to sRGB `rgb()`/`rgba()`.

Every one of those rules is **already implemented** in `_computeModernColor`
(`_modernChannel`/`_modernAlpha`/`_computeHwb`). So the specified path can simply
**reuse it** — for the all-bare case.

The one divergence is `calc()`: at specified time a channel carrying `calc()` must
be **preserved** — the wrapper kept, left **unclamped**, with any `%` left
**symbolic** — e.g. `lab(calc(50%) 50% 0.5)`→`lab(calc(50%) 62.5 0.5)` (the
`calc(50%)` stays, only the sibling bare `50%` resolves). `_computeModernColor`
would wrongly *evaluate and clamp* those. So we gate the reuse on the body having
**no nested `(`**.

## The fix

One surgical change in `_canonColorSpecified` (pure JS, no new Rust): after the
keyword short-circuit, if the value is a function call whose body contains **no
nested `(`** (`s.indexOf('(', lp0 + 1) === -1`), route it through
`_computeModernColor` and return the result when non-null. Anything with a nested
`(` (a calc/min/… channel) — or a legacy form — falls through to the existing
`_computeColor` path, byte-identical to before.

```js
const lp0 = s.indexOf('(');
if (lp0 > 0 && s.endsWith(')') && s.indexOf('(', lp0 + 1) === -1) {
  const m = _computeModernColor(s);
  if (m !== null) return m;
}
const out = _computeColor(s);
```

Because `_computeModernColor` returns `null` for legacy/named/hex colours (and for
relative `rgb(from …)` / `color-mix()`, which have nested parens anyway), every
non-modern colour and every calc-bearing modern colour is untouched.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `color-valid-lab` | 54/150 | **116/150** (+62) |
| `color-valid-color-function` | 81/340 | **277/340** (+196) |
| `color-valid-hwb` | 0/38 | **28/38** (+28) |

**+286.**

## Zero-regression sweep

color-valid 17/17, color-computed 16/16, **color-computed-lab 112 / -hwb 54 /
-color-function 466 UNCHANGED** (the same helper called from a new site — proof the
computed path is untouched), color-computed-rgb 95/99,
gradient-interpolation-method-valid 1398/1398, gradient-position-valid 18/18,
image-function-valid 13/13, serialize-values 696/697 (its `_COLOR_PROPS` colours are
all legacy → `_computeModernColor` returns null → unchanged),
variable-substitution-background-properties 10/10, content-valid 46/46, cursor-valid
45/46, Document-createElement 147/147; `cargo test -p obscura-dom --lib` 40/40.

## Caps / Next

- **HONEST CAP — the 107 remaining fails are ALL calc-bearing channels.** Examples:
  `lab(calc(50 * 3) …)`→`lab(calc(150) …)` (pure-number arithmetic simplified,
  **not** clamped), `lab(calc(50%) …)`→`lab(calc(50%) …)` (percentage kept symbolic),
  `color(srgb calc(50% + (10% * sign(1em - 10px))) …)` (unresolvable `1em` kept,
  re-parenthesized), `lch(… calc(20deg * 2) …)`→`calc(40deg)`. Winning these needs a
  full **specified-time CSS math serializer** — simplify constant sub-expressions to a
  single value, keep `%`/dimensions/unresolvable terms symbolic, serialize canonically
  (with the `a + (b * c)` paren convention). A distinct primitive that also carries the
  standing serialize-values calc hot-path risk (696/697 has a pre-existing additive-
  ordering cap) → its **own quest** (it would also close the `calc(2 + 0)`→`calc(2)`
  cursor-valid fail).
- **`color-mix()` (0/948) + relative-color `rgb(from …)` (0/1169)** — the giant prize,
  needs real cross-space conversion math (matrices/gamut/interpolation), a much bigger
  engine.
- **`alpha(from …)`** (0/32) — relative-style alpha.
- Fresh realm (`fetch/`, `html/dom/` reflection).
