# Quest #199 — The Contain Verdict

**Realm:** `css/css-contain/parsing/`
**Session:** 2026-07-16
**Result:** +34, ZERO regressions. **CLOSES `css/css-contain/parsing/` (43/43).**

## The gap

`css-contain` was a NEW untouched `css/*/parsing/` dir. Baseline:

| File | Before |
|------|:------:|
| `contain-invalid.html`           | 0/14 |
| `contain-valid.html`             | 9/13 |
| `contain-computed.html`          | 0/15 |
| `contain-computed-children.html` | 0/1  |

`contain` had **no property handling at all** — it was absent from `_GCS_DEFAULTS`, so
`getComputedStyle(el).contain` returned `''` (the whole computed file 0/N, and the
children file's "child reads `none`" assertion failed), and `setProperty` stored any
string verbatim (invalid values accepted → invalid 0/14; multi-keyword sets never
reordered to canonical → valid 9/13).

## The grammar (CSS Containment 3 §2)

```
contain = none | strict | content | [ [ size | inline-size ] || layout || style || paint ]
```

- The multi-keyword alternative is an **unordered set** — no repeats, and `size` /
  `inline-size` are mutually exclusive (`size inline-size`, `layout layout`,
  `paint layout style paint` all invalid).
- `none` / `strict` / `content` are standalone alternatives — they may not combine with
  each other or with the set keywords (`strict layout`, `none strict`, `paint content`
  invalid).
- Serializes in the **canonical order** size/inline-size → layout → style → paint
  (`layout size` → `size layout`, `layout paint style size` → `size layout style paint`).

### Specified vs computed

The **specified** value keeps the expanded keyword list — `contain: layout style paint`
serializes as `layout style paint`. Only the **computed** value folds the two
shorthand-equivalent sets:

- `layout style paint` → `content`
- `size layout style paint` → `strict`

`inline-size` does **not** fold to `strict` (`inline-size layout style paint` stays
expanded), because `strict` implies the full `size` containment. `content` requires no
size keyword.

## The work (all in `crates/obscura-js/js/bootstrap.js`)

**`_serContain(value, computed)`** (after `_isValidWillChange`): fast-paths
`none`/`strict`/`content`; else tokenizes with `_wsTokens` and accumulates the four
components, returning `null` on a repeat, an unknown token, or a size/inline-size clash.
When `computed`, applies the two folds (`size && layout && style && paint` → `strict`;
no-size `layout && style && paint` → `content`). Otherwise joins the present components in
canonical order.

**Wiring** — an identity-guarded validate/canon branch in BOTH setProperty paths (inline
parse near line 905 + the setProperty API near line 1312), each guarded by
`!_CSS_WIDE.has(low) && !_TF_VAR_RE.test(value)` so `contain: inherit` / `var(--x)` pass
through untouched. Computed: a `kebab === 'contain'` branch in the computed dispatch
(near `shape-image-threshold`) that guards CSS-wide then calls `_serContain(v, true)`.
`contain: none` registered in `_GCS_DEFAULTS` (does not inherit) so getComputedStyle
enumerates the property and a child with no `contain` set reads `none`.

Reused unmodified: `_wsTokens`, `_CSS_WIDE`, `_TF_VAR_RE`. Fully isolated: one new
function + two setProperty branches + one computed branch + one default entry.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `contain-invalid.html`           | 0/14 | **14/14** |
| `contain-valid.html`             | 9/13 | **13/13** |
| `contain-computed.html`          | 0/15 | **15/15** |
| `contain-computed-children.html` | 0/1  | **1/1**   |

**+34, ZERO regressions.** Sweep held: will-change-invalid 127/127, clip-path-invalid
48/48, offset-path-parsing-valid 70/70, shape-outside-shape-invalid 9/9,
scroll-snap-type-invalid 14/14, user-select-valid 4/4, background-valid 45/46
(pre-existing cap), qsa 1975.

## Caps / Next

**Caps:** none — the dir is CLOSED (43/43).

**Next leverage:** same raw-store→validate pattern, baseline first (`*-invalid` 0/N = the
raw-store tell):
- **`css-ui`** — `cursor-invalid` 0/10 needs a `<url>`-list `cursor` engine
  (`[<url> [<x> <y>]?,]* [auto|default|pointer|…]`); also baseline
  `caret-color`/`resize`/`field-sizing` `-invalid`.
- **`css-overflow`** remainder — `text-overflow`/`overflow-clip-margin`/`scrollbar-gutter`/
  `webkit-line-clamp` `-invalid`.

grep `_serContain`.
