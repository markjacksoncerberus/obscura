# Quest #215 — The Animation-Range Shorthand Expansion

**Realm:** `css/css-animations/parsing/animation-range-shorthand.html`
**Hold:** 56/133 → **133/133** (✅ 100%) — **+77, ZERO regressions**
**Session:** 2026-07-18

## The gap

`animation-range-shorthand.html` has four test families. #212 turned every
`test_valid_value` (specified serialization) green by storing the shorthand as a
single canonical **blob** under `_props['animation-range']`. But the file also has:

- **`test_shorthand_value`** — sets `.style.animationRange`, then reads back each
  `.style.animationRangeStart` / `.animationRangeEnd`, and asserts (in the "unrelated
  longhands" case) that after clearing those two longhands `.style.length` returns to
  its pre-set value. A blob leaves the longhands **empty** and leaves `.length`
  **off by one** → all these failed.
- **`test_computed_value`** — reads `getComputedStyle(el)['animation-range']`; the
  shorthand wasn't in `_CSS_KNOWN_PROPS`, so `'animation-range' in getComputedStyle`
  was false ("doesn't seem to be supported").

Both demand the shorthand actually **expand into its two longhands** (the `offset`
pattern), not blob-store.

## The work

Reworked `animation-range` from blob storage to full shorthand→longhand expansion
in `crates/obscura-js/js/bootstrap.js`:

1. **`_expandAnimRange(value)`** (beside `_canonAnimRangeShorthand`, ~15706) — splits
   each comma layer into a start side + optional end side via `_splitAnimRangeSide`.
   An **omitted end side** defaults to the start's SAME `<timeline-range-name>`
   (`cover 50%` → end `cover`, the name at its 100% default), or to `normal` when the
   start has no range name (`100px` → end `normal`). Returns
   `{ 'animation-range-start', 'animation-range-end' }` (each a comma list), or null.
2. **setProperty** (inline ~1017 + API ~1541) — expands into `_props` longhands (no
   `animation-range` key); CSS-wide / var() kept per-longhand.
3. **`_combineAnimRangeSides` + `_serAnimRangeFromLonghands`** — reconstruct the
   shorthand from its two longhands, **re-omitting the redundant end**: identical to
   the start, the start-name's 100% default (bare name), or — for a nameless start —
   its far-end default `normal`/`100%` (`0% 100%` → `0%`). Used by the shorthand
   getter, `removeProperty`, and getComputedStyle.
4. **getComputedStyle** `resolve('animation-range')` reconstructs from the already-
   computed longhands (offsets resolved to px, default offsets re-dropped). Registered
   `animation-range` in `_CSS_KNOWN_PROPS`.

### Bonus root-cause fix — `_resolvePctLengthCalc`

The last holdout was `10% calc(70% + 10% * sign(100em - 1px))` → expected computed
`10% 80%`, got `10% 70%`. The shared mixed-`%`+length calc decomposer only regex-
matched a **bare** `P%` term; a `%`-times-unitless term (`10% * sign(1em-1px)`) fell
into the length bucket evaluated at %-base 0, where `10%` → 0, dropping the whole
percentage. Added a **3-probe linear decomposition**: for a term linear in the
%-base `b` (value(b) = slope·b + const), split into `slope·100%` (percentage) +
`const px` (length). Guarded to terms with **no value-kink function**
(min/max/clamp/abs, whose output bends between probe points) and confirmed linear
across bases 0/1/2. `sign()`/`round()` with %-free arguments are constant multipliers
→ safe. This is a correctness fix in a **shared** helper (positions, translates,
gradients all route through it), so it was stash-proved inert (below).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `animation-range-shorthand.html` | 56/133 | **133/133** ✅ |

## Zero-regression proof

Stash-proved the `_resolvePctLengthCalc` change is **inert** (identical with/without):
`minmax-length-percent-computed` 30/50, `round-mod-rem-computed` 233/243,
`background-position-computed` 32/32, `clip-path-computed` 19/21,
`transform-computed` 3/3. Held: `animation-range-{start,end}-computed` 30/29,
`-valid` 26/24, `-invalid` 11/14 (#212/#213 all 100%), `animation-valid` 12/12,
`animation-computed` 14/15, qsa 1975, classlist 1420,
`getComputedStyle-property-order` 1/1.

## Caps / Next

- **Quest #216 — the `animation` 11-longhand shorthand expansion.**
  `animation-shorthand.html` 0/36. `test_shorthand_value` sets `animation` and reads
  back the 8 per-layer longhands (duration/timing-function/delay/iteration-count/
  direction/fill-mode/play-state/name, each a comma list) **plus** the reset-only
  `animation-timeline: auto` / `animation-range-start: normal` /
  `animation-range-end: normal` (single initial value regardless of layer count).
  Needs the same expansion treatment as `animation-range` but with 11 longhands, and
  reconstruction must reproduce #211's `animation-valid` 12/12 + `animation-computed`
  14/15 (which currently read from the `animation` blob — switching to expansion means
  the shorthand getter/computed must reconstruct from the 8 per-layer longhands via
  `_serSingleAnimation`). Tension: `test_shorthand_value`'s "unrelated longhands" case
  forbids leaving an `animation` blob key.
- `transition-shorthand.html` 0/18 is the SAME unimplemented pattern for `transition`
  (a separate future quest).
- grep `_expandAnimRange`.
