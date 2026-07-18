# Scroll 160 — The Fixed-Up Verdict ⚔️🩹

> *The focus fixup rule: when the focused element stops being focusable, focus
> resets to the viewport — and a later Tab resumes from where it stood.*

**Quest #160 · Realm: focus (`interaction/focus/` — the focus fixup rule)
· +2, ZERO regressions · session 2026-07-09**

## The gap

Quest #159 shipped sequential focus navigation (Tab order) and named the **focus
fixup rule** as the next small, self-contained lever. When a focused element stops
being a focusable area — it is removed, `disabled`, `hidden`, loses its `tabindex` —
the UA must (HTML §focus-fixup-rule) unfocus it, move the focused area to the
viewport (so `document.activeElement` becomes `<body>`), and set the **sequential
focus navigation starting point** to that element so a subsequent Tab resumes from
its position rather than the document start.

Obscura had none of this: disabling the focused element left it stale as
`activeElement`, and a following Tab restarted from the top of the order.

| Test | Before |
|------|:------:|
| `sequential-focus-navigation-after-disabled` | 0/1 |
| `processing-model/focus-fixup-rule-one-no-dialogs` | 0/8 |

The target `after-disabled` test:

```js
target.disabled = false; target.focus();
assert_equals(document.activeElement, target);
target.disabled = true;
await new Promise(requestAnimationFrame);
await new Promise(requestAnimationFrame);
assert_not_equals(document.activeElement, target);   // fixup ran
await test_driver.send_keys(document.body, ""); // Tab
assert_equals(document.activeElement, third);         // resumed from target's slot
```

`first` has `tabindex=1`, `target` `tabindex=2` (now disabled), `third` `tabindex=3`.
Tab must land on **third** — proving the starting point was set to target's position,
not reset to the document start (which would pick `first`).

## The work — all `bootstrap.js`

### (1) The fixup executor + async scheduler

```js
let __obscura_seqFocusStart = null;      // HTML sequential-focus starting point
let __obscura_focusFixupPending = false;

globalThis._runFocusFixup = function() {
  const el = __obscura_focused;
  if (!el) return;
  el.dispatchEvent(new Event('blur',     { bubbles: false }));
  el.dispatchEvent(new Event('focusout', { bubbles: true  }));
  __obscura_focused = null;              // activeElement getter returns `body` when null
  __obscura_click_target = null;
  _dom("set_focus", "", "");
  __obscura_seqFocusStart = el;          // resume Tab from here
};

globalThis._scheduleFocusFixup = function() {
  if (__obscura_focusFixupPending) return;
  __obscura_focusFixupPending = true;
  requestAnimationFrame(() => {
    __obscura_focusFixupPending = false;
    const el = __obscura_focused;
    if (el && !globalThis._isFocusableArea(el)) globalThis._runFocusFixup();
  });
};
```

`activeElement` already returns `__obscura_focused || this.body`, so nulling focus is
all it takes to make `activeElement === document.body` — no explicit body-focus needed.

### (2) The triggers

- **Attribute changes → async.** At the end of `Element.setAttribute` /
  `removeAttribute`, gated on `if (__obscura_focused)` (near-free — focus is rarely
  set), call `_scheduleFocusFixup()`. The deferred callback re-checks focusability, so
  an unrelated attribute change is a no-op. This covers `disabled`, `hidden`,
  `tabindex` removal, `contenteditable`, etc. via one chokepoint.
- **Removal → synchronous.** At the `removeChild` removal site, after the tree op,
  `if (__obscura_focused && !__obscura_focused.isConnected) _runFocusFixup()`. Removal
  is the one *synchronous* fixup trigger per spec; `.remove()` routes through
  `removeChild`, so it is covered.

### (3) The sequential-focus starting point in `_sequentialFocusNavigation`

When the focused element is no longer a participating candidate (`idx === -1`) but a
starting point is set and still connected, resume from its recorded slot: pick the
first candidate whose `(tabindex, tree-order)` key falls **after** it (backward: the
last one before it), wrapping at the ends. `_performFocus` clears the starting point
on any genuine focus move, so it is single-use.

For `after-disabled`: candidates `[first(1), third(3)]` (target excluded — disabled);
starting point = target (key ti=2). Forward → first candidate with ti>2 → **third**. ✅

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `sequential-focus-navigation-after-disabled` | 0/1 | **1/1** |
| `processing-model/focus-fixup-rule-one-no-dialogs` | 0/8 | **1/8** (bonus) |

**+2, ZERO regressions** — stash-proven at HEAD (both targets 0 with the change
stashed; `focus-events` 0/0/2-other and `autofocus/first` 0/1 unchanged either way).
Held: qsa 1975, Node-insertBefore 39, dispatchEvent 25, createDocument 434,
Element-setAttribute 2/2, attributes 67/67, tabindex-getter 120, focus-tabindex-order
1/1, tab-table-caption 6/6, tabindex-focus-flag 35/35, popover-focus 11, light-dismiss
15, popover-attribute-basic 159, invoking-attribute 1400, toggleevent 39,
on-popover-behavior 28, on-dialog-behavior 104, dialog-open 3/3, dialog-close 5/5,
dialog-canceling 1/1, button-type-behavior 23.

## Caps / Next

- **`focus-fixup-rule-one-no-dialogs`** (1/8) is a genuine cap. Its 7 remaining subtests
  demand: (a) exact **"end of update the rendering"** fixup timing — the fixup must run
  *after* rAF callbacks *and* after ResizeObserver/IntersectionObserver within the same
  frame; our rAF-scheduled fixup runs *during* the first rAF batch, failing the test's
  "activeElement shouldn't have changed yet (rAF)" assertion. (b) **ResizeObserver must
  fire** on the previous frame (3 subtests wait on it — a RO-timing gap, not focus). (c)
  focusability predicates for **`visibility:hidden`**, **ancestor `fieldset[disabled]`**,
  and **`contenteditable=false`** transitions. Each is a separate lift; not worth forcing.
- The two `*.tentative.html` starting-point tests
  (`sequential-focus-navigation-starting-point`, `setSequentialFocusStartingPoint`) are
  tentative spec drafts — low priority.

**Next:** the **`inert`** model (gates `dialog-focusing-steps-inert`,
`dialog-autofocus-multiple-times`, and inert-subtree focus skipping), then
**popover-in-taborder** (a shown popover's contents join the tab order right after its
invoker — unlocks `popover-focus-2` + the popover-focus button-click family, alongside
coordinate-invoker activation), then **shadow-DOM focus retargeting**
(`shadowRoot.activeElement`, host retarget).
