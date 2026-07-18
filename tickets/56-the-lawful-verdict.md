# ✅ Quest #56 — The Lawful Verdict

> Realm: `css/css-variables/test_variable_legal_values.html`
> Hold: **0/23 → 23/23 (100%)**. **+23.**
> Banner drawn 2026-06-20. Builds straight on #55's custom-property engine.

## The gap

`test_variable_legal_values.html` (dbaron's "CSS Variables Allowed Syntax")
exercises the two halves of the custom-property grammar that #55 left dark. Each
subtest stamps a rule into a live `<style>`:

```css
#test {
  --test: red;          /* or green for the "disallowed" half */
  --test: <value>;
  background-color: red;
  background-color: var(--test);
}
```

and asserts the computed `background-color`. Two distinct behaviours are under
test:

1. **Allowed values** (`25%`, `37`, `12em`, `foo()`, `( )`, `{ }`, `[ ]`,
   `@media {}`, `(;)`, `(<!--)`, `<!--`, …). These are valid `<declaration-value>`s,
   so the second `--test` declaration wins. Then `background-color: var(--test)`
   substitutes a value that is **not a valid `<color>`** → the property is
   **invalid at computed-value time** → it falls back to `background-color`'s
   initial value (`transparent`). The test asserts `initial_cs ==
   backgroundColor`.
2. **Disallowed balanced values** (`]`, `)`, `(])`, `[)]`, `(})`). These contain
   an **unmatched close bracket/paren/brace**, so the second `--test` declaration
   is *invalid and dropped* — `--test` keeps its prior value `green`, and
   `var(--test)` reads back green. The test asserts `green_cs == backgroundColor`.

Before this quest both halves failed: `_computeColor` *echoed* an unrecognized
value rather than signalling invalidity (so `background-color: 25%` computed to
`"25%"`, not `transparent`), and the declaration parsers stored any custom-property
value verbatim with no `<declaration-value>` validity check (so `--test: ]`
overrode `green`).

## The work (pure JS, `bootstrap.js`, NO new Rust)

1. **`_isBalancedDeclValue(value)`** — a new helper deciding whether a value is a
   valid `<declaration-value>`: any token sequence is allowed *except* one with an
   **unmatched** `)`, `]`, or `}`. Unmatched *openers* are fine (`--x: (` is
   valid). A stack tracks `(`/`[`/`{`; a closer must match the most recent opener
   exactly, so `(])` is rejected (the `]` doesn't match the open `(`). Brackets
   inside strings (`"…"`/`'…'`, escape-aware) and `/* … */` comments don't count.

2. **Wired the validity check into every declaration parser** — `_cssParseDecls`
   (the cascade/`<style>` path — the one this test uses), `_parseStyleDecls` (the
   inline `style=""`/`cssText` path), and `CSSStyleDeclaration.setProperty`. An
   invalid custom-property value is **dropped**, so an earlier valid declaration
   of the same name is preserved (the disallowed half).

3. **`_cssSplitRules` block scanner is now nesting-aware** — it previously matched
   the rule's `{ … }` by counting `{`/`}` only, so a stray `}` inside a value
   (`--test: (})`) closed the rule early and corrupted everything after it. The
   scanner now tracks a `()`/`[]`/`{}` stack and only treats a `}` as the rule
   close when it matches the outermost `{`. (A matching close-paren/bracket pops;
   a non-matching closer is ignored, mirroring CSS error recovery.)

4. **Invalid-at-computed-time for `<color>`** — in `_computedPropOf`, after a
   `var()`-bearing value is substituted, if the property is a colour property and
   the substituted value is neither a CSS-wide keyword nor `currentColor` nor a
   real colour (`!_isValidColor`), the property is invalid at computed-value time
   → inherited-or-initial (factored into a local `invalidAtComputedTime()` shared
   with the existing substitution-failure branch). Scoped to the `var()` branch
   and to colour properties, so no non-var or non-colour path changes.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `css/css-variables/test_variable_legal_values.html` | 0/23 | **23/23** | +23 |

**+23. Zero regressions.** Swept: qsa 1975, classlist 1420, matches 669, closest
29, createElement 147; the whole css-variables family (variable-definition 71/73,
-cascading 9/9, -keywords 8/8, -cssText 8/11, -substitution-basic 11/13,
-created-element 3/3, -created-document 2/2 — all held); color-computed 16, named
455, rgb 95 (cap unchanged), opacity-computed 30; css-color/inheritance 4,
inherit-initial 4, css-text/ui/fonts/scroll-snap/transitions inheritance
42/28/39/38/8; has/not-specificity 8/8, readwrite-readonly 25, disabled 7,
valid-invalid 30; obscura-dom unit 40/40.

## Caps (honest)

- **Substitution into filter / background grammars** —
  `variable-substitution-filters` 0/7 and `-background-properties` 1/10 substitute
  `var()` *inside* a function (`filter: blur(var(--blur))` → expected `blur(15px)`).
  Our `_substituteVars` space-pads each insertion to keep tokens apart, yielding
  `blur( 15px )` ≠ `blur(15px)`. This is the standing **token-boundary cap** — a
  correct fix needs a real CSS tokenizer that only inserts a separator between
  tokens that would otherwise merge (and `filter`/`background-*` would need
  registering in the computed-value engine). Reworking the whitespace algorithm
  risks `variable-substitution-basic` (11/13), so deferred to its own quest.
- **Shorthand → longhand expansion** — `variable-substitution-shorthands` 13/51
  still needs `margin: var(--p)` to expand to four longhands. No shorthand model.
- **Non-colour invalid-at-computed-time** — we validate only `<color>` substituted
  values; a substituted invalid `<length>`/`<number>` into a non-colour property
  isn't yet rejected (would need per-property grammar validation).

## Next leverage

1. **Token-boundary-aware `var()` substitution** — insert a separator only between
   tokens that would merge (real tokenizer), then register `filter` +
   `background-*` in the computed-value engine → opens `variable-substitution-filters`
   (7) and much of `-background-properties` (9). The widest css-variables tail left.
2. **Shorthand → longhand expansion** in the cascade/serialization (opens
   `variable-substitution-shorthands` 51 + the cssText shorthand cases).
3. A **specified-value serialization engine** (`serialize-values` 0/697) or a
   fresh realm (`fetch/`, `html/dom/` reflection).
