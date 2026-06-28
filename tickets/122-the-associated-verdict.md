# Quest #122 — The Associated Verdict

> **Realm:** ARIAMixin *element* reflection — `html/dom/aria-element-reflection.html`
> **Hold:** 5/27 → **22/27** (+17)
> **Difficulty:** ⚔️⚔️
> **Status:** ✅ SECURED (2026-06-28). All additive in `bootstrap.js` — no Rust.

## The gap

Quest #121 secured the ARIAMixin *string* family (`role`, `ariaLabel`, … as nullable
`DOMString`s). Its named sibling, `aria-element-reflection.html`, exercises the **element**
half: IDL attributes that reflect an *element reference* — `ariaActiveDescendantElement`
(single `Element?`) — or a **frozen array** of them — `ariaControlsElements`,
`ariaDescribedByElements`, `ariaDetailsElements`, `ariaErrorMessageElements`,
`ariaFlowToElements`, `ariaLabelledByElements`, `ariaOwnsElements`
(`FrozenArray<Element>?`). None of these existed → 22 of 27 subtests red.

Note: only the plural `ariaErrorMessageElements` exists (the test asserts the singular
`ariaErrorMessageElement` is **not** defined).

## The model (HTML "attr-associated elements")

Each attribute has two ways an association is established:

- **Explicit** — assigned via the IDL setter. The raw `Element` refs are stashed in
  `el._explicitAria[contentAttr]` and the content attribute is set to the **empty string**
  (the spec never serialises the id back). An explicit association **wins** over the
  content attribute and **survives** id changes and reparenting.
- **Computed** — parsed from the content attribute's id token(s) via `getElementById`
  (first-in-tree-order). Used only when no explicit ref exists.

Writing or removing the content attribute **directly** (`setAttribute`/`removeAttribute`)
resets any explicit association, so the getter falls back to computing from the attribute.
This is the `__ariaResetExplicit(el, attr)` hook, called from `setAttribute`/`removeAttribute`
gated on `__ariaElementContentAttrs.has(qname)`.

A reference is only **exposed** (returned by the getter) when it shares a *valid scope*
with the host — here modelled as **"host and ref are both connected to the same
document"** (`__ariaElemValid`). This correctly handles:
- a not-yet-inserted ref → invalid until appended (`getter === null`, content attr `""`);
- a cross-document ref → invalid until adopted into the host's document;
- a removed ref → dropped from a `FrozenArray` result, restored when re-inserted.

The `FrozenArray` getter **caches by element-list identity**: it recomputes the list each
call and reuses the previously-frozen array object when the list is unchanged, satisfying
the IDL caching invariant (`el.ariaControlsElements === el.ariaControlsElements`).

Setters type-check per WebIDL: single → TypeError unless `Element` or null; plural →
TypeError unless a `sequence<Element>` (a string / number / bare Element / `[1,2,3]` all
throw).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `html/dom/aria-element-reflection.html` | 5/27 | **22/27** |

Subtests turned green: the per-attribute reflection blocks (aria-activedescendant,
-errormessage, -details, -labelledby, -controls, -describedby, -flowto, -owns), the
duplicate-id / changed-id / deletion / not-first-in-order cases, the
not-yet-inserted and cross-document reference cases, reparenting within scope, and the
type-error checks.

## Cap / Next

The **5 residual** failures all require real **shadow-tree scope discrimination**:
- "Setting an element reference that crosses into a shadow tree is disallowed, but one in
  a shadow-inclusive ancestor is allowed."
- "Reparenting an element into a descendant shadow scope hides the element reference."
- "Reparenting referenced element cannot cause retargeting of reference."
- "Moving explicitly set elements across shadow DOM boundaries."
- "Moving explicitly set elements around within the same scope, and removing from the DOM."

The spec distinguishes *crossing INTO* a shadow tree (disallowed) from *referencing a
shadow-INCLUSIVE ANCESTOR* (allowed) — a distinction the "same document + connected"
validity model cannot express. Winning these needs shadow-root scope walking (the same
shadow-scoping lift that gates `CSSStyleSheet-constructable` 6/13 and `-duplicate` 2/4).

## Zero-regression sweep

aria-attribute-reflection 41/41, attributes 67/67, ParentNode-querySelector-All 1975,
Element-classlist 1420, Document-createElement 147, Node-properties 726,
Element-getElementsByTagName 19, MutationObserver-attributes 42, Element-setAttribute 2/2,
css/cssom/selectorSerialize 23 — all unchanged. (The `setAttribute`/`removeAttribute`
hot paths gained one `Set.has(qname)` guard; verified no MutationObserver / CSSOM
fallout.)
