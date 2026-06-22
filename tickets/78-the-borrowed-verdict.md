# Quest #78 — The Borrowed Verdict

> *A colour that borrows from another: `rgb(from rebeccapurple r g b)` takes a
> known colour, names its channels, and re-spells them. The page that reads it
> back deserves the canonical phrasing — the function named plainly, the origin
> resolved to its true form — even before a single channel is recomputed. Today
> Obscura speaks the specified value of a relative `<color>` honestly, and names —
> as ever — the channel arithmetic it still leaves for the next knight.*

**Realm:** `css/css-color/parsing/color-valid-relative-color` (the **specified**
value of relative `<color>` — `<fn>(from <origin> <channels>)`)
**Hold:** **1127/1147** (+571)
**Status:** ✅ SECURED — pure JS (`crates/obscura-js/js/bootstrap.js`), no new Rust.

---

## The gap

Quest #77 named relative-colour SPECIFIED as the natural syntax-only sibling of the
`color-mix()` work. A baseline sweep split the family cleanly:

- **COMPUTED** (`color-computed-relative-color` **0/1169**) — every subtest fails
  because the borrowed channels are never resolved against the origin. Winning these
  needs the real cross-space colour-maths engine (sRGB↔Lab↔OKLab↔XYZ matrices, gamut,
  per-channel `r`/`g`/`b`/`alpha` substitution, then interpolation/serialization in
  the target space). Left as a documented cap — shared with computed `color-mix()`.
- **SPECIFIED** (`color-valid-relative-color` **556/1147**) — relative colours were
  stored verbatim by `_canonColorSpecified` (the `out === s` guard returns the
  original bytes for any modern function). The ones that already passed were the
  "no modification" cases (`rgb(from rebeccapurple r g b)` round-trips). The 591 fails
  needed only **syntax canonicalization — no channel maths.** That's the tail this
  quest takes.

## The key insight — the comparator is fuzzy

The test uses `fuzzy_test_valid_color(input, expected)` with
`set_up_fuzzy_color_test` (in `css/support/color-testcommon.js`). The comparator:

```js
function getNonNumbers(color) { return color.replace(/[0-9\.]/g, ''); }   // strip digits + dots
// then: assert_array_approx_equals(getNumbers(actual), getNumbers(expected), 0.01)
//       assert_equals(getNonNumbers(actual), getNonNumbers(expected))
```

So **only the non-numeric *skeleton* must match exactly** (function name, channel
keywords, `%`, `deg`, `none`, `from`, parens, commas, slashes, colour-space names),
and the numbers need only be approximately equal. `.25` vs `0.25` doesn't matter;
`r g b / .20` vs `r g b / 0.20` doesn't matter. That collapses the work to two
skeleton-changing transforms:

1. **Function name** — `rgba`/`hsla` fold to `rgb`/`hsl`, ASCII-lowercased
   (`RGBA(from …)`→`rgb(from …)`, `LCH(…)`→`lch(…)`).
2. **Origin colour** — canonicalized: `rgb(20%, 40%, 60%, 80%)`→`rgba(51, 102, 153,
   0.8)`, `hsl(120deg 20% 50% / .5)`→`rgba(102, 153, 102, 0.5)`, `lab(25 20 50 / 40%)`→
   `lab(25 20 50 / 0.4)`, `lab(200 300 400 / 500%)`→`lab(100 300 400)`, `hwb(…)`→its
   sRGB rgba, `rgb(none none none)`→`rgb(0, 0, 0)`, `currentColor`→`currentcolor`,
   `color-mix(…)`/named colours kept symbolic, nested `rgb(from …)` canonicalized
   recursively. **This is exactly what `_canonColorSpecified` already does.**

Plus one space-token rule for `color()`: the colour-space token *after* the origin
aliases `xyz`→`xyz-d65` (`color(from color(xyz …) xyz x y z)`→`… xyz-d65 … xyz-d65 …`).

The channel keywords (`r`/`g`/`b`/`alpha`/`none`/permutations/replacement
`<number>`/`<percentage>`) are kept **verbatim** — the fuzzy compare means no number
normalization is required.

## The fix (pure JS, no new Rust)

New `_canonRelativeColor(value)` + `_REL_COLOR_FNS`, placed next to the other colour
canonicalizers and dispatched from `_canonColorSpecified` **before** the modern/legacy
branches (the `from` keyword isn't a number/percentage a legacy parser would touch),
gated on `/^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*from\s/i`:

```js
const _canonRelativeColor = (value) => {
  const s = String(value).trim();
  const lp = s.indexOf('(');
  if (lp <= 0 || !s.endsWith(')')) return null;
  const fn = s.slice(0, lp).toLowerCase();
  if (!_REL_COLOR_FNS.has(fn)) return null;
  if (/\bvar\(/i.test(s)) return null;                    // pending-substitution → verbatim
  const toks = _wsTokens(s.slice(lp + 1, -1).trim());     // paren-aware: origin is one token
  if (toks.length < 2 || toks[0].toLowerCase() !== 'from') return null;
  const origin = _canonColorSpecified(toks[1]);           // recursive
  let rest = toks.slice(2);
  if (fn === 'color' && rest.length) {                    // color(): alias the space token
    const space = rest[0].toLowerCase();
    rest = [space === 'xyz' ? 'xyz-d65' : space, ...rest.slice(1)];
  }
  const outFn = fn === 'rgba' ? 'rgb' : fn === 'hsla' ? 'hsl' : fn;
  return outFn + '(from ' + origin + (rest.length ? ' ' + rest.join(' ') : '') + ')';
};
```

Why the **`var()` bail** matters: a value containing `var()` is a pending-substitution
token stream the engine keeps byte-for-byte (case and calc-operand order preserved). The
spec-example tests like `LCH(from var(--accent) l c calc(h + 180))` are single-arg
(expected === input, uppercase `LCH` and all) — if we lowercased/normalized them we'd
*regress* those. Bailing to `null` lets `_canonColorSpecified` fall through to the
verbatim path.

`_wsTokens` is paren-aware, so an origin like `rgb(20%, 40%, 60%, 80%)` or a nested
`rgb(from rebeccapurple r g b)` is a single token; the `/` before alpha is its own
token and survives the `rest.join(' ')`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `color-valid-relative-color` | 556/1147 | **1127/1147** (+571) |

## Zero-regression sweep

- `color-valid` 17/17 · `color-computed` 16/16
- `color-valid-color-mix-function` 674/677 · **`color-computed-color-mix-function`
  0/948 UNCHANGED** · **`color-computed-relative-color` 0/1169 UNCHANGED** (the maths
  caps = proof the computed path is untouched)
- `color-valid-lab` 116/150 · `color-valid-color-function` 277/340 · `color-valid-hwb`
  28/38 (all at their #76 baselines — non-relative, unaffected)
- `gradient-interpolation-method-valid` 1398/1398 · `image-function-valid` 13/13 ·
  `Document-createElement` 147/147
- `cargo test -p obscura-dom --lib` 40/40
- `serialize-values` came back wpt.live HTTP 404 (`bodyLen=42`) this session — serving
  flux, NOT a regression; provably byte-identical because its fixed colours
  (`black`/`red`/`rgb(50, 75, 100)`/`rgba(5, 7, 10, 0.5)`) don't match the `from` gate.

## Honest cap — the 20 remaining fails

All are the **`calc()`-operand-reordering** forms, which DO change the skeleton:

- `calc(g * 2)`→`calc(2 * g)` (number-first product ordering)
- `calc(l - 20)`→`calc(-20 + l)` (subtraction → number-first sum)
- `calc(g * .5 + g * .5)`→`calc((0.5 * g) + (0.5 * g))` (sum parenthesization)

These need the **Wave-2 specified-`calc()` serializer** — the same primitive named as
a cap by #76 (the calc-bearing `color-valid-{lab,color-function,hwb}` channels) and #74
(`calc(2 + 0)`→`calc(2)`). It carries the serialize-values calc hot-path risk, so it
stays its own quest. A handful of the spec-example fails are the pre-existing
var-substitution exact-number quirk (`.3`→`0.3` from `_canonStandardValue`, compared
*non-fuzzily* on the pending-substitution path) — also unrelated to relative colour.

## Caps / Next leverage

1. **The COMPUTED relative-colour (0/1169) + COMPUTED `color-mix()` (0/948)** — the
   real cross-space colour-maths engine (sRGB↔Lab↔OKLab↔XYZ matrices, gamut, per-channel
   substitution, interpolation, premultiplied alpha). The biggest standing prize, a
   substantial build, shared between both realms.
2. **The Wave-2 specified-`calc()` serializer** — number-first product ordering, sum
   parenthesization, constant-subexpr simplification, `%`/dimension/symbolic preservation.
   Closes ~107 across `color-valid-{lab,color-function,hwb}`, these ~20 relative forms,
   and the cursor-valid `calc(2 + 0)`. Must not regress serialize-values' calc hot-path.
3. **`alpha(from …)`** (0/32) — relative-style alpha (origin-colour resolution + the
   `alpha` keyword in calc).
4. **Fresh realm** (`fetch/`, `html/dom/` reflection).
