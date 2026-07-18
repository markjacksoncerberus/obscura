# Quest #198 — The Will-Change Verdict

**Realm:** `css/css-will-change/parsing/`
**Session:** 2026-07-16
**Result:** +127, ZERO regressions. **CLOSES `css/css-will-change/parsing/` (170/170).**

## The gap

`css-will-change` was a NEW untouched `css/*/parsing/` dir. Baseline:

| File | Before |
|------|:------:|
| `will-change-invalid.html`  | 0/127 |
| `will-change-valid.html`    | 20/20 |
| `will-change-computed.html` | 23/23 |

`will-change` existed only as a `_GCS_DEFAULTS` entry (`'will-change': 'auto'`) and was
stored **raw** in `setProperty`. Raw-store already made valid + computed pass:
`test_valid_value` round-trips the value case-preserved (`_canonStandardValue` keeps
ident case — `TRANSFORM` stays `TRANSFORM`), and computed value == specified for
will-change (identity), so the stored string served both. The *entire* 127-subtest gap
was **invalid-value rejection** — raw-store accepted everything.

## The grammar (CSS Will Change §2)

```
will-change = auto | <animateable-feature>#
<animateable-feature> = scroll-position | contents | <custom-ident>
```

- `auto` is a standalone alternative — it may NOT appear in a list
  (`auto, transform`, `contents, auto`, `auto transform` all invalid).
- A list is comma-separated; each item is a single `<custom-ident>` token
  (`scroll-position`/`contents` pass as ordinary idents; `transform`, `--var`,
  `Not-A-Property` valid).
- `<custom-ident>` excludes the CSS-wide keywords (`initial`, `inherit`, `unset`,
  `revert`, `revert-layer`, `revert-rule`) plus `default`, and will-change
  additionally excludes `will-change`, `none`, `all`, `auto` — all case-insensitive.

## The work (all in `crates/obscura-js/js/bootstrap.js`)

**`_isValidWillChange(value)`** (near the shape validators): trims; returns true for a
standalone `auto`; else splits at top-level commas (`_commaSplitTop`) and requires each
trimmed item to be a single `<custom-ident>` token (`_GRID_CI_RE`, the grid-line
custom-ident regex — `--`-prefix + escapes + non-ASCII aware) that is not in
`_WILL_CHANGE_EXCLUDED` (the 11 excluded keywords, compared lowercased). A space inside
an item (`auto transform`) fails `_GRID_CI_RE` → invalid; an empty item (trailing comma)
→ invalid.

**Wiring** — an identity-canon branch in BOTH setProperty paths:
- inline-parse (style-attribute string) — after the `shape-image-threshold` branch;
- setProperty API — after the `shape-image-threshold` branch.

Both guard with `!_CSS_WIDE.has(low) && !_TF_VAR_RE.test(stored)` first, so
`will-change: inherit`/`initial`/`var(--x)` pass through untouched (a CSS-wide keyword or
`var()`/`env()` is valid on the property even though it would be an excluded/invalid
custom-ident *inside a list*). No `_computedPropOf` / `_GCS_DEFAULTS` change needed.

Reused, unmodified: `_GRID_CI_RE`, `_commaSplitTop`, `_CSS_WIDE`, `_TF_VAR_RE` — so the
change is fully isolated (a new validator + two new `else if` branches).

## Results

| File | Before | After |
|------|:------:|:-----:|
| `will-change-invalid.html`  | 0/127 | **127/127** |
| `will-change-valid.html`    | 20/20 | 20/20 |
| `will-change-computed.html` | 23/23 | 23/23 |

**+127.** Zero-regression sweep (all held): offset-path-parsing-valid 70/70,
-invalid 24/24, -computed 65/65; clip-path-invalid 48/48; mask-invalid 13/13;
shape-outside-shape-invalid 9/9; scroll-snap-type-invalid 14/14; background-valid 45/46
(pre-existing cap); serialize-values 696/697 (pre-existing cap); qsa 1975/1975.

## Caps / Next

No caps — the dir is CLOSED (170/170).

**Next leverage** — same raw-store→validate pattern, baseline first (`*-invalid` 0/N is
the tell):
- **`css-contain`** — `contain-invalid` 0/14, `contain-valid` 9/13, plus
  `contain-computed`/`contain-computed-children`. `contain = none | strict | content |
  [size || layout || style || paint]`. Small, self-contained.
- **`css-ui`** — `cursor-invalid` 0/10 (`cursor = [<url>...]? [auto|default|...|<keyword>]`),
  and check `field-sizing`, `caret-color`, `resize`, `user-select` invalid baselines.
- **`css-overflow`** remainder — `text-overflow`, `overflow-clip-margin`,
  `scrollbar-gutter`, `webkit-line-clamp` (baseline the `-invalid` files).

grep `_isValidWillChange` / `_WILL_CHANGE_EXCLUDED`.
