# Scroll 159 — The Tabbed Verdict ⚔️⇥

> *Sequential focus navigation: Tab order over tabindex + tree order, and the
> name-based `tabindex` default.*

**Quest #159 · Realm: focus (`sequential-focus-navigation-and-the-tabindex-attribute/`)
· +25, ZERO regressions · session 2026-07-09**

## The gap

For four straight quests the outgoing knight named **sequential focus navigation (Tab
order)** as the widest remaining focus lever — the whole `Tab` / `Shift+Tab` traversal
that `popover-focus-2` and the `sequential-focus-navigation-and-the-tabindex-attribute/`
suite depend on. That realm was almost entirely red:

| Test | Before |
|------|:------:|
| `focus-tabindex-order` | 0/1 (TIMEOUT) |
| `focus-tabindex-positive` | 0/1 |
| `focus-tabindex-zero` | 0/1 |
| `focus-tabindex-negative` | 0/1 |
| `focus-tabindex-default-value` | 1/2 |
| `tabindex-getter` | 106/120 |
| `tab-table-caption` | 0/6 |

The `#158` focus model shipped `_isFocusableArea`, `_performFocus`, and the autofocus
focusing steps — but nothing walked the document in **tab order** on a `Tab` keypress,
and `Element.prototype.tabIndex` returned −1 for elements that a real UA defaults to 0.

## The work

### (1) The name-based `tabindex` default (`bootstrap.js`)

`tabIndex` on a plain `<button>` read −1; the spec default is **0**. Per §dom-tabindex
the default value is a purely **element-name-based** table — it ignores
disabled/hidden/href/type, and is *distinct* from actual focusability. A new helper:

```js
globalThis._defaultTabIndexZero = function(el) {
  const ln = el.localName;
  switch (ln) {
    case 'a': case 'area': case 'button': case 'frame': case 'iframe':
    case 'input': case 'object': case 'select': case 'textarea':
      return true;
    case 'summary': {
      const p = el.parentNode;
      return !!(p && p.localName === 'details' && p.querySelector &&
                p.querySelector('summary') === el);   // only the details' *first* summary
    }
  }
  return false;
};
```

used in the absent/invalid branch of the getter (`return _defaultTabIndexZero(this) ? 0 :
-1`). Verified exhaustively against `tabindex-getter`'s 30-element table: a `<button
disabled>`, `<button hidden>`, and `<input type=hidden>` all still default to **0**; a
plain `<a>` (no href) and `<svg><a>` default to 0 (name-based) even though they are not
tab-focusable; `option`/`optgroup`/`embed`/`div`/`fieldset`/`output`/`slot`/`link` and a
non-details' `summary` default to −1. **tabindex-getter 106→120** (all 14 zero-default
rows), plus the `<button>` row of `focus-tabindex-default-value`.

### (2) `_sequentialFocusNavigation(backward)` (`bootstrap.js`)

The Tab traversal, layout-free:

```js
globalThis._sequentialFocusNavigation = function(backward) {
  const all = document.querySelectorAll('*');           // tree order
  const cands = [];
  for (const el of all)
    if (el.tabIndex >= 0 && globalThis._isFocusableArea(el)) cands.push(el);
  // el.tabIndex gives the effective value (explicit or name-based default); pairing it
  // with real focusability excludes a hidden input (default 0 but not focusable) AND a
  // negative-tabindex element (focusable but NOT sequentially focusable).
  if (!cands.length) return;
  const order = cands
    .map((el, i) => ({ el, ti: el.tabIndex, i }))
    .sort((a, b) => {                                    // positive first (asc), else 0 group
      const ka = a.ti > 0 ? a.ti : Infinity, kb = b.ti > 0 ? b.ti : Infinity;
      return ka !== kb ? ka - kb : a.i - b.i;            // ties keep tree order (stable)
    })
    .map((r) => r.el);
  const cur = __obscura_focused;
  const idx = cur ? order.indexOf(cur) : -1;
  let target;
  if (backward) target = idx <= 0 ? order[order.length - 1] : order[idx - 1];
  else target = (idx === -1 || idx === order.length - 1) ? order[0] : order[idx + 1];
  if (target) globalThis._performFocus(target);
};
```

Tree order (querySelectorAll order) stands in for the rendered order — correct for the
common in-flow case. From body (not in the list, `idx === -1`), forward → the first
element, backward → the last, matching a real UA starting from the viewport.

### (3) THE REAL FIGHT — `send_keys` must be ASYNC (`scripts/wpt_run.py` bridge)

The navigation *logic* was right from the first build — a direct CDP repro walked
`[btn9, btn5, btn0]` and wrapped perfectly, negatives skipped. Yet `focus-tabindex-order`
still **timed out**. The test:

```js
document.forms.fm.addEventListener("focus", function (evt) {
  results.push(evt.target.id);
  if (i >= 8) { t.step(() => assert_array_equals(results, expectation)); t.done(); }
  else { test_driver.send_keys(document.body, ""); }   // next Tab
  i++;                                                        // <-- runs AFTER send_keys
}, true);
```

Real `test_driver.send_keys` is **asynchronous** — it returns a promise and the key fires
on a later tick, so `i++` runs *before* the next focus event. Our bridge dispatched keys
**synchronously**, so the reentrant `send_keys` inside the handler recursed the handler
(btn9→btn5→btn0→btn9→…) *before* `i++` ever ran: `i` stayed 0, `t.done()` was never
reached, infinite recursion → timeout. (A stand-alone async repro with sleeps between
keys worked; a repro that called `send_keys` reentrantly from the focus handler reproduced
the infinite btn9/btn5/btn0 cycle exactly.)

The fix — microtask-defer each key so the handler unwinds (and `i++` runs) between keys:

```js
impl.send_keys = function(element, keys) {
  var p = Promise.resolve();
  for (var ch of String(keys)) {
    (function (ch) {
      p = p.then(function () {
        var m = mapKey(ch);
        fireKeyCmd({kind: 'key', type: 'keyDown', key: m.key, code: m.code || ''});
        fireKeyCmd({kind: 'key', type: 'keyUp', key: m.key, code: m.code || ''});
      });
    })(ch);
  }
  return p;
};
```

Also in the bridge: `fireKeyCmd` now stamps legacy **`keyCode`/`which`** (a `KEYCODES`
map — Tab === 9, Escape === 27, arrows 37–40, letters/digits by char code; every one of
these tests asserts `evt.keyCode === 9`), tracks **modifier state** (`_kbdMods`) across
the key stream so `Shift+Tab` carries `shiftKey`, and — on a Tab keydown that no listener
cancelled — calls `globalThis._sequentialFocusNavigation(shiftKey)` (mirroring the
existing Escape → `_processCloseRequest` hook).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `tabindex-getter` | 106/120 | **120/120** (+14) |
| `tab-table-caption` | 0/6 | **6/6** (+6) |
| `focus-tabindex-order` | 0/1 | **1/1** |
| `focus-tabindex-positive` | 0/1 | **1/1** |
| `focus-tabindex-zero` | 0/1 | **1/1** |
| `focus-tabindex-negative` | 0/1 | **1/1** |
| `focus-tabindex-default-value` | 1/2 | **2/2** |

**+25, ZERO regressions.**

## Zero-regression sweep (stash-proven at HEAD)

Baselines measured with the change stashed, then re-measured restored:
`tabindex-focus-flag` was **already 35/35** (not claimed); `popover-focus` held at 11/30
(no change). The deferred `send_keys` still drives Escape close-requests —
**dialog-canceling 1/1 held**. Also held: qsa 1975, Node-insertBefore 39,
EventTarget-dispatchEvent 25, DOMImplementation-createDocument 434, structured-clone 141,
popover-attribute-basic 159, popover-invoking-attribute 1400, toggleevent-interface 39,
popover-light-dismiss 15, on-popover-behavior 28, dialog-open 3/3, dialog-close 5/5,
on-dialog-behavior 104, button-type-behavior 23.

## Caps / Next

- **`popover-focus-2`** (could-not-run/hang) + the popover-focus **button-click / corner
  cases** families need **popover-in-taborder** logic: a shown popover's contents join the
  tab order *right after its invoker* (spec's "popover focus navigation"), which the flat
  tree-order collection here does not model — plus coordinate-invoker activation.
- **`sequential-focus-navigation-after-disabled`** (0/1) needs the **focus fixup rule**:
  when the currently-focused element becomes `disabled` (or hidden/removed), focus resets
  away from it. A small `disabled`-setter hook.
- **Shadow-DOM focus retargeting** (`shadowRoot.activeElement`, host retarget) and the
  **`inert`** model remain unbuilt (they gate `dialog-focusing-steps-inert`,
  `focus-after-close` shadow subtests).

**Next:** the focus fixup rule (small, self-contained), then `inert`, then popover-in-taborder /
shadow-DOM focus retargeting.

**DEV NOTE:** when a test that *drives input* **hangs** instead of failing, suspect
**sync-vs-async** in the input bridge before the feature logic — a synchronous `send_keys`
breaks any test that does synchronous work (a counter, a state flip) after the call
expecting the key to fire on a later tick.
