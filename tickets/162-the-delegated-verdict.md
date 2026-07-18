# Scroll 162 — The Delegated Verdict

> *Shadow-DOM focus retargeting + `delegatesFocus`.* Quest #161's named next-lever
> after popover-in-taborder was **shadow-DOM focus retargeting** (`shadowRoot.activeElement`,
> host retarget). We took it — and the `delegatesFocus` focus-delegation model came along
> for the ride, since both are the same layer.

Realm: `shadow-dom/focus/`. All changes in `crates/obscura-js/js/bootstrap.js`.

## The gap

The focus model tracked a single `__obscura_focused` element but knew nothing about
shadow trees:

1. **`document.activeElement`** returned `__obscura_focused` verbatim — so when focus
   was inside a shadow tree it exposed the shadow-internal node instead of the topmost
   **shadow host** (a shadow-boundary leak).
2. **`ShadowRoot.activeElement`** was a hard `return null` — a shadow root never
   reported its own active element.
3. **`delegatesFocus`** was stored on the shadow root but did nothing: `host.focus()`
   on a `delegatesFocus` host tried to focus the host itself (usually a no-op), never
   delegating into the shadow tree.
4. A latent blocker: **`Node.isConnected` is not shadow-including** — it stops walking
   at the shadow root (a fragment with no `parentNode`), so every shadow-tree element
   reported `isConnected === false`. `_isFocusableArea` gates on `isConnected`, so *no*
   shadow-tree element was ever considered focusable — the delegate could never resolve.

## The work

**Retargeting-based `activeElement` (features already existed).** The DOM §2.9 event
helpers `_retarget(A, B)`, `_nodeRoot`, `_shadowIncAncestor`, `_isSR` were already in
the tree (for event dispatch). `activeElement` is *exactly* a retargeting:

- `document.activeElement` = `__obscura_focused ? _retarget(focused, document) : body`
  — the retarget climbs out of every shadow tree to its host until the root is the
  document, landing on the topmost host.
- `ShadowRoot.activeElement` = `c = _retarget(focused, this); c && _nodeRoot(c) === this ? c : null`
  — the active element of a root iff the retargeting lands a node whose (non-composed)
  root is that shadow root (covers focus in this tree *and* in a nested shadow tree
  whose host lives here).

**Shadow-including connectedness, tightly scoped.** Rather than touch the hot global
`isConnected` getter (used everywhere), added `globalThis._shadowConnected(el)` — the
same walk but jumping a shadow root to its host — and used it **only** in
`_isFocusableArea`. Provably inert for non-shadow pages (identical to `isConnected`
when no shadow root is on the ancestor chain). *(The global `isConnected` bug remains;
fixing it root-cause is a separate quest with its own regression sweep — see Caps.)*

**The focus delegate (`_shadowFocusDelegate`).** HTML "get the focus delegate": walk
the host's shadow **tree** in tree order collecting focusable candidates; each is the
actual element to focus, tagged with whether it carries `autofocus`. Rules the tests
pin down:

- **Slotted light-DOM content is never a candidate.** We walk the shadow root's own
  element descendants (`.children`), and a `<slot>`'s children are its *fallback*, not
  its assigned nodes — so slotted content simply never appears. (`focus-method-delegatesFocus`
  asserts the delegate lands on a later shadow-tree `belowSlots`, skipping earlier
  *slotted* focusables; `focus-autofocus` asserts a slotted `autofocus` is ignored.)
- **Nested shadow hosts:** descend **only** if the nested host also `delegatesFocus`
  (its own resolved candidates splice in at its tree position, so autofocus preference
  is global). A non-delegating nested host and its shadow content are skipped entirely.
- **Autofocus wins:** the delegate is the first candidate with `autofocus` in tree
  order, else the first focusable candidate. Null (→ `focus()` no-op) when the shadow
  tree has no delegate.

**`focus()` / `blur()` wiring.**
- `focus()`: if `this` is a `delegatesFocus` host, and focus is *not* already inside
  its shadow-including subtree (already-inside → keep it), delegate to
  `_shadowFocusDelegate(this)`; null delegate → no-op (the host is not focused itself).
- `blur()`: clears focus delegated into the host's **shadow tree**
  (`_shadowIncAncestor(this._shadowRoot, focused)`), dispatching blur/focusout on the
  actually-focused element — but a slotted light-DOM element focused *through* the host
  is left alone (its root is the document, not the shadow root).

## Results (measured, `--features render`, fresh server)

| Test | Before | After | Δ |
|------|:------:|:-----:|:--:|
| `focus-method-delegatesFocus.html` | 1/15 | 15/15 | +14 |
| `DocumentOrShadowRoot-activeElement.html` | 2/6 | 6/6 | +4 |
| `focus-method-with-delegatesFocus.html` | 4/8 | 8/8 | +4 |
| `focus-autofocus.html` | 1/5 | 5/5 | +4 |
| `blur-on-shadow-host-delegatesFocus.html` | 1/2 | 2/2 | +1 |
| `delegatesFocus-tabindex-change.html` | 0/1 | 1/1 | +1 |
| **Total** | | | **+28** |

**ZERO regressions** — stash-proven at HEAD. Same-session A/B (change stashed → rebuilt
→ baselined → popped → rebuilt → re-measured), all identical: qsa 1975, dispatchEvent 25,
insertBefore 39/40, event-composed 9, event-composed-path 11, attachShadow 6, popover-focus
11/30, dialog-open 3, ShadowRoot-delegatesFocus 3/3. The change is provably inert on
non-shadow pages: `_shadowConnected` ≡ `isConnected`, `_retarget(focused, document)` ≡
`focused`, and the `focus()`/`blur()` delegate branches only fire for `delegatesFocus`
hosts, all when no shadow root sits on the chain.

## Caps / Next

- **`focus-selector-delegatesFocus.html` (6/12)** and the `focus-pseudo-on-shadow-host-*`
  family need the `:focus`/`:focus-within` pseudo-classes to match a shadow host when a
  delegated descendant is focused — a **selector/render** gap, not a focus-model one.
- **`focus-navigation/*` and `focus-tab-on-shadow-host`** need **sequential focus
  navigation to cross shadow/slot boundaries** (flat-tree tab order through slots and
  delegating hosts) — the natural extension of Quest #159's Tab model into shadow trees;
  most are `test_driver.send_keys`-driven (the async input bridge already exists).
- **Root-cause `isConnected`:** the global getter should be shadow-including per DOM.
  Deferred as its own quest (hot path, wide regression surface) — `_shadowConnected`
  covers the focus path for now.
- `focus-shadowhost-display-none` needs real layout (display:none host reftest-ish).

**NEXT:** shadow-DOM **sequential focus navigation** (flat-tree Tab order across
slots + delegating hosts) — reuses #159's `_sequentialFocusNavigation` + this quest's
delegate walk; then the `:focus`/`:focus-within`-on-host selector matching.
