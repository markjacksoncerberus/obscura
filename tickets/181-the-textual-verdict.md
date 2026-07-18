# Quest #181 — The Textual Verdict

**Realm:** CSS Text parsing — `css/css-text/parsing/` (86 files)
**Hold:** 341/754 → **745/754** (+404)
**Difficulty:** ⚔️⚔️⚔️
**Status:** ✅ SECURED — +404, zero regressions.

---

## The gap

The widest lever of the #179/#180 vein: the whole `css/css-text/parsing/` dir
(86 files, 754 subtests) sat at **341/754**. Same root cause — the entire
css-text family stored its value **raw** in `CSSStyleDeclaration.setProperty`
with **no grammar check** — but at a larger scale, and with three distinct
shortfalls:

1. **No validation.** Every `*-invalid.html` was 0/N (~150 subtests):
   `text-wrap-mode: balance`, `word-break: auto`, `text-align: start end`,
   `letter-spacing: 20`, `tab-size: -20`, `text-indent: hanging`,
   `white-space: auto`, `hanging-punctuation: first first` — all stored and read
   back verbatim.
2. **Unregistered properties.** `text-autospace`, `text-spacing`,
   `text-spacing-trim`, `text-group-align`, `word-space-transform`,
   `hyphenate-character`, `hyphenate-limit-chars` weren't in `_GCS_DEFAULTS` at
   all → `getComputedStyle` returned `""` → every `*-computed.html` for them was
   0/N (text-autospace-computed 0/32, text-spacing-computed 0/16, …).
3. **No shorthand canonicalization.** `text-wrap` (`<text-wrap-mode> ||
   <text-wrap-style>`), `white-space` (`<white-space-collapse> ||
   <text-wrap-mode>` plus the legacy `normal`/`pre`/`nowrap`/… keywords),
   `text-spacing`, and `text-fit` were stored verbatim, so every serialization
   (`wrap balance`→`balance`, `preserve nowrap`→`pre`, `no-autospace space-all`→
   `none`) failed. white-space-shorthand was 6/45.

## The work — a self-contained css-text value engine (all `bootstrap.js`)

**`_canonCssText(name, value)`** (defined right after `_canonCssUi`): validates +
canonicalizes each css-text longhand/shorthand, returning `null` for an invalid
value (→ ignore the declaration, per CSSOM). CSS-wide keywords and `var()`/`env()`
pass through untouched. Dispatched from `setProperty` via `_CSSTEXT_VALIDATED`,
placed **before** the length/`_MATH_GATE` branches (so tab-size/word-spacing/
letter-spacing are fully handled here). Covers:

- **Enumerated longhands** (`_CSSTEXT_ENUM`, 14 props): exactly one keyword,
  serialized lower-case — text-wrap-mode, text-wrap-style, white-space-collapse,
  word-break, line-break, hyphens, text-justify, text-align / -last / -all,
  overflow-wrap, word-wrap, text-spacing-trim, text-group-align.
- **`||`-combination longhands** — a generic `_ccOrderedCanon(value, cats, opts)`:
  each token belongs to exactly one ordered category (a Set), ≤1 per category,
  unknown/duplicate → invalid; a `singletons` keyword must stand alone;
  `requireCats` forces ≥1 of a category subset; `preserveOrder` keeps specified
  order (the canonical order IS the specified order) otherwise serialize in
  category order. Driven by `_CCSET`:
  - **text-transform** — `[capitalize|uppercase|lowercase] || full-width ||
    full-size-kana`, singletons `none`/`math-auto`, reordered
    (`full-width lowercase`→`lowercase full-width`).
  - **text-autospace** — `[ideograph-alpha || ideograph-numeric || punctuation]
    || [insert|replace]`, singletons `normal`/`auto`/`no-autospace`, `requireCats`
    the spacing set, reordered.
  - **word-space-transform** — `[space|ideographic-space] || auto-phrase`,
    singleton `none`, order **preserved** (both `space auto-phrase` and
    `auto-phrase space` are identity-valid).
  - **hanging-punctuation** — `first || [force-end|allow-end] || last`, singleton
    `none`, order **preserved**.
- **`<length-percentage>` / `<number>` grammar** (`_canonLenPctSigned`): a bare
  non-zero number is invalid, unitless `0`→`0px`, calc folds via
  `_canonMathExpr` (percentage-first). word-spacing/letter-spacing =
  `normal | <length-percentage>`; tab-size = `<number [0,∞]> | <length [0,∞]>`
  (no `%`, negatives rejected); text-indent = `<length-percentage> && hanging? &&
  each-line?` (length required, reordered to length-first).
- **hyphenate-character** = `auto | <string>`; **hyphenate-limit-chars** =
  `[ auto | <integer [0,∞]> ]{1,3}` with trailing-duplicate collapse
  (`5 2 2`→`5 2`, `auto auto auto`→`auto`).
- **The shorthands, canonicalized to a SINGLE stored keyword** (deliberately NOT
  expanded into longhands — single-key storage keeps `cssText`/`getAttribute
  ('style')` round-trips byte-identical, and the parsing tests only observe each
  shorthand's own serialization):
  - `_canonTextWrap` — mode `wrap` omitted when a non-default style is present,
    default style `auto` omitted (`wrap balance`→`balance`, `balance nowrap`→
    `nowrap balance`).
  - `_canonWhiteSpace` — maps the (collapse, mode) pair to the legacy keyword
    (`preserve nowrap`→`pre`), else `<collapse> <mode>` (`preserve-breaks
    nowrap`).
  - `_canonTextSpacing` — `<'text-spacing-trim'> || <'text-autospace'>`, with the
    magic `none` = (space-all, no-autospace) and `auto` singletons.
  - `_canonTextFit` — `[grow|shrink] [consistent|per-line|per-line-all]?
    <percentage>?`, fixed order.

**Registration + computed.** Added the 7 unmodelled props to `_GCS_DEFAULTS`
(auto-registers in `_CSS_KNOWN_PROPS`, exposes them to `getComputedStyle` +
`CSS.supports`), the inherited ones to `_INHERITED_PROPS`, and a
`_CSSTEXT_VALIDATED` branch in `CSS.supports`. `_normComputed` gained css-text
branches for the forms that differ from the specified serialization:

- text-justify `distribute` → `inter-character` (legacy computed alias).
- text-fit drops the default `consistent` scope (`grow consistent`→`grow`,
  `grow consistent 300%`→`grow 300%`; `per-line`/`per-line-all` kept).
- hyphenate-limit-chars rounds each `<integer>` (calc→integer via
  `_computeIntegerValue`), then re-collapses trailing duplicates.
- tab-size: `<number>` stays, `<length>` resolves to px and clamps ≥0.
- text-indent: resolves the `<length-percentage>` (em→px), re-appends the
  trailing `hanging`/`each-line` keywords in canonical order.

## Results

Realm **341/754 → 745/754** (+404). Every `*-invalid` 0/N→N/N. Highlights:
text-autospace 0/32→32/32, white-space-shorthand 6/45→45/45,
text-transform-invalid 0/19→19/19, text-spacing (invalid/valid/computed)
0-7/… →full, hanging-punctuation-invalid 0/11→11/11, text-indent-valid
9/14→14/14.

**Zero regressions** (swept): qsa 1975/1975, classlist, Element-matches 669/669,
createElement 147/147, dispatchEvent 25/25, css-align place-content 15/15 +
gap 12/12, css-ui caret-color-computed 12/12 + outline-color-valid 2/2,
serialize-values 696/697 (pre-existing `invert` cap), color-valid 17/17,
transform-valid 42/42; inline-style-001 4/5 pre-existing.

## Caps (9 remaining)

- **tab-size-computed** (2): `calc(… sign(2cqw − 10px) …)` needs container-query
  (`cqw`) units.
- **white-space-shorthand-text-wrap** (2): `white-space` on a parent must
  overwrite the `text-wrap-mode` **longhand** (so the child inherits it). This
  requires expanding white-space INTO longhands — traded away deliberately for
  single-key storage (cssText safety). Revisitable if longhand expansion is
  added with a matching cssText recombination.
- **hyphenate-character** valid+computed (2): `"\1400"`→`"᐀"` needs a full CSS
  `<string>` escape-unescaper + re-serializer (none exists in the codebase yet).
- **text-align-computed** (1): `match-parent`→`center` needs a parent
  text-align/direction walk.
- **letter-spacing / word-spacing computed** (1 each): an unbalanced-paren mixed
  `%`/length calc (`calc(10px - (5% + 10%)`→`calc(-15% + 10px)`) — a
  length-computed-engine edge case, not css-text-specific.

## Next

The still-untouched `css/*/parsing/` dirs remain the widest tail, same
three-axis JS machinery (validation + canonical serialization + computed
resolution): **css-fonts** (83 files), **css-grid** (61), **css-overflow** (35),
**css-scroll-snap** (25). Grep `_canonCssText`/`_CSSTEXT_ENUM`/`_CCSET`/
`_CSSTEXT_VALIDATED` before touching css-text values.
