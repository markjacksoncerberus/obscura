# 128 — The Linked Verdict

> **Quest #527** · realm: CSS / CSSOM (`<link rel=stylesheet>`)
> *The browser knew two different things about the same page.*

## The gap

`getComputedStyle` did not see external stylesheets. At all.

The cascade in `bootstrap.js` collected `doc.querySelectorAll('style')` — inline
`<style>` elements and nothing else. A `<link rel=stylesheet>` was fetched (for
Resource Timing and its `load` event), the response body was thrown away, and
`document.styleSheets` listed a `CSSStyleSheet` with **zero rules**. The comment
above the getter said so out loud: *"External `<link>` sheets carry no rules (we
don't fetch their CSS)."*

Meanwhile **layout was right.** The layout bridge serializes the DOM to Blitz,
and Blitz fetches `<link>` stylesheets itself. So on any page that keeps its CSS
in a file — which is every page built by anyone, because that is what caching is
for — `getBoundingClientRect()` measured a styled document and
`getComputedStyle()` described an unstyled one.

Measured on a real page (`the-link-element/link-load-event.html`, whose
`style.css` says `body { background-color: white }`):

```
before:  getComputedStyle(document.body).backgroundColor  →  "rgba(0, 0, 0, 0)"
after:   getComputedStyle(document.body).backgroundColor  →  "rgb(255, 255, 255)"
```

⭐⭐ **Two subsystems disagreeing about the same document is worse than either
being wrong alone.** A page that asks "is this element visible?" by comparing a
computed style against a measured box gets a contradiction, and every framework
that does layout-aware work — a virtual list, a popover placer, a chart — is
built on exactly that comparison.

## The work

**The bytes were already arriving.** `_loadElementResource` fetched the file and
had `parsed.body` in hand; it just never did anything with it. Most of this quest
is plumbing that already existed being connected at one end.

* `_sheetTextOf(el)` — the CSS an element contributes. A `<style>` keeps it in a
  child text node; a `<link>` keeps it in `__linkSheetText`, filled on load. Both
  `_styleSheetRules` (the cascade) and `_styleSheetForNode` (the CSSOM) now go
  through it, so `link.sheet.cssRules` and `getComputedStyle` cannot disagree.
* The cascade selector became `'style, link[rel~="stylesheet"]'`. Document order
  is cascade order, which `querySelectorAll` already gives.
* `_sheetContributes(el)` — `disabled`, and a `media` attribute that does not
  match, mean *present but contributing nothing*. Both leave the rules readable
  through `document.styleSheets`, which is the entire reason a page uses them.
* `__obscuraAdoptLinkSheet(nid, css)` — the one door. Drops the cached rule list
  and moves `_styleGen`, which every computed-style cache in the file watches.
* CSSOM identity: a sheet now carries its `href`, `title`, `media` and `disabled`
  from its element. A `<style>`'s `href` is `null` — its rules have no separate
  address — and that is what tells the two apart in `document.styleSheets`.

## ⭐ Render-blocking, not "eventually"

The obvious place to fetch these is `__startResourceLoads()`, where every other
subresource load starts — at DOMContentLoaded, after the page's scripts have run.

That would be useless for exactly the scripts that care. HTML calls these "style
sheets that are blocking scripts" and the reason is not aesthetic: **a script
that measures before its CSS has landed measures a page that never existed.**

So `Page::load_blocking_stylesheets()` runs in `execute_scripts`, *before* the
first script, alongside the `<script src>` prefetch it mirrors — same URL
resolution, same `subresource_allowed` and interception gates (a stylesheet is a
document the page did not write, and `<link href="file:///…">` is the same
cross-scheme read as `<script src="file:///…">`), same parallel fetch. The CSS
crosses into the JS realm as a JSON string, not interpolated into a script
source: a stylesheet is arbitrary remote text, and hand-escaping it is how a
stray `</script>` or backslash becomes a parse error, or worse.

⭐ **A `data:` stylesheet carries its own bytes.** Sending it to the HTTP client
only gets it refused as a blocked scheme — the third time this campaign has found
a `data:` URL being posted to the network (`<img>` was #512). Decoded in place.

## Results

| | before | after |
|---|---:|---:|
| `getComputedStyle` sees external CSS | no | **yes** |
| `link.sheet.cssRules` | always empty | **the file's rules** |
| `CSSStyleSheet.href` | `null` | **the resolved URL** |
| 44-file linked-CSS probe | 87/143 | **90/143** (3 files improved, 0 regressions) |

⚠️ **The WPT yield is small and the reason is worth writing down: WPT inlines its
CSS.** A conformance suite puts its styles in a `<style>` block so the test is one
file with no server dependency, so a gap this large in real-world terms moves
three subtests. The score is an honest measurement of the suite, not of the
change. **Do not let a probe's silence talk you out of a real bug** — the
before/after computed-style values above are the actual result of this quest.

## ⛔ Caps / Next

* **`@import` is not followed.** A `<style>` or a linked sheet that imports
  another still gets no rules from it. Now cheap to add — the fetch and adopt
  machinery both exist — and it is the next thing here.
* **A dynamically inserted `<link>` applies on load, not before**, which is
  correct, but nothing yet *delays* anything for it.
* **`disabled` toggling after load** does not re-run the cascade (the getter is
  read live, so `getComputedStyle` follows, but `document.styleSheets` membership
  is decided at adoption).
* **Shadow-tree stylesheets are still out** — `shadowRoot.styleSheets` returns an
  empty list by construction, which is why `link-rel-attribute.html`'s shadow-DOM
  subtest still fails.
* **`media` is evaluated once per query** through `matchMedia`; a sheet whose
  media stops matching mid-page is not re-evaluated on resize.
* Cross-origin stylesheet rule access is not restricted — a real browser throws
  `SecurityError` on `cssRules` of a cross-origin sheet. We do not fetch with
  CORS here, so this is a hole to close before anything depends on it.
