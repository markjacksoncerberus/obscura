# 🔨 Scroll #16 — The Clone Forge

> *A footgun stood where a forge should be: one line, `JSON.parse(JSON.stringify(v))`,
> masquerading as `structuredClone`. It silently maimed every value worth cloning. We
> tore it out and forged the real WHATWG algorithm in its place.*

**Realm:** `html/webappapis/structured-clone`
**Hold:** **141/152 (SECURED 93%)** — was 29/152.
**Bounty banked:** **+112.**
**Location:** `crates/obscura-js/js/bootstrap.js` (the `globalThis.structuredClone` IIFE,
~line 4895). Pure JS, no new Rust.

## The beast we slew

The old stub:
```js
globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));
```
dropped `undefined`/`NaN`/`±Infinity`, corrupted `-0`→`0`, threw on `BigInt`, threw on
**every cyclic reference**, did not preserve shared identity, and lost Date/RegExp/Error
/ArrayBuffer/TypedArray/DataView/Blob/File entirely (they came back as `{}`).

## The forge (StructuredSerialize/StructuredDeserialize)

`_clone(value, memory, transferSet)` — recursive, with a **`memory` Map** (original →
clone). The container is inserted into `memory` *before* its contents are cloned, so a
cycle resolves to the in-progress clone and shared subgraphs stay shared.

Dispatch (by `Object.prototype.toString` brand + `instanceof`):

| Input | Clone |
|---|---|
| `undefined`/`null`/bool/number/string/**BigInt** | returned verbatim (survive) |
| boxed Boolean/Number/String/BigInt | `new T(value.valueOf())` |
| `symbol`, `function` | **`DataCloneError`** |
| Date | `new Date(getTime())` |
| RegExp | `new RegExp(source, flags)` (lastIndex → 0) |
| Error family | name→standard ctor; **own** message + **own** cause only; custom props dropped |
| ArrayBuffer | copy bytes; resizable preserves `maxByteLength`; detached → throw |
| SharedArrayBuffer | **`DataCloneError`** (not cross-origin-isolated) |
| TypedArray / DataView | clone underlying buffer (shared via `memory`), recreate view; length-tracking preserved; OOB DataView (`.byteLength` throws) → `DataCloneError` |
| Map / Set | new + cloned entries (not in the battery, but spec-correct) |
| File / Blob | `Object.create(proto)` + copy `_bytes`/`_type`/`_name`/`_lastModified` (byte-exact, collapses subclasses to closest serializable interface) |
| `Response` / `Request` | **`DataCloneError`** (non-serializable platform objects) |
| Array | preserve `length` (holes) + own enumerable string keys |
| ordinary object | clone proto = `%Object.prototype%`; own enumerable string keys only (symbol keys & non-enumerables excluded; a throwing getter rejects) |

**Transfer:** `structuredClone(v, { transfer })` validates the list (non-ArrayBuffer or
already-detached → `DataCloneError`), then *moves* listed ArrayBuffers — copy bytes,
build a fresh buffer with preserved `maxByteLength`, detach the source via V8's
`ArrayBuffer.prototype.transfer()`.

**Two robustness details:** (1) the `Blob`/`File`/`Response`/`Request` interface objects
are captured at module-load time, so a clone still works (and stays `instanceof` the
right type) after a page does `delete globalThis.Blob` — a real WPT subtest. (2) added
`globalThis.crossOriginIsolated = false`, which is simply true of us.

## The 10 honest losses (engine gaps, NOT the algorithm)

- **FileList ×3** — there is no `FileList` interface in the engine (`input.files` is absent).
- **OOB TypedArray ×2** (serialize + transfer) — after `buffer.resize(0)`, V8 reports an
  out-of-bounds typed array as `length 0`/`byteOffset 0`, indistinguishable in pure JS from
  a legitimately empty view, so we can't know to throw. (The OOB **DataView** cases *do*
  pass — `.byteLength` throws on an OOB DataView, which we catch → `DataCloneError`.)
- **MessagePort / ImageBitmap / OffscreenCanvas transfer + detached/deleted MessagePort ×5**
  — no real transferable-platform-object machinery (no working MessageChannel ports, no
  canvas-backed ImageBitmap). We throw `DataCloneError` for any non-ArrayBuffer transfer.

Bonus `html/infrastructure/.../structuredclone_0.html` still TIMEOUTs: it's a
cross-document `postMessage`/`MessageChannel` round-trip, an engine gap unrelated to the
clone algorithm.

## To revisit

These would each need engine (Rust/bootstrap) work beyond a pure-JS clone: a real
`FileList` type, working `MessageChannel`/`MessagePort` transfer, canvas-backed
`ImageBitmap`/`OffscreenCanvas`, and a way to introspect an OOB typed array's original
byteOffset. Worth ~10–11 more subtests here plus the cross-document messaging test.
