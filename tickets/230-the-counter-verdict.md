# Quest #230 — The Counter Verdict

**Region:** `css/css-lists/parsing/` (the `counter-reset` / `counter-increment` / `counter-set` family)
**Result:** +70 subtests, ZERO regressions. All 9 counter files → 100%.
**Session:** 2026-07-21.

## The gap

Took #229's next-leverage (the sibling `counter-*` family in the SAME dir). Baselined
the whole family — every property was raw-store (stored verbatim, no grammar check):

| File | Before | After |
|------|:------:|:-----:|
| `counter-reset-valid` | 11/16 | **16/16** |
| `counter-reset-invalid` | 0/15 | **15/15** |
| `counter-reset-computed` | 5/10 | **10/10** |
| `counter-increment-valid` | 8/10 | **10/10** |
| `counter-increment-invalid` | 0/13 | **13/13** |
| `counter-increment-computed` | 5/10 | **10/10** |
| `counter-set-valid` | 8/10 | **10/10** |
| `counter-set-invalid` | 0/13 | **13/13** |
| `counter-set-computed` | 0/10 | **10/10** |

Three tells: every `*-invalid` at **0/N** (any value accepted — the raw-store
signature); the `*-computed` files never folded a `calc()`/`sign()` integer; and
`counter-set` was **entirely unregistered** (not in `_GCS_DEFAULTS` → not a known
property → `getComputedStyle` returned empty, so `counter-set-computed` sat at 0/10).

## The grammar

- `counter-reset = [ <counter-name> <integer>? | <reversed-counter-name> <integer>? ]+ | none`
- `counter-increment = [ <counter-name> <integer>? ]+ | none`
- `counter-set = [ <counter-name> <integer>? ]+ | none`

`reversed()` is **counter-reset only**. `<counter-name>` is a `<custom-ident>`
excluding the CSS-wide keywords, `default`, and `none`. On serialization every plain
`<counter-name>` gets an explicit `<integer>` — the omitted default is **`1`** for
`counter-increment`, **`0`** for the other two — but a `reversed()` name with no
integer keeps none (its start value is computed from the sibling count).

## The fix (all in `bootstrap.js`)

**Specified** — new `_COUNTER_VALIDATED` set + `_canonCounter(name, value)`:
- Tokenizes via `_gridLineTokens` (escape/paren aware, so `a\ 8` stays a single ident
  and `reversed(x)` / `calc(…)` stay single tokens; a `[`/`]` → null → invalid).
- Walks `(name, optional integer)` pairs. A name is `reversed(<counter-name>)`
  (rejected outside counter-reset) or a bare `<counter-name>` — validated by
  `_isCounterName` = `_GRID_CI_RE.test(t)` AND the UNESCAPED lowercased ident not in
  `_COUNTER_NAME_RESERVED` (= `_CSS_WIDE` ∪ `default` ∪ `none`).
- The optional integer is a literal signed int (`parseInt`, re-serialized) or a math
  fn canonicalized by `_canonMathExpr` (kept symbolic — folds at computed time). A
  non-integer literal like `3.14` matches neither → the whole value is invalid.
- Fills the omitted default on every plain name; a `reversed()` name with no integer
  keeps none.
- Dispatched in the inline `_parseStyleDecls` parser + API `setProperty` (CSS-wide /
  `var()`/`env()` gated through untouched, like the `list-style` longhands) + `CSS.supports`.

**Computed** — `_computeCounter` (a `_normComputed` branch) folds each integer via
`_computeCounterInt`: a literal → `parseInt`; a math fn → `_evalMath` with `cqZero:true`
(so a `sign(2cqw - 10px)` gate resolves to its sign with no container present),
`Math.round`ed. Registered `counter-set: none` in `_GCS_DEFAULTS` (auto-registers in
`_CSS_KNOWN_PROPS`).

## Wins (examples)

- `chapter` → `chapter 0` (reset/set) / `chapter 1` (increment)
- `chapter chapter 9` → `chapter 0 chapter 9`
- `reversed(chapter) 9 chapter` → `reversed(chapter) 9 chapter 0`
- `first -1 second third 99` → `first -1 second 0 third 99`
- computed `myCounter calc(10 + (sign(2cqw - 10px) * 5))` → `myCounter 5`
- rejected: `none chapter`, `reversed(none)`, `reversed(3)`, bare `3`, `99 imagenum`,
  `section -1, imagenum 99` (comma), `section 3.14`, `inherit 0` / `default 0`, and
  `reversed(chapter)` for `counter-increment`/`counter-set`.

## Zero-regression sweep

qsa 1975, classlist 1420, createElement 147, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, getComputedStyle-property-order 1/1 (the added `counter-set`
didn't disturb enumeration), the whole `list-style` family (valid 17, type-valid 27,
shorthand 4, computed 5) 100%, flex-computed 14/14, column-rule-shorthand 12/12,
text-decoration-valid 17/17, grid-area-computed 35/35 held — grid-area exercises the
SAME `_evalMath` math path this quest only *calls* (never modified). The change is fully
gated on the three `counter-*` names.

## Caps / Next

**CAP:** the `counter-*` family is clean (all 9 files 100%); `css/css-lists/parsing/`
is now fully secured (list-style + counters).

**NEXT LEVERAGE:** a NEW `css/*/parsing/` dir. The tell in a mature dir is a `-invalid`
at 0/N (raw-store) or a `-valid`/`-computed` canonicalization gap. Not-yet-audited
candidates from the campaign map: `css/css-ui/parsing/` (`cursor-computed` wants the
`<image>`/gradient cursor grammar; `resize-computed` = a pseudo-element computed bug,
deeper than value parsing), the `css/css-align/` place-* box-alignment shorthands, and
`filter-effects/`. grep `_canonCounter` / `_expandListStyle`.
