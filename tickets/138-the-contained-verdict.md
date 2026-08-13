# 🏰 Scroll #138 — The Contained Verdict: `@container` learns to answer (Quests #550–#554)

> **Region:** `css/css-conditional/container-queries/` — 199 files, an UNTOUCHED
> realm under the standing order. **Banner taken 2026-08-12/13.**

## The gap

The CSSOM had parsed `@container` for months — `CSSContainerRule`, prelude
validation, `containerName`/`containerQuery` serialization, all of it — while
the CASCADE dropped every `@container` block on the floor
(`bootstrap.js:14572: "@container/@starting-style/…: unsupported, dropped"`).
The #527/#542/#545 two-subsystems shape, fourth appearance: one half of the
engine answers, the other half never heard the question. Container units
(`cqw`/`cqi`/…) resolved to 0 through the `cqZero` escape hatch, `style()`
queries did not exist, and `CSS.registerProperty` accepted `1cqw` as a
computationally independent initial value.

Baseline (36-file probe): **367/740 (49.6%)** with whole files at zero:
`custom-property-style-queries` 0/78, `nested-query-containers` 0/32,
`container-units-*` 0/13, `query-evaluation-style` 36/91.

## Quest #550 — size queries in the flat splitter, and the box that vanished

`_cssSplitRules`/`_cssEmitStyleRule` now thread `cq` FRAMES (raw prelude
strings, stacking for nested `@container` — all must hold) onto every rule that
travels out of an `@container` block; `_buildCascadeUncached` gates each rule
per element via `_cqRuleApplies`. Selection walks ancestors for the nearest
eligible container: name filter (`container-name` list), then container-type
axis eligibility — an `inline-size` container answers only its own inline axis,
and an ineligible candidate is **SKIPPED, not selected-and-unknown** (an outer
`size` container answers `(height)` when the nearer container is inline-only —
container-selection.html proves both directions). Three-valued evaluation with
**contagious unknown**: `(unknown) or (width)` is unknown, not true — container
queries are NOT Kleene logic (query-evaluation.html tests exactly this).

⭐⭐⭐ **The blocker wasn't CSS — a sized block whose only inline content was an
EMPTY `<span>` had NO BOX AT ALL.** The Blitz fork's
`compute_inline_layout_inner` short-circuits an inline context with no text and
no inline boxes ("can be collapsed through") — and that early-out ran BEFORE
style sizes were resolved, so `width:20px;height:10px` returned a 0×0 box that
contributed nothing to flow. `getBoundingClientRect()` said 0×0, `offsetWidth`
0, and every container sized this way evaluated `(width: 16px)` against
nothing. The commented-out condition list in the fork shows the original
author suspected exactly this. Fix: resolve `node_size`/`node_min_size` first;
only an UNSIZED empty inline context takes the early-out. `container-selection`
5/21 → 21/21 the moment the box existed. *A `<div style="width:20px"><span>
</span></div>` is half the icon buttons on the web.*

⭐⭐ **The second blocker was exponential, and it looked like a hang.**
Container selection read `container-name`/`container-type`/`writing-mode`
through full `getComputedStyle` — which rebuilds the ancestor's cascade, which
re-evaluates every `@container` rule for THAT element, which walks ITS
ancestors… `container-nested.html` (12 rules deep) went from instant to
minutes. Two-part fix: (a) `_cqPropOf` — a mini-cascade that reads ONE declared
property off the flat rules; (b) the `_cqMemo` owned by the OUTERMOST
`_buildCascade` (nothing can mutate mid-build, so every (element, frames) gate
and (container, property) read is evaluated once per outer build).
⚠️ **The first diagnosis was wrong twice**: the "hang" reproduced with
`replaceSync` on a fresh page — because the previous probe's genuinely-wedged
page was still spinning ON THE SAME SERVER. *A wedged server makes every
subsequent test look guilty; prove a hang on a fresh server before blaming the
code in front of you.*

## Quest #551 — style() queries: identity, ranges, and the typed evaluator

`style(--x: value)` compares computed custom-property values against the
nearest container (name filter only — container-type is irrelevant to style
queries; unnamed pure-style queries resolve to the PARENT, every element is a
style container). `style(--x)` = non-guaranteed-invalid. var() in the query
value substitutes against the CONTAINER's computed values — so
`style(--baz: var(--unknown))` matches guaranteed-invalid against
guaranteed-invalid, and does.

**Style RANGES got a typed numeric evaluator** (`_cqNumEval`): a full
`<calc-sum>` (calc/min/max/clamp, var(), attr(), env()) folding to
`{value, type}` — num · len(px) · pct · ang(deg) · time(ms) · res(dppx) · zero.
Comparisons demand matching types; **a bare `0` compares as a number OR a
length but never an angle** (`style(0 = 0px)` true, `style(0 = 0deg)` false);
`3turn > 3deg` and `3dppx > 96dpi` convert within their type; `1px` vs `1%` is
incomparable and false in BOTH directions. A bare `--x` operand reads the
container's computed value; `--x + 1` OUTSIDE calc() is a grammar error.
⭐ **attr() typing**: `attr(xyzzy)` untyped resolves to a STRING (never a
length); a MISSING attribute substitutes its fallback as raw tokens, so
`attr(plugh, 5px)` is a length. ⭐ **Grammar errors are unknown; failed
resolutions are false** — `style( < 10em)` and `style(10px ! < 10em)` are
`<general-enclosed>` (unknown), but `style(--missing < 10px)` is false, which
`(f) or (not f)` distinguishes ruthlessly (at-container-style-parsing).
⭐ CSS-wide keywords in the VALUE compute first: `initial` = registered initial
(guaranteed-invalid unregistered), `inherit` = parent's value, `unset` picks by
the registration's inherits flag; the revert family never matches. A REGISTERED
numeric property compares by computed value (`--length: 11em` ≡ `176px`); an
unregistered one is token-equality only.

`style(prop: value)` on standard properties compares computed-to-computed
(colors resolve through the engine's CSS Color 4 parser: `green` ≡
`rgb(0, 128, 0)`).

## Quest #552 — container units are real lengths now

`_evalMath` gained `opts.cqEl`: `cqw`/`cqh`/`cqi`/`cqb`/`cqmin`/`cqmax` resolve
via `_cqUnitPx` — 1% of the nearest eligible container's CONTENT box in the
corresponding axis, **selected per-axis** (`10cqi` and `10cqb` may resolve
against two DIFFERENT containers — container-units-basic tests exactly that
shape: 10cqi=30px from the inner inline-size container, 10cqb=40px from the
outer size container), small-viewport fallback with no container. Size-feature
VALUES route through the same typed evaluator, so `(width = calc(100px +
10rem))` folds against the real root font-size and `var(--query)` in a size
query substitutes against the container. `CSS.registerProperty` now rejects
cq units in initial values (they are not computationally independent — they
depend on an ancestor's layout).

## Quest #553 — the last parse/computed rows

`(100px = width = 200px)` is a grammar error (dual ranges take same-direction
`<`/`<=` or `>`/`>=` only) → unknown; `(style(--x: y))` — a lone functional
token inside parens — is that function as an operand, not a malformed size
feature; `!important` in a style() declaration is allowed and ignored, a stray
`;` invalidates it; `container-name: none` / `container-type: normal` joined
the initial-values table (their absence made `initial`/`unset` compute to
empty string); the gCS `container` shorthand reconstructs from computed
longhands (`container: initial` → `none`, `foo / normal` → `foo`).

## Quest #554 — semantics the tests demanded

* **An inline box never establishes a size container** however its
  `container-type` computes — `_cqContentBox` refuses `b.inline` boxes, so the
  features evaluate unknown (never-match-container).
* **`@container` can conditionally REMOVE container status** —
  `@container (min-width: 200px) { .child { container-type: initial } }` —
  `_cqPropOf` now evaluates cq-gated rules for container-establishment
  properties (selector match FIRST, so recursion only climbs to ancestors;
  the depth guard breaks pathological cycles). conditional-container-status
  0/1 → 1/1.
* CSS-wide keywords in `_cqPropOf` fall back to the initial value
  (`inherit` chases the parent).

## Results (per-file, before → after)

| file | before | after |
|---|---|---|
| query-evaluation | 25/38 | **38/38** |
| container-selection | 5/21 | **21/21** |
| size-feature-evaluation | 28/56 | **56/56** |
| container-nested | 5/14 (then HANG) | **14/14** |
| query-evaluation-style | 36/91 | **91/91** |
| custom-property-style-queries | 0/78 | **78/78** |
| at-container-parsing | 66/117 | **117/117** |
| at-container-style-parsing | 6/41 | **41/41** |
| container-computed | 11/14 | **14/14** |
| container-name/type-computed | 8/10, 3/5 | **10/10, 5/5** |
| container-units-basic / -invalidation / -computational-independence | 0/2, 0/5, 0/6 | **2/2, 5/5, 6/6** |
| calc-evaluation / var-evaluation | 0/1, 0/1 | **1/1, 1/1** |
| container-inheritance | 2/4 | **4/4** |
| never-match-container | 2/2→1/2 in-flight | **2/2** |
| display-none | 6/19 | **19/19** |
| unsupported-axis | 12/16 | **16/16** |
| aspect-ratio-feature-evaluation | 0/2 | **2/2** |
| conditional-container-status | 0/1 | **1/1** |
| 36-file probe total | 367/740 (49.6%) | region-wide below |
| **full region (199 files)** | — (untouched) | **941/1183 over 149 scored files (79.6%), 50 could-not-run** |

Full-region sweep (`scripts/wpt-container-queries-all.txt`, 3 shards, 45s):
149 files scored, 941/1183 subtests. The 50 could-not-run split into reftests
(`<link rel="match">` — query-style-color, multiple-conditions-001, the
canvas-as-container/no-layout-containment refs), dialog/popover-dependent
files, and rAF/load-gated promise_setup shapes. The remaining red files
cluster around the named caps: render-path @container (animations,
resize-driven invalidation, nested-query-containers 0/32), shadow DOM
(container-for-shadow-dom 1/21), typed-OM (container-units-typed-om 6/24),
SVG lengths, and container-relative font metrics
(font-relative-units 4/12).

## ⛔ Caps / Next

* **`@container` reaches getComputedStyle, NOT the render path** — stylo/Blitz
  layout never evaluates it, so tests asserting LAYOUT effects of container
  query rules (inline-size-containment's offsetHeight, nested-query-containers'
  clientWidth ladder) stay red. Same two-subsystems shape this arc closed for
  the cascade, now pointing the other way. Wiring stylo's own container-query
  machinery through Blitz is the clean path.
* **Size containment itself** is not implemented in Blitz layout
  (container-type: size should size the box as if empty).
* `query-style-color.html` and `multiple-conditions-001.html` are REFTESTS
  (`<link rel="match">`) — could-not-run is the honest answer for this runner.
* Shadow-DOM rows (container-for-shadow-dom, style-container-for-shadow-dom,
  query-container-name's shadow rows) wait on real shadow style scoping.
* `<style-range>` unknown-vs-false subtleties beyond the tested grammar rows
  (e.g. mixed-type dual ranges) follow the tests, not the full spec algebra.
* scroll-state() queries (container-type: scroll-state) not implemented.

## Zero-regression proof

294-file ritual list (319 scored rows after variant expansion), PRE-arc binary
(bootstrap.js + blitz inline.rs stashed, rebuilt) vs the FINAL binary, diffed
per file with `wpt_batch_diff.py`:

```
before: 54659/55287  (1 could-not-run, 319 rows)
after:  54676/55289  (1 could-not-run, 319 rows)
3 improved, 0 regressions
```

The three improved rows are themselves evidence: `set-selector-text` 6/7→7/7
is the @container row scroll #137 NAMED as a cap; `all-prop-revert-layer`
292/293→294/295 gained the container longhands under `all` (denominator +2);
and `naturalWidth-naturalHeight` is the campaign's DOCUMENTED flaky file
(#530: 188/210/210 on one binary), moving in the improving direction.

This arc touched shared paths (the flat splitter, `_evalMath`, `_buildCascade`,
and Blitz's inline layout — the collapse-through fix affects EVERY page with an
empty inline child), which is exactly why the full pre/post ritual ran rather
than a spot check.
