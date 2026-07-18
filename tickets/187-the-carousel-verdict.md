# Scroll 187 — The Carousel Verdict ⚔️

> *The CSS-Overflow-5 carousel keyword props — scroll-marker-group,
> scroll-target-group, and scroll-axis-lock — their invalid rejection and their
> computed/enumeration behaviour.*

**Realm:** `css/css-overflow/parsing/` (the CSS-Overflow-5 carousel props)
**Quest:** #187 The Carousel Verdict
**Result:** **+42 subtests, ZERO regressions.** Carousel value-parsing (invalid +
computed) 25/67 → **67/67**.

---

## The gap

The #186 vein's next-door neighbours in the SAME directory: the CSS-Overflow-5
carousel props. Three of them are plain keyword enums that the setProperty
raw-store fallback already accepted (so `*-valid` passed), but with no validation
and no registration:

- **`*-invalid` 0/N** — junk values (`10`, `true`, `default`, comma lists) were
  wrongly accepted and serialized back, so every invalid test scored 0.
- **`*-computed` 0/N** — the props were absent from `getComputedStyle`
  enumeration (`Array.from(style).indexOf(prop) === -1`), and — the subtler bug —
  `CSS.supports(prop, 'initial')` returned **false**, failing `test_computed_value`'s
  support precondition for every `initial`/`inherit`/`unset`/`revert` case.

Baseline (6 test files, the invalid + computed halves):

| Test | Before |
|------|:------:|
| scroll-axis-lock-valid | 6/6 (already green) |
| scroll-axis-lock-invalid | 0/7 |
| scroll-axis-lock-computed | 0/8 |
| scroll-target-group-valid | 6/6 (already green) |
| scroll-target-group-invalid | 0/5 |
| scroll-target-group-computed | 0/8 |
| scroll-markers-valid | 7/7 (already green) |
| scroll-markers-invalid | 0/5 |
| scroll-markers-computed | 0/9 |

(The `-valid` files — 19 subtests — already passed via the raw-store fallback and
are unchanged.)

## The grammar

All three are `<keyword>` enums, none inherit:

| Property | Values | Initial |
|----------|--------|:-------:|
| `scroll-marker-group` | `none \| before \| after` | `none` |
| `scroll-target-group` | `none \| auto` | `none` |
| `scroll-axis-lock` | `auto \| none` | `auto` |

Note the test file is named `scroll-markers-*` but the property is
`scroll-marker-group`.

## The work (all in `bootstrap.js`, no new Rust)

Extended the #186 css-overflow value engine:

1. **`_CAROUSEL_ENUM`** — a `{prop: Set<keyword>}` map. Dispatched inside
   `_canonCssOverflow`: a value is EXACTLY one listed keyword (a 2nd token, comma
   list, number, or unknown keyword → `null` → invalid → declaration ignored).
   Added the three props to `_OVERFLOW_VALIDATED` (via `...Object.keys(_CAROUSEL_ENUM)`)
   so setProperty + `CSS.supports` route through the validator. CSS-wide keywords
   and `var()` still pass through untouched (gated at the setProperty dispatch).

2. **Registration** — added the three to `_GCS_DEFAULTS` with their initial values.
   That one map drives three things at once: `_CSS_KNOWN_PROPS` membership (built
   from `_GCS_DEFAULTS` keys), `getComputedStyle` enumeration, and the computed
   value (keyword identity — computed = specified for these enums, so no
   `_normComputed` branch is needed; `initial`/`inherit`/etc. resolve to the
   default because the parent never sets the prop).

3. **Latent `CSS.supports` fix** — the `_OVERFLOW_VALIDATED` branch of the
   two-argument `CSS.supports(prop, value)` never accepted CSS-wide keywords
   (`_canonCssOverflow` doesn't special-case them, unlike `_canonCssText` which
   gates them internally). setProperty already gated CSS-wide, so this only
   surfaced now that a `test_computed_value` suite exercises
   `CSS.supports(prop, 'initial')`. Added `if (_CSS_WIDE.has(val.toLowerCase())) return true;`
   to that branch — strictly correct (CSS-wide keywords are valid for every
   property) and it also closes the same latent gap for the #186 overflow
   longhands.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| scroll-axis-lock-invalid | 0/7 | **7/7** |
| scroll-axis-lock-computed | 0/8 | **8/8** |
| scroll-target-group-invalid | 0/5 | **5/5** |
| scroll-target-group-computed | 0/8 | **8/8** |
| scroll-markers-invalid | 0/5 | **5/5** |
| scroll-markers-computed | 0/9 | **9/9** |

**+42 subtests. Zero regressions.**

## Zero-regression sweep

- css-overflow realm (#186): overflow-computed 34/34, overflow-valid 18/18,
  overflow-invalid 6/6, overflow-clip-margin 25/25, block-ellipsis-invalid 11/11,
  continue-invalid 9/9, max-lines-invalid 8/8, text-overflow-computed 5/5,
  scrollbar-gutter-valid 4/4, scrollbar-gutter-invalid 26/26 — all held (proves the
  `CSS.supports` CSS-wide gate + the `_OVERFLOW_VALIDATED` addition regressed nothing).
- Held realms: qsa 1975/1975, classlist 1420/1420, Element-matches 669/669,
  createElement 147/147, url-origin 406/413, cssom serialize-values 696/697 — all
  at baseline.

## Caps / Next

- **`::scroll-button()` selector tests** — `scroll-buttons-valid` (0/37),
  `scroll-buttons-invalid` (1/8), and `getComputedStyle-scroll-button` (0/5) are
  NOT property-value tests. They exercise a new **functional pseudo-element**
  (`::scroll-button(up)`, `::scroll-button(*)`, `::scroll-button(block-start)`…)
  in `document.querySelector` / `insertRule` / `CSS.supports('selector(...)')`,
  plus pseudo-element computed style with writing-mode logical→physical direction
  mapping and cascade. That means the Servo `selectors` crate + selector glue
  (`crates/obscura-dom/src/selector.rs`) — a separate, higher-effort **Rust**
  quest, not this JS value-engine vein. ~50 subtests waiting there.
- With #187 done, the `css/css-overflow/parsing/` value-engine tail is fully green
  except that selector/pseudo-element cap. **Next leverage moves to the untouched
  `css/css-grid/parsing/`** (61 files) — the `<track-list>`/`repeat()`/`minmax()`
  grammar, the widest single primitive left; grid-template-columns-invalid alone is
  0/42. Its own quest — baseline before committing.

grep tokens: `_CAROUSEL_ENUM`, `_OVERFLOW_VALIDATED`, `_canonCssOverflow`.
