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

## The second siege — legacy encodings via encoding_rs (session 2026-06-16, #08b)

The first siege left every legacy encoding as a utf-8 best-effort stub. Rather than
embed the (large) WHATWG index tables in JS, we routed all non-utf encodings through
**`encoding_rs`** — Gecko's reference implementation, already a workspace dependency —
behind a new Rust op `op_text_decode(name, bytes, fatal, stream)` (`crates/obscura-js/src/ops.rs`).

- `TextDecoder.decode` keeps utf-8 / utf-16le / utf-16be / x-user-defined on the JS
  decoders (streaming/BOM already 100%); everything else (ISO-8859-*, KOI8, windows-125x,
  Big5, gbk/gb18030, EUC-jp/kr, Shift_JIS, ISO-2022-JP) goes to the op.
- **Streaming without persistent Rust state:** with `last=false` `encoding_rs` holds back
  incomplete trailing sequences, so decoding a *growing* buffer only ever extends prior
  output. JS accumulates the whole buffer, re-decodes each call, and slices off the new
  suffix — incremental streaming that's correct for the stateless re-decode (wins the
  Big5 `stream:true` cases in `textdecoder-eof`).
- Fatal malformed input → op returns `Err` → JS throws `TypeError`.
- **`_getEncodingName` now ASCII-lowercases** (not JS `.toLowerCase()`, which folds
  U+212A KELVIN SIGN → 'k' and wrongly validated `'Koi8-r'`).

### Scoreboard (#08b)

| Test | Before | After |
|------|:------:|:-----:|
| textdecoder-fatal-single-byte (8 variants) | ~half | **7168/7168** |
| gb18030-decoder | best-effort | **275/275** |
| gbk-decoder | best-effort | **82/82** |
| iso-2022-jp-decoder | best-effort | **34/34** |
| textdecoder-eof | 1/2 | **2/2** |
| textdecoder-mistakes | 83/87 | **84/87** |

**~+3900 subtests. Zero regressions** (api-invalid-label 3421, textdecoder-labels 222,
fatal 36, streaming 32, encodeInto 110, Element-classlist 1420 all held).

## The honest tail
- **SharedArrayBuffer** inputs (1 subtest in `textdecoder-copy`) — no SAB support.
- 1 `encodeInto` subtest is a deep WebIDL getter-evaluation-order edge.
- `textdecoder-mistakes` (1 left, 86/87): the 2 utf-16-truncated subtests are FIXED — the
  utf-16 decoder now coalesces a pending lead-surrogate and/or pending odd byte at EOF into
  a *single* U+FFFD (WHATWG end-of-queue is one error, not one per pending item). The
  remaining `fatal stream: iso-2022-jp` needs the decoder's escape-sequence **state to
  persist across a thrown error mid-stream** — impossible with the stateless re-decode
  (would need a persistent `encoding_rs::Decoder` kept alive per `TextDecoder`).
- The `*-decode.html` (Ishida) suites decode via an iframe served in the legacy charset —
  that's the **HTML-parser charset** path, a separate subsystem, not `TextDecoder`.
- `unsupported-encodings` / `replacement-encodings` test the **XHR `overrideMimeType`
  charset** path (data: URL + XHR), also out of scope for the decoder op.
