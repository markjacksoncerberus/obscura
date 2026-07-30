# ⚔️ Scroll 415 — The Composited Verdict

> *Quests #415–#417 — animated computed style, the composition model, and the
> interpolation kit. `web-animations/animation-model/` **722→1791 of 2320
> (31.1% → 77.2%)**, plus **+10** in the `interfaces/` suite. **+1079 total**,
> ONE commit, ZERO regressions.*

Session 2026-07-30. Took #414's named next-leverage — the ⭐ pointer it left at
the top of the campaign memory, verbatim: *"`getComputedStyle(el)` does not
consult `el`'s active animations, and that ONE gap blocks …"*. It did, and it
does not any more.

---

## 🕳️ The gap

#412–#414 built a real Web Animations engine: a timing model, a playback model,
a spec-exact keyframe processor. `Element.animate()` returned a genuine
`Animation` whose `currentTime` advanced, whose `finished` settled at the right
moment, and whose `getKeyframes()` reported exactly what the spec says it should.

And **none of it was visible**. Every animated value stayed sealed inside the
`Animation` object. `getComputedStyle(div).fontStyle` on an element halfway
through `animate({ fontStyle: ['normal', 'italic'] })` answered `normal` — the
underlying style, as though the animation were not there at all. The entire
`web-animations/animation-model/` tree — the part of the spec that says what an
animation *does* — was measuring an engine that could not be observed.

One primitive was missing, and it was the one that turns a timing model into a
browser.

Baselines, all **stash-proved** (`git stash push` → rebuild → measure → pop):

| test | baseline |
|---|:---:|
| `animation-types/interpolation-per-property-001` | 108/466 |
| `animation-types/interpolation-per-property-002` | 82/379 |
| `animation-types/accumulation-per-property-001` | 147/375 |
| `animation-types/addition-per-property-001` | 147/375 |
| `animation-types/accumulation-per-property-002` | 117/312 |
| `animation-types/addition-per-property-002` | 116/308 |
| `keyframe-effects/effect-value-iteration-composite-operation` | 0/38 |
| `combining-effects/effect-composition` | 0/17 |
| `keyframe-effects/effect-value-context-filling` | 1/14 |
| `combining-effects/clamping-001` | 4/12 |
| `animation-types/discrete` | 0/5 |
| `keyframe-effects/effect-value-context` | 0/5 |
| `keyframe-effects/effect-value-replaced-animations` | 0/5 |

---

## ⚒️ #415 — the animated-value cascade source

**`_buildCascade(el)` already returned an ordered list of declaration sources.**
That was the whole opening: animated values do not need their own value-resolution
path, their own units machinery, or their own inheritance. They need to be *one
more source*, and every computed-value rule in the engine then applies to them
unchanged.

The Web Animations cascade slots animations **above every normal author
declaration — inline style included — and below an author `!important` one**.
`_cascadeWinner` already sorts importance-first, then specificity, then source
order. So a single source pushed with inline specificity and **no important
flag**, appended last, lands in exactly the right place *for free*. No new
ordering logic was written.

- `_waSampleAt` / `_waEffectValueFor` — the §effect-value sampler, factored out
  of `commitStyles` (which had been the only place an animated value was ever
  observable) so both callers share one implementation.
- `_waAnimatedDecls(el)` — the hook `_buildCascade` calls. **Its first line is
  the entire cost for a page that animates nothing:** a `Set.size` check. That
  matters — `getComputedStyle` is the hottest shared path in the engine, and this
  browser is for machines that feel every wasted cycle.
- **An effect that is not in effect contributes NOTHING.** Idle, or outside its
  active interval with no fill covering the phase, means an *empty* effect value
  — not a clamped one. That is precisely what a null transformed progress means,
  so the check is one comparison. (`commitStyles` is the deliberate exception:
  it writes the value at the current time regardless, clamping to the nearest
  end. Same sampler, different progress.)
- `_waSeq` — a monotonic counter stamped at `Animation` construction, so two
  script animations on one element composite in **creation order** (§animation
  composite order). A `Set`'s insertion order would have been reshuffled by a
  cancel-and-replay.

`animation-types/discrete` 0→**5/5** the moment it landed, and
`interpolation-per-property-001` went 108→**343**.

## ⚒️ #416 — the composition model

`composite: 'add'`, `composite: 'accumulate'`, and implicit keyframes all need
the same thing the engine had never had to produce: **the underlying value** —
the element's computed style with the animations taken back out.

- **The underlying value is a `getComputedStyle` call with the hook disarmed.**
  Resolved lazily through a thunk, memoised per property, and never resolved at
  all for an all-`replace` effect whose keyframes already cover offsets 0 and 1.
- **Implicit endpoints need no neutral-value table.** The spec inserts a
  keyframe holding the *neutral value for composition* with a composite of `add`
  — and adding any type's neutral value to the underlying value yields the
  underlying value itself. So an implicit endpoint's composited value simply *is*
  the underlying value. One line instead of a per-type table, and exactly
  equivalent.
- **The effect stack composites downward** — each animation sees the result of
  everything below it, which is what makes `add` onto an underlying *animation*
  (not just onto the base style) come out right.
- **Interval endpoints, and why overlapping keyframes decide it.** The start is
  the **LAST** keyframe with offset ≤ progress; the end is the **FIRST** with
  offset strictly greater. With several keyframes sharing an offset that
  tie-break is the whole answer: below an overlap point the *first* of the tied
  keyframes closes the interval, at or above it the *last* opens the next one.
  A progress outside [0,1] — which an overshooting easing produces — falls off
  one end and returns that single keyframe's value (spec step 9).
- **Iteration accumulation** (`iterationComposite: 'accumulate'`) applies
  **first**, to the raw keyframe values, before any composition against the
  underlying value: `currentIteration` copies of the end-of-iteration value are
  accumulated onto each keyframe.

### 🐛 The hang, and the guard that was scoped wrong

The first build of #416 **hung the browser** on a test that had passed minutes
earlier. The re-entrancy latch was a single global flag, set around the
`getComputedStyle` call and cleared immediately after — but resolving a computed
value re-enters the cascade *several times over* (inheritance walks,
`_specifiedDecl`), all **after** the flag was cleared. Element → underlying →
cascade → element → underlying → forever.

The fix is not a longer-held global flag (that would suppress an **ancestor's**
animated value during inheritance, which is wrong). It is a **per-element**
guard held for the whole read: an ancestor still animates and is still
inherited from, and the recursion terminates because the chain only ever walks
*upward* through a finite tree.

## ⚒️ #417 — the interpolation kit

`_waInterpolate` handled same-unit numbers and flipped everything else
discretely. That is correct for maybe a fifth of CSS.

**The root-cause observation:** almost every CSS value that interpolates does so
the same way — the two endpoints have **the same shape** and differ only in
their numbers, which move component-wise. So: split each value into its numbers
and the literal text between them; if the literal *skeletons* match, interpolate
every number independently.

One rule, and it covers `blur(0px)`→`blur(10px)`, `rect(…)`, `matrix(…)`,
`brightness(1) contrast(1)` filter lists, `drop-shadow(rgb(…) 0px 0px 0px)`,
`box-shadow`, `hue-rotate(0deg)`, transforms. **And it gives the discrete
fallback for free from the same test** — a different unit, a different function,
a differently-ordered filter list all fail the skeleton match, which is exactly
the spec's condition for falling back to discrete. `_waAdd` and
`_waIterAccumulate` were rebuilt on the same two primitives.

### 🎨 Colours interpolate premultiplied

Component-wise interpolation of `rgba()` is **wrong**, and WPT spells out why in
a comment. Each channel is scaled by its own alpha before it moves and divided
by the resulting alpha afterwards — otherwise a nearly-transparent colour's hue
drags the result toward itself as hard as an opaque one would.
`rgba(255,0,0,0.4)` → `rgba(0,0,255,0.8)` at half is `rgba(85, 0, 170, 0.6)`,
not an even split. Endpoints are first computed to sRGB through the engine's
existing `_computeColor`, which is what lets `#00f` → `hsl(240 100% 50%)`
interpolate at all instead of flipping discretely.

### 🐛 Not every run of digits is a number

The first structural build produced
`url("http://localhost/test-1.499")`. Two kinds of digits must stay literal:

- **inside a quoted string** — a URL's `test-1` is not a quantity;
- **part of an IDENTIFIER** — the `-1` of `ident-1`, the `3d` of `translate3d`,
  the hex of `#ff0000`.

Both are recognised by the character *preceding* the match, so one look-behind
handles both. And leaving them literal gives the right **answer** for free:
`ident-1` and `ident-2` then differ in their skeletons, so the pair is not
interpolable and correctly falls back to discrete — which is what the spec says
for a `<custom-ident>`. Fixing the corruption fixed the semantics.

Finally, a small explicit set for the properties whose animation type is
**discrete even though their values look numeric** — `<grid-line>` values of `1`
and `5` name two different lines, and there is no line 3 between them.

---

## 📊 Results

### `web-animations/animation-model/` — **722→1791 of 2320** (31.1% → **77.2%**)

| test | before | after | Δ |
|---|:---:|:---:|:---:|
| `animation-types/interpolation-per-property-001` | 108/466 | **422/466** | **+314** |
| `animation-types/interpolation-per-property-002` | 82/379 | **312/379** | **+230** |
| `animation-types/accumulation-per-property-001` | 147/375 | **275/375** | **+128** |
| `animation-types/addition-per-property-001` | 147/375 | **274/375** | **+127** |
| `animation-types/accumulation-per-property-002` | 117/312 | **220/312** | **+103** |
| `animation-types/addition-per-property-002` | 116/308 | **214/308** | **+98** |
| `keyframe-effects/effect-value-iteration-composite-operation` | 0/38 | **18/38** | **+18** |
| `combining-effects/effect-composition` | 0/17 | **13/17** | **+13** |
| `keyframe-effects/effect-value-context-filling` | 1/14 | **13/14** | **+12** |
| `combining-effects/clamping-001` | 4/12 | **12/12** 🟢 | **+8** |
| `animation-types/discrete` | 0/5 | **5/5** 🟢 | **+5** |
| `keyframe-effects/effect-value-context` | 0/5 | **5/5** 🟢 | **+5** |
| `animation-types/clamping-001` | 0/2 | **2/2** 🟢 | **+2** |
| `keyframe-effects/effect-value-overlapping-keyframes` | 0/2 | **2/2** 🟢 | **+2** |
| `keyframe-effects/effect-value-replaced-animations` | 0/5 | **2/5** | **+2** |
| `animation-types/visibility` | 0/2 | **1/2** | **+1** |
| `keyframe-effects/effect-value-interval-distance` | 0/1 | **1/1** 🟢 | **+1** |
| `keyframe-effects/computed-keyframes-shorthands` | 0/1 | 0/1 | — |
| `keyframe-effects/background-shorthand` | 0/1 | 0/1 | — |
| **subtotal** | **722** | **1791** | **+1069** |

### `web-animations/interfaces/` — **732→735 of 845**

| test | before | after | Δ |
|---|:---:|:---:|:---:|
| `KeyframeEffect/target` | 3/24 | **7/24** | **+4** |
| `Animation/cancel` | 0/4 | **3/4** | **+3** |
| `Animation/commitStyles` | 14/32 | **16/32** | **+2** |
| `KeyframeEffect/setKeyframes` | 77/80 | **78/80** | **+1** |

`web-animations/idlharness.window.html` held exactly at **188/230**.

---

## ✅ Zero regressions

Swept and identical: qsa **1975**, classlist **1420**, createElement **147**,
createElementNS **596**, cssom idlharness **493**, cssom-view idlharness
**417**, geometry **372**, svg **1702**, filter-effects **485**, css-masking
**41**, css-animations **98**, css-transitions **64**, css-view-transitions
**66**, css-fonts **97**, css-conditional **45**,
**event-handler-all-global-events 375/375**, **popover-focus 30/30**, url-origin
**406**, serialize-values **696/697**, outline-valid **20/20**, cursor-computed
**36/39**, content-visibility-computed **3/3**, checkVisibility **13/15**,
web-animations idlharness **188/230**.

The whole 39-file `interfaces/` suite was re-run file-by-file against its
732/845 hold; every file held or gained, verified per-file by stash-proof for
each suspect. `getComputedStyle` is the hottest shared path in the engine, so
the sweep was deliberately heavier than usual.

**`popover-focus` read 26/30 mid-sweep and 30/30 on a fresh server** — the
documented CDP-session degradation, not a regression. Restart between long runs.

**One flake named honestly.** `Animation/overallProgress` reads 2/6 or 3/6
run-to-run **on both builds** — measured 5× on the stashed baseline (3,3,2,3,3)
and 4× on this one (2,2,3,2). The flapping subtest does
`animation.startTime = document.timeline.currentTime` and then asserts
`animation.currentTime === 0`: a millisecond race between two clock reads.
**This work does not cause it, but it does worsen its odds** — `getComputedStyle`
now does strictly more work, so the millisecond boundary is crossed more often.
The real fix is in *Next*, below; it was not attempted here because it is a
shared timing change that would need its own full sweep.

---

## 🧗 Caps — named, genuine

- **Percentage and `calc()` resolution needs layout.** `width: ['0%', '50%']`
  inside a 100px parent must report `25px`; Obscura reports `25%` because the
  computed value *is* the percentage and only a used value resolves it. Same for
  `calc(10% + 10px)`. Unwinnable without a layout engine — do not burn a session.
- **`rem` resolves against 16px, not the root element's font-size** (~12
  subtests: "a length of rem" across both interpolation files). This is a
  *computed-style* bug, not an interpolation one, and it is cleanly separable —
  see *Next*.
- **Transform list padding.** Two transform lists of different length
  (`translateX(50px)` vs `translateX(50px) translateY(100px)`) should interpolate
  component-wise with the shorter padded by identity. The generic shape rule
  correctly declines and falls back to discrete. Needs a transform-aware path.
- **Filter-list lacuna values** — a shorter filter list is padded with each
  function's *lacuna* value (1 for `brightness`, 0 for `sepia`), which the
  generic rule cannot know.
- `computed-keyframes-shorthands` and `background-shorthand` (1 each) need
  shorthand → longhand expansion **inside** the keyframe list.
- The `interfaces/` residue is unchanged from #414's honest list: the Level-2
  standalone interfaces, `CSSNumberish`'s Typed-OM dependency, `getKeyframes()`
  value re-serialization, cross-realm animations.

---

## 🎯 Next — where the leverage is now

1. **⭐ `rem` against the root font-size.** A contained, measured
   ~12-subtest win in *this* region, and every `rem`-using page in the world
   benefits. `rem` is currently hardcoded to 16px instead of resolving against
   the document element's computed `font-size`. Small, sharp, wide.
2. **Freeze `DocumentTimeline.currentTime` per task.** This is real spec
   behaviour — a document timeline's current time is the *frame* time, constant
   within a task, which is exactly what makes WPT's timing assertions
   deterministic in real browsers. It de-flakes `Animation/overallProgress` at
   the root rather than papering over it. Treat as a shared timing change: sweep
   the whole `interfaces/` suite after.
3. **The transform/filter-list interpolation paths** — list padding with identity
   / lacuna values. Bounded, and the shape kit is already there to build on.
4. **The scroll-offset model** — still standing from #411/#414 and still
   un-taken: `scrollTop` reads 0 after `scrollTo({top: 5000})`, which is 21
   subtests in the scroll-promises pair *and* the primitive Playwright
   actionability reads.

**Reusable, seeded here:** `_waSplitNums`/`_waSameSkeleton` (the shape test — any
future CSS value interpolation, transitions included, should build on it),
`_waAdd`/`_waAccumulate`/`_waIterAccumulate`, `_waColorLerp` (premultiplied
sRGB), `_waEffectValueFor`/`_waEffectValueMap` (§effect-value with composition),
`_waAnimatedDecls` (the cascade hook + the **per-element** re-entrancy guard —
the pattern any future "resolve style without X" feature needs), `_waKebab`.
