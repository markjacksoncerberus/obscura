# Quest #210 — The Animation Longhand Verdict

**Realm:** `css/css-animations/parsing/` (the `animation-*` longhands)
**Result:** +55 subtests, ZERO regressions. Session 2026-07-17.
**Lever:** #209's next-leverage — the `animation-*` longhands share the transition grammar.

---

## The gap

Baselining `css/css-animations/parsing/` showed every `animation-*` longhand
`*-invalid` file sitting at **0/N** — the classic pure raw-store tell. `setProperty`
stored every animation-longhand value verbatim with no validation or
canonicalization, so leniently-accepted junk (`auto` for direction, `-2` for
iteration-count, two keywords in one comma item, CSS-wide keywords inside a list)
all slid through, and `<string>` keyframes-names never canonicalized to idents.

Raw-store baseline (per file):

| File | Baseline | Kind |
|---|:---:|---|
| animation-delay-invalid | 0/5 | `<time>#` |
| animation-duration-invalid | 0/6 | `auto \| <time [0s,∞]>#` |
| animation-timing-function-invalid | 0/7 | `<easing-function>#` |
| animation-direction-invalid | 0/4 | `<keyword>#` |
| animation-fill-mode-invalid | 0/4 | `<keyword>#` |
| animation-play-state-invalid | 0/4 | `<keyword>#` |
| animation-composition-invalid.tentative | 0/4 | `<keyword>#` |
| animation-iteration-count-invalid | 0/5 | `infinite \| <number [0,∞]>#` |
| animation-name-invalid | 0/9 | `[none \| <keyframes-name>]#` |
| animation-name-valid | 23/27 | serialization gaps |
| animation-name-computed | 23/27 | serialization gaps |

---

## The work

Two existing transition helpers were **reused directly** at the animation call
sites (the grammars are identical):

- `animation-delay` = `<time>#` → `_isValidTransitionTime(value, false)`
- `animation-timing-function` = `<easing-function>#` → `_canonTimingFunction`
  (covers the malformed `steps(2,()start)` family for free)

Four new helpers were added beside `_canonTransitionShorthand` (~15308), wired into
both `setProperty` paths (inline ~980, API ~1454), with `var()`/`env()`/math
(`_MATHFN_NAME_RE`)/CSS-wide keywords deferred:

1. **`_isValidAnimDuration(value)`** — `auto | <time [0s,∞]>#`. A *dedicated* gate
   rather than `_isValidTransitionTime`, because animation-duration also admits
   `auto` (CSS Animations 2 — binds duration to a timeline). Value kept
   byte-identical when valid. Rejects `-3s`/`0`/`infinite`/`1s 2s`.

2. **`_canonAnimKeywordList(value, kwSet)`** — a generic `<keyword>#` gate shared by
   the four keyword-list longhands via `_ANIM_KEYWORD_LISTS`:
   - direction: `{normal, reverse, alternate, alternate-reverse}`
   - fill-mode: `{none, forwards, backwards, both}`
   - play-state: `{running, paused}`
   - composition: `{replace, add, accumulate}`

   Each comma item must be exactly one keyword from the set (lowercased). Rejects
   `auto`, `normal reverse` (two tokens), `reverse, initial` (CSS-wide in a list —
   not in the set).

3. **`_canonAnimIterationCount(value)`** — `infinite | <number [0,∞]>#` (numbers kept
   verbatim, `infinite` lowercased). Rejects `auto`/`-2`/`3 4`/`initial, 4`.

4. **`_canonAnimName(value)`** — `[none | <keyframes-name>]#`,
   `<keyframes-name> = <custom-ident> | <string>`. Per item:
   - A `<string>` → re-serialized as a `<custom-ident>` via `_serIdent`
     (`"something"`→`something`, `"multi word string"`→`multi\ word\ string`,
     `"---\22---"`→ unescape to `---"---` → `---\"---`) **unless** its value
     (case-insensitively) collides with `none` / a CSS-wide keyword / `default` — in
     which case it stays quoted via `_serCssString` (`"NoNe"`, `"initial"`,
     `"default"` …), so the meaning can't shift.
   - Bare `none` → lowercased keyword. Bare CSS-wide / `default` → rejected. `12`
     (not a `<custom-ident>`) and `""` (empty string) → rejected. Other bare
     custom-idents kept verbatim (case preserved).

---

## Results

| File | Before → After |
|---|:---:|
| animation-delay-invalid | 0/5 → **5/5** |
| animation-duration-invalid | 0/6 → **6/6** |
| animation-timing-function-invalid | 0/7 → **7/7** |
| animation-direction-invalid | 0/4 → **4/4** |
| animation-fill-mode-invalid | 0/4 → **4/4** |
| animation-play-state-invalid | 0/4 → **4/4** |
| animation-composition-invalid.tentative | 0/4 → **4/4** |
| animation-iteration-count-invalid | 0/5 → **5/5** |
| animation-name-invalid | 0/9 → **9/9** |
| animation-name-valid | 23/27 → **27/27** |
| animation-name-computed | 23/27 → **26/27** (bonus) |

**Total: +55, ZERO regressions.**

### The regression that was caught

First cut rejected `auto` for animation-duration (via `_isValidTransitionTime`). A
stash-baseline of the computed files revealed **`animation-duration-computed`
regressed 11→7** — `auto` is a valid duration and the raw-store path had been
resolving it. Adding the dedicated `_isValidAnimDuration` (auto-aware) restored
11/15. Lesson re-confirmed: always stash-baseline the sibling `-computed` files
before committing a longhand gate, even when the `-invalid`/`-valid` files look clean.

### Zero-regression sweep held

qsa 1975/1975, classlist 1420/1420, the whole `css-transitions/parsing/` dir
(timing-function-invalid 25/25 + -valid 22/22, property-invalid 15/15,
transition-valid 10/10 — the reused helpers untouched), image-resolution-invalid
5/5, font-palette-invalid 4/4, background-image-invalid 12/12, and every animation
longhand `-valid` file (100%) + `-computed` file at baseline (delay 3/4, duration
11/15).

---

## Caps / Next

- **CAP — the `animation` shorthand** (`animation-invalid` 0/8, `animation-valid`
  9/12): a combinatorial `<single-animation>#` parse (name + duration + timing +
  delay + iteration-count + direction + fill-mode + play-state, canonical reorder
  like the transition shorthand). The `_parseSingleTransition`/`_serSingleTransition`
  pattern from #209 is the template; the per-component gates all now exist as helpers
  to lean on. A dedicated quest.
- **CAP — scroll-driven `animation-range-{start,end}`** (invalid 11+14, plus
  `-valid`/`-computed`): `[normal | <length-percentage> | <timeline-range-name>
  <length-percentage>?]#` — a new grammar (timeline range names), not raw-store-reuse.
- **CAP — computed-resolution gaps** in `animation-{duration,composition,
  iteration-count}-computed`: `auto`→`0s` timeline resolution, calc() simplification,
  `animation-composition` unsupported in computed style — these need the cascade/
  computed path, not the specified-value gate.
- **NEXT LEVERAGE:** a NEW `css/*/parsing/` dir not yet swept (baseline its
  `*-invalid` files for the 0/N raw-store tell first), OR the `animation` shorthand
  above. grep `_canonAnimName`.
