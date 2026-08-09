# 126 — The Incremented Verdict

> **Quest #525** · realm: the layout bridge (`obscura-js`, `obscura-render`, `../blitz`)
> *Three arcs named incremental layout as the next thing to build. This is it.*

## The gap

Since Quest #505 the page has had a real box tree: `getBoundingClientRect()`,
`offsetWidth`, `scrollHeight` and `elementFromPoint` all come from Blitz and
Taffy laying out the actual document, instead of the 12-column synthetic grid
that preceded them.

It was never incremental. `layout_boxes` serialized the whole DOM to HTML, handed
it to `RenderEngine::layout`, and got back a brand-new parsed, styled, laid-out
document — **every time the page mutated and then measured.**

That pattern is not exotic. It is what an editor does on every keystroke, what a
sticky header does on every scroll, what an autosizing textarea does on every
character. Quests #516 and #517 both ended by naming it, because `editing` and
`input-events` are made of exactly that loop and their biggest files were being
killed by the clock rather than by any missing feature.

## Measure first

A profile of one mutate-then-measure pair on a 404-element page, in the release
binary (`OBSCURA_LAYOUT_PROFILE=1`):

| stage | ms | share |
|---|---:|---:|
| DOM → HTML serialize | 0.16 | 1% |
| hash | 0.009 | — |
| Blitz **parse** | 2.41 | 18% |
| Blitz **resolve #1** (style + layout) | 4.92 | 37% |
| Blitz **resolve #2** (the "final" one) | 3.84 | **29%** |
| boxes → JSON | 0.42 | 3% |
| JS `JSON.parse` + `Map` build | ~1.7 | 13% |
| **total** | **13.65** | |

Two things fall out of that table immediately.

**The serialization is not the problem.** Every instinct says "you are stringifying
the whole DOM on every query" — and it costs 160 µs, one percent. The expensive
part was always the part we were not looking at.

**We were laying the document out twice.** `iters=1` on every single call: the
resource loop never ran, because nothing was pending. And yet the final
`base.resolve(0.0)` — there to fold in bytes that landed during the last wait —
ran anyway, on a document where nothing had landed, for 3.84 ms a time.

## ⭐⭐⭐ The feature flag nobody had turned on

`blitz-dom` has an **`incremental`** Cargo feature. It gates restyle-damage
propagation and lets box construction skip an undamaged subtree. `obscura-render`
asked for `default-features = false, features = ["svg", "woff"]`, and had never
asked for it.

Turning it on took the second resolve from **3.84 ms to 0.23 ms** — sixteen times
cheaper — and total mutate-then-measure from 13.65 to 10.2 ms.

It also *proved the whole quest was worth doing.* A repeat resolve on a live
document with no damage costs 0.23 ms. Everything above it in that table — the
parse and the first resolve, 7.3 ms of the 8.3 that remained — is the price of
throwing the document away and building it again. If the document could survive
between queries, that price disappears.

## The design: a journal, and whole-element rewrites

Two halves.

**The journal** (`crates/obscura-dom/src/tree.rs`). `DomTree` now records which
nodes have been touched since the layout bridge last looked. Correctness rests
entirely on the list being *complete*, so it is taken at the tree's own mutation
primitives rather than at the op layer:

* `with_node_mut` — the single door through which every attribute and every
  character-data write in the tree passes. It cannot see what the closure did, so
  it assumes the worst, which is the right assumption.
* `detach` — every structural removal funnels here, including the implicit unlink
  at the head of `append_child` and `insert_before`, so the losing parent is
  journalled exactly once.
* `append_child` / `insert_before` — the gaining parent.
* `append_text` — its merge path writes into the last text node directly instead
  of going through `with_node_mut`, so it journals its own.

The journal is capped (192 entries). Overflow is not an error, it is an answer:
*stop trusting the journal, re-parse.* An optimisation that is sometimes wrong is
not an optimisation.

**The patch** (`ResolvedDoc::patch`, `crates/obscura-render/src/document.rs`).
Each touched node resolves to its nearest **element** ancestor; anything detached
is dropped (whatever detached it already journalled the parent, so nothing is
lost); anything nested inside another dirty element is dropped; and `<html>`,
`<head>` and the document node are refused outright, because patching them means
re-installing the page's stylesheets, which is a re-parse in disguise.

What survives is rewritten *wholesale* — attributes set from the DOM, children
installed from the page's own `inner_html_with_obscura_ids`. That bluntness is
the point: **the journal knows which element changed but not how**, and rebuilding
an element from the page's own serialization is the one form of patch that
cannot disagree with what a re-parse would have produced.

Then one `resolve(0.0)`, which with damage propagation on touches only what moved.

## ⭐⭐⭐ `DummyHtmlParserProvider` is an empty function body

The first working build silently emptied every element it patched.

`DocumentMutator::set_inner_html` removes the old children and then defers to
`doc.html_parser_provider`. `DocumentConfig`'s default for that field is
`DummyHtmlParserProvider`, whose `parse_inner_html` is:

```rust
let _ = mutr;
let _ = element_id;
let _ = html;
// Do nothing for now
```

No error. No return value. No log. The element lost its children, gained none,
and reported a box measured off the result — a `<div>` with `alpha` in it came
back 12 px tall, which is exactly its border and padding and nothing else.

`RenderEngine` now hands the document the same real `HtmlProvider` that built it.
**A method that can silently do nothing is a method whose default must be
checked.** It was found by a geometry dump, not by anything the API said.

## ⭐⭐ The regression that was a real bug: a `content_size` that outlived its layout

The 227-file ritual came back with one genuine regression:
`scrollWidthHeight-overflow-visible-margin-collapsing` **140/140 → 80/140**.

Every failure was `display: inline-block` or `inline-grid`, reporting a
`scrollWidth` of ~1510 where `clientWidth` was 40. Bisecting with the
`OBSCURA_LAYOUT_NO_INCREMENTAL` kill switch put it in the patch path; rebuilding
without the `incremental` feature showed it was not damage tracking; and dropping
`set_inner_html` from the patch showed it was not the children either. It was the
plain attribute write.

The cause is in Blitz, in the fork we own. Obscura reads `scrollWidth` from
`final_layout.content_size`. That field is only written by the layout paths that
compute it — and **an element that becomes inline-level is measured rather than
block-laid-out, so nothing overwrites it.** The node went on reporting the content
size it had while it was a block: a scrolling area from a layout that no longer
existed.

A freshly parsed document reports zero there and falls back to the border box,
which is why a re-parse looked right and a re-used document did not. The fix goes
where Blitz clears the Taffy cache — the two places that already mean *"this node
will be laid out again"* — and zeroes `content_size` alongside it.

> **Clearing a cache is a promise that the value will be recomputed. Any field
> that is only *sometimes* recomputed has to be cleared there too, or the promise
> is a lie for exactly the cases that changed shape.**

This is a bug the screenshot path could never have hit, because it never re-used
a document. It became reachable the moment layout became incremental, and it is
now fixed at the root for every future re-use.

## ⚠️ The harness trap that cost a cycle: a ready-check that proves nothing

Mid-quest the benchmark suddenly read 13.15 ms again — the entire speedup gone —
and stayed gone across a rebuild.

`pkill -f 'obscura serve'` does not match `obscura-pre serve`. A stray server
from a PRE-binary comparison still held port 9222, the new server printed
`Address already in use` and died, and the ready-check —
`until curl :9222/json/version` — **passed against the old server**, because the
old server was perfectly happy to answer.

Every restart helper here now waits for the port to go *quiet* before starting,
and refuses to report READY if the log says the bind failed. The campaign already
knew "prove the process, not the file"; this is the same lesson one layer out:
**a readiness check that any server can satisfy is not a readiness check.**

## Results

Mutate-then-measure on a 404-element page:

| | before | after | |
|---|---:|---:|---|
| mutate → `getBoundingClientRect` | 13.65 ms | **2.70 ms** | **5.1×** |
| change text → measure | 12.75 ms | **2.20 ms** | **5.8×** |
| cached read (no mutation) | 0.0025 ms | 0.0025 ms | unchanged |
| mutate only (no read) | 0.05 ms | 0.05 ms | unchanged |

Of the 2.70 ms, 1.31 ms is now Rust (down from 11.7) and the rest is the JSON
round trip — which is the next thing in this file worth attacking, and was
invisible while it was 13% of a much larger number.

**Equivalence.** A 19-step mutation script — inline style, class change,
`textContent`, `innerHTML` grow and shrink, `appendChild`, `removeChild`,
`insertBefore`, `insertCell`, subtree removal, `display:none` on and off,
attribute add and remove, nested `innerHTML`, an attribute on a freshly created
node, an append to `<html>` — dumping **every** element's rect, `offset*`,
`client*` and `scroll*` after each step. Patched and re-parsed dumps are
**identical, all 19 steps**.

**Zero regressions.** The 227-file ritual, run against the pre-quest binary and
this one and diffed per file: **238 rows, 0 could-not-run in both passes, 0
regressions.** The one moved row is `naturalWidth-naturalHeight-width-height`
203 → 210, the image file already flagged flaky — measured three times on each
binary it swings 177–210 either way.

## ⛔ Caps / Next

* **The patch path refuses fifteen tags** — `img`, `picture`, `source`, `style`,
  `link`, `script`, `base`, `meta`, `iframe`, `frame`, `object`, `embed`,
  `video`, `audio`, `track` — in the markup it would install or as the patched
  element itself. Each does something on insertion beyond occupying a box, and
  the patch path deliberately does not wait for the network the way the full path
  does. A page whose mutations always carry an `<img>` gets no speedup at all.
  Narrowing this list (starting with `<img>`, by letting a patch wait on the
  provider the way `RenderEngine::layout` does) is the single biggest remaining
  win here.
* **Any change to `<html>` or `<head>` re-parses**, so a page that mutates a
  `<style>` in a loop is unimproved.
* **The journal is per-`DomTree` and unbounded in time** — a page that mutates
  192 distinct elements without ever measuring falls back to a re-parse on the
  next read. That is the right trade at that size, but the threshold is a guess,
  not a measurement.
* **The JSON round trip is now the largest single cost** (~1.4 ms of 2.7 on a
  404-element page): the whole document's boxes are serialized and re-parsed even
  when one element moved. Shipping only the changed boxes needs the JS side to
  keep its `Map` across generations, which it already does.
* `OBSCURA_LAYOUT_NO_INCREMENTAL=1` turns the whole patch path off at runtime.
  `OBSCURA_LAYOUT_PROFILE=1` prints the per-stage breakdown above. Both are how
  this quest's one real regression was found; keep them.
