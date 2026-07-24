# Quest #284 — The Display-Blockification Verdict

**Realm:** `css/css-display/parsing/` · **Result:** +4 · **Regressions:** ZERO
**Date:** 2026-07-23 · **Branch:** `engine-per-page-threads`

## The gap
`display-computed.html` — **108/112** after Quest #283. The 4 remaining are the
`test_display_affected` cases: a floated / absolutely-positioned element must
**blockify** its computed display (CSS Display §2.7 "Automatic Box Type
Transformations"), e.g. `inline-table` → `table`. We returned the specified value
verbatim.

## The rule (CSS Display §2.7)
A floated (`float ≠ none`) or absolutely-positioned (`position: absolute | fixed`)
box has its outer display type computed to **block**. Per the WPT's authoritative
map (matches Chromium/Gecko):
- `inline`→`block`, `inline-block`→`block`, `inline-table`→`table`,
  `inline-flex`→`flex`, `inline-grid`→`grid`, `run-in`→`block`
- every `<display-internal>` (`table-row-group`/`…`/`table-caption`, `ruby-base`,
  `ruby-text`, …) → `block`
- `ruby`→`block`; an `inline …` two-value form drops its `inline` (block is default outer)
- UNAFFECTED: `block`, `flow-root`, `flex`, `grid`, `table`, `list-item`, `contents`, `none`

## The fix (all `crates/obscura-js/js/bootstrap.js`)
NEW `_BLOCKIFY_MAP` + `_blockifyDisplay(v)` (map lookup; else strip a leading
`inline ` prefix; else unchanged) + `_isBlockifiable(v)` (in map, or starts with
`inline `). In `_computedPropOf`, after the CSS-wide resolution and BEFORE the final
`_normComputed`, a `display`-gated branch:
```js
if (kebab === 'display' && _isBlockifiable(low)) {
  const pos = _computedPropOf(el, 'position', guard + 1);
  const flt = (pos === 'absolute' || pos === 'fixed') ? null : _computedPropOf(el, 'float', guard + 1);
  if (pos === 'absolute' || pos === 'fixed' || (flt && flt !== 'none')) return _blockifyDisplay(low);
}
```
The `_isBlockifiable` gate keeps the common case (block/flex/grid/list-item/contents/…)
on the fast path — the position/float computed lookups only fire for a value that
could actually blockify. Root-element blockification is intentionally out of scope
(untested here; would touch `getComputedStyle(documentElement)`).

## Result
| file | before | after |
|------|:------:|:-----:|
| display-computed | 108/112 | **112/112** |

**Whole `css/css-display/parsing/` dir (3 files, 275 subtests) SECURED** across #283+#284.

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, position-computed 5/5,
float-valid 5/5, clear-computed 6/6, visibility-computed 3/3, table-layout-computed 2/2,
overflow-computed 34/34.

## Caps / Next
Root-element blockification unimplemented (untested). **Next leverage:** a NEW
`css/*/parsing/` dir — `css-content` `content` (partially green), or scout fresh
dirs. grep `_blockifyDisplay`.
