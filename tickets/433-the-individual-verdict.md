# ⚔️ Quests #433–#435 — The Individual Verdict

> *Three properties the engine could already read, write and compute — and had
> never been told what any of them MEAN.*

**Realm:** `css/css-transforms/animation/` — `translate`, `scale`, `rotate`
**Status:** ✅ **SECURED.** **+852 measured across 11 files**, ZERO regressions,
**six files to 100%**.
**Session:** 2026-07-31 (following #430–#432, *The Registered Verdict*).

---

## The gap

#432's ⭐ pointed at the rest of the `*-composition` band and singled out the two
files that **did not move at all** while every neighbour around them did:

```
css/css-transforms/animation/scale-composition.html        8/80
css/css-transforms/animation/translate-composition.html   10/112
```

The outgoing knight's read was right that they fail *for a different reason than
everything around them* — and the reason turned out to be much bigger than
composition. Obscura parses, validates, computes and serializes all three
individual transform properties with three real grammars (`_isValidScale` /
`_canonScale`, `_isValidRotate` / `_canonRotate`, `_isValidTranslate` /
`_canonTranslate`, all since the parsing quests). Every one of those files is
**100% on the parsing side**. What the animation model was handed, though, was a
string — and the **generic slot model** ([#417]'s literal-and-hole kit) is a
wonderful thing that knows nothing about geometry.

So the baseline was not a composition tail. It was six files:

| file | before |
|---|---|
| `scale-composition` | 8/80 |
| `translate-composition` | 10/112 |
| `rotate-composition` | 54/132 |
| `scale-interpolation` | 154/360 |
| `translate-interpolation` | 228/408 |
| `rotate-interpolation` | 164/360 |
| **total** | **618 / 1452** |

---

## What the generic model got wrong — three different ways

**It DECLINED pairs that match perfectly.** `scale: 1` against `scale: 10 -5 0`
has one hole on the left and three on the right, so the shape test says no and
the whole thing falls through to a discrete flip. But a missing scale component
is a **default**, not an absence: y defaults to x and z to 1, translate's y and z
default to `0px`. Written out in full the two values are the same shape every
time. That single mistake is most of the tail — and it is why `from [initial]`,
`from [inherit]` and every `1`-vs-`3`-component row in both interpolation files
STEPPED.

**It ADDED two scales.** `underlying: 2 1`, `addFrom: 3 1` — the slot model
happily answers `5 2`. The right answer is `6 1`. Adding two transforms means
**composing** them, and composing two scalings **multiplies** them. (Accumulation
is the ordinary sum, about this type's do-nothing value of 1 — the same
`base = 1` rule `_waTfCompose` already applies to `scale()` inside a transform
list. The two now say it in the same voice.)

**It had never heard that a rotation is an axis.** `1 2 3 40deg` and
`2 4 6 10deg` are five numbers each to the slot model, and it moved the axis
numbers around as if they were magnitudes.

---

## #433 — `scale`

`_waScaleParse` / `_waScaleSer`: three numbers in, the elision rule out (drop a
trailing z of 1, and **only then** a y equal to x — a `2 2 3` keeps all three,
because dropping the y would silently promote the z into its place).
`<percentage>` is a `<number>`, so `100%` parses as `1`.

- **interpolate:** componentwise, linear, unclamped (extrapolation is #427's).
- **add:** componentwise **multiplication**.
- **accumulate:** componentwise `a + b − 1`.
- **`none`:** both `none` → `none`; otherwise the `none` becomes `1 1 1`
  (css-transforms-2 §5). *Composing* two `none`s does **not** give `none` — it
  gives `1`, because "an identity transform does not count; it must serialize as
  `1`". The test pins exactly that.

**8/80 → 80/80** and **154/360 → 360/360**.

## #434 — `translate`

Three `<length-percentage>`s, padded from `0px`, added and interpolated
component by component.

The subtle half is the **serialization**, and it is not symmetric. A computed
length-percentage is two numbers, and the two numbers **cannot say whether a
percentage is involved**: `calc(0% + 480px)` and `480px` hold the same pair. So a
`hasPct` flag rides along and is the **OR of the two endpoints'** — the moment a
percentage enters either side, the value carries a percentage for the rest of the
animation. Then:

| pct | px | hasPct | serializes as |
|---|---|---|---|
| 0 | 0 | no | `0px` |
| 0 | 480 | **yes** | `calc(0% + 480px)` |
| 240 | 0 | yes | `240%` |
| 30 | 420 | yes | `calc(30% + 420px)` |

The percentage term is always kept; the pixel term drops out when it is zero.
And in the trailing-component elision, **`0%` is not a zero length** — it is a
percentage that happens to be zero and resolves against a containing block nobody
has measured. `none → 8px 80% 800px` at progress 0 is `0px 0%`, and both of those
components had to be right for that string to appear.

(The engine's existing generic `_waLPSer` drops a zero percentage — right for the
properties it already serves, wrong here. It was left alone; `translate` got its
own. Flipping the generic one is a **measurable experiment**, not a cleanup.)

**10/112 → 112/112** and **228/408 → 408/408**.

## #435 — `rotate`

An axis and an angle. `_waRotCommon` decides whether the two rotations turn about
the **same line**: a zero rotation has no axis of its own and borrows the other's,
two zero rotations answer about z, an anti-parallel axis is the same line walked
backwards so its angle is negated onto the first one's.

- **Same line** → the angle simply adds and slides. This is the only reason
  `100deg` → `-100deg` passes *through* 0 rather than taking the short way round,
  and the only reason extrapolating to `900deg` means anything at all.
- **Different lines** → SLERP.

Three things had to be exactly right, and each cost measurable subtests:

**1. Addition along a common axis keeps its FULL angle.** 270° + 90° is a **360°
turn about that axis**, not nothing. Route addition through quaternions and the
axis is destroyed — a full turn's vector part has vanished — and
`n 360deg → none` can no longer wind back down through 270° and 90°. So addition
uses the common-axis path when there is one, and quaternions only when there
isn't. (The quaternion fallback *does* keep the degenerate rule: when the vector
part is gone the rotation is the identity however its `w` reads.)

**2. Both quaternions go into the w ≥ 0 half of the sphere BEFORE the arc is
measured.** A quaternion and its negation are the same rotation — that is what
"double cover" means — and only one of the two representatives measures the arc a
viewer would call the short way round. Skip the canonicalization and a 360° turn
arrives as `w = −1`, and `n 360deg → y 100deg` interpolates through **295°** where
**25°** was wanted. Doing it on the *inputs* (rather than negating the result) is
what lets the same code satisfy both the `y 25deg` rows **and** the un-flipped
`208.96deg` extrapolation the tests pin two blocks later.

**3. Six SIGNIFICANT digits, not six decimal places.** The mathematically exact
answer is `124.97530385109731deg`. `interpolation-testcommon.js` compares at two
decimals, where that rounds to **124.98** — while the same number cut to six
figures is `124.975`, which rounds to **124.97**, the answer every other engine
gives. The expectations are *written* in six figures
(`0.447214 -0.447214 0.774597 104.478deg` is six figures four times over). A
serialization that keeps MORE digits than the platform does is not more accurate
here; it is a different number.

**54/132 → 132/132** and **164/360 → 360/360**.

---

## Two supporting changes, both shared

**`_WA_UNCOMPUTED` shrank to `transform` + `offset-rotate`.** `translate` /
`rotate` / `scale` had been listed alongside `transform`, and that was a mistake
of association: `transform`'s *resolved* value is a matrix, but these three
resolve to their **computed** value — css-transforms-2 §5 says so in a note, and
`_normComputed` has dispatched them to `_canonIndividualTransform` since the
parsing quests. Left uncomputed, a keyframe's `400grad` never met the `360deg`
underneath it and `2em` never became pixels. Now every keyframe arrives in one
small canonical language: `N`/`N N`/`N N N`/`none`, `px`/`%`/`calc(P% ± Lpx)`, and
`Ndeg` / `x Ndeg` / `nx ny nz Ndeg`.

**An identity rotation computes to `0deg`.** css-transforms-2 §5.1, verbatim:
*"An identity transform does not count [as `none`]; it must serialize as
`0deg`."* A turn of nothing has no axis worth naming, so the axis goes away with
it and `rotate: 0 1 0 0deg` computes to plain `0deg`. Computed time only — a
specified value keeps what the author wrote until the units are resolved, and
before that a `calc()` may not be zero at all.

---

## Results

| file | before | after | Δ |
|---|---:|---:|---:|
| `css-transforms/animation/scale-composition.html` | 8/80 | **80/80** ✅ | **+72** |
| `css-transforms/animation/translate-composition.html` | 10/112 | **112/112** ✅ | **+102** |
| `css-transforms/animation/rotate-composition.html` | 54/132 | **132/132** ✅ | **+78** |
| `css-transforms/animation/scale-interpolation.html` | 154/360 | **360/360** ✅ | **+206** |
| `css-transforms/animation/translate-interpolation.html` | 228/408 | **408/408** ✅ | **+180** |
| `css-transforms/animation/rotate-interpolation.html` | 164/360 | **360/360** ✅ | **+196** |
| `rotate-interpolation-math-functions-tentative.html` | 18/48 | **26/48** | **+8** |
| `scale-animation-math-functions-tentative.html` | 20/48 | **28/48** | **+8** |
| `web-animations/.../interpolation-per-property-002.html` | 340/379 | **342/379** | **+2** |
| **TOTAL** | **996** | **1848** | **+852** |

Every "before" was measured on the unchanged build; the last three were
**stash-proved** (`git stash push` → rebuild → measure → pop → rebuild) because
they had never been in the ledger.

**Zero-regression sweep (all held identical):** qsa **1975**, classlist **1420**,
createElement 147, Element-matches 669, serialize-values 696, cssom idlharness
493, css-transitions `properties-value-001` **560/560**, css-transitions
idlharness 64, css-animations idlharness 98, `Animatable/animate` 147,
`setKeyframes` 78, `combining-effects/effect-composition` **17/17**,
`interpolation-per-property-001` 444, `KeyframeEffect/composite` 4/4,
`iterationComposite` 1/1, `CSSTransition-canceling.tentative` **11/11**,
`properties-value-003` 86, rotate-parsing-computed **23/23**, rotate-parsing-valid
23/23, scale-parsing-computed 38/38, scale-parsing-valid 32/32,
translate-parsing-computed 19/19, translate-parsing-valid 20/20,
css-transforms/inheritance 20/20, offset-path-computed 65/65,
transform-composition 36/56, transform-rotate-composition 114/126,
transform-scale-composition 56/98, transform-skew-composition 42/86,
perspective-composition 40/40, list-interpolation 24/76,
transform-interpolation-001 256/448, matrix-interpolation 4/4.

**Ledger correction:** the ritual list carried
`web-animations/interfaces/KeyframeEffect/effect-composition.html`. That path
**404s** (bodyLen 42 → reads as a could-not-run). The real one is
`web-animations/animation-model/combining-effects/effect-composition.html`, and it
is **17/17**. Likewise `css/css-transitions/CSSTransition-canceling.html` 404s —
the file is `CSSTransition-canceling.tentative.html`, **11/11**.

---

## Caps / Next

**Honest caps:**

- **`progress()` is not implemented.** Both `*-math-functions-tentative` files
  stop exactly there: `calc(progress(10rem, 20px, 100px) * 180deg)` survives as
  itself into the computed value. That is a CSS Values 5 function, a separate
  quest, and it is the entire remaining 22 + 20 subtests of those two files.
- **`transform-translate-composition.html` and `caret-color-composition.html`
  still could-not-run on a fresh server** — "test ran but summary never
  appeared", on the unchanged build too. Now **four sessions running** for
  caret-color-composition. Worth `harness_probe.py` as its own small quest; it is
  not a regression and never has been.
- The generic `_waLPSer` drops a zero percentage where `translate` keeps it.
  Deliberately left scoped — flipping it globally is a measurable experiment
  across `width-interpolation` (428) and friends, not a tidy-up.
- Still standing from #427–#432: a transition's `transform` endpoints are the
  RESOLVED matrix, not the computed list (~100 subtests); a mismatched transform
  function pair needs matrix decomposition + quaternion slerp; `_waAdd`'s general
  fallback returns the KEYFRAME value where css-values-4 §not-additive says
  `Vresult = Va`, the underlying.

**⭐ NEXT LEVERAGE:**

1. **The `transform` list now has a worked example to copy.** `#435` built real
   quaternion machinery (`_waQuat`, `_waQuatMul`, `_waQuatToRot`, the w ≥ 0
   canonicalization, the common-axis test) and the standing cap on `transform` is
   *"a mismatched function pair needs matrix decomposition + quaternion slerp"* —
   half of which now exists. `transform-composition` 36/56,
   `transform-scale-composition` 56/98, `transform-skew-composition` 42/86,
   `transform-matrix-composition` 36/112, `transform-interpolation-001` 256/448,
   `list-interpolation` 24/76 — **~500 subtests behind one decomposition.**
2. **The rest of the composition band** (still the widest single tail):
   `backdrop-filter-composition-001` 137/364, the two
   `grid-template-*-composition` 122/190 each, `shape-outside-composition`
   102/140.
3. **`_waAdd`'s fallback DIRECTION** — one line, one measured sweep of the band,
   and it either moves hundreds of subtests or none. Either answer is worth
   writing down.
4. **`progress()`** (CSS Values 5) — small, self-contained, and it finishes the
   two tentative files above.
5. `@starting-style` + `CSSStartingStyleRule` (8 untouched files).

**Reusable seeded:** `_WA_INDIV_TF` and the `_waIndiv` entry point (interpolate
with a `t`, compose with `t === null`); `_waScaleParse`/`_waScaleSer`;
`_waTrParse`/`_waTrSer` and the **`hasPct` flag** — the one place that says out
loud that a length-percentage is three things, not two; `_waRotParse`,
`_waQuat`/`_waQuatMul`/`_waQuatToRot`, `_waRotCommon`, `_waVecNorm`; and
**`_wa6sig`**, the standing reminder that the platform's number serialization is
six *significant digits* and that keeping more of them is not accuracy, it is a
different answer.
