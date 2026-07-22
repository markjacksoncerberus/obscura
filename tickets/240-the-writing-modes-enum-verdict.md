# Quest #240 — The Writing-Modes-Enum Verdict

**Realm:** `css/css-writing-modes/parsing/`
**Result:** +10 subtests, ZERO regressions
**Session:** 2026-07-22

## The gap

Fresh-dir baseline sweep (following #239's "a NEW `css/*/parsing/` dir" pointer)
found a clean raw-store vein: every `-invalid` file in
`css/css-writing-modes/parsing/` scored **0/2**, while every `-computed` file
already passed. The five properties —

- `direction` = `ltr | rtl`
- `text-combine-upright` = `none | all` (spec also has a `digits <integer [2,4]>?`
  form — see scope note)
- `text-orientation` = `mixed | upright | sideways`
- `unicode-bidi` = `normal | embed | isolate | bidi-override | isolate-override | plaintext`
- `writing-mode` = `horizontal-tb | vertical-rl | vertical-lr | sideways-rl | sideways-lr`

— were registered (in `_GCS_DEFAULTS`, inherited except `unicode-bidi`) but their
values were **stored raw**. A valid keyword round-trips (so `-computed` passed),
but nothing rejected an out-of-grammar keyword (`auto`) or a two-keyword
combination (`ltr rtl`, `none all`, `mixed upright`, `isolate plaintext`,
`horizontal-tb vertical-rl`). Each `-invalid` file tests exactly those two shapes →
0/2.

## The fix (all `bootstrap.js`)

These are single-keyword enums — the exact shape the existing
`_CSSUI_ENUM`/`_CSSUI_VALIDATED` machinery (from Quests #231/#232) already handles.

1. Added all five to `_CSSUI_ENUM` with their keyword sets.
2. Added all five to `_CSSUI_VALIDATED`.

The API declaration path (`div.style[prop] = value`, which `test_invalid_value`
uses) dispatches through `_CSSUI_VALIDATED` → `_canonCssUi` at the setProperty
branch (~line 1402): `_canonCssUi` lowercases, passes CSS-wide/`var()` through, and
for an enum property returns the keyword iff it is in the set, else `null` →
invalid → ignored. No new code path; two set-membership additions.

`_canonCssUi` returns the lowercased keyword, byte-identical to what the
already-passing `-computed`/`-valid` values stored, so the computed path is
untouched for valid inputs.

## Scope note — `text-combine-upright: digits`

CSS Writing Modes 3 also allows `text-combine-upright: digits <integer [2,4]>?`.
No WPT in this dir exercises it (the dir has only `-computed` (none|all) and
`-invalid` (auto / none all)), and it is a rare tate-chu-yoko feature. A plain
`none|all` enum is correct for the entire tested surface and carries zero
regression risk; the `digits` form is left as a documented scope limit rather than
adding integer-range parsing with no test to validate it.

## Results

All 10 files → 100% (26/26, +10):

| File | Before | After |
|------|:------:|:-----:|
| direction-invalid | 0/2 | 2/2 |
| text-combine-upright-invalid | 0/2 | 2/2 |
| text-orientation-invalid | 0/2 | 2/2 |
| unicode-bidi-invalid | 0/2 | 2/2 |
| writing-mode-invalid | 0/2 | 2/2 |
| (all 5 `-computed`) | pass | pass (held) |

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7; sibling enum family held — box-sizing-invalid 6/6,
cursor-valid 46/46, break-after-invalid 2/2, orphans-computed 3/3; direction/
writing-mode/etc `-computed` all held.

## Cap / Next

`css/css-writing-modes/parsing/` is now fully secured (all 10 files 100%).

**Next leverage:** a NEW `css/*/parsing/` dir. The tell in a mature dir is a
`-invalid` at 0/N (raw-store) or a `-valid`/`-computed` canon gap. grep
`_CSSUI_ENUM`.
