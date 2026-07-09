# Scroll 163 — The Flattened Verdict

> *Flat-tree scoped sequential focus navigation (Tab order across shadow trees and
> slots).* Quest #162's named next-lever was **shadow-DOM sequential focus navigation**
> (flat-tree Tab across slots + delegating hosts). We took it — rewriting the core
> `_sequentialFocusNavigation` to walk the **flat tree** and honour **focus navigation
> scopes**, so Tab now descends shadow trees and follows slot assignment.

Realm: `shadow-dom/focus-navigation/` (+ the `shadow-dom/focus/focus-tabindex-order-shadow-*`
family). All changes in `crates/obscura-js/js/bootstrap.js` — one function rewritten.

## The gap

Quest #159 gave us Tab order, but `_sequentialFocusNavigation` gathered its candidates
from `document.querySelectorAll('*')` — the **light DOM only**. It knew nothing about:

1. **Shadow trees** — a shadow host's focusable shadow contents were never in the Tab
   order (the host was an opaque leaf).
2. **Slots** — a slotted light-DOM element was Tab-visited at its *light-DOM* position,
   not its *flat-tree* (slotted) position, and slot fallback content was invisible.
3. **Focus navigation scopes** — tabindex ordering is **per-scope** (the document, each
   shadow tree, each `<slot>`); a shadow host or slot splices its scope's members in at
   the owner's own tabindex position. The flat global sort got this wrong across
   boundaries.

## The work

`_sequentialFocusNavigation` now builds the **flat-tree tab order** once per keypress,
then moves ±1 from the focused element. Three pieces:

**Flat-tree children (`flatChildren`).** The scope-relative children of a node: a shadow
host exposes its shadow root's children; a `<slot>` in a shadow tree exposes its assigned
slottables (its own fallback content when nothing is assigned — reusing the existing
`_findSlottables`); a shadow root or ordinary node exposes its child nodes. A host's
*light* children are never walked directly — they reach the flat tree only through the
`<slot>`s inside the shadow tree.

**Per-scope member collection (`collect`) + ordering (`emitScope`).** Within one focus
navigation scope, members are gathered in flat-preorder (descending non-owner subtrees),
then stably sorted by tabindex (positive ascending, then the 0/auto group in flat order).
A **scope owner** (shadow host / slot) is a member too: it is emitted (if itself
focusable) at its tabindex position, and its inner scope is then emitted recursively at
that same position. This is what makes a slotted element sort by *its own* tabindex
within the slot's scope, and a shadow host's contents appear right where the host sits in
its parent's order.

**The scope rules the tests pin down:**

- **A shadow host with `delegatesFocus`** is never itself a sequential stop — only its
  shadow contents are navigated (the host node is not emitted, but its scope is
  descended).
- **A host / slot with an *explicit* negative tabindex** removes its whole scope from
  sequential navigation. An *omitted* tabindex (whose `tabIndex` getter also reports −1)
  does **not** — the shadow contents stay navigable. The discriminator is
  `hasAttribute('tabindex') && tabIndex < 0`, exactly matching the
  `focus-navigation-with-delegatesFocus` matrix (omitted-−1 navigates the shadow;
  explicit-−1 skips it entirely) and the `focus-with-negative-index` `<slot tabindex=-1>`.

The reverse (Shift+Tab) traversal is just the reverse of the built order; the fixup
sequential-focus **starting-point** resume (Quest #160) is preserved, now keyed on a
flat-preorder position map instead of the old querySelectorAll index.

I hand-traced the deeply-nested `focus-navigation.html` (document → x-foo shadow → x-bar
shadow → two interleaved slots s1/s2, with tabindex values scrambled across scopes)
through the algorithm and it reproduced the fixture's ideal order
`[i0, j5, xbar, k1, k0, j1, j2, j3, j4, i1, i2, j0, j6]` exactly before writing a line of
the measurement loop.

## The results

**`shadow-dom/focus-navigation/` (+26):**

| Test | Before | After |
|------|:------:|:-----:|
| focus-navigation | 0/1 | **1/1** |
| focus-navigation-with-delegatesFocus | 4/16 | **16/16** |
| focus-navigation-slot-fallback | 0/1 | **1/1** |
| focus-navigation-slot-fallback-default-tabindex | 0/1 | **1/1** |
| focus-navigation-slot-nested | 0/1 | **1/1** |
| focus-navigation-slot-nested-2levels | 0/1 | **1/1** |
| focus-navigation-slot-nested-delegatesFocus | 0/1 | **1/1** |
| focus-navigation-slot-nested-fallback | 0/1 | **1/1** |
| focus-navigation-slot-shadow-in-fallback | 0/1 | **1/1** |
| focus-navigation-slot-shadow-in-slot | 0/1 | **1/1** |
| focus-navigation-slots | 0/1 | **1/1** |
| focus-navigation-slot-with-tabindex | 0/1 | **1/1** |
| focus-navigation-web-component-radio | 0/1 | **1/1** |
| focus-reverse-unassigned-slot | 0/1 | **1/1** |
| focus-with-negative-index | 0/2 | **1/2** |

**`shadow-dom/focus/focus-tabindex-order-shadow-*` (+11):** `-zero`, `-zero-delegatesFocus`,
`-zero-host-one`, `-zero-host-negative`, `-zero-host-not-set`, `-zero-host-not-set-scrollable`,
`-zero-host-scrollable`, `-slot-one`, `-varying-tabindex`, `-varying-delegatesFocus`,
`-negative-delegatesFocus` all 0/1 → **1/1** (stash-A/B verified — these were red on the
prior binary).

**+37 total, ZERO regressions** (stash A/B on the shared `_sequentialFocusNavigation`
rewrite: baseline binary measured with the change stashed, then popped + rebuilt +
re-measured). Held: qsa 1975, dispatchEvent 25, insertBefore 39/40, and every #159/#160/#162
focus test — focus-tabindex-order 1, tabindex-getter 120, tab-table-caption 6,
after-disabled 1, focus-fixup-rule-one 1/8, focus-method-delegatesFocus 15,
DocumentOrShadowRoot-activeElement 6, focus-method-with-delegatesFocus 8, focus-autofocus 5,
blur 2, delegatesFocus-tabindex-change 1, ShadowRoot-delegatesFocus 3, focus-selector-delegatesFocus 6.

## Caps / Next

- **`focus-with-negative-index` subtest 2 (1/2).** A Chromium regression test: after
  `.focus()` is placed *inside* an explicit-negative (excluded) shadow scope, Tab must
  navigate *within* that island and then exit to a specific neighbour (`host2 → j6`
  forward, `host1 → k0` backward). The exit neighbours match neither the parent scope's
  tabindex order nor pure flat-tree order — the island behaves as if inserted between
  `k0` and `j6`, which the "build one global order + index ±1" approach can't express.
  A faithful fix needs the genuinely-recursive scoped search (start in the focused
  element's own scope, climb to the owner's scope on exhaustion) rather than a flattened
  list. Deferred — one subtest, Chromium-specific ordering quirk.
- **`focus-tabindex-order-shadow-varying-tabindex-2` / `-3` (0/1 each).** Subtle
  multi-host ordering with a `tabindex=0` "forwarder" div and varying host tabindex; the
  failing assert is `expected <div></div> but got <div></div>` (indistinguishable empty
  divs). An edge case in cross-host ordering — deferred.
- **`:focus` / `:focus-visible` on a shadow host** (`focus-tab-on-shadow-host`,
  `delegatesFocus-highlight-sibling`, `focus-pseudo-*`, `focus-selector-delegatesFocus`
  6/12). Our Tab navigation now lands focus correctly, but these read `element.matches(':focus')`
  or a computed `backgroundColor` — a **selector/render** gap, not a navigation one.
- **Root-cause `isConnected`** remains non-shadow-including (Quest #162's `_shadowConnected`
  covers the focus path); still its own deferred quest.

**NEXT:** the `:focus` / `:focus-within`-on-shadow-host selector matching (would unlock
`focus-selector-delegatesFocus`, `focus-pseudo-*`, `focus-tab-on-shadow-host`,
`delegatesFocus-highlight-sibling` — a selector-engine lever, not a focus-model one), then
**popover-in-taborder** (a shown popover's contents join Tab order right after its invoker;
still open from Quest #161).
