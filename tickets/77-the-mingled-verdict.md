# Quest #77 — The Mingled Verdict

> *Two colours, mingled by name into one. The author writes `color-mix(in srgb,
> 70% red, 50% blue)` and the page that reads it back deserves the canonical
> phrasing — the method tidied, the components named in their true sRGB, the
> percentages set in their proper place — even before a single channel is mixed.
> Today Obscura speaks the specified value of `color-mix()` plainly, and names —
> honestly — the cross-space arithmetic it still leaves for the next knight.*

**Realm:** `css/css-color/parsing/color-valid-color-mix-function` (the **specified**
value of `color-mix()`)
**Hold:** **674/677** (+424)
**Status:** ✅ SECURED — pure JS (`crates/obscura-js/js/bootstrap.js`), no new Rust.

---

## The gap

Quest #76 named the `color-mix()` / relative-color family as the giant next prize.
A baseline sweep split it cleanly in two:

- **COMPUTED** (`color-computed-color-mix-function` **0/948**) — every subtest fails
  because the mixed colour is never resolved. Winning these needs the real
  cross-space colour-maths engine (sRGB↔Lab↔OKLab↔XYZ matrices, gamut mapping,
  per-space interpolation, premultiplied alpha). Left as a documented cap.
- **SPECIFIED** (`color-valid-color-mix-function` **250/677**) — `color-mix()` was
  stored verbatim by `_canonColorSpecified` (the `out === s` guard returns the
  original bytes for any modern function). But the specified serialization is **pure
  syntax canonicalization — no colour maths at all.** That's the 427-fail tail this
  quest takes.

## The insight

Read straight from the WPT generator, the specified serialization of `color-mix()`
is three independent rewrites:

1. **Interpolation method** `in <space> [<hue> hue]?`:
   - keep the colour space (color-mix NEVER does the default-space-drop a gradient
     does — `in srgb` stays `in srgb`),
   - alias `xyz`→`xyz-d65`,
   - drop the default `shorter hue` (keep `longer`/`increasing`/`decreasing hue`),
   - **drop the whole `in oklab`** — `oklab` is color-mix's *default* space, so
     `color-mix(in oklab, …)` serializes with no method at all,
   - the method may also be **absent** (`color-mix(<c1>, <c2>)` is accepted).
2. **Each component `<color>`** through the EXISTING `_canonColorSpecified` —
   `hsl(120deg 10% 20%)`→`rgb(46, 56, 46)`, `hwb(120deg 10% 20%)`→`rgb(26, 204, 26)`,
   `oklab(100 0.365 -0.16)`→`oklab(1 0.365 -0.16)` (L clamped), `currentcolor`/`red`
   and the modern `lab()`/`color()` forms kept. No new colour code — the #68/#75/#76
   engine already does all of it.
3. **Each `<percentage>`** moved AFTER its colour (`70% red`→`red 70%`):
   - a `calc()`/`var()` percentage is kept **symbolic in place** with no
     normalization (`red calc(20%), blue` round-trips),
   - otherwise resolve, **fill** the omitted side to `100% − other`
     (`… 25%, …`→`… 25%, … 75%`), and **drop a resulting 50%/50% pair** entirely
     (`red 50%, blue`→`red, blue`).

## The fix

A self-contained `color-mix()` canonicalizer in `bootstrap.js`, dispatched from
`_canonColorSpecified` so it fires **everywhere a `<color>` is canonicalized** (color
props, shorthands, `image()`, content) — not bolted onto one call site:

```js
// inside _canonColorSpecified, after the modern-colour branch:
if (low.startsWith('color-mix(')) {
  const cm = _canonColorMix(s);
  if (cm !== null) return cm;
}
```

- **`_canonColorMix(value)`** — `_commaSplitTop` the inner into `[method?, c1, c2]`
  (2 parts ⇒ missing method, 3 parts ⇒ method + two colours), canonicalize method +
  each component + percentages, recombine. Returns `null` (→ verbatim, no regression)
  on any unparseable shape.
- **`_canonColorMixMethod(toks)`** — validates `in <space> [<hue> hue]?` against the
  gradient colour-space set plus `display-p3-linear`; returns `''` for the default
  `in oklab`, `'in <space>…'` otherwise, `null` if invalid.
- **`_splitMixComponent(arg)`** — paren-aware `_wsTokens`, separating the lone
  percentage token (plain `%` or a math/var function via `_isMixPct`) from the colour.

Everything reuses existing primitives (`_commaSplitTop`, `_wsTokens`,
`_canonColorSpecified`, `_GRADIENT_COLOR_SPACES`/`_GRADIENT_POLAR_SPACES`/
`_HUE_METHODS`). `_GRADIENT_COLOR_SPACES` is referenced **lazily** (it's defined
later in the file) and **left untouched** so gradient serialization can't shift.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `color-valid-color-mix-function` | 250/677 | **674/677** (+424) |

Examples now canonical:
`color-mix(in srgb, 70% red, 50% blue)`→`color-mix(in srgb, red 70%, blue 50%)`;
`color-mix(in hsl, hsl(120deg 10% 20%), hsl(30deg 30% 40%))`→`color-mix(in hsl,
rgb(46, 56, 46), rgb(133, 102, 71))`;
`color-mix(in oklab, oklab(0.1 0.2 0.3) 25%, oklab(0.5 0.6 0.7))`→`color-mix(oklab(0.1
0.2 0.3) 25%, oklab(0.5 0.6 0.7) 75%)`;
`color-mix(in hsl, red 50%, blue)`→`color-mix(in hsl, red, blue)`.

## Zero-regression sweep

color-valid 17/17, color-computed 16/16, **color-computed-color-mix-function 0/948
UNCHANGED** (the maths cap — proof the computed path is untouched), color-valid-lab
116/150, color-computed-lab 112/120, color-computed-rgb 95/99, color-valid-hwb 28/38,
serialize-values 696/697 (its colour list sets no `color-mix()` → unchanged),
gradient-interpolation-method-valid 1398/1398, gradient-position-valid 18/18,
image-function-valid 13/13, content-valid 46/46, cursor-valid 45/46,
Document-createElement 147/147; `cargo test -p obscura-dom --lib` 40/40.

## Caps / Next

- **HONEST CAP — the 3 remaining fails are the N-ary color-mix forms.** A 1-colour
  mix `color-mix(in srgb, red 100%)`→`color-mix(in srgb, red)`, and a 3-colour mix
  with percentage distribution `color-mix(in srgb, red 50%, green, blue)`→
  `color-mix(in srgb, red 50%, green 25%, blue 25%)` (the remaining 50% split evenly
  across the un-percentaged colours). This is a distinct percentage-distribution
  feature over an arbitrary colour list, not the binary `color-mix()` this quest
  serializes — a small standalone follow-up.
- **The COMPUTED `color-mix()` (0/948) + relative-color `rgb(from …)` computed
  (0/1169)** — the real cross-space colour-maths engine: convert both colours into the
  interpolation space, interpolate per channel (premultiplied alpha, polar hue
  shortest/longest arc), gamut-map back, serialize. The single biggest standing prize
  on the frontier, but a substantial build (matrices for every predefined space).
- **Relative-color SPECIFIED (`color-valid-relative-color` 556/1147)** — the natural
  sibling to this quest: also syntax-only (the origin colour resolved, channel
  keywords `r`/`g`/`b`/`h`/… substituted, `calc()` over them kept symbolic). No
  cross-space maths, ~591 fails reachable.
- **`alpha(from …)`** (0/32) — relative-style alpha.
- **Wave-2 specified-`calc()` serializer** (~107, the #76 cap).
- Fresh realm (`fetch/`, `html/dom/` reflection).
