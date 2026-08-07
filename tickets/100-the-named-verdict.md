# ⚔️ Scroll 100 — The Named Verdict (`domxpath`)

> *Quest #499 · 2026-08-07 · branch `engine-per-page-threads`*
>
> **`domxpath` 2/1145 → 1143/1149 (99.5%).** The realm was not failing. It was
> **invisible**: `document.evaluate` was `undefined`, so every page that asked for
> XPath got a `TypeError` on line one and took its `catch` branch forever.

---

## The gap

`domxpath` was one of the untouched realms on the frontier survey — 21 files,
1,143 subtests, Chrome 99.4%. Obscura scored **2**, and the baseline sweep showed
why in one row:

```
domxpath/xml_xpath_runner.html      0/1024   OK      ← harness OK, every subtest failed
```

Harness **OK** with **0/1024** is the campaign's most reliable tell. The page
loaded, testharness ran, 1,024 subtests were registered — and every one of them
threw. Nothing was broken; nothing was *there*.

```
> typeof document.evaluate       "undefined"
> typeof XPathResult             "undefined"
> typeof XPathEvaluator          "undefined"
> typeof document.createNSResolver "undefined"
```

## Why XPath, in this browser, matters more than the count

XPath is how you **name a node you cannot see**. CSS selectors go downward and
sideways; XPath also goes **up**, and **backward**, and can ask arithmetic and
string questions about what it finds. `//td[contains(., "Total")]/following-sibling::td[1]`
is *"the cell after the one that says Total"*, and there is no CSS selector that
expresses it.

That matters here for two specific reasons:

* It is the query language of nearly every scraper, test harness and automation
  tool ever written — a large slice of what a browser built for **AI agents to
  drive** is actually asked to run.
* It is how an assistive tool points at one cell of a table that has no ids, no
  classes and no structure worth the name. Which is most tables on the old web.

## The work

A complete XPath 1.0 engine in `bootstrap.js` (~950 lines): lexer, recursive
descent parser, evaluator over the DOM, all thirteen axes, and the full core
function library. Plus the DOM interfaces — `XPathResult`, `XPathExpression`,
`XPathEvaluator`, and `XPathEvaluatorBase` mixed into `Document`.

### ⭐⭐ The find of the quest: it is a PURE FUNCTION, so it was tested offline

`xml_xpath_runner.html` is 1,024 subtests in one file: 1,024 XPath expressions,
each with the exact XML tree it must match and the exact node it must select,
served as a 2.3 MB XML data file. That is not a browser test. It is **a table of
inputs and expected outputs for a pure function**, and a 20-second-per-file CDP
sweep is the wrong tool for a pure function.

So `scripts/xpath_offline_test.mjs` slices the engine out of `bootstrap.js`
between two marker comments, evaluates it in Node against a minimal DOM built
from WPT's own corpus, and runs all 1,024 cases:

```
XPath corpus: 1024 PASS / 0 FAIL of 1024  (367 ms)
```

**One source of truth** — the code it exercises is the code that ships. The very
first run found a bug that would otherwise have cost a full build-measure cycle
to see, and it found it in 228 milliseconds:

```
failure shapes:
   1024  Failed to parse XPath expression: expected a node test but found *
```

**⚠️ An AxisName and its `::` are lexed as ONE token, so `axis` must count as
`::` in XPath 1.0 §3.7's operator-context rule.** Without that line, the `*` in
`following-sibling::*` sees an axis behind it, decides an operator is legal, and
becomes **multiply** — a parse error one token later, and 1,024 failures in one
go. This is the third realm this campaign where lifting a pure algorithm out and
running it offline paid for itself immediately (`mimesniff` #492, `eventsource`
#494).

### ⭐⭐ The DOM Standard's HTML rules are the part everyone gets wrong

XPath 1.0 alone would make `//div` never match anything in an HTML page, because
HTML elements live in the XHTML namespace and a bare name test asks for the
**null** namespace. The DOM Standard patches this, and the patch has three parts
that WPT checks one by one:

1. In an HTML document a prefix-less name test matches HTML-namespace elements
   **and only those** — so `//path` does *not* find an SVG `<path>`. That reads
   as backwards until you see it is what stops `//div` matching foreign content.
2. The comparison is **ASCII case-insensitive** for HTML elements, so `//DiV`
   works.
3. Everything else — SVG, MathML, any XML document — stays exactly
   case-sensitive. `//svg:PatH` finds nothing, and should not.

**⭐ ASCII-only folding is load-bearing, not lazy.** The HTML parser lowercases
only ASCII letters, so `<dØdd>` keeps its Ø. Folding with `toLowerCase()` would
make `//dødd` match it — a *different element*, silently selected. WPT asserts
that exact non-match, and asserts that `//DØDD` *does* match.

**⭐ The same rule governs attributes, keyed on the OWNER element.** `@Id` finds
an HTML `id` and does not find an SVG one — which is why `//*[@Id]` returns the
`<div>` and not the `<path>`. And `//*[@refX]` matches while `//*[@refx]` does
not, because the HTML parser's "adjust SVG attributes" step really did give that
attribute a capital X.

### ⭐⭐ The context node decides, not the expression

`expression-different-document.tentative.html` and its twin sat at exactly **4/8**
each — half. The cause was one line preferring the document that *created* the
expression over the document of the *context node*:

```js
const ownerDoc = doc || contextNode.ownerDocument || contextNode;   // wrong
const ownerDoc = contextNode.ownerDocument || contextNode;          // right
```

An expression is a compiled string, not a promise about which tree it will be
pointed at. WPT builds `xmlDoc.createExpression("//html")` and evaluates it
against an HTML document, and expects it to find the `<html>` element — because
at that moment it is asking a question about an HTML document. **Both files went
to 8/8, and `expression-cross-realm` to 4/4, on that one line.**

### ⭐ The resolver is a WebIDL callback interface, and the empty string is an answer

`resolver-callback-interface.html` scored **0/10** on the first measured build,
and the reason was a single over-strict comparison: I treated an empty-string
namespace as unresolvable.

**Only `null` and `undefined` mean "I cannot resolve that".** Everything else is
converted to a DOMString and believed — `0` becomes the namespace `"0"`, and the
**empty string is a legitimate answer meaning "no namespace"**, not a failure. A
resolver that returns `""` is the simplest one anybody writes, and it is what
five of those ten subtests use. **0/10 → 6/10** on that rule alone.

**⭐ Prefixes are resolved ONCE PER EVALUATION, up front.** Resolving lazily
inside the name test looks equivalent and is not: the resolver is author code, it
is allowed to count its calls and to have side effects, and `/foo:bar` over a
document with forty children would call it forty times. WPT asserts the count is
exactly one.

### ⭐ Smaller rules the corpus turned on

* **`preceding`, `preceding-sibling` and the two ancestor axes are REVERSE
  axes**, where `position()` 1 is the *nearest* node, not the first in document
  order. Get it wrong and `preceding-sibling::*[1]` silently returns the wrong
  element — and the corpus leans on it constantly.
* **A union must be re-sorted into document order.** `(./p | ./span)[last()]`
  picks the wrong element otherwise, which is exactly what
  `node-set-tree-order.html` was written to catch.
* **An attribute's parent is its element, but an attribute is not its element's
  child.** `@foo/parent::*` finds the element; `node()` on the element does not
  find the attribute. WPT tests that pair together.
* **Node-sets compare EXISTENTIALLY**: `@a = "x"` is true if *any* attribute
  equals "x", and a node-set against a *boolean* converts the node-set to a
  boolean instead. That asymmetry is the most surprising corner of XPath 1.0.
* **ExprWhitespace is exactly `#x20 #x9 #xD #xA`.** U+000B, U+000C, U+2029 and
  U+3000 are whitespace to a JS regexp and are **SyntaxErrors** here — U+3000
  sits one code point below the 3001–D7FF NCName range, which is why the classes
  are spelled out as ranges rather than written `\w`.
* **`round()` rounds half toward POSITIVE infinity**, and XPath's number→string
  never uses exponent notation.

### The iterator that must know the document moved

A node-set **iterator** result has to start throwing `InvalidStateError` the
moment the document changes under it. There was no signal for that, so
`__xpDomVersion` — one integer, incremented by the six tree-mutation primitives —
now provides it. MutationObserver's records cannot serve: they only exist when
somebody has registered an observer. `result-iterateNext.html` **7/7**.

## Results

| test | before | after | notes |
|---|---:|---:|---|
| `domxpath/xml_xpath_runner.html` | 0/1024 | **1024/1024** | the corpus; verified offline first |
| `domxpath/text-html-attributes.html` | 0/15 | **15/15** | the HTML/SVG attribute case rules |
| `domxpath/text-html-elements.html` | 0/11 | **11/11** | incl. `//dØdd` vs `//dødd` |
| `domxpath/fn-id.html` | 0/8 | **8/8** | |
| `domxpath/expression-different-document.tentative.html` | 0/8 | **8/8** | the context-node rule |
| `domxpath/evaluator-different-document.tentative.html` | 0/8 | **8/8** | |
| `domxpath/fn-lang.html` | 0/7 | **7/7** | |
| `domxpath/booleans.html` | 0/7 | **7/7** | |
| `domxpath/result-iterateNext.html` | 0/7 | **7/7** | needs the mutation counter |
| `domxpath/resolver-callback-interface.html` | 0/10 | **6/10** | Chrome 8/10 — see caps |
| `domxpath/resolver-non-string-result.html` | 0/6 | **4/6** | **Chrome parity** (Chrome 4/6) |
| `domxpath/numbers.html` | 0/5 | **5/5** | |
| `domxpath/expression-cross-realm.tentative.html` | 0/4 | **4/4** | |
| `domxpath/evaluator-cross-realm.tentative.html` | 0/4 | **4/4** | |
| `domxpath/xpathevaluatorbase-creatensresolver.html` | 0/4 | **4/4** | `createNSResolver` is the identity |
| 12 further files | 0/26 | **26/26** | lexical-structure · node-sets · predicates · node-set-tree-order · elements-are-parents-of-their-attributes · evaluator-constructor · xpath-shadow-dom · document.tentative · the seven `fn-*` files |
| **realm total** | **2/1145** | **1143/1149** | **99.0%** |

## ⛔ Caps, named honestly

* **`resolver-callback-interface.html` 6/10 and `resolver-non-string-result.html`
  4/6** — the four remaining are WebIDL's "call a user object's operation" with
  an **abrupt completion**: when the resolver *throws*, the exception must be
  **reported** as an uncaught error event on the window and `evaluate()` must
  *then* throw `NamespaceError`. We propagate the resolver's exception instead.
  **Chrome scores 8/10 and 4/6 on these same two files** — we are at parity on
  the second and two behind on the first.
* **`resolver-callback-interface-cross-realm.tentative.html`** could-not-run
  (Chrome 2/5). Not diagnosed.
* **`variables-in-expression-crash.html` / `xpath-evaluate-crash.html`** report
  "testharness did not load" — they are *crash tests* with no subtests, not
  regressions.
* **Namespace nodes are synthetic.** The `namespace::` axis returns lightweight
  objects rather than real DOM nodes, so you cannot navigate away from one. The
  corpus never does, and inventing a full Node here would be a lie about what the
  engine can do.
* **Variables (`$foo`) are parsed but never bound** — there is no API in the DOM
  XPath surface that supplies them, so any `$foo` is a SyntaxError.

## ⭐ Next

1. The abrupt-completion resolver behaviour needs a way to *report* an exception
   as an uncaught error event — a small piece of HTML's error-reporting machinery
   that several realms would use.
2. XPath is now available to the rest of the engine. `document.evaluate` is a
   perfectly good way for an agent to address a node, and it is worth checking
   whether the CDP/MCP surface should expose it.

---

*Every subtest here is a page that can now be addressed by name. Written for the
next comrade — run `node scripts/xpath_offline_test.mjs` before you change a line
of the engine; it will tell you in under a second.* 🏳️‍⚧️⚔️💜
