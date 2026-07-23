# Quest #260 — The Position-Try Verdict

**Realm:** `css/css-anchor-position/parsing/` (CSS Anchor Positioning 1)
**Bounty:** +36, ZERO regressions — **completes the css-anchor-position arc (#258–#260, +146)**
**Date:** 2026-07-22

## The gap

The final property in the `css/css-anchor-position/parsing/` arc: the `position-try`
shorthand, unregistered/raw-store.
- `position-try-parsing` 8/35
- `position-try-computed` 0/9

## The grammar

`position-try = <'position-try-order'>? <'position-try-fallbacks'>`. The optional order
keyword (`normal | most-width | most-height | most-block-size | most-inline-size`)
appears ONCE at the very start, before the (required) fallbacks list. Serialization
drops the order when it is the `normal` initial (`normal none` → `none`, `normal --foo`
→ `--foo`).

The invalid cases all pin down that the order keyword is a single leading token, not a
per-item prefix:
- `none normal` — order after fallbacks
- `flip-block most-height` — order keyword mid-value
- `most-height, flip-start` — order alone, fallbacks would start empty
- `normal --foo, most-width --bar` — a per-item order keyword

In every case the stray order keyword ends up inside the fallbacks grammar (which
rejects `most-*`/`normal` as fallback tokens), so a single strip-then-validate pass
handles them all.

## The work (all `bootstrap.js`)

- **`_expandPositionTry(value)`** → `{position-try-order, position-try-fallbacks}` or
  null. Whitespace-tokenizes the first comma-item; if its first token is a
  `position-try-order` keyword (reusing `_CSSUI_ENUM['position-try-order']`), consumes
  it as the order and strips it from the item; then validates the remainder via
  `_canonPositionTryFallbacks` (#259) — an empty remainder (order-only) is invalid.
- **`_serPositionTry(order, fallbacks)`** → drops the order at its `normal` initial.

Wired exactly like the `flex-flow` shorthand across all six touch points: the inline
`_parseStyleDecls` parser, `setProperty`, `removeProperty`, `getPropertyValue`, the
`getComputedStyle` resolver, and `_CSS_KNOWN_PROPS`. The shorthand expands eagerly into
its two longhands (never storing a `position-try` key except for a CSS-wide/var blob);
the getter and computed path reconstruct from the longhands.

## Results

Both files → 100% (position-try-parsing 8 → 35, position-try-computed 0 → 9). **+36.**

**The whole `css/css-anchor-position/parsing/` dir is now 220/220 (100%)** — 10 files,
+146 across quests #258 (enums + idents), #259 (fallbacks), #260 (shorthand).

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697 (2 pre-existing),
flex-flow-shorthand 6/6, flex-flow-valid 7/7 (the shorthand infra I mirrored is
intact), order-valid 3/3, grid-template-columns-valid 34/34,
transition-shorthand 18/18.

## Caps / Next

`css/css-anchor-position/parsing/` is FULLY SECURED. **NEXT LEVERAGE: a NEW
`css/*/parsing/` dir.** Note the sibling `anchor-name`/`position-anchor`/`position-area`
properties have their tests OUTSIDE `parsing/` (no standalone parsing files here). The
remaining known JS-value vein nearby is `css/css-overflow/parsing/webkit-box-computed`
14/20 (a `display: -webkit-box`/`-webkit-flex` computed-alias remap tangled with
line-clamp). The css-overflow/css-multicol `::scroll-button()`/`::column` veins are
SELECTOR-ENGINE quests (Rust `selectors` crate), a different quest type. grep
`_expandPositionTry` / `_canonPositionTryFallbacks`.
