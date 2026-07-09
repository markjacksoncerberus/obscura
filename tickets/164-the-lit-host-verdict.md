# Quest #164 — The Lit-Host Verdict

**Realm:** `shadow-dom/focus/` + `css/selectors/` — `:focus`/`:focus-within` on shadow hosts
**Hold before:** `focus-pseudo-matches-on-shadow-host` 8/20, `focus-selector-delegatesFocus` 6/12,
`focus-within-removal` 0/1, `focus-within-focus-move` 0/1
**Bounty:** **+19** (12 + 6 + 1)

## The gap

Quest #163 left a named lever: **`:focus`/`:focus-within`-on-shadow-host selector matching**. Our Tab
navigation (#163) and `activeElement` retargeting (#162) already landed focus correctly inside shadow
trees, but the CSS selectors that *observe* that focus were blind to it:

- `host.matches(':focus')` returned **false** even while a descendant in the host's shadow tree held
  focus. Per HTML "has the focus", a shadow host matches `:focus` whenever the focused element is a
  shadow-including descendant of its shadow tree (for **all** modes — open/closed, delegatesFocus on/off —
  and for every host on the chain up to the top). This is the rule `focus-pseudo-matches-on-shadow-host`
  and `focus-selector-delegatesFocus` pin down.
- `:focus-within` was in the "syntactically valid but never matched" allowlist — it parsed to
  `PseudoClass::Other("focus-within")` and matched nothing, even in the light DOM.

**Why the Rust selector engine couldn't see it:** the shadow tree lives entirely in JS
(`bootstrap.js`). In the Rust arena a shadow root is a **detached DocumentFragment** — real `_nid`s for
its subtree, but the fragment's `parent` is null, so nothing links a shadow node up to its host. The
matcher checks `tree.focused() == node_id`; a focused shadow input's nid never equals the host's, and
there's no parent path from the input to the host to walk.

## The fix — three pieces

### 1. The focus-host chain (JS → Rust sync)
`bootstrap.js` `_focusShadowHosts(el)` walks the focused element's parent chain, and each time it bottoms
out at a shadow root (`!parentNode && _isSR`) jumps to that root's `_shadowHost`, collecting the host nids
crossed. **Slotted light-DOM content crosses no shadow root** (its parent chain stays in the light tree),
so its host is correctly *not* collected — matching subtest "…focused element assigned to a slot" where
the host must NOT match.

`_syncRustFocus(el)` centralises the sync: `_dom("set_focus", el._nid, hostChain.join(","))`. The
`set_focus` op (previously ignoring arg2) now parses arg2 into `focus_hosts`. `Tree`:
- `focused == self.node_id || is_focus_host(self.node_id)` drives `:focus`.
- `set_focus(None)` clears `focus_hosts` too.

**Stale-chain fix.** The chain is a snapshot at focus time. When a move repositions the focused element
out of (or into) a shadow tree, `matches(':focus')` must reflect the new ancestry. `appendChild` /
`insertBefore` re-sync the chain right after the low-level tree op — **gated on a JS-only
`_shadowIncAncestor(movedNode, focused)` check**, so a page building DOM while an *unrelated* element is
focused pays no bridge op. This is what turns the "tree structure changes" subtests green.

### 2. `:focus-within` (real matching)
New `PseudoClass::FocusWithin` (parsed, serialized, removed from the not-matched allowlist).
`Tree::focus_within(id)` returns true iff `id` is a light-tree inclusive ancestor of the focused element
**or** of any host in `focus_hosts` (the host chain carries the cross-shadow reach the Rust tree can't
walk itself). Covers light-DOM `:focus-within` and the shadow-host case in one predicate.

### 3. Focus update steps (`_performFocus` reordering)
The old `_performFocus` fired `blur`/`focusout` on the previous element **while it was still focused**,
then blindly committed the new target. That leaves stale state when a handler reacts:
- `focus-within-removal`: `container.focus()` → input's `focusout` removes `container` → old code set
  `focused = container` (a removed node). Now: unfocus the old element FIRST (activeElement reads `<body>`
  during blur/focusout, spec-correct), then — if a handler removed `el` — bail (`_isFocusableArea(el)`
  false → focus lands nowhere).
- General reentrancy: if a handler ran a nested `focus()`, `__obscura_focused !== null` after the events
  → that nested operation won; don't clobber it.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `shadow-dom/focus/focus-pseudo-matches-on-shadow-host.html` | 8/20 | 20/20 | +12 |
| `shadow-dom/focus/focus-selector-delegatesFocus.html` | 6/12 | 12/12 | +6 |
| `css/selectors/focus-within-removal.html` | 0/1 | 1/1 | +1 |
| **Total** | | | **+19** |

New Rust unit test `selector::tests::focus_within_and_shadow_host_focus` locks in `:focus` (element +
host chain) and `:focus-within` (ancestors + host chain) matching.

## Zero-regression sweep (all at baseline)
qsa 1975, classlist 1420, dispatchEvent 25, insertBefore 39/40, focus-method-delegatesFocus 15,
focus-method-with-delegatesFocus 8, focus-autofocus 5, blur-on-shadow-host-delegatesFocus 2,
DocumentOrShadowRoot-activeElement 6, ShadowRoot-delegatesFocus 3, delegatesFocus-tabindex-change 1,
sequential-focus-navigation-after-disabled 1, popover-focus 11/30.

## Caps (honest)
- **`focus-pseudo-on-shadow-host-1/2/3`** — `rel="match"` **reftests**: they paint `#host:focus{background:green}`
  and compare against a green-square reference. We have no render comparison → genuinely unwinnable, not a
  failure. (These show as could-not-run because they aren't testharness tests.)
- **`focus-tab-on-shadow-host`** (0/1) — asserts a *visual* `:focus` outcome after a `send_keys` Tab; needs
  render + driver.
- **`focus-within-focus-move`** (0/1) — hinges on `<input onblur="outside.focus()">`. Probed empirically:
  **`onblur` content-attribute handlers fire nothing today** (`window.__blurRan === 0`). This is a
  GlobalEventHandlers content-attribute-reflection gap (compile `on*=""` into an event handler), NOT a
  focus/selector issue. Its `:focus-within` selector half already works here (proved by
  `focus-within-removal`). → **Next quest.**
- The numbered `css/selectors/focus-within-001..013` and `focus-within-shadow-*` are reftests too.

## Next leverage
1. **GlobalEventHandlers content-attribute reflection** — `onclick`/`onblur`/`onfocus`/… on an element's
   content attribute should compile to `el.on<type>` and fire on dispatch. Unlocks `focus-within-focus-move`
   and a broad tail of event tests that use inline handlers. (Confirm `el.on<type> = fn` IDL setter path
   too.) Wide surface → scope tight + regression-sweep the event realms.
2. **Popover-in-taborder** (still open from #161) — a shown popover's contents join Tab order right after
   its invoker.
