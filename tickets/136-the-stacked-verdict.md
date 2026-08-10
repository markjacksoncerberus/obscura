# Scroll 136 — the stacked, rolled-back, loaded, reported & scoped verdicts (Quests #540–#544)

**Date:** 2026-08-10 · **Realm:** `css/css-cascade` (+ `content-security-policy/font-src`) ·
**Banner:** cascade layers, the rollback keywords, and @scope — the three halves of
css-cascade-5/6 this engine did not model.

Region chosen from the #535–#539 next-leverage list: `@import` layer ORDERING was
item (2), and the first baseline showed the whole layer/rollback/scope family ripe
(`layer-basic` 19/34, `layer-important` 3/9, `all-prop-revert-layer` 0/293,
`scope-nesting` 0/24). Five quests, one region, one shared engine seam: the flat
cascade in `bootstrap.js`.

---

## #540 — `@layer`: cascade layers get an ORDER (they participated "in place")

**The gap.** #536 spliced `@layer` block contents into the cascade *in place* — a
named cap: a layered rule behaved exactly like an unlayered one. But the entire
point of layers is that ORDER, not source position, decides: unlayered style beats
any layer; a later-declared layer beats an earlier one; and for `!important` the
whole order REVERSES.

**The work.**
- `_cssSplitRules` now threads a layer PATH (array of name segments) through every
  recursion: `@layer` blocks (named, dotted, anonymous — each anonymous occurrence
  minted a unique name), `@layer a, b.c;` statements (order markers `{layerDecl}`,
  emitted even for empty declarations), and `@import … layer(…)`.
- `_buildCascadeUncached` builds the layer order the way the spec defines it:
  first-appearance of each name among its siblings, over the whole document in
  cascade order — a tree walk that assigns each full path a numeric key array.
- `_cascadeWinner` gained a layer step between importance and specificity:
  `_layerCmp` compares key arrays lexicographically with a **missing tail read as
  Infinity**, so unlayered (empty key) outranks every layer and a layer's direct
  rules outrank its sub-layers' — and for `!important` the comparison flips
  (`c < 0` wins), which is the reversal the spec is built around.
- ⭐ **The style attribute and the UA sheet needed explicit seats.** The old
  comparator encoded "inline beats rules" and "UA loses to authors" purely in
  specificity/order numbers; a layer step that runs BEFORE specificity would have
  let a layered author rule lose to the UA sheet (unlayered!). Sources now carry
  `sattr` (style attribute, animations, transitions — css-cascade's criteria put
  the style attribute ABOVE layers) and `uaLike` flags. **The whole new comparator
  is gated on `sources._layered`** — a layerless page takes the original
  comparison byte for byte.
- ⭐ `@property` name conflicts resolve by layer order too (`_effectivePropReg` +
  `_docLayerKeys`): unlayered beats layered, later layer beats earlier —
  `layer-property-override` 1/4 → 4/4.

| test | before | after |
|---|---|---|
| `layer-basic` | 19/34 | **34/34** |
| `layer-import` | 14/24 | **24/24** |
| `layer-important` | 3/9 | **9/9** |
| `layer-property-override` | 1/4 | **4/4** |
| `layer-vs-inline-style` | 4/4 | 4/4 (held) |

---

## #541 — `revert`, `revert-layer`, `revert-rule`: the cascade learns to roll back

**The gap.** All three keywords were "approximated as `unset`" — a comment in
`_computedPropOf` said so. And the `all` shorthand did not exist in the cascade at
all (`all: initial` in a rule reset nothing).

**The work.**
- `_cascadeWinnerR`, a rollback loop over `_cascadeWinner`: when the winning value
  is a rollback keyword, part of the cascade is discarded and the question asked
  again. `revert` discards the author origin **presentational hints included**;
  `revert-layer` discards the winning declaration's layer — and from unlayered
  style it discards all author sources but **leaves the hints standing** (they are
  an independent origin between user and author to `revert-layer` —
  css-cascade-5 §preshint, and the reason the hint source now carries a `hint`
  flag); `revert-rule` (css-cascade-6) discards just the winning rule. Chains
  loop; a null result falls through to initial/inherited, which is exactly
  "rolled back past everything".
- The `all` shorthand joined the cascade: `_cascadeWinner` consults a source's
  `all` declaration for every longhand it covers (never `direction`/
  `unicode-bidi`/custom properties), gated on `sources._anyAll`.
- `revert-rule` joined `_CSS_WIDE`, and `CSS.supports` accepts the CSS-wide
  keywords for every known property (its color branch validated `<color>` only —
  `CSS.supports('color', 'revert-rule')` was false and three subtests hung on it).

| test | before | after |
|---|---|---|
| `all-prop-revert-layer` | 0/293 | **292/293** |
| `revert-rule-basic` | 0/4 | **4/4** |
| `revert-rule-important` | 2/3 | **3/3** |
| `revert-rule-layer` | 0/2 | **2/2** |
| `revert-rule-custom-property` | 0/1 | **1/1** |
| `revert-rule-revert-layer` | (unmeasured) | **5/5** |
| `all-prop-revert(-layer)-noop` ×16 variants | 115/115 | 115/115 (held) |

---

## #542 — `<style>` fires `load`, and a CSSOM edit stops deleting every at-rule

**The TIMEOUT.** `layer-statement-before-import` awaited `styleElement.onload`;
we fired `load` only for `@import`-bearing styles. Every connected `<style>` fires
it now (HTML §update-a-style-block).

**⭐⭐ THE FIND: one CSSOM write made every `@layer`/`@media` block in the sheet
VANISH from getComputedStyle.** The `_cssomDirty` live path rebuilt the cascade
from `sheet._ruleListObj._rules.filter(r => r.type === 1)` — top-level style rules
only. A page that touched one rule through the CSSOM lost every at-rule in that
sheet, while LAYOUT (Blitz/stylo) kept honouring them — two subsystems
disagreeing about one document, the #527 shape again. The live path now
re-serializes the rules (`r.cssText`) and feeds the SAME splitter as the text
path, cached per live serialization (`_liveRuleCache`).

- `CSSStyleSheet.insertRule`/`deleteRule` never set `_cssomDirty` at all (only
  rule-level setters did); both set it now, as do `CSSGroupingRule`'s.
- `insertRule('@layer first, second', 0)` was a SyntaxError: a statement at-rule
  with no `;` hit EOF and was dropped. CSS Syntax says EOF closes a statement —
  but ONLY statement-grammar at-rules (`@layer`/`@import`/`@namespace`/
  `@charset`); a dangling BLOCK at-rule stays invalid (the first version of this
  fix accepted `@scope (.a)` bare and cost `at-scope-parsing` five rows — caught
  in-session and constrained).
- A `@layer` statement may be inserted ABOVE `@import` rules (the one rule
  allowed there); every other rule still throws `HierarchyRequestError`.
- Adopted constructable sheets: a sheet carrying at-rules is re-serialized
  through the splitter, so `@layer` in `adoptedStyleSheets` joins the document's
  layer order. ⭐ **Serializing PER ADOPTION OCCURRENCE is load-bearing**: an
  anonymous layer is distinct each time one sheet is adopted twice (crbug
  462744687 — the last adoption's layer is the later one). All-plain-rule sheets
  keep the original fast path untouched.
- ⭐ `@keyframes` inside `@layer` was INVISIBLE to the animation engine:
  `_caFindKeyframes` duck-typed "has `.name` and `.cssRules`" as a keyframes
  rule — which also describes `CSSLayerBlockRule`, so the layer block itself was
  taken as a (wrong-named) keyframes rule and never descended into. Now `type
  === 7` identifies keyframes and layer blocks are walked with their path;
  name conflicts resolve in layer order like `@property`.

| test | before | after |
|---|---|---|
| `layer-statement-before-import` | 0/7 TIMEOUT | **7/7** |
| `layer-cssom-order-reverse` | 2/4 | **4/4** |
| `layer-cssom-order-reverse-at-property` | 0/2 | **2/2** |
| `layer-replaceSync-clears-stale` | 0/1 | **1/1** |
| `layer-stylesheet-multi-adoption` | 0/1 | **1/1** |
| `layer-keyframes-override` | 1/4 | **4/4** |
| `layer-counter-style-override` | 4/4 | 4/4 (held) |

---

## #543 — `font-src` on a fetched stylesheet's fonts: the violation event has a home

**The TIMEOUT.** `font-stylesheet-font-blocked`: a page with `font-src 'none'`
loads a stylesheet whose `@font-face` names a font, and waits for the
`securitypolicyviolation` event. The render path's `csp.rs` (#538) refuses the
FETCH — but it is deliberately silent, and under `--render-mode on-demand` it may
never even run. **The page-visible event has to come from the JS side.**

`_cspScanFontFaces`, called at link-sheet adoption (`__obscuraAdoptLinkSheet`):
scans the arrived CSS for `@font-face` rules, resolves each rule's FIRST `url()`
source (the one the engine would fetch) against the sheet's own URL, and asks
`__cspAllowsURL('font-src', …)` — which fires the violation event and report when
a policy objects. `font-src` directory: 3/5 → **4/5** (`font-stylesheet-font-blocked`
TIMEOUT → 1/1; the remaining 0/1 is `font-match-allowed`, the NAMED harness
artifact from #538 — an `http:` font on our `https` harness page).

---

## #544 — `@scope`: scoped styles, proximity, and the root that is not its own subject

**The gap.** `@scope` existed in the CSSOM (`scope-cssom` was already 13/13) and
nowhere else — the splitter skipped the block whole.

**The work.**
- The splitter threads scope FRAMES (root selector, limit selector, implicit
  flag) like layer paths; frames stack for nested `@scope`. Implicit frames
  (`@scope { … }` with no prelude) get their owner `<style>` attached at
  `_styleSheetRules` time — the root is the owner's parent element.
- `_scopeRootFor`: the nearest ancestor-or-self matching the root selector, with
  the hop count (PROXIMITY); `_scopeLimited` walks el→root looking for a scoping
  limit. ⭐ **Limit selectors carry scoped-selector semantics too**: a bare `.b`
  is implicitly `:scope .b` (a strict descendant — the root can never be its own
  limit that way), while `:scope`/`&` name the root explicitly, and a limit the
  ROOT ITSELF satisfies (`to (.b&)`) empties the whole scope — so the walk
  includes the root exactly when the selector could reference it.
- `_scopedSelectorFor` rewrites the rule's selector for the document-context
  matcher: ⭐⭐ **specificity is part of the grammar here.** `:scope` keeps
  exactly (0,1,0): it becomes `:where(:is(R)):nth-child(n)` — `:where` zeroes the
  root selector, `:nth-child(n)` matches every element and restores exactly one
  class-level unit. `&` is `:where(:scope)`: plain `:where(:is(R))`, zero. A
  selector with NEITHER is implicitly `:scope <descendant>`: matched bare (the
  implied prefix adds no specificity — csswg 10196) with membership carried
  separately, and it NEVER matches the root itself.
- Bare declarations directly inside `@scope` (`@scope (.a) { color: green }`)
  style the ROOT with zero specificity (`:where(:scope)` semantics) — emitted as
  `scopeRootOnly` rules; the splitter's statement branch and its EOF tail both
  produce them.
- `_cascadeWinner` gained the PROXIMITY step between specificity and order,
  gated on `sources._scoped`: nearer root wins; **an unscoped declaration counts
  as infinitely far** (the WPT asserts a scoped rule beats an unscoped one of
  equal specificity in BOTH orders — an experiment with treating the pair as
  order-tied went 6/11 → 0/11 and was reverted the same hour).
- Bonus fix the proximity file forced: computed `borderColor`/`borderStyle`/
  `borderWidth` shorthands echoed the SPECIFIED text (`"green"` beside a
  `borderTopColor` of `"rgb(0, 128, 0)"`) — now reconstructed from the computed
  edge longhands. A pre-existing gap, visible far beyond @scope.

| test | before | after |
|---|---|---|
| `scope-evaluation` | 9/26 | **19/26** |
| `scope-specificity` | 0/11 | **11/11** |
| `scope-proximity` | 1/5 | **5/5** |
| `scope-implicit` | 2/11 | **9/11** |
| `scope-declarations` | 0/5 | **3/5** |
| `scope-nesting` | 0/24 | **3/24** |
| `scope-layer` / `scope-media` / `scope-supports` | 0/1 ×3 | **1/1 ×3** |
| `scope-focus` | — | **4/4** |
| `scope-invalidation` | — | **24/29** |
| `scope-import-*` (5 files) | — | **1/2 ×5** |
| `scope-cssom` | 13/13 | 13/13 (held) |

---

## ⛔ Caps / Next

* **css-nesting in the flat splitter** — `scope-nesting` 3/24: `@scope` nested
  inside style rules (`.a { @scope … }`), `&` chains inside a scope's stylesheet,
  and nested style rules generally never reach the cascade. **The single biggest
  remaining hole in this realm**, and it caps `scope-evaluation`/`scope-implicit`
  too.
* **`:scope` binds to a selector, not to THE root** — the rewrite lets `:scope`
  match any element matching the root selector; nested/overlapping same-selector
  roots can disagree with a real implementation. `:scope`/`&` under an IMPLICIT
  root are only expressible as bare `:scope`.
* **`layer-media-query` 0/8** — needs a per-iframe media context (srcdoc document
  + iframe-width `matchMedia`): the shared-realm iframe cap, not a layer bug.
* **`layer-font-face-override` 0/4** — layered `@font-face` selection needs real
  font metrics through the render path.
* **`presentational-hints-rollback` 0/16** — every row reads `clientWidth` of an
  `<img>` and gets **0**, including the no-revert control rows: a render-path
  image-measure gap, not a cascade one. Worth its own look.
* **Reftests in this realm** (F7 cap): `revert-layer-001…015`, `revert-val-001/002`,
  `all-prop-revert-color`, `layer-media-toggle`, `layer-slotted-rule`,
  `layer-stylesheet-sharing(-important)`, `important-prop`.
* `all` + a specific longhand in ONE declaration block: the specific longhand
  wins regardless of block order (decls are a map; order within a block is lost).
* `@scope`/`@font-face` scanning caps: only a `<link>` sheet's `@font-face` URLs
  are CSP-reported (a `<style>`'s are refused at fetch but unreported); only the
  first `url()` per rule.
* `scope-hover` 0/4 needs real hover state; `scope-declarations`' last 2 rows
  need `CSSNestedDeclarations` objects in the CSSOM rule list.
* **at-scope-parsing 20/43** — CSSOM serialization details of scope preludes
  (`&` in preludes, relative-syntax forms).

## Zero-regression proof

309-file sweep (the ritual list + every file this arc touched), run against the
pre-arc binary and the final one, diffed per file:

```
before: 53215/54289  (334 rows, 12 could-not-run)
after:  53601/54289  (334 rows, 12 could-not-run)
30 rows improved, 1 moved down.
```

The one moved-down row is `the-img-element/naturalWidth-naturalHeight-width-height`
(210/258 → 169/258 in the batch), **the campaign's documented flaky file** (#530
proved 188/210/210 on one binary). Re-run SOLO on this arc's binary, three
consecutive times: **210/258, 210/258, 210/258** — identical to the pre sweep's
number. The 169 was batch-load flake, not a regression.
