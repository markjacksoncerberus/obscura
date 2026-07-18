# Scroll 92 — The Segmented Verdict

> *The chart was drawn (#91), but one road on it was never paved: `shape()`, the
> segment-by-segment path of CSS Shapes 2. This quest paves it.*

**Realm:** `css/motion/parsing/offset-path-shape-parsing.html`,
`css/motion/parsing/offset-path-shape-computed.html`
**Status:** ✅ SECURED — **+27** (parsing 17→35, computed 3→12, both 100%).
**Session:** 2026-06-24. Pure JS, no new Rust.

> ⚠️ **Path note:** the `offset-path-shape-*` files in `css/motion/` (root) are all
> **reftests** (`-ref.html` counterparts → need real layout/render, unwinnable for
> us). The parsing/computed harness tests live under **`css/motion/parsing/`**.

## The gap

Quest #91 built the full `offset-path` grammar but intentionally left `shape()` (CSS
Shapes 2) as a verbatim pass-through (`_serOffsetPath` short-circuited `fn.head ===
'shape'` → returned the value unchanged). Consequences:

- **Parsing 17/35** — only the valid rows already in canonical form passed; rows
  needing normalization (`nonzero` fill-rule drop, arc `small`/`rotate 0deg` drop,
  whitespace collapse) failed, and **every invalid `shape()` was wrongly accepted**
  (the short-circuit returned a non-null value, so `_isValidOffsetPath` said true).
- **Computed 3/12** — only the no-normalization cases survived; nothing resolved
  `em`/`rem`/`pt`→px or arc `rotate`→deg.

## The grammar (CSS Shapes 2 §shape-function)

```
shape() = shape( <fill-rule>? from <coordinate-pair>, <shape-command># )

<shape-command> = move <endpoint> | line <endpoint>
                | [hline | vline] <by|to> <length-percentage>
                | curve <endpoint> with <control-point> [/ <control-point>]?
                | smooth <endpoint> [with <control-point>]?
                | arc <endpoint> [of <lp>{1,2}] <arc-sweep>? <arc-size>? [rotate <angle>]?
                | close
<endpoint>        = <by|to> <coordinate-pair>
<coordinate-pair> = <length-percentage>{2}
<control-point>   = <position>           // so `with 10rem center` is valid
<arc-sweep> = cw | ccw   (default ccw)   <arc-size> = large | small   (default small)
```

Each `<shape-command>` is its **own top-level comma section**; the `from` clause
(with an optional leading `<fill-rule>`) is the first section.

## What was built (`crates/obscura-js/js/bootstrap.js`)

A single new `head === 'shape'` branch in `_opShape`, plus deletion of the one-line
`if (fn && fn.head === 'shape') return v;` short-circuit in `_serOffsetPath` so
shape() now flows through the same serializer as every other offset-path function.
Everything composes on primitives #91 and earlier already provided:

- **`<coordinate-pair>`** (`from`, and the `by|to` endpoints of move/line/curve/
  smooth/arc) — exactly two tokens, each `_isPosLP`, serialized via `_opLp`
  (specified `_canonLPToken`, computed `_posComputeLen` → em/rem/pt→px, `%` symbolic).
  Negatives allowed (`from 1ch -50px, line to -10% 12px`).
- **hline / vline** — `<by|to>` + a single `<length-percentage>`.
- **`<control-point>` (the `with` value)** — a full `<position>`, routed through the
  existing `_serializePositionSpecified` / `_serializePositionComputed`. This is why
  `with 10rem center` is valid and `with 10rem 1% 12px` (3 lengths, no keyword) is
  rejected. Curve allows `with <cp> [/ <cp>]?` (split on a `/` token); `smooth`'s
  `with` is optional, `curve`'s is required.
- **arc** — `of <lp>{1,2}` (1 *or* 2 radii: `of 20%` and `of 10px 10px` both valid),
  then `<arc-sweep>?` (`cw|ccw`), `<arc-size>?` (`large|small`), `[rotate <angle>]?`
  in that fixed order; any leftover token → invalid.
- **Default elision** (both specified and computed): the `nonzero` fill-rule, arc
  `ccw`, arc `small`, and arc `rotate 0deg` are all dropped. `rotate`'s angle is
  evaluated via `_evalMath(rot, {angle:true})` — `0` → elided; non-zero computed →
  `_serAngle(deg)`, non-zero specified → the canonical original token.

## Why it's safe (purely additive)

- **No shared primitive touched** — the branch only *reads* `_isPosLP`, `_opLp`,
  `_parsePosition`, `_serializePosition*`, `_evalMath`, `_serAngle`,
  `_canonStandardValue`, `_canonMathExpr`. None are modified.
- The removed short-circuit only ever returned `shape()` values verbatim; every other
  offset-path value already bypassed it. So non-shape offset-path is byte-identical.
- The structural guards make all 15 invalid rows fall out naturally (empty body,
  `from` with no/short coordinate pair, trailing token after `close`, `byy`, `via`,
  a 3-length control point, a missing command, …).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `offset-path-shape-parsing` | 17/35 | **35/35** |
| `offset-path-shape-computed` | 3/12 | **12/12** |

**+27 total.**

## Zero-regression sweep (all held)

offset-path-parsing-valid 70/70, -invalid 24/24, -computed 65/65, offset-rotate-computed
5/5, offset-distance-computed 6/6, background-position-valid 31, transform-valid 42,
scale-parsing-valid 32, color-computed-relative 1163/1169, classlist 1420,
calc-serialization 0/1 (standing cap, unchanged).

## Caps / Next

- **Zero caps** — both shape() tests 100%.
- **The `offset` shorthand** (`offset-path-shorthand` valid 13/29, invalid 0/13) —
  composes offset-position / path / distance / rotate / anchor into the one
  `offset` property (`<offset-path> [<offset-distance>]? [<offset-rotate>]? [/ <offset-anchor>]?`,
  with an optional leading `<offset-position>`). All the sub-grammars now exist;
  this is assembly + the `/` anchor split.
- Standing colour leverage (light-dark()/var()/sibling-index() computed) or a fresh
  realm.
