# Scroll 93 — The Composed Verdict

> *Five longhands were forged across #90, #91, #92. This quest binds them into the
> one shorthand that travellers actually write: `offset`.*

**Realm:** `css/motion/parsing/offset-parsing-valid.html`,
`css/motion/parsing/offset-parsing-invalid.html`,
`css/motion/parsing/offset-shorthand.html`
**Status:** ✅ SECURED — **+47** (valid 13→29, invalid 0→13, shorthand 0→18, all 100%).
**Session:** 2026-06-24. Pure JS, no new Rust.

> ⚠️ **Path note:** the `offset-*.html` files in `css/motion/` (root) are reftests
> (need real layout/render — unwinnable for us). The parsing/shorthand harness tests
> live under **`css/motion/parsing/`**.

## The gap

Quests #90–92 built every offset longhand (`offset-position`, `offset-path`,
`offset-distance`, `offset-rotate`, `offset-anchor`) but the `offset` *shorthand* was
never handled — it fell through to the verbatim-store path. Consequences:

- **`offset-parsing-valid` 13/29** — only inputs already in canonical form survived
  (`offset: auto`, `offset: path("…")`); anything needing recomposition failed.
- **`offset-parsing-invalid` 0/13** — a verbatim store accepts everything, so every
  malformed value was wrongly kept.
- **`offset-shorthand` 0/18** — `test_shorthand_value` reads each longhand
  (`div.style['offset-path']`, …); without expansion they were all empty.

## The grammar (CSS Motion 1 §6)

```
offset = [ <'offset-position'>? [ <'offset-path'> [ <'offset-distance'> ||
           <'offset-rotate'> ]? ]? ]! [ / <'offset-anchor'> ]?
```

The `[ … ]!` group must produce at least one value (so a bare `offset: 30deg` —
neither a position nor a path — is invalid). `<offset-distance>` and
`<offset-rotate>` may appear in either order but each at most once, and each must be
contiguous (so `reverse 100px 30deg`, which interleaves the rotate's keyword and angle
around the distance, is invalid; `reverse 30deg 50px` is fine).

## What was built (`crates/obscura-js/js/bootstrap.js`)

A self-contained module after the offset-path helpers; composes the #90–92 longhand
validators/serializers, no new Rust.

- **`_splitTopSlash(s)`** — split a value at its top-level `/` (paren/bracket/quote
  aware). >1 slash → `null` (invalid). Separates `before` from the optional
  `/ <offset-anchor>` tail. `none /` (empty anchor) and `/ left top` (empty `!`-group)
  both reject.
- **`_isOffsetPathStart(tok)`** — is this token the start of the `<offset-path>` region:
  `none`, a `ray|path|url|circle|ellipse|inset|polygon|xywh|rect|shape(` function, or a
  `<coord-box>` keyword (reusing `_COORD_BOX`). Everything in `before` ahead of the
  first such token is the `<offset-position>`.
- **`_parseOffsetDistRot(toks)`** — the `<distance> || <rotate>` tail. A
  `<length-percentage>` (`_isPosLP`) fills the distance slot once; a maximal
  `[auto|reverse] || <angle>` (1–2 tokens) fills the rotate slot once. Any token that
  fits neither (or a repeated slot) → `null`.
- **`_parseOffsetShorthand(value)`** — orchestrates the above, validates each piece with
  the existing longhand gates (`_isValidStrictPosition` for position/anchor,
  `_isValidOffsetPath`, `_isValidOffsetDistance`, `_isValidOffsetRotate`) and
  canonicalizes with their serializers (`_serializePositionSpecified`,
  `_canonOffsetPath`, `_canonOffsetDistance`, `_canonOffsetRotate`). Returns the five
  canonical longhand values, or `null`. A CSS-wide keyword / `var()` sets all five to
  the value verbatim.
- **`_serializeOffsetShorthand(decl)`** — the inverse. Requires all five longhands
  present with consistent priority (CSSOM "serialize a CSS value"), then elides parts at
  their initial value: `normal` position, `0px` distance, `auto`/`auto 0deg` rotate
  (`_offsetRotateIsInitial`), `auto` anchor, and a `none` path *unless* it must carry a
  trailing distance/rotate or stand as the only value before the `/`. The anchor renders
  as ` / <anchor>`. If all five are an identical CSS-wide keyword / `var()`, returns that.

### Storage model — expand, don't store the shorthand

Setting `offset` (via `setProperty` and `_parseStyleDecls`) writes **only the five
longhand keys** into `_props` — never an `offset` key. This is what makes
`test_shorthand_value`'s "should not set unrelated longhands" invariant hold: clearing
the five longhands removes exactly what the shorthand added. Reads recompose on demand:

- `getPropertyValue('offset')` → `_serializeOffsetShorthand(this)`.
- `removeProperty('offset')` → clears the five longhands (so `style.offset = ""` resets
  them, as `test_valid_value`/`test_shorthand_value` expect on their `= ""` preamble).
- The style proxy's `get('offset')` falls through to `getPropertyValue('offset')` (not a
  box shorthand), so `el.style.offset` works too.
- `offset` added to `_CSS_KNOWN_PROPS` → `CSS.supports('offset', …)` returns true.

## Why each invalid row falls out

| Input | Rejected because |
|-------|------------------|
| `30deg` | no path token → whole `before` parsed as position; `30deg` isn't a `<position>` |
| `auto 30deg 90px` | distance/rotate can't appear without a path; `auto 30deg 90px` isn't a position |
| `100px 0deg path('m 0 0 h 100')` | `100px 0deg` (before the path) isn't a valid position |
| `30deg path('M 20 30 A 60 70 80')` | `30deg` (before the path) isn't a valid position |
| `path(…) bottom` | `bottom` after the path is neither distance nor rotate |
| `path(…) 100px 0` | `0` (unitless) is neither a second distance nor an `<angle>` |
| `path(…) 100px 200px` | two distances |
| `path(…) 200% auto 100px` | distance, rotate, then a second distance |
| `path(…) auto reverse` | two rotate keywords |
| `path(…) reverse 100px 30deg` | rotate interleaved around the distance |
| `ray(sides 0) 50% 90deg auto` | `ray(sides 0)` is an invalid `<offset-path>` (`0` ≠ `<angle>`) |
| `none / 10px 20px 30deg` | anchor `10px 20px 30deg` isn't a strict `<position>` |
| `none /` | empty anchor after `/` |

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `offset-parsing-valid.html` | 13/29 | **29/29** |
| `offset-parsing-invalid.html` | 0/13 | **13/13** |
| `offset-shorthand.html` | 0/18 | **18/18** |

**+47.**

## Caps / Next

**Zero caps** — all three at 100%. **Zero regressions** (offset-path 70/24/65, shape
35/12, offset-rotate 7, offset-distance 4, offset-position 12/15, offset-anchor 11,
background-position 31, transform 42, scale 32, classlist 1420, createElement 147 held).

The offset realm is now fully secured (longhands #90–92 + shorthand #93). **Next
leverage:**
- The standing **colour** frontier: `light-dark()` computed, `var()`/`sibling-index()`
  computed resolution, and the hsl/hwb `none`-component structured storage cap (#79).
- Generalize `_canonSortedCalc`'s unit-ordering into the generic `_canonMathExpr` hot
  path (the `calc-serialization` 0/1 + `minmax-*-serialize` cap — its own quest, needs a
  careful hot-path regression sweep).
- A fresh realm — measure a baseline first (some "frontiers" are mostly reftests or
  could-not-run for harness reasons).
