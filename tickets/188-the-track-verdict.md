# Quest #188 — The Track Verdict

**Realm:** `css/css-grid/parsing/` — the grid track-sizing value engine
**Props:** `grid-template-columns`, `grid-template-rows`, `grid-auto-columns`,
`grid-auto-rows`, `grid-auto-flow`
**Result:** **SECURED — +155 subtests, zero regressions** (session 2026-07-12)

---

## The gap

The widest untouched `css/*/parsing/` dir. Same root cause as #179→#187: these
five longhands stored their value **RAW** in `setProperty` — no grammar check, no
canonicalization, no computed folding. So:

- every `*-invalid` was **0/N** (junk track lists were accepted): grid-template-
  columns-invalid 0/42, grid-template-rows-invalid 0/42, grid-auto-columns-invalid
  0/16, grid-auto-rows-invalid 0/15, grid-auto-flow-invalid 0/3.
- `*-valid` mostly passed via raw store, but the few needing canonicalization
  failed (`auto /**/`→`auto` comment strip; `[] 150px [] 1fr []`→`150px 1fr`
  empty-bracket drop; `grid-auto-flow: dense column`→`column dense` reorder).
- `*-computed` couldn't fold calc lengths (`calc(10px + 0.5em)`→`30px`) or expand
  `repeat(<integer>)`.

## The work (all JS in `bootstrap.js`, no new Rust)

A self-contained grid track-sizing value engine, dispatched via a new
`_GRID_VALIDATED` set in `setProperty` (invalid → ignore; CSS-wide/var() pass
through) + the two-arg `CSS.supports` path, with computed resolution in
`_normComputed`.

**Tokenizer** `_gridTokens` — splits a grid value into top-level tokens keeping
line-name groups `[ … ]` and functions (`minmax()`/`fit-content()`/`repeat()`)
whole, stripping comments; null on unbalanced brackets/parens.

**`<track-size>` grammar** (`_canonGridTrackSize`):
`<track-breadth> | minmax(<inflexible-breadth>, <track-breadth>) | fit-content(<length-percentage [0,∞]>)`
where `<track-breadth>` = LP≥0 | `<flex>` (`Nfr`, ≥0) | min-content | max-content |
auto, and `<inflexible-breadth>` drops `<flex>`. Each track-size also reports
whether it is a **`<fixed-size>`** (pins a definite `<length-percentage>` — a
fixed-breadth, or a minmax() with a fixed-breadth in either slot).

**grid-auto-columns/-rows** = `<track-size>+` — a bare space-separated list; line
names and `repeat()` are rejected (`1px [a] 1px`, `[] 1px []`, `auto, 10%` all
invalid).

**grid-template-columns/-rows** = `none | <track-list> | <auto-track-list>`
(`_canonGridTemplate`): a `[ <line-names>? [ <track-size> | repeat(…) ] ]+
<line-names>?` sequence — no two adjacent line-name groups, ≥1 track, line names
exclude `span`/`auto` (`[auto] 1px` invalid). `repeat()` (`_canonGridRepeat`) is
either a **normal repeat** `repeat(<integer [1,∞]> | <calc-int>, <track-list body>)`
or an **auto-repeat** `repeat(auto-fill|auto-fit, <fixed-size body>)`. The
`<auto-track-list>` constraints: **at most one auto-repeat**, and every other
component must be a **`<fixed-size>` or `<fixed-repeat>`** (a normal repeat whose
tracks are all fixed) — so `auto repeat(auto-fill, auto) auto` and
`repeat(auto-fill, min-content)` are invalid, while
`[one] repeat(2, minmax(10px, auto)) … repeat(auto-fill, 10px) …` (fixed-repeats
flanking one auto-repeat) is valid.

**grid-auto-flow** = `[ row | column ] || dense` (`_canonGridAutoFlow`) —
canonical form drops the default `row` (kept only when alone) and orders
direction before `dense` (`dense column`→`column dense`, `row dense`→`dense`).

**Serialization** drops empty `[]` groups, single-spaces line names, canonicalizes
each length/percentage/flex number, and reserializes `minmax(a, b)` / `fit-content(x)`.

**Computed** (`_normComputed`):
- grid-auto-columns/-rows (`_computeGridAutoTracks`): fold each `<length-percentage>`
  to px via `_trComp` (calc collapsed, `%` symbolic, negative → 0 via `_clampNegPx`);
  keywords/flex unchanged. `minmax(calc(10px+0.5em), max-content)`→`minmax(30px, max-content)`.
- grid-template-columns/-rows (`_computeGridTemplate`): the full resolved value is
  the **used** track sizes (needs the grid track-sizing algorithm = real layout),
  so we resolve only the **layout-independent subset** — purely fixed `<length>`
  tracks (no `%`, `<flex>`, intrinsic keyword, `minmax()`/`fit-content()`, or
  auto-repeat), where the used size equals the specified length and a normal
  `repeat(<int>)` (incl. a calc count like `repeat(calc(1 + 3*sign(100em-1px)), …)`)
  expands deterministically with **adjacent line-name groups merged at the seams**
  (`repeat(1, [b] 2px [c])` between `[a]` and `[d]` → `[a b] 2px [c d]`). Anything
  needing layout returns its specified serialization (a cap, **not** a wrong value).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| grid-template-columns-invalid | 0/42 | **42/42** |
| grid-template-rows-invalid | 0/42 | **42/42** |
| grid-template-columns-valid | 32/34 | **34/34** |
| grid-template-rows-valid | 32/34 | **34/34** |
| grid-template-columns-computed | 6/25 | **12/25** |
| grid-template-rows-computed | 6/24 | **11/24** |
| grid-auto-columns-invalid | 0/16 | **16/16** |
| grid-auto-rows-invalid | 0/15 | **15/15** |
| grid-auto-columns-valid | 29/30 | **30/30** |
| grid-auto-rows-valid | 29/30 | **30/30** |
| grid-auto-columns-computed | 18/25 | **25/25** |
| grid-auto-rows-computed | 18/25 | **25/25** |
| grid-auto-flow-invalid | 0/3 | **3/3** |
| grid-auto-flow-valid | 4/7 | **7/7** |
| grid-auto-flow-computed | 4/7 | **7/7** |

**+155 total. ZERO regressions** — held realms all unchanged (qsa 1975, Element-
matches 669, createElement 147, classlist 1420, url-origin 406/413, serialize-values
696/697, css-overflow overflow-computed 34 + scroll-axis-lock-computed 8, css-fonts
font-valid 315, css-align place-content-valid 23). The four adjacent grid **shorthand**
tests (grid-template-areas-valid 6/9, grid-shorthand-valid 32/49, grid-column-shorthand
0/48, grid-area-valid 31/60) were verified pre-existing via a `git stash` baseline —
identical before and after (untouched props).

## Caps / Next

- **grid-template-columns/-rows COMPUTED** (13 fails each) is a genuine **layout
  cap**: the resolved value of a track listing on a laid-out grid container is the
  **used** track sizes, which needs the grid track-sizing algorithm. The remaining
  fails all require it — `repeat(auto-fill, …)` repetition count, `repeat(auto-fit, …)`
  empty-track collapse to `0px`, and `%` tracks resolving against the used container
  size (`100%`→`1px` in a `width:1px` grid). We win only the fixed-length +
  normal-`repeat(<int>)` subset. Would need real grid layout — a separate Rust/layout
  quest.
- **The grid SHORTHANDS** are the widest still-open grid vein: `grid-column`/`grid-row`
  (`grid-column-shorthand` 0/48, `grid-row-shorthand`), `grid-area` (0/29 of 60),
  `grid-template` / `grid` shorthands (`grid-shorthand-valid` 17 fail,
  `grid-template-shorthand-*`), and `grid-template-areas` (6/9). These need
  `<grid-line>` parsing (`span`? `<integer>`? `<custom-ident>`?) + the multi-longhand
  `grid`/`grid-template` expansion — a different mechanism from the track-list engine,
  its own quest, mostly layout-independent (value parsing) so likely a strong ROI.
- **NEXT LEVERAGE:** the grid shorthands above (all in the SAME `css/css-grid/parsing/`
  dir), reusing this quest's `<track-size>`/`_gridTokens` primitives for the
  `grid`/`grid-template` expansions. Then the still-untouched `css/css-scroll-snap/`
  remainder and other `css/*/parsing/` dirs.

grep `_canonGrid`/`_GRID_VALIDATED`/`_gridTokens`/`_canonGridTrackSize`/
`_canonGridTemplate`/`_computeGridTemplate`/`_canonGridAutoFlow`.
