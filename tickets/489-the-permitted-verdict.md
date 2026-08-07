# 📜 Quest #498 — The Permitted Verdict

> *`navigator.permissions.query()` answered `"granted"` to everything, and
> `navigator.clipboard.writeText()` resolved having stored nothing.*

---

## Why this realm

Two untouched realms from the frontier survey — `permissions` at 59.1% and
`clipboard-apis` at 26.2% — that turned out to share one failure: both were
object literals on `navigator` that reported success and did nothing.

They are also both about **consent and about the reader's own data**, which is
why they belong in one quest.

---

## Part one: the answer that was always "yes"

```js
permissions: { query(params){
  if (params?.name === 'notifications') return Promise.resolve({state:"prompt",onchange:null});
  return Promise.resolve({state:"granted"});
} },
```

`"granted"` is the single worst answer to give, because it is the one a page
**acts on**.

The entire point of querying a permission is to decide what to do *without*
interrupting anyone. A well-written page checks first, and only when the answer
is `"prompt"` does it show the "we'd like to use your camera, and here's why"
explainer that gives the person a real choice. Told `"granted"`, it skips the
explainer, calls `getUserMedia()` — which **this engine rejects with
`NotAllowedError`** — and the reader is left looking at a broken feature with no
explanation of what went wrong or what to do about it.

There was also no `PermissionStatus` interface, no `EventTarget`, no `name`, and
no way to hear about a change.

### ⭐ The rule the new table follows

> **A permission's state must agree with what the corresponding API actually
> does here.**

- `"denied"` where the API refuses — `camera`, `microphone`, `display-capture`
  (`getUserMedia`/`getDisplayMedia` already reject), and the sensors Obscura has
  no access to. Claiming `"granted"` for `accelerometer` sends a compass into a
  code path that then receives no readings at all, forever.
- `"granted"` only where the thing really works — `clipboard-write`, now that it
  does.
- `"prompt"` for everything else, because there is genuinely no UI in which to
  ask a human, and "nobody has decided yet" is exactly what `"prompt"` means. A
  page that handles `"prompt"` correctly shows its own explainer, which is the
  behaviour we want.

### ⭐ An unknown name is a TypeError, not a `"denied"`

A browser that quietly answered `"denied"` to a permission it had never heard of
would be indistinguishable from one that had heard of it and refused — and a page
feature-detecting a new API would take the no-support path forever.

### ⭐ `set_permission` is instrumentation, and it belongs to the driver

`permissions/event-model.https.html` tests the one thing a page can *never* do
for itself: a permission changing because somebody went into settings and changed
it. Without a driver, the test sits waiting for a transition that can only come
from outside the page, and reads as a timeout rather than as the missing driver
it is.

So the engine exposes exactly one entry point, `__obscuraSetPermission`, and the
WPT bridge in `scripts/wpt_run.py` calls it — the same role `delete_all_cookies`
already plays for the cookie realm. Nothing reachable from page script can call
it, because a page changing its own permissions is the thing permissions exist to
prevent.

Two things had to be right for the tests to pass, and both are worth recording:

- **⭐ testdriver.js packs both arguments into one object.** The public
  `set_permission(descriptor, state)` becomes `set_permission({descriptor, state},
  context)` before it reaches the backend. Reading it as `(descriptor, state)`
  gives `state === null` on every call — which fails as a *type error*, not as a
  wrong answer, so it looks like an engine bug rather than a bridge bug.
- **⭐ The change must be applied on a TASK, not synchronously.** A real driver
  call is a round trip out of the page and back, so anything the page has in
  flight settles first — including the `await permissions.query()` whose whole job
  is to get a listener attached before the transition arrives. Firing
  synchronously delivers the change to a page that has not finished subscribing,
  which reads as a hang. (`PermissionStatus out of scope should still fire
  "change"` is exactly that race, written down as a test.)

---

## Part two: "Copied!" — and nothing was

```js
clipboard: { writeText(){return Promise.resolve();}, readText(){return Promise.resolve("");} },
```

Both of these **succeeded**.

So every copy button on every page reported success, turned green, said
"Copied!" — and the person pasted nothing, or worse, pasted whatever was there
before. A share link. A wallet address. A 2FA backup code. An error message
someone was told to send to support.

The failure is invisible at exactly the moment the person stops paying attention,
which is what makes it worse than an error. An error you retry. A silent success
you find out about later, from the other end.

### What was built

A real clipboard store, plus `Clipboard`, `ClipboardItem`, `ClipboardEvent` and
`ClipboardChangeEvent`.

- **⭐ A Blob comes back from `getType()` unchanged**, keeping its own MIME type
  even where that disagrees with the key it was filed under. The key says how the
  page *labelled* it; the blob says what it *is*. Rewriting the second to match
  the first would be inventing a fact — and WPT asserts precisely this, with a
  blob of type `application/abc` filed under `text/plain;foo=1`.
- **⭐ `web ` is a prefix, and the space and the case are both part of it.**
  `weB text/html` is not a custom format, it is a type name beginning with
  "weB". A custom format also carries no parameters: `web foo/bar;x=1` is two
  formats' worth of ambiguity for whoever pastes it.
- **⭐ The constructor is permissive and `supports()` is strict, on purpose.**
  `new ClipboardItem({'text/plain;foo=1': blob})` is fine — the item just holds
  bytes. `ClipboardItem.supports('text/plain;foo=1')` is `false` — that is the
  question "will another application be able to read this", which is a different
  and much narrower question.
- **⭐ An empty `record<>` is a TypeError.** An item with no format is not an
  empty clipboard entry, it is a mistake: nothing could ever read it back.
- **⭐ More than one `ClipboardItem` is a `NotAllowedError`.** The system
  clipboard holds one thing; handing it several and hoping is how a paste becomes
  a coin flip, so the platform refuses rather than silently picking one.
- **⭐ A DOMString filed as `image/png` is a TypeError.** It is not an image that
  failed to decode, it is text wearing an image's label, and putting it on the
  clipboard means the next application to paste gets something it can neither
  render nor explain.

### ⭐ And both of them moved to `Navigator.prototype`

Most of this engine's navigator members are own properties of the `navigator`
object (moving them all is a large, risky reshuffle, and the class carries a note
saying so). But these two are new, so they could start out in the right place:
WebIDL attributes live on the interface prototype, and `'clipboard' in
Navigator.prototype` is how a great deal of real feature-detection is written.
Both are `[SameObject]` — a page may hold onto `navigator.clipboard` across a
session, compare it, and register listeners on it.

---

## Results

| file | before | after |
|---|---:|---:|
| `clipboard-apis/idlharness.https.window.html` | 18/62 | **62/62** |
| `permissions/idlharness.any.html` | 21/48 | **48/48** |
| `clipboard-apis/clipboard-item.https.html` | 0/35 | **35/35** |
| `clipboard-apis/async-navigator-clipboard-basics.https.html` | 2/17 | **17/17** |
| `permissions/all-permissions.html` | 0/19 | **19/19** |
| `permissions/event-model.https.html` | 0/4 | **4/4** |
| `permissions/permissionsstatus-name.html` | 0/1 | **1/1** |
| `permissions/edge-cases.https.html` | 0/1 | **1/1** |
| `clipboard-apis/async-write-html-read-html.https.html` | 0/1 | **1/1** |
| `permissions/worker.https.html` | 0/1 | 0/1 ⛔ |

**41/189 → 188/189 over the same 10 files.**

---

## Caps, named honestly

- **⛔ `permissions/worker.https.html` is UNWINNABLE BY CONSTRUCTION.** The test
  awaits `Promise.all([messagePromise, setPermissionPromise])` and never declares
  `messagePromise` — the promise it builds is called `changePromise`. It is a
  `ReferenceError` in the WPT source, not an engine gap. Reported upstream-worthy;
  recorded here so nobody spends a session on it.
- **The clipboard store dies with the JS realm.** It is a page-local clipboard,
  not the system one — copying in Obscura and pasting into another application
  does not work yet. That needs a real OS clipboard binding, and it is the same
  shape of gap as storage-on-disk.
- **We cannot verify that a Blob claiming to be a PNG decodes as one.** A real
  engine re-encodes image formats on write; we check that image types arrive as
  bytes rather than as text, which catches the case WPT tests and not the general
  one.
- **`ClipboardEvent`/`ClipboardChangeEvent` exist as interfaces but nothing fires
  them.** `copy`/`cut`/`paste` need the editing pipeline; `clipboardchange` needs
  a system clipboard to change.
- **`permissions/revocation`, `permissions-cg`, `non-fully-active`,
  `permissions-policy-*`** were not swept.

---

## Next

The `clipboard-write` state is `"granted"` because the write path genuinely
works. Making `clipboard-read` honest in the same way means binding the OS
clipboard — which, like storage-on-disk, is the difference between an API and a
feature.
