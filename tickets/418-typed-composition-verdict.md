# ⚔️ Scroll 418 — The Typed Verdict

> *Quests #418–#420 — the colour as a value slot, `rem` against the root
> font-size, and keyframe values as computed values. The whole
> `web-animations/animation-model/` tree **1817→2157 of 2352 (77.3% → 91.7%)**,
> plus `css/css-values/rem-unit-root-element` **1→4 (100%)**. **+343 total**,
> ONE commit, ZERO regressions.*

Session 2026-07-30. Took #417's ⭐ named next-leverage (`rem`) and, on the way to
it, root-caused the two *larger* buckets sitting beside it in the same suites.

---

## 🕳️ The gap

#415–#417 made animated values visible and gave them a general interpolation
kit: split a CSS value into its numbers and the literal text between them, match
the skeletons, move every number. One rule, and it covered filters, `rect()`,
`matrix()`, shadows, transforms — and gave the discrete fallback for free.

But a CSS value has more than one kind of hole in it, and it can be *spelled*
more than one way. Measured, the residue in the four composition suites bucketed
almost entirely into three failures of that assumption:

| bucket | ≈subtests | what the engine actually did |
|---|:---:|---|
| `<color>` addition / accumulation | ~195 | `rgb(255, 0, 0)` added onto `rgb(128, 128, 128)` answered `rgb(255, 0, 0)` |
| keyframe values left in specified syntax | ~100 | `1rem` added onto an underlying `10px` answered `1rem` |
| `rem` hardcoded to 16px | ~54 | `html { font-size: 10px }` and `1rem` still meant 16 pixels |

Every one of them is a *typing* failure: the engine was treating a colour as
three numbers, a length-percentage as one, and a specified value as a computed
one.

Baselines, all **stash-proved** (`git stash push` → rebuild → measure → pop).

---

## ⚒️ #418 — the colour as a value slot

**`#ff0000` and `rgb(255, 0, 0)` had nothing in common.** Under a
numbers-and-literals model one of them contributes no numbers at all and the
other contributes three, so their skeletons could never match, so adding a colour
to the value underneath it fell straight through to the spec's non-additive
fallback: replace.

The fix is to stop pretending a colour is three numbers. **A colour is one
token**, with its own spellings and its own arithmetic. Giving it a *second kind
of hole* in the same skeleton (`_waSplitValue` → `{ lits, slots }`, a slot being
either a number or an `[r, g, b, a]`) buys three separate things from one change:

- every spelling of a colour has the same **shape**, so `#ff0000`, `hsl(0 100%
  50%)` and `rgb(255, 0, 0)` all composite against `rgb(128, 128, 128)` alike;
- the colour gets its **own** addition and its own interpolation, both correct;
- a value that **mixes** colours with other components — a colour *pair* like
  `scrollbar-color`, a `box-shadow`'s colour plus four lengths — needs no extra
  machinery, because the colour hole simply sits in the ordinary skeleton beside
  the number holes. `scrollbar-color` went from *no* colour arithmetic to full
  colour-pair arithmetic without a line of pair-specific code.

Colours **add premultiplied**: each channel is scaled by its own alpha before it
is summed and divided by the resulting alpha afterwards, and alpha itself
saturates at 1. That is why `rgba(255, 0, 0, 0.4)` added onto an opaque grey
moves red by 102 and not by 255 — `rgb(230, 128, 128)`, exactly what WPT asks
for.

**The subtlety worth the next knight's time: clamp ONCE, at the end.** A
composited channel legitimately leaves the 0–255 range — 128 + 255 = 383 — and
that overflow has to survive the trip through interpolation. From `rgb(383, …)`
to `rgb(128, …)` the midpoint is 255; from a prematurely clamped `rgb(255, …)`
it is 192. So `rgb()`/`rgba()` is read *directly* rather than through
`_computeColor` (which clamps), and `_waClampColors` runs in exactly one place:
on the finished animated value, at the moment it becomes a declaration.

Two guards keep the colour scanner honest. Quoted spans are masked as before —
and so are `url(…)` bodies, because an SVG paint of `url(#abc)` ends in three
hex digits, which is precisely the shape of a short hex colour. And **named**
colours are only looked for on properties that actually take one: `#ff0000` and
`rgb(…)` are unmistakable anywhere, but `tan`, `red` and `plum` are ordinary
words that must not be plucked out of a font stack or a custom ident.

| test | before | after |
|---|:---:|:---:|
| `animation-types/accumulation-per-property-001` | 275/375 | **341** |
| `animation-types/accumulation-per-property-002` | 220/312 | **250** |
| `animation-types/addition-per-property-001` | 274/375 | **340** |
| `animation-types/addition-per-property-002` | 214/308 | **244** |
| `animation-types/interpolation-per-property-001` | 422/466 | **423** |
| `animation-types/interpolation-per-property-002` | 312/379 | **318** |
| `animation-types/scrollbar-interpolation` | 0/1 | **1/1** |

**+200.**

---

## ⚒️ #419 — `rem` against the root font-size

#417's ⭐ pointer, and the smallest change in the arc by far. `rem` was a
constant 16 in the length table — right for a page that never sets a root
font-size, wrong for every page that does. `html { font-size: 62.5% }` is a
decade-old idiom; under it *every* `rem` length in the document was wrong.

**`rem` needs no per-element context.** Unlike `em` — which had to be threaded
through two dozen `opts.emPx` call sites because it depends on the element being
styled — `rem` is a **document-wide constant**. So it is resolved inside
`_evalMath` itself, once, with no call-site changes at all: every path that
already resolved a length correctly now resolves `rem` correctly too, including
inside `calc()`.

**The one subtlety is the root element itself.** A `rem` in the root's *own*
font-size refers to the **initial** value of font-size, not to the value being
computed — otherwise `html { font-size: 2rem }` would have to resolve against
itself. A re-entrancy latch says exactly that: while the root's font-size is
being resolved, `rem` answers 16px. So `html { font-size: 2rem }` is 32px, and
every `rem` elsewhere in the document is then 32px. The latch is **saved and
restored**, not cleared, because the resolver reaches that same branch through
the latch it just set.

| test | before | after |
|---|:---:|:---:|
| `animation-types/interpolation-per-property-001` | 423/466 | **434** |
| `animation-types/interpolation-per-property-002` | 318/379 | **324** |
| `css/css-values/rem-unit-root-element` | 1/4 | **4/4** |

**+20** — and a correctness win for every `rem`-using page in the world, which
is most of them.

---

## ⚒️ #420 — keyframe values are computed values

§keyframes: *"the property value is a **computed** value"*. A keyframe is
authored in specified syntax — `1rem`, `2em`, `calc(1em + 20%)` — but everything
that happens afterwards operates on computed values. Obscura skipped the step,
which is why `1rem` added onto an underlying `10px` answered `1rem`: **two
spellings of the same ten pixels have no shape in common until both are pixels.**

`_normComputed(el, kebab, value)` is already the engine's "compute this specified
value on this element" function, so the whole conversion is one call — guarded by
the *same* per-element latch the underlying value uses, and for the same reason:
resolving `2em` asks for the element's font-size, which walks straight back into
the cascade and so into the animated-decls hook. Saved and restored, because the
underlying-value read may already be holding it.

**Three exceptions, each of which is a real distinction rather than a patch:**

- **`opacity` and its family.** Computing opacity *clamps* it to [0, 1], and a
  keyframe value must not be clamped — the spec clamps the **result**.
  `opacity: [-0.5, 2]` sampled halfway through a `steps(1, jump-both)` is 0.75,
  and it can only be 0.75 if both endpoints survive the trip out of range. Same
  lesson the colours taught, on a different type: the only conversion these
  properties need is percentage → number, so that is done directly and the clamp
  is left to the ordinary computed-style read.
- **The transform family.** CSSOM's *resolved* value for `transform` is a
  matrix; its *computed* value is the transform **list**, and the list is what
  animates, function by function. Collapsing `rotate(90deg)` to a matrix first
  leaves the interpolator shuffling matrix cells — a different animation, and
  generally not a valid one. (Caught as a live regression mid-quest: −2 on
  `iteration-composite-operation`.)
- **`var()`.** A custom property is substituted where the **declaration** is
  resolved, with the element's variables in hand; asked to compute `var(--x)` on
  its own there is nothing to substitute from. The keyframe keeps the reference
  and the cascade resolves it later — which is also exactly what makes a filling
  effect track a variable that changes underneath it. (Also caught as a live
  regression: −1 on `effect-value-context-filling`, which is now **14/14**.)

**The second half: a length-percentage is a two-component value.** `10px` and
`20%` have nothing in common as *text*, and the shape rule rightly declines them
— but they are perfectly combinable, because a computed `<length-percentage>` is
not one number, it is **two**: so many pixels plus so many percent, either of
which may be zero. Written that way, each component moves on its own — which is
what the spec means when it says the halves of a `calc()` are interpolated (and
added) independently — and the result serializes straight back into the
`calc(P% + Lpx)` form the engine already computes mixed values to. `10%` added
onto `10px` is `calc(10% + 10px)`; `10px` interpolated toward `20%` at the
halfway mark is `calc(10% + 5px)`.

| test | before | after |
|---|:---:|:---:|
| `animation-types/accumulation-per-property-001` | 341/375 | **360** |
| `animation-types/accumulation-per-property-002` | 250/312 | **280** |
| `animation-types/addition-per-property-001` | 340/375 | **359** |
| `animation-types/addition-per-property-002` | 244/308 | **275** |
| `animation-types/interpolation-per-property-001` | 434/466 | **441** |
| `animation-types/interpolation-per-property-002` | 324/379 | **339** |
| `keyframe-effects/effect-value-context-filling` | 13/14 | **14/14** |
| `keyframe-effects/effect-value-iteration-composite-operation` | 18/38 | **19** |
| `interfaces/Animation/commitStyles` | 16/32 | **17** |

**+123.**

---

## 📊 The tree

`web-animations/animation-model/` — 24 files with results, all
**stash-proved** before → after:

| | before | after |
|---|:---:|:---:|
| **whole tree** | **1817/2352 (77.3%)** | **2157/2352 (91.7%)** |

---

## 🛡️ Zero-regression sweep

Held **identical**: qsa 1975, classlist 1420, createElement 147, createElementNS
596, cssom idlharness 493, cssom-view 417, geometry 372, svg 1702, filter-effects
485, css-masking 41, css-animations 98, css-transitions 64, css-view-transitions
66, css-fonts idlharness 97, css-conditional 45, **event-handler-all-global-events
375/375**, url-origin 406, serialize-values 696/697, outline-valid 20/20,
cursor-computed 36/39, **web-animations idlharness 188/230**, font-size-computed
21/21, font-computed 315/315, background-position-computed 32/32,
background-size-computed 16/16, letter-spacing-computed 9/9,
word-spacing-computed 9/9, text-indent-computed 10/10, round-mod-rem-computed
233/243, round-mod-rem-serialize 21/24, `interfaces/KeyframeEffect/target` 7/24,
`setKeyframes` 78/80, `Animatable/animate` 147/153,
`Animation/style-change-events` 23/25.

The `rem` change touches the engine's **shared computed-style path**, so the
sweep was deliberately widened to the `-computed` parsing suites above rather
than kept to the ritual list.

---

## 🧗 Caps — named, genuine

- **Percentage resolution still needs layout.** `width: ['0%', '50%']` inside a
  100px parent must report `25px`; we report `25%`, because the *computed* value
  is the percentage and only a **used** value resolves it. #420 makes the
  arithmetic right (`calc(10% + 10px)` is now produced correctly); turning that
  into pixels is a layout engine's job. Unwinnable here — do not burn a session.
- **Transform-list padding and filter-list lacuna values.** Two transform lists
  of different length should interpolate component-wise with the shorter padded
  by identity; a shorter filter list is padded with each function's *lacuna*
  value (1 for `brightness`, 0 for `sepia`). The generic shape rule correctly
  declines both and falls back to discrete. Needs type-aware list paths — see
  *Next*.
- **Shorthand expansion inside the keyframe list** — `computed-keyframes-shorthands`,
  `background-shorthand`, and the `gap`/`border-spacing` rows in the composition
  suites all need a shorthand to become its longhands *before* composition.
- **`calc-size()` and complex math AST ordering** — the last few
  `iteration-composite-operation` rows want a math AST preserved through
  accumulation, not a folded number.
- `web-animations/animation-model/keyframe-effects/keyframe-exceptions.html`
  runs but never reports a summary (harness-level, not a failure count).

---

## 🎯 Next — where the leverage is now

1. **⭐ The transform-list interpolation path.** The shape kit and now the *slot*
   kit are both there to build on: a transform list is a list of function slots,
   and padding the shorter list with each function's identity is the same
   "second kind of hole" move #418 made for colours. It closes
   `applying-interpolated-transform`, most of the remaining
   `iteration-composite-operation` rows, and the transform residue in both
   interpolation suites. Filter-list lacuna values fall out of the same shape.
2. **Shorthand expansion inside keyframes.** `gap`, `border-spacing`,
   `background`, `text-decoration` — the keyframe processor validates through the
   ordinary CSSOM setter already, so the longhands it produces are *right there*;
   they just are not being kept.
3. **`css/css-transitions/properties-value-001.html` is 0/560.** Measured this
   session. CSS Transitions has no engine at all, and it would now be built on
   top of a working interpolation kit rather than from nothing — the
   `_waSplitValue`/`_waSameShape`/`_waLPParse` primitives are exactly what a
   transition needs. The single widest untouched tail found this session.
4. **Freeze `DocumentTimeline.currentTime` per task** — still standing from
   #417. Real spec behaviour, de-flakes `Animation/overallProgress` at the root.
5. **The scroll-offset model** — still un-taken since #411: `scrollTop` reads 0
   after `scrollTo({top: 5000})`, 21 subtests plus the primitive Playwright
   actionability reads.

**Reusable, seeded here:** `_waSplitValue`/`_waSameShape`/`_waJoin` (the
value model — literals with number *and* colour holes; any new kind of hole
plugs in here), `_waColorAdd`/`_waColorMix`/`_waParseColorTok`/`_waSerColorTok`
(premultiplied sRGB arithmetic, unclamped), `_waClampColors` (**the clamp-once
discipline**), `_waLPParse`/`_waLPSer` (the length-percentage as a `{pct, px}`
pair), `_waComputedValue` (compute a keyframe value + the three honest
exceptions), and `_rootFontPx` (the root font-size with its own re-entrancy
latch — reusable for `rlh`, `rex`, `rch`, `ric`, `rcap`, none of which resolve
correctly yet).
