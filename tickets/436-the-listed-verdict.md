# ⚔️ Quests #436–#438 — The Listed Verdict

> *The engine was animating a value the spec never asks it to animate. Everything
> else followed from that.*

**Realm:** `css/css-transforms/animation/` — the `transform` shorthand
**Status:** ✅ **SECURED.** **+446 measured across 13 files**, ZERO regressions,
**five files to 100%**.
**Session:** 2026-08-01 (following #433–#435, *The Individual Verdict*).

---

## The gap

#435's ⭐ pointed at the `transform` list and named the standing cap as *"a
mismatched function pair needs matrix decomposition and quaternion slerp, half of
which now exists."* The baseline said something else, and it said it very loudly.

| file | before |
|---|---|
| `transform-interpolation-001` | 256/448 |
| `transform-interpolation-002` | 186/216 |
| `transform-interpolation-003` | 104/168 |
| `transform-composition` | 36/56 |
| `transform-scale-composition` | 56/98 |
| `transform-skew-composition` | 42/86 |
| `transform-rotate-composition` | 114/126 |
| `transform-perspective-composition` | 8/28 |
| `list-interpolation` | 24/76 |

Bucketing `transform-interpolation-001`'s 283 failing rows by *(from, to, harness)*
gave **nineteen distinct value pairs** — and split them almost perfectly by
harness:

```
 13  'rotate(30deg)' -> 'rotate(330deg)'     {CSS Transitions: 6, +all: 6, CSS Animations: 1}
 13  'rotateX(0deg)' -> 'rotateX(700deg)'    {CSS Transitions: 6, +all: 6, CSS Animations: 1}
 13  'none'          -> 'rotate(90deg)'      {CSS Transitions: 6, +all: 6, CSS Animations: 1}
 …
```

Eleven pairs failed **on both CSS Transitions harnesses and passed on Web
Animations** — the *same* interpolation, the *same* endpoints, two different
answers. That is never a geometry bug. That is two code paths being handed two
different values.

---

## #436 — The computed `transform` is a LIST, not a matrix

`getComputedStyle(el).transform` reports `matrix(0.866025, 0.5, -0.5, …)`. That is
correct, and it is **not** the computed value. css-transforms-1
§transform-property: the *computed* value of `transform` is the specified list
**with lengths made absolute** — still a list. The single matrix is the
**resolved** value, one step further on, and it is the only thing CSSOM will ever
show you.

Everything in the animation model that reached for a `transform` value reached
through `getComputedStyle`, so everything got the matrix:

* a CSS transition's before- and after-change endpoints,
* the **underlying** value an `add`/`accumulate` keyframe composites onto,
* the snapshot the style-change event compares against.

A matrix has forgotten which functions made it. So:

* `rotate(30deg)` → `rotate(330deg)` became two matrices 60° apart and took the
  short way round; as a list it is an angle sliding 30 → 330, the long way, which
  is the whole visible difference.
* `none` → `rotate(90deg)` had no functions to align at all and stepped.
* `underlying [rotate(45deg) skew(10deg, 20deg)]` could not line up with the
  `rotate(45deg)` a keyframe wanted to accumulate onto it, fell back to
  concatenation — and concatenating transforms **multiplies** them. `scaleX(2)`
  accumulating `scaleX(3)` answered **6** where the type's own rule says
  2 ⊕ 3 = **4**.

The fix is one serialization mode and one latch. `_canonTransform(v, el, 'list')`
resolves each argument to its computed form (`_trComp` for lengths,
`_rotSerAngle` for angles, numbers for `<number-percentage>`) and keeps the
function spelling. `_tfWantList` is a latch rather than a parallel resolver
**because the value has to come down the ordinary cascade** — inheritance, `var()`
substitution, the animation and transition sources, and the `_csSuppress` /
`_waUnderlyingOf` guards the caller has already set up. Only the last step,
serialization, differs, and that is the only step this changes.

Three intake points now read it: `_waComputedValue` (keyframes — `transform` came
out of `_WA_UNCOMPUTED`, the same mistake of association that `translate`/`scale`/
`rotate` came out of in #433–#435), `baseOf` in `_waAnimatedDecls` (the underlying
value), and `_csRead` in the transitions engine (both endpoints and the snapshot).

> **The trap, and it cost a build:** the first attempt put the transform branch
> *before* `_waComputedValue`'s `_waUnderlyingOf.add(el)` guard. Resolving a
> keyframe's `2em` asks the cascade for the element's font-size, the cascade walks
> back into the animations running on that element, and one of them is this one.
> The page hung until V8 killed the script at 5s. **The guard has to be in force
> for the whole computation, `transform` included.** `_withTfList(on, fn)` exists
> so the latch composes with it instead of racing it.

**Result: +182.** `transform-scale-composition` 56 → **98/98**,
`transform-rotate-composition` 114 → **126/126**, `transform-skew-composition`
42 → 84/86, `transform-interpolation-001` 256 → 332/448.

---

## #437 — `perspective` interpolates its RECIPROCAL

Halfway from `perspective(400px)` to `perspective(500px)` is **421.0526px**, not
450px. What moves evenly is not the distance to the eye — it is the single matrix
entry the function contributes, **−1/d**. (1/400 and 1/500 average to 1/421.05.)
The expectations say so in six places and there is no other reading of them:

```
at (-1)   → perspective(333.3333333333333px)     1/400 + (1/500 − 1/400)·(−1)
at (0.25) → perspective(421.0526315789474px)
at (2)    → perspective(666.6666666666666px)
```

And then `none` stops being a hole in the value and becomes an **ordinary
endpoint**: `perspective(none)` is depth ∞, whose reciprocal is **0**. That is
also why it is this function's **identity** — a viewer infinitely far away
projects nothing, which is precisely doing nothing — so the old comment saying
*"perspective has no finite identity, so a list needing it stays unpadded"* was
true about the depth and false about the thing that actually interpolates.
`scaleZ(2)` → `scaleZ(2) perspective(500px)` can be padded and animated after
all, and at (2) it is `perspective(250px)`, exactly as the test asks.

Running past either end can send the reciprocal negative — an eye behind the
viewer, which the `[0,∞]` range does not admit — so it clamps at 0, i.e. back to
`none`. That is what makes `perspective(none)` → `perspective(500px)` answer
`none` at (−1) and `1000px` at (0.5).

This is also where the list interpolator stopped being generic.
`_waTfInterpItems` walks the two aligned lists function by function; every
function *except* `perspective` is just its arguments, one value each, so #417's
skeleton kit still does them exactly. `perspective` is the one that needed its own
line. `_waInterpolable` was moved to the same decision (alignment succeeds ⇒
interpolable) so the CSS Transitions rows and the Web Animations rows can never
disagree about whether a transition exists — #429's rule, kept.

**Result: +64**, and `perspective-composition` held at 40/40 (its accumulation
takes the reciprocal too — the quantity whose neutral is zero).

---

## #438 — Every rotation is an AXIS and an ANGLE

The last 52 rows of `transform-interpolation-001` were four pairs:

```
rotateX(0deg)             -> rotateY(900deg)              should be rotateY(225deg) at 0.25
rotateY(900deg)           -> rotateZ(0deg)                should be rotateY(675deg) at 0.25
rotate3d(0, 1, 0, 0deg)   -> rotate3d(0, 2, 0, 450deg)    should be rotate3d(0, 1, 0, -450deg) at -1
rotate3d(1, 1, 0, 90deg)  -> rotate3d(0, 1, 1, 180deg)    should be rotate3d(0.524083, 0.804261, 0.280178, 106.91deg) at 0.25
```

Read them together and they are **#435's four rules, one realm over**:

1. `rotateX(0deg)` is a **zero rotation** — it has no axis of its own and borrows
   the other's. That is the *only* reason the answer is spelled `rotateY(…)`.
2. `rotateZ(0deg)` likewise, which is why `rotateY(900deg)` unwinds through 675°
   and 225° instead of taking any short way round.
3. `(0,1,0)` and `(0,2,0)` are the **same line** — so the axes must be
   **normalized before they are compared**, and then the angle simply slides,
   0 → 450, and extrapolates to −450.
4. Only the fourth pair turns about genuinely different lines, and only there is
   there an arc to walk: **SLERP, with both quaternions put in the w ≥ 0 half of
   the sphere FIRST**.

Unlike translate/scale/skew, the rotation family does **not** reduce to a shared
spelling by padding: an axis is a *direction*, not a magnitude, so `rotateX` and
`rotateY` have nothing in common to pad *with*. css-transforms-2
§interpolation-of-transforms sends the whole family to `rotate3d`, and from there
the rules are the ones the `rotate` **property** already lives by. So this quest
is a **promotion, not a new engine**: `_waTfAlignItems` rewrites a mismatched
rotation pair as two `rotate3d`s, and `_waTfRotInterp` is thirteen lines calling
`_waRotCommon` / `_waQuat` / `_waQuatToRot` / `_wa6sig` — every one of them
written for #435 and reused unchanged.

**Result: +200.** `transform-interpolation-001` **448/448**,
`transform-interpolation-002` **216/216**, and `transform-rotate-composition`
held at 126/126 through the change.

---

## Results

| file | before | after | Δ |
|---|---|---|---|
| `transform-interpolation-001` | 256/448 | **448/448** ✅ | **+192** |
| `transform-interpolation-002` | 186/216 | **216/216** ✅ | +30 |
| `transform-interpolation-003` | 104/168 | 150/168 | +46 |
| `transform-scale-composition` | 56/98 | **98/98** ✅ | +42 |
| `transform-skew-composition` | 42/86 | 84/86 | +42 |
| `transform-perspective-composition` | 8/28 | **28/28** ✅ | +20 |
| `transform-interpolation-005` | 184/384 | 204/384 | +20 |
| `list-interpolation` | 24/76 | 44/76 | +20 |
| `transform-rotate-composition` | 114/126 | **126/126** ✅ | +12 |
| `transform-composition` | 36/56 | 46/56 | +10 |
| `transform-interpolation-006` | 68/96 | 76/96 | +8 |
| `transform-interpolation-004` | 214/288 | 216/288 | +2 |
| `transform-interpolation-inline-value` | 15/41 | 17/41 | +2 |
| **total** | **1327** | **1773** | **+446** |

Held identical (stash-proved, both builds, fresh server): `transform-interpolation-007`
42/42, `matrix-interpolation` 4/4, `transform-origin-interpolation` 168/168,
`perspective-origin-composition` 56/56, `perspective-interpolation` 234/254,
`transform-origin-composition` 22/56, `perspective-origin-interpolation` 80/120.

**Zero-regression sweep — 32 held realms, identical line for line:** qsa 1975,
classlist 1420, createElement 147, Element-matches 669, serialize-values 696,
cssom idlharness 493, css-transitions properties-value-001 **560/560**,
properties-value-003 86, css-transitions idlharness 64, css-animations idlharness
98, Animatable/animate 147, setKeyframes 78, combining-effects/effect-composition
17/17, CSSTransition-canceling.tentative 11/11, interpolation-per-property-001
444, -002 342, KeyframeEffect/composite 4/4, iterationComposite 1/1,
rotate/scale/translate-parsing-computed 23 / 38 / 19, css-transforms/inheritance
20/20, rotate-composition **132/132**, scale-composition **80/80**,
translate-composition **112/112**, rotate-interpolation **360/360**,
scale-interpolation **360/360**, translate-interpolation **408/408**,
url-origin 406, mark 22/22.

---

## Caps / Next

**⭐ MATRIX DECOMPOSITION IS NOW THE WHOLE REMAINING TAIL, AND IT IS MEASURED.**
Not a guess this time — the leftover failures bucket almost entirely into
`matrix()` / `matrix3d()` pairs that need css-transforms-2 §matrix-decomposition +
§interpolation-of-decomposed-matrices:

```
css/css-transforms/animation/transform-interpolation-005.html   204/384   ← ~180, all matrix pairs
css/css-transforms/animation/transform-matrix-composition.html   36/112   ← 76, all matrix add/accumulate
css/css-transforms/animation/transform-interpolation-004.html   216/288
css/css-transforms/animation/list-interpolation.html             44/76
css/css-transforms/animation/transform-interpolation-006.html    76/96
css/css-transforms/animation/transform-interpolation-003.html   150/168
```

**~300 subtests, one algorithm.** Half of it already exists (#435's quaternion
kit is the rotation half of recomposition), and the decomposition itself is
written out step by step in the spec. **The one thing the tests care about beyond
the arithmetic: a SINGULAR matrix cannot be decomposed, and the spec's fallback is
DISCRETE interpolation** — `transform-matrix-composition`'s
`matrix(1, 1, 0, 0, 0, 100)` has determinant 0 and its expectations step at 0.5
rather than sliding. Getting that wrong looks like an arithmetic bug and is not
one.

**Other honest caps, smaller:**
* `transform-interpolation-computed-value.html` **0/82 on BOTH builds** — not a
  regression, and not touched by this arc. Untouched frontier, worth its own look.
* `transform-additive-animation.html` and `transform-translate-composition.html`
  still **could-not-run on a fresh server on both builds** ("test ran but summary
  never appeared"). `transform-translate-composition` is now FIVE sessions
  running, alongside `caret-color-composition`; they deserve one `harness_probe.py`
  quest between them rather than another session of being re-diagnosed.
* `perspective-interpolation` 234/254 and `perspective-origin-interpolation`
  80/120 did **not** move — the remaining rows are the `perspective` *property*
  and `perspective-origin`, not the transform function, so #437 was never going
  to reach them.
* `transform-origin-composition` 22/56 — untouched by this arc.
* Standing from earlier arcs: `progress()` (CSS Values 5) is the entire remaining
  tail of the two `*-math-functions-tentative` files; `_waAdd`'s general fallback
  returns the KEYFRAME value where css-values-4 §not-additive says
  `Vresult = Va`, the UNDERLYING; `animationiteration` not fired; percentage →
  pixels needs layout (unwinnable).

**Reusable, seeded by this arc:** `_canonTransform(v, el, 'list')` + the
`_tfWantList` latch + `_withTfList(on, fn)` (the composable form — the
non-composable one deadlocks, see #436); `globalThis._computedTfList(el)`;
`_csRead(el, style, kebab)` (the one place that says out loud that a transition
reads computed values, not resolved ones); `_waPerspK` / `_waPerspSer` (the
reciprocal, and the reason `none` is an endpoint); `_waTfInterpItems` (per-function
list interpolation — the hook for decomposition to land in);
`_WA_TF_ROT` / `_waTfRotOf` / `_waTfAsRot3d` / `_waTfRot3d` / `_waTfRotInterp`.
