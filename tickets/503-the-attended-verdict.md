# 📜 Scroll 503 — The Attended Verdict

> **Quests #803–#840 · 2026-09-13 · branch `engine-per-page-threads`**
>
> Scroll 501 taught the engine what an interface *is*; scroll 502 gave the
> interfaces their members. This one went looking for the interfaces that were
> not there **at all** — and found that the browser could not answer a single
> question about the device it was running on.
>
> `navigator.geolocation` was `undefined`. `navigator.connection` was an object
> literal. `document.fonts.add(face)` did nothing and then told you the face was
> not there. `scheduler.postTask` did not exist, so a page had no way to say that
> one piece of work mattered less than another. `screen.orientation` was not an
> `EventTarget`. `VTTCue` had no base class to inherit from, so a page could not
> put a caption on a video it rendered itself. And a customized built-in element —
> `<button is="fancy-button">`, the way you enhance an element the browser already
> knows — threw `Illegal constructor` on every tag in HTML.

---

## How the region was chosen

By measuring **every `idlharness` file on the platform**: 174 files, one per realm,
generated from Chrome's own run summary so every path is guaranteed valid. Cold
baseline: **11,778 / 15,818 (74.5%)**, all but one runnable. After this arc:
**12,773 / 15,818 (80.7%)** — **+995, 32 files up, 0 files down.**

That list *is* the survey. The previous arc had taken 27 of those files to 97.5%;
these numbers say what the other 147 look like, and they are not a tail — they are
several dozen APIs that simply do not exist here. This scroll works the winnable
ones from the top of that list, and says plainly which ones it left alone and why.

**A rule applied throughout, and worth writing down:** an interface is exposed only
when exposing it is HONEST. `navigator.geolocation` belongs here because every
browser has it and every page's `getCurrentPosition` already handles failure — the
contract is "detect, then call, and the call may legitimately fail". `EyeDropper`
and `IdleDetector` do **not** belong here, because for those, detection *means* it
will work, and a permanently-failing stub would send a page down a path that cannot
succeed. A missing API is caught by one line of feature detection; a lying one is
caught by nobody. (Same find as scroll 502's canvas note, from the other side.)

---

## I. ⭐⭐⭐ Quest #803 — a page could not say what mattered less

```js
scheduler.postTask(() => renderChart(), {priority: 'background'});
// ReferenceError: scheduler is not defined
```

`scheduler`, `TaskController`, `TaskSignal` and `TaskPriorityChangeEvent` were
absent, so every one of the realm's 27 files died on its first line — **0 / 71.**

The Prioritized Task Scheduling API is not a micro-optimisation for fast machines.
It is the opposite: on a machine with headroom you never notice the difference,
and on a hand-me-down laptop it is the difference between a tap that responds and
a tap that does not, because the background work yields and the handler goes
first. A page that has no way to express priority dumps everything into one
`setTimeout(0)` pile and the pile is served in the order it was written.

The whole model is one sorted list ranked by `(priority, enqueue sequence)` at
**pick time**, not three queues — because a signal's priority can change *after*
its tasks are queued, and the spec keeps the original enqueue order when they
move. One task per event-loop turn, which is what makes a posted task a real task
and not a microtask.

Two details that are easy to get wrong and that WPT checks precisely:

- **A task that aborts its own signal from inside its callback must still reject**,
  but a task whose *async* continuation aborts the signal later must **resolve** —
  so the abort algorithm comes off the signal the moment the callback returns,
  before the returned promise settles.
- **`setPriority()` called from a `prioritychange` listener is a `NotAllowedError`**,
  not an infinite loop.

**Result: `scheduler/` 0 → 70 / 71 over 27 files.**
⛔ The one that is left (`post-task-then-detach`) needs a task posted through
`iframe.contentWindow.scheduler` to die when the frame is removed. This engine runs
every frame in one realm, so the frame's scheduler is the page's scheduler; that is
the iframe-realm cap this campaign has carried for a long time, not a scheduler bug.

## II. ⭐⭐⭐ Quests #804–#805 — abort events fired in the wrong order, untrusted

Implementing `TaskSignal.any()` turned up two bugs in `AbortSignal` that had been
there all along.

**(1) Composite signals fired depth-first.** `AbortSignal.any()` propagated by
adding an `abort` *listener* to each source. DOM §3.2 does something quite
different: a composite signal registers itself in the source's **dependent signals**
list, and when the source aborts it marks **every dependent aborted first**, then
fires the events — source, then dependents in creation order. Worse, `any([composite])`
must **flatten** through to the composite's own sources, so all dependents hang off
the original signal and never off each other. Ours produced `41230` where the spec
says `01234`, and a signal built from another composite jumped the queue.

**(2) The `abort` event was not trusted.** `_fireAbort` called `this.dispatchEvent(ev)`
— the PUBLIC entry point, whose first step is to clear the trusted flag. So every
UA-fired abort arrived at the listener claiming a script had made it.

Both fixed: `dom/abort/` **29 → 32 / 32** across four files (window and worker), and
the scheduler's own `TaskSignal.any` files went to 27/27 and 11/11.

## III. ⭐⭐⭐ Quest #806 — `<button is="fancy-button">` did not exist

```js
customElements.define('fancy-button', class extends HTMLButtonElement {}, {extends: 'button'});
new FancyButton()                                   // TypeError: Illegal constructor
document.createElement('button', {is: 'fancy-button'})  // a plain <button>
```

`custom-elements/builtin-coverage.html` was **111 / 444**. Customized built-ins had
been written off in a comment: *"in our shared-constructor model, we cannot be, so
it always throws"*. That turned out not to be true. `class MyLink extends
HTMLAnchorElement {}` reaches the shared `HTMLElement` constructor through the
implicit `super()` chain with `new.target` set to the page's class — so the engine
can answer HTML §4.13.5 step 6's actual question (*does the class extend the
interface this local name uses?*) by walking `new.target`'s prototype chain.

This matters beyond the subtest count. `is=` is how a page enhances an element the
browser **already knows**: a `<button>` that stays a button for the form, for the
keyboard, and for the accessibility tree, with behaviour added. The alternative —
an autonomous element that reimplements `<button>` from a `<div>` — is the single
most common source of pages that cannot be operated without a mouse.

Four pieces: the constructor path; `createElement(tag, {is})`; the parser/upgrade
path (the `is` content attribute *and* the internal is value, which is not the
same thing); and `cloneNode`, which must carry the is value so a customized
element clones as itself.

**`builtin-coverage` 111 → 444 / 444.** Realm: **2,949 → 3,520 / 4,267**, 33 files up.

⚠️ **The sweep caught a regression in my own work**: `<my-thing is="other-thing">`
is a `my-thing`. HTML's "look up a custom element definition" asks for the
**autonomous** definition first and ignores `is` on an element whose own name is
already a custom element name. Checking `is` first cost `parser-constructs-custom-
elements-with-is.html` its 2/2. Fixed in-session; the file is back at 2/2.

## IV. ⭐⭐ Quests #807–#808 — a constructor that returned a plain object

```js
class Bad extends HTMLElement { constructor() { return {foo: 'bar'}; } }
customElements.define('bad-element', Bad);
document.createElement('bad-element');   // returned {foo: 'bar'}. No error. Nothing logged.
```

`_ceConstruct` returned whatever `Reflect.construct` produced. HTML's "create an
element" checks that the constructor handed back **this** element — an empty,
parentless, same-document HTML element with the right local name — and on any
failure **reports** the exception (to `window.onerror`, as an uncaught error) and
returns a usable `HTMLUnknownElement` in the `failed` state. A non-element in the
tree that nobody was told about is worse than a thrown error.
**`Document-createElement.html` 12 → 35 / 36.**

Two smaller ones in `define()` itself: **IsConstructor must not read a single
property** of its argument (ours used `Reflect.construct(fn, [], f)`, which reads
`f.prototype` — so a proxy that threw on that read had its exception swallowed into
"not a constructor"), and `connectedMoveCallback` was missing from the lifecycle
callback list. **`CustomElementRegistry.html` 28 → 43 / 46.**

## V. ⭐⭐⭐ Quest #810 — there was no such thing as a sensor

`Sensor`, `Accelerometer`, `Gyroscope`, `Magnetometer`, `UncalibratedMagnetometer`,
`AmbientLightSensor`, `LinearAccelerationSensor`, `GravitySensor`,
`OrientationSensor`, `AbsoluteOrientationSensor`, `RelativeOrientationSensor`,
`SensorErrorEvent` — none of them existed, so six idlharness files sat at 2/38,
2/36, 2/36, 2/16, 2/29, 2/12.

⛔ **HONEST CAP, and it is the point of the design:** there is no sensor hardware
here. Every interface, attribute and event is real; the READINGS are not, and
rather than invent numbers, `start()` reports what a machine with no such sensor
reports — an `error` event carrying a `NotReadableError`. That is the same answer
Chrome gives on a desktop with no accelerometer, and it is an answer a page can act
on. A sensor that never activates has `activated === false`, `hasReading === false`,
a null `timestamp` and null readings, which is the truth.

**All six files: 10 → 167 / 167.**

⚠️ A shape rule worth repeating from 502: an interface object's `length` is its
**required** argument count. Every sensor constructor takes an optional options
dictionary, so declaring `constructor(options)` reported `length === 1` and told
every feature detector the dictionary was mandatory. They read `arguments[0]`.

## VI. ⭐⭐⭐ Quest #811 — `document.fonts` threw everything away

```js
document.fonts.add(new FontFace('Lato', 'url(/lato.woff2)'));
document.fonts.size            // 0
[...document.fonts]            // []
document.fonts.has(face)       // false
```

What stood at `document.fonts` was an object literal: `add(){}`, `has(){return false}`,
`get size(){return 0}`, an empty iterator. `FontFace` did not exist at all, nor
`FontFaceSet`, `FontFaceSetLoadEvent`, `FontFaceFeatures`, `FontFaceVariations`,
`FontFacePalette(s)` or `FontFaceVariationAxis`. **`idlharness` 15 / 143.**

The CSS Font Loading API is how a page knows when its text will stop being
invisible. Gating first paint on `document.fonts.ready` is the *polite* pattern on
a slow connection — show the text once, in the right font, instead of twice — and
it was waiting on `undefined`.

Built properly: every descriptor canonicalises or refuses (`face.width = 'invalid'`
throws `SyntaxError` and leaves the old value), `width` and `stretch` are two names
for **one** value, and the **CSS-connected** faces are real — every `@font-face`
rule in the document's stylesheets appears in `document.fonts` with its descriptors
filled in, because a page reading `[...document.fonts]` is asking what the document
*declares*, and "only the ones you added by script" is the wrong answer.

One subtlety worth recording: an invalid family name is not an error, it is a name
that must be **quoted**. `new FontFace('sans-serif', …).family` is `'"sans-serif"'`,
and that is what lets a page call a font `sans-serif` or `a 1` and still have it
work.

⚠️ The old stub had one piece of real behaviour that had to survive: `ready`/`load`
poll the RENDER path's in-flight font fetches so that a page measuring text after
`ready` is not handed a layout still using the fallback face. The new `FontFaceSet`
calls the same poll.

**Realm 95 → 189 / 226**; `idlharness` 15 → **138 / 143**.

## VII. ⭐⭐ Quests #812–#814 — the timeline

`PerformanceNavigationTiming`'s members were **own data properties on the entry**,
not readonly accessors on the interface prototype — so `'domComplete' in
PerformanceNavigationTiming.prototype` was false, which is how a page
feature-detects Navigation Timing 2 at all. Same for the legacy `PerformanceTiming`
(whose comment in this file claimed, wrongly, that its members "really are own data
properties"). `PerformanceNavigation`, `PerformanceTimingConfidence` and
`PerformanceServerTiming` did not exist; `performance.timing` and
`performance.navigation` were writable own properties rather than `[SameObject]`
readonly attributes. **45 → 155 / 161.**

Then the entry types a `PerformanceObserver` can actually name:
`PerformancePaintTiming`, `PerformanceLongTaskTiming`, `TaskAttributionTiming`,
`PerformanceEventTiming`, `EventCounts`, `LayoutShift`, `LayoutShiftAttribution`,
`LargestContentfulPaint`, plus `performance.eventCounts` / `interactionCount`.

⛔ **HONEST CAP:** the engine does not yet *measure* long tasks, layout shifts, event
latency or contentful paints, so no entries of these types are produced and the
"must be primary interface of <a real entry>" subtests stay red. What changes is
that a page observing `layout-shift` — which is how a site finds out it is janky on
a slow device, the exact device this browser exists for — gets an empty observation
instead of a `ReferenceError`.

And: **a performance entry has no constructor.** Only `PerformanceMark` does. An
entry a page can forge is an entry nothing can trust.

`event-timing` 8 → **34/34** and 8 → **32/32**; `paint-timing` 2 → 11/18;
`longtask-timing` 1 → 20/29; `layout-instability` 2 → 22/35; `largest-contentful-paint`
6 → 19/30; `server-timing` 65 → **83/97**; `resource-timing` 65 → **72/79**.

## VIII. ⭐⭐ Quests #815–#818 — the device

| what | before | after | the honest cap |
|---|---|---|---|
| `navigator.geolocation` | `undefined` | **66/68** | no position source: the error callback gets `POSITION_UNAVAILABLE`, which is what a device with no GPS and no network location reports |
| `navigator.wakeLock` | `undefined` | **40/42** | no screen to keep awake; the lock is real bookkeeping the page can hold, observe and release |
| `PressureObserver` | `undefined` | **31/32** | nothing samples CPU pressure, so `observe()` refuses — a fabricated "nominal" would tell a page it is safe to do more work on a machine that may be struggling |
| `DeviceOrientationEvent` / `DeviceMotionEvent` | `undefined` | **75/76** | not a phone; every reading is null and no event is ever fired, but the event interfaces are constructible and `window.ondeviceorientation` exists |

## IX. ⭐⭐ Quests #819–#828 — the rest of the declared surface

- **WebVTT** — `TextTrackCue` did not exist, so `VTTCue` had nothing to inherit from
  and `new VTTCue(0, 1, 'hello')` threw. A caption is not decoration: it is how a
  deaf viewer reads a video, and how anyone watching without sound follows it.
  `webvtt/api/idlharness` **2 → 56 / 56**.
- **Cookie Store API** — the asynchronous replacement for the `document.cookie`
  string, with real cookies underneath (`cookieStore.set()` really sets one).
  **18 → 68 / 84**; the rest is the ServiceWorker half.
  ⛔ `change` events only fire for writes made through this API — a cookie changed
  by the SERVER is not observed.
- **Gamepad** — `Gamepad`, `GamepadButton`, `GamepadHapticActuator`, `GamepadEvent`,
  `navigator.getGamepads()`, the two window handlers. **34 → 79 / 85.**
  ⛔ No gamepad is attached and none can be; `getGamepads()` is empty forever.
- **Media Session** — the metadata a page gives the system for the lock screen and
  the hardware keys. The record is exactly as real as the page makes it and the
  action handlers are stored and callable. **14 → 69 / 70.**
- **Observable / Subscriber** — a push stream with a teardown that actually runs
  (in reverse registration order, innermost resource first), and an `error` nobody
  is listening for is **reported**, not swallowed. **2 → 33 / 36.** The reason this
  belongs in a browser rather than in every page's bundle: a page that ships its own
  reactive library pays for it in bytes on a metered connection, every visit.
- **Screen Orientation** — `screen.orientation` was an object literal with empty
  `addEventListener`. It is now a real `ScreenOrientation : EventTarget` whose
  `type` follows the actual viewport. **4 → 25 / 25.**
- ⭐ **Network Information** — *the most on-mission object on the platform.*
  `navigator.connection.saveData` is how a page is TOLD the reader is paying by the
  megabyte, and `effectiveType` is how it learns to skip the hero video. It was an
  object literal on `navigator`: not an interface, not an `EventTarget`, invisible
  to `'connection' in Navigator.prototype`, impossible to listen to.
  `netinfo` **17 → 39 / 39**, `savedata` 3 → **5 / 5**.
- **Reporting API** — `ReportingObserver` / `Report` / `ReportBody`. **2 → 10 / 11.**
  ⛔ Nothing generates reports yet, so an observer sees an empty list.
- **`document.fragmentDirective`** — `scroll-to-text-fragment` 11 → **21 / 21**.

## X. ⭐⭐ Quests #829–#840 — the second pass over the same map

With the survey in hand, a second pass took the rows where **Chrome itself passes**
(the honest definition of "winnable") and the exposure is defensible:

- **Credential Management** — `navigator.credentials` was `undefined`. It stores
  nothing here, so `get()` resolves **null** — "there is nobody saved", the branch
  every sign-in flow already takes — but the RECORDS are real: a `PasswordCredential`
  built from a `<form>` holds what the form held. **31 → 96 / 96.**
  ⚠️ `PasswordCredentialData.origin` is declared `required` in the IDL and no
  shipping engine enforces it — WPT's own setup omits it. Enforcing it would have
  meant an interface that exists and that nobody can construct.
- **Push API** — `PushManager`, `PushSubscription`, `PushSubscriptionOptions`, and
  `pushManager` on both the Window and the service worker registration.
  **18 → 56 / 59.** ⛔ No push service: `subscribe()` rejects with `NotAllowedError`,
  which is what a real browser answers without permission.
- **`TextDecoderStream` / `TextEncoderStream`** — decoding a response as it
  **arrives** instead of after it has all landed. On a slow connection that is the
  difference between a first paragraph in one second and nothing for ten, and it is
  the only way to decode a stream larger than the device's memory at all. Built on
  the engine's own `TransformStream`, so the backpressure is the real thing, and the
  encoder HOLDS a lone high surrogate split across two chunks instead of emitting
  two replacement characters. `encoding/idlharness` **41 → 57 / 57**, and three
  `encoding/streams` files came alive with it.
- **`ScrollTimeline` / `ViewTimeline`** — scroll-driven animations.
  `scroll-animations/scroll-timelines/idlharness` **8 → 29 / 29**. The reason this
  belongs in the engine and not in a page's scroll handler: a scroll handler runs
  script on every frame, and on a slow device that *is* the jank.
  ⛔ `currentTime` is not yet driven from the scrolling box (an inactive timeline).
- **`Element.part`** — the names a shadow host exposes to the outside stylesheet
  through `::part()`. A live `DOMTokenList` exactly like `classList`; it was missing,
  so a component could not name its own internals. `css/css-shadow/idlharness`
  **8 → 12 / 12.**
- **`NavigationPreloadManager`** + `registration.navigationPreload` / `.pushManager`
  / `.cookies`. `service-workers/idlharness` **143 → 155 / 175.**
- **Storage Access API** — `document.hasStorageAccess()` / `requestStorageAccess()`.
  A same-origin document always has access to its own storage, so the honest answers
  are `true` and a resolved promise; the point is that a framed document can ASK.
  **8 → 10 / 12.**

⛔ **Deliberately left**: `html/semantics/menu` (four Chrome-only tentative elements
that would not render), the `web-animations` group-effect interfaces (Chrome does not
ship them either — 174/230 on its own run), and `XSLTProcessor` (28 subtests in
`dom/idlharness`; exposing it without an XSLT engine is the lie the honesty rule
above is about).

⚠️ **A cap this arc did NOT touch, on purpose:** the `ontouchstart` handler
attributes are still absent, and `touch-events/idlharness` stays at 91/128. A
previous knight wrote the reason down in the file — `'ontouchstart' in window` is
how half the web decides it is talking to a touchscreen, and this browser is driven
by a synthetic pointer, not a finger. That is a decision, not a gap.

---

## Results

| file | before | after |
|---|---:|---:|
| **the 174-file idlharness sweep** | **11,778 / 15,818 (74.5%)** | **12,773 / 15,818 (80.7%)** — +995, **32 files up, 0 down** |
| `scheduler/` (27 files) | 0 / 71 | **70 / 71** |
| `custom-elements/` (170 files) | 2,949 / 4,267 | **3,520 / 4,267** |
| `custom-elements/builtin-coverage.html` | 111 / 444 | **444 / 444** |
| `custom-elements/Document-createElement.html` | 12 / 36 | **35 / 36** |
| `custom-elements/CustomElementRegistry.html` | 28 / 46 | **43 / 46** |
| `dom/abort/` (4 files) | 29 / 32 | **32 / 32** |
| the six sensor idlharness files | 10 / 167 | **167 / 167** |
| `css/css-font-loading/` (9 files) | 95 / 226 | **189 / 226** |
| `navigation-timing/idlharness` | 45 / 161 | **155 / 161** |
| `event-timing/idlharness` (window + any) | 16 / 66 | **66 / 66** |
| `geolocation/idlharness` | 13 / 68 | **66 / 68** |
| `screen-wake-lock/idlharness` | 12 / 42 | **40 / 42** |
| `compute-pressure/idlharness` | 1 / 32 | **31 / 32** |
| `orientation-event/idlharness` | 15 / 76 | **75 / 76** |
| `webvtt/api/idlharness` | 2 / 56 | **56 / 56** |
| `cookiestore/idlharness` | 18 / 84 | **68 / 84** |
| `gamepad/idlharness` | 34 / 85 | **79 / 85** |
| `mediasession/idlharness` | 14 / 70 | **69 / 70** |
| `server-timing/idlharness` | 65 / 97 | **83 / 97** |
| `resource-timing/idlharness` | 65 / 79 | **72 / 79** |
| `netinfo/idlharness` | 17 / 39 | **39 / 39** |
| `screen-orientation/idlharness` | 4 / 25 | **25 / 25** |
| `scroll-to-text-fragment/idlharness` | 11 / 21 | **21 / 21** |
| `reporting/idlharness` | 2 / 11 | **10 / 11** |
| `dom/observable/tentative/idlharness` | 2 / 36 | **33 / 36** |
| `paint-timing/idlharness` | 2 / 18 | **11 / 18** |
| `longtask-timing/idlharness` | 1 / 29 | **20 / 29** |
| `layout-instability/idlharness` | 2 / 35 | **22 / 35** |
| `largest-contentful-paint/idlharness` | 6 / 30 | **19 / 30** |
| `savedata/idlharness` | 3 / 5 | **5 / 5** |
| `credential-management/idlharness` | 31 / 96 | **96 / 96** |
| `push-api/idlharness` | 18 / 59 | **56 / 59** |
| `encoding/idlharness.any` | 41 / 57 | **57 / 57** |
| `scroll-animations/scroll-timelines/idlharness` | 8 / 29 | **29 / 29** |
| `css/css-shadow/idlharness` | 8 / 12 | **12 / 12** |
| `service-workers/idlharness` | 143 / 175 | **155 / 175** |
| `storage-access-api/idlharness` | 8 / 12 | **10 / 12** |
| `streams/idlharness.any` | 226 / 228 | **227 / 228** |

### The zero-regression ritual

**392 rows compared, before → after: 1 up, 390 equal, 0 regressions.**
Before `56,072 / 56,602`; after `56,124 / 56,602` (+52 — a bonus from
`the-img-element/naturalWidth-naturalHeight-width-height.html` **176 → 228 / 258**).

⚠️ One row read `78/78 → could-not-run`, and it is **not** a regression: it is the
documented server-degradation gotcha after ~390 CDP sessions in one run.
`css/css-conditional/container-queries/custom-property-style-queries.html` measures
**78/78 on a fresh server**, re-verified in-session.

---

## ⛔ Caps — named honestly, so nobody mistakes them for failures

1. **No sensor hardware, no position source, no CPU-pressure sampling, no screen.**
   Every one of those APIs is complete and every one of them refuses honestly. They
   will not go green without a device underneath.
2. **The timeline is not being RECORDED.** `LayoutShift`, `LargestContentfulPaint`,
   `PerformanceLongTaskTiming`, `PerformanceEventTiming` and `PerformancePaintTiming`
   exist as interfaces; nothing produces entries of those types yet, so every "must
   be primary interface of `<a real entry>`" subtest stays red. Recording them is a
   real, separable quest and the biggest remaining win in this family (~50 subtests).
3. **The worker realm.** `FontFace`/`FontFaceSet` are `Exposed=(Window,Worker)` and
   this engine hides them from workers, so `self.fonts` is undefined and
   `fontfaceset-load-css-wide-keywords.html` times out on its worker half (24 subtests).
4. **The iframe realm**, carried from four arcs: every frame runs in one realm, so
   `iframe.contentWindow.scheduler` and `iframe.contentWindow.AbortSignal` are the
   page's own. Costs `post-task-then-detach` and `abort-signal-timeout`'s detach row.
5. **Deliberately NOT exposed**, on the honesty rule above: `EyeDropper`,
   `IdleDetector`, `PictureInPictureWindow`, `Keyboard` (lock/map), the
   `shape-detection` interfaces, `webusb`/`webhid`/`serial`/`webmidi`/`bluetooth`.
   For all of those, successful feature detection *promises* the feature works.

## ➡️ Caps / Next

The 174-file idlharness sweep is the map now; re-run it, it is cheap and it is the
honest ordering. From the baseline, the biggest winnable blocks still open:

1. ⭐⭐⭐ **`css/css-anchor-position/idlharness` 2 / 86** — `CSSPositionTryRule` /
   `CSSPositionTryDescriptors`, which needs the `@position-try` at-rule in the CSS
   parser. Anchor positioning is how a tooltip stays attached to its button.
2. ⭐⭐⭐ **`credential-management` 31 / 96** and **`push-api` 18 / 59** — both are
   interfaces every browser exposes and whose operations may honestly fail.
3. ⭐⭐ **`css/css-parser-api` 5 / 71**, **`presentation-api` 16 / 103**,
   **`storage/buckets` 17 / 50**, **`html/semantics/menu` 12 / 51**, and the four
   `permission-element` files (~130 between them).
4. ⭐⭐ **Record the timeline** (cap 2 above) — it turns five existing interfaces
   from shapes into measurements, and it is the data a site needs to find out it is
   slow on the hardware we care about.
5. ⭐⭐ **The worker realm** (cap 3) — the `.any.worker.html` twin of everything this
   arc moved has not been measured.
6. ⭐⭐⭐ Still unclaimed after four arcs: **Range geometry**, **float layout**, and
   **the frame's media context** (named precisely in Scroll 500 §Caps).
