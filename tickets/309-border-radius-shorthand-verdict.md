# Scroll 309 — The Border-Radius Shorthand Verdict (Quests #309–#311)

**Session:** 2026-07-24 · **Branch:** `engine-per-page-threads` · **Net:** +33 subtests, ZERO regressions, ONE commit

## The gap

`border-radius` was a **raw-store fake shorthand** — it echoed whatever string you set,
so any value where input == canonical passed by coincidence, and everything else failed:

| File | Before |
|------|:------:|
| `css/css-backgrounds/parsing/border-radius-invalid.html` | 0/11 |
| `css/css-backgrounds/parsing/border-radius-computed.html` | 0/14 |
| `css/css-backgrounds/parsing/border-radius-valid.html` | 20/23 |
| `css/css-backgrounds/parsing/webkit-border-radius-valid.html` | 20/25 |

The infra to fix it already existed from the #305–#308 corner-shape / corner-combined
arc (`_opBorderRadius`, `_isNonNegShapeLP`, `_boxEdges`, `_opCollapse4`, `_opLp`,
`_opClampRadius`). #308's scroll explicitly flagged this as the next quest.

## The grammar

```
border-radius = <length-percentage [0,∞]>{1,4} [ / <length-percentage [0,∞]>{1,4} ]?
```
Horizontal radii before the `/`, vertical after (vertical defaults to horizontal). Each
group is a 1–4 **box-edge** list (TL · TR · BR · BL). Each corner longhand
(`border-top-left-radius` …) is `<lp [0,∞]>{1,2}` — `h [v]`, an equal pair collapsing to one.

## The work (3 quests, one cohesive change)

**#309 Validation** — `_expandBorderRadius(value)` → `{4 corner longhands}` or null:
- `_commaSplitTop` guard (no top-level comma), `_slashSplitTop` (paren-aware, so a
  `calc(10px/2)`'s `/` doesn't split the H/V groups; >2 segments → invalid),
- each group 1–4 tokens, each `_isNonNegShapeLP` (rejects bare non-zero numbers, negatives),
- `_boxEdges` expands each group to 4, then per corner `h === v ? h : h+' '+v`.
- Wired into setProperty as a shorthand-expansion branch (mirrors `_CORNER_COMBINED_SH`):
  a CSS-wide keyword skips to single-key storage; otherwise expand into — and store as —
  the 4 physical corner longhands (`this._props[ln]`), no shorthand key kept.
- The 4 corner longhands are now real validated props: added to `_CSSUI_VALIDATED` +
  a `_canonCssUi` branch → `_serBorderRadiusLH(s, false)` (rejects `10px 20px 30px`).

**#310 Computed** — `_normComputed` branch: `_serBorderRadiusLH(v, true, emPx, lhPx)`
px-resolves each corner longhand (`calc(-0.5em+10px)`→`0px` via `_opClampRadius`,
`5em`→`200px`, `%` symbolic). A computed-serialize branch reconstructs the shorthand from
the **COMPUTED** longhands (`resolve(ln)`) and box-collapses via `_serBorderRadiusSh`.
`_GCS_DEFAULTS` gives each corner initial `0px` (not inherited).

**#311 Serialization + legacy alias** —
- `_serBorderRadiusSh(get)` reads the 4 corner strings, gathers H = [TL.h, TR.h, BR.h, BL.h]
  and V = [TL.v …], `_opCollapse4`s each, and drops `/ V` when `H === V`. Canonical:
  `1px 1px 1px 2% / 1px 2% 1px 2%` → `1px 1px 1px 2% / 1px 2%`. Wired at getPropertyValue.
- `-webkit-border-radius` + 4 `-webkit-border-*-radius` = Compat-spec legacy aliases
  (`_RADIUS_ALIAS`, mirroring `_GRID_GAP_ALIAS`) mapped to canonical names at **8 touch
  points**: setProperty, removeProperty, getPropertyValue, getPropertyPriority, the
  computed `resolve`, CSS.supports, `_parseStyleDecls` (cssText), `_cssParseDecls` (attr/sheet).
- The two cross-alias cssText round-trip tests pass because `_SHORTHAND_LONGHANDS['border-radius']`
  feeds per-corner `_sh` pending slots into the cascade (`_expandDeclInto`), so a
  cssText-set `border-radius` (stored as a single raw key, NOT expanded by the cssText
  setter) still reconstructs per-longhand for `getComputedStyle`.

## Touch points (the shorthand template)

setProperty expand · removeProperty clear · getPropertyValue serialize · `_normComputed`
(longhand computed) · computed-serialize (shorthand) · `_expandShorthand` · `_CSS_KNOWN_PROPS`
· CSS.supports · `_CSSUI_VALIDATED`+`_canonCssUi` (longhands) · `_GCS_DEFAULTS` ·
`_SHORTHAND_LONGHANDS` (cascade) · `_RADIUS_ALIAS` ×8 (legacy alias).

## Results

| File | Before | After |
|------|:------:|:-----:|
| border-radius-invalid | 0/11 | **11/11** |
| border-radius-computed | 0/14 | **14/14** |
| border-radius-valid | 20/23 | **23/23** |
| webkit-border-radius-valid | 20/25 | **25/25** |

**ZERO regressions.** The whole corner family held EXACTLY (corner-shape 71/241/38,
corner-invalid 14, corner-computed 22, corner-valid 9, corner-top-left-valid 11,
corner-top-left-computed 6, corner-top-computed 4, corner-block-start-computed 4). The
shared border-*-radius longhand double-resolution at computed time (corner-combined reads
them via `resolve` = computed, then re-`_opLp`s) is idempotent (px→px, %→%). Broad sweep:
qsa 1975, classlist 1420, serialize-values 695/697, cssstyledeclaration-csstext 7/11,
getComputedStyle-detached-subtree 0/6, shorthand-serialization 7/7, background-computed 39,
background-invalid 2, border-block-valid 6, display-invalid 55, webkit-box-computed 20,
box-sizing-computed 2, caret-color-invalid 12, outline-width-computed 9, flex-computed 14,
justify-items-computed 20, scrollbar-color-parsing 13, scrollbar-width-parsing 15.

## Caps / Next

- **CAP:** OM/parsing/computed only — rounded-corner **painting** (layout/render) untouched.
- **CAP:** the flow-relative `border-start-start-radius` … stay raw-store (used only by the
  corner-* shorthands; no logical→physical resolution — no test needs it yet).
- **NEXT LEVERAGE:** scout a fresh `css/*/parsing/` dir — CSS parsing is heavily mined, so
  re-baseline even mature realms (a PARTIAL file, like `border-radius-valid` 20/23 in an
  otherwise-green dir, is the tell). `background-size-computed` sits at **14/16** (2 fresh
  fails) — a small nearby vein. Reusable templates: `_expandBorderRadius`/`_serBorderRadiusSh`/
  `_serBorderRadiusLH` (box-edge H/V shorthand over 4 corners, px-resolve at computed while
  the longhand stays validated) + `_RADIUS_ALIAS` (name→canonical legacy-alias map at the 8
  CSSOM touch points).
