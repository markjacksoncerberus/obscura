# Quest #87 — The Warded Verdict

> *Six gates stood unguarded. Every invalid traveller — `1px left`, `auto`,
> `margin-box`, `80%`, `center left 1px` — strolled straight through and was
> waved into the kingdom as if it belonged. This quest raised the wards: the
> grammar gates that turn an invalid value away at the door (CSSOM: an invalid
> declaration is dropped, leaving the property untouched).*

**Realm:** `css/css-transforms/parsing/*-invalid` (5 tests) + the adjacent
`css/css-images/parsing/object-position-invalid` (1 test, a clean spill-over of
the same root-cause fix).

**Result: +43, all six tests → 100%, ZERO caps, ZERO regressions.**

| Test | Before | After |
|------|:------:|:-----:|
| `css-transforms/parsing/transform-origin-invalid.html` | 0/10 | **10/10** |
| `css-transforms/parsing/perspective-origin-invalid.html` | 0/12 | **12/12** |
| `css-transforms/parsing/perspective-invalid.html` | 0/3 | **3/3** |
| `css-transforms/parsing/transform-box-invalid.html` | 0/3 | **3/3** |
| `css-transforms/parsing/backface-visibility-invalid.html` | 0/2 | **2/2** |
| `css-images/parsing/object-position-invalid.html` | 0/13 | **13/13** |

---

## The gap

Every one of these properties already serialized its **valid** and **computed**
forms correctly (transform-origin-valid 16/16 + computed 23/23, perspective-origin
18/18 + 21/21, backface-visibility-valid 2/2, transform-box-valid 5/5,
object-position-valid 18/18 + computed 16/16). The single missing piece was the
**invalid-rejection gate**: an out-of-grammar value was stored verbatim instead of
being dropped, so `test_invalid_value()` (which asserts the property comes back
empty) failed across the board.

Two distinct sub-gaps:

1. **The origin / strict-`<position>` reorder bug.** The shared 2-value
   `<position>` parser (`_parsePosition`, and its origin sibling `_parseOriginPos`)
   reordered components to horizontal-first *whenever a keyword indicated an axis*
   — even when one component was a bare `<length-percentage>`. That wrongly
   accepted `1px left` (→ `left 1px`) and `top 1px` (→ `1px top`). Per CSS Values
   `<position>`, reordering (vertical-first like `top left`) is admitted **only in
   the keyword-pair form**; once a `<length-percentage>` is present the order is
   fixed **horizontal-then-vertical**, so a wrong-axis keyword in either slot is
   invalid.

2. **Three properties never registered at all** — `perspective`, `transform-box`,
   `backface-visibility` had no validation, no canon, nothing. Their valid forms
   happened to serialize verbatim (single keyword / already-canonical length), so
   the valid tests passed by accident; the invalid tests had nothing to reject them.

---

## The work (pure JS, `bootstrap.js`, NO new Rust)

### 1. Fixed the 2-value `<position>` reorder (root-cause, shared)
In both `_parsePosition` and `_parseOriginPos`, the 2-component branch now only
reorders when **both** components are keywords; a `<length-percentage>` pins the
H-then-V order, after which the existing axis-conflict guard rejects a wrong-axis
keyword (`1px left` → `v=left` is horizontal → null; `top 1px` → `h=top` is
vertical → null). This is semantics-preserving for every valid form — it only
*rejects* values that were invalid per spec all along (verified: background/object/
gradient/offset-position valid + computed all unchanged).

### 2. `_isValidOrigin(kebab, value)` — the origin gate
var() and the CSS-wide keywords (`inherit`/`initial`/`unset`/`revert`/…) are
exempt (resolved/handled later). For `perspective-origin` an explicit **3-token
guard** rejects the legacy 3-value form (`center left 1px`) — strict `<position>`
has no 3-value syntax, even though the lenient parser tolerates it for
`background-position`. Otherwise: valid ⇔ `_parseOrigin` returns non-null. Wired
into both specified paths (`_parseStyleDecls` + `setProperty`).

### 3. `_isValidSimpleTransform(name, value)` — the keyword/length gates
- `transform-box`: `content-box | border-box | fill-box | stroke-box | view-box`.
- `backface-visibility`: `visible | hidden`.
- `perspective`: `none | <length [0,∞]>` — `_isValidPerspective` accepts `none`,
  var()/calc() (resolved later), a unitless `0`, or a real `<length>` unit
  (`_trLenUnit`, which rejects `%` and bare numbers) that is non-negative. So
  `1000` (no unit), `-1px` (negative), `80%` (percentage) are all dropped.

var() and CSS-wide keywords exempt. Wired into both specified paths.

### 4. `_isValidStrictPosition(value)` — the object-position spill-over (+13)
`object-position` is strict `<position>` (unlike `background-position` /
`mask-position`, which keep the legacy 3-value `<bg-position>` form). Same 3-token
guard + `_parsePosition` gate as perspective-origin. Gated **only**
`object-position` (the `_STRICT_POSITION_PROPS` set) — `offset-anchor` /
`offset-position` are left ungated because they admit extra `auto`/`normal`
keywords and have no invalid-value test here to satisfy; leaving them untouched
keeps their behaviour (and their passing valid/computed tests) exactly as-is.

---

## Caps

**None.** Every subtest in every targeted test passes.

## Zero-regression sweep (all held)

serialize-values 696/697 (the lone pre-existing cap), transform-origin-valid
16/16 + computed 23/23, perspective-origin-valid 18/18 + computed 21/21,
transform-box-valid 5/5, backface-visibility-valid 2/2, transform-valid 42/42 +
computed 3/3 + invalid 20/20, scale/translate-parsing-valid 32/32 + 20/20,
**background-position-valid 31/31 + computed 32/32**, **object-position-valid
18/18 + computed 16/16**, **gradient-position-valid 18/18 + computed 43/43**,
**offset-anchor-parsing-valid 11/11 + computed 14/14**, **offset-position-parsing-valid
12/12 + computed 15/15**, color-valid 17/17, color-computed-relative-color
1163/1169 (known caps), classlist 1420/1420, createElement 147/147;
`cargo test -p obscura-dom --lib` 40/40.

The shared `_parsePosition` change is the only thing that touched a hot path; the
sweep above exercises every one of its consumers (object/background/gradient/
offset-position) and all stay byte-identical on valid/computed.

## Next leverage

- **`background-position-invalid` 0/11 / `mask-position-invalid`** — the same gate
  idea, but `<bg-position>` is the *legacy* grammar (3- and 4-value forms allowed
  with their own quirks: e.g. `top top` invalid, `center center center` invalid).
  Needs a dedicated `<bg-position>` validator, not the strict `<position>` one.
- **`offset-anchor-parsing-invalid` / `offset-position-parsing-invalid`** — would
  reuse `_isValidStrictPosition` plus the `auto`/`normal` (and for offset-position,
  `normal`-vs-`auto`) keyword exemptions; measure first.
- The standing colour leverage is unchanged (see scroll #86): `light-dark()`
  computed, `var()`/`sibling-index()` computed, generalizing `_canonMathExpr` to
  the generic value path, `none`-component structured storage.
- A fresh realm.
