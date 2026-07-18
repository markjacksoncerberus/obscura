# Quest #91 — The Charted Verdict (offset-path core)

**Session 2026-06-24 · +117 · pure JS, no new Rust · zero caps in the core trio · zero regressions**

## The gap

`offset-path` (CSS Motion 1 §2) was **never registered** in the engine. Values were
stored verbatim (passing only the 46/70 valid rows that happen to need no
canonicalization), every invalid value was kept (`offset-path-parsing-invalid` 0/24),
and — because the property wasn't in `_GCS_DEFAULTS` → not in `_CSS_KNOWN_PROPS` —
the `test_computed_value` support gate `assert_true('offset-path' in
getComputedStyle(target))` died at assertion 1 (`offset-path-computed` 0/65), the
exact failure shape from #89 (transform-box) and #90 (the offset longhands).

```
offset-path = none | <offset-path> || <coord-box>
<offset-path> = <ray()> | <url> | <basic-shape>
<coord-box>   = content-box | padding-box | border-box | margin-box
              | fill-box | stroke-box | view-box        (default: border-box)
<basic-shape> = inset() | circle() | ellipse() | polygon() | xywh() | rect()
              | path() | shape()
```

## The work

One self-contained module in `bootstrap.js` (after `_computeBgAxis`), plus a
`_GCS_DEFAULTS` entry (`'offset-path': 'none'`, not inherited) and five wiring
points (validate+canon in both specified paths `_parseStyleDecls`/`setProperty`,
and `_computeOffsetPath` in `_normComputed`). Built entirely on the existing
position/length/calc primitives — `_isPosLP`, `_parsePosition`,
`_serializePositionSpecified`/`_serializePositionComputed`, `_posComputeLen`,
`_canonLPToken`, `_canonMathExpr`, `_evalMath`, `_serAngle`, `_boxEdges`,
`_serNumber`. No shared primitive was modified — the diff is **purely additive**, so
every existing consumer is byte-identical by construction.

The dispatcher `_serOffsetPath(value, computed, el)` is the single source of truth —
validity is `_serOffsetPath(v, false, null) !== null`, specified canon is the
`false` path, computed is the `true` path. Per function:

- **ray()** `ray( <angle> && <ray-size>? && contain? && [at <position>]? )` — any
  order in, canonical order out (`<angle> <ray-size> contain at <position>`).
  `closest-side` (the default ray-size) elided. `at`'s position is collected
  greedily (stopping at the first non-position token — an angle/ray-size/contain),
  validated through `_parsePosition`. Specified keeps the angle unit (`0rad` stays,
  calc → `_canonMathExpr` `calc(135deg)`); computed → deg via `_evalMath{angle}`
  and the position → `%` (`at center center` → `at 50% 50%`).
- **path()** `path( <string> )` — a *lone* `<string>` (a `<fill-rule>` prefix is
  invalid per fxtf #512). `_opSvgPath` validates SVG command arg-counts (arc needs
  7, the empty path is rejected), collapses whitespace, lowercases `z`→`Z`, and
  canon's numbers (`10.0`→`10`). Computed accepts the specified form (the test
  allows either the absolutized or the as-authored serialization).
- **url()** `url( <url> )` → `url("…")`.
- **inset()** `<lp>{1,4} [round <border-radius>]?` — margin-style 1–4 collapse
  (`_opCollapse4`), `round 0` (all-zero) elided, border-radius via `_opBorderRadius`
  (the `h / v` form, `/` dropped when equal).
- **circle()** `[ <lp> | closest-side | farthest-side ]? [at <position>]?` —
  `closest-side` default radius elided.
- **ellipse()** `[ <radius>{2} ]? [at <position>]?` — both radii elided only when
  both are the default `closest-side`.
- **polygon()** `[ <fill-rule> ]? [round <length>]? , [ <lp> <lp> ]#` — the prelude
  is its **own comma section** (`polygon(round 1px, 1% 2%)`, not `…1px 1% 2%`); the
  fill-rule must precede `round` (`round 1px nonzero` is invalid); `nonzero` &
  `round 0` defaults elided; `round`'s value is a **non-negative `<length>`** (no
  `%`, no angle) via `_opLength`.
- **xywh()** / **rect()** `<basic-shape-rect>` — specified keeps the function form
  (`xywh(0 1% 2px 3em)` → `xywh(0px 1% 2px 3em)`); **computed converts to the
  equivalent `inset()`**: `xywh(x y w h)` → `inset(y, 100%−x−w, 100%−y−h, x)` and
  `rect(t r b l)` → `inset(t, 100%−r, 100%−b, l)`, the `100%−…` edges built by
  `_opPctPx`/`_opSerCalc100` (a `{pct,px}` split → `calc(99% - 48px)` etc.), `auto`
  rect edges resolving to the box (top/left→`0%`, right/bottom→`0%`).
- **`<coord-box>`** — the default `border-box` is elided whenever a path
  accompanies it (`inset(…) border-box` → `inset(…)`), but a *lone* coord-box is
  kept (`border-box` → `border-box`). The path always serializes first
  (`fill-box ellipse(…)` → `ellipse(…) fill-box`).

**`shape()` (CSS Shapes 2) is intentionally NOT canonicalized** — it is passed
through verbatim, exactly as the unregistered engine did, so its already-passing
cases don't regress. Implementing it is the sequel (see Next).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `offset-path-parsing-valid` | 46/70 | **70/70** |
| `offset-path-parsing-invalid` | 0/24 | **24/24** |
| `offset-path-computed` | 0/65 | **65/65** |
| `offset-path-shape-parsing` | 16/35 | 17/35 *(incidental +1)* |
| `offset-path-shape-computed` | 0/12 | 3/12 *(incidental +3)* |

**+117 total** (core trio +113, shape pass-through +4).

## Zero-regression sweep (all held)

background-position-valid 31, background-position-x-computed 19, mask-position-valid
23, offset-anchor-computed 14, offset-distance-computed 6, offset-rotate-computed 5,
transform-valid 42, scale-parsing-valid 32, color-computed-relative-color 1163/1169,
classlist 1420, calc-serialization 0/1 (standing cap, unchanged).

## Caps / Next

- **Zero caps in the core trio** (valid/invalid/computed all 100%).
- **`shape()` (CSS Shapes 2) — the clear sequel (~+27):** `offset-path-shape-parsing`
  18/35 + `offset-path-shape-computed` 9/12. The `shape()` grammar is a distinct
  segment list — `shape( [<fill-rule>]? from <position>, [<command>]+ )` with
  `move`/`line`/`hline`/`vline`/`curve`/`smooth`/`arc`/`close` segments
  (`by|to` relative/absolute, curve `with cp [/ cp]`, arc `of rx [ry] [cw|ccw]
  [large|small] [rotate <angle>]`). All the position/length/angle primitives this
  quest used apply directly; route it through `_opShape`'s `head === 'shape'` branch
  (currently the verbatim pass-through in `_serOffsetPath`). `nonzero` fill-rule &
  `arc … small rotate 0deg` defaults are elided; computed resolves lengths→px.
- **`offset` shorthand** (`offset-path-shorthand` valid 13/29, invalid 0/13) —
  composes offset-position/path/distance/rotate/anchor; best after shape().
- Standing colour leverage (light-dark()/sibling-index() computed) or a fresh realm.
