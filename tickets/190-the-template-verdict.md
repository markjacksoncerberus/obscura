# Quest #190 — The Template Verdict

**Realm:** `css/css-grid/parsing/` — the grid-template value engine
**Props:** `grid-template-areas` (longhand) + `grid-template` (shorthand over
grid-template-rows / -columns / -areas)
**Result:** **SECURED — +96 subtests, zero regressions** (session 2026-07-12)

---

## The gap

Same root cause as #179→#189: `grid-template-areas` stored its value RAW
(invalid 0/11 — junk `"" `/`"."`/non-rectangular accepted) and the `grid-template`
**shorthand** was unmodelled (fell through to single-key storage → invalid 0/66,
valid 24/40, no canon).

## The work (all JS in `bootstrap.js`, no new Rust)

- **`_gridTemplateTokens`** — a template tokenizer: `"…"`/`'…'` strings, `[ … ]`
  line-name groups, and function parens kept whole; a top-level `/` its own
  token; comments stripped; null on unbalanced.
- **`_gridAreaCells`** — split a string's interior per CSS Grid §7.3: a run of `.`
  is one null cell (serialized `.`), a run of other non-whitespace chars is one
  named cell.
- **`_gridAreasRectangular`** — every row same non-zero column count, and every
  named area forms a **filled rectangle**.
- **`grid-template-areas`** (`_canonGridTemplateAreas`) = `none | <string>+`:
  validate + normalize (whitespace-collapse, dot-runs → `.`, re-quote).
- **`grid-template`** (`_parseGridTemplate` → the three longhands):
  - `none` → all three `none`.
  - **Form A** `<'grid-template-rows'> / <'grid-template-columns'>` (no strings,
    exactly one `/`): each side through `_canonGrid` (`none | <track-list> |
    <auto-track-list>`); areas → `none`.
  - **Form B** (ascii-art) `[ <line-names>? <string> <track-size>? <line-names>? ]+
    [ / <explicit-track-list> ]?`: collect per-boundary line-name groups + per-row
    strings + optional row `<track-size>` (default `auto`, no `repeat()`); the
    trailing columns are an `<explicit-track-list>` via `_canonGridTrackSeq` (no
    repeat/auto-repeat). Line-name-group count per boundary is validated — **≤1**
    before the first / after the last string, **≤2** between strings (a row's
    trailing + the next row's leading) — so `[] [] "a"` and `"a" [a] [a]` are
    invalid but `"a" [a] [b] "b"`→`"a" [a b] "b"` is valid. Sets
    grid-template-rows = `[names0]? size1 [names1]? … sizeN [namesN]?` (auto kept),
    grid-template-columns = the column track-list (or `none`), grid-template-areas
    = the normalized strings.
- **`_serGridTemplate`** reconstructs the shorthand from the three longhands
  (returns `''` unless all three are set): Form A `rows / cols` (or `none`), or
  Form B by re-interleaving the row track-list's sizes/line-names with the area
  strings, `+ / cols` when columns aren't `none`.

Wired as a shorthand like `grid-column` (expand + store longhands; getter/
removeProperty reconstruct/clear); grid-template-areas validated in the
setProperty longhand chain. `CSS.supports` branches for both.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| grid-template-areas-valid | 6/9 | **9/9** |
| grid-template-areas-invalid | 0/11 | **11/11** |
| grid-template-shorthand-valid | 24/40 | **40/40** |
| grid-template-shorthand-invalid | 0/66 | **66/66** |

**+96 total. ZERO regressions** — held realms all unchanged (serialize-values
696/697, qsa 1975, DOMTokenList-stringifier 1/1, createElement 147, url-origin
406/413, grid-area-valid 60, grid-column-shorthand 48, grid-template-columns-
invalid 42, grid-auto-flow-valid 7).

## Caps / Next

- **Next lever:** the **`grid`** shorthand in the SAME dir (`grid-shorthand-valid`
  32/49, `grid-shorthand-invalid` 0/34). `grid` = `<'grid-template'>` (reuse this
  quest's engine) **plus** the auto-flow forms `<'grid-template-rows'> / [ auto-flow
  && dense? ] <'grid-auto-columns'>?` and `[ auto-flow && dense? ] <'grid-auto-rows'>?
  / <'grid-template-columns'>` (sets grid-auto-flow/-rows/-columns too, resetting
  the rest to initial). That closes the whole `css/css-grid/parsing/` value vein.

grep `_parseGridTemplate`/`_serGridTemplate`/`_canonGridTemplateAreas`/
`_gridTemplateTokens`/`_gridAreasRectangular`/`_GRID_TEMPLATE_LH`.
