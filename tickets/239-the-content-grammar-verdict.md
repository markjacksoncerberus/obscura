# Quest #239 — The Content-Grammar Verdict

**Realm:** `css/css-content/parsing/content-invalid.html`
**Hold before:** 0/70 → **70/70** (+70)
**Status:** ✅ SECURED — zero regressions
**Session:** 2026-07-22

## The gap

Took Quest #238's next-leverage (a NEW `css/*/parsing/` dir). Baselined fresh dirs
(css-content, css-writing-modes, css-will-change, css-transforms, css-display,
css-position, css-contain) and found a wide raw-store vein:

- `content-invalid` **0/70** — every out-of-grammar value wrongly accepted.
- `content-valid` **46/46**, `content-computed` **41/41** — already green.

The `content` property was validated by *nothing*: `_canonContent` only
canonicalizes (via `_canonCounterFns` / `_canonGradients` / `_canonUrls`) and never
rejects, so valid values round-tripped fine but invalid values were stored raw.

## The grammar (CSS Content Module Level 3)

```
content = normal | none
        | [ <content-replacement> | <content-list> ] [ / [ <string> | <counter> ]+ ]?
<content-list>        = [ <string> | contents | <image> | <counter> | <quote>
                        | <leader()> | attr() ]+
<content-replacement> = <image>
<counter> = counter( <counter-name> , <counter-style>? )
          | counters( <counter-name> , <string> , <counter-style>? )
<quote>   = open-quote | close-quote | no-open-quote | no-close-quote
```

The invalid test rejects two categories:
1. Malformed main items — `attr()` (no arg), `counter()` (no name),
   `counters(counter-name)` (missing the required `<string>` separator).
2. A valid main value with an out-of-grammar alt-text — `/ url(…)`,
   `/ no-open-quote`, `/ no-close-quote`, `/ "hi" no-close-quote` (alt-text is
   restricted to `[ <string> | <counter> ]+`).

## The fix (all `bootstrap.js`)

`_isValidContent(value)` — validates the grammar:

- `normal` / `none` stand alone.
- Tokenize with `_wsTokens` (paren + quote aware); the top-level `/` token
  separates the main list from the alt-text.
- Main list: every token must be a `<content-list>` item — a `<string>`, a
  `<quote>` keyword, `contents`, `counter()`/`counters()` with valid arg counts, an
  `<image>` (matched by the existing `_BG_IMAGE_FN_RE` head: url + every gradient +
  image-set/cross-fade), `attr(<non-empty>)`, or `leader(…)`. (A lone `<image>` is a
  `<content-replacement>`, which is also a valid one-item list, so no special case.)
- Alt-text: restricted to `[ <string> | <counter> ]+`.

Gated at **both** declaration paths — the inline `_parseStyleDecls` parser and the
API `setProperty` — each guarding CSS-wide keywords and `var()`/`env()` so
`content: inherit` / `content: var(--x)` still pass through to the canon
(mirroring the `_COUNTER_VALIDATED` branch).

### The escape subtlety

The valid cases `counter(\})` and `counters(\}, ".")` use an escaped `}` as the
counter name. The shared `_wsTokens` / `_splitCommaQuoted` helpers count `{`/`}` and
parens for depth but are **not** escape-aware outside quoted strings, so a bare `\}`
decrements depth and corrupts token/arg splitting (this regressed `content-valid`
46→43 on the first pass). Rather than modify those widely-used helpers, `_isValidContent`
neutralizes every `\<char>` escape to a plain ident letter up front —
validation never needs the literal character, only the token structure.

## Results

`content-invalid` 0 → **70/70**. `content-valid` 46/46 and `content-computed`
41/41 held.

## Zero-regression sweep

qsa 1975, classlist 1420, serialize-values 695/697 (2 pre-existing),
shorthand-serialization 7/7, content-counter-valid 3/3 — all held. Stash-proved
`getComputedStyle-pseudo` **2/28 identical** with and without the change (a
pre-existing pseudo-element computed-style gap, not a regression from content
validation).

## Cap / Next

No cap — the file is fully green and the whole `content` family is clean.

**Next leverage:** a NEW `css/*/parsing/` dir. The tell in a mature dir is a
`-invalid` at 0/N (raw-store) or a `-valid`/`-computed` canon gap. grep
`_isValidContent`.
