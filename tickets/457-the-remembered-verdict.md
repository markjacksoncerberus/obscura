# 🗝️ The Remembered Verdict — `webstorage`, and a browser that stops forgetting you

> *Quest #463. Realm: `webstorage/*`. Before **57/1284** across 47 measurable
> files (4 more files could not be measured at all — they HUNG the engine).
> After **1281/1288** across all 51, **99.5%**, 44 files at 100%, could-not-run 0.*

---

## Why this realm, and why now

The [frontier survey](102-the-frontier-survey.md) put `cookies` + `webstorage` +
`IndexedDB` second on the mission list, under one heading: **staying logged in,
and working offline.** Offline storage matters most exactly where connections are
metered and unreliable — which is who this browser is for. The standing order says
take an untouched realm over deepening a held one, so the ⭐ pointer into
`fetch/response-clone` (a realm we now hold at 88%) stays banked and this one got
the banner.

## The gap: `Storage` was a plain object with a `_data` bag

```js
globalThis.Storage = function Storage() {};
Storage.prototype.getItem = function(k) { return (this._data && this._data[k]) ?? null; };
…
const _mkStore = () => { var s = Object.create(Storage.prototype); s._data = {}; return s; };
```

Six methods over an object. Everything a page can actually *say* to a Storage was
missing, because **a Storage object is a WebIDL legacy platform object** — it has a
named getter, a named setter and a named deleter, and those are the whole reason
that

```js
localStorage.token = t;          // store an item
"token" in localStorage;         // true
Object.keys(localStorage);       // your keys
delete localStorage.token;       // log out
```

all mean what they look like. On the old object every one of those spellings
quietly wrote or read an *ordinary JS property* that `getItem` could never see. It
did not throw. It did not warn. A page that writes `localStorage.token = t` — and a
great many real pages, very nearly every "remember me" checkbox, are written
exactly that way — simply forgot you, on every navigation, forever.

JavaScript gives exactly one way to build a legacy platform object: **a Proxy.**

### The load-bearing piece is the *named property visibility* algorithm

The trap that matters is not `get`, it is the question `get` has to ask first:
*is this name visible as a named property at all?* WebIDL's answer is no if the
object has an ordinary own property of that name, and no if **anything on the
prototype chain** owns it. Storage has no `[LegacyOverrideBuiltIns]`, so:

```js
storage.getItem = "getItem";     // stores an ITEM under the key "getItem"
storage.getItem                  // …but this is still the METHOD
storage.getItem("getItem")       // → "getItem"
storage.length                   // still the count, not the item
```

That is `storage_builtins` and `storage_functions_not_overwritten`, and it is the
difference between a Storage object and a dictionary. Symbols never take the named
path at all (`Type(P) is String` gates every one of `[[Set]]`,
`[[DefineOwnProperty]]`, `[[Delete]]`), so they stay ordinary own properties on
the target — which is the whole of `symbol-props`.

### The four files that were an INFINITE LOOP

`storage_local_setitem_quotaexceedederr` is, in full:

```js
assert_throws_quotaexceedederror(() => { while (true) { localStorage.setItem(…); } });
```

Against a Storage with **no quota that loop never ends.** It is not a failing
test — it is a page the engine can never leave. It wedged the harness twice: the
first full-realm baseline ran 96 minutes and died there, and a single-file run with
a 15-second budget could not be killed inside 180 seconds. A 5 MiB per-bottle quota
(counted in UTF-16 code units over keys + values, kept as a running total so a
`setItem` is O(1)) turns four hangs into four passes, and `QuotaExceededError` was
already in the engine from an earlier quest with the `quota`/`requested` accessors
WPT's assertion demands.

### Storage events, and *which document did it*

A `storage` event is a notification that **another** document changed storage under
you — so the document that made the change is the one document that must NOT hear
about it. That is impossible to decide if every window shares one Storage object,
which is what the old engine did (`this.localStorage = globalThis.localStorage`).

So: each Window now gets its **own** Storage object over a **shared bottle**. Same
data, distinct objects. The state carried alongside the map is the owning window,
the broadcast skips it, and each receiver sees the change through *its own*
`event.storageArea` — which `event_no_duplicates` asserts by identity. Events are
queued as real tasks (`setTimeout(…, 0)`, a genuine task since Quest #461), and a
write that changes nothing fires nothing: same value → no event, removing a missing
key → no event, clearing an already-empty bottle → no event.

---

## Three engine bugs found underneath, none of them about storage

Getting the 14 iframe-driven event tests green turned up three real defects in the
frame machinery. All three were pre-existing; storage is just what made them visible.

### 1. A frame script's bare `localStorage` was the TOP window's

Frame scripts run through `new Function` with the frame's globals shadowed as
parameters (`window`, `document`, `location`, `parent`, …). `localStorage` was not
in that list, so a bare reference inside an iframe resolved to the **top window's**
object. Every WPT helper frame writes `localStorage.setItem("name", "user1")` with
a bare reference — so the write looked like *the top document* doing it, and the top
document was skipped by the broadcast. It never heard about a change it did not
make. Two more parameters fixed all 14.

### 2. A frame window's `on<type>` handlers were inert data properties

Only `onerror` had a real handler accessor on `_IframeWindow`; every other name was
a plain assignment that registered nothing. So `frameWin.onstorage = fn` — and the
`<body onstorage=…>` that reflects onto it — landed nowhere. Frame windows now
carry the full handler set with own null slots (which also stops the frame-window
Proxy's `globalThis` fallback from leaking the MAIN window's handler into an unset
frame one). Two now-redundant direct calls were removed with it, or `onload` and
`onmessage` would have fired twice.

### 3. 🔍 **An iframe re-navigated by `src` never ran its new document's scripts**

This is the one worth remembering. `_executeFrameScripts` is idempotent per frame
element via `_frameScriptsRan`, and **only the `srcdoc` path ever cleared that
flag.** So the second `iframe.src = …` on the same element built a fresh document
and a fresh window, fired a fresh `load` — and ran **not one line** of the new
document's script. The frame looked loaded and was inert.

It hid perfectly. WPT's `testStorages` helper runs each test twice (sessionStorage,
then localStorage) against the same iframe element, and the *first* run always
passed — so four files sat at exactly 1/2 with the second half timing out, which
reads like a flaky async test rather than a frame that never woke up. What exposed
it was pruning dead windows from the broadcast list: with the stale window gone the
score went 2/2 → 1/2, which is the shape of *"the thing still answering was the
corpse."* One line (`this._frameScriptsRan = false` on `_loadIframeSrc`) fixed it,
and its tail runs far past this realm — any test that re-navigates an iframe.

A fourth, smaller: a markup handler that throws inside a frame now reports to the
**frame's** window, not the host page's — WPT reuses helper frames across files, so
a helper written for a different test was Erroring the whole parent harness with
every subtest passing.

---

## Results

| Test | Before | After | Status |
|------|:------:|:-----:|:------:|
| `webstorage/storage_setitem.window.html` | 2/1106 | **1106/1106** | ✅ 100% **+1104** |
| `webstorage/storage_key.window.html` | 14/22 | **22/22** | ✅ 100% |
| `webstorage/set.window.html` | 0/20 | **20/20** | ✅ 100% |
| `webstorage/symbol-props.window.html` | 14/14 | **14/14** | ✅ held |
| `webstorage/defineProperty.window.html` | 0/12 | **12/12** | ✅ 100% |
| `webstorage/missing_arguments.window.html` | 0/10 | **10/10** | ✅ 100% |
| `webstorage/storage_removeitem.window.html` | 2/8 | **8/8** | ✅ 100% |
| `webstorage/storage_getitem.window.html` | 6/8 | **8/8** | ✅ 100% |
| `webstorage/storage_indexing.window.html` | 6/8 | **8/8** | ✅ 100% |
| `webstorage/event_no_duplicates.html` | 2/8 | **8/8** | ✅ 100% |
| `webstorage/event_constructor.window.html` | 0/6 | **6/6** | ✅ 100% |
| `webstorage/event_initstorageevent.window.html` | 0/5 | **5/5** | ✅ 100% |
| `webstorage/storage_enumerate.window.html` | 0/4 | **4/4** | ✅ 100% |
| `webstorage/storage_supported_property_names.window.html` | 0/4 | **4/4** | ✅ 100% |
| `webstorage/storage_in.window.html` | 2/4 | **4/4** | ✅ 100% |
| `webstorage/storage_length.window.html` | 2/4 | **4/4** | ✅ 100% |
| `webstorage/event_basic.html` | 0/2 | **2/2** | ✅ 100% |
| `webstorage/event_body_attribute.html` | 0/2 | **2/2** | ✅ 100% |
| `webstorage/event_case_sensitive.html` | 0/2 | **2/2** | ✅ 100% |
| `webstorage/event_setattribute.html` | 0/2 | **2/2** | ✅ 100% |
| `webstorage/storage_builtins.window.html` | 0/2 | **2/2** | ✅ 100% |
| `webstorage/storage_clear.window.html` | 0/2 | **2/2** | ✅ 100% |
| `webstorage/storage_string_conversion.window.html` | 0/2 | **2/2** | ✅ 100% |
| `webstorage/event_local_*` (7 files) | 0/7 | **6/7** | 6 × 100%, 1 cap |
| `webstorage/event_session_*` (7 files) | 0/7 | **6/7** | 6 × 100%, 1 cap |
| `webstorage/storage_local_setitem_quotaexceedederr.window.html` | **HANG** | **1/1** | ✅ 100% |
| `webstorage/storage_session_setitem_quotaexceedederr.window.html` | **HANG** | **1/1** | ✅ 100% |
| `webstorage/storage_local_quota_independent_from_session.window.html` | **HANG** | **1/1** | ✅ 100% |
| `webstorage/storage_session_quota_independent_from_local.window.html` | **HANG** | **1/1** | ✅ 100% |
| **`webstorage/*` — whole realm** | **57/1284** ⁽⁴ hung⁾ | **1281/1288** | **99.5%**, 44/51 files at 100% |

## Caps — honestly named

Every one of the 7 remaining failures is a capability we do not have, not a bug:

- **6 × `window.open`** — `storage_local_window_open`, `storage_session_window_open`,
  `storage_session_window_noopener`, `storage_session_window_reopen`,
  `event_local_window_open_oldvalue`, `event_session_window_open_scope`. We have no
  popup browsing contexts. Unwinnable until we do; not a storage gap.
- **1 × cross-origin** — `localstorage-share-data-unrelated-origins` needs two real
  origins. Same family as the cross-origin caps named in earlier scrolls.
- **Not on disk.** The bottles live in the page's JS realm, so storage does not yet
  survive a *navigation* or a restart. Every WPT file runs inside one page, so this
  costs nothing measurable — but it is the difference between passing the tests and
  keeping someone logged in, and it is the honest next step for this realm.
  Persisting through the existing Rust side (as the cookie jar already does) is a
  small, self-contained follow-up.

## Zero-regression sweep

`scripts/wpt-ritual.txt` (36 files): **7725/7820** — every held row exact, the same
total as the previous commit. Widened for the shared paths this quest touched
(event-path construction, frame windows, frame scripts, iframe re-navigation) with
8 extra probes:

| Probe | Result |
|---|---|
| `html/webappapis/scripting/events/event-handler-attributes-body-window.html` | 140/140 |
| `html/webappapis/scripting/events/event-handler-processing-algorithm.html` | 7/7 |
| `dom/events/EventTarget-dispatchEvent.html` | 25/25 |
| `dom/events/Event-dispatch-bubbles-true.html` | 5/5 |
| `dom/events/Event-dispatch-order.html` | 1/1 |
| `dom/events/Event-dispatch-target-moved.html` | 1/1 |
| `html/…/the-iframe-element/iframe-loading-lazy.html` | 1/5 — **identical on a stashed pre-change build** |
| `html/browsers/the-window-object/window-open-noopener.html` | could-not-run — **identical on a stashed pre-change build** |

The last two were stash-verified against a rebuilt pre-change binary rather than
assumed: both are pre-existing, neither is a regression.

## Caps / Next

**⭐ Next: `IndexedDB` — the same argument, ten times the size.** 12/417 (2.9%)
against a Chrome at 99.8%, and what is there is a *mime*: `open()` returns an object
whose `createObjectStore` returns `{createIndex(){}}` and whose `get()` returns a
request that never fires. Nothing throws, so nothing looks broken — an app simply
never gets its data back. Same failure shape as this realm, same reason it matters.

Then **`cookies`** (2/259). Note before starting: that realm leans hard on
`.sub.html` substitution and cross-origin `.py` handlers, so **measure a baseline
before committing to it** — the winnable share may be much smaller than 259 suggests,
and `document.cookie` already has a real Rust jar behind it
(`crates/obscura-net/src/cookies.rs`, `op_get_cookies`/`op_set_cookie`).

Still banked, unchanged: `Response.clone()` must **tee** the body rather than copy
its bytes (`fetch/api/response/response-clone` 6/21), and `FormData` cannot hold a
`File` (`String(v)` → `[object File]` — that is file upload).
