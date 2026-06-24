# Scroll 97 — The Sized Verdict

> *Quest #96 built the computed length/integer/time resolver, then named its own
> cheapest sequel: several length properties were **already in
> `_LENGTH_COMPUTED_PROPS`** but never registered in `_GCS_DEFAULTS`, so the test
> harness's very first gate — `property in getComputedStyle(el)` — failed before the
> resolver ever ran. This scroll registers the css-sizing + css-logical box families
> and teaches the computed engine the two rules those families need beyond plain
> length resolution: **clamp-negative-to-0** (sizing + padding) and **edge collapse**
> (the flow-relative 2-value shorthands).*

## The gap

`test_computed_value` (css/support/computed-testcommon.js) opens with two gates before
it ever compares values:

```js
assert_true(property in getComputedStyle(target), property + " doesn't seem to be supported…");
assert_true(CSS.supports(property, specified), …);
```

`property in getComputedStyle(el)` is the proxy `has` trap → `_CSS_KNOWN_PROPS`, which
is built from `Object.keys(_GCS_DEFAULTS)`. So a property absent from `_GCS_DEFAULTS`
fails the gate **even though the resolver downstream already knew how to compute it**.
`max-width`/`min-width`/`max-height`/`min-height` were in `_LENGTH_COMPUTED_PROPS` since
#96 but unregistered → `max-width-computed` 0/12, `min-width` 0/11, etc. The whole
css-logical box family (`inset-block-*`, `margin-block-*`, `padding-inline-*`, the
block/inline sizing properties, and the 2-value shorthands) was in **neither** set.

Two computed rules these families need that plain `_trComp` length resolution doesn't do:

1. **Clamp negative → 0.** Sizing (`max-width`, `min-block-size`, …) and `padding-*`
   can't be negative: `calc(10px - 0.5em)` with `font-size:40px` is `-10px`, which
   computes to `0px`. Inset and margin keep negatives (`inset-block-end: -10px`).
2. **`%` stays symbolic for the *computed* value, but the *used* value resolves.**
   The CSSOM "resolved value" rules split here, and the split is exactly the
   layout/no-layout boundary we can and can't cross:
   - **min/max sizing + inset**: resolved value *is* the computed value → `%` stays
     `%`, `calc(10% + 40px)` stays `calc(10% + 40px)`. **We pass these.**
   - **margin/padding + block/inline-size**: resolved value is the *used* value (px
     against the containing block) → `margin-block-end: 10%` → `20px`. **Needs layout
     → a cap** (px/em cases still pass).

## The work (pure JS, additive — `crates/obscura-js/js/bootstrap.js`)

1. **Registered** the css-sizing + css-logical box families in `_GCS_DEFAULTS` (spec
   initials: min-* `auto`, max-* `none`, inset `auto`, margin/padding `0px`). This
   alone clears the `property in getComputedStyle` + `CSS.supports` gates and feeds
   `_CSS_KNOWN_PROPS`.

2. **`_LENGTH_COMPUTED_PROPS`** gained the logical longhands `inset-block/inline-*`,
   `margin-block/inline-*`, `padding-block/inline-*` (route through the existing
   `_trComp` — folds math, em/rem/abs→px, `%` symbolic). Removed `min/max-width/height`
   (they move to the sizing handler below).

3. **`_CLAMP_NEG_PROPS` + `_clampNegPx`** — physical + logical `padding-*` clamp a
   resolved `-Npx` to `0px` (a no-op for `%`/`calc(%…)` which stay symbolic). Wired
   into the `_LENGTH_COMPUTED_PROPS` branch of `_normComputed`. (Bonus: also fixed the
   physical `padding-computed` `calc(10px - 0.5em)` case, 7→8.)

4. **`_SIZE_COMPUTED_PROPS` + `_computeSizeValue`** — the min/max + block/inline sizing
   family. Keywords pass (`none`/`min-content`/`max-content`/`fit-content`/`stretch`);
   `min-* auto` → `0px` (the used minimum); `fit-content(<lp>)` resolves its argument;
   else `_trComp` then clamp. `%` stays symbolic.

5. **`_SH_COMPUTED` + `_computeBoxShorthand`** — the 2-value flow-relative shorthands
   (`inset-block`, `inset-inline`, `margin-block`, `margin-inline`, `padding-block`,
   `padding-inline`) and the 4-value `inset`. `getPropertyValue` already reconstructs
   these from their longhands, so the computed value is: split (paren-aware `_wsTokens`),
   resolve each edge as its longhand type, expand to the full edge count (a single value
   duplicates), then collapse via the existing `_serializeBoxValue` (`auto auto`→`auto`,
   `10px 20px` kept).

## Results (before → after, this session)

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css-sizing/parsing/max-width-computed` | 0/12 | **12/12** | +12 |
| `css-sizing/parsing/min-width-computed` | 0/11 | **11/11** | +11 |
| `css-sizing/parsing/max-height-computed` | 0/12 | **12/12** | +12 |
| `css-sizing/parsing/min-height-computed` | 0/11 | **11/11** | +11 |
| `css-position/parsing/inset-computed` | 0/20 | **20/20** | +20 |
| `css-logical/parsing/inset-block-inline-computed` | 0/12 | **12/12** | +12 |
| `css-logical/parsing/margin-block-inline-computed` | 0/12 | **9/12** | +9 |
| `css-logical/parsing/padding-block-inline-computed` | 0/16 | **11/16** | +11 |
| `css-logical/parsing/max-block-size-computed` | 0/8 | **8/8** | +8 |
| `css-logical/parsing/max-inline-size-computed` | 0/8 | **8/8** | +8 |
| `css-logical/parsing/min-block-size-computed` | 1/9 | **8/9** | +7 |
| `css-logical/parsing/min-inline-size-computed` | 1/9 | **8/9** | +7 |
| `css-logical/parsing/block-size-computed` | 0/7 | **3/7** | +3 |
| `css-logical/parsing/inline-size-computed` | 0/7 | **3/7** | +3 |
| `css-box/parsing/padding-computed` (bonus) | 7/13 | **8/13** | +1 |

**Total: +135.**

## Zero regressions

Stash-free sweep (every number matched the #96 ledger exactly):
signs-abs-computed 163/233, round-mod-rem-computed 225/243, minmax-length-computed
76/80, minmax-integer-computed 10/10, clamp-length-computed 17/24, transform-computed
3/3, scale-parsing-computed 38/38, rotate-parsing-computed 23/23,
translate-parsing-computed 19/19, flex-basis-computed 11/12, letter-spacing-computed
7/9, word-spacing-computed 7/9, margin-computed (physical) 6/8, classlist 1420/1420,
createElement 147/147. (padding-computed physical 7→8 is an *improvement* from the new
clamp, not a regression — its 5 remaining fails are all `%`-needs-layout.)

## Caps / Next

- **`%` used-length resolution against the containing block** — the single biggest
  remaining tail across this whole campaign: `margin-block-inline` 3 caps,
  `padding-block-inline` 5 caps, `block-size`/`inline-size` 4 caps each, the `signs-abs`
  `%` rows, `minmax-length-percent`. All need real layout (a used-value, not a computed
  value). This is the deep next quest.
- **`block-size`/`inline-size` `auto`/`min-content`/`max-content`** → resolve to the
  laid-out box height/width (4 caps each) — same layout dependency.
- **`min-block-size: auto` in flex layout** → `auto` (1 cap each on min-block/inline);
  we return the block-context `0px`. Layout-context-dependent, unwinnable without layout.
- **`calc-infinity-nan-computed` 0/48** — per-property range clamp (`calc(NaN*1px)`→`0px`,
  `calc(infinity*1px)`→a finite large px); a distinct range-aware feature, still open
  from #96.
- Cheap leftovers from #96 still stand: `clamp(none, …)` ±∞ sentinel (clamp-integer 5);
  the `lh` unit in the length path; minmax 4 unbalanced-paren auto-close.
