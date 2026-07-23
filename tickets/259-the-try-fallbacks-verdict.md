# Quest #259 — The Try-Fallbacks Verdict

**Realm:** `css/css-anchor-position/parsing/` (CSS Anchor Positioning 1)
**Bounty:** +48, ZERO regressions
**Date:** 2026-07-22

## The gap

Continued the `css/css-anchor-position/parsing/` arc (#258 → this → #260). The
`position-try-fallbacks` property was raw-store/unregistered:
- `position-try-fallbacks-parsing` 33/57
- `position-try-fallbacks-computed` 0/24

## The grammar

`none | [ [<dashed-ident> || <try-tactic>] | <'position-area'> ]#`, a comma-separated
list of fallback items, where `<try-tactic> = flip-block || flip-inline || flip-start
|| flip-x || flip-y`.

Each comma-item is EITHER a dashed-ident-and-tactics run OR a `<position-area>` — the
two alternatives never mix (`--foo left`, `flip-start left`, `left --foo` are all
invalid). `none` is only ever the sole value (`none, flip-start` and `--foo, none`
both invalid).

Two subtleties the tests pin down:
1. **Contiguity in the tactics alt.** The `||` combinator makes each component appear
   at most once as a CONTIGUOUS unit. The single dashed-ident sits before OR after the
   flip-keyword run, never splitting it: `--bar flip-inline flip-block` and
   `flip-inline flip-block --bar` are valid, but `flip-inline --bar flip-block` is
   **invalid**. Serialization puts the dashed-ident first, then the flip keywords in
   **author order** (Chromium keeps the specified tactic order —
   `flip-start flip-inline flip-block` round-trips unchanged, NOT reordered to grammar
   order).
2. **`<position-area>` serialization.** `top left` → `left top` (the rank-0 / x /
   block axis serializes first), `start start` → `start` (an identical pair in the
   `{1,2}` start-group collapses to one keyword).

## The work (all `bootstrap.js`)

NEW `_canonPositionTryFallbacks` (dispatched from `_canonCssUi`), decomposing into:
- `_canonDashedTactic(toks)` — the `[<dashed-ident> || <try-tactic>]` alternative with
  the contiguity check (tactics may not straddle the dashed-ident) and dashed-first /
  author-order tactic serialization.
- `_canonPositionArea(toks)` — a full `<position-area>` validator/canon. Keywords are
  grouped by coordinate system (`physical` x/y, `logical` block/inline, `self`
  self-block/self-inline) with an axis rank (0 = first, 1 = second), plus the
  order-ambiguous `{1,2}` groups (`startsys` start/end, `selfstartsys`
  self-start/self-end) and the system-neutral `center`/`span-all`. Two definite
  keywords must share a system and occupy different axes (`left right` → invalid);
  serialize rank-0 axis first; a neutral fills the complementary axis; an identical
  pair collapses to one keyword.

Wired `_CSSUI_VALIDATED` + a `_canonCssUi` branch + `_GCS_DEFAULTS` (`none`, not
inherited). Computed = the stored canonical value (identity), so no `_normComputed`
branch is needed.

## Results

Both files → 100% (fallbacks-parsing 33 → 57, fallbacks-computed 0 → 24). **+48.**

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697 (2 pre-existing),
anchor-scope-parsing 17/17, position-visibility-parsing 30/30,
grid-template-columns-valid 34/34 (confirms the shared `_GRID_CI_RE` reuse is safe).

## Caps / Next

**NEXT (this arc, #260):** the `position-try` shorthand (`position-try-parsing` 8/35)
= `<'position-try-order'>? <'position-try-fallbacks'>`, its computed
(`position-try-computed` 0/9), plus the `position-anchor`/`position-area` longhands if
they surface. `_canonPositionArea` and `_canonPositionTryFallbacks` are reusable for
the shorthand's fallbacks half. grep `_canonPositionTryFallbacks` / `_canonPositionArea`.
