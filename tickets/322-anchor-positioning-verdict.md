# 🏰 Scroll #322–#324 — The Anchor-Positioning Verdict

> **Realm:** `css/css-anchor-position/` — `position-area` property (parsing + computed) +
> the `anchor()` value function on inset properties.
> **Hold:** `position-area-parsing` 325→**2125**, `position-area-computed` 0→**633**,
> `anchor-parse-valid` 0→**2353**. **+4786, ZERO regressions.** ONE commit.

## The gap

#321's next-leverage was "scout a FRESH `css/*/parsing/` dir — the pure-JS selectors
veins are mined." A wide baseline sweep (css-text, css-ui, css-lists, css-overflow,
css-transforms, css-sizing, filter-effects, css-masking, css-position — valid AND
computed AND newest/tentative features) confirmed the whole CSS parsing surface is
saturated. The exception was the **NEW `css/css-anchor-position/` realm**, which hid
three fat veins:

| File | Baseline | Why it was failing |
|------|:--------:|--------------------|
| `position-area-parsing.html` | 325/2125 | `position-area` was **raw-store** — the 325 passes were input==output coincidences (singles + pairs whose canonical order already matched the input). |
| `position-area-computed.html` | 0/633 | No computed reduction — logical keywords must reduce to their ambiguous short form. |
| `anchor-parse-valid.html` | 0/2359 | The inset props explicitly **reject** the `anchor()` function. |
| `anchor-size-parse-valid.html` | 0/4305 | Same, for `anchor-size()` — **deferred** (next quest). |

## The work

### #322 — `position-area` parsing (325→2125, +1800)
A `_canonPositionArea` canonicalizer already existed (built for `position-try-fallbacks`)
but was never wired to the property AND had two bugs:
- **Redundant `span-all` never dropped.** `span-all` is the whole-axis default filler, so
  it drops when paired with a definite keyword (`left span-all` → `left`); `center` is a
  real position and is kept. Added the drop, gated to the physical/logical/self systems
  (the `start/end` system keeps `span-all` in the specified value).
- **Old-draft keyword spellings.** The physical-axis sets used `x-self-start`/`y-self-start`;
  the current spec + WPT use `self-x-start`/`self-y-start`. Corrected both sets.

Then wired `position-area` into `_canonCssUi` (`none | <position-area>`), added it to
`_CSSUI_VALIDATED` + `_GCS_DEFAULTS` (initial `none`, not inherited).

### #323 — `position-area` computed reduction (0→633)
The computed value of a 2-keyword `position-area` reduces further:
- an unambiguous **logical/self-logical** keyword → its ambiguous short form
  (`block-start inline-end` → `start end`), and an identical resulting pair collapses
  (`block-start inline-start` → `start`);
- conversely an **ambiguous** `start/end` keyword + `span-all` resolves to a definite
  logical keyword **by slot** — first slot → block axis, second → inline axis
  (`start span-all` → `block-start`, `span-all start` → `inline-start`), dropping `span-all`.

Single keywords, physical keywords, `center`, and bare `span-all` are computed = specified.
`_computePositionArea` + three reduction maps (`_PA_LOGICAL_TO_SHORT`, `_PA_AMBIG_TO_BLOCK`,
`_PA_AMBIG_TO_INLINE`), wired into `_normComputed`.

### #324 — the `anchor()` inset function (0→2353)
`anchor( [ <anchor-name> || <anchor-side> ] , <length-percentage>? )` (CSS Anchor
Positioning 1). `<anchor-name>` = `<dashed-ident>` (optional); `<anchor-side>` = a side
keyword / `<percentage>` / percentage-typed math (required). Serialization: name FIRST,
then side, then `, <fallback>` — so `anchor(left --foo)` → `anchor(--foo left)`; the
fallback is preserved incl. a nested `anchor()`.

- `_canonAnchorFn` (+ `_canonAnchorSide`, `_ANCHOR_SIDE_KW`, `_isDashedIdent`) validates
  and canonicalizes the function.
- Accepted **only on the inset longhands** via a new `_canonInsetComp` in
  `_boxLogicalCanonFor` (`_INSET_LH` set) — margins/sizing still reject `anchor()`
  (anchor-parse-invalid asserts `margin-top: anchor(--foo top)` invalid). Both the
  setProperty and cssText-parse paths funnel through `_boxLogicalCanonFor`, so one change
  covered both.
- Guarded `_canonLengthTimeMath` from re-running the calc serializer on an `anchor(...)`
  value — it was treating `anchor(` as an unknown math function and shedding the
  fallback's inner `calc()` wrapper (`anchor(top, calc(50% + 1px))` → `anchor(top, 50% + 1px)`).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `position-area-parsing.html` | 325/2125 | **2125/2125** |
| `position-area-computed.html` | 0/633 | **633/633** |
| `anchor-parse-valid.html` | 0/2359 | **2353/2359** |
| `anchor-parse-invalid.html` | 25/25 | **25/25** (held) |

**Zero-regression sweep:** qsa 1975, classlist 1420, createElement 147, inset-valid 50,
inset-computed 20, top-valid 4, left-computed 5, bottom-invalid 3,
position-try-fallbacks-parsing 57 + -computed 24, margin-block-inline-valid 14,
width-valid 10, max-width-computed 12, flex-basis-valid 8,
calc-dimension-serialization-order 44, calc-complex-unresolved-serialize 12,
translate-parsing-valid 20, border-radius-valid 23, serialize-values 695/697,
cursor-valid 46, display-invalid 55, position-visibility-parsing 30, anchor-scope-parsing 17.

## Caps / Next

- **CAP — `anchor()` inside `calc()`/`min()`.** The 6 remaining `anchor-parse-valid` fails
  are `anchor()` nested inside a math function (`calc((anchor(--foo top) + anchor(--bar
  bottom)) / 2)`, `min(100px, 10%, anchor(--foo top), …)`). The calc parser has no
  `anchor()` leaf, so both parsing them and the calc-simplification serialization are
  deferred. (Fortunately every such case in anchor-parse-**invalid** also contains another
  error, so the CAP gives the correct verdict there — 25/25.)
- **CAP — layout.** The css-anchor-position reftests (`anchor-center-*`, `anchor-name-*`,
  `position-anchor-*`) and `position-area-computed-insets` (0/1) need real layout.
- **NEXT — `anchor-size()` (0/4305).** `anchor-size( [ <anchor-name> || <anchor-size> ]? ,
  <length-percentage>? )` on sizing (`_isValidSizeValue`) + inset + margin
  (`_canonMarginInsetComp`). Same architecture as `anchor()` — reuse `_canonAnchorFn`'s
  shape (a value-function with name-first canon + fallback). The single biggest vein left
  in the campaign.
- **Reusable:** `_canonPositionArea` (span-all drop + coordinate-system keyword groups),
  `_computePositionArea` + the reduction maps, `_canonAnchorFn`/`_canonInsetComp` (a value
  function accepted on a specific longhand set only), the `_canonLengthTimeMath` anchor-guard.
