# Quest #221 — The Spacing-Normal Verdict

**Realm:** `css/css-text/parsing/{letter-spacing,word-spacing}-computed.html`
**Hold:** letter-spacing 8/9 + word-spacing 8/9 → **9/9 + 9/9** (+2, ZERO regressions)
**Session:** 2026-07-18
**Grabbed from:** #220's next-leverage — auditing the css-text `*-computed` length
props. The two spacing computeds each had one fail, but NOT the `sign(2cqw)` fold —
a `normal`↔`0px` computed-equivalence gap.

## The gap

CSS Text 3 gives letter-spacing and word-spacing OPPOSITE `normal`↔`0px` computed
rules, and each had exactly one failing subtest:

```
# letter-spacing-computed.html
test_computed_value("letter-spacing", "0px", "normal");   // a zero computed length → normal
# word-spacing-computed.html
test_computed_value("word-spacing", "normal", "0px");     // normal → 0px
```

- **letter-spacing**: `normal` stays `normal`, and a computed `<length>` of **zero**
  is *also* serialized as `normal` (`0px` → `normal`).
- **word-spacing**: computes to an absolute `<length>`; the `normal` keyword → `0px`.

Both properties were routed straight through the generic `_LENGTH_COMPUTED_PROPS`
branch (`_trComp` then return), which passed `normal` through verbatim and left a
resolved `0px` as `0px` — so `letter-spacing:0px` stayed `0px` and
`word-spacing:normal` stayed `normal`.

## The fix

Two additive, kebab-guarded branches in the getComputedStyle resolver
(`bootstrap.js`, right before `if (_LENGTH_COMPUTED_PROPS.has(kebab))` ~18654),
returning early before the generic length path:

```js
if (kebab === 'letter-spacing') {
  if (String(v).trim().toLowerCase() === 'normal') return 'normal';
  const r = _trComp(v, el, true, _vpUnits());
  const m = /^(-?(?:\d+\.?\d*|\.\d+))px$/.exec(String(r));
  return (m && parseFloat(m[1]) === 0) ? 'normal' : r;   // zero <length> → normal
}
if (kebab === 'word-spacing') {
  if (String(v).trim().toLowerCase() === 'normal') return '0px';
  return _trComp(v, el, true, _vpUnits());
}
```

The letter-spacing zero-check parses the resolved px (matching `0px`/`-0px`/`0.0px`)
so a calc that folds to zero also serializes as `normal`; a symbolic `%` (`110%`,
`-5%`, `calc(10% - 20%)`→`-10%`) is never a bare `px` value, so it stays untouched.
Both props remain in `_LENGTH_COMPUTED_PROPS` (the `isLen` gate at ~10559 still
routes them here); the new branches just intercept before the generic return.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `letter-spacing-computed.html` | 8/9 | **9/9** |
| `word-spacing-computed.html`   | 8/9 | **9/9** |

**+2, ZERO regressions.** Held: letter-spacing-valid 9/9, letter-spacing-invalid
4/4, letter-spacing-inherited-computed 3/3, word-spacing-valid 9/9,
word-spacing-invalid 3/3, text-indent-computed 10/10, tab-size-computed 10/10,
gap-computed (css-align) 11/11, inset-computed 20/20, qsa 1975. The change is two
kebab-guarded branches that return before the shared `_LENGTH_COMPUTED_PROPS` path,
so every other length-computed prop (margin/inset/gap/sizing) is byte-identical
(text-align-computed 6/7 and margin-computed 6/8 are pre-existing, unrelated fails
in properties this change never touches).

## Caps / Next

- The css-text `*-computed` vein is now clean for the spacing pair. Remaining
  css-text computed fails are elsewhere: **text-align-computed 6/7** (1 pre-existing
  fail — a different property, unaudited).
- **NEXT LEVERAGE:** a NEW `css/*/parsing/` dir (baseline `-valid`/`-computed` too —
  most `-invalid` are already green via generic rejection, so the tell in a mature
  dir is a `-valid`/`-computed` canonicalization gap); OR the `animation-timeline`
  property (check `css/scroll-animations/css/`, its own validated property); OR the
  `animation-composition-computed.tentative.html` 0/1 (a raw-store computed gap in
  `css-animations/parsing/`, though only 1 subtest); OR continue the css-box /
  css-position computed audit (`margin-computed` 6/8, `text-align-computed` 6/7).

grep `word-spacing` in the getComputedStyle resolver.
