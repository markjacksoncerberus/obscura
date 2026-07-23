# Quest #272 — The Descriptor-Rejection Verdict

**Realm:** `css/css-page/parsing/`
**Hold before:** raw-store — size-invalid 0/14, page-orientation-invalid 0/4, page-orientation-computed 0/1
**Hold after:** all three descriptor files 100% — **+19, ZERO regressions**

## The gap

`size` and `page-orientation` are `@page` **descriptors** (css-page-3), valid only
inside an `@page` at-rule — they are NOT element style properties. Obscura's raw-store
accepted them as ordinary properties:

- `size-invalid` sets `e.style['size'] = "a4"` / `"initial"` / `"640px 480px"` … and
  asserts each is rejected (`""`). All 14 were wrongly stored.
- `page-orientation-invalid` sets `e.style['page-orientation'] = "rotate-left"` … and
  asserts rejection. All 4 wrongly stored.
- `page-orientation-computed` has an inline `<div style="page-orientation:rotate-right">`
  and asserts `getComputedStyle(elm).pageOrientation === ""`. It returned
  `"rotate-right"` because the inline value flowed through the cascade.

## The work (all `bootstrap.js`)

A new `_DESCRIPTOR_ONLY = new Set(['size', 'page-orientation'])`, enforced in the three
places an element property can enter:

1. **Inline `_parseStyleDecls`** (the `style=""` attribute parser): `if
   (_DESCRIPTOR_ONLY.has(name)) continue;` — the declaration is dropped.
2. **`setProperty`** (`el.style.size = …`, `el.style.setProperty('size', …)`): after
   lowercasing the name, `if (_DESCRIPTOR_ONLY.has(name)) return;` — ignored.
3. **The getComputedStyle cascade** (`_buildCascade`): the inline-style source parses
   the `style` attribute via `_cssParseDecls(inlineText)`; after parsing, the
   descriptor keys are deleted (`for (const dn of _DESCRIPTOR_ONLY) delete decls[dn]`)
   so an inline descriptor never reaches the computed value.

The strip in (3) is done at the cascade **call site**, not inside `_cssParseDecls`
itself — that function is shared with the author-stylesheet / CSSOM-rule path, and the
`@page` rule's own `.style` block must keep `size` for the (separate, currently
capped) `size-valid` CSSOM test.

## Results

| File | Before | After |
|------|:------:|:-----:|
| size-invalid.html | 0/14 | **14/14** |
| page-orientation-invalid.tentative.html | 0/4 | **4/4** |
| page-orientation-computed.tentative.html | 0/1 | **1/1** |

**+19.**

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697, position-computed 5/5,
top-computed 5/5, page-computed 6/6, margin-computed 7/8 (pre-existing #256 cap),
color-computed 16/16.

`getComputedStyle-detached-subtree.html` sits at 0/6 — a PRE-EXISTING architectural cap
(Obscura returns computed style — `color: rgb(0,0,0)` — for detached / `display:none`
elements where the spec wants `""`). Unrelated to descriptors (it never touches
`size`/`page-orientation`); unchanged by this quest.

## Caps / Next

- **Cap:** `size-valid` 1/15 needs real `@page` CSSOM rule parsing — the test parses a
  stylesheet of `@page { size: … }` rules and reads each `cssRules[i].style.cssText`.
  Obscura's cascade skips at-rules and does not build a `CSSPageRule` with a populated
  `size` descriptor. That is an at-rule-parsing quest, separate from the value-canon
  vein.
- **Next:** a NEW `css/*/parsing/` dir — fresh un-baselined candidates: css-animations
  (44 files), css-logical (54), css-content. css-masking is essentially green (1
  clip-path-shape cap). The css-page value-canon vein is now fully mined.

grep `_DESCRIPTOR_ONLY`.
