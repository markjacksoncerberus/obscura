# Quest #256 — The Box-Edge Verdict

**Realm:** `css/css-box/parsing/` · **Properties:** physical `margin` / `padding` (+ their 8 edge longhands) · **+56, ZERO regressions**

## The gap

| File | Before | After |
|------|:------:|:-----:|
| `margin-shorthand.html` | 0/20 | **20/20** |
| `padding-shorthand.html` | 0/20 | **20/20** |
| `margin-invalid.html` | 0/7 | **6/7** |
| `padding-invalid.html` | 0/10 | **9/10** |
| `margin-computed.html` | 6/8 | **7/8** |

Physical `margin`/`padding` were stored as a single blob: `el.style.margin =
'1px 2px 3px 4px'` round-tripped as the shorthand but never populated
`el.style.marginTop` (so `test_shorthand_value` — which reads each longhand back —
failed 0/20), and out-of-grammar values (`available`, `10px border-box`, five tokens,
`calc() auto`) were accepted raw.

## The fix (all `bootstrap.js`)

Reused #245's eager-expansion machinery. Physical `margin`/`padding` (4-edge) were
added to `_BOX_LOGICAL_SH2`, the group that:

- **setProperty / inline parser** → `_expandBoxLogical` validates each edge component
  (margin: `auto | <length-percentage>` signed via `_canonMarginInsetComp`; padding:
  `<length-percentage [0,∞]>`, no auto/negatives via `_canonPaddingComp`) and STORES
  the per-edge longhands. Out of grammar (bad token / wrong arity) → the declaration is
  dropped.
- **getPropertyValue / getComputedStyle** → the longhand getter returns the stored edge
  directly; the shorthand getter reconstructs via `_serBoxLogicalSh` + `_serializeBoxValue`.
- **removeProperty / CSS.supports** → already threaded.

They were **kept in `_BOX_SHORTHANDS`** so `_serializeDeclBlock` (cssText) still
recombines the stored longhands back into `margin: …`/`padding: …`.

The 8 physical edge longhands (`margin-top/right/bottom/left`, `padding-…`) were added
to `_BOX_LOGICAL_LH` so the LONGHAND setter validates too (`margin-top: calc() auto`
→ rejected as two tokens). `_boxLogicalCanonFor` already dispatches padding-vs-margin
by `startsWith('padding')`, so the physical names route to the right component grammar
with no new code.

No new touch-point wiring was needed — the two sets were already threaded through every
CSSOM entry point by #245.

## Caps

`margin-bottom-left` / `padding-bottom-left` (one subtest each) are **non-existent
property names**. The CSSOM should ignore setting an unknown property, but Obscura's
raw-store — which many still-unregistered but valid properties depend on — accepts it.
Rejecting unknown properties needs a complete property registry; out of scope here.

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697, inset-shorthand 20/20,
inset-computed 8/8, margin-block-inline-shorthand 12/12, padding-block-inline-shorthand
12/12, margin-valid 15/15, padding-valid 11/11. margin-block-inline-computed 9/12 is the
pre-existing #245 `%`-needs-layout cap (unchanged).

## Next

The css-box enum invalids are a small clean vein: `clear-invalid` 0/2, `float-invalid`
0/3, `visibility-invalid` 0/2 (+ css-flexbox `order-invalid` 0/3). grep `_BOX_LOGICAL_SH2`.
