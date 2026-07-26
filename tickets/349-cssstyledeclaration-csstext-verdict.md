# The CSSText Verdict — Quests #349–#351

**Realm:** `css/cssom/cssstyledeclaration-csstext.html` — 7/11 → **11/11 (100%)**
**Bounty:** +4 subtests, ONE commit, ZERO regressions.
**Session:** 2026-07-26.

## The gap

The held file `cssstyledeclaration-csstext` had four fails whose caps were named in
its ledger row (Quest #60): unknown-property drop, per-property value validation,
logical-group shorthand collapse, computed-style `cssText`/`length`. One of those
("overwriting with invalid value") was actually already passing (`_isValidColor`
gates `color` in setProperty), so the four *live* fails were:

1. **uppercase property** — `style.COLOR = 'red'` → `getPropertyValue` reconstructed
   from an empty block returned `'-c-o-l-o-r: red;'`; expected `''`.
2. **invalid property does not appear** — `style.unknown = 'unknown'` stayed in cssText.
3. **logical groups** — interleaved `margin`/`margin-inline`/`margin-block` over-collapsed.
4. **computed cssText** — `getComputedStyle(el).length === 0` (failed the *first* assert)
   and `.cssText` echoed the inline block instead of `''`.

## The three quests (all JS, `bootstrap.js`)

### #349 — computed-style `cssText===""` + non-empty `.length`
The getComputedStyle Proxy exposed only custom-property names via
`_computedCustomPropNames` (so `.length` was 0 for a plain element), and delegated
`cssText` to the underlying inline declaration through the `prop in target` fallback
(so it echoed `color: red; …` instead of `''`).

- New module const `_COMPUTED_STD_NAMES = Object.keys(_GCS_DEFAULTS)` (kebab standard
  property names). `enumNames()` now returns `_COMPUTED_STD_NAMES.concat(custom props)`
  → `.length` is ~340, `.item`/indexed/iterator all populated.
- The Proxy `get` intercepts `cssText` → `''` **before** the `prop in target` delegation.
- **Safe for `get-computed-style-enumeration` (5/5):** that test does
  `Array.from(style).filter(n => n.startsWith("--"))`, so the added standard names are
  filtered out — the custom-property assertions are unchanged.

### #350 — logical-group-aware shorthand collapse
`_parseStyleDecls` expands `margin`/`margin-inline`/`margin-block` into longhands, but
the `cssText` setter stored each with `_props[name] = value` **without delete-first**,
so a re-declared longhand kept its *earlier* slot. The serialization adjacency rule in
`_serializeDeclBlock` then saw the longhands as contiguous and over-collapsed.

Fix: the `cssText` setter now `delete`s a re-declared property before re-inserting it,
so insertion order reflects last-write — matching CSSOM "set a CSS declaration" and the
setProperty path. For the test input, the stored order becomes
`mt, mr, ml, mis, mbs, mbe, mie, mb`, which serializes to exactly:
`margin-top …; margin-right …; margin-left …; margin-inline-start …; margin-block …;
margin-inline-end …; margin-bottom …;` (physical + margin-inline blocked by the
interleaving; only margin-block, whose start/end stayed adjacent, collapses).

### #351 — unknown properties → WebIDL expandos (NOT a setProperty gate)
Per WebIDL a `CSSStyleDeclaration` only exposes an IDL attribute for each *supported*
property; setting any other name (`style.COLOR`, `style.unknown`) creates a plain
expando — it never becomes a CSS declaration, so cssText is unaffected, yet it still
reads back (`style.foo='x'; style.foo → 'x'`, exactly like browsers).

The fix lives in the **`_styleProxy` set trap**, not `setProperty`:
```
known ∪ custom (--*) ∪ vendor (-webkit-/-moz-/…) ∪ already-stored  → setProperty
everything else                                                    → expando
```

**Why not gate `setProperty` itself?** The first attempt did, and regressed
`serialize-values` 695→676: `_CSS_KNOWN_PROPS` is *incomplete* (it lacked real
properties Obscura raw-stores — `page-break-*`, `baseline-source`, and many vendor
aliases), so gating the method dropped them. serialize-values sets values via
`elem.style.pageBreakAfter = v` and reads them back via the same proxy — the expando
approach round-trips them (assert passes) without touching the raw-store method path.

**`_CSS_KNOWN_PROPS` completion (required for correct proxy routing):** added the
border/outline/background/grid/grid-template/border-image/mask-border shorthands +
`image-resolution`/`line-clamp`/`animation-timeline` — all real properties Obscura
already supports (reconstructs/expands) but that were absent from the set, so
`CSS.supports` and the computed `has` trap under-reported them. Without this,
`el.style.border = '1px solid red'` would have wrongly become an expando.

**The "already-stored → setProperty" safety net** guarantees any property already in the
declaration is addressable by its IDL attribute (so `style.foo = ''` clears it even for a
raw-stored name absent from the set). This caught the `animation-timeline` regression:
`animation` expands into it, and the shorthand-testcommon helper clears each longhand via
`style[longhand] = ''` — without the net (and before adding animation-timeline to the
set) that clear became an expando and the longhand lingered (`animation-shorthand` 36→33).

## Zero-regression sweep

qsa 1975/1975, classlist 1420, cloneNode 135, serialize-values 695/697,
cssom-setProperty-shorthand 76, CSSStyleRule-set-selectorText 82, cssimportrule 11,
CSSKeyframesRule 2, CSSStyleSheet 17, register-property-syntax-parsing 246,
at-property-cssom 40, get-computed-style-enumeration 5/5, and the flex/grid/font/
list-style/place-content/gap/outline/scroll-margin/animation/transition shorthand
parsers (all baseline). **Stash-proved** getComputedStyle-detached-subtree 0/6 and
margin-computed 7/8 (margin:30%→60px percentage resolution) are pre-existing.

## Caps / Next

- **CAP:** none in this file (100%). getComputedStyle-detached-subtree (0/6, needs
  rendered-ness/flat-tree) and margin percentage→px resolution stay layout-capped.
- **NEXT LEVERAGE:** re-baseline other `css/cssom/` object realms (a PARTIAL file is
  the tell — many are one primitive from a flood), OR scout a fresh `css/*/parsing/` dir.
- **Reusable:** the `_styleProxy` expando gate (unsupported IDL attribute → expando),
  the cssText-setter delete-then-reinsert (last-write ordering feeds the collapse
  adjacency rule), `_COMPUTED_STD_NAMES` (computed-style standard-property enumeration).
