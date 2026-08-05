# 📜 The Handled Verdict — Quests #467–#468

> *Quest #466 gave an agent a way to know what it had grabbed. This is the pair
> of realms that describe the grabbing — and an event that page code can rewrite
> is not a record of anything.*

**Realms:** `uievents/*` and `pointerevents/*` (frontier quest **F4**, parts 2 and 3).
**Date:** 2026-08-05 · **Branch:** `engine-per-page-threads`

---

## The gap

The eight UI event interfaces existed. Every one of them stored its state as
**ordinary instance properties**:

```js
globalThis.MouseEvent = class MouseEvent extends UIEvent {
  constructor(t, o) {
    o = (o == null) ? {} : o; super(t, o);
    this.clientX = o.clientX ?? 0;      // an own, WRITABLE data property
    this.button  = o.button  ?? 0;
    /* … */
  }
};
```

That is wrong twice over. `idlharness` asserts each member is *"found in the
prototype chain"*, which an own property is not — but the part that matters off
the test suite is that **`event.clientX = 0` worked**. An event is a record of
what happened. Nothing that happened is a setting, and a handler that can rewrite
the coordinates of the click it was handed can lie to every handler after it in
the propagation path.

`PointerEvent` was six fields wide, with no tilt, no twist, no angles, no
coalesced or predicted events. There was **no pointer capture at all** — no
`setPointerCapture`, no `hasPointerCapture` — no `onpointerdown` and no `touch-action`.
`TextEvent` did not exist. `getModifierState('AltGraph')` read a field nothing set.

---

## The work — #467, `uievents`

All eight interfaces rebuilt as WebIDL-shaped classes over private backing fields,
through one helper (`_idlEventAttrs`) that stamps the five things an ES `class`
gets wrong:

| WebIDL requires | ES `class` gives |
|---|---|
| members are **enumerable prototype accessors** | own instance data properties |
| every member **brand-throws `TypeError`** on a foreign `this` | reads `undefined`, or the body's own error |
| `@@toStringTag` so `String(ev)` says what it is | `[object Object]` for all eight |
| constructor `length` = **required** args | reported 2 where the spec says 1 |
| operations enumerable too | class methods are non-enumerable |

Then the members that were simply missing: `UIEvent.which` (legacy — the mouse
button one-based, or a key's charCode/keyCode), `MouseEvent.layerX/layerY`,
`WheelEvent`'s `DOM_DELTA_*` constants, `KeyboardEvent`'s `DOM_KEY_LOCATION_*`,
`initMouseEvent` / `initKeyboardEvent` / `initCompositionEvent`,
`InputEvent.getTargetRanges()`, and the whole of **`TextEvent`** — which has no
constructor and exists only through `document.createEvent('TextEvent')`.

**`deltaMode` is the unit the wheel deltas are in.** A page that reads the numbers
without it scrolls three *pixels* where the user asked for three *lines*.

**`getModifierState()` reports modifiers `EventModifierInit` cannot set.** `Fn`,
`Hyper`, `Super`, `Symbol` are real modifier key values with no init member, so a
constructed event must answer **false** for them — not `undefined`. A page testing
`getModifierState('Fn')` gets an answer either way, and `undefined` is not one.

**`InputEvent.getTargetRanges()` returns `StaticRange`s** (built in #466) *on
purpose*: they are the ranges the edit is about to replace, and a live Range would
be moved by the very edit the handler is being warned about — by the time it
looked, it would be describing the aftermath rather than the target.

---

## The work — #468, `pointerevents`

**One event type for mouse, pen and touch**, which is the whole point: a page that
handles `pointerdown` works with a finger, a stylus and a mouse without three code
paths — and on a cheap tablet the finger is the only input there is.

- **The full `PointerEvent`**: `pointerId`, `width`, `height`, `pressure`,
  `tangentialPressure`, `tiltX`/`tiltY`, `twist`, `altitudeAngle`/`azimuthAngle`,
  `pointerType`, `isPrimary`, `persistentDeviceId`, `getCoalescedEvents()`,
  `getPredictedEvents()`.
- **🔍 A stylus reports its angle two ways, and an event must carry both.**
  `tiltX`/`tiltY` are degrees from vertical in two planes; `azimuthAngle`/
  `altitudeAngle` are a compass direction plus a height above the surface, in
  radians. Whichever pair the author did *not* supply is derived from the one they
  did — **but if they supplied one member of each pair, NEITHER is derived**,
  because a half-specified pen is not evidence about the other half. Both
  conversions have exact boundary cases (a pen lying flat, `|tilt| === 90`, gets
  `altitudeAngle` 0 and — when both planes are flat — `azimuthAngle` 0, not the
  45° the general formula would produce). `pointerevent_tiltX_tiltY_to_azimuth_altitude`
  0/25 → **24/25**.
- **Coalesced and predicted events.** Coalesced are the movements the UA merged
  into this one because it could not deliver them fast enough; predicted are where
  the pointer is expected to be next. A drawing app reads the first to avoid a
  jagged stroke and the second to hide input latency — **on slow hardware, which
  is exactly where the merging happens, that is the difference between a usable
  pen and an unusable one.**
- **Pointer capture** (`setPointerCapture` / `releasePointerCapture` /
  `hasPointerCapture`), with a real active-pointer set tracked at the one place
  every event passes through. Capture is what makes a drag work: once the finger
  is down on a slider thumb, sliding *off* the thumb must keep moving the thumb,
  because the user is still dragging. Without it a drag that leaves the element
  silently stops, which reads as a janky, broken control. Capture ends with the
  pointer, firing `lostpointercapture`.
- **The eleven pointer `GlobalEventHandlers`** (`onpointerdown` … `onlostpointercapture`).
  *A page that only listens for mouse events is a page a finger cannot use.*
  `pointerevent_on_event_handlers` 0/30 → **30/30**.
- **`touch-action`**, the CSS property by which a page says *"this area scrolls
  the map, not the page"*. Grammar:
  `auto | none | manipulation | [ [pan-x|pan-left|pan-right] || [pan-y|pan-up|pan-down] || pinch-zoom ]`
  — the pan groups mutually exclusive within themselves, components in any order,
  computed value in canonical order.
- **`navigator` is now a `Navigator`.** It was an object literal with no interface
  object at all, so `navigator instanceof Navigator` threw. `maxTouchPoints` moved
  to the prototype (an own property fails `assert_inherits`) — it answers *"is this
  a touch device, and how many fingers?"*, which is how a page decides whether to
  offer a drag handle at all.

### 🔍 The bug underneath, and it was not a pointer bug

Every non-body-reflecting **`Window` `on*` handler** — `onpointerdown`,
`ongotpointercapture` and the rest — was defined with `get() { return this[_slot]; }`.
Called the WebIDL way, with a `null`/`undefined` `this` (which for a `[Global]`
interface **resolves to the global**, it does not throw), that was a hard
`TypeError: Cannot read properties of undefined`. Every `getEventHandler()` shim
in the wild does exactly that. Fixed generically, plus the accessor-name stamping
(`get onpointerover`, not `get`) that WebIDL requires. **Ten subtests, and it had
nothing to do with pointers** — those handlers were simply the first ones anyone
had ever measured.

---

## Results

**Controlled before/after**, same 16-file probe, same server, the change stashed
and rebuilt for the baseline:

| | subtests |
|---|---|
| before | **157 / 512 (30.7%)** |
| after | **573 / 609 (94.1%)** |

*(Totals differ because files that used to die on their first line now report all
their subtests — `pointerevent_constructor.https` was "0/1", not "0/64".)*

| file | before | after | Chrome |
|---|---|---|---|
| `uievents/idlharness.window.html` | 54/163 | **163/163** | 163/163 |
| `pointerevents/idlharness.https.window.html` | 68/203 | **198/203** | 203/203 |
| `pointerevents/pointerevent_constructor.https.html` | 0/1 | **60/64** | 64/64 |
| `pointerevents/pointerevent_on_event_handlers.html` | 0/30 ⚠️ TIMEOUT | **30/30** | 30/30 |
| `pointerevents/pointerevent_tiltX_tiltY_to_azimuth_altitude.html` | 0/25 | **24/25** | 25/25 |
| `pointerevents/parsing/touch-action-{computed,valid}.html` | 0/6 each | **6/6** each | 6/6 |
| `pointerevents/pointerevent_touch-action-verification.html` | 15/37 | **19/37** | 37/37 |
| `uievents/constructors/event-getmodifierstate.html` | 10/16 | **16/16** | 16/16 |
| `uievents/legacy/Event-subclasses-init.html` | 0/4 | **4/4** | 4/4 |
| `uievents/textInput/api.html` | 1/9 | **6/9** ⚠️ TIMEOUT | 9/9 |

**Zero-regression sweep:** these changes rewrote every UI event interface and the
event dispatcher's `relatedTarget` retargeting, so the blast radius is the whole
platform. The 59-file ritual, run on the stashed build and the new one at
identical settings: output **byte-identical**, **12,906 / 13,011** both times.

---

## Caps, named honestly

**The whole input-driven half of both realms is one cap, and it is not an event
bug.** Files like `uievents/mouse/mouse_boundary_events_*` and
`pointerevents/pointerevent_attributes.html?*` drive real pointer input through
`test_driver.action_sequence` and then assert which element got `mouseover` and
which got `mouseout`. Answering needs **hit-testing against a real layout tree** —
where the boxes are, which one is on top, which one the pointer left. Obscura
synthesizes stable per-element rects instead, which is enough to *click a named
element* (what automation needs) and not enough to say which element a coordinate
is over. That is quest **F7** again, and it is by far the largest single thing
standing between this engine and the rest of the platform.

- **A measured warning about cost:** those files are also *slow* — a 38-file
  `uievents` sweep at a 60s timeout ran past 40 minutes without finishing, because
  nearly every file burns its whole timeout. Budget for that before sweeping them.
- **`pointerevent_constructor.html` (non-https) 32/35 is an INSTRUMENTATION cap,
  not a failure.** The three remaining rows assert `"getCoalescedEvents" in event
  === false`, which is true only on an **insecure** origin — `getCoalescedEvents`
  is `[SecureContext]`. `wpt_run.py` joins every path to `https://`, so the plain
  file is asked to prove something false. **This is the same scheme-pairing trap
  quest #465 found in `cookies`** (`__secure.document-cookie.html` read 3/12 over
  https and 12/12 over http with nothing changed). The `.https.html` sibling scores
  60/64 and is the one to trust.
- **`WheelEvent.momentum`** (1 subtest) — a newer `uievents` addition whose IDL
  type we did not confirm; left out rather than guessed.
- **`pointerevent_pointermove_in_pointerlock`** needs the Pointer Lock API.
- **`isSecureContext` does not exist as a global.** Worth adding on its own —
  several APIs are supposed to gate on it.

---

## ⭐ Next

1. **F7 — a layout/hit-testing model.** It is now the named cap in four separate
   realms (`selection`'s `modify`, `uievents`' mouse boundaries, `pointerevents`'
   attributes, and the entire CSS reftest blind spot). Nothing else on the board
   is blocking this much.
2. **Banked, unchanged:** the lenient HTTP response-header parse (58 `cookies`
   rows, and off-suite a failed fetch instead of a page); storage on disk;
   `Response.clone()` must tee; `FormData` cannot hold a `File`.
3. **Untouched realms per the standing order**, re-measured before choosing:
   `clipboard-apis` (26%), `webmessaging` (27%), `web-locks` (28%),
   `content-security-policy` (33%).
