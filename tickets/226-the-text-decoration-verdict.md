# 🏛️ Quest #226 — The Text-Decoration Verdict

**Realm:** `css/css-text-decor/parsing/`
**Result:** +92, ZERO regressions (session 2026-07-18)
**Files:** `crates/obscura-js/js/bootstrap.js`

## The gap

Took #225's next-leverage (a NEW `css/*/parsing/` dir). Baselined
`css/css-text-decor/parsing/` and found the whole `text-decoration` family
raw-store / unregistered — the `text-decoration-line` longhand never
canonicalized its `||` keyword order, `text-decoration-thickness` was unknown to
the engine, and the `text-decoration` shorthand + its computed style were not
modelled at all:

| Test | Baseline |
|------|:--------:|
| text-decoration-line-valid | 18/67 |
| text-decoration-line-invalid | 0/14 |
| text-decoration-shorthand | 0/5 |
| text-decoration-computed | 0/14 |
| text-decoration-valid | 10/17 |
| text-decoration-invalid | 0/3 |

The `text-decoration-line-valid` file alone had 49 fails, all the same shape:
`overline underline` should serialize canonically as `underline overline`. The
grammar is `none | [ underline || overline || line-through || blink ] |
spelling-error | grammar-error`, and the canonical serialization is the fixed
source order `underline overline line-through blink` regardless of input order.

## The work

All in `bootstrap.js`, mirroring the flex / border shorthand-expansion templates.

**Longhands.** New `_canonTextDecorationLine` (fixed-order canon; `none` /
`spelling-error` / `grammar-error` may not combine with anything; duplicate
keywords and unknown tokens rejected) and `_canonTextDecorationThickness`
(`auto | from-font | <length-percentage>`), dispatched through a new
`_TEXTDECOR_VALIDATED` set from three places: the API `setProperty`, the inline
`_parseStyleDecls` parser (the `style=""` / `cssText` path stores straight into
`_props`, so it needs its own validation), and the `CSS.supports` switch.
Registered `text-decoration-thickness: auto` in `_GCS_DEFAULTS` (→ known to
`_CSS_KNOWN_PROPS` / computed style; it does not inherit).

**Shorthand.** `text-decoration = <line> || <style> || <color> || <thickness>`
(CSS Text Decoration L4 — the WPT test covers `from-font`, so thickness is in the
shorthand). `_expandTextDecoration` classifies each token as a line keyword, a
`<style>` keyword (solid/double/dotted/dashed/wavy), a `<color>`, or a thickness,
and enforces that the line keywords form a **single contiguous run** —
`overline blue underline` is invalid because the line component cannot resume
after a non-line token (a `||` component appears at most once). Wired the five
touch points exactly like `flex`:

- inline parser + API `setProperty` expand into the four `_TD_LONGHANDS`
  (`text-decoration-{line,style,color,thickness}`) in `_props`; a CSS-wide /
  `var()` value is kept as one `text-decoration` blob key that clears the
  longhands;
- the getter, `removeProperty`, and getComputedStyle reconstruct via
  `_serTextDecoration` / `_serTextDecorationFromLonghands` — component order
  line·style·thickness·color, each omitted at its initial, all-initial → `none`.

**Computed.** Registered `text-decoration` in `_CSS_KNOWN_PROPS` + a
getComputedStyle `resolve()` branch reconstructing from the **computed**
longhands. The subtlety: at computed time `text-decoration-color` resolves
`currentcolor` to the element's `color` (an rgb() value), which would wrongly
make the default colour *print*. So the branch reads the **specified** colour via
`_specifiedDecl` and, when it is the `currentcolor` initial, forces the colour
omitted (`colorInitial` flag on `_serTextDecoration`) — while a non-default colour
still resolves to rgb().

## The wins

Every one of the 6 worked files → 100%:

| Test | Before | After |
|------|:------:|:-----:|
| text-decoration-line-valid | 18/67 | **67/67** |
| text-decoration-line-invalid | 0/14 | **14/14** |
| text-decoration-shorthand | 0/5 | **5/5** |
| text-decoration-computed | 0/14 | **14/14** |
| text-decoration-valid | 10/17 | **17/17** |
| text-decoration-invalid | 0/3 | **3/3** |

Representative transforms: `overline underline`→`underline overline`;
`line-through overline underline`→`underline overline line-through`;
`double overline underline`→`underline overline double`;
`overline green from-font`→`overline from-font green`;
`underline auto`→`underline`; `rgba(10, 20, 30, 0.4) dotted`→`dotted rgba(10, 20, 30, 0.4)`;
computed `underline overline line-through red`→`… rgb(255, 0, 0)`;
computed `currentcolor` / `auto` / `solid`→`none`.

Rejections: `none underline` (none can't combine), `underline underline`
(duplicate), `spelling-error grammar-error`, `double overline underline dotted`
(two styles), `red line-through green` (two colours), `overline blue underline`
(interrupted line run).

**+92, ZERO regressions.**

## Zero-regression sweep

qsa 1975, DOMTokenList-value 1/1, getComputedStyle-property-order 1/1 (the +1
registered shorthand did not disturb enumeration), serialize-values 695/697 (2
pre-existing), flex-computed 14/14, column-rule-shorthand 12/12,
transition-shorthand 18/18, animation-shorthand 36/36, grid-area-computed 35/35,
tab-size-computed 10/10, inset-computed 20/20, mask-computed 32/32 held. In-dir:
text-decoration-line-computed 18/18, text-decoration-style-computed/-valid 5/5,
text-decoration-color-valid/-invalid 3/3 + 4/4 held.

Because the change touches the shared inline `_parseStyleDecls` parser, I
**stash-proved** `domparsing/style_attribute_html` scored 2/4 both with and
without the change — its two fails (invalid `color: :` declaration parsing +
`background-color` style-attribute reflection) are pre-existing and unrelated.

## Caps / Next

- **CAP:** `text-decoration-color-computed` 2/3 — a pre-existing
  `inherit`-not-supported bug on `text-decoration-color` (untouched here).
  `text-decoration-inset-*` is a SEPARATE property (`auto | <length>{1,2}`), still
  raw-store (10/16 valid). `text-emphasis-position-valid` 4/5 pre-existing.
- **NEXT LEVERAGE:** the sibling **`text-emphasis` family** in the same dir —
  `text-emphasis-computed` 0/7, `text-emphasis-style-computed`, and the
  `text-emphasis` shorthand (`<'text-emphasis-style'> || <'text-emphasis-color'>`,
  with `text-emphasis-style = [ filled | open ] || [ dot | circle | double-circle
  | triangle | sesame ] | <string> | none`) — all unregistered in computed style
  exactly like `text-decoration` was, the same machinery.
- Adjacent one-quest lever: **`text-decoration-inset`** as its own
  `auto | <length>{1,2}` validated longhand (10/16 valid — a clean small vein).
- OR a NEW `css/*/parsing/` dir (`css/css-lists/parsing/` —
  `list-style-shorthand.sub` 0/4, `list-style-computed.sub` 0/5).

grep `_expandTextDecoration`.
