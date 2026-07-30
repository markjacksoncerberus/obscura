# ⚔️ Quests #412–#414 — The Animated Verdict

> *The Web Animations arc. Obscura had a ten-line lie where an animation engine
> should be: `Element.animate()` returned an object literal whose `finished` was
> already resolved and whose `currentTime` was frozen at 0. Three quests replaced
> it with a real timing model, a real playback model, and a spec-exact keyframe
> processor.*

**Realm:** `web-animations/` (Web Animations Level 1 + the Level 2 members
browsers actually ship)
**Status:** ✅ **SECURED — +840, zero regressions**
**Session:** 2026-07-30
**Banner drawn from:** #411's named next-leverage — *"a minimal Web Animations
`Element.animate()` + `Animation`"* — the widest adjacent tail on the board.

---

## The gap

`crates/obscura-js/js/bootstrap.js:5484` held the whole of Web Animations:

```js
animate(keyframes, options) {
  const duration = typeof options === 'number' ? options : (options?.duration || 0);
  return {
    finished: Promise.resolve(), currentTime: 0, playState: 'finished',
    effect: { getComputedTiming() { return { duration }; } },
    cancel(){}, finish(){}, play(){}, pause(){}, reverse(){},
    addEventListener(){}, removeEventListener(){},
    onfinish: null, oncancel: null,
  };
}
getAnimations() { return []; }
```

No `Animation`, no `AnimationEffect`, no `KeyframeEffect`, no timeline, no
`document.timeline`, no `AnimationPlaybackEvent`. Baselines:

| Test | Before |
|---|---|
| `web-animations/idlharness.window.html` | **42/230** (18.3%) |
| the 39-file `web-animations/interfaces/` behaviour suite | **38/845** (4.7%) |

---

## The work

### Quest #412 — the timing model (idlharness 42 → 111, **+69**)

`AnimationTimeline` (no IDL constructor → `new` throws) and `DocumentTimeline`,
whose `currentTime` is `performance.now() - originTime` — `performance.now()`
already measures from the document's time origin, so the timeline needs no clock
of its own. `document.timeline` is a brand-checked readonly attribute minted
**once per document** (an iframe's is a different object; WPT checks that).

`AnimationEffect` holds only the *specified* timing; every computed quantity is
derived on demand by `_waComputedTiming`, a faithful transcription of
§timing-model: `activeDuration` → `endTime` → the before/active/after **phase**
(direction-sensitive at the boundaries) → `activeTime` (gated on the resolved
fill mode) → `overallProgress` → `simpleIterationProgress` → `currentIteration`
→ the **directed** progress (alternate / alternate-reverse) → the **transformed**
progress (easing). Nothing is cached, so neither a timing change nor a seek needs
invalidation.

`updateTiming()` validates the *whole* dictionary before writing anything — an
out-of-range member must leave the effect untouched, not half-updated.

Easing is parsed once per assignment (an invalid easing is a `TypeError` at the
point of assignment, never a silent no-op at sample time) and **canonicalised**,
reusing the engine's existing `_canonEasing` — the very code path
`transition-timing-function` already goes through. That is why `step-start`
reports `steps(1, start)`, `steps(2, end)` reports `steps(2)`, and
`Ease\2d in-out` / `ease /**/` name the same functions `ease-in-out` / `ease` do.
Sampling functions: a Newton-Raphson cubic-Bézier solver with a bisection
fallback, the six `steps()` positions, and piecewise `linear()`.

### Quest #413 — the playback model (idlharness 111 → 188, **+77**)

`Animation : EventTarget` as the full §playing-an-animation state machine — hold
time / start time / playback rate / pending playback rate, the **pending play and
pause tasks**, `ready` and `finished`, and §updating-the-finished-state. Plus
`AnimationPlaybackEvent`, `onfinish`/`oncancel`/`onremove`, the `Animatable`
mixin on `Element.prototype`, `AnimationTimeline.play()`, and
`DocumentOrShadowRoot.getAnimations()` on Document + ShadowRoot.

`commitStyles()` writes the effect's value **at the current progress** into
inline style, interpolating numerically where both endpoints are pure numbers or
same-unit lengths and falling back to the spec's discrete 50% flip otherwise.
That is the one place the spec makes an animated value observable through the
CSSOM, so it is the one place a compositor-less engine can still be exactly right.

**The frame driver.** Obscura has no compositor, so nothing ticks by itself. One
timer runs **only** while some animation is running or has a pending task, and
stops the moment the last one settles. An idle page costs nothing — which matters
a great deal on the hardware this browser is for.

### Quest #414 — the keyframe processor + the behaviour carry (suite 597 → 732)

The root cause behind ~130 failing behaviour subtests: `_waProcessKeyframes` was
a plausible-looking guess. Rewritten to §processing-a-keyframes-argument:

- **Only ANIMATABLE properties are even READ.** The spec builds the animation-
  property list *before* performing any `[[Get]]`, and WPT verifies it with
  counting accessors (48 subtests). Keyframes use **IDL attribute names** — so
  `marginLeft` yes, `margin-left` no, `float` no (it is `cssFloat`) — and the
  `animation-*` / `transition-*` / `contain` / `direction` / `writing-mode`
  family is excluded outright.
- **Read order is exact:** `composite`, `easing`, `offset` (WebIDL dictionary
  member order, alphabetical), each exactly once, then the animation properties
  in ascending Unicode-codepoint order.
- **Property-indexed keyframes are NOT a positional zip.** Each property
  contributes its *own* evenly-spaced keyframe list which are then merged by
  offset. That is why `{left: [a,b,c], top: [d,e]}` pairs `top`'s two values with
  left's FIRST and LAST, leaving the middle keyframe carrying only `left`.
- **Invalid values are dropped, keyframes are not.** Validation reuses the
  ordinary CSSOM setter on a scratch declaration — the engine's own property
  grammars, no second parser — and a wholly-invalid value still keeps its slot.
- **Errors are reported last.** An invalid easing on an object with no animation
  properties still throws, and only after every property has been read.

Plus: `offset` is a keyframe member, never the CSS shorthand; explicit offsets
re-run compute-missing over the merged list; `{timeline: undefined}` means
*absent* (WebIDL dictionary semantics), not *null*.

---

## Results

| Test | Before | After | Δ |
|---|---:|---:|---:|
| `web-animations/idlharness.window.html` | 42/230 | **188/230** (81.7%) | **+146** |
| the 39-file `web-animations/interfaces/` behaviour suite | 38/845 | **732/845** (86.6%) | **+694** |
| — `KeyframeEffect/constructor.html` | 0/175 | **169/175** | +169 |
| — `Animatable/animate.html` | 10/153 | **147/153** | +137 |
| — `KeyframeEffect/setKeyframes.html` | 0/80 | **77/80** | +77 |
| — `KeyframeEffect/processing-a-keyframes-argument-001.html` | 0/73 | **72/73** | +72 |
| — `AnimationEffect/updateTiming.html` | 12/68 | **66/68** | +54 |
| — `AnimationEffect/getComputedTiming.html` | 0/41 | **41/41** (100%) | +41 |
| — `Animation/style-change-events.html` | CNR | **23/25** | +23 |
| — `Animation/finished.html` | 3/22 | **15/22** | +12 |
| — `KeyframeEffect/style-change-events.html` | CNR | **12/19** | +12 |
| — `DocumentOrShadowRoot/getAnimations.html` | 0/11 | **10/11** | +10 |
| — `Animation/constructor.html` | 0/9 | **9/9** (100%) | +9 |
| — `Animation/pause.html` · `pending` · `ready` · `startTime` · `DocumentTimeline/constructor` | 0–1 | **100%** | +23 |
| **TOTAL** | | | **+840** |

### Zero regressions

Swept and identical: qsa **1975**, classlist **1420**, createElement **147**,
createElementNS **596**, cssom idlharness **493**, cssom-view idlharness **417**,
geometry **372**, svg **1702**, filter-effects **485**, css-masking **41**,
css-animations **98**, css-transitions **64**, css-view-transitions **66**,
css-fonts **97**, css-conditional **45**, event-handler-all-global-events
**375/375**, popover-focus **30/30**, url-origin **406**, structured-clone
**141/152**, checkVisibility **13**, element/window-scroll-arguments **12/12**.

The before-numbers above are **stash-proved**: the tree was stashed, rebuilt,
measured, then restored — so every gain is attributable to this arc and nothing
here was inherited.

---

## Caps / Next

**Genuine caps (named, not failures):**

1. **The four Level-2 standalone interfaces — `GroupEffect` (12),
   `SequenceEffect` (7), `AnimationNodeList` (8), `AnimationTrigger` (12) +
   `Animation.trigger` (2) = 41 of the remaining 42 idlharness subtests.**
   Deliberately NOT implemented. No engine ships them; exposing a constructible
   `GroupEffect` that does not group, or an `AnimationTrigger` global, would make
   feature detection *lie* — a site would branch into a code path we cannot
   honour. Not implementing them is the correct answer, not a gap.
2. **`AnimationTimeline.currentTime`'s type check** (1) needs `CSSNumericValue`
   for its `CSSNumberish` union — a **CSS Typed OM** dependency. Obscura has no
   Typed OM at all; that is its own future arc.
3. **Cross-realm animations** (`getAnimations-iframe`, the "prototype is not that
   of the current global" checks in `animate.html`): iframes share one JS realm
   in Obscura, so an iframe-created Animation cannot have a different prototype.
   Architectural, not a Web Animations gap.
4. **`getKeyframes()` value re-serialization** (1): we store keyframe values
   verbatim, so `rgb(1,2,3)` stays as written instead of becoming
   `rgb(1, 2, 3)`. Round-tripping every value through the CSSOM serializer would
   risk the 169 constructor subtests that expect verbatim shorthands
   (`border: 'pink'`, `margin: '10px 20px 30px 40px'`) — a bad trade for one
   subtest. Revisit if the serializer is ever proven byte-exact.

**⭐ NEXT LEVERAGE — animated computed style.** This is the single widest
remaining tail in the region and it is *tractable*. Everything below is blocked
on one thing: `getComputedStyle(el)` does not consult `el`'s active animations.

| Blocked test | Now |
|---|---|
| `KeyframeEffect/target.html` | 3/24 |
| `Animation/commitStyles.html` | 14/32 |
| `Animation/cancel.html` | 0/4 (TIMEOUT) |
| `KeyframeEffect/style-change-events.html` | 12/19 |
| `Animation/iterationComposite.html` · `composite.html` | 0/1 · 4/4 |
| plus most of `web-animations/animation-model/` (unmeasured) | — |

The shape: `_buildCascade(el)` already returns an ordered source list, so an
animated-values source appended at the highest priority would light all of this
up **without touching the value-resolution path at all**. Guard it on a Set
lookup so an element with no animations pays nothing. The interpolation function
already exists in this block (`_waInterpolate`). Sweep hard — `getComputedStyle`
is the hottest shared path in the engine.

**Second: the scroll-offset model.** `element-scroll-promises` (12/24) and
`window-scroll-promises` (9/18) are **no longer** blocked on Web Animations —
`waitForCompositorReady()` now resolves. Their remaining 21 fails are all
`scroller.scrollTop` reading 0 after `scrollTo({top: 5000})`. A stored scroll
offset (clamped at 0, since without layout there is no upper bound to clamp to)
would close them, and Playwright's actionability polling reads the same
primitive. Scope tight; sweep hard.

**Third: automatic replacement removal** (`onremove.html` 0/2, `persist.html`
1/2, `effect.html` 1/2) — when a new animation fully covers an older one on the
same property, the older is removed and fires `remove`. Small, self-contained,
and `persist()` already records the author's opt-out.

**Reusable, seeded here:** the whole timing model (`_waComputedTiming` — any
future scroll-timeline / view-timeline work computes progress through it), the
easing kit (`_waParseEasing` → canonical text + sampling function, `_bezier`,
`_steps`, `_linearEasingFn`), `_waProcessKeyframes` (spec-exact, reusable by CSS
Animations if `@keyframes` ever needs the same normalisation), the frame driver
(`_waSchedule`/`_waTick` — the "tick only while something is live" pattern),
`_waOp`/`_waAttr` (WebIDL operation/attribute installers with arity + brand
throws), and the Promise-attribute rule: **a wrong receiver must REJECT, never
throw.**
