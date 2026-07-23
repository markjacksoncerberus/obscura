# Quest #275 — The Hyphen-String Verdict

**Realm:** `css/css-text/parsing/`
**Hold before:** `hyphenate-character` string not escape-canonicalized — valid 4/5, computed 4/5
**Hold after:** hyphenate-character valid 5/5 + computed 5/5 — **+2, ZERO regressions**

## The gap

`hyphenate-character` = `auto | <string>` (CSS Text 4). A `<string>` value must have
its CSS escape sequences decoded and be re-serialized canonically, so an escaped
codepoint renders as the literal character:

- `e.style['hyphenate-character'] = '"\\1400"'` should serialize as `"᐀"`
  (U+1400 CANADIAN SYLLABICS HYPHEN), but Obscura kept the raw escape `"\1400"`.

Both the valid file (serialization assertion) and the computed file (same value read
through getComputedStyle) failed the one escaped-string subtest.

The root cause: the `hyphenate-character` branch canonicalized the string via
`_canonStandardValue(t)`, which does not decode `\`-escapes inside a `<string>`.

## The work (all `bootstrap.js`)

Reused the exact `<string>` canon that `font-language-override` and
`font-feature-settings` already apply: decode escapes via `_unescapeIdent`, then
re-serialize via `_serCssString`:

```js
if (/^"…"$/.test(t) || /^'…'$/.test(t)) {
  return _serCssString(_unescapeIdent(t.slice(1, -1)));
}
```

`\1400` → the U+1400 character → `_serCssString` emits it in canonical double-quoted
form. (`_serCssString` is defined later in the file but resolves at setProperty call
time, same as the sibling font-string canons.)

## Results

| File | Before | After |
|------|:------:|:-----:|
| hyphenate-character-valid.html | 4/5 | **5/5** |
| hyphenate-character-computed.html | 4/5 | **5/5** |

**+2.**

## Zero-regression sweep

qsa 1975/1975, classlist 1420/1420, serialize-values 695/697,
hyphenate-character-invalid 7/7, hyphenate-limit-chars-valid 11/11,
font-language-override-valid 9/9, font-feature-settings-valid 10/10 (the sibling
string canons, unchanged).

## Caps / Next

`text-align-computed` 6/7 in the same dir has one remaining fail: `text-align:
match-parent` computes to `center` (the parent's used value) — needs parent-resolution
at computed time. A separate, small quest.
