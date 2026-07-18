# Scroll 161 — The Inert Verdict ⚔️🚫

> *An inert subtree is closed for business: nothing in it can be focused, edited,
> or clicked — and a focused element that turns inert is quietly let go.*

**Quest #161 · Realm: inert (`inert/` — the `inert` attribute model)
· +13, ZERO regressions · session 2026-07-09**

## The gap

Quest #160 named **the `inert` model** as the next lever. The `inert/` realm was
mostly red: the `inert` IDL attribute did not exist (`el.inert` was `undefined`),
elements carrying the `inert` attribute (or descended from one) were still fully
focusable, and disabling focus by turning an ancestor inert never fired the focus
fixup rule.

Per HTML §inert, an element is **inert** if it — or an inclusive ancestor — carries
the `inert` content attribute. An inert node and its whole subtree are unfocusable,
uneditable, unselectable, and receive no input events. The `inert` IDL attribute is a
plain boolean reflection of the content attribute (so a node *inside* an inert subtree
that has no `inert` attribute of its own still reports `.inert === false`).

| Test | Before |
|------|:------:|
| `inert-node-is-unfocusable` | 1/6 |
| `dynamic-inert-on-focused-element` | 0/6 |
| `nested-inert-unfocusable` | 1/3 |

## The work — all `bootstrap.js`, three small changes

### (1) The `inert` IDL reflection

A one-word addition to the existing boolean-reflection table:

```js
const __reflectedBoolAttrs = { hidden: 'hidden', autofocus: 'autofocus', inert: 'inert' };
```

This gives `el.inert` a getter (`hasAttribute('inert')`) and setter (add/remove the
content attribute). The getter reflects only the element's **own** attribute — exactly
what "Elements inside of inert subtrees return false when getting inert" wants.

### (2) The `_isInert` predicate

```js
globalThis._isInert = function(el) {
  let n = el;
  while (n && n.nodeType === 1) {
    if (n.hasAttribute('inert')) return true;
    n = n.parentNode;
  }
  return false;
};
```

Walks self + inclusive ancestors for the `inert` attribute. (Modal-dialog / fullscreen
inertness — where everything *outside* the top-layer element becomes inert — is **not**
modelled here yet; only the explicit attribute.)

### (3) `_isFocusableArea` rejects inert nodes

```js
globalThis._isFocusableArea = function(el) {
  if (!el || el.nodeType !== 1 || !el.isConnected) return false;
  if (!globalThis._isRenderedForFocus(el)) return false;
  if (globalThis._isInert(el)) return false;      // ← new
  ...
```

This one line does the heavy lifting: it makes every inert element a `focus()` no-op,
and — because the **focus fixup rule** (Quest #160) already schedules an async re-check
of `_isFocusableArea(__obscura_focused)` on *any* attribute change while something is
focused — turning an element (or its ancestor) inert now automatically blurs the focused
descendant on the next frame. **No new fixup wiring was needed**: the general setAttribute
chokepoint from #160 covers `inert` for free.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `inert-node-is-unfocusable` | 1/6 | **6/6** |
| `dynamic-inert-on-focused-element` | 0/6 | **6/6** |
| `nested-inert-unfocusable` | 1/3 | **3/3** |

**+13, ZERO regressions.** Held (fresh-server sweep): qsa 1975, dispatchEvent 25,
insertBefore 39, dialog-open 3, dialog-close 5, popover-focus 11, popover-attribute-basic
159, tabindex-getter 120, focus-tabindex-order 1, tab-table-caption 6,
sequential-focus-navigation-after-disabled 1, focus-fixup-rule-one-no-dialogs 1/8.

## Caps — honest accounting

The rest of the `inert/` realm is capped on features **outside** the inert model:

- **`getSelection().toString()` over a subtree** — `inert-on-non-html` (14/27),
  `inert-with-modal-dialog-001/002` all detect inertness by selecting a subtree and
  reading `selection.toString()`, which returns `""` for us regardless of inertness. A
  selection-model gap, not an inert gap.
- **`window.find`** — `inert-with-modal-dialog-003` detects inertness via `window.find`,
  unimplemented.
- **Modal-dialog inertness** — the `inert-with-modal-dialog-*` tests also require that a
  modal dialog *escapes* ancestor inertness while marking everything outside itself inert.
  `_isInert` models only the explicit attribute; even once modelled, these tests stay
  capped on the selection/find detection above.
- **contenteditable typing** — `inert-node-is-uneditable` (2/3) needs real text input into
  a `contenteditable` to prove the non-inert control *is* editable.
- **click activation of form controls** — `inert-form-control` (0/1) needs a synthetic
  click to toggle a checkbox's `checked`.
- **hittest / reftests** — `inert-*-hittest`, `inert-inlines`, `inert-computed-style`
  (needs the CSS `interactivity` property / computed-style plumbing) need real layout/render.

## Next

The named ladder from #160 continues: **popover-in-taborder** (a shown popover's
contents join the tab order right after its invoker — unlocks `popover-focus-2` and the
popover-focus button-click family, paired with coordinate-invoker activation), then
**shadow-DOM focus retargeting** (`shadowRoot.activeElement`, host retarget). Modal-dialog
inertness is worth wiring into `_isInert` (a small, spec-correct extension) but its WPT
coverage is selection/find-gated, so it banks no greens yet.
