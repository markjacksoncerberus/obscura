# Quest #44 — The Living Verdict

> **Realm:** `html/semantics/selectors/pseudo-classes/{required-optional,valid-invalid,inrange-outofrange,…}`
> plus the `Element-closest` / dynamic constraint-validation tails.
> **Banner:** the constraint-validation **live-state selector pseudo-classes** —
> `:required` · `:optional` · `:valid` · `:invalid` · `:in-range` · `:out-of-range`.
> **Status:** ✅ SECURED — **+34**, zero regressions.

---

## The gap

Quests #41 (the `Element.matches` family) and #43 (the constraint validation API)
both ended on the **same recurring cap**: `:valid`/`:invalid` *selector matching*.
The Rust selector engine (Servo `selectors` crate) already **parses** the whole
constraint-validation pseudo family — `is_known_pseudo_class` lists `required`,
`optional`, `valid`, `invalid`, `in-range`, `out-of-range`, `read-only`,
`read-write` — but each parsed to `PseudoClass::Other(name)`, whose match arm
**always returns `false`**. So every one of them matched nothing:

| Test | Before |
|------|:------:|
| `required-optional` | 0/6 |
| `valid-invalid` | 17/30 (only the empty-result + setup subtests) |
| `inrange-outofrange` | 0/6 |
| `inrange-outofrange-time-reversed` | 0/4 |
| `valid-invalid-fieldset-disconnected` | 0/2 |
| `input-pattern-dynamic-value` (#43 cap) | 0/1 |
| `input-number-validity-dynamic-value-no-change` (#43 cap) | 0/1 |
| `Element-closest` (`:invalid` tail) | 28/29 |

The hard part: **validity is computed in JS** (`_cvCompute`, the whole #43 engine),
and the Rust matcher can't call back into JS. Two families, two strategies:

- **`:required` / `:optional`** are pure **tag + type + attribute** state — no
  validity computation at all. Evaluate them straight off the tree in Rust.
- **`:valid` / `:invalid` / `:in-range` / `:out-of-range`** need the JS verdict.
  Mirror the existing `:checked`/`:target` pattern: JS pushes a per-node bit that
  the matcher reads, **primed just before the query runs**.

## The work

**Rust — `:required`/`:optional` (pure tree state).** New `DomElement::
match_required_optional(want_required)` in `selector.rs` (inherent impl, *not* the
`Element` trait impl — `is_link` is a real trait method, a sibling custom method
there is `E0407`). It matches input(of a requirable type)/select/textarea and
splits on whether the `required` attribute is present. The requirable input types
are the HTML set (text/search/url/tel/email/password/date/month/week/time/
datetime-local/number/checkbox/radio/file; a missing/empty type is text) — NOT
hidden/range/color/submit/image/reset/button. Because it reads live attributes
every match, the test's `removeAttribute`/`setAttribute` + re-query just works.

**Rust — the validity bitmask (`:valid`/`:invalid`/`:in-range`/`:out-of-range`).**
A side map `validity_state: HashMap<NodeId,u8>` on the tree (exactly like
`checked_state`), with `set_validity_state_bulk(&[(NodeId,u8)])` (clears + inserts
— a query-time **snapshot**, never stale) and `validity_state(id) -> u8`. Bits:
`1=:valid 2=:invalid 4=:in-range 8=:out-of-range`. The `PseudoClass::Other` arm
now dispatches by name: `required`/`optional` → the tree check above; the four
validity names → a bit test on `validity_state`. New op `set_validity_flags`
(arg1 = `"nid:flags,nid:flags,…"`).

**JS — priming (`bootstrap.js`).** A sibling of `_primeTarget` called in every
`querySelector`/`querySelectorAll`/`matches`/`closest` entry point (Element,
Document, DetachedDocument, standalone Document):

```js
const _primeValidity = (s, node) => {
  if (s.indexOf('valid') < 0 && s.indexOf('range') < 0) return;   // cheap gate
  let root = node; while (root && root.parentNode) root = root.parentNode;
  const all = Array.from(root.querySelectorAll('input,select,textarea,button,output,object,fieldset,form'));
  if (root.nodeType === 1 && _VALIDITY_TAG_SET.has(root.localName)) all.push(root);
  // …compute each element's bitmask via _cvWillValidate / _cvCompute…
  _dom('set_validity_flags', parts.join(','));
};
```

Per element: a **candidate control** (`_cvWillValidate`) gets `:valid`/`:invalid`
from `_cvCompute(el).valid`, and a range bit when it has range limitations (a
`type=range` always — default min 0/max 100 — else a min/max-bearing numeric/
temporal input). A `<form>` is `:invalid` iff it owns ≥1 invalid candidate (via
`form.elements`), else `:valid`; a `<fieldset>` likewise over its descendant
candidates. **Gated on a substring test** (`valid`/`range`) so the hot
`querySelectorAll` path — 1975-subtest qsa, 1420 classlist — pays nothing.

**Two correctness subtleties found by the tests:**

1. **`type=range` clamps.** `_cvCompute` reports `rangeUnderflow` for
   `<input type=range min=2 max=7 value=1>`, but a range control's value
   sanitization **clamps into [min,max]**, so it's never out-of-range. `_primeValidity`
   zeroes the range over/underflow for `type=range` (and recomputes its `valid`
   bit accordingly) → `inrange-outofrange` 0→6.

2. **`select.value` ignored selectedness.** The getter returned the (nonexistent)
   `value` *attribute*, so a `<select>` was permanently `""` → permanently
   `valueMissing`. Now it's `§dom-select-value`: the first option whose
   selectedness is true (its `value` attr else trimmed text), with a non-multiple
   select defaulting to its first option. This let `select.firstElementChild.selected
   = true` flip a disconnected required `<select multiple>` to `:valid` →
   `valid-invalid-fieldset-disconnected` 0→2. **Verified no #43 regression**:
   valueMissing 71/71, valid 33/33 unchanged.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `required-optional` | 0/6 | **6/6** | +6 |
| `valid-invalid` | 17/30 | **30/30** | +13 |
| `inrange-outofrange` | 0/6 | **6/6** | +6 |
| `inrange-outofrange-time-reversed` | 0/4 | **4/4** | +4 |
| `valid-invalid-fieldset-disconnected` | 0/2 | **2/2** | +2 |
| `input-pattern-dynamic-value` | 0/1 | **1/1** | +1 |
| `input-number-validity-dynamic-value-no-change` | 0/1 | **1/1** | +1 |
| `Element-closest` | 28/29 | **29/29** | +1 |
| **Total** | | | **+34** |

**Zero regressions** (qsa `ParentNode-querySelector-All` 1975, classlist 1420,
matches 669, webkitMatchesSelector 669, createElement 147, createElementNS 596,
tagName 6, cloneNode 135, closest now 29, querySelector-scope 4, has-basic 18,
is-where-basic 15, structured-clone 141/152, getRandomValues 39, mark 22,
url-setters-stripping 260; **#43 constraint suite preserved** — willValidate 67,
checkValidity 122, valueMissing 71, valid 33, rangeOverflow 49, patternMismatch
85, valueMissing/valid-weekmonth 19/8). The `:disabled`/`:default`/`:indeterminate`
sibling tests' fails were **proven pre-existing** by a stash-rebuild on the
un-patched binary (identical numbers) — not regressions.

## Caps (honest)

- **`getComputedStyle`-driven variants** — `inrange-outofrange-type-change` (0/2),
  `readwrite-readonly-type-change` (0/1), `required-optional-hidden` (0/1) all
  assert *applied colours* via `getComputedStyle` → the standing **CSS-cascade**
  wall, not selector matching. (Our `:required`/`:in-range` *matching* is correct;
  we just don't cascade author styles.)
- **`invalid-after-clone`** (0/1) needs `test_driver.send_keys` (interactive
  keystrokes) — same harness cap as #43's textarea-defaultValue tail.
- **`:read-write` / `:read-only`** (`readwrite-readonly` 5/25) — DEFERRED. The
  input/textarea-attribute half is tree-derivable, but the suite leans on
  **editing hosts** (`contenteditable` ancestor propagation), **`document.designMode`**
  (a document-global flag), and **form-associated custom elements** — a deeper
  realm. `:read-write`/`:read-only` still parse-and-never-match today.

## Next leverage

The constraint-validation *selector* frontier is now broad and clean (matching +
the live verdict). Best next:
- **`:read-write` / `:read-only`** — extend the same machinery: the input/textarea
  half in Rust, contenteditable via an ancestor walk; designMode/custom-element
  parts are the cap. Worth ~15 of `readwrite-readonly`'s 20 remaining.
- **CSS cascade / `getComputedStyle`** — the recurring wall behind every
  `-type-change`/`-hidden` variant here and the `has-specificity`/`is-nested` tails
  from #42. A large architectural realm that would unlock a wide `css/` tail.
- A **fresh realm** (`fetch/`, `html/dom/` reflection / idlharness).
