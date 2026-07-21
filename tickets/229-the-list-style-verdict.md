# Quest #229 — The List-Style Verdict

**Region:** `css/css-lists/parsing/` (the `list-style` shorthand + its three longhands)
**Result:** +36 subtests, ZERO regressions. The whole `list-style` family → 100% (13 files).
**Session:** 2026-07-21.

## The gap

Took #228's next-leverage (the seeded `css/css-lists/parsing/` candidate). Baselined
the whole dir — the `list-style` family was raw-store/unregistered:

| File | Before | After |
|------|:------:|:-----:|
| `list-style-valid` | 5/17 | **17/17** |
| `list-style-invalid` | 0/2 | **2/2** |
| `list-style-computed.sub` | 0/5 | **5/5** |
| `list-style-shorthand.sub` | 0/4 | **4/4** |
| `list-style-type-valid` | 26/27 | **27/27** |
| `list-style-type-invalid` | 0/8 | **8/8** |
| `list-style-position-invalid` | 0/2 | **2/2** |
| `list-style-image-invalid` | 0/2 | **2/2** |
| `list-style-type-computed` | 27/27 | 27/27 (held) |
| `list-style-position-valid` / `-computed` | 2/2 / 2/2 | held |
| `list-style-image-valid` / `-computed.sub` | 3/3 / 11/11 | held |

The three longhands were in `_GCS_DEFAULTS`/`_CSS_KNOWN_PROPS` and inherited, so they
merely echoed the raw specified value — every `*-invalid` was wrongly accepted (0/N),
`symbols()` never dropped its default `symbolic`, and the `list-style` shorthand was
completely unmodelled (stored verbatim → longhands empty, no computed).

## The grammar (css-lists-3)

- **`list-style-position`** = `inside | outside` — reject `auto`, multi-value.
- **`list-style-image`** = `<image> | none` — reject `auto`, `url() none` (multi-value).
- **`list-style-type`** = `<counter-style> | <string> | none`, where
  `<counter-style> = <counter-style-name> | symbols()`.
  - `symbols()` = `symbols( <symbols-type>? <string>+ )`;
    `<symbols-type> = cyclic | numeric | alphabetic | symbolic | fixed`.
    `<image>` is **rejected** in this context (`symbols(fixed url(…))` invalid).
    Minimum symbols: `alphabetic`/`numeric` need ≥2, the rest ≥1.
    `symbolic` (the default type) is **dropped** on serialization
    (`symbols(symbolic "s")`→`symbols("s")`).
- **`list-style`** shorthand = `<'position'> || <'image'> || <'type'>`. Canonical
  serialization drops each longhand at its initial (position `outside`, image `none`,
  type `disc`); all-initial → `outside`. A lone `none` in the shorthand sets both
  image and type to none (`inside none`→`inside none`).

## The fix (all `bootstrap.js`, mirroring the text-emphasis shorthand template)

New `_LISTSTYLE_VALIDATED` set + `_canonListStyleLonghand` dispatch over
`_canonListStylePosition` / `_canonListStyleImage` (validates single-`<image>`, then
canonicalizes via the existing `_canonImageSet(_canonGradients(…))`) /
`_canonListStyleType` (`_canonSymbols` for the function form, `_serCssString` for a
string, `_GRID_CI_RE` for a `<counter-style-name>` custom-ident with case preserved).

The `list-style` shorthand: `_expandListStyle` classifies each top-level token
(paren/quote-aware `_wsTokens`); a `none` is deferred and assigned to type first, then
image (both initials are `none`, so this reproduces the spec's "a single none sets
both" serialization). Wired the FIVE touch points exactly like `text-emphasis`:
- inline `_parseStyleDecls` parser + API `setProperty` expand into the three
  `_LS_LONGHANDS` in `_props` (CSS-wide/`var()` kept as one `list-style` blob key that
  clears the longhands);
- getter / `removeProperty` / getComputedStyle `resolve('list-style')` reconstruct via
  `_serListStyleFromLonghands`.
- Registered `list-style` in `_CSS_KNOWN_PROPS` + a computed `resolve()` branch; added
  the longhand + shorthand branches to `CSS.supports`.
- The `_LISTSTYLE_VALIDATED` longhand branch is placed **before** `_GRADIENT_PROPS`
  (which holds `list-style-image` but would accept `auto`/a comma layer list) in both
  the inline parser and API setProperty — same pattern as `border-image-source`.

**Bonus (the last valid fail): hex gradient stop-colors.** `disc radial-gradient(circle,
#006, #00a 90%, …) inside` expected `rgb(0, 0, 102)` etc. — the SHARED
`_canonGradientStopSpecified` deliberately left every stop colour verbatim. Made a
**surgical** change: canonicalize only a *leading hex* stop colour to `rgb()`
(`#006`→`rgb(0, 0, 102)`), leaving named/function colours byte-verbatim. Zero blast
radius — stash-checked the 1398-subtest `gradient-interpolation-method-valid` (uses
only `red`/`blue`/`color(srgb 1 0 0)`) held at 1398/1398, and no passing background/mask
gradient test uses hex stops.

## Wins (examples)

`disc outside none`→`outside`, `none`→`none`, `inside none`→`inside none`,
`none url("…")`→`url("…") none`, `square url("…") inside`→`inside url("…") square`,
`square linear-gradient(red,blue) inside`→`inside linear-gradient(red, blue) square`;
computed `outside none none`→`none`, `outside url("…") disc`→`url("…")`;
`symbols(symbolic "string")`→`symbols("string")`; rejected `inside disc outside`,
`square circle`, `list-style-position: auto`, `list-style-image: auto`,
`symbols(cyclic)`, `symbols(numeric "n")`, `symbols(fixed url(…))`.

## +36, ZERO regressions

qsa 1975, classlist 1420, DOMTokenList-value 1/1, serialize-values 695/697 (2
pre-existing), shorthand-serialization 7/7, getComputedStyle-property-order 1/1 (the
registered `list-style` shorthand didn't disturb enumeration), text-decoration-valid
17/17, text-emphasis-computed 7/7, column-rule-shorthand 12/12, flex-computed 14/14,
mask-computed 32/32 held. Gradient sweep: gradient-interpolation-method-valid
1398/1398, gradient-position-valid 18/18, image-function-valid 13/13,
conic-gradient-calc 6/6, background-image-valid 13/13, background-valid 45/46 (the 1
fail is pre-existing — confirmed by baseline before the change).

## Caps / Next

- **CAP:** the `list-style` family is now clean of raw-store veins (all 13 files 100%).
- **NEXT LEVERAGE:** the sibling `counter-*` family in the SAME dir is the next
  raw-store vein — `counter-reset-valid` 11/16, `counter-increment-computed` 5/10,
  plus `counter-set`/`counter-increment`/`counter-reset` `-valid`/`-invalid`/`-computed`
  (grammar `[ <counter-name> <integer>? ]+ | none`, computed folds the integer). I
  never touch those names, so their current fails are pre-existing, not regressions.
  Alternatively a NEW `css/*/parsing/` dir. grep `_expandListStyle`.
