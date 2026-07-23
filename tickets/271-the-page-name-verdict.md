# Quest #271 — The Page-Name Verdict

**Realm:** `css/css-page/parsing/`
**Hold before:** raw-store — page-valid 3/3 (round-trip), page-invalid 0/5, page-computed 0/6
**Hold after:** all three `page` files 100% — **+11, ZERO regressions**

## The gap

The `page` property (CSS Page 3 — names a page context for a box) was raw-store:
page-valid passed via round-trip, but page-invalid had no rejection gate and
page-computed sat at 0/6 because `page` was absent from the computed-style defaults.

## The work (all `bootstrap.js`)

- **`page`** = `auto | <custom-ident>` → a dedicated `_canonCssUi` branch:
  - a single token (a multi-token / comma value → invalid);
  - `auto` is a keyword — case-insensitive, lowercased (`AUTO` → `auto`);
  - otherwise a `<custom-ident>`, which is **case-preserved** (`TABLE` stays `TABLE`,
    `BLABLABLA` stays `BLABLABLA`), validated via `_GRID_CI_RE`;
  - the custom-ident excludes `default` (rejected explicitly) and the CSS-wide
    keywords (handled at the top of `_canonCssUi` — they pass through as-is).
  - Rejects `not valid` (two idents), `not,valid` (comma-joined, not an ident),
    `123px` / `calc(10%+1px)` (a number/dimension/function is not a `<custom-ident>`),
    and `default`.
- Registered in `_CSSUI_VALIDATED` (so both the setProperty and CSS.supports paths
  validate) and added `page: 'auto'` to `_GCS_DEFAULTS`. Computed = the stored
  specified value (no `_normComputed` branch), which is exactly what page-computed
  expects: `auto`→`auto`, `AUTO`→`auto`, `blablabla`→`blablabla`, `BLABLABLA`→
  `BLABLABLA`, `table`→`table`, `TABLE`→`TABLE`.

## Results

| File | Before | After |
|------|:------:|:-----:|
| page-valid.html | 3/3 | 3/3 |
| page-invalid.html | 0/5 | **5/5** |
| page-computed.html | 0/6 | **6/6** |

**+11.**

## Zero-regression sweep

qsa 1975/1975, serialize-values 695/697, break-after-computed 12/12 (the `page`
keyword inside the `break-before`/`break-after` enums is unrelated and unaffected),
z-index-invalid 4/4.

## Caps / Next

- **Next (Quest #272):** the css-page `size` + `page-orientation` DESCRIPTORS in the
  same dir. Both are `@page` descriptors, not element properties, so setting them on an
  element's `style` must be rejected (`e.style.size` / `e.style.pageOrientation`
  always ""). size-invalid 0/14, page-orientation-invalid 0/4,
  page-orientation-computed 0/1.
- **Cap:** `size-valid` needs a real `@page` CSSOM rule — the test parses a stylesheet
  containing `@page { size: … }` and reads `cssRules[i].style.cssText`. That requires
  `@page` at-rule parsing in the CSSOM, out of scope for the value-canon vein.

grep `_canonCssUi` (`name === 'page'`).
