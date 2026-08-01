# ⚔️ Scroll 445 — The Typed Verdict

> *Three quests. A serializer nobody had written, a realm that died on line one,
> and a `var()` that was being read as arithmetic.*

**Quests #445 · #446 · #447** — session 2026-08-01, branch `engine-per-page-threads`.

---

## The gap

#444's ⭐ pointed at one file and one sentence: **there is a THIRD transform
serializer and it is the one pages actually see.** Following it opened the door
on a realm the campaign had walked past all year.

| | before | after |
|---|---:|---:|
| `css/css-transforms/animation/transform-interpolation-inline-value.html` | 24/41 | **41/41** |
| `css/css-typed-om/**` (359 files) | *(filled in below)* | |

---

## Quest #445 — the SPECIFIED value keeps the author's own function

`commitStyles()` freezes a running animation into the target's inline style, and
what it writes is what the page then renders, re-serializes and hands to the next
script. It is the third of three serializations of one animated transform, and
all three are different values:

| asked through | `translateX(0px)` → `translateX(50px)` at ½ |
|---|---|
| `getComputedStyle().transform` | `matrix(1, 0, 0, 1, 25, 0)` — the RESOLVED matrix |
| `computedStyleMap().get()` | `translate(25px, 0px)` — the COMPUTED list (#444) |
| `commitStyles()` → `div.style.transform` | **`translateX(25px)`** — the SPECIFIED value |

The rule turned out to be one sentence, and it is #444's own sentence one layer
up: **a pair serializes as what the two sides AGREE on.** The computed list
answers in the shared PRIMITIVE because that is what the two sides interpolated
*in*; the specified value answers in the function the author actually wrote —
but only when both sides wrote the same one. `translateY(0%)` → `translateX(50%)`
has no author's spelling left to keep, so it is a `translate` again.

Plus the trailing-default trim the specified form has and the computed one does
not: `translate`'s second argument goes when it is zero, `skew`'s when it is no
angle at all, and **`scale`'s when it equals the FIRST** — which is why
`scale(1.5, 1.5)` is `scale(1.5)` and `scale(1.5, 2)` is not. The 3D functions
never elide: `translate3d(0px, 0px, 0px)` names three axes and dropping two would
name a different function.

**And the half of it that is not a serializer at all: `commitStyles` sets a
VALUE, not a STRING.** Seven of the seventeen rows were `scaleX(1.5)`,
`scaleY(1.5)`, `scaleZ(1.5)` and three `skewX`es coming back **lowercased** —
because our commit wrote through `target.style[name] = text` and met the parser
on the way in, and the parser lowercases `scalex`/`skewx` (a Blink quirk
`transform-valid.html` pins: `skewX(90deg)` → `skewx(90deg)`). Both tests are
right and they are not in conflict: §commit-computed-styles sets a declaration to
a *value*, and a value arrives already knowing how it is spelled. `_TF_DISP_VAL`
is that door; `transform-valid.html` still reads `skewx` through the other one.

**Result: `transform-interpolation-inline-value` 24 → 41/41 (+17).** The whole
transform band held: `-computed-value` 82/82, `-001` 448/448, `-005` 384/384,
`-006` 96/96, `transform-valid` 42/42.

---

## Quest #446 — a realm that died on line one

`css/css-typed-om/` is 359 files, and the ~250 under
`the-stylepropertymap/properties/` all pull in one shared `testsuite.js` that
**constructs** a `CSSKeywordValue`, a `CSSUnitValue`, a `CSSMathSum`, a
`CSSUnparsedValue` and a twelve-component `CSSTransformValue` **at script load** —
before a single test runs. So all 250 died with
`ReferenceError: CSSKeywordValue is not defined`, which the harness reports as a
could-not-run and not as a failure. Exactly #430's shape one realm over: *a
property the engine has never heard of fails every test in the file on line one.*

We shipped a plain `CSSStyleValue` and a read-only `computedStyleMap()` (#444's
foundation) and nothing else. This quest builds the rest:

- **`CSSNumericValue`** with a real numeric-type algebra — `3px` is `{length: 1}`,
  `3px * 3px` is `{length: 2}`, and a bare percentage has no type of its own
  until it meets something (`calc(1px + 1%)` is a length that REMEMBERS a
  percentage went into it — the percent hint).
- **`CSSUnitValue`** over the full 34-unit table, with the conversion factors to
  each family's canonical unit. The relative lengths (`em`, `vw`, `cqw`, …) have
  **no** factor, and that is not a gap: they cannot be converted without an
  element and a viewport, so `CSSUnitValue(1,'em').to('px')` is a TypeError and
  not a guess.
- **`CSSMathSum` / `Product` / `Negate` / `Invert` / `Min` / `Max` / `Clamp`**,
  each with the type rule its operator implies, a canonical-form reducer, and the
  serialization where the outermost one wears the `calc()` and the nested ones
  wear bare parentheses.
- **`CSSUnparsedValue` / `CSSVariableReferenceValue`** — a value carrying a
  `var()` is a LIST, the literal text between the references and the references
  themselves, split by a bracket walk because a fallback can contain a `var()`.
- **`CSSTransformValue`** and its eight components, which is the same list
  #436–#444 taught the animation model to speak handed to a page one component at
  a time. A component's `toMatrix()` re-enters this engine's own transform parser
  rather than growing a second matrix builder that could disagree with it.
- **Reification** (CSS text → object) and **normalization** (object → CSS text),
  and `attributeStyleMap` / `StylePropertyMap` over the element's real inline
  declaration — the same block `el.style` is, read and written straight through,
  because #442 already showed what it costs when one value has two homes.

`assert_class_string` — the assertion the whole realm leans on — asks
`Object.prototype.toString.call(v)`, which answers `[object Object]` for a plain
class. Every one of these prototypes therefore carries a `Symbol.toStringTag`, or
"must be a CSSUnitValue" reads as a failure on a value that IS one.

---

## Quest #447 — two answers again, and a `var()` read as arithmetic

The largest bucket in the realm was `set()` **not throwing**: `testsuite.js` tests
every property against every syntax and wants a `TypeError` for the ones it does
not take, and our gate said yes to all of them.

**The gate was asking the wrong oracle.** `CSS.supports('width', '-3.14%')`
answers `true` while `style.width = '-3.14%'` silently keeps the old value — two
answers to one question, #442's arc exactly. A scratch declaration is the *same
parser the real write will meet*, so it cannot disagree with it, and that is what
`set()` asks now.

Two rules came out of fixing it:

1. **Out of RANGE is not the same as invalid.** `width: -3.14%` is not a width —
   but `width: calc(-3.14%)` **is**, because CSS Values §range-checking only
   rejects an out-of-range LITERAL at parse time; a math function carries its
   negative to used-value time and clamps there. So a typed negative on a
   non-negative property does not throw, it puts on a `calc()` — which is why the
   suite expects a `CSSMathSum` back out of a value it handed in as a
   `CSSUnitValue`.
2. **A typed value knows its TYPE, and that is a question about the property.**
   A full per-property grammar is not the answer; **inverting the question** is.
   Instead of "which types does `display` accept", ask *"which properties accept
   an ANGLE at all"* — and for angle, time, frequency, resolution, flex and
   transform that is a short CLOSED list, so everything not on it is a confident
   no. Only length/percentage/number need per-property knowledge, and there this
   engine's own computed-value tables (`_LENGTH_COMPUTED_PROPS`,
   `_SIZE_COMPUTED_PROPS`, `_TIME_COMPUTED_PROPS`, `_INTEGER_COMPUTED_PROPS`,
   `_COLOR_PROPS`) already have it — reused rather than restated, so the gate
   cannot drift away from the cascade.

### The bug the probe found, and it is not a Typed OM bug at all

Setting `opacity` to `var(--A)` came back out as **`var(-1 * (-1 * a))`**.

`_FILTER_MATH_RE` counts `var(`/`env(` as a math function **on purpose** — for
VALIDITY an unsubstituted reference has to be accepted, since nobody can yet say
what it will be. But the callers that use that same predicate to decide *"fold
this"* handed the reference to the calc parser, which has no idea what `--A` is
and read the two dashes as two unary minuses in front of an identifier.

So **`opacity: var(--fade)` did not merely serialize oddly — it did not work.**
The mangled text is a value no substitution can ever repair; the computed opacity
came back `1`, the initial, on every page using an opacity custom property. A
`var()` is not a math expression; it is a *promise* of one. Refusing it inside
`_canonMathExpr` fixes it once for every caller, because they all already fall
back to the verbatim text on `null`.

---

## Results

**+10,767 measured, ZERO regressions, 142 files to 100%.**

| band | before | after |
|---|---:|---:|
| `transform-interpolation-inline-value.html` | 24/41 | **41/41** |
| `css-typed-om/the-stylepropertymap/properties/` (245 files) | **0** — every file could-not-run | **10,023/11,282** (88.8%) |
| `css-typed-om/` everything else (104 files) | 65/939 | **792/1,399** |
| **realm total** | **65** | **10,815** |

99 of the 245 properties files are now at 100%; 141 across the realm. Six files
still could-not-run.

Held through it all: `transform-interpolation-computed-value` 82/82, `-001`
448/448, `-005` 384/384, `-006` 96/96, `transform-valid` 42/42,
`ParentNode-querySelector-All` 1975/1975, `Element-classlist` 1420/1420,
`Document-createElement` 147/147, `Document-createElementNS` 596/596,
`url-origin` 406/413, `mark` 22/22, `structured-clone` 141/152,
`getRandomValues` 39/39, `serialize-values` 696/697,
`calc-infinity-nan-serialize-length` 41/41, `-time` 29/29, `-computed` 48/48,
`minmax-length-computed` 76/80.

### Ten ledger rows were STALE, and every one was disproved by stashing

The sweep flagged ten regressions in the calc/colour band — precisely where
`_canonMathExpr` was touched, which is exactly what a real regression would look
like. **All ten measure byte-identical on the pre-session build.** They are stale
ledger rows and have been corrected in `WPT_PROGRESS.md` rather than left for the
next knight to spend another hour on:

| row | ledger said | actually (both builds) |
|---|---:|---:|
| `color-computed-relative-color` | 1163 | 1121/1169 |
| `color-valid-relative-color` | 1146 | 1131/1147 |
| `color-computed-rgb` | 95 | 79/99 |
| `color-valid-color-mix-function` | 674 | 656/677 |
| `color-computed-hwb` | 54 | 47/56 |
| `signs-abs-invalid` | 53 | 24/53 |
| `hypot-pow-sqrt-invalid` | 49 | 42/49 |
| `getComputedStyle-calc-mixed-units-003` | 2 | 0/7 |
| `cursor-computed` | 37 | 36/39 |
| `properties-value-003` | 89 | 86/122 |

**When the sweep flags a regression in the band you just touched, that is the
moment to stash-prove it, not the moment to believe it.**

## Caps / Next

- **⭐ `idlharness.html` 254/544 is the single biggest remaining row in the
  realm** and it is not a cap — it is a list. It checks every attribute, method,
  argument count and `[Exposed]` of every interface built here against the real
  IDL, so each failure names one concrete missing member. Cheap, mechanical, and
  it is how the value classes get finished rather than guessed at.
- **The `properties/*` tail is one bucket, and it is `set()` still not
  throwing.** The type gate closes angle/time/frequency/resolution/flex/transform
  because those have short closed lists; **length, percentage and number stay
  permissive for any property `_TOM_ACCEPTS` does not name**, so a
  keyword-only property still accepts `0px`. Widening that table is a pure
  data-entry win worth roughly 4 subtests per unnamed property × ~150 properties.
- **`assert_is_equal_with_range_handling`'s other half.** We wrap a negative in
  `calc()` when the bare form is refused; Blink also wraps where the *engine*
  would accept the literal but the property is non-negative. Divergence shows up
  as a `CSSUnitValue` where a `CSSMathSum` was wanted.
- **Percentage-folding properties disagree with the specified value.** Our
  `opacity: 3.14%` canonicalizes to `0.0314` at SPECIFIED time; Blink keeps the
  `%`. Costs ~3 subtests per `<percentage>`-syntax property and is a
  `_canonOpacitySpecified` question, not a Typed OM one.
- **`CSSNumericValue.parse('calc(1px + calc(1px) + calc(1px * 2) + 1%)')` does not
  simplify** — our parse is faithful, not folding, so it returns four values
  where two are wanted. Only bites `parse()`; values that go through a
  declaration are folded by the cascade on the way.
- **Six files still could-not-run**, including
  `transformvalue-normalization.tentative.html`. Unmeasured, not cleared.
- Honest non-cap: **`display: inline math`** and friends are refused by our
  `display` grammar, so `runUnsupportedPropertyTests` gets `undefined` where it
  wants a plain `CSSStyleValue`. That is a `display` gap, not a Typed OM one.
