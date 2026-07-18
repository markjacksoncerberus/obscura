# Quest #192 — The Color Verdict

**Realm:** `css/css-color/parsing/` — the `<color>` invalid-value gate
**Prop:** every `_COLOR_PROPS` property (`color`, `background-color`, `border-*-color`,
`outline-color`¹, `text-decoration-color`, `column-rule-color`, `caret-color`¹,
`text-emphasis-color`)
**Result:** **SECURED — +560 subtests, zero regressions** (session 2026-07-12)

The single widest-tail change of the campaign so far: one small gate on an existing,
already-robust validator lit up ~560 subtests across five realms.

---

## The gap

Every `_COLOR_PROPS` property stored its value **raw** — the `setProperty`
`_COLOR_PROPS` branch only rejected `image()` and malformed `alpha()`/`contrast-color()`,
then canonicalized. It **never gated on the full `<color>` grammar**. So junk like
`color: auto`, `color: redd`, `rgb(1,2,3,4,5)`, `hsl(...)` with bad units, or
`color(srgb 0 0)` (too few channels) was silently accepted → every `color-invalid-*`
test failed:

| Test | Before | After |
|------|:------:|:-----:|
| `color-invalid-named-color` | 1/184 | **153/184** (+152) |
| `color-invalid-relative-color` | 0/161 | **132/161** (+132) |
| `color-invalid-color-layers-function` | 0/93 | **93/93** (+93) |
| `color-invalid-color-function` | 0/124 | **90/124** (+90) |
| `color-invalid-color-mix-function` | 0/141 | **33/141** (+33) |
| `color-invalid-rgb` | 0/30 | **15/30** (+15) |
| `color-invalid-lab` | 0/18 | **12/18** (+12) |
| `color-invalid-hex-color` | 0/10 | **10/10** (+10) |
| `color-invalid` | 0/11 | **8/11** (+8) |
| `color-invalid-hsl` | 0/23 | **8/23** (+8) |
| `color-invalid-hwb` | 0/6 | **2/6** (+2) |
| `color-invalid-contrast-color-function` | 9/9 | 9/9 (already gated) |
| **css-color subtotal** | | **+555** |
| `css-backgrounds/.../background-color-invalid` | 0/3 | **3/3** (+3) |
| `css-multicol/.../column-rule-color-invalid` | 0/2 | **2/2** (+2) |
| **grand total** | | **+560** |

## The work (all JS in `bootstrap.js`, no new Rust)

The validator `_isValidColor` already existed and was already good (named/system/hex,
legacy rgb/hsl, modern lab/lch/oklab/oklch/`color()`/hwb, `color-mix()`, relative
`rgb(from …)`, `alpha()`, `contrast-color()`). It was used by `CSS.supports` and
shadow/border-shorthand parsing — but **not** by the `_COLOR_PROPS` setProperty branch.

**(1) The gate.** In the `_COLOR_PROPS` branch, before canonicalizing:
```js
const _clow = stored.toLowerCase();
if (!_CSS_WIDE.has(_clow) && !_TF_VAR_RE.test(stored)
    && !(name === 'caret-color' && _clow === 'auto')
    && !_isValidColor(stored)) return;            // invalid <color> → ignore
```
CSS-wide keywords (`inherit`/`initial`/…) and `var()`/`env()` pass through (substitution
is computed-time); `caret-color` additionally accepts `auto` (defensive — caret-color is
actually handled earlier by `_CSSUI_VALIDATED`). This subsumes the old
alpha/contrast-color special-case (`_isValidColor` already validates those).

**(2) `light-dark(<color>, <color>)`** added to `_isValidColor` (CSS Color 5) — valid
when both top-level-comma-separated args are colours (`var()` passes). Without this the
gate would have **regressed** `color-valid`'s `light-dark(black, white)` (it was passing
via raw store). Depth-aware comma split so nested `rgb(0, 0, 0)` stays whole.

**(3) Specified-mode validity for modern colours.** The final `_computeModernColor`
check switched from computed mode to **specified** mode (`_computeModernColor(value,
true)`). In computed mode an unclamped channel that resolves to `calc(infinity)` /
`calc(-infinity)` (valid `lab` a/b, all `color()` components) returns `null` ("no finite
computed form — bail"), which would have **regressed 24 valid subtests**
(`color-valid-lab` −4, `color-valid-color-function` −20). Specified mode keeps a
math-function channel symbolic (via `_canonMathExpr`) instead of resolving it, so those
valid colours validate — while genuinely bad calc (`calc(red)`) still returns null.

## Zero-regression sweep

Full before/after via three `git stash` cycles on the valid side:

- **Valid colours (all held exactly):** color-valid 17/17, -hsl 21/59, -rgb 48/70,
  -hwb 26/38, -lab 150/150, -color-function 340/340, -color-mix 674/677,
  -relative-color 1146/1147, -contrast 17/17, -system 19/19, alpha-valid 45/45,
  opacity-valid 30/30.
- **Cross-realm colour props held:** background-color-valid 9/9, border-color-valid 7/7,
  border-color-shorthand 20/20, caret-color-valid 15/15, outline-color-valid 2/2,
  text-decoration-color-valid 3/3.
- **Held realms:** cssom/serialize-values 696/697, qsa 1975/1975, Element-matches
  669/669, Node-cloneNode 135/135, background-position-valid 31/31, color-computed 16/16.
- `_isValidColor`'s other callers (border/outline shorthand `_parseBorderSideStrict`
  /`_expandBorderShorthand`, box-shadow drop) only became **more permissive** (accept
  `light-dark`/calc-∞ colours) → can't regress a passing valid; box-shadow-valid uses
  neither construct.

## Caps / Next

- **In-realm remainder (a stricter `_isValidColor`, next lever):** the invalid tests
  that still fail are cases the *lenient* legacy branches accept —
  `color-invalid-color-mix-function` 33/141 (color-mix argument/percentage validation is
  loose), `color-invalid-hsl` 8/23 & `-rgb` 15/30 (the legacy `hsl` branch only checks
  "≥3 numeric parts"; `_rgbComponents` misses some mixed number/percent + range cases),
  `color-invalid-named-color` 153/184, `-lab` 12/18, `-hwb` 2/6, `-relative-color`
  132/161, `-color-function` 90/124. Tightening `_isValidColor`'s per-function grammar
  (strict component counts, number-vs-percent consistency, angle-unit rules, `none`
  placement, relative-colour channel-keyword scoping) is a large additional vein — do it
  incrementally and re-run the valid suites each step (they are the regression guard).
- **`color-computed-hsl`** is a pre-existing **could-not-run** (harness fails to load the
  page even on a fresh server; path is 200) — unrelated to a setProperty gate.
- **`color-computed-rgb`** 79/99 — pre-existing computed-serialization gaps (real
  `rgb(…)` output mismatches, not gate rejections); out of scope here.
- **NEXT REGION:** the `background` shorthand vein in `css/css-backgrounds/parsing/` —
  `background-valid` 1/46 (the `background` shorthand is unmodelled → single-key store)
  plus every sub-property `-invalid` at 0/N (background-repeat/-attachment/-clip/-origin/
  -size). ~80 subtests, self-contained, the same longhand-expand + `_canon*` pattern as
  the grid shorthands (#188→#191). Grammar already scouted (see session notes:
  background-size `1px`→`1px auto`, `auto auto`→`auto`; background-clip `text
  border-area`→`border-area text`; the `<bg-layer>#`/`<final-bg-layer>` shorthand).

¹ `outline-color` and `caret-color` are actually gated earlier by `_CSSUI_VALIDATED`
(which precedes the `_COLOR_PROPS` branch); the gate's caret-color `auto` exception is
defensive. `outline-color: invert` remains accepted by `_canonCssUi` (a separate,
pre-existing gap, not touched here).
