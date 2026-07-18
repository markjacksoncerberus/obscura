# Scroll 84 — The Filtered Verdict (`filter` / `backdrop-filter`, CSS Filter Effects 1)

**Quest #84 · session 2026-06-23 · +167**

## The gap

A fresh realm. CSS Filter Effects 1's `filter` and `backdrop-filter` properties
take a `<filter-value-list>` — a space-separated list of `<filter-function>`s
(`blur()`, `brightness()`, `contrast()`, `drop-shadow()`, `grayscale()`,
`hue-rotate()`, `invert()`, `opacity()`, `saturate()`, `sepia()`) or a single
`url()` reference; `none` stands alone. Obscura had `filter` registered in
`_GCS_DEFAULTS` with identity computed serialization and no validation at all —
so every malformed value was accepted and no function was canonicalized.

| Test | Before | After |
|------|:------:|:-----:|
| `css/filter-effects/parsing/filter-computed.html` | 11/83 | **83/83** ✅ |
| `css/filter-effects/parsing/filter-parsing-valid.html` | 78/87 | **87/87** ✅ |
| `css/filter-effects/parsing/filter-parsing-invalid.html` | 0/25 | **25/25** ✅ |
| `css/filter-effects/parsing/backdrop-filter-computed.html` | 0/28 | **28/28** ✅ |
| `css/filter-effects/parsing/backdrop-filter-parsing-valid.html` | 29/37 | **37/37** ✅ |
| `css/filter-effects/parsing/backdrop-filter-parsing-invalid.html` | 0/25 | **25/25** ✅ |

**+167. Every subtest green. Zero caps.** filter and backdrop-filter share an
identical grammar, so the one serializer wins both.

The three familiar failure modes (cf. #82 alpha / #83 contrast-color):
- **computed** fell through to verbatim (`brightness(300%)` stored as-is, not
  resolved to `brightness(3)`; `blur()` not filled to `blur(0px)`) → computed 11/83 + 0/28;
- the property setter **validates no values**, so every malformed form
  (`blur(10)`, `drop-shadow(10 20)`, `hue-rotate(90)`, `brightness(30px)`) was
  accepted → invalid 0/25 + 0/25;
- a handful of valid forms needed canon (`blur(0)`→`blur(0px)`,
  `grayscale(300%)`→`grayscale(100%)`, drop-shadow colour-first reorder).

## The work (pure JS, `bootstrap.js`, NO new Rust)

A self-contained filter serializer built on the existing `_evalMath` (calc) and
`_computeColor`/`_canonColorSpecified` (colour) primitives:

- **`_parseFilterValue`** — split a value into top-level space-separated tokens
  (`_splitFilterTokens`, paren-aware) → `{ none }` | `{ items: [{url}|{name,args}] }`
  or null. `none` must stand alone (`none hue-rotate(0deg)` → not parseable as a
  single function list → invalid).
- **`_isValidFilter`** / **`_isValidFilterFn`** — the grammar gate, wired into
  both specified paths (`_parseStyleDecls` + `setProperty`): an invalid
  `<filter-value-list>` is dropped (matching the existing `_GRADIENT_PROPS` /
  `alpha()` drop pattern). Per-function:
  - `blur(<length>?)` — non-negative `<length>`, a unitless `0`, empty, or calc;
    `blur(10)` (unitless non-zero) / `blur(-100px)` → invalid.
  - `hue-rotate(<angle>?)` — `<angle>`, unitless `0`, empty, or calc;
    `hue-rotate(90)` (unitless non-zero) → invalid.
  - `<amount>()` (the seven number-percentage functions) — `<number>` |
    `<percentage>` ≥ 0, empty, or calc; `brightness(-20)` / `brightness(30px)` →
    invalid.
  - `drop-shadow(<color>? && <length>{2,3})` (`_parseShadowArgs`) — 2-3 length
    offsets (3rd = blur radius) + an optional colour, any order;
    `drop-shadow(10 20)` (unitless), `drop-shadow(10% 20%)` (`%`),
    `drop-shadow(1px)` / `drop-shadow(1px 2px 3px 4px)` (length count),
    `drop-shadow(rgb(4,5,6))` (no lengths), `drop-shadow()` → invalid.
  - `url(...)` accepted as a filter reference; any other function name → invalid.
- **`_canonFilter(value, el, computed)`** — the shared serializer (specified =
  `computed:false`, computed = `computed:true`), wired into both specified paths +
  `_normComputed`.

The **SPECIFIED vs COMPUTED fork** (the crux):

| Function | SPECIFIED | COMPUTED |
|----------|-----------|----------|
| `blur()` | keep `blur()`; `blur(0)`→`blur(0px)`; calc/`<length>` verbatim | fill `blur(0px)`; resolve calc → px |
| `hue-rotate()` | keep `hue-rotate()`; `hue-rotate(0)`→`hue-rotate(0deg)`; calc/`<angle>` verbatim | fill `hue-rotate(0deg)`; resolve calc → deg |
| `<amount>()` | keep number/`%` form, clamp into range (`grayscale(300%)`→`grayscale(100%)`, `opacity(2)`→`opacity(1)`); calc verbatim | resolve to a bare `<number>` (`%`→fraction), fill default `1`, clamp ([0,1] for grayscale/invert/opacity/sepia, [0,∞) for brightness/contrast/saturate) |
| `drop-shadow()` | reorder colour first, keep given offsets (`0`→`0px`), colour via `_canonColorSpecified` | colour via `_computeColor` (omitted → `currentColor` = `_computedColorOf(el)`), each length → px, fill omitted blur `0px`; order `<color> x y blur` |

`url()` references and `none` pass through unchanged at both times.

### The one shared primitive: `_evalMath` `opts.cqZero`

The computed tests gate every container/viewport unit inside `sign(2cqw - 10px)`
(e.g. `blur(calc(100px + (sign(2cqw - 10px) * 50px)))` → `blur(50px)`), where
only the **sign** matters and `2cqw` resolves to 0 with no container — so the
expected value bakes in `2cqw < 10px` (sign = -1) everywhere. `_evalMath`
previously failed on these units (`tfail()`). Added a **narrow `opts.cqZero`
flag**: an unresolvable length unit returns `[0, false]` instead of failing —
**only** when the flag is set, which is passed **only** by the four
`_canonFilter` computed call-sites. Every other `_evalMath` caller (the entire
colour / serialize-values hot path) is byte-identical by construction.

## Zero-regression sweep

color-computed-relative 1163/1169, computed-color-mix 919/948, valid-relative
1146/1147, computed-color-function 466/468, valid-color-function 340/340,
valid-lab 150/150, gradient-interpolation-valid 1398/1398, cursor-valid 45/46,
color-valid 17/17, color-computed 16/16, classlist 1420/1420, createElement
147/147; `cargo test -p obscura-dom --lib` 40/40 — all match baseline exactly.

`serialize-values.html` (the hot-path serialization test) was **could-not-run
this session** — `bodyLen=42`, a wpt.live 404 (`{"error": {"code": 404}}`,
confirmed by `curl`ing the URL directly: the same 42-byte body for everyone).
This is documented serving flux, NOT a regression — and the `_evalMath` change
is gated behind `opts.cqZero` (never passed by serialize-values), so its output
is byte-identical by construction.

## Caps / Next

**No caps in this realm — all 167 subtests green.**

**Next leverage (unchanged from #83):** (1) **`light-dark()` computed** — passes
valid verbatim, computed should resolve to one branch (2 light-dark caps in
colour-computed). (2) **`var()` custom-property registration / `sibling-index()`
COMPUTED resolution** — the 6 color-computed-relative residual caps. (3)
**generalize `_canonMathExpr` to the generic value path** (serialize-values
additive-ordering cap + cursor `calc(2 + 0)`; REAL hot-path risk → own quest,
scope tight + sweep hard). (4) `none`-component structured storage (~28 hsl/hwb
color-mix caps). (5) a fresh realm — the filter realm proves untouched CSS
serialization modules can be one well-scoped serializer away from a flood of
greens; candidates worth a baseline: `transform`/`transform-computed` (was
20/42 + 0/3), `color-interpolation-filters` / `flood-color` / `lighting-color`
(the rest of filter-effects), `font-variant`.
