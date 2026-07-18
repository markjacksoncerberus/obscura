# ⚔️ Quest #47 — The Cascade Crown

> *The recurring wall, breached.* For six quests the selector matcher grew strong,
> but every test that asked **"and which rule actually wins?"** died at
> `getComputedStyle` — which had no author-stylesheet cascade at all. This quest
> gives it one.

**Realm:** `css/selectors/*specificity*` + `html/semantics/selectors/pseudo-classes/*-type-change`
**Status:** ✅ SECURED — **+24**, zero regressions.

---

## The gap

`getComputedStyle(el)` returned a Proxy over the element's **inline** `style` plus a
small hardcoded defaults table (`display:block`, `color:rgb(0,0,0)`, …). There was
**no author-stylesheet cascade**: a `<style>` rule never affected the computed value.
So every test of the shape *"inject `<style>` rules of differing specificity, read the
winning value back via `getComputedStyle`"* failed — the exact `getComputedStyle` /
CSS-cascade wall named as the top "next leverage" by Quests #42–#46.

These caps had piled up:
- `css/selectors/has-specificity` 0/8, `is-specificity` 0/1, `is-nested` 0/2,
  `is-where-pseudo-classes` 0/1, `not-specificity` 0/8 — pure specificity/cascade.
- `…/pseudo-classes/readwrite-readonly-type-change` 0/1 (named #44/#45 cap),
  `checked-type-change` 0/1, `inrange-outofrange-type-change` 0/2 — a `<style>` rule
  paints by a live-state pseudo, read back as an applied colour.

## The fix (one Rust op + a JS cascade, no DOM-model change)

The selector engine already owns everything matching-related — including **correct
specificity** for `:is()`/`:where()`/`:has()` (Servo `Selector::specificity()`). So the
cascade is pure orchestration on top of it.

**Rust (`selector.rs` + `ops.rs`):** new `DomTree::selector_match_specificity(node,
selector)` — parse the rule's selector list, and among the *complex selectors that
match* `node`, return the **highest** specificity (packed u32), else `None`. Per-selector
(not per-list) is what the cascade needs: a rule `.a, #b` contributes `#b`'s specificity
when it matched via `#b`. Exposed as op `selector_match_specificity` (arg1 = nid, arg2 =
selector text → decimal specificity, or `"-1"`).

**JS (`bootstrap.js`, `getComputedStyle` rewrite):**
1. `_cssSplitRules(text)` — a minimal CSS tokenizer: strip comments, brace-match each
   rule into `{ selectorText, decls }`, skip `@`-rules (and their nested blocks).
   `_cssParseDecls` splits declarations, lifting `!important` and lower-casing standard
   property names (custom `--*` keep case). Parsed rules cached per `<style>` element
   (`_sheetRuleCache`, keyed by text).
2. `_buildCascade(el)` — flatten every `<style>` rule in document order; **prime** the
   JS-computed live-state side-maps once over the combined selector text
   (`_primeTarget` + `_primeValidity`, same machinery `querySelector` uses) so the Rust
   matcher can see `:target`/`:valid`/`:invalid`/`:in-range`/`:out-of-range`; then call
   the op per rule, keeping `{ spec, order, decls }` for each match. Inline `style` is
   added as the highest source.
3. `_cascadeResolve(sources, name)` — the cascade order: `!important` beats normal;
   within the same importance, higher specificity wins, ties broken by **later** source
   order. (Inline carries `spec = MAX_SAFE_INTEGER` so it beats author rules at each
   importance level.)
4. **Computed-value `<color>` serialization** (`_computeColor`): named keyword (full CSS
   list) / `#hex` (3/4/6/8) / `rgb()`/`rgba()` → `rgb(r, g, b)` (or `rgba(…, a)`),
   applied only to color properties. So `color: green` reads back as `rgb(0, 128, 0)`,
   matching how browsers serialize a computed color.

## Results (before → after)

| Test | Before | After |
|------|:------:|:-----:|
| `css/selectors/has-specificity.html` | 0/8 | **8/8** |
| `css/selectors/is-specificity.html` | 0/1 | **1/1** |
| `css/selectors/is-nested.html` | 0/2 | **2/2** |
| `css/selectors/is-where-pseudo-classes.html` | 0/1 | **1/1** |
| `css/selectors/not-specificity.html` | 0/8 | **8/8** |
| `…/pseudo-classes/readwrite-readonly-type-change.html` | 0/1 | **1/1** |
| `…/pseudo-classes/checked-type-change.html` | 0/1 | **1/1** |
| `…/pseudo-classes/inrange-outofrange-type-change.html` | 0/2 | **2/2** |

**+24, zero regressions.** Swept: qsa 1975, classlist 1420, matches 669, closest 29,
createElement 147, createElementNS 596, cloneNode 135, valid-invalid 30,
required-optional 6, readwrite-readonly 25, disabled 7, enabled 1, mark 22,
structured-clone 141/152, getRandomValues 39; obscura-dom unit tests 40/40.

## Caps / Next

This is a **cascade**, not a layout/computed-value engine. It resolves *declared*
values by the cascade and serializes colours; it does NOT do inheritance, initial
values, shorthand expansion, percentage/`auto` resolution, or anything needing layout.

Tests still out of reach and why:
- **`indeterminate-type-change` / `placeholder-shown-type-change`** — need the
  `:indeterminate` / `:placeholder-shown` pseudo-classes (selector-matching gaps, not
  cascade). Small follow-ups.
- **`required-optional-hidden`** — asserts a `type=hidden` input matches `:optional`
  (it's an input that is "not required"). Our `match_required_optional` excludes
  non-requirable types from *both* `:required` and `:optional`. A real spec/regression-
  checked tweak to `:optional` (match any input/select/textarea that is not `:required`)
  would win it — deferred to avoid risking the form-selector family for +1.
- **`is-where-error-recovery`, `is-specificity-shadow`, `is-where-shadow`,
  `dir-style-*`, `is-where-visited`** — need CSSOM `cssRules`/`selectorText`, shadow
  DOM, `:dir()`, or `:visited` (separate realms).
- **`has-style-sharing-*`, all `*-ref.html`** — render reftests (real paint).

**Next leverage:** the cascade is a foundation other realms can now lean on. Natural
follow-ups: (a) inheritance + a small set of computed-value normalizations (would open
`css/css-cascade/` basics and more `getComputedStyle` tests); (b) the small selector-
matching pseudos above (`:indeterminate`, `:placeholder-shown`, `:optional`-for-hidden);
(c) a fresh realm (`fetch/`, `html/dom/` reflection). Scroll companion to the
`wpt-conformance-campaign` memory.
