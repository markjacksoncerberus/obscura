# Scroll 391 — The CSS View Transitions WebIDL Verdict (Quests #391–#393)

> *Realm:* `css/css-view-transitions/idlharness.html` — **17/66 → 66/66 (100%, +49)**
> *Session:* 2026-07-28 · *Branch:* `engine-per-page-threads` · **ZERO regressions** · ONE commit, all pure-JS (`bootstrap.js`)

## The gap

Took #390's next-leverage — a fresh whole-feature `idlharness` at 0/N. Scouted the CSS
idlharness tails via the GitHub contents API (curl-verified paths):

| Candidate | Baseline | Verdict |
|---|:---:|---|
| `css/css-view-transitions/idlharness.html` | 17/66 | **CHOSEN** — pure interface-shape |
| `css/css-masking/idlharness.html` | 9/41 | `SVGClipPathElement`/`SVGMaskElement` — the SVG animated-attribute wall (bigger lift) |
| `css/css-view-transitions` add_objects | — | `document.startViewTransition()` + `sheet.cssRules[0]` only |
| `css/css-properties-values-api/idlharness.html` | 10/16 | cheap `CSSPropertyRule` polish (deferred — see NEXT) |

`css-view-transitions` won because its `add_objects` holds only `document.startViewTransition()`,
`document`, and `sheet.cssRules[0]` (an `@view-transition` rule) — so **every subtest is pure
interface-shape**. No real transition/animation/snapshot machinery is needed: idlharness just
needs `startViewTransition()` to return a `ViewTransition`-shaped live object and the parsed
`@view-transition` rule to be a `CSSViewTransitionRule`.

The full IDL (css-view-transitions-2 `#idl-index`):

```webidl
partial interface Document {
  ViewTransition startViewTransition(optional (ViewTransitionUpdateCallback or StartViewTransitionOptions) callbackOptions = {});
  readonly attribute ViewTransition? activeViewTransition;
};
partial interface Element { /* same two members */ };

[Exposed=Window] interface ViewTransition {
  readonly attribute Promise<undefined> updateCallbackDone;
  readonly attribute Promise<undefined> ready;
  readonly attribute Promise<undefined> finished;
  undefined skipTransition();
  [SameObject] readonly attribute ViewTransitionTypeSet types;
  readonly attribute Element transitionRoot;
  undefined waitUntil(Promise<any> promise);
};
[Exposed=Window] interface ViewTransitionTypeSet { setlike<DOMString>; };
[Exposed=Window] interface CSSViewTransitionRule : CSSRule {
  readonly attribute CSSOMString navigation;
  [SameObject] readonly attribute FrozenArray<CSSOMString> types;
};
```

## The work (3 quests, one commit)

### #391 — `CSSViewTransitionRule` + `@view-transition` parsing (17 → ~30)
- New `class CSSViewTransitionRule extends CSSRule`:
  - `.navigation` — the `navigation` descriptor (`auto | none`, initial `none`).
  - `.types` — a **[SameObject]** `FrozenArray<CSSOMString>` of the `types` descriptor's
    `<custom-ident>`s (`[]` for `none`/absent). **Frozen once in the constructor** so every read
    returns the identical object (idlharness's SameObject test asserts `obj.types === obj.types`).
  - `.type` returns `0` (no legacy numbered CSSRule constant — like `CSSLayerBlockRule`).
- `_cssParseRuleList` gained a `@view-transition` **block** branch — the rule takes **no prelude**
  (a non-empty one drops the whole at-rule per spec); the body is split into descriptors with the
  existing `_fpvSplitDecls`. `_makeRule` gained a `view-transition` branch (guarded internal build).
- WebIDL template (identical to `CSSNamespaceRule`/`CSSCounterStyleRule`): `_exposeIface`
  (non-enum global), `...args` ctor guarded by `_allowCssCondCtor` (interface-object `.length` 0,
  author-`new` throws), brand-checked getters (`this instanceof CSSViewTransitionRule`),
  `Symbol.toStringTag`, `_enumAccessors`.
- New helper `_parseViewTransitionTypes` (`none | <custom-ident>+`, rejecting CSS-wide keywords /
  `none` as an ident).

### #392 — `ViewTransition` + `{Document,Element}.startViewTransition` (~30 → 63)
- New `class ViewTransition` (not author-constructible, `_allowViewTransitionCtor` guard):
  - `updateCallbackDone`/`ready`/`finished` — pre-resolved `Promise.resolve(undefined)` (we don't
    animate). **The getters RETURN A REJECTED PROMISE, not throw,** on a brand-check failure —
    WebIDL: *a Promise-returning attribute getter must never throw synchronously.* This was the
    **final 3-fail root cause**: with a throwing brand check, idlharness's read of
    `ViewTransition.prototype.updateCallbackDone` surfaced "Illegal invocation" instead of a
    rejected promise. (The same pattern as `CSSStyleSheet.replace`.)
  - `skipTransition()`; `waitUntil(promise)` (`.length` 1, `arguments.length < 1` → throws
    TypeError); `transitionRoot` (the document element for a document transition, the element for
    an element transition); `types` — a **[SameObject]** `ViewTransitionTypeSet`, built lazily then
    cached.
- `startViewTransition(...args)` — **`.length` 0** (the sole argument is optional) — stamped on
  **both** `Document.prototype` and `Element.prototype` (`_nid` brand). Reads a
  `ViewTransitionUpdateCallback` (a function) or a `StartViewTransitionOptions` (`{update, types}`),
  invokes the update callback (so author DOM mutations apply), and returns a `ViewTransition` with
  resolved promises.
- `activeViewTransition` getter — returns `null` (we complete transitions synchronously, so none is
  ever long-lived-active; the attribute is nullable, so this is spec-OK and passes the type check).

### #393 — `ViewTransitionTypeSet` (`setlike<DOMString>`) (63 → 66)
- New `class ViewTransitionTypeSet` backed by a real `Set` (`_s`): `size`/`has`/`entries`/`keys`/
  `values`/`forEach(cb)`/`add`/`delete`/`clear`, every member brand-checked and re-stamped
  enumerable (`_enumAccessors`).
- **Setlike vs maplike subtlety:** the default `@@iterator` is the **same function object as
  `values()`** (a set iterates its values), NOT `entries()` (which is maplike's default). `forEach`
  uses a rest param so `.length` is 1.
- Wired as `ViewTransition.types` (via `_makeViewTransitionTypeSet(initialTypes)`).

## Zero-regression sweep (all identical to baseline)

`css/cssom/idlharness` 493/497 · `css-fonts/idlharness` 97 · `css-conditional/idlharness` 45 ·
`css-cascade/idlharness` 34 · `css-counter-styles/idlharness` 37 · `container-queries/idlharness`
28 · `Document-createElement` 147 · qsa 1975 · classlist 1420 · `cssstyledeclaration-csstext` 11 ·
`serialize-values` 696/697 · `CSSStyleRule-set-selectorText` 82 · `CSSGroupingRule-insertRule` 7 ·
`cssimportrule` 11. The shared surfaces I touched — `_cssParseRuleList` (a new `@view-transition`
branch), `_makeRule` (a new branch), and `Document`/`Element` prototypes (two new members each) —
are all additive; the rule-parser realms (cssimportrule, CSSGroupingRule-insertRule,
serialize-values, CSSStyleRule-set-selectorText) prove the parser edits are clean.

## Caps

**None** — 100% file conquest. `document.startViewTransition()` really runs the update callback and
returns a working `ViewTransition` (idlharness's `add_objects` exercises the live path, not just the
prototype shape), and `@view-transition { … }` parses into a real `CSSViewTransitionRule` on the
sheet.

## Next leverage

Another fresh whole-feature idlharness at 0/N:
- **`css/css-properties-values-api/idlharness.html` (10/16 — CHEAPEST)** — `CSSPropertyRule`/@property
  already parses (`_validatePropertyRule` / `type: 'property'`); it just needs the WebIDL retrofit
  (`_exposeIface` + guarded ctor + brand-checked `name`/`syntax`/`inherits`/`initialValue` getters +
  `Symbol.toStringTag` + `_enumAccessors`) — identical to the `CSSCounterStyleRule` retrofit.
- **`css/css-masking/idlharness.html` (9/41)** — needs `SVGClipPathElement`/`SVGMaskElement` with
  their animated-attribute types (`SVGAnimatedEnumeration`/`SVGAnimatedLength`/
  `SVGAnimatedTransformList`) — a bigger but **reusable** SVG-interface lift that would unblock
  many other SVG idlharness files.

**Reusable seeded this arc:** the **setlike recipe** (real-`Set` backing + `@@iterator`≡`values` +
brand-checked enumerable surface), the **Promise-getter-rejects-not-throws** pattern (a
Promise-returning attribute getter must return a rejected promise on brand failure, never throw),
`_parseViewTransitionTypes`, and the `{Document,Element}` partial-interface stamping loop
(`Object.defineProperty` over `[Document, Element]` for a shared method + `activeViewTransition`).
