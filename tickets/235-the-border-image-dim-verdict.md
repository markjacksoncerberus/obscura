# Quest #235 — The Border-Image-Dim Verdict

**Realm:** `css/css-backgrounds/parsing/` — the border-image slice/width/outset/repeat COMPUTED vein
**Result:** +29, ZERO regressions (session 2026-07-22)
**Branch:** `engine-per-page-threads`

## The gap

Took #234's next-leverage pointer (`border-image-width-computed` 0/12, a "fresh
raw-store vein"). Baselining revealed a whole coherent family, all failing
IDENTICALLY:

| File | Before |
|------|:------:|
| `border-image-width-computed` | 0/12 |
| `border-image-outset-computed` | 0/7 |
| `border-image-slice-computed` | 0/7 |
| `border-image-repeat-computed` | 0/3 |

Every failure was the same testharness line: *"border-image-\* doesn't seem to be
supported in the computed style"*. The four dimension/repeat longhands were
validated in `setProperty` (their `-valid`/`-invalid` files were already 100%) but
**never registered in computed style** — they weren't in `_GCS_DEFAULTS`, so
`_CSS_KNOWN_PROPS` didn't know them and `getComputedStyle().getPropertyValue()`
returned `""`. (`border-image-source` WAS registered, so `-source-computed` was
already 10/10.)

A secondary gap surfaced once registration was in place: the `-computed` tests set
`calc()` values (`calc(20% + 10px)`, `calc(0.5em + 10px)`, `calc(10 + sign(2cqw -
10px) * 5)`) that the specified-canon's literal-only regexes (`_biNum`/`_biPct`/
`_biLen`) rejected — so those values would have been dropped before computed
resolution.

## The fix (all `bootstrap.js`)

**1. Registration.** Added the four longhands to `_GCS_DEFAULTS` with their
initials — slice `100%`, width `1`, outset `0`, repeat `stretch` (none inherit).
This auto-registers them in `_CSS_KNOWN_PROPS`, lighting up the computed path.

**2. Computed folding — `_computeBorderImageDim`** (a `_normComputed` branch keyed
on `_BI_DIM_LH = {slice, width, outset}`). Splits the already-canonical value with
the paren-aware `_wsTokens` and folds each component via `_foldBiComp`:

- plain `<number>` → stays a number (`_serNumber`)
- plain `<percentage>` → stays a percentage
- plain `<length>` → px, clamped ≥0 (`_clampNegPx(_trComp(...))`)
- math function → fold **by type** (`_mt`):
  - number-typed → number (percentBase 0)
  - percentage-typed → `N%` (percentBase 100, so `20% + sign·5%` → `15%`)
  - PURE-length (`_mt(root, null) === 'length'`, i.e. no `%`) → px
  - MIXED length+% → **kept symbolic** (`%` has no computed base here, e.g. width
    `calc(20% + 10px)` stays verbatim)
  - `cqZero` collapses a `sign(2cqw…)` container-unit gate to 0 (no container)
- `auto`/`fill` → pass through (`fill` is kept last by canon)

Repeat is keyword identity (computed == canonical specified) → the `_normComputed`
fall-through `return v` handles it; registration alone was enough.

**3. Specified canon accepts math — `_biComp(tok, spec)`.** A shared per-component
validator/canonicalizer: a non-negative literal of an allowed kind, OR a math
function whose type (via `_mathValid(tok, spec.types, spec.pctType)`) matches, kept
symbolic via `_canonMathExpr(tok, {canonLen:true})`. Specs:

| Component | num | pct | len | math types | pctType |
|-----------|:---:|:---:|:---:|-----------|---------|
| slice  | ✓ | ✓ | — | `['number']` | `'number'` |
| width  | ✓ | ✓ | ✓ | `['length','number']` | `'length'` |
| outset | ✓ | — | ✓ | `['length','number']` | `null` |

`outset`'s `pctType: null` makes any `%`-bearing calc a type error (outset admits
no percentage). `_canonBiSlice`/`_canonBiWidth`/`_canonBiOutset` now route each
component through `_biComp` before `_biCollapse`.

## Wins (all → 100%)

- **width 0→12:** `20%`→`20%`, `calc(20% + 10px)`→symbolic, `calc(-0.5em + 10px)`→`0px`, `calc(0.5em + 10px)`→`30px` (em=40px), `1 auto 10px 20%` kept 4-value.
- **outset 0→7:** `0 calc(0.5em+10px) 3 calc(-0.5em+10px)`→`0 30px 3 0px`, `calc(10 + sign(2cqw-10px)*5)`→`5`, `… calc(20px + sign(2cqw-10px)*5px)`→`5 15px`.
- **slice 0→7:** `1 2% 3 4%` kept, `1% 2 3% 4 fill` kept, `calc(20% + sign(2cqw-10px)*5%)`→`15%`.
- **repeat 0→3:** `round`, `stretch repeat`, `round space` all round-trip.

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, getComputedStyle-property-order 1/1,
border-image-valid 30/30, border-image-shorthand.sub 30/30,
border-image-source-computed.sub 10/10, border-image-invalid 17/17, all 8
border-image `-valid`/`-invalid` files 100%. Broad calc sweep: columns-computed
27/27, flex-computed 14/14, tab-size-computed 10/10, grid-area-computed 35/35,
text-decoration-inset-computed 16/16, counter-reset-computed 10/10,
background-position-computed 32/32, background-computed 39/39. `round-mod-rem`
233/243 + `minmax-length-percent` 30/50 are documented pre-existing baselines.
Change is gated on the four `border-image-*` longhand names.

## Caps / Next

**CAP:** the border-image family in `css/css-backgrounds/parsing/` is now fully
secured — all 18 files at 100%.

**NEXT LEVERAGE:**
- `background-repeat-computed` **12/13** — a fresh single-fail lever in the SAME dir
  (most of `css/css-backgrounds/parsing/` `-computed` is green: background-position
  32/32, background 39/39).
- Cross-dir: `cursor-computed` 36/39 (gradient-cursor grammar — cursor images
  restricted to url()/image-set(), gradients rejected), `resize-computed` 5/6
  (`::before`/`::after` pseudo-element computed-style bug, deeper than value parsing).
- OR a NEW `css/*/parsing/` dir.

grep `_computeBorderImageDim` / `_biComp` / `_BI_DIM_LH`.
