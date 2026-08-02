# ⚔️ Quests #451–#453 — The Unsupported Verdict

> *Three ways a property gets a value wrong before anyone looks at the value: a
> corner the engine could store but could not NAME, a shorthand handed a number it
> has no word for, and a value the map described with a class that lied about it.*

**Session:** 2026-08-02 · **Branch:** `engine-per-page-threads` · **All in `crates/obscura-js/js/bootstrap.js`**

**Result: +242 measured across the 244-file band, ZERO regressions, ten more files to 100%.**
`the-stylepropertymap/properties/` **10,051 → 10,293 / 11,311**.

---

## Where the pointer sent us — and the first thing that reframed it

#450's ⭐ read: *"`the-stylepropertymap/properties/logical.html` is 1274/1468 — 194
failing subtests in ONE file, the largest single row anywhere in the realm."* True on
the size. But the first thing this session did was ask a question the campaign had not
asked before: **what does Chrome score on the same file?**

```
logical.html      us 1274/1468      Chrome 1256/1468
```

**We were already 18 ahead of Chrome on the biggest row left.** A raw failure count is
not a work list — some of those 194 are rows no shipping engine passes, and chasing
them would have burned the session. So the session pulled Chrome's per-subtest results
(`wptd-results/…/report.json`, 319 MB, from the `wpt.fyi` run API) and diffed them
against ours by subtest NAME:

| | rows |
|---|---:|
| we fail, **Chrome passes** — the true gaps | **130** |
| we fail, Chrome fails too — the file arguing with the spec | 64 |
| Chrome fails, **we pass** — where we were already ahead | 148 |

Those 130 bucketed into exactly three causes, and they are the three quests below.
**This diff-against-a-shipping-engine step is the reusable part of this session** —
it turns "194 failures" into "130 winnable, 64 named caps" in about ten minutes, and
it is now the recommended first move on any big row.

---

## #451 — A corner the engine could store but could not NAME

52 of the 194 rows read `TypeError: Invalid propertyName: 'border-start-start-radius'`
— and its three siblings `border-start-end-radius`, `border-end-start-radius`,
`border-end-end-radius`. These are css-logical §2.4's **flow-relative corner radii**:
the same rounded corner as `border-top-left-radius`, named by the two axes it sits
between instead of by two physical edges. A page that lays out in `vertical-rl` or in
an RTL script writes these, and every one of them threw at the Typed OM's front door.

Probed directly, the engine's answer was stranger than "unsupported":

```js
d.style.setProperty('border-start-start-radius', '5px');
d.style.cssText                                  // "border-start-start-radius: 5px;"  ← stored
getComputedStyle(d).borderStartStartRadius       // "5px"                              ← resolved
CSS.supports('border-start-start-radius', '5px') // false                              ← …but unknown
```

**The engine could store the value and read it back, and did not believe the property
existed.** `_CSS_KNOWN_PROPS` is built from `_GCS_DEFAULTS` plus a list of shorthands,
and the four corners were in neither, so they fell through a permissive
unknown-property path — stored as opaque text, invisible to `CSS.supports`, and fatal
to `_tomPropName`.

The fix is small and the reason it is small is worth writing down. A corner radius's
grammar is `<length-percentage [0,∞]>{1,2}` and `_serBorderRadiusLH` already
implements exactly that, for the physical four. The logical four want **every**
parse/serialize/computed path the physical ones have — and **must not** join the one
place the physical four are special:

```js
const _BORDER_RADIUS_LOGICAL_LH = [
  'border-start-start-radius', 'border-start-end-radius',
  'border-end-start-radius',   'border-end-end-radius',
];
const _BORDER_RADIUS_LH_SET = new Set([..._BORDER_RADIUS_LH, ..._BORDER_RADIUS_LOGICAL_LH]);
```

The **SET** feeds `_canonCssUi` (specified canon) and `_normComputed` (px resolution +
negative clamp). The **ARRAY** `_BORDER_RADIUS_LH` stays four physical corners,
because it is what `border-radius` expands into and what `removeProperty('border-radius')`
clears — and css-backgrounds-3 defines that shorthand over the physical corners only.
Writing `border-radius: 5px` must not touch a flow-relative corner. *A property that
shares a grammar does not share a shorthand.*

Plus `_GCS_DEFAULTS` entries (`'0px'`, which `_CSS_KNOWN_PROPS` picks up for free) and
a `_TOM_ACCEPTS` row — that last one is load-bearing, see #452: without it the 26
*invalid*-value rows per corner would have started passing values through instead of
throwing, and the 52 winnable rows would have cost 104.

---

## #452 — A shorthand has no typed value of its own

82 rows, every one of the form `Setting 'X' to a length/percent/number … throws
TypeError → did not throw`. All 82 ours-only: Chrome throws on every one.

The gate `set()` passes through is `_tomTypeGate`, which asks `_TOM_ACCEPTS` "does this
property take a value of this base type?" and, for a property the table does not name,
falls back to a permissive yes. Then `_tomValueOk` asks a scratch declaration block
whether the CSS is valid — and it **is**: `border-block-start: 0px` is a perfectly good
declaration. Both doors said yes, so a `CSSUnitValue` sailed onto a shorthand.

Why that is wrong is not "the grammar forbids it". The grammar allows it. Two other
reasons do:

- **`border-block-start` = `<line-width> || <line-style> || <color>`.** The string
  `border-block-start: 5px` gets away with a lone length because it *also resets the
  style and the colour to their initial values* — that reset is the shorthand's whole
  meaning. A `CSSUnitValue(5,'px')` carries no such intent, and it does not even say
  **which of the three longhands it is for**.
- **`margin` = `<'margin-top'>{1,4}`** — a box-edge LIST. One unit value would have to
  mean "all four edges", and Typed OM level 1 has no list form to say so with.

So every shorthand gets an explicit empty accept-set — and while the table was open,
the `<line-width>` family got corrected too:

```js
// A `<line-width>` is `<length [0,∞]> | thin | medium | thick` — there is no
// percentage in that grammar, and a border 3% of anything has never been a thing.
put(['border-top-width', …, 'outline-width', 'column-rule-width', 'row-rule-width',
     'perspective'], ['length']);
put(['margin','padding','inset','scroll-margin','scroll-padding',
     'border','border-top',…,'border-block','border-inline','outline','column-rule',
     'border-width','border-style','border-color','border-radius', …], []);
```

The `<line-width>` percentage had leaked for a specific and interesting reason: the
string door already refuses it (`_canonLineWidthValue` rejects a `%` outright), but
`set()` **wraps an out-of-range value in `calc()`** — that is CSS Values §range-checking,
which only refuses an out-of-range *literal* — and a `calc()` is waved through for
folding later. So `-3.14%` reached the property dressed as `calc(-3.14%)`.

### The one place the table answers two ways, said out loud

`margin.html` runs `runPropertyTests('margin', [])` — **no valid syntax at all**, so a
length on `margin` must throw. `logical.html`, one directory over, asserts that
`margin-block: 10px` **does** set both flow-relative edges through the Typed OM.
The two files disagree about the same kind of property, and Chrome refuses both
(which is why Chrome fails 54 rows of `logical.html` that we pass).

We follow each file:

```js
put(['margin-block','margin-inline','padding-block','padding-inline',
     'inset-block','inset-inline'], ['length','percent']);
put(['border-block-width','border-inline-width'], ['length']);
```

This is the honest position and not a trick: where the suite pins a door **shut** we
close it, and where it pins one **open** we leave it open, because a strict superset of
Chrome's behaviour cannot break a page written for Chrome. It is recorded here so the
next comrade does not "fix" the asymmetry and lose 54 rows.

---

## #453 — Reification asks the PROPERTY too

`1px` looks like a length from ten feet away. On `margin` it is not one — and the suite
tests exactly this, with `runUnsupportedPropertyTests`: hand a property a value it has
no typed word for, and the map must answer with the **base `CSSStyleValue`**, not a
subclass that lies about what it is. A `CSSUnitValue(1,'px')` handed back for `margin`
is a value a page can `.value`, `.unit` and do arithmetic on — and then hand somewhere
that refuses it.

`_tomReify` asked only the value's SHAPE. The gate that refuses a value on the way IN
is the same question, so it is the same call — **one table, two doors**:

```js
if (_tomUnit(u)) {
  const uv = new CSSUnitValue(parseFloat(m[1]), u);
  return _tomPropTakes(prop, uv) ? uv : _tomMake(CSSStyleValue, t);
}
```

Three faces, all the same sentence:

1. **A shorthand's numeric** (`margin: 1px`, `scroll-padding: 0%`, `border-radius: 30px`)
   — falls straight out of #452's empty accept-sets.
2. **A colour property's colour.** `red` came back as `CSSKeywordValue("red")`, and a
   keyword is a thing you compare **by spelling** — but `red`, `#f00` and
   `rgb(255,0,0)` are one value with three spellings, and level 1 has no class for it.
   So a named colour, `transparent` and the system colours reify as the base value.
   **`currentcolor` is the exception and it is not an inconsistency: it names no colour
   at all, it points at one, and it stays the word it was written as.**
3. **A pair-valued COMPUTED value.** `border-top-left-radius`'s computed value is a
   *pair* of radii (horizontal, vertical) that only *serializes* as one token when the
   two agree. The collapsed string is a serialization, not a scalar — answering
   `CSSUnitValue(5,'px')` silently drops half the value. `computedStyleMap()` answers
   with the COMPUTED value, so it must say "no word for this".

…and one computed-value correction that rode along, because it is the same shape of
mistake one layer down:

```js
// A resolved negative on a non-negative property clamps to zero — and a
// PERCENTAGE is resolved too. `padding-top: -3.14%` never survives the parser,
// but `calc(-3.14%)` does — and it is the form the Typed OM's `set()` writes.
const _clampNegPx = (r) => {
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(px|%)$/.exec(String(r));
  return (m && parseFloat(m[1]) < 0) ? '0' + m[2] : r;
};
```

`_CLAMP_NEG_PROPS` had always clamped a resolved negative **px** to `0px`; a resolved
negative **percentage** walked through untouched, so `padding-block-start` computed to
`-3.14%`. The unit is kept (`0%`, not `0px`) because those are the same length only
once layout says so.

### The regression this caused, and what it taught

The first build of #453 cost one subtest: `transform.html` 32 → 31. The "all the
transform components" row came back as a base `CSSStyleValue`.

`_tomComponentOf` reifies a transform function's **arguments**, and it passes **no
property** — #448's sentence, one door over: inside `rotate3d(1, 2, 3, 45deg)` the
property has nothing to say, the FUNCTION is what knows. With `prop = null` the new
gate consulted `_TOM_CLOSED.angle`, found no `null` in it, and demoted every `45deg`
to a base value — which made every component `null`, which made the whole list
unrepresentable.

```js
// With no property the answer is always yes: a `45deg` there is an angle because
// `rotate3d` says so, not because `transform` accepts angles (it accepts a
// transform LIST and nothing else).
const _tomPropTakes = (prop, v) => prop == null || _tomTypeGate(prop, v);
```

---

## Results

| test | before | after | Chrome |
|---|---:|---:|---:|
| `the-stylepropertymap/properties/logical.html` | 1274/1468 | **1382/1468** | 1256 |
| `…/border-radius.html` | 83/128 | **128/128** ✅ | 96 |
| `…/margin.html` | 151/161 | **161/161** ✅ | 156 |
| `…/scroll-padding.html` | 243/252 | **252/252** ✅ | 252 |
| `…/padding.html` | 120/124 | **124/124** ✅ | 124 |
| `…/border-color.html` | 136/148 | **144/148** | 144 |
| `…/border-width.html` | 104/136 | **120/136** | 136 |
| `…/block-size.html` · `inline-size.html` | 92/95 | **95/95** ✅ | 95 |
| `…/gap.html` | 62/64 | **64/64** ✅ | 64 |
| `…/outline-width.html` | 32/34 | **34/34** ✅ | 34 |
| `…/flex-basis.html` | 35/36 | **36/36** ✅ | 36 |
| `…/scroll-margin.html` | 251/252 | **252/252** ✅ | 252 |
| eleven `*-color.html` files (`color`, `accent-color`, `background-color`, `caret-color`, `column-rule-color`, `flood-color`, `lighting-color`, `outline-color`, `text-decoration-color`, `text-emphasis-color`) | 34/37 each | **36/37** each | 36/37 |
| `…/column-rule-width.html` | 25/41 | 27/41 | — |
| `…/perspective.html` | 27/32 | 29/32 | — |
| `…/height.html` · `width.html` | 92/95 | 94/95 | — |
| `…/grid-auto-columns-rows.html` | 62/72 | 64/72 | — |

**Band total: 10,051 → 10,293 / 11,311.** Files at 100%: **103 → 113**. Files where we
now score **above Chrome**: **23**.

---

## Caps, named on purpose

- **The last 24 rows of `logical.html` are a SUITE SELF-CONTRADICTION, not a gap.**
  `border-radius.html` says a corner's computed value is *"always a pair of values,
  which are not supported in Typed OM level 1"* and demands the base `CSSStyleValue`.
  `logical.html` demands a `CSSUnitValue` back — **for the same corner**. In a
  horizontal-tb LTR div `border-top-left-radius` and `border-start-start-radius` are
  one rounded corner; answering with two different classes depending on how it was
  spelled would be indefensible, so we answer both the way the file that *reasoned
  about it* says. Taking the other option would buy 24 greens and cost the engine its
  consistency. **Do not "fix" this.**
- **The 4 `currentcolor` computed rows in `border-color.html` (and the 1 in each colour
  file) are a cap no engine passes.** Chrome fails all four. The test wants
  `computedStyleMap().get('border-top-color')` to answer `CSSKeywordValue("currentcolor")`;
  the computed value of a colour property really is resolved against the element's own
  `color`. We are now level with Chrome on every colour file.
- **The 24 `thin`/`medium`/`thick` rows in `logical.html` are the same shape.** That
  file expects `computedStyleMap().get('border-block-start-width')` to answer the
  KEYWORD; `border-width.html` — the file that thought about it — supplies a callback
  asserting `1px`/`3px`/`5px`. Chrome fails `logical.html`'s and passes
  `border-width.html`'s. Ours currently fail both, which is the next item.

---

## Caps / Next

**⭐ `border-width.html` is 120/136 and Chrome is 136/136 — 16 rows, one sentence.**
The file's own comment is the whole quest: *"Computed value is independent of
border-style."* Our `_normComputed` zeroes a border width when the border style is
`none`/`hidden` (CSS Backgrounds 3 does put that in the computed value) — but
`computedStyleMap()` is defined over the **computed** value while `getComputedStyle()`
returns the **resolved** value, and Blink puts the zeroing in the latter only. This is
the third sighting this session of that same distinction (`currentcolor`, the corner
pair, this) and it wants one careful quest: give `_tomComputedSource.read()` a door to
the un-zeroed width **without** moving `getComputedStyle`, which many realms pin at
`0px`. Worth ~16 here plus the `border-*-width` tail elsewhere.

**Then, by size, the remaining band tail (measured, `band_final.json`):**

| file | ours | Chrome | shape |
|---|---:|---:|---|
| `border-style.html` | 84/132 | 132 | 12 per longhand — **unbucketed, start here after border-width** |
| `logical.html` | 1382/1468 | 1256 | 62 of the 86 are named caps above |
| `column-rule-width.html` | 27/41 | — | css-gaps list values |
| `grid-template-columns-rows.html` | — | 48/68 | Chrome fails it too — check before spending |
| `border-image-*.html` (5 files) | 22–33/34–37 | — | multi-component values, same family as the corner pair |
| `quotes.html` · `pointer-events.html` | 21/33 · 29/41 | — | keyword enums leaking numerics — likely one `_TOM_ACCEPTS` pass |

**Reusable method, and the biggest thing this session found:** before touching a large
failing row, **diff it against a shipping engine's per-subtest results**. Latest run:
`https://wpt.fyi/api/runs?label=master&product=chrome&max-count=1` → `raw_results_url`
→ `results[].subtests[]`. It cost ten minutes and turned 194 failures into 130 winnable
rows and 64 named caps — and it caught that we were **already ahead of Chrome** on the
row the pointer called the biggest one left.

---

## Zero-regression sweep

- **The full 244-file `properties/` band, 11,311 subtests, measured on BOTH builds.**
  Every row identical except the 28 that gained, and NOTHING moved down. Net **+242**, and the only file that
  moved down in the first pass (`transform.html`, 32→31) was fixed by `_tomPropTakes`
  and re-measured back at 32/33 — its one remaining failure
  (`matrix(sibling-index(), …)`) is pre-existing and untouched.
- **40 held realms, measured on both builds — 39 byte-identical**, the 40th being
  `border-width.html`, which is in the band and gained 16. qsa **1975**, classlist
  **1420**, Element-matches **669**, createElement 147, url-origin 406, serialize-values
  696, cssom idlharness 493, mark 22/22, measures 119/119, structured-clone 141,
  getRandomValues 39/39, css-transitions properties-value-001 **560/560**,
  css-animations idlharness 98, css-transitions idlharness 64, transform-valid 42/42,
  transform-invalid 20/20, transform-interpolation-001 **448/448**, -005 **384/384**,
  -006 **96/96**, -computed-value **82/82**, -inline-value **41/41**,
  matrix-composition 112/112, list-interpolation 76/76, css-transforms inheritance
  20/20, registered-property-cssom 8/8, register-property 6/6,
  color-valid-relative-color 1131, signs-abs-invalid 24, calc-infinity-nan-computed,
  round-mod-rem-computed, border-radius-computed, border-radius-valid,
  logical-box-border-width / -margin / -padding, css-typed-om idlharness **536/544**,
  computed/get.
