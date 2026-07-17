# Quest #212 — The Animation-Range Verdict

**Realm:** `css/css-animations/parsing/` (the scroll-driven `animation-range-{start,end}`
longhands + the `animation-range` shorthand)
**Result:** +68 subtests, ZERO regressions. Session 2026-07-17.
**Lever:** #211's next-leverage — a fresh raw-store vein in the same dir.

---

## The gap

The scroll-driven animation-range properties were pure raw-store — `setProperty`
stored the value verbatim, so structurally-invalid junk slid through and author
serialization was never canonicalized:

| File | Baseline | Kind |
|------|:--------:|------|
| `animation-range-start-invalid.html` | **0/11** | raw-store tell |
| `animation-range-end-invalid.html` | **0/14** | raw-store tell |
| `animation-range-start-valid.html` | 21/26 | 5 canon gaps |
| `animation-range-end-valid.html` | 20/24 | 4 canon gaps |
| `animation-range-shorthand.html` | 22/133 | shorthand raw-store |

## The grammar

```
animation-range-start / animation-range-end =
  [ normal | <length-percentage> | <timeline-range-name> <length-percentage>? ]#
<timeline-range-name> = cover | contain | entry | exit | entry-crossing | exit-crossing
animation-range = [ <'animation-range-start'> <'animation-range-end'>? ]#
```

The range-name (when present) leads its pair; a bare `<length-percentage>` or `normal`
stands alone. Canonical serialization **drops a name's offset when it equals that name's
default position** — 0% for `-start`, 100% for `-end`: `cover 0%`→`cover` (start),
`cover 100%`→`cover` (end). A length `0px`, a calc offset, or any other value is kept.
Offsets canonicalize through the existing `_canonLPToken` (bare `0`→`0px`, calc sums
reordered %-before-length: `contain calc(10px + 10%)`→`contain calc(10% + 10px)`).

The `animation-range` shorthand pairs a start side with an optional end side. The end
is **omitted** when it is redundant with the start:
- the end canonicalizes identically to the start (`entry 0% entry 100%`→`entry` — both
  collapse to the bare name), OR
- the start carries **no** range-name and the end is its far-end default, `normal` or
  `100%` (`100px normal`→`100px`, `0% 100%`→`0%`).

A start *with* a range-name keeps an explicit `normal` end (`entry normal` stays), and a
calc offset never collapses (`entry calc(0%) entry calc(100%)` keeps both sides).

## The fix

New helpers beside `_canonAnimationShorthand` (~15565 in `bootstrap.js`), all four
setProperty branches wired (inline + API paths), var()/env()/CSS-wide deferred:

- **`_isLenPctTok`** — a single `<length-percentage>`: a length token (valid unit or
  calc/min/max/clamp via `_isLengthTok`), a percentage, or the unitless zero.
- **`_canonAnimRangeItem(item, isEnd)`** — one comma item of a longhand: `normal`; a bare
  `<timeline-range-name>` (lowercased); a bare `<length-percentage>` (through
  `_canonLPToken`); or `<name> <length-percentage>` with the default offset dropped.
  Rejects a name-second pair (`50% contain`), an unknown name (`peek 50%`, `50% enter`),
  a bare `none`, `normal <x>`, and ≥3-token items.
- **`_canonAnimRange(value, isEnd)`** — maps the item canon over `_commaSplitTop`.
- **`_splitAnimRangeSide` / `_canonAnimRangeShorthandItem` / `_canonAnimRangeShorthand`**
  — greedily split each comma item into a start side and an optional end side, canon each
  through `_canonAnimRangeItem`, then apply the end-omission rule above.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `animation-range-start-invalid.html` | 0/11 | **11/11** |
| `animation-range-end-invalid.html` | 0/14 | **14/14** |
| `animation-range-start-valid.html` | 21/26 | **26/26** |
| `animation-range-end-valid.html` | 20/24 | **24/24** |
| `animation-range-shorthand.html` | 22/133 | **56/133** |

**+68 subtests.** Every `test_valid_value` in all five files is green; the shorthand's
remaining 77 fails are ALL `test_computed_value` (see Caps).

## Zero-regression sweep

- qsa 1975/1975, classlist 1420/1420
- whole `css-transitions/parsing/` dir intact (timing-function-invalid 25/25,
  property-invalid 15/15)
- every `animation` longhand + shorthand at its #210/#211 baseline (animation-invalid
  8/8, animation-valid 12/12, name-invalid 9/9, name-valid 27/27, duration-invalid 6/6,
  iteration-count-invalid 5/5)

## Caps / Next

- **CAP — computed style (blocked, one shared mechanism):** the sibling
  `animation-range-start-computed.html` (0/30), `animation-range-end-computed.html`
  (0/29), and the shorthand's own 77 `test_computed_value` rows all fail with
  *"animation-range doesn't seem to be supported in the computed style"*. `animation-range-start`
  / `-end` are **not registered** in the initial-values map (`bootstrap.js` ~8619, beside
  the `animation-*` longhands) and there is no computed resolver + shorthand→longhand
  expansion for them. That is Quest #213's shape: (1) add `animation-range-start: normal`
  / `animation-range-end: normal` to the initial-values registry + computed-supported set;
  (2) a computed resolver (length em→px resolution, percentages kept, default-offset drop
  — mostly the specified canon we already own); (3) expand the `animation-range` shorthand
  into its two longhands so the shorthand computed reconstructs. ~136 subtests wait behind
  this one primitive (30 + 29 + 77).
- **NEXT LEVERAGE:** Quest #213 above (computed-style registration for `animation-range-*`),
  OR `animation-timeline` (`auto | none | <dashed-ident> | scroll()/view()`) — check
  whether it lives in `css/scroll-animations/` (NOT in `css-animations/parsing/`), OR a NEW
  `css/*/parsing/` dir (baseline `*-invalid` 0/N first). grep `_canonAnimRangeShorthand`.
