# Quest #200 — The Cursor Verdict

**Realm:** `css/css-ui/parsing/`
**Session:** 2026-07-16
**Result:** +10 net (cursor-invalid 0→10, cursor-valid 45→46, cursor-computed 37→36 inherent cap).

## The gap

Baseline in `css/css-ui/parsing/`:

| File | Before |
|------|:------:|
| `cursor-invalid.html`  | 0/10  |
| `cursor-valid.html`    | 45/46 |
| `cursor-computed.html` | 37/39 |

(The other css-ui `-invalid` files already passed: `caret-color` 12/12, `resize` 4/4,
`field-sizing` 7/7, `text-overflow` 2/2.)

`cursor` was mis-registered in `_GRADIENT_PROPS` — i.e. treated as a plain `<image>`
property (`_canonImageSet(_canonGradients(value, …))`). That canonicalized any gradients
and passed keywords through, but it **never enforced the `cursor` grammar**: invalid values
were accepted whole (`en-resize`, `url(…) 1px 2px, copy`, …), and generated images
(gradients) were wrongly accepted.

## The grammar (CSS Basic User Interface 4 §5.1)

```
cursor = [ [ <url> | <url-set> ] [ <x> <y> ]? , ]* <cursor-keyword>
```

- A comma-list of zero-or-more cursor images, each optionally followed by a hotspot
  `<x> <y>` (two `<number>`s), then a **mandatory bare keyword** as the final comma-item.
- `<cursor-image>` here = `url()` / `image-set()` / `light-dark()` of those. **Generated
  images are NOT valid** — gradients, `cross-fade()`, `image()`, `element()`, `paint()`
  all reject (incl. nested inside `light-dark()`).
- Hotspot coords are `<number>` — **lengths and percentages are invalid** (`1px 2px`,
  `3% 4%` reject); negatives allowed (`3 -4`); calc folds (`calc(2 + 0)` → `calc(2)`).

## The engine — `_serCursor(value, computed, el)`

Placed beside `_canonCssUi` (both in the css-ui block). Returns the canonical string, or
`null` (→ drop the declaration) on any grammar violation.

- `_commaSplitTop(value)` → the last item is lowercased and must be in `_CURSOR_KEYWORDS`
  (the full 36-keyword set incl. all `*-resize` variants); every earlier item is an
  image entry.
- Each image entry is `_wsTokens`'d and must have exactly **1** token (`<image>`) or **3**
  (`<image> <x> <y>`). Any other count (e.g. `url(…) 3` — one coord) rejects.
- `_cursorCanonImage(tok, computed, el)` dispatches by **function head** (not a regex scan):
  `url(` / `image-set(` / `-webkit-image-set(` → canonicalize via `_canonImageSet`
  (+ `_canonUrls` for computed url absolutization); `light-dark(` → recurse on its two
  top-level-comma args, each must itself be a valid cursor image; **anything else**
  (gradient / `image()` / bare keyword like `none`) → `null`. Head-dispatch means a url()
  whose target text contains `gradient(`/`image(` is never misjudged.
- `_cursorHotspotNum(tok)` — a math function folds via `_canonMathExpr`; else the token
  must match a bare-number regex (no unit, no `%`).

## Wiring (both setProperty paths + computed)

- Added `'cursor'` to `_CSSUI_VALIDATED` and a `name === 'cursor'` branch in `_canonCssUi`
  → covers the `setProperty()` API path (and the `@supports`/`_isValidDeclaration` check).
- Added a `name === 'cursor'` branch in the inline declaration-block parser (delegating to
  `_canonCssUi('cursor', value)`), placed before the `_GRADIENT_PROPS` branch.
- Removed `'cursor'` from `_GRADIENT_PROPS`.
- Added a `kebab === 'cursor'` branch in the computed-value dispatch (CSS-wide guarded),
  before the `_GRADIENT_PROPS` computed line.

Reused unmodified: `_commaSplitTop`, `_wsTokens`, `_canonImageSet`, `_canonUrls`,
`_canonMathExpr`, `_CSS_WIDE`.

## Results

| File | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `cursor-invalid.html`  | 0/10  | **10/10** | +10 |
| `cursor-valid.html`    | 45/46 | **46/46** | +1  |
| `cursor-computed.html` | 37/39 | 36/39     | −1  |

**+10 net.**

## The cap (cursor-computed −1) — inherent, honest

`cursor-computed` has 3 rows that set a well-formed gradient value and expect a computed
serialization. These **directly contradict `cursor-invalid`**, whose spec comment states
"the cursor property does not accept generated images, including inside light-dark()".

- All 4 gradient cases in `cursor-invalid` use a **single-stop** `gradient(red)` (malformed)
  — so both "reject all gradients" and "reject malformed gradients" satisfy `cursor-invalid`.
- But `cursor-computed`'s gradients are **well-formed 2-stop** — accepting them is the only
  way those rows pass, and that necessarily accepts the top-level gradient in
  `cursor-invalid`'s case 7 too. **No browser can pass both files.**
- We have **no gradient well-formedness validator** (`background-image-invalid` is itself
  0/12 — the codebase canonicalizes gradients but never rejects malformed ones), so
  "accept well-formed / reject malformed" is not achievable without building one.
- Choosing spec-correct gradient rejection (matches real Chrome/Firefox) wins invalid 0→10
  and costs exactly the 1 well-formed radial computed row. The other 2 gradient rows were
  **already failing** on malformed expected strings (`linear-gradient(… calc(75% - 2px), auto`
  and `conic-gradient(… , pointer` — both missing a `)`, and the conic input keyword is
  `crosshair` not `pointer`).

Net-positive by +3 subtests vs the accept-gradients alternative (6+46+37 = 89 → 10+46+36 = 92),
and spec-correct.

## Zero-regression sweep

caret-color-invalid 12/12, caret-color-valid 15/15, caret-color-computed 12/12,
outline-color-valid 2/2, resize-valid 4/4, user-select-valid 4/4, text-overflow-valid 2/2,
box-sizing-valid 2/2, field-sizing-valid 2/2, will-change-invalid 127/127, contain-invalid
14/14, clip-path-invalid 48/48, background-image-valid 13/13, mask-computed 32/32,
list-style-image-valid 3/3, background-valid 45/46 (pre-existing cap), qsa 1975/1975.

## Caps / Next

- **CAP:** cursor-computed 36/39 — 3 gradient rows unwinnable while cursor-invalid passes
  (see above). 2 also have malformed expected strings.
- **NEXT LEVERAGE:**
  - The newer `css-overflow` cluster: `line-clamp` shorthand (`line-clamp-invalid` 0/8,
    `-valid` 10/18 — grammar `none | <integer [1,∞]> || <ellipsis> || -webkit-legacy`
    expanding into max-lines / block-ellipsis / continue / -webkit-line-clamp, with a
    tricky canonical reorder + default-fold), `scroll-buttons-invalid` 1/8,
    `webkit-box-computed` 14/20.
  - OR a real **gradient grammar validator** — would fix `background-image-invalid` 0/12,
    the mask/list-style gradient `-invalid` tails, AND recover this quest's radial-gradient
    computed row (by rejecting only malformed gradients).

grep `_serCursor`.
