# Quest #274 — The Legacy Font-Size Verdict

**Realm:** `css/css-fonts/parsing/`
**Hold before:** `<font size="N">` presentational attribute not mapped to any font-size — font-size-computed 16/21
**Hold after:** font-size-computed 21/21 — **+5, ZERO regressions**

## The gap

font-size-computed compares `getComputedStyle(<font size="N">).fontSize` against
`getComputedStyle(target).fontSize` where `target.style.fontSize` is set to the
matching keyword (`size="2"` ↔ `small`, `"4"` ↔ `large`, …). The keyword side already
computed correctly (`small`→13px), but the `<font>` element's `size` attribute was
ignored entirely, so it stayed at the default `medium` (16px):

- `<font size="2">` → expected 13px (small), got 16px.
- `<font size="4">` → expected 18px (large), got 16px.
- …through `size="7"` → expected 48px (xxx-large), got 16px.

(`size="3"`↔`medium` passed by coincidence — the unmapped default is also 16px.)

The root cause: Obscura had **no HTML presentational-hint layer** at all. Legacy
attributes like `<font size>` map to CSS at the very bottom of the author cascade, and
nothing implemented that origin.

## The work (all `bootstrap.js`)

A minimal presentational-hint layer wired into `_buildCascade`:

- **`_parseLegacyFontSize(raw)`** — the HTML "rules for parsing a legacy font size":
  skip leading ASCII whitespace, read an optional `+`/`-` (relative-to-3), collect
  ASCII digits (none → no hint), apply the relative offset, clamp to `1..7`, and map
  via `_LEGACY_FONT_SIZE_KW` (`['x-small','small','medium','large','x-large',
  'xx-large','xxx-large']`).
- **`_presHintDecls(el)`** — returns a decls map `{ name: {value, important} }` of
  presentational hints for `el`, or `null`. Currently only `<font size>` →
  `font-size: <keyword>` (built via the shared `_expandDeclInto`). Wrapped in
  try/catch; a fast `localName === 'font'` gate means every other element short-circuits.
- **`_buildCascade`** pushes the hint (when present) as a source with **spec 0, order
  −1** — below the first author rule (order 0), so any author `font { font-size: … }`
  rule wins the same-specificity tie and inline style wins outright, while the hint
  still overrides the UA/initial value when nothing else sets font-size. The keyword
  then flows through the existing font-size computed path (`_FONT_SIZE_KEYWORDS`) to
  px.

## Results

| File | Before | After |
|------|:------:|:-----:|
| font-size-computed.html | 16/21 | **21/21** |

**+5.**

## Zero-regression sweep

The `_buildCascade` change is the shared cascade, so it was swept hardest:
qsa 1975/1975, classlist 1420/1420, serialize-values 695/697, font-computed 315/315,
font-family-computed 10/10, font-weight-computed 58/58, inset-computed 20/20,
border-block-color-computed 8/8, color-computed 16/16, getElementsByTagName 19/19.
`getComputedStyle-detached-subtree` 0/6 is the pre-existing architectural cap
(unchanged — the hint never fires for it).

## Caps / Next

Only `<font size>` is mapped — the broader presentational-hint set (`<font color>`,
`width`/`height`/`bgcolor`, `<hr>` attrs, table `cellspacing`, …) is a natural
extension of `_presHintDecls` if a future test needs it. This quest scoped to the one
attribute the failing test exercises.
