# Quests #394–#396 — The CSS Transitions/Animations idlharness Arc — VERDICT

**Session:** 2026-07-29 · **Branch:** `engine-per-page-threads` · **One commit, ZERO regressions.**

Three fresh whole-feature idlharness files driven to 100%, **+79 total**:

| File | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css/css-properties-values-api/idlharness.html` | 10/16 | **16/16 (100%)** | +6 |
| `css/css-transitions/idlharness.html` | 30/64 | **64/64 (100%)** | +34 |
| `css/css-animations/idlharness.html` | 59/98 | **98/98 (100%)** | +39 |

Took #391–#393's next-leverage — a fresh whole-feature idlharness at 0/N. Scouted the
CSS idlharness tails: css-properties-values-api 10/16 (the cheapest — @property already
parses), css-transitions 30/64, css-animations 59/98. All three fell out of the same
observation: their fails are **event objects + event-handler IDL attributes + a CSSOM
rule WebIDL retrofit** — every template already mature. All `bootstrap.js`, ONE commit.

## #394 — `CSSPropertyRule` WebIDL retrofit (css-properties-values-api 10→16)

`@property` already parses (`_validatePropertyRule` / `type:'property'`); the class just
needed the non-author-constructible WebIDL dress the whole campaign has worn:
- `_exposeIface('CSSPropertyRule', …)` → non-enumerable interface object.
- `constructor(...args)` guarded by `_allowCssCondCtor` → `.length` 0, author-`new` throws;
  `_makeRule`'s `property` branch now flips the guard (save/restore not needed — leaf build).
- Brand-checked getters `name`/`syntax`/`inherits`/`initialValue` via a new `_propBrand`
  (`instanceof CSSPropertyRule`) → reading on the bare prototype throws TypeError.
- `Symbol.toStringTag` + `_enumAccessors`.

The lone `CSS namespace: operation escape(CSSOMString)` fail was a **cascade** of the
then-failing interface-object test — it went green for free.

## #395 — `TransitionEvent` + `ontransition*` + the shared event-handler accessor fix (css-transitions 30→64)

**`TransitionEvent` was a stub** (`super(t,o); this.propertyName=…`) — own data props, no
brand, enumerable global. Rebuilt as a proper Event subclass:
- Readonly attributes `propertyName`/`elapsedTime`/`pseudoElement` as **brand-checked
  accessors on the prototype** (backed by `_`-fields set from the init dict) — idlharness
  asserts `must inherit` (own props fail that) + that reading on the bare prototype throws.
- `constructor(t, o = {})` → `.length` 1 (type required, init dict optional); `o == null`
  coerced to `{}` inside (WebIDL dict conversion of null = empty).
- `_exposeIface` (non-enum global) + `Symbol.toStringTag`.
- The `createEvent('transitionevent')` map (uses the bare binding) still resolves.

**The four `ontransitionrun`/`ontransitionstart`/`ontransitionend`/`ontransitioncancel`**
GlobalEventHandlers (css-transitions-1's `partial interface mixin GlobalEventHandlers`)
added to `_EH_HANDLER_NAMES` — auto-installed on Window/Document/HTMLElement/SVGElement by
the existing generic `_ehDefineOnProto`, event type = `name.slice(2)` (no override needed).

### THE SHARED FIX (`_ehDefineOnProto`) — high blast radius, spec-correct

Adding the names alone left ~20 fails, because the generic on* accessor was WebIDL-wrong in
two ways that idlharness's `test_member_attribute` checks (and no prior test exercised):
1. **Getter/setter name.** A `defineProperty({get(){}})` names the function `"get"`;
   WebIDL requires `"get ontransitionrun"` / `"set ontransitionrun"`. Fixed via `_named`.
2. **Wrong-`this` must throw TypeError.** idlharness calls `desc.get.call({})` and expects
   a TypeError; the old getter returned null. **The brand is subtle:**
   - **Non-global protos** (HTMLElement/SVGElement/Document): the interface prototype is
     NOT a valid host, yet `HTMLElement.prototype instanceof Node` is **true** (Node.prototype
     is in its chain) — so `instanceof` can't brand these. A real node host carries a numeric
     `_nid`; the prototype does not. Brand = `typeof this._nid === 'number'` (the campaign's
     `_nid` prototype-getter brand). `{}` / the prototype → throw; a real element/document → pass.
   - **The global** (window): WebIDL's `[Global]` rule maps a **null/undefined `this` to the
     global** — `getter.call(undefined)` must return the global's value, NOT throw
     (idlharness: "Gets on a global should not require an explicit this") — while `.call({})`
     still throws. Brand = `this===globalThis`, with `t == null → globalThis` first.

   `_ehDefineOnProto(proto, isGlobal)` now takes the flag; `_ehResolveThis(this, isGlobal)`
   resolves+validates once for both get and set. This touches EVERY on* handler
   (onclick/onload/…) on every element/document/window — verified non-regressive below.

## #396 — `AnimationEvent` + `onanimation*` + `CSSKeyframesRule`/`CSSKeyframeRule` WebIDL (css-animations 59→98)

- **`AnimationEvent`** rebuilt exactly like `TransitionEvent` (`animationName`/`elapsedTime`/
  `pseudoElement`).
- **The four `onanimationstart`/`onanimationiteration`/`onanimationend`/`onanimationcancel`**
  GlobalEventHandlers added (same `_EH_HANDLER_NAMES` + `_ehDefineOnProto` mechanism).
- **`CSSKeyframesRule` / `CSSKeyframeRule`** were `[object CSSRule]` with plain getters:
  - `constructor(...args)` guarded by `_allowCssCondCtor` → `.length` 0, author-`new` throws.
    `_kfRule` (builds each `CSSKeyframeRule`) and `_makeRule`'s `keyframes` branch flip the
    guard with **save/restore** (`_kfRule` runs both during construction — inside the window —
    and from `appendRule` — outside it — so a bare `finally{=false}` would corrupt the flag).
  - Brand-checked getters/setters via `_kfBrand`/`_kfsBrand`. Reached through
    `_keyframesProxy`: `proxy instanceof CSSKeyframesRule` is true (no `getPrototypeOf` trap),
    so brand passes for real objects and throws for `this=null`.
  - `Symbol.toStringTag` on both → fixes `Stringification of keyframes` /
    `keyframes.cssRules[0]` (were `[object CSSRule]`).
  - `_enumAccessors` on attributes AND operations; `appendRule`/`findRule`/`deleteRule` get
    an arity guard (`arguments.length < 1` → throw) **and** a leading `_kfsBrand(this)` — the
    "operation with `this=null` must throw" test found `appendRule` silently no-op'd when the
    argument parsed to zero keyframe blocks (the `this` access never ran), so the brand must
    be explicit, not incidental.

## Zero-regression sweep

**The event-handler change is the risky one** (touches every on* handler). Proven intact:
- **`event-handler-all-global-events` 375/375** — the comprehensive get/set-every-handler
  test across window/document/elements. **`event-handler-attributes-body-window` 140/140**,
  `event-handler-javascript` 1/1, `event-handler-processing-algorithm` 7/7.
- CSS idlharness family identical: cssom 493, css-fonts 97, css-conditional 45, css-cascade
  34, css-counter-styles 37, container-queries 28, css-view-transitions 66.
- `CSSKeyframesRule` 2/2, `CSSKeyframeRule` 2/2 (keyframe CSSOM behavior through the proxy),
  cssstyledeclaration-csstext-important 1/1.
- createElement 147, qsa 1975, classlist 1420.
- **CAP proven pre-existing:** `compile-event-handler-settings-objects.html` (a multi-realm
  settings-object test) HANGS on the stashed baseline binary too — not a regression.

## CAP / NEXT

**CAP: none** — all three files at 100%.

**NEXT LEVERAGE:** another fresh whole-feature idlharness at 0/N.
- (a) `css/css-masking/idlharness.html` (9/41) — `SVGClipPathElement`/`SVGMaskElement` + the
  SVG animated-attribute types (`SVGAnimatedEnumeration`/`SVGAnimatedLength`/…). Bigger, but
  the SVG animated-attribute primitives it needs **unblock many other SVG idlharness files** —
  highest downstream leverage.
- (b) any remaining CSS idlharness tail — scout via the GitHub contents API, curl-verify every
  wpt.live path (⅓ 404; a 404 body is 42 bytes → reads as could-not-run).

**Reusable seeded:** the **event object recipe** (Event subclass with `_`-field-backed
brand-checked prototype getters + `.length` 1 ctor + `_exposeIface` + toStringTag); the
**GlobalEventHandlers extension pattern** (add names to `_EH_HANDLER_NAMES`, done); the
**event-handler accessor `_nid`/`[Global]` brand** (`_ehResolveThis`); the non-author-
constructible rule WebIDL retrofit applied to two more rule classes.
