#!/usr/bin/env node
// Run the Web Audio DSP kernel OFFLINE, in Node, in milliseconds.
//
//     node scripts/webaudio_offline_test.mjs
//
// This is the `xpath_offline_test.mjs` trick applied to Quest #503's renderer.
// The kernel between the `// ===== WEBAUDIO-DSP-BEGIN/END =====` markers in
// `crates/obscura-js/js/bootstrap.js` is PURE — no DOM, no globals — so it can
// be sliced out and exercised directly. That means **it tests the shipping
// code**, not a copy of it, and it does so without a build, a server, or a
// single CDP round-trip.
//
// Why it earns its place: the channel up/down-mixing table is the part of Web
// Audio that is easiest to get subtly wrong and hardest to notice. A 6→2
// down-mix with the wrong coefficient does not fail loudly; it just makes the
// centre channel quiet, and you find out from a bug report about dialogue you
// cannot hear. Every coefficient below is checked against the spec's §4 table.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'crates/obscura-js/js/bootstrap.js'), 'utf8');

const BEGIN = '// ===== WEBAUDIO-DSP-BEGIN =====';
const END = '// ===== WEBAUDIO-DSP-END =====';
const i = src.indexOf(BEGIN);
const j = src.indexOf(END);
if (i < 0 || j < 0) {
  console.error('markers not found — did the WEBAUDIO-DSP block move or get renamed?');
  process.exit(2);
}
const kernel = src.slice(i + BEGIN.length, j);

// The kernel declares top-level consts; hand them back through a return.
const load = new Function(kernel + `
  return { _WA_QUANTUM, _WA_MAX_FLOAT, _waBus, _waMixInto, _waOscSample,
           _waWaveshape, _waInsertEvent, _waEventTypes };
`);
const K = load();

let pass = 0;
const failures = [];
const check = (name, actual, expected, tol = 0) => {
  const ok = Array.isArray(expected)
    ? expected.length === actual.length &&
      expected.every((e, n) => Math.abs(e - actual[n]) <= tol)
    : (typeof expected === 'string' ? actual === expected
       : Math.abs(actual - expected) <= tol);
  if (ok) pass++;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
};

// --- channel mixing -----------------------------------------------------------
// Feed each source channel a distinct constant so every coefficient shows up in
// the answer unambiguously; then read frame 0 of each destination channel.
const mix = (srcValues, dstChannels, interpretation) => {
  const src = K._waBus(srcValues.length);
  srcValues.forEach((v, ch) => src[ch].fill(v));
  const dst = K._waBus(dstChannels);
  K._waMixInto(dst, src, interpretation);
  return Array.from(dst, (ch) => ch[0]);
};
const R2 = Math.SQRT1_2;
const T = 1e-6;

check('identity 2->2', mix([1, 2], 2, 'speakers'), [1, 2], T);
// Up-mix (spec §4.2): mono is heard from both speakers.
check('speakers 1->2', mix([3], 2, 'speakers'), [3, 3], T);
check('speakers 1->4', mix([3], 4, 'speakers'), [3, 3, 0, 0], T);
check('speakers 1->6 (centre only)', mix([3], 6, 'speakers'), [0, 0, 3, 0, 0, 0], T);
check('speakers 2->4', mix([1, 2], 4, 'speakers'), [1, 2, 0, 0], T);
check('speakers 2->6', mix([1, 2], 6, 'speakers'), [1, 2, 0, 0, 0, 0], T);
check('speakers 4->6', mix([1, 2, 3, 4], 6, 'speakers'), [1, 2, 0, 0, 3, 4], T);
// Down-mix (spec §4.3): the coefficients preserve total power.
check('speakers 2->1', mix([1, 3], 1, 'speakers'), [2], T);
check('speakers 4->1', mix([1, 2, 3, 4], 1, 'speakers'), [2.5], T);
check('speakers 6->1', mix([1, 1, 1, 1, 1, 1], 1, 'speakers'), [2 * R2 + 1 + 1], T);
check('speakers 4->2', mix([1, 2, 3, 4], 2, 'speakers'), [2, 3], T);
check('speakers 6->2', mix([1, 2, 3, 4, 5, 6], 2, 'speakers'),
  [1 + R2 * 3 + R2 * 5, 2 + R2 * 3 + R2 * 6], T);
check('speakers 6->4', mix([1, 2, 3, 4, 5, 6], 4, 'speakers'),
  [1 + R2 * 3, 2 + R2 * 3, 5, 6], T);
// Discrete: channel i to channel i, extras dropped, the rest silent.
check('discrete 1->2 (NOT duplicated)', mix([3], 2, 'discrete'), [3, 0], T);
check('discrete 3->2 (extra dropped)', mix([1, 2, 3], 2, 'discrete'), [1, 2], T);
check('discrete 2->3 (rest silent)', mix([1, 2], 3, 'discrete'), [1, 2, 0], T);
// An undefined speakers pair must FALL BACK to discrete, not to silence.
check('speakers 3->2 falls back to discrete', mix([1, 2, 3], 2, 'speakers'), [1, 2], T);
// Summing: mixing twice into the same bus ADDS, it does not overwrite.
{
  const dst = K._waBus(2);
  const a = K._waBus(1); a[0].fill(1);
  const b = K._waBus(2); b[0].fill(10); b[1].fill(20);
  K._waMixInto(dst, a, 'speakers');
  K._waMixInto(dst, b, 'speakers');
  check('two connections SUM into one input', [dst[0][0], dst[1][0]], [11, 21], T);
}

// --- oscillator waveforms -----------------------------------------------------
check('sine at 0', K._waOscSample('sine', 0), 0, T);
check('sine at 1/4', K._waOscSample('sine', 0.25), 1, T);
check('sine at 3/4', K._waOscSample('sine', 0.75), -1, T);
check('sine wraps past 1', K._waOscSample('sine', 1.25), 1, T);
check('square first half', K._waOscSample('square', 0.1), 1, T);
check('square second half', K._waOscSample('square', 0.6), -1, T);
check('sawtooth at 0', K._waOscSample('sawtooth', 0), 0, T);
check('sawtooth just under 1/2', K._waOscSample('sawtooth', 0.499), 0.998, 1e-3);
check('sawtooth just over 1/2 wraps negative', K._waOscSample('sawtooth', 0.501), -0.998, 1e-3);
check('triangle at 0', K._waOscSample('triangle', 0), 0, T);
check('triangle peak at 1/4', K._waOscSample('triangle', 0.25), 1, T);
check('triangle zero at 1/2', K._waOscSample('triangle', 0.5), 0, T);
check('triangle trough at 3/4', K._waOscSample('triangle', 0.75), -1, T);
check('custom with no wave is silent', K._waOscSample('custom', 0.3, null), 0, T);
{
  // A one-harmonic PeriodicWave is a sine; unnormalised it keeps its amplitude.
  const wave = { _wapw: { real: new Float32Array([0, 0]), imag: new Float32Array([0, -1]), normalize: false } };
  check('periodic wave: imag[1] = -1 is a sine', K._waOscSample('custom', 0.25, wave), 1, T);
}

// --- the shaping curve --------------------------------------------------------
const curve = new Float32Array([-1, 0, 1]);
check('waveshaper maps -1 to curve[0]', K._waWaveshape(curve, -1), -1, T);
check('waveshaper maps 0 to the middle', K._waWaveshape(curve, 0), 0, T);
check('waveshaper maps +1 to curve[last]', K._waWaveshape(curve, 1), 1, T);
check('waveshaper interpolates', K._waWaveshape(curve, 0.5), 0.5, T);
// Out of range CLAMPS — which is what makes a WaveShaper a limiter.
check('waveshaper clamps below -1', K._waWaveshape(curve, -5), -1, T);
check('waveshaper clamps above +1', K._waWaveshape(curve, 5), 1, T);

// --- automation event ordering ------------------------------------------------
// Same-time events must keep INSERTION order: a page that schedules two events
// at one instant is entitled to have the later call win.
{
  const ev = [];
  K._waInsertEvent(ev, { type: 'a', time: 1 });
  K._waInsertEvent(ev, { type: 'b', time: 0 });
  K._waInsertEvent(ev, { type: 'c', time: 1 });
  K._waInsertEvent(ev, { type: 'd', time: 0.5 });
  check('events sort by time, stable at equal times',
    ev.map((e) => e.type).join(''), 'bdac');
}

check('render quantum is 128', K._WA_QUANTUM, 128);
check('most-positive float', K._WA_MAX_FLOAT, 3.4028234663852886e38);

const total = pass + failures.length;
if (failures.length) {
  console.log(`\n${failures.length} FAILED of ${total}:\n`);
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log(`webaudio DSP kernel: ${pass}/${total} checks pass`);
