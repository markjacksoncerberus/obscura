# 🏰 Scroll #325–#327 — The Anchor-Size Verdict

> **Realm:** `css/css-anchor-position/` — the `anchor-size()` value function on the
> inset, margin, and sizing properties.
> **Hold:** `anchor-size-parse-valid` 72→**4289**, `anchor-size-parse-invalid`
> **22/22** (held). **+4217, ZERO regressions.** ONE commit.

## The gap

#324's explicit next-leverage: the `anchor-size()` function sat at **72/4305** — the
single biggest pure-JS vein left in the campaign, and the SAME architecture as the
`anchor()` function shipped in #324. `anchor-size()` was rejected everywhere (the
sizing branch stored raw and `_isValidSizeValue` said no; the inset/margin
`_canonMarginInsetComp` only knew literals + `anchor()` on insets), so the 72
baseline passes were the calc-nested + `var()` cases that happened to survive.

Grammar (CSS Anchor Positioning 1 §anchor-size):

```
anchor-size() = anchor-size( [ <anchor-name> || <anchor-size> ]? , <length-percentage>? )
<anchor-size> = width | height | block | inline | self-block | self-inline
```

Three things differ from `anchor()`:

1. **Both the name and the size are OPTIONAL** (anchor()'s `<anchor-side>` was
   required). So `anchor-size()`, `anchor-size(--foo)`, `anchor-size(width)` are all
   valid. And the grammar's comma **elides** along with an omitted adjacent optional
   (CSS Values 4 comma-elision): `anchor-size(10px)` is a valid **fallback-only** form
   (name+size omitted → the preceding comma drops), while `anchor-size(, 10px)` and
   `anchor-size(--foo,)` are INVALID (a comma with everything on one side omitted).
2. **Accepted on the SIZING and MARGIN properties too**, not just insets — it's
   usable in *every* `@position-try` property. (`anchor()` is inset-only.)
3. **Its fallback may be a nested `anchor-size()` but NEVER a nested `anchor()`** —
   the fallback grammar is `<length-percentage>`, and `anchor()` isn't one in a
   sizing context (`anchor-size(--foo width, anchor(--bar top))` is invalid).

## The work

### `_canonAnchorSizeFn` — the engine (built beside `_canonAnchorFn`)

```
const _ANCHOR_SIZE_KW = new Set(['width','height','block','inline','self-block','self-inline']);
const _canonAnchorSizeFn = (token) => { … }
```

- `_commaSplitTop` the argument list (≤2 args).
- A `parseHead(src)` helper parses a non-empty `[ <anchor-name> || <anchor-size> ]`
  into `{name, size}` (at most one dashed-ident name, at most one keyword size) or
  null. A `parseFb(raw)` helper accepts a nested `anchor-size()` OR a
  `_canonLenPctSigned(raw, true)` length-percentage (unitless `0` → `0px`).
- **2 args:** the head must be non-empty (`anchor-size(, 10px)` → null) and the
  fallback non-empty (`anchor-size(--foo,)` → null).
- **1 arg:** try it as a head; if that fails, fall back to `parseFb` (the comma-elided
  fallback-only form `anchor-size(10px)`). `anchor-size(top)` fails both → null.
- **0 args / empty:** `anchor-size()` → valid, serializes `anchor-size()`.
- **Serialization:** name FIRST, then size, then `, <fallback>` — so
  `anchor-size(width --foo)` → `anchor-size(--foo width)`. Fallback-only prints with
  no leading comma (`anchor-size(10px)`).

### #325 — inset properties

Wired `anchor-size()` into `_canonMarginInsetComp`:

```js
const _canonMarginInsetComp = (t) => {
  const s = String(t).trim();
  if (/^anchor-size\(/i.test(s)) return _canonAnchorSizeFn(s);
  const low = s.toLowerCase();
  return low === 'auto' ? 'auto' : _canonLenPctSigned(t, true);
};
```

`_canonInsetComp` (the inset-LH canon) falls through to `_canonMarginInsetComp`, so
the inset longhands (`top`/`right`/`bottom`/`left`/`inset-block-*`/`inset-inline-*`)
and the `inset`/`inset-block`/`inset-inline` shorthands (via `_expandBoxLogical`,
which is paren-aware so `anchor-size(--foo width, 10px)` stays a single token) accept
+ canonicalize it. The `_canonLengthTimeMath` anchor-guard from #324 was already
written as `/^anchor(?:-size)?\(/` — so a top-level `anchor-size()` value is not
re-mangled by the calc serializer.

### #326 — margin properties

The SAME `_canonMarginInsetComp` branch covers the margin longhands + `margin`/
`margin-block`/`margin-inline` shorthands. The key correctness point: **margins accept
`anchor-size()` but must REJECT `anchor()`** — and they do, for free, because
`anchor()` is handled FIRST inside `_canonInsetComp` (inset-only) and never reaches
the shared margin path, while `anchor-size()` lives in `_canonMarginInsetComp` which
both families funnel through.

### #327 — sizing properties (the raw-store rewrite)

Sizing props (`width`/`min-width`/`max-width`/`height`/…/`block-size`/`inline-size`,
12 total) validate via `_isValidSizeValue` and store the value RAW — so flip-order
canonicalization wouldn't happen. Added an `anchor-size(`-guarded `_canonAnchorSizeFn`
rewrite AHEAD of the `_isValidSizeValue` check in BOTH sizing branches (setProperty
~L2114 and `_parseStyleDecls` ~L1209):

```js
if (name !== 'flex-basis' && /^anchor-size\(/i.test(stored)) {
  const c = _canonAnchorSizeFn(stored);
  if (c === null) return;   // out-of-grammar anchor-size() → ignore
  stored = c;
} else if (/* existing size grammar */) { … }
```

`flex-basis` is EXPLICITLY excluded — `content | <'width'>` is not a `@position-try`
property, so `flex-basis-valid` must keep rejecting `anchor-size()`.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `anchor-size-parse-valid.html` | 72/4305 | **4289/4305** |
| `anchor-size-parse-invalid.html` | 22/22 | **22/22** |

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697, anchor-parse-valid 2353/2359,
**anchor-parse-invalid 25/25**, inset-valid 50, inset-computed 20, top-valid 4,
margin-block-inline-valid 14, margin-block-inline-computed 9/12 (pre-existing layout
cap — `10%`→`20px` is percentage-against-containing-block), width-valid 10,
min-width-valid 10, max-width-computed 12, **flex-basis-valid 8** (still rejects
anchor-size — the exclusion holds), position-try-fallbacks-parsing 57,
calc-dimension-serialization-order 44.

## Caps / Next

- **CAP (shared with `anchor()`):** the 16 remaining `anchor-size-parse-valid` fails
  are `anchor-size()` nested INSIDE `calc()`/`min()` (e.g.
  `calc((anchor-size(--foo width) + anchor-size(--bar height)) / 2)`, or a fallback
  that is itself a `calc()` containing `anchor-size()`). The calc parser
  (`_mathValid`/`_canonMathExpr`) has no `anchor()`/`anchor-size()` leaf, so it
  rejects them. Fixing this is a bigger cross-cutting quest — teach the calc grammar
  an anchor-function leaf — that would green BOTH the 16 here and the 6 in
  `anchor-parse-valid`. Deferred.
- **The css-anchor-position PARSING realm is now essentially mined out**:
  `position-area` 2125 + 633, `anchor()` 2353, `anchor-size()` 4289 — only the shared
  calc-leaf CAP remains. The rest of the realm (`anchor-center-*`, `position-*`
  reftests) is LAYOUT-capped.
- **NEXT LEVERAGE:** scout a FRESH `css/*/parsing/` dir (re-baseline even green
  realms — a PARTIAL file, not just 0/N, is the tell; batch-scan `*-invalid`/
  `*-computed`). Reusable from this scroll: `_canonAnchorSizeFn` (an optional+optional
  head with comma-elision + name-first canon + a typed fallback), and the
  raw-store-rewrite pattern (canonicalize a value-function on props that otherwise
  store their value raw).
