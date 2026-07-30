# ⚔️ 421–423 — The Transitioned Verdict

> **Quests #421–#423, session 2026-07-30 — the CSS Transitions arc.**
> `css/css-transitions/` — 34 files moved, **+831**, ZERO regressions.
> `properties-value-001` **0 → 560/560**. The realm had a fully-parsed
> `transition-*` and no engine behind it whatsoever.

---

## 🩸 The gap

Quest #209 parsed `transition-*`. #217 expanded the shorthand. #219 computed the
`<time>#` lists. Every parsing test in `css/css-transitions/parsing/` was green.

And **not one transition had ever run.**

`scripts/wpt_fails.py` said it in one line, 560 times over:

```
[fail] background-color color(rgba) / values
    -> assert_not_equals: must not be target value after start
                          got disallowed value "rgba(10, 10, 10, 0.4)"
[fail] background-color color(rgba) / events
    -> assert_equals: Expected TransitionEnd events triggered on .transition
                      expected "background-color:2s" but got ""
```

The value jumped straight to its target and no `transitionend` ever fired. The
computed value on the right of that first line is *correct* — `rgba(10,10,10,0.4)`
is exactly what the parser should produce. It just arrived instantly.

`css/css-transitions/properties-value-001.html` measured **0 / 560** — the widest
untouched tail on the board, four times the size of anything left in
`web-animations/animation-model/`.

---

## 💡 The idea the whole arc rests on

**A CSS transition IS an `Animation` with a two-keyframe effect.**

Quests #412–#420 had already built, for Web Animations:

- a real timing model (`AnimationEffect`, phases, easing, fill) — #412
- a real playback model (hold time, start time, the ready/finished promises) — #413
- a spec-exact keyframe processor — #414
- **the animated-value cascade source** (`_waAnimatedDecls`) — #415
- the composition model — #416
- the interpolation kit (`_waSplitValue` / `_waInterpolate`) — #417
- the typed value model: colours, `rem`, computed keyframe values — #418–#420

None of that had to be built again. A transition needed exactly three things:

1. a **style change event**, at which before-change and after-change computed
   styles are compared (§starting-of-transitions);
2. a `CSSTransition` (an `Animation` subclass) carrying a `KeyframeEffect` whose
   two keyframes are those two values;
3. its declarations entering the cascade **above everything else** — transitions
   out-rank even an author `!important` (css-cascade-5 §cascade-sorting).

Everything below is those three things, and what it cost to make them cheap.

---

## ⚔️ Quest #421 — the transition model (+731)

### When is a style change event?

A real browser runs one per rendering update, plus a *forced* one whenever script
asks a question whose answer depends on style (`getComputedStyle`) or on layout
(`offsetWidth` & friends). Obscura has no rendering loop, so **the forced flush is
the whole mechanism** — and it is exactly the moment the difference becomes
observable. Hooks landed on `getComputedStyle`, on the four `offset*` box metrics
(the `elem.offsetWidth` reflow idiom every WPT transition test is written around),
on `getAnimations()`, at DOMContentLoaded, and — armed by any style-affecting
mutation — at the next task boundary.

### The cascade seat

`_waAnimatedDecls(el)` already returned one decl set at inline specificity with no
`important` flag, which css-cascade puts above every normal author declaration and
below an author `!important` one. Transitions sit at the **other end of the same
list**. So the hook now returns **two** sets, `{ anim, trans }`, and `_buildCascade`
pushes the transition one with `important` stamped on every declaration and an
**infinite specificity** — which is precisely "beats every finite-specificity
important author rule". `transition-important.html` fell out of that alone.

Effects composite in one pass, transitions last (they are higher in the cascade),
and an `owner` map remembers which source last wrote each property.

### What it costs a page that never transitions

This mattered more than any single subtest. `getComputedStyle` is the hottest
shared path in the engine, and this browser exists for hardware that cannot absorb
a regression there. The flush is gated four deep:

- a **generation compare** first: `_styleGen` (bumped by tree and attribute ops)
  plus `_cssomInlineGen` (bumped by CSSOM inline writes). A page that samples a
  running transition a thousand times pays one integer compare a thousand times.
- the **declaring-selector scan** is cached per `<style>` element by its text, and
  the cached *union* is itself recomputed only when a generation moves. Without
  that, every flush re-read every stylesheet — tens of kilobytes across the bridge
  per `getComputedStyle`.
- **candidate discovery is one `querySelectorAll`** over the union of every
  transition-declaring selector.
- each candidate is skipped unless a **fingerprint** — its own and its ancestors'
  `id`/`class`/`style`, its inline-CSSOM write counter, and the tree generation —
  says its style could actually have moved. On `properties-value-001` that is two
  elements out of fifty per flush.

### The first run was correct and too slow

560/560, harness **TIMEOUT**. Two fixes, both structural rather than fiddly:

- **A transition's keyframes are already computed values.** #420 made every
  keyframe value pass through `_waComputedValue` — which is right for a scripted
  animation and pure waste for a transition, whose endpoints were read straight
  out of computed styles. Re-computing them cost a fresh cascade *per keyframe on
  every getComputedStyle of a transitioning element*. One flag (`eff._csComputed`).
- **A flush must not build the same cascade twice.** `_csUpdateElement` builds one
  cascade to learn which properties are declared and another to read their values.
  A memo that is alive **only inside one synchronous flush** (set and nulled in a
  `finally`, two maps because the after-change style suppresses transitions) makes
  that exactly equivalent and half the price.

**62 seconds, harness OK.**

### Results

| test | before | after |
|---|---|---|
| `properties-value-001` | 0/560 | **560/560** ✅ |
| `properties-value-003` | 0/122 | **89/122** |
| `properties-value-implicit-001` | 0/60 | **60/60** ✅ |
| `properties-value-002` | 0/18 | **17/18** |
| `idlharness-2` | 2/19 | **7/19** |

---

## ⚔️ Quest #422 — the transition events (+22)

`events-00N` measured 0 with every subtest **NOTRUN** — they hang waiting for
events that never come. Four things stood between them and green:

**The four-event lifecycle.** `transitionrun` when the transition is created
(before any delay), `transitionstart` when the active phase begins, then exactly
one of `transitionend` / `transitioncancel`. `elapsedTime` is time spent in the
ACTIVE interval, which is why run/start report `min(max(-delay, 0), duration)` and
not zero: a negative delay means the transition is already partway through the
instant it starts, and that lost time is elapsed, not delay. `transitionrun` is
**queued, not fired inline** — a transition is created in the middle of a
`getComputedStyle`, and a listener must not be able to re-enter the cascade from
inside the flush that created it.

**A shorthand in `transition-property` transitions its longhands.**
`transition: padding .01s` is four transitions and four events. And a shorthand
must never transition *itself* — leaving `padding` in the compared set fired a
fifth `transitionend` beside the four real ones. The same expansion decides
`transition: padding-left .01s, padding .02s` in favour of `.02s`: the last layer
that matches wins, and a layer matches through its shorthand.

**A property with no previous declaration transitions from its initial value.**
`transition: all .01s` on an element that then declares `padding-left` for the
first time must animate from `0px`. A property absent from the previous snapshot
had *no matching declaration* at the previous style change event — so its computed
value then was simply the inherited-or-initial one. That is the honest
before-change value, and it costs one table lookup.

**A transition declared through the CSSOM has no attribute to be found by.**
`el.style.transitionDuration = …` never reaches the style attribute (the writeback
is gated on custom elements). Worse: `el.style.transitionProperty = …;
el.style.padding = …` declares the transition *and* changes the value inside ONE
style change event, on an element the engine has never looked at — so it must
already have been snapshotted **before it declared anything**. Hence scripted-inline
elements are candidates from their first write, bounded at `_CS_MAX_PRESNAP` (256)
because past that a page is doing bulk inline styling, not preparing a transition.

### Results

`events-001` 0→**9/9** · `events-002` 0→**2/2** · `events-003` 0→**1/1** ·
`events-004` 0→**2/2** · `events-005` 0→**3/3** · `events-008` 0→**3/3** ·
`transitioncancel-002` 0→**1/1** · `transitioncancel-003` 0→**1/1**

---

## ⚔️ Quest #423 — the transition lifecycle (+78)

### One root cause, eight files

`Element-getAnimations` 2/7, `Document-getAnimations` 1/7,
`AnimationEffect-getComputedTiming` 0/22, `CSSTransition-canceling` 0/11,
`CSSTransition-effect` 0/10 … all failing with
`Cannot read properties of undefined (reading 'effect')`.

`div.getAnimations()[0]` was `undefined`. **`getAnimations()` is a forced style
flush** — the transitions a page has just triggered must already exist by the time
it asks, exactly as with `getComputedStyle`. One hook, +53 subtests.

Alongside it, §animation-composite-order: CSS transitions sort **before**
everything else, by the style change event that generated them and then by property
name in codepoint order.

### The reversing shortening factor

Sending a half-faded element back where it came from must not take a FULL
duration — it must take as long as it has actually travelled. The trigger is the
running transition's **reversing-adjusted start value** coming back around as the
new target; the new factor is
`|current value fraction × old factor + (1 − old factor)|` clamped to [0,1], and it
**compounds** — reverse a reversal and the third transition is shorter again. The
new transition's reversing-adjusted start value is the *old one's end value*.

### `display:none` cancels, it does not complete

An element that is no longer rendered has its transitions **cancelled**, which is
why hiding a transitioning element fires `transitioncancel` and not
`transitionend`. `display:none` on an ANCESTOR takes the box away just the same —
walked only for an element that actually has something to cancel, so the ordinary
path never pays for it.

### A page that never asks still gets a first recalc

`transitioncancel-001` sets a class on `load` with no prior `getComputedStyle`
anywhere — so the engine had never recorded a before-change style and swallowed
the very first transition. A browser has computed style by DOMContentLoaded; now
so has Obscura. `before-load-001`, `changing-while-transition-001..004`,
`starting-of-transitions-001` and `transition-important` all came in behind it —
together with hooking `offsetTop`/`offsetLeft` (not only `offsetWidth`/`Height`),
which is how `transitions-retarget` forces its recalc.

### Two smaller truths

- A transition's **keyframes carry explicit offsets 0 and 1**, and the
  `transition-timing-function` is the **effect's** easing, not a keyframe's.
  `getKeyframes()` 0→5, `getComputedTiming()` 19→22.
- A transition **seeked past its delay** (via `currentTime` / `startTime`) must
  still announce that it started before it announces that it ended.

### The regression the sweep caught — and the spec line it was hiding

`web-animations/interfaces/Animation/style-change-events.html` fell **23 → 3**:
*"A transition should NOT have been triggered."*

The test plays a 100s `opacity` animation over the element, changes the specified
`opacity`, and asserts no transition starts. And it is right — §starting-of-transitions
says the before-change style is the previous style change event's computed style
*"except with any styles derived from **declarative animations** … updated to the
current time"*. A property an animation is currently supplying therefore has the
**same** before- and after-change value: the animation clobbers both, and no
transition can start however far the underlying specified value moved.

I was reading the stale snapshot. Asking `_waAnimatedDecls` for the element's
current animation-only declarations and skipping any property it owns fixed it —
and the file finished at **24/25**, one *above* its baseline.

### Results

`AnimationEffect-getComputedTiming` 0→**22/22** ✅ · `CSSTransition-canceling`
0→**10/11** · `CSSTransition-effect` 0→**8/10** · `Element-getAnimations`
2→**7/7** ✅ · `KeyframeEffect-getKeyframes` 0→**5/5** ✅ ·
`Document-getAnimations` 1→**5/7** · `CSSTransition-currentTime` 0→**4/5** ·
`CSSTransition-startTime` 0→**3/5** · `CSSTransition-ready` 0→**2/2** ✅ ·
`CSSTransition-finished` 0→**1/1** ✅ · `CSSTransition-transitionProperty`
0→**1/1** ✅ · `KeyframeEffect-target` 0→**1/3** · `transitioncancel-001` 0→**1/1** ✅ ·
`transitions-retarget` 0→**1/1** ✅ · `changing-while-transition-001..004`
0→**1/1** each ✅ · `before-load-001` 0→**1/1** ✅ · `starting-of-transitions-001`
0→**1/1** ✅ · `transition-important` 0→**1/1** ✅ ·
`transition-zero-duration-with-delay` 0→**1/1** ✅ · `disconnected-element-001`
3→**4/6** · `Animation/style-change-events` 23→**24/25**

---

## 🔒 Zero-regression sweep

All held **identical**: qsa 1975 · classlist 1420 · createElement 147 ·
createElementNS 596 · Element-matches 669 · cssom 493 · cssom-view 417 ·
geometry 372 · svg 1702 · serialize-values 696 · url-origin 406 ·
css-animations idlharness 98 · css-transitions idlharness 64 ·
css-transitions parsing (shorthand 18, computed 10, inheritance 8) ·
css-view-transitions 66 · css-conditional 45 · font-computed 315 ·
round-mod-rem-computed 233 · event-handler-all-global-events 375 ·
measure_syntax_err 5 · Event-dispatch-order 1 ·
interpolation-per-property-001 441 / -002 339 · effect-composition 13 ·
effect-value-context-filling 14 · iteration-composite 19 · setKeyframes 78 ·
Animatable/animate 147 · animation-shorthand 36.

Every number in the results tables above was **stash-proved**: the change was
`git stash`ed, rebuilt, re-measured, restored, rebuilt, re-measured.

---

## 🧭 Caps — honest, not failures

- **Pseudo-element transitions.** `::before` / `::after` / `::marker` are not
  transition candidates: they need pseudo-element computed styles feeding the
  same flush. Costs `events-006` (0/2), `KeyframeEffect-target` (2), and the
  ordering rows of `Document-getAnimations` (2).
- **The discrete gate.** `transition-behavior: allow-discrete` is not honoured;
  a non-interpolable pair currently starts a transition and rides the
  interpolation kit's discrete fallback. This is *right* for `visibility` and for
  `properties-value-003`'s discrete rows, and wrong for
  `CSSTransition-canceling`'s "an after-change style value can't be
  interpolated" (1). A per-property animation-type table is the real fix.
- **Timeline precision.** `CSSTransition-startTime` / `-currentTime` want
  `100` and read `100.002` — the `DocumentTimeline` advances between the write
  and the read. This is the long-standing "freeze `DocumentTimeline.currentTime`
  per task" item, now with concrete evidence behind it (3 subtests).
- **`@starting-style`.** `CSSStartingStyleRule` does not exist; the
  `starting-style-*.html` family (8 files) is untouched, and it is most of
  `idlharness-2`'s residue.
- **First-sighting.** An element that becomes a transition candidate *and* changes
  value inside the same style change event, with no prior flush and no scripted
  inline style, records only — it cannot invent a before-change value it never
  observed. Real browsers snapshot every element every recalc; we snapshot
  candidates, and buy back the common case with the scripted-inline pre-snapshot
  (bounded at 256).
- **Percentage → pixels** (pre-existing, #418): the arithmetic is right —
  `calc(10% + 10px)` is produced correctly — but resolving it is a layout
  engine's job. Unwinnable. Do not burn a session on it.

---

## ⭐ Next

1. **⭐ The transform-list interpolation path** — still #420's named leverage, and
   now worth *more*, because transitions multiply it: `properties-value-003`'s
   transform rows, the transform residue in both `interpolation-per-property`
   suites, and most of `effect-value-iteration-composite-operation` (19/38). A
   transform list is a list of FUNCTION slots; padding the shorter list with each
   function's identity is the same "second kind of hole" move #418 made for
   colours. Filter-list lacuna values fall out of the same shape.
2. **`@starting-style` + `CSSStartingStyleRule`** — a whole untouched file family
   (`starting-style-rule-basic`, `-none`, `-pseudo-elements`, `-cascade`,
   `-adjustment`, `-name-defining-rules`, `-size-container`, plus
   `after-change-style-inherited`), and it plugs straight into the
   before-change-style machinery this arc just built: `@starting-style` IS a
   before-change style override.
3. **Pseudo-element transitions** — `::before`/`::after` as flush candidates.
   Unlocks `events-006`, `pseudo-elements-001/002`, `pseudo-element-transform`,
   and the `getAnimations` ordering rows.
4. **Freeze `DocumentTimeline.currentTime` per task** — standing since #417, now
   with 3 measured subtests plus the `overallProgress` de-flake behind it.
5. **The discrete / `allow-discrete` gate** — a per-property animation-type table.
6. The still-untaken **scroll-offset model** (`scrollTop` reads 0 after
   `scrollTo({top:5000})` — 21 subtests + the primitive Playwright actionability
   reads).

## 🧰 Reusable, seeded this arc

`_csFlush` (the style change event, and its four-deep cost gate) ·
`_csFingerprint` (per-element "could this style have moved", ancestor-memoised) ·
`_csStart` / `_csCancel` / `_csEmitStart` / `_csFire` (the four-event lifecycle) ·
`_csImplicitBefore` (inherited-or-initial as the before-change value) ·
`_csLayerMatches` (shorthand-aware `transition-property` matching) ·
`_styleGen` / `_cssomInlineGen` / `_csArmHook` (mutation generations + the
task-boundary recalc, useful to anything that needs "did style change?") ·
`_cascadeMemo` (a flush-scoped cascade memo — the safe half of a cascade cache) ·
`eff._csComputed` (an effect whose keyframes are already computed values).
