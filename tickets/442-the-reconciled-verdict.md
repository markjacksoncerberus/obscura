# 📜 Quests #442–#444 — The Reconciled Verdict

> *Three places where the engine gave two different answers to the same question.*

**Status: SECURED.** Measured, zero regressions.

The incoming ⭐ from `tickets/439-the-decomposed-verdict.md` was not a transform
bug and said so. It was this:

```js
sheet.cssRules[1].cssText            // ".zz { }"        ← the CSSOM dropped it
getComputedStyle(el).transform       // "30px"           ← the cascade kept it
```

One stylesheet, one declaration, two answers. This arc is that sentence three
times over.

---

## Quest #442 — there were TWO declaration parsers and only one of them validated

`bootstrap.js` parsed a declaration block in two different places:

- **`_parseStyleDecls`** — the CSSOM parser. It runs the whole per-property
  validity chain: `_isValidTransform`, `_isValidFilter`, `_isValidClipPath`,
  `_isValidSizeValue`, the `@page`/`@font-face` descriptor gates, the position
  and origin grammars — some seventy branches — and it *canonicalizes* on the
  way through.
- **`_cssParseDecls`** — the **cascade-shape** parser, the one `_buildCascade` →
  `_cascadeResolve` → `getComputedStyle` actually reads. It validated custom
  properties and **nothing else**.

So a declaration the CSSOM had already thrown away still won the cascade. Worse
than that: it also *displaced* the good declaration it should have lost to.

```css
.p { transform: translate(30px) }
.p { transform: 30px }          /* garbage — must be dropped at parse time */
```

`30px` is not a `<transform-list>`, so the second declaration never exists, and
the first one still stands. Read through the lax parser the second declaration
exists, is later, and wins — and the page renders with no translation at all
rather than with the one the author wrote. A declaration being invalid is not a
detail of the object model. It is the *cascade*.

The fix is four lines, and the point of it is that there is now **one** parser:

```js
const _cssParseDecls = (body) => {
  const out = {};
  for (const d of _parseStyleDecls(body)) _expandDeclInto(out, d.name, d.value, d.important);
  return out;
};
```

`_parseStyleDecls` returns the ordered, validated, canonicalized declarations;
`_expandDeclInto` is the cascade's own shorthand expansion, unchanged. The two
views cannot disagree any more, because there is only one of them.

**This is the widest shared change made in this file all campaign** — every rule
of every stylesheet, plus every `style=""` attribute, now goes through the full
validity chain on the way to `getComputedStyle`. It is also why this quest is
gated by the largest regression sweep the campaign has run.

`transform-interpolation-006` 76/96 → **96/96**.

### The cost it exposed — a third place with two homes

Making the cascade read declarations *correctly* broke one subtest, and the
break is worth more than the subtest. `Document-getAnimations.tentative.html`
went 9/18 → 8/18 on this:

```js
const div = addDiv(t, { style: 'animation: animLeft 100s' });   // the ATTRIBUTE
div.style.animation = '';                                        // the LIVE decl
assert_equals(document.getAnimations().length, 0, "css animation cancelled");
```

`el.style` and `style=""` are one declaration block with two faces. The live one
is seeded from the attribute the first time anything touches `.style`, and
`setAttribute`/`removeAttribute` keep it in step from then on. What does **not**
happen is the reverse: `_styleWriteback` — the per-property reflection back into
the attribute — is deliberately gated on there being a custom element to observe
it. So the moment `.style` is touched, **the attribute becomes a stale copy** —
and `_buildCascade` was reading both.

Before this quest that was invisible, because the lax parser turned the
attribute's `animation: animLeft 100s` into something that never resolved to a
running animation anyway. Two bugs cancelling. With the shorthand parsed
properly the attribute's copy works, wins, and the animation the page just
cancelled goes on running.

The fix is the same sentence as the quest: **when one value has two homes, read
the live one and only the live one.** `_buildCascade` skips the `style`
attribute once `el._styleSynced` is set — the live declaration was seeded from
that very attribute, so nothing is lost, and the two can no longer disagree.
9/18 restored.

---

## Quest #443 — a declaration ends at a TOP-LEVEL semicolon

With one parser left, its one remaining lie was visible. Both parsers had split
the block the same naive way:

```js
for (const part of String(text).split(';')) { … }
```

A `;` inside a string, a comment, or a function is part of the **value**. And
the commonest value on the real web that contains one is a data URI:

```html
<div style="background-image: url(data:image/svg+xml;base64,PHN2Zy8+); color: red">
```

`split(';')` tears that declaration in half. The first half is
`background-image: url(data:image/svg+xml` — an unclosed `url()`, garbage. The
second half is `base64,PHN2Zy8+)`, which *has a colon in it*, and so parses as a
declaration in its own right for a property named `base64,PHN2Zy8+)`. Both
halves are junk, the image never loads, and — the part that makes it a real-page
bug rather than a curiosity — everything is still fine for the *next*
declaration, so nothing looks wrong except that one image. `content: "a; b"`
fails the same way and takes the declaration after it down too.

`_splitDeclParts` splits at top-level semicolons only, tracking strings,
comments and `()`/`[]`/`{}` nesting. EOF closes every open construct, which is
why it never reports failure: an unterminated string simply runs to the end of
the text, exactly as css-syntax-3 says.

Verified directly:

| | before | after |
|---|---|---|
| `style="background-image:url(data:…;base64,…); color:red"` | both declarations destroyed | `url("data:image/svg+xml;base64,PHN2Zy8+")`, `rgb(255, 0, 0)` |
| `.zz { content: "a;b"; color: blue }` | `color` lost | `content: "a;b"`, `rgb(0, 0, 255)` |

Because #442 had already collapsed the two parsers into one, this fix landed in
one place and reached both.

---

## Quest #444 — a transform function knows whether it is FLAT

`transform-interpolation-computed-value.html` sat at **0/82** — a whole
untouched file — and the reason it was zero on line one is that it asks a
question the engine had no way to be asked:

```js
div.computedStyleMap().get('transform').toString()
```

`getComputedStyle(el).transform` is the **resolved** value, one matrix, which has
forgotten which functions made it (#436). The **computed** value is still a
list, and `computedStyleMap()` is the only API that will show it to you. So the
file is not really 82 transform assertions; it is 82 assertions that were never
reachable.

`Element.computedStyleMap()` is now a real `StylePropertyMapReadOnly`
(`get`/`getAll`/`has`/`size`, iteration, `entries`/`keys`/`values`/`forEach`)
over `CSSStyleValue`. `transform` is the one property that does not simply
forward to `getComputedStyle` — it reads `_computedTfList`, the list-mode latch
#436 built.

That took the file from 0 to 27/41 value pairs on the first measurement. **The
other 14 were one rule.**

### Each family has two primitives, and the function picks which

css-transforms-2 reduces a derived function to the primitive it shares with its
partner. The engine had that — `translateX`/`translateY` → `translate`,
`scaleX`/`scaleY` → `scale`, `skewX`/`skewY` → `skew`. What it did not have is
that **each family has a flat primitive AND a deep one, and which one a function
reduces to is decided by the function, not by the list it is in**:

| written | reduces to |
|---|---|
| `translate`, `translateX`, `translateY` | `translate` |
| `translateZ`, `translate3d` | `translate3d` |
| `scale`, `scaleX`, `scaleY` | `scale` |
| `scaleZ`, `scale3d` | `scale3d` |
| `rotate` | `rotate` |
| `rotateX`, `rotateY`, `rotateZ`, `rotate3d` | `rotate3d` |

`scaleZ(1)` → `scaleZ(2)` is `scale3d(1, 1, 1.5)` and not `scalez(1.5)`, even
though nothing on either side mentions x or y: **a function that names the z
axis has already left the plane.** And a flat function meeting its own deep
sibling is not a mismatch that ends the walk (#441) — `translateX(50px)` →
`translateZ(50px)` is one translation moving out of the plane, and it lifts to
`translate3d(25px, 0px, 25px)` rather than collapsing to a matrix.

Two consequences fell out of the same table:

- **Plain 2D `rotate` is the one rotation that keeps its own spelling.** #438
  sent every rotation to `rotate3d` because an axis is a direction and cannot be
  padded — true of `rotateX`/`rotateY`/`rotateZ`, but two plain `rotate`s are an
  angle and an angle, and the answer is an angle: `rotate(60deg)`.
- **`skewX`/`skewY` are primitives in their own right.** Two `skewX`es stay
  `skewX(30deg)`; only a *mixed* pair falls back to the two-argument `skew`. The
  reduction still happens for interpolation — the arithmetic is unchanged — but
  the pair remembers the name both sides agreed on and serializes with it.

### And a pair that could interpolate was stepping

`translate(50%)` → `translate(100%, 50%)` answered `translate(100%, 50%)` at the
halfway mark — the `to` value, which is what a **discrete** pair looks like at
t = 0.5. The padded y slot is `0px` against `50%`, and the interpolation was
being asked as one whole string: the generic skeleton kit compares the literals
*between* the numbers, so `translate(N%, Npx)` and `translate(N%, N%)` have
different skeletons, no interpolation is found, and a perfectly interpolable
pair steps.

Asked **per argument** instead, `0px` and `50%` meet as the length-percentage
pair they are — `_waLPParse`/`_waLPSer`, which #434 already built for the
`translate` property — and give `25%`. One loop replaced one string comparison
and three value pairs came back.

### Two serializers of two different values

`skewX(30deg)` serializes as `skewx(30deg)` in the **specified** value —
`transform-valid.html` pins that Blink/WebKit lowercasing — and as
`skewX(30deg)` in the **computed** list the Typed OM reports. That is not an
inconsistency to be cleaned up; they are two different values, so the computed
list gets its own display table (`_TF_DISP_LIST`).

`transform-interpolation-computed-value` 0/82 → **82/82**.

---

## One more, found by the sweep — `cssRule.style.setProperty()` **threw**

Chasing a suspected regression turned up a bug that was on both builds:

```
TypeError: Invalid value used as weak map key
    at _notifyChange (bootstrap.js:1603)
    at setProperty (bootstrap.js:2651)
```

`_notifyChange` asked `if (this._ownerEl !== undefined)` — but it runs on the
**proxy**, whose get trap answers an unknown member with `''`, the CSSOM
"unset property" answer. A `CSSRule`'s declaration has no owning element, so it
reported `''`, walked into the branch, and `WeakMap.set('')` threw straight out
of `setProperty`. Every CSSOM edit to a stylesheet rule threw — and because the
throw came *before* `this._onChange()`, the edit never reached the cascade
either. `!== undefined` was never the question; the branch wants an object.

`registered-property-cssom` 7/8 → **8/8** (its ledger row had been recorded at
8/8 and had quietly drifted).

---

## Results

| Test | Before | After | |
|------|:------:|:-----:|---|
| `css/css-transforms/animation/transform-interpolation-computed-value.html` | 0/82 | **82/82** | ✅ +82 |
| `css/css-transforms/animation/transform-interpolation-006.html` | 76/96 | **96/96** | ✅ +20 |
| `css/css-transforms/animation/transform-interpolation-inline-value.html` | 17/41 | 24/41 | +7 |
| `css/css-properties-values-api/registered-property-cssom.html` | 7/8 | **8/8** | ✅ +1 |
| `css/css-transforms/animation/matrix-interpolation.html` | 3/4 | **4/4** | ✅ +1 |

### Zero-regression sweep

This arc changed the parser every stylesheet rule and every `style=""` attribute
goes through, so the sweep is the largest the campaign has run — and it was
ordered by **risk**, not alphabetically, so the realms this could break were
measured first rather than last.

- **164 ledger rows** re-measured over the whole touched band — the entire
  `css-transforms/animation` and `css-transforms/parsing` families,
  `web-animations`, `css-transitions`, `css-animations`, plus `cssom`,
  `css-cascade`, `css-values` and a strided sample of the rest — **0
  regressions** after the `_styleSynced` fix.
- **162 ledger rows** re-measured again, to completion, on the final binary (the
  bands a CSSOM-edit change can reach: `cssom`, `css-transitions`,
  `css-animations`, `css-properties-values-api`, `css-variables`,
  `css-transforms/animation`, `web-animations`) — 157 identical, **0
  regressions**, and four rows reading *higher* than the ledger recorded
  (`register-property` 5→6/6, `matrix-interpolation` 3→4/4,
  `CSSStyleSheet-constructable` 6→7/13, `serialize-values` 695→696/697). Those
  four are **not** claimed in the +110: only `registered-property-cssom` was
  baselined individually, and the other three could equally be ledger drift of
  the same kind found below.

**Two ledger rows corrected rather than claimed**: `properties-value-002` was
recorded 17/18 and measures 16/18 **on both builds**, and
`registered-property-cssom` was recorded 8/8 and measured 7/8 on both. Neither
was this arc's doing; the first is now recorded honestly, the second is fixed.

---

## Caps / Next

**⭐ NEXT LEVERAGE — THERE IS A THIRD TRANSFORM SERIALIZER AND IT IS THE ONE
PAGES ACTUALLY SEE.** `transform-interpolation-inline-value.html` is the *same
41 value pairs* as the file this arc took to 82/82, read through
`anim.commitStyles()` — which writes the animated value into the **inline
style**, i.e. the SPECIFIED value. And the specified value keeps the author's
own function:

| the same interpolation, three ways | |
|---|---|
| `getComputedStyle().transform` (resolved) | `matrix(1, 0, 0, 1, 25, 0)` |
| `computedStyleMap().get('transform')` (computed) | `translate(25px, 0px)` |
| `commitStyles()` → `el.style.transform` (specified) | `translateX(25px)` |

`translateX` stays `translateX`, `scale(1.5, 1.5)` collapses to `scale(1.5)`,
`translate(75px, 0px)` drops the `0px`, `rotateZ(60deg)` stays `rotateZ`. It is
the primitive table of #444 **not applied** plus a trailing-default trim, and it
is worth the remaining 17 subtests in that file. It also matters far beyond the
file: `commitStyles` is how a real page freezes an animation, and what it writes
is what the page then renders and serializes. The rule to implement is "keep the
name both sides agreed on, and drop an argument that equals its default" — the
`orig` field `_waTfNorm` now carries is already the hard half.

**Other caps, honest:**
- **The Typed OM is a slice, not the realm.** `computedStyleMap()` returns plain
  `CSSStyleValue`s — `toString()`, `get`/`getAll`/`has`/`size` and iteration are
  real; the typed subclasses (`CSSUnitValue`, `CSSTransformValue`,
  `CSSKeywordValue`, `CSSMathSum`) are not, so nothing can be done *arithmetic*
  with. `css/css-typed-om/` has five subdirectories
  (`stylevalue-objects`, `stylevalue-subclasses`, `stylevalue-normalization`,
  `stylevalue-serialization`, `the-stylepropertymap`) that all want those, plus
  `attributeStyleMap` / `StylePropertyMap.set` on the writable side. A whole
  untouched realm, and now with a foundation under it.
- **`_styleWriteback` is still gated on `_ceGlobalDefCount > 0`.** The cascade no
  longer *cares* (it reads the live declaration), but `getAttribute('style')`
  and `outerHTML` still show the stale copy after a per-property CSSOM write.
  Ungating it is the real CSSOM fix and it is a mutation-record-visible change —
  its own quest, with its own sweep.
- **Both declaration parsers still strip comments with a regex** before the
  top-level split, so `content: "/*"` is mangled. Pre-existing, untouched here,
  and it wants `_splitDeclParts`'s state machine extended rather than a new one.
- `transform-skew-composition` 84/86 and `perspective-interpolation` 234/254,
  `perspective-origin-interpolation` 80/120, `transform-origin-composition`
  22/56 — unmoved by this arc; those rows are the `perspective` and
  `transform-origin` **properties**, not the transform functions.
- `transform-translate-composition` and `caret-color-composition` still
  could-not-run on a fresh server — **seven** sessions running now. One
  `harness_probe.py` quest between them.
- Standing: `progress()` (CSS Values 5) is the whole tail of the two
  `*-math-functions-tentative` files; `_waAdd`'s general fallback returns the
  KEYFRAME value where css-values-4 §not-additive says `Vresult = Va`, the
  UNDERLYING; `animationiteration` not fired; percentage→pixels needs layout
  (unwinnable).

**Reusable seeded:** `_splitDeclParts` (top-level declaration splitting — the
one place a `;` inside a string/comment/function is understood),
`_TF_DISP_LIST` (the computed-list spelling, distinct from the specified one),
`_WA_TF_DEEP` + `_waTfTo3d` (a flat primitive lifted into its deep sibling),
the `orig` field on `_waTfNorm`'s output (the name both sides agreed on — the
hard half of the ⭐ above), `_waTfSerOne` (the one place an interpolated
function chooses its spelling), `CSSStyleValue` /
`StylePropertyMapReadOnly` / `Element.computedStyleMap`, and — the structural
one — **`_cssParseDecls` is now four lines over `_parseStyleDecls`**, so every
future per-property validity rule reaches the cascade for free.
