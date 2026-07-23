# Quest #258 — The Anchor-Enum Verdict

**Realm:** `css/css-anchor-position/parsing/` (CSS Anchor Positioning 1)
**Bounty:** +62, ZERO regressions
**Date:** 2026-07-22

## The gap

`css/css-anchor-position/parsing/` was a fresh, never-baselined dir — a fat raw-store
vein (~146 subtests failing across 10 files). This quest took the three simplest
properties (the enums + the dashed-ident list); `position-try-fallbacks` (#259) and
the `position-try` shorthand + computed (#260) follow.

Baseline:
- `position-visibility-parsing` 12/30, `position-visibility-computed` 0/19
- `position-try-order-parsing` 9/12, `position-try-order-computed` 0/7
- `anchor-scope-parsing` 12/17, `anchor-scope-computed` 0/10

All three were unregistered (absent from `_GCS_DEFAULTS` → `-computed` 0/N) and
raw-store (no grammar gate → every out-of-grammar value wrongly accepted).

## The work (all `bootstrap.js`)

Three properties, wired through the existing css-ui infrastructure:

- **`position-try-order`** — plain keyword enum `normal | most-width | most-height |
  most-block-size | most-inline-size`. Added to `_CSSUI_ENUM` + `_CSSUI_VALIDATED`
  (rejects any two-keyword or comma combination).

- **`position-visibility`** — `always | [ anchors-valid || anchors-visible ||
  no-overflow ]`. NEW `_canonPositionVisibility`: `always` stands alone (never
  combines); the three flags combine order-independently (`||`) with no repeats and
  serialize in the fixed order anchors-valid · anchors-visible · no-overflow. The
  `-valid` file already expects the reorder at parse time (`anchors-visible
  anchors-valid` → `anchors-valid anchors-visible`), so the stored value is canonical
  and computed is identity. Dedicated `_canonCssUi` branch.

- **`anchor-scope`** — `none | all | <dashed-ident>#`. NEW `_canonAnchorScope`:
  `none`/`all` stand alone; otherwise a comma-separated list of `<dashed-ident>`s,
  each exactly one token (`--a --b` space-joined → invalid), no `none`/`all` mixed
  into the list, no bare (non-dashed) idents (`a, b, c` → invalid). Idents are
  case-sensitive → kept verbatim; the list preserves author order (`--bar, --foo`
  stays). Reuses `_GRID_CI_RE` (custom-ident grammar) + a `/^--/` dashed-prefix guard.
  Dedicated `_canonCssUi` branch.

All three registered in `_GCS_DEFAULTS` (initials `anchors-visible` / `normal` /
`none`; none inherit → the `assert_not_inherited` subtests pass). Computed value is
the stored canonical value (identity), so no `_normComputed` branch is needed.

## Results

All 6 files → 100% (33 → 95, **+62**).

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697 (2 pre-existing),
order-valid 3/3, writing-mode-invalid 2/2, position-valid 5/5, margin-trim 34/34,
margin-trim-computed 20/20. The change is purely additive (new keys in
`_CSSUI_ENUM`/`_CSSUI_VALIDATED`/`_GCS_DEFAULTS` + two new helper functions).

## Caps / Next

**NEXT (this arc):** `position-try-fallbacks` (#259) — `none | [ [<dashed-ident> ||
<try-tactic>] | <'position-area'> ]#` (fallbacks-parsing 33/57, fallbacks-computed
0/24); then the `position-try` shorthand + `position-try-computed` +
`position-visibility` sibling `position-try-parsing` 8/35 (#260). grep
`_canonPositionVisibility` / `_canonAnchorScope`.
