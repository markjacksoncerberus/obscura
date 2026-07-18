# Quest #72 — The Lowercased Verdict

> *Keyword colours wear their names in lowercase. `currentColor` is a costume;
> `currentcolor` is the truth on the wire.*

**Realm:** `css/css-backgrounds/parsing/background-color-valid` +
`css/css-backgrounds/parsing/border-color-valid` (specified-value keyword-`<color>`
serialization)
**Hold:** background-color **9/9**, border-color **7/7** (+2)
**Status:** ✅ SECURED — pure JS (`crates/obscura-js/js/bootstrap.js`), no new Rust.

---

## The gap

#68 (The Tinctured Verdict) added `_canonColorSpecified` to serialize legacy
hex/`rgb()`/`hsl()` colours into the canonical `rgb()`/`rgba()` form at *specified*
time, while deliberately keeping named colours, `transparent`, `currentcolor`,
CSS-wide keywords, and modern functions **verbatim** (they only resolve to an
`rgb()` at computed-value time). But "verbatim" preserved the *case as written* —
and CSSOM canonical serialization ASCII-lowercases a keyword ident. So:

```js
e.style['background-color'] = "currentColor";
e.style['background-color']; // got "currentColor", expected "currentcolor"
```

Real WPT cases (`background-color-valid.html`):

```
test_valid_value("background-color", "currentcolor", "currentcolor");  // passed (identical)
test_valid_value("background-color", "currentColor", "currentcolor");  // FAILED — case kept
```

`background-color-valid` was 8/9, `border-color-valid` 6/7 — both on the same
`currentColor` case. `border-color` is additionally a *shorthand* (1–4 colours,
`red yellow green blue`) that wasn't routed through any colour canonicaliser at all.

## The fix

**1. Lowercase the keyword branch of `_canonColorSpecified`.** It already
short-circuits the keyword/CSS-wide forms; it now returns the ASCII-lowercased
ident (`low`) instead of the verbatim `value`:

```js
const low = s.toLowerCase();
// Keyword colours (named/`transparent`/`currentcolor`) and CSS-wide keywords
// serialize as the ASCII-lowercased ident — `currentColor`→`currentcolor`,
// `Red`→`red` — but otherwise keep their keyword form (they only resolve to an
// rgb() at computed-value time, unlike the legacy hex/rgb/hsl forms below).
if (low === 'transparent' || low === 'currentcolor' || _CSS_WIDE.has(low) || _CSS_NAMED_COLORS[low]) return low;
```

Legacy hex/`rgb`/`hsl` still resolve to canonical `rgb()`/`rgba()` (unchanged); modern
functions (`light-dark()`/`color-mix()`/relative `rgb(from …)`)/`var()`/unparseable
still round-trip verbatim (the `out === s` guard below is untouched).

**2. A colour-shorthand canonicaliser.** New `_canonColorShorthand` + a
`_COLOR_SHORTHAND_PROPS` set (`border-color`, `border-block-color`,
`border-inline-color`):

```js
const _canonColorShorthand = (value) => {
  if (!value) return value;
  const toks = _splitTopLevel(String(value));
  if (toks.length === 0) return value;
  return toks.map((t) => _canonColorSpecified(t)).join(' ');
};
```

`_splitTopLevel` only breaks at paren depth 0, so a single colour with internal
spaces/commas (`rgb(0, 0, 255)`, `rgb(0 128 255)`) stays whole; each top-level
`<color>` token is canonicalised independently. `currentColor`→`currentcolor`;
`red yellow green blue` stays `red yellow green blue` (each token already canonical).
Wired into the `_parseStyleDecls` and `setProperty` colour branches alongside
`_COLOR_PROPS`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-backgrounds/parsing/background-color-valid.html` | 8/9 | **9/9** |
| `css/css-backgrounds/parsing/border-color-valid.html` | 6/7 | **7/7** |

**+2.**

## Zero-regression sweep

serialize-values 695/697 (its colour list is all-lowercase fixed points and it sets
no `border-color`), color-valid 17/17, color-computed 16/16, color-computed-rgb 95/99,
caret-color-valid 15/15, text-decoration-color-valid 3/3, column-rule-color-valid 2/2,
css-color/inheritance 4/4, gradient-position-valid 18/18, image-function-valid 13/13,
background-position-computed 32/32, variable-substitution-background-properties 10/10,
shorthand-serialization 7/7, Document-createElement 147/147; `cargo test -p obscura-dom`
40/40.

## Caps / next leverage

1. **`resolve-relative-to-stylesheet`** (0/3) — a relative `url()` in an *external*
   stylesheet resolves against the *stylesheet's* URL; needs external-CSS loading into
   the cascade with a per-stylesheet base URL. The broad `<url>`-computed prize, bigger
   build.
2. **Comprehensive valid-property registry** — csstext unknown-prop drop +
   general per-property value validation; the standing serialize-values hot-path risk
   (the registry MUST be a superset of the ~95 props serialize-values sets).
3. **Broaden `_canonUrls`** to non-image `<url>` props (`cursor`/`content`/
   `@font-face src`) — register each for computed serialization first.
4. **Fresh realm** (`fetch/`, `html/dom/` reflection).

**Foundational note:** every wpt.live-404'd `*-color-valid` longhand
(`border-top/right/bottom/left-color`, `text-emphasis-color`) and the border-color
flow-relative shorthands inherit the `currentColor`→`currentcolor` green for free
once served — this is a primitive, not a one-off.

— knight Claude, 2026-06-22
