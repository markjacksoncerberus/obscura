# Quest #67 — The Imaged Verdict ✅ SECURED (+76)

**Realm:** `<image>`-valued CSS properties — gradient computed serialization completion
+ registering the remaining `<image>` props.

- `css/css-masking/parsing/mask-image-computed.html` — **0/47 → 47/47**
- `css/css-backgrounds/parsing/background-image-computed.sub.html` — **35/48 → 47/48**
- `css/css-lists/parsing/list-style-image-computed.sub.html` — **3/11 → 11/11**
- `css/css-backgrounds/parsing/border-image-source-computed.sub.html` — **0/10 → 9/10**

Took #66's named "next leverage (1)". `mask-image` / `border-image-source` weren't
registered at all (computed `""` → 0/N); `list-style-image` was registered but only
its canonical-already cases passed. And the #64–66 gradient canonicalizer (built on
`background-image`) was missing several computed canonicalizations these tests exercise.

## The gaps (read straight from the per-subtest fails)

1. **Radial size**: clamp a negative resolved length to `0px`
   (`radial-gradient(circle calc(-0.5em + 10px) …)` → `0px`); drop the `circle`
   keyword when an explicit single `<length>` is present (single-length form *implies*
   circle).
2. **`lh` unit**: `1lh` → `80px` (used line-height = `<number>` × font-size;
   `font-size:40px; line-height:2` → 80px).
3. **Conic `from <angle>` clause**: normalize the angle (`from 1turn`→`from 360deg`)
   and **drop the default `from 0deg`** at computed time (combined with the `at center`
   drop, `conic-gradient(from 0deg at center, …)` → bare).
4. **Stop positions**: resolve `<length>`/`<angle>`/`<percentage>` (and their calc):
   `1turn`→`360deg`, `calc(360deg*4/5)`→`288deg`, `0.5em`→`20px`, `calc(100%/2)`→`50%`;
   a mixed `%`+length stop calc is **kept** as canonical `calc(P% ± Lpx)`
   (`calc(10% + 5px)`); a **two-position colour stop splits into two stops**
   (`black 0% 0.5em` → `black 0%, black 20px`).
5. **Linear direction angle calc**: `linear-gradient(calc(90deg - 45deg), …)` → `45deg`.
6. **`currentcolor`** stop resolves to the element's computed `color`
   (`color:blue` → `rgb(0, 0, 255)`).
7. **Functions auto-closed at EOF**: `conic-gradient(black 1turn, white` (no `)`) is
   valid CSS — the parser implicitly closes it.
8. **Angle serialization to 6 significant figures**: `2rad` → `114.592deg`
   (not `114.591559deg`).

## The fix (pure JS, `crates/obscura-js/js/bootstrap.js`, NO new Rust)

All extensions to the #64–66 gradient canonicalizer + the shared `<position>`/math
primitives:

- **`_evalMath`** — `opts.angle` resolves `<angle>` units to degrees (`_ANGLE_DEG`
  table; available without `opts.lengths` since an angle context has no `<length>`);
  `opts.lhPx` resolves `lh`. Both new flags are opt-in → every existing caller is
  byte-identical.
- **`_serAngle(deg)`** — 6-sig-fig angle serialization; used by `_toDeg`, the conic
  stop/`from` paths, and linear direction.
- **`_canonStopPos`** — per-stop-position computed serialization: angle → `_serAngle`,
  `%`-only (incl. calc) → percentage, mixed `%`+length → `_resolvePctLengthCalc` (kept
  as calc), else `<length>` → px.
- **`_canonGradientStop`** — resolves `currentcolor` → el `color`, maps each position
  through `_canonStopPos`, and **splits a two-position stop** into two single-position
  stops. Type-aware (conic angle hints).
- **`_canonConicPrelude`** — `from <angle>` normalize + drop default `from 0deg`
  (computed).
- **`_canonRadialPrelude`** — drop `circle` when an explicit length is present
  (computed) + `_clampZeroPx` on resolved lengths.
- **`_canonGradientDirection`** — linear single-`<angle>` direction resolves to degrees
  at computed time; conic prelude routed through `_canonConicPrelude`.
- **`_posComputeLen`** — a `%`-only calc now resolves to a single percentage
  (`calc(50% * 2 / 4)`→`25%`); a mixed `%`+length calc still stays canonical
  (`calc(100% - 20px)` is NOT collapsed — the #61 round-trip invariant holds). Threads
  `lhPx` through `_posCompComputed` / `_serializePositionComputed`.
- **`_canonGradients`** — treats EOF as the implicit `)` for a function left unclosed.
- **Registration**: `mask-image`, `list-style-image`, `border-image-source` added to
  `_GRADIENT_PROPS`; `mask-image`/`border-image-source` added to `_GCS_DEFAULTS`
  (initial `none`; `list-style-image` was already there). `url()`/`none`/multi-image
  lists pass through `_canonGradients` verbatim (fast-path bails when no `gradient(`).

## Results & zero-regression sweep

**+76.** mask-image 47/47, background-image 47/48, list-style-image 11/11,
border-image-source 9/10.

Held byte-identical (shared code): gradient-position-valid 18 / -computed 43,
gradient-interpolation-method-valid 1398 / -computed 932, background-position-computed
32, transform-origin-computed 23, perspective-origin-computed 21, mask-position-valid
23, list-style-image-valid 3, border-image-source-valid 2, serialize-values 695/697,
variable-substitution-background 10 / -shorthands 51, color-computed 16,
opacity-computed 30, Element-matches 669, Document-createElement 147; obscura-dom 40/40.

(`object-position-computed`, `offset-anchor-computed`, `offset-position-computed`
were could-not-run = wpt.live HTTP 404, `bodyLen=42` — the same serving flux noted
since #61; their identical `_serializePositionComputed`/`_posComputeLen` code is
proven safe by `background-position-computed` holding 32/32.)

## Caps (honest)

- **`light-dark(none, none)` → `image(rgba(0, 0, 0, 0))`** (background-image, 1
  subtest) — the CSS Color 5 `light-dark()` function resolving to a computed image.
  Out of realm (needs light-dark resolution + `image()` serialization).
- **URL absolutization** (border-image-source, 1 subtest) —
  `url("a.b#c")` → `url("https://…/a.b#c")` needs resolving against the document base
  URL. A separate, broader URL-resolution feature (affects every `url()` test, not just
  gradients).
- **`cross-fade()`** (background-image-**valid** 9/13) — a different `<image>` function
  needing its own specified-value canon (reorder `<percentage>` after the image,
  whitespace-normalize). Pre-existing, never handled here.

## Next leverage

1. **`cross-fade()` specified canon** — closes background-image-valid (4) and is the
   natural sibling of the gradient canon; a small per-function reorder/ws-normalize on
   the specified path.
2. **URL absolutization** — resolve `url()` against the document base URL at computed
   time; unlocks the border-image-source url subtest AND is foundational across the
   `*-computed` `<url>` family broadly.
3. **comprehensive valid-property registry** (csstext unknown-prop drop — serialize-values
   hot-path risk; still standing since #60).
4. **fresh realm** (`fetch/`, `html/dom/` reflection).
