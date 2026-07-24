# Scroll #300–#302 — The WebKit-Box Verdict

**Realm:** `css/css-overflow/parsing/webkit-box-computed.html`
**Hold before:** 2/20 · **Hold after:** **20/20** (+18) · **Regressions:** 0
**Session:** 2026-07-24 · **Commit:** (see `git log`)

---

## The gap

Scouting a fresh `css/*/parsing/` dir (the standing next-leverage), the css-overflow
dir turned up mostly green (scrollbar-gutter, text-overflow, line-clamp, max-lines,
block-ellipsis, scroll-axis-lock, scroll-markers, continue — all 100%) but three fresh
veins: `scroll-buttons-valid` 0/37 + `scroll-buttons-invalid` 1/8 (a `::scroll-button()`
**selector-engine** quest — Rust `selectors` crate, a different quest type, deferred),
and `webkit-box-computed` **2/20** — a `display` computed-value quest, ripe for the
existing `_canonDisplay`/`_computedPropOf` machinery.

`webkit-box-computed.html` tests `getComputedStyle().display` for the four **Compat spec
legacy WebKit `display` aliases** in the presence of the line-clamp / continue clamp
mechanism:

- `display: -webkit-box` / `-webkit-inline-box` — were **invalid** (`.style.display`
  returned `""`, computed fell back to `block`).
- `display: -webkit-flex` / `-webkit-inline-flex` — also invalid; should compute to
  `flex` / `inline-flex`.
- The clamp transformation: a `-webkit(-inline)-box` with `-webkit-box-orient: vertical`
  **and** an active line clamp computes to `flow-root` / `inline-block`.

The only 2 passing subtests at baseline were the real-`flex`/`inline-flex` rows
(`display: flex; -webkit-box-orient: vertical; -webkit-line-clamp: 3` → `flex`), which
already worked because our engine ignores the unknown `-webkit-*` sibling props and
`flex` was already valid.

## The three quests (one file, one commit)

### #300 — `-webkit-box` / `-webkit-inline-box` valid, computed = self (+12 → 14/20)
Added `-webkit-box` and `-webkit-inline-box` to `_DISPLAY_PREDEFINED`. `_canonDisplay`
returns a lone predefined keyword verbatim, so they parse as valid and serialize as the
specified string. With no `_normComputed`/`_computedPropOf` branch, computed = self
(identity) — correct for the no-clamp cases.

### #301 — `-webkit-flex` / `-webkit-inline-flex` compute to `flex` / `inline-flex` (+2 → 16/20)
Added both to `_DISPLAY_PREDEFINED` too (valid, specified verbatim), then a
`_computedPropOf` display branch mapping `-webkit-flex`→`flex`, `-webkit-inline-flex`→
`inline-flex` at computed time. (Unlike `-webkit-box`, these do NOT keep their own
keyword as the computed value.)

### #302 — the line-clamp blockification (+4 → 20/20)
A `-webkit-box` / `-webkit-inline-box` with **`-webkit-box-orient: vertical`** AND an
**active line clamp** blockifies:
- `-webkit-box` → `flow-root`
- `-webkit-inline-box` → `inline-block`

"Active line clamp" (`_hasActiveLineClamp`) = any of:
- `-webkit-line-clamp` is a `<integer [1,∞]>` (not `none`),
- `line-clamp` is an `<integer>`/`auto` (not `none`),
- `continue: discard`.

All three sibling props are read via `_computedPropOf(el, …)`. `-webkit-box-orient` is
raw-stored (unregistered) but reads back its specified value; `-webkit-line-clamp` and
`continue` are `_GCS_DEFAULTS` props (`none` / `normal`); `line-clamp` is unregistered so
resolves to `''` when unset (falsy → no false trigger). The whole webkit block is gated
on `low[0] === '-'`, keeping every non-`-webkit` display value on the existing fast path.

## Which subtests ran

Only **20** of the file's ~32 potential subtests run: the 16 unconditional rows + the
`continue: discard` block (4). The `line-clamp: none/2/auto` blocks (`CSS.supports(
'line-clamp: …')` = **false**) and the `continue: none` block (`CSS.supports(
'continue: none')` = false — `none` isn't a valid `continue` keyword in our impl, matching
the tested grammar `normal|discard|collapse|-webkit-legacy`) are gated off and do not run.
The `_hasActiveLineClamp` helper reads `line-clamp` anyway, so those cases would pass if
ever unlocked. See the CAP below.

## Zero-regression sweep

- **display parsing dir intact:** display-valid 108/108, display-invalid 55/55,
  display-computed 112/112 (the `_DISPLAY_PREDEFINED` additions + the `low[0]==='-'`
  gate touched nothing existing).
- **overflow siblings:** line-clamp-valid 18/18, line-clamp-invalid 8/8,
  webkit-line-clamp-valid 3/3, continue-valid 4/4, overflow-computed 34/34.
- **core held realms:** qsa 1975/1975, classlist 1420/1420, flex-computed 14/14,
  justify-items-computed 20/20.

## Caps / Next

- **CAP — `line-clamp` / `continue: none` in `CSS.supports`.** `line-clamp` is validated
  via `_serLineClamp` in `setProperty` but is NOT in `_CSS_KNOWN_PROPS` (it's absent from
  `_GCS_DEFAULTS`), so `CSS.supports('line-clamp: …')` returns false and this file's 12
  `line-clamp`-gated subtests never run. Wiring `line-clamp` into computed-style /
  `_CSS_KNOWN_PROPS` is a broader change (line-clamp is a shorthand-ish `[<integer> ||
  <block-ellipsis>]` with its own computed rules) with real regression surface — deferred.
  The `_hasActiveLineClamp` logic already handles `line-clamp` correctly, so unlocking
  CSS.supports alone would likely turn those 12 green.
- **CAP — `::scroll-button()`** (`scroll-buttons-valid` 0/37, `-invalid` 1/8): a
  pseudo-element **selector-engine** quest (Rust `selectors` crate), a different quest type.
- **CAP — blockification of the aliases under float/abspos** is not modelled
  (`-webkit-box`/`-inline-box` are not in `_BLOCKIFY_MAP`); untested here.
- **NEXT LEVERAGE:** scout a fresh `css/*/parsing/` dir. The webkit-box vein proves even a
  ~all-green realm (css-overflow) can hide a fully-unmodelled 2/20 file. Reusable: the
  `_computedPropOf` display-alias branch (keyword → computed remap) and the
  `low[0]==='-'` fast-path gate.
