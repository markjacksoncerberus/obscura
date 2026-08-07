# 📜 Quest #495 — The Kept Verdict

> *The Origin Private File System. `navigator.storage.getDirectory()` rejected
> with `SecurityError`, and not one of the interfaces existed.*

---

## Why this realm

This is the only place a web page can keep real **files**: not a string in
`localStorage`, not a row in IndexedDB, but a byte range it can seek into, append
to, and hand to `fetch()` as a body without ever loading the whole thing into
memory.

That is what lets a document editor keep your work while the signal is gone, a
photo uploader queue five pictures until there is Wi-Fi, a mapping app keep the
tiles for one city instead of re-downloading them every time it opens. For the
reader this campaign is for, it is the difference between an app that costs a
data bundle every session and one that costs it once.

And the reason it is called *private* is the other half: nothing here is the
user's real filesystem. No picker appears, no permission is asked and none is
needed — the page gets a sandbox of its own and cannot see out of it.

The frontier survey had `fs` at **5/98, Chrome 98.0%**.

---

## What was there

```js
getDirectory() {
  return Promise.reject(new DOMException(
    "The origin private file system is not supported.", "SecurityError"));
}
```

Every page's `catch (e) { fallBackToMemory() }` took that branch, forever,
silently — the ninth instance of *a feature that answers, and answers wrong*.

**Measured baseline: 6/175 over 13 files.** `idlharness.https.any` **6/43**;
every behavioural file at exactly **0**.

---

## What was built

Pure JS, ~420 lines, entirely **additive** — no existing interface changed, which
is why this was the right third quest to run against a single ritual pass.

```
FileSystemHandle              kind, name, isSameEntry(), remove()
 ├ FileSystemFileHandle       getFile(), createWritable(), move()
 └ FileSystemDirectoryHandle  getFileHandle(), getDirectoryHandle(),
                              removeEntry(), resolve(),
                              keys()/values()/entries()/@@asyncIterator
FileSystemWritableFileStream extends WritableStream   write()/seek()/truncate()
```

The store is a tree of nodes; the root is minted once, because two roots would be
two filesystems.

---

## ⭐ The four rules that carry the weight

**⭐⭐ `createWritable()` builds a SWAP FILE.** Writes land in a copy and only
become visible when the stream is **closed**. That is what makes a crash halfway
through a save leave the old file intact rather than a half-written one — and for
someone whose device runs out of battery mid-edit, it is the single most valuable
property this API has. `abort()` simply drops the buffer; the file is untouched.

**⭐ A name is invalid if it is empty, `.`, `..`, or contains a separator — and
that check IS the sandbox wall.** Without the `..` and `/` cases a page could walk
out of its own directory *by asking for a file*, which is the entire threat the
word "private" is guarding against.

**⭐ Asking for a file and finding a directory is its own error.** Not
`NotFoundError` — `TypeMismatchError`. The name is taken, and by something the
caller must not silently overwrite.

**⭐ Removing a non-empty directory requires saying so.** The default refusal is
the guard between "remove this folder" and "remove this folder and the nine
hundred photos in it". `removeEntry(name)` on a populated directory throws
`InvalidModificationError`; `{recursive: true}` is a decision, taken out loud.

Two smaller ones worth writing down:

- **A handle is compared by PATH, not by object identity.** Two separate
  `getFileHandle('a.txt')` calls return two objects naming one file, and
  `isSameEntry` has to say so. Every lookup also re-walks from the root rather
  than caching a node pointer, because a handle stays valid in *name* only: if
  the directory it lived in was removed, the handle must start failing.
- **Writing past the end grows the file and zero-fills the gap.** That is what
  makes `seek(1000); write('x')` a sparse write rather than an error — which is
  how a downloader writes chunks that arrive out of order.

---

## Results

| file | before | after |
|---|---|---|
| `fs/idlharness.https.any.html` | 6/43 | **43/43** |
| `fs/FileSystemDirectoryHandle-getFileHandle.https.any.html` | 0/13 | **13/13** |
| `fs/FileSystemDirectoryHandle-getDirectoryHandle.https.any.html` | 0/10 | **10/10** |
| `fs/FileSystemDirectoryHandle-removeEntry.https.any.html` | 0/13 | **11/13** |
| `fs/FileSystemDirectoryHandle-resolve.https.any.html` | 0/5 | **5/5** |
| `fs/FileSystemDirectoryHandle-iteration.https.any.html` | 0/6 | **6/6** |
| `fs/FileSystemFileHandle-getFile.https.any.html` | 0/3 | **3/3** |
| `fs/FileSystemFileHandle-move.https.any.html` | 0/24 | **18/24** |
| `fs/FileSystemBaseHandle-isSameEntry.https.any.html` | 0/14 | **11/14** |
| `fs/FileSystemBaseHandle-remove.https.any.html` | 0/9 | **6/9** |
| `fs/FileSystemWritableFileStream.https.any.html` | 0/9 | **7/9** |
| `fs/FileSystemWritableFileStream-write.https.any.html` | 0/31 | **27/31** |
| `fs/FileSystemWritableFileStream-piped.https.any.html` | 0/8 | **8/8** |

**6/175 → 155/175 (88.6%). Four files at 100%; `idlharness` complete.**

---

## ⚠️ Caps / Next

- **⚠️⚠️ THE STORE LIVES IN THE JS REALM AND DIES WITH IT.** Every WPT `fs/` test
  runs inside one page lifetime, which is why they pass — but **the second visit,
  the one offline mode is FOR, starts empty**. This is the same missing piece
  that six earlier quests have named, and putting the OPFS on disk is the ONE
  change that would turn this from an API into a feature. It is now the largest
  thing on the board with a fully-built consumer already sitting on top of it.
- **Handles are not structured-cloneable.** The whole
  `FileSystemBaseHandle-postMessage-*` family (7 files) and
  `FileSystemBaseHandle-IndexedDB*` (2 files) are untouched — a handle must
  survive `postMessage` and an IndexedDB round trip, which needs a serialization
  hook plus the transfer machinery.
- **`FileSystemSyncAccessHandle` is absent** — `createSyncAccessHandle()` is
  worker-only and backs the 5 `FileSystemSyncAccessHandle-*` files plus the
  lock-mode suites. It is the *synchronous* door (SQLite-in-wasm is built on it).
- **`FileSystemObserver` is absent** (4 tentative files).
- **The remaining sub-file failures are not yet named**: `move` 18/24,
  `isSameEntry` 11/14, `remove` 6/9, `removeEntry` 11/13,
  `WritableFileStream` 7/9, `-write` 27/31. `wpt_fails.py` over those six files is
  the next ten minutes of work in this realm and would very likely be cheap.
- **20 of the 33 `fs/` files were not swept.** The measured window is 13.
