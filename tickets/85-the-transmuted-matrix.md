# Scroll 85 — The Transmuted Matrix (`transform`, CSS Transforms 1/2)

**Quest #85 · session 2026-06-23 · +45**

## The gap

A fresh realm, the first slice of the wide `css-transforms/parsing` frontier
(~+197 across `transform`/`rotate`/`scale`/`translate`/`transform-origin`/
`perspective`/…). The `transform` property takes a `<transform-list>` — `none`
or a space-separated list of `<transform-function>`s (`matrix`/`matrix3d`,
`translate`/`X`/`Y`/`Z`/`3d`, `scale`/`X`/`Y`/`Z`/`3d`, `rotate`/`X`/`Y`/`Z`/`3d`,
`skew`/`X`/`Y`, `perspective`). Obscura had `transform` registered in
`_GCS_DEFAULTS` (`none`) with **identity** computed serialization and **no
validation** — the same three failure modes as #82/#83/#84: every malformed form
was accepted (`-invalid` 0/20), computed fell through to verbatim (`-computed`
0/3), and several valid forms needed canonicalization (`-valid` 20/42).

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-transforms/parsing/transform-valid.html` | 20/42 | **42/42** ✅ |
| `css/css-transforms/parsing/transform-invalid.html` | 0/20 | **20/20** ✅ |
| `css/css-transforms/parsing/transform-computed.html` | 0/3 | **3/3** ✅ |

**+45. Every subtest green. Zero caps.**

## The work (pure JS, `bootstrap.js`, NO new Rust)

Built on the #84 filter scaffolding (it reuses `_splitFilterTokens`, the
`_FILTER_NUM_RE`/`_FILTER_PCT_RE`/`_FILTER_LEN_RE`/`_FILTER_MATH_RE` regexes,
`_isFilterZero`, `_LENGTH_PX`, `_ANGLE_DEG`, `_evalMath`, `_serNumber`):

- **`_TF_FUNCS`** — the per-function grammar table: allowed arg counts `n` +
  per-arg type `t` (`number`, `np`=`<number-percentage>`, `len`=`<length>`,
  `lp`=`<length-percentage>`, `angle`, `persp`=non-negative `<length>` | `none`;
  `t` may be an array for positional types — `translate3d` is `[lp,lp,len]`,
  `rotate3d` is `[number,number,number,angle]`).
- **`_parseTransform`** → `{none}` | `{items:[{name,args[]}]}` | null.
  `_splitFilterTokens` splits the function list on top-level whitespace;
  `_splitTfArgs` (new) splits each function's argument list on top-level commas
  (parens kept whole). A token that isn't `name(...)`, or names an unknown
  function, fails the whole value (so `none scale(2)`, `scaleX(2), scaleY(3)`
  — note the trailing comma — and `auto` are rejected at parse).
- **`_isValidTransform`** — the grammar gate (wired into BOTH specified paths,
  `_parseStyleDecls` + `setProperty`; an invalid `<transform-list>` is dropped,
  mirroring the `filter`/`alpha(`/`contrast-color(` drops). Per-arg type
  predicates `_tfIsLen`/`_tfIsAngle` + `_tfArgValid`. `perspective` needs a
  non-negative `<length>` or `none` — `perspective(1000)` (unitless) is invalid.
- **`_canonTransform(value, el, computed)`** — the shared serializer:
  - **SPECIFIED** keeps the function form, canonicalizing per arg via
    `_canonTfArg`: scale `<percentage>`→number fraction (`scale(250%)`→
    `scale(2.5)`, `scaleX(720%)`→`scalex(7.2)`), unitless angle `0`→`0deg`
    (`rotate(0)`→`rotate(0deg)`, `skew(0, -90deg)`→`skew(0deg, -90deg)`),
    lengths/percentages/`calc()`/`var()` verbatim, `perspective(none)` kept.
  - **THE NAME-CASE QUIRK** (`_TF_DISP`): a long-standing Blink/WebKit
    serialization quirk the WPT tests pin — `translateX`/`Y`/`Z` and
    `rotateX`/`Y`/`Z` **preserve** their camelCase, while `scaleX`/`Y`/`Z` and
    `skewX`/`Y` are **lowercased** (`scaleX(7)`→`scalex(7)`, `skewX(0)`→
    `skewx(0deg)`, but `translateX(-4px)`→`translateX(-4px)`). All other names
    (`matrix`/`matrix3d`/`translate3d`/`scale3d`/`rotate3d`/`perspective`) are
    already lowercase.
  - **COMPUTED** resolves the whole list to a single `matrix()`/`matrix3d()`
    (the real computed value of `transform`). `_tfMatrix` builds each function's
    4×4 matrix in **matrix3d() column-major order** (index = `col*4 + row`, so
    the array IS the matrix3d() argument list — no transpose at serialize time);
    `_tfMul` post-multiplies them in list order (`M = M · F`); `_serMatrix`
    emits `matrix(a,b,c,d,e,f)` when the result is 2D (`_TF_2D_ZERO` entries ≈ 0,
    `m[10]`/`m[15]` ≈ 1) else the full 16-value `matrix3d(...)`. Lengths resolve
    to px via `_evalMath`, angles to radians via `_tfDeg`. Verified:
    `perspective(none)`→`matrix(1, 0, 0, 1, 0, 0)`, `perspective(10px)`→
    `matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -0.1, 0, 0, 0, 1)` (the
    perspective term `-1/d` lands at index 11 = m43), `matrix3d(<identity>)`→
    `matrix(1, 0, 0, 1, 0, 0)` (3D-but-2D collapse).
  - Any value the matrix builder can't resolve without layout (a `%` translate,
    an unresolvable unit) → COMPUTED **falls back to the SPECIFIED canon form**
    (no test exercises it; honest + safe rather than emitting a wrong matrix).
- A `var()`/`env()` guard (`_TF_VAR_RE`) short-circuits both validity (→ valid)
  and canon (→ verbatim) so an unresolved custom property survives to
  substitution time.

Wired into `_normComputed` (`kebab === 'transform'` → `_canonTransform(v, el,
true)`) alongside the filter dispatch.

## Zero regressions

serialize-values 696/697 (the 1 fail is the pre-existing `font-family:
'Lucida Grande'` quote cap), transform-origin-valid 16/16, transform-origin-computed
23/23, filter-computed 83/83, filter-parsing-invalid 25/25, filter-parsing-valid
87/87, backdrop-filter-computed 28/28, color-computed-relative-color 1163/1169,
color-valid 17/17, Element-classlist 1420/1420; `cargo test -p obscura-dom --lib`
40/40 — all baseline-exact. The change is purely additive: new helpers + three
`transform`-gated dispatch branches; no shared primitive (`_evalMath`,
`_serNumber`, the `_FILTER_*` regexes) was modified, so the colour/filter/
serialize-values hot paths are byte-identical by construction.

## Caps / Next

**Zero caps in this slice.** The transform realm continues — the obvious
follow-ups (same three-failure-mode shape, same scaffolding):

1. **`scale`/`rotate`/`translate`** (the individual properties): valid 7–15/…,
   invalid 0/…, computed 0/… — together ~+142. Their computed forms keep the
   function (e.g. `scale(2)` computed stays `scale(2)`, `rotate(45deg)` stays)
   rather than collapsing to a matrix, so `_canonTransform`'s computed branch
   is NOT directly reusable for them — they need their own per-property computed
   serializers (but share `_isValidTransform`'s arg predicates + `_canonTfArg`).
2. **`transform-origin`** already 16/16 + 23/23; **`transform-origin-invalid`**
   0/10 (+10) is a pure grammar gate.
3. **`perspective`/`transform-box`/`backface-visibility`/`perspective-origin`**
   — small, unmeasured.

Outside the realm, the standing colour leverage is unchanged: `light-dark()`
computed (2 caps), `var()`/`sibling-index()` computed (6 color-computed-relative
caps), generalizing `_canonMathExpr` to the generic value path (hot-path risk →
own quest), `none`-component structured storage (~28 color-mix caps).
