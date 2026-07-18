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

## The second siege — blob: URL byte store (session 2026-06-16, #09b)

The first siege left `createObjectURL` minting `blob:obscura/<rand>` and storing blob
*text* (lossy, async). Rebuilt the object-URL layer around the byte-backed Blob:

- **Spec URL format** `blob:{serialized origin}/{uuid-v4}` (origin from the page URL;
  `blob:null/<uuid>` for opaque origins). `_uuidV4` emits a valid 8-4-4-4-12 v4 UUID so
  `new URL(blobUrl).pathname` matches the FileAPI UUID regex. → `url-format` 3/6→**6/6**.
- **Byte store**: `createObjectURL` snapshots `blob._bytes` synchronously; `fetch` of a
  blob: URL strips the fragment for identity, allows **only GET**, and **rejects with
  TypeError** (not a 404 Response) on a revoked/query/path mismatch — so `promise_rejects_js`
  works. → `url-with-fetch` 1/16→**16/16**.
- **Request/XHR snapshotting**: `new Request(blobUrl)` and `XMLHttpRequest.open(…, blobUrl)`
  capture the blob's bytes at construction/open, so a `revokeObjectURL` before the actual
  fetch still succeeds (`clone()` carries the snapshot too).
- **XHR fixes surfaced here**: the error/catch path now goes through `_setReadyState(4)` so
  `onreadystatechange` fires (it previously called `_fireEvent('readystatechange')`, which
  intentionally skips the on-handler → `xhr_should_fail` hung); blob responses report
  `statusText: 'OK'`. → `url-with-xhr` ~0/14→**14/14**.

### Scoreboard (#09b)

| Test | Before | After |
|------|:------:|:-----:|
| url-format | 3/6 | **6/6** |
| url-with-fetch | 1/16 | **16/16** |
| url-with-xhr | ~0/14 | **14/14** |

**+~34 subtests. Zero regressions** (Blob-constructor 69, Blob-slice 144, File-constructor 49,
filereader_events 2, Element-classlist 1420 all held).

## The honest tail
- A few Blob/File subtests need element `toString` fidelity (`String(htmlBodyElement)`
  → `"[object HTMLBodyElement]"`), SharedArrayBuffer, and deep WebIDL getter-order.
- `filereader_result`'s last 4 ("result is null during progress") depend on a *second*
  read's trailing `loadend` firing after the promise_test completes — sensitive to
  Obscura's microtask-drain-between-macrotasks timing (the `loadstart` variant passes).
- `FileAPI/url/url-reload` (blob survives a page reload) and `url-in-tags` (blob in
  `<img>`/`<script>`/`<video>` src) need the navigation / tag-resource-loading subsystems,
  not just the store — left as tails. `FileList`, worker-context reads also not pursued.
