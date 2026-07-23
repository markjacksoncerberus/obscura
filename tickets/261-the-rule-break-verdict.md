# Quest #261 — The Rule-Break Verdict

**Realm:** `css/css-gaps/parsing/` (CSS Gap Decorations)
**Banner:** the `rule-break` family — `column-rule-break` / `row-rule-break` longhands + the `rule-break` bidirectional shorthand.
**Result:** +21, ZERO regressions.

## The gap
CSS Gap Decorations adds per-axis `column-rule-break` / `row-rule-break` longhands
(`none | normal | intersection`) plus a `rule-break` shorthand that sets BOTH to the
same value. All three were raw-store / unregistered:
- `rule-break-invalid` **0/12** — `auto`/`true`/`10px`/`default` all wrongly accepted.
- `rule-break-computed` **0/9** — the props were absent from getComputedStyle.
- `rule-break-valid` 9/9 — passed trivially via raw-store round-trip.

## The work (all `bootstrap.js`)
- **Enum longhands:** added `column-rule-break` / `row-rule-break` to `_CSSUI_ENUM`
  (`none | normal | intersection`) + `_CSSUI_VALIDATED` (reject `auto`/`true`/`10px`/
  `default` and any two-keyword combo) + `_GCS_DEFAULTS` (`none`, not inherited;
  computed = specified keyword identity).
- **Bidirectional shorthand infra (NEW, generic for the whole css-gaps `rule-*` set):**
  `_GAP_BIDI_SH` maps each `rule-*` shorthand → its `[column-*, row-*]` longhand pair.
  `_expandGapBidi(name, value)` validates the single value against the longhand grammar
  (via `_canonGapRuleLonghand` → `_canonCssUi` for the break enum) and returns
  `{column-*: canon, row-*: canon}` (same value in both), or null when invalid.
  `_serGapBidiSh(get, key)` reconstructs the shorthand from the two longhands: the value
  when both are present and EQUAL, else `''` (unrepresentable / mismatched — CSSOM
  "serialize a CSS value" for a disagreeing shorthand).
- **Wired across all six shorthand touch points** (mirroring `overflow`):
  inline `_parseStyleDecls` parser (eager expand into longhands), API `setProperty`
  (expand + store both longhands, CSS-wide keyword → both), `removeProperty` (clear both
  longhands), `getPropertyValue` (reconstruct), `getComputedStyle` resolver (reconstruct
  from computed longhands + `add('rule-break')` registration), and `CSS.supports`.

## Results
| File | Before | After |
|------|:------:|:-----:|
| `rule-break-invalid` | 0/12 | **12/12** |
| `rule-break-computed` | 0/9 | **9/9** |
| `rule-break-valid` | 9/9 | 9/9 (held) |

**+21.**

## Zero-regression sweep
qsa 1975, classlist 1420, serialize-values 695/697, column-rule-style-invalid 1/1,
column-rule-computed 6/6, columns-valid 24/24, clear-invalid 2/2, writing-mode-invalid 2/2.

## Caps / Next
The generic `_GAP_BIDI_SH` infra is deliberately built to carry the rest of the
`rule-*` family. **Next (#262):** the fat `gap-decorations-{color,style,width}`
`<line-*-list>` grammar with `repeat()`/`auto-repeat` — VALID + INVALID (~84 subtests:
each of color/style/width valid 31/45, invalid color/style 6/18, width 9/27). Extends
`column-rule-{color,style,width}` + adds `row-rule-{color,style,width}` longhands and
the `rule-{color,style,width}` shorthands into `_GAP_BIDI_SH`. Then **#263:** the
COMPUTED serialization (repeat kept, integer folded, each leaf resolved). grep
`_GAP_BIDI_SH`/`_expandGapBidi`/`_canonGapRuleLonghand`.
