# Quest #111 — The Sectioned Verdict

**DOMException legacy `*_ERR` constants on the prototype + `CDATASection` treated
as Text/CharacterData in Range ops, +632**
(session 2026-06-26, branch `engine-per-page-threads`)

## The gap

After ~10 quests deep in the CSS-math computed realm — whose widest remaining tail
(`%`→used-px against the containing block) is now *verified* blocked behind a real
layout engine — the Captain's Counsel pointed back to the DOM realms. A baseline
sweep found the single biggest unmined frontier by far:

```
dom/ranges/Range-surroundContents.html  1308/1840  (532 FAIL)
dom/ranges/Range-insertNode.html        1700/1840  (140 FAIL)
```

`Range-surroundContents` alone had **532 failing subtests**. Categorizing them:

```
221  HierarchyRequestError: ... "Exception seems to not be a DOMException?"
208  assert_true (resulting DOM / range position mismatch)
 92  assert_equals: Unexpected exception thrown when setting up Range ...
```

## Root cause #1 — DOMException legacy constants only on the interface object

WPT's `dom/common.js` maps a caught exception to its legacy name like this:

```js
function getDomExceptionName(e) {
  for (var prop in e)                       // <-- enumerates the INSTANCE
    if (/^[A-Z_]+_ERR$/.test(prop) && e[prop] == e.code) return prop;
  throw "Exception seems to not be a DOMException?  " + e;   // <-- we hit this
}
```

It walks the **instance's** enumerable properties (own + prototype chain) for a
constant like `HIERARCHY_REQUEST_ERR` whose value equals `e.code`. Our
`DOMException` put the legacy `*_ERR` constants only on the *interface object*
(`Object.assign(DOMException, {...})`) — never on `DOMException.prototype` — so an
*instance* `for…in` found none of them and the helper threw "Exception seems to not
be a DOMException?". Per WebIDL, these constants exist on **both** the interface
object and the interface prototype object, enumerable. The exception was a perfectly
good `DOMException`; the test simply couldn't *name* it.

**Fix:** factor the constants into `_DOMEXCEPTION_CONSTANTS` and
`Object.assign` them onto **both** `DOMException` and `DOMException.prototype`.

## Root cause #2 — CDATASection not treated as Text/CharacterData in Range ops

The 92 "Unexpected exception thrown when setting up Range" fails all targeted one
range: `[paras[5].firstChild, 2, paras[5].lastChild, 4]`. `paras[5]` (from
`common.js`) holds two `CDATASection` nodes plus a text node:

```js
paras[5].appendChild(xmlDocument.createCDATASection("1234"));
paras[5].appendChild(xmlDocument.createCDATASection("5678"));
paras[5].append("9012");
```

A CDP probe pinned the setup exception to `range.setStart(cdata, 2)`:
`IndexSizeError: Range offset out of bounds`. `__obscura_nodeLength` computed the
length of a CDATASection (nodeType 4) as its **child count** (0) — because it only
special-cased Text(3)/Comment(8)/PI(7) — so offset 2 looked out of range. Per DOM,
the *length of a node* for **any** CharacterData (Text, **CDATASection**, PI,
Comment) is its `data` length.

The same blind spot lived throughout the Range content algorithms
(`cloneContents`/`extractContents`/`deleteContents`/`insertNode`/`surroundContents`),
all of which check "is this a CharacterData node" / "is this a Text node" with bare
`nodeType === 3 || === 8 || === 7` — silently excluding CDATASection. The WPT
reference's own `isText` is `nodeType == TEXT_NODE || nodeType == CDATA_SECTION_NODE`.

**Fix:** add `t === 4` to `__obscura_nodeLength`, and two helpers used everywhere a
Range algorithm tests node-kind:

```js
function __obscura_isText(n)     { const t = n.nodeType; return t === 3 || t === 4; }
function __obscura_isCharData(n) { const t = n.nodeType; return t === 3 || t === 4 || t === 7 || t === 8; }
```

`__obscura_isCharData` replaces the `(x.nodeType===3||x.nodeType===8||x.nodeType===7)`
checks in `cloneContents`/`extractContents`/`deleteContents`; `__obscura_isText`
replaces the `nodeType === 3` Text-handling in `insertNode` (split a CDATASection
start node like a Text node) and the partially-contained-non-Text guard in
`surroundContents`. Both native ops and the reference JS reimplementations run on the
same engine primitives, so the actual-vs-expected DOM comparison stays consistent.

## Results

| Test | Before | After | Δ |
|------|:------:|:-----:|:-:|
| `dom/ranges/Range-surroundContents.html` | 1308/1840 | **1840/1840** | **+532** (100%) |
| `dom/ranges/Range-insertNode.html` | 1700/1840 | **1792/1840** | **+92** |
| `dom/ranges/Range-extractContents.html` | 163/187 | **168/187** | **+5** (bonus) |
| `dom/ranges/Range-deleteContents.html` | 103/125 | **106/125** | **+3** (bonus) |

**+632 total.**

## Zero-regression sweep

- **Range siblings:** cloneContents 187/187 (held), comparePoint 5580/5580 (held);
  extractContents/deleteContents both *improved* (stash-proven the 19/19 remaining
  are pre-existing range-collapse-offset fails, present on the baseline binary too).
- **DOM nodes:** qsa 1975, classlist 1420, Node-cloneNode 135, Node-properties 726,
  Document-createElement 147, Node-appendChild 11 — all held (DOMException is a
  shared global; these error-bearing realms confirm no over/under-throw).
- **CSS math (DOMException-global safety):** signs-abs-computed 222, round-mod-rem-computed
  233, minmax-length-percent-computed 30 — byte-identical.
- **Other held:** structured-clone 141/152, getRandomValues 39/39, mark 22/22.

## Caps / Next (ROI)

- **`Range-insertNode` remaining 48** — cross-document **adoption** (inserting a node
  from a foreign document should adopt it into the start node's document; we don't yet)
  + niche document-insertion validity (`assert_throws_dom HIERARCHY_REQUEST_ERR` for
  inserting a doctype/element when the range start is a `document`). A scoped follow-on.
- **`Range-extractContents`/`deleteContents` remaining 19 each** — "startOffset and
  endOffset must be the same after" — a range-collapse-offset correctness issue,
  independent of CDATASection.
- **`Node-insertBefore.html`** is a pre-existing heavy/slow test that hangs the server
  on the **baseline** binary too (not a regression; not in the ritual list).
- The standing CSS `%`→used-px tail remains layout-capped (see Quest #110).
