# Scroll 62 — The Anchored Verdict ⚔️

> *transform-origin and perspective-origin name the pivot a transform turns
> about. Obscura stored them verbatim, so every page that anchored a rotation or
> a perspective to `left top` or `bottom right 7px` came back uncanonical — and
> its computed value, which the spec resolves to plain absolute lengths, never
> resolved at all.*

**Realm:** `css/css-transforms/parsing/{transform,perspective}-origin-{valid,computed}.html`
**Banner secured:** 2026-06-21 · **+39**

## The gap

Quest #61 built a reusable CSS `<position>` value serializer for
`object-position`/`background-position`. The "next leverage (2)" it named was
*more `<position>` props* — `transform-origin`/`perspective-origin` share the
grammar. Both were stored verbatim (not in `_GCS_DEFAULTS`, so
`getComputedStyle` returned `""`), so:

| Test | Before |
|------|:------:|
| `transform-origin-valid` | 5/16 |
| `transform-origin-computed` | 0/23 |
| `perspective-origin-valid` | 17/18 |
| `perspective-origin-computed` | 17/21 |

Two grammars, not one:

- **`transform-origin`** is the **restricted** two-value `<position>` form — *no*
  edge-offset 3/4-token grammar — **plus an optional trailing Z `<length>`**
  (`left top 10px`, `-1px -2px -3px`).
- **`perspective-origin`** is the **full** `<position>` (edge-offset forms like
  `bottom 10% right 20%`) and **never** a Z.

And — unlike object-position, which keeps percentages as percentages — both
origins' **computed** value resolves to **absolute lengths against the element's
box** (`10%` on a 200px-wide box → `20px`). Obscura has no layout, but the test
sets `#target{width:200px;height:300px}` explicitly, and
`getComputedStyle(el).width` already returns `"200px"` — so the box dimensions are
readable via `_computedPropOf(el,'width'/'height')`.

## The fix (pure JS, `bootstrap.js`, no new Rust)

A small origin engine layered on #61's `<position>` primitives, scoped to
`_ORIGIN_PROPS = {transform-origin, perspective-origin}`:

1. **`_parseOriginPos(value, allowZ)`** — the restricted two-value form: peel an
   optional trailing Z `<length>` (`_isOriginLength`: a dimension / bare `0` /
   math fn, never a percentage) when 3 tokens, then parse 1–2 keyword/`<lp>`
   components with the same axis-assignment + reorder + conflict rules as
   `_parsePosition`'s ≤2-token branch.
2. **`_parseOrigin(kebab, value)`** dispatches: `transform-origin` →
   `_parseOriginPos(value, true)`; `perspective-origin` → the full
   **`_parsePosition`** (reused verbatim — gives the edge-offset forms for free).
3. **`_serializeOriginSpecified`** — `_posCompSpec(h) ' ' _posCompSpec(v)` (the #61
   component serializer, which already handles edge offsets), then append the Z if
   present. Wired into `setProperty` + `_parseStyleDecls` (right after the
   `_POSITION_PROPS` branch). `center left 6px` → `left center 6px`,
   `bottom 10% right 20%` → `right 20% bottom 10%`.
4. **`_originAxisPx(c, base, emPx)`** — computed length (px) of one axis against
   `base` (box width or height): keyword → fraction of base; an edge offset is
   measured from that edge (`right`/`bottom` → `base − offset`); `<lp>`/math
   resolve against base via `_evalMath` (`{lengths, emPx}`); `null` when
   unresolvable (auto box) → component falls back to its specified text.
5. **`_serializeOriginComputed`** — reads `width`/`height`/`font-size` off the
   element, formats `H V` (+ Z resolved as a pure length), wired into
   `_normComputed`.
6. Registered `transform-origin`/`perspective-origin` in `_GCS_DEFAULTS` (initial
   `50% 50%`) so they're known props and route through `_computedPropOf` →
   `_normComputed`.

`right 30% top -60px` → `140px -60px` (200−0.3·200=140; top offset −60 passes
through). `calc(-100% + 10px - 0.5em)` on the 200px box, em=40px →
−200+10−20 = `-210px`.

## Result

| Test | Before | After |
|------|:------:|:-----:|
| `transform-origin-valid` | 5/16 | **16/16** |
| `transform-origin-computed` | 0/23 | **23/23** |
| `perspective-origin-valid` | 17/18 | **18/18** |
| `perspective-origin-computed` | 17/21 | **21/21** |

**+39. Zero regressions** — swept serialize-values 695, object-position
18/16, background-position 31/32, shorthand-serialization 7, csstext 7,
var-cssText 9, var-substitution-background 8 / -shorthands 51 / -definition 71,
color-computed 16 / -rgb 95, fonts/flexbox/scroll-snap inheritance 39/20/38,
matches 669, valid-invalid 30; obscura-dom unit 40/40. The shared `_parsePosition`
was reused **read-only** (not modified) → object/background-position byte-identical.

## Caps / Next leverage

1. **gradient `at <position>` + gradient canonicalization** — STILL the single
   widest unopened tail adjacent here, and it reuses this exact engine.
   `gradient-position-valid` (14/18 — needs gradient-param parsing to reach the
   `at` clause, ~+4) + `gradient-position-computed` (**0/43** — additionally needs
   colour computation of stops `red`→`rgb(255, 0, 0)` AND dropping the default
   `at center center`, i.e. #57's standing gradient-canon cap, foundational for
   `background-image`/`mask-image` computed).
2. **`mask-position` / `offset-anchor`** — share the full `<position>` grammar;
   `mask-position` is comma-layered like background-position. Baseline first, then
   add to `_POSITION_PROPS`/`_ORIGIN_PROPS` for near-free greens. (Computed
   `mask-position` likely keeps percentages, like background-position — confirm.)
3. **comprehensive valid-property registry** — csstext unknown-prop drop +
   per-prop validation (serialize-values hot-path risk — must be a superset).
4. fresh realm (`fetch/`, `html/dom/` reflection).
