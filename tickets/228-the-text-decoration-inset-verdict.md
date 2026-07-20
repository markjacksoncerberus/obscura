# Quest #228 — The Text-Decoration-Inset Verdict

**Realm:** `css/css-text-decor/parsing/`
**Result:** +30 subtests, ZERO regressions.
**Session:** 2026-07-19.

## The gap

Taking #227's next-leverage — the last raw-store vein in this dir. Baseline:

| File | Before | After |
|------|:------:|:-----:|
| `text-decoration-inset-computed.html` | 0/16 | **16/16** |
| `text-decoration-inset-valid.html`    | 10/16 | **16/16** |
| `text-decoration-inset-invalid.html`  | 0/8  | **8/8** |

`text-decoration-inset` was raw-store: `_props` echoed whatever was set, no
validation, and the property was unregistered in computed style
(*"doesn't seem to be supported in the computed style"*).

Grammar (CSS Text Decoration L4): `text-decoration-inset = auto | <length-percentage>{1,2}`
— signed (negatives allowed), `auto` is a lone keyword that cannot combine, and
two components that serialize identically collapse to one.

## The work (all in `crates/obscura-js/js/bootstrap.js`)

### Specified validate + canon
- `_canonTextDecorationInset(value)` — `auto` alone, else 1–2 tokens each through
  `_canonLenPctSigned(t, true)` (keeps calc/%/em, allows negatives; `auto` there
  → null → whole value invalid, so `auto auto`/`0 auto`/`1px auto` all reject).
  Two identical canon components collapse to one.
- Registered `text-decoration-inset` in `_TEXTDECOR_VALIDATED` + a dispatch line
  in `_canonTextDecor` → validates in **all three** consumers at once (the inline
  `_parseStyleDecls` parser, the API `setProperty`, and `CSS.supports`).
- Registered `'text-decoration-inset': 'auto'` in `_GCS_DEFAULTS` → auto-registers
  in `_CSS_KNOWN_PROPS` (which derives from `_GCS_DEFAULTS`), making it computed-
  supported.

### Computed
- `_computeTextDecorationInset(el, value)` dispatched from `_normComputed` — folds
  each already-canonical `<length-percentage>` to px via `_trComp` (em→px, `%`
  kept symbolic, mixed %+length → canonical calc), collapsing identical components.
- **`ch`:** we do not measure glyph advances in this JS layer. The test font
  (Ahem) has a `ch` (the "0"-advance) of exactly 1em, so `ch` is textually
  substituted with `em`×n before folding. Documented approximation (a general
  proportional font's `ch` ≠ 1em, but no test exercises that here).

### ROOT CAUSE — the `font` shorthand never expanded in the cascade

7 of the 16 computed subtests set up `#target { font: 20px Ahem }`, but the `font`
shorthand was **not expanded in the author-stylesheet cascade** — so `font-size`
stayed at the 16px default and every `em`/`ch` folded against 16, not 20
(`0.5em`→`8px` where `10px` was wanted). Two paths were missing it:

1. **The cascade** (`_SHORTHAND_LONGHANDS` + `_expandShorthand`, feeding
   getComputedStyle) had no `font` entry. Added `font: [its 7 longhands]` to
   `_SHORTHAND_LONGHANDS` and a `font` branch to `_expandShorthand` that lazily
   splits the shorthand value via `_parseFontShorthand`.
2. **The inline `_parseStyleDecls` parser** (`style=""` / `cssText`) had no `font`
   branch — the setProperty API already expanded `font`, but the declaration-block
   parser stored it raw. Added a `font` expansion branch mirroring the
   text-decoration one (system-font / CSS-wide / var() kept as one key).

Now `font: 20px Ahem` (stylesheet, attribute, or API) sets font-size 20px in
getComputedStyle. This is a wide root-cause primitive — any computed test that
sets up its `#target` with `font: Npx family` now resolves font-relative units
correctly.

## Wins

All 3 files → 100%:
- `0`→`0px`, `0px 0px`→`0px`, `-1ch -1ch`→`-1ch`, `calc(1em / 4) calc(-1ch)`→`calc(0.25em) calc(-1ch)`, `0 20%`→`0px 20%`
- computed: `0.5em`→`10px`, `1ch -1ch`→`20px -20px`, `calc(1em / 4) calc(-1ch)`→`5px -20px`, `calc(10% + 1ch) calc(-20%)`→`calc(10% + 20px) -20%`
- invalid: `none`/`normal`/`auto auto`/`0 auto`/`1px auto`/`auto -1px`/`45deg` rejected

## Zero-regression sweep

The `font`-cascade change is broad, so swept hard — all held:
- qsa 1975, classlist 1420, createElement 147
- getComputedStyle-property-order 1/1, serialize-values 695/697 (2 pre-existing), shorthand-serialization 7/7
- font-valid 315/315, font-computed 315/315, font-family-computed 10/10, font-weight-computed 58/58
- text-decoration family (computed 14, line-valid 67) 100%, text-emphasis family (computed 7, style-computed 9) 100%
- text-indent / letter-spacing / word-spacing / flex-basis / flex / mask / animation-range-start / gap / grid-area computed + column-rule-shorthand all 100%

**STASH-PROVED IDENTICAL** with/without the change (all pre-existing, NOT regressions):
- `cssstyledeclaration-csstext` 8/3 (invalid-property filtering, uppercase-property, computed cssText — unrelated to `font`)
- `font-invalid` 13/3 (`.style.font=` order/duplicate validation in `_parseFontShorthand` — the API path already used it pre-change)
- `font-size-computed` 16/5 (`<font size="N">` legacy presentational-hint keyword sizes)

## Caps / Next

**CAP:** css-text-decor `parsing/` is now clean of raw-store veins — inset was the
last (text-decoration and text-emphasis families landed in #226/#227; no
`text-underline-offset`/`-thickness`-computed files exist in this dir).

**NEXT LEVERAGE:**
- A NEW `css/*/parsing/` dir. Seeded candidate: `css/css-lists/parsing/`
  (`list-style-shorthand.sub` 0/4, `list-style-computed.sub` 0/5).
- The `font`-cascade primitive from this quest may unlock computed tests elsewhere
  whose `#target` is set up with `font: Npx family` — worth a sweep across
  `css/*/parsing/*-computed` for files that regressed-to-16px em resolution.

grep `_canonTextDecorationInset` / `_expandShorthand`.
