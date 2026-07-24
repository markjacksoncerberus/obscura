# Quest #296 — The Relative-Channel-Type Verdict

**Realm:** `css/css-color/parsing/color-invalid-relative-color.html`
**Hold:** 132/161 → **161/161** (+29) · **ZERO regressions (stash-proved)**
**Session:** 2026-07-24

## The gap

Relative-colour syntax (`<fn>(from <origin> <ch1> <ch2> <ch3> [/ <a>])`) had its
STRUCTURE validated (#192) but not its CHANNEL TYPES. `_relativeStruct` (the
`_isValidColor` gate for relative colours) resolved each channel leniently, so 29
genuinely-invalid values were accepted. Two shapes:

1. **A bare `<percentage>` in the hue slot (8 fails).** The hue channel of
   `hsl`/`hwb` (index 0) and `lch`/`oklch` (index 2) accepts `<number>|<angle>|none`
   — never a `<percentage>`. `hsl(from … 10% s l)`, `hwb(… 10% …)`,
   `lch(… l c 10%)`, `oklch(… l c 10%)` (incl. `/40%`-origin variants) were accepted.

2. **A calc() additively mixing a channel keyword with an incompatible dimension
   (21 fails).** `rgb(from … calc(r + 1%) g b)` (number+percentage),
   `hsl/hwb(… calc(h + 1deg) …)` (number+angle), `calc(h + 1%)`,
   `lab/oklab(… calc(a + 1%) …)`, and every `color(… calc(r|x + 1%) …)` space.

## The insight

Relative-colour channel keywords **substitute to `<number>`s** (`_relSubst` replaces
`r`/`g`/`b`/`h`/… with the origin channel's numeric value). So `calc(r + 1%)` becomes
`calc((102) + 1%)` — a plain calc mixing a `<number>` and a `<percentage>`, which is a
calc **type error**. The existing type lattice already knows this: `_unifyType`
returns `null` for `number+percentage` and `number+angle` (only a `<percentage>`
unifies with a *dimension*, never with a bare `<number>` — CSS Values §calc typing).
So no new type machinery is needed — just run the value through `_mt`/`_mathReject`
AFTER substitution.

## The fix (`crates/obscura-js/js/bootstrap.js`, `_relativeStruct` channel loop)

For each of the three channel tokens, after `_relSubst`:
- **hue slot** (`i === hueIdx`): reject a bare literal `%` (`/^[-+]?[\d.]+%$/` — not a
  math fn, so `_mathReject` wouldn't see it), then `_mathReject(sub, ['number',
  'angle'], null)` — a hue calc may be number/angle-typed but a `%` leaf (pctType
  `null`) or a `number±angle`/`number±%` mix is a type error.
- **other slots**: `_mathReject(sub, ['number'], 'number')` — a `%` resolves to
  number (`calc(50%)` stays valid; `calc(50% * l / 100)` → percentage→number valid),
  but `number±%` still fails via `_unifyType`.

`_mathReject` only fires on strings containing a math function, so bare keywords and
bare valid literals are untouched.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `color-invalid-relative-color.html` | 132/161 | **161/161** |
| `color-computed-relative-color.html` | 1121/1169 | 1121/1169 (unchanged) |
| `color-valid-relative-color.html` | 1131/1147 | 1131/1147 (unchanged) |

**Stash-proved zero regression:** stashed the change → rebuilt → the two big
relative-colour files measured byte-identical (1131/1147, 1121/1169) with vs. without
the change; only the invalid file moved. Their pre-existing fails are `none`-channel
origins (`hsl(from hsl(none none none) h s l)`) and `var()`-origins — neither pattern
touched by the type-check. Held: qsa 1975, classlist 1420, serialize-values 695/697,
color-mix 141/141 + 943/948, color-computed 16/16, alpha-color-computed 32/32.

## Caps / Next

- The verified valid calc-channel patterns (`calc(50% * l / 100)` → percentage;
  `calc(120deg + 60deg)`, `calc(90deg + 1.5707rad)` → angle in a hue slot) all pass —
  the check is principled (real `_mt` algebra), not a keyword heuristic.
- **NEXT LEVERAGE:** scout a fresh `css/*/parsing/` dir. This session's whole seam
  (color-mix + relative colour, +137) came from `css/css-color/parsing/`, a realm the
  campaign had written off as mature — so re-baseline even "green" dirs: batch-scan
  `*-invalid`/`*-computed`, and a partial (not just 0/N) file is the tell.
