# 📜 Scroll 501 — The Declared Verdict

> **Quests #753–#777 · 2026-09-13 · branch `engine-per-page-threads`**
>
> **The browser could not say what its own interfaces WERE.**
> Every class on the platform was an ES class pretending to be a WebIDL
> interface, and the difference showed up in ways a page can see: `for…of
> element.children` threw, `new EventTarget()` claimed to be a `Node`,
> `document.implementation !== document.implementation`, `<video autoplay>`
> reflected nothing, and `Element.prototype.setAttribute.call({}, …)` cheerfully
> answered for an object that was not an element.
>
> Twenty-seven idlharness files across the platform:
> **7,735 / 10,202 → 9,518 / 10,202** (+1,783, **0 files down**).
> And before any of that: `url/IdnaTestV2.any.html` **1,912 / 2,671 → 2,671 / 2,671**.

---

## I. How the region was chosen

The outgoing pointer offered six candidates. Two were measured cold first:

| candidate | measured | verdict |
|---|---|---|
| `url/IdnaTestV2.any.html` (⭐⭐, "a pure function, testable offline first") | **1,912 / 2,671** | taken — 759 failures, one rule |
| `dom/idlharness.window.html?exclude=Node` (⭐⭐) | **756 / 1,366** | taken — and it turned out not to be a leaf at all |

The second one is why this arc is 25 quests long. A conformance file for one
realm's IDL looked like 610 subtests of tidying. It was actually a list of the
ways this engine's *entire object model* diverges from WebIDL — and every one of
those divergences is repeated on every other interface on the platform. Fixing
them generically moved 27 idlharness files at once, most of which nobody touched.

---

## II. ⭐⭐⭐ Quest #753 — an ASCII host is never re-encoded

`url/IdnaTestV2.any.html`, 759 failures, every one of them an input that was
already pure ASCII: `xn--ab-j1t`, `xn--0.pt`, `xn--ASCII-`, `a.b.xn--c-bcb.d`.

`xn--ab-j1t` is punycode for `a<ZWNJ>b`, which UTS-46 rejects (CONTEXTJ). The
`idna` crate therefore fails the whole parse, `url::Url::parse` returns
`IdnaError`, and `new URL("https://xn--ab-j1t/x")` threw.

Browsers do not do that, and the WPT expectation file says so in one line of its
generator:

```python
if len(statuses) > 0:
    if source.isascii() and not contains_forbidden_domain_code_point(source):
        to_ascii = source.lower()      # the host is the text, lowercased
    else:
        to_ascii = None                # only NOW is it a failure
```

**The URL Standard does not re-encode a domain that is already ASCII.** A host
made of ASCII text is that text; IDNA has nothing to do. 761 of the suite's rows
are exactly this case.

The `idna` crate has no knob for it (checked: `domain_to_ascii`,
`Uts46::to_ascii` with `AsciiDenyList::URL` / `Hyphens::Allow` /
`DnsLength::Ignore` all fail). So `crates/obscura-js/src/ops.rs` now does the
step itself, and *only* on the failure path: when — and only when — a parse
failed with `ParseError::IdnaError`, each `xn--` label of the host is disguised
(`xn--ab-j1t` → `xnaaab-j1t`, same length, no longer an ACE prefix), the URL is
re-parsed, and the real labels are put back into the serialized components.
Everything else about the host — forbidden code points, IPv4 shorthand, an empty
authority — is still judged by rust-url, on the disguised host, exactly as
before. The same tolerance was threaded through `op_url_set`, because
`url.hostname = "xn--"` is the same question and because the `href` a later
setter re-parses may already carry such a host.

| test | before | after |
|---|---|---|
| `url/IdnaTestV2.any.html` | 1912/2671 | **2671/2671** ✅ |
| `url/toascii.window.html` | 721/784 | **784/784** ✅ |
| `url/url-constructor.any.html` | 844/895 | **852/895** |
| `url/url-setters.any.html` | 239/279 | **241/279** |
| `url/url-origin.any.html` | 406/413 | **413/413** ✅ |

**+832 subtests from one rule.**

---

## III. The object model — what WebIDL says an interface is

Everything below lives in one sweep at the end of `__obscura_init`, plus the
per-interface repairs the sweep could not make generically. The sweep is
deliberately generic: the definition sites are eight hundred lines apart and the
next interface added would have missed them again.

### Quest #754 · #766 · #776 — required arguments

`document.createElement()` with no argument returned an element. WebIDL says it
throws. 105 operations in `dom/idlharness` alone were missing the check, and
writing it by hand at each call site is exactly how they came to be missing.

The counts now live in one table keyed by interface, and one wrapper enforces
them, preserving the member's name, its property descriptor and its `this`. The
same table is then applied down every intermediate prototype a subclass
introduces — `xmlDoc.createElement` resolves on `DetachedDocument.prototype`,
which is not itself a global, and an override that forgot the check is still the
declaring interface's operation as far as a page is concerned. Quest #776 added
the HTML element interfaces (`setCustomValidity`, `setRangeText`, `deleteRow`,
`canPlayType`, …).

### Quest #755 — an interface object is not enumerable

`globalThis.Event = class Event {}` is an enumerable property. WebIDL §3.7 says
an interface object is `{writable: true, enumerable: false, configurable: true}`,
and the consequence of getting it wrong is that `for (const k in window)` walks
the platform's entire class list in front of the handful of names the page
actually wanted.

⚠️ The first version of this sweep identified an interface as "a function whose
`prototype.constructor` points back at itself" — which is *also* true of every
ordinary function, so `window.getSelection` was taken out of `for…in` too. An
interface object is a **class**, and a class's `prototype` is non-writable while
a function's is writable. That is the only difference visible from here, and it
is the test now.

### Quest #756 — a constant is read-only

`NodeFilter.FILTER_ACCEPT = 99` was a thing a page could do. WebIDL §3.7.4:
constants are `{writable: false, enumerable: true, configurable: false}` on both
the interface object and its prototype. Swept generically over ALL-CAPS numeric
data properties, skipping non-configurable ones so the language's own frozen
constants are never touched.

### Quest #758 — an operation is ENUMERABLE

The largest single divergence, and the one with the widest tail. A method on a
WebIDL prototype is enumerable; a method on an ES class prototype is not. Every
interface here is an ES class, so `Object.keys(Node.prototype)` came back empty
where a browser lists the whole DOM.

To sweep this safely the engine has to be able to tell `Node.prototype
.appendChild` (ours, fix it) from `Array.prototype.push` (the language's, never
touch it), so the very first line of `bootstrap.js` now records
`_ES_BUILTIN_GLOBALS` — the own property names of `globalThis` before anything
of ours exists.

### Quest #761 · #762 — every member brand-checks its `this`

`Document.prototype.URL` read off the prototype answered instead of throwing;
`Element.prototype.setAttribute.call({}, 'a', 'b')` did not complain. WebIDL
§3.7.5 says both are TypeErrors. This is not test trivia: a member that answers
for any `this` is a member that will read one object's private field off another
object that happens to have a similarly-named one.

⚠️ **A promise-returning operation NEVER throws synchronously** — WebIDL §3.7.6
says it returns a promise rejected with the exception instead, and a caller who
wrote `handle.getFile().catch(…)` has exactly one place to handle failure. The
first version of the brand check threw for everything and cost **48 subtests
across six realms** (`fs`, `FileAPI`, `WebCryptoAPI`, `clipboard-apis`,
`permissions`, `storage`, `streams`) — every one of them caught by the ritual.
Nothing in the shape of a function says what it returns, so the wrapper asks its
source through the `toString` the engine kept before the page-facing one was
installed: an `async` operation, one that mentions `Promise`, one built on this
engine's `_promise(…)` helper, or one built on the Streams reference
implementation's `promiseRejectedWith(…)`.

⚠️ A member that **already** brand-checks is left alone entirely (its source says
`Illegal invocation`). The hottest members on the platform — every
`getAttribute`, every geometry getter — are exactly the ones that were written
with the check by hand, and wrapping them would add a second `instanceof` and a
second stack frame to the DOM's busiest paths for no behaviour at all.

### Quest #763 · #764 · #765 — names, lengths and tags

- An accessor written as `{ get() {…} }` is named `"get"`, not `"get fullscreenEnabled"`; a mixin installed as `Proto.prepend = _pnPrepend` carries the helper's internal name. The brand wrapper is where both get fixed.
- An interface object's `length` is its constructor's **required** argument count (`Event.length === 1`, `Document.length === 0`), not the ES class's declared parameter count. A class expression assigned to a property (`globalThis.CustomEvent = class extends Event {…}`) is **anonymous** — named evaluation does not reach through a member assignment — so `CustomEvent.name` was `""`.
- WebIDL §3.7.5 puts `@@toStringTag` on every interface prototype, which is what makes `Object.prototype.toString.call(node)` say `[object HTMLDivElement]`.

### Quest #777 — a symbol alias follows its function

`AudioParamMap.prototype[Symbol.iterator] === AudioParamMap.prototype.entries` is
something the spec asserts and idlharness checks. Wrapping the named member alone
broke that identity and cost `webaudio/idlharness` a subtest. Symbol-keyed
properties that held the same function object now follow it through the wrapper.

---

## IV. The interfaces that were not interfaces

| quest | what was wrong |
|---|---|
| **#757** | `Event`'s `type`/`target`/`currentTarget`/`eventPhase`/`bubbles`/`cancelable`/`composed`/`defaultPrevented`/`timeStamp` were own DATA properties on every instance. An own data property lets a listener write `event.target = somethingElse` and hand every later listener in the propagation path a forged record of what happened. They are readonly accessors on `Event.prototype` now, and the ~20 internal writers in the dispatch algorithm write the backing fields. |
| **#770** | `isTrusted` is `[LegacyUnforgeable]` — an **own**, non-configurable accessor on every event, not an inherited one. That is the whole point of the flag: a page must not be able to redefine it on the prototype and have every event it dispatches thereafter claim to come from the user. |
| **#759** | `document.implementation` minted a **fresh object literal on every read** — `document.implementation !== document.implementation`, no interface object on the global, and all three operations own properties of the instance. It is a class now, cached per document. |
| **#760** | `MutationRecord` was an object literal, and its `addedNodes`/`removedNodes` were **Arrays**, not NodeLists. |
| **#767** ⭐⭐⭐ | **`EventTarget` was `Node`.** One class carried both the tree and the dispatch surface, and `globalThis.EventTarget = Node` aliased it. So `new EventTarget()` claimed to be a node, `XMLHttpRequest` was `instanceof Node`, and — named as a cap in this file since Quest #461 — the window could not sit on the prototype chain HTML gives it, because splicing `Node.prototype` above the global would have handed every page a `window.parentNode` invoked with no node id. `EventTarget` is its own interface now, `Node extends EventTarget`, the six non-tree targets that said `extends Node` say `extends EventTarget`, and `window → Window.prototype → WindowProperties → EventTarget.prototype` is the real chain at last (`window-prototype-chain.html` **5/5**). |
| **#768** | `AbortSignal` was not an EventTarget: private listener array, state as own data properties, and `onabort` invoked **after** every other `abort` listener instead of in the order it was set. |
| **#771** | `Range` did not extend `AbstractRange`. |
| **#772** ⭐⭐ | **`Attr` was not a `Node`.** It stood alone and re-declared the handful of Node members it needed, so `attr.addEventListener` did not exist, `attr instanceof Node` was false, and everything else a page might reach for through an attribute node simply was not there. `dom/idlharness?include=Node` **563 → 608**. |
| **#769** | The ChildNode/ParentNode gaps: `CharacterData` had no `previousElementSibling`/`nextElementSibling` (a framework anchored on a comment node — Svelte, Vue and Lit all do — could not walk to the next element); `Document` had no `children`/`firstElementChild`/`lastElementChild`/`childElementCount`; `moveBefore` lived only on `Node.prototype`, not on the three interfaces that declare it; `CharacterData`/`DocumentType` had no `@@unscopables` object at all, and `Element`'s listed `moveBefore` (which is not unscopable) and omitted `slot`. |

---

## V. ⭐⭐⭐ Quest #773 — `for (const el of parent.children)` threw

Found by the ritual, not by a spec read. `DocumentFragment.children` had been
returning a plain **Array** (wrong type — `frag.children.namedItem()` threw), and
correcting it to an HTMLCollection broke
`naturalWidth-naturalHeight-width-height.html`, whose helper does exactly this:

```js
for (let img of clone.children) { … }
```

WebIDL §3.7.10: **an interface with an indexed property getter and no declared
iterable still gets `@@iterator`, and it is `%Array.prototype.values%` itself.**
Our `HTMLCollection` had none — so `for…of` over an element's children had been
throwing "is not iterable" for the whole campaign, on about as ordinary a line of
DOM code as exists. `NamedNodeMap` had the same hole.

---

## VI. Quests #774 · #775 — the HTML reflection table, part 2

Quest #731–#752 built a reflection table keyed by interface. This arc found the
next two layers of holes in it.

**#774 — `<video autoplay>` reflected nothing.** The media element's reflected
members (`autoplay`, `controls`, `loop`, `preload`, `defaultMuted`, `loading`)
were declared on **`HTMLAudioElement`**, which `HTMLVideoElement` does not
inherit from. Moved to `HTMLMediaElement`, where the IDL puts them.

**#775 — 60 more reflected members across 25 interfaces**: `<body text/link/
vlink/alink/bgcolor/background>`, `form.action` and `form.acceptCharset`,
`link.media`/`charset`/`disabled`/`imageSizes`/`imageSrcset`, `script.async`/
`defer`/`charset`, `meta.content`/`httpEquiv`, `iframe.allow`/`allowFullscreen`/
`loading`, the `align`/`width`/`height` presentational set on
embed/object/iframe/hr/pre/li/legend/table/tr/tbody, and `referrerPolicy` /
`fetchPriority` wherever HTML declares them.

⛔ `img.sizes` is deliberately **not** in the table: the source-set algorithm
reads `img.sizes` and distinguishes "no sizes attribute" (`undefined`) from an
empty one, and a plain reflection getter answering `""` for both made every
`srcset` selection pick the wrong candidate. It belongs in the source-set code,
not in a generated table. (Measured: it cost 36 subtests before it was removed.)

---

## VII. Results

**27 idlharness files, the whole platform: 7,735 / 10,202 → 9,518 / 10,202
(+1,783). Zero files down.**

| file | before | after |
|---|---|---|
| `dom/idlharness.window.html` (both variants) | 1173/1977 | **1891/1977** |
| `dom/idlharness.any.worker.html` | 149/219 | **217/219** |
| `html/dom/idlharness.https.html?include=HTML.+` | 2773/3898 | **3605/3898** |
| `html/dom/idlharness.https.html?include=(Document\|Window)` | 155/298 | **185/298** |
| `IndexedDB/idlharness.any.html` | 102/207 | **182/207** |
| `url/idlharness.any.html` | 39/77 | **62/77** |
| `encoding/idlharness.any.html` | 31/57 | **38/57** |
| `performance-timeline/idlharness.any.html` | 35/58 | **46/58** |
| `user-timing/idlharness.any.html` | 26/36 | **29/36** |
| `resource-timing/idlharness.any.html` | 15/79 | **19/79** |
| `xhr/idlharness.any.html` | 183/196 | **188/196** |
| `css/cssom/idlharness.html` | 493/497 | **494/497** |
| `notifications/idlharness.https.any.html` | 14/42 | **15/42** |
| `pointerevents/idlharness.https.window.html` | 198/203 | **202/203** |
| `html/browsers/…/window-prototype-chain.html` | 3/5 | **5/5** ✅ |
| the URL realm (five files) | see §II | **+832** |

**Ritual: 392 rows, 55,732 → 55,776, zero regressions.**

---

## VIII. ⛔ Caps, honestly

- **`XSLTProcessor` does not exist** (28 subtests in `dom/idlharness`). A shape-only stub would pass them and lie to every page that called `transformToDocument`. Left absent until there is a real XSLT 1.0 transform behind it.
- **`NodeList` extends `Array`** (a deliberate older choice, so the iterator identities match). That makes `Object.getPrototypeOf(NodeList.prototype)` `Array.prototype` rather than `Object.prototype`, gives every instance an own `length`, and leaves `NodeList.prototype[Symbol.iterator]` inherited rather than own — 5 subtests that cannot move without re-implementing NodeList as an indexed-getter proxy.
- **Interfaces with no constructor do not throw when constructed** (`new DocumentType()`, `new NamedNodeMap()`, `new CDATASection()`, `new NodeIterator()` …) — ~11 subtests in `dom/idlharness` and a long tail in `html/dom`. Each needs an internal allow-flag threaded through its construction sites; the pattern is already in this file three times (`DOMImplementation`, `MutationRecord`, `AbortSignal`) and just needs repeating.
- **`html/dom/idlharness.https.html` still has 293 failures**, most of them real missing members rather than shape: `HTMLMediaElement` still lacks `textTracks`/`buffered`/`played`/`seekable`/`currentSrc`/`playbackRate`/`srcObject`/`addTextTrack`, `HTMLInputElement` lacks `labels`/`showPicker()`, and `relList` is missing on a/area/link/form.
- **`naturalWidth-naturalHeight-width-height.html` is genuinely flaky** — measured 168–228/258 on the UNCHANGED baseline binary and 180–228 on this one, interleaved on a quiet machine, with `document.images` reporting an **identical** 103/129 complete at `onload` on both. It is layout timing, not a regression; do not read a single run of it as one.

---

## IX. Next

1. ⭐⭐⭐ **The `HTMLMediaElement` surface** — `textTracks`, `buffered`/`played`/`seekable` (TimeRanges), `currentSrc`, `playbackRate`/`defaultPlaybackRate`, `srcObject`, `addTextTrack()`. ~70 subtests in `html/dom/idlharness` and the honest IDL surface for `<video>`/`<audio>` on a device that cannot decode them.
2. ⭐⭐⭐ **`relList` / `labels` / `form`** — the computed (non-reflected) HTML members: `relList` on a/area/link/form, `labels` on every labelable control, `form` on every form-associated element. ~40 subtests, and `labels` is how a screen reader finds the text for an input.
3. ⭐⭐ **The illegal-constructor pass** — see the cap above; mechanical, ~11 + a long HTML tail.
4. ⭐⭐ **`IndexedDB/idlharness` 182/207** and **`resource-timing/idlharness` 19/79** — both now shape-clean, so what is left is real missing members.
5. ⭐⭐⭐ (carried) **Range geometry**, **float layout**, **the frame's media context** — all three still unclaimed, all three named precisely in Scroll 500 §Caps.
