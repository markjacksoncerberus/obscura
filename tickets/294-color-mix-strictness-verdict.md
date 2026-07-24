# Quests #294–#295 — The Color-Mix Strictness Verdict

**Realm:** `css/css-color/parsing/color-invalid-color-mix-function.html`
**Hold:** 33/141 → **141/141** (+108) · **ZERO regressions**
**Session:** 2026-07-24

## The gap

`color-mix()` value validity flows through `_isValidColor` →
`_colorMixStruct(value, null) !== null`. `_colorMixStruct` is a deliberately
**lenient N-ary resolver** (it also computes the used value), and it was too
permissive in two independent ways, so 108 genuinely-invalid `color-mix()` values
were being accepted (raw-stored / clamped) instead of rejected:

1. **Malformed `<color-interpolation-method>` (44 fails).** `_parseMixMethod` just
   read `toks[1]` as the space and ignored every later token, so all of these were
   wrongly accepted:
   - `color-mix(in hsl hue, …)` — a bare `hue` keyword with no preceding method word.
   - `color-mix(in hsl shorter, …)` — a hue method word with no trailing `hue`.
   - `color-mix(in lab longer hue, …)` — a hue method on a NON-polar (rectangular) space.
   - `color-mix(in hsl foo, …)` — a garbage third token.
   - `color-mix(in hsl hsl(120deg 10% 20%), …)` — a colour glued onto the method for
     want of a comma; the lenient parser swallowed it as an extra method token and
     read the value as a valid 1-colour mix.

2. **Literal `<percentage>` out of `[0%,100%]` (64 fails).** `-10%` / `150%` were
   clamped (`-10%`→the other side `110%`) and accepted, instead of invalidating the
   whole function at parse time.

## The fix (`crates/obscura-js/js/bootstrap.js`)

**#294 — method strictness.** Rewrote `_parseMixMethod` to return `{ space, hue }`
for a well-formed method or **`null`** otherwise, mirroring the already-strict
specified-time validator `_canonColorMixMethod`: `in <space>` with an optional
`<shorter|longer|increasing|decreasing> hue` allowed **only** on a
`_GRADIENT_POLAR_SPACES` space (`hsl`/`hwb`/`lch`/`oklch`); a space not in `_CS_BASE`,
a wrong token count, a hue method on a rectangular space, or a garbage token → null.
`_colorMixStruct` now bails (`return null`) when the leading `in …` comma-part fails
to parse as a method.

**#295 — percentage range.** `_splitMixComp` distinguishes a LITERAL percentage
(`/^[-+]?…%$/`) from a `calc(…)` one and sets a `pctBad` flag when a literal is
`< 0` or `> 100`; `_colorMixStruct` returns null if any component is `pctBad`. A
calc()-derived percentage stays lenient — it is range-clamped at used-value time
per CSS Color 5, not rejected at parse.

## The pitfall (recorded so the next knight doesn't repeat it)

The tested spec is **N-ary color-mix**: `color-mix(in srgb, red)` (one colour),
`color-mix(in srgb, red, green, blue)` (three), and method-less
`color-mix(oklab(…), oklab(…))` are all VALID and compute. A first attempt gated
`_isValidColor` on the 2-ary-only specified serializer `_canonColorMix` — that
regressed `color-computed-color-mix-function` 943→884 (it rejects every 1-/3-/4-arg
and method-less mix, plus wrongly rejected `X 0%, Y 0%` which is valid). The correct
fix tightens **only** the method and the literal-percentage range inside the N-ary
resolver, leaving component count and the omitted-percentage fill untouched.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `color-invalid-color-mix-function.html` | 33/141 | **141/141** |
| `color-computed-color-mix-function.html` | 943/948 | 943/948 (unchanged) |

**Zero-regression sweep:** qsa 1975/1975, classlist 1420/1420,
serialize-values 695/697; color-computed 16/16, alpha-color-computed 32/32,
color-invalid-color-function 124/124, color-invalid-contrast-color-function 9/9,
color-invalid-relative-color 132/161 + color-computed-relative-color 1121/1169
(both unchanged). The lone `color-invalid` fail (`hsl(calc(0.56turn * -0.43turn), …)`)
is a pre-existing legacy-hsl-calc gap, untouched by this change.

## Caps / Next

- **CAP** `color-invalid-relative-color` 132/161 — the 29 fails are relative-colour
  CHANNEL-TYPE mismatches: a channel expression whose type doesn't match the channel
  (`rgb(from … calc(r + 1%) g b)` mixes number+percentage; `hsl(from … 10% s l)` /
  `lch(from … l c 10%)` set a hue channel to a percentage; `calc(h + 1deg)` mixes
  number+angle). A separate type-checking quest (#296 candidate) touching
  `_relativeStruct`/`_canonRelativeColor` — real regression surface
  (color-computed-relative-color is 1169 subtests), scope tight.
- **NEXT LEVERAGE:** the relative-color channel-type gate above, or scout a fresh
  `css/*/parsing/` dir (batch-scan `*-invalid`/`*-computed`, a 0/N file is the tell).
