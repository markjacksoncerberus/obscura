# 129 — The Sealed Verdict

> **Quest #528** · realm: `content-security-policy` (`style-src`)
> *A gate the renderer walked around.*

## The gap

Quest #522 taught the JS cascade to refuse a `<style>` or a `style=""` that CSP
had blocked, and its scroll ended with the line **"a gate is only a gate if every
road goes through it"** — having found three roads to the same declaration.

It missed a fourth, and named it as a cap: **the blocked style still reached
LAYOUT.** The Rust DOM keeps the markup (correctly — CSP stops a declaration
applying, it does not edit the document), the layout bridge serializes that DOM,
and Blitz styles the page from it. So `getComputedStyle` reported the policy's
answer and `getBoundingClientRect()` reported the attacker's.

The same arc also shipped a moved row it could not fix:
`style-src/inline-style-allowed-while-cloning-objects` 19/25 → 18/25, because a
blocked `style` attribute should yield an **empty declaration block** and ours
still parsed one.

## ⭐ The serialization the renderer gets is the only one CSP gets a say in

`DomTree::outer_html_with_obscura_ids` already had the flag this needed and
nobody had noticed: `emit_nids` is true for exactly one caller — the layout
bridge. It marks *"this serialization exists to be laid out and painted."*

So the suppression lives there. `innerHTML`, `outerHTML` and every other read
keep showing the page exactly what its own markup says, because that is what CSP
promises: the text is still there, it just does not style anything.

* `DomTree` gains two sets, `csp_blocked_style_attr` and
  `csp_blocked_style_elem`. Two, not one, because they are different refusals —
  `style-src-attr` blocks an element's own attribute, `style-src-elem` blocks a
  whole `<style>`'s content — and blocking the wrong one is a page that renders
  unstyled for no reason its reader can see.
* `serialize_node` drops the `style` attribute (attr case) or the element's
  children (elem case) when `emit_nids` is set.
* `op_dom('set_csp_blocked_style', nid, …)` is how the JS CSP sweep tells it.
* The sweep already computed both answers (`__cspBlockedStyle`,
  `__cspBlockedStyleAttr`) since #519. It was only ever telling the JS cascade.

## ⚠️ The incremental-layout interaction, which had to be handled in the same quest

Quest #525 landed a patch path that keeps a live Blitz document between queries.
Two things about it break a suppression that arrives after the first layout, and
both had to be fixed here:

1. **Suppressing a style changes what the renderer should see without changing
   the tree.** The layout journal would have nothing to say, the snapshot hash
   would move, and the patch path would find an empty patch list. So
   `set_csp_blocked_style` journals the node itself.
2. **A patch rebuilds an element's attributes from the DOM**, which still holds
   the blocked `style` — so the patch would have re-applied the very thing the
   serializer had just been taught to withhold. `plan_patches` now filters it,
   using the same predicate.

⚠️ And a latent bug fell out of looking: **an empty patch list is not "nothing
changed."** The snapshot hash says something did; the journal simply could not
account for it. The old code took the empty list as proof the document already
matched and stamped the new key on an unchanged document — freezing the box tree
at whatever state it happened to be in. It now re-parses, which is the only
honest answer.

## ⭐ A blocked attribute yields an EMPTY declaration block

The other half. CSP-3 says a blocked `style` attribute "is not applied", and
CSSOM builds the declaration block from what *was* applied — so
`el.style.background` is `""` while `el.getAttribute('style')` still returns the
full text.

That looks like a distinction without a difference until something clones the
element: a clone built from the block and a clone built from the attribute
disagree, which is exactly what
`inline-style-allowed-while-cloning-objects` tests.

Two places: the lazy one-time sync in `Element.style` skips a blocked attribute,
and the CSP sweep empties a block that has already been built (which
`getComputedStyle` itself causes — the same trap #522 documented).

## Results

130-file CSP probe (`scripts/wpt-csp-probe.txt`), pre/post per file:

| file | before | after |
|---|---:|---:|
| `style-src/inline-style-allowed-while-cloning-objects.sub.html` | 18/25 | **21/25** |
| `style-src/inline-style-attribute-blocked.sub.html` | 0/1 | **1/1** |
| `style-src-attr-elem/style-src-elem-allowed-attr-blocked.html` | 1/2 | **2/2** |
| `style-src-attr-elem/style-src-attr-blocked-src-allowed.html` | 1/2 | **2/2** |

**152/284 → 158/284, 4 files improved, 0 regressions.** The cloning file is now
**above** the 19/25 it held before #522 — the moved row is closed and then some.

## ⛔ Caps / Next

* **External `<link>` stylesheets are not suppressed in the renderer.** Quest
  #527 taught the JS cascade to read them and `_cspCheckStyleElement` already
  marks a blocked one, but Blitz fetches `<link>` files itself and nothing tells
  it. That is the same seam one layer out, and it is the next thing here.
* `@import` inside a blocked-adjacent sheet is unreached (there is no `@import`
  support yet at all).
* The suppression sets only grow. An element whose policy stops applying — which
  cannot happen today, since policies are append-only — would stay suppressed.
* `style-src` still has no coverage for `'unsafe-hashes'` on style attributes.
