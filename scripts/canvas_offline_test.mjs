#!/usr/bin/env node
// Slice the canvas rasterizer out of the SHIPPING bootstrap.js and check its
// geometry in Node, in milliseconds.
//
// This is the same trick as scripts/xpath_offline_test.mjs and
// scripts/webaudio_offline_test.mjs, for the same reason: a rasterizer is a PURE
// FUNCTION of a path and a matrix, and a pure function does not need a browser,
// a CDP session or a 26-second rebuild to be told it is wrong. The code under
// test is not a copy — it is read out of bootstrap.js between the
// CANVAS2D-BEGIN/END markers, so it cannot drift from what actually ships.
//
//   node scripts/canvas_offline_test.mjs
//
// RUN THIS BEFORE TOUCHING THE RASTERIZER.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'crates/obscura-js/js/bootstrap.js'), 'utf8');
const BEGIN = '// ===== CANVAS2D-BEGIN =====';
const END = '// ===== CANVAS2D-END =====';
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0) { console.error('markers not found in bootstrap.js'); process.exit(2); }
const core = src.slice(a + BEGIN.length, b);

const exported = [
  '_c2mMul', '_c2mInvert', '_c2mX', '_c2mY', '_c2mScale', '_C2DPath',
  '_c2dCoverage', '_c2dPointInPath', '_c2dStrokeOutline', '_c2dApplyDash',
  '_C2D_OPS', '_C2D_FULL_OPS', '_C2D_BLEND', '_C2D_BLEND_NS', '_C2D_SS',
];
const mod = new Function(core + '\nreturn {' + exported.join(',') + '};')();
const {
  _c2mMul, _c2mInvert, _c2mX, _c2mY, _C2DPath, _c2dCoverage, _c2dPointInPath,
  _c2dStrokeOutline, _C2D_OPS, _C2D_FULL_OPS, _C2D_BLEND, _C2D_BLEND_NS,
} = mod;

const I = [1, 0, 0, 1, 0, 0];
let pass = 0, fail = 0;
const t0 = process.hrtime.bigint();
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log(`  FAIL  ${name}${extra !== undefined ? '   (' + extra + ')' : ''}`);
};
const near = (name, got, want, tol = 1e-9) =>
  ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);

// --- matrices --------------------------------------------------------------
{
  // translate(10,20) then scale(2) must place user (1,1) at device (12, 22):
  // the LATER transform applies to the coordinates, i.e. it nests inside.
  const m = _c2mMul(_c2mMul(I, [1, 0, 0, 1, 10, 20]), [2, 0, 0, 2, 0, 0]);
  near('mul: order translate∘scale x', _c2mX(m, 1, 1), 12);
  near('mul: order translate∘scale y', _c2mY(m, 1, 1), 22);
  const inv = _c2mInvert(m);
  near('invert round-trips x', _c2mX(inv, 12, 22), 1, 1e-12);
  near('invert round-trips y', _c2mY(inv, 12, 22), 1, 1e-12);
  ok('singular matrix has no inverse', _c2mInvert([0, 0, 0, 0, 0, 0]) === null);
  ok('scale(0) has no inverse', _c2mInvert([0, 0, 0, 1, 0, 0]) === null);
}

// --- coverage --------------------------------------------------------------
const covOf = (path, w = 20, h = 20, evenOdd = false) => _c2dCoverage(path, w, h, evenOdd, null);
const at = (r, w, x, y) => r.cov[y * w + x];

{
  // An axis-aligned rect on integer edges must be EXACTLY 1.0 inside and
  // EXACTLY 0.0 outside. Any antialiasing scheme that only supersamples gets
  // this subtly wrong, and every _assertPixel in WPT would catch it.
  const p = new _C2DPath();
  p.rect(I, 4, 4, 8, 8);
  const r = covOf(p);
  ok('rect: interior is exactly 1', at(r, 20, 7, 7) === 1, at(r, 20, 7, 7));
  ok('rect: first covered pixel is exactly 1', at(r, 20, 4, 4) === 1, at(r, 20, 4, 4));
  ok('rect: last covered pixel is exactly 1', at(r, 20, 11, 11) === 1, at(r, 20, 11, 11));
  ok('rect: just outside is exactly 0', at(r, 20, 3, 7) === 0, at(r, 20, 3, 7));
  ok('rect: past the far edge is exactly 0', at(r, 20, 12, 7) === 0, at(r, 20, 12, 7));
}
{
  // Half-pixel edges give half coverage — the antialiasing actually works.
  const p = new _C2DPath();
  p.rect(I, 4.5, 4, 7, 8);
  const r = covOf(p);
  near('rect: half-covered left edge', at(r, 20, 4, 6), 0.5, 1e-6);
  near('rect: half-covered right edge', at(r, 20, 11, 6), 0.5, 1e-6);
}
{
  // Two nested squares wound the SAME way: nonzero fills the whole outer square,
  // even-odd punches the inner one out. This one rule is the difference between
  // a donut and a disc, and between a letter "o" and a blob.
  const p = new _C2DPath();
  p.rect(I, 2, 2, 16, 16);
  p.rect(I, 6, 6, 8, 8);
  const nz = covOf(p, 20, 20, false);
  const eo = covOf(p, 20, 20, true);
  ok('nonzero: same-wound hole is filled', nz.cov[10 * 20 + 10] === 1, nz.cov[10 * 20 + 10]);
  ok('evenodd: same-wound hole is empty', eo.cov[10 * 20 + 10] === 0, eo.cov[10 * 20 + 10]);
  ok('evenodd: the ring itself is filled', eo.cov[3 * 20 + 10] === 1, eo.cov[3 * 20 + 10]);
}
{
  // Opposite winding: nonzero ALSO punches the hole. Direction is what nonzero
  // reads, and it is why reversing a subpath is a real drawing operation.
  const p = new _C2DPath();
  p.subpaths.push({ pts: [2, 2, 18, 2, 18, 18, 2, 18], closed: true });
  p.subpaths.push({ pts: [6, 6, 6, 14, 14, 14, 14, 6], closed: true });   // reversed
  const nz = covOf(p, 20, 20, false);
  ok('nonzero: counter-wound hole is empty', nz.cov[10 * 20 + 10] === 0, nz.cov[10 * 20 + 10]);
}
{
  // An OPEN subpath fills as though closed.
  const p = new _C2DPath();
  p.moveTo(I, 4, 4); p.lineTo(I, 12, 4); p.lineTo(I, 12, 12);
  const r = covOf(p);
  ok('open subpath fills as if closed', at(r, 20, 10, 6) > 0.9, at(r, 20, 10, 6));
}
{
  // A full circle from arc() must actually be closed — the twopie normalisation.
  const p = new _C2DPath();
  p.arc(I, 10, 10, 6, 0, Math.PI * 2, false);
  const r = covOf(p);
  ok('arc: centre of a full circle is filled', at(r, 20, 10, 10) === 1, at(r, 20, 10, 10));
  ok('arc: outside the circle is empty', at(r, 20, 1, 1) === 0, at(r, 20, 1, 1));
  let area = 0;
  for (let i = 0; i < 400; i++) area += r.cov[i];
  // A flattened arc is an INSCRIBED polygon, so it always measures slightly
  // short; the segment count is picked from a sagitta budget, and this bound is
  // what that budget buys.
  ok('arc: area ≈ πr² from below', area <= Math.PI * 36 && area > Math.PI * 36 - 0.5,
    `${area.toFixed(3)} vs ${(Math.PI * 36).toFixed(3)}`);
  // start === end with no wrap is an EMPTY arc, not a full one.
  const q = new _C2DPath();
  q.arc(I, 10, 10, 6, 0, 0, false);
  const rq = covOf(q);
  ok('arc: zero sweep draws nothing', rq.empty || rq.cov[10 * 20 + 10] === 0);
}
{
  // A transform baked in at add time: the same lineTo under two different
  // matrices really does produce two differently-placed points.
  const p = new _C2DPath();
  p.moveTo(I, 0, 0);
  p.lineTo(_c2mMul(I, [2, 0, 0, 2, 0, 0]), 5, 0);
  ok('CTM is baked in per point', p.subpaths[0].pts[2] === 10, p.subpaths[0].pts[2]);
}

// --- path construction semantics -------------------------------------------
{
  // rect() leaves a trailing EMPTY subpath at its own corner. It is observable:
  // a lineTo() straight after a rect() starts a new line from that corner rather
  // than extending the rectangle.
  const p = new _C2DPath();
  p.rect(I, 4, 4, 8, 8);
  ok('rect: closes its own subpath', p.subpaths[0].closed);
  ok('rect: leaves a fresh subpath behind', p.subpaths.length === 2 && p.subpaths[1].pts.length === 2);
  p.lineTo(I, 16, 4);
  ok('rect: a following lineTo starts from the corner', p.subpaths[1].pts.length === 4);
}
{
  // closePath() seals the subpath AND opens a new one at the same point, so the
  // shape that was just closed cannot be reopened by the next command.
  const p = new _C2DPath();
  p.moveTo(I, 2, 2); p.lineTo(I, 10, 2); p.lineTo(I, 10, 10);
  p.closePath(I);
  ok('closePath: seals the subpath', p.subpaths[0].closed);
  p.lineTo(I, 18, 18);
  ok('closePath: the next lineTo is a new subpath', p.subpaths.length === 2);
  ok('closePath: which starts where the shape did',
    p.subpaths[1].pts[0] === 2 && p.subpaths[1].pts[1] === 2);
  // closePath on an empty path does nothing at all.
  const q = new _C2DPath();
  q.closePath(I);
  ok('closePath: no-op on an empty path', q.subpaths.length === 0);
}
{
  // "Ensure there is a subpath": a curve command with no current point silently
  // starts one at its FIRST CONTROL POINT — not at the destination.
  const p = new _C2DPath();
  p.bezierCurveTo(I, 3, 4, 5, 6, 7, 8);
  ok('bezier with no subpath starts at control point 1',
    p.subpaths[0].pts[0] === 3 && p.subpaths[0].pts[1] === 4,
    p.subpaths[0].pts.slice(0, 2).join(','));
  const q = new _C2DPath();
  q.quadraticCurveTo(I, 3, 4, 7, 8);
  ok('quadratic with no subpath starts at its control point',
    q.subpaths[0].pts[0] === 3 && q.subpaths[0].pts[1] === 4);
  const r = new _C2DPath();
  r.arcTo(I, 3, 4, 7, 8, 2);
  ok('arcTo with no subpath starts at (x1, y1)',
    r.subpaths[0].pts[0] === 3 && r.subpaths[0].pts[1] === 4);
  // lineTo with no subpath is a moveTo — it must NOT draw a line from (0, 0).
  const s2 = new _C2DPath();
  s2.lineTo(I, 9, 9);
  ok('lineTo with no subpath is a moveTo', s2.subpaths[0].pts.length === 2);
}
{
  // A non-finite coordinate makes the whole command a silent no-op — it does not
  // throw, and it does not poison the current point with NaN.
  const p = new _C2DPath();
  p.moveTo(I, 5, 5);
  p.lineTo(I, NaN, 9);
  p.lineTo(I, Infinity, 9);
  p.lineTo(I, 9, 9);
  ok('non-finite lineTo is skipped, finite one still lands', p.subpaths[0].pts.length === 4,
    p.subpaths[0].pts.join(','));
  ok('and the current point survived it', p.lastX === 9 && p.lastY === 9);
}
{
  // arcTo's three degenerate cases all collapse to a straight line to (x1, y1):
  // coincident points, collinear points, and a zero radius.
  const run = (x0, y0, x1, y1, x2, y2, r) => {
    const p = new _C2DPath();
    p.moveTo(I, x0, y0);
    p.arcTo(I, x1, y1, x2, y2, r);
    return p.subpaths[0].pts;
  };
  ok('arcTo: collinear degenerates to a line', run(0, 0, 5, 0, 10, 0, 3).length === 4);
  ok('arcTo: zero radius degenerates to a line', run(0, 0, 5, 0, 5, 5, 0).length === 4);
  ok('arcTo: coincident points degenerate to a line', run(5, 0, 5, 0, 10, 5, 3).length === 2);
  let threw = false;
  try { const p = new _C2DPath(); p.moveTo(I, 0, 0); p.arcTo(I, 1, 1, 2, 2, -1); }
  catch (e) { threw = !!e.__c2dIndexSize; }
  ok('arcTo: a negative radius is an IndexSizeError', threw);
  let threw2 = false;
  try { const p = new _C2DPath(); p.arc(I, 0, 0, -1, 0, 1, false); }
  catch (e) { threw2 = !!e.__c2dIndexSize; }
  ok('arc: a negative radius is an IndexSizeError', threw2);
}
{
  // roundRect shrinks every radius by ONE common factor when neighbours would
  // overlap, so the corners stay in proportion instead of one eating the others.
  const p = new _C2DPath();
  const R = (v) => ({ x: v, y: v });
  p.roundRect(I, 0, 0, 10, 10, [R(20), R(20), R(20), R(20)]);
  let mx = -Infinity, mn = Infinity;
  for (const s of p.subpaths) for (let i = 0; i < s.pts.length; i += 2) { mx = Math.max(mx, s.pts[i]); mn = Math.min(mn, s.pts[i]); }
  ok('roundRect: oversized radii are scaled to fit', mx <= 10.0001 && mn >= -0.0001, `${mn}..${mx}`);
  // Zero radii make it an ordinary rectangle.
  const q = new _C2DPath();
  q.roundRect(I, 2, 2, 6, 6, [R(0), R(0), R(0), R(0)]);
  const rq = covOf(q);
  ok('roundRect: zero radii fill like a plain rect', at(rq, 20, 5, 5) === 1 && at(rq, 20, 2, 2) === 1,
    `${at(rq, 20, 2, 2)}`);
}

// --- point in path ---------------------------------------------------------
{
  const p = new _C2DPath();
  p.rect(I, 4, 4, 8, 8);
  ok('isPointInPath: inside', _c2dPointInPath(p, 8, 8, false));
  ok('isPointInPath: outside', !_c2dPointInPath(p, 2, 8, false));
  ok('isPointInPath: NaN is never inside', !_c2dPointInPath(p, NaN, 8, false));
  const q = new _C2DPath();
  q.rect(I, 2, 2, 16, 16);
  q.rect(I, 6, 6, 8, 8);
  ok('isPointInPath: nonzero fills the same-wound hole', _c2dPointInPath(q, 10, 10, false));
  ok('isPointInPath: evenodd empties it', !_c2dPointInPath(q, 10, 10, true));
}

// --- stroking --------------------------------------------------------------
{
  // A self-crossing stroke must be SOLID where it overlaps. This is the whole
  // reason the outline pieces are emitted with one consistent winding and then
  // filled nonzero: two overlapping quads of opposite orientation would cancel
  // and punch a hole straight through the crossing.
  const p = new _C2DPath();
  p.moveTo(I, 2, 10); p.lineTo(I, 18, 10);
  const p2 = new _C2DPath();
  p2.moveTo(I, 10, 2); p2.lineTo(I, 10, 18);
  const cross = new _C2DPath();
  cross.subpaths = p.subpaths.concat(p2.subpaths);
  const out = _c2dStrokeOutline(cross, I, 4, 'butt', 'miter', 10, [], 0);
  const r = covOf(out);
  ok('stroke: the crossing is solid, not a hole', at(r, 20, 10, 10) === 1, at(r, 20, 10, 10));
  ok('stroke: on the line', at(r, 20, 5, 10) === 1, at(r, 20, 5, 10));
  ok('stroke: off the line', at(r, 20, 5, 15) === 0, at(r, 20, 5, 15));
}
{
  // lineWidth lives in USER space: under scale(4) a width-1 stroke is 4 device
  // pixels wide. Expanding in device space instead would silently ignore the
  // transform, which is exactly what 2d.line.width.transformed measures.
  const p = new _C2DPath();
  const m = [4, 0, 0, 1, 0, 0];
  p.moveTo(m, 0.5, 10); p.lineTo(m, 4.5, 10);
  const out = _c2dStrokeOutline(p, m, 1, 'butt', 'miter', 10, [], 0);
  const r = covOf(out);
  // The stroke is centred on y = 10 and one device pixel tall, so it straddles
  // rows 9 and 10 at half coverage each — summing the column is the honest test,
  // and "is this pixel more than half covered" would have wrongly read zero.
  let wide = 0;
  for (let x = 0; x < 20; x++) if (at(r, 20, x, 9) + at(r, 20, x, 10) > 0.9) wide++;
  ok('stroke: width scales with the CTM', wide === 16, `covered ${wide} px, want 16`);
  near('stroke: and it is exactly one device px tall', at(r, 20, 5, 9) + at(r, 20, 5, 10), 1, 1e-6);
}
{
  // butt caps stop dead at the endpoint; square caps run half a width past it.
  const line = () => { const p = new _C2DPath(); p.moveTo(I, 5, 10); p.lineTo(I, 15, 10); return p; };
  const butt = covOf(_c2dStrokeOutline(line(), I, 4, 'butt', 'miter', 10, [], 0));
  const sq = covOf(_c2dStrokeOutline(line(), I, 4, 'square', 'miter', 10, [], 0));
  ok('cap butt: nothing past the end', at(butt, 20, 16, 10) === 0, at(butt, 20, 16, 10));
  ok('cap square: paints past the end', at(sq, 20, 16, 10) === 1, at(sq, 20, 16, 10));
  ok('cap square: stops at half a width', at(sq, 20, 17, 10) === 0, at(sq, 20, 17, 10));
}
{
  // ⚠️ A subpath containing no LINES is removed before stroking, whatever
  // lineCap says. This test asserted the opposite at first — that a round cap
  // turns a lone moveTo into a dot — and WPT's 2d.path.stroke.prune.rect said
  // otherwise: `rect(50, 25, 0, 0)` is four coincident points, and with
  // lineWidth 100 that invented "dot" is a hundred-pixel disc.
  const dot = () => { const p = new _C2DPath(); p.moveTo(I, 10, 10); return p; };
  for (const cap of ['butt', 'round', 'square']) {
    const r = covOf(_c2dStrokeOutline(dot(), I, 6, cap, 'miter', 10, [], 0));
    ok(`lone point draws nothing (cap ${cap})`, r.empty || r.cov[10 * 20 + 10] === 0,
      r.empty ? 'empty' : r.cov[10 * 20 + 10]);
  }
  // A degenerate rect is the same thing arriving by another road.
  const zr = new _C2DPath();
  zr.rect(I, 10, 10, 0, 0);
  const rz = covOf(_c2dStrokeOutline(zr, I, 12, 'round', 'round', 10, [], 0));
  ok('zero-size rect strokes to nothing', rz.empty || rz.cov[10 * 20 + 10] === 0);
}
{
  // ⚠️ A round cap is the half-disc BEYOND the endpoint. There are two halves to
  // pick from, and picking the wrong one is INVISIBLE in a coverage total — the
  // cap lands back on top of the line that is already painted, so the shape stays
  // solid and merely stops being round. Only a probe past the end can tell.
  const line = () => { const p = new _C2DPath(); p.moveTo(I, 6, 10); p.lineTo(I, 14, 10); return p; };
  const r = covOf(_c2dStrokeOutline(line(), I, 8, 'round', 'miter', 10, [], 0));
  ok('cap round: paints past the end', at(r, 20, 16, 10) > 0.9, at(r, 20, 16, 10));
  ok('cap round: and past the start', at(r, 20, 3, 10) > 0.9, at(r, 20, 3, 10));
  ok('cap round: but not a full width past', at(r, 20, 18, 10) === 0, at(r, 20, 18, 10));
  // A round cap is a half-DISC, so its corners are cut where a square cap's are not.
  const sq = covOf(_c2dStrokeOutline(line(), I, 8, 'square', 'miter', 10, [], 0));
  ok('cap round is rounder than square at the corner',
    at(r, 20, 17, 6) < at(sq, 20, 17, 6), `${at(r, 20, 17, 6)} vs ${at(sq, 20, 17, 6)}`);
}
{
  // ⚠️ A round join fills the WEDGE outside the corner, sweeping the short way
  // from one offset normal to the other. Sweeping the long way fills 360° minus
  // the corner — a full disc at every vertex, which on a polyline of a hundred
  // points is a string of beads instead of a line.
  const bend = (jn) => {
    const p = new _C2DPath();
    p.moveTo(I, 4, 4); p.lineTo(I, 10, 4); p.lineTo(I, 10, 16);
    return covOf(_c2dStrokeOutline(p, I, 4, 'butt', jn, 10, [], 0));
  };
  const round = bend('round'), bevel = bend('bevel');
  // Outside the corner (up and right of it) the round join paints; well inside
  // the elbow — the side the long way round would have flooded — it must not.
  ok('join round: fills outside the corner', at(round, 20, 11, 3) > 0.5, at(round, 20, 11, 3));
  ok('join round: does not flood the inside', at(round, 20, 6, 12) === 0, at(round, 20, 6, 12));
  ok('join round covers at least as much as bevel',
    at(round, 20, 11, 3) >= at(bevel, 20, 11, 3) - 1e-6,
    `${at(round, 20, 11, 3)} vs ${at(bevel, 20, 11, 3)}`);
}
{
  // miterLimit: a sharp enough corner drops back to a bevel instead of growing
  // an unbounded spike.
  const spike = () => {
    const p = new _C2DPath();
    p.moveTo(I, 2, 10); p.lineTo(I, 18, 10.2); p.lineTo(I, 2, 10.4);
    return p;
  };
  const big = _c2dStrokeOutline(spike(), I, 2, 'butt', 'miter', 1000, [], 0);
  const small = _c2dStrokeOutline(spike(), I, 2, 'butt', 'miter', 1.2, [], 0);
  const ext = (o) => { let mx = -Infinity; for (const s of o.subpaths) for (let i = 0; i < s.pts.length; i += 2) mx = Math.max(mx, s.pts[i]); return mx; };
  ok('miter: a huge limit lets the spike grow', ext(big) > 30, ext(big));
  ok('miter: a small limit bevels it off', ext(small) < 22, ext(small));
}
{
  // Dashes chop the line into the pattern's "on" runs.
  const p = new _C2DPath();
  p.moveTo(I, 0, 10); p.lineTo(I, 20, 10);
  const r = covOf(_c2dStrokeOutline(p, I, 4, 'butt', 'miter', 10, [4, 4], 0));
  ok('dash: on-run is painted', at(r, 20, 2, 10) === 1, at(r, 20, 2, 10));
  ok('dash: off-run is blank', at(r, 20, 6, 10) === 0, at(r, 20, 6, 10));
  ok('dash: second on-run is painted', at(r, 20, 10, 10) === 1, at(r, 20, 10, 10));
  const off = covOf(_c2dStrokeOutline(p, I, 4, 'butt', 'miter', 10, [4, 4], 4));
  ok('dashOffset shifts the pattern', off.cov[10 * 20 + 2] === 0, off.cov[10 * 20 + 2]);
}

{
  // ⚠️ A stroked ARC's free end must be square to the CURVE, not to the last
  // chord of the polygon it was flattened into. The two differ by half a
  // segment's sweep, and the cap is `lineWidth` long, so the error is multiplied
  // by the stroke's own width: at lineWidth 100 on a radius-50 arc it throws the
  // far corner several pixels into a quadrant that must stay untouched.
  const p = new _C2DPath();
  p.arc(I, 0, 50, 50, 0, -Math.PI / 2, false);       // sweeps 0 → 270°, clockwise
  const out = _c2dStrokeOutline(p, I, 100, 'butt', 'miter', 10, [], 0);
  const r = _c2dCoverage(out, 100, 50, false, null);
  // Every one of these lies just OUTSIDE the swept 0–270° wedge.
  for (const [x, y] of [[1, 48], [1, 1], [98, 1], [98, 48], [50, 25]]) {
    ok(`arc cap: (${x},${y}) stays outside the sweep`, r.cov[y * 100 + x] === 0,
      r.cov[y * 100 + x]);
  }
  // The whole 100×50 canvas sits in the 270°–360° quadrant, so a correct sweep
  // of 0°–270° touches NONE of it. That is the point of the test.
  let touched = 0;
  for (let i = 0; i < 5000; i++) if (r.cov[i] > 0) touched++;
  ok('arc cap: the wrong quadrant is entirely untouched', touched === 0, `${touched} px painted`);
  // …and the same arc drawn the other way round DOES cover it, so the test above
  // is not passing merely because nothing is being drawn at all.
  const q = new _C2DPath();
  q.arc(I, 0, 50, 50, 0, -Math.PI / 2, true);        // ccw: sweeps 0 → −90°
  const rq = _c2dCoverage(_c2dStrokeOutline(q, I, 100, 'butt', 'miter', 10, [], 0), 100, 50, false, null);
  ok('arc cap: the other direction does paint here', rq.cov[25 * 100 + 40] > 0.9, rq.cov[25 * 100 + 40]);
}

// --- compositing -----------------------------------------------------------
{
  // Every Porter-Duff operator is two numbers; spot-check the ones whose signs
  // are easiest to invert by accident.
  const chk = (op, as, ab, wantFa, wantFb) => {
    const [Fa, Fb] = _C2D_OPS[op](as, ab);
    near(`op ${op} Fa`, Fa, wantFa);
    near(`op ${op} Fb`, Fb, wantFb);
  };
  chk('source-over', 1, 1, 1, 0);
  chk('destination-over', 1, 0.5, 0.5, 1);
  chk('source-in', 0.5, 0.25, 0.25, 0);
  chk('destination-out', 0.5, 1, 0, 0.5);
  chk('xor', 0.5, 0.25, 0.75, 0.5);
  chk('copy', 0.3, 0.7, 1, 0);
  chk('clear', 1, 1, 0, 0);
  chk('lighter', 0.5, 0.5, 1, 1);
  // The operators that must sweep beyond the drawn shape.
  for (const op of ['copy', 'source-in', 'source-out', 'destination-in', 'destination-atop', 'clear']) {
    ok(`${op} is a full-canvas operator`, _C2D_FULL_OPS.has(op));
  }
  for (const op of ['source-over', 'destination-over', 'xor', 'lighter', 'destination-out']) {
    ok(`${op} is NOT a full-canvas operator`, !_C2D_FULL_OPS.has(op));
  }
}
{
  near('blend multiply', _C2D_BLEND['multiply'](0.5, 0.5), 0.25);
  near('blend screen', _C2D_BLEND['screen'](0.5, 0.5), 0.75);
  near('blend difference', _C2D_BLEND['difference'](0.2, 0.7), 0.5);
  near('blend darken', _C2D_BLEND['darken'](0.2, 0.7), 0.2);
  near('blend lighten', _C2D_BLEND['lighten'](0.2, 0.7), 0.7);
  // luminosity takes the source's luminance and the backdrop's colour, so a
  // grey source over a red backdrop stays red.
  const lum = _C2D_BLEND_NS['luminosity']([1, 0, 0], [0.5, 0.5, 0.5]);
  ok('blend luminosity keeps the backdrop hue', lum[0] > lum[1] && lum[1] === lum[2], JSON.stringify(lum));
  const col = _C2D_BLEND_NS['color']([0.5, 0.5, 0.5], [1, 0, 0]);
  near('blend color keeps the backdrop luminance',
    0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2], 0.5, 1e-6);
}

const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`\ncanvas core: ${pass} passed, ${fail} failed  (${ms.toFixed(0)} ms)`);
process.exit(fail ? 1 : 0);
