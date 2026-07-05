# Quest #144 — The Upgraded Verdict

**Realm:** Custom Elements (`custom-elements/*`) — the upgrade/reaction machinery
**Hold before:** the whole realm red behind a STUB `customElements` (`define` just stored
the class; no upgrade, no reactions, no `ElementInternals`, `createElement`/parser returned
`HTMLUnknownElement`).
**Result:** **+131 across 10 tests, ZERO regressions.** All `bootstrap.js` + one small Rust
`:defined` primitive.

## The gap

`customElements` was a five-line stub. `new MyEl()` worked (a plain JS class over
`HTMLElement extends Element`), but:
- `document.createElement('my-el')` / parser-created `<my-el>` returned `HTMLUnknownElement`
  — never upgraded, never consulted the registry.
- No custom element state, no construction stack, no lifecycle reactions
  (connected/disconnected/adopted/attributeChanged).
- `:defined` never matched.

The entire `custom-elements/` realm (~500+ subtests) was failing for lack of this one
foundational primitive.

## The fix (all `crates/obscura-js/js/bootstrap.js` except the `:defined` Rust primitive)

1. **`CustomElementRegistry`** (real class replacing the stub): spec `define()` — validate the
   name (`_isValidCustomElementName`, PCENChar + reserved-name check) and constructor
   (`_isConstructor` via `Reflect.construct(fn,[],ctor)`), dedupe by name+constructor, extract
   lifecycle callbacks / `observedAttributes` / `disabledFeatures` / `formAssociated` off the
   constructor under the "element definition is running" flag, register, then upgrade matching
   candidates already in the main document. `get`/`getName`/`whenDefined`/`upgrade`.

2. **The HTML element constructor** (`HTMLElement` now has a real constructor): two shapes —
   internal wrap (`new HTMLDivElement(nid)`, numeric arg → `super(nid)`) vs custom construction
   (`new MyEl()`, no arg). Custom path throws `TypeError` for `new.target === HTMLElement`, an
   unregistered ctor, or a customized-built-in definition; otherwise, with the definition's
   **construction stack** non-empty it ADOPTS the top element and RETURNS it from `super()`
   **without allocating** (so `super()` rebinds the user's `this` to the existing wrapper —
   preserving JS identity across an upgrade), else allocates a fresh backing node.

3. **State + upgrade:** `el._ceState` ∈ {undefined-none, `"undefined"`, `"failed"`, `"custom"`};
   `_ceUpgrade` re-points the wrapper's `[[Prototype]]`, runs the ctor via the construction
   stack, then fires attributeChanged for pre-existing observed attrs + connectedCallback if
   connected. `createElement` in a browsing-context document (`defaultView === globalThis`)
   constructs synchronously; a valid-custom-name-without-definition yields an `"undefined"`
   `HTMLElement` (`_htmlClassForLocal` now maps hyphenated names → `HTMLElement`, not
   `HTMLUnknownElement`).

4. **Reactions** (a single FIFO `_ceQueue`, re-entrancy-guarded `_ceFlush`): insertion steps
   (`_ceInsertionSteps` — walk inserted subtree, upgrade + connectedCallback) hooked into
   `appendChild`/`insertBefore`/`innerHTML`; removal steps (`_ceRemovalSteps` —
   disconnectedCallback) into `removeChild`/`innerHTML`; adopting steps (`_ceAdoptedSteps`) into
   `_adoptNodeInto` + the cross-document adoption branches; attribute-change steps
   (`_ceAttributeChanged`) into `setAttribute`/`removeAttribute`. `replaceChild`/`prepend`/… ride
   the delegated calls for free. **The whole system is gated on `customElements._defs.size` — a
   page with no `define()` pays zero cost.**

5. **`:defined`** (Rust `crates/obscura-dom/src/selector.rs` + `tree.rs` + `ops.rs`): a per-node
   `ce_defined` set (set once via the `set_ce_defined` op when an element is constructed/upgraded —
   definedness is monotonic). `match_defined` returns true for built-ins/foreign elements and, for
   a hyphenated HTML element (or one carrying `is`), consults the set. Rust
   `is_valid_custom_element_name` mirrors the JS check.

## Results (measured, before → after)

| Test | Before | After |
|------|:------:|:-----:|
| `CustomElementRegistry.html` | 10 | 31 |
| `Document-createElement.html` | 0 | 12 |
| `HTMLElement-constructor.html` | 1 | 11 |
| `upgrading.html` | 8 | 17 |
| `connected-callbacks.html` | 8 | 24 |
| `disconnected-callbacks.html` | 8 | 24 |
| `attribute-changed-callback.html` | 0 | 9 |
| `pseudo-class-defined.html` | 10 | 27 |
| `adopted-callback.html` | 0 | 20 |
| `reaction-timing.html` | 0 | 1 |

**= +131, ZERO regressions.** Swept: qsa 1975, classlist 1420, createElement 147,
Node-properties 726, cloneNode 135, insert_adjacent_html 31, template-content 216,
getElementsByTagName 19, declarative-shadow-dom-basic 22, attachment 654, slots 26,
event-inside-slotted-node 20, Document-adoptNode 4, attributes 67, Node-appendChild 11.

## Caps / Next

- **`ElementInternals` / `attachInternals`** — the memory's original pointer, now unblocked by
  real custom elements: `HTMLElement-attachInternals` (0/4), `element-internals-shadowroot` (0/7),
  `form-associated/ElementInternals-*` (validation 0/14, form 0/2, labels 0/3, setFormValue,
  NotSupportedError 0/1). ~47 winnable subtests. **THIS IS THE NEXT MOVE.**
- **Reaction-queue timing edge cases** (custom-element-reaction-queue 0/6, enqueue-inside-callback
  0/8, throw-on-dynamic-markup 0/11, perform-microtask-checkpoint 0/2) — our pragmatic synchronous
  `_ceFlush` doesn't model the full backup-element-queue microtask semantics. Honest cap for now.
- **`ElementInternals-role`/`-accessibility` (118 subtests)** — gated on
  `test_driver.get_computed_role`/`get_computed_label`, which need a CDP accessibility backend we
  don't have. Genuinely unwinnable until that exists.
- **Shadow-including upgrade order** (upgrading/CustomElementRegistry residual) — `define`'s
  candidate walk uses `getElementsByTagName` (light tree only); shadow-tree candidates aren't
  found. **Customized built-ins** (`extends`/`is`) unsupported (throw) — a handful of subtests.
