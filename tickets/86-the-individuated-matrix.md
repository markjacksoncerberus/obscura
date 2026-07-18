# Scroll 86 — The Individuated Matrix (`scale` / `rotate` / `translate`, CSS Transforms 2)

**Quest #86 · session 2026-06-23 · +142**

## The gap

The natural sequel to #85's `transform`: the three **individual transform
properties** `scale` / `rotate` / `translate` (CSS Transforms 2
§individual-transform). Unlike the `transform` shorthand — which collapses its
whole list to a single `matrix()`/`matrix3d()` — these keep their
keyword/number/angle form at computed time, only resolving units. Each has its
own grammar and its own trailing-component elision rule.

Obscura had none of them registered: no `_GCS_DEFAULTS` entry, no validation, no
canon. So every malformed form was accepted, computed fell through to verbatim,
and several valid forms needed canonicalization — the same three failure modes as
#82/#83/#84/#85, now ×3 properties.

| Test | Before | After |
|------|:------:|:-----:|
| `scale-parsing-valid` | 15/32 | **32/32** ✅ |
| `scale-parsing-computed` | 0/38 | **38/38** ✅ |
| `scale-parsing-invalid` | 0/8 | **8/8** ✅ |
| `rotate-parsing-valid` | 7/23 | **23/23** ✅ |
| `rotate-parsing-computed` | 0/23 | **23/23** ✅ |
| `rotate-parsing-invalid` | 0/9 | **9/9** ✅ |
| `translate-parsing-valid` | 14/20 | **20/20** ✅ |
| `translate-parsing-computed` | 0/19 | **19/19** ✅ |
| `translate-parsing-invalid` | 0/6 | **6/6** ✅ |

**+142. Every subtest green. Zero caps.**

> Note the file names are `*-parsing-*` (NOT `scale-valid` etc. as the #85 memory
> guessed) — `scale-valid.html`/`rotate-valid.html` 404 on wpt.live.

## The work (pure JS, `bootstrap.js`, NO new Rust)

Built on the #84/#85 scaffolding — reuses `_splitFilterTokens`, the `_FILTER_*`
regexes, `_isFilterZero`, `_LENGTH_PX`, `_ANGLE_DEG`, `_evalMath`, `_serNumber`,
`_canonMathExpr`, `_resolvePctLengthCalc`, `_TF_VAR_RE`. Three independent
serializers behind one dispatcher pair.

### scale — `none | [ <number> | <percentage> ]{1,3}`

- **`_isValidScale`** — 1–3 tokens, each a `<number>`, `<percentage>`, or a
  *dimensionless* math function. The dimensionless check (`_scaleCalcOk`) strips
  any `sign(…)` body (it yields a `<number>` from arguments of any type — e.g.
  `sign(1em - 1px)`) then requires `_evalMath(stripped, 1, {})` to succeed with
  **no units present** — so `calc(100px)`/`calc(1s) 2`/`calc(180deg) 2 3` fail
  (top-level dimension) but `calc(200% * sign(1em - 1px))` passes.
- **`_canonScale`** — per component: `<percentage>`→number fraction (`100%`→`1`,
  `1%`→`0.01`); SPECIFIED keeps calc symbolic via `_canonMathExpr`
  (`calc(4 * 100%)`→`calc(400%)`), COMPUTED resolves it to a number
  (`calc(1 + 1)`→`2`, `calc(2 * sign(1em - 1px))`→`2`). Then the **trailing
  elision**: drop z if it serializes to `1`, then drop y if equal to x —
  `100 100 1`→`100`, `100% 200% 1`→`1 2`, but `100 100 2`→`100 100 2` (z≠1, so all
  three kept even though x==y).

### rotate — `none | <angle> | [ x | y | z | <number>{3} ] && <angle>`

- **`_rotParse`** classifies each token (`_rotKind`: `kw`=x/y/z, `angle`=angle
  unit or angle-bearing math, `num`=bare number) and requires **exactly one
  `<angle>`** plus an axis of either nothing, one keyword, or three numbers.
  `100px`, `100 400deg` (1 number), `x y 45deg` (two keywords), `z` (no angle),
  `1 2 3` (no angle) → invalid.
- **`_canonRotate`** normalizes the axis vector to its serialized form:
  - parallel to ±x → `x <angle>`, ±y → `y <angle>` (angle **sign-flipped** when
    the axis points the reverse way: `-1 0 0 400grad`→`x -400grad`);
  - parallel to ±z → bare `<angle>` (`0 0 -1 400grad`→`-400grad`);
  - `0 0 0` → kept as `0 0 0 <angle>`;
  - arbitrary → `x y z <angle>` (numbers verbatim).
  The `<angle>` is always emitted last (`400grad x`→`x 400grad`). SPECIFIED keeps
  the angle's unit (`400grad`), COMPUTED converts it to deg (`400grad`→`360deg`);
  arbitrary-axis numbers are kept verbatim in computed too
  (`100 200 300 400grad`→`100 200 300 360deg`).

### translate — `none | <length-percentage> [ <length-percentage> <length>? ]?`

- **`_isValidTranslate`** — x/y accept `<length-percentage>`, **z is a pure
  `<length>`** (no percentage). `100deg`, `100px 200px 300%`,
  `100px 200px calc(30px + 30%)` (% inside z's calc), trailing junk → invalid.
- **`_canonTranslate`** — per component (`_trComp`): unitless `0`→`0px`;
  SPECIFIED keeps the unit (canon the number: `0.1px`→`0.1px`, `0em`→`0em`),
  COMPUTED resolves absolute/font-relative lengths to px (`0em 0em 100px`→
  `0px 0px 100px`); a **mixed %+`<length>` calc** serializes to the canonical
  `calc(P% ± Lpx)` form via `_resolvePctLengthCalc` (`calc(10px - 10%)`→
  `calc(-10% + 10px)` — the `_canonMathExpr` serializer does NOT reorder
  percentage before length, so we route through the position-engine's mixed
  resolver instead). The **trailing zero-*length* elision** drops a trailing y/z
  that is a zero length — `0`, `0px`, `0em` — but **never** `0%` (a percentage is
  kept): `100px 0px`→`100px`, `100px 0%`→`100px 0%`, `1px 2px 0`→`1px 2px`,
  `100px 0px 0px`→`100px`.

### Shared plumbing

- **`_balanceParens`** — the CSS tokenizer auto-closes any blocks/functions still
  open at EOF (Syntax 3 §consume-a-component-value); a one-paren-short value like
  `2 calc(300% * sign(1em - 1px)` is therefore valid. We append the missing
  close-parens before parsing, scoped to the individual-transform path.
- **`_INDIV_TRANSFORM`** set + **`_isValidIndividualTransform`** /
  **`_canonIndividualTransform`** dispatchers, wired into BOTH specified paths
  (`_parseStyleDecls` + `setProperty` — invalid value dropped/ignored, mirroring
  the transform/filter/alpha() pattern) and `_normComputed` (`kebab` in the set).
- `scale: 'none'`, `rotate: 'none'`, `translate: 'none'` added to `_GCS_DEFAULTS`.

## Two fixes found in the loop

1. **translate calc ordering** — `_canonMathExpr('calc(10px - 10%)')` returns
   the input order unchanged; the spec canonical is `calc(-10% + 10px)`
   (percentage first). Routing %-bearing translate calc through
   `_resolvePctLengthCalc` (already used by the `<position>` computed path) gives
   the right `calc(P% ± Lpx)` form for both specified and computed.
2. **unclosed-paren auto-close** — `scale-computed` pins
   `2 calc(300% * sign(1em - 1px)` (literally one `)` short) → `2 3`. Browsers
   auto-close at EOF; `_balanceParens` mirrors it.

## Zero-regression sweep

All purely additive — new helpers + new `_INDIV_TRANSFORM`-gated branches + 3
`_GCS_DEFAULTS` entries; **no shared primitive modified**, so the colour / filter
/ transform / serialize-values hot paths are byte-identical by construction.

- `serialize-values` 696/697 (the lone fail is the pre-existing #81 calc cap)
- `transform-valid/computed/invalid` 42/3/20 · `transform-origin-valid/computed`
  16/23 · `perspective-origin-valid/computed` 18/21 · `transform-box-valid` 5/5
- `color-computed-relative-color` 1163/1169 (pre-existing caps) · `color-valid`
  17/17 · `classlist` 1420/1420 · `createElement` 147/147
- `cargo test -p obscura-dom --lib` 40/40

> `filter-effects/parsing/*` came back **could-not-run** during the sweep — the
> whole directory 404s on wpt.live right now (`bodyLen=42`), **including the
> untouched `filter-valid`** that was 100% in #84. A directory-wide upstream 404
> is wpt.live serving flux, not a regression: the filter code path is unchanged.

## Caps / Next

**ZERO caps in this realm** — all 9 tests 100%.

Remaining `css-transforms/parsing` frontier (small, mostly grammar gates):
1. **`transform-origin-invalid`** 0/10 (valid 16/16 + computed 23/23 already
   green — pure validation gate, reuse the `<position>` grammar).
2. **`perspective-invalid`** / **`transform-box-invalid`** /
   **`backface-visibility`** / **`perspective-origin-invalid`** — small,
   unmeasured grammar gates.
3. `rotate`/`scale`/`translate` **interpolation/animation** tests (a different
   `css-transforms` subtree — needs the animation engine, likely out of reach).

Standing colour leverage (unchanged from #85): `light-dark()` computed (2 caps);
`var()`/`sibling-index()` computed (6 color-computed-relative caps); generalize
`_canonMathExpr` to the generic value path (hot-path risk → own quest);
`none`-component structured storage (~28 color-mix caps). Or a fresh realm.
