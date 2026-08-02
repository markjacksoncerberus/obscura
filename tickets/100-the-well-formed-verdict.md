# ⚔️ Quests #448–#450 — The Well-Formed Verdict

> *Three things that were shaped wrong rather than computed wrong: a zero that had
> lost its unit, eight colours nobody had written down, and three rules that
> JavaScript's `class` gets exactly backwards from WebIDL.*

**Session:** 2026-08-02 · **Branch:** `engine-per-page-threads` · **All in `crates/obscura-js/js/bootstrap.js`**

**Result: +463 measured, ZERO regressions, ten files to 100%.**
`css/css-typed-om/idlharness.html` **270 → 536/544**.

---

## Where the pointer sent us

#447's ⭐ read: *"`css/css-typed-om/idlharness.html` is 254/544 and it is the single
biggest row left in the realm — and it is a LIST, not a cap."* It was right on both
counts. Measured on the unchanged build the row was **270/544** (the ledger's 254 was
one measurement stale — corrected in place). Bucketing the 274 failures by assertion
message took ten minutes and split cleanly into three:

| bucket | rows | quest |
|---|---:|---|
| `ReferenceError: <name> is not defined` while evaluating a test object | 38 | **#448** |
| `self does not have own property "CSSRGB"` (and 8 more colour interfaces) | 86 | **#449** |
| enumerability, brand checks, `length`, statics, iterators, missing `CSS.*` units | ~150 | **#450** |

---

## #448 — A unitless zero is a length, and an angle

The 38 `ReferenceError` rows were not 38 separate gaps. The test file's setup block is
a run of `try { self.skewX = CSSStyleValue.parse('transform', 'skewX(0)')[0]; } catch {}`
assignments; when one throws, the global is never defined and every later assertion
about it reports as **could-not-run, not failure**. So one throw hid dozens of rows.

Probed directly:

```
transformValue: THREW TypeError: Failed to construct 'CSSTranslate': expected a length.   ← translateX(0)
rotate:         THREW TypeError: Failed to construct 'CSSRotate': expected an angle.      ← rotateX(0)
skew / skewX / skewY / perspective: the same
```

**The constructors were right.** `CSSTranslate` genuinely requires a
`<length-percentage>`, and `CSSUnitValue(0, 'number')` is not one. The bug was one
layer up, in **reification** — and the rule needed was already written in the file,
four hundred lines away:

```js
// `width: 0` is a LENGTH — the unitless zero is a length that dropped its
// unit, not a number, and the Typed OM has to hand back the unit the
// property would have read it with.
if (u === 'number' && parseFloat(m[1]) === 0) {
  const accepts = _TOM_ACCEPTS.get(prop);   // ← asks the PROPERTY
  ...
}
```

`_tomComponentOf` called that same reifier with **`prop = null`**. Inside a transform
function the property has nothing to say — `transform` accepts lengths, angles and
plain numbers all at once. **The FUNCTION is what knows.** css-transforms-1 spells out
every argument slot, and it admits `<zero>` in the angle slots as well as the length
ones, which is exactly why `translateX(0)` and `rotate(0)` are both perfectly ordinary
CSS. `_TOM_TF_SLOTS` is that grammar as a table (`'ll'`, `'nnna'`, `'aa'`, …), and the
argument reifier consults it.

**Why this is worth more than 43 subtests:** `translateX(0)` is not an exotic value.
It is the **GPU-promotion hack** — arguably the single most-written transform on the
web — and `el.computedStyleMap().get('transform')` *threw* on every element carrying
one.

`idlharness` 270 → **313**.

---

## #449 — A colour channel is the one place a bare number is not `CSS.number(n)`

Nine interfaces were missing outright: `CSSColorValue`, `CSSRGB`, `CSSHSL`, `CSSHWB`,
`CSSLab`, `CSSLCH`, `CSSOKLab`, `CSSOKLCH`, `CSSColor`. Eight dedicated WPT files sat
at **0**, 182 subtests.

Reading them turned up a rule that looks like a bug the first three times you see it:

```js
new CSSRGB(0.5, CSS.number(73), CSS.percent(91)).r    // → CSS.percent(50)   ← ×100!
new CSSLab(CSS.percent(27), 7, CSS.number(8)).a       // → CSS.number(7)     ← not ×100
new CSSHSL(180, 0.5, 0.5).h                           // → CSS.deg(180)
new CSSRGB(0, 0, 0, CSS.percent(0.4)).alpha           // → CSS.percent(0.4)  ← still not ×100
```

**In a colour, `0.5` means HALF.** A bare JS number is a *fraction*, so a
`<percentage>` slot reads it as `50%`; an `<angle>` slot reads `180` as `180deg`; a
`<number>` slot (Lab's `a`/`b`) reads `7` as `7`. A value that arrives already knowing
its unit is never rescaled — which is why `CSS.percent(0.4)` stays `0.4%`. Four channel
kinds, and `_TOM_COLOR_SPECS` names each interface's three channels and their kinds
once, so the constructor, the four setters and the serializer are one table rather than
eight hand-written copies that can drift.

**And the same IDL type decides which error a refusal is.** This pair looked like a
contradiction until the IDL was read side by side:

```js
new CSSHSL(undefined, 0, 0).h   // → CSSKeywordValue("undefined")   — VALID
new CSSHWB(undefined, 0, 0)     // → TypeError
new CSSHWB(CSS.px(1), 0, 0)     // → SyntaxError (DOMException)
```

`CSSHSL`'s hue is `CSSColorAngle`, a **union** that includes `CSSKeywordish`, so
`undefined` stringifies into the keyword `"undefined"` and is stored. `CSSHWB`'s hue is
a bare `CSSNumericValue` — no union — so `undefined` fails IDL conversion at the door
with a **TypeError**, before any CSS question is asked; a `CSSNumericValue` of the
wrong type gets *through* the door and is then judged with a SyntaxError.
**Two colours, the same wrong argument, two different errors, and the IDL says which.**

`CSSColorValue.parse` answers with the colour's **own family** — `hsl(195, 100%, 50%)`
returns a `CSSHSL`, not an rgb triple — which is #445's sentence one realm over: the
Typed OM hands back the author's own words wherever it still can. A **system colour**
(`GrayText`, `Canvas`) reifies as the `CSSKeywordValue` it is, because its used value is
the UA's business and there is nothing inside it the CSSOM has words for.

Eight files 0 → **182, all to 100%**. `idlharness` 313 → **358**.

---

## #450 — Three rules `class` gets backwards

The remaining ~150 rows were not about CSS at all. They were about **shape** — and each
of the three is a difference a page can actually observe:

1. **An interface object on the global is NOT enumerable.** `globalThis.X = C` makes it
   enumerable, so every `for (const k in window)` over a page's own globals swept up the
   whole platform. (`historical.html` catches exactly this: 1/11 → **11/11**.)
2. **Prototype members ARE enumerable** — and `class` methods are not, the exact
   opposite. `Object.keys(CSSUnitValue.prototype)` came back empty.
3. **An accessor BRAND-CHECKS its receiver.** `get value() { return this._k }` quietly
   answers `undefined` when read off the prototype; WebIDL says TypeError. A silent
   `undefined` is a bug that surfaces three call-frames later; a TypeError surfaces here.

`_tomWebIDLShape(name, C)` is one pass that applies all three, plus:

- **`length` is the count of REQUIRED arguments**, which is not the count of JS
  parameters — an optional or a rest parameter contributes nothing, and an overloaded
  constructor takes the minimum (`CSSRotate` is 1, not 4). `_TOM_IDL_LENGTH` states it
  rather than letting JS guess.
- **The wrapper must be NAMED `get x` / `set x`.** idlharness asks for accessors by
  name; an anonymous wrapper reads as the wrong member. That one line was ~25 subtests.
- **Static operations are members too** — enumerable on the interface object.

Three more, each its own small sentence:

- **An interface with no constructor is not constructible.** `new CSSStyleValue()` and
  `new StylePropertyMap()` are TypeErrors. The check is on `new.target`, so subclassing
  still works (a subclass's `super()` arrives with its own), and the engine's *own*
  construction of these values goes through `_tomMake`, which lifts the latch for
  exactly one call.
- **A WebIDL `iterable<T>`'s `entries`/`keys`/`values`/`@@iterator` are the very
  `Array.prototype` functions**, identity and all — a hand-written one that behaves
  identically still fails, and rightly, because a page can compare them. All three
  value-iterator classes were array-like already (indexed own properties plus `length`),
  which is the shape Array's generic methods were written against, so this was a
  **deletion**. For a MAP iterator (`StylePropertyMapReadOnly`) the rule is one layer
  over: `@@iterator` and `entries` are one function, not two that agree.
- **The twelve missing viewport units.** The table had `svw`/`svh`/`lvw`/`lvh`/`dvw`/`dvh`
  and stopped — but the small, large and dynamic viewports each come in the **same six
  spellings** as the default one. `svi`, `svb`, `svmin`, `svmax` and their `lv`/`dv`
  twins were two thirds of each family, missing.

Two mixin details that only surface here: `attributeStyleMap` comes from
`ElementCSSInlineStyle`, which CSSOM includes on **`HTMLElement`, `SVGElement` and
`MathMLElement`** — not on `Element`. Putting it only on `Element` reaches every element
that matters and *still* fails `assert_own_property(HTMLElement.prototype, …)`, because
a mixin member belongs to each including interface as its own property and inheriting it
is not the same thing. And `CSSMatrixComponent`'s constructor takes a
`DOMMatrixReadOnly` while its **attribute is a `DOMMatrix`** — a read-only matrix handed
in comes back out mutable, because a component's matrix is something a page is meant to
be able to edit in place.

`idlharness` 358 → **529** → **536/544**.

---

## Results

| Test | Before | After | |
|---|---:|---:|---|
| `css/css-typed-om/idlharness.html` | 270/544 | **536/544** | +266 |
| `stylevalue-subclasses/cssRGB.html` | 0/51 | **51/51** | ✅ |
| `stylevalue-subclasses/cssHSL.html` | 0/24 | **24/24** | ✅ |
| `stylevalue-subclasses/cssHWB.html` | 0/21 | **21/21** | ✅ |
| `stylevalue-subclasses/cssLCH.html` | 0/18 | **18/18** | ✅ |
| `stylevalue-subclasses/cssOKLCH.html` | 0/18 | **18/18** | ✅ |
| `stylevalue-subclasses/cssLab.html` | 0/15 | **15/15** | ✅ |
| `stylevalue-subclasses/cssOKLab.html` | 0/15 | **15/15** | ✅ |
| `stylevalue-subclasses/cssColorValue.html` | 0/0 (could-not-run) | **20/20** | ✅ |
| `css/css-typed-om/factory-font-relative-length.html` | 7/12 | **12/12** | ✅ |
| `css/css-typed-om/historical.html` | 1/11 | **11/11** | ✅ |
| **`css/css-typed-om/**`** | 10,815 | **11,278** | +463 |

**Ten files to 100%.**

## Zero-regression sweep

- **The 83-file `css-typed-om` band outside `properties/`, measured on BOTH builds**
  (stash → rebuild → measure → pop → rebuild → measure). Every row byte-identical
  except the eleven that gained. The three files that read could-not-run
  (`cssMatrixComponent.tentative`, `cssTransformValue.tentative`,
  `transformvalue-normalization.tentative`) were **could-not-run on the pre-session
  build too** — pre-existing, not caused here.
- **A 39-file slice of the 244-file `properties/` band, 3,481 subtests, on both
  builds — byte-identical.** (The shape pass rewrote the prototypes that band's shared
  `testsuite.js` leans on entirely, so this was the risk worth paying for.)
- **39 held realms** on the final binary, all at their ledger values: qsa **1975**,
  classlist **1420**, Element-matches **669**, createElement 147, url-origin 406,
  serialize-values 696, cssom idlharness 493, mark 22/22, measures **119/119**,
  structured-clone 141, getRandomValues 39/39, css-transitions properties-value-001
  **560/560**, css-animations idlharness 98, css-transitions idlharness 64,
  transform-valid **42/42**, transform-invalid **20/20**, transform-interpolation-001
  **448/448**, -005 **384/384**, -006 **96/96**, -computed-value **82/82**,
  -inline-value **41/41**, matrix-composition **112/112**, list-interpolation **76/76**,
  rotate/scale/translate-composition **132/80/112**, css-transforms inheritance **20/20**,
  registered-property-cssom **8/8**, register-property **6/6**,
  CSSTransition-canceling **11/11**, Document-getAnimations 9, Animatable/animate 147,
  KeyframeEffect/composite **4/4**, interpolation-per-property-001 444,
  CSSStyleSheet-constructable 7, color-valid-relative-color 1131, signs-abs-invalid 24.

---

## Caps / Next

**CAP — 8 idlharness rows are a harness quirk, not a gap.** They are
`assert_own_property(obj.constructor, 'parse')` where the object is a `CSSUnitValue`
and `parse` is a static declared on `CSSStyleValue`. WebIDL reaches a parent's statics
through the interface object's **[[Prototype]] chain**, never as own properties of the
subclass's interface object, so no conformant engine passes these without duplicating
statics onto every subclass. **Not chased on purpose** — do not mistake it for work left
undone, and do not "fix" it by duplicating the statics.

**NEXT LEVERAGE, in order:**

1. ⭐ **`the-stylepropertymap/properties/logical.html` is 1274/1468 — 194 failing
   subtests in ONE file, the largest single row anywhere in the realm**, and its 194
   are flow-relative box longhands (`inline-size`, `margin-block-start`, …). Its
   neighbours `margin` (151/161), `scroll-padding` (243/252) and `border-color`
   (136/148) are almost certainly the same bucket seen from four angles — worth
   bucketing all four together before writing anything, the way #439's baseline was.
2. **`border-radius.html` 83/128** is the worst-performing property file measured
   (65%), and `box-shadow` 26/33 and `all` 26/31 sit near it. These are the
   *multi-component* value shapes — a `/`-separated pair, a four-part shadow — where
   `_tomReify` has only one value to hand back.
3. **The transform-component tail:** `cssSkew` 23/30, `cssSkewX`/`cssSkewY` 14/19 each,
   `cssPerspective` 19/25, `cssTranslate` 20/22, `cssTransformComponent-toMatrix-relative-units`
   **0/2**, `cssTransformValue-toMatrix` 1/2. ~30 subtests, one region, and the
   relative-units row is honest about needing an element and a viewport.
4. **`arithmetic.tentative.any.html` 56/67** and `cssMathValue.tentative` 19/23,
   `to.tentative` 16/19, `toSum.tentative` 10/11, `parse.tentative` 21/22 — the numeric
   algebra's own tail, ~20 subtests across five files.
5. **Three files still could-not-run and have been for several sessions:**
   `cssMatrixComponent.tentative`, `cssTransformValue.tentative`,
   `transformvalue-normalization.tentative` (`bodyLen = 0`, **no page errors**, which is
   an unusual signature — one `harness_probe.py` quest between the three of them).
6. Still standing from #447: `set()` stays permissive for length/percentage/number on
   any property `_TOM_ACCEPTS` does not name (pure data entry, ~4 subtests ×
   ~150 properties); `opacity: 3.14%` canonicalizes to `0.0314` at SPECIFIED time where
   Blink keeps the `%`.

**Reusable seeded:** `_tomWebIDLShape(name, C)` (the whole WebIDL shape in one call —
**use it for any new interface, in any realm, not just this one**), `_tomProtoAttrs`,
`_TOM_IDL_LENGTH`, `_tomMake`/`_tomCtorGuard` (non-constructible interfaces),
`_tomColorChan` + `_TOM_COLOR_SPECS`, `_tomParseColor`, `_TOM_TF_SLOTS`.
