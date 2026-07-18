# Quest #150 — The Tabulated Verdict (+146)

**Session:** 2026-07-07 · **Realm:** `html/semantics/tabular-data/` + `custom-elements/reactions/HTMLTable*`
**Files:** `crates/obscura-js/js/bootstrap.js` (all JS — no Rust) · **Regressions:** ZERO

## The gap

The table family interfaces — `HTMLTableElement`, `HTMLTableSectionElement`
(thead/tbody/tfoot), `HTMLTableRowElement` (tr), `HTMLTableCellElement` (td/th),
`HTMLTableCaptionElement`, `HTMLTableColElement` — were registered as **empty
subclasses** of `HTMLElement` (the `_defIface` list). `createElement("table")` was
honestly an `HTMLTableElement`, but the whole tabular DOM API — `caption`, `tHead`,
`tFoot`, `tBodies`, `rows`, `createCaption`/`createTHead`/`createTFoot`/`createTBody`,
`insertRow`/`deleteRow`, `insertCell`/`deleteCell`, `rowIndex`, `sectionRowIndex`,
`cellIndex` — was simply absent. The entire `html/semantics/tabular-data/` element
suite sat at **1/131**.

## The work — all in one `{ … }` block (bootstrap.js, after the reflectors)

The whole family is a thin, spec-faithful layer over the existing tree primitives.
The three enumeration helpers do all the heavy lifting:

- `_tblKids(el, local)` — direct **HTML-namespace** element children named `local`.
- `_tblCells(tr)` — direct td/th children (HTML ns).
- `_tableRows(table)` — the rows collection ordering: **thead** rows (tree order),
  then the table's **direct tr children interleaved with tbody rows** (tree order),
  then **tfoot** rows.

Every enumeration is scoped to *HTML-namespace children matched by localName*, so a
`<foo:caption>` (HTML ns with a colon in the name) or a foreign-namespaced `<tbody>`
is invisible — exactly matching the spec's "in the HTML namespace" filters and the
`createElementNS("", …)` / `createElementNS("foo", "caption")` test cases.

**Reactions come for free.** Every mutating method routes through
`appendChild`/`insertBefore`/`remove`, which already fire `[CEReactions]` (Quests
#144–#147). So `custom-elements/reactions/HTMLTable{Element,RowElement,SectionElement}`
lit up with no extra plumbing.

### HTMLTableElement
- `caption` getter (first HTML `<caption>` child) / setter (WebIDL
  `HTMLTableCaptionElement?` → **TypeError** on a non-instance; removes the existing
  first caption then inserts the new one as the first child — a cyclic insert bubbles
  the tree's **HierarchyRequestError**).
- `createCaption()` / `deleteCaption()`.
- `tHead` / `tFoot` share `_defSection`: a section getter/setter (WebIDL
  `HTMLTableSectionElement?` → **TypeError**; a section with the wrong localName →
  **HierarchyRequestError**). `tHead` inserts *before the first child that is neither
  a caption nor a colgroup*; `tFoot` appends at the end. Plus `createTHead`/
  `deleteTHead`, `createTFoot`/`deleteTFoot`.
- `tBodies` — `[SameObject]` live HTMLCollection of direct tbody children (cached).
- `createTBody()` — inserts a fresh tbody immediately after the last **direct** tbody
  child, or at the end if there is none (nested tbodies do not count).
- `rows` — `[SameObject]` live HTMLCollection over `_tableRows`.
- `insertRow(index=-1)` — IndexSizeError bounds; then: (rows empty ∧ no tbody) →
  create+append a tbody and put the tr in it; (rows empty) → append to the last
  tbody; (`-1` or `==length`) → append after the current last row; else insert before
  the index-th row.
- `deleteRow(index)` — IndexSizeError bounds; `-1` removes the last row (or no-ops on
  an empty table); else removes the index-th row.

### HTMLTableSectionElement (thead/tbody/tfoot)
- `rows` — live HTMLCollection of tr children.
- `insertRow(index=-1)` / `deleteRow(index)` — same shape as the table's, but scoped
  to the section's own tr children.

### HTMLTableRowElement (tr)
- `cells` — live HTMLCollection of td/th children.
- `insertCell(index=-1)` / `deleteCell(index)`.
- `rowIndex` — index of this tr in its **table's** rows collection, or −1 unless the
  parent is an HTML table, or an HTML thead/tbody/tfoot whose parent is an HTML table.
- `sectionRowIndex` — index of this tr among the tr children of its parent, when that
  parent is an HTML table / thead / tbody / tfoot; else −1. (For a tr that is a direct
  child of the table, this is its position among the table's *direct* tr children —
  **not** its position in the full rows collection.)

### HTMLTableCellElement (td/th)
- `cellIndex` — index of this cell among the td/th children of its parent HTML `tr`
  (non-cell siblings skipped), else −1.

The named-property access (`table.rows.foo`), `namedItem`, and
`Object.getOwnPropertyNames(table.rows)` behaviour that `table-rows.html` exercises
all came free from the existing `_makeHTMLCollection` Proxy — the refresh thunk was
the only new part.

## Results

| Test | Before | After |
|------|:------:|:------:|
| the-table-element/caption-methods | 0/18 | **18/18** |
| the-table-element/createTBody | 0/15 | **15/15** |
| the-table-element/tHead | 0/3 | **3/3** |
| the-table-element/tFoot | 0/2 | **2/2** |
| the-table-element/tBodies | 0/1 | **1/1** |
| the-table-element/delete-caption | 0/6 | **6/6** |
| the-table-element/table-rows | 0/5 | **5/5** |
| the-table-element/table-insertRow | 0/3 | **3/3** |
| the-table-element/insertRow-method-01/02/03 | 1/7 | **7/7** |
| the-table-element/remove-row | 0/6 | **6/6** |
| the-tbody-element/insertRow · deleteRow · rows | 0/13 | **13/13** |
| the-thead-element/rows · the-tfoot-element/rows | 0/2 | **2/2** |
| the-tr-element/cells | 0/1 | **1/1** |
| the-tr-element/insertCell · deleteCell | 0/13 | **13/13** |
| the-tr-element/rowIndex | 0/12 | **12/12** |
| the-tr-element/sectionRowIndex | 0/19 | **19/19** |
| the-caption-element/caption_001 | 0/5 | **5/5** |
| attributes-common-to-td-and-th/cellIndex | 0/6 | **6/6** |
| reactions/HTMLTableElement | 0/10 | **7/10** |
| reactions/HTMLTableRowElement | 0/1 | **1/1** |
| reactions/HTMLTableSectionElement | 0/2 | **2/2** |

**tabular-data element suite 1 → 131 (+130), cellIndex +6, reactions +10 = +146.**
ZERO regressions (qsa 1975, classlist 1420, createElement 147, reactions/Element 47 /
HTMLElement 20 / Node 14, cloneNode 135, HTMLCollection-live-mutations 5/5,
Element-children 2/2).

## Caps / Next

- **reactions/HTMLTableElement 7/10** — the 3 remaining need a custom element to be
  **constructed when `innerHTML` is set on a *detached* iframe-owned element** (the
  test builds `caption.innerHTML = '<custom-element>…'` on a caption that is not yet
  in the tree and expects a `constructed` log *before* the caption is assigned to the
  table). That is a **#148-era innerHTML-upgrade gap** — detached iframe-owned
  elements don't retag/construct against their frame registry on `innerHTML` parse —
  **not** a table-IDL issue. The connected/disconnected halves all pass.
- **`processing-model-1/` + `rowspan`/`colgroup span` limits** — those are layout /
  table-model reftests (need real render), out of scope.
- **NEXT (recommended):** the **reaction-queue microtask model**
  (`custom-elements/reaction-queue` 1/6, `enqueue-…-inside-another-callback` 0/8,
  `throw-on-dynamic-markup-insertion` 0/11 — the backup-element-queue; highest tail,
  highest risk, all reaction machinery flows through it); then **`popover`**
  (`reactions/HTMLElement` 20/22); then the detached-iframe `innerHTML`-upgrade gap
  (would close reactions/HTMLTableElement 10/10 + a scatter elsewhere).
