# 🛡️ Quest #58 — The Expanded Verdict

> *Shorthand → longhand expansion in the cascade, so a `margin`, `border`, or
> `transition` declaration finally reaches the longhand a computed-style query
> asks for.*

**Realm:** `css/css-variables/variable-substitution-shorthands.html`
**Hold:** 13/51 → **51/51** (+38) · **SECURED** · pure JS, no new Rust.

---

## The gap

The shared test stamps shorthand declarations (`margin`, `border`,
`border-<side>`, `border-width`, `transition`) — many bearing `var()` — into
inline styles and reads back the **longhand** computed values
(`margin-left`, `border-top-width`, `transition-duration`, …):

```html
<div id="target1" style="--prop: 8px; margin: var(--prop); margin-top: 10px"></div>
<div id="target4" style="--prop: 3px 5px 7px 11px; margin: var(--prop);"></div>
<div id="target5" style="--border1: 5px solid rgb(0,0,0); --border2: 3px dotted red;
     border-left: var(--border2); border: var(--border1);"></div>
<div id="target8" style="transition: opacity var(--duration); --duration: 2s"></div>
<div id="target9" style="border-style: dashed; --border1: 5px solid rgb(0,0,0);
     --border2: 3px dotted red; --width: 1px;
     border-left: var(--border1); border-width: var(--width);"></div>
<script>document.getElementById("target9").style.borderLeft = "var(--border2)";</script>
```

Obscura's cascade resolved one property *name* at a time. A `margin`
declaration was stored only under the key `margin`, so
`getComputedStyle(el).marginLeft` never saw it → `0px`. The `border-*-width` /
`-style` longhands weren't even modelled, so they returned `""`.

The interactions that make this subtle:

- **Order within a block.** `margin: 8px; margin-top: 10px` → top = 10, the rest
  = 8 (later longhand wins); `margin-top: 10px !important; margin: 8px` → top
  stays 10 (important is not overridden by the later normal shorthand).
- **`var()` in a shorthand is a *pending-substitution* value for every longhand**
  (CSS Variables): we cannot expand `margin: var(--prop)` at parse time because
  we don't yet know how many components `--prop` yields (`8px` → all sides; `3px
  5px 7px 11px` → four sides).
- **CSSOM precedence.** target9's `style.borderLeft = "var(--border2)"` must beat
  the markup `border-width: var(--width)` for `border-left-width` (3px, not 1px),
  while `border-top-width` stays 1px.

---

## The fix (all in `crates/obscura-js/js/bootstrap.js`)

**1. Expansion at declaration-parse time, into pending longhand slots.**
`_SHORTHAND_LONGHANDS` maps each modelled shorthand to the longhand names it
governs. `_expandDeclInto(out, name, value, important)` writes the shorthand name
itself **and** a slot for each governed longhand carrying `_sh` (the shorthand
name) and the *whole* shorthand value. `_putDecl` enforces within-block cascade
order: an `!important` slot is never clobbered by a later normal one; otherwise
the later declaration wins. Wired into every block parser feeding the cascade:
`_cssParseDecls` (author rules + the `style=""` attribute) and the live-CSSOM
(`el.style._props`) source in `_buildCascade`.

**2. Lazy split at computed-value time.** `_cascadeResolve` was refactored to sit
on a new `_cascadeWinner` (returns the winning `{s,d}`); `_specifiedDecl(el,
kebab)` returns `{value, sh}`. `_computedPropOf` now: resolves the specified
decl → substitutes `var()` (a shorthand bearing var is substituted as one whole
value) → if `_sh` is set, `_expandShorthand(_sh, v)` splits the value and keeps
`v = parts[kebab]` → then the existing colour-validity / CSS-wide / normalize
path runs on the per-longhand piece. A value that won't parse as the shorthand is
**invalid at computed-value time** (→ inherited-or-initial) — this is exactly
target7's `margin: var(--invalid)` → `0px`.

`_expandShorthand` parsers:
- `margin` / `padding` and `border-{width,style,color}`: the CSS box-edge rule
  (`_boxEdges`, 1–4 values → top/right/bottom/left), tokenised by `_wsTokens`
  (top-level whitespace, brackets kept intact so `rgb(0, 0, 0)` stays one token).
- `border` / `border-<side>`: `<line-width> ‖ <line-style> ‖ <color>` in any
  order (`_parseBorderSide` classifies each token; omitted components default to
  `medium` / `none` / `currentColor`).
- `transition`: comma-separated layers (`_commaSplitTop`); within a layer the
  first `<time>` is the duration, the second the delay, a timing-function token
  is recognised, everything else is the property.

**3. The 8 `border-*-{width,style}` longhands** added to `_GCS_DEFAULTS` (identity
computed serialization; unset width = `0px` because the initial border-style is
`none`). The `border-*-color` longhands were already in `_COLOR_PROPS`.

Why the two-source model still gets target9 right: CSSOM operations are *later in
time* = a higher cascade `order` than the `style=""` attribute source, so the
re-set `border-left` (→ `border-left-width` 3px) beats the markup `border-width`
(1px) for the left edge, while the top/right/bottom widths — which CSSOM never
re-set — keep their 1px from `border-width`.

---

## Result

`variable-substitution-shorthands` **13 → 51/51 (+38).**

**Zero regressions** (swept: css-variables — substitution-basic 11/13,
-filters 7/7, -background-properties 8/10, -cssText 8/11, -definition 71/73,
test_variable_legal_values 23/23; colour — color-computed 16/16, named 455/455,
rgb 95/99 [var/cqw caps], hex 6/6, opacity-computed 30/30; inheritance families —
css-color 4/4, inherit-initial 4/4, css-text 42, css-ui 28, css-fonts 39,
css-transitions 8, css-flexbox 20, css-grid 20; selectors — has/not-specificity
8/8, valid-invalid 30, disabled 7, readwrite-readonly 25; DOM — classlist 1420,
matches 669, closest 29, createElement 147, Element-getElementsByTagName 19;
obscura-dom unit 40/40). `qsa` / `css-backgrounds inheritance` are **wpt.live
HTTP 404s** (`bodyLen=42`, curl-confirmed) — transient serving, not regressions.

---

## Caps (honest)

- **`variable-cssText` 8/11** — the 3 fails are shorthand *serialization* through
  the CSSOM `cssText` getter (reconstructing `margin: …` from longhands), a
  separate specified-value serializer, deliberately untouched.
- **`variable-substitution-background-properties` 8/10** — the 2 gradient
  subtests need gradient canonicalization (drop default direction/shape,
  named→rgb, whitespace) — Quest #57's standing cap.
- **`color-computed-rgb` 95/99** — `var()`-in-channel (needs the custom-prop
  value inside `rgb()`) + `2cqw` container units (need real layout).
- **Border width/style interaction not modelled** — computed `border-*-width`
  ignores the side's style (a `none`/`hidden` style should force width `0`); the
  test always pairs a non-none style with the width it reads, so this is latent.
- Only `margin`/`padding`/`border*`/`transition` shorthands are expanded — `font`,
  `background`, `flex`, `grid`, `inset`, `gap`, `outline`, `list-style`, etc. are
  not (no test currently exercises them through this path).

## Next leverage

1. **More shorthands** — `outline`, `flex`, `gap`/`inset`, `list-style`,
   `text-decoration`, `font` — each opens its family's `*-shorthand` /
   computed tests; the expansion engine here is the template (add the longhand
   list + an `_expandShorthand` arm).
2. **Shorthand serialization** (the inverse) — reconstruct `getComputedStyle(el)
   .margin` / `.border` from longhands, and the CSSOM `cssText` round-trip
   (`variable-cssText` 8→11).
3. **Gradient canonicalization** (background-image/mask-image computed; the 2
   standing gradient caps).
4. A **specified-value serialization engine** (`serialize-values` 0/697) or a
   fresh realm (`fetch/`, `html/dom/` reflection).
