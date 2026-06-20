# Quest #50 — The Calculated Verdict

**Realm:** `css/css-color/parsing/opacity-computed.html` (computed-value `opacity` +
the `calc()`/`min()`/`max()`/`clamp()` math-function evaluator) · **Status:** SECURED,
+27 · **Session:** 2026-06-19

## The gap

#49 opened the whole `*-computed.html` family (the `has` trap + `CSS.supports`
primitives), then built a computed-value engine for **colour**. The named follow-up
("opacity + simple numeric computed values") was still dark: `opacity-computed.html`
sat at **3/30**.

The shared `computed-testcommon.js` harness sets `target.style.opacity = specified` and
reads `getComputedStyle(target).opacity` back. Our `getComputedStyle` `norm` step only
normalized `<color>` properties — every other property was echoed verbatim. So computed
`opacity` returned the *specified* string unchanged:

```
opacity '-2'              → "-2"   (expected "0")
opacity '50%'             → "50%"  (expected "0.5")
opacity '3'              → "3"    (expected "1")
opacity 'calc(1 + 1)'     → "calc(1 + 1)" (expected "1")
opacity 'clamp(50%, 0%, 70%)' → unchanged   (expected "0.5")
```

The 3 passing subtests were the plain in-range numbers (`1`/`0.5`/`0`) that happen to
echo correctly. Everything else needs three things: clamp a `<number>` to `[0, 1]`,
resolve a `<percentage>` to a fraction (`50%` → `0.5`), and **evaluate the CSS math
functions** `calc()`/`min()`/`max()`/`clamp()`.

That math evaluator is exactly the primitive named as the cap for `color-computed-rgb`'s
remaining 40 calc cases (#49) — a reusable foundation, not a one-off.

## The work (pure JS, `bootstrap.js`, no new Rust)

1. **`_evalMath(input, percentBase)`** — a small hand-tokenized recursive-descent
   evaluator that collapses a CSS math expression to a plain JS number:
   - Tokenizer: numbers (int / float / scientific, optional trailing `%`), the operators
     `+ - * /`, parentheses, commas, and bare identifiers (function names). CSS comments
     stripped first. Any unknown character → `null` (not a math expression).
   - Grammar: `expr := term (('+'|'-') term)*`, `term := factor (('*'|'/') factor)*`,
     `factor := ['+'|'-'] ( number | percentage | '(' expr ')' | func )`. Unary sign
     handled in `factor`; `* /` bind tighter than `+ -`.
   - Functions: `calc(expr)` (exactly one arg), `min(...)`, `max(...)`,
     `clamp(min, val, max)` = `max(min, min(val, max))` (three args). Nesting falls out
     of the recursion.
   - A `<percentage>` resolves to `(p/100) * percentBase`; `percentBase` is what `100%`
     means in the property's context (`1` for the unitless `opacity`). Intentionally
     **unit-agnostic** — every term becomes a number — so it is enough for opacity and
     number channels, *not* a general length/unit calculator. Returns `null` on a parse
     failure or a non-finite result (so the caller falls back to echoing the value).
2. **`_serNumber(x)`** — computed `<number>` serialization: round away float noise
   (`Math.round(x * 1e6) / 1e6`), normalize `-0` → `0`, `String()` (drops trailing
   zeros). `0.6` → `"0.6"`, `1` → `"1"`, `0.5` → `"0.5"`.
3. **`_computeOpacity(value)`** — `_evalMath(value, 1)` → clamp to `[0, 1]` →
   `_serNumber`; `null` (non-numeric) passes through so a bad value is echoed.
4. Wired into the `getComputedStyle` `norm` step: `if (kebab === 'opacity') …` ahead of
   the colour branch. The default `'1'` from `_GCS_DEFAULTS` is already the serialized
   form, so the no-author-value case is unaffected.

`CSS.supports('opacity', …)` already returned `true` (opacity is a known, non-colour
property in `_CSS_KNOWN_PROPS`), so the harness's second gate was satisfied; the only
missing piece was the computed-value normalization.

## Result

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-color/parsing/opacity-computed.html` | 3/30 | **30/30** (+27) |

**+27, ZERO regressions.** Swept: qsa 1975, classlist 1420, matches 669, closest 29,
valid-invalid 30, readwrite-readonly 25, disabled 7, has-specificity 8, not-specificity
8, is-nested 2, createElement 147, color-computed 16, color-computed-hex-color 6,
color-computed-named-color 455, color-computed-rgb 59 (the calc cap unchanged — those
calcs live *inside* `rgb()` channels, a different code path), structured-clone 141/152,
getRandomValues 39, mark 22, url-setters-stripping 260; obscura-dom unit 40/40.

## Caps (honest)

- **`opacity-valid` 5/30 + `opacity-invalid` 0/3** — these siblings use a *different*
  helper (`test_valid_value`/`test_invalid_value` from `parsing-testcommon.js`) that
  reads the **specified-value serialization** off `el.style.opacity` (the CSSOM `style`
  getter), not the computed value. They need a canonical `calc()`-simplification
  serializer (`calc(25% * 2)` → `calc(50%)`, `min(50%, 0%)` → `calc(0%)`, `-100%` →
  `-1`) **and** per-property grammar validation on the `CSSStyleDeclaration` setter
  (`opacity: auto` / `10px` / `0 1` must be rejected so the property stays empty). That
  is a specified-value engine touching the hot `style` get/set path — a separate, larger
  quest with real regression risk; deliberately deferred.
- The math evaluator does **not** yet resolve `var()` (custom-property substitution) or
  CSS-escaped identifiers — the other half of the `color-computed-rgb` cap.

## Next leverage

- **Reuse `_evalMath` inside `rgb()`/`hsl()` channels** to convert `color-computed-rgb`'s
  40 calc fails (`rgb(calc(…) …)`) — channel context means `percentBase = 255` for the
  colour components and `1` for alpha. Mid-size, builds directly on this primitive.
- **CSS inheritance + initial values for non-colour properties** (`css-cascade/inherit-initial.html`
  0/4, `css-color/inheritance.html` 1/4) — an initial-values table + `inherit`/`initial`/`unset`
  resolution + a generalised inheritance walk (the widest `css/css-cascade` tail; the
  `color` inheritance from #49 is the template).
- A **specified-value serialization engine** (would unlock the `*-valid`/`*-invalid`
  parsing family broadly) — bigger, hot-path, its own siege.
- A **fresh realm** (`fetch/`, `html/dom/` reflection / idlharness).
