# Scroll 37 — The Wordsmith's Charter

> *Realm:* `dom/nodes/{Text,Comment}-constructor`, `CharacterData-data`,
> `Text-splitText`, `Text-wholeText`
> *Status:* **SECURED — +30, zero regressions** (session 2026-06-18)
> *Difficulty:* ⚔️ quick & decisive (pure JS, no new Rust)

## The gap

`Text` and `Comment` had **no web constructor**. They inherited `Node`'s
`constructor(nid) { this._nid = nid }`, so `new Text("42")` stuffed the *data
string* into `_nid` — every tree op then coerced that bad nid and fell back to
node 0 (the live page document). `.data` therefore returned the whole page body
text instead of `"42"`:

```
new Text(): 42   → assert_equals: expected "42" but got "Running, 5 complete, 0 remain"
```

`Text-constructor.html` and `Comment-constructor.html` were each **2/16** (only
the prototype-chain + `instanceof` subtests, which don't touch `.data`, passed).

Three smaller spec gaps in the same family rode along:

- **`CharacterData.data` setter** used `String(v ?? "")`, collapsing *both* `null`
  and `undefined` to `""`. The attribute is `[LegacyNullToEmptyString]`: only
  `null` → `""`; `undefined` → `"undefined"`, `0` → `"0"`.
  (`CharacterData-data.html` 14/16.)
- **`Text.splitText(offset)`** never validated the offset, so an out-of-range
  split silently succeeded instead of throwing `IndexSizeError`.
  (`Text-splitText.html` 5/6.)
- **`Text.wholeText`** was a one-liner `return this.data` — it ignored the spec's
  "contiguous Text nodes" concatenation entirely. (`Text-wholeText.html` 0/1.)

## The work (pure JS, `bootstrap.js`)

**1. Real `Text`/`Comment` web constructors.** The catch: internal wrappers
(`_wrap`, `createTextNode`, `createComment`, `_makeCDATA`) construct with an
already-real numeric nid, and a web `new Text(42)` must mean *data* `"42"` — so
a type check can't tell them apart. Solution: a private module sentinel
`_NID_TOKEN` (a `Symbol`). Internal callers pass it as the 2nd arg; the
constructor then treats arg 1 as the nid. Otherwise it allocates a real backing
node via `_dom("create_text_node"/"create_comment_node", …)` and caches itself
for wrapper identity. WebIDL DOMString coercion: `undefined`→`""` (optional arg
default), else `String(data)` (so `null`→`"null"`, `42`→`"42"`). All five
internal construction sites updated to pass `_NID_TOKEN`.

**2. `CharacterData.data` setter** → `String(v === null ? "" : v)`
(`[LegacyNullToEmptyString]`).

**3. `Text.splitText`** → `offset = offset >>> 0` (WebIDL unsigned long) +
`offset > length` → `IndexSizeError` (§splitText step 2).

**4. `Text.wholeText`** → walk to the first of the contiguous Text-sibling run
(`previousSibling` while nodeType 3), then concatenate `.data` forward in tree
order.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `dom/nodes/Text-constructor.html` | 2/16 | **15/16** |
| `dom/nodes/Comment-constructor.html` | 2/16 | **15/16** |
| `dom/nodes/CharacterData-data.html` | 14/16 | **16/16** |
| `dom/nodes/Text-splitText.html` | 5/6 | **6/6** |
| `dom/nodes/Text-wholeText.html` | 0/1 | **1/1** |

**+30, zero regressions.** Ritual sweep all green: qsa 1975, classlist 1420,
createElement 147, createElementNS 596, cloneNode 135, isEqualNode 9,
Node-normalize 4/4, TreeWalker 761/761, attributes 67, MutationObserver-characterData
23/23, mark 22/22, measures 119/119, structured-clone 141/152, getRandomValues
39/39, url-setters-stripping 260/260.

## Caps / Next

- **Both constructor tests cap at 15/16** on the *same* subtest: "new Text/Comment
  should get the correct ownerDocument across globals" — `new
  iframe.contentWindow.Text()` should report `ownerDocument ===
  iframe.contentDocument`, but the iframe realm's `globalThis.document` resolves
  to a *different* Document node ("expected Document node with 1 child but got …
  2 children"). This is the standing **cross-global / iframe-realm document
  identity** cap, not a constructor bug.
- **Next big frontier (named, architectural):** `DOMImplementation-createDocument.html`
  sits at **320/434 (114 fail)**. The fails are `assert_equals` on document
  *identity* ("expected Document node with 2 children but got Document node with
  2 children" — distinct objects, not `===`). This is the same **`new Document()`
  / distinct-backing-document-node** footgun flagged since #34/#35/#36: created
  XML documents need real, distinct backing Document nodes (today a fabricated
  document's NaN `_nid` falls back to node 0). High leverage, but a proper
  campaign (Rust-side document allocation), not a quick harvest.
- Smaller adjacent green ground if wanted: `DOMImplementation-createHTMLDocument.html`
  (12/13).
