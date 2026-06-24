# Quest #90 — The Single-Axis Verdict

> *Quests #85–#89 raised the transform realm and the two-axis `<position>` family
> (object/background/mask/offset-anchor/offset-position). But four **single-axis
> longhands** still stood unregistered and ungated: the css-motion scalars
> `offset-rotate` (`[auto|reverse]||<angle>`) and `offset-distance`
> (`<length-percentage>`), and the css-backgrounds halves `background-position-x` /
> `background-position-y` (one axis of `<bg-position>` each). All four had passing
> VALID rows but `0` on every computed test — they were never in `_GCS_DEFAULTS`, so
> `'offset-rotate' in getComputedStyle(el)` was false and the `test_computed_value`
> support gate failed at its first assertion — and their invalid rows were
> unguarded. This quest closed all twelve tests.*

**Realm:** the css-motion `offset-rotate` / `offset-distance` longhands and the
css-backgrounds `background-position-x` / `background-position-y` longhands —
registration + grammar gates + computed serialization.

**Result: +80, all twelve tests → 100%, ZERO caps, ZERO regressions.**

| Test | Before | After |
|------|:------:|:-----:|
| `css/motion/parsing/offset-rotate-parsing-valid.html` | 5/7 | **7/7** |
| `css/motion/parsing/offset-rotate-parsing-invalid.html` | 0/4 | **4/4** |
| `css/motion/parsing/offset-rotate-computed.html` | 0/5 | **5/5** |
| `css/motion/parsing/offset-distance-parsing-valid.html` | 3/4 | **4/4** |
| `css/motion/parsing/offset-distance-parsing-invalid.html` | 0/2 | **2/2** |
| `css/motion/parsing/offset-distance-computed.html` | 0/6 | **6/6** |
| `css/css-backgrounds/parsing/background-position-x-valid.html` | 13/15 | **15/15** |
| `css/css-backgrounds/parsing/background-position-x-invalid.html` | 0/9 | **9/9** |
| `css/css-backgrounds/parsing/background-position-x-computed.html` | 0/19 | **19/19** |
| `css/css-backgrounds/parsing/background-position-y-valid.html` | 13/15 | **15/15** |
| `css/css-backgrounds/parsing/background-position-y-invalid.html` | 0/9 | **9/9** |
| `css/css-backgrounds/parsing/background-position-y-computed.html` | 0/19 | **19/19** |

All work is **pure JS** in `crates/obscura-js/js/bootstrap.js` — **no new Rust**, and
the diff is **purely additive (200 insertions, 0 deletions)**: no shared primitive
was modified, so every existing consumer is byte-identical by construction.

---

## The gap

### 1. Unregistered properties (the support gate)

Like #89's `transform-box`, none of the four longhands were in `_GCS_DEFAULTS`, so
they never joined `_CSS_KNOWN_PROPS`. Every `test_computed_value` row opens with:

```js
assert_true(property in getComputedStyle(target), property + " doesn't seem to be supported…");
```

`'offset-rotate' in getComputedStyle(el)` was `false` → every computed subtest died
at the first assertion (0/5, 0/6, 0/19, 0/19). Fixed by registering the four with
their spec computed-initial values (none inherit — not added to `_INHERITED_PROPS`):

```js
'offset-rotate': 'auto', 'offset-distance': '0px',
'background-position-x': '0%', 'background-position-y': '0%',
```

### 2. Missing grammar gates (the invalid rows)

`offset-rotate`, `offset-distance` and the two `background-position-*` axes had no
validator, so out-of-grammar values (`none`, `30deg`, wrong-axis keywords like
`top` on the x axis) were stored verbatim instead of dropped — every invalid row at
0%.

### 3. Missing computed serialization

Even once registered, the computed value had to be resolved (angle→deg,
`reverse`→`auto`+180°, keyword→%, em→px) to match the expected rows.

---

## The build

### offset-rotate = `[ auto | reverse ] || <angle>`

`_parseOffsetRotate` accepts a keyword (`auto`/`reverse`) and/or an `<angle>` in
either order (1–2 tokens; two keywords / two angles / three tokens → null). The
canonical serialization is **keyword-first** (`5turn auto` → `auto 5turn`,
`0rad reverse` → `reverse 0rad`). Computed (`_computeOffsetRotate`): the angle
resolves to degrees via `_evalMath(..,{angle:true})`/`_serAngle`, and `reverse` ≡
`auto` + 180° (`reverse -50grad` → `auto 135deg`, `reverse` → `auto 180deg`,
`auto` → `auto 0deg`, a lone angle stays bare `-360deg`).

### offset-distance = `<length-percentage>`

`_isValidOffsetDistance` — a single token that is a `<length-percentage>` (reuses
`_isPosLP`, which already rejects angles/times, so `30deg`/`none` drop). Specified
`_canonOffsetDistance` → `_canonLPToken` (`0` → `0px`, calc through the sorted-calc
serializer, `calc(40% + 30px)` kept). Computed reuses `_posComputeLen` (em→px,
`%` kept, mixed `%`+length calc → `calc(P% ± Lpx)`).

### background-position-x / -y = `[ center | [ [ <edge> ]? <lp>? ]! ]#`

Per comma-layer; the **x** axis takes `left | right | x-start | x-end`, the **y**
axis `top | bottom | y-start | y-end`. `_parseBgAxisLayer` yields
`{kw?, edge?, off?, lp?}` per layer; `center` takes no offset, the edge keyword must
precede any `<length-percentage>` offset, and a wrong-axis keyword is rejected
(`top` on x, `right left`, `20% left`, `center 10px`, `x-start center`). Specified
keeps the keyword (so logical `x-start`/`y-end` survive) and canonicalizes the
offset. Computed (`_bgAxisComputed`): `center`→`50%`, start-edge→`0%`, end-edge→
`100%`, offsets resolved by routing through the shared `_posCompComputed`
(so `right 10px` → `calc(100% - 10px)`, `right -10px` → `calc(100% + 10px)`).

**The logical-keyword quirk.** The recorded engine behavior (encoded in the WPT
expected values) is asymmetric: a lone logical keyword stays logical
(`x-start` → `x-start`), but in a multi-layer list it physicalizes
(`0.5em, x-start, x-end` → `20px, 0%, 100%`). `_bgAxisComputed` keeps a logical
keyword only when it is the **sole** layer with no offset; otherwise it resolves to
`0%`/`100%` like a physical edge.

### The scoped sorted-calc serializer

The two `background-position-*-valid` fails left after the first build were a
**calc additive unit-ordering** mismatch: CSSOM serializes a `calc()` sum as
numbers → percentage → dimensions alphabetically-by-unit (CSS Values 4 §10.13), so
`calc(10px - 0.5em)` → `calc(-0.5em + 10px)`. The shared `_canonMathExpr` folds
same-unit terms but does **not** reorder mixed units (this is the long-standing
`calc-serialization.html` 0/1 cap). Rather than touch that hot-path primitive,
`_canonSortedCalc` reorders a **flat** sum of simple number/%/dimension terms into
canonical order and is wired **only** into `_canonLPToken` — so it touches just the
four new longhands. Anything richer (nested groups, products, functions) falls back
to the unsorted `_canonMathExpr`. `background-position-x/-y-valid` 13/15 → **15/15**.

All gates wired into **both** specified paths (`_parseStyleDecls` + `setProperty`),
all computed paths into `_normComputed`.

---

## Zero-regression sweep

Diff is purely additive (no shared primitive edited), confirmed by held baselines:

- `background-position` shorthand valid 31/31, computed 32/32 — **untouched** (the
  longhands do not feed the shorthand path).
- `object-position-valid` 18, `mask-position-valid` 23, `offset-anchor-parsing-valid`
  11 + computed 14, `offset-position-parsing-valid` 12 — the #87/#88 position gates.
- `transform-valid` 42, `scale-parsing-valid` 32, `gradient-position` 18/43.
- `color-computed-relative-color` 1163/1169, `Element-classlist` 1420,
  `Document-createElement` 147, `ParentNode-querySelector-All` 1975.
- `calc-serialization.html` 0/1 and `minmax-length-serialize.html` 1/24 unchanged —
  both ride the generic `_canonMathExpr` path that was **not** modified.

---

## Caps / Next

**ZERO caps in this realm** — all twelve tests at 100%.

**The standing generic-calc cap remains** (`calc-serialization.html` 0/1,
`minmax-length-serialize.html` 23/24 fails): generalizing the additive unit-ordering
into `_canonMathExpr` on the **generic value path** is still its own quest (real
hot-path risk — `_canonSortedCalc` here is deliberately scoped to the new longhands).

**NEXT (the css-motion frontier this opened):**
- **`offset-path`** parsing/computed — the big one (valid 46/70, invalid 0/24,
  computed 0/65 ≈ +113), but needs `ray()` / basic-shape / `url()` / coord-box
  grammar; a dedicated quest.
- **`offset`** shorthand (valid 13/29, invalid 0/13 ≈ +29) — composes
  position/path/distance/rotate/anchor; best after `offset-path` lands.
- The standing colour leverage (light-dark() computed, var()/sibling-index()
  computed, none-component structured storage); or a fresh realm.

Scroll closed. — Quest #90 The Single-Axis Verdict, +80, zero caps, zero regressions.
