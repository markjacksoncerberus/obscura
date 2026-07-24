# Quest #292 — The Text-Decor-Enums Verdict

**Realm:** `css/css-text-decor/parsing/` · **Result:** +15, ZERO regressions · **Session:** 2026-07-24

## The gap (fresh vein)
Scouted fresh parsing dirs; css-text-decor held a fat raw-store vein. Two simple
single-keyword enums were ungated (stored raw, so every garbage value was accepted):
- `text-decoration-skip-ink-invalid.html` — 0/13.
- `text-decoration-style-invalid.html` — 0/2.

## The spec
- `text-decoration-skip-ink` = `auto | none | all` (a text-decoration-skip longhand,
  inherited; already in `_GCS_DEFAULTS` + `_INHERITED_PROPS`).
- `text-decoration-style` = `solid | double | dotted | dashed | wavy` (a `text-decoration`
  shorthand longhand, NOT inherited; already in `_GCS_DEFAULTS`).

## The fix (bootstrap.js) — the `_CSSUI_ENUM` template
Two `_CSSUI_ENUM` entries + both names in `_CSSUI_VALIDATED`. That auto-wires the inline
`_parseStyleDecls` gate and the API `setProperty` gate to the generic enum branch in
`_canonCssUi` (exactly one listed keyword, case-insensitive → lowercased; rejects
`edges`/`groove` and any two-keyword combo `auto none`/`solid wavy`). Computed = the
lowercased keyword (identity).

**Safe for the shorthand:** the `text-decoration` shorthand expands to its longhands
directly (storing into `this._props` via `_TD_LONGHANDS`), bypassing the longhand
setProperty gate — so gating `text-decoration-style` is a no-op on the shorthand path.

## Results
| File | Before | After |
|------|:------:|:-----:|
| text-decoration-skip-ink-invalid | 0/13 | **13/13** |
| text-decoration-style-invalid | 0/2 | **2/2** |

## Zero regressions
text-decoration-valid 17/17, text-decoration-invalid 3/3, text-decoration-shorthand 5/5,
text-decoration-line-valid 67/67, text-decoration-line-computed 18/18,
skip-ink-valid/computed 3/3, style-valid/computed 5/5. qsa 1975, classlist 1420.

## Caps / Next
`text-decoration-color-computed` 2/3 — the `value 'inherit'` fail (a non-inherited
<color> longhand resolving `inherit` to the parent's computed color) is a SEPARATE root
cause, not this enum vein. NEXT: the compound `||` grammars (#293). grep `_CSSUI_ENUM`.
