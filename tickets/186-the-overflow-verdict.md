# Scroll 186 — The Overflow Verdict ⚔️

> *The CSS Overflow value-parsing props — the `overflow` shorthand, its logical/
> physical longhands, overflow-clip-margin, scrollbar-gutter, block-ellipsis,
> max-lines, continue, and -webkit-line-clamp.*

**Realm:** `css/css-overflow/parsing/` (the value-parsing props)
**Quest:** #186 The Overflow Verdict
**Result:** **+120 subtests, ZERO regressions.** Value-parsing props 76/196 → **196/196**.

---

## The gap

With the css-fonts realm finished (#183→#185), the next-widest untouched
`css/*/parsing/` vein was `css/css-overflow/parsing/`. Same root cause as every
quest since #179: the css-overflow longhands stored their value **RAW** in
`setProperty` (no grammar check), so every `*-invalid` scored 0/N, keyword
combinations were never reordered to canonical order, and the computed forms were
missing entirely.

Baseline (18 value-parsing test files, 196 subtests → 76 passing):

| Test | Before |
|------|:------:|
| overflow-valid | 15/18 |
| overflow-invalid | 0/6 |
| overflow-computed | 25/34 |
| text-overflow-valid | 4/5 |
| text-overflow-computed | 4/5 |
| block-ellipsis-invalid | 0/11 |
| scrollbar-gutter-valid | 3/4 |
| scrollbar-gutter-invalid | 1/26 |
| overflow-clip-margin | 7/25 |
| overflow-clip-margin-computed | 0/20 |
| max-lines-valid | 4/5 |
| max-lines-invalid | 0/8 |
| continue-invalid | 0/9 |
| webkit-line-clamp-invalid | 0/7 |

---

## The work (all pure JS in `crates/obscura-js/js/bootstrap.js`)

A self-contained **css-overflow value engine** — `_canonCssOverflow(name, value)`,
dispatched via `_OVERFLOW_VALIDATED` in the setProperty else-if chain (ahead of the
`_COLOR_PROPS` branch) and in the `CSS.supports` validity path. A `null` return
means "invalid → ignore the declaration" (CSSOM). CSS-wide keywords + var()/env()
pass through untouched.

**Longhand grammars validated + canonicalized:**
- **overflow-x/-y/-block/-inline** — one keyword from `visible | hidden | clip | scroll | auto`.
- **scrollbar-gutter** — `auto | stable && both-edges?`; `both-edges stable` reorders to
  `stable both-edges`; everything else (`auto both`, `force`, lengths, …) rejected.
- **block-ellipsis** — `no-ellipsis | ellipsis | <string>` (a single token; `none`/`auto`
  are *invalid* — the spec keyword set moved).
- **overflow-clip-margin** — `<visual-box> || <length [0,∞]>` via `_canonOCMLength` +
  `_serOverflowClipMargin`. The box is dropped when it is the default `padding-box`; the
  length is dropped when it is a **literal zero** AND a (non-default) box is present; when
  the box is default/absent the length is always shown (as `0px`). No `%` allowed (calc with
  `%` → invalid); a calc keeps its symbolic specified form (`calc(100px - 50px)`→`calc(50px)`)
  and is never treated as a literal zero. **Bug caught mid-dev:** `0px`/`0em` are not
  `_isZeroTok` (that helper is for *unitless* zero) — the literal-zero flag now checks
  `parseFloat(canon) === 0`, fixing `border-box 0px`→`border-box` and `0px content-box`→
  `content-box`.
- **continue** — `normal | discard | collapse | -webkit-legacy` (`_CONTINUE_KW`).
- **max-lines** — `auto || <integer [1,∞]>` (the integer serializes first: `auto 8`→`8 auto`).
- **-webkit-line-clamp** — `none | <integer [1,∞]>`.

**The `overflow` shorthand** `[ visible | hidden | clip | scroll | auto ]{1,2}` EXPANDS
into — and stores as — overflow-x (first value) / overflow-y (second, or a copy)
(`_parseOverflowShorthand`, the scroll/font-shorthand model). A CSS-wide keyword sets both
longhands. The getter (`getPropertyValue('overflow')`) and `removeProperty` check a raw
`overflow` key **first** (the style-attribute / cssText path stores the shorthand
un-expanded), then reconstruct from the longhands via `_serializeOverflowShorthand`
(collapse to one value when both axes are equal).

**Computed (`_normComputed` + the getComputedStyle `resolve`):**
- The overflow **visible↔auto coupling**: a `visible` axis computes to `auto` when the OTHER
  axis is a scrolling keyword (`hidden`/`scroll`/`auto`); `clip` and the scrolling keywords
  are unchanged. Read via the counterpart's SPECIFIED value (`_specifiedDecl`) — never itself
  `visible` while this axis is — so there is no recursion into `_normComputed`.
- `getComputedStyle(el).overflow` reconstructs from the (coupled) computed overflow-x/-y.
- **overflow-clip-margin** resolves the length to absolute px (`_trComp`, calc folded, clamp
  ≥0, em = 16px) and re-serializes with the same box-drop / zero-length-drop rule.

**Shared change:** made `_wsTokens` **quote-aware** — a `"…"`/`'…'` string with an internal
space (e.g. `text-overflow: "marker string"`, `block-ellipsis: " etc. "`) now tokenizes as a
single token instead of splitting. This also fixed the last text-overflow-valid/-computed
subtest. (Strict improvement — no correct CSS grammar wants a string split; swept broadly.)

**Registration:** `overflow-clip-margin`(`0px`) + `-webkit-line-clamp`(`none`) added to
`_GCS_DEFAULTS`; `overflow` added to `_CSS_KNOWN_PROPS`. (overflow-x/-y/-block/-inline,
scrollbar-gutter, block-ellipsis, continue, max-lines were already registered; block-ellipsis
already inherits.)

---

## Results

| Test | Before | After |
|------|:------:|:-----:|
| overflow-valid | 15/18 | **18/18** |
| overflow-invalid | 0/6 | **6/6** |
| overflow-computed | 25/34 | **34/34** |
| text-overflow-valid | 4/5 | **5/5** |
| text-overflow-invalid | 3/3 | 3/3 |
| text-overflow-computed | 4/5 | **5/5** |
| block-ellipsis-valid | 3/3 | 3/3 |
| block-ellipsis-invalid | 0/11 | **11/11** |
| scrollbar-gutter-valid | 3/4 | **4/4** |
| scrollbar-gutter-invalid | 1/26 | **26/26** |
| overflow-clip-margin | 7/25 | **25/25** |
| overflow-clip-margin-computed | 0/20 | **20/20** |
| max-lines-valid | 4/5 | **5/5** |
| max-lines-invalid | 0/8 | **8/8** |
| continue-valid | 4/4 | 4/4 |
| continue-invalid | 0/9 | **9/9** |
| webkit-line-clamp-valid | 3/3 | 3/3 |
| webkit-line-clamp-invalid | 0/7 | **7/7** |
| **Total** | **76/196** | **196/196 (+120)** |

**Zero regressions** — held realms all at their memorized values: qsa 1975, classlist 1420,
Element-matches 669, createElement 147, url-origin 406/413, serialize-values 696/697 (see the
mid-dev catch below), css-fonts font-valid 315/315 + font-computed 315/315 + font-variant-invalid
21/21 + font-feature-settings 10/5/10, css-text text-indent 14/14 + word-spacing 9/9, css-ui
caret-color 12/12 + 15/15, css-align place-content 23/23, css-scroll-snap scroll-margin-shorthand
20/20, css-content content-valid 46/46.

**Mid-dev regression caught + fixed:** after adding the `overflow` shorthand expansion,
`serialize-values` dropped 696→691 — the `overflow` getter reconstructed from the longhands but
ignored a raw `overflow` key set via the style *attribute* (`setAttribute('style', 'overflow:
visible')`), returning `''`. Fixed by checking the raw key first (matching the scroll/font
shorthand pattern); restored to 696/697.

---

## Caps / Next

- **`line-clamp` shorthand** (12/18 valid, 0/7 invalid) — DEFERRED. It expands into three
  longhands (max-lines + block-ellipsis + continue), but its ellipsis component is
  `auto | ellipsis | no-ellipsis | <string>` and serializes DIFFERENTLY from `block-ellipsis`
  (`ellipsis`→`auto` alone; `ellipsis` dropped when an integer is present; `auto` kept). The
  messiest grammar in the realm — worth its own quest once the pattern is nailed down.
- **CSS-Overflow-5 carousel props** — the next in-realm vein, SAME `_canonCssOverflow`
  machinery: `scroll-buttons` (**0/37**), `scroll-axis-lock` (invalid/computed, 0/15),
  `scroll-target-group`, `getComputedStyle-scroll-button` (0/5). scroll-axis-lock-valid,
  scroll-markers-valid, scroll-target-group-valid already pass — only the invalid/computed
  tails are open.
- **`display: -webkit-box` → `flow-root` blockification** (webkit-box-computed, 14/20) — a
  computed-value rule for `display` when line-clamp/continue is active on a `-webkit-box`. All
  6 fails are `display:` assertions; a display-computed feature we lack, unrelated to value
  parsing.

**Grep tags:** `_canonCssOverflow` · `_OVERFLOW_VALIDATED` · `_parseOverflowShorthand` ·
`_serializeOverflowShorthand` · `_serOverflowClipMargin` · `_canonOCMLength` · `_CONTINUE_KW`.
