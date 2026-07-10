# Scroll 174 — The Shadowed Verdict

> *A popover born inside a shadow tree cried out to be shown, and the gatekeeper
> turned it away: "you are not connected to any document." But it was — its host
> stood firmly in the light. The gate was simply blind past the shadow's edge.*

**Realm:** Popovers inside shadow DOM — `html/semantics/popovers/popover-shadow-dom.html`
**Hold before:** 0/3 · **Hold after:** 3/3 ✅ (100%)
**Bonus:** `popover-light-dismiss.html` 23/33 → 25/33 (the two shadow-DOM light-dismiss subtests).
**Bounty:** **+5, ZERO regressions.**

---

## The gap

`popover-shadow-dom.html` had all three subtests failing on the **same** error:

```
Invalid on popover elements which aren't connected to a document.
```

`showPopover()` on a popover living inside a (declarative) shadow tree threw
`InvalidStateError`. Per HTML, "check popover validity" gates on the element being
**connected**, and *connected* is defined via the **shadow-including root** — a node
inside a connected host's shadow tree IS connected. But Obscura's connectedness check
used the plain `isConnected` getter, which walks only the `parentNode` chain and stops
dead at the shadow boundary (a shadow root's `parentNode` is `null`), so every popover
in a shadow tree read as disconnected.

Two follow-on tests (test4, test5) then exercised the **popover stack across
shadow-inclusive ancestors**: a popover nested inside a shadow-DOM ancestor popover must
be treated as *nested* (opening it must not close its ancestor; hiding the ancestor must
take it down too). The "topmost popover ancestor" computation used `Node.contains`, which
is likewise shadow-blind, so the nested popover looked unrelated and the ancestor got
wrongly closed.

## The fix (all `bootstrap.js`, scoped to the popover subsystem)

A shadow-including connectedness helper (`globalThis._shadowConnected`) already existed
for the focus path — it walks up crossing each shadow root to its `_shadowHost`. Three
scoped changes reused that idea:

1. **`_checkPopoverValidity`** — `if (!el.isConnected)` → `if (!globalThis._shadowConnected(el))`.
   The single change that took the first subtest green (and unblocked the other two from
   throwing). This mirrors how the command invoker already handled connectedness
   (`getRootNode({composed:true}).nodeType === 9`).

2. **`_topmostPopoverAncestor`** — new local `_shadowIncludes(anc, node)` (a shadow-including
   inclusive-descendant walk, mirroring `_shadowConnected`) replaces `p.contains(newEl)` and
   `p.contains(source)`. Now a popover whose host chain reaches an open ancestor popover is
   recognized as nested — so test4 (light-DOM popover1 ⊃ shadow host ⊃ popover2) and test5
   (invoker in shadow-tree popover1 targeting sibling popover2) keep both popovers open, and
   `hidePopover()` on the ancestor cascades correctly.

3. **`_runPopoverInvoker`** target-validity — `!target.isConnected` → `!globalThis._shadowConnected(target)`,
   so an invoker whose `popovertarget` resolves into a shadow tree still activates it
   (the id resolution already used `invoker.getRootNode().getElementById`, which is
   shadow-scoped correctly).

### Why not fix `isConnected` itself?

`Node.isConnected` is genuinely shadow-blind here and, per DOM spec, *should* be
shadow-including. But it is a very widely-used primitive (mutation/removal steps, custom
elements, focus fixup, dialog/popover removal). Making it globally shadow-inclusive is the
"correct" root fix in principle, but carries broad regression risk against the campaign's
zero-regression promise. The scoped `_shadowConnected` approach — the one the previous
knight's Caps/Next explicitly named — fixes the popover behavior exactly, with no blast
radius. `isConnected`-should-be-shadow-inclusive is left as a separate, deliberate,
regression-swept quest if ever wanted.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `popover-shadow-dom.html` | 0/3 | **3/3** ✅ |
| `popover-light-dismiss.html` | 23/33 | **25/33** |

**Zero-regression sweep (all held):** popover-attribute-basic 195, popover-invoking-attribute
1402, popover-light-dismiss-hint 9, popover-target-element-disabled 7, popover-focus 20/30,
qsa 1975, classlist 1420, createElement 147, dispatchEvent 25, all-global-events 375,
dialog-showModal 8/10 (pre-existing layout cap). The two `popover-light-dismiss` gains are
the shadow-DOM subtests (confirmed via `wpt_fails` — remaining fails are focus-move /
cross-document-pointer / hint-stack, untouched primitives).

## Caps / Next

Distinct primitives, freshest-first — the popover realm's remaining tail:

- **`popover-top-layer-combinations` 0/5** + **`-interactions` 4/9** — dialog + popover
  **top-layer ordering**: a `<dialog>`'s modal top layer and the popover top layer share one
  ordered layer; showing/hiding one must correctly relayer the other (currently they're
  independent stacks). This is the widest untouched popover lever.
- **cross-document pointerdown/up pairing** (`popover-light-dismiss`: "Pointer down in one
  document and pointer up in another shouldn't dismiss") — the `_popoverLightDismissDown`/`Up`
  state + `__obscura_trusted_input` bridge would need to span an iframe boundary.
- **popover Tab-focus** (`popover-focus` 20/30) — sequential focus navigation into/out of an
  open popover (the focus-move light-dismiss cases live here too).
- **DEV NOTE:** grep `_shadowConnected` / `_shadowIncludes` before touching popover
  connectedness or the ancestor computation; both are shadow-including on purpose.
