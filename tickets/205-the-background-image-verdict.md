# Quest #205 — The Background-Image Verdict

**Realm:** `css/css-backgrounds/parsing/` (`background-image` value grammar)
**Result:** `background-image-invalid` **0/12 → 12/12**. **+12, ZERO regressions.**
**Commit:** `feat(css-backgrounds): three parallel rejection gates for background-image-invalid`

## The gap

`background-image-invalid` sat at **0/12** — every one of its 12 subtests probes a value
the property should REJECT (an invalid value leaves the property unset). All 12 fell into
three clean groups, and in every case the value was being *accepted and canonicalized*
instead of dropped. The canonicalizers (`_canonGradients`, `_canonCrossFadeInner`) were
LENIENT — built to serialize valid forms, they never validated — so, matching the
established `_imageFuncInvalid`/`_gradientInvalid` pattern, the fix is three **parallel
rejection gates**, canonicalizers untouched.

### Group 1 — negative radial radii (6)

```
radial-gradient(circle -10px at center, red, blue)              → wrongly accepted
repeating-radial-gradient(-10px at center, red, blue)           → wrongly accepted
radial-gradient(ellipse -20px 30px at center, red, blue)        → wrongly accepted
repeating-radial-gradient(-20% 30% at center, red, blue)        → wrongly accepted
radial-gradient(20px -30px at center, red, blue)                → wrongly accepted
repeating-radial-gradient(20px -30px ellipse at center, …)      → wrongly accepted
```

A radial `<radial-size>` is one or two `<length-percentage>` radii, and both must be
**non-negative**. `_canonRadialPrelude` happily kept negative radii and even canonicalized
around them (dropped `ellipse`, `at center` → `at center center`).

### Group 2 — `cross-fade()` percentages (5)

```
cross-fade(auto blue, 50% red)           → wrongly accepted
cross-fade(1px red, green)               → wrongly accepted
cross-fade(calc(1% + 1px) red, green)    → wrongly accepted
cross-fade(-1% red, green)               → wrongly accepted
cross-fade(101% red, green)              → wrongly accepted
```

CSS Images 4: `cross-fade() = cross-fade( <cf-image># )`, where
`<cf-image> = <percentage [0,100]>? && [ <image> | <color> ]`. `cross-fade()` was
CANONICALIZED (`_canonCrossFadeInner`) but never VALIDATED — no rejection gate existed at
all — so any token soup passed through: `auto`/`1px`/mixed-`calc()` were mis-read as the
`<image>` slot, and out-of-range percentages sailed through.

### Group 3 — bad `<bg-image>` layer (1)

```
background-image: none, auto             → wrongly accepted (stored "none, auto")
```

`background-image` is a comma list of `<bg-image> = none | <image>` layers. `auto` is
neither `none` nor an `<image>`, but there was no per-layer `<image>` validation, so the
raw value was stored.

## The fix

Three parallel rejection gates in `bootstrap.js`, leaving every canonicalizer untouched:

**(1) Negative radial radii.** Made `_gradientConfigInvalid` **type-aware**: threaded the
gradient `type` (`linear`/`radial`/`conic`, already extracted from the head) from
`_gradientInvalid` → `_gradientInnerInvalid` → `_gradientConfigInvalid`. For
`type === 'radial'` only, the prelude tokens *before any `at`* are the `<radial-size>`; a
literal negative `<length-percentage>` among them (`_isPosLP(t) && parseFloat(t) < 0`)
rejects the gradient. RADIAL-only because linear/conic preludes carry `<angle>`s, where a
negative value is valid (`linear-gradient(-45deg, …)`). Wired via the EXISTING
`_gradientInvalid` gate — zero new setProperty wiring.

**(2) `cross-fade()` grammar.** New `_crossFadeInvalid(value)` (balanced-paren head scan,
parallel to `_gradientInvalid`; fast-path on no `cross-fade(`, defers on var()/env()). For
each comma-separated `<cf-image>`: partition tokens into plain-`%` (`/^[+-]?\d…%$/`) vs
rest; reject if **>1 percentage**, if **rest.length !== 1** (must be exactly one
`<image>|<color>`), or if the percentage is **outside `[0,100]`**. This catches every
group-2 case: `auto blue`/`1px red` → two rest toks; `calc(1% + 1px) red` → the calc is one
non-% token, so two rest toks; `-1%`/`101%` → out of range. Valid `50% url(…)`, `red 33%`,
`blue`, and nested `cross-fade(red 2%, green)` each leave exactly one rest token with an
in-range (or absent) percentage.

**(3) Bad `<bg-image>` layer.** New `_bgImageLayersInvalid(value)`, **name-guarded to
`background-image`**: each comma layer must be a single token that is `none`, an `<image>`
function/url() head (`_isBgImageTok`), or a `light-dark()`. Defers on var()/env().

Both new gates wired into BOTH setProperty paths (inline ~864, API ~1204), beside the
existing `_imageFuncInvalid`/`_gradientInvalid`.

## Regression caught & fixed mid-flight

The first cut of `_bgImageLayersInvalid` used only `_isBgImageTok`, which does NOT cover
`light-dark(` — so `background-image: light-dark(url("a"), url("b"))` (a **valid** layer)
was dropped, taking `background-image-valid` 13 → 10. Added an explicit `light-dark(`
allowance to the layer check → restored 13/13. (This is exactly why the sweep runs the
paired `-valid` file, not just the `-invalid` target.)

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `background-image-invalid` | 0/12 | **12/12** |
| `background-image-valid` | 13/13 | 13/13 (held) |

**Zero-regression sweep (all held):** background-valid 45/46 (pre-existing cap),
background-computed 39/39, gradient-position-invalid 9/9 + -valid 18/18,
gradient-interpolation-method-invalid 292/292 + -valid 1398/1398, image-function-valid
13/13 + -invalid 6/6, object-fit-invalid 5/5, object-position-valid 18/18,
image-orientation-invalid 12/12, mask-image-computed 47/47, line-clamp-valid 18/18,
cursor-invalid 10/10, qsa 1975/1975.

## Caps / Next

**CAP:** none in this file — all 12 won.

**NEXT LEVERAGE (same `css/css-images/parsing/` dir):**
`conic-gradient-calc-angle-percentage-invalid` **0/4** + `-valid` **1/6** — a PAIRED quest:
the invalid half is a `calc()` type-check rejection (`calc(50% + 30deg)` = length+angle type
error in a stop; `conic from calc(50% + 30deg)` — `from` takes `<angle>` not angle-%;
`calc(50% + 0)` = %+number), but the valid half needs the HARDER calc-term-reordering
serialization (`calc(0deg + 100%)` → `calc(100% + 0deg)` — order %-before-dimension, a
`calc()` serialization feature bigger than a pure gate). Alternatively a NEW `css/*/parsing/`
dir (baseline the `*-invalid` file at 0/N first). grep `_crossFadeInvalid`.
