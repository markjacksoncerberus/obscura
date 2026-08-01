# 439 — The Decomposed Verdict

> *Quests #439 · #440 · #441 — the matrix-decomposition arc.*
> **+394 measured across 7 files, ZERO regressions, SIX files to 100%.**
> Session 2026-08-01. All work in `crates/obscura-js/js/bootstrap.js`.

---

## The gap

#438's ⭐ pointed here and, unusually for this campaign, it pointed *straight*: the
whole remaining tail of the transform realm was one algorithm. The baseline, measured
on the unchanged build before a line was written:

| file | before |
|---|---|
| `transform-interpolation-005` | 204/384 |
| `transform-matrix-composition` | 36/112 |
| `transform-interpolation-004` | 216/288 |
| `transform-interpolation-003` | 150/168 |
| `list-interpolation` | 44/76 |
| `transform-composition` | 46/56 |

Bucketing `-005`'s 180 failures by value pair gave nine pairs — five `matrix()` and four
`matrix3d()` — and every single failing row had the same shape:

```
from [matrix(1, 0, 0, 1, 0, -6)] to [matrix(0, 7, -1, 0, 6, 0)] at (0.5)
  expected matrix(2.83, 2.83, -0.71, 0.71, 3, -3)
  got      matrix(0.5,  3.5,  -0.5,  0.5,  3, -3)
```

Two matrices with the same function name and the same six arguments walked straight
into #417's generic skeleton kit, which averaged the six numbers one by one. The
translation is right (it is linear either way); everything else is a squash the
element never performed.

---

## #439 — a matrix has forgotten which functions made it

`matrix(1, 0, 0, 1, 0, -6)` → `matrix(0, 7, -1, 0, 6, 0)` **is** a quarter turn with a
sevenfold stretch. Averaging its entries is not a slower version of that; it is a
different motion. css-transforms-1 §interpolation-of-matrices says so outright: each
matrix is **decomposed** into the transform it stands for, those components are
interpolated, and the result is recomposed.

**2D and 3D are two different algorithms, not one with the z terms dropped.** The pair
is asked first whether it is flat (`_waMatIs2D`), and only then dispatched.

**2D** (`_waMatDec2` / `_waMatRec2`): a 2D matrix is `translate · rotate · skew · scale`,
and the four numbers of its linear part hold exactly those. The angle comes off with
`atan2(m12, m11)`, the x-scale is the length of the first column, and then — the part
worth stating out loud — **the y-scale is the DETERMINANT divided by the x-scale, which
is how the sign of a reflection lands in the scale rather than in the rotation**, and
the skew is `(m11·m21 + m12·m22) / det`. Two corrections run before the components are
interpolated, and both are about the fact that *a rotation is a circle*:

- **One matrix mirrored about x and the other about y differ by a HALF TURN**, not by
  two reflections. Said before the angles are compared, or the interpolation walks the
  long way round a flip that was never there.
- **Don't turn the long way round** — and a *zero* angle stands in as 360° first, so
  that it is measured against the turn it completes rather than against 0. The
  subtraction immediately after brings it back down whenever 0 was nearer, which is why
  the substitution reads like a no-op and is not one.

**3D** (`_waMatDec3` / `_waMatRec3`): css-transforms-2 §decomposing-a-3d-matrix, the
"unmatrix" of *Graphics Gems II* with quaternions in place of Euler angles so a rotation
never locks a gimbal on its way through. Perspective comes off first (it is the only
part that is not a similarity, and it needs a general 4×4 inverse — `_waM4Inv`), then
translation, then Gram-Schmidt takes the three axes apart into three scales and three
skews, and what is left over is a pure rotation read off as a quaternion.

**THE ONE THING THAT COST A DEBUG CYCLE: the recomposition's rotation matrix is the
TRANSPOSE of the one the spec's pseudo-code appears to write.** The decomposition ends
by *negating* three quaternion components (`if (row[2][1] > row[1][2]) q[0] = -q[0]`,
and twice more), which fixes a sign convention; the recomposition has to match it or
every 3D result comes back mirrored — `-0.309` where `0.309` was wanted, and nothing
else out of place. A mirrored answer looks exactly like an arithmetic bug and is not one.

And **the slerp here is deliberately NOT #435's.** There, both quaternions were pushed
into the `w ≥ 0` half of the sphere first, because there the endpoints were rotations an
author *wrote* and the short way round is what they meant. Here they came out of a
decomposition in a fixed representative already, and flipping one would change the
answer the platform gives.

**Result: `transform-interpolation-005` 204 → 384/384.** `transform-matrix-composition`
went 36 → 56 for free.

---

## #440 — a matrix that cannot be inverted has no decomposition

`transform-matrix-composition`'s remaining 56 failures were the four **accumulation**
groups, and they held two separate rules.

**`matrix(1, 1, 0, 0, 0, 100)` has determinant zero.** It folds the plane onto a line,
so there is no `translate · rotate · skew · scale` that produces it, and §11 is explicit
that the fallback is a **discrete** animation. The test's expectations *step at 0.5*
rather than sliding — and getting this wrong looks precisely like an arithmetic bug.

Two things follow from that, and only one of them is obvious:

1. **The discreteness belongs to the WHOLE LIST, not to the one function.** In the
   failing case the singular matrix is *identical on both sides* — the composite lists
   are `matrix(1,1,0,0,0,100) matrix(1,0,0,1,100,0)` and
   `matrix(1,1,0,0,0,100) matrix(1,0,0,1,200,0)` — so a per-function view would happily
   interpolate the translation beside it and answer `matrix(1, 1, 0, 0, 150, 250)`.
   The platform answers `(200, 300)`: the whole thing steps. So `_waTfInterpItems`
   returns **null** rather than a value, and that null is the list's verdict.
2. **A pair whose only answer is a discrete flip is not a transition.** The null had to
   reach `_waInterpolable` too — css-transitions-2 makes a non-interpolable pair a
   *non*-transition unless `transition-behavior: allow-discrete`. Rather than re-derive
   the conditions there, the predicate now **asks the interpolation itself**, at a `t`
   that cannot matter (`_waTfInterp(sa, sb, 0.5) !== null`). One entry point, so #429's
   rule — the two must never disagree — holds for free instead of by inspection.

**And matrix accumulation is entry-wise about the IDENTITY.** css-transforms-2 §15 names
the exception it needs: parameters "whose value is one in the identity transform
function (e.g. scale parameters and matrix elements m11, m22, m33, and m44)" accumulate
as `a + b − 1`. That is `_WA_TF_ONES` — `{0, 3}` for `matrix()`, `{0, 5, 10, 15}` for
`matrix3d()` — joining the rule `_WA_TF_SCALES` already stated for scale factors.
Everything else is a plain sum. And accumulating *onto* a matrix nobody can decompose has
no answer either, so it falls back to **replace**, which is what the test file's own
comment says in as many words: *"Accumulation of non-invertible matrices falls back to
replace behavior."*

**Result: `transform-matrix-composition` 36 → 112/112.**

---

## #441 — the mismatch ends the walk; it does not condemn the list

The four files left over (`-003`, `-004`, `list-interpolation`, `transform-composition`)
all failed on pairs that would not line up function-for-function:

```
scaleY(-3) translateX(0px)          →  scaleX(-3) scaleY(2)
scaleZ(3) perspective(400px)        →  scaleZ(4) skewX(1rad) perspective(500px)
rotate(0deg) translate(100px)       →  rotate(720deg) scale(2) translate(200px)
```

Everything before this quest treated a mismatch as the end of the story: discrete. The
spec's actual last rule is a walk, and the difference between "the whole list becomes a
matrix" and what it really says is worth **32 subtests in one file**:

> While the functions have either the same name, or are derivatives of the same
> primitive transform function, interpolate the corresponding pair … **If the pair do
> not have a common name or primitive transform function, post-multiply the REMAINING
> transform functions in each of Va and Vb** … interpolate these two matrices … **and
> cease iterating.**

So `_waTfAlignItems` no longer answers "aligned" or "null" — it returns the matching
**prefix** plus whatever is left over on each side (`{ A, B, ra, rb }`). The prefix
interpolates as itself; the remainder collapses to one 4×4 each and goes through #439's
machinery.

**WHY THE PREFIX MATTERS, IN ONE LINE:** `rotate(0deg) translate(100px)` →
`rotate(720deg) scale(2) translate(200px)` mismatches at position 1, so the rotation
ahead of it still winds through **two entire turns** and reads `rotate(180deg)` at a
quarter of the way. Flatten the lists whole and that quarter-of-720° becomes a quarter
of nothing at all — `rotate(720deg)` *is* the identity matrix. **A matrix is where a
turn count goes to die**, and the spec's own note says a previous version of it lost
exactly this and was changed.

**The exception that is not one:** `-005` carries a case labelled *"Mismatched
interpolation with an empty list should not use decomposition"* — `none` →
`rotate(180deg)` must stay a rotation. It needs no special case, because `none` is a
list of **length zero**: the padding rule always finds it a partner, the walk never
reaches a mismatch, and it never gets near a matrix. Worth knowing you don't need the
special case before you write one.

Accumulation deliberately kept its old behaviour here (anything left over past the first
mismatch falls back to addition, i.e. concatenation) — §15 says accumulation follows the
same matching *including* the matrix conversion, but no test on the board demands it and
changing it unmeasured is a guess. Named in Caps.

**Result: `-003` 150 → 168/168, `-004` 216 → 288/288, `list-interpolation` 44 → 76/76,
`transform-composition` 46 → 56/56.**

---

## Results

All *before* numbers measured on the unchanged build; the two that were not part of the
opening baseline (`transform-composition`, `interpolation-per-property-002`) were
**stash-proved** — built without the change, measured, restored, re-measured.

| Test | Before | After | |
|---|:---:|:---:|---|
| `css/css-transforms/animation/transform-interpolation-005.html` | 204/384 | **384/384** | **+180** ✅ |
| `css/css-transforms/animation/transform-matrix-composition.html` | 36/112 | **112/112** | **+76** ✅ |
| `css/css-transforms/animation/transform-interpolation-004.html` | 216/288 | **288/288** | **+72** ✅ |
| `css/css-transforms/animation/list-interpolation.html` | 44/76 | **76/76** | **+32** ✅ |
| `css/css-transforms/animation/transform-interpolation-003.html` | 150/168 | **168/168** | **+18** ✅ |
| `css/css-transforms/animation/transform-composition.html` | 46/56 | **56/56** | **+10** ✅ |
| `web-animations/…/interpolation-per-property-002.html` | 342/379 | **348/379** | **+6** |
| **total** | | | **+394** |

**Held identical** (60-file sweep; `_waTfAlignItems` changed SHAPE and
`_waInterpolate`/`_waInterpolable`/`_waTfCompose` were all touched): qsa **1975**,
classlist **1420**, createElement 147, Element-matches 669, serialize-values 696,
cssom idlharness 493, url-origin 406, mark 22/22, css-transitions
**properties-value-001 560/560**, properties-value-002 16, properties-value-003 86,
properties-value-implicit-001 60/60, css-transitions idlharness 64, css-transitions
inheritance 8/8, **CSSTransition-canceling.tentative 11/11**, css-animations idlharness
98, interpolation-per-property-001 444, **effect-composition 17/17**, Animatable/animate
147, setKeyframes 78, **KeyframeEffect/composite 4/4**, **iterationComposite 1/1**,
Animation/style-change-events 24, css-transforms **inheritance 20/20**,
rotate/scale/translate-parsing-computed **23/38/19**, **transform-valid 42/42**,
**transform-invalid 20/20**, transform-computed 3/3, **rotate-composition 132/132**,
**scale-composition 80/80**, **translate-composition 112/112**, **rotate-interpolation
360/360**, **scale-interpolation 360/360**, **translate-interpolation 408/408**,
**transform-interpolation-001 448/448**, **-002 216/216**, **-007 42/42**,
**matrix-interpolation 4/4**, **transform-origin-interpolation 168/168**,
**perspective-origin-composition 56/56**, **perspective-composition 40/40**,
**transform-scale-composition 98/98**, transform-skew-composition 84/86,
**transform-perspective-composition 28/28**, **transform-rotate-composition 126/126**,
transform-interpolation-inline-value 17, perspective-interpolation 234,
perspective-origin-interpolation 80, transform-origin-composition 22,
**backface-visibility-no-interpolation 42/42**, rotate-interpolation-math-functions 26,
scale-animation-math-functions 28, KeyframeEffect-getKeyframes 11, CSSAnimation-effect 5,
css-animations Element-getAnimations 15 / Document-getAnimations 9,
transform-interpolation-computed-value **0/82** (untouched frontier, not a regression).

---

## Caps / Next

**A CAP THAT TURNED INTO A DIAGNOSIS — and it is the best thing on the board.**
`transform-interpolation-006` did **not** move (76/96, unchanged on both builds), and its
20 remaining subtests are one bucket: `from: 'inherit'`. The test's stylesheet declares
`.parent { transform: translate(30px) }` and then, later, `.parent { transform: 30px }` —
an **invalid** declaration that must be dropped, leaving the first one standing. Probed
directly:

```js
sheet.cssRules[1].cssText            // ".zz { }"        ← CSSOM dropped it, correctly
getComputedStyle(el).transform       // "30px"           ← the cascade kept it
```

**There are two declaration parsers in `bootstrap.js` and only one of them validates.**
`_parseStyleDecls` (CSSOM) runs the whole per-property `_isValidTransform` /
`_isValidFilter` / `_isValidClipPath` … chain. **`_cssParseDecls` — the *cascade-shape*
parser that `getComputedStyle` reads through `_buildCascade` → `_cascadeResolve` —
validates custom properties and nothing else.** So a declaration the CSSOM has already
rejected still wins the cascade, and the valid declaration it should have lost to is
gone. This is not a transform bug; `transform` is just where it was caught.

The fix is to route `_cssParseDecls` through `_parseStyleDecls`, which is one of the
widest shared changes available in the file (every rule, every property, and
`_parseStyleDecls` *canonicalises* as well as validates) — so it wants its own quest and
its own sweep, not a tail-end edit. **It is also worth a great deal more than these 20
subtests: every `*-invalid.html` file in the campaign asks a version of this question.**

**Other caps, honest:**
- **Accumulation does not do the prefix/matrix conversion** that §15 says it should —
  anything left over past the first mismatch falls back to concatenation. Nothing on the
  board demands otherwise; changing it is a measurable experiment, not a fix.
- `transform-interpolation-computed-value` **0/82 on both builds** — a whole untouched
  file, still the largest single transform frontier.
- `transform-skew-composition` 84/86, `perspective-interpolation` 234/254,
  `perspective-origin-interpolation` 80/120, `transform-origin-composition` 22/56,
  `transform-interpolation-inline-value` 17/41 — all unmoved by this arc; those rows are
  the `perspective` and `transform-origin` **properties**, not the transform functions.
- `transform-translate-composition` and `caret-color-composition` still could-not-run on
  a fresh server — now **six** sessions running. One `harness_probe.py` quest between them.
- Standing: `progress()` (CSS Values 5) is the entire tail of the two
  `*-math-functions-tentative` files; `_waAdd`'s general fallback returns the KEYFRAME
  value where css-values-4 §not-additive says `Vresult = Va`, the UNDERLYING;
  `animationiteration` not fired; percentage→pixels needs layout (unwinnable).

**Reusable seeded:** `_waMatDec2`/`_waMatRec2`/`_waMatInterp2`,
`_waMatDec3`/`_waMatRec3`/`_waMatInterp3`/`_waMatSlerp`, **`_waMatInterp`** (the one
dispatcher that decides 2D-vs-3D), **`_waMatOk`** (the invertibility question asked on
its own, because accumulation needs it too), **`_WA_TF_ONES`** (where the next
one-based parameter joins), **`_waM4Inv`** (a general 4×4 inverse inside the animation
block), `_waTfMatrixOf` (a run of functions as one matrix), and — the structural one —
**`_waTfInterp`, the single entry point through which both `_waInterpolate` and
`_waInterpolable` now ask their question**, and **`_waTfAlignItems`'s new
`{ A, B, ra, rb }` shape** (prefix plus remainders, so "they don't match" stopped being
a yes/no).
