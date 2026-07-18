# Quest #74 — The Pointed Verdict

> *The cursor is how a hand finds the web. A gradient cursor would not paint true,
> and an image-set cursor wore the wrong dress. Now the pointer serializes the way
> the spec intends — and we name, honestly, two tests the spec itself got wrong.*

**Realm:** `css/css-ui/parsing/cursor-computed` + `css/css-ui/parsing/cursor-valid`
(the `cursor` property — `[ <image> [ <x> <y> ]? ]#? <keyword>`, where `<image>`
covers gradients and `image-set()`)
**Hold:** cursor-computed **37/39**, cursor-valid **45/46** (+4)
**Status:** ✅ SECURED — pure JS (`crates/obscura-js/js/bootstrap.js`), no new Rust.

---

## The gap

`cursor` was registered for computed defaults (`cursor: 'auto'` in `_GCS_DEFAULTS`,
so the 36 keyword forms already serialized) but was **not** in `_GRADIENT_PROPS`, so
its `<image>` items were never canonicalized:

- **cursor-computed 36/39** — the 3 fails were the gradient items
  (`linear-gradient(200grad, …), auto` / `radial-gradient(farthest-side at calc(5px
  + 10%), …), pointer` / `conic-gradient(from 3.1416rad at 20% 20%, …), crosshair`),
  returned verbatim instead of computed.
- **cursor-valid 42/46** — the 4 fails were `image-set("url" 1x)` (the bare string
  must serialize wrapped as `image-set(url("url") 1x)`, including one nested inside
  `light-dark()`), plus one `calc(2 + 0)` hotspot number that should simplify to
  `calc(2)`.

## The fix

**1. Register `cursor` in `_GRADIENT_PROPS`.** This routes its value through the
existing `<image>`-function engine (`_canonGradients` + `_canonUrls`) at both
specified and computed time. The gradient functions canonicalize in place; the
trailing hotspot coordinates and the final cursor keyword (`, auto`) pass through
verbatim (the balanced-paren scan leaves non-`<image>` text untouched). This alone
fixed the one *correct* gradient computed subtest:

```
radial-gradient(farthest-side at calc(5px + 10%), red, blue), pointer
    → radial-gradient(farthest-side at calc(10% + 5px) 50%, rgb(255, 0, 0), rgb(0, 0, 255)), pointer
```

**2. `_canonImageSet(value)`** — a new balanced-paren scan for `image-set(` /
`-webkit-image-set(` heads. CSS Images 4 makes a bare `<string>` option shorthand
for `url(<string>)`, and CSSOM serializes it wrapped. For each top-level option
(`_splitCommaQuoted`, so a `,` inside a string is safe), if it *leads* with a string
literal, wrap it:

```js
const inner = _splitCommaQuoted(innerRaw).map((opt) => {
  const lead = /^(\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(.*)$/s.exec(opt);
  if (!lead) return opt;                        // no leading <string> → option verbatim
  return lead[1] + 'url(' + lead[2] + ')' + lead[3];
}).join(',');
```

```
image-set("https://example.com/" 1x) 5 6, grab
    → image-set(url("https://example.com/") 1x) 5 6, grab
image-set("…" 1x, "…/highres" 2x) 5 6, grab
    → image-set(url("…") 1x, url("…/highres") 2x) 5 6, grab
light-dark(image-set("…" 1x), url("…")) 5 6, grab
    → light-dark(image-set(url("…") 1x), url("…")) 5 6, grab    (flat scan reaches the nested call)
```

Strings are already double-quote-normalized by `_canonStandardValue` before this
runs, so the wrap is byte-faithful. `_canonImageSet` is wired into all
`_GRADIENT_PROPS` paths (specified `_parseStyleDecls`/`setProperty`, computed
`_normComputed`) right after `_canonGradients`, fast-pathing out when there is no
`image-set(` token — so every other `<image>` property is byte-identical.

## The two unwinnable cursor-computed caps (honest accounting)

The remaining 2 cursor-computed fails are **bugs in the upstream WPT test**, not in
Obscura. The expected strings on lines 52 and 54 are malformed — the gradient's
closing `)` is missing and the trailing cursor keyword got pulled *inside* the
function:

```
line 52 expected: "linear-gradient(rgb(255, 0, 0) 10%, rgb(0, 0, 255) calc(75% - 2px), auto"
                   └ unbalanced: linear-gradient( never closes, "auto" reads as a 3rd stop
line 54 expected: "conic-gradient(from 180deg at 20% 20%, rgb(255, 0, 0), rgb(0, 0, 255), pointer"
                   └ unbalanced, AND says "pointer" when the input ends "crosshair"
```

No correct browser passes these. Our output for both is the *correct* serialization
(`…calc(75% - 2px)), auto` and `…rgb(0, 0, 255)), crosshair`, both balanced). Line 53
(radial) is the one well-formed gradient test, and we pass it. Verified by fetching
the raw test source and counting parens.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-ui/parsing/cursor-computed.html` | 36/39 | **37/39** (the 2 remaining are upstream test bugs) |
| `css/css-ui/parsing/cursor-valid.html` | 42/46 | **45/46** (the 1 remaining is `calc(2 + 0)`→`calc(2)`) |

**+4.**

## Zero-regression sweep

The change is surgically scoped: `cursor` ∈ `_GRADIENT_PROPS` affects *only* the
cursor property, and `_canonImageSet` activates *only* on an `image-set(` token,
which appears in no swept test except cursor (verified the gradient test sources +
serialize-values have zero `image-set` references). Held byte-identical:
gradient-position-valid 18/18, -computed 43/43, image-function-valid 13/13,
gradient-interpolation-method-valid 1398/1398, color-valid 17/17,
background-position-computed 32/32, content-valid 46/46; `cargo test -p obscura-dom
--lib` 40/40. (serialize-values, background-image-valid, mask-image-computed were
wpt.live HTTP 404 this session — `bodyLen=42` serving flux, NOT regressions; both
proven unaffected by source inspection — zero cursor / image-set references — and by
the gradient siblings that *did* run.)

## Caps / next leverage

1. **`calc(2 + 0)` → `calc(2)` integer-calc simplification** — the last cursor-valid
   fail (a `<number>` hotspot). The accepted forms are `calc(2)` *or* `2`. This is a
   distinct primitive: specified-time `calc()` simplification of a pure-number
   expression. It carries the serialize-values hot-path risk (there is already a
   pre-existing `calc()` additive-ordering cap there at 696/697), so it deserves its
   own scoped quest rather than a bolt-on — a calc evaluator that simplifies a
   number/percentage-only `calc()` while leaving mixed `%`+length calc untouched.
2. **`light-dark()` resolution** — cursor-valid already passes the `light-dark()`
   cases verbatim, but a computed `light-dark(a, b)` should resolve to one branch by
   the used color-scheme; a broader CSS Color 5 primitive.
3. **`resolve-relative-to-stylesheet`** (0/3) — relative `url()` in an *external*
   stylesheet resolves against the stylesheet's URL; needs external-CSS loading into
   the cascade with a per-stylesheet base URL. The broad `<url>`-computed prize.
4. **Comprehensive valid-property registry** — csstext unknown-prop drop + general
   per-property value validation; the standing serialize-values hot-path risk (MUST
   be a superset of the ~95 props serialize-values sets).
5. **Fresh realm** (`fetch/`, `html/dom/` reflection).

**Foundational note:** `_canonImageSet` is a reusable `<image>` primitive — the
string→`url()` wrap applies identically to `background-image: image-set(…)`,
`mask-image`, `content`, etc., and lands for free wherever `image-set()` appears now
that it's in the shared `_GRADIENT_PROPS` pipeline.

— knight Claude, 2026-06-22
