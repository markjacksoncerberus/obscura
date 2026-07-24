# Quest #293 — The Text-Decor-Double-Bar Verdict

**Realm:** `css/css-text-decor/parsing/` · **Result:** +33, ZERO regressions · **Session:** 2026-07-24

## The gap
The two `||`-combinator text-decor grammars were raw-store:
- `text-decoration-skip-spaces` — invalid 0/19, valid 5/6 (`end start`→`start end`
  reorder missing), computed 0/5 (fully unregistered — not a known property).
- `text-underline-position` — invalid 0/6, valid 7/9 (`right under`→`under right` /
  `right from-font`→`from-font right` reorders missing), computed 7/7 (already
  round-tripping via raw-store, held).

## The spec (CSS Text Decoration 4)
- `text-decoration-skip-spaces` = `none | all | [ start || end ]` (inherited). `none`/`all`
  exclusive; else `||` of `start`,`end` (each ≤1, ≥1), canonical `start end`.
- `text-underline-position` = `auto | [ from-font | under ] || [ left | right ]`
  (inherited). `auto` exclusive; else `||` of one `<line>`(from-font|under) + one
  `<side>`(left|right), canonical prints `<line>` FIRST.

## The fix (bootstrap.js) — two dedicated `_canonCssUi` `||` branches
- `text-decoration-skip-spaces`: single `none`/`all`/`start`/`end`; two tokens must be
  the distinct set {start,end} → `start end`. Rejects none/all-mixed, repeats, >2 tokens.
  Newly registered: `_CSSUI_VALIDATED` + `_GCS_DEFAULTS` (`start end`, the spec initial) +
  `_INHERITED_PROPS`. `_GCS_DEFAULTS` membership auto-adds it to `_CSS_KNOWN_PROPS` (so
  CSS.supports + the computed listing recognize it). Computed = specified (canonical).
- `text-underline-position`: single `auto`/`from-font`/`under`/`left`/`right`; two tokens
  must be one `<line>` + one `<side>` in either input order, canonicalized `<line> <side>`.
  Rejects `auto X`, same-group pairs (`left right`, `under from-font`), >2 tokens. Added to
  `_CSSUI_VALIDATED` (already in `_GCS_DEFAULTS` + `_INHERITED_PROPS`).

## Results
| File | Before | After |
|------|:------:|:-----:|
| text-decoration-skip-spaces-invalid | 0/19 | **19/19** |
| text-decoration-skip-spaces-valid | 5/6 | **6/6** |
| text-decoration-skip-spaces-computed | 0/5 | **5/5** |
| text-underline-position-invalid | 0/6 | **6/6** |
| text-underline-position-valid | 7/9 | **9/9** |
| text-underline-position-computed | 7/7 | 7/7 (held) |

## Zero regressions
qsa 1975, classlist 1420, serialize-values 695/697; ruby-position-invalid 5/5,
dominant-baseline-computed 9/9, visibility-computed 3/3, text-orientation-computed 3/3,
break-inside-valid 5/5, text-decoration-line-computed 18/18 (shared `_canonCssUi`).

## Caps / Next
The css-text-decor property vein is now largely green. Remaining nearby: the
`text-decoration-color-computed` `inherit` fail (non-inherited color `inherit`
resolution — a different root cause). NEXT LEVERAGE: a NEW `css/*/parsing/` dir — scout
fresh. Templates: `_CSSUI_ENUM` (enum), the two new `||` branches here (skip-spaces /
underline-position). grep `text-decoration-skip-spaces`.
