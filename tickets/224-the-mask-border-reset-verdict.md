# 🎭 Quest #224 — The Mask-Border Reset Verdict

**Realm:** `css/css-masking/parsing/`
**Result:** +12, ZERO regressions (session 2026-07-18)
**Files:** `crates/obscura-js/js/bootstrap.js`

## The gap

Took #223's next-leverage (a NEW `css/*/parsing/` dir). Baselined
`css/css-masking/parsing/` — most of the dir is already green:

| Test | Baseline |
|------|:--------:|
| mask-computed | 32/32 |
| mask-image-computed | 47/47 |
| mask-repeat-computed | 22/22 |
| mask-position-valid/-invalid | 23/23, 13/13 |
| mask-invalid | 13/13 |
| clip-*, mask-type/-mode/-composite/clip-rule computed | 100% |
| **mask-valid.sub.html** | **45/55** |
| **mask-size-computed** | **14/16** |

Two clean, self-contained veins remained.

### Vein 1 — the `mask` shorthand must reset the mask-border family (+10)

Per **CSS Masking Level 1**, `mask` is a shorthand for BOTH the mask-image layer
longhands AND the mask-border longhands. Our expansion (`bootstrap.js` ~1288) only
stored the 8 image longhands (`_MASK_SH_LH`), so `mask: none` left the five
mask-border longhands empty. `mask-valid.sub.html`'s `test_shorthand_value` reads
each back from inline style and expects their initials:

```
mask-border-source: none
mask-border-slice:  0
mask-border-width:  auto
mask-border-outset: 0
mask-border-repeat: stretch
```

(`mask-border-mode` is NOT checked by the test — matched the reference exactly and
reset only these five.)

### Vein 2 — `mask-size` computed never folded a calc (+2)

`mask-size` computed passed the specified value through `_normComputed` verbatim:

```
calc(10px + 0.5em) calc(10px - 0.5em)  →  want "30px 0px"  (em=40px; -10px clamps to 0)
calc(10px - 0.5em) calc(10px + 0.5em)  →  want "0px 30px"
```

## The fix

`bootstrap.js`, all surgically gated:

**Vein 1** — `_MASK_BORDER_LH` (initials map) + `_MASK_BORDER_NAMES` beside
`_MASK_SH_LH`. The `mask` setProperty expansion now also writes each mask-border
longhand at its initial (or the CSS-wide keyword for `mask: inherit`); removeProperty
clears them. The getter / getComputedStyle `mask` reconstruction is UNTOUCHED — it
reads only the 8 image longhands, and mask-border stay at initial so the shorthand
still round-trips.

**Vein 2** — new `_computeMaskSize(el, v)` dispatched from the top of
`_normComputed` (guarded `kebab === 'mask-size'`). Comma-splits the already-canonical
`<bg-size>#` list (single→double `1px`→`1px auto` expansion already happens upstream
in canon) and folds each component with `_clampNegPx(_trComp(tok, el, true, _vpUnits()))`:
`auto`/`contain`/`cover` keywords and bare `%` pass through `_trComp` untouched; a
length/calc resolves to absolute px (em/vp folded), then `_clampNegPx` clamps a
negative px to `0px`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| mask-valid.sub.html | 45/55 | **55/55** |
| mask-size-computed | 14/16 | **16/16** |

**+12, ZERO regressions.** Held: mask-computed 32/32, mask-image-computed 47/47,
mask-size-valid 9/9, mask-invalid 13/13, mask-repeat-computed 22/22,
mask-position-valid 23/23, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, getComputedStyle-property-order 1/1, qsa 1975,
flex-computed 14/14, grid-area-computed 35/35, DOMTokenList-value/stringifier 1/1.

Both changes are gated (mask shorthand only; `kebab==='mask-size'` only) and share no
background code paths — the shared `_canonBgLayer('background-size', …)` canon was
untouched.

## Cap / Next

**CAP:** none named in this dir — masking is now clean.

**NEXT LEVERAGE:** a NEW `css/*/parsing/` dir. The tell is a `-computed`/`-valid`
canon gap or a raw-store shorthand. NOT-yet-audited candidates:
- `css/css-ui/parsing/` — `cursor-computed` 36/39 (the 3 fails want `<image>`/gradient
  cursor values, grammar `[<url>|<image>]* <keyword>`); `resize-computed` 5/6 (a
  `resize` value on `::before`/`::after` returns the wrong pseudo's computed value —
  a pseudo-element computed-style bug deeper than value parsing).
- css-align `place-items-computed` 17/18 — a single fail.
- `filter-effects/` — no `parsing/` dir on wpt.live; check its other subdirs.

grep `_computeMaskSize` / `_MASK_BORDER_LH`.
