# Quest #82 — The Veiled Verdict

**`alpha()` relative-alpha function (CSS Color 5) — parsing-valid, parsing-invalid,
and COMPUTED. +58.**

`css/css-color/parsing/alpha-color-{computed,parsing-valid,parsing-invalid}`

## The gap

`alpha(from <origin> [ / <alpha-value> ])` (CSS Color 5 §relative-alpha) keeps the
origin colour's channels + colour space and replaces ONLY its alpha. Obscura had
no notion of it at all:

- **`alpha-color-computed` 0/32** — `alpha()` never resolved; it fell through to
  `_computeColor`, which returns the value verbatim → every computed case failed.
- **`alpha-color-parsing-invalid` 0/18** — the colour-property setter does NOT
  validate colours (it canonicalizes + stores), so EVERY malformed `alpha()` was
  accepted verbatim → all 18 "should be rejected" cases failed.
- **`alpha-color-parsing-valid` 37/45** — 8 needed canonicalization the engine
  couldn't do: origin normalization (`hsl(120 50% 50%)`→`rgb(64, 191, 64)`,
  `lch(50% 20 30)`→`lch(50 20 30)`, `ActiveText`→`activetext`), a calc() alpha
  reorder (`calc(alpha * 0.5)`→`calc(0.5 * alpha)`), and recognizing `alpha()`
  inside `color-mix()` / as a relative-colour origin.

## The work (pure JS, `bootstrap.js`, NO new Rust)

Built directly on the #79 structured cross-space engine (`_resolveColorStruct` /
`_csSerialize`) and the #81 calc-tree serializer (`_canonMathExpr`).

**Shared grammar parser — `_parseAlphaFn(value)`** → `{ origin, alpha }` (alpha =
the raw token string or null when omitted), or null on any malformed shape. The CSS
grammar is strict: `alpha( from <color> [ / <alpha-value> ] )` — `from` required,
exactly one origin token, an optional single `/ <alpha-value>` ws-token; commas,
extra tokens, multiple slashes, a missing origin/alpha, or channel keywords in the
origin position all → null. (`_wsTokens` keeps parenthesized groups intact, so a
`color-mix(…, …)` / `rgb(from …)` origin is one token; `_commaSplitTop` catches the
comma-syntax invalids.)

**Validity — `_isValidAlpha` / `_isValidAlphaValue`** (wired into `_isValidColor`
for `CSS.supports` + the setter drop). The origin must be a valid `<color>` (or
var()-bearing); the `<alpha-value>` may be a number/percentage/`none`/the `alpha`
keyword/`var()`/`sibling-index()`/`sibling-count()`/a `calc()` referencing only
those — a colour channel keyword (`r`/`l`/…) or a bare colour ident (`red`) is
**invalid** (`_isValidAlphaValue` substitutes the legal symbols → a number and
checks the expression still evaluates; a leftover ident leaves `_evalMath` null).

**SPECIFIED canon — `_canonAlpha`** (dispatched from `_canonColorSpecified`): the
origin runs through `_canonColorSpecified` recursively; a `calc()` alpha reorders
via `_canonMathExpr`; `var()`/`sibling-*()`/`alpha` stay verbatim.

**COMPUTED resolution — `_alphaStruct` + `_computeAlphaComputed`:**
- `_alphaStruct` resolves the origin to a structured colour (`_resolveColorStruct`,
  now with an `alpha(` dispatch so nested `alpha()` + `alpha()`-as-relative-origin
  work), then replaces the alpha. The `alpha` keyword inside the `<alpha-value>`
  reads the origin's alpha (a missing origin alpha reads as 0; `none` → missing;
  clamp [0,1]). The origin's space + channels are kept verbatim — **alpha() never
  converts colour spaces.**
- `_computeAlphaComputed` decides the **serialization form**: a *legacy* sRGB
  origin (`_isLegacyOrigin`: named/hex/transparent + the legacy functions
  `rgb`/`hsl`/`hwb`, incl. their relative `<fn>(from …)` forms, recursively through
  a nested `alpha()`) with a numeric (non-`none`) alpha serializes as
  `rgb()/rgba()` via `_serColor`; everything else (`currentcolor`, `color()`,
  `color-mix()`, lab/lch/ok*, OR a `none` alpha) serializes in its own space's
  canonical computed form via `_csSerialize`. A `none` alpha forces even a legacy
  origin into `color(srgb … / none)` — legacy syntax can't express a missing alpha.

Wired into `_normComputed` (before the relative branch; `_computeRelativeComputed`
gained an `alpha(`-exclusion since `alpha(from …)` matches its `[a-z]+(from` regex).

**System colours — `_SYSTEM_COLORS`** (the CSS Color 4 system-colour keyword set):
valid `<color>` keywords that serialize as the ASCII-lowercased ident, wired into
`_canonColorSpecified` + `_isValidColor` (root-cause fix — `ActiveText`→`activetext`
is one valid subtest, but system colours are now correct everywhere).

**Zero-arg math functions — `_parseCalcTree`:** `sibling-index()`/`sibling-count()`
have empty parens, which the recursive-descent parser couldn't handle (it required
≥1 argument). Added a zero-arg branch (`name()` → `{k:'fn', name, args:[]}`); the
serializer already emits `name()` for empty args. This unblocks the
`calc(sibling-index() * 0.2)`→`calc(0.2 * sibling-index())` reorder. Low-risk: it
only changes `fn()`-with-empty-parens, which previously failed (→ kept verbatim).

**Invalid-`alpha()` setter drop:** narrowly scoped — in both the batch parser and
`setProperty`'s `_COLOR_PROPS` branch, a value whose trimmed form starts `alpha(`
and fails `_isValidColor` is dropped. (The setter validates no other colours, so
this touches ONLY `alpha()` values, which were all stored verbatim/broken before.)

## Result

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `alpha-color-computed` | 0/32 | **32/32** | +32 ✅ 100% |
| `alpha-color-parsing-valid` | 37/45 | **45/45** | +8 ✅ 100% |
| `alpha-color-parsing-invalid` | 0/18 | **18/18** | +18 ✅ 100% |

**+58. ZERO regressions.**

## The serialization fork (the subtle part)

`alpha()`'s output form is NOT just "serialize the origin's computed value with a
new alpha" — relative `rgb(from red r g b)` computes to `color(srgb 1 0 0)`
standalone, yet `alpha(from rgb(from red r g b) / 0.8)` → `rgba(255, 0, 0, 0.8)`
(legacy). The rule is the origin's *syntactic* legacy-ness (`_isLegacyOrigin`),
EXCEPT `currentcolor` is non-legacy (`alpha(from currentcolor / 0.5)` with
`color:red` → `color(srgb 1 0 0 / 0.5)`, not `rgba(…)`) and a `none` alpha always
forces `color(srgb …)`. The test file itself notes the expectations may be
inconsistent (csswg-drafts #13992 / #13994); these match Chromium's behaviour.

## Zero-regression sweep

color-computed-relative-color 1163, color-computed-color-mix-function 919/948,
color-valid-relative-color 1146/1147, color-valid-color-mix-function 674/677,
color-valid-lab 150, color-valid-color-function 340, color-valid-hwb 38,
color-computed-lab 112, color-computed-hwb 54, color-computed-color-function
466/468, color-computed-rgb 95, color-valid 17, color-computed 16,
gradient-interpolation-method-valid 1398, gradient-position-valid 18,
image-function-valid 13, **serialize-values 696/697** (loaded this session — the
zero-arg calc change left the hot path byte-identical), cursor-valid 45/46,
Document-createElement 147, Element-getElementsByTagName 19; `cargo test -p
obscura-dom --lib` 40/40. All at their held baselines.

## Caps / Next leverage

No caps within the `alpha()` realm — all three tests are 100%.

**NEXT LEVERAGE:**
1. **`light-dark()` computed** — currently passes `valid` verbatim; computed should
   resolve to one branch (the 2 light-dark caps across the colour-computed family).
2. **`var()` custom-property registration / `sibling-index()` resolution** — the
   computed-relative residual caps (6 in color-computed-relative-color); needs
   registered custom-property resolution + real tree-position functions (now that
   `sibling-index()` *parses* in calc, computing it is the next step).
3. **Generalize `_canonMathExpr` to the generic value path** — the `serialize-values`
   `calc(10px + 1vmin + 10%)` additive-ordering cap (1 fail) + cursor `calc(2 + 0)`
   (1 fail). Carries the real hot-path risk → own quest, scope tight + sweep hard.
4. **`none`-component structured storage** — the ~28 hsl/hwb `none` caps in
   color-computed-color-mix-function (Obscura stores the lossy CSSOM `rgb(0,0,0)`);
   architectural.
5. fresh realm (`fetch/`, `html/dom/` reflection).
