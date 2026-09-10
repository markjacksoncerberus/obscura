# ⚔️ Scroll 498 — The Announced Verdict

> **Quests #698–#711 · 2026-09-10 · `wai-aria/` · `svg-aam/` · `dpub-aam/`**
>
> **26-file a11y-bridge probe 164/304 → 291/304** (+127)
> `wai-aria/idlharness.window.html` **65/121 → 121/121**
> `dpub-aam/role/roles.html` **0/39 → 39/39**
> `html-aam/` held at 885/888 and the accname probe at 804/816.

---

## Why this region

Scroll 497 finished `html-aam` and left a pointer: *the rest of the same bridge*.
`get_computed_role` / `get_computed_label` were already wired, so every other
realm that speaks through them was reachable with no harness work. A cold
baseline over 26 files said **164/304** — and the failures were not a long tail,
they were four walls.

---

## The four walls

### 1. There was no vocabulary for a book (#698)

`dpub-aam/role/roles.html` read **0/39**. Every DPUB-ARIA role — `doc-chapter`,
`doc-footnote`, `doc-index`, `doc-biblioref`, `doc-pagebreak`, thirty-six more —
was missing from the valid-role set, so every one of them fell through to
`generic`.

This is the vocabulary of a **book**: it is how a reader moves through a long
document by structure instead of by scrolling — jump to the chapter, to the
footnote, back from a citation, to the page break that matches the print
edition. Digital publishing is most of what a school textbook, a public-library
loan and a government form actually *are* now. Flattening all of it to `generic`
turns a structured book into an undifferentiated wall of text for exactly the
reader who most needed the structure. **41 role names, +39 subtests.**

### 2. Every shape in every icon was announced as a symbol (#699–#701)

`svg-aam/role/roles-generic.html` read **1/9**: an unnamed `<circle>`,
`<path>`, `<rect>`, `<g>` — the ordinary furniture of every icon on the web —
was mapped to `graphics-symbol` / `group`. `graphics-symbol` means *this mark
carries meaning*. Say it about all forty paths in an icon set and you have
buried the two that do.

SVG-AAM §5.1.2: an unlabelled graphics element is generic. So a shape is a
symbol **only once somebody has named it** — and "named" here has four sources,
which is where the other two findings came from:

* **`xlink:href` makes an `<a>` a link (#700).** The role check asked only for
  `href`. `xlink:href` is not a legacy curiosity in SVG — it is what every
  editor emitted for a decade, and it is most of the linked SVG in the wild.
* **`xlink:title` is a name source (#701).** SVG's own tooltip attribute, below
  the `<title>` element and above the plain `title` that step 2I reaches. It was
  not consulted at all, so `comp_host_language_label.html` read 10/18 and
  `comp_labelledby.html` silently dropped one referenced name out of four.

### 3. The tree existed only one element at a time (#702)

`wai-aria/accessibility_properties_basic.tentative.html` and
`wai-aria/subtree/tablist.tentative.html` both died on
*"`get_accessibility_properties_for_element` is a testdriver.js function which
cannot be run in this context"*.

Role and name answer *"what is this ONE element"*. A screen-reader user pressing
"next heading", and an agent told to *"click Submit in the payment form"*, both
need something else: **the shape** — what contains what, in the order a person
meets it, with the scaffolding taken out. So this quest built the accessibility
tree itself:

* stable, lazily-minted node ids (`ax-1`, `ax-2`, …) that a caller can hold and
  come back to;
* inclusion: an `aria-hidden` or `display:none` subtree is **not in the tree at
  all**, and neither is an element whose role is `none`/`presentation` — but its
  **children are promoted to its parent**, because the author asked to hide the
  box, not what is in it. An element with no role of its own (a `<span>`
  wrapper) is transparent the same way;
* per-node properties: `accessibilityId`, `role`, `label`, `parent`, `children`,
  and the state attributes (`checked`, `expanded`, `selected`, `pressed`,
  `disabled`, `level`, `description`).

Exposed as `__obscuraA11yProps` / `__obscuraA11yPropsById`, with a two-line
testdriver adapter in `scripts/wpt_run.py` — the same division of labour as
`get_computed_role`: the engine computes, the harness only hands over.

⭐ **This is the most agent-facing thing in the arc.** It is the shape of the
answer a CDP `Accessibility.getFullAXTree` would give, and it is the query an
automation tool actually wants: not "what does this selector match" but "what
are the controls on this page, and what are they called".

**#709** came out of the same file: an ARIA `checkbox` with **no**
`aria-checked` was reported as *unknown*. A control that can be checked and does
not say it is, is **unchecked** — and the user needs to be told that rather than
told nothing.

**#708**: an `aria-actions` target is a separate control that happens to sit
inside its host. Folding its text into the host's name gives you a button called
*"Save document Edit"* — two commands in one label, and a user who cannot tell
which one they are about to press.

### 4. The ARIA IDL surface answered when it should have thrown (#703–#707, #710, #711)

`wai-aria/idlharness.window.html` read **65/121**, and 52 of the 56 failures
were the same two lines of WebIDL discipline repeated over every ARIA property:

* **#703 — the brand check.** A WebIDL accessor lives on the **prototype** but
  belongs to the **instance**. `Element.prototype.ariaLabel` must throw a
  `TypeError`; ours quietly answered `null`. That is not pedantry — it is how
  every feature-detect and polyfill on the web asks *"does this engine have real
  ARIA reflection"*, and answering `null` tells them **yes** about an object
  that is not an element at all.
* **#704 — and the names.** A WebIDL accessor's function is named
  `get ariaLabel` / `set ariaLabel`. `{ get() {…} }` in an object literal names
  it plain `get`. Nobody reads these by hand — every IDL conformance harness
  does, and so does every stack trace a page author is handed.
* **#706** re-wrapped the eight Element-typed reflections
  (`ariaLabelledByElements`, `ariaControlsElements`, …) through the same helper
  rather than restating sixteen accessors.
* **#705 — `ariaNotify`** did not exist on `Element` or `Document`. Obscura has
  no speech channel to deliver a notification to, so it validates its arguments
  and does nothing further — a page that calls it must not crash, and a page
  that feature-detects it deserves an honest "the method is here".
* **#707 — `ariaActionsElements`**, the reflection of `aria-actions`: *"these
  controls act on me"*. The row's Edit and Delete buttons belong to the row, and
  a screen reader can offer them as **actions** instead of making the user hunt
  for them in the reading order.
* **#710 — ARIAMixin on `ElementInternals`.** A custom element's author writes
  `internals.role = 'button'` in the component's own code; the page that uses
  `<my-button>` may override it with a `role` attribute. These are **default
  semantics** and deliberately do **not** reflect to content attributes — the
  point is that the page's markup stays clean and the component still announces
  itself. ⭐ And the name/role computation now **reads them**: a computation that
  only looks at content attributes announces every well-built web component as a
  nameless `generic`.
* **#711 — an IDREF is resolved in the element's OWN node tree.** Inside a
  shadow root, ids are scoped to that root: resolving `aria-labelledby` against
  the document finds nothing — or, worse, a different element with the same id
  out in the light DOM.

---

## Results

| test | before | after | |
|---|---|---|---|
| `wai-aria/idlharness.window.html` | 65/121 | **121/121** | ✅ |
| `dpub-aam/role/roles.html` | 0/39 | **39/39** | ✅ |
| `svg-aam/name/comp_host_language_label.html` | 10/18 | **18/18** | ✅ |
| `svg-aam/role/roles-generic.html` | 1/9 | **9/9** | ✅ |
| `wai-aria/aria-actions/idl-reflection.tentative.html` | 11/20 | 18/20 | ⬆️ |
| `wai-aria/accessibility_properties_basic.tentative.html` | 0/3 | **3/3** | ✅ |
| `svg-aam/role/roles.html` | 3/4 | **4/4** | ✅ |
| `svg-aam/name/comp_labelledby.html` | 8/9 | **9/9** | ✅ |
| `wai-aria/checked/checked.tentative.html` | 3/4 | **4/4** | ✅ |
| `wai-aria/aria-actions/*-accname-*` (3 files) | 1/4 | **4/4** | ✅ |
| **26-file bridge probe** | **164/304** | **291/304** | **+127** |

Zero regressions: `html-aam/` held at **885/888**, the accname probe at
**804/816**, and a targeted sweep of the surfaces this arc touched came back
clean — `html/dom/aria-attribute-reflection` 41/41,
`custom-elements/ElementInternals-accessibility` 50/50,
`element-internals-shadowroot` 7/7, qsa 1975, classlist 1420, attributes 67.

---

## ⛔ Caps

* **`role_none_conflict_resolution.tentative.html` (5) and
  `svg-aam/role/roles.tentative.html` (3) are UNWINNABLE BY CONSTRUCTION.** Their
  `data-expectedrole` values are the literal strings
  `"SPEC_AMBIGUOUS_LOG_VALUE"` and
  `"UNDEFINED in SVG-AAM, but possibly graphics-document"` — the files exist to
  *log* what engines do while the working group decides. No engine passes them.
* **`svg-aam/role/role-img.tentative.html` (3).** The test writes `<image>`
  elements **outside** any `<svg>`, and the HTML parser rewrites `<image>` to
  `<img>`. So the file measures the HTML `img` rule, not the SVG one — and what
  it then expects (a bare, sourceless `<img>` is `image`) directly contradicts
  `html-aam/img-src-srcset-roles.tentative.html` (a bare, sourceless `<img>` is
  generic), which we pass 49/49. Two tentative tests, one engine, opposite
  answers.
* **`idl-reflection.tentative.html` (2).** One expects `removeAttribute` to
  **preserve** an IDL-set element list; HTML's attribute-change steps clear the
  explicit list on any change, which is what we do and what the non-tentative
  reflections rely on. Left alone deliberately rather than changed on the word
  of one tentative file.
* `core-aam/` is `.py` wptrunner tests (not runnable here) and `graphics-aam` is
  entirely `-manual`. Measured and excluded, not forgotten.

## Caps / Next

1. ⭐⭐ **`counter()` / `attr()` / `:dir(rtl)` inside CSS `content`** — still the
   12 remaining `comp_name_from_content` rows, and generated content reaches far
   past accname.
2. ⭐⭐ **Wire the accessibility tree to CDP** (`Accessibility.getFullAXTree`).
   The tree is now computed; nothing outside the testdriver bridge can ask for
   it, and an agent driving Obscura over CDP is exactly who should.
3. ⭐⭐ The sticky offset in the PAINT path (carried from 496).
4. ⭐⭐ Layout for iframe documents in the parent realm (carried).
