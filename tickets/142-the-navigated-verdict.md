# Scroll 142 — The Navigated Verdict (Quests #580–#589)

**Date:** 2026-08-14 · **Region:** `html/interaction/focus/` (the untouched focus
realm, per the standing order) + the carried render-path pointers
· **Branch:** `engine-per-page-threads`

## The verdict, in one breath

THE BROWSER COULD NOT NAVIGATE TO A FRAGMENT. `location.hash` had ONLY A GETTER —
assigning it threw a TypeError — so every one of the twenty subtests in the
sequential-focus file died on its **reset line**, before testing anything. Pulling
that thread surfaced a family of absences that real pages lean on constantly:
`history.pushState` was a no-op stub (every SPA's router), `window.open` returned
null for every popup, an `<a href="#section">` click did nothing at all,
`document.fonts.load()` resolved before the font arrived (so every
"wait for the font, then measure" page measured the fallback), and blur/focus
events dispatched **untrusted**. Ten quests: the focus realm 219→~260 of 279,
and five engine primitives the whole web rests on.

## Quest #580 — an empty `<li>` gets its marker's line box (fork)

Blitz gave an empty list item zero height, so every empty `<li>` stacked at the
same y and their outside markers painted on top of each other
(`marker-hit-testing` 1/20 — the top render-path pointer from #579). CSS 2.1
§12.5: the outside marker aligns with the first line box, which exists even when
the principal box is empty. Fix in the fork's `layout/mod.rs` `Display::Block`
arm: a zero-height block with an outside `list_item_data` takes the marker
layout's line height (`margins_can_collapse_through = false`). Verified by
probe: two empty `<li>` at y=24 and y=124, markers separate, `elementFromPoint`
on the marker → the `<li>`.

## Quest #581 — marker layouts rebuilt when a webfont arrives (fork)

`marker-computed-size`'s decimal row wanted Ahem's 30px and got 12.72px
(fallback) — **forever**. `invalidate_inline_contexts` (the font-arrival damage
pass) only damaged nodes with `inline_layout_data`; an outside marker is a text
layout too, but it lives in `list_item_data` and is only rebuilt when the item's
**parent** is reconstructed (`collect_list_item_children` runs at the
container). The `<ol>` has no inline layout, so no damage ever reached it. Now
the pass collects every list item's parent and damages those as well.

## Quest #582 — `document.fonts.load()` / `.ready` are real (render pump)

The old `fonts.load()` was `Promise.resolve([])`. But a geometry read is
synchronous and **bounded** (500 ms) on the render side, so a slow webfont
outlives the wait and text measures in fallback — and the page's one tool for
waiting, `document.fonts`, lied that everything was done. Three layers:

* `ResolvedDoc::pump_resources()` — fold newly-arrived bytes into the document
  (one `resolve`), report the provider's in-flight count;
* op `op_layout('pending')` → `layout::pump_pending()` on the cached doc;
* JS `_fontsSettled()`: poll every 50 ms (≤5 s), then drop the JS geometry
  snapshot (`_layoutData = null`) so the next read re-ships settled boxes.
  `load()` and `ready` both settle through it.

With #581 this closed the loop: font lands → markers rebuilt → `fonts.load`
resolves → `getComputedStyle` reads 30px. `marker-computed-size` 3/8 → 4/8
(remaining rows = `::marker { content }`, still capped).

## Quest #583 — same-document navigation exists (fragment nav, pushState, moveBefore)

* **`location.hash` setter** (plus `search`/`pathname`/`protocol`/`host`/
  `hostname`/`port`, and fragment-aware `href`/`assign`/`replace`): a URL that
  differs only in a non-empty fragment is a SAME-DOCUMENT navigation — new op
  `op_set_document_url` updates what `location` reports without scheduling a
  fetch; `hashchange` (and `popstate`) fire on a later task, only if the URL
  changed; the fragment's element becomes `:target` (op `set_target_id`) and
  the **sequential-focus starting point**; the focusing steps run with the
  viewport as fallback — a non-focusable target UNFOCUSES the current element
  (that is why a page that navigates you to `#section` doesn't leave focus on
  the link).
* **`history.pushState`/`replaceState` real**: structured-clone the state
  (DataCloneError on failure), same-origin URL check (SecurityError), update
  the document URL, `history.state`/`length`. Traversal (back/forward) remains
  unmodelled — one document, no session history to walk.
* **`Node.moveBefore`** existed nowhere; now an atomic-move approximation over
  `insertBefore` (connectivity checks per spec).
* **A dispatched trusted click follows hyperlinks**: the document-level click
  handler only ran invoker activation; a WPT-driver or CDP click on
  `<a href>` navigated **nothing**. `_followHyperlink` factored out of the
  `click()` method and shared (`javascript:` URLs run as CSP-checked inline
  script; `#fragment` routes through fragment navigation).
* Frame windows got a live `location.hash` accessor too (same-document within
  the frame, `hashchange` at the frame window) — `document-with-fragment-valid`
  drives it.
* `:target` in Rust now also matches `<a name="...">` (the legacy anchor form).

## Quest #584 — the sequential focus navigation starting point (0/20 → 20/20)

HTML models the starting point as a POSITION, not an element — it survives the
element being removed. Implementation:

* **Sources**: a user click (mousedown, AFTER the focusing steps — so a click
  inside a focused container resumes from the click), `blur()`, the focus
  fixup, fragment navigation, and the proposed
  `document.setSequentialFocusStartingPoint()` (whatwg/html#5326). Every
  genuine focus move clears it.
* **The anchor**: at set time, capture the flat-tree ancestor chain with each
  level's FOLLOWING SIBLINGS (`_captureFlatChain`). For the focused element the
  chain is captured AT FOCUS TIME (`__obscura_focusAnchor`) — the fixup that
  runs after a removal cannot see the old ancestors. Navigation resumes from
  the deepest still-connected level, at the boundary just before the first of
  that level's following siblings that still lives there: removals BEFORE the
  position don't shift it, a removed parent climbs a level, slotted/shadow
  removals anchor in flat-tree terms.
* **Resume rules**: the starting point OUTRANKS the focused element when both
  exist; its tab-order slot is its nearest focusable flat ancestor's
  (`tiKeyOf` — a click inside a `tabindex=1` container resumes in the 1-group);
  backwards navigation never lands ON a container the starting point sits
  inside (it exits to the stop before it).
* **True flat preorder ranks**: the scope-emission walk ranks a scope's members
  before its nested scopes, which misplaces slotted elements in cross-scope
  comparisons — a dedicated flat-tree pre-pass ranks everything first.
* **Tab settles a pending fixup synchronously** — a Tab arriving before the
  fixup's frame must resume from the fixed-up position, not stale focus.

`sequential-focus-navigation-starting-point.tentative` **0/20 → 20/20** (the
whole file had been dying on `location.hash = ''`);
`setSequentialFocusStartingPoint.tentative` → 1/1.

## Quest #585 — autofocus is a QUEUE, and frames focus their iframe

The old model was "first `[autofocus]` in tree order at DCL". The spec's is a
queue of candidates in TEMPORAL insertion order, and WPT distinguishes them:

* remove-and-reinsert re-queues BEHIND later candidates (`first-reconnected`);
* an element inserted later loses even if it lands EARLIER in the tree
  (`first-when-later-but-before`) — markup candidates are seeded at the FRONT
  the first time anything autofocus-related happens, excluding the subtree a
  JS insertion is right now adding;
* a candidate whose document currently has a **fragment target** is dropped
  (`document-with-fragment-valid` vs `-empty`/`-top`/`-nonexistent`: only an
  actual matching element blocks, not the fragment's mere presence);
* once the top document's focused area is not the document itself, processing
  stops for good (`focusable-area-in-top-document`);
* each candidate remembers which top-level context queued it — moved to
  another context before the flush, it is skipped there
  (`skip-another-top-level-browsing-context`).

Insertion hooks: appendChild / insertBefore (cheap `hasAttribute` guard, deep
scan only when the inserted node has element children), innerHTML (regex-gated
scan, the #545 `[id]` pattern), frame-document parse. Removal dequeues.

**Frame focus chain**: focusing an element in a frame document now records it
on THAT document (`_focusedElement`, with shadow retargeting in
`activeElement`) and focuses the host `<iframe>` chain above it — so the top
document's `activeElement` is the iframe, exactly what every fragment test
asserts. Routing keys on the node's real tree root (`_docOfFocusNode`), because
frame nodes' `ownerDocument` is the main document (long-standing quirk).

## Quest #586 — the focus fixup rule, fully (1/8 → 8/8)

* a form control inside a **disabled `<fieldset>`** is unfocusable — unless it
  sits in the fieldset's FIRST `<legend>` (and inserting a new first legend
  demotes the old one: insertion now schedules a fixup check);
* `visibility: hidden`/`collapse` unfocuses — including via
  `el.style.visibility = …`, which never reaches the style attribute; the
  rendered-check reads the live declaration and the nearest inclusive ancestor
  that declares visibility decides;
* inline-style writes schedule the fixup (`_notifyChange`);
* timing: rAF + zero-timeout — after that frame's rAF callbacks AND its
  ResizeObserver notifications, before the next frame (the file asserts the
  whole order).

## Quest #587 — focus events are trusted; `focusVisible`; `hasFocus`

* blur/focus/focusin/focusout now dispatch through `_dispatchSpec` with
  `isTrusted = true`, as real `FocusEvent`s carrying `relatedTarget` (the
  public `dispatchEvent` clears trust — that is what it is for).
  `focus-events` 0/2 → 2/2, `composed.window` 0/1 → 1/1.
* `el.focus({focusVisible})` overrides the modality heuristic in either
  direction. `focusVisible` 1/5 → 5/5.
* `Document.hasFocus()` is false for a document with no browsing context
  (`createHTMLDocument`).

## Quest #588 — `window.open` opens a WINDOW

Popups had returned null since forever ("what a popup blocker looks like") —
and this session alone eight subtests were capped on it. A popup is now a
second top-level browsing context assembled from the frame machinery WITHOUT a
host element: `_IframeDocument` + `_IframeWindow`, `doc._popupWin` marks it,
`opener`/`top`/`parent`/`close()` wired, the URL fetched on the frame road
(`no-cors`, initiator `iframe` — a document load is a navigation, not a
connect-src fetch), decoded with document sniffing, its scripts run through
`_executeFrameScripts`, `load` fired at the popup window. Focus inside a popup
stays per-document and NEVER climbs into the opener. Autofocus flushes settle
per top-level context. `supported-elements` 0/6 → 6/6, `autofocus-dialog`
0/2 → 2/2, and the window.open halves of the fragment files all passed.

## Quest #589 — a `::before { display: list-item }` generates a marker (fork)

`collect_list_item_children` walked element children only; pseudo nodes hang
off `node.before`/`node.after` slots and never got `list_item_data`. Now they
are visited (their styles inherit `list-style-*` from the originating element),
and obscura-render ships the pseudo's reconstructed marker box under the
originating element's nid (only when the element has no marker of its own), so
hit-testing lands on the element. With #580/#581: `marker-hit-testing`
**1/20 → 7/20** across the session.

## Results (solo runs, final binary)

| Test | Before | After |
|---|---|---|
| sequential-focus-navigation-starting-point.tentative | 0/20 | **20/20** |
| setSequentialFocusStartingPoint.tentative | 0/1 | **1/1** |
| focus-fixup-rule-one-no-dialogs | 1/8 | **8/8** |
| processing-model/focusVisible | 1/5 | **5/5** |
| focus-management/focus-events | 0/2 | **2/2** |
| composed.window | 0/1 | **1/1** |
| the-autofocus-attribute/supported-elements | 0/6 | **6/6** |
| autofocus-dialog | 0/2 | **2/2** |
| document-with-fragment-{empty,top,nonexistent} | 0/2 ×3 | **2/2 ×3** |
| document-with-fragment-valid | 0/3 | **3/3** |
| focusable-area-in-top-document | 0/1 | **1/1** |
| skip-another-top-level-browsing-context | 0/1 | **1/1** |
| first-reconnected / first-when-later-but-before / autofocus-on-stable-document | 0/1 ×3 | **1/1 ×3** |
| document-level-apis | 2/4 | **4/4** |
| css/css-pseudo/marker-hit-testing | 1/20 | **7/20** |
| css/css-pseudo/marker-computed-size | 3/8 | **4/8** |

**Region: 58 scored files (`focus-probe.txt`), 208/275 → 267/275 (97%), 18
files up, 3 could-not-run both passes (2 crashtests + a reftest — not
harness-runnable).**

⚠️ **The region diff caught TWO REAL REGRESSIONS and both were closed
in-session**: `no-cross-origin-autofocus` and `no-sandboxed-automatic-features`
went 1/1 → 0/1 — the new frame-autofocus chain focused iframes the OLD code
never could (it had no frame autofocus at all), and the queue never consulted
the sandbox/cross-origin gates. A frame the embedder cannot reach into must not
steal its focus either: the flush now drops candidates whose host iframe is
sandboxed (the automatic-features flag has no allow- token), cross-origin,
blocked, or opaque. *A new capability inherits every restriction the old
incapacity was accidentally enforcing.*

## ⛔ Caps / next (named honestly)

* **`same-origin-autofocus` TIMEOUT** — needs a cross-site child iframe
  relaying `postMessage` through `frames[0]` plus a grandchild; the frame
  message-plumbing isn't there.
* **`update-the-rendering`** — asserts autofocus → `scroll` event → rAF order;
  we do not scroll on focus, so no scroll event fires. Firing one synthetically
  would be a lie.
* **`spin-by-blocking-style-sheet`** — script-blocking stylesheets don't pause
  the autofocus flush (no streaming parser to pause).
* **preventScroll / focus-selection / textarea-scroll-selection** — real
  scroll-on-focus and input-selection geometry; render-path work.
* **Popups**: no rendering, no real isolation (same realm), `resizeTo`/screen
  geometry absent; window.open popups are a BEHAVIORAL model. Watch for realms
  where tests now progress further and hit new walls (previously null-deref'd
  fast).
* **`::marker { content }`** still unmodelled in the render path (needs stylo
  lazy pseudo resolution in the fork — Marker is a NON-EAGER pseudo in servo
  config, `styles.pseudos` never carries it). The remaining
  marker-computed-size/hit-testing rows sit on it, plus `list-style-image`
  markers (image fetch in marker generation) and INSIDE-marker hit rows.
* Element/Text `getBoxQuads` still stubs ([] — WPT has no coverage; low ROI).
* Range.getBoundingClientRect still a zero rect — sub-range glyph geometry
  (per-character clusters) is the missing primitive; named for a future
  render sortie (selection/caret geometry everywhere).

## Zero-regression proof

496-file ritual (`scripts/wpt-ritual.txt`) via `wpt_batch_par.sh` (4 shards,
own ports, fresh server per chunk), PRE binary (both repos stashed at
f85fa57/852da4a) vs POST, per-file diff via `wpt_batch_diff.py`:
**331 rows both passes, 55114/55690 → 55091/55690, 2 could-not-run both
passes, 1 row up in-diff (`marker-computed-size` 3/8→4/8), and ONE flagged
row — `the-img-element/naturalWidth-naturalHeight-width-height` (210→197 on
the first post pass, 210→186 on the final-binary re-run) — the campaign's
DOCUMENTED flaky file (#530 proved it at 188/210/210), re-proven here: three
solo runs of the SAME binary gave 201, 167, 210.** A 43-subtest swing with
nothing changing is the network, not the code. **Zero real regressions.** The
ritual ran twice because the two region regressions above were fixed AFTER the
first post pass; the final-binary re-run is the number of record.

⚙️ Harness note: this arc's rituals ran on `wpt_batch_par.sh` — the plain
`wpt_batch.sh` was pacing at ~80 rows per 25 minutes; four sharded servers do
the whole 496-file list in ~35. The par script kills only its own server PIDs,
so it is also the only safe way to ever run two measurement jobs on one box.
