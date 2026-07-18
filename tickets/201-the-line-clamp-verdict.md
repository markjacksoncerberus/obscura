# Quest #201 — The Line-Clamp Verdict

**Realm:** `css/css-overflow/parsing/`
**Session:** 2026-07-17
**Result:** +16, ZERO regressions (line-clamp-invalid 0→8, line-clamp-valid 10→18).

## The gap

Baseline in `css/css-overflow/parsing/`:

| File | Before | After |
|------|:------:|:-----:|
| `line-clamp-invalid.html`   | 0/8   | **8/8**   |
| `line-clamp-valid.html`     | 10/18 | **18/18** |
| `webkit-box-computed.html`  | 14/20 | 14/20 (cap — display computation) |

`line-clamp` (the unprefixed shorthand — distinct from the already-handled
`-webkit-line-clamp` longhand) had **no dedicated handling**. It fell to a generic
path that stored simple keyword/integer values verbatim (so invalid values like `0`,
`-5`, `none 2` were accepted → invalid 0/8) yet *dropped* values containing
`no-ellipsis` / `<string>` / `-webkit-legacy` (returned `""`), and never canonicalized
(no int-first reordering, no `ellipsis`→default folding).

## The grammar (CSS Overflow 4 §5.1)

```
line-clamp = none | [ <integer [1,∞]> || <'block-ellipsis'> ] -webkit-legacy?
```

A shorthand for `max-lines` / `block-ellipsis` / `continue`, but **only its own
specified-value serialization is exercised** by these parsing tests (`test_valid_value`
sets `style.lineClamp` and reads `getPropertyValue('line-clamp')` back, asserting the
canonical string + round-trip idempotency). So we canonicalize the *string* directly
via **`_serLineClamp(value)`** rather than expand into the three longhands.

Longhand context (from the spec, for reference): `max-lines = none | <integer [1,∞]>`,
`block-ellipsis = no-ellipsis | auto | <string>` (initial `no-ellipsis`), `continue =
auto | discard | collapse`.

## The canonicalization

Canonical form is `<max-lines> <block-ellipsis>? -webkit-legacy?` where:

- **`<max-lines>` slot is always serialized** — the integer, or the keyword `auto`
  when the integer is omitted.
- The **`<block-ellipsis>` token is emitted only when it is not the default:**
  - `auto` → kept **only beside an integer** (`8 auto`→`8 auto`; standalone→just `auto`,
    the max-lines placeholder covers it).
  - `ellipsis` → the pre-standard alias for the default auto ellipsis → **elided**
    (`8 ellipsis`→`8`, `ellipsis`→`auto`).
  - omitted → default → elided.
  - `no-ellipsis` / `<string>` → emitted verbatim.

This is why the four seemingly-inconsistent rows are all consistent:

| input | output | why |
|-------|--------|-----|
| `8 auto`     | `8 auto` | explicit `auto` kept beside int |
| `8 ellipsis` | `8`      | `ellipsis` = default, elided |
| `ellipsis`   | `auto`   | max-lines slot → `auto`; ellipsis elided |
| `" x "`      | `auto " x "` | max-lines slot → `auto`; string emitted |
| `no-ellipsis -webkit-legacy` | `auto no-ellipsis -webkit-legacy` | omitted int → `auto` |

A leading `auto` beside another block-ellipsis token (e.g. `auto no-ellipsis`, the
canonical output of `no-ellipsis`) is read back as the **max-lines placeholder** so every
canonical value round-trips. Parsing: `_wsTokens` (quote-aware — a `<string>` stays one
token), strip a trailing `-webkit-legacy`, require a 1–2-token `[<int> || <B>]` group,
classify each token (integer ≥1 / `auto`/`ellipsis`/`no-ellipsis` / `<string>`), and
disambiguate a two-`auto`-like pair as placeholder+component.

## Wiring

`_serLineClamp` lives right after `_serContain`. Wired identity-guarded
(`!_CSS_WIDE.has(low) && !_TF_VAR_RE.test` so `inherit`/`var()` pass through) as an
`else if (name === 'line-clamp')` branch in **both** setProperty paths (the inline
cssText parser and the setProperty API). Reused `_wsTokens` unmodified — fully isolated
(1 new fn + 2 branches).

## Results

- `line-clamp-invalid` 0→8, `line-clamp-valid` 10→18. **+16.**
- `webkit-box-computed` held 14/20 (my change does not touch `display` computation).

**Zero-regression sweep held:** cursor-invalid 10/10, contain-invalid 14/14,
will-change-invalid 127/127, clip-path-invalid 48/48, background-valid 45/46 (pre-existing
cap), text-overflow-valid 5/5, webkit-line-clamp-valid 3/3, webkit-line-clamp-invalid 7/7,
overflow-clip-margin 25/25, scrollbar-gutter-valid 4/4, qsa 1975.

## Caps / Next

- **CAP — `webkit-box-computed` 14/20 (6 fail):** these need the real
  `display`-computation special-casing (`display: -webkit-box` + `-webkit-box-orient:
  vertical` + `-webkit-line-clamp: <integer>` → computed `display` becomes
  `flow-root`/`inline-block`; the `continue`/`line-clamp` block-container mechanism).
  That's a layout/computed-value feature, not a value-parsing one — a separate quest.

- **NEXT LEVERAGE:** `scroll-buttons-invalid` 1/8 (a `scroll-buttons` shorthand value
  engine) is the last untouched `*-invalid` in this dir. Beyond `css-overflow`: pick
  another `css/*/parsing/` dir with an `*-invalid` 0/N tell, or build a real **gradient
  grammar validator** (`background-image-invalid` 0/12 + would recover the cursor
  radial-gradient computed row from #200). grep `_serLineClamp`.
