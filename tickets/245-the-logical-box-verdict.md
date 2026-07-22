# Quest #245 — The Logical-Box Verdict

**Region:** `css/css-logical/parsing/` (margin/padding/inset family)
**Result:** +99 subtests, ZERO regressions
**Session:** 2026-07-22

## The gap

The last raw-store vein in the dir (after sizing #243 + border #244).

| Family | invalid | shorthand | valid |
|--------|:-------:|:---------:|:-----:|
| margin-block/inline | 0/7 | 0/12 | 13/14 |
| padding-block/inline | 0/17 | 0/12 | 8/9 |
| inset-block/inline | 0/7 | 0/12 | 8/12 |
| inset (physical) | 0/3 | 0/20 | 5/8 |

These shorthands were stored as BLOBS (`_props['margin-block'] = '20% auto'`),
computed reconstructed from the blob via `_computeBoxShorthand`. So the LONGHAND
getter never reflected the shorthand — `div.style.marginBlockStart` after
`div.style.marginBlock = '20% auto'` returned `''` (→ every `-shorthand` 0/N) — and
nothing validated the components (→ every `-invalid` 0/N).

## The fix (all `crates/obscura-js/js/bootstrap.js`)

Switched to **eager longhand expansion** (`_BOX_LOGICAL_SH2`), the same template as
scroll-margin-block and #244's border shorthands: the shorthand expands into its
edge longhands at set-time, so both the longhand getter and the shorthand reflect.

- **Component validators:** `_canonMarginInsetComp` = `<length-percentage> | auto`
  (signed, via `_canonLenPctSigned`); `_canonPaddingComp` = `<length-percentage
  [0,∞]>` (no auto/none, via `_canonGapItem`).
- `_canonBoxLogicalLh` (a single-value longhand) + `_expandBoxLogical` (1–2 edges
  for block/inline, 1–4 for physical `inset`).
- **Wired every touch point:** setProperty + inline `_parseStyleDecls` (eager expand
  + longhand validate), removeProperty (clear longhands), the CSSOM getter
  (`_serBoxLogicalSh`), getComputedStyle `resolve()` (reconstruct from computed
  longhands via `_serializeBoxValue`), CSS.supports, and the cascade
  (`_SHORTHAND_LONGHANDS` + `_expandShorthand`).

The old blob-computed path (`_SH_COMPUTED`/`_computeBoxShorthand`) is superseded by
the resolve() branch (now dead for these keys).

## Wins

margin +20, padding +30, inset-block/inline +23, physical inset +26 = **+99**.

## Caps (honest)

margin/padding `-computed` percentage values (`10%`→`20px`, `calc(10% + 40px)`→
`60px`) resolve against the containing-block WIDTH — that needs layout, so the `%`
is kept symbolic. Same cap as the sizing computed values (#243). margin-computed
stays 9/12, padding 11/16. (inset-block-inline-computed 12/12 and physical
inset-computed 8/8 pass because `top`/`right`/`bottom`/`left` keep `%` per spec.)

## Zero-regression sweep

Broad — touched setProperty/inline/getter/removeProperty/getComputedStyle/cascade
for margin/padding/inset + top/right/bottom/left. qsa 1975, classlist 1420,
serialize-values 695/697, shorthand-serialization 7/7, getComputedStyle-property-
order 1/1, margin-valid 15/15, padding-valid 11/11, top-valid 4/4, css-position
inset-computed 20/20 + top-computed 5/5, inset-block-inline-computed 12/12,
flex-computed 14/14, scroll-margin-computed 11/11. STASH-PROVED
`properties-value-inherit-001` 0/50 IDENTICAL pre/post (pre-existing — needs real
transition execution).

## Region status

`css/css-logical/parsing/` is now FULLY secured: sizing (#243), border (#244), box
(#245). The only residuals are documented caps (sizing/margin/padding `%`-computed
needs layout; 6 border color-invalid need a stricter `_isValidColor`).

## Next leverage

A NEW `css/*/parsing/` dir. OR a stricter `_isValidColor` (rgb()/hsl() argument
TYPE consistency + arity) — would close the 6 #244 color-invalid caps and likely
help physical `color` too (a shared root-cause primitive). grep `_BOX_LOGICAL_SH2`
/ `_expandBoxLogical`.
