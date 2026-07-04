# Scroll 133 — The Selected Verdict ⚔️

> **Realm:** the HTML text-field selection API + the input value model.
> **Files:** `crates/obscura-js/js/bootstrap.js` (no Rust).
> **Result:** **+1082 subtests** across 15 tests, ZERO pass-regressions.

---

## The gap

Sweeping fresh ground after the reflection realm was exhausted (bar the URL-origin
cap), the widest untapped tail on the board was
`html/semantics/forms/the-input-element/type-change-state.html` at **0/380** — every
subtest failing on a single missing primitive: `input.setSelectionRange is not a
function`. Pulling that thread uncovered the whole **text-field selection API** and
the **input value model** underneath it, both unimplemented:

- `input.value` was a single stored string via `_formValues` with no notion of the
  four HTML *value modes* (value / default / default-on / filename), no *value
  sanitization*, and no *type-change signal* — so changing `type` never re-flowed
  the value, and `<input type=file>.value = "x"` didn't throw.
- `selectionStart` / `selectionEnd` / `selectionDirection` / `setSelectionRange` /
  `setRangeText` / `select()` did not exist on `HTMLInputElement` **or**
  `HTMLTextAreaElement`.
- The `select` event never fired.

## The work (all additive, in `bootstrap.js`)

Everything rides on `HTMLInputElement.prototype` / `HTMLTextAreaElement.prototype`
overriding the shared `Element` `value` accessor, so textarea/select/`<li>` are
untouched. The block lives right after the constraint-validation reflectors.

### 1. Input value model (HTML §4.10.5)
- `_inputType(el)` → the canonical current-state keyword (known keyword lowercased
  via `__asciiLower`, else the default `text`). The **public `type` getter stays
  raw** (`getAttribute("type") || "text"`) — canonicalisation is internal only, so
  nothing that read a non-canonical keyword regresses.
- `_inputValueMode(t)` → `value` | `default` | `default/on` | `filename`.
- `_sanitizeInputValue` — strip-newlines (text/search/tel/password); strip-newlines
  **then** strip-leading/trailing-ASCII-WS (url/email); temporal → `""` unless a
  valid pattern; number → `""` unless a valid float; range → clamp to [min,max]
  else the `min+(max−min)/2` default; color → lowercased `#rrggbb` else `#000000`;
  hidden/other → verbatim.
- `value` getter/setter dispatch on mode: filename returns `""` / setter throws
  `InvalidStateError` on a non-empty set; default returns/sets the content attr;
  default/on returns the content attr or `"on"`; value mode stores a dirty value in
  `_formValues` and (on a real change) moves the text cursor to the end.
- **`_signalInputTypeChange(el, oldT, newT)`** — the "signal a type change"
  algorithm: value→(default|default-on) hands a non-empty value to the content
  attr then drops the dirty value; (non-value)→value seeds & re-sanitizes from the
  content attr; value→value re-sanitizes the dirty value; and a non-selectable →
  selectable transition resets the selection to `(0,0,"none")`. Hooked from the
  input `type` setter (the `setAttribute("type", …)` path is a known gap).

### 2. Text-field selection API (input + textarea)
- `_selApplicable(el)` = `<textarea>` OR an input whose type ∈ {text, search, tel,
  url, password} (email/number intentionally excluded).
- `selectionStart/End/Direction` getters clamp to the current value length (so a
  value shortened by a later type-change / content edit reports a valid cursor) and
  return `null` when not applicable; setters throw `InvalidStateError` when not
  applicable. The `selectionStart` setter pushes `end` out when the new start is
  past it (per spec); ToUint32 (`>>> 0`) on all offsets.
- `setSelectionRange`, `setRangeText` (all four selectMode branches; one-arg form;
  `IndexSizeError` on start > end), and `select()` (never throws — a no-op on a
  control with no text selection).
- Value-set moves the cursor to the end **only when the value actually changes**
  (default cursor is `0`, not the end — verified by `defaultSelection.html`).

### 3. The `select` event
`_fireSelectEvent(el)` queues (via `setTimeout(0)`, so never synchronous) a
**trusted, bubbling, non-cancelable** `select` Event, dispatched through
`_dispatchSpec` (keeps `isTrusted`) and then the `onselect` handler. `_setSelRange`
fires it **iff** the stored selection's extent or direction actually changed. An
`onselect` event-handler IDL attribute (defaulting to `null`) was added to both
prototypes (stored on the element; invoked alongside the `addEventListener`
listeners, matching the existing iframe-load idiom — there is no generic element
`on*` mechanism).

## Results (before → after)

| Test | Before | After |
|------|:------:|:-----:|
| `the-input-element/type-change-state.html` | 0/380 | **380/380** |
| `the-input-element/selection.html` | 2/42 | **42/42** |
| `textfieldselection/select-event.html` | 30/270 | **270/270** |
| `textfieldselection/selection-not-application.html?default` | 21/183 | **183/183** |
| `textfieldselection/selection-not-application.html?week,month` | 21/79 | **79/79** |
| `textfieldselection/selection-start-end.html` | 3/37 | **37/37** |
| `textfieldselection/textfieldselection-setRangeText.html` | 16/88 | **80/88** |
| `textfieldselection/textfieldselection-setSelectionRange.html` | could-not-run | **49/49** |
| `textfieldselection/selection.html` | 0/18 | **17/18** |
| `textfieldselection/selection-after-content-change.html` | 0/18 | **15/18** |
| `textfieldselection/selection-value-interactions.html` | 2/14 | **9/14** |
| `textfieldselection/selection-start-end-extra.html` | 1/11 | **9/11** |
| `textfieldselection/defaultSelection.html` | 0/6 | **6/6** |
| `textfieldselection/setSelectionRange.html` | 0/1 | **1/1** |
| `textfieldselection/selection-not-application-textarea.html` | 0/1 | **1/1** |
| **Total** | | **+1082** |

ZERO pass-regressions: qsa 1975, classlist 1420, reflection-misc 4709, reflection-
metadata 2994, Node-properties 726, aria-attribute 41, select-value 4/4 all held.
(`change-set-value`/`change-to-empty-value`/`email-set-value` shifted a
never-passing subtest fail→notrun because it now `await`s instead of throwing —
these are `test_driver.send_keys` interaction tests that can't run headlessly; no
PASS was lost.)

### ⚠️ The select-event "regression" that wasn't
`select-event.html` first went **30 → 0** after the selection API landed but before
the `select` event did: the methods now *worked*, which unblocked the sequential
`promise_test` queue's event-waits, so every test timed out (the prior 30 passes
were an artifact of the property-setter actions not throwing while the missing
methods failed fast). Firing the `select` event turned it into **270/270**. Lesson:
implementing an API without its side-effecting event can *look* like a regression on
event-driven suites — finish the feature.

## Caps / Next

- **Eager selection clamping on DOM/value mutation** (2–3 residual across
  `selection-start-end-extra` / `selection-after-content-change` /
  `selection-value-interactions`): editing a `<textarea>`'s child text or a form
  **reset** should *permanently* re-clamp the stored cursor at mutation time; we
  only clamp lazily in the getter, so a value that shrinks then grows re-exposes the
  old offset. Needs textarea content-mutation hooks + the form `reset()` selection
  step. Bankable but invasive.
- **`scrollLeft` preservation** (`selection.html` 1 fail) — layout/render cap.
- **Value sanitization detail** (`setRangeText` 8, `selection-value-interactions`
  5): fuller temporal/number/`email[multiple]` sanitization + a couple of
  setRangeText edge indices.
- The `setAttribute("type", …)` path does not run the type-change signal (only the
  IDL `type` setter does) — a real page rarely changes type via setAttribute, but
  it's a known gap.

**Next-best region:** the text-field-selection realm is now ~95%+; the residuals
above are the tail. Standing leads unchanged — shadow-tree scope discrimination
(aria-element 5 / CSSStyleSheet-constructable 6/13), the namespaced cascade-match
Rust lift (`crates/obscura-dom/src/selector.rs`, set-selectorText-namespace 0/5), or
sweep fresh `html/semantics/forms/*` ground (the input value model just built is
foundational for many more form tests).
