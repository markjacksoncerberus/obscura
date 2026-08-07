# ⚔️ Quest #504 — The Automated Verdict

> *An `AudioParam` is not a number. It is a function of time. This is that
> function.*

**Realm:** `webaudio` (the AudioParam automation timeline)
**Scroll:** 105 · **Arc:** #502–#504 · **Date:** 2026-08-07
**Branch:** `engine-per-page-threads`

---

## 1. The gap

After Quest #503 the graph rendered, and every `AudioParam` rendered a
**constant**. `setValueAtTime` stored an event nobody read. So
`event-insertion.html` sat at 44/67, `audioparam-cancel-and-hold.html` at
81/106, and every ramp test returned a flat line.

Five methods carry essentially every fade, envelope and crossfade on the web:

```js
gain.setValueAtTime(1, t0);
gain.linearRampToValueAtTime(0, t0 + 2);   // a two-second fade-out
```

**Doing this in the engine rather than on the page is not a nicety.** The
alternative is a `setInterval` writing `gain.value` a hundred times a second —
which on a hand-me-down laptop is *both* audibly steppy **and** the thing that
makes the whole tab stutter. The timeline is computed per sample by the engine,
for free, while the page's main thread does nothing at all. This is the exact
shape of "the cheap path is also the correct path" that this browser exists for.

---

## 2. The work

`_waValueAt(param, t)` — a forward walk over the sorted event list carrying
`(v, vt)`, *"the value, and the time it belongs to"*. Every event either
resolves the answer or advances the pair.

### The findings

**⭐⭐ A ramp is the only event type that reaches BACKWARDS.** Every other event
governs from its own time forward. A `linearRampToValueAtTime(V, T)` governs the
whole stretch *from the previous event up to T* — so when the walk meets a ramp
still in the future, that ramp is the answer for right now. Getting this wrong
gives you a value that jumps at `T` instead of arriving there, which is the
difference between a fade and a click.

**⭐⭐ An exponential ramp is a RATIO, so it cannot start at or cross zero.** No
number of multiplications gets you from 0 to anything. `exponentialRampToValueAtTime(0, …)`
is a `RangeError` at schedule time, and at *render* time a ramp starting from 0
(or crossing sign) holds the previous value rather than producing `NaN` — one
`NaN` in an audio buffer poisons everything downstream of it.

**⭐⭐ `param.value` reads the TIMELINE, not the stored number.** Once any
automation exists, the stored intrinsic value is no longer the answer to "what
is the gain now" — the getter evaluates the timeline at `currentTime`. This is
also how `audioparam-method-chaining` detects a *partially applied* chain: after
`.setValueAtTime(0.5, 0).exponentialRampToValueAtTime(0, 1)` throws, the
`setValueAtTime` must still be visible.

**⭐⭐ `cancelAndHoldAtTime` TRUNCATES the automation in flight; it does not
delete it.** The first attempt filtered the ramp out of the list — and the value
snapped back to where the envelope *started*. That is an audible click, and
avoiding exactly that click is the only reason this method exists. The fix keeps
the in-flight ramp **as a ramp that ends at the cancel point**, so the values
already on their way there are still the right ones, and truncates a
`setValueCurve` that straddles the cancel rather than dropping the shape it had
already drawn.

**⭐⭐ A curve OWNS its start instant but not its end — and the rule is
ASYMMETRIC.** This cost two measurement cycles:

- Adding a **new curve** at `T`: it conflicts with an existing event only
  *strictly* inside `(T, T+D)`. Both endpoints are free, because
  *end-to-start is how an automation chain is built* — `start-end` in
  `setValueCurve-exceptions.html` chains ramp → curve → ramp → curve → setValue
  → curve → setTarget, every one of them touching at a shared instant.
- Adding a **new non-curve event** at `T` against an existing curve `[Cs, Ce]`:
  it conflicts iff `Cs <= T < Ce`. The *start* is taken, the *end* is free.

Treating both as a closed interval rejects the most natural way to write an
envelope. Treating both as open lets `param.value = x` sneak in at the exact
instant a curve begins — which `setValueCurve-exceptions.html` checks by name.

**⭐ `param.value = x` is itself an automation event at the current time**, so it
collides with a running `setValueCurve` exactly as any other event does.

**⭐ A ramp after a `setTarget` starts from the setTarget's OWN start value and
time** (spec §1.6.3), not from wherever the exponential approach had got to.

**⭐ k-rate is sampled once per quantum and held.** Not an optimisation — a page
automating a compressor threshold can hear the difference, and
`k-rate-constant-source.html` measures it in 40 places.

---

## 3. Results

Baseline = the original stub, measured on a `git stash`ed build of the same tree.
Where a stub denominator is small, the extra subtests were never *reached* — the
audit runner aborts a task at its first thrown exception.

| Test | Stub | After |
|---|---|---|
| `the-audioparam-interface/event-insertion.html` | 9/15 | **67/67** |
| `…/audioparam-setValueCurve-exceptions.html` | 21/62 | **66/66** |
| `…/audioparam-cancel-and-hold.html` | 20/37 | **94/106** |
| `…/k-rate-constant-source.html` | 6/9 | **40/40** |
| `…/k-rate-gain.html` | 4/5 | **14/14** |
| `…/audioparam-setValueAtTime.html` | 2/4 | **6/6** |
| `…/audioparam-linearRampToValueAtTime.html` | 4/5 | **6/6** |
| `…/audioparam-exponentialRampToValueAtTime.html` | 4/5 | **6/6** |
| `…/audioparam-setTargetAtTime.html` | 4/5 | **6/6** |
| `…/audioparam-setValueCurveAtTime.html` | 0/1 | **1/1** |
| `…/audioparam-method-chaining.html` | 0/3 | **3/3** |
| `…/cancel-scheduled-values.html` | 0/2 | **2/2** |
| `…/audioparam-nominal-range.html` | 48/74 | **327/327** |

Within this quest alone (renderer present, timeline added), `event-insertion`
went **44/67 → 67/67** and `cancel-and-hold` **81/106 → 94/106**.

### The arc

| | Stub | After #502–#504 |
|---|---|---|
| **49-file `webaudio` probe** | **642/2096** | **3002/3021** |

`scripts/wpt_batch_diff.py` over the two: **49 files improved, 0 regressed, 0
could-not-run on either side.**

---

## 4. Caps / Next

- **⛔ `audioparam-cancel-and-hold` 94/106** — the last twelve check the exact
  sample at which a `setTarget` cancelled mid-approach resumes, to a tolerance
  of `5.96e-8`. Ours is right in shape and close in value; matching Chrome's
  exact float path there is a longer job than the twelve subtests justify today.
- **⛔ The tests that compare against captured reference audio** (`oscillator-*`,
  the compressor, the HRTF panner) are out of reach without shipping the same
  band-limited wavetables and impulse responses — a poor trade for a low-spec
  device, and named here so nobody mistakes them for failures.
- **Next leverage** is recorded at the top of the campaign memory and on the
  quest board.
