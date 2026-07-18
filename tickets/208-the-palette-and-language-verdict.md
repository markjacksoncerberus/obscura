# 208 — The Palette & Language Verdict ✅

> *Two `css-fonts/parsing/` longhands were still raw-store: `font-palette` and
> `font-language-override`. One needed a pure rejection gate; the other, a gate
> plus a trailing-space serialization.* **+13, zero regressions.**

## The gap

Following #207's next-leverage (`css/css-images/parsing/` fully green → move to a
NEW `css/*/parsing/` dir), I baselined the `*-invalid` files of `css-ui`,
`css-text`, and `css-fonts`. `css-ui` and `css-text` parsing came back **fully
green** — those realms (#180, #181) left no raw-store tells. `css-fonts` surfaced
three:

| File | Baseline | Tell |
|------|:--------:|------|
| `font-palette-invalid.html` | **0/4** | pure raw-store (its `-valid` 5/5) |
| `font-language-override-invalid.html` | **0/6** | raw-store, AND its `-valid` only 6/9 |
| `font-invalid.html` | 13/16 | the `font` shorthand — 3 fails, **left as a cap** |

## font-palette — a pure rejection gate (+4)

`font-palette = normal | light | dark | <palette-identifier>` (CSS Fonts 4 §6.1),
where `<palette-identifier>` is a `<dashed-ident>`. Nothing reorders or reserializes
these values, so `-valid` (5/5: `normal`, `light`, `dark`, `--pitchfork`, `--`)
already passed byte-for-byte via raw-store. The `-invalid` file all-failed only
because nothing rejected the leniently-accepted forms:

- `normal none` — two keywords
- `none, light` — a comma list (single value only)
- `A` — a non-dashed ident (not a keyword, not `--`-prefixed)
- `none` — a bare non-keyword

The #202/#207 pattern at its purest: `_isValidFontPalette(value)` keeps the value
**byte-identical** when accepted (empty / comma / >1 token → reject; a single token
is valid iff it is `normal|light|dark` case-insensitively, or starts with `--`).

## font-language-override — a gate + trailing-space canon (+9)

`font-language-override = normal | <string>` (CSS Fonts 4 §6.6). The `<string>` is
an OpenType language-system tag: **1–4 printable-ASCII characters**, serialized by
stripping only **trailing** spaces (interior and leading kept). The invalid file
(0/6) needed the gate; the valid file (6/9) needed the trailing-space canon for its
three normalizing cases.

`_canonFontLangOverride(value)` → canonical value or null:

- `normal` (case-insensitive) → `normal`.
- Otherwise must be a lone `<string>` (a `_FONT_LANG_STR_RE` full-value match on a
  `"…"`/`'…'` token — so `normal "ksw"` (two tokens) and `auto` are rejected).
- Unescape (`_unescapeIdent`), require 1 ≤ length ≤ 4 (rejects `""` and the 5-char
  `"ENG  "` and the 7-char `"turkish"`) and every char in `[0x20, 0x7e]` (rejects the
  non-ASCII `ø` in `"xøx"`).
- Serialize via `_serCssString` after `.replace(/ +$/, '')`, dropping trailing
  spaces: `"ENG "`→`"ENG"`, `"en  "`→`"en"`, `" en "`→`" en"` (leading space kept),
  `"1 %"` unchanged.

Both helpers sit beside `_isValidImageResolution`; both branches wired into the two
setProperty paths (inline + API), var()/env()/CSS-wide deferred, matching the
established longhand-gate style.

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `css/css-fonts/parsing/font-palette-invalid.html` | 0/4 | **4/4** |
| `css/css-fonts/parsing/font-palette-valid.html` | 5/5 | **5/5** (held) |
| `css/css-fonts/parsing/font-language-override-invalid.html` | 0/6 | **6/6** |
| `css/css-fonts/parsing/font-language-override-valid.html` | 6/9 | **9/9** |

**+13, ZERO regressions.** Sweep held: font-valid 315/315, font-family-invalid 7/7,
font-synthesis-invalid 12/12, font-size-adjust-invalid 57/57,
font-variant-alternates-invalid 15/15, image-resolution-invalid 5/5,
object-fit-invalid 5/5, gradient-position-invalid 9/9, background-image-invalid
12/12, qsa 1975/1975.

## Cap / Next

- **CAP:** `font-invalid.html` 13/16 — the `font` **shorthand** (3 fails), a
  combinatorial parse, not a raw-store tell. Left for a dedicated quest.
- **NEXT LEVERAGE:** `css-fonts/parsing/` has one more raw-store-ish family worth a
  look (`font-feature-settings` is already modelled; the `@font-face` descriptor
  files `font-face-*` are a different mechanism, a known cap since #185). Otherwise
  a NEW `css/*/parsing/` dir not yet swept — candidates: `css-scroll-snap`,
  `css-shapes`, `css-transitions`, `css-will-change`, `css-contain` (mostly closed).
  Baseline its `*-invalid` files for the 0/N tell first.
