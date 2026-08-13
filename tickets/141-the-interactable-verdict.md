# 141 — The Interactable Verdict (Quests #570–#579, 2026-08-13, fourth sortie)

> *Every `<span>` and `<a>` on the web had a 0×0 bounding box — and WebDriver's
> pointer-interactable check ("does elementFromPoint(center) hit the element?")
> therefore rejected every automation click on inline content, everywhere,
> silently. The realm chosen was `:focus-visible`; the quest that mattered was
> the one found under it.*

**Region:** `css/selectors/focus-visible-*` (51 files, untouched) + the
css-pseudo box-dependent files carried from #560–#569 (getBoxQuads, hit-testing,
events, marker sizes). Baseline (honest, measured solo with the input bridge):
focus-visible files nearly all TIMEOUT (`:focus-visible` parsed as a
never-matching `PseudoClass::Other`); getBoxQuads 2/8; marker-hit-testing 0/20;
events-on-* 0/12.

**Result: region 38 → 220/247 over 60 scorable files** (see the ledger row; the
region-final batch is the number of record). getBoxQuads **8/8**,
focus-visible core 001–028 **all at 100% except 027 (1 subtest, capped)**,
script-focus **all 20 files 2/2**, `focus-visible-originating-element` **1/1**.

## Quest #570 — `:focus-visible` becomes real

The Rust selector engine parsed `focus-visible` into `PseudoClass::Other` — a
name accepted so querySelector would not throw, matching NOTHING, forever. Now a
real variant: `PseudoClass::FocusVisible` matches when the tree's
`focus_visible` flag is set AND the node is the focused element (it does NOT
light shadow hosts the way `:focus` does — the indication belongs to the
control, not its containers).

The flag itself is decided in JS's focusing steps (`_performFocus(el, method)`):

* **keyboard** focus (sequential navigation, accesskey) → visible, always;
* **pointer** focus → visible iff the element *supports keyboard input*
  (`_fvSupportsKeyboardInput`: texty `<input>` types — an unknown type IS text —
  `<textarea>`, `isContentEditable`); buttons/checkboxes/radios/ranges do not;
* **script** focus → visible unless the last focus-moving user interaction was a
  POINTER press. `__fvLastFocusModality` is set to `'pointer'` only by a press
  that actually focused something (a click on non-focusable content moves no
  focus and leaves the modality alone — script-focus-002/-006/-016), and to
  `'keyboard'` by any trusted non-chord key press. That one rule decides all 20
  script-focus files: inheritance is by MODALITY, not by the previous element's
  flag (script-focus-010: mouse-focusing a text input shows a ring, but a script
  move right after must NOT — the texty exception is not inherited).

While focused: any trusted non-modifier, non-chord keydown LIGHTS the flag
(007/011 — preventDefault does not suppress it; capture listener), a Ctrl/Alt/
Meta chord does not (012), and a press that doesn't move focus doesn't clear it.

## Quest #571 — the `outline` shorthand never reached getComputedStyle

The #547 `background` shape, again: the CSSOM SETTER path parsed
`outline: green solid 5px` correctly, but the cascade's `_SHORTHAND_LONGHANDS`
had no `outline` entry and `_expandShorthand` no branch — so a stylesheet's
outline computed `outline-color: black / outline-style: none / outline-width:
3px` on EVERY element of EVERY page. Every focus-ring assertion in the realm
sat on this. `column-rule` had the same hole; both fixed with the border-side
grammar the setter already used. *When a whole realm asserts through one
property, check that property's shorthand first.*

## Quest #572 — ⭐⭐⭐ inline elements had NO GEOMETRY

`<div>abc <span>hello</span> def</div>` — the span's getBoundingClientRect was
**0×0**. Taffy gives inline non-replaced elements no box (their fragments live
in the inline root's Parley layout), and the box query read `final_layout.size`
raw. Consequences ran far beyond styling: **testdriver.js rejects a click when
`elementFromPoint(rect center)` doesn't return the element** ("element click
intercepted"), so every automation click on a span, a link, a label — anything
inline — failed engine-wide. That is what all the "non-texty inputs"
focus-visible files were dying of; CSP/uievents/pointerevents realms have been
paying this tax too.

Fix in the fork (`blitz-dom/src/document.rs: inline_fragment_rect`): every
glyph run's `TextBrush` carries the id of the node whose STYLE it renders, so
an inline element's rect is the union of the runs stamped with its id or a
descendant's — run coords are content-box-relative and premultiplied by the
layout scale, exactly the painter's convention. `box_for_blitz_id` falls back
to it whenever Taffy reports 0×0.

## Quest #573 — CSSPseudoElement.getBoxQuads is real

`::before`/`::after` are real Blitz layout nodes (`node.before/.after` slots) —
the render layer now ships their boxes beside the element boxes (`pn`/`pb`
arrays; same 18-number stride, scroll slots repurposed for margins, because a
pseudo has no DOM node to answer used margins any other way). `#566`'s
CSSPseudoElement gained a real `getBoxQuads({box})`: border (default) /
content / padding / margin from the shipped edge widths. An INLINE pseudo
(`div::after { content: "A" }`) has no Taffy box either — it reuses #572's
glyph-run reconstruction. `CSSPseudoElement-getBoxQuads` 2/8 → **8/8**.

## Quest #574 — pseudo boxes hit-test for their originating element

css-pseudo-4: hit-testing a pseudo-element reports the nearest real element
ancestor. `_hitTestFromPoint` now tests each element's pseudo boxes too, so a
click on an outside list bullet reaches the `<li>` whose border box the bullet
sits entirely outside of. Plus `event.pseudoTarget` (the proposal the events-*
files test): on `click`/`dblclick`/`auxclick`, lazily resolved from the click
point against the target's own pseudo boxes → `el.pseudo(type)`'s stable
handle; hover-family events never carry it ("mouseover never sets
pseudoTarget"). events-on-after-before-marker row 1 (the one that matters —
click on ::before/::after/::marker) passes.

## Quest #575 — ::marker gets a box, and pseudo styles answer with USED sizes

An outside `::marker` is not a box in Blitz — it is text painted at an offset
(`draw_marker`). Its box is reconstructed with the same arithmetic the painter
uses (marker text width + the 8px char pad, right-aligned to the item's content
edge, first-line height). And `getComputedStyle(el, '::marker').width/height`
(and every pseudo view's) now answer the USED size when a layout box exists —
CSSOM's resolved-value rule — instead of the computed `auto`.
`marker-computed-size` 2/8 → 3/8 (see caps).

## Quest #576 — the UA focus ring

`:focus-visible { outline: auto }` is UA stylesheet, and no UA sheet existed —
`focus-visible-017-2`'s 38 subtests each assert `outline-style: auto` on a
programmatically focused element. One seat in `_computedPropOf`: when no author
`outline-style` reached the cascade and the (non-pseudo) element matches
`:focus-visible`, the computed value is `auto`. 017-2 1/38 → **38/38**, 018-2
2/38 → **38/38**.

## Quest #577 — accesskey is keyboard focus

`pressAccessKey` (WPT) sends Shift+Alt+key. The trusted-keydown listener now
runs the accesskey behaviour before the shortcut-chord guard (an accesskey IS
an alt-chord): find the `[accesskey]` element, focus it as KEYBOARD focus.
024/025 1/3 → **3/3** each.

## Quest #578 — `<li value>` sets the ordinal

Blitz numbered list items by position only. `collect_list_item_children` now
reads the `value` attribute (HTML §the-li-element) and continues from it —
`<li value="10">` renders "10. " and the next item "11. ".

## Quest #579 — the sweeps were blind to every input-driven test

`wpt_baseline.py` never installed the testdriver bridge, so every test that
drives real input (click / send_keys / Actions) sat waiting for a driver that
never answers and read as TIMEOUT — in EVERY sweep this campaign has run. The
bridge (from `wpt_run`) is now installed per page. *A sweep that cannot press a
key under-counts exactly the realms where a browser meets its users.* Also
fixed in the bridge itself: `impl.click` now dispatches ASYNCHRONOUSLY like a
real driver round trip (a focus handler that reads the promise variable the
call assigns depends on it — 006 was failing on its own synchronousness).

## The engine finds beneath the realm

* **`keypress` was never dispatched** — pages hang typing listeners on it
  (script-focus-004/-005/-014..-019 all wait on it). Now fired as part of the
  keydown default action, for both the WPT bridge and CDP input; canceling it
  cancels the edit.
* **Enter did not activate buttons** — `keydown Enter` on a focused
  button/input-button now runs its activation click (008).
* **`isContentEditable` did not exist** — every editing host on the web read
  `undefined`; now the real inherited computation (006).
* **Autofocus flushed at window `load`** — the spec point is document-ready;
  one rAF after parse (WPT's `waitUntilStableAutofocusState`) beat it. Now
  flushed at DOMContentLoaded with the load pass kept as safety net (009).

## ⛔ Caps / next (named honestly)

* **Empty list items collapse to 0 height** — a `<li></li>` with an outside
  marker shows its bullet on its own line in real browsers (the marker's line
  box); Blitz stacks all such items at the same y, so their marker boxes
  overlap and `marker-hit-testing` holds at 1/20. The fix is a real one, in
  block layout (a list-item with a marker establishes a line box), not in the
  box query. **Top pointer for the next render-path sortie.**
* Marker text lays out in the fallback font when the family is a webfont
  (`marker-computed-size` decimal row wants Ahem's 30px, gets 12.72px), and
  `::marker { content: … }` doesn't reach Blitz's marker generation (the
  string/image content rows, `marker-intrinsic-contribution` 1/8).
* Nested pseudo handles (`afterPseudo.pseudo('::marker')`) return null —
  events-on-after-before-marker rows 2–4; needs pseudo-on-pseudo boxes too.
* `events-on-pseudo-element{,-mutation,-shadow-dom}` need `::scroll-marker` /
  animation pseudoTarget / shadow-tree pseudo events — out of scope.
* focus-visible-027: changing a focused input's `type` to text should flip the
  flag; 1 subtest, not modelled.
* `marker-intrinsic-contribution-002` is a reftest-shaped file
  (could-not-run), same cap as every visual region.
* focus-visible files measured through `wpt_batch.sh` (chunked fresh servers):
  a LONG single-server sweep still degrades and poisons neighbors — #559's
  lesson, re-confirmed this arc by a batch that showed 018-2 "regressing" while
  a solo run on the same binary gave 38/38.

## Zero-regression proof

496-file ritual (`scripts/wpt-ritual.txt`) via `wpt_batch.sh`, PRE binary
(both repos stashed at e2f3e8f) vs POST, per-file diff via `wpt_batch_diff.py`:
**331 rows both passes, 55011/55608 → 55000/55609**, 2 rows up in-diff
(`marker-computed-size` 2/8→3/8, `WebCryptoAPI/idlharness` could-not-run→81/82)
and **4 flagged rows — FileAPI formdata-punctuation, aes_ctr, compression
bad-chunks.worker, 2d.pattern.basic.image — ALL 100% on a SOLO re-run of the
same POST binary**: chunk victims of batch neighbors (#559's lesson), not
regressions. **Zero real regressions.**
