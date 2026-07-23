# Quest #273 — The Font-Palette Computed Verdict

**Realm:** `css/css-fonts/parsing/`
**Hold before:** `font-palette` validated in setProperty but unregistered in computed — font-palette-computed 0/4
**Hold after:** font-palette-computed 4/4 — **+4, ZERO regressions**

## The gap

`font-palette` = `normal | light | dark | <palette-identifier>` (a `<dashed-ident>`,
CSS Fonts 4 §6.1). Obscura already validated it in setProperty (`_isValidFontPalette`)
and stored it, so `font-palette-valid` passed 5/5 via raw-store round-trip — but the
property was never registered as a computed value, so
`getComputedStyle(el).fontPalette` reported it unsupported and font-palette-computed
sat at 0/4 (`normal`, `light`, `dark`, `--pitchfork` all failed the
"supported in computed style" assertion).

## The work (all `bootstrap.js`)

Two one-line registrations — no new logic, the computed value is the specified
keyword/ident **verbatim** (identity):

1. `'font-palette': 'normal'` added to `_GCS_DEFAULTS` (the initial value).
2. `'font-palette'` added to `_INHERITED_PROPS` (font-palette inherits).

No `_normComputed` branch is needed: `normal`/`light`/`dark`/`--pitchfork` each
compute to themselves.

## Results

| File | Before | After |
|------|:------:|:-----:|
| font-palette-computed.html | 0/4 | **4/4** |

**+4.**

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697 (pre-existing cap),
font-computed 315/315, font-palette-valid 5/5, font-palette-invalid 4/4,
font-family-computed 10/10, font-weight-computed 58/58.

## Caps / Next

`@font-palette-values` (the at-rule) is the fattest remaining css-fonts vein —
font-palette-values-valid 11/36, font-palette-values-invalid 1/27 (~51 subtests) — but
it needs a real `@font-palette-values` at-rule CSSOM parser (descriptor parsing read
back via `document.styleSheets[…].cssRules`), a different and riskier quest type from
the value-canon vein. Named as a future frontier, not rushed.
