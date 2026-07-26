# 🔤 The Font-Face-Rule Verdict — Quests #331–#333

> Realm: `css/css-fonts/parsing/` `@font-face` descriptors + `css/cssom/` font-face rule.
> Banner: the `CSSFontFaceRule` primitive + the `@font-face` descriptor value engines
> (`src` / `size-adjust` / metric-overrides). **+137, ONE commit, ZERO regressions.**

## The gap

`@font-face` produced a bare `CSSGenericRule` with **no `.style`**. Every one of these
parsing tests reads `sheet.cssRules[0].style.getPropertyValue(descriptor)`, so
`.style` was `undefined` → `.getPropertyValue` threw → the whole file sat at 0 PASS.

Baselines (all `--stealth`, `wpt.live`):

| File | Before |
|------|:------:|
| `font-face-metric-overrides` | 0/21 |
| `font-face-size-adjust` | 0/6 |
| `font-face-src-format` | 0/35 |
| `font-face-src-tech` | 0/39 |
| `font-face-src-local` | 0/18 |
| `font-face-src-list` | 0/17 |
| `css/cssom/cssom-fontfacerule` | 0/1 |

## The work — 3 quests, 1 commit

This is the **same typed-at-rule template** as the `@page`/`CSSPageRule` primitive
(#328) and `CSSFontPaletteValuesRule` (#297): a dedicated CSSOM rule class whose
declaration block becomes `.style`, plus a declaration-context flag so a descriptor
is accepted ONLY inside its at-rule.

### #331 — the `CSSFontFaceRule` primitive + metric/size-adjust descriptors (+27)
- New `CSSFontFaceRule` class (CSSOM §CSSFontFaceRule): `.style` (a `CSSStyleDeclaration`),
  `.cssText`, `type === CSSRule.FONT_FACE_RULE (5)`.
- `@font-face` routes to `{ type: 'font-face' }` in `_cssParseRuleList` + a
  `CSSFontFaceRule` branch in `_makeRule` (was the fall-through `CSSGenericRule`).
- The rule's `.style` carries `_fontFaceDescriptors = true`, threaded through
  `_parseStyleDecls(text, opts.fontFace)` / `setProperty` / the `cssText` setter, so
  the font-face-only descriptors (`_FONT_FACE_ONLY` = `src`, `size-adjust`,
  `ascent-override`, `descent-override`, `line-gap-override`) are accepted only on a
  font-face rule's style and **dropped on element styles** (mirrors `@page`'s
  `_DESCRIPTOR_ONLY`/`_pageDescriptors`).
- `_canonFontPct(value, allowNormal)`: `normal | <percentage [0,∞]>` (metric overrides)
  and `<percentage [0,∞]>` (size-adjust). The magnitude is echoed verbatim
  (`100000000000%` stays exact); a leading `+` is dropped as canonical; negatives reject.

### #332 — the `src` `<font-src-list>` value engine (+70)
`_canonFontSrc`: split the value on **top-level commas** (`_splitCommasTopLevel`,
paren/bracket/string-aware); parse each `<font-src>` independently
(`_canonFontSrcComponent`); DROP an invalid non-empty component; the descriptor is
invalid **only when every non-empty component is bad** (an empty/`/*comment*/`
component is silently skipped). `_srcTokenize` breaks a component into top-level
`ident( … )` functions — any bare token = junk → invalid. Two component shapes:
- `local( <family-name> )` — a `<string>` (any) OR one-or-more `<custom-ident>`; a lone
  CSS-wide / reserved keyword (`local(inherit)`, `local(default)`) is excluded but is
  fine as PART of a multi-ident name (`local(inherit A)`); `12px` (a non-ident) rejects.
- `url() [format()]? [tech()]?` in that exact order (nothing trailing). `format()` = a
  single `<string>` (any, incl. unknown) OR a single known keyword
  (`opentype`/`truetype`/`woff`/`woff2`/`collection`/`embedded-opentype`/`svg`);
  multiple values / unknown keyword / empty reject the component.
- CSSOM serialization: a url serializes as a **quoted string** `url("…")` (bonus:
  `cssom-fontfacerule` 0→1, which asserts `style.src === 'url("http://…")'`).

### #333 — the `tech()` function + CSSOM keyword serialization (+39)
- `tech( <font-tech># )`: a comma-separated keyword list (`_FONT_TECH_KW` =
  `features-opentype`, `features-aat`, `features-graphite`, `color-colrv0`, `color-colrv1`,
  `color-sbix`, `color-cbdt`, `color-svg`, `palettes`, `variations`, `incremental`);
  **strings rejected** (unlike `format()`), space-separated rejected, and `format()`
  must **precede** `tech()`.
- Per CSSOM, keyword component values serialize ASCII-lowercased. The test
  (`check_same_tech`) extracts + sorts + **case-compares** the serialized `tech()` list,
  so `_canonFontSrcComponent` re-serializes each surviving component with the `tech()`
  and `format()` keywords lowercased (url/string args are case-sensitive → preserved).

## Results

Every targeted file → **100%**: metric-overrides 21/21, size-adjust 6/6, src-format
35/35, src-tech 39/39, src-local 18/18, src-list 17/17, cssom-fontfacerule 1/1. **+137.**

## Zero-regression sweep

qsa 1975, classlist 1420, createElement 147, cssom-pagerule 22, font-palette-values
36 + 27, serialize-values 695/697, CSSStyleRule-set-selectorText 82,
CSSGroupingRule-insertRule 7/7, CSSFontFaceRule 1/1, size-valid 15,
keyframes-name-invalid 20 (real path is `.../parsing/...`), font-family-valid 11 +
-invalid 7, font-feature-settings-valid 10, crash-font-face-invalid-descriptor 1/1.

## Caps / Next

- **CAP — unmodelled `@font-face` descriptors:** `unicode-range` (the `U+…` range
  grammar), the range-form `font-weight`/`font-style`/`font-stretch` (a font-face
  variant accepting two values), and `font-display`. Element-property `font-family`
  etc. already flow through the generic path on a font-face style.
- **CAP — `CSSFontFaceDescriptors` interface:** `cssom-fontfacerule-constructors` (2)
  wants `Object.prototype.toString.call(rule) === "[object CSSFontFaceRule]"` and
  `.style` → `"[object CSSFontFaceDescriptors]"`; `cssstyledeclaration-cssfontrule.tentative`
  (1) wants `"unicode-range" in style`. These need a `Symbol.toStringTag` on the rule +
  a `CSSFontFaceDescriptors` style subclass (the `_styleProxy` currently returns
  `undefined` for `Symbol.toStringTag`) + `in`-operator descriptor enumeration.
- **NEXT LEVERAGE:** finish the `@font-face` descriptor family (above) + the
  `CSSFontFaceDescriptors` interface, OR pivot to the `@property`
  (`register-property-syntax-parsing` 0/246, `at-property-cssom` 7/40) or `@counter-style`
  at-rule families — all the **same typed-at-rule template**. Reusable primitives:
  the `CSSFontFaceRule`/`_makeRule` typed-rule template, the `_fontFaceDescriptors`
  declaration-context flag, `_canonFontSrc`/`_canonFontSrcComponent`/`_srcTokenize`/
  `_splitCommasTopLevel`, `_canonFontPct`.
