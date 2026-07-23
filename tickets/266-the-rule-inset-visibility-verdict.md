# Quest #266 — The Rule-Inset & Visibility Verdict

**Realm:** `css/css-gaps/parsing/` — the `inset` super-shorthand + `rule-visibility-items`
**Hold before:** 42/358 across the 9 files (raw-store) + the 12/14 bidi cap
**Hold after:** 358/358 + 14/14 — **+316 (+2 bonus), ZERO regressions**

## The work

Two pieces, both closing the CSS Gap Decorations line-decoration module.

### 1. The `inset` super-shorthand (`quad` shape)

Registered `{column,row}-rule-inset` (2 `quad` rows in `_RI_SH`) + bidi `rule-inset`.
The grammar is `<inset-value>{1,2} [ / <inset-value>{1,2} ]?` — the pre-slash side is
cap (start/end), the post-slash side is junction; one value per side duplicates to
both; a missing junction side duplicates the cap side. `_parseInsetShape('quad')`
(built in #264) splits on the top-level `/` via `_slashSplitTop` (>1 slash → invalid),
parses each side with `_parseInsetPair`. Serialization: **all four equal → the single
value** (`overlap-join …×4`→`overlap-join`, `10px`→`10px`); else the full
`cap-start cap-end / junction-start junction-end` form (`10px 20px`→`10px 20px / 10px
20px`, never collapses a non-uniform value across the slash).

### 2. The `rule-visibility-items` family

`{column,row}-rule-visibility-items` = the keyword enum `all | around | between |
normal` → `_CSSUI_ENUM` + `_CSSUI_VALIDATED` + `_GCS_DEFAULTS` (initial `normal`, not
inherited; computed = keyword identity). The `rule-visibility-items` bidirectional
shorthand slots straight into the existing `_GAP_BIDI_SH` infra (#261) — the only
change needed was routing `_canonGapRuleLonghand` to `_canonCssUi` for ANY
`_CSSUI_ENUM` gap longhand (was hardcoded to the two rule-break names).

## Results

| file | before | after |
|------|:------:|:-----:|
| rule-inset-valid | 30/51 | 51/51 |
| rule-inset-invalid | 0/30 | 30/30 |
| rule-inset-computed | 0/45 | 45/45 |
| rule-inset-shorthand | 0/100 | 100/100 |
| rule-inset-bidirectional-shorthand | 0/81 | 81/81 |
| rule-visibility-items-valid | 12/12 | 12/12 |
| rule-visibility-items-invalid | 0/15 | 15/15 |
| rule-visibility-items-computed | 0/12 | 12/12 |
| rule-visibility-items-shorthand | 0/12 | 12/12 |
| **gap-decorations-bidirectional-shorthands** (bonus) | 12/14 | **14/14** |

**Zero-regression sweep:** qsa 1975, classlist 1420, serialize-values 695/697,
multicol column-rule-shorthand 12/12, rule-break-computed 9/9, rule-inset-cap-junction-shorthand
60/60 (#265), rule-inset-start-end-shorthand 60/60 (#264), gap-decorations-color-computed
33/33 — all held.

## Caps / Next

The `css/css-gaps/parsing/` rule-inset + visibility veins are **fully SECURED** across
#264–#266 (+852 + 2 bonus). The remaining css-gaps files are the `gap-shorthand`/
`gap-decorations-*` families already secured in #261–#263, plus `.tentative` files.
**Next leverage: a NEW `css/*/parsing/` dir** — css-overflow `webkit-box-computed`
14/20 is a JS `display`-alias computed vein; the `::scroll-button()`/`::column` veins
are SELECTOR-ENGINE (Rust) quests. grep `_RI_SH`/`_GAP_BIDI_SH`/`_CSSUI_ENUM`.
