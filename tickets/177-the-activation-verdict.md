# Quest #177 — The Activation Verdict (+13)

**Realm:** `html/semantics/forms/the-input-element/checkbox.html` + `radio.html`
**Result:** checkbox 2/6 → **6/6**, radio 3/12 → **12/12** (both 100%). **ZERO regressions.**
**Session:** 2026-07-10

## The gap

The checkbox and radio input-element tests exercise the HTML **activation
behavior** of a checkbox/radio — the pre-activation toggle, the canceled-activation
revert, and the `input`→`change` event pair — plus, for radio, **radio button
group mutual exclusion**. Obscura's `.click()` had a partial pre-activation (it
toggled a checkbox and set a radio checked) but:

- **never fired `input`/`change`** after a successful click (checkbox t1, radio t1
  all failed at the first assertion — `input_fired` never became true);
- **never reset `indeterminate`** in pre-activation, nor restored it on cancel
  (checkbox t3–t6);
- **didn't run canceled-activation for radio** (restoring the previously-checked
  group member — radio t5);
- **didn't no-op for a disabled control** (checkbox t2, radio t3/t4 assert no
  `input`/`change` fires on a disabled checkbox/radio).

And the deeper root cause behind 8 of radio's 9 fails: **the `checked` IDL setter
had no radio-group exclusivity.** Setting one radio `checked = true` left its
same-group siblings checked, so "only one control of a group can be checked",
"non-ASCII group names", "changing the name", "moving in/out of a form", and the
three "different groups don't affect each other" tests all failed — these set
`.checked` directly, never even reaching `.click()`.

## The fix (`bootstrap.js`)

**1. Radio group exclusivity on the `checked` setter.** `set checked(v)` now, when
a radio's checkedness becomes `true`, unchecks every OTHER member of its group
(via `_dom("set_checked", …, "0")` directly — setting to false never triggers
exclusion, so there is no re-entrancy). The group is computed by the existing
`_cvRadioGroup` (same tree root, same non-empty `name`, same form owner). This one
change carries all 8 group tests — they observe `.checked` after direct IDL sets.

**2. `_cvRadioGroup` now uses the FULL form-owner algorithm** (`_ceiFormOwner`,
which honors the `form=` id-reference attribute) instead of the ancestor-only
`_cvFormOwner`. The "moving radio in/out of a form" test associates radios to a
`<form id=testform>` by `form=testform`; ancestor-only owner resolution grouped
them wrong. (Constraint-validation `valueMissing` still 78/78 — its fixtures use
ancestor forms, where both resolvers agree.)

**3. Full click activation behavior in `.click()`:**
- **Disabled checkbox/radio → complete no-op** (`_cvIsDisabled` gate) — the
  synthetic click activation steps are inert for a disabled form control, so no
  event and no toggle fire.
- **Legacy-pre-activation**: a checkbox clears `indeterminate` then toggles
  `checked`; a radio remembers its group's currently-checked member then sets
  `checked = true` (exclusivity from fix #1 unchecks the group).
- **Legacy-canceled-activation** (click `preventDefault`-ed): a checkbox restores
  the saved `checked` + `indeterminate`; a radio unchecks itself and re-checks the
  remembered previous member.
- **Input-element activation** (not canceled): fire a trusted, bubbling,
  non-cancelable `input` event then a `change` event via the new
  `_fireInputThenChange(el)` helper (dispatched through `_dispatchSpec` with
  `ev.isTrusted = true`, so the events are trusted while the `.click()`-initiated
  click event itself stays untrusted — exactly what the tests assert).

Checkbox/radio return right after the events — they don't fall through to the
link/submit/reset/invoker activation (which is unchanged, just de-indented out of
the old `if (!cancelled)` block).

## Results & sweep

checkbox `2/6 → 6/6`, radio `3/12 → 12/12` (**+13**). Zero regressions:
form-validation-validity-valueMissing 78/78, select-validity 5/6 (pre-existing
cap), popover-invoking-attribute 1402, popover-light-dismiss 25, popover-focus
30/30, EventTarget-dispatchEvent 25, qsa 1975, DOMTokenList-Iterable 6/6,
Element-matches 669, createElement 147, type-change-state 380/380.

## Caps / Next

- **No name-change / form-owner-change re-evaluation of an already-checked radio.**
  Exclusivity runs on the `checked` setter (checkedness → true), which covers every
  fixture here. Per spec, changing a checked radio's `name` or form owner should
  also re-run selection; no test exercises that, so it's deferred (grep `set checked`
  / `_cvRadioGroup` before touching radio grouping).
- **No parse-time group de-duplication.** Initial checkedness comes straight from
  the `checked` content attribute; if a page ships two `checked` radios in one group
  they'd both read checked until one is re-set. No fixture does this.
- Next popover levers still open: **cross-document pointerdown/up pairing**
  (`popover-light-dismiss` ~8 fails) and **scripting-errors exact line/col**.
