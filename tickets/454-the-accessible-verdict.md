# 🪧 Quests #454–#456 — The Accessible Verdict

> *What is this, and what is it called?*
>
> Two questions. A screen reader asks them to speak a page aloud. An AI agent
> driving Obscura asks them to find the button it was told to press. Before this
> session the engine could answer neither, and the whole `accname` realm — the
> part of the Web Platform Tests that asks exactly those two questions — scored
> **0.0%**.

**Session:** 2026-08-02 · **Branch:** `engine-per-page-threads` · **Quests:** #454, #455, #456
**Result:** `accname` + `wai-aria/role` **0/853 → 818/853 (95.9%)**, 31 of 34 files at 100%, **zero regressions**

---

## Why this region, and not the ⭐

The outgoing pointer was `css-typed-om/the-stylepropertymap/properties/border-width.html`
(120/136). It is a good target and it is still worth taking. We did not take it,
because of the **standing order set after the frontier survey**: when the ⭐ points
deeper into a realm already above 85% and an untouched realm below 40% is on the
map, take the untouched one.

`accname` was not merely untouched. It was the **only realm on the whole frontier
survey at exactly 0.0%**, against a Chrome at 98.6% on the same files — and it is
the realm this browser exists for. Obscura is a browser AI agents can drive on
modest machines, and the accessible name is *how an agent knows what an element
is*. Scoring zero there is not a conformance gap; it is the product not working.

**⭐ banked for later:** `border-width.html` 120/136 — the file's own comment is the
quest, *"Computed value is independent of border-style"*; `computedStyleMap()` is
the **computed** value and `getComputedStyle()` the **resolved** one.

---

## The measured baseline (before)

Every one of these files failed on the *same first line*:

```
TypeError: window.test_driver_internal.get_computed_label is not a function
```

| file | before |
|---|---:|
| `accname/name/comp_label.html` | 0/131 |
| `accname/name/comp_host_language_label.html` | 0/88 |
| `accname/name/comp_name_from_content.html` | 0/79 |
| `accname/name/comp_text_node.html` | 0/50 |
| `accname/name/comp_embedded_control.html` | 0/29 |
| `accname/name/comp_labelledby_hidden_nodes.html` | 0/27 |
| `accname/name/comp_tooltip.html` | 0/22 |
| `accname/name/comp_labelledby.html` | 0/10 |
| `accname/aria-owns.html` | 0/9 |
| `accname/name/comp_hidden_not_referenced.html` | 0/5 |
| `accname/basic.html` | 0/2 |
| `wai-aria/role/**` (23 files) | 0/401 |
| **total** | **0/853** |

Note the shape of that zero. It is not 853 separate defects — it is **two missing
primitives**, `computedRole` and `computedLabel`, behind every single row.

---

## Where the work went

Everything is `crates/obscura-js/js/bootstrap.js` (one new top-level block, ~640
lines) plus a **two-line** adapter in `scripts/wpt_run.py`.

The adapter is two lines *on purpose*. WPT reaches the answer through WebDriver's
"Get Computed Role"/"Get Computed Label" commands, which the harness cannot
synthesize the way it synthesizes clicks — the answer has to come from the
engine's own accessibility computation. Obscura now exposes that computation as
**`Element.computedRole` / `Element.computedLabel`** (the pair the AOM proposal
puts on Element, and the pair those two WebDriver commands return), so the bridge
is an adapter rather than an implementation. If those ever start answering `''`
for everything, the engine regressed and the harness will say so.

---

## Quest #454 — the computed role · `wai-aria/role` 0/401 → 391/401

Obscura already *reflected* `role`: it could store the attribute and hand it
back. That is a different question from "what role does this element have", and
the difference has four parts.

**A role attribute is a token LIST, and abstract roles are not roles.**
`role="foo button"` is a button. `role="widget"` is **not** a widget — the
abstract roles exist to organise the ARIA taxonomy and no element may claim one.
That single rule is `invalid-roles.html` 76/76.

**Roles have synonyms.** `presentation` and `none` are one role with two
spellings; `directory` was folded into `list`; `img` was renamed `image`.

**Without a `role` attribute — which is nearly always — the role comes from the
HTML element, and that mapping is not a tag→role table.** `<a>` is a link only
*with* an href. `<th>` is a columnheader or a rowheader depending on `scope`.
`<select>` is a combobox until `multiple`/`size>1` makes it a listbox. And
`<img alt="">` is explicitly *not* an image: it is `none`, the author declaring
it decorative — **unless they also named it**, because an image someone bothered
to label was meant to be perceived.

**`role="none"` is a REQUEST, and the UA must sometimes refuse it.** Hiding a
focusable element from the accessibility tree strands the user on something they
cannot identify, so a focusable element or one carrying a global ARIA attribute
keeps its implicit role. Two corrections came out of measuring rather than
reading:

- **`tabindex="-1"` is focusable.** Not tab-*reachable*, but reachable: focus can
  land there programmatically, so the element must still be able to say what it
  is. Our first cut tested `>= 0` and got `role_none_conflict_resolution.html`
  6/7.
- **Presentational children.** When a container is `none`, the elements it is
  *required to own* go with it — a list with no list semantics has no listitems
  in it, whatever the `<li>` tags say. Leaving them exposed announces items
  belonging to a list the user was never told about. (`spec_ambiguities` 0/3 → 3/3.)

---

## Quest #455 — the accessible name · `accname` 0/452 → 391/452

Nine ordered steps; the first that yields non-blank text wins; several of them
recurse back into the whole computation for a different node. Three things in it
are easy to get subtly wrong, and each one is a real page if you get it wrong.

**"Blank" means blank of ASCII whitespace ONLY.** A non-breaking space and the
blank braille pattern U+2800 are *content*. `aria-label="⠀"` is a name; an engine
that trims Unicode whitespace silently renames that button to whatever its markup
happens to contain. The test suite checks this on purpose, four ways.

**A hidden node contributes nothing — unless the computation was pointed at it
deliberately.** Authors routinely park a label in a `display:none` span and point
`aria-labelledby` at it; refusing to read it would strand every one of those
pages. But the exemption belongs to *the node that was referenced* and to what it
was hiding — not to a hidden node underneath a *visible* referent. So the
exemption propagates to a node's children only if the node itself was hidden.
Both halves are tested, in adjacent lines of the same file.

**Recursion changes the rules for the node it lands on.** A descendant
contributes its content whatever its own role would permit for itself — that is
why `<button><em>Save</em></button>` is named "Save" even though naming an `<em>`
is prohibited. And a form control reached by recursion contributes its **value**,
not its markup, which is what makes *"Flash the screen [3] times"* read correctly
when the 3 is a spinbutton sitting inside the label.

**The role and the name are mutually recursive, and the recursion is real.**
`region` and `form` are landmarks, and ARIA says an *unnamed* landmark is not
that role at all — `<nav role="region">` with no name is a navigation, and
`<div role="ReGiOn group">` falls through to `group`. So the role of those two
depends on whether a name exists, and the name computation asks for the role.
We cut the knot by asking the narrower question the rule actually turns on —
*did the author name it* — which is the only way a `region`/`form` can acquire a
name in the first place. (`fallback-roles` 19/22 → 22/22, `form-roles` and
`region-roles` to 2/2.)

---

## Quest #456 — the corners · `accname` 391/452 → 421/452, and the last two roles

Eight fixes, each one a distinction the first cut had flattened.

**1. `hidden` had to be read as an attribute, not as a style.** Obscura has no UA
stylesheet, so `getComputedStyle(span).display` will never say `none` on account
of a `hidden` attribute. Asking CSS was asking the wrong oracle.

**2. There are two different kinds of hidden and they behave oppositely.**
`display:none`/`aria-hidden`/`hidden` remove a **subtree**; nothing inside comes
back. `visibility:hidden` does not — it *inherits*, and a descendant may set
`visibility:visible` and reappear. So visibility must not stop the descent; it
only silences the text that actually computes to hidden. And because the property
inherits, that is exactly what asking each **text node's own parent** answers,
with no ancestor walk at all.

**3. A descendant that contributed nothing but SPACE still contributed the
space.** `button<span><span><span> </span></span></span>label` is "button label",
not "buttonlabel". The separator is the entire meaning of that markup, and the
"skip if blank" test at step 2F eats it. Whitespace from a descendant is returned
after the tooltip step rather than discarded.

**4. Each node contributes to a name ONCE, and the visited set is never
unwound.** The rule is not "no cycles" but "already spoken": a heading whose
first link is `aria-labelledby` an image, and whose second link *contains* that
same image, must not say "image" twice.

**5. An element may name ITSELF.** `aria-labelledby="g2 h2"` on `#g2` is not a
cycle — it means "start my name with whatever the rest of the steps give me".
Run them with the labelledby flag already set so step 2B is not re-entered.

**6. `title` beats `placeholder`.** HTML-AAM puts the placeholder *below* the
tooltip, so it is not part of the host-language step at all — it is the very last
resort, after step 2I. That one ordering line is `comp_tooltip.html` 14/22 → 22/22.

**7. `aria-valuetext` beats `aria-valuenow`,** and a non-native `combobox` or
`listbox` has a value too — its displayed content, or its `aria-selected` option.
(`comp_embedded_control.html` 24/29 → 29/29.)

**8. `aria-owns` RELOCATES, and the two ways of hiding part company there.**
Without relocation, owned content is read **twice** — once where it sits and once
where it moved — which is worse than not supporting `aria-owns` at all. And then
the distinction the test file spells out in a comment: `aria-hidden` inherits
down the *accessibility* tree, so a node reparented out from under it is no
longer hidden by it; `hidden`/`display:none` is a fact about *rendering*, and
`aria-owns` does not move anything on screen, so it cannot un-hide those. Our
first cut used one predicate for both and went 8/9 → 7/9. Two predicates: 9/9.

**9. Text reads as it is RENDERED.** `text-transform:uppercase` means the name is
"CALL US", because that is what is on the screen.

---

## Results

| file | before | after | |
|---|---:|---:|---|
| `accname/name/comp_label.html` | 0/131 | **131/131** | ✅ |
| `accname/name/comp_host_language_label.html` | 0/88 | **88/88** | ✅ |
| `accname/name/comp_text_node.html` | 0/50 | **50/50** | ✅ |
| `accname/name/comp_embedded_control.html` | 0/29 | **29/29** | ✅ |
| `accname/name/comp_labelledby_hidden_nodes.html` | 0/27 | **27/27** | ✅ |
| `accname/name/comp_tooltip.html` | 0/22 | **22/22** | ✅ |
| `accname/name/comp_labelledby.html` | 0/10 | **10/10** | ✅ |
| `accname/aria-owns.html` | 0/9 | **9/9** | ✅ |
| `accname/name/comp_hidden_not_referenced.html` | 0/5 | **5/5** | ✅ |
| `accname/basic.html` | 0/2 | **2/2** | ✅ |
| `accname/name/comp_name_from_content.html` | 0/79 | **49/79** | 🟢 62% |
| `wai-aria/role/roles.html` | 0/162 | **162/162** | ✅ |
| `wai-aria/role/invalid-roles.html` | 0/76 | **76/76** | ✅ |
| `wai-aria/role/tab-roles.html` | 0/37 | **37/37** | ✅ |
| `wai-aria/role/fallback-roles.html` | 0/22 | **22/22** | ✅ |
| `wai-aria/role/` (18 more files) | 0/99 | **99/99** | ✅ |
| `wai-aria/role/role_none_conflict_resolution.tentative.html` | 0/5 | **0/5** | ⛔ cap |
| **TOTAL** | **0/853** | **818/853** | **95.9%** |

---

## Caps — named honestly, do not burn a session on these

- **`role_none_conflict_resolution.tentative.html` 0/5 — UNWINNABLE, by
  construction.** Every row's `data-expectedrole` is the literal string
  `SPEC_AMBIGUOUS_LOG_VALUE`. The file exists to *log* what engines do while the
  ARIA WG decides; no role name can ever equal that sentinel. Chrome fails these
  too. **Do not "fix" it.**

- **27 of the 30 remaining `comp_name_from_content` rows need `::before`/`::after`
  content, which the engine does not have** — see ⭐ below. Six of those 27 also
  need CSS **counters** (`counter-set` / `counter-increment` inside `content`),
  which is a further layer.

- **3 rows need to tell an inline child from a block one, and the engine cannot.**
  `getComputedStyle(el).display` answers **`block` for every element in the
  document** — `_GCS_DEFAULTS.display` is a single global initial and there is no
  UA default stylesheet behind it. The a11y layer therefore space-joins every
  child; the `display:block` rows pass for the wrong reason and the inline rows
  fail. This is not an accname bug. See ⭐⭐ below.

---

## ⭐ Next leverage

**⭐ Pseudo-element computed style — `getComputedStyle(el, '::before')`.**
`globalThis.getComputedStyle` accepts a `_pseudo` argument and then **ignores it
completely**: `_buildCascade(el)` never sees it, so the call returns the
*element's* style and `content` reads `normal` for every pseudo in existence.
The fix looks contained — the rule list is already flattened in
`_buildCascadeUncached`, so a pseudo cascade is "strip the trailing `::before`
from each selector, match the remainder against the element, keep the rules that
had it". It touches the hottest shared path in the engine, so it needs the wide
sweep. It is worth it three times over:
  1. **21 accname subtests** here (the 27 minus the 6 that also need counters);
  2. the **pseudo-element transition rows** the animation arc already named as its
     own leverage (c) — `::before`/`::after` as style-flush candidates;
  3. the untouched **`css/css-pseudo`** realm, which nobody has measured.

**⭐⭐ A UA default stylesheet for `display`.** Every element reporting `block` is
a lie the whole engine tells, and it is *layout-visible*, not just an accname
inconvenience. The initial value of `display` is `inline`; `block` belongs to a
UA stylesheet keyed by element name. Doing it properly means a UA-origin cascade
layer below author rules — the lowest layer of the cascade, which the engine
currently skips entirely. Big blast radius, big payoff, and it is a prerequisite
for honest reftest work.

**Bankable, untaken:** `accname/name/shadowdom/` (never measured — the traversal
in `_a11yChildren` is already flattened-tree aware, so it may be close),
`accname/name/comp_name_from_heading.tentative.html`, and `wai-aria/` outside
`role/` (the survey put the whole realm at 25.1%; `role/` is now 97.5% of it, so
re-measure before choosing).

---

## Reusable pieces seeded here

In `bootstrap.js`, one block, all private to it:
`_computedRole` · `_explicitRole` / `_implicitRole` (the HTML-AAM table) ·
`_presentationRefused` / `_focusable` / `_ownedByPresentational` ·
`_accName` (the nine steps) · `_fromContent` · `_a11yChildren` (flattened tree +
aria-owns) · `_ownerMap` (the relocation index) · `_blocksDescent` vs `_visHidden`
vs `_hostHiddenAncestral` (**the three different hiddens** — the single most
reusable distinction in here) · `_renderedText` (text-transform) ·
`_embeddedControlValue` · `_pseudoText` / `_splitContentAlt` (**already written
against the `content: "x" / "alt"` syntax, so it lights up the moment ⭐ lands**).

Also new this session: **`scripts/wpt-ritual.txt`** — the zero-regression sweep as
a committed file rather than a list carried in memory. Run it before every commit:
```sh
.venv/bin/python scripts/wpt_run.py --tests-file scripts/wpt-ritual.txt --timeout 60
```
