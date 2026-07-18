# Quest #213 — The Animation-Range Computed Verdict

**Realm:** `css/css-animations/parsing/` (the `animation-range-{start,end}` computed files)
**Result:** +59 subtests, ZERO regressions. Session 2026-07-17.
**Lever:** #212's named cap — register the two range longhands in the computed-style
machinery and add a length-resolving computed serializer.

---

## The gap

#212 turned the `animation-range-{start,end}` **specified** values green but named a
single shared blocker for the rest: the two longhands were **not registered** in the
getComputedStyle machinery, so their `-computed` siblings failed wholesale with
*"animation-range-start doesn't seem to be supported in the computed style"*:

| File | Baseline | Kind |
|------|:--------:|------|
| `animation-range-start-computed.html` | **0/30** | unregistered property |
| `animation-range-end-computed.html` | **0/29** | unregistered property |

## The fix

Two small, additive changes in `bootstrap.js`:

1. **Register the initial values** — added `animation-range-start: 'normal'` and
   `animation-range-end: 'normal'` to `_GCS_DEFAULTS` (~8623, beside the `animation-*`
   longhands). `_CSS_KNOWN_PROPS` and `_initialOf` derive from that map, so both
   properties become computed-supported (`getComputedStyle(el).animationRangeStart`
   now resolves) and `initial` computes to `normal`.

2. **A computed serializer** — `_computeAnimRange(v, el, isEnd)` beside `_normComputed`,
   dispatched from `_normComputed` for the two property names. The specified value is
   already canonicalized (names lowercased, default offsets dropped) by #212's
   setProperty helper; computing it additionally resolves each offset
   `<length-percentage>` through the existing length machinery `_trComp(tok, el, true,
   _vpUnits())` — em→px against the element font-size, calc folded, percentages kept —
   then re-applies the default-offset drop (0% for `-start`, 100% for `-end`), since
   folding can now surface the default.

Key computed resolutions (target `font-size: 10px`):
- `entry 1em` → `entry 10px`, `exit calc(1em + 10px)` → `exit 20px` (em resolved)
- `exit calc(41% + 1%)` → `exit 42%` (pure-% calc folded and unwrapped)
- `contain calc(10% + 10px)` → `contain calc(10% + 10px)` (mixed %+length kept symbolic)
- `cover 0px` → `cover 0px` (a length `0px` ≠ the `0%` default → kept)
- `COVER 100%` → `cover 100%`, `COVER 0%` → `cover` (name lowercased, default dropped)

## Results

| File | Before | After |
|------|:------:|:-----:|
| `animation-range-start-computed.html` | 0/30 | **30/30** |
| `animation-range-end-computed.html` | 0/29 | **29/29** |

**+59 subtests.**

## Zero-regression sweep

- qsa 1975/1975
- `getComputedStyle-property-order` 1/1 (the computed-style enumeration order — the
  main risk of adding two enumerable properties — is intact)
- `computed-style-001/002/003` at their **pre-existing** baselines (2/4, 0/1, 0/1) —
  stash-proved identical with the change reverted, so NOT a regression
- every `animation-*` computed at its #211 baseline: name-computed 26/27,
  animation-computed 14/15, duration-computed 11/15
- all five #212 `animation-range-*` specified files still 100% (invalid 11+14,
  valid 26+24, shorthand 56/133)

## Caps / Next

- **CAP — the `animation-range` shorthand's computed rows (77 fails in
  `animation-range-shorthand.html`).** These are unblocked only by full
  **shorthand → longhand expansion**: (1) add `animation-range:
  [animation-range-start, animation-range-end]` to `_SHORTHAND_LONGHANDS` (~8646);
  (2) an `_expandShorthand('animation-range', v)` that splits each comma item into its
  start/end longhand values (reusing #212's `_splitAnimRangeSide`); (3) a getComputedStyle
  `resolve()` branch reconstructing `animation-range` from the computed longhands (like
  `overflow`/`mask`). **TENSION to resolve carefully:** #212's specified-value wins rely
  on `animation-range` being stored/serialized directly; switching to expansion means the
  `.style['animation-range']` shorthand getter AND `.style['animation-range-start']` must
  reconstruct/expand without regressing those 56 green subtests. Scope tight + stash-prove.
  That is **Quest #214** (~77 subtests).
- **NEXT LEVERAGE:** Quest #214 (the shorthand-computed expansion above), OR
  `animation-timeline` (`auto | none | <dashed-ident> | scroll()/view()` — likely under
  `css/scroll-animations/`, NOT this dir; baseline first), OR a NEW `css/*/parsing/` dir
  (baseline `*-invalid` 0/N for the raw-store tell). grep `_computeAnimRange`.
