# ⚔️ Quest #61 — The Positioned Verdict

> *A CSS `<position>` value serializer — specified + computed — for*
> *`object-position` and `background-position`. The first reusable value-type*
> *engine of the serialization frontier: one primitive, four tests, +60.*

**Status:** ✅ SECURED — +60 (session 2026-06-21)
**Realm:** `css/css-images/parsing/{object-position}` + `css/css-backgrounds/parsing/{background-position}`
**Difficulty:** ⚔️⚔️
**Took:** #60's "next leverage (2)" lineage — a self-contained value-type serializer
(the campaign's favourite shape: one small correct primitive unlocking a wide tail).

---

## The gap

The whole `css/*/parsing/*-valid.html` + `*-computed.html` family reads the
serialization of a property's value back off `el.style[idl]` (specified) and
`getComputedStyle(el)[idl]` (computed). Obscura stored position-valued properties
**verbatim** (only `_canonStandardValue`'s numeric-token canon applied), so:

| Test | Before |
|------|:------:|
| `object-position-valid` | 11/18 |
| `object-position-computed` | 1/16 |
| `background-position-valid` | 23/31 |
| `background-position-computed` | 2/32 |

The simple values (`-2% -3%`, `20% 0%`) passed by luck of verbatim storage; every
case needing **canonical reordering, axis defaulting, or keyword→percentage
resolution** failed:

- **Specified** (`*-valid`): `bottom right` → `right bottom` (horizontal first),
  `top` → `center top` (fill omitted axis), `10%` → `10% center`,
  `bottom 10% right 20%` → `right 20% bottom 10%` (reorder edge-offset pairs),
  `center right 7%` → `right 7% center`.
- **Computed** (`*-computed`): `right bottom` → `100% 100%`, `left center` →
  `0% 50%`, `right 30% top 60px` → `70% 60px`, `right -18px` →
  `calc(100% + 18px)`, `center right 7%` → `93% 50%`.

## The CSS `<position>` grammar (the engine)

A `<position>` is 1–4 tokens with the two axes in either order:

```
<position> = [
  [ left | center | right | top | bottom | <length-percentage> ]                  (1 token)
| [ left | center | right | <length-percentage> ]
  [ top | center | bottom | <length-percentage> ]                                 (2 tokens)
| [ center | [ left | right ] <length-percentage>? ] &&
  [ center | [ top | bottom ] <length-percentage>? ]                              (3–4 tokens)
]
```

**KEY subtlety that drives the parser** — an offset attaches to an edge keyword
**only in the 3/4-token edge-offset form**. In the 1/2-token form `right 40%` is
**two independent components** (H:`right`=100%, V:`40%`), *not* `right` with a 40%
offset (which would compute to 60%). The expected computed value `right 40%` →
`100% 40%` (not `60% …`) is what nails this down.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

A single `<position>` engine inserted before `_normComputed`, plus two store-time
hooks and one computed hook. Scoped to `_POSITION_PROPS = {object-position,
background-position}`.

1. **`_parsePosition(value)`** → `{ h, v }` (each component `{kw?, off?, lp?}`), or
   `null` for anything that isn't a position. Token-count-dependent: ≤2 tokens →
   each is a lone keyword/`<length-percentage>`; 3–4 → the edge-offset form
   (greedily attach an offset to each edge keyword; `center` never takes one).
   Then assign components to axes: a `top`/`bottom` first component or a
   `left`/`right` second component forces a **swap** to horizontal-first; an axis
   conflict (`left` in the vertical slot, etc.) rejects.

2. **`_serializePositionSpecified(value)`** (specified `*-valid`) — per
   comma-separated layer (`_commaSplitTop`), serialize `H V` retaining edge
   keywords (`right 7%`, `center`, `40px`). A layer that fails to parse is left
   untouched (never corrupt an unexpected value). Wired into **`setProperty`** and
   **`_parseStyleDecls`** right after `_canonStandardValue`.

3. **`_serializePositionComputed(el, value)`** (computed `*-computed`) — keywords →
   percentages (`left`/`top`=0%, `center`=50%, `right`/`bottom`=100%); an edge
   offset from `right`/`bottom` → `100% − off` (percentage) or `calc(100% ∓ off)`
   (length, a negative sign folded into `+`: `right -18px` → `calc(100% + 18px)`);
   a bare `<length-percentage>` passes through (percentage/px) or resolves to px
   (em/calc). A `calc()` **mixing a percentage with a length** (`calc(100% - 20px)`)
   can't resolve without layout, so it's kept as canonical calc — which is exactly
   what makes the second-pass **round-trip** assertion hold. Wired into
   **`_normComputed`**.

4. **`_evalMath` `opts.emPx`** — `em` offsets resolve against the element's
   **computed font-size** (the test puts the target in `#target { font-size: 40px }`,
   so `calc(10px + 0.5em)` → `30px`). The default `_LENGTH_PX` table assumes
   em = 16px; the new option overrides it (rem stays root-relative). `emPx` is read
   once per computed call via `_computedPropOf(el, 'font-size')`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `object-position-valid` | 11/18 | **18/18** ✅ |
| `object-position-computed` | 1/16 | **16/16** ✅ |
| `background-position-valid` | 23/31 | **31/31** ✅ |
| `background-position-computed` | 2/32 | **32/32** ✅ |

**+60. ZERO regressions.**

## Zero-regression sweep

The hot-path risk was `serialize-values` (695/697), which generates
`background-position` as **horizontal-then-vertical-ordered** combinations
(H ∈ {%, length, left, center, right}, V ∈ {%, length, top, center, bottom}) and
expects `H.expected + ' ' + V.expected`. For those inputs the first component is
never a vertical keyword and the second never horizontal, so the reorder swap never
fires → output is byte-identical to the old verbatim path. `inherit`/CSS-wide
keywords parse-fail → passthrough. Verified held: serialize-values **695**,
cssstyledeclaration-csstext **7**, variable-substitution-background-properties **8**
(`background-position: var(--foo)` with `--foo: 0% 50%` → `0% 50%`), -shorthands
**51**, -filters **7**, -definition **71**, inherit-initial **4**; color-computed
**16**, -rgb **95**, opacity-computed **30**, css-color/inheritance **4**; css-text
**42**, css-fonts **39**, css-flexbox **20**, css-scroll-snap **38** inheritance;
Element-matches **669**, Document-createElement **147**, valid-invalid **30**;
obscura-dom unit **40/40**. (`qsa` is a wpt.live HTTP 404 right now — `bodyLen=42`,
curl-confirmed — not a regression.)

## Caps (honest) / Next

- **Gradient `at <position>`** is the natural follow-up and reuses this exact
  engine: `gradient-position-valid` (14/18) + `gradient-position-computed`
  (**0/43**) put `at <position>` inside `radial-gradient(...)`/`conic-gradient(...)`.
  The specified side needs only gradient-param parsing to reach the `at` clause and
  canonicalize the position (~+4). The **computed** side (43) additionally needs
  colour computation of the stops (`red` → `rgb(255, 0, 0)`) and dropping the
  default `at center center` (→ omit the `at` clause) — i.e. the **standing #57
  gradient-canonicalization cap**. This is the single widest unopened tail adjacent
  to here.
- **Other `<position>`-shaped properties** — `perspective-origin`,
  `transform-origin`, `mask-position`, `offset-anchor`/`offset-position` all share
  this grammar; add them to `_POSITION_PROPS` once their `-valid`/`-computed` rows
  are baselined (each likely a handful of greens for free).
- **Background-position physical axes** — `background-position-x`/`-y` aren't
  modelled in `_GCS_DEFAULTS` (the longhands the `background-position` shorthand
  decomposes into); their own `*-valid`/`*-computed` tests would need them
  registered + a single-axis position serializer.

**NEXT LEVERAGE:** (1) **gradient `at <position>` + gradient canonicalization** —
reuses this engine, opens `gradient-position-{valid,computed}` (47) and closes #57's
2 gradient caps + is foundational for `background-image`/`mask-image` computed; (2)
**more `<position>` properties** (`transform-origin`/`perspective-origin`/
`mask-position`); (3) the comprehensive **valid-property registry** (csstext
unknown-property drop + per-property validation — serialize-values hot-path risk);
(4) a fresh realm.
