# Quests #306–#308 — the combined `corner` / `corner-<edge>` / `corner-<corner>` shorthands

**Session 2026-07-24. Branch `engine-per-page-threads`. +120, ZERO regressions, ONE commit.**

## The gap

#305 left the css-borders-4 `corner-shape` *feature* green but flagged the COMBINED
`corner-*` shorthands as its explicit next-leverage cap. Those shorthands fuse a
`border-radius` (a non-negative `<length-percentage>{1,2}`) with a `corner-shape`
(`<corner-shape-value>`) **per corner** — a whole shorthand family that was raw-store
(so every value stored verbatim and no longhand read back), plus the pre-2025 `corners`
spelling which was raw-stored (and so wrongly "accepted"). 11 files, 120 subtests:

| File | Before | After |
|------|:------:|:-----:|
| `corner-valid.html` | 4/9 | **9/9** |
| `corner-invalid.html` | 0/14 | **14/14** |
| `corner-computed.html` | 0/22 | **22/22** |
| `corners-invalid.html` | 0/23 | **23/23** |
| `corner-top-left-valid.html` | 3/11 | **11/11** |
| `corner-top-left-invalid.html` | 0/10 | **10/10** |
| `corner-top-left-computed.html` | 0/6 | **6/6** |
| `corner-top-valid.html` | 2/14 | **14/14** |
| `corner-top-computed.html` | 0/4 | **4/4** |
| `corner-block-start-valid.html` | 2/14 | **14/14** |
| `corner-block-start-computed.html` | 0/4 | **4/4** |

(`corner-block-start-writing-modes.html` was already 3/3 — it only checks the specified
round-trip + a non-empty computed, both of which raw-store already satisfied.)

## The value engine (`_CORNER_COMBINED_SH` + friends)

**Grammar.** A value is a `/`-separated **corner segment per corner** (border-radius
corner order top-left · top-right · bottom-right · bottom-left, with the `{1,4}` (four-
corner) / `{1,2}` (edge) box-edge expansion). Each segment is
`normal | [ <length-percentage [0,∞]>{1,2} && <corner-shape-value> ]` — **both** a
radius (1–2 `<lp>`) **and** a shape are mandatory (a lone `10px` or lone `scoop` is
invalid), except the standalone `normal` (== radius 0 + shape `round`, the initial).

- **`_CORNER_COMBINED_SH`** — maps each of the **17** combined shorthands (`corner`
  four-corner; `corner-{top,right,bottom,left}` + `corner-{block,inline}-{start,end}`
  edges; `corner-{top,bottom}-{left,right}` + `corner-{start,end}-{start,end}` single
  corners) to its ordered `[border-radius longhand, corner-shape longhand]` pairs. The
  corner order per edge mirrors `_CORNER_SHAPE_SH` exactly.
- **`_parseCornerSegment(seg, computed)`** — tokenizes one segment; classifies each
  token as a shape (`_canonCornerShapeValue`, at most one) or a non-negative radius
  (`_isNonNegShapeLP`, at most two); rejects if either is missing. `normal` short-
  circuits.
- **`_parseCornerCombined(sh, value, computed, emPx, lhPx)`** — top-level-`/` split
  (`_slashSplitTop`, paren-aware so `calc(4px/2)` survives), 1..max segments,
  `_boxEdges` (four-corner) / pair (edge) expansion, emits the radius + shape longhands.
- **SPECIFIED serialization** (`_serCornerCombined` + `_serOneCornerSeg`) — each corner
  serializes `<radius> <shape>`, collapsing to `normal` when its radius is all-zero AND
  its shape is `round`; the four-corner `{1,4}` collapse (`_collapseCornerSegs4`) joins
  with ` / ` (the corner shorthand's per-corner separator, NOT a space). Radius keeps
  its unit at specified (`2rem` stays `2rem`), collapses an equal `x x` pair to `x`.
- **COMPUTED** (`_serOneCornerSeg` with `computed=true`) — the shape resolves via the
  existing corner-shape `_normComputed` (`round`→`superellipse(1)`, `notch`→
  `superellipse(-infinity)`), the radius px-resolves via `_opLp` (`5rem`→`80px`,
  `1em`→`16px`, `%` kept), all-zero+round re-collapses to `normal`.

**Border-radius longhands stay raw-store.** The 8 `border-*-radius` longhands (4
physical + 4 logical) are written by the shorthand expansion but NOT registered as own
properties — so `border-radius`'s existing behavior (`border-radius-valid` 20/23) is
untouched, and computed radii are px-resolved here at reconstruction time (reading the
raw specified longhand and folding lengths) rather than through a new `_normComputed`
branch.

## Wiring (the 6 shorthand touch points, mirroring `_CORNER_SHAPE_SH`)

1. **setProperty** — expand + store the radius/shape longhands (CSS-wide → single key).
   Plus a one-line early reject: `if (name === 'corners') return;`.
2. **removeProperty** — clear both longhand families.
3. **getPropertyValue** — reconstruct + collapse (specified).
4. **computed getPropertyValue** — reconstruct from computed shape + px-resolved radius
   (`emPx`/`lhPx` from `_emPxOf`/`_lineHeightPx`).
5. **`_expandShorthand`** (cascade path).
6. **`CSS.supports`** + **`_CSS_KNOWN_PROPS`** (so `CSS.supports`/computed enumeration
   recognize all 17).

## #306 The Corner Four-Value Verdict (+42) — `corner` + `corners`

`corner-valid` 4→9, `corner-invalid` 0→14, `corners-invalid` 0→23. The four-corner
shorthand's `/`-segment grammar + the `_boxEdges`/`_collapseCornerSegs4` `{1,4}`
transpose; `corners` (renamed to `corner` in Aug 2025) hard-rejected so it never
raw-stores.

## #307 The Per-Corner Verdict (+42) — the edge & single-corner shorthands

`corner-top-left-valid` 3→11, `-invalid` 0→10, `corner-top-valid` 2→14,
`corner-block-start-valid` 2→14. The single-corner (no `/`) and 2-corner edge
(physical + flow-relative) forms, driving the matching physical/logical longhand pairs.
`test_shorthand_value` verifies each longhand (`corner-top-left: 10px bevel` →
`border-top-left-radius: 10px` + `corner-top-left-shape: bevel`; `normal` →
`border-top-left-radius: 0px` + `corner-top-left-shape: round`) AND `.length`.

## #308 The Corner-Computed Verdict (+36)

`corner-computed` 0→22, `corner-top-left-computed` 0→6, `corner-top-computed` 0→4,
`corner-block-start-computed` 0→4. Shape → `superellipse(<n>)`, radius lengths → px
(`3% 5rem superellipse(0.4)`→`3% 80px superellipse(0.4)`), all-zero+round → `normal`
(`0px round`→`normal`, `round 0%`→`normal`), re-collapsed via the same `{1,4}` rules
(`4px round / normal / 1em round / 4% round`→`4px superellipse(1) / normal / 16px
superellipse(1) / 4% superellipse(1)`).

## Zero-regression sweep

qsa 1975, classlist 1420, **serialize-values 695/697** (the box-shorthand canary — held
exactly, `_boxEdges` reuse safe), corner-shape base 71/241/38 (the shared shape
machinery), display-invalid 55/55, caret-color-invalid 12/12, scrollbar-color 13/13,
text-decoration-valid 17/17, webkit-box-computed 20/20, justify-items-computed 20/20.
**border-radius-valid 20/23** + border-radius-invalid 0/11 + webkit-border-radius 20/25
are PRE-EXISTING states (the `border-radius` shorthand is untouched raw-store).
`getComputedStyle-detached-subtree` 0/6 and `cssstyledeclaration-csstext` 7/11 STASH-
PROVED identical with vs. without the change.

## Caps / Next

- **CAP — `border-radius` itself is still raw-store.** `border-radius-invalid` 0/11 +
  `border-radius-valid` 20/23 + `webkit-border-radius-valid` 20/25 (css-backgrounds/
  parsing). The infrastructure now exists (`_opBorderRadius`, `_isNonNegShapeLP`); a
  future quest could register the `border-radius` shorthand + its 8 longhands as
  validated (invalid → reject) — but scope it tight (regression surface on the 20/23
  that already passes).
- **CAP — flow-relative corner logical→physical resolution.** `corner-block-start` etc.
  store into the LOGICAL longhands (`border-start-start-radius`, `corner-start-start-
  shape`) verbatim; we do not resolve them to physical under a writing-mode. The one
  writing-modes test passes anyway (it only checks non-empty computed), but a true
  logical-corner computed-mapping quest remains.
- **NEXT LEVERAGE:** scout a fresh `css/*/parsing/` dir — re-baseline even "mature"/green
  realms (a PARTIAL file, not just 0/N, is the tell). The `border-radius` shorthand
  (0/11 invalid) is the nearest concrete win if a shorthand-validation quest is wanted.
  Reusable templates: `_CORNER_COMBINED_SH` (a per-corner radius⊗shape shorthand family:
  `/`-segment split via `_slashSplitTop`, `{1,4}`/`{1,2}` transpose via `_boxEdges`,
  reconstruct-and-collapse joining with ` / `, radii px-resolved via `_opLp` at computed
  time while longhands stay raw-store); `_CSSUI_ENUM`; the `_CORNER_SHAPE_SH` template.
