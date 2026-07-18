# Quest #216 — The Animation Shorthand Expansion

**Realm:** `css/css-animations/parsing/animation-shorthand.html` (+ `animation-computed.html`)
**Hold:** `animation-shorthand` 0/36 → **36/36** ✅ · `animation-computed` 14/15 → **15/15** ✅
**Total:** **+37, ZERO regressions**
**Session:** 2026-07-18

## The gap

`animation-shorthand.html` uses `test_shorthand_value('animation', value, longhands)`:
it sets `.style.animation`, reads back each `.style.animationDuration` /
`.animationDelay` / … , and (in the "unrelated longhands" case) clears those
longhands and asserts `.style.length` returns to its pre-set value. #211 stored
`animation` as a single **blob** under `_props['animation']`, so every longhand
read back `""` and `.length` was off by one → 0/36.

The shorthand sets **11 longhands**: the 8 per-layer
(duration/timing-function/delay/iteration-count/direction/fill-mode/play-state/name,
each a comma list) plus the **reset-only** `animation-timeline: auto`,
`animation-range-start: normal`, `animation-range-end: normal` (a single initial
value regardless of layer count — the shorthand takes no values for them).

## The work (`crates/obscura-js/js/bootstrap.js`)

1. **`_expandAnimation(value)`** (beside `_canonAnimationShorthand`, ~15650) — reuses
   #211's `_parseSingleAnimation` per comma layer, collects the 8 per-layer components
   into comma lists, and appends the 3 reset-only longhands at their initial values.
   Returns a `{ longhand: value }` map, or null.
2. **setProperty** (inline ~1005 + API ~1533) — expands concrete values into the 11
   `_props` longhands (no `animation` key). CSS-wide / var() / math-fn kept as one
   `animation` blob key (and the longhands cleared).
3. **getter / `removeProperty` / getComputedStyle** reconstruct via
   **`_serAnimationFromLonghands(get, computed)`** — requires the 8 per-layer longhands
   agree on layer count AND the reset-only longhands at their initial, else `''`.
4. **`_serSingleAnimation(c, computed)`** parameterized: the SPECIFIED initial duration
   is `auto`, but at COMPUTED time it resolves to `0s`. `computed` treats BOTH
   `auto`/`0s` as the omittable initial (so `animation: none` → computed `none`, not
   `0s`) yet still prints the duration when a delay prints (positional disambiguation).
   getComputedStyle ALWAYS reconstructs from the resolved longhands, so a CSS-wide
   `animation` blob (`animation: initial`) can't shadow a separately-overridden
   longhand (`animation: initial; animation-delay: 1s` → `0s 1s`).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `animation-shorthand.html` | 0/36 | **36/36** ✅ |
| `animation-computed.html` | 14/15 | **15/15** ✅ (bonus +1) |

The bonus: #211's last cap ("Animation with a delay but no duration" → `0s 1s`) was
the getComputedStyle reconstruction gap this quest closes.

## Zero-regression proof

`animation-valid` 12/12, every animation longhand valid/computed/invalid at the
#210/#211 baseline (name-computed 26/27, duration-computed 11/15, delay-computed 3/4),
`animation-range-shorthand` 133/133 (#215), qsa 1975, classlist 1420,
`getComputedStyle-property-order` 1/1, `cssom/shorthand-serialization` 7/7,
`cssom/serialize-values` 695/697 (2 pre-existing `background-image`/`font-family`
fails, unrelated to animation).

## Caps / Next

- **`transition` shorthand expansion.** `transition-shorthand.html` 0/18 is the
  IDENTICAL unimplemented pattern — `transition` is stored as a blob, and
  `test_shorthand_value` reads back transition-property/duration/timing-function/delay.
  `transition` is ALREADY in `_SHORTHAND_LONGHANDS` and `_expandTransition` exists
  (used by the cascade for computed longhands); the gap is the same wiring this quest
  added for `animation`: setProperty expands into `_props`, and the getter /
  `removeProperty` / getComputedStyle reconstruct from those longhands (a
  `_serTransitionFromLonghands`).
- OR a NEW `css/*/parsing/` dir (baseline `*-invalid` 0/N first).
- grep `_expandAnimation`.
