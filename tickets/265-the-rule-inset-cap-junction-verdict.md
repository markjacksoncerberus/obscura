# Quest #265 — The Rule-Inset Cap-Junction Verdict

**Realm:** `css/css-gaps/parsing/` — the rule-inset cap/junction level
**Hold before:** 42/266 across the 6 cap-junction files (raw-store)
**Hold after:** 266/266 — **+224, ZERO regressions**

## The work

#264 built the whole `_RI_*` infra (all value shapes) and registered the start-end
(`dup`) level. This quest **registers the cap-junction (`pair`) level** — no new
logic, just table rows:

- `_RI_SH` += `{column,row}-rule-inset-cap` / `-junction` (each `shape: 'pair'`,
  value `<inset-value>{1,2}` → `[start, end]`, 1 value → both).
- `_RI_BIDI` += `rule-inset-cap` / `rule-inset-junction` (apply the per-axis pair to
  both axes).

The already-wired `_expandRuleInset`/`_serRuleInset`/`_parseInsetShape` handle the
`pair` shape (`_parseInsetPair`); the pair serialization collapses `start==end` to a
single value else `start end`.

## Results

| file | before | after |
|------|:------:|:-----:|
| rule-inset-cap-junction-valid | 42/48 | 48/48 |
| rule-inset-cap-junction-invalid | 0/60 | 60/60 |
| rule-inset-cap-junction-computed | 0/48 | 48/48 |
| rule-inset-cap-junction-shorthand | 0/60 | 60/60 |
| rule-inset-cap-bidirectional-shorthand | 0/25 | 25/25 |
| rule-inset-junction-bidirectional-shorthand | 0/25 | 25/25 |

**Zero-regression sweep:** qsa 1975, classlist 1420, serialize-values 695/697,
multicol column-rule-shorthand 12/12, rule-inset-start-end-shorthand 60/60 (#264),
rule-inset-start-end-bidirectional-shorthand 50/50 (#264), gap-decorations-color-computed
33/33 — all held.

## Caps / Next

**#266** registers the `inset` super-shorthand — 2 `quad` rows (`{column,row}-rule-inset`,
the `<iv>{1,2} [ / <iv>{1,2} ]?` slash grammar) + bidi `rule-inset` — and builds the
`rule-visibility-items` family (`all|around|between|normal` enum + its bidirectional
shorthand, the 2 remaining `gap-decorations-bidirectional-shorthands` caps).
grep `_RI_SH`/`_parseInsetShape`.
