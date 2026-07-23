# Quest #269 — The Color-Scheme Verdict

**Realm:** `css/css-color-adjust/parsing/` + `css/css-forced-color-adjust/parsing/`
**Hold before:** raw-store — color-scheme valid 17/22, invalid 0/16, computed 11/13; forced-color-adjust invalid 0/6
**Hold after:** all files 100% — **+29, ZERO regressions**

## The gap

Both properties were already in `_GCS_DEFAULTS` + `_INHERITED_PROPS` (so the valid /
computed files mostly passed via raw-store round-trip) but had no validation or
canonicalization: every `-invalid` sat at 0/N, and the `only`-reordering cases in
color-scheme valid/computed failed.

## The work (all `bootstrap.js`)

- **`forced-color-adjust`** = `auto | none | preserve-parent-color` → `_CSSUI_ENUM` +
  `_CSSUI_VALIDATED` (already inherited, initial `auto`). Rejects `1` / `default` /
  any two-keyword combination.
- **`color-scheme`** = `normal | [ light | dark | <custom-ident> ]+ && only?` → a
  dedicated `_canonColorScheme` (via a `_canonCssUi` branch). `normal` stands alone;
  otherwise a run of scheme idents (`light`/`dark` are keywords, anything else a
  `<custom-ident>` — `none` and `purple` are ordinary custom idents here) plus an
  optional `only` keyword which — per the `&&` — may sit only at the very start or very
  end of the run (never interleaved: `light only dark` invalid) and at most once
  (`only only` / `only light only` invalid). `<custom-ident>` is validated via
  `_GRID_CI_RE` and excludes the CSS-wide keywords, `default`, and the property's own
  keywords (`normal`/`light`/`dark`/`only`) — so `normal dark`, `light normal`,
  `light default`, `light inherit` all reject. Serialization keeps the scheme idents in
  author order and moves `only` to the end (`only light` → `light only`, `only light
  dark` → `light dark only`, `only none` → `none only`). Computed = the stored
  canonical value (identity — no `_normComputed` branch).

## Results

| file | before | after |
|------|:------:|:-----:|
| color-scheme-valid | 17/22 | 22/22 |
| color-scheme-invalid | 0/16 | 16/16 |
| color-scheme-computed | 11/13 | 13/13 |
| forced-color-adjust-invalid | 0/6 | 6/6 |

**+29.** (color-scheme-valid +5, -invalid +16, -computed +2; forced-color-adjust
-invalid +6.) Both `parsing/` dirs are now fully green (print-color-adjust,
forced-color-adjust valid/computed were already 100%).

**Zero-regression sweep:** qsa 1975, classlist 1420, serialize-values 695/697,
grid-template-columns-valid 34/34 (shared `_GRID_CI_RE`), block-step-valid 34/34,
counter-reset-valid 16/16, anchor-scope-parsing 17/17 — all held.

## Caps / Next

`css/css-color-adjust/` + `css/css-forced-color-adjust/` parsing are secured (bar
`color-adjust`, the legacy `print-color-adjust` alias — no standalone parsing file).
**Next leverage: a NEW `css/*/parsing/` dir** — fresh un-baselined dirs with a
`parsing/` subtree: css-animations (44 files), css-logical (54), css-masking (29),
css-position (23), css-page (12), css-content. The css-overflow `::scroll-button()`
(0/37) / css-multicol `::column` veins are SELECTOR-ENGINE (Rust) quests; css-overflow
`webkit-box-computed` 14/20 is a JS `display`-alias vein. The tell in a mature dir: a
`-invalid` at 0/N (raw-store) or a `-computed` canon gap. grep `_canonColorScheme`/
`_CSSUI_ENUM`.
