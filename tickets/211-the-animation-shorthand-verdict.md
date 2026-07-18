# Quest #211 — The Animation Shorthand Verdict

**Realm:** `css/css-animations/parsing/` (the `animation` shorthand)
**Result:** +13 subtests, ZERO regressions. Session 2026-07-17.
**Lever:** #210's next-leverage — every per-component gate now existed; the shorthand
just needed the #209 `_parseSingleTransition`/`_serSingleTransition` template applied.

---

## The gap

With the eight `animation-*` longhands validated in #210, the `animation` **shorthand**
itself was still pure raw-store:

| File | Baseline | Kind |
|------|:--------:|------|
| `animation-invalid.html` | **0/8** | raw-store tell |
| `animation-valid.html` | 9/12 | 3 reorder/whitespace gaps |
| `animation-computed.html` | 12/15 | computed reconstruction |

`setProperty('animation', …)` stored the value verbatim, so junk like `1s 2s 3s`
(three `<time>`s), `-1s -2s` (negative duration), `steps(1) steps(2)` (two easings),
`1 2` (two iteration counts), and `reverse alternate alternate-reverse anim` (three
directions) all slid through, and author order was never canonicalized.

## The grammar

```
<single-animation> = <time> || <easing-function> || <time> ||
  <single-animation-iteration-count> || <single-animation-direction> ||
  <single-animation-fill-mode> || <single-animation-play-state> ||
  [ none | <keyframes-name> ]
```

`<time>` appears twice: first fills `animation-duration` ([0s,∞]), second fills
`animation-delay`. `auto` is also a valid duration. The `||` combinator is
order-independent, so a bare keyword must be matched against the components **in
grammar order** — a token that is both a component keyword and a valid custom-ident
(e.g. `reverse`, `forwards`, `both`, `paused`) binds to its component first and only
falls to `<keyframes-name>` if that component slot is already filled. `none` is
assigned to `animation-name` (its reset value).

## The fix

Three new helpers beside `_canonAnimName` (~15472 in `bootstrap.js`), both setProperty
paths wired (inline ~1005, API ~1511), var()/env()/`_MATHFN_NAME_RE`/CSS-wide deferred:

- **`_parseSingleAnimation(layer)`** — tokenizes one layer via `_wsTokens` (paren-aware)
  and assigns each token: `<time>`→duration (≥0) then delay (a third → reject); `auto`
  →duration; `_canonEasing`→timing (beats a custom-ident; a second → reject); `infinite`
  or `<number [0,∞]>`→iteration-count; `none`→name; direction/fill-mode/play-state
  keyword→its slot (each ≤ once); else `_canonAnimNameTok`→name (≤ once). Returns the
  eight components with defaults (`auto`/`ease`/`0s`/`1`/`normal`/`none`/`running`/`none`)
  or null.
- **`_serSingleAnimation(c)`** — lists non-default components in canonical order
  duration·timing·delay·iter·direction·fill·play·name. Duration is kept whenever a delay
  prints (so the two `<time>`s stay positionally unambiguous). An all-default layer
  serializes as `none`.
- **`_canonAnimationShorthand(value)`** — maps `<single-animation>#` over the top-level
  comma list (`_commaSplitTop`), rejecting empty/stray-comma layers.

Also **extracted `_canonAnimNameTok`** — the single-token `<keyframes-name>` canon
(custom-ident | string | `none`) shared by `_canonAnimName` (refactored to call it,
byte-identical) and the shorthand's name component.

## Results

| File | Before | After |
|------|:------:|:-----:|
| `animation-invalid.html` | 0/8 | **8/8** |
| `animation-valid.html` | 9/12 | **12/12** |
| `animation-computed.html` | 12/15 | **14/15** |

**+13 subtests.** Key canonicalizations:
- `anim paused both reverse 4 1s -3s cubic-bezier(0, -2, 1, 3)` → `1s cubic-bezier(0, -2, 1, 3) -3s 4 reverse both paused anim`
- `anim paused both reverse, 4 1s -3s cubic-bezier(0, -2, 1, 3)` → `reverse both paused anim, 1s cubic-bezier(0, -2, 1, 3) -3s 4`
- `cubic-bezier( 0, -2, 1, 3 )` → `cubic-bezier(0, -2, 1, 3)`

The +2 on `animation-computed` was a bonus — the canonical specified serialization now
feeds the computed path cleanly.

## Zero-regression sweep

- qsa 1975/1975, classlist 1420/1420
- whole `css-transitions/parsing/` dir 101/101 (reused helpers untouched)
- every `animation-*` longhand at its #210 baseline: name-valid 27/27, name-computed
  26/27, duration-computed 11/15, delay-computed 3/4, all `*-invalid` 100%

## Caps / Next

- **CAP:** `animation-computed` 14/15 — the last fail (`Animation with a delay but no
  duration` expects `0s 1s`, got `none`) is a **getComputedStyle shorthand-reconstruction
  gap** (the computed serializer builds `animation` from longhands, not the specified
  path we own here). Not a raw-store tell.
- **NOTE:** `animation-composition-invalid.html` is a **404** on wpt.live (42-byte body →
  could-not-run) — it is not in this dir; the composition keyword gate lives on the
  `animation-composition` longhand (#210), untested here.
- **NEXT LEVERAGE:** scroll-driven `animation-range-{start,end}` (invalid 11+14, a NEW
  grammar `[normal | <length-percentage> | <timeline-range-name> <length-percentage>?]#`)
  and `animation-timeline` (`auto | none | <dashed-ident> | scroll()/view()`), OR a NEW
  `css/*/parsing/` dir (baseline `*-invalid` 0/N first). grep `_canonAnimationShorthand`.
