# Quest #217 — The Transition Shorthand Expansion

**Realm:** `css/css-transitions/parsing/transition-shorthand.html` (+ `transition-behavior.html`, `transition-computed.html`)
**Hold:** `transition-shorthand` 0/18 → **18/18** ✅ · `transition-behavior` 4/28 → **28/28** ✅ · `transition-computed` 8/10 → **10/10** ✅
**Total:** **+44, ZERO regressions**
**Session:** 2026-07-18

## The gap

`transition-shorthand.html` uses `test_shorthand_value('transition', value, longhands)`:
it sets `.style.transition`, reads back each `.style.transitionProperty` /
`.transitionDuration` / … , and (in the "unrelated longhands" case) clears those
longhands and asserts `.style.length` returns to its pre-set value. #209 stored
`transition` as a single **blob** under `_props['transition']`, so every longhand
read back `""` and `.length` was off by one → 0/18. This is the IDENTICAL pattern
#216 solved for `animation`.

The `transition` shorthand sets **five per-layer longhands**:
`transition-property`, `transition-duration`, `transition-timing-function`,
`transition-delay`, and `transition-behavior` (each a comma list, one entry per
`<single-transition>` layer).

`transition-behavior` (`normal | allow-discrete`, CSS Transitions 2) was a raw-store
longhand — its `transition-behavior.html` was 4/28. That file tests both the
longhand (valid + computed) AND the shorthand carrying `allow-discrete` anywhere in
a layer with reordering across multiple layers.

## The work (`crates/obscura-js/js/bootstrap.js`)

1. **`transition-behavior` longhand** — registered `transition-behavior: normal` in
   `_GCS_DEFAULTS` (~8667; does not inherit → computed-supported + enumerated), and
   added `_TRANS_BEHAVIOR_KW = {normal, allow-discrete}` to the generic
   `_ANIM_KEYWORD_LISTS` comma-keyword-list validator (`<keyword>#`).
2. **`_parseSingleTransition` / `_serSingleTransition`** (~15432) — added a `behavior`
   slot. The behavior keyword may appear ANYWHERE in a layer and WINS over the
   `<custom-ident>` property fallback (so `normal opacity` → property `opacity`,
   behavior `normal`); it serializes LAST, after the delay
   (`allow-discrete display 3s ease-in-out 1s` → `display 3s ease-in-out 1s allow-discrete`).
3. **`_TRANSITION_LONGHANDS` + `_expandTransitionShort(value)`** (~15478, beside
   `_canonTransitionShorthand`) — reuses `_parseSingleTransition` per comma layer,
   collects the five per-layer components into comma lists. Returns a
   `{ longhand: value }` map, or null for an invalid `<single-transition>#`.
4. **setProperty** (inline ~973 + API ~1505) — expands concrete values into the five
   `_props` longhands (no `transition` key). CSS-wide / var() / math-fn kept as one
   `transition` blob key (and the five longhands cleared).
5. **getter / `removeProperty` / getComputedStyle** reconstruct via
   **`_serTransitionFromLonghands(get)`** — requires the five longhands agree on layer
   count and each be present, else `''`. In getComputedStyle unset longhands resolve
   to their initials, so the DEFAULT reconstructs to `all` (was `none` from the blob
   default) and a CSS-wide `transition` blob no longer shadows an overridden longhand
   (`transition: initial; transition-delay: 1s` → `0s 1s`).

Unlike `_serSingleAnimation`, `transition` needs no `computed` flag — its initial
duration is `0s` in both specified and computed modes, and the delay-but-no-duration
disambiguation (`0s 1s`) already falls out of `if (dur !== '0s' || delay !== '0s')`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `transition-shorthand.html` | 0/18 | **18/18** ✅ |
| `transition-behavior.html` | 4/28 | **28/28** ✅ (bonus +24) |
| `transition-computed.html` | 8/10 | **10/10** ✅ (bonus +2) |

## Zero-regression proof

`animation-shorthand` 36/36, `animation-computed` 15/15, `animation-valid` 12/12,
`animation-range-shorthand` 133/133; every transition longhand at baseline
(`transition-property` valid 7/7 · invalid 15/15 · computed 2/2, `transition-duration`
3/3 · 5/5 · 3/3, `transition-delay` valid 4/4 · invalid 5/5, `transition-timing-function`
valid 22/22 · invalid 25/25 · computed 18/22); `transition-valid` 10/10,
`transition-invalid` 5/5; qsa 1975, classlist 1420, `DOMTokenList-value` 1/1,
`getComputedStyle-property-order` 1/1, `cssom/shorthand-serialization` 7/7,
`cssom/serialize-values` 695/697 (2 pre-existing `background-image`/`font-family`
fails, unrelated).

## Caps / Next

- **`transition-delay-computed` 0/1** — a pre-existing `<time>`-unit computed
  conversion gap in the longhand computed path (`-500ms`→`-0.5s`,
  `calc(2 * 3s)`→`6s`). Untouched here, NOT a regression. Several
  `animation-*-computed` fails share the same `ms`→`s` normalization + calc-fold gap
  — a shared `<time>` computed resolver would sweep them together.
- **Next leverage:** a NEW `css/*/parsing/` dir (baseline `*-invalid` 0/N first for
  the raw-store tell); OR `animation-timeline` / `animation-composition` (check
  `css/scroll-animations/` + css-animations first); OR the `<time>`-unit computed
  normalization above. grep `_expandTransitionShort`.
