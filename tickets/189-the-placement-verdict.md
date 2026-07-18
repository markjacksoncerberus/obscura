# Quest #189 — The Placement Verdict

**Realm:** `css/css-grid/parsing/` — the grid-line placement value engine
**Props:** `grid-row-start`, `grid-row-end`, `grid-column-start`, `grid-column-end`
(longhands) + `grid-column`, `grid-row`, `grid-area` (shorthands)
**Result:** **SECURED — +150 subtests, zero regressions** (session 2026-07-12)

---

## The gap

Same root cause as #179→#188: the four `<grid-line>` placement longhands stored
their value **RAW** in `setProperty` — no grammar check, no canonicalization — and
the three placement **shorthands** (`grid-column`/`grid-row`/`grid-area`) were not
modelled at all (they fell through to generic single-key storage, so their
longhands never got set). So:

- every `*-invalid` was **0/N** (junk placements accepted): grid-column-shorthand
  0/48, grid-row-shorthand 0/48, grid-area-invalid 0/25.
- `grid-area-valid` was 31/60 — the canonicalizations (`az 2`→`2 az`,
  `span 1 i`→`span i`, `SpAn`→`span`, `+90`→`90`, the omitted-value collapse) and
  the escaped/non-ASCII idents all failed.

## The work (all JS in `bootstrap.js`, no new Rust)

A self-contained `<grid-line>` value engine (CSS Grid §8.3):

```
<grid-line> = auto | <custom-ident>
  | [ <integer [-∞,-1]> | <integer [1,∞]> ] && <custom-ident>?   (integer ≠ 0)
  | [ span && [ <integer [1,∞]> || <custom-ident> ] ]            (bare `span` invalid)
```
where a line-name `<custom-ident>` excludes `span`, `auto`, the CSS-wide keywords
and `default`.

- **`_gridLineTokens`** — a grid-line tokenizer that splits on top-level
  whitespace but keeps `\`-escapes intact (a `\`+hex escape can embed a
  terminating space that is *not* a token separator, e.g. `\31 st`) and function
  parens whole (`min(-1, 6)`); `[`/`]` (a line-name group — not allowed in a
  `<grid-line>`) → null.
- **`_canonGridLine`** → `{ s, ci }` or null. `ci` is the ident when the line is a
  lone `<custom-ident>` (drives the omitted-value copy rule), else null. Canonical
  order: integer before ident (`az 2`→`2 az`); span form `span <int> <ident>` with
  a literal `1` dropped when an ident is present (`span 1 i`→`span i`).
- **`_canonGridLineInt`** — a literal non-zero integer (span form ≥1, sign
  normalized), or a math function folded to a canonical integer `calc()` via
  `_canonMathExpr` (`min(-1, 6)`→`calc(-1)`, `calc(sibling-index() - 2)`→
  `calc(-2 + sibling-index())`).
- **`_unescapeCssIdent` / `_serializeCssIdent`** — CSS Syntax unescape + CSSOM
  §serialize-an-identifier, so `\31st` and `\31 st` both canonicalize to `\31 st`
  (and compare equal for the copy rule) while non-ASCII idents (`-zπ`, `--a`,
  `π_`) pass through verbatim. `_GRID_CI_RE` validates the raw token (hex + char
  escapes, non-ASCII, `--` prefix).

**Shorthand expansion** (like `overflow`, expanded into and stored as longhands;
`getPropertyValue` / `removeProperty` reconstruct / clear them):

- `grid-column`/`grid-row` = `<grid-line> [ / <grid-line> ]?` → grid-`<axis>`-start
  /-end (`_parseGridColumnRow`). An omitted end copies the start when it is a lone
  `<custom-ident>`, else `auto`.
- `grid-area` = `<grid-line> [ / <grid-line> ]{0,3}` → the four placement longhands
  (`_parseGridArea`): column-start←row-start, row-end←row-start, column-end←
  column-start (each copy: the lone-custom-ident value, else `auto`).
- Reconstruction (`_serGridColumnRow`/`_serGridArea`) drops redundant trailing
  lines that equal their omitted defaults (`auto / i / auto / i`→`auto / i`,
  `1 / auto / auto / auto`→`1`).

A CSS-wide keyword goes to every longhand; a `var()` value is kept as a single
shorthand key. `CSS.supports` branches added for the longhands + shorthands.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| grid-column-shorthand | 0/48 | **48/48** |
| grid-row-shorthand | 0/48 | **48/48** |
| grid-area-valid | 31/60 | **60/60** |
| grid-area-invalid | 0/25 | **25/25** |

**+150 total. ZERO regressions** — held realms all unchanged (qsa 1975, Element-
matches 669, serialize-values 696/697, grid-template-columns-invalid 42,
grid-auto-columns-computed 25, grid-auto-flow-valid 7, css-overflow overflow-
computed 34, css-fonts font-valid 315).

## Caps / Next

- **Next lever:** the remaining grid shorthands in the SAME dir — `grid-template`
  (`grid-template-shorthand-valid` 24/40, `grid-template-shorthand-invalid` 0/66),
  `grid` (`grid-shorthand-valid` 32/49, `grid-shorthand-invalid` 0/34), and
  `grid-template-areas` (valid 6/9, invalid 0/11). These need `<string>`
  rectangle validation for the areas + the `grid`/`grid-template` multi-longhand
  expansion (`[ <line-names>? <string> <track-size>? <line-names>? ]+
  [ / <track-list> ]?` and the `auto-flow` / `<track-list> / <track-list>` forms),
  reusing #188's `<track-size>`/`_gridTokens` and this quest's `<grid-line>`
  primitives.

grep `_canonGridLine`/`_gridLineTokens`/`_parseGridArea`/`_parseGridColumnRow`/
`_serGridArea`/`_serializeCssIdent`/`_GRID_LINE_LH`.
