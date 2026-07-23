# Quest #262 — The Line-List Verdict

**Realm:** `css/css-gaps/parsing/` (CSS Gap Decorations)
**Banner:** the shared `<line-color|style|width-list>` grammar (`repeat()` / `auto-repeat` + comma list) — VALID + INVALID.
**Result:** +84, ZERO regressions.

## The gap
CSS Gap Decorations lets `column-rule-{color,style,width}` (and the new
`row-rule-{color,style,width}` + `rule-{color,style,width}` shorthands) take a
COMMA-separated list of leaves, each optionally wrapped in `repeat(<n>, …)` /
`repeat(auto, …)`. The multicol longhands only validated a single leaf, so every list
form fell to raw-store:
- color/style/width **valid** 31/45 each — lists + repeat() wrongly rejected or mangled.
- color/style **invalid** 6/18, width **invalid** 9/27 — space-joined leaves, `repeat(0,…)`,
  `repeat(-1,…)`, double auto-repeat, `30%`, `-20px` all wrongly accepted.

## The grammar (shared; only the leaf validator differs)
```
value            = <line-list> | <auto-line-list>
<line-list>      = <item>#                          (comma list, ≥1)
<auto-line-list> = <item>* <auto-repeat> <item>*    (exactly ONE auto-repeat)
<item>           = <leaf> | repeat( <integer [1,∞]> , <leaf># )
<auto-repeat>    = repeat( auto , <leaf># )
<leaf>           = <color> | <line-style> | <line-width>   (per property)
```

## The work (all `bootstrap.js`)
- **NEW `_canonGapRuleList(value, leaf)`** — paren-aware top-level comma split into items;
  each item is a `repeat(…)` (parsed via `_REPEAT_RE` → count + `<leaf>#` run) or a single
  `<leaf>` (exactly one `_wsTokens` token → space-joined leaves invalid). Count = `auto`
  (tracked; at most one auto-repeat across the whole value) or `<integer [1,∞]>` via the
  reused `_canonColumnCount` (rejects `0`/`-1`/fractional). Per-leaf validators:
  `_canonGapLeaf` (color → `_isValidColor`+`_canonColorSpecified`; style → `_LINE_STYLE_KW`;
  width → the reused `_canonColumnRuleWidth`, rejecting `%`/negative/bare-number). An empty
  item (leading/trailing/double comma) or any invalid leaf → null.
- **Superset routing:** `_canonMulticol` now intercepts the 6 `*-rule-{color,style,width}`
  longhands (`_GAP_RULE_LEAF`) and delegates to `_canonGapRuleList`. A SINGLE value
  round-trips byte-identically to the legacy single-leaf canon, so the multicol column-rule-*
  tests are unaffected. Added `row-rule-{color,style,width}` to `_MULTICOL_VALIDATED`
  (reusing all existing multicol wiring: inline parser, setProperty, CSS.supports) +
  `_GCS_DEFAULTS` (currentColor/none/medium, not inherited).
- **Shorthands:** added `rule-{color,style,width}` to `_GAP_BIDI_SH` (Quest #261's generic
  bidirectional-shorthand infra), auto-wiring them across all six touch points. Their leaf
  validation routes through `_canonGapRuleLonghand` → `_canonGapRuleList`.

## Results
| File | Before | After |
|------|:------:|:-----:|
| `gap-decorations-color-valid` | 31/45 | **45/45** |
| `gap-decorations-color-invalid` | 6/18 | **18/18** |
| `gap-decorations-style-valid` | 31/45 | **45/45** |
| `gap-decorations-style-invalid` | 6/18 | **18/18** |
| `gap-decorations-width-valid` | 31/45 | **45/45** |
| `gap-decorations-width-invalid` | 9/27 | **27/27** |

**+84.**

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, color-valid 17/17, and the FULL
multicol column-rule family held exactly: column-rule-color valid/invalid/computed 2/2,
column-rule-style-valid 9/9, -invalid 1/1, column-rule-width valid/invalid/computed 5·4·3,
column-rule-shorthand 12/12, column-rule-computed 6/6.

## Caps / Next
**Next (#263):** the COMPUTED serialization — `gap-decorations-{color,style,width}-computed`
(color 5/33, style/width similar). The list structure is KEPT (repeat stays, integer folds
via calc, each leaf resolved: color → `rgb(…)`/`color(srgb …)`, width → px). Needs a
computed list path + `row-rule-color` color resolution (add to `_COLOR_PROPS` or a computed
branch) + the `rule-*` shorthand computed reconstruction (bidirectional-shorthands.html).
grep `_canonGapRuleList`/`_GAP_RULE_LEAF`.
