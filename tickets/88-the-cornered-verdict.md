# Quest #88 — The Cornered Verdict

> *Quest #87 raised the wards on the transform-module origins and object-position.
> But four position gates still stood open: `background-position`, `mask-position`,
> `offset-anchor`, `offset-position`. Each had a passing VALID test and an
> unguarded INVALID one — every malformed traveller (`30deg`, `auto`, `left 4px top`,
> `1% center 2px`) strolled through. This quest closed all four, and in doing so
> drew the precise line between the TWO position grammars: the strict CSS Values 4
> `<position>` and the lenient legacy `<bg-position>`.*

**Realm:** the position-invalid gates for four properties across three specs —
`css/css-backgrounds`, `css/css-masking`, `css/motion`.

**Result: +30, all four tests → 100%, ZERO caps, ZERO regressions.**

| Test | Before | After |
|------|:------:|:-----:|
| `css-backgrounds/parsing/background-position-invalid.html` | 0/11 | **11/11** |
| `css-masking/parsing/mask-position-invalid.html` | 0/13 | **13/13** |
| `css-motion/parsing/offset-anchor-parsing-invalid.html` | 0/3 | **3/3** |
| `css-motion/parsing/offset-position-parsing-invalid.html` | 0/3 | **3/3** |

---

## The gap

All four properties already serialized their **valid** forms correctly
(background-position-valid 31/31, mask-position-valid 23/23, offset-anchor-valid
11/11, offset-position-valid 12/12). The missing piece was — again — the
**invalid-rejection gate**: an out-of-grammar value was stored verbatim instead of
being dropped, so `test_invalid_value()` (which asserts the property comes back
empty) failed across the board.

But unlike Quest #87's six gates, these four split across **two distinct position
grammars** — and the tests draw the line sharply:

### Grammar A — strict `<position>` (CSS Values 4): mask / offset-anchor / offset-position

The multi-value branch is the **4-value edge form only**:

```
[ [ left | right ] <length-percentage> ] && [ [ top | bottom ] <length-percentage> ]
```

No `center` in the edge form, **offsets required on BOTH axes**, hence **no
3-value form at all**. This is exactly the grammar Quest #87's `_parsePosition`
already implements for `object-position`. Proof from the tests:

- `mask-position` valid forms are only 1-, 2-, or **4**-value — never 3-value.
- Every `mask-position` invalid is a 3-value form (`center top 2px`, `left 4px top`,
  `right top 5px`, …), a wrong-axis pair (`left right`, `bottom 10% top 20%`), a
  bare-length triple (`1px 2px 3px`), or a disallowed keyword (`auto`).
- `offset-anchor`/`offset-position` reject `left 10% top` (3-value) and `30deg`
  (an angle, not a `<length-percentage>`), while accepting `auto` (both) and
  `normal` (offset-position only).

### Grammar B — lenient `<bg-position>` (CSS Backgrounds 3): background-position

The edge branch keeps the **older, richer** form — `center` is admitted and
offsets are optional:

```
[ center | [ left | right ] <length-percentage>? ] && [ center | [ top | bottom ] <length-percentage>? ]
```

So 3-value forms like `center top 8px`, `left 10px center`, `right 11% bottom` are
all **valid** for background-position (and the valid test confirms it). The invalid
cases all share one defect: a **bare `<length-percentage>` standing alone** as a
component in the edge form (`1% center 2px`, `right 7% 50%`, `100% top 14%`) — in
the edge branch a length-percentage may only be an *offset following an edge
keyword*, never a free-standing component. `_parsePosition` already enforces that.

---

## The work (pure JS, `bootstrap.js`, NO new Rust)

### 1. Tightened `_isPosLP` — the root-cause `<length-percentage>` fix (shared)

`_isPosLP` previously treated **any** dimension as a length-percentage
(`/\d/ && number+optional-unit`), so `30deg` was wrongly admitted as a position
component. Now a token with a unit is a `<length-percentage>` only if that unit is
a **length** unit (`_LEN_UNIT_RE` + container/viewport units `cq*`/`sv*`/`lv*`/`dv*`)
or `%`; bare numbers (incl. `0`) and math fns still pass. This is the root-cause
fix — an angle/time/resolution in a `<position>` slot is invalid for *every*
consumer (object/background/mask/offset/gradient), and every gradient call-site
already means "a length-percentage radius/size" by it.

### 2. `_STRICT_POSITION_PROPS` → a Map, `_isValidStrictPosition` made layer-aware

`_STRICT_POSITION_PROPS` became a `Map<prop, extraKeywordSet|null>`:

```
object-position → null            mask-position   → null
offset-anchor   → {auto}          offset-position → {auto, normal}
```

`_isValidStrictPosition(value, extraKw)` now **splits on top-level commas**
(`mask-position` admits multi-layer values like `bottom left, right 20%`), exempts
a layer equal to a property-specific keyword (`auto`/`normal`), keeps the
3-token-is-invalid guard, and validates each remaining layer with `_parsePosition`.

### 3. `_isValidBgPosition` + `_BG_POSITION_PROPS` — the lenient gate

`background-position` gets its own gate: per top-level-comma layer, valid ⇔
`_parsePosition` returns non-null. **No** 3-token guard — the lenient `<bg-position>`
3-value center forms are legal, and `_parsePosition` already parses them.

All three wired into **both** specified paths (`_parseStyleDecls` + `setProperty`).

---

## Caps

**None.** Every subtest in every targeted test passes.

## Zero-regression sweep (all held)

The risky change is the shared `_isPosLP` (touched by object/background/mask/offset
**and gradients**); the sweep exercises every consumer:

- **Valid counterparts:** background-position-valid 31/31, mask-position-valid 23/23,
  offset-anchor-valid 11/11, offset-position-valid 12/12, object-position-valid
  18/18 + invalid 13/13 + computed 16/16.
- **Gradients (the `_isPosLP` consumers):** gradient-position-valid 18/18 +
  computed 43/43, gradient-interpolation-method-valid 1398/1398.
- **Held realm:** serialize-values 696/697 (lone pre-existing cap),
  color-computed-relative-color 1163/1169 (known caps), transform-origin-valid
  16/16, perspective-origin-valid 18/18, DOMTokenList-stringifier 1/1,
  classlist 1420/1420, createElement 147/147; `cargo test -p obscura-dom --lib` 40/40.

## Next leverage

- **The remaining `css/css-transforms/parsing` tail** — `translate`/`scale`/`rotate`
  valid/computed are green (#86); check `*-computed` siblings for object-position-style
  computed gates not yet measured.
- **`offset-rotate` / `offset-path` / `offset-distance` parsing** (css/motion) — the
  sibling motion properties; measure first.
- **`background-position-x` / `background-position-y`** longhands — a narrower
  single-axis `<bg-position>` grammar; likely a small spill-over.
- The standing colour leverage is unchanged (see scroll #87): `light-dark()`
  computed, `var()`/`sibling-index()` computed, generalizing `_canonMathExpr` to the
  generic value path, `none`-component structured storage.
- A fresh realm.
