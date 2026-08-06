# 📜 Quest #487 — The Uploaded Verdict

> *`FileAPI` — the bytes a person chose, arriving where they were sent.*
> **`FormData` could not hold a file, and `fetch()` stringified every body that
> was not already a string.**

---

## The gap

The realm did not look untouched. `FileAPI` had nine rows on the scoreboard and
`Blob`, `File` and `FileReader` were all present and mostly reasonable. The
measured baseline said otherwise:

| | files | ours | Chrome 153 |
|---|---|---|---|
| `FileAPI` (window+worker window) | 89 measurable | **1057/1540 (68.6%)** | 1587/1598 (99.3%) |

And the shape of the loss was concentrated, not diffuse:

| block | baseline |
|---|---|
| `send-file-formdata-*` ×3 + `send-file-form-*` ×6 | **0** of ~153 |
| `idlharness` ×4 | 166/383 |
| `Blob-textStream` ×4 | 0/32 |
| `filelist` | 0/7 |
| `FileReaderSync.worker` | no output at all |
| `Blob-constructor-detached-buffer` ×2 | 0/8 |

---

## ⭐⭐ The primitive: a `FormData` that cannot hold a file, and a `fetch()` that
## stringifies its body

Two lines, one on each side of the same journey.

```js
// FormData
append(k, v) { this._d.push([String(k), String(v)]); }
//                                      ^^^^^^^^^ a File becomes "[object File]"

// fetch()
const body = init.body ? String(init.body) : …;
//                       ^^^^^^^^^^^^^^^^^ a FormData becomes "[object Object]"
```

That is **file upload**, and it was broken end to end with nothing to search for.
No throw, no warning, no console line. The request went out, the server answered
200, and the far end received a fifteen-character label where a photo, a PDF, a
scan should have been. The attachment on a job application. The photograph on a
benefits claim. The document a council office asked for by Friday.

`Request` had run the real "extract a body" algorithm since quest #459. **The
`fetch()` entry point simply never called it** — the correct code was in the
building and the door to it was never opened. *A realm can be at 68% because one
call site takes a shortcut past everything the rest of the engine already does
properly.*

---

## The work

### 1. A real `FormData` (~120 lines)

- **"create an entry" is one function**, so the Blob→File promotion happens in
  exactly one place and `append`, `set` and form collection cannot drift.
  A bare `Blob` becomes a `File` named `blob` — a multipart part *without* a
  filename is a text field, not a file, so the spec insists on a name.
- **`set` replaces IN PLACE.** Deleting-then-appending silently reorders a form,
  and multipart order is the order a server reads a form back in.
- The **3-argument overload is Blob-only**: `append(name, "text", "file.txt")`
  has no meaning, and accepting it quietly would hide the author's bug.
- Names and string values are **USVStrings** — a lone surrogate is not text, and
  a byte sequence built from one is not something a server can decode.

### 2. The multipart/form-data encoding algorithm, at the BYTE level

The old serializer built a JS string and did
`new TextDecoder().decode(file._bytes)` — **a UTF-8 round trip over a photo**,
which is how an upload arrives corrupt. The new one concatenates byte arrays and
never decodes.

Two escaping rules the old one also got wrong, and both are real:

- **Newlines in a NAME or a string VALUE are normalized to CRLF; a FILENAME is
  not.** A filename is a name, not a line of text — a lone `\n` in it must become
  `%0A`, not `%0D%0A`.
- **`"`, CR and LF are escaped to `%22`/`%0D`/`%0A` in the name and filename.**
  An unescaped `"` closes the quoted string early: that is how a crafted filename
  smuggles a second header into somebody else's request.

### 3. A byte-exact request-body channel down to Rust

`op_fetch_url` and `op_fetch_url_sync` took the body as a `String`, so anything
crossing the boundary was re-encoded as UTF-8. Both ops gained a
`body_base64` parameter that **wins when present**, and `perform_fetch_core` now
carries `Vec<u8>` instead of `String`. A body that fails to decode is treated as
absent rather than sent half-formed — *a truncated upload the server accepts is
worse than one that visibly fails.*

XHR shares the same path: `_extractRequestBody` gained a `bytes` channel, and
the async XHR hands `fetch` the **exact bytes wrapped in a typeless Blob** rather
than the original object — re-extracting a `FormData` downstream would mint a
**second boundary** while the `Content-Type` header already named the first, and
no server could parse the result.

### 4. 🔍 `Blob.slice` takes `[Clamp] long long`, and `[Clamp]` rounds HALF TO EVEN

Six failures in `Blob-slice`, and the pattern was unmistakable once read as a
table: `0.5 → 0`, `1.5 → 2`, `2.5 → 2`, `3.5 → 4`. That is not truncation and it
is not `Math.round`; it is banker's rounding, which is what WebIDL `[Clamp]`
specifies. `Math.trunc` gets three of those four wrong. A fractional byte offset
is what you get from *any* arithmetic on a position, so this is not exotic.

### 5. WebIDL shape, and one general helper

`_idlShape(Ctor, opts)` — the reusable form of quest #467's table, now applied to
`Blob`, `File`, `FileList`, `FileReader`, `FileReaderSync`. Enumerable prototype
accessors, brand checks, `@@toStringTag` as a **data** property, constructor
`length` counting required arguments only.

**⭐ One rule the helper had to learn: a PROMISE-RETURNING operation REJECTS on a
foreign `this`, it does not throw.** `Blob.prototype.text.call({})` must hand back
a rejected promise. An author who wrote `.catch()` and nothing else would
otherwise get an uncaught exception out of a call they had already promised to
handle.

`FileReader`'s `result`/`readyState`/`error` moved from own writable properties
to prototype accessors — *a reader's result is a report of what was read, not a
setting* — and its constants became non-writable on both the interface object and
the prototype, because a writable `FileReader.DONE` is a constant any page can
redefine underneath every `=== FileReader.DONE` in every library it loaded.

### 6. 🔍 The sequence conversion is LAZY, and the iterator is read ONCE

`Array.from(blobParts)` is wrong twice: it reads `@@iterator` a second time (the
first read was the type check), and it collects every element before converting
any. WPT watches the exact order — `Symbol.iterator, length getter, length
valueOf, 0 getter, 0 toString, length getter, …` — because a `toString` on
element 0 may mutate the array and a getter on element 1 may throw, and both must
see the world as it is at that moment.

The loop is driven by hand rather than with `for…of`, because `for…of` would call
`@@iterator` **on the iterator the sequence just produced**. A custom
`@@iterator` is free to return a bare `{ next() }` — that is what an iterator IS —
and demanding it be iterable itself rejects a valid one.

### 7. `postMessage(buffer, [buffer])` now actually detaches

`MessagePort.postMessage` ignored its transfer argument entirely, so the buffer
was silently **copied and left attached**: the sender kept a live handle to memory
it believed it had given away. Two owners of one buffer is precisely the bug
transfer exists to prevent. Routed through `structuredClone(msg, {transfer})`,
which already detaches correctly.

A **detached buffer contributes nothing** to a Blob — and the check must come
*before* the copy, because `slice` on a detached buffer throws.

### 8. Smaller, all measured

- `Blob.prototype.textStream()` — decodes as UTF-8 and **ignores the blob's
  `charset`**, deliberately: a blob's type is author-supplied metadata, not a
  decode instruction. (A *document* declares its encoding and is decoded
  accordingly — a different algorithm, and conflating the two is what quest #475
  had to unpick.)
- `FileReaderSync`, `[Exposed=(DedicatedWorker,SharedWorker)]` — handed to the
  worker scope rather than installed as a page global, so `'FileReaderSync' in
  self` answers honestly on both sides. A ServiceWorker does not get it: it must
  never block.
- A real `FileList`, and **`input.files`**, which had no accessor at all — so the
  guard every upload page opens with (`if (input.files.length)`) *threw* instead
  of reporting "nothing chosen".
- `readAsText` now consults the blob's own `charset` before falling back to
  UTF-8 — shared with `FileReaderSync` so the two cannot answer differently about
  the same bytes.

### 9. ⭐ A platform-wide gap the realm surfaced: nothing had `@@toStringTag`

`String(document.body)` was `[object Object]`. So was every element, every Node,
every collection — indistinguishable from a plain object in a console, a log
file, or a library's brand check. Every interface prototype object now carries
the tag WebIDL says it must.

**⚠️ And the first attempt broke the platform**, which is the lesson worth
keeping: stamping *every* uppercase global's prototype includes `Object`, and
`Object.prototype[@@toStringTag]` gives EVERY object an inherited tag — so
`Object.prototype.toString.call(fn)` answers `[object Object]` for a function, an
array, an error. The one property the whole brand-check idiom rests on. The
ECMAScript intrinsics the language deliberately leaves untagged are now an
explicit deny list; the ones that *do* have a tag already own it and are skipped.
It cost three idlharness subtests and one measurement cycle to find.

---

## Results

| test | before | after | |
|---|---|---|---|
| **`FileAPI` window (89→90 files)** | **1057/1540 (68.6%)** | **1415/1550 (91.3%)** | **+358** |
| `send-file-formdata-punctuation.any` | 0/27 | **27/27** | ✅ |
| `send-file-formdata-controls.any` | 0/12 | **12/12** | ✅ |
| `send-file-formdata-utf-8.any` | 0/6 | **6/6** | ✅ |
| `idlharness.any` | 62/111 | **107/111** | ⬆️ |
| `idlharness.any.worker` | 63/120 | **108/120** | ⬆️ |
| `idlharness` | 20/69 | **65/69** | ⬆️ |
| `idlharness.worker` | 21/83 | **71/83** | ⬆️ |
| `Blob-slice.any` (×2) | 144/150 | **150/150** | ✅ |
| `File-constructor.any` | 49/51 | **51/51** | ✅ |
| `Blob-constructor-detached-buffer.any` (×2) | 0/4 | **4/4** | ✅ |
| `Blob-textStream.any` (×4) | 0/8 | **8/8** | ✅ |
| `filelist` | 0/7 | **7/7** | ✅ |
| `FileReaderSync.worker` | *no output* | **10/10** | ✅ |
| `Determining-Encoding.any` (×2) | 3/6 | **4/6** | ⬆️ |
| `Blob-constructor.any` (×2) | 69/73 | **72/73** | ⬆️ |

**Per-file diff of the 89 baseline files: 0 regressed.**

---

## ⚠️ Caps, named honestly

- **`send-file-form-*` — 63 subtests, still 0, and the reason is NOT FileAPI.**
  Those six files drive a real `<form>` with a file input
  (`new DataTransfer(); dt.items.add(file); input.files = dt.files;
  form.submit()`) into a target `<iframe>`. Two things block them: there is no
  `DataTransfer` (it is on the worker deny list but was never implemented), and —
  the load-bearing one — **a POST into a target frame loses its body**, the cap
  scroll 468 already banked. The FormData half of the same matrix is now 100%,
  which is what makes it clear the remaining half is a frame-loader gap.
- **`BlobURL/cross-partition*` (15 subtests) and `url-*` lifetime/reload tests**
  need storage partitioning and blob-URL survival across a navigation. TIMEOUTs,
  not failures.
- **`FileReader.prototype`'s [[Prototype]] is not `EventTarget.prototype`**,
  because in this engine `EventTarget === Node`. Several idlharness rows in every
  realm rest on that aliasing; unpicking it is its own quest.
- `Blob-constructor-dom.window` 1/4 (FrozenArray blob parts), `Blob-stream` 5/6,
  `opaque-origin` 0/2.

---

## Next

The `@@toStringTag` stamping is a platform-wide primitive that landed here almost
by accident — it is worth re-measuring `idlharness` across every realm now that
every interface prototype names itself. And `DataTransfer` + a request-body
channel for frame navigation would close `send-file-form-*` and the banked
POST-into-a-frame cap in one move.
