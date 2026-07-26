# 343–345 — The Import-Rule Verdict

**Realm:** `css/cssom/` — the CSSOM object model (rules, stylesheets, media lists).
**Result:** **+14 across 3 quests, ONE commit, ZERO regressions.**
**Session:** 2026-07-26. Branch `engine-per-page-threads`.

## The gap

Quests #340–#342 declared the CSS Properties & Values API computed realm secured
and pointed the next-leverage at `css/cssom/` object realms. A baseline confirmed
the vein:

| Test | Before |
|------|:------:|
| `css/cssom/cssimportrule.html` | 3/11 |
| `css/cssom/CSSStyleSheet.html` | 11/17 |
| `css/cssom/cssstyledeclaration-csstext.html` | 7/11 |

Two of these are behind a **missing primitive** (the `CSSImportRule` interface)
and a cluster of **WebIDL-arity/legacy-method** bugs on `CSSStyleSheet` — both the
kind of clean, self-contained, zero-risk work the CSSOM object realm rewards.

## The work (3 quests, 1 commit — all JS, `bootstrap.js`)

### #343 — `MediaList` as a real interface object + the `CSSImportRule` primitive
`@import` fell through `_cssParseRuleList` as a `type:'stmt'` descriptor and was
built by `_makeRule` into a bare `CSSGenericRule` — it echoed the prelude verbatim
as `cssText` and had none of the `CSSImportRule` attributes, so `rule instanceof
CSSImportRule` was false and the URL/media/styleSheet were unreadable.

- **`MediaList` became a real class** (`globalThis.MediaList`). `_makeMediaList`
  still returns a Proxy over an object literal, but its backing object's prototype
  is now set to `MediaList.prototype` (`Object.setPrototypeOf`), so a CSSOM media
  list satisfies `x instanceof MediaList` (a Proxy with no `getPrototypeOf` trap
  forwards `[[GetPrototypeOf]]` to the target).
- **`CSSImportRule`** (beside `CSSFontFaceRule`): readonly `.href` (the unescaped
  import URL), `.media` (a live `MediaList`), `.styleSheet` (an empty
  `CSSStyleSheet` owned by the rule — we don't fetch the imported sheet, but
  `instanceof CSSStyleSheet` holds), `.supportsText`, `.type===3` (IMPORT_RULE).
  Wired into `_makeRule` via `desc.type === 'stmt' && desc.name === 'import'`.
- **`_parseImportRule(prelude)`** → `{ href, supportsText, mediaText }`: parses
  `@import [<url>|<string>] <layer>? [supports(<condition>)]? <media-query-list>?`.
  A `url(<string>|<token>)` or a bare `<string>` yields the (backslash-unescaped)
  href; an optional cascade `layer`/`layer(...)` is skipped; a balanced
  `supports(...)` yields `supportsText`; whatever trails is the media text.

### #344 — serialization + the two `media` PutForwards setters
- **cssText** follows the CSSOM serialization: `@import url("…") [supports(…)]?
  [<media>]?;` with the URL as a **double-quoted CSS string** via `_serCssString`
  (`@import url('quote"quote')` → `@import url("quote\"quote");`), supports before
  media, media only when the list is non-empty (so `all`/`screen` are kept but an
  empty list emits nothing).
- **`CSSImportRule.media`** and **`CSSStyleSheet.media`** gained `[PutForwards=
  mediaText]` setters (`this._media.mediaText = String(v)`), so `rule.media =
  "print"` / `sheet.media = "screen"` update the list text instead of silently
  no-opping against a getter-only property.

### #345 — `CSSStyleSheet` WebIDL arity + legacy `addRule`/`removeRule`
- **`insertRule()` / `deleteRule()` with no argument now throw `TypeError`** (the
  required WebIDL member is missing) instead of `SyntaxError` / silently deleting
  rule 0. The missing `deleteRule` guard was the root of a **cascade**: the
  sequential test's "deleteRule with no argument throws" case silently deleted an
  extra rule, throwing off every subsequent rule-count assertion (`removeRule`,
  `addRule @media`, `removeRule(1)`).
- **Legacy members** (CSSOM §legacy-css-style-sheet-members): `addRule`
  string-concatenates `selector + " { " + block + " }"`, but both arguments now
  default to the string `"undefined"` (so `addRule()` inserts a rule whose selector
  is `undefined` and whose invalid block drops to empty → `undefined { }`);
  `removeRule` defaults its index to 0 via `index >>> 0`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/cssom/cssimportrule.html` | 3/11 | **11/11** |
| `css/cssom/CSSStyleSheet.html` | 11/17 | **17/17** |

**+14.**

## Zero-regression sweep (all held)

qsa 1975, classlist 1420, register-property-syntax-parsing 246, serialize-values
695/697, cssom-pagerule 22, CSSGroupingRule-insertRule 7/7, insertRule-no-index
2/2, CSSStyleRule-set-selectorText 82, CSSRuleList 1/1, MediaList 1/1,
cssom-fontfacerule 1/1, at-property-cssom 40, size-valid 15, keyframes-name-invalid
20, counter-style system-syntax 16 + symbols-syntax 11, **cssstyledeclaration-csstext
7/11 (untouched)**.

## Caps / Next

- **cssstyledeclaration-csstext 7/11 is left on the table (4 winnable-looking but
  architecturally risky fails):**
  - *"uppercase property"* / *"invalid property does not appear"* — `style.COLOR =
    'red'` and `style.unknown = 'unknown'` should be plain JS expandos, not CSS
    declarations. The `_styleProxy` set trap routes **any** unknown camelCase member
    to `setProperty`, which raw-stores it. The spec-correct fix (drop properties
    that aren't a known CSS property or a `--custom`) collides head-on with
    Obscura's **raw-store strategy** for unmodelled-but-plausible properties (it's
    how many parsing tests pass) — needs a comprehensive known-property gate and a
    hard regression sweep. Deferred as a dedicated quest.
  - *"Shorthands aren't serialized … logical groups in between"* — the CSSOM
    "serialize a declaration block" shorthand-collapse must be **logical-group
    aware** (don't collapse `margin` across interleaved `margin-inline`/`-block`).
    Obscura's margin serializer over-collapses. Deep serialization change.
  - *"cssText on a computed style declaration returns the empty string"* — the
    computed-style declaration's `cssText` getter must return `""`; currently
    errors. Small but lives in the getComputedStyle Proxy.
- **NEXT LEVERAGE:** the `@import` rule + MediaList primitives are secured. Roads:
  (a) the cssstyledeclaration-csstext computed-style `cssText === ""` fix (smallest,
  lowest-risk of the three above); (b) a dedicated "drop unknown properties from the
  IDL-attribute setter" quest (touches the raw-store core — high value, needs care);
  (c) other `css/cssom/` object realms (`CSSStyleSheet` constructor arity 11/17 is
  now **17/17** — done; re-baseline `cssstyledeclaration-*`, `CSSKeyframesRule`),
  or (d) scout a FRESH `css/*/parsing/` dir (re-baseline even green realms — a
  PARTIAL file is the tell).
- **Reusable:** `CSSImportRule`/`_parseImportRule` (the statement-at-rule primitive
  template), `MediaList` as a real interface object (`Object.setPrototypeOf` on the
  Proxy backing), the `[PutForwards=mediaText]` media setter, the CSSOM WebIDL-arity
  guard pattern (`arguments.length < 1 → TypeError`).
