# 📜 Scroll 502 — The Furnished Surface

> **Quests #778–#802 · 2026-09-13 · branch `engine-per-page-threads`**
>
> Scroll 501 taught the engine what an interface *is*. This one gave the
> interfaces their **members** — and found that `new Audio()` had never been an
> audio element, that a `<video>` reflected none of its own attributes, and that
> `frames = [...]` in a sloppy-mode script silently did nothing, which is how a
> thousand legacy-encoding subtests came to die at once.
>
> 27 idlharness files: **9,518 → 9,945 / 10,202 (97.5%)**, and from the campaign
> baseline **7,735 → 9,945 (+2,210)**. Zero files below baseline.
> `html/dom/idlharness` alone: **2,928 → 4,115 / 4,196**.

---

## I. ⭐⭐⭐ Quest #779 — `new Audio()` was not an audio element

```js
new Audio('song.mp3') instanceof HTMLMediaElement   // false
new Audio('song.mp3').autoplay                      // undefined
document.body.appendChild(new Audio())              // TypeError
```

`Audio` was a stand-alone class with four properties on it. It was not an
element, not a Node, not an EventTarget: it could not be put in the document,
could not take a listener, and answered `undefined` to every question the media
IDL defines. `Image()` and `Option()` in this file have been real factories for
a long time — this one now matches them.

While fixing it, all three turned out to be wrong in the same smaller way.
WebIDL calls them **legacy factory functions**, and a legacy factory function is
a CONSTRUCTOR: `Image()` without `new` is a TypeError, its `prototype` is the
interface prototype and is `{writable: false, enumerable: false, configurable:
false}`, and its `length` is 0. Ours were plain functions, so `Image.prototype =
{}` was a thing a page could do — and every `new Image()` after it would have
inherited from the replacement.

## II. ⭐⭐⭐ Quest #774 · #778 — `<video autoplay>` reflected nothing

The media element's reflected members — `autoplay`, `controls`, `loop`,
`preload`, `defaultMuted`, `loading` — were declared on **`HTMLAudioElement`**,
which `HTMLVideoElement` does not inherit from. So every one of them was missing
on `<video>`: `video.loop` was `undefined`, and `<video autoplay>` in markup
reflected to nothing at all.

Thirteen more media members had never existed: `textTracks`, `buffered`,
`played`, `seekable`, `currentSrc`, `playbackRate`, `defaultPlaybackRate`,
`preservesPitch`, `srcObject`, `audioTracks`, `videoTracks`, `addTextTrack()`,
`getStartDate()`. They exist now, along with the interfaces behind them:
**`TimeRanges`** (whose `start(i)`/`end(i)` throw `IndexSizeError` past the end,
so a player walking `buffered` without checking `length` is told so rather than
handed NaN), **`TextTrack`**, **`TextTrackList`**, **`TextTrackCueList`**,
**`AudioTrackList`**, **`VideoTrackList`**, and `HTMLTrackElement`'s `track`,
`readyState` and its four constants.

⛔ This engine has no media decoder and the scroll does not pretend otherwise:
every value is the truthful answer for "nothing has been loaded". What it fixes
is the far more common failure — a page asking a `<video>` an ordinary question
and getting `undefined`, which is not "no video", it is a TypeError three lines
later in somebody's player script. `<track>` matters for a second reason: it is
how a deaf viewer reads a video, and how anyone watching without sound follows
it.

## III. ⭐⭐⭐ Quest #797 — `frames = [...]` silently did nothing

Found by the ritual, and the most expensive single bug in the arc:
`euckr-encode-form-korean.html?1-1000` went **1000/1000 → 0/1000**.

`encoding/resources/encode-form-common.js` — the helper behind every
legacy-encoding *form* test on the platform — does this in a classic,
sloppy-mode script:

```js
var frames = null;
…
frames = Array.prototype.slice.call(document.getElementsByTagName("iframe"));
```

Quest #788 had just converted `window.frames` from an own data property into an
own **getter-only accessor** (the global's members should be accessors). In
sloppy mode, assigning to an accessor with no setter *fails silently*. `frames`
kept pointing at the window's own frame list, `frames[id]` was a Window instead
of an `<iframe>` element, `iframe.onload = …` set an expando on it, the load
never fired, and a thousand subtests went `notrun` with no error anywhere.

The standard already says what to do: `self`, `parent` and `frames` are
**`[Replaceable]`**, not plain readonly. A `[Replaceable]` attribute HAS a
setter, and that setter's job is to replace the accessor with an ordinary data
property holding whatever was assigned. That is the whole point of the extended
attribute, and it exists precisely because scripts do this.

## IV. The global object is a platform object too

| quest | what was wrong |
|---|---|
| **#788** | WebIDL §3.7.7: for an interface declared `[Global]`, its members are own properties of **the global object**, not of the interface prototype. `window.closed` defined on `Window.prototype` is inherited, and inherited is not what the standard — or a page reading `Object.getOwnPropertyDescriptor(window, 'closed')` — expects. Also: `window`, `document`, `top` and `location` are `[LegacyUnforgeable]` — own, non-configurable **accessors**. As own data properties, an injected script could simply overwrite `window.document` and every later reader would follow the replacement. |
| **#787** | `window.closed`, `name`, `status`, `external`, `clientInformation`, `originAgentCluster`, `captureEvents()`, `releaseEvents()` and `document.lastModified`, `onreadystatechange`, `onvisibilitychange`, `Document.parseHTML()` were simply absent. Ordinary, old, widely-used surface answering `undefined`. |
| **#786** | `document.images`, `links` and `scripts` were **NodeLists**. They are HTMLCollections, and `document.images.namedItem("logo")` is how a great deal of older code reaches a picture. `embeds`/`plugins` did not exist at all. |
| **#789** | `Window` is written as a plain function here, so the interface sweep never recognised it: its `prototype` property was writable and the interface object did not inherit from `EventTarget`. |
| **#796** | The five `[LegacyUnforgeable]` global accessors brand-check their `this`. ⚠️ **Only** those five — a blanket brand check over every own accessor of the global cost **21 subtests** across `cssom-view`, `css-animations` and `selection`, because `window.innerWidth` and every `on*` handler are read with all sorts of receivers by all sorts of code and the standard does not ask them to object. Measured, then narrowed. |
| **#790** | `[LegacyLenientThis]`: `onreadystatechange`, `onmouseenter` and `onmouseleave` must answer `undefined` for a wrong `this` rather than throw. They are the compatibility shims for code that copied a handler off a prototype, and the standard keeps them quiet on purpose. |

## V. The HTML members that were not there

- **#780 — reflected DOMTokenLists.** `relList` on `<a>`, `<area>`, `<link>` and `<form>`; `link.sizes`; `blocking` on link/script/style; `output.htmlFor`. `a.relList.contains('noopener')` is how a page checks its own link policy.
- **#781 — HTMLElement's remaining content attributes.** `autocapitalize`, `autocorrect`, `writingSuggestions`, `accessKeyLabel`, `headingOffset`, `headingReset`. ⚠️ `autocorrect` and `writingSuggestions` default to **on** when the attribute is absent: a form that never asked to turn them off must not have them turned off.
- **#782 — `getSVGDocument()`** on `<iframe>`, `<embed>`, `<object>`, `<frame>`.
- **#783 — the odds and ends.** `form.requestSubmit()`, `textarea.type`/`textLength`, `progress.position` (−1 for an INDETERMINATE bar — the one value that tells a screen reader "we do not know how long this is"), `legend.form`, `map.areas`, `input.showPicker()`/`select.showPicker()`, `<marquee>`'s `loop`/`start()`/`stop()`, `canvas.transferControlToOffscreen()`, the static `HTMLScriptElement.supports()`.
- **#784 · #794 — the collection interfaces.** `HTMLAllCollection` and `HTMLFormControlsCollection` had no interface object at all, and `form.elements` was a plain HTMLCollection — so a page could not brand-check either, and `form.elements.namedItem` could not answer the RadioNodeList case.
- **#792 — a member belongs to the interface that DECLARES it.** `title`, `draggable`, `innerText`, `enterKeyHint`, `inputMode`, `autofocus`, `download`, `videoWidth`, `width`/`height` were implemented once on `Element.prototype` and dispatched on `localName`. Economical, invisible to `element.title`, and *not* invisible to `Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'title')` or to a subclass wanting to override only its own. The descriptors are copied down to the interfaces WebIDL names.
- **#793 — a readonly attribute has NO setter.** `template.content` and `select.type` had one, and `select.type = 'text'` silently succeeding is a page believing it changed a control that did not change.
- **#791 — `length`.** An interface object's `length` is its constructor's required-argument count, and every element interface and every collection takes none. An operation whose arguments are all optional (`showPopover`, `toDataURL`, `decode`, `assignedNodes`, `close`) has length 0; an ES method that spells the parameters out reports the wrong number.

## VI. Quest #798 · #799 — a performance entry is a record

`PerformanceResourceTiming`'s twenty-three timing attributes were own **writable**
properties on each instance. A page that can write `entry.transferSize = 0` can
hide a megabyte from whatever is watching the data budget — and on a metered
connection, that budget is somebody's money. They are readonly prototype
accessors over an internal store now, which the engine fills as timing becomes
known. `resource-timing/idlharness` **15 → 65/79**.

⚠️ `PerformanceTiming` — the *legacy* interface with a confusingly similar member
list — really does have own data properties, because that is what its (old) spec
said. The first version of this patch rewrote both and the snapshot build
refused to start, which is the cheapest possible way to find out.

Then the same `length` audit over Performance, User Timing, Encoding and URL:
`TextDecoder.length` was 2 (it should be 0), `performance.mark.length` was 2,
`PerformanceMark.length` was 2. Plus `PerformanceEntry`'s two newer members,
`id` and `navigationId`.

## VII. ⭐⭐⭐ Quest #800 — an interface that implements EventTarget must BE one

`IDBRequest`, `IDBDatabase`, `IDBTransaction`, `FileReader`, `WebSocket` and a
dozen more grew their own `addEventListener`/`removeEventListener`/
`dispatchEvent` trio and never joined the hierarchy. So
`request instanceof EventTarget` was **false**, `Object.getPrototypeOf(
IDBRequest.prototype)` was `Object.prototype`, and a page (or a library) that
generically accepted "anything you can listen to" rejected them.

Swept at the end of init: an interface whose prototype owns the trio and whose
prototype's prototype is still `Object.prototype` is re-parented onto
`EventTarget.prototype`. Their own three methods still shadow EventTarget's —
this only fixes where they sit.

`IndexedDB/idlharness` **102 → 204/207**. `websockets/idlharness` **60 → 62/62**.

## VIII. Quest #801 · #802 — the last two

**#801 — `Notification`** was a bare class with an empty constructor: no `title`,
no `body`, no `close()`, no events, and `notification.onclick = …` was an
expando nobody would ever call. It is the real interface now, with the whole
options record read back exactly as given (and `data` structured-cloned, so a
page is not handed a live reference it can mutate behind the notification's
back). ⛔ There is no way to put a notification on someone's screen here, and it
does not pretend: permission is `"default"`, so the spec's own path applies —
the object is created, `error` fires, nothing is shown. That is exactly what a
browser does for a site the user has not granted, and it is the branch every
well-written page already handles. **15 → 37/42.**

**#802 — "Illegal constructor"**, the cap named in Scroll 501. `new
DocumentType()`, `new NamedNodeMap()`, `new NodeList()`, `new TreeWalker()`,
`new Attr()`, `new CDATASection()`, `new XMLDocument()` and `new DOMTokenList()`
all succeeded and handed back a half-built object with no name, no document and
no place in any tree — which then fails somewhere far away from the line that
made it. One shared counter opens the door for exactly the constructions the
engine asks for (`_internalCtor`), and eighteen internal call sites go through
it.

---

## IX. Results

| file | campaign baseline | after 501 | **after 502** |
|---|---|---|---|
| `dom/idlharness.window.html` (both variants) | 1173/1977 | 1891 | **1898/1977** |
| `dom/idlharness.any.worker.html` | 149/219 | 217 | **217/219** |
| `html/dom/idlharness…?include=HTML.+` | 2773/3898 | 3605 | **3871/3898** |
| `html/dom/idlharness…?include=(Document\|Window)` | 155/298 | 185 | **244/298** |
| `IndexedDB/idlharness.any.html` | 102/207 | 182 | **204/207** |
| `resource-timing/idlharness.any.html` | 15/79 | 19 | **65/79** |
| `performance-timeline/idlharness.any.html` | 35/58 | 46 | **56/58** |
| `user-timing/idlharness.any.html` | 26/36 | 29 | **35/36** |
| `notifications/idlharness.https.any.html` | 14/42 | 15 | **37/42** |
| `url/idlharness.any.html` | 39/77 | 62 | **71/77** |
| `encoding/idlharness.any.html` | 31/57 | 38 | **41/57** |
| `websockets/idlharness.any.html` | 60/62 | 60 | **62/62** |
| `css/cssom-view/idlharness.html` | 416/417 | 416 | **417/417** |
| `FileAPI/idlharness.any.html` | 107/111 | 107 | **109/111** |
| **27 files, total** | **7735/10202** | 9518 | **9945/10202 (97.5%)** |

**Ritual: 392 rows, zero regressions.**

---

## X. ⛔ Caps

- **No media decoder.** Everything in §II is the IDL surface and the truthful "nothing loaded" state. `play()` does not play.
- **No notification platform** (§VIII) — permission stays `"default"` on purpose.
- **`showPicker()` throws `NotAllowedError`** rather than silently doing nothing: there is no UA chrome to open, and a page waiting on a picker that will never appear is worse than one that catches.
- **`window` / `Window.prototype` are not immutable-prototype exotic objects** — `Object.setPrototypeOf(window, …)` should fail and does not (4 subtests). Making them non-extensible would fix it and would also stop a page ever adding a global.
- **`document.all` is not an `HTMLAllCollection` instance** and has no `[[IsHTMLDDA]]` falsiness (3 subtests).
- Carried from 501: `XSLTProcessor` absent; `NodeList extends Array`.

---

## XI. Next

1. ⭐⭐⭐ **The carried three** — Range geometry, float layout, the frame's media context (all named precisely in Scroll 500 §Caps, none claimed in three arcs).
2. ⭐⭐ **`encoding/idlharness` 41/57** and **`resource-timing` 65/79** — what is left in both is real members, not shape.
3. ⭐⭐ **`html/dom/idlharness` 4,115/4,196** — 81 left, mostly `HTMLElement` popover/`inert` operations and the two exotic-object caps above.
4. ⭐⭐ **The `.any.worker.html` variants of the realms this arc moved** — the sweep runs in a worker realm too, and nobody has measured what it did there beyond `dom`.
