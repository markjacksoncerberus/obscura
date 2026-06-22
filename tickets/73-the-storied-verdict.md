# Quest #73 — The Storied Verdict

> *A page tells its story in quotes, counters, and conjured images. We could not
> even read the story back — `getComputedStyle().content` returned the empty
> string. Now the tale serializes true.*

**Realm:** `css/css-content/parsing/content-computed` +
`css/css-content/parsing/content-valid` (the `content` property — a content-list
of strings / counter()/counters() / url()/`<image>` / quote keywords, plus an
optional `/ <alt-text>`)
**Hold:** content-computed **41/41**, content-valid **46/46** (+49)
**Status:** ✅ SECURED — pure JS (`crates/obscura-js/js/bootstrap.js`), no new Rust.

---

## The gap

`content` was never registered for computed style, so
`getComputedStyle(el).content` returned `""`. The whole `content-computed` suite
failed its support check (`content doesn't seem to be supported in the computed
style`) — **0/41**. And the `content-valid` specified path stored the value
verbatim after the generic `_canonStandardValue` pass, so it never dropped the
default `decimal` `<counter-style>` — **38/46**.

The CSS Content 3 serialization rules the tests check:

- **counter()/counters() drop a default `decimal` style** (ASCII-case-insensitive),
  at *both* specified and computed time:
  ```
  counter(counter-name, dECiMaL)            → counter(counter-name)
  counter(counter-name, DECIMAL)            → counter(counter-name)
  counters(counter-name, ".", dECiMaL)      → counters(counter-name, ".")
  ```
  A custom-ident style (`counter-style`) is **kept** verbatim.
- **Gradient content-items canonicalize** like any `<image>` (computed):
  ```
  linear-gradient(to top right, red calc(10% + 2em), blue
      → linear-gradient(to right top, rgb(255, 0, 0) calc(10% + 32px), rgb(0, 0, 255))
  radial-gradient(ellipse 50% 40% at calc(2em + 10px) 30%, red, blue)
      → radial-gradient(50% 40% at 42px 30%, rgb(255, 0, 0), rgb(0, 0, 255))
  conic-gradient(from 1.5708rad, red 0deg, blue calc(180deg - 10deg))
      → conic-gradient(from 90.0002deg, rgb(255, 0, 0) 0deg, rgb(0, 0, 255) 170deg)
  ```
- **url()s** round-trip (the test uses an already-absolute, double-quoted URL).

## The fix

**1. Register `content` for computed style.** Added `content: 'normal'` to
`_GCS_DEFAULTS` (css-content section) so `getComputedStyle` routes it — this alone
clears the support check and the ~38 identity-serializing subtests (quotes,
strings, counter/counters with custom or no style, url, combinations).

**2. `_canonContent(value, el, computed)`** — a small content-list canonicaliser
wired into `_parseStyleDecls` + `setProperty` (specified) and `_normComputed`
(computed):

```js
const _canonContent = (value, el, computed) => {
  let v = _canonCounterFns(String(value));
  v = _canonGradients(v, el, computed);          // gradient items → existing engine
  if (computed) v = _canonUrls(v, el);           // url() absolutization (idempotent)
  return v;
};
```

**3. `_canonCounterFns`** — a balanced-paren, token-boundary-aware scan for
`counter(`/`counters(` heads. For each, split the inner on top-level commas; if the
last argument is exactly `decimal` (case-insensitive) and the arg count is the full
`name[, sep], <style>` form, drop it. A call that isn't rewritten is copied
**byte-for-byte**, so escaped counter names (`counter(\})`, `counters(\}, ".")`)
round-trip untouched.

**4. `_splitCommaQuoted`** — a quote-aware top-level comma splitter. Neither
`_commaSplitTop` nor `_splitTopLevel` skips strings, and a counters() separator may
legitimately contain a comma (`counters(n, ",")`); this one skips commas inside
parens/brackets **and** inside quoted strings (consuming `\` escapes).

**5. Linear `to <side-or-corner>` reorder** in `_canonGradientDirection` — the one
gradient content-item that needed a new rule. CSSOM serializes a linear-gradient
corner horizontal-side-first:

```js
// `to top right` → `to right top`; a single side / already-canonical corner /
// bare <angle> is unchanged.
if (toks.length === 3 && toks[0].toLowerCase() === 'to') {
  const a = toks[1].toLowerCase(), b = toks[2].toLowerCase();
  const vert = (x) => x === 'top' || x === 'bottom';
  const horiz = (x) => x === 'left' || x === 'right';
  if (vert(a) && horiz(b)) toks = ['to', toks[2], toks[1]];
}
```

This is a shared change (also touches `background-image`/`mask-image`/… gradients),
applied at both specified and computed time as a correct CSSOM canonicalization. The
radial `ellipse`-drop and conic `from <angle>` cases were **already** handled by the
#64–67 gradient engine — only the linear corner reorder was missing.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-content/parsing/content-computed.html` | 0/41 | **41/41** |
| `css/css-content/parsing/content-valid.html` | 38/46 | **46/46** |

**+49.**

## Zero-regression sweep

The risky shared change is the linear corner-reorder, so the whole gradient family
was swept: gradient-interpolation-method-valid 1398/1398, -computed 932/932,
gradient-position-valid 18/18, -computed 43/43, image-function-valid 13/13,
-computed 3/3, background-image-valid 13/13, mask-image-computed 47/47. Plus the
hot path + neighbours: serialize-values 696/697 (≥ the standing 695; the 1 fail is
the pre-existing `calc()` additive-ordering cap — content registration nudged it up
by 1), background-position-computed 32/32, color-valid 17/17, color-computed 16/16,
variable-substitution-background-properties 10/10, shorthand-serialization 7/7,
cursor-computed 36/39 + cursor-valid 42/46 (unchanged — cursor isn't a gradient
prop, so the reorder doesn't reach it), Document-createElement 147/147;
`cargo test -p obscura-dom --lib` 40/40.

## Caps / next leverage

1. **`cursor` gradient + image-set canon** — `cursor-computed` 36/39: its 3 fails
   are gradient content-items (`cursor: linear-gradient(…), auto`) — registering
   `cursor` in `_GRADIENT_PROPS` + `_GCS_DEFAULTS` (initial `auto`) routes them
   through the now-complete engine (a near-free +3). `cursor-valid` 42/46 needs
   `image-set("url" 1x)`→`image-set(url("url") 1x)` (string→`url()` wrap) +
   `calc(2 + 0)`→`calc(2)` integer-calc simplification + `light-dark()` — separate,
   smaller primitives.
2. **`resolve-relative-to-stylesheet`** (0/3) — relative `url()` in an *external*
   stylesheet resolves against the stylesheet's URL; needs external-CSS loading into
   the cascade with a per-stylesheet base URL. The broad `<url>`-computed prize,
   bigger build.
3. **Comprehensive valid-property registry** — csstext unknown-prop drop + general
   per-property value validation; the standing serialize-values hot-path risk (MUST
   be a superset of the ~95 props serialize-values sets).
4. **Fresh realm** (`fetch/`, `html/dom/` reflection).

**Foundational note:** `_canonContent` + the `decimal`-drop is the first piece of
content-list canonicalisation; `counter-set`/`@counter-style` and the `string-set`
property share the same counter grammar. The quote-aware `_splitCommaQuoted` is a
reusable primitive wherever a CSS function takes string arguments.

— knight Claude, 2026-06-22
