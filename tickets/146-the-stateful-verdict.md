# Quest #146 — The Stateful Verdict

> **`CustomStateSet` + `ElementInternals.states` + the `:state()` custom-state
> pseudo-class.** +20 across 5 tests, ZERO regressions.

## The gap

The `custom-elements/state/` realm was entirely red — `CustomStateSet` did not exist,
`ElementInternals.states` returned undefined (every test crashed on `.states`), and the
Rust selector engine rejected `:state()` as an unknown pseudo-class. This rode directly
on Quest #145's fresh `ElementInternals`.

Baseline (before):

| Test | Before |
|------|:------:|
| `state/ElementInternals-states.html` | 0/4 |
| `state/state-pseudo-class.html` | 2/8 |
| `state/state-css-selector.html` | 0/10 |
| `state/state-css-selector-nth-of.html` | 0/3 |
| `state/custom-state-set-strong-ref.html` | 0/1 |

## The work

Two-part feature mirroring `:defined` (Quest #144), plus a shared CSS-lexer fix.

### 1. `CustomStateSet` (JS — `bootstrap.js`)
A set-like backing `ElementInternals.states`. A thin wrapper over a real `Set<string>`:
insertion-ordered, deduping, with live iteration semantics **identical to `Set`** — which
is exactly what `ElementInternals-states.html`'s "update while iterating" subtest checks
(delete-the-next-item, clear-mid-iteration, delete+re-add moves to end). Any string is
accepted (the old `<dashed-ident>` restriction was dropped from the spec). No `supports`
method → `states.supports('foo')` throws `TypeError` automatically, as the test expects.
`Symbol.toStringTag = 'CustomStateSet'` → `toString()` is `[object CustomStateSet]`.

On **every mutation** (`add`/`delete`/`clear`) it pushes the full list to the Rust tree via
a new `set_ce_states` op. **No explicit style invalidation is needed**: `getComputedStyle`
re-runs the Rust matcher live per call (`_buildCascade` → `selector_match_specificity`),
so it reads the current states — that is why `state-css-selector.html` (10 getComputedStyle
assertions toggling states) went straight to 10/10.

`ElementInternals.states` is a lazily-minted `[SameObject]` getter — available regardless
of form-association (unlike the form-* operations).

### 2. `:state(ident)` (Rust — `selector.rs` / `tree.rs` / `ops.rs`)
- **tree.rs**: a per-node `ce_states: HashMap<NodeId, Vec<String>>` (NOT monotonic like
  `ce_defined` — states toggle, so an empty list drops the entry). `set_ce_states` /
  `has_ce_state` (exact, case-sensitive).
- **ops.rs**: `set_ce_states` op — arg1 = node id, arg2 = JSON array of the current states.
- **selector.rs**: a `PseudoClass::State(String)` variant. Parsed in
  `parse_non_ts_functional_pseudo_class` as a single `expect_ident()` + `expect_exhausted()`
  → `:state(16px)`/`:state(=)`/`:state(name=value)`/`:state( foo bar)`/`:state()` all fail
  to parse (SyntaxError), which WPT requires. Serialized via `cssparser::serialize_identifier`
  (so `:state( \(escaped\ state  )` round-trips to `:state(\(escaped\ state)`). Matched by
  consulting `has_ce_state`.

### 3. `::part()` parse-but-never-match (Rust — `selector.rs`)
`state-pseudo-class.html`'s serialization subtest reads `cssRules[1].cssText` for a rule
using `::part(inner):state(innerFoo)`. Those rules were being **dropped from the CSSOM**
because `::part()` failed to parse. Added `PseudoElement::Part(String)` mirroring
`::slotted` (retains the space-separated part-name list, never matches) + overrode
`accepts_state_pseudo_classes()` → true for `Part` so `::part(inner):state(foo)` /
`::part(inner):hover` parse (CSS Shadow Parts §3.1).

### 4. Escape-aware CSS rule splitter (JS — `bootstrap.js`)
Even with `::part()` parsing, the escaped-ident rule `:state( \(escaped\ state  ) {}`
was still dropped. Root cause: `_cssParseRuleList`'s prelude scanner tracked `(`/`[`
nesting depth but **ignored CSS backslash-escapes**, so the escaped `\(` wrongly opened a
nesting level and the rule's `{` was never recognized as a block start. Fix: skip a
backslash-escaped code point (`if (!inStr && c === '\\') { j += 2; continue; }`) in both
the prelude scanner and the block reader — standard CSS lexing. This is the shared change;
swept for regressions (below).

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `state/ElementInternals-states.html` | 0/4 | **4/4** | +4 |
| `state/state-css-selector.html` | 0/10 | **10/10** | +10 |
| `state/state-pseudo-class.html` | 2/8 | **6/8** | +4 |
| `state/state-css-selector-nth-of.html` | 0/3 | **1/3** | +1 |
| `state/custom-state-set-strong-ref.html` | 0/1 | **1/1** | +1 |

**+20 across 5 tests, ZERO regressions.**

Zero-regression sweep (all identical before/after): qsa 1975, classlist 1420,
CSSStyleRule 10/10, serialize-values 696/697 (the 1 fail — `font-family: 'Lucida Grande'`
quoting — is pre-existing and unrelated), pseudo-class-defined 27, connected-callbacks 24,
reactions/Element 38, shadowRoot-attribute 3/3.

## Caps / Next

**Caps (genuinely need a bigger lift):**
- **`:state()` + shadow styling** — `state-pseudo-class.html` 6/8; the last 2 are
  `::part(inner):state()` styling across a shadow boundary and `:host(:state())` matching.
  Both need real shadow-part / `:host()` **styling** (matching, not just parsing) — the
  same lift that gates constructable-stylesheet-in-shadow. Also the inner element inside a
  container's shadow `innerHTML` isn't being upgraded (its `.i` internals were undefined).
- **`:nth-child(N of S)`** — `state-css-selector-nth-of.html` 1/3 needs the "of `<selector>`"
  form of `:nth-child`/`:nth-of-type`. Separate selector feature (the Servo `selectors`
  crate supports `NthOf` matching; our parser doesn't enable/plumb it). A clean standalone
  quest — would also unlock `css/selectors/*nth*of*` tests.

**Next leverage (unchanged from #145's pointer, now that state is done):**
- **Reaction-queue microtask model** — `custom-element-reaction-queue` 0/6,
  `enqueue-...-inside-another-callback` 0/8, `throw-on-dynamic-markup-insertion-...-reactions`
  0/11 (~25 subtests). Needs the full backup-element-queue + microtask processing model
  (our current flush is synchronous). Highest tail but highest regression risk — the whole
  custom-elements reaction machinery runs through it.
- **`:nth-child(of S)`** — smaller, cleaner, cross-cutting selector win (above).
- **Form-validity integration** — a form-associated custom's `setValidity` reaching its
  owner form's `checkValidity`/`:valid`/`:invalid` (`ElementInternals-validation` 11/14).
