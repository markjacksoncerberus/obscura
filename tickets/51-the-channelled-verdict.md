# Quest #51 — The Channelled Verdict

**Realm:** `css/css-color/parsing/color-computed-rgb.html` (computed `rgb()`/`rgba()`
with `calc()` in the channels) · **Status:** SECURED, +36 · **Session:** 2026-06-19

## The gap

#49 built the computed-value colour engine and brought `color-computed-rgb.html` to
**59/99**. #50 added `_evalMath` — a recursive-descent evaluator for
`calc()`/`min()`/`max()`/`clamp()` — and explicitly named the follow-up: **reuse it
inside `rgb()`/`hsl()` channels** to win this test's 40 `calc()` fails.

The remaining 40 broke into five buckets (verified against the real WPT source):

| Bucket | Count | Example | Expected |
|--------|:-----:|---------|----------|
| calc constants / non-finite | 16 | `rgb(calc(infinity), 0, 0)` · `rgb(calc(NaN), 0, 0)` · `rgb(0, 0, calc(0 / 0))` | `rgb(255, 0, 0)` · `rgb(0, 0, 0)` · `rgb(0, 0, 0)` |
| `sign()` + `<length>` | 18 | `rgb(calc(50% + (sign(1em - 10px) * 10%)), 0%, 0%, 50%)` | `rgba(153, 0, 0, 0.5)` |
| escaped function name | 2 | `r\67 b(00, 51, 102)` · `r\gb(00, 51, 102)` | `rgb(0, 51, 102)` |
| `var()` (CAP) | 2 | `rgb(var(--high), 0, 0)` | `rgb(255, 0, 0)` |
| `2cqw` container units (CAP) | 2 | `rgba(calc(50% + (sign(2cqw - 10px) * 10%)), …)` | depends on container width |

Two reasons the whole family failed at the *gate*, before any computed value was read:

1. **`CSS.supports` returned `false`** — `_isValidColor`'s regex `^rgba?\([^)]*\)$`
   uses `[^)]*`, which stops at the **first** `)`. A nested `calc(infinity)` has its
   own `)`, so the whole value never matched as `rgb()` → invalid → the harness's
   `assert_true(CSS.supports(...))` failed.
2. Even past the gate, `_computeColor` split channels with `parseFloat` and a naive
   `split(/[,\/\s]+/)`, which shatters `calc(50% + (… * 10%))` and can't evaluate it.

(Capitalization — `RGB(...)`/`RGBA(...)` — was already green; the `i` regex flag and
the internal `.toLowerCase()` handled it. The mangled `wpt_fails.py` multiline output
made it *look* like a fail.)

## The fix (pure JS, `bootstrap.js`, no new Rust)

All built on #50's `_evalMath`, beside `_computeColor`/`_isValidColor`:

- **`_splitTopLevel(inner)`** — split a function body into top-level components,
  treating comma / slash / whitespace as separators but never splitting inside nested
  parens. Unifies legacy `rgb(r, g, b, a)` and modern `rgb(r g b / a)` (both → up to 4
  components).
- **`_unescapeIdent(s)`** — CSS identifier unescape: `\67`(hex, one optional trailing
  whitespace consumed) and `\g` (literal). So an escaped/capitalised function name
  resolves to `rgb` before matching.
- **`_resolveChannel(raw, max)`** — CSS Color 4 channel resolution of a math result:
  `NaN`→0, `+∞`→`max` (255 for components, 1 for alpha), `-∞`→0; finite values pass
  through (`_serColor` does the final clamp/round). `null` (parse failure) sticks.
- **`_rgbComponents(inner)`** — split → evaluate each component (`none`→0, else
  `_evalMath` with `percentBase` 255 for r/g/b and 1 for alpha) → resolve non-finite →
  `[r, g, b, a]`, or `null` if not a valid 3–4-component body.
- **`_computeColor`/`_isValidColor`** rewritten to extract the function name as
  *everything before the first `(`* (then `_unescapeIdent` + lowercase) and the inner
  as *everything to the final `)`* — so nested calc parens, escapes, and capitalization
  all fall out for free. `rgb`/`rgba` → `_rgbComponents`; `hsl`/`hsla` kept as-is.

**`_evalMath` extensions** (a third `opts` arg, default `{}` → opacity behaviour is
byte-identical):

- `opts.lengths` enables `<length>` **dimension tokens** — a unit ident glued to a
  number (`1em`, `10px`) resolves via a new `_LENGTH_PX` table (`em`/`rem`=16, `px`=1,
  plus absolute units). Viewport/container units (`vw`/`cqw`/…) are deliberately
  **absent** → the evaluator fails on them (we have no layout) → the 2 `cqw` subtests
  stay capped.
- `opts.nonFinite` lets `±∞`/`NaN` results through instead of returning `null`, so the
  channel caller can clamp them.
- **calc constants** as bare idents (no following paren): `infinity`, `nan`, `pi`, `e`
  (`-infinity` falls out of unary-minus on `infinity`).
- **`sign()`** and **`abs()`** functions (`Math.sign`/`Math.abs`).

For `sign(1em - 10px)`: `1em` = 16px > 10px → `sign(6)` = +1, so
`calc(50% + (1 * 10%))` = 60% of 255 = **153**. Every `1em - 10px` subtest resolves to
the same sign (+1), independent of the exact em value, as long as em > 10px (initial
font-size 16px). Opacity is untouched: it calls `_evalMath(value, 1)` with no `opts`, so
lengths fail and non-finite results return `null` (echoed) exactly as before.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `color-computed-rgb.html` | 59/99 | **95/99** (+36) |

The 36 wins: 16 calc-constant/non-finite + 18 `sign()`/`<length>` + 2 escaped names.

**Zero regressions** (swept on a fresh server): color-computed 16/16,
color-computed-hex-color 6/6, color-computed-named-color 455/455 (the highest-risk
shared `_computeColor`/`_isValidColor` paths), opacity-computed 30/30 (shared
`_evalMath`), qsa 1975, classlist 1420, matches 669, closest 29, has-specificity 8,
not-specificity 8, valid-invalid 30, disabled 7, readwrite-readonly 25,
structured-clone 141/152, getRandomValues 39, mark 22; obscura-dom unit 40/40.

## Caps (honest)

- **`var(--high)` / `var(--negative)`** (×2) — `rgb(var(--x), 0, 0)`. Needs a
  **custom-property cascade**: collect `--*` declarations through the inheritance chain
  (the test defines `--high: 500` / `--negative: -100` on `:root`, inherited by the
  target) and substitute before evaluating. A distinct primitive (custom-property
  resolution), deferred — the widest single next step here.
- **`2cqw` container-query units** (×2) — `sign(2cqw - 10px)` depends on the container's
  inline size, which needs real layout. Genuinely unwinnable without a layout engine.

## Caps / Next

`_evalMath` is now a broad primitive — calc constants, `sign`/`abs`, `<length>`
dimensions, non-finite handling, and channel evaluation. **Next leverage:**

- **(a) CSS custom-property cascade + `var()` substitution** — closes the 2 `var()`
  caps here and is a foundational primitive for much of `css/css-variables/` and the
  `*-computed.html` family. Collect `--*` from the cascade (the #47 cascade + #49
  inheritance walk are the templates), substitute, then re-evaluate. Mid-large.
- **(b) CSS inheritance + initial values for non-colour props** (`css-cascade/
  inherit-initial.html` 0/4, `css-color/inheritance.html` 1/4) — initial-values table +
  `inherit`/`initial`/`unset` + a generalised inheritance walk; the `color` inheritance
  from #49 is the template; widest `css/css-cascade` tail.
- **(c) reuse the same channel machinery inside `hsl()`/`hwb()`/`lab()`/`oklab()`**
  (`color-computed-hsl` was could-not-run — probe first; other colour-fn computed tests).
- **(d) a fresh realm** (`fetch/`, `html/dom/` reflection).
