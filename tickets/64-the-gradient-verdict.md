# Scroll 64 — The Gradient Verdict ⚔️

> *A radial sun, a conic sweep — both name their centre with the same `<position>`
> grammar Quest #61 taught Obscura to speak. The clause was buried inside a
> function call, stored uncanonical; the colour stops, never computed. The widest
> unopened tail since #57 — now closed.*

**Realm:** `css/css-images/parsing/gradient-position-{valid,computed}`
**Banner secured:** 2026-06-21 · **+47**

## The gap

Every quest since #57 named the same standing leverage: **gradient `at <position>`
+ gradient canonicalization** — the single widest unopened CSS tail, reusing the
`<position>` engine built in #61–#63.

| Test | Before |
|------|:------:|
| `gradient-position-valid` | 14/18 |
| `gradient-position-computed` | 0/43 |

`radial-gradient`/`conic-gradient` carry an `[ at <position> ]?` clause that shares
the full `<position>` grammar, but `background-image` was stored verbatim:

- **valid (specified)** — the 4 fails were all the horizontal-first reorder:
  `at bottom 10% right 20%`→`at right 20% bottom 10%`, `at bottom right`→`at right
  bottom`, `at center left`→`at left center`, `at top center`→`at center top`.
- **computed** (0/43) — needs three things the verbatim store gave none of: the
  `at` clause resolved to percentages/px (`at left`→`at 0% 50%`, `at right 10px top
  20px`→`at calc(100% - 10px) 20px`), a default `at center center`/`at 50% 50%`
  **dropped entirely** (`radial-gradient(at center, red, blue)`→`radial-gradient
  (rgb(255, 0, 0), rgb(0, 0, 255))`), and each colour stop **computed** (`red`→
  `rgb(255, 0, 0)`).

## The fix (pure JS, `bootstrap.js`, no new Rust)

A self-contained gradient canonicalizer on the #61 `<position>` primitives +
`_computeColor`, scoped to `_GRADIENT_PROPS = {background-image}` and the
`radial`/`conic` (incl. `repeating-`) gradient functions:

1. **`_canonGradients(value, el, computed)`** — a balanced-paren scan that
   transforms each gradient function in place and leaves every other character
   verbatim (so a multi-image `background-image` list, `url()`, `none`, and the
   commas *between* layers survive). Fast-path bails when no `gradient(` is present.
2. **`_canonGradientInner`** — top-level-comma-split the args; the first is a
   gradient *configuration* (vs a colour stop) when `_isGradientConfig` sees an
   `at`/`from`/shape/size keyword.
3. **`_canonGradientConfig`** — split out the `at <position>` clause (keeping any
   shape/size/angle prelude); specified → `_serializePositionSpecified` (reorder);
   computed → `_serializePositionComputed`, and a position resolving to `50% 50%`
   **drops the whole `at` clause** (returns the bare prelude, possibly empty → the
   caller filters it out).
4. **`_canonGradientStop`** (computed only) — `<color> <length-percentage>{0,2}`:
   compute the colour via `_computeColor`, leave positions; a bare transition hint
   passes through.

Wired into the specified path (`setProperty` + `_parseStyleDecls`, after
`_canonStandardValue`) and the computed path (`_normComputed`), exactly alongside
the existing `_POSITION_PROPS`/`_ORIGIN_PROPS` branches.

## Result

| Test | Before | After |
|------|:------:|:-----:|
| `gradient-position-valid` | 14/18 | **18/18** |
| `gradient-position-computed` | 0/43 | **43/43** |

**+47. Zero regressions** — the `<position>` family that shares this code held
byte-identical (background-position 31/32, object-position 18/16, transform-origin
23, mask-position-valid 23, offset-anchor-computed 14). Swept: serialize-values
695/697, variable-substitution-background 8/10 (the 2 fails unchanged — see Caps),
-shorthands 51, color-computed 16 / -rgb 95, shorthand-serialization 7, css-fonts
inheritance 39, matches 669, createElement 147; obscura-dom unit 40/40.

## Caps / Next leverage

1. **Gradient default-token canonicalization** — `variable-substitution-background`'s
   2 remaining fails (`background-image-{linear,radial}-gradient`) need dropping a
   default `to bottom` (linear) / `ellipse farthest-corner` (radial) **and**
   whitespace-normalizing already-substituted colours (`rgb(30,87,0)`→`rgb(30, 87,
   0)`). That's a shape/size/direction-defaults model + a colour-stop reserialize —
   the natural follow-up here, and it also opens `linear-gradient` (untouched by
   this quest, which is radial/conic only). Foundational for `background-image`/
   `mask-image` computed broadly.
2. **More gradient-bearing props** — `mask-image`, `list-style-image`,
   `border-image-source` accept `<image>`; add to `_GRADIENT_PROPS` after baselining.
3. **comprehensive valid-property registry** — csstext unknown-prop drop +
   per-prop validation (serialize-values hot-path risk — must be a superset).
4. fresh realm (`fetch/`, `html/dom/` reflection).
</content>
</invoke>
