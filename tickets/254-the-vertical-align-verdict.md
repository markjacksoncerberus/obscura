# Quest #254 — The Vertical-Align Verdict

**Realm:** `css/css-inline/parsing/` (vertical-align — the last file in the dir)
**Result:** +43, ZERO regressions. All 3 files → 100%. **The css-inline dir is now
FULLY SECURED (15 files, 159/159).**
**Session:** 2026-07-22.

## The gap

vertical-align was raw-store: invalid 0/9, valid 19/30, computed 0/23.

The key realisation: the WPT tests the **CSS Inline 3** grammar, not the legacy
longhand. vertical-align is an order-independent `||` combination:

```
vertical-align = [ first | last ] || <'alignment-baseline'> || <'baseline-shift'>
```

- **baseline-source:** `first | last`.
- **alignment-baseline:** `baseline | text-bottom | alphabetic | ideographic |
  middle | central | mathematical | text-top` (`baseline` is the default).
- **baseline-shift:** `<length-percentage> | sub | super | top | center | bottom`
  (the same grammar as the baseline-shift property from #253; default is `0`).

Each category matches at most once; the value serializes in the fixed order
`[source] [align] [shift]`, dropping the default `baseline` alignment and a zero
shift; when everything is default it serializes as the single keyword `baseline`.

## The fix (all `bootstrap.js`)

NEW `_canonVerticalAlign(value, el, computed)`:
1. Reject a top-level comma (`_commaSplitTop(s).length > 1`) — commas inside a calc
   are preserved by `_wsTokens`'s depth tracking, so only a real top-level comma trips.
2. Tokenize (`_wsTokens`), 1–3 tokens. Classify each into source / alignment-baseline
   / baseline-shift; a duplicate in any category or an unknown token → null.
   The shift part reuses `_canonLenPctSigned(t, true)` (signed `<length-percentage>`).
3. `computed` folds the shift's `<length>`→px via `_computeBaselineShift` (reused
   from #253; keeps `%` symbolic).
4. Serialize `[source] [align≠baseline] [shift≠0px]`, or `baseline`.

Wired the four standard touch points: `_CSSUI_VALIDATED` + a `_canonCssUi` branch
(specified, `computed=false`) + `_GCS_DEFAULTS` (`baseline`, not inherited) + a
`_normComputed` branch (`computed=true`).

## Results

invalid 0→9, valid 19→30, computed 0→23. **+43.** Canonicalizations verified:
`super middle first`→`first middle super`, `last baseline sub`→`last sub`,
`text-top first 10%`→`first text-top 10%`, `baseline 0`→`baseline`, `1em last`→`last 1em`.

## Zero-regression sweep

classlist 1420, serialize-values 695/697, font-computed 315/315, writing-mode-invalid
2/2, border-spacing-computed 4/4, shorthand-serialization 7/7; #252/#253 held.

## Caps / Next

`css/css-inline/parsing/` is fully secured (15/15 files). **Next: a NEW
`css/*/parsing/` dir.** Baselined-but-untouched candidates this campaign:
- **css-multicol/parsing** — column-* family (already has a `_canonMulticol`; check
  for computed/invalid gaps).
- **css-box/parsing** — clear/float/visibility/margin/padding/overflow (some may be
  raw-store).
- **css-overflow/parsing** — line-clamp / webkit-box / scroll-markers / block-ellipsis
  (newer props, likely raw-store).
- **css-flexbox/parsing**, **css-gaps/parsing** (gap-decorations — very new, many
  `.tentative`).

The tell: a `-invalid` at 0/N (raw-store) or a `-valid`/`-computed` canon gap.
grep `_canonVerticalAlign` / `_CSSUI_ENUM`.
