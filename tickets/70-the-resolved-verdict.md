# Quest #70 — The Resolved Verdict

> *Computed-time URL absolutization: a relative `url()` in an `<image>`/`<url>`
> property resolves to its absolute URL against the document base URL.*

**Realm:** `css/css-values/urls/resolve-relative-to-base.sub.html`
**Hold:** 0/2 → **2/2** · **+2**
**Difficulty:** ⚔️
**Status:** ✅ SECURED — session 2026-06-21

---

## The gap

Quest #69 named **URL absolutization** as the standing foundational `<url>`-computed
primitive. A reachability sweep this session confirmed the picture:

- The aspirational `image-set-*` / `cross-fade-*` pointers from #69's memory **do not
  exist** as WPT tests (`css/css-images/parsing` has no such files — confirmed via the
  GitHub contents API). Those were optimistic notes, not real targets.
- The `<url>` family lives in `css/css-values/urls/`. Two reachable fail-regions:
  - **`resolve-relative-to-base.sub.html`** 0/2 — relative `url()` resolves against the
    document base URL (`<base href>`).
  - `resolve-relative-to-stylesheet.html` 0/3 — relative `url()` in an *external*
    stylesheet resolves against the **stylesheet's** URL. Returns `none` (the external
    `<link>` stylesheet isn't applied at all) → needs external-CSS loading into the
    cascade, a much bigger gap. **Deferred.**
  - `image-function-invalid.html` 0/6 — needs per-property value *validation* (the
    standing risky valid-registry cap). **Deferred.**

The base-relative test:

```html
<base href="http://www.not-wpt.live">
<style>
  :root { --image-path: url("images/test.png"); }
  #relative-image-url          { background-image: url(images/test.png); }
  #relative-image-variable-url { background-image: var(--image-path); }
</style>
```

```js
const got = getComputedStyle(el)["background-image"];
const want = `url("${new URL("images/test.png", document.baseURI).href}")`;
// want === 'url("http://www.not-wpt.live/images/test.png")'
```

Obscura stored `background-image` verbatim at computed time:
- non-variable → `url(images/test.png)` (unquoted — the author-stylesheet path doesn't
  quote)
- variable → `url("images/test.png")` (quoted — the var() fallback was written quoted)

Neither was resolved to absolute. A bare `url()` isn't inside any `_IMAGE_FUNC_HEAD`
function, so `_canonGradients`'s function scan left it untouched.

## The fix (pure JS, `bootstrap.js`, NO new Rust)

New **`_canonUrls(value, el)`** — a computed-time pass that scans a value for `url()`
tokens and rewrites each to its absolute URL:

- Base URL via `el.baseURI` (already backed by `_documentBaseURL`, which resolves the
  first `<base href>` against the document URL), falling back to `document.baseURI`.
- Handles both grammar forms: the quoted functional `url("a")` / `url('a')` and the
  unquoted url-token `url(a)` (trailing whitespace trimmed, backslash escapes consumed).
- Resolves with `new URL(raw, base).href`; serializes double-quoted (`\`/`"` escaped).
- **Idempotent / fail-safe:** a `url()` whose target won't parse (e.g. an unsubstituted
  `{{token}}`) or one that is already absolute round-trips byte-identical. Empirically
  verified in-engine: `new URL("http://{{host}}/", base).href === "http://{{host}}/"`
  (our URL parser keeps `{{host}}` verbatim) and `new URL("http://www.example.com/",
  other).href === "http://www.example.com/"`.

Wired into `_normComputed` for the `_GRADIENT_PROPS` (`background-image`, `mask-image`,
`list-style-image`, `border-image-source`), composed **after** `_canonGradients` so
`url()`s nested inside `image()`/`cross-fade()` are absolutized too:

```js
if (_GRADIENT_PROPS.has(kebab)) return _canonUrls(_canonGradients(v, el, true), el);
```

Specified-value time is deliberately untouched — a relative `url()` stays as written
(only quoted) there, matching `border-image-source-valid` which accepts both forms.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-values/urls/resolve-relative-to-base.sub.html` | 0/2 | **2/2** |

**+2. ZERO regressions** — swept the whole `<image>`/gradient/`<position>`/`<color>`
family and the hot serialization path:

- mask-image-computed 47/47 (its `url("http://{{host}}/")` subtests round-trip
  byte-identical — the key idempotency proof), background-image-computed 47/48 (the 1
  fail is the pre-existing `light-dark(none, none)` CSS Color 5 cap, unrelated),
  image-function-valid 13/13, image-function-computed 3/3, gradient-position 18/43,
  gradient-interpolation-method-valid 1398, border-image-source-valid 2/2.
- background-position-computed 32/32, color-valid 17/17, color-computed 16/16,
  serialize-values 695/697, Document-createElement 147/147; `cargo test -p obscura-dom`
  40/40.
- `list-style-image-computed` / `Element-matches` came back wpt.live **HTTP 404**
  (`bodyLen=42`, curl-confirmed) this session — serving flux, NOT regressions (this
  change touches only computed `<image>` serialization, which can't affect selector
  matching, and `mask-image-computed` proves the url path safe).

## Caps / Next leverage

1. **`resolve-relative-to-stylesheet.html`** (0/3) — relative `url()` in an **external**
   stylesheet must resolve against the *stylesheet's* URL, but the `<link>` stylesheet
   isn't applied (computed `none`). Needs external-CSS loading into the cascade with a
   per-stylesheet base URL. Bigger gap; the broader prize beyond this quest.
2. **Broaden `_canonUrls` to non-image `<url>` properties** — `cursor`, `content`,
   `offset-path`, `clip-path`/`shape-outside`(`url()` ref), `@font-face src`. Each needs
   registering in the computed-serialization path (`_GCS_DEFAULTS`) first; the
   `_canonUrls` primitive then applies for free.
3. **`image-function-invalid`** (0/6) / **per-property value validation** — the standing
   comprehensive valid-property registry cap (serialize-values hot-path risk).
4. **`cross-fade()` computed** — code is in place (#69), was 404 this session; lands free
   once served.
5. Fresh realm (`fetch/`, `html/dom/` reflection).
