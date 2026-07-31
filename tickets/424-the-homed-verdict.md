# ⚔️ 424–426 — The Homed Verdict

> **Quests #424–#426, session 2026-07-30 — the declarative-animation arc.**
> `css/*/animation/` (the whole `interpolation-testcommon.js` family) + `css/css-animations/`
> — **+1263 measured across 24 files**, ZERO regressions.
> `rotate-interpolation` **could-not-run (6m18s) → 11.7s, 95/360**.
> `css/css-sizing/animation/width-interpolation` **0 → 353/456**.

---

## 🩸 The gap — and how it was found

The map said ⭐ **transform-list interpolation**, twice over (#417's and #420's
named leverage). So the session started by measuring it — and the whole
`css/css-transforms/animation/` directory came back **could-not-run**:

```
css/css-transforms/animation/rotate-interpolation.html   —  no-results (test ran but summary never appeared)
```

`--timeout 300` didn't help. The page ran for **six minutes and eighteen seconds**
and never produced a summary. Checking out the pre-#421 `bootstrap.js` and
rebuilding proved it was **not** a regression from the CSS Transitions arc — it
took 4m25s and failed the same way there.

So: not slow, *stuck*. Loading `/css/support/interpolation-testcommon.js` into a
blank wpt.live page and calling one `test_interpolation()` by hand gave the real
answer in one line:

```
TypeError: Cannot read properties of undefined (reading 'setProperty')
    at Object.setup (interpolation-testcommon.js:73)
```

Line 73 is `target.style.setProperty(...)`, where `target` came from
`targetContainer.target` — set eight lines earlier by `targetContainer.target = target`.

An ordinary expando. Or so the test thought.

---

## ⚔️ Quest #424 — reflection belongs to the interface (+1111)

### The bug

`bootstrap.js` reflects a large set of content attributes flat on
`Element.prototype`, each one tag-gating itself, on the reasoning written in the
comment above the table:

> *"the harness only exercises an attribute on the elements that own it, so a
> global definition is inert for every other element."*

That is wrong in exactly one way, and it is the way that matters: **an accessor is
never inert.** With `target` defined on `Element.prototype`,

```js
div.target = someElement;      // looks like a property write
```

is not a property write at all. It is `setAttribute('target', String(el))` — and
the read back is the string `"[object HTMLDivElement]"`, whose `.style` is
`undefined`.

A probe over a plain `<div>` showed how wide it went. Coerced to **String**:
`target`, `color`, `media`, `align`, `background`, `value`, `name`, `type`,
`content`, `rel`, `href`, `src`. Coerced to **Boolean**: `open`, `selected`,
`checked`, `disabled`, `defer`, `reversed`, `compact`. On *every element in the
document* — including the plain `<div>`s that ordinary library code hangs data off.

This is not a WPT-shaped bug. It is a bug for any page whose script stores
`el.value`, `el.name`, `el.data` or `el.open` on an element that doesn't own it.

### The fix

A **relocation pass**, run once at the end of the prelude after every interface
object exists: for each element-specific member, copy its own descriptor from
`Element.prototype` onto the prototypes of the interfaces whose IDL actually
declares it, then vacate `Element.prototype`.

```js
target: 'HTMLAnchorElement HTMLAreaElement HTMLBaseElement HTMLFormElement HTMLLinkElement',
value:  'HTMLButtonElement HTMLDataElement HTMLInputElement HTMLLIElement …',
```

Three details make it behaviour-preserving:

- An interface that already declares its **own** version keeps it —
  `HTMLAnchorElement.text`, `HTMLSlotElement.name` and `HTMLFormElement.reset` are
  real overrides, not copies of the shared accessor.
- `Element.prototype` is vacated **only once the member has a real home**, so a
  build missing an interface loses no reflection.
- Relocating is the moment to give the accessors the shape WebIDL asks for:
  `enumerable: true` (the ones written in the `class Element` body were
  non-enumerable, because that is what class semantics give you).

Nothing about the accessors themselves changed. Only their home — which makes
WebIDL-correct placement and expando-safety **the very same fix**.

### What it opened

| Test | Before | After |
|---|---|---|
| `css/css-transforms/animation/rotate-interpolation.html` | could-not-run (6m18s) | **95/360** (11.7s) |
| `…/scale-interpolation.html` | could-not-run | **103/360** |
| `…/translate-interpolation.html` | could-not-run | **132/408** |
| `…/perspective-interpolation.html` | could-not-run | **144/254** |
| `…/transform-origin-interpolation.html` | could-not-run | **79/168** |
| `…/perspective-origin-interpolation.html` | could-not-run | **47/120** |
| `…/backface-visibility-no-interpolation.html` | could-not-run | **32/42** |
| `…/perspective-origin-composition.html` | could-not-run | **20/56** |
| `…/rotate-composition.html` | could-not-run | **20/132** |
| `…/perspective-composition.html` | could-not-run | **14/40** |
| `…/list-interpolation.html` | could-not-run | **11/76** |
| `…/transform-composition.html` | could-not-run | **10/56** |
| `…/translate-composition.html` | could-not-run | **6/112** |
| `…/scale-composition.html` | could-not-run | **5/80** |
| `…/matrix-interpolation.html` | could-not-run | **3/4** |
| `css/css-sizing/animation/width-interpolation.html` | could-not-run | **287/456** |
| `css/css-ui/animation/outline-color-interpolation.html` | could-not-run | **71/120** |
| `css/css-color/animation/color-interpolation.html` | could-not-run | **32/192** |

**+1111 from 18 files.** And that is the *sampled* figure: `interpolation-testcommon.js`
backs roughly **110 more files** across `css-flexbox/`, `css-grid/`, `css-shapes/`,
`css-images/`, `css-multicol/`, `filter-effects/` and others that were not measured
this session. Every one of them was failing at the same line.

---

## ⚔️ Quest #425 — the transform list is a list of FUNCTION slots (+21)

With the family running, the ⭐ leverage was finally legible. `wpt_fails` on
`list-interpolation`:

```
from [none] to [translate(200px) rotate(720deg)] at (0.25)
    expected "matrix(-1, 0, 0, -1, 50, 0)"  but got "none"
from [translate(100px)] to [translate(200px) rotate(720deg)] at (0.25)
    expected "matrix(-1, 0, 0, -1, 125, 0)"  but got "matrix(1, 0, 0, 1, 125, 0)"
```

The translate interpolated; the rotate was silently dropped. And `none` against a
list stayed `none`.

Three things stand between a pair of real-world lists and §interpolation-of-transforms,
and **all three are the same move** — make both sides the same shape, then let
#417's skeleton kit do every bit of the arithmetic:

1. **`none` IS the identity transform**, so against a list it behaves as that
   list's own functions in their identity form.
2. **A shorter list is padded at the tail** with the identity of each function the
   longer one still has.
3. **Two spellings of one primitive** (`translateX(a)` / `translate(a, b)`,
   `scaleY`, `skewX`, `rotateZ`) are the same function in different clothes;
   promoting both to the primitive makes their skeletons match.

`_waTfAlign` does exactly that and returns two strings — after which `_waSplitValue`
/ `_waSameShape` / `_waJoin` need **no transform-specific code at all**.

Two details the spec is precise about and a generic rule cannot guess:

- **`rotate3d`'s identity is the same axis turned zero degrees.** The axis is not a
  magnitude; zeroing it would name a different rotation, not none at all.
- **`transform` has its own composition rules.** Addition is list **concatenation**
  (`Va ++ Vb`), never a per-slot sum. Accumulation is per-argument, only when the
  lists already line up, and **`scale` accumulates about ONE** — `2 ⊕ 3 = 4`,
  because a scale of 1 is that function's do-nothing value.

`list-interpolation` 11→**17**, `transform-composition` 10→**25**.

---

## ⚔️ Quest #426 — the CSS Animations engine (+131)

The remaining `list-interpolation` rows named their own cause. Of the four
interpolation methods the harness runs, **Web Animations passed** and the
**CSS Animations** row answered `none`. A three-line probe settled it:

```js
style.textContent = '@keyframes kk { from {margin-left:0px} to {margin-left:100px} }';
e.style.animation = 'kk 100s -50s linear';
getComputedStyle(e).marginLeft   // → "0px"
e.getAnimations().length         // → 0
```

**`@keyframes` parsed perfectly and animated nothing.** `CSSKeyframesRule` was
right there in the CSSOM; there was no engine behind it. Exactly the shape
`transition-*` was in before #421 — and the answer is the same one, one realm over:

> **A CSS animation IS an `Animation` whose effect's keyframes are the
> `@keyframes` rule's, and whose timing is the `animation-*` longhands.**

Which means it needed nothing new from the engine:

- #412's timing model already reads the longhands **as they are spelled** —
  `iterations`, `direction`, `fill` are the same words CSS uses.
- #415's `_waAnimatedDecls` already gives any non-transition `Animation` a cascade
  seat above the author's normal declarations. A `CSSAnimation` gets it for free.
- #421's **style change event** is exactly the moment a browser creates, updates
  and cancels declarative animations — so `_caUpdateElement` is one call inside
  `_csUpdateElement`, before the transition pass, because §starting-of-transitions
  reads the before-change style *"with any styles derived from declarative
  animations updated to the current time"*.

What is genuinely specific to CSS Animations:

- **`animation-timing-function` is the easing BETWEEN KEYFRAMES**, not over the
  whole animation. It becomes each keyframe's default easing and the effect itself
  stays `linear`; a keyframe declaring its own wins.
- **One keyframe selector may name several offsets** — `0%, 50% { … }` is two
  keyframes — and a keyframe's own `animation-timing-function` declaration is its
  *easing*, not a property it animates.
- **The layer's position is the identity.** `animation-name: a, a` is two distinct
  animations of the same name; the key is `index + name`, so a flush neither
  merges them nor rebuilds a running one. A `_caSpec` string (name, all seven
  longhands, and the rule's `cssText`) decides "is this still the same animation?"
  — and only `animation-play-state` may change without a restart.
- **A finished animation is NOT retired** the way a transition is: `fill: forwards`
  means its final value must go on applying to the cascade.
- **A layer that stops matching is CANCELLED**, not completed — which is why
  removing a class stops an animation dead.

### The gotcha that cost the most

The first build produced keyframes with the right offsets and **no properties**:

```
[{"offset":0,"computedOffset":0,"easing":"linear"},{"offset":1,…}]
```

`kr.style.length` was 1 and `kr.style.getPropertyValue('margin-left')` was `"0px"`,
but **`kr.style[0]` returned `""`** — a keyframe rule's declaration block does not
carry the CSSOM indexed getter, and reading it fails *silently*. `.item(j)` works.
(That missing indexed getter is a real CSSOM gap in its own right — see Caps.)

### Results

| Test | Before | After |
|---|---|---|
| `css/css-sizing/animation/width-interpolation.html` | 287/456 | **353/456** |
| `css/css-ui/animation/outline-color-interpolation.html` | 71/120 | **84/120** |
| `css/css-animations/Element-getAnimations.tentative.html` | 1/22 | **15/22** |
| `css/css-animations/KeyframeEffect-getKeyframes.tentative.html` | 0/32 | **9/32** |
| `css/css-animations/Document-getAnimations.tentative.html` | 1/18 | **9/18** |
| `css/css-transforms/animation/list-interpolation.html` | 17/76 | **24/76** |
| `css/css-animations/CSSAnimation-effect.tentative.html` | 0/8 | **4/8** |
| `web-animations/…/combining-effects/effect-composition.html` | 13/17 | **17/17** |
| `css/css-color/animation/color-interpolation.html` | 32/192 | **36/192** |
| `css/css-animations/CSSAnimation-animationName.tentative.html` | 0/3 | **1/3** |
| `web-animations/…/interpolation-per-property-002.html` | 339/379 | **340/379** |

---

## 🛡️ Zero regressions

Swept WIDE, because #424 touches every element in the document and #425/#426 touch
`_waInterpolate` / `_waAdd` / `_waAccumulate` and the `getComputedStyle` flush:

**The reflection suites — the direct risk for #424 — 24,087 subtests, not one moved:**
`reflection-grouping` 5314/5358, `reflection-metadata` 2994/3110, `reflection-misc`
4709/4877, `reflection-sections` 5604/5604, `reflection-obsolete` 1824/2621,
`reflection-tabular` 3642/6116.

Held identical: qsa 1975, classlist 1420, createElement 147, createElementNS 596,
Element-matches 669, url-origin 406, serialize-values 696, cssom-view idlharness 417,
geometry 372, **svg 1702**, **css-transitions properties-value-001 560/560**,
css-transitions idlharness 64, **css-animations idlharness 98**,
web-animations idlharness 188, interpolation-per-property-001 441,
iteration-composite 19, setKeyframes 78, Animatable/animate 147,
Animatable/getAnimations 22, **Animation/style-change-events 24/25**,
form-validation-checkValidity 130, form-validation-validate 8, dataset-get 10,
dataset-set 11, Document.body 11/26, querySelector-scope 4,
**event-handler-all-global-events 375/375**.

**A measurement lesson worth passing on:** wrapping `wpt_run.py` in a shell
`timeout` shorter than `--timeout × 9` reports healthy tests as hangs. `wpt_run`
spends `--timeout` on navigation and then pumps up to `timeout//4 + 1` times at 8s
each. Four "hangs" and one "regression" this session were that arithmetic, not the
engine. Give it room, or use a smaller `--timeout`.

---

## 🧭 Caps / Next

**Genuine caps:**

- **A CSS transition's transform endpoints are the RESOLVED matrix, not the
  computed list.** `_csUpdateElement` snapshots `after.getPropertyValue(k)`, and
  CSSOM resolves `transform` to a matrix — so the two CSS Transitions rows of every
  transform interpolation test interpolate matrix cells instead of functions. The
  Web Animations row of the same test passes. #420 already drew this distinction for
  keyframes (`_WA_UNCOMPUTED`); the transition snapshot needs the same exception.
  **~100 subtests, and the smallest well-understood win on the board.**
- **A genuinely mismatched function pair** (`translate` against `scale` at the same
  index) needs matrix decomposition + quaternion slerp. Those keep the discrete
  fallback.
- **`CSSStyleDeclaration` indexed access is missing on a keyframe rule's block**
  (`kr.style[0]` → `""`, `.item(0)` → `'margin-left'`). Silent, and anything reading
  a declaration positionally hits it.
- Percentage→pixels still needs layout (unwinnable).
- `animationiteration` is not fired; `::before`/`::after` are still not flush
  candidates, so pseudo-element animations and transitions both wait on that.

**NEXT LEVERAGE:**

**(a) ⭐ Finish the sweep #424 opened.** Roughly **110 more files** across
`css/css-flexbox/animation/`, `css/css-grid/animation/`, `css/css-shapes/animation/`,
`css/css-images/animation/`, `css/css-multicol/animation/` and
`css/filter-effects/animation/` use `interpolation-testcommon.js` and have **never
once run**. They need no new engine work to be measured — just measuring, then
whatever each one's failures name. This is by far the widest tail on the board and
it is now simply *open*.

**(b) The transition transform-endpoint exception** (first cap above) — small,
understood, and it lifts two of every six rows in every transform test.

**(c) The rest of the CSS Animations lifecycle** — `animationiteration`,
`CSSAnimation-playState` (0/5), `CSSAnimation-canceling`, `-startTime`, `-ready`,
`-finished`. The engine is there; these are its edges.

**(d) `@starting-style` + `CSSStartingStyleRule`** — 8 untouched files, and it
plugs straight into #421: `@starting-style` IS a before-change style override.

**(e)** Pseudo-element flush candidates (unlocks both realms at once).
**(f)** The still-untaken scroll-offset model (`scrollTop` reads 0 after
`scrollTo({top:5000})` — 21 subtests + the primitive Playwright actionability reads).

**Reusable seeded:** `__IFACE_MEMBERS` + the relocation pass (**the place to put any
future element-specific reflection — never `Element.prototype`**); `_waTfAlign` /
`_waTfAlignItems` / `_waTfIdentityOf` / `_waTfNorm` (**the list-alignment shape;
filter lists want the same move with per-function lacuna values**); `_waTfCompose`
(concatenating addition + neutral-aware accumulation); `_caFindKeyframes` (cached
`@keyframes` lookup by name, grouping rules walked), `_caKeyframesOf`,
`_caUpdateElement`, `_caSpec` (**"is this still the same declarative animation?"**),
`CSSAnimation`.
