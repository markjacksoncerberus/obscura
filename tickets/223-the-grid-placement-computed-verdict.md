# Quest #223 — The Grid-Placement Computed Verdict

**Realm:** `css/css-grid/parsing/`
**Result:** `grid-area-computed` 16→35 (100%). **+19, ZERO regressions.**
**Session:** 2026-07-18

## The gap

Took #222's next-leverage (a NEW `css/*/parsing/` dir). Baselined `css/css-grid/parsing/` —
most of the dir is already green (the `<grid-line>` specified canon + shorthand serialization
landed in earlier quests). Two `-computed` files stood short:

- `grid-area-computed` **16/35** — a clean, self-contained vein (this quest).
- `grid-template-columns-computed` **12/25** — needs REAL grid track LAYOUT
  (`repeat(auto-fill/auto-fit, …)` expansion depends on the container size,
  `100% … 300%`→`1px … 3px` resolves `%` against a fixed-size container). **Unwinnable** for
  us right now — NOT a raw-store gap.

`grid-area-computed`'s 19 fails had two roots:

1. **The placement shorthands were unregistered in computed style.** `grid-area`, `grid-row`,
   and `grid-column` were not in `_CSS_KNOWN_PROPS`, so `getComputedStyle(el)['grid-row']`
   reported *"grid-row doesn't seem to be supported in the computed style"* for every value.

2. **The `<grid-line>` longhands never folded an integer math function.** `grid-*-start`/`-end`
   passed their (canonical) specified value through the generic computed path verbatim, so
   `calc(1.1) -a-` stayed `calc(1.1) -a-` (want `1 -a-`), `span calc(-1)` stayed symbolic
   (want `span 1`), and a `sign(2cqw…)` gate never collapsed.

## The fix (`crates/obscura-js/js/bootstrap.js`)

**`_computeGridLine(el, v)`** (beside `_serGridArea`, ~13153) — computes one `<grid-line>`
longhand. The specified value is already canonical (`_canonGridLine`); computing additionally
folds any integer math function to a plain rounded integer:

```js
const _computeGridLine = (el, v) => {
  const s = String(v).trim();
  if (s.toLowerCase() === 'auto') return 'auto';
  const toks = _gridLineTokens(s);
  if (toks === null) return s;
  const span = toks.some((t) => t.toLowerCase() === 'span');
  const vp = _vpUnits();
  const out = toks.map((t) => {
    if (t.toLowerCase() === 'span' || _isGridIntLiteral(t) || !_MATHFN_NAME_RE.test(t)) return t;
    const n = _evalMath(t, 0, Object.assign(
      { lengths: true, angle: true, time: true, cqZero: true, emPx: _emPxOf(el), nonFinite: true }, vp, _siblingOpts(el, t)));
    if (n === null || !isFinite(n)) return t;   // unresolvable → keep symbolic
    let r = Math.round(n);
    if (span && r < 1) r = 1;                    // span integer clamps ≥1
    return String(r);
  });
  return out.join(' ');
};
```

- `cqZero: true` collapses an unresolved container unit inside a `sign(2cqw - 10px)` gate to
  its sign (no container ⇒ cqw = 0), so `calc(10 + (sign(2cqw - 10px)*5))`→`5`.
- `_siblingOpts` resolves `sibling-index()`, so `span calc(sibling-index() - 2)`→`span 1`.
- Literal integers, line-name `<custom-ident>`s (incl. escapes like `\31 st`), `span`, and
  `auto` pass through unchanged.

Dispatched near the top of `_normComputed`:

```js
if (_GRID_LINE_LH.has(kebab)) return _computeGridLine(el, v);
```

**Shorthand registration.** Added `grid-row`/`grid-column`/`grid-area` to `_CSS_KNOWN_PROPS`
(the `add(...)` block ~19212) and three getComputedStyle `resolve()` branches (after `flex-flow`)
that reconstruct the shorthand from the COMPUTED longhands via the existing serializers:

```js
if (kebab === 'grid-column' || kebab === 'grid-row')
  return _serGridColumnRow((ln) => resolve(ln), kebab === 'grid-column' ? 'column' : 'row');
if (kebab === 'grid-area') return _serGridArea((ln) => resolve(ln));
```

`_serGridColumnRow`/`_serGridArea` already re-drop the redundant elided lines (`_gridLineDefault`),
and `test_computed_value`'s array-form accepts either the collapsed or full form (`auto` /
`auto / auto`).

## Wins

| Test | Before | After |
|------|:------:|:-----:|
| `grid-area-computed.html` | 16/35 | **35/35** |

Sample subtests turned green: `calc(1.1) -a-`→`1 -a-`, `calc(10) -a-`→`10 -a-`,
`calc(10 + (sign(2cqw - 10px)*5)) -a-`→`5 -a-`, `span calc(-1)`→`span 1`,
`span calc(sibling-index() - 2)`→`span 1`, and every `grid-area`/`grid-row`/`grid-column`
shorthand now computes (`9 / -19 zA`, `2 j / span 3 k`, `auto / i / 2 j / span 3 k`, …).

## Zero-regression sweep

getComputedStyle-property-order 1/1 (the +3 registered shorthands didn't disturb enumeration),
qsa 1975, classlist 1420, flex-computed 14/14, animation-computed 15/15, transition-computed
10/10, tab-size-computed 10/10, grid-shorthand-valid 49/49, grid-shorthand-invalid 34/34,
grid-column-shorthand 48/48, grid-template-shorthand-valid 40/40, grid-auto-flow-computed 7/7,
grid-auto-columns-valid 30/30 — all held.

`grid-column-invalid`/`grid-row-invalid` stand at 29/2 each — pre-existing setProperty
validation edge cases (`first span 1 / last`, `3 first / 2 span last`), untouched by this
getComputedStyle-only change.

## Caps / Next

- **CAP:** `grid-template-columns-computed` 12/25 (and its `-rows` twin) need real grid track
  LAYOUT — `repeat(auto-fill/auto-fit)` expansion + `%`→px resolution against a sized
  container. Unwinnable without a grid layout engine.
- **CAP:** `grid-column-invalid`/`grid-row-invalid` 2 fails each — a `<custom-ident>` before
  `span` / name+int+span mixing edge case in the specified `<grid-line>` parser (a specified-path
  gap, not computed).

**NEXT LEVERAGE:** a NEW `css/*/parsing/` dir (css-grid placement is now clean; the tell is a
`-computed` file at 0/N = raw-store shorthand, OR a `-valid`/`-computed` canon gap since most
`-invalid` are already green). Candidates baselined but NOT yet worked:
- `css/css-ui/parsing/` — `cursor-computed` 36/39 (the 3 fails want `<image>`/gradient cursor
  values: `linear-gradient(…), auto` etc. — cursor grammar is `[<url>|<image>]* <keyword>`);
  `resize-computed` 5/6 (a `resize` value on `::before`/`::after` returns the wrong pseudo's
  computed value — looks like a pseudo-element computed-style bug, deeper than value parsing).
- `css/css-masking/parsing/` — `mask-composite`/`clip-rule` computed already 100%; baseline the rest.
- `filter-effects/`, `css/css-borders/` (no `parsing/` dir on wpt.live).

grep `_computeGridLine`.
