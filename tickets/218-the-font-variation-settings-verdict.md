# Quest #218 — The Font-Variation-Settings Verdict

**Realm:** `css/css-fonts/parsing/font-variation-settings-{invalid,valid,computed}.html`
**Hold:** `-invalid` 0/18 → **18/18** ✅ · `-valid` 6/7 → **7/7** ✅ · `-computed` 4/8 → **8/8** ✅
**Total:** **+23, ZERO regressions**
**Session:** 2026-07-18

## The gap

Baselined the `css-fonts/parsing/` dir for un-worked veins after #217's
next-leverage pointer. `font-variation-settings-invalid` was **0/18** — the
raw-store tell: the property was NOT in `_FONT_VALIDATED`/`_canonFont`, so
setProperty stored whatever it was given (`test_invalid_value` expects
`.style` to stay empty). Alongside it, `-valid` 6/7 (only the number
canonicalization case `1e3`→`1000` failed) and `-computed` 4/8 (dedup/sort/calc
cases failed — computed returned the value verbatim).

The grammar is `normal | [ <opentype-tag> <number> ]#`. This is EXACTLY
`font-feature-settings` (already fully handled, computed 10/10) with ONE
difference:

| | feature-settings | variation-settings |
|---|---|---|
| value | `[ <integer [0,∞]> \| on \| off ]?` (optional; default 1) | `<number>` (REQUIRED) |
| computed value | rounded integer | float, kept as-is |

`<opentype-tag>` is identical in both: a `<string>` of exactly four
0x20–0x7E characters, serialized as a CSSOM string.

## The work (`crates/obscura-js/js/bootstrap.js`, beside `_computeFontFeatureSettings` ~18230)

Three helpers mirroring the feature-settings trio:

1. **`_parseVariationTag(part)`** — parses one `<opentype-tag> <number>` pair to
   `{ tag, val }` or `null`. The tag: match a `"…"`/`'…'` string, `_unescapeIdent`
   it, require length 4 and every codepoint in 0x20–0x7E. The value (required):
   a `<number>` regex (`[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?`) → `parseFloat`; OR a
   math function that folds to a **unitless** number (`_calcConstValue(rest).u === ''`)
   → kept symbolic (folded at computed time). A length/percentage calc
   (`calc(100px)`, `calc(100%)`) has a non-empty `.u` → rejected.

2. **`_canonFontVariationSettings(v)`** — SPECIFIED canon. `normal`→`normal`;
   else map each `_commaSplitQuoted` part through `_parseVariationTag`, serializing
   the tag via `_serCssString` and the value via `_serNumber` (or `_canonMathExpr`
   for a calc). Order is PRESERVED (specified is not sorted). Any `null` part → the
   whole declaration is invalid.

3. **`_computeFontVariationSettings(el, v)`** — COMPUTED. Fold each calc value
   (`_evalMath`), collect into a `Map` keyed by tag (last write wins = dedup
   keeping the rightmost), then emit tags in codepoint order (`[...map.keys()].sort()`).
   The value is NOT rounded (unlike feature-settings).

Wired in three places:
- `_canonFont` dispatch (~17931): `font-variation-settings` → `_canonFontVariationSettings`.
- `_FONT_VALIDATED` set: added `font-variation-settings` (so setProperty validates &
  canonicalizes; invalid → ignored; CSS-wide/var pass through).
- getComputedStyle dispatch (~18561): `font-variation-settings` → `_computeFontVariationSettings`.

## Results

| Test | Before | After |
|---|:---:|:---:|
| `font-variation-settings-invalid` | 0/18 | **18/18** |
| `font-variation-settings-valid` | 6/7 | **7/7** |
| `font-variation-settings-computed` | 4/8 | **8/8** |

Representative cases:
- `'wght' 1e3, 'slnt' -450.0e-1` → `"wght" 1000, "slnt" -45` (number canon, single→double quotes)
- invalid: `700` (no tag), `"XHGT"` (no value), `"wgt" 700` (3-char), `"XHGTX" 0.7` (5-char),
  `"abc\1F"`/`"abc\7F"`/`"abc\A9"` (out-of-range codepoint), `'wght' 100px`, `'wght' 42%`,
  `'wght' calc(100px + 200px)`, `'wght' calc(100%)`, `'wght' 200, ` (trailing comma), `'abcd" 123` (mismatched quotes)
- computed dedup: `"wght" 700, "wght" 500` → `"wght" 500`
- computed sort: `"wght" 100, "wdth" 200` → `"wdth" 200, "wght" 100`
- computed fold: `"XHGT" calc(0.4 + 0.3)` → `"XHGT" 0.7`

## Zero-regression sweep

feature-settings computed 10/10, valid 10/10, invalid 5/5; font-computed 315/315,
font-valid 315/315; serialize-values 695/697 (2 pre-existing); font-variant-numeric-computed
11/11; animation-shorthand 36/36; transition-shorthand 18/18; qsa 1975; classlist 1420;
DOMTokenList-value 1/1; getComputedStyle-property-order 1/1.

## Caps / Next

- **Cap:** `font-variation-settings` has no `sign()`/em-relative computed test, so the
  calc path only exercises pure-number calc (`_calcConstValue`/`_evalMath`). A symbolic
  number-typed calc (e.g. `calc(sign(2cqw - 10px))`) would be conservatively REJECTED at
  parse time by the `_calcConstValue` foldability check — no such test exists, so this is
  a latent limitation, not a failure.
- **Next leverage:**
  1. A NEW `css/*/parsing/` dir. Most `-invalid` files are already green via generic
     setProperty rejection, so ALSO baseline the `-valid`/`-computed` files for
     canonicalization gaps (the real raw-store tell in mature dirs).
  2. The shared `<time>`-unit computed normalization: `transition-delay-computed` 0/1
     (`-500ms`→`-0.5s`, `calc(2*3s)`→`6s`) plus the `ms`→`s` gap in several
     `animation-*-computed`.
  3. The container-query-unit `sign()` fold shared by `animation-delay-computed`,
     `animation-duration-computed`, and `tab-size-computed`
     (`calc(10s + sign(2cqw - 10px)*5s)`→`5s`; cqw resolves to 0 without a container).

grep `_parseVariationTag`.
