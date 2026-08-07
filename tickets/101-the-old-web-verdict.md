# ⚔️ Scroll 101 — The Old Web Verdict (`quirks`)

> *Quest #500 · 2026-08-07 · branch `engine-per-page-threads`*
>
> **`quirks` 4362/6978 → 6867/6978 (98.4%).** Two of the six big files at 100%.
> Obscura reported `CSS1Compat` for **every document that has ever existed in
> it** — so it had never once entered quirks mode.

---

## The gap, and why it is the mission

Quirks mode is not a curiosity. In quirks mode the CSS parser accepts two
spellings it otherwise rejects:

* a **length written without a unit** — `width: 350`
* a **hex colour written without its `#`** — `color: 00ff00`

Those two spellings are all over the pre-2000 web. A browser that reports
`CSS1Compat` for a page with no doctype renders that page with every such
declaration **dropped**: the table collapses, the colours go black, and it looks
like *the site* is broken rather than the browser.

That is the old web — school intranets, library catalogues, government forms, the
parts of the internet nobody has been paid to rewrite — and it is most of what is
still reachable from a hand-me-down laptop. **6,978 subtests, Chrome 6975.**

## The first gate: the engine could not be in quirks mode

```
quirksCompatMode:   "CSS1Compat"      ← no doctype at all
noquirksCompatMode: "CSS1Compat"
limitedCompatMode:  "CSS1Compat"
```

`document.compatMode` was hardcoded to `"CSS1Compat"` unless a `_compatMode` had
been stashed by `DOMParser`. Two changes fixed it:

* **`compatMode` now derives from the document's own doctype** when nothing has
  set it, through a shared HTML §13.2.6.4.1 table (`_docModeFor`). A document
  with **no doctype node is in quirks mode** — that is the whole point.
* **⚠️ `document.write()` must sniff the markup as it goes past.** This engine
  parses written markup through `innerHTML`, which **discards the doctype**, so
  by the time the tree exists there is nothing left to ask.
  `document.open(); document.write('<div>')` really is a quirks-mode document —
  and that is how every one of WPT's quirks tests is built.

## The two quirks

Transcribed from CSS Values 4 §C (`<quirky-length>`) and CSS Color 4 §B
(`<quirky-color>`), both applied in `_parseStyleDecls` **before** every
per-property validator, so a rewritten value is then validated exactly like an
author-written one.

**⭐ Both are limited to a fixed list of properties on purpose**, so the quirk
cannot leak into `background`, into `calc()`, or into any property invented
since. Note what is *not* on the length list: `outline-width`, `line-height`, and
every shorthand that merely *contains* one of them (`border`, `background`,
`font`, `outline`). `margin`/`padding`/`border-width` *are* on it, because the
spec lists them by name.

**⭐ The colour rules are stranger than they look, and the strangeness is exact.**
An **ident** keeps its text and must already be 3 or 6 hex digits; a **number**
or **dimension** is re-*serialized from its integer value* first, then
zero-padded to six. That is what makes `023` become `000023` (the integer 23,
padded) and what makes `-1` invalid: serializing −1 gives `"-1"`, and no amount
of zero-padding makes a minus sign a hex digit. `12\33 ` is a *dimension* — the
number 12 with the unit `3` — and becomes `#000123`.

## ⚠️⚠️ The bigger find: these properties had no validation at all

The quirk alone moved the realm by **+137**. The diagnostic that explained the
other +2,368 was re-running WPT's own loop in-page and bucketing the failures:

```
failures by PROP: border-width 34, border-spacing 28, border-top-width 26,
                  font-size 26, letter-spacing 26, text-indent 26, word-spacing 26 …
sample: {input: 'a', prop: 'border-spacing', got: 'a', want: 'undefined'}
```

`border-spacing: a` computed to **`a`**. `letter-spacing: "1"` computed to
**`"1"`**. `color: aaaaa` computed to **`aaaaa`**. These properties accepted any
string and handed it back as the computed value — which is why
`quirks/unitless-length` was failing in **no-quirks mode**, where nothing quirky
is involved at all.

**That is not cosmetic.** A declaration the UA cannot understand must be
**dropped**, so the cascade falls back to what is underneath it — the author's
own earlier rule, the inherited value, the initial. Keeping the garbage means one
typo in one rule silently **wins** over the correct declaration beneath it, and
the page has no way to recover.

It also meant the engine disagreed with itself: `el.style.color = 'aaaaa'` was
correctly refused while `<style>#x{color:aaaaa}</style>` was kept. One
declaration, two answers.

So the quest grew a second half — real validation for:

* `letter-spacing`, `word-spacing` (`normal | <length>`)
* `text-indent` (`<length-percentage> && hanging? && each-line?`)
* `font-size` (absolute/relative size keywords `| <length-percentage>`)
* `border-spacing` (`<length>{1,2}`, no percentages)
* `border-*-width` + the `border-width` shorthand (`<line-width>{1,4}`)
* `padding`/`margin` and all their longhands (incl. the logical ones)
* `background-position` — only the bare-number hole
* **`<color>` in stylesheet rules**, longhand *and* the `border-color` shorthand

Every validator is deliberately **permissive about what it cannot judge**:
`var()`/`env()`/`attr()` and the CSS-wide keywords always pass, and a property
not in the table is never touched.

## ⭐⭐ Two root causes worth remembering

**`calc(1)` is a `<number>`, not a `<length>`.** The engine was folding a
unitless `calc()` result to px, so `calc(1)` was silently a valid width — and the
unitless-length quirk explicitly does *not* reach inside `calc()`. The engine
already had a full math **type** system (`_mt` over `_parseCalcTree`), so the fix
was to *ask it* rather than pattern-match: `calc(2 * 2px)` is a length,
`calc(1)` is not. **~93 subtests across the three modes.**

**A comment separates tokens; it does not join them.** `_cssSplitRules` replaced
`/*…*/` with **nothing**, splicing `+/**/1` into the single number token `+1` —
which the engine then accepted as a length. CSS Syntax consumes a comment and
emits *no token*, so `+/**/1` is two tokens and is invalid wherever one number
token is required. Replacing the comment with a **space** cannot fuse two tokens
together, so it is the safe substitution. **~37 subtests.**

## Results

| test | before | after | Chrome |
|---|---:|---:|---:|
| `quirks/unitless-length/quirks.html` | 1050/1590 | **1583/1590** | 1590 |
| `quirks/unitless-length/no-quirks.html` | 1086/1581 | **1580/1581** | 1581 |
| `quirks/unitless-length/limited-quirks.html` | 1086/1581 | **1580/1581** | 1581 |
| `quirks/hashless-hex-color/quirks.html` | 355/692 | **677/692** | 692 |
| `quirks/hashless-hex-color/no-quirks.html` | 353/684 | **684/684 ✅** | 684 |
| `quirks/hashless-hex-color/limited-quirks.html` | 353/684 | **684/684 ✅** | 684 |
| `quirks/unitless-length/excluded-properties-001.html` | 52/55 | 52/55 | 55 |
| `quirks/unitless-length/excluded-properties-002.html` | 8/11 | 8/11 | 11 |
| `quirks/supports.html` | 3/6 | 3/6 | 6 |
| `quirks/table-cell-width-calculation.html` | 14/15 | 14/15 | 15 |
| `quirks/line-height-calculation.html` | 1/23 | 1/23 | 23 |
| `quirks/percentage-height-calculation.html` | 0/52 | 0/52 | 49 |
| `quirks/blocks-ignore-line-height.html` | 1/4 | 1/4 | 4 |
| **realm total** | **4362/6978** | **6867/6978** | 6975/6978 |

## ⛔ Caps, named honestly

* **⛔⛔ The four layout quirks are quest F26, not this quest.**
  `line-height-calculation` (1/23), `percentage-height-calculation` (0/52),
  `blocks-ignore-line-height` (1/4) and the last `table-cell-width-calculation`
  subtest are **79 subtests that all need a real box tree**. They ask what a line
  box is tall or how a percentage height resolves — questions a synthetic
  `getBoundingClientRect` grid cannot answer. This is the sixth realm to name
  F26.
* **`quirks/supports.html` 3/6** — `@supports` must accept `<quirky-length>` and
  `<quirky-color>` while `CSS.supports()` must **refuse** them. The quirk is
  wired into declaration parsing, not into the `@supports` condition grammar.
* **`excluded-properties-001/002` (52/55, 8/11)** — the remaining rows are
  shorthands (`border-top: red solid 1`, `font: … 40 sans-serif`) that must not
  get the quirk. The property-level exclusion is right; the *inside-a-shorthand*
  exclusion needs the shorthand parsers to know they are expanding.
* **`hashless-hex-color/quirks.html` 677/692 and `unitless-length/quirks.html`
  1583/1590** — the residual 22 are the `+/**/1`-family and shorthand edge cases
  above.
* **The doctype table is the well-known subset**, not all ~60 public-identifier
  entries in HTML's list. It covers the cases that decide the mode in practice
  and says so in the code.

## ⭐ Next

1. **F26.** Six realms have now named it. The 79 subtests left in `quirks` are
   pure layout, and `obscura-render` already runs Blitz + taffy.
2. **`@supports` and `CSS.supports()` need to disagree** about the quirky types —
   a small, self-contained 3 subtests.
3. **Shorthand expansion should know it is expanding**, which closes both the
   `excluded-properties` files and the remaining shorthand rows.
4. The validation table (`_QM_VALIDATE`) is a good place to keep growing:
   every property still missing a grammar check is a property that will hand back
   a computed value that is not a value.

---

*Written for whoever next opens a page that was last updated in 1997 and finds
that it simply works.* 🏳️‍⚧️⚔️💜
