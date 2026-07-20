# Quest #227 — The Text-Emphasis Verdict

**Realm:** `css/css-text-decor/parsing/` (the `text-emphasis` family)
**Session:** 2026-07-19
**Result:** +21 subtests, ZERO regressions. All 6 worked files → 100%.

## The gap

Took #226's next-leverage (the sibling `text-emphasis` family in the same dir).
The whole family was pure raw-store / unregistered:

| File | Before | After |
|------|:------:|:-----:|
| `text-emphasis-computed.html` | 0/7 | **7/7** |
| `text-emphasis-style-computed.html` | 6/9 | **9/9** |
| `text-emphasis-style-computed-vertical-lr.html` | 6/9 | **9/9** |
| `text-emphasis-position-computed.html` | 5/7 | **7/7** |
| `text-emphasis-position-valid.html` | 4/5 | **5/5** |
| `text-emphasis-position-invalid.html` | 0/5 | **5/5** |

The `text-emphasis-style`/`-position` longhands were already registered in
`_GCS_DEFAULTS`/`_CSS_KNOWN_PROPS` (so they were "computed-supported"), but stored
their value verbatim — no grammar check, no canonicalization, no computed folding.
The `text-emphasis` shorthand was entirely unregistered in computed style
(*"doesn't seem to be supported in the computed style"* → computed 0/7). The
`text-emphasis-color` longhand was already fully handled by `_COLOR_PROPS`.

## The grammar

- **`text-emphasis-style`** = `none | [ [ filled | open ] || [ dot | circle |
  double-circle | triangle | sesame ] ] | <string>`
  Computed: drop the default `filled`; supply the writing-mode default shape when
  the shape is omitted — **`circle` in a horizontal typographic mode, `sesame` in a
  vertical one** (CSS Text Decor §8.4). So `filled`→`circle` (horizontal) /
  `sesame` (vertical-lr), `open`→`open circle` / `open sesame`, `filled circle`→
  `circle`, `dot`→`dot`.
- **`text-emphasis-position`** = `auto | [ [ over | under ] && [ right | left ]? ]`
  Canonical: over·under first, then `left` only (default `right` dropped);
  `auto` is a standalone keyword. `over right`→`over`, `right under`→`under`.
  `auto` may not combine (`auto left`/`over auto` invalid); a duplicated axis is
  invalid (`left over right`, `under right over`). Computed == specified.
- **`text-emphasis`** = `<'text-emphasis-style'> || <'text-emphasis-color'>`
  Computed prints BOTH the style and the colour, ALWAYS (unlike text-decoration,
  the colour is never omitted): `none`→`none rgb(0, 0, 255)` on a `color: blue`
  element (currentcolor resolves to the element's `color`).

## The work (all `bootstrap.js`)

New machinery block after the text-decoration code (`grep _expandTextEmphasis`):
- `_parseTextEmphasisStyle(v)` → `{none}|{str}|{fill,shape}|null`
- `_canonTextEmphasisStyle(v)` — specified (canonical `fill shape` order; string via
  `_serCssString`)
- `_computeTextEmphasisStyle(el, v)` — drops `filled`, adds the writing-mode default
  shape via `_computedPropOf(el, 'writing-mode', 'horizontal-tb')`
- `_canonTextEmphasisPosition(v)` — canon + validate
- `_TEXTEMPHASIS_VALIDATED` + `_canonTextEmphasisLonghand(name, v)` (CSS-wide/var
  pass through)
- `_expandTextEmphasis(v)` — shorthand → `{text-emphasis-style, text-emphasis-color}`
  (colour is always a single token; every other token is style)
- `_serTextEmphasisFromLonghands(get)` — reconstruct the shorthand (each omitted at
  its initial; all-initial → `none`)

Wiring (mirrors #226 text-decoration, exactly five touch points for the shorthand):
1. inline `_parseStyleDecls` parser — shorthand-expand + longhand-validate
2. API `setProperty` — shorthand-expand + longhand-validate
3. `removeProperty` — clear the two longhands
4. `getPropertyValue` — reconstruct via `_serTextEmphasisFromLonghands`
5. getComputedStyle: a `_normComputed` branch for `text-emphasis-style`, a
   `resolve()` branch for the `text-emphasis` shorthand, `add('text-emphasis')` in
   `_CSS_KNOWN_PROPS`, and a CSS.supports branch for both longhands + the shorthand.

## Regression sweep (ZERO)

qsa 1975, classlist 1420, DOMTokenList-value 1/1, getComputedStyle-property-order
1/1 (+1 registered shorthand inert on enumeration), serialize-values 695/697 (2
pre-existing), shorthand-serialization 7/7, all 6 #226 text-decoration files 100%,
flex-computed 14/14, column-rule-shorthand 12/12, animation-shorthand 36/36,
grid-area-computed 35/35. The change is fully gated on the `text-emphasis`* names —
no shared code path touched.

## Caps / Next

- **CAP:** none in the text-emphasis family — all 6 files 100%.
- **NEXT LEVERAGE:** `text-decoration-inset` — a SEPARATE `auto | <length>{1,2}`
  property still raw-store in this dir: `-inset-computed` 0/16, `-inset-valid`
  10/16, `-inset-invalid` 0/8 (~30 subtests, a clean small vein; the computed side
  folds each `<length>` to px like the other length-computed props, with a 2-value
  form `10px 20px`). OR a NEW `css/*/parsing/` dir (`css/css-lists/parsing/` —
  `list-style-shorthand.sub` 0/4, `list-style-computed.sub` 0/5). grep
  `_expandTextEmphasis`.
