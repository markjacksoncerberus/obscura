# Scroll 137 — The Flattened, Bound, Validated, Measured & Conjured Verdicts (Quests #545–#549, 2026-08-10)

> **Region:** `css/css-nesting` (a whole untouched realm), the `@scope` half of
> `css/css-cascade`, and the door into `css/css-pseudo`.
> **Banner chosen because:** the outgoing knight's #1 next-leverage pointer was
> "css-nesting in the flat splitter — the single biggest hole left in css-cascade",
> and css-nesting is an untouched realm (standing order: prefer those).

## The five quests

### #545 — CSS nesting in the flat splitter (`css/css-nesting` 79/117 → 115/117)

The CSSOM already parsed nested rules (`parsing.html` was 32/32 *before* this
quest) — but the CASCADE never saw them: `_cssSplitRules` treated every style
rule's body as one declaration block, so `.a { .b { color: green } }` styled
nothing. The classic two-subsystems shape (#527, #542): the object model knew
the rules, `getComputedStyle` did not.

The flat splitter now:
* segments a style rule's body into ordered **declaration runs** and **nested
  rules** (`_cssStyleBodySegments`) — order is load-bearing: a declaration after
  a nested rule forms a LATER rule of its own (the CSSNestedDeclarations model),
  so `color:red; & {…} color:blue` ends blue;
* desugars nested selectors against the parent (`_cssNestSelector`): `&` becomes
  `:is(<parent list>)` (the spec's max-specificity semantics), a selector with
  no `&` gets an implied `:is(parent) ` prefix, and a leading combinator binds
  to the same implied parent by plain concatenation;
* handles nested group at-rules — `@media`/`@supports`/`@layer`/`@scope` inside
  style rules, with bare declarations inside them applying to the parent
  selector; a nested **statement** at-rule (`@layer a, b;`) is invalid and
  dropped whole (nesting-layer.html checks exactly this, because keeping it
  would flip the document's layer order);
* recovers from errors the way CSS syntax does: `{ foo }` (no prelude) skipped,
  invalid selectors match nothing, garbage between valid declarations dropped.

**Top-level `&` matches like `:scope` with ZERO specificity** (`:where(:root)`),
and `&` in a query selector (`el.querySelectorAll('& > .x')`) means `:scope` —
done once in Rust `parse_selector` (quote-aware textual rewrite), so qSA,
`matches`, `closest` all get it.

Bonus finds while closing the file list:
* **CSSOM dropped nested `@layer` blocks from style rules** (`_buildNestedItems`
  didn't know the name), so `rule.cssText` silently LOST the child — and the
  cssomDirty live-reserialize path then fed the cascade the truncated text.
* **Window named-element access was dead for innerHTML-built subtrees** —
  `appendChild` exposed only the appended element's own id, and `insertBefore`
  exposed nothing at all. Two cssom.html rows failed on `outer is not defined`
  before touching a single CSS API. innerHTML now scans its parsed subtree
  (gated on a cheap `/\bid\s*=/` test), and the getter stays LIVE
  (`document.getElementById` at read time) so exposing a detached subtree's ids
  is correct — they resolve once connected.

Remaining 2/117: pseudo-element rows needing `@container` evaluation, and the
9 could-not-run are all reftests (`<link rel=match>`), not testharness — named,
not failures.

### #546 — `@scope` binds `:scope` to the REAL root (scope-evaluation 19→26/26, scope-nesting 22→24/24, scope-implicit 9→11/11)

#544's textual rewrite (`:scope` → "anything matching the root selector") was a
documented cap, and it was the root cause of every remaining scope failure:
`:scope + .c` matched a SIBLING of something root-like (the root must be an
ancestor), `:scope > :scope` matched (it can never), and `:scope`/`&` under an
implicit root were inexpressible.

The fix is one new Rust op parameter: `selector_match_specificity` now accepts
`"nid,scope_nid"` and sets the selectors crate's `scope_element`, so `:scope`
in a scoped rule's selector matches EXACTLY the bound root — the same mechanism
`element_matches` already had. `&` rewrites to `:where(:scope)` (zero
specificity), `:scope` keeps its native (0,1,0), and the `:nth-child(n)` hack
died.

Nested `@scope` got real semantics too (`_scopeChainRoot`): an inner scope root
must itself lie IN the outer frame's scope (inclusive — the "reverse" test's
outer-root-above-inner case now correctly fails; "inner root may be the outer
root" now correctly passes), `:scope`/`&` in a scope-start refer to an outer
root, and a RELATIVE start (`@scope (> #child)`) positions the root against an
outer root — including under an implicit middle frame (the "sandwiched deep
implicit scope root" test). A prelude-less `@scope` nested in a STYLE rule
roots at the parent rule's elements, not at the `<style>`'s parent.

### #547 — the @scope prelude grammar + CSSNestedDeclarations everywhere (at-scope-parsing 20/43 → 43/43, scope-declarations 3/5 → 5/5, scope-invalidation 24/29 → 29/29)

Three separate holes:
* **23 invalid preludes were accepted** (`@scope ()`, `@scope div`,
  `@scope (.a) from (.c)`, `@scope (div::before)`…). `_validScopePrelude` now
  enforces `(<start>)? [to (<end>)]?` with nothing else, non-empty selector
  lists that parse as relative lists, and no pseudo-elements — at EVERY door
  (sheet parser, nested-items builder, both flat-splitter branches).
* **A top-level `@scope` body dropped its bare declarations** on the CSSOM side
  (parsed with the top-level rule grammar). It is a NESTING CONTEXT: the body
  now goes through `_buildNestedItems`, so `color: red; .b {} left: 2px`
  produces the spec's five children with CSSNestedDeclarations between the
  rules; `insertRule('z-index: 1')` on a CSSScopeRule works
  (`_ruleInNestingContext` recognises @scope).
* **`selectorText = '> .b'` on a @scope child was rejected** — the setter
  parsed non-relative. Any rule inside a nesting context accepts relative
  selectors now.

Two general engine wins fell out of this quest's failures:
* **`:nth-child(An+B of S)` was unparseable** — the selectors crate implements
  it; `parse_nth_child_of()` was simply never turned on. One-line opt-in.
* ⭐⭐ **The `background` shorthand NEVER reached `getComputedStyle` from a
  stylesheet.** `.b { background: green }` computed `backgroundColor` as
  `rgba(0, 0, 0, 0)` on every page ever loaded — the CSSOM setter path expanded
  it, but `_SHORTHAND_LONGHANDS` (the cascade's expansion table) had no
  `background` entry and `_expandShorthand` no branch. Found because ONE
  scope-invalidation row used `background:` where its siblings used
  `background-color:`. *When a test fails only in its shorthand variant, the
  bug is never about the feature under test.*

### #548 — replaced elements get their boxes (presentational-hints-rollback 0/16 → 8/16)

Every row read `clientWidth` of an `<img>` and got **0** — including the
no-revert control rows. Two distinct render-path bugs:

* **CSSOM View's inline-zero rule was applied to REPLACED elements.**
  `getBoundingClientRect()` said 44×33 and `offsetWidth` said 44 while
  `clientWidth` said 0 — the `inline_level` flag in obscura-render's `NodeBox`
  meant "display:inline exactly", but an inline IMG is not an "inline box"; it
  has a perfectly ordinary padding box. Replaced/form elements
  (img/iframe/video/canvas/embed/object/input/textarea/select/button/audio/svg)
  are now excluded from the flag.
* **An `<iframe>` generated NO BOX AT ALL** in the Blitz fork — it wasn't in
  `construct.rs`'s inline-embedded-box lists and had no measure function.
  It is now a replaced element with the CSS default object size (300×150) as
  its intrinsic size, width/height attributes overriding it (HTML
  §dimension-attributes) and CSS overriding both — the same
  `replaced_measure_function` images use.

⛔ The remaining 8 rows are the `revert`/`revert-layer` halves: they need
width/height presentational hints to live in the STYLE system (stylo origins)
rather than as a layout-side attr fallback, so `revert` can roll them back
(natural size) while `revert-layer` keeps them. That is a stylo-origin
plumbing job in the fork — named, not attempted.

### #549 — pseudo-element computed style (`getComputedStyle(el, '::before')` existed and IGNORED its second argument)

`getComputedStyle` accepted `pseudoElt` and returned the ELEMENT's style — the
a11y name computation was calling `getComputedStyle(el, '::before').content`
and reading the element's own `content` forever. The whole feature was absent.

The design that made it small: a **pseudo view** — `Object.create(el)` with
three own properties: `_pseudoName`, `parentElement` → the originating element
(which is EXACTLY a pseudo-element's inheritance chain, so the entire
`_computedPropOf` machinery works unchanged), and an empty inline `style` (a
pseudo-element cannot carry a style attribute). `_buildCascadeUncached`
recognises the marker and keeps only rules targeting that pseudo — matched
against the originating element with the pseudo stripped (`.a ::after` keeps
its combinator: the strip appends `*`), plus the pseudo's own (0,0,1) — and
skips the element's UA/presentational-hint sources. `::marker` gets its
CSS-Lists UA defaults (unicode-bidi:isolate, font-variant-numeric:tabular-nums,
text-transform:none, text-indent:0, white-space:pre) — which must OVERRIDE
values inherited from the list item, and do, because a declared UA value beats
inheritance.

Yield: nested-declarations-matching 10/11 → **11/11** (closing #545's last
pseudo row), css-pseudo probe (15 files, an untouched realm) 142 → **174/217**
scored — `marker-default-styles` 0/32 → **32/32**, `marker-computed-content`
10/10, `marker-reverted-styles` 8/8, `marker-variable-computed-style` 2/2.
Recognised pseudos: before/after/marker/first-line/first-letter/backdrop/
placeholder/selection/file-selector-button; an unrecognised string keeps the
old behaviour rather than throwing.

## Results table

| test | before | after |
|---|---|---|
| `css-nesting` realm (22 testharness files) | 79/117 | **115/117** |
| `css-nesting/nested-declarations-matching` | 10/11 (post-#545) | **11/11** |
| `css-cascade/scope-nesting` | 3/24 | **24/24** |
| `css-cascade/scope-evaluation` | 19/26 | **26/26** |
| `css-cascade/scope-implicit` | 9/11 | **11/11** |
| `css-cascade/scope-declarations` | 3/5 | **5/5** |
| `css-cascade/at-scope-parsing` | 20/43 | **43/43** |
| `css-cascade/scope-invalidation` | 24/29 | **29/29** |
| whole @scope region (10 files) | 130/171 | **171/171** |
| `css-cascade/presentational-hints-rollback` | 0/16 | **8/16** |
| `css-pseudo` probe (9 scored files) | — (untouched) | **174/217** |
| held: scope-specificity 11/11, scope-proximity 5/5, scope-cssom 13/13, scope-focus 4/4 | | all held |

## ⛔ Caps / Next

* **Presentational hints as a real cascade origin in the fork** — the remaining
  8 `presentational-hints-rollback` rows: map img/iframe width/height attrs
  into stylo's hint origin and drop the layout-side attr fallback, so `revert`
  rolls them back while `revert-layer` keeps them.
* **Pseudo-element computed style caps:** scoped pseudo rules skipped;
  pseudo-element LAYOUT (marker-computed-size wants real marker boxes) absent;
  `CSSPseudoElement` interface (identity file) not implemented; first-line/
  first-letter property FILTERING (the allowed-properties files are at 28/36 &
  88/112 because we don't restrict which properties apply) absent.
* **`@container` evaluation** — set-selector-text's @container row + a
  css-nesting pseudo row; needs container query resolution against layout.
* **css-nesting reftests** (9 could-not-run): host-nesting ×5 need shadow-DOM
  style scoping; the rest need the render path.
* **Pseudo-element rendering**: computed style now answers, but Blitz paints
  no ::before/::after boxes — the render side is untouched.
* Carried from previous arcs: per-iframe media contexts (`layer-media-query`
  0/8), `'strict-dynamic'` workers, redirect hops on render-path fetches,
  more CSP (1,362 files), `layer-font-face-override` (font metrics).

## Zero-regression proof

308-file sweep (the ritual list + every file this arc touched — 319 scored
rows after variant expansion), pre-arc binary vs final, diffed per file:

```
before: 54408/55288  (334 rows, 15 could-not-run)
after:  54649/55288  (334 rows, 15 could-not-run)
30 files improved, 0 regressions.
```

⚠️ **One regression was found by the FIRST post sweep and closed in-session:**
`quirks/unitless-length/quirks.html` 1583/1590 → 1582/1590, one subtest —
"Excluded property background:1 1". The new `background` shorthand expansion
(#547) accepted a bare nonzero number as a `<length-percentage>` position
token, so a quirks-mode `background: 1 1` — which the unitless quirk
explicitly EXCLUDES — started producing a computed position. The pre-arc
binary "passed" only because the shorthand never reached the cascade at all.
`_isLPTok` now requires a unit or `%` on any nonzero number (zero stays
unitless), which is the standards-mode rule everywhere. Solo re-runs: post
1582×3 → fixed 1583, byte-identical fail list to pre. *An expansion that
suddenly makes a stored value observable inherits every validation bug in how
that value got stored.*

The `naturalWidth-naturalHeight` row (177→186 in the diff) is the campaign's
DOCUMENTED flaky file (#530: 188/210/210 on one binary) — batch-load variance,
in the improving direction here.
