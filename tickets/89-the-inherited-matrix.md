# Quest #89 — The Inherited Matrix

> *Quests #85–#88 raised the transform realm's serializers and grammar gates. But
> the **computed-style registry** still had blind spots: four real CSS-Transforms
> properties (`perspective`, `transform-box`, `backface-visibility`,
> `transform-style`) were never registered, so `getComputedStyle(el).transformBox`
> read empty and `'transform-box' in getComputedStyle(el)` was false. And the
> grammar gates added in #85–#87 had a quieter sin — they dropped the CSS-wide
> keywords, so `style.rotate = 'inherit'` never stuck. This quest closed both.*

**Realm:** the css-transforms computed-style registry + the CSS-wide-keyword
passthrough on the transform grammar gates.

**Result: +19, all three tests → 100%, ZERO caps, ZERO regressions.**

| Test | Before | After |
|------|:------:|:-----:|
| `css-transforms/parsing/transform-box-computed.html` | 0/5 | **5/5** |
| `css-transforms/parsing/backface-visibility-computed.html` | 0/2 | **2/2** |
| `css-transforms/inheritance.html` | 8/20 | **20/20** |

---

## The gap

### 1. Unregistered properties (the support gate)

The WPT `test_computed_value` / `assert_initial` helpers both open with:

```js
assert_true(property in getComputedStyle(target),
            property + " doesn't seem to be supported in the computed style");
```

The `in` trap on the `getComputedStyle` proxy is driven by `_CSS_KNOWN_PROPS`,
which is built from `Object.keys(_GCS_DEFAULTS)` ∪ `_COLOR_PROPS`. Four real
CSS-Transforms properties were never in `_GCS_DEFAULTS`:

- `perspective` (initial `none`)
- `transform-box` (initial `view-box`)
- `backface-visibility` (initial `visible`)
- `transform-style` (initial `flat`)

So `'transform-box' in getComputedStyle(el)` was **false** → both
`transform-box-computed` (0/5) and `backface-visibility-computed` (0/2) failed at
the very first assertion, and `inheritance.html` failed every
`backface-visibility` / `perspective` / `transform-box` / `transform-style` row.

These four are NOT inherited and their computed value is **identity** (a keyword,
or — for `perspective` — a length), which the default `_normComputed` tail
(`return v`) already serializes correctly. So registration alone closes them. The
non-inherited classification is automatic: they were never added to
`_INHERITED_PROPS`.

`transform-box` initial value is `view-box` (CSS Transforms 1, current draft — the
inheritance test confirms: `assert_not_inherited('transform-box', 'view-box', …)`).

### 2. CSS-wide keywords dropped by the transform grammar gates

`inheritance.html` also failed `rotate` / `scale` / `translate` / `transform`
"does not inherit" with `expected "90deg" but got "none"` (and friends). The
"does not inherit" body sets the **child** to an explicit `inherit`:

```js
container.style[property] = other;     // e.g. rotate: 90deg
target.style[property] = 'inherit';
assert_equals(getComputedStyle(target)[property], other);   // expect 90deg
```

The `_computedPropOf` engine handles `inherit` correctly (line ~9300 →
`inheritFrom()`). The bug was **upstream, at storage time**: the #85–#86 grammar
gates `_isValidTransform` and `_isValidIndividualTransform` did NOT exempt the
CSS-wide keywords, so `setProperty('rotate', 'inherit')` saw
`_isValidIndividualTransform('rotate', 'inherit') === false` and **dropped** the
declaration. The child therefore stayed `unset` → computed `none`, never observing
the explicit `inherit`. (`_isValidSimpleTransform` already had the
`if (_CSS_WIDE.has(low)) return true;` guard from #87 — these two siblings just
never got it.)

---

## The fix (pure JS, no new Rust)

**Edit 1 — `_GCS_DEFAULTS`** (css-transforms section): register the four
properties with their spec initial values.

```js
perspective: 'none', 'transform-box': 'view-box',
'backface-visibility': 'visible', 'transform-style': 'flat',
```

**Edit 2 — `transform-style` keyword gate.** Added `transform-style` to
`_SIMPLE_TRANSFORM_PROPS` + a `_TRANSFORM_STYLE_KW = {flat, preserve-3d}` set and
a branch in `_isValidSimpleTransform`. (`perspective`/`transform-box`/
`backface-visibility` were already members from #87; only `transform-style` was a
fresh keyword enum.)

**Edit 3 — CSS-wide passthrough on the transform grammar gates.** Mirror the
`_isValidSimpleTransform` guard into its two siblings, plus the canon entry point
so a stored CSS-wide keyword is kept verbatim:

```js
// _isValidIndividualTransform / _isValidTransform:
if (_CSS_WIDE.has(String(value).trim().toLowerCase())) return true;
// _canonIndividualTransform:
if (_CSS_WIDE.has(String(value).trim().toLowerCase())) return value;
```

(`_canonTransform` already returns the value verbatim for unparseable input —
`_parseTransform('inherit')` is null — so it needed no change. And `_normComputed`
never sees a CSS-wide keyword, because `_computedPropOf` resolves
initial/inherit/unset *before* calling it, so the canon guard only matters on the
specified-storage path.)

---

## Why zero regressions

The changes are additive and tightly scoped to the transform realm:

- **Registration** only *adds* four entries to `_GCS_DEFAULTS` / `_CSS_KNOWN_PROPS`.
  Previously these props echoed the inline specified value via the unmodelled-prop
  fallback; now they route through `_computedPropOf` → `_normComputed` → identity,
  which is equivalent for the keyword/length forms these props take.
- **The CSS-wide guards** only *accept more* — a keyword that was always valid per
  spec (`inherit`/`initial`/`unset`/`revert`) — and store it verbatim. No
  previously-rejected real value changes verdict; no `-invalid` test lists a
  CSS-wide keyword.

**Sweep (all green, unchanged):** every css-transforms/parsing test —
transform-box-valid/invalid 5/3, backface-visibility-valid/invalid 2/2,
perspective-invalid 3, transform-valid/invalid/computed 42/20/3,
transform-origin-valid/computed/invalid 16/23/10,
perspective-origin-valid/computed/invalid 18/21/12,
scale-parsing-valid/computed/invalid 32/38/8,
rotate-parsing-valid/computed/invalid 23/23/9,
translate-parsing-valid/computed/invalid 20/19/6; object-position-valid 18,
background-position-valid 31, color-computed-relative-color 1163/1169,
Element-classlist 1420; `cargo test -p obscura-dom --lib` 40/40.

---

## Caps / Next

**ZERO caps in this realm** — all three targeted tests are 100%.

**NEXT LEVERAGE:**
- **`transform-style`** has no dedicated valid/computed/invalid parsing test in
  `css/css-transforms/parsing` (it's tested only via `inheritance.html` here) — but
  it may appear in `css/transforms` or `css/css-transforms` elsewhere; a quick
  sweep could find more. `perspective` likewise has only `-invalid` in the parsing
  dir (no `-computed`/`-valid`); a `perspective` computed test, if it exists,
  would want em→px length resolution (currently identity).
- The **`css/motion`** `offset-rotate` / `offset-path` / `offset-distance` parsing
  tests (most of `css/motion` is reftests needing real layout — filter those out
  first; the parsing `.html` subset is the winnable slice).
- `background-position-x` / `-y` longhands (narrower single-axis grammar).
- The **standing colour leverage** (unchanged from #88): `light-dark()` computed,
  `var()`/`sibling-index()` computed resolution, generalize `_canonMathExpr` to the
  generic value path (the `calc(10px + 1vmin + 10%)` additive-ordering cap —
  confirmed still open: `calc-serialization.html` 0/1), `none`-component structured
  storage.
- A fresh realm.

**PATH NOTE:** `css/css-values/serialize-values.html` — the canary cited in prior
memory — now **404s on both wpt.live and the GitHub API** (the file was removed /
split into per-function `*-serialize.html` tests). Its `bodyLen=42` could-not-run
is a stale path, NOT a regression. Use the granular `calc-serialization.html`,
`minmax-*-serialize.html`, `sin-cos-tan-serialize.html`, etc. as the new
value-serialization canaries.
