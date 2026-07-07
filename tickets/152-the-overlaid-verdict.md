# Quest #152 — The Overlaid Verdict (+~3405)

**Realm:** `html/semantics/popovers/` — the whole popover API (found ENTIRELY red, 0 passing).
**Files:** `crates/obscura-js/js/bootstrap.js` (the bulk) + a small Rust primitive
(`tree.rs` popover flag, `selector.rs` `:popover-open`, `ops.rs` `set_popover_open`).
**Result:** **+~3405, ZERO regressions** (stash-verified on the shared offset/selector paths).

## The gap

The `popover` attribute + the popover API (`showPopover`/`hidePopover`/`togglePopover`,
`:popover-open`, `beforetoggle`/`toggle` (`ToggleEvent`), `popovertarget` invokers) were
completely unimplemented. The entire `html/semantics/popovers/` realm was **0 passing** —
the largest untouched frontier on the board (~2500+ behavioral subtests, ignoring reftests).
`ToggleEvent` didn't exist; `HTMLElement.prototype.popover`/`showPopover` were absent;
`:popover-open` parsed to an inert `Other` pseudo-class that never matched; and closed
popovers didn't compute `display:none`, so the WPT visibility helpers (`isElementVisible`,
`getComputedStyle(el).display`) couldn't tell open from closed.

## The fix

**Rust primitive (mirrors `:defined`/`:state()`):**
- `tree.rs` — a non-monotonic `popover_open: HashSet<NodeId>` + `set_popover_open(id,bool)` /
  `is_popover_open(id)`.
- `selector.rs` — a match arm in the `Other` branch: `"popover-open" => is_popover_open(nid)`
  (already in the known-pseudo list, so it parsed; it just never matched before).
- `ops.rs` — `set_popover_open` op (arg1=nid, arg2="1"/"0").

**`ToggleEvent` (`bootstrap.js`):** `extends Event`, `oldState`/`newState` DOMStrings coerced
via ToString (readonly, default `""`), `source` Element? default null, `relatedTarget` NOT
exposed; the type argument is required (0 args → TypeError) and ToString-coerced
(`undefined`→`"undefined"`, done by coercing before `super`, since base `Event` maps a bare
`undefined` type to `""`).

**The popover model (`bootstrap.js`, one block):**
- `popover` IDL reflector: getter returns the limited state (auto/hint/manual or null;
  `""`→auto, invalid→manual); setter propagates the string verbatim, null/undefined removes.
- `showPopover`/`hidePopover`/`togglePopover` over HTML's algorithms: `check popover validity`
  (NotSupportedError / silent no-op / InvalidStateError / dialog[open]); `show popover` fires
  the cancelable opening `beforetoggle`, re-validates + **re-checks the popover TYPE** after
  each event-firing step (a handler that changed the type throws InvalidStateError), closes
  unrelated open auto/hint popovers, then enters the top layer; `hide popover` cascades
  (nested descendants close first) then hides the element.
- The async `toggle` event is a queued element task with spec **coalescing** (keeps the
  original oldState, adopts the latest newState, fires once).
- The `:popover-open` flag is mirrored to Rust; `_popoverAutoStack` is the auto/hint top-layer
  list for cascade closing.
- **Popover attribute change steps** (hooked in `setAttribute`/`removeAttribute`): a type
  change while showing hides the popover (firing events). **Removal steps** (hooked in
  `removeChild`/`appendChild`/`insertBefore`, gated on `_popoverShowingCount > 0`): a showing
  popover that leaves the document is hidden WITHOUT events.
- **`popovertarget` invokers** (`popoverTargetElement`/`popoverTargetAction` IDL on
  button/input + activation in `click()`): a real `.click()` toggles/shows/hides the target;
  the invoker becomes the ToggleEvent `source`. A button is always an invoker candidate; an
  input only for its button types (button/submit/reset/image). A submit/reset/image button
  **with a form owner** does its form action and does NOT toggle (chromium issue 329118508).
- **Light dismiss** (document `pointerdown`/`mousedown`): closes the open auto/hint stack down
  to the clicked popover (an invoker for an open popover protects it). Spec-correct but
  currently **unexercised** — `test_driver` pointer actions aren't bridged to CDP input in
  this harness (see Caps).

**UA `display:none` for hidden popovers (no render engine):** synthesized in
`_computedPropOf` (a hidden popover with no authored `display` computes `none`) and in the
`offsetWidth`/`offsetHeight`/`getClientRects`/`getBoundingClientRect` stubs (a display:none
self-or-ancestor → 0 box). **Both gated on `_popoverEverUsed`** — a monotonic flag flipped by
`setAttribute('popover')` and self-flipped by the offset getters the first time an offset is
read on a popover element (so markup popovers, whose attribute came from the parser, also get
the display-aware box). Off-popover pages keep the constant grid — **zero behavior change**
(stash-verified: `elementFromPoint` 9/33 identical pre/post, `Element-matches` 669/669).

## Results (all were 0 before)

| Test | After | Δ |
|---|---|---|
| `popover-attribute-all-elements.html` | **1101/1101** | +1101 |
| `popover-invoking-attribute.html` | **1400/1402** | +1400 |
| `popover-invoking-attribute-hint.html` | **700/700** | +700 |
| `popover-attribute-basic.html` | **113/249** | +113 |
| `toggleevent-interface.html` | **39/39** | +39 |
| `button-type-popovertarget.html` | **11/15** | +11 |
| `input-type-popovertarget.html` | **8/12** | +8 |
| `popover-toggle-source.html` | **6/7** | +6 |
| `popover-events.html` | **5/6** | +5 |
| `imperative-invokers.html` | **5/10** | +5 |
| `popover-nested-in-button.html` | **3/4** | +3 |
| `togglePopover.html` | **3/3** | +3 |
| `popover-target-element-disabled.html` | **2/7** | +2 |
| `popover-types.html` · `-self-invoke` · `-invoker-reset` · `-removal` · `-beforetoggle-opening-event` · `hide-other-popover-side-effects` · `-move-documents` | 1 each | +7 |
| `custom-elements/reactions/HTMLElement.html` (popover reactions) | 20→**22** | +2 |
| **Total** | | **≈ +3405** |

## Zero-regression sweep

Held: qsa 1975, classlist 1420, createElement 147, reactions/Element 47, **reactions/HTMLElement
20→22**, reactions/Node 14, cloneNode 135, CSSStyleDeclaration 22/30, Element-matches 669/669,
Node-appendChild 11, reflection-misc 4709/4877, HTMLTableElement 7/10, Event-dispatch-order 1/1.
A **git-stash baseline** confirmed `elementFromPoint` (9/33) and `Element-matches` (669/669)
are IDENTICAL pre/post — the shared offset + selector edits are inert off-popover.

## Caps / Next

- **Light dismiss & keyboard dismiss are TEST-INFRASTRUCTURE capped.** `clickOn`/`sendEscape`
  (and `popover-light-dismiss-*.html`, `popover-focus-*.html`) drive `test_driver.Actions()`,
  which this harness does NOT bridge to CDP input — so no DOM pointer/key events fire. The
  light-dismiss code is spec-correct and inert; it will light up if/when a bridge exists. This
  caps `popover-attribute-basic` at 113/249 (the 136 combinatorial fails all end in a
  `clickOn` light-dismiss assert) and `popover-change-type` (hangs on `sendEscape`).
- **Hint semantics** (`popover-types-with-hints` 0/5): the auto/hint model merges both into one
  `_popoverAutoStack`; the spec closes hints before autos, downgrades an auto opened inside a
  hint, and ties a nested hint's lifetime to its ancestral auto. A moderate refinement.
- **The command API** (`commandfor`/`command=*-popover`): a separate, newer invoker surface
  (`popover-toggle-source` last 1, part of `imperative-invokers`). Not popover-core.
- **`form=` association + `input type=image` submit**: the 4+4 `-attr-form`/image fails in
  button/input-type-popovertarget are a pre-existing form-association gap, NOT popover.
- **Reftests** (`-appearance`/`-backdrop`/`-alignment`/`-stacking`/`-overflow`/`-display`) need
  real layout/render — out of scope.
- Focus integration (`popover-events` last 1) needs real focus/blur during removal.
