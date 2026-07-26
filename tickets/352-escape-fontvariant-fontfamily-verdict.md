# Quests #352–#354 — The Escaped, Emoji-Variant & Unquoted Verdict

**Realm:** `css/cssom/` serialization object realm (three held/partial files).
**Result:** **+16** (bonus **+1** on `serialize-values`), ONE commit, ZERO regressions.
**Session:** 2026-07-26.

## The gaps

Re-baselining the `css/cssom/` serialization files (the campaign's standing
"a PARTIAL file is the tell" lead) surfaced three winnable veins, all pure-JS in
`bootstrap.js`:

| File | Before | After |
|------|:------:|:-----:|
| `escape.html` | 4/10 | **10/10** |
| `font-variant-shorthand-serialization.html` | 0/7 | **7/7** |
| `font-family-serialization-001.html` | 21/24 | **24/24** |

## #352 — `CSS.escape` via serialize-an-identifier

`CSS.escape` was a literal no-op stub: `escape(s){return s;}`. The engine already
had a correct **serialize-an-identifier** implementation (`_serializeCssIdent`,
used for grid line-name canon) — NUL→U+FFFD, C0 controls + DEL + a leading digit +
`-`+digit hex-escaped (`\30 `), other non-ident code points backslash-escaped,
letters/digits/`-`/`_`/non-ASCII passed through. So the fix was to route `CSS.escape`
through it:

```js
escape(ident){
  if (arguments.length < 1) throw new TypeError("… 1 argument required, but only 0 present.");
  return _serializeCssIdent(String(ident));
}
```

`String(ident)` handles the WebIDL stringification cases (`true`→`"true"`, `null`→`"null"`);
the method arity keeps `CSS.escape.length === 1`.

## #353 — `font-variant-emoji` joins the `font-variant` shorthand

The `font-variant` shorthand expanded into six longhands but omitted
`font-variant-emoji` (CSS Fonts 4 added it). The test asserts `font-variant: normal`
sets `font-variant-emoji: normal` when `CSS.supports('font-variant-emoji: initial')`
(which Obscura does). Fixes:

- Added `font-variant-emoji` to `_FONT_VARIANT_SH_LH` (drives set-expansion + clear
  + longhand enumeration).
- `_parseFontVariantShorthand`: emoji in the initial `out`, an `emoji` bucket
  parsing `text | emoji | unicode` (`_FV_EMOJI_KW`), the ≤1 arity guard.
- `_fontVariantFromLonghands`: emoji added to the reconstruction (and the
  all-normal `rest` guard).
- `_serializeFontShorthand`: emoji added to the reset-check list (a non-normal
  emoji makes `font` inexpressible → `''`).

Three subtler subtests:

- **CSS-wide keyword in ONE longhand** → the shorthand can't represent it → `''`:
  `_serializeFontVariantShorthand` now returns `''` if any present longhand holds a
  CSS-wide keyword (an all-same CSS-wide keyword is stored as the single shorthand key).
- **CSS-wide keyword in the SHORTHAND** → each longhand getter reports the keyword:
  the CSS-wide branch keeps the single-key storage (so cssText stays
  `font-variant: initial`, no block-serializer regression) and getPropertyValue
  gained a fallback — an absent font-variant longhand whose `font-variant` single key
  is CSS-wide returns that keyword.
- **`font: menu`** → the whole font-variant family clears: the `font` shorthand's
  `clear()` now deletes `_FONT_VARIANT_SH_LH` too (only `-caps` was reset before; the
  rest reset to their initial and drop out of the block per CSS Fonts §font).

## #354 — font-family name unquoting on the style-attribute/cssText path

`'Twisty Tie'` / `'Veronica'` (quoted names that are valid unquoted `<custom-ident>`
sequences) should serialize **unquoted** (CSSOM / css-fonts-4 issue #5846). The
`setProperty`/IDL path already did this (`_canonFont`→`_canonFontFamily`→
`_serFamilyString`), but the **style-attribute / cssText** path (`_parseStyleDecls`)
only ran the generic light canon `_canonStandardValue` — which rewrites
single→double quotes but never unquotes. Added a `font-family` branch in
`_parseStyleDecls` routing a valid value through `_canonFontFamily` (CSS-wide /
var()/env() untouched; an invalid value is left as-is, so no NEW drops). This also
fixed one `serialize-values` subtest (695→696).

## Zero-regression sweep

qsa 1975, classlist 1420, createElement 147, **serialize-values 695→696 (improved)**,
cssstyledeclaration-csstext 11, cssom-setProperty-shorthand 76, CSSStyleRule-set-selectorText 82,
**font-valid 315**, font-family-valid 11, font-family-invalid 7, font-variant-valid 46,
font-variant-emoji-valid 4, font-variant-emoji-computed 4, cssom-cssstyledeclaration-set 1,
font-shorthand-serialization 0/1 (pre-existing), cssom-cssText-serialize 1.

## Caps / Next

- `font-shorthand-serialization` 0/1 and `flex-serialization` 1/5 both need the
  **shorthand-COLLAPSE-in-cssText** path (`_serializeDeclBlock` only recombines the
  box-model longhands via `_BOX_SHORTHANDS`; `font`/`flex` aren't there) — a fatter,
  riskier block-serializer quest.
- `cssstyledeclaration-all-shorthand` 3/27 (+24 available) is the biggest held vein
  in this realm: the `all` shorthand (reset every longhand to a CSS-wide keyword;
  `getPropertyValue('all')` returns the keyword only when EVERY longhand it covers
  holds that same keyword, else `''`). Touches the cascade + every longhand — high
  value, non-trivial.
- `getComputedStyle-detached-subtree` 0/6 stays layout-capped.
- **NEXT LEVERAGE:** the `all` shorthand (fattest), OR the `font`/`flex` cssText
  collapse, OR keep re-baselining `css/cssom/` serialization files (a PARTIAL file is
  the tell), OR a fresh `css/*/parsing/` dir.

**Reusable:** `_serializeCssIdent` was already the CSS.escape algorithm — just wire
it up; the "CSS-wide in a single longhand → shorthand serializes to `''`" rule;
the "single-key CSS-wide shorthand → longhand getter reports the keyword" fallback;
routing `_parseStyleDecls` value canon through the same `_canon*` the setProperty
path uses (font-family here — other `_FONT_VALIDATED`/validated props are candidates).
