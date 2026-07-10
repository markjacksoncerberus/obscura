# Quest #179 — The Alignment Verdict (+366)

**Realm:** `css/css-align/parsing/` (the full CSS Box Alignment property family — 50 files)
**Result:** **249/618 → 615/618** across the realm (+366 subtests). **ZERO regressions.**
**Session:** 2026-07-10

## The gap

A fresh WIDE realm, chosen after the input-element vein thinned (#177/#178) and the
popover tail was heavily mined. The whole **CSS Box Alignment** property family —
`align-content`/`align-items`/`align-self`, `justify-content`/`justify-items`/
`justify-self`, the `place-*` shorthands, `row-gap`/`column-gap`/`gap`, and the
`grid-*-gap` legacy aliases — had **no value handling at all** in Obscura's
`CSSStyleDeclaration`. Values were stored raw, which meant:

1. **No validation** — every `*-invalid.html` test was **0/N** (~171 subtests):
   `align-items = "unsafe"`, `gap = "-10px"`, `justify-content = "legacy left"` were
   all wrongly accepted, so `getPropertyValue` never returned `""`.
2. **No canonical serialization** — the `*-valid.html` tails: `first baseline` should
   serialize `baseline`, `left legacy` → `legacy left`, `gap: 10px 10px` → `10px`.
3. **No shorthand expansion** — `gap`/`place-*` weren't parsed into longhands, so
   `gap-shorthand`, `place-*-shorthand`, and every `*-computed` reconstruction failed.
4. **No computed resolution** — `gap`/`place-*` computed values were empty (the
   shorthands weren't modeled), and `row-gap`/`column-gap` didn't resolve `em`/`calc`
   to px.

## The fix (all `bootstrap.js`)

A self-contained **Box-Alignment value engine**, mirroring the existing per-property
canon helpers and the `offset`/`border` shorthand model.

**1. Keyword grammar validator + canonicalizer** (`_alignCanonLonghand(prop, value)`).
A per-property capability table (`_ALIGN_PROPS`) drives one validator over the six
longhands. Encodes: `<self-position>` vs `<content-position>` sets, `<content-
distribution>`, `<overflow-position>` (which MUST precede its position — so
`start safe` is rejected), `<baseline-position>` (`[first|last]? baseline`, canonical
drops a leading `first`), the `left|right` extension (justify-* + content), `auto`
(self props), and the `legacy` keyword with `legacy && [left|right|center]` (either
input order → canonical `legacy X`). Returns the canonical string or `null` (invalid
→ the setter ignores the declaration). CSS-wide keywords + `var()`/`env()` pass
through untouched.

**2. `row-gap`/`column-gap` value** (`_canonGapItem`): `normal | <length-percentage
[0,∞]>`. A literal negative length/percentage is rejected; a bare non-zero number is
rejected (only `0` → `0px` is a valid unitless length); `calc()` passes (its sign is a
used-value concern).

**3. Shorthand expansion** into longhands (stored AS longhands, like `offset`):
- `_parseGapShorthand` — `gap`/`grid-gap` → `row-gap`/`column-gap` (omitted column
  copies row).
- `_parsePlaceShorthand` — `place-content`/`place-items`/`place-self` split into an
  align-half + justify-half by **greedily consuming a valid align value (1 then 2
  tokens) off the front** (unambiguous: no valid 2-token alignment value has a valid
  1-token prefix). An omitted justify half copies the align half, EXCEPT
  `place-content` where a `<baseline-position>` align half maps to `start` (which is
  what `justify-content` — no baseline — accepts). Handles the tricky
  `place-items: first baseline right legacy` → `align-items: baseline` +
  `justify-items: legacy right` (serializes `baseline legacy right`).
- `getPropertyValue`/`removeProperty` reconstruct/clear the shorthand from its
  longhands; equal halves collapse to a single value (`_serializeAlignShorthand`).
- `grid-row-gap`/`grid-column-gap` are legacy single-longhand **aliases**
  (`_GRID_GAP_ALIAS`) remapped in `setProperty`/`getPropertyValue`/`removeProperty`/
  `getPropertyPriority`.

**4. Registration + computed values:**
- `_CSS_KNOWN_PROPS` gains the shorthands + grid aliases so `CSS.supports()` and the
  `getComputedStyle` proxy recognize them; `CSS.supports` validates them by expansion
  (rejecting invalid values, like the border branch).
- `getComputedStyle` reconstructs `gap`/`grid-gap`/`place-*` from the **computed**
  longhands (grid-*-gap resolve through their single longhand).
- `row-gap`/`column-gap` added to `_LENGTH_COMPUTED_PROPS` + `_CLAMP_NEG_PROPS` so
  their computed value resolves `em`/`calc` → px and clamps a resolved negative to
  `0px` (`calc(10px - 0.5em)` → `0px`, `calc(10px + 0.5em)` → `30px`).

## Results (per file, before → after)

| Bucket | Before | After |
|---|---|---|
| `*-invalid` (10 files, validation) | 0/N each | **N/N** all |
| `*-valid` (canonicalization) | small tails | **N/N** all |
| `place-*-valid` | 15/23, 12/18, 11/16 | **23/23, 18/18, 16/16** |
| `gap`/`grid-gap`/`place-*`-shorthand | 8–10/N | **N/N** all |
| `*-computed` (gap-length resolution) | 0–4/N | **N/N** (gap/place/row/column) |
| **Realm total** | **249/618** | **615/618** |

## Caps / Next

- **`justify-items: legacy` computed-inheritance** (the ONLY 3 remaining fails —
  `justify-items-computed` 18/20, `place-items-computed` 17/18). Per spec, the
  computed value of a bare `legacy` is the *inherited* `justify-items` value if that
  value carries a `legacy` keyword, else `normal`. This needs a dedicated computed
  branch walking to the parent's computed `justify-items`, and it interacts with the
  pre-existing `_GCS_DEFAULTS['justify-items'] = 'legacy center'` initial-value hack —
  too entangled for the risk this session. Left as a documented cap.
- Shorthand expansion is done in `setProperty` (CSSOM); a `gap`/`place-*` in a **markup
  `style="…"` attribute** goes through `_parseStyleDecls`, which does NOT expand these
  (unlike `offset`/`border`). No parsing test exercises that path, but it's a known
  gap for cascade/computed correctness of markup-authored gap/place.
- **Next wide CSS-parsing levers** (same JS machinery, likely similar tails): the other
  untouched `css/*/parsing/` dirs — `css-text` (86 files), `css-fonts` (83),
  `css-grid` (61, `grid-auto-flow` already shows canon gaps), `css-ui` (42),
  `css-overflow` (35), `css-scroll-snap` (25). Each fails on the same three axes:
  missing per-property validation, canonical serialization, and computed resolution.

**DEV NOTE:** grep `_alignCanonLonghand` / `_ALIGN_PROPS` / `_ALIGN_SHORTHAND_LH` /
`_parsePlaceShorthand` / `_canonGapItem` / `_GRID_GAP_ALIAS` before touching CSS
alignment or gap values.
