# Scroll 491 — The Mathematical Verdict (Quests #605–#624)

**Date:** 2026-09-06 · **Region:** `mathml/*` — the whole realm, never touched in
604 quests · **Branch:** `engine-per-page-threads`

## The verdict, in one breath

**There was no MathML.** Not "MathML with gaps" — none. `is_mathml_element()` in
the layout engine's selector glue returned `false` with the comment
`// not implemented.....`; there was no MathML user-agent stylesheet in either the
computed-style engine or the renderer; every `<mi>`, `<mfrac>` and `<mtable>` in
the document wrapped as `HTMLUnknownElement` and reported its tag name as `MI`,
`MFRAC`, `MTABLE` — uppercased, which foreign content never is; and an
`<mspace width="20px">` measured **0 × 0**.

That last one is the whole realm. Every MathML test in WPT loads
`mathml/support/feature-detection.js`, and almost every `has_<element>` in it
resolves to **`has_mspace`**, which asks a single question: is
`<mspace width='20px'>` twenty pixels wider than a bare `<mspace>`? For Obscura
it was not, so 246 test files agreed among themselves that this browser has no
MathML and stopped at their first assertion. A realm of 3407 subtests was gated
behind one box that did not exist.

Twenty quests. **The realm 719/3407 → 2850/3409 (21.1% → 83.6%)**, 92 files up,
**0 down, 0 regressions**, 79 files now at 100% — measured over the same 246-file
probe list (`scripts/wpt-mathml-probe.txt`) before and after.

Two of the twenty are not about MathML at all. Fixing the tag-name casing fixed
it for **SVG** too (`foreignObject` had been reported as `FOREIGNOBJECT` and its
`localName` as `foreignobject`, engine-wide). And chasing one MathML assertion
about logical padding turned up that **css-logical properties and their physical
counterparts had never met**: `padding-block-start: 10px` computed
`padding-top: 0px`, and `margin-left: 7px` computed `margin-inline-start: 0px`,
on every element of every page.

## Why this realm

The standing order says take the untouched realms. `mathml` had **zero mentions**
in `WPT_PROGRESS.md` after 604 quests, sat at 21.1% against a Chrome at ~99%, and
is the realm a homework page is made of. A child doing her mathematics on a
hand-me-down laptop opens a page whose formulae are the content. Before this
arc, every one of them rendered as a row of same-sized characters with no
fraction bars, no radicals, no scripts — or, more often, as nothing at all.

## The quests

| # | What | Where |
|---|---|---|
| **#605** | ⭐⭐ **`MathMLElement`** — the interface existed as a bare class that nothing was ever an instance of. MathML-namespace elements (parsed and `createElementNS`) now wrap as `MathMLElement`, and it carries the `GlobalEventHandlers` mixin like HTMLElement and SVGElement do. | `bootstrap.js` |
| **#606** | ⭐⭐ **Foreign content keeps its case.** The `tag_name` op ASCII-uppercased unconditionally, so `<math>` was `MATH` and SVG's `<foreignObject>` was `FOREIGNOBJECT`; `localName` was derived by lowercasing it, which turned `foreignObject` into `foreignobject`. Now `tagName` uppercases only for HTML-namespace elements in an HTML document, and `localName` reads the raw local through a new op (memoised per wrapper). **This was an SVG bug too.** | `ops.rs`, `bootstrap.js` |
| **#607** | The **MathML Core UA stylesheet** in the computed-style engine — display values, `merror`'s border and background, `mphantom`'s visibility, the table displays, `mi`'s automatic italic, `semantics`/`maction` showing only their first child, and `writing-mode: horizontal-tb !important`. | `bootstrap.js` |
| **#608** | **Attribute mapping** — `dir`, `mathcolor`, `mathbackground`, `mathsize` map to CSS; MathML 3's `fontsize`/`color`/`background` deliberately do not. `attribute-mapping-001` **0/165 → 165/165**. | `bootstrap.js` |
| **#609** | **`math-depth` / `math-style` / `math-shift`** registered as real inherited properties, plus `scriptlevel`, `displaystyle` and `mathvariant="normal"` mapping onto them. `attribute-mapping-002` 33/132 → **132/132**. | `bootstrap.js` |
| **#610** | The **MathML UA stylesheet in the renderer** — MathML elements get boxes for the first time. | `engine.rs` |
| **#611** | ⭐⭐⭐ **THE GATE: `<mspace>` has a size.** `width`, `height` and `depth` are pure geometry with no content to size them; they map to `width` and `height: calc(height + depth)` through the ordinary CSS declaration parser (which enforces MathML's rule that a bare number is *not* a length). This is the box the whole realm was waiting on. | `blitz-dom/stylo.rs` |
| **#612** | Grammar for the three math properties (`auto-add | add(<integer>) | <integer>`, `normal | compact`) so `e.style.mathDepth = "invalid"` is refused, and `add()`/`auto-add` resolve at computed time against the parent. | `bootstrap.js` |
| **#613** | `<mfrac>` stacks its numerator over its denominator — **but only when it is well-formed**. A fraction with any child count but two is invalid markup that lays out as a plain mrow. | `blitz-dom` |
| **#614** | ⭐⭐ **MathML rows are flex containers, because whitespace between MathML elements is not content.** The space a human types between `<mn>1</mn>` and `<mo>+</mo>` is not rendered; inline layout turned it into a real space box and every spacing measurement came back one space-width too wide. Flex generates no anonymous item for whitespace-only text, and `align-items: baseline` is what an mrow does anyway. Token elements stay inline-block — their whitespace *is* content. | `engine.rs` |
| **#615** | `<msqrt>` draws a radical sign (generated content — not the stretchy glyph construction, but a square root where a square root belongs, and the measurement `has_msqrt` asks for). | `engine.rs` |
| **#616** | ⭐⭐ **Operator spacing, and the embellished-operator rule.** `lspace`/`rspace` map to margins (outside the operator's own box — `mo.getBoundingClientRect()` must not grow). Two conditions decide whether they apply at all: the parent must use **mrow layout** (an `<mo>` inside a fraction gets none), and the space goes around the whole **embellished operator** — an `<mo>` wrapped in an `<mrow>` puts its space before the *mrow* — with the `<math>` root as the one place the hoisting stops. `no-spacing` **0/54 → 51/54**. | `blitz-dom/stylo.rs` |
| **#617** | A MathML element with `display: contents` computes to `display: none` — a rule about the computed value that no stylesheet of any origin can express. | `bootstrap.js` |
| **#618** | ⭐⭐ **`Selection.toString()` returns RENDERED text.** It was `Range.toString()`, which concatenates raw `data`; the Selection API asks for what the user sees, i.e. with `text-transform` applied. Which is how MathML's automatic italic is observable: a single-character `<mi>` copies as its **italic mathematical alphanumeric symbol** (MathML Core Appendix C, 112 mappings, run-length encoded to 18 runs). `mathvariant-auto-selection` **0/112 → 112/112**. | `bootstrap.js` |
| **#619** | ⭐⭐⭐ **css-logical properties had never reached their physical counterparts.** `padding-block-start: 10px` computed `padding-top: 0px`; `margin-left: 7px` computed `margin-inline-start: 0px`; `inline-size` and `width` were strangers. Both names now go to the cascade and the stronger declaration wins, mapped through the element's own computed `writing-mode` and `direction`. **This is engine-wide, not MathML:** `css/css-logical` **17/269 → 167/269** on the same five files, and it is what `force-horizontal-tb` (0/68 → **68/68**) was really asking for. | `bootstrap.js` |
| **#620** | ⭐⭐ **`font-size: math`** — the per-level scaling that makes a superscript smaller than its base (0.71 per step of math-depth). Stylo compiles `math-depth`/`math-style`/`font-size: math` for Gecko only, so in this build they do not exist as cascadable properties; the depth is derived structurally from the tree (every rule that sets it *is* structural) and emitted as a percentage font-size, which composes down the tree the way per-level scaling does. Done twice, deliberately — once in the renderer, once in the computed-style engine — so the box a page gets and the style it reads agree. | `blitz-dom/stylo.rs`, `bootstrap.js` |
| **#621** | An **accent** keeps its font size. `munder[accentunder=true] > :nth-child(2)` and its three siblings reset `font-size: inherit`: a hat or a bar drawn over a symbol is not a script and must not shrink, even though its math-depth still rises. `scriptlevel-001` 4/16 → **16/16**. | both |
| **#622** | `<munder>`, `<mover>` and `<munderover>` stack (`has_munderover` measures exactly this), with `<munderover>` drawn overscript, base, underscript though it is written base, underscript, overscript. | `blitz-dom` |
| **#623** | ⭐⭐ **"In-flow children" is a question about computed styles.** The child-count rules that decide whether a fraction or a script is well-formed must ignore `display: none` and out-of-flow children — so the decision cannot live in the presentational-hint pass (a parent's hints are synthesised before its children are styled) and cannot live in layout-tree construction either (the Taffy style is rebuilt from stylo afterwards, discarding anything written there). It lives in the style flush, immediately after the rebuild. | `blitz-dom/damage.rs` |
| **#624** | The same whitespace rule as #614, for MathML in an **inline** formatting context (a `<mtd>`'s anonymous mrow): a whitespace-only text child of a non-token MathML element generates no box. `mo-lspace-rspace-5` 32 → **40/48**. | `blitz-dom/construct.rs` |

## Results

| Test | Before | After | |
|---|---:|---:|---|
| `relations/html5-tree/math-global-event-handlers.html` | 75/375 | **375/375** | ✅ |
| `relations/css-styling/attribute-mapping-001.html` | 0/165 | **165/165** | ✅ |
| `relations/css-styling/attribute-mapping-002.html` | 33/132 | **132/132** | ✅ |
| `relations/css-styling/mathvariant-auto-selection.html` | 0/112 | **112/112** | ✅ |
| `relations/css-styling/writing-mode/force-horizontal-tb.html` | 0/68 | **68/68** | ✅ |
| `relations/css-styling/width-height-001.html` | 0/103 | **103/103** | ✅ |
| `relations/css-styling/ignored-properties-001.html` | 0/260 | **255/260** | 🟢 |
| `relations/css-styling/not-participating-to-parent-layout.html` | 0/166 | **163/166** | 🟢 |
| `relations/css-styling/padding-border-margin/margin-002.html` | 0/76 | **73/76** | 🟢 |
| `relations/css-styling/padding-border-margin/border-002.html` | 0/51 | **49/51** | 🟢 |
| `relations/css-styling/padding-border-margin/padding-002.html` | 0/51 | **49/51** | 🟢 |
| `relations/css-styling/scriptlevel-001.html` | 4/16 | **16/16** | ✅ |
| `relations/css-styling/out-of-flow/absolutely-positioned-002.html` | 0/26 | **26/26** | ✅ |
| `relations/html5-tree/dynamic-childlist-001.html` | 0/44 | **43/44** | 🟢 |
| `relations/html5-tree/href-click-004.html` | 0/28 | **27/28** | 🟢 |
| `presentation-markup/mrow/no-spacing.html` | 0/54 | **51/54** | 🟢 |
| `presentation-markup/operators/mo-lspace-rspace-5.html` | 0/48 | **40/48** | 🟢 |
| `presentation-markup/operators/operator-dictionary-multi-char.html` | 0/20 | **20/20** | ✅ |
| `presentation-markup/mrow/legacy-mrow-like-elements-001.html` | 0/16 | **16/16** | ✅ |
| `presentation-markup/spaces/space-like-003.html` | 0/15 | **15/15** | ✅ |
| **realm total (246-file probe)** | **719/3407** | **2850/3409** | **+2131** |

Outside the realm, from #619 alone:

| Test | Before | After |
|---|---:|---:|
| `css/css-logical/logical-box-margin.html` | 4/44 | **28/44** |
| `css/css-logical/logical-box-padding.html` | 4/44 | **28/44** |
| `css/css-logical/logical-box-border-width.html` | 2/44 | **28/44** |
| `css/css-logical/logical-box-inset.html` | 4/44 | **28/44** |
| `css/css-logical/logical-box-size.html` | 3/93 | **63/93** |

(These five still read TIMEOUT — they sweep many writing modes and outrun the
harness budget; the counts above are the partial scores at the timeout, measured
identically before and after by disabling the mapping and rebuilding.)

## Caps — named honestly

These are not failures to chase; they are the shape of what this engine can do
today.

- ⛔ **This is not MathML layout.** It is an honest approximation that maps each
  MathML box onto the CSS box that behaves most like it: grouping and scripted
  elements are baseline-aligned flex rows, fractions and under/over scripts are
  flex columns, tables keep the CSS table displays the spec itself gives them.
  There are **no fraction bars**, the radical is a character rather than the
  stretchy glyph construction, and scripts are not raised or lowered by the
  font's MATH table. Those need the real algorithms and a MATH-table-aware font
  stack.
- ⛔ **`display: math` does not parse.** Stylo in the Servo configuration has no
  `math` inner display type, so an author rule `display: math` (which two tests
  use to override the UA sheet's `semantics > :not(:first-child) { display:none }`)
  is dropped as invalid. Worth ~4 rows in `all-mathml-containers`.
- ⛔ **`position: fixed` is not viewport-relative.** `stylo_taffy` maps
  `Position::Fixed` to Taffy's `Absolute`, so a fixed element is laid out against
  its ancestor chain: `left: 100px` lands at **108px** on a page with the default
  body margin. This is engine-wide, not MathML — it is every sticky header, modal
  and toast on the web — and it costs ~24 rows in `all-mathml-containers` alone.
  **This is the biggest single thing this arc found and did not fix.**
- ⛔ **Embellished operators do not filter out-of-flow children.** The core-operator
  walk runs in the presentational-hint pass, where the children's computed styles
  do not exist yet (see #623 for the same problem solved for stacking, in the
  style flush). ~14 rows across `embellished-operator-001/002/003`.
- ⛔ **The operator dictionary is not implemented.** Explicit `lspace`/`rspace`
  attributes work; the *default* spacing an operator gets from its category
  (MathML Core Appendix B, 716 entries) does not. `mo-lspace-rspace-1..4`.
- ⛔ **Font-driven geometry is out of reach**: `displaystyle-1/2/3`,
  `frac-parameters-*`, `subsup-parameters-*`, `cramped-*` and the `underover-
  parameters-*` files all measure against test fonts with MATH tables
  (`superscriptshiftupcramped5000` and friends). ~120 subtests.
- ⛔ **`contain: size` / `contain-intrinsic-*-size`** is not modelled
  (`size-containment-001.tentative` 0/44).
- ⛔ The realm's other ~350 files are **reftests**, which this campaign still
  cannot score (frontier quest **F7**).

## Next

1. ⭐⭐⭐ **`position: fixed` against the viewport** (see the cap above) — the
   widest tail this arc turned up, and it is not a MathML fix.
2. ⭐⭐ **The operator dictionary** — Appendix B is a compact encoded table
   (236 ranges); decoding it gives every operator its default spacing and the
   `stretchy`/`largeop`/`symmetric`/`movablelimits` properties, and it is what the
   `operators/` directory's 58 files are mostly about.
3. ⭐ Move the **embellished-operator** walk into the style flush beside #623, so
   it can see computed styles and filter out-of-flow children.
4. ⭐ **`display: math`** — needs an inner display type stylo does not compile
   here; the cheapest honest route is probably to stop expressing the
   `semantics`/`maction` first-child rule in CSS at all.
5. A **fraction bar** (`mfrac`'s line) and `linethickness` — the single most
   visible thing still missing from a rendered formula.
6. Carried from the previous arc: a real `EventTarget` interface (it is `Node`
   here), `<frameset>` parsing, `javascript:` URLs, `@container` in the render
   path (carried 7×).

## The zero-regression ritual

508-line ritual list, **341 scored rows**, run twice on two binaries built from
the same tree (stash → build → keep the binary → unstash → build), sharded 8 ways:

```
base: 55226/55789   new: 55280/55849   (+54)
```

Two rows flagged by the diff, both proven not to be regressions:

- `IndexedDB/keygenerator.any.html` 21/21 → could-not-run — **21/21 solo on the
  NEW binary**. A chunk victim.
- `.../the-img-element/naturalWidth-naturalHeight-width-height.html` 228 → 216 —
  the documented flaky file. Solo on the **base** binary, three runs: **226, 184,
  215**; solo on the new binary: **193**. A ±40 band on the same binary; the row
  carries no signal at this granularity.

⚠️ **The kill-by-name trap bit again, and the handoff had warned about it.**
`pkill -f 'obscura serve'` does not match a server started from a renamed copy
(`obscura-base serve`), so the base server silently failed to bind and the first
two "base" measurements were of the NEW binary. Kill by port (`fuser -k
9222/tcp`) whenever two binaries are in play — and check the server log for
`Address already in use` before believing an A/B number.
