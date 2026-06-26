# Quest #107 — The Bordered Expansion

**`border`/`outline` shorthands expand into their specified longhands, +40**
(session 2026-06-26, branch `engine-per-page-threads`)

## The gap

`css/css-backgrounds/parsing/border-shorthand.html` sat at **0/36** and
`css/css-ui/parsing/outline-shorthand.html` at **0/4** — the named "next leverage
#2" across scrolls #103–#106. These tests (`test_shorthand_value` from
`css/support/shorthand-testcommon.js`) do:

```js
div.style['border'] = '5px dotted blue';
assert_equals(div.style['border-top-width'], '5px');   // read the LONGHAND
assert_equals(div.style['border-image-source'], 'none'); // border resets border-image
// + round-trip each longhand, + a CSS.supports + style.length check
```

…and `test_invalid_value('border', '2px solid color-mix(42deg)')` expects the
whole declaration rejected (`getPropertyValue('border') === ''`).

The engine stored `border` as a single opaque key (set via `_BORDER_SH_PROPS` calc
canon), so `el.style.borderTopColor` read `''`. This is the **specified**-value
CSSOM (`el.style`), distinct from Quest #58's *computed*-time cascade expansion
(which already passed `variable-substitution-shorthands` 51/51 via getComputedStyle).

## Root cause

`el.style` is a `CSSStyleDeclaration` keyed by `_props`. The `offset` shorthand was
already modelled correctly: it **expands on write** into its longhands, stores only
the longhands, and reconstructs on read (`_serializeOffsetShorthand`). The box
shorthands (`margin`/`padding`) only serialize longhand→shorthand, never the reverse
— so margin's longhands didn't read back either (confirmed by CDP probe). The
border family had neither path: stored whole, never expanded.

## The fix (pure JS, additive, `bootstrap.js`) — the `offset` model

1. **`_BORDER_EXPAND`** — shorthand → ordered longhand list. `border` lists its 12
   `border-*-{width,style,color}` longhands **plus** the 5 `border-image-*` reset
   longhands; sides list 3; `border-{width,style,color}` list 4 (box-edge);
   `outline` lists `outline-{width,style,color}`.
2. **`_parseBorderSideStrict` / `_expandBorderShorthand`** — parse
   `<line-width> ‖ <line-style> ‖ <color>` VALIDATING each token (duplicate or
   unclassifiable → `null`; `color-mix(42deg)` rejected via `_isValidColor`).
   `outline-style` also accepts `auto`. `border` resets `border-image` via
   `_BORDER_IMAGE_INITIAL` (`source:none slice:100% width:1 outset:0 repeat:stretch`).
   Line-width math is folded with `_canonLineWidth` (`_canonMathExpr({canonLen:true})`)
   so `calc(calc(10px))`→`calc(10px)` — matching the pre-existing `_canonShorthandLenMath`.
3. **`_serializeBorderShorthand`** — reconstruct on read: sides must agree,
   border-image must be initial, components joined dropping initials
   (`medium`/`none`/`currentcolor`).
4. **Wiring**: `setProperty` expands (gated on `!var()` so the cascade still owns
   `border: var(--x)`); `removeProperty` clears all governed longhands;
   `getPropertyValue` returns the var()-key if present else reconstructs;
   `CSS.supports('border', v)` validates via `_expandBorderShorthand`.

The proxy needed NO change — `div.style.borderTopColor` already routes to
`getPropertyValue('border-top-color')` → the stored longhand, and
`div.style.border` → `getPropertyValue('border')` → reconstruction.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-backgrounds/parsing/border-shorthand.html` | 0/36 | **36/36** |
| `css/css-ui/parsing/outline-shorthand.html` | 0/4 | **4/4** |
| `css/css-backgrounds/parsing/border-image-source-computed.sub.html` | 9/10 | **10/10** (bonus / stale baseline) |

**+40.**

## Zero-regression sweep (all held)

- `variable-substitution-shorthands` 51/51 (the var()-cascade path — KEY, since I
  gate expansion on `!var()`); `calc-nesting` 7/8 (the border calc subtest held —
  needed the `_canonLineWidth` fold; the 1 fail is the standing `%`→used-px layout
  cap); `serialize-values` 695→**696**; `shorthand-serialization` 7/7;
  `cssstyledeclaration-csstext` 7/11; `variable-cssText` 9/11.
- `border-color-valid` 7/7, `border-width-valid` 6/6, `outline-color-valid` 2/2,
  `border-image-source-computed` 10/10; `css-ui/inheritance` 28/28 (outline),
  `css-tables/inheritance` 10/10 (border-collapse).
- css-values: `clamp-length-serialize` 50, `minmax-length-serialize` 24,
  `signs-abs-serialize` 16, `calc-dimension-serialization-order` 44,
  `calc-infinity-nan-computed` 48, `minmax-length-computed` 76,
  `round-mod-rem-computed` 227, `signs-abs-computed` 167, `hypot-pow-sqrt-invalid` 49.
- box/logical: `padding-computed` 8/13, `margin-block-inline-computed` 9/12,
  `padding-block-inline-computed` 11/16 (`%`→px caps unchanged).
- anchors: `color-valid` 17, `transform-box-invalid` 3, `classlist` 1420,
  `createElement` 147, `qsa` 1975.

## Caps / Next (ROI order)

1. **`%` → used-px against the containing block** — the standing layout cap and the
   single biggest remaining length tail (`minmax-length-percent` 0/50; the 4
   `hypot(0% + …)` rows; margin/padding/block-size `%` rows; `calc(60% - 20px)`→`100px`).
   Needs a real used value (layout).
2. **cssText recombination for `border`** — after expansion, `el.style.cssText`
   serializes the border longhands individually rather than recombining into
   `border: …` (untested today, so not a regression, but the complete CSSOM
   behaviour). Border's overlapping longhands break the box-shorthand machinery's
   "no overlaps" assumption, so it needs a dedicated recombiner in
   `_serializeDeclBlock`.
3. **`signs-abs` / `round-mod-rem`-computed em-relative tails** (167/233, 227/243) —
   no layout needed; the computed evaluator doesn't resolve every font-relative arg.
