# Quest #242 — The Ruby-Grammar Verdict

**Realm:** `css/css-ruby/parsing/`
**Result:** +27 subtests, ZERO regressions
**Session:** 2026-07-22

## The gap

Continuing #241's "a NEW `css/*/parsing/` dir" pointer, baselined
`css/css-ruby/parsing/` → a wide raw-store vein: all four `-invalid` files at
**0/N** (ruby-align 0/4, ruby-position 0/5, ruby-overhang 0/11, ruby-merge 0/6),
plus `ruby-overhang-valid` 2/3 (the `none`→`spaces` canon).

The ruby-* properties are **not registered** anywhere in `bootstrap.js`, but
setProperty stores unknown-but-syntactic properties raw, so valid values round-trip
(valid tests mostly passed) while nothing rejected out-of-grammar values.

## The grammars (from the valid + invalid tests)

- `ruby-align` = `start | center | space-between | space-around`
- `ruby-merge` = `separate | merge | auto` (note: `collapse`/`none` are **invalid**)
- `ruby-position` = `over | under | inter-character` (the spec's `[ alternate ||
  [over|under] ] | inter-character` form is not exercised by the WPT)
- `ruby-overhang` = `auto | spaces`, with a legacy `none` keyword that
  **canonicalizes to `spaces`** (`ruby-overhang: none` → `spaces`). `simple` and any
  two-token value are invalid.

## The fix (all `bootstrap.js`)

Same `_CSSUI_ENUM`/`_CSSUI_VALIDATED` machinery as #240/#241 — no new code path for
the three plain enums:

1. Added `ruby-align`, `ruby-merge`, `ruby-position` to `_CSSUI_ENUM` (keyword sets).
2. Added a dedicated `ruby-overhang` branch to `_canonCssUi`: a single token, `auto`
   → `auto`, `spaces` → `spaces`, legacy `none` → `spaces`, else `null` (invalid).
3. Added all four to `_CSSUI_VALIDATED`.

The setProperty path's `_canonCssUi` dispatch now rejects the out-of-grammar
values (`auto`/`left`/`10px`/`center start` for ruby-align, `collapse`/`merge
separate` for ruby-merge, `above`/`over under` for ruby-position, `simple`/`auto
none`/… for ruby-overhang) and rewrites `ruby-overhang: none` → `spaces`.

No `_GCS_DEFAULTS` registration was needed (no computed tests exist, and the props
already round-trip as stored-raw); leaving them unregistered avoids disturbing
`getComputedStyle-property-order` (verified 1/1 held).

## Results

All 8 files → 100% (+27):

| File | Before | After |
|------|:------:|:-----:|
| ruby-align-invalid | 0/4 | 4/4 |
| ruby-merge-invalid | 0/6 | 6/6 |
| ruby-overhang-invalid | 0/11 | 11/11 |
| ruby-position-invalid | 0/5 | 5/5 |
| ruby-overhang-valid | 2/3 | 3/3 |
| ruby-align/merge/position-valid | pass | held |

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, getComputedStyle-property-order 1/1, box-sizing-invalid
6/6, border-spacing-computed 4/4 (#241 held), writing-mode-invalid 2/2 (#240 held).

## Cap / Next

`css/css-ruby/parsing/` is now fully secured (all 8 files 100%).

**Next leverage:** a NEW `css/*/parsing/` dir. Baselined-clean this session (skip):
css-overflow, css-scroll-snap, css-text, css-fonts (font-variant-*/kerning/synthesis/
size-adjust/palette invalid all pass), css-grid (grid-auto-flow invalid passes). The
tell is a `-invalid` at 0/N (raw-store) or a `-valid`/`-computed` canon gap. grep
`_CSSUI_ENUM`.
