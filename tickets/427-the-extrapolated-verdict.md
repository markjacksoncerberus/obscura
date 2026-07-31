# ⚔️ 427–429 — The Extrapolated Verdict

> **Quests #427–#429, session 2026-07-31 — the interpolation-endpoints arc.**
> The whole `interpolation-testcommon.js` family, swept to its edges —
> `css/css-sizing/`, `css-ui/`, `css-flexbox/`, `css-grid/`, `css-shapes/`,
> `css-color/`, `css-images/`, `css-multicol/`, `filter-effects/`,
> `css-transforms/`.
> **+2448 measured across 83 files**, ZERO regressions.
> **Sixteen files went to 100%.** `filter-interpolation-001` **58 → 144/144**.
> `css-sizing/max-width-interpolation` **297 → 366/366**.

---

## 🧭 How the region was chosen

#424's "next leverage" pointer said: *finish the sweep — ~110
`interpolation-testcommon.js` files that have never once run and need no new
engine work to be measured.*

That turned out to be half right, in the useful direction. The files **did** all
run (that was #424's gift). What they were waiting for was not a fourth
directory of new machinery — it was **three primitives in the shared
interpolation core**, each one wrong in a way that cost every single file in
every single directory a fixed fraction of its subtests.

A baseline over eleven representative files found them sitting between 0% and
81%, and the failures bucketed almost perfectly:

| bucket | share |
|---|---|
| every `at (-0.3)` and `at (1.5)` row, in every file | ~2 of 7 `at` values |
| every `from [initial]` / `[inherit]` / `[unset]` row | 3 row-groups per file |
| every `CSS Transitions` row of a non-interpolable pair | 2 of 6 methods |

None of that is a property gap. All of it is one shared core, three times over.

---

## ⚔️ #427 — A progress outside [0,1] EXTRAPOLATES

`interpolation-testcommon.js` asks for a sample at progress −0.3 by handing the
animation a **deliberately overshooting** easing:

```js
// Constructs a timing function which produces 'y' at x = 0.5
function createEasing(y) {
  var b = (8 * y - 1) / 6;
  return 'cubic-bezier(0, ' + b + ', 1, ' + b + ')';
}
```

A probe confirmed the timing model was already perfect —
`getComputedTiming().progress` came back **−0.29999999999999993**. And the
animated value came back `3px`: the `from` value, flat.

The interval lookup was throwing the overshoot away, twice:

```js
for (let i = 0; i < pts.length; i++) if (pts[i].off <= progress) loI = i;
for (let i = pts.length - 1; i >= 0; i--) if (pts[i].off > progress) hiI = i;
if (loI < 0) return pts[hiI].value;                       // ← progress < 0 falls off the end
…
const local = span > 0 ? Math.min(1, Math.max(0, (progress - lo.off) / span)) : 0;   // ← and is clamped
```

web-animations-1 §effect-value says something quite different. Its "otherwise"
branch is:

> Append to interval endpoints the last keyframe whose computed keyframe offset
> is less than or equal to iteration progress **and less than 1**. If there is no
> such keyframe (because, for example, the iteration progress is negative), add
> the last keyframe whose computed keyframe offset is 0.
> Append to interval endpoints **the next keyframe** in property-specific
> keyframes after the one added in the previous step.

and then, with no clamp anywhere:

> Let interval distance be the result of evaluating
> (iteration progress − start offset) / (end offset − start offset).

So a progress outside [0,1] does not fall off an endpoint — it **extends the
first (or last) interval**. `3px → 23px` at −0.3 is `−3px`, and at 1.5 is
`33px`. That is not an edge case dreamt up by a test: it is what every
`cubic-bezier` with a control point outside the unit square means, and pages use
them for every bounce and overshoot on the web.

Three details make the rewrite behaviour-preserving for the ordinary case:

- **`and less than 1`** is what stops a keyframe at offset 1 from becoming the
  interval *start* (a zero-width interval) when progress runs past 1.
- **the NEXT keyframe by INDEX**, not "the first with a greater offset". For
  overlapping keyframes the two readings agree — the interval below an overlap
  point is still closed by the first of the tied keyframes and the one at or
  above it opened by the last — so #414's tie-break survives untouched.
- The two boundary conditions (`progress < 0` with more than one keyframe at
  offset 0; `progress ≥ 1` with more than one at offset 1) return that single
  boundary keyframe's value, because a stack of keyframes on the boundary leaves
  no single interval to extend.

**And the easing of the keyframe the UA supplied.** css-animations-1 says a
missing `from`/`to` is constructed by the UA from the element's own computed
values — and, being a keyframe of this animation like any other, it carries the
animation's `animation-timing-function`. Ours was built with `easingFn: null`,
i.e. linear. So `@keyframes { to { outline-width: 20px } }` under an
overshooting `animation-timing-function` sat at a flat `15px` — the linear
midpoint — at every sample. The CSS Animations engine now hands the effect the
easing text (`eff._implicitEasing`) and the Web Animations block parses it
lazily, because the two live in separate blocks and cannot see each other's
helpers.

| test | before | after |
|---|---|---|
| `css/css-ui/animation/outline-width-interpolation.html` | 88/148 | **148/148** |
| `css/css-flexbox/animation/flex-grow-interpolation.html` | 100/152 | **152/152** |
| `css/css-color/animation/opacity-interpolation.html` | 80/120 | **120/120** |

---

## ⚔️ #428 — A CSS-wide keyword is a question for the CASCADE

Every interpolation file has three row-groups shaped like `from [initial] to
[23px]`, `from [inherit] …`, `from [unset] …`. All three stepped instead of
sliding: `3px` up to halfway, then `23px`.

`_waComputedValue` — #420's "a keyframe value is a COMPUTED value" hook — handed
`initial` straight to `_normComputed`, which normalises a *value*. `initial` is
not a value. It survived as the string `"initial"`, no length ever parsed out of
it, and `_waInterpolate` fell through to its discrete fallback. The applied
`"initial"` then computed to `3px` through the ordinary cascade, which is
exactly why the failure looked like a plausible animation instead of a broken
one.

The answer is not to compute the keyword, it is to **ask the cascade**, which
already knows: `initial` is the property's initial value, `inherit` is the
PARENT's computed value, `unset` is whichever of the two the property's
inheritance picks, and `revert`/`revert-layer` land where `unset` does (there is
no author origin to fall back to inside a keyframe). The resolution runs **ahead
of** the `_WA_UNCOMPUTED` escape, so `transform: initial` becomes `none` before
the transform list ever sees it.

Inheriting takes the parent's computed value *as it stands* — animations on the
parent included — which is what makes an inheriting keyframe track an animating
ancestor.

**The same keyword, one layer lower.** `filter: initial` was rejected by the
style setter outright:

```js
} else if (!custom && (name === 'filter' || name === 'backdrop-filter')) {
  if (!_isValidFilter(stored)) return;                 // ← no CSS-wide escape
```

`_isValidTransform` right next to it already had the two escapes every property
needs (`var()`/`env()` resolved later; a CSS-wide keyword valid everywhere).
`_isValidFilter` did not — so `filter: initial` never became a declaration at
all. The cascade never saw it, no snapshot recorded it, and nothing downstream
could work out that the author had asked for `none`. **A real-page bug**: any
stylesheet resetting `filter: initial` was silently dropped.

| test | before | after |
|---|---|---|
| `css/css-sizing/animation/max-width-interpolation.html` | 297/366 | **366/366** |
| `css/css-sizing/animation/max-height-interpolation.html` | 297/366 | **366/366** |
| `css/filter-effects/animation/filter-interpolation-001.html` | 58/144 | **144/144** |
| `css/css-multicol/animation/column-rule-color-interpolation.html` | 92/152 | **152/152** |

---

## ⚔️ #429 — A pair that cannot be INTERPOLATED is not a transition

`max-width: auto → 20px`. `column-count: auto → 5`. `flex-basis: auto → 2%`.
Every one of those showed the `from` value for half the duration and then
jumped — and every `CSS Transitions` row of every such pair failed, because the
test expects the `to` value **from the very first frame**.

css-transitions-2 §transition-behavior: a pair of values that cannot be
interpolated is only *transitionable* when the property's `transition-behavior`
says `allow-discrete`. Under the default `normal`, **no transition starts at
all**. That is not a detail — it is the whole observable difference between a
browser that flickers on a class change and one that doesn't.

The engine already knew the answer; it just never asked the question before the
fact. `globalThis._waInterpolable(a, b, name)` is `_waInterpolate`'s own
decision, hoisted: same discrete-property table, same shape test, same
length-percentage fallback. `_csUpdateElement` consults it against the
**before-change** value, and a running transition retargeted at a value it
cannot reach is cancelled for the same reason.

**`visibility` is the exception that proves it.** Two keywords, and it looks as
discrete as anything on the board — but it has its own animation type, under
which any progress strictly between the endpoints is `visible`. Gating it out
took `css/css-transitions/properties-value-001.html` from 560/560 to 558/560 and
killed its `transitionend`; the predicate now names it explicitly. **That single
subtest pair is the reason the held-realm sweep exists.**

### And the filter list that only LOOKED non-interpolable

Making the engine's interpolation model *observable* immediately punished a gap
in it: `filter: none → blur(10px)` is interpolable per spec, our engine could
not do it, so the new gate correctly refused the transition and
`filter-interpolation-003` went **148 → 144**.

The fix is the move #425 already made one realm over, and the memory had already
named it as reusable. filter-effects-1 §animation-of-filters is the *same shape*
as the transform list: two lists interpolate function-by-function, `none` IS the
empty list, and a shorter list is padded at the tail with each missing
function's **lacuna value** — the argument that makes that filter do nothing
(`blur(0px)`, `brightness(1)`, `grayscale(0)`, `hue-rotate(0deg)`, …). Align the
two sides and #417's skeleton kit does every bit of the arithmetic, with no
filter-specific code below.

`drop-shadow()` and `url()` have no scalar lacuna (a shadow's is a colour and
three lengths), so a list needing one to pad stays unaligned and keeps the
discrete fallback — as does anything with a nested function call, which the flat
scan deliberately refuses rather than mis-parses.

| test | before | after |
|---|---|---|
| `css/css-multicol/animation/column-count-interpolation.html` | 153/198 | **198/198** |
| `css/filter-effects/animation/filter-interpolation-003.html` | 148/304 | **288/304** |
| `css/filter-effects/animation/backdrop-filter-interpolation-001.html` | 118/274 | **260/274** |
| `css/filter-effects/animation/backdrop-filter-interpolation-002.html` | 44/82 | **82/82** |
| `css/css-flexbox/animation/order-interpolation.html` | 86/168 | **168/168** |

---

## 📊 Results

**83 files, +2448 subtests, zero regressions.** Sixteen files reached 100%.
Every baseline below was **stash-proved** — `git stash push -- bootstrap.js`,
rebuild, measure, `git stash pop`, rebuild, re-measure.

### css-sizing / css-ui / css-flexbox / css-multicol

| test | before | after | Δ |
|---|---|---|---|
| `css-sizing/animation/max-width-interpolation.html` | 297/366 | **366/366** | +69 |
| `css-sizing/animation/max-height-interpolation.html` | 297/366 | **366/366** | +69 |
| `css-sizing/animation/width-interpolation.html` | 353/456 | 428/456 | +75 |
| `css-sizing/animation/height-interpolation.html` | 356/438 | 430/438 | +74 |
| `css-sizing/animation/min-width-interpolation.html` | 260/366 | 282/366 | +22 |
| `css-sizing/animation/min-height-interpolation.html` | 266/366 | 282/366 | +16 |
| `css-sizing/animation/height-composition.html` | 29/60 | 39/60 | +10 |
| `css-sizing/animation/max-width-composition.html` | 29/60 | 39/60 | +10 |
| `css-sizing/animation/max-height-composition.html` | 28/60 | 36/60 | +8 |
| `css-sizing/animation/width-composition.html` | 23/60 | 31/60 | +8 |
| `css-sizing/animation/min-width-composition.html` | 27/60 | 34/60 | +7 |
| `css-sizing/animation/min-height-composition.html` | 27/60 | 34/60 | +7 |
| `css-sizing/animation/box-sizing-no-interpolation.html` | 36/42 | **42/42** | +6 |
| `css-sizing/animation/height-no-interpolation.html` | 36/42 | **42/42** | +6 |
| `css-ui/animation/outline-width-interpolation.html` | 88/148 | **148/148** | +60 |
| `css-ui/animation/outline-offset-interpolation.html` | 66/120 | **120/120** | +54 |
| `css-ui/animation/outline-color-interpolation.html` | 84/120 | **120/120** | +36 |
| `css-ui/animation/caret-color-interpolation.html` | 134/204 | 148/204 | +14 |
| `css-ui/animation/outline-width-composition.html` | 17/52 | 28/52 | +11 |
| `css-ui/animation/outline-offset-composition.html` | 13/40 | 21/40 | +8 |
| `css-ui/animation/cursor-no-interpolation.html` | 36/42 | **42/42** | +6 |
| `css-flexbox/animation/order-interpolation.html` | 86/168 | **168/168** | +82 |
| `css-flexbox/animation/flex-shrink-interpolation.html` | 92/152 | **152/152** | +60 |
| `css-flexbox/animation/flex-grow-interpolation.html` | 100/152 | **152/152** | +52 |
| `css-flexbox/animation/flex-basis-interpolation.html` | 137/180 | 176/180 | +39 |
| `css-flexbox/animation/discrete-no-interpolation.html` | 72/84 | **84/84** | +12 |
| `css-flexbox/animation/flex-basis-composition.html` | 21/50 | 29/50 | +8 |
| `css-multicol/animation/column-rule-color-interpolation.html` | 92/152 | **152/152** | +60 |
| `css-multicol/animation/columns-interpolation.html` | 302/384 | 360/384 | +58 |
| `css-multicol/animation/column-width-interpolation.html` | 150/222 | 206/222 | +56 |
| `css-multicol/animation/column-count-interpolation.html` | 153/198 | **198/198** | +45 |
| `css-multicol/animation/column-rule-width-interpolation.html` | 57/148 | 82/148 | +25 |
| `css-multicol/animation/discrete-no-interpolation.html` | 108/168 | 126/168 | +18 |

### filter-effects

| test | before | after | Δ |
|---|---|---|---|
| `filter-effects/animation/backdrop-filter-interpolation-001.html` | 118/274 | 260/274 | +142 |
| `filter-effects/animation/filter-interpolation-003.html` | 148/304 | 288/304 | +140 |
| `filter-effects/animation/filter-interpolation-001.html` | 58/144 | **144/144** | +86 |
| `filter-effects/animation/backdrop-filter-interpolation-003.html` | 104/202 | 190/202 | +86 |
| `filter-effects/animation/filter-interpolation-002.html` | 60/162 | 144/162 | +84 |
| `filter-effects/animation/backdrop-filter-interpolation-002.html` | 44/82 | **82/82** | +38 |
| `filter-effects/animation/filter-interpolation-004.html` | 175/200 | 196/200 | +21 |
| `filter-effects/animation/backdrop-filter-interpolation-004.html` | 175/200 | 196/200 | +21 |
| `filter-effects/animation/filter-interpolation-sign-function.html` | 54/72 | **72/72** | +18 |
| `filter-effects/animation/backdrop-filter-composition-001.html` | 80/364 | 95/364 | +15 |
| `filter-effects/animation/color-interpolation-filters-no-interpolation.html` | 36/42 | **42/42** | +6 |
| `filter-effects/animation/filter-composition-001.html` | 18/30 | 21/30 | +3 |

### css-transforms (the realm #424/#425 opened, swept again)

| test | before | after | Δ |
|---|---|---|---|
| `css-transforms/animation/width…` see css-sizing | | | |
| `css-transforms/animation/transform-origin-interpolation.html` | 102/168 | **168/168** | +66 |
| `css-transforms/animation/perspective-interpolation.html` | 177/254 | 234/254 | +57 |
| `css-transforms/animation/translate-interpolation.html` | 176/408 | 228/408 | +52 |
| `css-transforms/animation/rotate-interpolation.html` | 126/360 | 164/360 | +38 |
| `css-transforms/animation/perspective-origin-interpolation.html` | 56/120 | 80/120 | +24 |
| `css-transforms/animation/scale-interpolation.html` | 136/360 | 154/360 | +18 |
| `css-transforms/animation/perspective-origin-composition.html` | 22/56 | 30/56 | +8 |
| `css-transforms/animation/backface-visibility-no-interpolation.html` | 36/42 | **42/42** | +6 |
| `css-transforms/animation/perspective-composition.html` | 18/40 | 24/40 | +6 |
| `css-transforms/animation/rotate-composition.html` | 28/132 | 32/132 | +4 |
| `css-transforms/animation/transform-composition.html` | 17/56 | 19/56 | +2 |

> **Honest note on the chronicle.** #425 recorded `transform-composition` at
> **25/56** and `list-interpolation` at **17/76**. Neither reproduces: a
> stash-proved run of the *unchanged* pre-#427 build gives **17/56** and
> **24/76**. Those two rows in `WPT_PROGRESS.md` were measured against a
> degraded server. The numbers above are the ones a fresh server gives.

### css-grid / css-shapes / css-color / css-images

| test | before | after | Δ |
|---|---|---|---|
| `css-shapes/animation/shape-outside-interpolation.html` | 594/780 | 654/780 | +60 |
| `css-shapes/animation/shape-image-threshold-interpolation.html` | 74/120 | **120/120** | +46 |
| `css-shapes/animation/shape-margin-interpolation.html` | 76/120 | 108/120 | +32 |
| `css-shapes/animation/shape-outside-composition.html` | 46/140 | 59/140 | +13 |
| `css-shapes/animation/shape-margin-composition.html` | 13/40 | 21/40 | +8 |
| `css-grid/animation/grid-no-interpolation.html` | 288/336 | **336/336** | +48 |
| `css-grid/animation/grid-template-columns-interpolation.html` | 488/684 | 524/684 | +36 |
| `css-grid/animation/grid-template-rows-interpolation.html` | 488/684 | 524/684 | +36 |
| `css-grid/animation/grid-template-columns-composition.html` | 88/190 | 94/190 | +6 |
| `css-grid/animation/grid-template-rows-composition.html` | 88/190 | 94/190 | +6 |
| `css-images/animation/object-position-interpolation.html` | 66/112 | **112/112** | +46 |
| `css-images/animation/image-no-interpolation.html` | 72/84 | **84/84** | +12 |
| `css-images/animation/object-position-composition.html` | 22/56 | 30/56 | +8 |
| `css-color/animation/color-interpolation.html` | 36/192 | 48/192 | +12 |
| `css-color/animation/color-composition.html` | 8/20 | 12/20 | +4 |
| `web-animations/animation-model/animation-types/interpolation-per-property-001.html` | 441/466 | 444/466 | +3 |

---

## 🛡️ Zero-regression sweep

Held **identical** after all three quests (the changes touch the shared
interpolation core, the transitions start decision and a style-setter validator,
so the sweep went wide):

`css/css-transitions/properties-value-001` **560/560** · css-transitions
idlharness 64 · css-animations idlharness 98 · web-animations idlharness 188 ·
combining-effects/effect-composition 17/17 ·
Animation/style-change-events 24/25 · Animatable/animate 147 ·
Animatable/getAnimations 22 · KeyframeEffect/setKeyframes 78 ·
css-animations Element-getAnimations 15 · Document-getAnimations 9 ·
CSSAnimation-effect 4 · KeyframeEffect-getKeyframes 9 ·
`css-transforms/animation/matrix-interpolation` 4/4 · list-interpolation 24 ·
scale-composition 8 · translate-composition 10 ·
**filter-effects/parsing** filter-computed 83 · filter-parsing-invalid 25 ·
filter-parsing-valid 87 · backdrop-filter-computed 28 ·
backdrop-filter-parsing-invalid 25 · backdrop-filter-parsing-valid 37 ·
qsa **1975** · classlist **1420** · serialize-values 696 ·
`html/dom/reflection-sections` **5604/5604**.

---

## 🧱 Caps / Next

**Caps named honestly:**

- **`accent-color` and `contrast-color` are not registered properties.**
  `accent-color-interpolation` is **0/204** and moved by exactly nothing this
  session, because `CSS.supports('accent-color', 'green')` is false — the
  property is absent from `_GCS_DEFAULTS`/`_COLOR_PROPS`, so it is stored raw and
  computes to `green` instead of `rgb(0, 128, 0)`. The harness's very first
  assertion (`'to' value should be supported`) fails and takes all 204 with it.
  **This is the single cheapest large win left: a `<color>` property registration.**
- **`aspect-ratio` (0/249) and `object-view-box` (0/48)** are the same shape —
  unregistered properties, whole files dead on the first assertion.
- **`caret-color-composition.html` could-not-run** on both builds (not a
  regression; it is not a timing artefact either — it reproduces on a fresh
  server). Undiagnosed.
- **The `*-composition.html` family is the weakest remaining band** (`width-composition`
  31/60, `shape-outside-composition` 59/140, `backdrop-filter-composition-001`
  95/364, `grid-template-*-composition` 94/190). These exercise
  `animation-composition: add / accumulate` against an underlying value, not
  interpolation.
- **`cubic-bezier` clamps its INPUT to [0,1].** css-easing-1 says an input
  progress outside the unit interval extends the curve linearly along the
  endpoint tangents. Ours returns 0/1. It costs nothing today (the overshoot
  arrives via effect easing, not keyframe easing) but it is a real gap the
  moment a keyframe carries an overshooting easing.
- **`drop-shadow()` has no lacuna in `_waFilterAlign`** — a filter list needing
  one to pad keeps the discrete fallback. Its lacuna is `0 0 0 currentcolor`,
  which needs the colour slot machinery threaded through the alignment.
- Still standing from #424–#426: a transition's `transform` endpoints are the
  RESOLVED matrix, not the computed list; a genuinely mismatched transform
  function pair needs matrix decomposition + quaternion slerp;
  `CSSStyleDeclaration` indexed access missing on a keyframe rule's block;
  `animationiteration` not fired; `::before`/`::after` not flush candidates;
  percentage → pixels needs layout (unwinnable).

**Next leverage, best first:**

1. ⭐ **Register `accent-color`, `contrast-color`, `aspect-ratio` and
   `object-view-box`** — four properties, ~500 dead subtests, no new engine work
   beyond the property tables. The widest cheap tail on the board.
2. **The composition band** — `animation-composition: add/accumulate` against an
   underlying value, ~900 failing subtests across a dozen `*-composition.html`
   files that now all run and all fail the same way.
3. **The transition transform-endpoint exception** (still the smallest
   well-understood win: ~100 subtests, the shape of `_WA_UNCOMPUTED` applied to
   `_csUpdateElement`'s snapshot).
4. **`grid-template-*` interpolation** (524/684 twice over) — `<track-list>`
   interpolation wants the same list-alignment shape a third time.
5. The rest of the CSS Animations lifecycle (`animationiteration`,
   CSSAnimation-playState 0/5, -canceling, -startTime, -ready, -finished).

**Reusable seeded:**

- **`globalThis._waInterpolable(a, b, name)`** — "can these two values be
  interpolated?", the one place any engine outside the Web Animations block can
  ask. The transitions engine is its first caller; `@starting-style` and
  `transition-behavior: allow-discrete` work will be its next.
- **`_waFilterAlign` / `_waFilterItems` / `_WA_FILTER_LACUNA`** — the filter-list
  alignment, and the template for any other comma-free function list that
  interpolates slot-wise with per-function neutrals.
- **`eff._implicitEasing` / `eff._implicitEasingFn`** — the easing a UA-supplied
  boundary keyframe carries.
- The `_isValidTransform`-shaped **two escapes every property validator needs**
  (`var()`/`env()`, and the CSS-wide keywords). `_isValidFilter` was missing
  them; it is worth grepping the other `_isValid*` validators for the same hole.
