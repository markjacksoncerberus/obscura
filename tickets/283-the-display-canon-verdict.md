# Quest #283 — The Display-Canon Verdict

**Realm:** `css/css-display/parsing/` · **Result:** +199 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
A NEW dir. `display` was **raw-store** — the single predefined keywords round-tripped
(`block`, `grid`, `table-row`, …) but the two-value syntax was neither validated nor
canonicalized, and out-of-grammar values were wrongly accepted:
- `display-invalid.html` — **0/55** (`flow flow`, `list-item table`, `none grid`,
  `table-row flow`, 4-token combos, … all wrongly stored)
- `display-valid.html` — **36/108** (`block flow`→`block`, `inline ruby`→`ruby`,
  `flow list-item`→`list-item`, … not collapsed to the canonical short form)
- `display-computed.html` — **36/112** (same canon gap; computed = specified)

## The grammar (CSS Display 3)
```
display = [ <display-outside> || <display-inside> ]                (two-value syntax)
        | <display-listitem> | <display-internal> | <display-box> | <display-legacy>
<display-outside>  = block | inline | run-in
<display-inside>   = flow | flow-root | table | flex | grid | ruby
<display-listitem> = <display-outside>? && [ flow | flow-root ]? && list-item
```
Browsers store `display` as ONE internal value and serialize its **canonical shortest
string**. The two-value + list-item forms collapse:
- `<outside> flow` → the outside keyword (flow is the default inside): `block flow`→`block`
- `block flow-root`→`flow-root`, `inline flow-root`→`inline-block`, `run-in flow-root`→`run-in flow-root`
- `<block|inline> {flex,grid,table}` → `{,inline-}{flex,grid,table}`; `run-in flex`→`run-in flex`
- ruby is inline-level: `inline ruby`→`ruby`, `block ruby` stays `block ruby`, `run-in ruby` stays
- list-item drops default outside (block) + default inside (flow): `flow list-item`→`list-item`,
  `flow-root list-item`→`flow-root list-item`, `inline list-item`→`inline list-item`

Invalid: two outsides / two insides / two list-items; `list-item` with flex/grid/table/ruby;
a box/legacy/internal keyword combined with anything; >3 tokens.

## The fix (all `crates/obscura-js/js/bootstrap.js`)
NEW `_canonDisplay(value)`:
- `_wsTokens` → 1–3 tokens; a lone `_DISPLAY_PREDEFINED` keyword (box/legacy/internal)
  → verbatim (lowercased).
- Else classify each token into exactly one of outside / inside / list-item (any repeat
  or a non-category token → `null`).
- list-item form: reject a non-flow/flow-root inside; serialize `[outside≠block] [inside=flow-root] list-item`.
- pure two-value form: fill missing inside=flow, missing outside=block (ruby→inline);
  look up `_DISPLAY_CANON[outside][inside]` for the collapsed string.

Wired: a `_canonCssUi` branch (`if (name === 'display') return _canonDisplay(s)`) +
`display` in `_CSSUI_VALIDATED` (→ API setProperty dispatch) + an explicit
`_parseStyleDecls` inline branch (`style="display:…"` consistency). Computed = the
stored canonical form (identity) — no `_normComputed` branch needed; the 108 non-
blockified computed cases pass off the identity path.

## Result
| file | before | after |
|------|:------:|:-----:|
| display-invalid  | 0/55 | **55/55** |
| display-valid    | 36/108 | **108/108** |
| display-computed | 36/112 | **108/112** (4 blockification cases → Quest #284) |

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, overflow-computed 34/34,
position-computed 5/5, float-valid 5/5, clear-computed 6/6, visibility-computed 3/3,
table-layout-computed 2/2, will-change-valid 20/20, contain-computed 15/15,
flex-flow-computed 2/2.

## Caps / Next
The 4 remaining display-computed cases are box-type **blockification** (position/float)
→ Quest #284. grep `_canonDisplay`.
