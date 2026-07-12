# Quest #191 — The Grid Verdict

**Realm:** `css/css-grid/parsing/` — the `grid` shorthand (all six grid longhands)
**Prop:** `grid` (over grid-template-rows/-columns/-areas + grid-auto-flow/-rows/-columns)
**Result:** **SECURED — +51 subtests, zero regressions** (session 2026-07-12)

This closes the entire `css/css-grid/parsing/` value-parsing vein (#188→#191).

---

## The gap

`grid` was unmodelled (fell through to single-key storage) → grid-shorthand-invalid
0/34, grid-shorthand-valid 32/49 (only the values that happened to survive raw
storage passed; nothing canonicalized, no auto-flow forms).

## The work (all JS in `bootstrap.js`, no new Rust)

`grid` (CSS Grid §7.8) is:
```
grid = <'grid-template'>
     | <'grid-template-rows'> / [ auto-flow && dense? ] <'grid-auto-columns'>?
     | [ auto-flow && dense? ] <'grid-auto-rows'>? / <'grid-template-columns'>
```

- **`_parseGridShort`** → the six longhands | null:
  - No `auto-flow` → **Form 1** `<'grid-template'>` (reuse `_parseGridTemplate`);
    grid-auto-flow/-rows/-columns → their initials (row/auto/auto).
  - `auto-flow` present → exactly one top-level `/`, and `auto-flow` on exactly
    one side (both/neither → invalid, e.g. `auto-flow / auto-flow`).
    - **Form 3** (`auto-flow` left): `[ auto-flow && dense? ] <'grid-auto-rows'>? /
      <'grid-template-columns'>` → grid-auto-flow `row`|`dense`, grid-auto-rows,
      grid-template-columns; grid-template-rows/areas + grid-auto-columns forced
      to initials.
    - **Form 2** (`auto-flow` right): `<'grid-template-rows'> / [ auto-flow &&
      dense? ] <'grid-auto-columns'>?` → grid-auto-flow `column`|`column dense`,
      grid-auto-columns, grid-template-rows; grid-template-columns/areas +
      grid-auto-rows forced to initials.
  - **`_parseAutoFlowSide`** consumes the leading `auto-flow`/`dense` (either order)
    then the trailing `<track-size>+` (default `auto`), rejecting a stray keyword
    before the track list (`auto / auto-flow foo()` → invalid track-size).
- **`_serGridShort`** (CSS Grid §7.8) — return `''` unless all six are set; then:
  - grid-auto-* all initial → serialize as `<'grid-template'>` (`_serGridTemplate`).
  - grid-template-areas ≠ none with non-initial auto-* → inexpressible → `''`.
  - else auto-flow form: `column` in grid-auto-flow → Form 2 (`rows / auto-flow
    [dense] [auto-columns]`, requires grid-template-columns none); otherwise Form 3
    (`auto-flow [dense] [auto-rows] / columns`, requires grid-template-rows none).

Wired like `grid-template` (expand + store the six longhands; getter/
removeProperty reconstruct/clear; `CSS.supports` branch).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| grid-shorthand-valid | 32/49 | **49/49** |
| grid-shorthand-invalid | 0/34 | **34/34** |

**+51 total. ZERO regressions** — held realms all unchanged (serialize-values
696/697, qsa 1975, grid-template-shorthand-valid 40 / -invalid 66, grid-area-valid
60, grid-auto-flow-valid 7, grid-auto-columns-computed 25, grid-template-areas-valid 9).

## Caps / Next

- The `css/css-grid/parsing/` **value-parsing** vein is now fully green (#188 track
  sizing, #189 `<grid-line>` placement, #190 grid-template, #191 grid). The only
  in-realm remainder is grid-template-columns/-rows **COMPUTED** (13 fail each) —
  a genuine **layout cap** (used track sizes need the grid track-sizing algorithm:
  `auto-fill/fit` repetition + collapse, `%`→used px).
- **Next lever (new realm):** the remaining untouched `css/*/parsing/` dirs —
  `css/css-scroll-snap/` remainder, and other CSS modules — same three-axis JS
  value-engine pattern (`_canon*` validate/canon + `CSS.supports` + `_GCS_DEFAULTS`).
  Baseline before committing.

grep `_parseGridShort`/`_serGridShort`/`_parseAutoFlowSide`/`_GRID_SH_LH`.
