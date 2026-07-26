# 🏳️‍⚧️⚔️ The Border-Wide Verdict — Quests #346–#348

> Session 2026-07-26. Branch `engine-per-page-threads`. All JS (`bootstrap.js`), ONE commit, **+20**, ZERO regressions.

## The banner

Took #345's next-leverage (mine more `css/cssom/` object realms). A re-baseline of the
CSSOM object realm surfaced two winnable veins behind small primitive/parse gaps:

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css/cssom/cssom-setProperty-shorthand.html` | 58/76 | **76/76** | +18 |
| `css/cssom/CSSKeyframesRule.html` | 0/2 | **2/2** | +2 |

## The gaps & the work

### #346 — CSS-wide keyword round-trips for the `border`/`outline` shorthands (+18)

`cssom-setProperty-shorthand` sets every shorthand to `'initial'` and asserts
`getPropertyValue(name) === 'initial'`. `margin`/`padding`/`background`/`font`/… passed,
but all nine `border`/`border-top`/`border-right`/`border-bottom`/`border-left`/
`border-color`/`border-style`/`border-width`/`outline` shorthands failed (×2 = 18, the
normal + `!important` set variants; the remove variants passed trivially because a failed
set leaves `''` which `!= 'initial'`).

**Root cause.** Every reconstructed-shorthand `setProperty` branch guards its expansion
with `!_CSS_WIDE.has(low)` (so a CSS-wide keyword is kept as a single shorthand key, not
split across longhands). The `_BORDER_EXPAND` branch was the **only** one missing that
guard — so `border: initial` called `_expandBorderShorthand('border','initial')`, which
returns `null` (a CSS-wide keyword is not a valid `<border>` value), and the branch
`return`ed having stored nothing. `getPropertyValue('border')` then reconstructed from
the (empty) longhands via `_serializeBorderShorthand` → `''`.

**Fix.** Split the branch in two, mirroring `text-decoration`/`flex`/`border-radius`:
- non-CSS-wide (`!_CSS_WIDE.has(...)`) → expand into longhands as before;
- CSS-wide → clear the expanded longhands, then fall through to the generic single-key
  store (`this._props['border'] = 'initial'`). The existing `getPropertyValue`
  `_BORDER_EXPAND` guard (`if (key in this._props) return this._props[key]`) returns it
  verbatim.

`_serializeBorderShorthand` deliberately was **not** taught the all-CSS-wide case: its
border-image reset check and `_joinBorderSide` would turn all-`initial` longhands into
`'initial initial initial'` / `''`, not `'initial'`. Single-key storage is both simpler
and consistent with the other reconstructed shorthands.

### #347 — `CSS.supports` parity (part of the same 18)

`CSS.supports('border','initial')` was `false`: the supports validation site validated a
`_BORDER_EXPAND` value by expansion (`_expandBorderShorthand(name,val) != null`), which
fails for a CSS-wide keyword. Added the same `_CSS_WIDE` short-circuit there (matching how
`border-radius`/`text-decoration` short-circuit at that site) → `true`.

### #348 — `CSSKeyframesRule.cssRules` populated (+2)

`document.styleSheets[0].cssRules[0].cssRules.length` was `0`. The `CSSKeyframesRule`
constructor parsed its body with `_cssParseRuleList`, which — since Quest #316 — **drops
any block whose prelude fails `_parseSelectorList`**. A `@keyframes` body's preludes are
`0%`/`100%`/`from`/`to` — `<keyframe-selector>`s, **not** CSS selectors — so every keyframe
block was dropped.

**Fix.** New `_parseKeyframeBlocks(body)` reuses the same brace/string-aware block scan as
`_cssParseRuleList` but validates each prelude with `_canonKeyframeSelectorList`:
`<keyframe-selector># = [ from | to | <percentage> ]#`, with `from`/`to` lowercased and
`<percentage>` kept verbatim but constrained to `[0%, 100%]`; a bad selector drops that
block only. Wired into both the constructor and `appendRule`.

The `CSSKeyframesRule`/`CSSKeyframeRule` classes were otherwise already complete —
`.name` get/set (CSS-wide/`none` names serialize quoted in `.cssText`), `.cssRules`,
`.length`, the indexed getter (`kf[0]`), `findRule`/`deleteRule` (last-match wins),
and `CSSKeyframeRule.keyText`/`.style`/`.cssText`.

## Zero-regression sweep

qsa 1975, classlist 1420, cloneNode 135, register-property-syntax-parsing 246,
serialize-values 695/697, shorthand-serialization 7/7, CSSStyleRule-set-selectorText 82,
keyframes-name-invalid 20 + -valid 39, keyframes-rule-caching 1/1, border-style-valid 8,
border-color-valid 7. `cssstyledeclaration-csstext` 7/11 and
`getComputedStyle-detached-subtree` 0/6 untouched (pre-existing).

**Live CDP probe** confirmed: `border:'2px solid red'` still expands to longhands
(`borderTopWidth==='2px'`, `borderTopStyle==='solid'`); `border:'initial'` clears the
longhands and `getPropertyValue('border')==='initial'`; a subsequent
`borderTop:'thick dashed blue'` still expands (`borderTopWidth==='thick'`);
`outline:'inherit'` round-trips; `CSS.supports('border','initial')` and
`CSS.supports('border','2px solid red')` both `true`.

## Caps / Next

- **CAP** `getComputedStyle-detached-subtree` (0/6): returns `rgb(0,0,0)` where `""` is
  expected. A detached / `display:none` / outside-flat-tree element's computed style must
  be empty — needs rendered-ness / flat-tree awareness, layout-adjacent, not a CSSOM parse
  gap.
- **CAP** `cssstyledeclaration-csstext` 4 fails still architecturally risky
  (drop-unknown-property vs the raw-store strategy, logical-group-aware shorthand collapse,
  computed-style `cssText===""`).
- **NEXT LEVERAGE:** the computed-style `cssText===""` fix (smallest/safest), OR a
  dedicated drop-unknown-properties quest (touches the raw-store core), OR re-baseline
  other `css/cssom/` object realms (a PARTIAL file is the tell), OR scout a FRESH
  `css/*/parsing/` dir.
- **Reusable:** the reconstructed-shorthand CSS-wide pattern (a CSS-wide keyword clears the
  longhands and is kept as a single shorthand key), `_parseKeyframeBlocks` /
  `_canonKeyframeSelectorList` (a keyframe-selector-aware body parse).
