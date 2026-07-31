# 430 — The Registered Verdict

> *Quests #430–#432 · session 2026-07-31 · branch `engine-per-page-threads`*
>
> **A property the engine has never heard of does not fail a test. It fails every
> test in the file, on the first line, before the subject even comes up.**

---

## The gap

#427–#429 left a ⭐ pointing at four properties named in its CAPS section:
`accent-color` 0/204, `aspect-ratio` 0/249, `object-view-box` 0/48, and
`contrast-color`. Each whole file was dead, and all of them died the same way —
`interpolation-testcommon.js` opens every single subtest with

```js
assert_true(CSS.supports(property, to), "'to' value should be supported");
```

so a property missing from the registry takes the entire file with it before any
animation runs. ~500 subtests, no engine work claimed beyond the property tables.

**The first correction is an honest one: it is THREE properties, not four.**
`css/css-color/animation/contrast-color-interpolation.html` is a **reftest**
(`<link rel="match" href="…ref-filled-green-100px-square-only.html">`) with no
testharness at all. It is not 0/N — it has no N. It cannot be measured by
`wpt_run.py` and is not winnable by this campaign's method. The
`contrast-color()` *function* has been implemented since #83; the CAPS entry
conflated the function with a property that does not exist.

## The work

### #430 — `accent-color`: a colour property with a keyword in it

css-ui-4 §widget-accent: `auto | <color>`, **inherits**, initial `auto`.

Registration is four tables and one branch, but the branch is the whole point.
`accent-color` sits in **both** `_CSSUI_VALIDATED` and `_COLOR_PROPS`, exactly as
`caret-color` and `outline-color` do — the CSS-UI dispatch runs first and
validates the grammar (the generic colour gate validates nothing, so it would
accept `none` and `50%`), and `_COLOR_PROPS` membership is what earns the
property its computed-value dispatch, its `CSS.supports` entry, and the
animation model's permission to read a bare ident as a colour name.

The one thing that must not be fudged: **`auto` is a keyword, not a colour.**
Handing it to `_computeColorFull` would either mangle it or — worse — resolve it
to something plausible, and the animation model would then cheerfully interpolate
a keyword against `green`. So `_COLOR_AUTO_PROPS` short-circuits it to itself
ahead of the colour path, in the two places that must agree: the computed-value
dispatch in `_normComputed` and the `var()`-substitution validity gate in
`_computedPropOf`. A set rather than two `name === 'accent-color'` tests, because
those two places drifting apart is exactly the bug this shape prevents.

`_INHERITED_PROPS` is not decoration here. The test's `from: 'unset'` row expects
the **parent's** `accent-color` (`blue`), which is only right if the property
inherits.

**0/204 → 204/204.**

### #431 — `aspect-ratio`: a ratio interpolates LOGARITHMICALLY

css-sizing-4: `auto || <ratio>`, not inherited, initial `auto`. `<ratio>` is
`<number [0,∞]> [ / <number [0,∞]> ]?`, and css-values-4 serializes it with
**both** numbers — so a bare `0.5` is `0.5 / 1`.

The registration is ordinary (`_parseRatioValue` / `_serRatioValue`, a
`_canonCssUi` branch, a `_normComputed` branch). **The interesting part is that
the generic interpolation kit would have found a perfectly good skeleton here and
quietly done the wrong arithmetic in it.** `0.5 / 1` and `2 / 1` split into two
numeric slots against identical literals; the slot model lerps each and reports
`1.25 / 1` at the halfway point. The right answer is `1 / 1` — the square.

css-values-4 §combine-ratio interpolates **the logarithms**. That is not a
nicety: it is what makes the midpoint between 1:2 and 2:1 be the shape a human
would draw. So `aspect-ratio` is asked about **before** the shape test, never
after it.

Two pairs have no logarithm and are honestly discrete, and the test insists on
both:

- **a DEGENERATE ratio** — either number `0` or infinite (§combine-ratio says so
  in as many words), which is why `1 / 0 → 1 / 1` steps rather than slides;
- **disagreeing `auto` keywords** — `auto` is a keyword, not a magnitude, so
  `auto` and `2 / 1` are simply different kinds of value.

Both fall out of one predicate, `_waRatioPair`, which `_waInterpolate` and
`_waInterpolable` share — so the CSS Transitions rows agree with the Web
Animations rows for free (#429's rule: a pair that cannot be interpolated is not
a transition).

Finally, **`<ratio>` defines no addition.** css-values-4 §not-additive:
*"its addition operation is simply Vresult = Va"* — and in §combining-effects Va
is the **underlying** value, not the keyframe's. So an `add` keyframe on a ratio
contributes nothing and the value underneath shows through unchanged.
`_WA_NON_ADDITIVE_PROPS` names that rule where the next non-additive type can
join it. (Note the general fallback in `_waAdd` still returns the *keyframe*
value for anything it cannot add — see Caps.)

**0/249 → 249/249.**

### #431½ — `animation-composition` was parsed, computed, reflected, and ignored

Two subtests refused to go green: the `Compositing CSS Animations` rows. Chasing
them found something much bigger than aspect-ratio.

`interpolation-testcommon.js` drives the CSS-Animations composition method by
writing the composite operation **inside each keyframe block**:

```css
@keyframes animation7 {
  from { aspect-ratio: 0.5 / 1; animation-composition: replace }
  to   { aspect-ratio: 1 / 1;   animation-composition: add }
}
```

css-animations-2 §animation-composition: declared inside a keyframe, it is **that
keyframe's own** composite operation — the declarative spelling of
`{ composite: 'add' }` on a Web Animations keyframe. Its three values *are* the
`KeyframeEffect` ones, so a valid longhand needs no translation. It only needed
to be **read**.

It was not. `animation-composition` sits in `_CS_NEVER` (a property must never
animate itself), and `_caKeyframesOf` consults `_CS_NEVER` *before* it could ever
look at the value — so the declaration was dropped one line too early and every
`add`/`accumulate` keyframe silently **replaced**. `animation-timing-function`
was intercepted right above it; its neighbour never was.

Two lines in `_caKeyframesOf` (intercept → `f.composite`), plus the element-level
longhand wired through `_caUpdateElement` → `_caStart` → `KeyframeEffect`'s
`composite` option and into `_caSpec` so a change to it is noticed.

**That is the whole `*-composition.html` band. Baseline 989 → 1591, +602 across
29 files, twelve of them to 100%** — measured on both builds via `git stash`.

### #432 — `object-view-box`: reuse the shape engine, refuse its computed rewrite

css-images-4: `none | <basic-shape-rect>` = `inset()` | `rect()` | `xywh()`. Not
inherited, initial `none`.

The grammar was already modelled — `_opShape`, the engine `clip-path` and
`offset-path` share — so this is a thin wrapper over it, with **one deliberate
difference**. `clip-path` and `offset-path` rewrite `rect()`/`xywh()` into
`inset()` at computed-value time. `object-view-box` does not: its computed value
is the function the author wrote, with each `<length-percentage>` resolved.

The rewrite is *affine*, so it commutes with linear interpolation and the tests
would have passed either way — which is exactly why it is worth naming. A test
whose expectations round-trip through our own `getComputedStyle` cannot catch a
serialization that is merely self-consistent. `getComputedStyle(img).objectViewBox`
returning an `inset()` nobody asked for is a lie only a real page would find.

So: validate through `_opShape` in its **specified** mode (the only mode that
keeps the function), then resolve each length token with `_opLp`, passing `auto`,
`round` and the radius clause's `/` through untouched.

Interpolation needed nothing — `inset(0px)` against `inset(20px)` is #417's
skeleton kit doing exactly what it was built for.

**0/48 → 48/48.**

---

## Results

All rows **stash-proved** (`git stash push -- bootstrap.js` → rebuild → measure →
`git stash pop` → rebuild → re-measure) on a **fresh server**.

### The three registrations

| Test | Before | After | |
|------|:------:|:-----:|---|
| `css/css-ui/animation/accent-color-interpolation.html` | 0/204 | **204/204** | ✅ 100% |
| `css/css-sizing/animation/aspect-ratio-interpolation.html` | 0/249 | **249/249** | ✅ 100% |
| `css/css-images/animation/object-view-box-interpolation.html` | 0/48 | **48/48** | ✅ 100% |

### The composition band (`animation-composition` inside a keyframe)

| Test | Before | After | |
|------|:------:|:-----:|---|
| `css/filter-effects/animation/backdrop-filter-composition-001.html` | 95/364 | **137/364** | +42 |
| `css/css-transforms/animation/transform-rotate-composition.html` | 57/126 | **114/126** | +57 |
| `css/css-shapes/animation/shape-outside-composition.html` | 59/140 | **102/140** | +43 |
| `css/css-grid/animation/grid-template-columns-composition.html` | 94/190 | **122/190** | +28 |
| `css/css-grid/animation/grid-template-rows-composition.html` | 94/190 | **122/190** | +28 |
| `css/css-transforms/animation/transform-scale-composition.html` | 28/98 | **56/98** | +28 |
| `css/css-transforms/animation/rotate-composition.html` | 32/132 | **54/132** | +22 |
| `css/css-sizing/animation/width-composition.html` | 31/60 | **54/60** | +23 |
| `css/css-transforms/animation/transform-skew-composition.html` | 21/86 | **42/86** | +21 |
| `css/css-transforms/animation/transform-composition.html` | 19/56 | **36/56** | +17 |
| `css/css-transforms/animation/transform-matrix-composition.html` | 26/112 | **36/112** | +10 |
| `css/css-transforms/animation/transform-origin-composition.html` | 13/56 | **22/56** | +9 |
| `css/css-transforms/animation/transform-perspective-composition.html` | 4/28 | **8/28** | +4 |
| `css/css-sizing/animation/min-width-composition.html` | 34/60 | **52/60** | +18 |
| `css/css-sizing/animation/min-height-composition.html` | 34/60 | **52/60** | +18 |
| `css/css-transforms/animation/perspective-origin-composition.html` | 30/56 | **56/56** | ✅ 100% |
| `css/css-images/animation/object-position-composition.html` | 30/56 | **56/56** | ✅ 100% |
| `css/css-ui/animation/outline-width-composition.html` | 28/52 | **52/52** | ✅ 100% |
| `css/css-sizing/animation/height-composition.html` | 39/60 | **60/60** | ✅ 100% |
| `css/css-sizing/animation/max-width-composition.html` | 39/60 | **60/60** | ✅ 100% |
| `css/css-sizing/animation/max-height-composition.html` | 36/60 | **60/60** | ✅ 100% |
| `css/css-flexbox/animation/flex-basis-composition.html` | 29/50 | **50/50** | ✅ 100% |
| `css/css-ui/animation/outline-offset-composition.html` | 21/40 | **40/40** | ✅ 100% |
| `css/css-shapes/animation/shape-margin-composition.html` | 21/40 | **40/40** | ✅ 100% |
| `css/css-transforms/animation/perspective-composition.html` | 24/40 | **40/40** | ✅ 100% |
| `css/filter-effects/animation/filter-composition-001.html` | 21/30 | **30/30** | ✅ 100% |
| `css/css-color/animation/color-composition.html` | 12/20 | **20/20** | ✅ 100% |
| `css/css-transforms/animation/scale-composition.html` | 8/80 | 8/80 | — |
| `css/css-transforms/animation/translate-composition.html` | 10/112 | 10/112 | — |

**Band total: 989 → 1591 (+602).**

### Carried along

| Test | Before | After | |
|------|:------:|:-----:|---|
| `css/css-transitions/properties-value-003.html` | 80/122 | **86/122** | +6 |
| `css/css-animations/KeyframeEffect-getKeyframes.tentative.html` | 9/32 | **11/32** | +2 |
| `css/css-animations/CSSAnimation-effect.tentative.html` | 4/8 | **5/8** | +1 |

**SESSION TOTAL: +1112 measured.** Fifteen files to 100%.

---

## Zero-regression sweep

Held identical (the changes touch `_GCS_DEFAULTS` — which grows
`_COMPUTED_STD_NAMES` and `CSS.supports` — plus `_COLOR_PROPS`,
`_INHERITED_PROPS`, `_canonCssUi`, `_normComputed`, the `var()` validity gate,
`_waInterpolate`/`_waInterpolable`/`_waAdd` and the CSS-Animations keyframe
reader):

qsa **1975**, classlist **1420**, createElement 147, createElementNS 596,
Element-matches 669, url-origin 406, cssom serialize-values 696, cssom idlharness
493, cssstyledeclaration-all-shorthand 27/27, CSSStyleDeclaration-iterator 1/1,
cssstyledeclaration-csstext 11/11, cssom-setProperty-shorthand 76/76,
reflection-sections **5604/5604**, font-computed 315/315,
**css-transitions properties-value-001 560/560**, css-transitions idlharness 64,
css-animations idlharness 98, Animation/style-change-events 24/25,
Animatable/animate 147, Animatable/getAnimations 22, setKeyframes 78,
effect-composition **17/17**, interpolation-per-property-001 444, -002 340,
effect-value-iteration-composite-operation 20/38, CSSTransition-canceling 11/11,
css-animations Element-getAnimations 15 / Document-getAnimations 9,
caret-color-interpolation 148, outline-color-interpolation **120/120**,
width-interpolation 428, shape-outside-interpolation 654, filter-interpolation-003
288, grid-template-columns-interpolation 524, filter-computed 83,
clip-path-computed **21/21**, clip-path-valid **54/54**, offset-path-computed
**65/65**, color-interpolation 48/192.

**Three ledger numbers turned out to be STALE, not regressed** — proved by
measuring the unchanged build:

- `cssom/shorthand-serialization` is **6/7 on the unchanged build too** (recorded
  7/7). Not caused by this arc.
- `CSSTransition-canceling` is **11/11 on both** (recorded 10/11) — the ledger was
  behind, there is no gain here.
- `interpolation-per-property-002` **340 on both** (recorded 339), and
  `effect-value-iteration-composite-operation` **20 on both** (recorded 19), and
  `clip-path-computed` **21/21 on both** (recorded 19/21). All three ledger rows
  were behind the truth; none moved this session.

Re-confirmed once more: **a `bodyLen = 42` / no-results is not a regression.**
`css/css-motion/parsing/offset-path-computed.html` is a stale path — the real one
is `css/motion/parsing/…` and it is **65/65**.

---

## Caps / Next — read this before choosing

### Honest caps

- **`contrast-color-interpolation.html` is a REFTEST.** Not winnable by this
  campaign's method, and it should never again be counted as "0/N".
- **`caret-color-composition.html` and `transform-translate-composition.html`
  could-not-run on BOTH builds, on a fresh server.** Pre-existing, undiagnosed,
  not caused by this arc. `caret-color-composition` has now been in this state
  across three sessions — worth a `harness_probe.py` next time.
- **`scale-composition` (8/80) and `translate-composition` (10/112) did not move
  at all** while every other transform composition file did. Whatever gates them
  is NOT the composite operation — it is upstream of it, and it is now the most
  conspicuous single hole in the band.
- **`_waAdd`'s general fallback returns the KEYFRAME value, not the underlying.**
  css-values-4 §not-additive says `Vresult = Va` and Va is the underlying, so the
  fallback is backwards for every non-additive type that has not been named in
  `_WA_NON_ADDITIVE_PROPS`. This was *deliberately* left scoped to `aspect-ratio`
  rather than flipped globally, because `_WA_DISCRETE_PROPS` takes the same wrong
  branch one line above and flipping both is a measurable experiment, not a
  guess. **It is the cheapest untested hypothesis on the board.**
- `object-view-box`'s `round <border-radius>` clause resolves its lengths
  token-by-token; a `/`-separated two-radius clause is passed through rather than
  computed.
- A `<ratio>` written as a number-typed `calc()` is folded via `_evalMath`, but a
  `calc()` that cannot fold is rejected rather than kept symbolic.

### Next leverage

1. **⭐ THE REST OF THE COMPOSITION BAND — 923 subtests still failing across the
   same 29 files, now that they all actually composite.** The band went 39.3% →
   63.3% on one primitive; what remains is real interpolation work with a clear
   shape. Start with the two files that did not move at all
   (`scale-composition` 8/80, `translate-composition` 10/112) — they are failing
   for a *different* reason than everything around them, which makes them the
   cheapest diagnosis on the board. Then `backdrop-filter-composition-001`
   (137/364) and the two `grid-template-*-composition` (122/190 each).
2. **The `_waAdd` fallback direction** (above). One-line change, one measured
   sweep of the composition band, and it either moves hundreds of subtests or it
   moves none — either answer is worth having written down.
3. **The transition transform-endpoint exception** (~100 subtests, standing since
   #424): `_csUpdateElement` snapshots `after.getPropertyValue('transform')`,
   which CSSOM resolves to a matrix, so the two CSS-Transitions rows of every
   transform test interpolate matrix cells while the Web-Animations row passes.
   #420's `_WA_UNCOMPUTED` already draws this distinction for keyframes; the
   transition snapshot needs the same escape.
4. **`grid-template-*` interpolation** — 524/684 twice over; `<track-list>` wants
   the list-alignment shape a third time (after `_waTfAlign` and
   `_waFilterAlign`).
5. **The rest of the CSS Animations lifecycle** — `animationiteration`,
   CSSAnimation-playState 0/5, -canceling, -startTime, -ready, -finished.
6. **`@starting-style` + `CSSStartingStyleRule`** — 8 untouched files;
   `@starting-style` IS a before-change style override and plugs straight into
   #421's style change event.

### Reusable seeded

- **`_parseRatioValue` / `_serRatioValue`** — the `<ratio>` grammar and its
  both-numbers serialization, for any other property that takes one.
- **`_waRatioPair`** — "can these two ratios be interpolated?", shared by
  `_waInterpolate` and `_waInterpolable` so transitions and animations cannot
  disagree.
- **`_WA_NON_ADDITIVE_PROPS`** — where the next type with no defined addition
  joins, and the one place that says `Vresult = Va` out loud.
- **`_COLOR_AUTO_PROPS`** — a colour property whose grammar also admits `auto`;
  the two places that must agree about it now share a set instead of a name test.
- **`_serObjectViewBox`** — and, more usefully, the demonstration that `_opShape`
  can be reused **without** its computed `rect()`/`xywh()` → `inset()` rewrite.
- **`_CA_COMPOSITES` + the keyframe-level `animation-composition` read** — the
  declarative spelling of a keyframe's composite operation, and a standing
  reminder that `_CS_NEVER` runs *before* the per-property intercepts in
  `_caKeyframesOf`: anything that needs reading out of a keyframe block must be
  intercepted above that line.
