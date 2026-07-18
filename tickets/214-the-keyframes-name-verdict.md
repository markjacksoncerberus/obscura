# Quest #214 — The Keyframes-Name Verdict ⚔️

> **Realm:** `css/css-animations/parsing/` — `@keyframes` at-rule **name** validation.
> **Hold:** SECURED — **+20, ZERO regressions** (session 2026-07-18).

## The gap

Baselining the whole `css-animations/parsing/` dir for still-raw veins turned up a
clean pair:

| File | Before | After |
|------|:------:|:-----:|
| `keyframes-name-invalid.html` | **0/20** | **20/20** ✅ |
| `keyframes-name-valid.html` | 39/39 | 39/39 (held) |

The `0/N`-invalid-beside-green-valid shape is the raw-store tell. The tests use
`test_keyframes_name_{in,}valid` from `css/support/parsing-testcommon.js`:

```js
function test_keyframes_name_invalid(keyframes_name) {
    test(t => {
        const sheet = _set_style(`@keyframes ${keyframes_name} {}`);
        assert_equals(sheet.cssRules.length, 0);   // invalid name → whole at-rule dropped
    }, `invalid: @keyframes ${keyframes_name} { }`);
}
```

Obscura's stylesheet parser (`_cssParseRuleList`, `bootstrap.js` ~18773) accepted
**any** prelude as the `@keyframes` name and always built a rule, so every invalid
name produced `cssRules.length === 1` where the spec (and the test) demand `0`.

`<keyframes-name> = <custom-ident> | <string>` (CSS Animations 1 §2) — the **same**
grammar `animation-name` already validates, with one context difference: bare `none`
is the animation-name reset value (valid there) but is **reserved / invalid** as a
`@keyframes` name.

Invalid names under test: bare `none`; CSS-wide keywords + `default`
(`initial`/`inherit`/`unset`/`revert`/`revert-layer`); `12`/`-12`/`12foo` (not idents);
`foo.bar` (`.` illegal in idents); `one two` (two tokens); `one, two` and comma lists;
`""` (empty string). Valid (must stay accepted): `foo`/`-foo`/`_bar`/`ease-out`,
reserved-ish words `not`/`and`/`all`/`or`/`auto`/`normal`, and **any** `<string>`
including `"none"`/`"initial"`/`"one two"` — a string can hold anything but must be
non-empty. `--foo` (dashed-ident, used by `keyframe-selectors.html`) is also valid.

## The work

One helper beside `_canonAnimName` (`bootstrap.js` ~15503), reusing the existing
animation-name token gate:

```js
const _isValidKeyframesName = (raw) => {
  const s = String(raw).trim();
  if (!s) return false;
  const toks = _wsTokens(s);
  if (toks.length !== 1) return false;             // `one two`, `one, two`
  const tok = toks[0];
  const quoted = tok[0] === '"' || tok[0] === "'";
  if (!quoted && tok.toLowerCase() === 'none') return false;  // bare `none` reserved here
  return _canonAnimNameTok(tok) !== null;          // <custom-ident> | non-empty <string>
};
```

Wired as a guard on the `keyframes` push (`_cssParseRuleList` ~18773):

```js
} else if (name === 'keyframes' || name === '-webkit-keyframes') {
  // An invalid <keyframes-name> makes the whole at-rule invalid → drop it (CSSOM).
  if (_isValidKeyframesName(condition)) rules.push({ type: 'keyframes', name, condition, prelude, body });
}
```

`_wsTokens` is quote-aware, so `"one two"` / `"one, two"` stay a single token (valid),
while unquoted `one, two` splits to two tokens (invalid). `_canonAnimNameTok` already
rejects `12`/`-12`/`12foo`/`foo.bar`/`""`/bare-CSS-wide/`default` and accepts dashed
idents — the only thing it does *differently* from the @keyframes context is treat bare
`none` as valid, which the extra guard handles.

## Results & regression sweep

- `keyframes-name-invalid` **0 → 20**, `keyframes-name-valid` **39/39** held.
- **Stash-proved** the two dir files that show fails are pre-existing, not regressions:
  `keyframe-selectors` **12/14** and `css/cssom/cssimportrule` **2/11** measured
  identical with and without the change.
- Held: qsa 1975, `animation-name-valid` 27/27, `animation-computed` 14/15,
  `dom/lists/DOMTokenList-value` 1/1.

## Cap / Next

The dir's remaining un-worked veins both need the **shorthand→longhand expansion**
machinery Obscura doesn't have yet (the #212/#213 named cap):

- `animation-shorthand.html` **0/36** — `test_shorthand_value` sets `animation` and reads
  back each longhand (`animation-duration`, …, `animation-timeline: auto`,
  `animation-range-start: normal`, `animation-range-end: normal`). Needs
  `_SHORTHAND_LONGHANDS['animation']` + `_expandShorthand` populating the longhand
  declarations (tension: #211 stores `animation` as a single canonical blob — switching to
  expansion must not regress `animation-invalid`/`-valid`).
- `animation-range-shorthand.html` **56/133** — the 77 remaining are all
  `test_computed_value`, blocked on the same expansion + getComputedStyle reconstruction.

Otherwise: a NEW `css/*/parsing/` dir — baseline its `*-invalid` files for the 0/N
raw-store tell.
