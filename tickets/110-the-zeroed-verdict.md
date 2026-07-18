# Quest #110 — The Zeroed Verdict

**All-`0%` args fold inside forcing math functions (`hypot`/`round`/`mod`/`rem`) at
computed time, +10**
(session 2026-06-26, branch `engine-per-page-threads`)

## The gap

The `#107`–`#109` memory kept naming `%`→used-px against the containing block as THE
standing widest tail, with a no-layout `0%` sub-win flagged inside it. This quest
splits the two cleanly.

First, the layout half was **verified genuinely capped**, not just assumed. A CDP probe
on a `width:75px` container (the real WPT layout for these tests):

```
margin-left: 8px   -> getComputedStyle = 8px      (concrete px resolves)
margin-left: 10%   -> getComputedStyle = 10%      (NOT resolved to used px!)
parentWidth (offsetWidth of the width:75px div)    = 100   (WRONG — should be 75)
```

So our `getComputedStyle` returns margin/inset `%` **unresolved**, and our layout
reports the wrong containing-block width entirely. Resolving `round(10%, 1px)`→`8px`
needs a real layout engine feeding used values — not a single-session win, honestly
capped.

But the **no-layout half is real**. `0%` is `0` against *any* containing block, so a
math function whose every `%` literal is `0%` can fold with no layout at all. Two failing
realms held exactly such rows:

`css/css-values/hypot-pow-sqrt-computed.html` (48/52 — the 4 fails):
```
hypot(0% + 3px, 0% + 4px)       expected "5px"                  got "hypot(0% + 3px, 0% + 4px)"
hypot(0% + 600px, 0% + 800px)   expected "1000px"              got "hypot(0% + 600px, 0% + 800px)"
hypot(0% + 772.333px)           expected "calc(0% + 772.333px)" got "hypot(0% + 772.333px)"
hypot(0% + 772.35px)            expected "calc(0% + 772.35px)"  got "hypot(0% + 772.35px)"
```

`css/css-values/round-mod-rem-computed.html` (227/243 — 6 of the 16 fails):
```
calc(round(1px + 0%, 1px + 0%))  expected "1px"   got "round(0% + 1px, 0% + 1px)"
calc(mod(3px + 0%, 2px + 0%))    expected "1px"   got "mod(0% + 3px, 0% + 2px)"
calc(rem(3px + 0%, 2px + 0%))    expected "1px"   got "rem(0% + 3px, 0% + 2px)"
round(1px + 0%, 1px)             expected "1px"   got "round(0% + 1px, 1px)"
...
```

These are `test_math_used` (`prop:'margin-left'`). The reference expr is set on the same
element and its `getComputedStyle` is the "expected" — so for `5px` the reference fully
resolves (a function forced the numeric eval), while for `calc(0% + 772.333px)` the
reference stays symbolic (a plain calc-sum with `%` is a valid computed value Chrome
keeps).

## Root cause

Two surviving bits of the math serializer:

1. **Single-arg `hypot` wasn't unwrapped.** Quest #109's `_unwrapSingleMinMax` collapsed a
   single-argument `min()`/`max()` to `calc(arg)` so the function name wouldn't leak into
   the computed serialization — but it only matched `min`/`max`. `hypot(0% + 772.333px)`
   (one arg) is the same case: hypot of one value, kept symbolic because of the `%`, must
   serialize as `calc(0% + 772.333px)`.

2. **A `%` forced the mixed-`%` branch, which can't fold a function.** In `_trComp`, any
   `%` routes the value into the mixed branch, which only knows how to emit
   `calc(P% ± Lpx)` (`_resolvePctLengthCalc`) or echo the original. `hypot`/`round`/`mod`/
   `rem` can't be expressed that way, so the original — function name and all — leaked
   through (`hypot(0% + 3px, 0% + 4px)`), never matching the bare `5px`.

## The fix (pure JS, additive, `bootstrap.js`)

1. `_unwrapSingleMinMax`'s regex gains `hypot`: `^(?:min|max|hypot)\(…\)$` with a single
   top-level argument → `calc(arg)`. Gated on `computed` in `_trComp` (specified/serialize
   byte-identical), so single-arg `hypot(0% + 772.333px)` → `calc(0% + 772.333px)` and
   never reaches the fold below.

2. New helpers:
   - `_FORCE_EVAL_FN_RE = /\b(?:hypot|round|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|exp|log|sign|abs)\(/i`
     — the functions that can't re-serialize as a linear `calc(P% ± Lpx)` and so MUST
     collapse their args to concrete numbers to fold.
   - `_allPctZero(t)` — scans every `<number>%` literal; returns true iff there is at
     least one `%` and all parse to `0`.

3. In `_trComp`'s mixed-`%` branch, *after* the non-finite probe and *before*
   `_resolvePctLengthCalc`:

   ```js
   if (computed && _FORCE_EVAL_FN_RE.test(t) && _allPctZero(t)) {
     const z = _evalMath(t, 0, lenOpts());   // %-base 0: every 0% → 0
     if (z !== null && isFinite(z)) return _serNumber(_nfClamp(z)) + 'px';
   }
   ```

   `_evalMath` with percentBase `0` makes every `0%` contribute `0`, so
   `hypot(0% + 3px, 0% + 4px)` → `hypot(3, 4)` → `5px`, `round(1px + 0%, 1px)` →
   `round(1, 1)` → `1px`.

A plain `calc(0% + 772.333px)` (the single-arg-hypot output) has **no** forcing function →
the gate skips it → it stays symbolic via `_resolvePctLengthCalc`. A **non-zero** `%`
(e.g. `mod(18px, 100% / 15)`, where `100%` needs the 75px containing block) makes
`_allPctZero` return false → it stays symbolic too (correctly capped). The fold fires only
for the layout-independent all-`0%` case.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css/css-values/hypot-pow-sqrt-computed.html` | 48/52 | **52/52** | **+4** (100%) |
| `css/css-values/round-mod-rem-computed.html` | 227/243 | **233/243** | **+6** |

**+10 total.**

## Zero-regression sweep

Gated on `computed`, so every *specified*/serialize path is byte-identical:

- **Serialize:** hypot-pow-sqrt 25, round-mod-rem 21/24 (STASH-PROVEN pre-existing — the
  3 fails are present on the pre-change binary too), minmax-length 24, clamp-length 50,
  signs-abs 16, serialize-values (css/cssom) 696.
- **Invalid:** hypot-pow-sqrt 49, round-mod-rem 108, signs-abs 53.
- **Computed math:** minmax-length-percent 30, minmax-length 76, signs-abs 222,
  clamp-length 24, sin-cos-tan 32, acos-asin-atan-atan2 50, calc-infinity-nan 48.
- **Broad:** qsa 1975, calc-nesting 7/8 (the 1 fail is the known `%`→layout cap).

## Caps / Next (ROI)

- **`%`→used-px against the containing block (REAL LAYOUT)** — the standing widest tail,
  now verified genuinely blocked: `getComputedStyle` doesn't resolve margin/inset `%`, and
  layout reports wrong used dimensions. The remaining 10 round-mod-rem fails, the 20
  multi-arg `min/max(px, %)` (minmax-length-percent), and signs-abs's `%` rows all live
  here. Needs the layout engine — not a JS-serializer win.
- **cssText recombination for `border`** — untested since #107; border's overlapping
  longhands break the box-shorthand recombiner's "no overlaps" assumption.
- **`fr`/`dpi` niche computed paths** — signs-abs's 6 remaining (grid-template-rows `fr`,
  image-resolution `dpi`).
