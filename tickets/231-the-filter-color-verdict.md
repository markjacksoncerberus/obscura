# Quest #231 — The Filter-Color Verdict ⚔️

**Realm:** `css/filter-effects/parsing/` — the SVG paint-server presentation
attributes exposed as CSS properties: `flood-color`, `lighting-color`,
`color-interpolation-filters` (and `flood-opacity`, SVG-root only).

**Result:** **+29, ZERO regressions.** 9 HTML files → 100%.

---

## The gap

`css/filter-effects/parsing/` was *mostly already green* — the big `filter` /
`backdrop-filter` value engines are 100% (filter-computed 83/83,
filter-parsing-valid 87/87, backdrop-filter-computed 28/28). But four SVG
presentation properties were **completely unregistered** in `bootstrap.js` —
pure raw-store:

| File | Before | After |
|------|:------:|:-----:|
| `flood-color-valid.html` | 5/8 | **8/8** |
| `flood-color-invalid.html` | 0/2 | **2/2** |
| `flood-color-computed.html` | 0/8 | **8/8** |
| `lighting-color-parsing-valid.html` | 2/5 | **5/5** |
| `lighting-color-parsing-invalid.html` | 0/3 | **3/3** |
| `lighting-color-computed.html` | 0/1 | **1/1** |
| `color-interpolation-filters-parsing-valid.html` | 1/4 | **4/4** |
| `color-interpolation-filters-parsing-invalid.html` | 0/3 | **3/3** |
| `color-interpolation-filters-computed.html` | 0/3 | **3/3** |

The raw-store tell: `flood-color-valid` already passed the literal round-trips
(`red`, `teal`, `transparent`, `rgb(0, 0, 255)`) but failed every value needing
canonicalization (`#00FF00`→`rgb(0, 255, 0)`, `rgb(100%, 100%, 0%)`→
`rgb(255, 255, 0)`, `hsl(120, 100%, 50%)`→`rgb(0, 255, 0)`), and every
`-invalid`/`-computed` file was at 0/N.

## The grammar

- **`flood-color`** = `<color>`, initial `black`, does **not** inherit.
- **`lighting-color`** = `<color>`, initial `white`, does **not** inherit.
- **`color-interpolation-filters`** = `auto | sRGB | linearRGB`, canonicalized
  ASCII-lowercase (`sRGB`→`srgb`, `LiNeArRgB`→`linearrgb`), initial `linearrgb`,
  **inherits**.
- **`flood-opacity`** = `<'opacity'>` (`<number> | <percentage>` clamped [0,1]),
  initial `1`, does not inherit — **only exercised by SVG-root tests** (cap).

## The fix — all in `crates/obscura-js/js/bootstrap.js`

`flood-color` / `lighting-color` are ordinary `<color>` properties, so they drop
straight onto the existing `_COLOR_PROPS` machinery:

1. **`_COLOR_PROPS`** — added `flood-color`, `lighting-color`. This gives, for
   free: specified-value `<color>` canonicalization (`#00FF00`→`rgb(0, 255, 0)`)
   in both the API `setProperty` branch and the inline `_parseStyleDecls`
   parser; the `-invalid` rejection gate (`none`, `black white` → `_isValidColor`
   false → ignored); auto-registration in `_CSS_KNOWN_PROPS`; and — the key one —
   the **computed** currentcolor resolution. The generic computed color branch
   (`if (kebab === 'color' || _COLOR_PROPS.has(kebab))`) already maps
   `currentcolor`→`_computedColorOf(el)`, so `flood-color: currentcolor` on
   `#target { color: lime }` computes to `rgb(0, 255, 0)`, and all the modern
   color-function paths (lab/lch/oklab/color-mix/…) come along for free.

2. **`_GCS_DEFAULTS`** — registered `flood-color: black`, `lighting-color: white`,
   `color-interpolation-filters: linearrgb`, `flood-opacity: 1` (the initial
   values; `flood-opacity` for hygiene only — no HTML test reads it).

`color-interpolation-filters` is a plain keyword enum, so it drops onto the
generic css-ui enum validator:

3. **`_CSSUI_ENUM`** — added
   `'color-interpolation-filters': new Set(['auto', 'srgb', 'linearrgb'])`.
   `_canonCssUi` lowercases and membership-checks → `sRGB`→`srgb`, `LiNeArRgB`→
   `linearrgb`, `auto`→`auto`; rejects `none`, `linearRGB sRGB`,
   `auto sRGB linearRGB` (multi-keyword). (The set name is `_CSSUI_ENUM` for
   historical reasons — it is a generic single-keyword validator, not css-ui
   specific.)

4. **`_CSSUI_VALIDATED`** — added `color-interpolation-filters` (API `setProperty`
   validation + `CSS.supports` for free).

5. **Inline `_parseStyleDecls` parser** — added a `color-interpolation-filters`
   branch mirroring the `cursor` branch (`_canonCssUi` handles CSS-wide/var
   pass-through internally), so `cssText`/`style=""` validate the same as the
   API.

6. **Inherited-properties set** — added `color-interpolation-filters` (it is the
   only member of this family that inherits).

## Zero-regression sweep

qsa 1975/1975 · classlist 1420/1420 · createElement 147/147 · serialize-values
695/697 (2 pre-existing) · shorthand-serialization 7/7 · getComputedStyle-
property-order 1/1 (the +4 registered props did not disturb enumeration) ·
caret-color-valid 15/15 · caret-color-computed 12/12 · outline-color-valid 2/2 ·
resize-computed 5/6 (pre-existing pseudo-element cap) · cursor-valid 46/46 ·
filter-computed 83/83 · backdrop-filter-computed 28/28 · text-emphasis-computed
7/7 · list-style-valid 17/17 · css-color color-valid 17/17 · color-computed 16/16
· background-color-valid 9/9.

The change is fully gated on the four new property names; `_COLOR_PROPS` and
`_CSSUI_ENUM` are shared, but adding members touches no existing property's code
path.

## Caps

- **`flood-opacity-*.svg`** (valid/invalid/computed) are **could-not-run** — the
  testharness does not load in an SVG-root document in our engine (an SVG-harness
  gap, not a value-parsing gap). `flood-opacity` is registered with its initial
  for hygiene but no HTML test exercises it. Unwinnable here without SVG-root
  harness support.

## Next leverage

A NEW `css/*/parsing/` dir. `css/filter-effects/parsing/` is now clean of
raw-store veins (filter/backdrop-filter + flood/lighting/color-interpolation all
100%; only the SVG-root `flood-opacity` tests remain, capped). Baselined but not
worked: `css/css-align/parsing/place-items-computed` 17/18 (a single pre-existing
fail), the rest of place-* fully green; `css/css-ui/parsing/` `resize-computed`
5/6 (pseudo-element computed bug, deeper than value parsing), `cursor-computed`
(gradient-cursor grammar). Look for the tell: a `-invalid` at 0/N (raw-store) or
a `-valid`/`-computed` canon gap. grep `flood-color` / `_CSSUI_ENUM`.
