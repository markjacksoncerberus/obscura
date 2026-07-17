# 209 — The Transition Verdict ✅

> *An entire `css-transitions/parsing/` dir was raw-store: all four longhands and
> the `transition` shorthand accepted every value verbatim. Five new validators —
> two pure gates, three canonicalizers — turned 0/55 invalid green and closed the
> serialization gaps in the valid files.* **+63, zero regressions.**

## The gap

Following #208's next-leverage (a NEW `css/*/parsing/` dir), I baselined the four
candidate dirs. `css-scroll-snap` (#? already modelled) and `css-will-change` came
back essentially green; `css-shapes` fully green. **`css-transitions` was pure
raw-store** — every `*-invalid` file at **0/N**, the classic tell:

| File | Baseline | Tell |
|------|:--------:|------|
| `transition-delay-invalid` | **0/5** | raw-store; `-valid` 4/4 already verbatim |
| `transition-duration-invalid` | **0/5** | raw-store; `-valid` 3/3 already verbatim |
| `transition-property-invalid` | **0/15** | raw-store; `-valid` 6/7 (one case-fold gap) |
| `transition-timing-function-invalid` | **0/25** | raw-store; `-valid` 18/22 (steps canon gaps) |
| `transition-invalid` | **0/5** | raw-store; `-valid` 7/10 (shorthand reorder gaps) |

No value handling existed for any of these — `_expandTransition` (the cascade-side
longhand splitter) was loose and only ran for computed style, never validating the
specified value stored inline.

## The work — five helpers (CSS Transitions 1)

All beside `_isValidImageResolution`; both setProperty paths wired
(inline `_parseStyleDecls` + the CSSOM API). CSS-wide keywords, var()/env(), and
any value bearing a math function (`_MATHFN_NAME_RE`) are deferred so a calc()
`<time>` is never mis-rejected (it flows to `_canonLengthTimeMath`).

- **`_isValidTransitionTime(value, nonNeg)`** — `transition-duration = <time [0s,∞]>#`
  / `transition-delay = <time>#`. A **pure rejection gate**: exactly one `<time>`
  per comma item (duration additionally non-negative). The accepted value is kept
  **byte-identical** (the `-valid` files already serialize via raw-store). Rejects
  `infinite`, `0` (unitless), `500ms 0.5s` (two toks), `-500ms` (duration), and any
  item that is a CSS-wide keyword (`-3s, initial`).
- **`_canonTransitionProperty(value)`** — `none | <single-transition-property>#`,
  `<single-transition-property> = all | <custom-ident>`. `all` → lowercased `all`; a
  `<custom-ident>` (via `_GRID_CI_RE`, a general ident matcher) kept verbatim;
  `none` valid only as the sole item. The excluded-keyword set is
  `none`/`default`/CSS-wide. Fixes `ALL, INVALID, SYNTAX, SRC` → `all, INVALID,
  SYNTAX, SRC` (+1 valid); rejects `one two three`, `1, 2, 3`, `none, one`,
  `initial, top`, `default, top`, `revert-layer, top`, …
- **`_canonTimingFunction(value)`** — `<easing-function>#`, dispatching per item to:
  - **`_canonCubicBezier`** — four `<number>`s, the two x-coords in `[0,1]`
    (`cubic-bezier(-0.1, …)`, `cubic-bezier(0.5, 0.1, 1.1, 0.9)` rejected).
  - **`_canonSteps`** — `steps(<integer [1,∞]> [, <step-position>]?)`; the count may
    also be `sibling-index()`. Drops the default position (`end`/`jump-end`);
    `jump-none` requires count ≥ 2. Rejects `steps(3.3,end)`, `steps(3,top)`,
    `steps(0,jump-start)`, `steps(1,jump-none)`, and the malformed
    `steps(2,()start)` / `steps(2())` / `steps(2,())` family. Canon:
    `steps(2, end)`→`steps(2)`, `steps(2, jump-end)`→`steps(2)`, `steps(4, start)`
    kept.
  - **`_canonLinearEasing`** — `linear( <number> <percentage>{0,2} # )`.
  - keywords: `linear`/`ease`/`ease-in`/`ease-out`/`ease-in-out` lowercased;
    `step-start`→`steps(1, start)`, `step-end`→`steps(1)` (+4 valid).
- **`_canonTransitionShorthand(value)`** — `<single-transition>#` where
  `<single-transition> = [none | <single-transition-property>] || <time> ||
  <easing-function> || <time>`. `_parseSingleTransition` slots the first `<time>` as
  duration (non-negative) and the second as delay, easing wins over `<custom-ident>`,
  rejects a second property/easing/`<time>` (`1s 2s 3s`, `-1s -2s`, `steps(1)
  steps(2)`, `none top`, `initial 1s`). `_serSingleTransition` emits the canonical
  order **property duration timing delay**, omitting each default (`all`/`0s`/`ease`/
  `0s`) — but printing duration whenever a non-zero delay is present, and falling
  back to `all` for an all-default layer. Fixes `1s -3s cubic-bezier(0, -2, 1, 3)
  top` → `top 1s cubic-bezier(0, -2, 1, 3) -3s`, `all 1s` → `1s` (+3 valid).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `transition-delay-invalid` | 0/5 | **5/5** |
| `transition-duration-invalid` | 0/5 | **5/5** |
| `transition-invalid` | 0/5 | **5/5** |
| `transition-property-invalid` | 0/15 | **15/15** |
| `transition-timing-function-invalid` | 0/25 | **25/25** |
| `transition-delay-valid` | 4/4 | **4/4** (held) |
| `transition-duration-valid` | 3/3 | **3/3** (held) |
| `transition-valid` | 7/10 | **10/10** |
| `transition-property-valid` | 6/7 | **7/7** |
| `transition-timing-function-valid` | 18/22 | **22/22** |

**+63, ZERO regressions.** Whole dir now 101/101. Sweep held: qsa 1975/1975,
classlist 1420/1420, scroll-snap-type-invalid 14/14, scroll-margin-invalid 20/20,
font-palette-invalid 4/4, font-language-override-invalid 6/6, font-valid 315/315,
image-resolution-invalid 5/5, gradient-position-invalid 9/9,
conic-gradient-calc-angle-percentage-invalid 4/4, background-image-invalid 12/12,
object-fit-invalid 5/5.

## Cap / Next

- **CAP:** none in this dir — `css-transitions/parsing/` is fully green.
- **NOTE:** the `animation-*` longhands (`animation-duration`,
  `animation-timing-function`, `animation-delay`, `animation-name`, …) share this
  exact grammar (`<time>#`, `<easing-function>#`) and are almost certainly still
  raw-store — the five helpers here are directly reusable. `css/css-animations/parsing/`
  is the obvious next lever; baseline its `*-invalid` files for the 0/N tell. The
  `animation` shorthand is harder (a longer `<single-animation>` with iteration
  count / direction / fill-mode / play-state / name), but the timing/delay/duration
  longhands should be near-mechanical.
- **NEXT LEVERAGE:** `css/css-animations/parsing/` (reuse `_canonEasing` /
  `_isValidTransitionTime`), OR a NEW `css/*/parsing/` dir not yet swept. Baseline
  `*-invalid` at 0/N first. grep `_canonTransitionShorthand`.
