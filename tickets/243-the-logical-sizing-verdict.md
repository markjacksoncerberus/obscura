# Quest #243 — The Logical-Sizing Verdict

**Region:** `css/css-logical/parsing/` (+ bonus `css/css-sizing/parsing/`)
**Result:** +104 subtests, ZERO regressions
**Session:** 2026-07-22

## The gap

Took #242's next-leverage (a NEW `css/*/parsing/` dir). Baselined the fat, never-touched
`css/css-logical/parsing/` (54 files) → a wide raw-store vein. Every sizing `-invalid`
file was at **0/N**:

| File | Before |
|------|:------:|
| block-size / inline-size -invalid | 0/10 each |
| min-block-size / min-inline-size -invalid | 0/10 each |
| max-block-size / max-inline-size -invalid | 0/10 each |

And the **physical siblings** were raw too — a wider root cause:

| File | Before |
|------|:------:|
| css-sizing width / height -invalid | 0/4 each |
| css-sizing min-width / min-height -invalid | 0/11 each |
| css-sizing max-width / max-height -invalid | 0/4 each |

The whole sizing family stored values raw: valid keywords/lengths round-tripped (the
`-valid`/`-computed` files were mostly green) but **nothing rejected** an out-of-grammar
value — `none` on a preferred/min size, `auto` on a max size, a negative `<length-%>`,
a bare non-zero `<number>` (`60`), a multi-token value (`10px 20%`, `min-content
available`, `content-box 20%`), or a misspelled keyword (`available`, `complex`,
`border-box`).

## The grammar (from the valid + invalid tests)

All sizing properties share the single-value grammar:

```
[ auto | none ] | <length-percentage [0,∞]>
                | min-content | max-content
                | fit-content( <length-percentage [0,∞]> )
                | stretch | fit-content | contain
```

- `auto` is valid on `width`/`height`/`block-size`/`inline-size` **and** the `min-*`
  forms, but NOT on `max-*`.
- `none` is valid ONLY on the `max-*` forms.
- `<length-percentage>` is non-negative (`[0,∞]`) — `-10px`/`-20%` invalid; bare `0`
  is a valid `<length>` and serializes `0px`; a bare non-zero number (`60`) is invalid.

## The fix (all `crates/obscura-js/js/bootstrap.js`)

Because a logical property must behave **exactly** like its physical sibling, one
validator serves all 12 names.

1. **`_SIZE_VALIDATED`** — the set: `width`, `height`, `min-width`, `min-height`,
   `max-width`, `max-height`, `block-size`, `inline-size`, `min-block-size`,
   `min-inline-size`, `max-block-size`, `max-inline-size`.
2. **`_sizeLenPctOk(t)`** — a single non-negative `<length-percentage>` literal
   (unitless only for `0`), or a math function / `var()` (sign undecidable → accept;
   the math gate type-checks it downstream). Rejects a bare non-zero number and any
   negative literal.
3. **`_isValidSizeValue(name, v)`** — CSS-wide/`var()`/`env()` accepted; splits into
   top-level whitespace tokens and rejects anything with >1 token (sizing is a single
   value); `auto` accepted unless `max-*`; `none` accepted only on `max-*`; the
   intrinsic keywords via `_SIZE_INTRINSIC_KW`; `fit-content(<lp>)`; else a lone
   `<length-percentage>`.
4. **Both entry paths gated** — the inline `_parseStyleDecls` parser and the API
   `setProperty` (the branch sits BEFORE `_MATH_GATE_PROPS`, so `height` — formerly
   in that table — is now handled here with the identical `_mathReject(v, ['length'],
   'length')`). Each also canonicalizes a bare `0`→`0px`.

## Wins

- 6 logical `-invalid` files: 0→10 each = **+60**
- 6 physical `-invalid` files: 0→{4, 4, 11, 11, 4, 4} = **+38** (bonus)
- 6 physical `-valid` files: bare `0`→`0px`, 9→10 each = **+6** (bonus)

**Total +104.**

## Caps (honest)

The sizing `-computed` fails are NOT value-parsing bugs — they need real **layout**:
`block-size: auto`→`80px`, `20%`→`60px`, `min-content`→`80px` (all resolve against a
laid-out container), and `min-block-size: auto`→`auto` needs flex-layout detection.
Left verbatim. block-size/inline-size-computed stay 3/7; min-block/min-inline-computed
stay 8/9; max-*-computed already 8/8.

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing), shorthand-
serialization 7/7, all sizing `-computed` held (min-width 11/11, max-width 12/12,
max-height 12/12, min-height 11/11), margin-valid 15/15, flex-basis-valid 8/8,
flex-basis-computed 12/12, logical `-valid` unchanged (block/inline-size 6/6).

## Next leverage

The SAME dir has two more raw-store veins, both never touched:
- **border-logical**: `border-block-color`/`border-inline-color` (+ 4 longhands),
  `border-block-style`/`-inline-style`, `border-block-width`/`-inline-width`, and the
  `border-block`/`border-inline` shorthands — all `-invalid`/`-computed` at 0/N. The
  longhands are UNREGISTERED (computed 0/N); color longhands want `_COLOR_PROPS`, the
  2-value shorthands want `_canonColorShorthand` fixed to reject 3+ values + collapse
  identical pairs.
- **margin/padding/inset-logical**: `margin-block`/`-inline`, `padding-block`/`-inline`,
  `inset-block`/`-inline` + the physical `inset` shorthand — `-invalid`/`-shorthand`
  at 0/N.

grep `_isValidSizeValue` / `_SIZE_VALIDATED`.
