# Quest #281 — The Text-Size-Adjust Verdict

**Realm:** `css/css-size-adjust/parsing/` · **Result:** +16 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
A NEW dir. `text-size-adjust` was **raw-store / unregistered in computed**:
- `text-size-adjust-invalid.html` — **0/4** (`reverse`, `0`, `10px`, `-100%` wrongly stored)
- `text-size-adjust-valid.html` — **0/7** (`calc(10% + 5%)`→`calc(15%)` not folded)
- `text-size-adjust-computed.html` — **0/6** ("not supported in computed style")

## The grammar
```
text-size-adjust = auto | none | <percentage [0,∞]>
```
- `auto`/`none` keywords; a **non-negative** literal percentage; or a
  percentage-typed calc kept symbolic (`calc(10% + 5%)`→`calc(15%)`).
- **Inherited**; initial `auto`.
- Computed: `auto` unchanged; **`none` → `100%`**; a literal percentage identity.

## The fix (all `crates/obscura-js/js/bootstrap.js`)
A dedicated `_canonCssUi` branch (modelled on `block-step-size`, but percentage):
single token; `auto`/`none` keywords; a math fn gated by
`_mathValid(t, ['percentage'], 'percentage')` (rejects a `<length>`-typed calc like
`calc(10px)`), canonicalized via `_canonMathExpr`; else a literal `_PLAIN_PCT_RE`
percentage rejected when negative. Registered in `_CSSUI_VALIDATED` (→ inline parser
+ setProperty dispatch), `_GCS_DEFAULTS` (`'auto'`), and `_INHERITED_PROPS`. NEW
`_normComputed` branch: `none`→`100%`, `auto`→`auto`, else identity.

## Result
| file | before | after |
|------|:------:|:-----:|
| text-size-adjust-invalid  | 0/4 | **4/4** |
| text-size-adjust-valid    | 0/7 | **7/7** (incl. `calc(15%)` + symbolic calc) |
| text-size-adjust-computed | 0/6 | **5/6** (1 CAP, see below) |

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, block-step-size-computed 6/6,
color-scheme-computed 13/13, font-palette-computed 4/4, position-computed 5/5,
view-transition-name-computed 11/11 (shared `_canonCssUi`/`_normComputed` exercisers).

## Caps / Next
**CAP (1):** `text-size-adjust: calc(10% * sibling-index())` computed → `10%` needs
`sibling-index()` evaluation, unsupported in `_evalMath` (documented #238) — the
value stays symbolic. Not a regression; the same cap blocks a css-shapes subtest.
**Next leverage:** a NEW `css/*/parsing/` dir. Candidates: `css-scroll-anchoring`
`overflow-anchor` (`auto | none` enum, invalid 0/2 + computed 0/2 — a trivial
`_CSSUI_ENUM` quest); `css-content` `content` (partially green); `css-display`
`display` (invalid 0/55, valid 36/108, computed 36/112 — a BIG multi-keyword
shorthand grammar `[<display-outside> || <display-inside>] | …`, a risky
dedicated-session quest). grep `text-size-adjust`.
