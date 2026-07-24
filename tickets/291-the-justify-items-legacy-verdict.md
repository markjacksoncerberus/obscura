# Quest #291 — The Justify-Items-Legacy Verdict

**Realm:** `css/css-align/parsing/` · **Result:** +3, ZERO regressions · **Session:** 2026-07-24

## The gap
The whole css-align/parsing dir was green EXCEPT the `justify-items: legacy`
computed vein:
- `justify-items-computed.html` — 18/20 (2 fail: `value 'legacy'` → `normal`, and
  `justify-items legacy depends on inherited value`).
- `place-items-computed.html` — 17/18 (1 fail: `value 'flex-end legacy'` →
  `flex-end legacy center`).

## The spec (CSS Align 3 §6.2)
`justify-items` initial value is `legacy`. A **bare** `legacy` computes to the
INHERITED justify-items value when that inherited value is itself a legacy value
(`legacy left/right/center`), else to `normal`. An explicit `legacy left/right/center`
is computed = specified. `place-items` reconstructs from computed align-items +
justify-items, so `flex-end legacy` (→ align-items:flex-end, justify-items:legacy)
computes to `flex-end <resolved-justify-items>`.

## The fix (bootstrap.js)
1. **Flipped the initial default** `_GCS_DEFAULTS['justify-items']` from `'legacy center'`
   → `'legacy'` (the real spec initial). This makes an unstyled ancestor terminate the
   inheritance chain at `normal` instead of wrongly seeding `legacy center`.
2. **NEW `_normComputed` branch** for `justify-items`: a bare `legacy` walks the parent
   chain (`_computedPropOf(el.parentElement, 'justify-items', 0)`) — returns the inherited
   value if it's `legacy left/right/center`, else `normal`. Every other value (incl. an
   explicit `legacy left/right/center`) is identity. The walk terminates at the root
   (parentElement null → `normal`).

justify-items is NOT in `_INHERITED_PROPS` (the legacy behavior is a computed-value
special case, not true inheritance) — so an unstyled element's computed path
(`_normComputed(el, 'justify-items', initial='legacy')`) hits the same branch and walks
its parents.

## Results
| File | Before | After |
|------|:------:|:-----:|
| justify-items-computed | 18/20 | **20/20** |
| place-items-computed | 17/18 | **18/18** |

Whole `css/css-align/parsing/` dir now fully green (all 30 invalid/computed files).

## Zero regressions
qsa 1975, classlist 1420, serialize-values 695/697; every sibling align computed file
held: align-items 13/13, align-self 14/14, justify-self 16/16, place-self 16/16,
align-content 14/14, justify-content 14/14, place-content 23/23.

## Caps / Next
None for justify-items. NEXT LEVERAGE seeded the css-text-decor vein (see #292/#293).
grep `justify-items` in `_normComputed`.
