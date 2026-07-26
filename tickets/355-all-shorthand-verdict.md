# Quests #355–#357 — The `all` Shorthand Verdict

**Realm:** `css/cssom/cssstyledeclaration-all-shorthand.html`
**Hold:** 3/27 → **27/27** (100% file conquest) · **+24** · ZERO regressions · one commit · `bootstrap.js` only
**Session:** 2026-07-26 · took #354's next-leverage (a) — the `all` shorthand, the fattest held vein in `css/cssom/`.

---

## The gap

`all` (CSS Cascade §all) is the shorthand for **every** property except `direction`,
`unicode-bidi`, and custom properties. It accepts **only** a CSS-wide keyword
(`initial | inherit | unset | revert | revert-layer`). Obscura had no `all` handling
at all — it fell through to the generic raw-store, so:

- `setProperty('all','revert')` stored a bare `all: revert` key; `getPropertyValue('width')` → `""` (nothing derived it).
- `getPropertyValue('all')` returned the raw stored value even when a later property overrode it (`all: revert; width: 50px` → `"revert"`, should be `""`).
- `removeProperty('all')` deleted only the `all` key, not the declarations it covers.

## The work (all JS, one commit)

### #355 — storage: one sentinel key + drop-covered-before
`all` is modelled as a single sentinel key `_props['all']` = keyword, meaning "every
covered property not otherwise stored resolves to this keyword." Three write paths:
- **`setProperty('all', kw)`** (new branch, guarded to CSS-wide only — a non-CSS-wide value is invalid → ignored): delete every currently-stored **covered** key, then store the sentinel.
- **the `cssText` setter loop** (`_parseStyleDecls` emits an `all` decl): same clear-covered-then-store, inline in the loop so declaration ORDER is honoured — a covered property declared *after* `all` re-inserts on top and wins; one declared *before* is dropped. `insertRule`'s rule style is populated via this same `cssText` setter (`CSSStyleRule` ctor `this._styleDecl.cssText = body`), so the three `via insertRule` subtests come free.
- `_coveredByAll(k)` = `k !== 'all' && k !== 'direction' && k !== 'unicode-bidi' && !k.startsWith('--')`.

### #356 — reconstruction: `_allShorthandValue` + `_shorthandLonghandList`
`getPropertyValue` gains a top intercept (only when an `all` sentinel is live, so
plain pages are byte-identical): `_allShorthandValue(key)` returns
- **`all`** → the keyword iff no covered property was re-declared to a *different* value after it, else `""`.
- a **covered leaf** not re-declared → the keyword; re-declared (in `_props`) → `undefined` (normal path).
- a **covered shorthand** (longhand set from the new `_shorthandLonghandList`, reusing the existing `_BOX_LOGICAL_SH2` / `_FONT_SH_LH` / … maps): the shorthand key itself stored (`margin: initial`, single-key CSS-wide) → `undefined` (normal path returns `"initial"`); NO longhand re-declared → the keyword (uniform); ALL longhands re-declared → `undefined` (normal reconstruction, e.g. `"10px 20px 30px 40px"`); a partial mix → `""`.

### #357 — `getPropertyValue('all')` + `removeProperty('all')`
- `getPropertyValue('all')` = keyword iff every stored covered key equals the keyword (none escaped it), else `""`.
- `removeProperty('all')` clears **every** covered declaration + any sentinel, keeping `direction`/`unicode-bidi`/custom — so `width:50px; color:green; direction:rtl` → `removeProperty('all')` leaves only `direction`.

## Zero-regression sweep

serialize-values **696/697**, shorthand-serialization 6/7, cssstyledeclaration-csstext **11/11**,
cssom-setProperty-shorthand **76/76**, CSSStyleRule-set-selectorText 82/82,
**all-prop-initial-xml 382/382** (the `all` CASCADE path — unaffected, cascade reads
`_cssParseDecls`, not the CSSOM block), font-family-serialization-001 24/24,
animation-shorthand 36/36, variable-definition 71/73, cssom-cssText-serialize 1/1,
qsa 1975, classlist 1420, createElement 147. getComputedStyle-detached-subtree 0/6
stays layout-capped (pre-existing).

## Caps / Next

- **CAP:** none in this file (100%). The sentinel lives only in the CSSOM declaration
  block; it does not touch the computed-style cascade (which already handled `all`
  via `_cssParseDecls` — `all-prop-initial-xml` was already 382/382).
- **NEXT LEVERAGE:** (a) the `font`/`flex` cssText shorthand-COLLAPSE path
  (`shorthand-serialization` 6/7 + `flex-serialization` — `_serializeDeclBlock` only
  recombines box-model longhands via `_BOX_SHORTHANDS`); (b) keep re-baselining
  `css/cssom/` serialization/object files (a PARTIAL file is the tell); (c) a fresh
  `css/*/parsing/` dir. Reusable: the `all` sentinel model (one key + drop-covered-
  before + `_allShorthandValue` reconstruction), `_shorthandLonghandList` (a single
  shorthand→longhand lookup unifying the scattered maps — useful anywhere a generic
  "for each longhand of a shorthand" is needed).
