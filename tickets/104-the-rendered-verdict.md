# ⚔️ Quest #503 — The Rendered Verdict

> *`startRendering()` resolved with a buffer of zeros. This is the quest that
> makes it mean something.*

**Realm:** `webaudio` (the offline render engine)
**Scroll:** 104 · **Arc:** #502–#504 · **Date:** 2026-08-07
**Branch:** `engine-per-page-threads`

---

## 1. The gap — and the trap in the baseline

Quest #502 built the graph: every node, every parameter, every exception, all
correct. And it was still a **diagram**. `startRendering()` walked nothing,
summed nothing, and resolved with a correctly-shaped silent buffer.

`audionode-channel-rules.html` is the densest file in the realm after
`idlharness` — it asks one question 178 different ways: *when a source of N
channels feeds a destination of M, what comes out of each speaker?* Its scores
across this arc are the most instructive three numbers we have measured:

| build | score |
|---|---|
| the original **stub** | **175/178** |
| after #502 (a real graph, still no renderer) | **6/178** |
| after #503 (the renderer) | **178/178** |

> **⭐⭐⭐ THE STUB SCORED 175/178 BY COMPARING SILENCE TO SILENCE.** The old
> `createBuffer()` returned `{getChannelData(c) { return new Float32Array(len); }}`
> — **a brand-new zero array on every call.** So the test wrote its source data
> into a buffer that was thrown away, read it back as zeros, computed an
> all-zero *expected* result from it, and compared that to an all-zero render.
> 175 assertions of `0 === 0`.
>
> Replacing it with a real graph made the score **drop by 169**, because the
> expected values finally became real while the output was still silent. **A
> score that falls when you make something correct is the strongest possible
> evidence that the number was never measuring the thing.**

This is the arc's thesis in one file, and it is worth carrying forward: when a
realm is backed by a stub, *both sides* of a comparison can come from the stub.
Read the denominators, and distrust a high score in a realm you know is fake.

---

## 2. The work

A real render loop, in the spec's fixed **128-frame render quanta**. The quantum
is not an implementation detail — it is *observable*: sources start on quantum
boundaries, k-rate parameters are sampled once per quantum, and WPT checks
output frame by frame at exactly those boundaries.

```
reverse the graph  →  topological order from the destination
  →  per quantum: gather each input (mix) → process each node
  →  the destination's input IS the rendered buffer
```

### The findings

**⭐⭐ Connections are stored FORWARD and rendering pulls BACKWARD.** `connect()`
is written source-to-destination because that is how a page thinks; the renderer
has to ask the opposite question — *what feeds THIS input* — so the graph is
reversed once per render. Two maps, because a connection can land on a **node
input** or on an **AudioParam**, and those are genuinely different edges.

**⭐⭐ Channel mixing is where a graph stops being a diagram and starts being
audio.** Spec §4 gives an exact table: a mono source into a stereo destination
lands in *both* speakers; a stereo source into 5.1 stays in the front pair
rather than smearing across the surrounds; 6→2 folds the centre and surrounds in
at `√½` so the total power is preserved — a naive sum would clip. Anything
without a defined layout falls back to **discrete** (channel *i* to channel *i*,
extras dropped), and that fallback is what keeps an odd channel count from
producing silence.

**⭐⭐ A connection to an AudioParam is SUMMED onto it, not substituted for it.**
That one word is what makes an LFO possible: an oscillator connected to a gain's
`gain` *offsets* the gain, so tremolo is two nodes rather than a `setInterval`.
A multi-channel input is down-mixed to mono first — a param is one value per
frame.

**⭐⭐ A cycle in the graph is legal, and the topological walk must not treat it
as an error.** A node already on the DFS stack is *skipped* rather than
followed: feedback in Web Audio is only legal through a `DelayNode`, and a delay
reads the previous quantum's samples anyway. Throwing (or hanging) here would
break every reverb-send a page has ever built.

**⭐⭐ `OfflineAudioContext.suspend()` had to become real.** It is the only way a
page can change the graph *part-way through a render* — which is the whole point
of an offline context, and what
`audionode-disconnect-audioparam.html` is built on. The render loop is now
`async`: at a suspend point it resolves the page's promise, `await`s the resume
gate, **and then re-reads the graph**, because being able to change it is the
only reason to stop. Suspension lands on a render-quantum boundary, since that
is the smallest thing the graph knows how to stop between.

**⭐ A pass-through beats a silence.** `AnalyserNode`, `DynamicsCompressorNode`,
the media-source nodes and `ScriptProcessorNode` have no real processing here.
They pass their input through **unchanged** rather than outputting zeros:
reporting no signal where a real engine reports a processed one is a much worse
lie than reporting an unprocessed one, and — because it is a *graph* — a
silencing node takes everything downstream of it with it.

**⭐ Node coverage.** Really rendered: `GainNode`, `DelayNode` (circular line,
fractional read), `OscillatorNode` (four waveforms + `PeriodicWave` Fourier
sum), `ConstantSourceNode`, `AudioBufferSourceNode` (resampling, looping,
offset/duration), `BiquadFilterNode` (the spec's Audio-EQ-Cookbook
coefficients — **the same function the drawn `getFrequencyResponse` uses, so the
picture and the sound cannot disagree**), `IIRFilterNode`, `WaveShaperNode`,
`StereoPannerNode`, `ChannelMergerNode`, `ChannelSplitterNode`, `ConvolverNode`
(direct convolution, power-normalised), `PannerNode` (equal-power + the three
distance models), and `AudioWorkletNode` — whose processor really is
instantiated and whose `process()` really is called per quantum.

---

## 3. Results

Baseline = the original stub, measured on a `git stash`ed build of the same tree.

| Test | Stub | After |
|---|---|---|
| `the-audionode-interface/audionode-channel-rules.html` | 175/178 *(see §1)* | **178/178** |
| `the-channelmergernode-interface/audiochannelmerger-basic.html` | 5/12 | **17/17** |
| `the-channelsplitternode-interface/audiochannelsplitter.html` | 0/2 | **2/2** |
| `the-delaynode-interface/delaynode.html` | 4/5 | **12/12** |
| `the-stereopanner-interface/stereopannernode-basic.html` | 4/5 | **15/15** |
| `…/audiobuffersource-basic.html` | 4/5 | **18/18** |
| `…/test-constantsourcenode.html` | 0/6 | **6/6** |
| `the-gainnode-interface/gain.html` | 0/1 | **1/1** |
| `the-waveshapernode-interface/waveshaper.html` | 0/1 | **1/1** |
| `the-audionode-interface/audionode.html` | 0/1 | **1/1** |
| `the-audionode-interface/audionode-connect-return-value.html` | 0/1 | **1/1** |
| `the-destinationnode-interface/destination.html` | 0/1 | **1/1** |
| `the-audiobuffer-interface/ctor-audiobuffer.html` | 14/35 | **62/62** |
| `…/audionode-disconnect-audioparam.html` | 6/12 | **15/21** |

---

## 4. Caps / Next

- **⛔ The oscillator waveforms are IDEAL, not band-limited.** A real engine
  builds a wavetable per octave to keep harmonics under Nyquist. Named in the
  code, not hidden. The `oscillator-*` reference tests compare against captured
  audio files and are out of reach either way.
- **⛔ `DynamicsCompressorNode` passes through** and reports `reduction: 0`. Its
  WPT tests compare against reference renders.
- **⛔ `PannerNode` is equal-power only** — `HRTF` needs an impulse-response
  database we do not ship, and would be a poor trade for a low-spec device.
- **⛔ `audionode-disconnect-audioparam` 15/21** — the remaining six check the
  exact frame index at which a disconnect takes effect.
- **Next:** [`105-the-automated-verdict.md`](105-the-automated-verdict.md) — an
  `AudioParam` is still a constant here.
