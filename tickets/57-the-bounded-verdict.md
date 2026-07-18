# ✅ Quest #57 — The Bounded Verdict

> Realm: `css/css-variables/variable-substitution-{filters,background-properties}`
> Hold: **filters 0/7 → 7/7 (100%)**, **background-properties 1/10 → 8/10 (80%)**. **+14.**
> Banner drawn 2026-06-20. Took #56's "next leverage (1)" — the standing token-boundary cap.

## The gap

`variable-substitution-filters.html` sets, on seven `<div>`s:

```html
<div id="blur" style="--blur: 15px; filter: blur(var(--blur));"></div>
```

reads `getComputedStyle(blur).getPropertyValue("filter")`, and expects exactly
`blur(15px)` (likewise `brightness(0.5)`, `contrast(2)`, `grayscale(1)`,
`invert(1)`, `sepia(1)`, `saturate(8)`). `variable-substitution-background-properties.html`
does the same for the seven `background-*` longhands plus `background-color` (the
one subtest already green from #55) and two gradients.

Two distinct gaps held the whole region at zero/near-zero:

1. **Space-padded substitution.** #55's `_substituteVars` joined every insertion
   with `out += ' ' + resolved + ' ';` and then collapsed runs of whitespace. So
   `blur(var(--blur))` became `blur( 15px )` — three tokens where the test wants
   the value to sit flush inside the function call. This was the explicitly-named
   **token-boundary cap** from #55/#56.
2. **Unregistered properties.** `filter` and the `background-*` longhands were not
   in `_GCS_DEFAULTS`, so they were not in `_CSS_KNOWN_PROPS`. `getComputedStyle`
   only routes *registered* standard properties through `_computedPropOf` (the
   engine that performs `var()` substitution); everything else echoes the cascaded/
   inline **specified** value verbatim. So even with substitution fixed,
   `getComputedStyle(blur).filter` would have returned the literal
   `blur(var(--blur))`, unsubstituted.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

### 1. `_joinTok` — token-boundary-aware joining

```js
const _TOKENISH = /[A-Za-z0-9_.%#--￿]/;
const _joinTok = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return (_TOKENISH.test(a[a.length - 1]) && _TOKENISH.test(b[0])) ? a + ' ' + b : a + b;
};
```

A separator is inserted **only** when the last char of `a` and the first char of
`b` are both "tokenish" (an identifier / number / percentage / hash char, plus
`-` and non-ASCII) — i.e. the only case where two adjacent fragments would
re-tokenize as a single token. A boundary against punctuation (`(`, `)`, `,`) or
whitespace needs nothing. This approximates real CSS tokenization without a full
tokenizer.

`_substituteVars` now routes every join — the literal text before each `var(`,
and each resolved insertion — through `_joinTok`, dropping the old blanket
pad-and-collapse:

```js
if (!m) { out = _joinTok(out, rest); break; }
out = _joinTok(out, rest.slice(0, m.index));
// … resolve var() …
out = _joinTok(out, String(resolved).trim());
// … finally:
return out.trim();
```

Worked example for `blur(var(--blur))` (`--blur: 15px`):
`""` → `_joinTok("", "blur(")` = `"blur("` → `_joinTok("blur(", "15px")` =
`"blur(15px"` (`(` not tokenish) → `_joinTok("blur(15px", ")")` = `"blur(15px)"`.
And `var(--a)var(--b)` still yields `"a b"` (both insertions tokenish → one space),
so `variable-substitution-basic` is unchanged at 11/13.

### 2. Register `filter` + the `background-*` longhands

Added to `_GCS_DEFAULTS` (which doubles as the `_CSS_KNOWN_PROPS` registry and the
initial-values table):

```js
'background-attachment': 'scroll', 'background-clip': 'border-box',
'background-origin': 'padding-box', 'background-position': '0% 0%',
'background-repeat': 'repeat', 'background-size': 'auto',
'background-image': 'none', filter: 'none',
```

Their computed serialization is **identity** (keyword / position / url), the same
default-echo the #53/#54 inheritance families rely on — so no per-property
serializer is needed. Now `getComputedStyle(el).filter` routes through
`_computedPropOf`, which substitutes the `var()` and returns the round-tripped
value (`blur(15px)`, `padding-box`, `0% 50%`, `cover`, `url("…green-16x16.png")`).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `variable-substitution-filters.html` | 0/7 | **7/7** |
| `variable-substitution-background-properties.html` | 1/10 | **8/10** |

**+14.**

## Zero-regression sweep

css-variables family: variable-definition 71/73, cssText 8/11, substitution-basic
11/13, created-element 3/3, created-document 2/2, test_variable_legal_values 23/23,
substitution-shorthands 13/51. Colour: color-computed 16, named 455, rgb 95,
opacity 30. Inheritance families: css-text 42, css-ui 28, css-fonts 39,
scroll-snap 38, transitions 8; inherit-initial 4, css-color/inheritance 4.
Selectors/DOM: qsa 1975, classlist 1420, matches 669, closest 29, createElement
147, has-specificity 8, not-specificity 8, valid-invalid 30, disabled 7,
readwrite-readonly 25. `cargo test -p obscura-dom` 40/40. **Zero regressions.**

## Caps (honest)

- **Gradient canonicalization** — `background-image-{linear,radial}-gradient`
  substitute their `var()`s correctly (`to var(--location)` → `to bottom`) but the
  test expects the *serialized* form: `linear-gradient(rgb(30, 87, 0) 0%, rgb(125,
  232, 185) 100%)` (default `to bottom` dropped, `rgb(30,87,0)` whitespace-normalized)
  and `radial-gradient(at 25px 25px, rgb(0, 0, 0) 10%, rgb(0, 128, 0) 90%)`
  (default `ellipse farthest-corner` dropped, `black`/`green` → rgb). That needs a
  real gradient parser+serializer — out of realm for this quest. (2 subtests.)
- **shorthand→longhand expansion** (`variable-substitution-shorthands` 13/51) — a
  `var()` in a shorthand must expand into its longhands; unchanged.

## Path note

`variable-cascading.html` and `variable-keywords.html` (9/9 and 8/8 in #55) now
**404 on wpt.live** — `harness_probe` shows `bodyLen=42` and `curl -o /dev/null -w
%{http_code}` returns 404 (while `variable-definition.html` returns 200). This is a
transient wpt.live serving issue, **NOT a regression** — the other css-variables
tests load and pass on the same server.

## Next leverage

1. **Gradient serialization engine** — closes the 2 gradient caps here and is
   foundational for `background-image` / `mask-image` computed-value tests broadly
   (parse the gradient, drop default direction/shape keywords, normalize colours
   and whitespace). Medium-size.
2. **shorthand→longhand expansion** in the cascade — opens
   `variable-substitution-shorthands` (51) and parts of `variable-cssText`.
3. A **specified-value serialization engine** (`serialize-values` 0/697) or a fresh
   realm (`fetch/`, `html/dom/` reflection).
