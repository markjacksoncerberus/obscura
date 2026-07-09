# Quest #168 — The Scope-Chain Verdict

**Realm:** `html/webappapis/scripting/events/` — inline event-handler compilation
(the scope chain, exact source text, and markup activation).
**Bounty:** +17 across 6 tests. **Difficulty:** ⚔️⚔️. **Status:** ✅ SECURED (2026-07-09).

Took Quest #167's named last lever — the final structural gap in the event-handler
realm.

## The gap

An inline event handler was compiled by a bare `new Function('event', src)`:

1. **No scope chain.** HTML "getting the current value of the event handler" runs the
   body with, innermost-first, the **element**, its **form owner**, and its **document**
   in scope (then the global). So `<td onclick="cellIndex">` must see the cell's
   `cellIndex`, `<button onclick="encoding">` its form owner's `encoding`, and every
   handler `domain`/`print` from document/window. `new Function` gave only the global.
2. **Wrong `.toString()`.** The spec-defined source of the compiled function is
   `function on<type>(<params>) {\n<body>\n}`; `new Function` yields
   `function anonymous(event\n) {...}`.
3. **Markup handlers never activated.** Only JS `setAttribute`/IDL set installed a
   listener; a handler parsed from HTML (`<div onclick=…>`) fired **nothing** — the
   wrapper was created lazily and never re-ran `setAttribute`.

Four tests pinned it (all 0/N): `event-handler-sourcetext` (5), `-lexical-scopes` (3),
`-lexical-scopes-form-owner` (4), `-symbol-unscopables` (3).

## The fix (all `crates/obscura-js/js/bootstrap.js` + one `ops.rs` op)

### 1. Compilation with scope + exact source — `_ehMakeFn` / `_ehCompile`
`_ehMakeFn(name, isError, source, chain)` builds
`function <name>(<params>) {\n<source>\n}` (params = the 5-arg OnErrorEventHandler form
only for `onerror` on Window/body/frameset — `_ehIsErrorTarget`), then **returns it from
inside nested `with` wrappers** fed the scope objects:

```js
new Function('__s0','__s1',…, 'with(__s0){with(__s1){…return (function on…(){…});…}}')
```

The factory is sloppy-mode (`with` needs it); the returned handler closes over the
`with` environments, so free identifiers later resolve **element → form-owner →
document → window** (`chain` is OUTERMOST-first: `[document, formOwner?, element]`).
`with` natively honours `Symbol.unscopables`.

- `_ehScopeChain(target)` — `[document, formOwner?, element]` for an element handler,
  `[document]` for a document handler, `[]` for a Window handler (global only).
- `_ehFormOwner(el)` — a form owner **only for a genuinely form-associated element**
  (`_FORM_ASSOCIATED_TAGS` = button/fieldset/input/object/output/select/textarea/img, or
  a custom element whose `_ceDefinition.formAssociated`), then `.form` / `form=` /
  nearest-ancestor `<form>`. Gating first was essential — a bare `.form` getter walks to
  any ancestor form, which had wrongly given a `<div>` in a `<form>` a form owner.

### 2. `@@unscopables` — `_defineUnscopables`
`with` only excludes an unscopable property if the object exposes a `[Symbol.unscopables]`
whose key is truthy; none existed. Added extensible objects on **Element** (ParentNode +
ChildNode manipulation set) and **Document/DocumentFragment** (ParentNode set). The test
marks its own property unscopable at runtime, so the object must stay mutable.

### 3. Markup activation — `_activateMarkupHandlers` + `on_handler_attrs` op
New Rust op `on_handler_attrs` returns an element's space-joined `on*` attribute names
(`""` for the common handler-less element — one attr scan). `_wrap`/`_wrapEl` call it
once per **new** wrapper and activate each name as a real listener (reflecting
body/frameset names route to the Window per #166; the rest via `_ehSetContentAttr`).
Activation at wrapper construction happens **before** any script can `addEventListener`
on that node, so markup handlers keep their spec ordering ahead of later listeners. The
`_fireIframeElementLoad`/`_fireElementError` markup-`onload`/`onerror` eval fallbacks stay
correct — still gated on `!el['__ehon_<name>']`; the real listener now fires during their
`_dispatchSpec` and the eval is skipped (no double-fire).

### 4. Supporting props (unblock the scope tests + a bonus)
- `document.domain` — the origin host (empty for opaque / about:blank); settable
  override stored (security semantics not modelled).
- `HTMLFormElement.enctype`/`encoding` — enumerated, `application/x-www-form-urlencoded`
  default; `encoding` aliases `enctype`.
- **`form.elements`** — a **live, cached** HTMLFormControlsCollection (same object every
  read → identity-stable; selector excludes `input[type=image]`), replacing a fresh
  static NodeList per call.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `event-handler-sourcetext` | 0/5 | **5/5** |
| `compile-event-handler-symbol-unscopables` | 0/3 | **3/3** |
| `compile-event-handler-lexical-scopes-form-owner` | 0/4 | **4/4** |
| `compile-event-handler-lexical-scopes` | 0/3 | **2/3** |
| `form-elements-matches` (bonus) | 0/2 | **2/2** |
| `form-elements-nameditem-01` (bonus) | 0/3 | **1/3** |

**+17, zero regressions.** Held: all-global-events 375, processing 7, ordering 3,
cancellation 14/15, body-window 140, windowless-body 236, body-alt 118, window 118, qsa
1975, classlist 1420, createElement 147, dispatchEvent 25, iframe-load 2/2, dialog-open
3/3, toggleevent-interface 39/39, popover-toggle-source 7/7, mark 119, measure 38.
`popover-events` 5/6 and `details/toggleEvent` 1/1F/9notrun both **stash-proven
pre-existing** (rebuilt on the stashed binary — identical).

## Caps / Next

- **`compile-event-handler-lexical-scopes` test 3** — the window's `onerror` must fire as
  an **ordered `error` listener**: `body.setAttribute("onerror")` registers it *before*
  the test's `window.addEventListener("error")`, so it must fire first and populate the
  results the addEventListener callback then asserts. Today `_reportError` fires all
  `error` listeners first and calls the `globalThis.onerror` data-prop last → results
  empty when asserted. Root-cause fix = **onerror-as-listener** (the OnErrorEventHandler
  5-arg / `return true`-inverts conversion of the error-reporting subsystem) — its own
  increment, exactly like #167 did for `onload`, deferred to protect onerroreventhandler
  / eventhandler-cancellation.
- **RadioNodeList** — `form-elements-nameditem-01` 2/3 needs the `RadioNodeList` global
  and same-name control named access returning it.

**NEXT: onerror-as-listener** (unlocks lexical-scopes test 3 + likely a broader onerror
tail), then form-associated custom-element `.form` (ElementInternals-set form owner).
