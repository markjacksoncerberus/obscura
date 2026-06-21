# Scroll 63 — The Offset Verdict ⚔️

> *A mask offset, a motion path's anchor — three more properties that name a point
> with the same `<position>` grammar Quest #61 already taught Obscura to speak.
> `mask-position` was stored uncanonical; `offset-anchor`/`offset-position` had no
> computed value at all. The engine was built; these were the seats still empty
> at the table.*

**Realm:** `css/css-masking/parsing/mask-position-*`, `css/motion/parsing/offset-{anchor,position}-*`
**Banner secured:** 2026-06-21 · **+40**

## The gap

Quest #61/#62's "next leverage (2)" named *more `<position>` props*:
`mask-position`, `offset-anchor`, `offset-position` all share the grammar.

| Test | Before |
|------|:------:|
| `mask-position-valid` | 12/23 |
| `offset-anchor-computed` | 0/14 |
| `offset-position-computed` | 0/15 |
| `offset-anchor-parsing-valid` | 11/11 (already canonical) |
| `offset-position-parsing-valid` | 12/12 (already canonical) |

- **`mask-position`** is the full `<position>#` grammar (comma-layered), identical
  to `background-position`. It was stored verbatim, so any value needing the
  horizontal-first reorder or the omitted-axis `center` fill failed
  (`10%`→ expected `10% center`, `bottom right`→`right bottom`,
  `top, center, left`→`center top, center center, left center`). Its **computed**
  companion `mask-position-computed.html` is a genuine wpt.live **404** (no such
  test) — unwinnable, not a regression.
- **`offset-anchor` / `offset-position`** are a full `<position>` whose computed
  value resolves like `object-position` (keywords→%, a `%`+length `calc()` kept
  symbolic). They weren't in `_GCS_DEFAULTS`, so `getComputedStyle` returned `""`
  → 0/14 and 0/15. Their **valid** tests were already canonical (passed verbatim).

Two computed subtleties the existing engine didn't yet cover — both surfaced only
because these tests exercise `em` inside offsets, where `object-position` had used
only px:

- a **far-edge length offset** must resolve to px: `bottom 20em` (font-size 40px)
  → `calc(100% - 800px)`, not `calc(100% - 20em)`.
- a **`calc()` mixing one percentage with length terms** must collapse the lengths
  to px while keeping the `%` symbolic, percentage-first:
  `calc(20% - 5em)` → `calc(20% - 200px)`, `calc(5em + 20%)` → `calc(20% + 200px)`.

## The fix (pure JS, `bootstrap.js`, no new Rust)

1. Added `mask-position`, `offset-anchor`, `offset-position` to
   **`_POSITION_PROPS`** (so they route through the #61 specified + computed
   `<position>` serializers), and registered `offset-anchor` (initial `auto`) /
   `offset-position` (initial `normal`) in **`_GCS_DEFAULTS`** so `getComputedStyle`
   resolves them. `mask-position` is *not* registered (no computed test) — it only
   needs the specified path. `auto`/`normal` parse-fail in `_parsePosition` →
   pass through verbatim.
2. **`_posCompComputed` far-edge length** now resolves the offset to px via
   `_evalMath(off, 0, {lengths, emPx})` (px stays px → no change to existing
   behaviour; em/rem/… → px), the sign folded into the calc operator.
3. New **`_splitSumTerms(body)`** — splits a `calc()` body into flat top-level
   additive `{sign, text}` terms (splitting only on a `+`/`-` at paren depth 0,
   whitespace-surrounded per the calc grammar; nested groups kept whole).
4. New **`_resolvePctLengthCalc(s, emPx)`** — sums the percentage terms and the
   (px-resolved) length terms of such a calc and emits canonical
   `calc(P% ± Lpx)` (percentage first), or `null` if it isn't a flat sum of
   `%`/resolvable-length terms (→ caller keeps the verbatim canon). Wired into
   `_posComputeLen`'s `%`-branch.

## Result

| Test | Before | After |
|------|:------:|:-----:|
| `mask-position-valid` | 12/23 | **23/23** |
| `offset-anchor-computed` | 0/14 | **14/14** |
| `offset-position-computed` | 0/15 | **15/15** |
| `offset-anchor-parsing-valid` | 11/11 | **11/11** |
| `offset-position-parsing-valid` | 12/12 | **12/12** |

**+40. Zero regressions** — the `<position>` family that shares this code held
byte-identical: background-position 31/32, object-position 18/16, transform-origin
16/23, perspective-origin 18/21. The px-resolution refinements are strictly
px-preserving (px input → identical output), so no existing case shifted. Swept:
serialize-values 695, shorthand-serialization 7, csstext 7, var-cssText 9,
var-substitution-background 8 / -shorthands 51, color-computed 16,
css-color/css-fonts inheritance 4/39, matches 669, createElement 147; obscura-dom
unit 40/40.

## Caps / Next leverage

1. **gradient `at <position>` + gradient canonicalization** — STILL the single
   widest unopened tail, and it reuses this `<position>` engine.
   `gradient-position-valid` (14/18 — needs gradient-param parsing to reach the
   `at` clause, ~+4) + `gradient-position-computed` (**0/43** — additionally needs
   colour computation of stops `red`→`rgb(255, 0, 0)` AND dropping the default
   `at center center`, i.e. #57's standing gradient-canon cap; foundational for
   `background-image`/`mask-image` computed). The `_splitSumTerms`/
   `_resolvePctLengthCalc` helpers added here are reusable for gradient stop
   `calc()` positions.
2. **comprehensive valid-property registry** — csstext unknown-prop drop +
   per-prop validation (serialize-values hot-path risk — must be a superset).
3. **`mask` / `offset` shorthands** — expand to these longhands (the #58
   shorthand-expansion engine is the template).
4. fresh realm (`fetch/`, `html/dom/` reflection).
