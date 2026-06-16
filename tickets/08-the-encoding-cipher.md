# ⚔️ Quest #08 — The Encoding Cipher

> *A thousand labels for the same tongue, and a stubborn scribe who knew only one.
> The old `TextDecoder` answered every question with utf-8 and validated nothing.*

Realm: `encoding/*` · Difficulty: ⚔️⚔️

## The siege (session 2026-06-16, knight Claudius)

Was a utf-8-only stub: no label validation, no utf-16/legacy decoding, no fatal/BOM,
no streaming. Rebuilt the **Encoding API** in `bootstrap.js`:

- **WHATWG label table** (`_ENCODING_LABELS`, 40 names / 228 labels, straight from
  `encodings.json`) → inverted `_LABEL_TO_NAME`. `_getEncodingName(label)` trims ASCII
  whitespace, ASCII-lowercases, looks up. The `TextDecoder` constructor throws a
  **RangeError** on failure *or* the replacement encoding. This single primitive powers
  `api-invalid-label` 0→**3421/3421** and `textdecoder-labels` 0→**222/222**.
- **utf-8 decoder** — the WHATWG state machine (per-byte lower/upper bounds for the
  E0/ED/F0/F4 special cases); fatal → TypeError, else U+FFFD; reprocesses an invalid
  continuation byte as a fresh lead (`textdecoder-fatal` 0→36/36, `-eof` utf-8 cases).
- **utf-16le / utf-16be** with unpaired-surrogate handling, **windows-1252** (0x80–0x9F
  index), **x-user-defined**; other legacy multi-byte names carry the right `encoding`
  and decode best-effort.
- **Stateful streaming** — decoder state (`_u8`/`_u16` + pending odd byte / lead
  surrogate) persists across `decode(…, {stream:true})` calls; a non-stream call flushes
  a trailing U+FFFD (`textdecoder-streaming` 32/32, `-arguments` 4/4).
- **BOM** removal for utf-8/utf-16 (once, at stream start) gated by `ignoreBOM`.
- **TextEncoder** — `encode` maps lone surrogates → U+FFFD; `encodeInto` is
  code-point-aware (never writes a partial char; returns `{read, written}`) 44→110/111.

## Scoreboard

| Test | Before | After |
|------|:------:|:-----:|
| api-invalid-label | 0/3421 | **3421/3421** |
| textdecoder-labels | 0/222 | **222/222** |
| textdecoder-fatal | 0/36 | **36/36** |
| textdecoder-streaming | n/a | **32/32** |
| textencoder-constructor-non-utf | 54/79 | **79/79** |
| encodeInto | 44/111 | **110/111** |
| api-basics / arguments / ignorebom / byte-order-marks / utf16-surrogates / surrogates-utf8 / fatal-streaming / textencoder-utf16-surrogates | mixed | **all 100%** |

**~101 → ~3900 subtests. Zero regressions.**

## The honest tail
- **Big5 / legacy multi-byte** (gbk, gb18030, euc-jp/kr, shift_jis, iso-2022-*) decode
  best-effort only — full correctness needs the WHATWG index tables (large). Costs the
  2 Big5 subtests in `textdecoder-eof` and the single-byte/multibyte decoder suites.
- **SharedArrayBuffer** inputs (1 subtest in `textdecoder-copy`) — no SAB support.
- 1 `encodeInto` subtest is a deep WebIDL getter-evaluation-order edge.
