# Quest #45 — The Mutable Charter

**Realm:** `html/semantics/selectors/pseudo-classes/readwrite-readonly.html`
(the `:read-write` / `:read-only` live-state pseudo-classes)

**Hold before:** 5/25 · **Hold after:** **25/25** · **Bounty:** **+20**

**Status:** ✅ SECURED (session 2026-06-19) — zero regressions.

---

## The gap

`:read-write` / `:read-only` were the last live-state form pseudo-classes still
dark — named as a cap by #44. The Servo `selectors` crate *parses* them
(`is_known_pseudo_class` lists both), but they fell through to
`PseudoClass::Other(name)`, whose `match_non_ts_pseudo_class` arm returns `false`.
So **both** pseudo-classes matched **nothing**.

That gave a deceptive 5/25: the only passing subtests were the ones expecting an
**empty** match set (`#set0 :read-write → []`, the post-`readonly`/post-`disabled`
`:read-write → []` snapshots, and — by accident — `:read-only → []` after
`document.designMode="on"`). The 20 fails all expected a *non-empty* match set.

Critically, the `designMode → :read-only → []` subtest passed only because
`:read-only` matched nothing; a naïve `:read-only` implementation that didn't know
about design mode would have **regressed** it (it would return `[p1]`).

## The spec, distilled

An element matches **`:read-write`** iff:
- it is an `input` to which `readonly` *applies* (types text/search/url/tel/email/
  password/date/month/week/time/datetime-local/number — missing type ⇒ text),
  **without** a `readonly` attribute and **not** disabled; or
- it is a `textarea` without `readonly` and not disabled; or
- it is any other element that is **editable** — inside a `contenteditable`
  editing host, or the document is in **design mode**.

Form controls (`input`/`textarea`) keep their *own* mutability even inside a
`contenteditable` host (test set5: `ci1[readonly]`/`ci2[disabled]` inside an
editable `<div>` are still `:read-only`).

Every other element is **`:read-only`** (= element ∧ ¬`:read-write`). Non-elements
match neither.

The form-associated custom elements in set6 need **no special handling** — `ce1`
(no `contenteditable`) is a plain non-editable element → `:read-only`; `ce2`–`ce5`
(`contenteditable`) are editable → `:read-write`. The general editable rule covers
them.

## The fix — pure-Rust live matching + a design-mode global flag

Everything except `document.designMode` is derivable straight off the tree, so
this is **pure-Rust matching** (no per-query JS priming, unlike #44's validity
bitmask) plus one persistent document-global flag for design mode.

- **`crates/obscura-dom/src/selector.rs`** — new inherent methods on `DomElement`
  (beside `match_required_optional`, in the `impl DomElement` block, **not** the
  `impl Element` trait block — `E0407`):
  - `match_read_write_read_only(want_read_write)` — element-gated, returns
    `is_read_write() == want_read_write`.
  - `is_read_write()` — the input/textarea/editable branch above, all attrs read
    live via `tree.with_node`.
  - `is_editable()` — `tree.design_mode()` short-circuit, else walk
    self→ancestors via `parent_element()` for the nearest explicit
    `contenteditable` value (`"false"` ⇒ not editable, `"inherit"` ⇒ keep walking,
    `""`/`"true"`/`"plaintext-only"` ⇒ editable).
  - Wired two arms in `match_non_ts_pseudo_class`: `"read-write"` / `"read-only"`.
- **`crates/obscura-dom/src/tree.rs`** — `design_mode: bool` on `DomTreeInner`
  (+ init `false`), `set_design_mode(on)` / `design_mode()`.
- **`crates/obscura-js/src/ops.rs`** — `set_design_mode` op (`arg1 == "1"`).
- **`crates/obscura-js/js/bootstrap.js`** — `Document` `get/set designMode`
  (was entirely undefined): ASCII-case-insensitive `"on"`/`"off"` per spec, stores
  `_designMode`, pushes the flag to the Rust engine via `set_design_mode`. The flag
  persists (no per-query priming) and is reset by the test to `"off"`.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `…/pseudo-classes/readwrite-readonly.html` | 5/25 | **25/25** (+20) |

`designMode` (predicted a cap by #44) is fully handled by the global flag —
**all 20 winnable subtests + the 2 design-mode subtests are green.**

## Zero-regression sweep

qsa 1975, classlist 1420, matches 669, closest 29, createElement 147,
createElementNS 596, tagName 6, cloneNode 135, structured-clone 141/152,
getRandomValues 39, mark 22, url-setters-stripping 260, willValidate 67,
checkValidity 122, has-basic 18, valid-invalid 30, required-optional 6,
inrange-outofrange 6, enabled 1/1 — all unchanged. The `:disabled` (0/7) and
`:checked` (2/3) sibling fails are **pre-existing** (a disabled-propagation
matching gap + a cascade test; `:disabled` arm untouched by this quest, and #44
already stash-proved them pre-existing).

## Caps / Next

- **`readwrite-readonly-type-change.html`** 0/1 — asserts *applied colours* via
  `getComputedStyle` (`expected "rgb(255,0,0)" got "rgb(0,0,0)"`). Matching is
  correct; we don't cascade author stylesheets. This is the standing
  **CSS-cascade / `getComputedStyle`** wall (behind every `-type-change`/`-hidden`
  variant + has-specificity/is-nested from #42), not a matching bug.
- **`:disabled` disabled-propagation** (`disabled.html` 0/7) — `:disabled` only
  checks the element's own `disabled` attribute; the suite expects descendants of
  a disabled `<fieldset>`/`<optgroup>` and reordering. Self-contained follow-up in
  the same matcher.
- **NEXT LEVERAGE:** the live-state form selector family is now complete
  (`:required`/`:optional`/`:valid`/`:invalid`/`:in-range`/`:out-of-range`/
  `:read-write`/`:read-only`). The recurring wall is now the **CSS cascade /
  `getComputedStyle`** realm (large, architectural — unlocks the `-type-change`/
  `-hidden` variants here + has-specificity/is-nested + much of `css/`). Otherwise:
  `:disabled` propagation (small), or a fresh realm (`fetch/`, `html/dom/`
  reflection).
