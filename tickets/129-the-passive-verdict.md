# Quest #129 — The Passive Verdict

**Realm:** `AddEventListenerOptions.passive` — honored during event dispatch
**Files:** `crates/obscura-js/js/bootstrap.js` (no Rust)
**Result:** `dom/events/AddEventListenerOptions-passive.any.html` **2/5 → 5/5 (+3)**, zero regressions, no cap.

## The gap

#128 flagged the sibling tail: `AddEventListenerOptions-passive.any.html` at **2/5**.
Obscura read `passive` from the `addEventListener` options dict and stored it
per-listener (`list.push({ handler, capture, once, passive })`), but **never honored
it during dispatch**. A `preventDefault()` — or a legacy `returnValue = false` — from
inside a passive listener still set the event's canceled flag, so `dispatchEvent`
wrongly returned `false` and `event.defaultPrevented` was `true`.

Failing subtests:
- *preventDefault should be ignored if-and-only-if the passive option is true*
- *returnValue should be ignored if-and-only-if the passive option is true*
- *passive behavior of one listener should be unaffected by the presence of other listeners*
- *Equivalence of option values* (cascaded — see below)

## The spec primitive

DOM §dispatch "inner invoke" sets the event's **"in passive listener flag"** while a
listener whose `passive` is true is running. DOM §`preventDefault`: *"If this's in
passive listener flag is unset and this's cancelable attribute value is true, then set
this's canceled flag."* The legacy `returnValue` setter routes through the same step.
So a cancel attempt from a passive listener is silently a no-op.

Crucially the flag is **per-listener and transient** — set right before each listener
runs, cleared right after — so a non-passive listener later in the same dispatch (or
any post-dispatch code) can still cancel.

## The fix (all in `bootstrap.js`, no Rust)

Two small edits:

1. **`_invokeListeners`** (~line 4053) — around each listener invocation:
   ```js
   event._inPassiveListener = !!e.passive;
   try { … h.call(target, event) … } catch (err) { _reportError(err); }
   event._inPassiveListener = false;
   ```
   Set before the call, cleared after — so each listener sees only its own passive
   state, and the flag never leaks past dispatch.

2. **`Event.preventDefault` + `set returnValue`** (~line 13025) — gate the canceled flag
   on the new flag being unset:
   ```js
   set returnValue(v) { if (v === false && this.cancelable && !this._inPassiveListener) this.defaultPrevented = true; }
   preventDefault() { if (this.cancelable && !this._inPassiveListener) this.defaultPrevented=true; }
   ```

`_inPassiveListener` is undefined (falsy) on a freshly-constructed event and outside
dispatch, so non-dispatch `preventDefault()` is unchanged.

## Why "Equivalence of option values" also went green

That subtest checks listener dedup: `{}` ≡ `{passive:false}`, `{passive:true}` ≡
`{passive:false}`, etc. (passive must NOT distinguish listeners — only type, callback,
and capture do). Obscura's dedup key (`e.handler === handler && e.capture === cap`)
already excluded `passive` correctly; the subtest was merely blocked behind the
preceding passive-dispatch failures and turned green once those were fixed.

## Results

| Subtest | Before | After |
|---------|:------:|:-----:|
| Supports passive option on addEventListener only | ✓ | ✓ |
| preventDefault ignored iff passive is true | ✗ | ✓ |
| returnValue ignored iff passive is true | ✗ | ✓ |
| passive listener unaffected by other listeners | ✗ | ✓ |
| Equivalence of option values | ✗ | ✓ |
| **Total** | **2/5** | **5/5 (+3)** |

## Zero-regression sweep

Held (final binary): AddEventListenerOptions-signal 11/11, -once 4/4,
EventListenerOptions-capture 4/4, Event-dispatch-bubbles-true 5/5, Event-dispatch-order
1/1, EventTarget-add-remove-listener 1/1, EventListener-handleEvent 6/6,
dom/abort/event.any 15/16 (pre-existing), qsa 1975, classlist 1420.

## No cap (realm 100%).

## Next leverage

The `dom/events` low-hanging fruit is now exhausted — both AddEventListenerOptions
tails (signal, passive) are at 100%. NEXT-BEST reverts to the standing leads:

- **Shadow-tree scope discrimination** — standing #1 cap (aria-element 5 residual,
  CSSStyleSheet-constructable 6/13).
- **Namespaced cascade-match Rust lift** (`crates/obscura-dom/src/selector.rs`,
  `set-selectorText-namespace` 0/5).
- **Sweep another fresh DOM/HTML region** — core DOM/event primitives keep paying off
  (#123 +10, #124 +25, #126 +29, #127 +64, #128 +7).
