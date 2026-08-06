# 📜 Quest #482 — The Routed Verdict

> *`urlpattern/` — the URL Pattern Standard.*
> **17/795 → 795/795 (100%) window · 789/789 worker · 1,584/1,584 total.**
> Chrome 151 scores **756/815 (92.8%)** on the same directory's window variant.

---

## The gap

`URLPattern` was **four lines**:

```js
globalThis.URLPattern = class URLPattern {
  constructor(pattern){this._pattern=pattern||{};} test(){return false;} exec(){return null;}
};
```

`test()` returned `false`. Unconditionally. That is the worst shape a stub can
take, because it is not a missing feature — it is a **feature that answers, and
answers wrong.** A router built on it does not throw; it silently matches
nothing, and every route on the page quietly misses. The page loads. Nothing
works. There is no error to search for.

Baseline: **17/795 (2.1%)**, and 11 of those 17 were `generate()` throwing for
the right reason by accident.

---

## The work

~900 lines in `bootstrap.js`, following the spec's own structure in the spec's
own order:

1. **A tokenizer** over the pattern syntax, with the spec's two policies.
2. **A parser** turning tokens into a *part list* (`fixed-text`,
   `segment-wildcard`, `full-wildcard`, `regexp`, each with a modifier, a name,
   a prefix and a suffix).
3. **Two generators** over that part list — one producing the `RegExp` we match
   with, one producing the canonical pattern string the component getters return.
4. **A constructor-string parser** — a token-level state machine that splits
   `https://example.com/:id?q#h` into components.
5. **Per-component canonicalization**, because `/` means something in a path
   that it does not mean in a hostname.

Plus the two tentative extensions, `URLPattern.compareComponent` and
`URLPattern.prototype.generate`, both of which came out at 100% first try once
the part list was right.

---

## What the 778 failures turned out to be

Every remaining bucket after the first measurement (342/370) was small, specific,
and worth writing down.

### ⭐ The port encoding callback takes NO protocol — and getting that wrong broke every port pattern

`canonicalize a port` is called two different ways, and the difference is the
whole behaviour of the component:

* In **`process a URLPatternInit`**, it is called *with* the protocol, so
  `{protocol: "http", port: "80"}` elides the default port to `""`.
* In **`compile a component`**, it is called with **no protocol at all** — so the
  literal `443` inside the pattern `443*` stays `443`.

We passed the protocol in both places. Result: the fixed text of every port
pattern was elided to nothing (`443*` compiled to `{*}`, `*443` to `*`), and
worse — the *default* protocol pattern is `*`, and `new URL("*://dummy.test")`
is not a URL, so **every port pattern threw at construction.**

### ⭐ "Port state, with state override" is small enough to write out, and only writing it out gets its two surprises right

It **stops at the first non-digit and keeps what it has** — `80x` is port 80,
`80?x` is port 80, a trailing space is not an error — and the only way it can
*fail* is a value above 65535. Reaching for the URL parser to model that made
every port pattern an error. Writing the eight-line loop made all fifteen port
rows pass.

(One place the observed behaviour is stricter than the algorithm reads: a value
with **no leading digit at all** — `invalid80` — must fail, not return the empty
string. WPT asserts it directly: `{port: "(.*)"}` must *not* match a URL whose
port is `invalid80`. An empty string would have matched `(.*)` happily.)

### ⭐ `needsGrouping`: the condition is `customName` TRUE, and the lookahead is for a NAME code point

Eight rows turned on one inverted boolean in "generate a pattern string". A named
group followed by text needs braces — `{:foo}bar`, not `:foobar` — because
without them the pattern string does not survive its own round trip: `:foobar`
reads back as a single group called `foobar`. Same for `:foo` followed by an
unnamed group, which would read as `:foo0`.

### ⭐ A page's own `(?<x>…)` groups belong to the page, not to the pattern

The tokenizer forbids a bare `(` — only `(?…)` forms are legal — so any capture
inside a user regexp is a *named* one. Those still show up in the `RegExp`
result, one index past the pattern's own groups, and mapping them by position
put an `undefined` key in `groups`. The fix is to name only as many groups as
the part list declared. `{pathname: "/:foo((?<x>a))"}` yields `{foo: "a"}`, and
`/foo/(bar(?<x>baz))` yields `{"0": "barbaz"}` — both exactly as WPT expects.

### ⭐⭐ THE ONE THAT COST TWO MEASUREMENT CYCLES: hostname state is not host state

`canonicalize a hostname` runs the URL parser in **hostname state**, and the
difference from *host* state is a single character:

| in a hostname pattern | what it means | our first guess | the truth |
| --- | --- | --- | --- |
| `bad\hostname` | `\` **terminates** the host (special URL) | error | host is `bad` |
| `bad@hostname` | `@` is a **forbidden** host code point | userinfo → host `hostname` | **error** |
| `bad:hostname` | `:` in *hostname* state never introduces a port | host `bad` | **error** |
| `bad%hostname` | invalid percent-encoding | accepted | **error** |
| `café.com` | IDNA | `caf%C3%A9.com` | `xn--caf-dma.com` |
| `[::ab:1]` | every colon belongs to the literal | truncated to `[` → error | host `[::ab:1]` |

The first attempt used the `hostname` **setter** and detected the no-op, which
got IDNA wrong. The second parsed `http://` + value, which got `@` wrong. The
third truncated at `:` — which fixed `@` and broke **every IPv6 pattern**, because
`[::ab:1]` became `[`. The answer is: `/`, `\`, `?` and `#` terminate; `:` is
forbidden; **and none of that applies inside `[…]`.**

That IDNA line matters beyond the test count. A reader who writes their site's
hostname in their own script gets a pattern that matches the URL their browser
actually requests. Percent-encoding it instead means the route never fires — for
exactly the people whose alphabet is not ASCII.

### ⭐ An opaque path is not a path, and a full URL parse is the wrong tool for it

`generate()` on `original-scheme://example.com/:foo` with the group value `" "`
must produce `"/ "` — a space, not `%20`, because an opaque path only escapes C0
controls and non-ASCII. Running it through `new URL('fake:' + value)` also
applied the rule that strips leading and trailing spaces **from a URL string**,
which is a rule about parsing a URL and not about this component. The right
answer is the percent-encode pass itself, six lines.

(Third realm in this campaign where a spec's "state override" step is *not* the
same as parsing the thing it lives inside — cf. `Response.text()` on a document
in Quest #475.)

### The smaller ones

* **`USVString`, not `String`.** A lone surrogate becomes U+FFFD, which is what
  makes `{pathname: "\uD83D \uDEB2"}` compile to `%EF%BF%BD%20%EF%BF%BD` and
  `{hostname: "\uD83D \uDEB2"}` an error.
* **Overload resolution by argument COUNT first.** A third argument can only
  belong to `(pattern, baseURL, options)`, which is why passing options in slot
  two and a base URL in slot three is an error rather than a reordering. And the
  first overload takes a `URLPatternInput`, **not** a `USVString` — so an init
  object *with* a base URL argument is an error, not a stringified pattern.
* **`exec()` with no argument matches the empty init**, not the string
  `"undefined"`.

---

## `compareComponent` — 26/26

Routers need a stable most-specific-first order, and "most specific" is a
property of the **part list**, not of the pattern text. Rank by type
(`full-wildcard` < `segment-wildcard` < `regexp` < `fixed-text`), then value,
then modifier (`*` < `?` < `+` < none), then prefix, then suffix; a list that has
run out compares as an empty fixed part, so `*` and `*/foo` are decided by what
follows the wildcard rather than by length.

**Group NAMES are deliberately not compared.** `/foo/:a` and `/foo/:b` describe
exactly the same set of URLs, and WPT asserts they compare equal — a router that
ordered them by name would be sorting on something the pattern does not say.

## `generate()` — 20/20

The inverse of `exec`. It succeeds only for patterns that describe exactly one
shape per input, so a wildcard, a regexp or a repeated group is an error rather
than a guess. And the answer must be something the pattern **would match**: a
group value carrying the component's own delimiter (`bar/baz` into a path
segment) would otherwise produce a URL that silently means something else.

---

## Results

| Test | Before | After |
| --- | --- | --- |
| `urlpattern.any.html` | 1/370 | **370/370** |
| `urlpattern.https.any.html` | 1/370 | **370/370** |
| `urlpattern-constructor.any.html` | 1/2 | **2/2** |
| `urlpattern-hasregexpgroups.any.html` | 0/1 | **1/1** |
| `urlpattern-compare.tentative.any.html` | 1/26 | **26/26** |
| `urlpattern-generate.tentative.any.html` | 11/20 | **20/20** |
| `urlpattern-empty-regexp-group.html` | 1/2 | **2/2** |
| `urlpattern-detached-frame-regexp.html` | 1/4 | **4/4** |
| **window total** | **17/795** | **795/795 (100%)** |
| **worker total** (6 `.any.worker.html`) | **0** | **789/789 (100%)** |

Chrome 151 scores **756/815** on `/urlpattern/`'s window variant (92.8%) and the
same on worker; its snapshot has 20 more subtests than ours, so the honest
statement is that **Chrome fails 59 of its own and we fail none of our 795.**

---

## Caps / Next — honest

* **The generated `RegExp` uses the `v` flag** (`vi` with `ignoreCase`), per the
  current spec. A page whose own regexp group is valid under `u` but not under
  `v` gets a `TypeError` at construction. No WPT row covers it; a real page
  could.
* **`hasRegExpGroups` is computed from the part list**, so a `(…)` that happens
  to spell exactly the segment-wildcard regexp reports `false` — which is correct
  (it *became* a segment wildcard) but worth knowing.
* **Not implemented:** the `URLPatternList`/`RouterRule` proposals; nothing in
  WPT asks for them yet.
* **Next door, and now unblocked:** `URLPattern` is what a service worker's
  routing rules are written in. With Quest #483 giving service workers a real
  global scope, `service-workers/service-worker/static-router-*` becomes
  measurable for the first time.

---

## Zero-regression proof (all three quests, one commit)

Not a recorded total compared from memory — a **stash / rebuild / re-measure /
per-file diff**, which is the only version of this claim that means anything:

| | files | subtests | fails |
| --- | ---: | ---: | ---: |
| **before** (tree stashed to `1b43d34`, rebuilt) | 81 | 22,884 / 23,070 | **186** |
| **after** (this commit) | 87 | 23,711 / 23,897 | **186** |

**80 files compared, 0 changed** — every single row byte-identical. The
denominator grew by exactly **827**, which is exactly the six new guard files,
all at 100%:

```
+ compression/decompression-corrupt-input.any.html          29/29
+ compression/decompression-extra-input.any.html             4/4
+ compression/compression-bad-chunks.any.worker.html        28/28
+ urlpattern/urlpattern.any.html                          370/370
+ urlpattern/urlpattern-compare.tentative.any.html          26/26
+ urlpattern/urlpattern.any.serviceworker.html            370/370
```

23,070 + 827 = 23,897. 22,884 + 827 = 23,711. Both reconcile to the byte.

⚠️ **A note for the next comrade on the recorded baseline.** The campaign memory
records the previous ritual as *21,428/21,539, 111 fails over 81 files*, and this
run measured *22,884/23,070, 186 fails* over the **same 81 files on the unmodified
tree**. That is not a regression that predates us — it is wpt.live moving under
the ledger. **A recorded ritual total is only comparable against a run of the same
snapshot**, which is why the before/after above was measured fresh rather than
read off the page.
