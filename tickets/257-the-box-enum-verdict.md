# Quest #257 — The Box-Enum Verdict

**Realm:** `css/css-box/parsing/` + `css/css-flexbox/parsing/` · **Properties:** `clear` / `float` / `visibility` / `order` · **+10, ZERO regressions**

## The gap

| File | Before | After |
|------|:------:|:-----:|
| `css-box/clear-invalid.html` | 0/2 | **2/2** |
| `css-box/float-invalid.html` | 0/3 | **3/3** |
| `css-box/visibility-invalid.html` | 0/2 | **2/2** |
| `css-flexbox/order-invalid.html` | 0/3 | **3/3** |

`clear`/`float`/`visibility` round-tripped valid values and computed correctly, but
were raw-store — so every out-of-grammar value (`auto`, `left right`, `hidden collapse`,
`top, left`) was wrongly accepted. `order` had no grammar gate either.

## The fix (all `bootstrap.js`)

Three keyword enums → `_CSSUI_ENUM` + `_CSSUI_VALIDATED`:

- `clear` = `none | left | right | both | inline-start | inline-end`
- `float` = `none | left | right | inline-start | inline-end` (no `both`, no `auto`)
- `visibility` = `visible | hidden | collapse`

Each rejects `auto` and any two-keyword combination. Computed serialization is the
lowercased keyword (identity) — unchanged from the already-passing computed tests.

`order` (css-flexbox) = single signed `<integer>` via a dedicated `_canonCssUi` branch
(mirrors orphans/widows but signed, no min): rejects `auto`, a fractional literal
(`123.45`), and multiple tokens (`123 45`); a number-typed calc is kept symbolic and
folded at computed time by the existing `_INTEGER_COMPUTED_PROPS` path.

## Zero-regression sweep

qsa 1975, classlist 1420, clear-valid 6/6, float-valid 5/5, float-computed 5/5,
visibility-valid 3/3, visibility-computed 3/3, clear-computed 6/6, order-valid 3/3,
order-computed 3/3, ruby-align-invalid 4/4, writing-mode-invalid 2/2, table-layout-invalid
2/2, margin-trim 34/34.

## Next

`css/css-box/parsing/` is now essentially secured (only the two unknown-property caps
from #256 remain). A NEW `css/*/parsing/` dir is the next region. Note: `css-overflow`
and `css-multicol` still have fat veins but they are **selector-engine** tests
(`::scroll-button()` 0/37, `::column` pseudo — the Rust `selectors` crate), a different
kind of quest than the JS CSS-value pattern. `webkit-box-computed` 14/20 (css-overflow)
is a property vein. grep `_CSSUI_ENUM`.
