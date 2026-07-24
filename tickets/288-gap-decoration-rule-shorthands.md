# Quests #288–#290 — The css-gaps `column-rule`/`row-rule`/`rule` gap-decoration shorthands

**Session 2026-07-24 · +79 · ZERO regressions**

## The gap

CSS Gap Decorations (`css-gaps`) extends the multicol `column-rule` — and adds
`row-rule` + the bidirectional `rule` — to accept the full **`<gap-rule-list>`**:

```
<gap-rule-list>     = <gap-rule-or-repeat>#   (with an optional single auto-repeat)
<gap-rule-or-repeat>= <gap-rule> | repeat( <integer [1,∞]> , <gap-rule># )
<auto-repeat>       = repeat( auto , <gap-rule># )     (at most ONE per list)
<gap-rule>          = [ <line-width> || <line-style> || <line-color> ]   (border-side)
```

Each axis shorthand transposes its list into the **three parallel list longhands**
`{axis}-rule-width` / `-style` / `-color` (which already spoke `<gap-rule-list>` via
`_canonGapRuleList` / `_computeGapRuleList` from an earlier quest). `rule` sets both
axes.

Baseline (raw-store — the shorthands weren't wired to the list grammar):

| file | before | after |
|------|:------:|:-----:|
| `gap-decorations-rule-shorthand-invalid` | 11/27 | **27/27** |
| `gap-decorations-rule-shorthand-valid`   | 48/75 | **75/75** |
| `gap-decorations-rule-shorthand-computed`| 3/39  | **39/39** |

Pre-existing state: `column-rule` was a multicol **single-value** `_BORDER_EXPAND`
shorthand; `row-rule` was unregistered; `rule` had only a dead single-value computed
branch. The ~48 valid passes were the handful of single-`<gap-rule>` column-rule/rule
cases; every `repeat()`/comma-list form failed.

## The engine (one shared mechanism, near `_serGapBidiSh`)

- **`_GAP_RULE_SH`** — `column-rule`→3 longhands, `row-rule`→3, `rule`→6 (both axes).
- **`_parseGapRuleShorthand(value)`** — parse a `<gap-rule-list>` → `{width, style,
  color}` (three canonical leaf-list strings, identical structure), or null. Each
  `<gap-rule>` goes through the existing `_parseBorderSideStrict` (dup-leaf rejection,
  omitted→initial). `repeat()` count via `_canonColumnCount` (rejects `0`/`-1`);
  `auto` counted, `>1` auto-repeat → null.
- **`_expandGapRuleShorthand(name, value)`** — `_parseGapRuleShorthand` → the 3 (or 6)
  stored longhands.
- **`_joinGapRule(w, s, c, computed)`** — serialize ONE `<gap-rule>`. Specified mode:
  drop each at its initial (`medium`/`none`/currentcolor), all-initial→`medium`.
  Computed mode: always print width+color, style only if ≠`none` (matches multicol
  column-rule computed).
- **`_splitGapLeafList` / `_serGapRuleShorthand` / `_serGapRuleSh`** — ZIP the three
  parallel leaf-lists back into a `<gap-rule-list>`, bailing to `''` when the
  structures don't align (longhands set separately → unrepresentable). `rule` also
  requires the two axes to agree on all three lists.

## Wiring (6 touch points, mirroring `_BORDER_EXPAND`)

1. **setProperty** — expand into stored longhands (single-value `column-rule` left on
   the multicol path via the `!(name==='column-rule' && !_isGapList)` gate → BYTE-
   IDENTICAL, zero multicol risk).
2. **removeProperty** — clear the group's longhands.
3. **getPropertyValue** — `_serGapRuleSh(get, key)` (specified).
4. **computed resolve** — `_serGapRuleSh(resolve, kebab, true)` (replaced the two old
   single-value `column-rule`/`rule` branches).
5. **CSS.supports** — validate via `_parseGapRuleShorthand`.
6. **`_expandShorthand`** (cascade/inline-attr path) + `_CSS_KNOWN_PROPS` `add('row-rule')`.

## The computed subtlety (last 3 fails)

`column-rule: dotted` computed expected `<mediumWidth> dotted rgb(0,255,0)` — the
width MUST always print at computed time (the test reads `mediumWidth` from a
reference and builds the expectation from it). The initial-dropping `_joinGapRule`
wrongly dropped `medium`. Fix: a `computed` flag → computed always prints width+color,
style-if-not-`none`.

## Zero-regression sweep

qsa 1975, classlist 1420, multicol column-rule-valid 5/5 · -computed 6/6 ·
-width-computed 3/3 · -color/-style-computed green, gap-decorations-color/width/style-
computed 33/24/63, bidirectional-shorthands 14/14, rule-inset-computed 45/45,
rule-inset-shorthand 100/100, rule-break-shorthand 9/9, columns-computed 27/27.
`border-color-computed` 4/8 = a PRE-EXISTING multi-value computed-color cap (stash-
verified identical without the change), NOT a regression.

## Caps / Next

- **BONUS:** `gap-decorations-rule-shorthand-from-longhands.tentative` now **16/16**
  (reading the shorthand back from separately-set longhands — the zip serializer).
- **CAP:** `gap-decorations-rule-shorthand-roundtrip.tentative` **0/3** — expects the
  computed shorthand to round-trip through `el.style`, which needs `column-rule-width`
  / `row-rule-width` to compute the `medium`/`thin`/`thick` **keyword to px** (we keep
  the keyword). That's a broader line-width computed change with real regression
  surface (`gap-decorations-width-computed` 24/24, border-width computed) — a
  dedicated quest, deliberately NOT taken here.
- **NEXT LEVERAGE:** a NEW `css/*/parsing/` dir. The css-align `justify-items: legacy`
  computed vein (~4 subtests) is a small standalone quest: bare `legacy` computes to
  the **inherited** value if it contains `legacy`, else `normal` — needs a
  `_normComputed` `justify-items` branch that walks `el.parentElement`'s computed
  justify-items, plus flipping the `justify-items` initial default from `legacy center`
  to `legacy` so an unstyled ancestor terminates the chain at `normal`
  (`justify-items-computed.html` / `place-items-computed.html`).
- **Templates:** shorthand-into-parallel-lists = `_GAP_RULE_SH`/`_parseGapRuleShorthand`;
  enum = `_CSSUI_ENUM`; sizing grammar = `_isValidSizeValue`. grep `_parseGapRuleShorthand`.
