# ⚔️ Quest #502 — The Sounded Verdict

> *`webaudio` — the largest untouched realm on the platform. It did not fail.
> It **answered**, and answered wrong.*

**Realm:** `webaudio` (the graph & the IDL surface)
**Scroll:** 103 · **Arc:** #502–#504 · **Date:** 2026-08-07
**Branch:** `engine-per-page-threads`

---

## 1. Why this realm, and why now

The standing order (2026-08-02) says: **prioritise the untouched realms.** After
the last arc the survey named `webaudio` as *the biggest untouched realm left* —
**5,763 subtests across 333 files, Chrome at 99%+, and not one row in the
ledger.** Nothing else on the map is close.

It is also the right realm for the people we build for:

- **Web Audio is how a page makes sound without shipping audio.** A language
  lesson that synthesises its own tones, a metronome, a game's soundtrack, a
  screen reader's earcons — *kilobytes of code instead of megabytes of MP3.* On
  a metered connection that difference is the whole difference between a page
  that loads and one that does not.
- **`OfflineAudioContext` is the cheap path.** It renders faster than real time
  on the CPU we already have: no audio device, no driver, no latency budget, no
  dedicated hardware. It is precisely the kind of capability a modest machine
  *can* deliver, which is why it is worth delivering properly.
- An agent driving this browser is regularly handed a page that builds a graph
  on load. **A graph that silently does nothing is a page that silently does
  nothing.**

---

## 2. The gap — the costume, not the API

`webaudio` was not missing. It was **wearing a costume**. What stood here was a
fingerprinting stub: about two dozen object literals shaped like Web Audio so
that a script asking `createDynamicsCompressor().threshold.value` got a
plausible number back.

```js
createGain() { return {gain:{value:1,setValueAtTime(){}},connect(){},disconnect(){}}; }
createBufferSource() { return {buffer:null,connect(){},start(){},stop(){},disconnect(){},loop:false}; }
startRendering() { return Promise.resolve(this.createBuffer(2,this.length,44100)); }
```

A gain you could set and that nothing read. A connection to nowhere. A render
that resolved with silence.

**This is the campaign's most dangerous failure mode, and this was the largest
instance of it we have found.** A realm that throws is *visible* — the tell is
loud, and Quest #499 found `domxpath` in one probe. A realm that ANSWERS is
invisible: the page asks "is Web Audio available?", is told yes, builds its
graph, calls `start()`, and has **no way whatsoever to discover** that nothing
happened. 5,763 subtests, and 64 of them passed.

> **⭐⭐ A realm that answers wrong is worse than a realm that is missing.
> Feature detection cannot see it, error handling cannot catch it, and the page
> has no path to a fallback.**

---

## 3. The work

A real Web Audio implementation, ~1,600 lines, structured in two layers:

- **`// ===== WEBAUDIO-DSP-BEGIN/END =====`** — the pure kernel: buses, the
  channel up/down-mixing tables, the oscillator waveforms, the shaping curve.
  Marker-delimited so it can be sliced into Node the way `xpath_offline_test.mjs`
  slices the XPath engine.
- **The IDL layer** — every interface in `webaudio.idl`: `BaseAudioContext`,
  `AudioContext`, `OfflineAudioContext`, `AudioNode`, `AudioParam`,
  `AudioBuffer`, `AudioListener`, `PeriodicWave`, `AudioParamMap`, `Worklet`,
  `AudioWorklet`, `AudioWorkletNode`, `AudioWorkletProcessor`, the two events,
  and all twenty node classes.

### The findings

**⭐⭐ An enumeration ARGUMENT throws; an enumeration ATTRIBUTE is silently
ignored.** WebIDL §3.7.10: an attribute setter given an invalid enum value
*returns* and keeps the old value. So `new PannerNode(c, {channelCountMode:
'foobar'})` is a `TypeError` while `node.channelCountMode = 'foobar'` is a
**no-op** — the same string, two different behaviours, decided purely by where
it appears. A hand-written binding almost always makes both throw. Six
attributes here (`channelCountMode`, `channelInterpretation`, `type` ×2,
`panningModel`, `distanceModel`, `oversample`, `automationRate`).

**⭐⭐ Accessor `name` is `'get x'` / `'set x'`, and idlharness checks every
one.** Unnamed getters alone were **≈110 subtests** — and because a
`must be primary interface of` test re-runs every member against a live object,
each unnamed accessor failed *twice*.

**⭐⭐ A Promise-returning operation REJECTS; it does not throw.** WebIDL turns
any exception out of `resume()`/`suspend()`/`close()`/`startRendering()`/
`addModule()`/`decodeAudioData()` into a rejection. A caller who wrote
`ctx.resume().catch(…)` and got a synchronous throw has no handler in the right
place and the error escapes to the top.

**⭐ Every operation brand-checks its receiver *before* its arguments.** Called
on the wrong object it must say "this is not one of mine", not whatever
confusing error argument validation happens to reach first —
`createBuffer.call(null, 7, 7, 7)` was reporting *"sample rate 7 is outside the
range"*.

**⭐ Rounding position is load-bearing.** `BiquadFilterNode.gain.maxValue` is
`40 · log10f(FLT_MAX)` — the **inner** log10 is single-precision, so the
`Math.fround` goes *inside*. `Math.fround(40 * Math.log10(MAX))` gives
`1541.2735595703125`; the spec's value is `1541.273681640625`. One rounding step
in the wrong place is a whole subtest.

**⭐ `getFrequencyResponse` outside `[0, nyquist]` is `NaN`, not a clamp.** A
clamped answer draws a confident curve past the end of an axis the filter never
had.

**⭐ Neither `copyFromChannel` nor `copyToChannel` carries `[AllowShared]`** — a
`SharedArrayBuffer`-backed view is a `TypeError`, because another agent could
rewrite it halfway through the copy.

**⭐ `OscillatorOptions.periodicWave` is NOT nullable** (unlike the `buffer`
members on `AudioBufferSourceNode`/`ConvolverNode`, which are). A member that is
*present but null* is a `TypeError`, not a skip.

**⭐ The destination has ONE output, not zero** — leaving it unconnected is
normal, but reporting 0 makes it look like a dead end. And its channel-count
errors split by *which* bound broke: below 1 is `NotSupportedError` (cannot
exist), above `maxChannelCount` is `IndexSizeError` (out of the device's range).

**⭐ Validate every argument before touching state.** `start(0, 0, -1)` must be
a `RangeError` **and leave the node unstarted** — otherwise the failed call
consumes the one `start()` a source is allowed, and the *next* call reports
`InvalidStateError` instead of the real problem.

**⭐ The `AudioWorklet` is real.** `addModule()` fetches the module and
evaluates it in a closure supplying exactly the `AudioWorkletGlobalScope`
bindings (`registerProcessor`, `AudioWorkletProcessor`, `sampleRate`,
`currentTime`, `currentFrame`, `renderQuantumSize`), so
`class X extends AudioWorkletProcessor` means what it means in a real worklet —
and a processor reaching for `document` gets the same `ReferenceError` it would
get in one. `AudioParamMap` is backed by a real `Map` so the maplike surface,
its iteration order, and `[Symbol.iterator] === entries` all come out right.

**⚠️ The anti-fingerprinting jitter had to move.** `createDynamicsCompressor()`
returned `threshold: -24 ± 2` from the per-profile fingerprint seed — but
`-24` is *specified*, and WPT asserts it exactly. **A declared parameter is the
wrong place to hide.** The parameters are now spec-exact; the analyser's
synthetic spectrum (which describes audio we genuinely do not have) is
unchanged.

---

## 4. Results

Measured with `scripts/wpt_batch.sh scripts/wpt-webaudio-probe.txt … 2 45`
against a `--features render` server. **Baseline = the stub**, measured on a
`git stash`ed build of the same tree, so the two columns are the same 49 files
run the same way.

| Test | Stub | After the arc |
|---|---|---|
| `idlharness.https.window.html` | **49/1163** | **1162/1163** |
| `the-audioparam-interface/audioparam-nominal-range.html` | 48/74 | **327/327** |
| `the-pannernode-interface/ctor-panner.html` | 15/22 | **125/125** |
| `the-analysernode-interface/ctor-analyser.html` | 18/38 | **78/78** |
| `the-audiobuffer-interface/ctor-audiobuffer.html` | 14/35 | **62/62** |
| `the-audiobuffer-interface/audiobuffer-copy-channel.html` | 12/16 | **62/62** |
| `the-oscillatornode-interface/ctor-oscillator.html` | 15/22 | **62/62** |
| `the-waveshapernode-interface/ctor-waveshaper.html` | 15/22 | **54/54** |
| `the-delaynode-interface/ctor-delay.html` | 15/22 | **53/53** |
| `the-stereopanner-interface/ctor-stereopanner.html` | 15/22 | **51/51** |
| `…/ctor-audiobuffersource.html` | 15/22 | **44/44** |
| `the-offlineaudiocontext-interface/ctor-offlineaudiocontext.html` | 15/44 | **44/44** |
| `…/audioparam-exceptional-values.html` | 43/66 | **66/66** |
| `the-audiocontext-interface/audiocontextoptions.html` | 29/41 | **41/41** |
| `the-biquadfilternode-interface/biquad-getFrequencyResponse.html` | 12/21 | **90/90** |
| `the-iirfilternode-interface/iirfilter-basic.html` | 18/32 | **43/43** |
| the remaining `ctor-*` files (`gain`, `biquad`, `merger`, `splitter`, `constantsource`, `convolver`, `dynamicscompressor`, `iirfilter`) | 0–13 / 4–16 | **all 100%** |

Everything above was green after **#502 alone**, except `ctor-audiobuffer`
(57/62 until the renderer arrived).

**`idlharness` at 1162/1163 is TEN SUBTESTS AHEAD OF CHROME** (1152/1163 in the
run this arc was scoped from).

> **⚠️ Read the DENOMINATORS, not just the ratios.** `nominal-range` was
> "48/74"; it is 327/327 now. The extra 253 subtests did not appear because the
> test changed — they never *ran*. The audit runner aborts a task at its first
> thrown exception, so a stub that throws early looks like a small test file
> that mostly passes. **Across the 49-file probe the totals went 642/2096 →
> 3002/3021: nearly a thousand subtests existed all along and were never
> reached.** A percentage against a stub is not a percentage of the test.

---

## 5. Caps / Next

- **⛔ `idlharness` 1162/1163** — the last row is the `AudioWorkletGlobalScope`
  self-exposure check, which needs a genuinely separate realm.
- **⛔ No audio decoder.** `decodeAudioData()` **rejects** with an
  `EncodingError` rather than resolving with silence. That is deliberate: a
  promise that resolves with a buffer of zeros is the same lie the stub told,
  and a page cannot tell it from a genuinely silent file. Rejecting is a
  condition the page can *handle*.
- **⛔ No real-time audio device.** An `AudioContext` starts `suspended` and
  never pulls; `ScriptProcessorNode` never fires `audioprocess`.
- **Next in this arc:** [`104-the-rendered-verdict.md`](104-the-rendered-verdict.md)
  makes `startRendering()` render, and
  [`105-the-automated-verdict.md`](105-the-automated-verdict.md) makes an
  `AudioParam` a function of time.
