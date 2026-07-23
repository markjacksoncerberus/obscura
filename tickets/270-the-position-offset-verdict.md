# Quest #270 — The Position-Offset Verdict

**Realm:** `css/css-position/parsing/`
**Hold before:** raw-store invalid vein — position-invalid 0/2, top/right/bottom/left-invalid 0/3 each, z-index-invalid 0/4, inset-invalid 16/22
**Hold after:** whole dir green — **+24, ZERO regressions**

## The gap

Every `-valid`/`-computed` file in `css/css-position/parsing/` already passed via
raw-store round-trip, but the offset properties had NO validation gate:

- `position` accepted `auto` / `static relative` (raw-store).
- `top`/`right`/`bottom`/`left` accepted `min-content` / bare `60` / `10px 20%` —
  they were never routed through any canon (the physical inset offsets sat outside
  both `_BOX_LOGICAL_LH` and any length-validated set).
- `z-index` accepted `none` / `10px` / `0.5` / `auto 123`.
- `inset` (+ the logical inset longhands/shorthands) accepted `calc(20deg)` — the
  shared `_canonLenPctSigned` canonicalized a math function without type-checking it,
  so an angle-typed calc slipped through as a valid `<length-percentage>`.

## The work (all `bootstrap.js`)

- **`position`** = `static | relative | absolute | sticky | fixed` → added to
  `_CSSUI_ENUM` + `_CSSUI_VALIDATED`. Computed = the lowercased keyword (identity),
  which is what position-computed already expects. Rejects `auto` and any two-keyword
  combination.
- **`z-index`** = `auto | <integer>` → a dedicated `_canonCssUi` branch (modelled on
  `orphans`/`widows` but signed, unbounded, and with an `auto` keyword). A single
  token: `auto`, else a signed integer literal (`-789` → `-789`, `0` → `0`) or a
  `<number>`-typed calc kept symbolic and folded at computed time by the existing
  `_INTEGER_COMPUTED_PROPS`. Rejects `none`, `10px`, `0.5`, `auto 123`. Added to
  `_CSSUI_VALIDATED`.
- **`top`/`right`/`bottom`/`left`** = `auto | <length-percentage>` → added to
  `_BOX_LOGICAL_LH`. `_boxLogicalCanonFor` maps every non-`padding` name (including
  these four) to `_canonMarginInsetComp` = `auto | <length-percentage>` (signed), so
  no new logic was needed. `_BOX_LOGICAL_LH` is used in exactly three places — the
  inline parser, `setProperty`, and `CSS.supports` — all validation-only, so this adds
  the invalid gate WITHOUT touching the computed / getter / removeProperty paths (top's
  computed value was, and stays, correct).
- **Shared bugfix — `_canonLenPctSigned`:** the calc branch now type-checks via
  `_mathValid(t, ['length'], allowPct ? 'length' : null)` before canonicalizing. A
  `calc(20deg)` (angle) / `calc(1s)` (time) is rejected for inset/margin offsets; a
  pure-`%` calc resolves to length when `allowPct`; a symbolic/unknown-typed calc
  (`sign(1em - 10px)`) stays accepted (`_mathValid` → true on `unknown`). This fixed
  the six `inset` `calc(20deg)` subtests (physical shorthand + logical
  longhands/shorthands all funnel through `_canonMarginInsetComp`).

## Results

| File | Before | After |
|------|:------:|:-----:|
| position-invalid.html | 0/2 | **2/2** |
| top-invalid.html | 0/3 | **3/3** |
| right-invalid.html | 0/3 | **3/3** |
| bottom-invalid.html | 0/3 | **3/3** |
| left-invalid.html | 0/3 | **3/3** |
| z-index-invalid.html | 0/4 | **4/4** |
| inset-invalid.html | 16/22 | **22/22** |

**+24.**

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697, position-valid 5/5,
position-computed 5/5, top-valid 4/4, top-computed 5/5, bottom-valid 4/4,
right-computed 5/5, z-index-valid 4/4, z-index-computed 3/3,
z-index-positioned-computed 3/3, inset-valid 50/50, inset-computed 20/20,
baseline-shift-computed 8/8, vertical-align-computed 23/23,
inset-block-inline-computed 12/12, order-computed 3/3.

The shared `_canonLenPctSigned` change was watched closely: margin-computed 7/8,
margin-invalid 6/7, margin-block-inline-computed 9/12, shape-outside-computed 31/32 —
all pre-existing documented caps (#256 unknown-property names, #245 %-needs-layout,
#238 sibling-index()), unchanged by this quest.

## Caps / Next

- **Next:** the css-page `size`/`page`/`page-orientation` vein in
  `css/css-page/parsing/` (page-invalid 0/5, page-computed 0/6, size-invalid 0/14,
  page-orientation-invalid 0/4 — all raw-store). `page` is a real element property
  (`auto | <custom-ident>`); `size` and `page-orientation` are @page DESCRIPTORS that
  must be rejected when set as element properties. `size-valid` needs real `@page`
  CSSOM rule parsing (a stylesheet with `@page { size: … }` read back via
  `cssRules[i].style.cssText`) — likely a documented cap unless @page is supported.

grep `_canonLenPctSigned` / `_BOX_LOGICAL_LH` / `z-index`.
