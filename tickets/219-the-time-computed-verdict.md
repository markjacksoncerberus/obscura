# Quest #219 — The Time-Computed Verdict

**Realm:** `css/css-transitions/parsing/transition-delay-computed.html` + `css/css-animations/parsing/animation-{delay,duration}-computed.html`
**Hold:** transition-delay-computed 0/1 → **1/1** ✅ · animation-delay-computed 3/4 → **4/4** ✅ · animation-duration-computed 11/15 → **15/15** ✅
**Total:** **+6, ZERO regressions**
**Session:** 2026-07-18

## The gap

#217/#218's next-leverage pointer named the shared `<time>`-unit computed
normalization as an un-worked vein. `_computeTimeValue` already existed (folds a
`<time>` math expression to canonical seconds, `ms`→`s`), but it treated the
whole property value as a SINGLE expression — the grammar is a comma list
(`<time>#`). Three distinct fails fell out of that + two adjacent gaps:

| test | value | expected | got (before) |
|---|---|---|---|
| transition-delay-computed | `-500ms, calc(2 * 3s)` | `-0.5s, 6s` | `-500ms, calc(2 * 3s)` |
| animation-duration-computed | `20s, 10s` | `20s, 10s` | `20s` (truncated to layer 1) |
| animation-delay-computed | `calc(10s + (sign(2cqw - 10px) * 5s))` | `5s` | `calc(10s + (5s * sign(2cqw - 10px)))` |
| animation-duration-computed | `calc(10s + (sign(2cqw - 10px) * 5s))` | `5s` | (same) |
| animation-duration-computed | `auto` | `0s` | `auto` |
| animation-duration-computed | `auto, auto` | `0s, 0s` | `auto, auto` |

Root causes:
1. **No comma handling.** `_evalMath` on a whole `<time>#` string parsed only the
   first layer (`20s, 10s` → `20s`) or returned null and kept the value verbatim
   (`-500ms, calc(2 * 3s)`).
2. **No container-unit fold.** The math opts lacked `cqZero`, so `2cqw` was an
   unresolvable unit → `_evalMath` returned null → the value stayed a canonicalized
   `calc(…)`. With no container `cqw` resolves to 0, so `sign(2cqw - 10px)` =
   `sign(-10px)` = -1, and `10s + (-1 * 5s)` = `5s`.
3. **`animation-duration: auto` coupling.** `auto` is animation-duration's initial;
   its computed value depends on `animation-timeline`.

## The animation-duration `auto` rule (the subtle one)

From `animation-duration-computed.html`'s `test_auto_duration`:

| duration | timeline | computed |
|---|---|---|
| `auto` | `auto` (initial) | `0s` |
| `auto` | `auto, auto` | `auto` |
| `auto` | `--t` | `auto` |
| `auto` | `--t, --t2` | `auto` |
| `auto` | `none` | `auto` |
| `auto` | `scroll()` | `auto` |
| `auto` | `view()` | `auto` |
| `0s` | `auto` | `0s` |

The rule that fits every row: a computed `auto` duration resolves to `0s` **iff
`animation-timeline` is exactly the initial single `auto`** (a document /
time-driven timeline). A timeline LIST (even `auto, auto`) or any scroll-driven
timeline keeps `auto`. The default (unset) timeline is single `auto`, so the
top-level `auto`→`0s` and `auto, auto`→`0s, 0s` rows (default timeline) resolve
each `auto` layer to `0s`.

`animation-timeline` is not a validated property here, so the generic setProperty
fall-through stores it verbatim in `_props`; `_specifiedDecl(el, 'animation-timeline')`
reads it back (via the `el.style.getPropertyValue` fallback).

## The work (`crates/obscura-js/js/bootstrap.js`, `_computeTimeValue` ~18456)

Rewrote `_computeTimeValue(v, el)` → `_computeTimeValue(v, el, kebab)`:
- `_commaSplitTop` the value; resolve each layer independently; rejoin with `, `.
- Per layer: `auto` (animation-duration only) → `0s` if the timeline coupling
  says so, else `auto`; otherwise `_evalMath(_balanceParens(it), …)` folded to
  `_serNumber(_nfClamp(sec)) + 's'`, with `_canonMathExpr` as the symbolic
  fallback when a layer can't resolve.
- Added `cqZero: true` to the math opts (already passing `time`/`lengths`/`emPx`/
  `vw`/`vh`/`nonFinite`/sibling opts) — collapses an unresolved container unit to 0
  so a `sign(2cqw - 10px)` gate folds to its sign. No `<time>` value uses container
  units outside these sign gates, so plain values stay byte-identical.
- `isDur` (kebab === 'animation-duration') computes `autoZero` once from the
  specified `animation-timeline` (single `auto`/unset ⇒ true).

Call site (~18623) passes `kebab`.

## Results

| Test | Before | After |
|---|:---:|:---:|
| transition-delay-computed | 0/1 | **1/1** ✅ |
| animation-delay-computed | 3/4 | **4/4** ✅ |
| animation-duration-computed | 11/15 | **15/15** ✅ |

**+6, ZERO regressions.** The change is isolated to `_computeTimeValue`, which is
called ONLY for the four `_TIME_COMPUTED_PROPS`. Held: transition-duration-computed
3/3, transition-computed 10/10, animation-computed 15/15, every `*-valid` at
baseline (animation-duration-valid 3/3, animation-delay-valid 4/4,
transition-delay-valid 4/4), animation-shorthand 36/36, transition-shorthand
18/18, animation-range-shorthand 133/133, animation-valid 12/12,
font-variation-settings-computed 8/8, qsa 1975, DOMTokenList-value 1/1,
DOMTokenList-stringifier 1/1, getComputedStyle-property-order 1/1.

## Caps / Next

- **The `<time>`-computed vein is now clean** across transition/animation delay &
  duration. No remaining `<time>#` computed fails known.
- **NEXT LEVERAGE:** the cqw-`sign()` fold now handled for `<time>` is ALSO named
  for `tab-size-computed` (a `<length>` going through `_trComp`/`_clampNegPx`, NOT
  `_computeTimeValue`) — baseline `css/css-values/*` or `css/css-sizing/` for the
  same `sign(2cqw - 10px)` pattern in a length context. OR a NEW `css/*/parsing/`
  dir (baseline `-valid`/`-computed` too — most `-invalid` are already green via
  generic setProperty rejection, so the tell in a mature dir is a
  `-valid`/`-computed` canonicalization gap). OR `animation-timeline` /
  `animation-composition` as their own validated properties (check
  `css/scroll-animations/` + `css-animations/`). grep `_computeTimeValue`.
