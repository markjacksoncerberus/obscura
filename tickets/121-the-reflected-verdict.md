# Scroll 121 — The Reflected Verdict

**Realm:** ARIA IDL reflection (`html/dom/`) — `ARIAMixin` on `Element`
**Hold before:** aria-attribute-reflection 8/41
**Hold after:** aria-attribute-reflection **41/41**
**Bounty:** **+33.** Difficulty ⚔️

## The gap

`html/dom/aria-attribute-reflection.html` tests the WAI-ARIA **`ARIAMixin`** — the
family of IDL attributes (`role`, `ariaLabel`, `ariaChecked`, `ariaColCount`, …) that
each *reflect* an ARIA content attribute as a **nullable `DOMString`**. The semantics
per attribute are uniform:

- **getter** → the content attribute's value, or `null` when it is absent.
- **setter** → `null`/`undefined` removes the content attribute; anything else writes
  `String(value)`.

`bootstrap.js` only carried **8** hand-written accessors (`role`, `ariaLabel`,
`ariaRoleDescription`, `ariaChecked`, `ariaDisabled`, `ariaExpanded`, `ariaHidden`,
`ariaSelected`) — a stop-gap so Playwright's `getByRole`/`getByLabel` locators could
resolve. Every other `ariaXxx` property was simply absent, so the test read
`undefined` (33 fails: "expected … but got (undefined) undefined").

## The work (all additive in `bootstrap.js`, no `ops.rs`/Rust change)

Replaced the 8 hand-written accessors with a **table-driven definition** right after
the `Element` class. `__ariaReflectedAttrs` maps each IDL name to its content
attribute (`role`→`role`; every `ariaXxx`→`aria-xxx` — note the irregular folds the
spec mandates: `ariaAutoComplete`→`aria-autocomplete`, `ariaBrailleRoleDescription`→
`aria-brailleroledescription`, `ariaHasPopup`→`aria-haspopup`, `ariaPosInSet`→
`aria-posinset`, `ariaValueText`→`aria-valuetext`, …). A loop calls
`Object.defineProperty(Element.prototype, jsAttr, {...})` with the uniform
nullable-reflection getter/setter.

The full set (41): `role` + `ariaAtomic` `ariaAutoComplete` `ariaBrailleLabel`
`ariaBrailleRoleDescription` `ariaBusy` `ariaChecked` `ariaColCount` `ariaColIndex`
`ariaColIndexText` `ariaColSpan` `ariaCurrent` `ariaDescription` `ariaDisabled`
`ariaExpanded` `ariaHasPopup` `ariaHidden` `ariaInvalid` `ariaKeyShortcuts`
`ariaLabel` `ariaLevel` `ariaLive` `ariaModal` `ariaMultiLine` `ariaMultiSelectable`
`ariaOrientation` `ariaPlaceholder` `ariaPosInSet` `ariaPressed` `ariaReadOnly`
`ariaRelevant` `ariaRequired` `ariaRoleDescription` `ariaRowCount` `ariaRowIndex`
`ariaRowIndexText` `ariaRowSpan` `ariaSelected` `ariaSetSize` `ariaSort`
`ariaValueMax` `ariaValueMin` `ariaValueNow` `ariaValueText`.

The `testNullable` helper in the test exercises the full null/undefined contract per
property (set null → getter null + attribute removed; set undefined → same), which the
uniform setter satisfies for free.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `html/dom/aria-attribute-reflection.html` | 8/41 | **41/41** ✅ |

**+33.** Zero regressions: qsa 1975, Element-classlist 1420, Document-createElement 147,
Node-properties 726, Element-getElementsByTagName 19, selectorSerialize 23 — all
unchanged.

## Caps / Next

- **`html/dom/aria-element-reflection.html` 5/27** is the sibling and the next lead —
  but a **separate, larger lift**. It covers the *Element-typed* ARIA relationship
  reflections: single-element (`ariaActiveDescendantElement`→`aria-activedescendant`,
  `ariaErrorMessageElements`/`aria-errormessage`, `aria-details`) and
  **`FrozenArray<Element>`** (`ariaLabelledByElements`→`aria-labelledby`,
  `aria-controls`, `aria-describedby`, `aria-flowto`, `aria-owns`). These need the
  "explicitly set attr-element" internals: getter resolves IDs to elements
  (first-in-tree-order), setter writes the element's `id` (or `""` when it isn't the
  first element with that ID), and an internal element list that survives ID changes.
  The test is **shadow-DOM-heavy (58 `shadow`/`attachShadow` references)** — a large
  share of the 22 fails are shadow-tree scoping rules ("crossing into a shadow tree is
  disallowed", reparenting hides the reference, retargeting) that are genuine caps
  without shadow-tree style/scope plumbing. Realistic winnable slice is the non-shadow
  ID-resolution + FrozenArray basics; budget it as its own quest.
