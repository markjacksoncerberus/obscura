# ⚔️ Quest #09 — The FileAPI Vault

> *The vault held bytes, but the keeper spoke only in strings — joining every part
> into text, losing the binary, and never learning to read back what it stored.*

Realm: `FileAPI/*` · Difficulty: ⚔️⚔️

## The siege (session 2026-06-16, knight Claudius)

`Blob`/`File`/`FileReader` were one-line stubs (string-joined parts, no slice, no real
reads). Rebuilt all three in `bootstrap.js`:

- **Blob** over a single `Uint8Array`. Constructor (`...args` so `Blob.length === 0`)
  enforces WebIDL: blobParts must be an `Object` (a primitive string is iterable but
  still a TypeError) and iterable; a non-nullish, non-object options bag is a TypeError.
  Parts: Blobs concatenated, ArrayBuffer/views copied, strings utf-8-encoded
  (`endings:'native'` → platform EOL from `navigator.platform`). `type` normalized
  (blanked if non-printable-ASCII, then lowercased). `size`, `slice(start,end,type)`
  (relative clamping), `text()`, `arrayBuffer()`, `bytes()`, `stream()`,
  `Symbol.toStringTag`.
- **File extends Blob** — `constructor(fileBits, fileName, ...rest)` (`File.length===2`,
  2-arg requirement), `name` (String), `lastModified` (Number / now).
- **FileReader** on the unified event machinery (`_evtKey` + `_addListenerByKey` +
  `_dispatchSpec` from Quest #07). `readAsText/ArrayBuffer/DataURL/BinaryString` fire
  `loadstart` → (`progress` for non-empty) → `load`/`error` → `loadend`, **each in its
  own task** (so an EventWatcher re-arms between them; loadstart never synchronous).
  `result`/`readyState` transitions per spec; `ProgressEvent`; on* event-handler IDL
  attributes (registered as listeners); `abort` (EMPTY/DONE → clear result, keep state;
  LOADING → terminate + fire abort/loadend). dataURL uses `application/octet-stream`
  for an untyped blob.
- Added a `ProgressEvent` class (lengthComputable/loaded/total).

## Scoreboard

| Test | Before | After |
|------|:------:|:-----:|
| Blob-constructor | 36/73 | **69/73** |
| Blob-slice | 60/150 | **144/150** |
| Blob-array-buffer / text / bytes / constructor-endings | low | **all 100%** |
| File-constructor | 23/51 | **49/51** |
| readAsText / readAsArrayBuffer / readAsDataURL / readAsBinaryString | low | **all 100%** |
| FileReader-multiple-reads / filereader_events / filereader_abort / event-handler-attributes | low | **all 100%** |
| filereader_result | 0/12 | **8/12** |

**~153 → ~330 subtests (measured). Zero regressions.**

## The honest tail
- A few Blob/File subtests need element `toString` fidelity (`String(htmlBodyElement)`
  → `"[object HTMLBodyElement]"`), SharedArrayBuffer, and deep WebIDL getter-order.
- `filereader_result`'s last 4 ("result is null during progress") depend on a *second*
  read's trailing `loadend` firing after the promise_test completes — sensitive to
  Obscura's microtask-drain-between-macrotasks timing (the `loadstart` variant passes).
- Not pursued: the blob: URL **byte** store (currently string-keyed — `FileAPI/url/*`),
  `FileList`, worker-context reads.
