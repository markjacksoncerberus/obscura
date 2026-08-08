# ✒️ The Pathed Verdict — Quest #509

> **`html/canvas` — the path, the winding rule, the stroker, the clip, the hit test.**
>
> Sibling scrolls: [`109-the-drawn-verdict.md`](109-the-drawn-verdict.md) (the
> surface, state, colour, transforms),
> [`111-the-composited-verdict.md`](111-the-composited-verdict.md) (compositing,
> gradients, shadows, pixels, a real PNG).

---

## The gap

`fill()`, `stroke()` and `clip()` were `{}`. Paths were collected into an array
of little marker objects and never looked at again. Everything below is new.

A canvas that cannot fill a path cannot draw a pie chart, a map, an icon, a
signature, a sparkline, a game sprite, or a letter. It is the difference between
"canvas is slow here" and "canvas does not work here."

---

## The rasterizer

A scanline coverage rasterizer, all of it inside the
`// ===== CANVAS2D-BEGIN/END =====` markers so it is a pure function of a path and
a matrix.

**Vertically** it takes 16 sub-scanlines per pixel row. **Horizontally** each
covered span contributes its *exact* fractional overlap with every pixel it
touches. That mix is the whole design:

⭐⭐ **A fully supersampled rasterizer gets `fillRect` subtly wrong.** An
axis-aligned rectangle on integer coordinates must come out at **exactly 1.0**
coverage and **exactly 0.0** just outside — not 0.998 — because every
`_assertPixel` in WPT compares bytes. Exact horizontal spans give that for free
while still antialiasing a diagonal edge. Sixteen is a power of two, so 16 × 1/16
sums to exactly 1 in float32; a non-power-of-two would have left a rounding
residue in the most common case on the platform.

Edges are swept with an **active-edge list** sorted by top `y`, so a fill costs
O(edges touching this scanline) rather than O(all edges) — the difference between
a 1080p canvas costing 17,000 × E and 17,000 × (a handful).

⭐ **Zero allocation in the inner loop.** A fill on a 150-row canvas visits 2,400
sub-scanlines; the first draft allocated a crossings array and an index array for
each one, handing the collector five thousand short-lived objects per `fillRect`.
Crossings are now insertion-sorted in place in two reused arrays — a scanline
typically has two to eight of them, where insertion sort beats a
comparator-driven `Array#sort` outright. On the machines this browser exists for
that is not a micro-optimisation.

⭐⭐ **Nonzero and even-odd are not a detail.** Two nested squares wound the same
way: nonzero fills the whole outer square, even-odd punches the inner one out.
Wind the inner one backwards and *nonzero* punches it out too. That one rule is
the difference between a donut and a disc, and between the letter "o" and a blob.

---

## The path

Curves and arcs are flattened as they are added, because that is also when the
CTM is captured. Segment counts come from an **error budget**, not a guess:

```
e = r·(1 − cos(π/n))   ⇒   n = π / acos(1 − e/r)
```

⭐ The first draft used `ceil(sqrt(r) * 8)`, which is **scale-blind**: it gave a
6px circle twenty segments (1.6% short on area) and a 1000px circle far too few.
Deriving the count from a sagitta budget makes the flatness of a curve a property
of how big it *looks*, which is the only thing that matters.

Semantics that each cost a measurement cycle, and each have their own WPT file:

- ⭐ **`rect()` leaves a trailing empty subpath at its own corner.** It is
  observable: a `lineTo()` straight after a `rect()` starts a new line from that
  corner rather than extending the rectangle.
- ⭐ **`closePath()` seals the subpath *and opens a new one at the same point*,**
  so the shape just closed cannot be reopened by the next command. On an empty
  path it does nothing at all.
- ⭐ **"Ensure there is a subpath"** — a curve command issued with no current point
  starts one silently at its **first control point**, not at its destination. Every
  `*.ensuresubpath.*` file is checking exactly this.
- ⭐ **A non-finite coordinate makes the whole command a silent no-op** — it does
  not throw, and it must not poison the current point with NaN.
- ⭐ **`arcTo` has three degenerate cases** — coincident points, collinear points,
  zero radius — and all three collapse to a straight line to `(x1, y1)`. A
  negative radius is an `IndexSizeError`.
- ⭐ **`roundRect` shrinks every radius by ONE common factor** when neighbours
  would overlap, so the corners stay in proportion instead of one eating the
  others. Its radii argument is the most overloaded input in the API — a number, a
  `DOMPointInit`, or a list of one to four of either — and it yields **two
  different errors from one argument slot**: a `RangeError` for a negative radius,
  an `IndexSizeError` for the wrong number of them.
- **SVG path data** (`new Path2D('M0 0 L10 10 A…Z')`), because every icon library
  on the web ships its shapes that way, and refusing to parse it means a page has
  an icon set it cannot draw.

---

## ⭐⭐⭐ The stroker, and the bug that flattening cannot fix

The outline is built as a pile of individually convex pieces — one quad per
segment, one wedge per join, one shape per cap — every one wound the **same way**,
then filled **nonzero**. Nonzero over consistently wound pieces *is* a union,
which is why a self-crossing stroke comes out solid instead of punching a hole
through itself where it overlaps.

It all happens in **user space** and is transformed afterwards, because
`lineWidth` is a user-space quantity: under `scale(5, 1)` a stroke is genuinely
elliptical, and expanding in device space would silently make it round.

Then three bugs, in increasing order of how much they taught.

### ⭐ A round cap has two halves, and one of them is invisible

The cap is the half-disc **beyond** the endpoint. The sweep from `+n` to `−n` can
go either way round, and the wrong way lands the cap back on top of the line that
is already painted. **The shape stays solid.** Nothing looks broken — the stroke
merely stops being round at the ends, quietly, everywhere.

That is why the offline test for it probes *past* the end rather than checking a
coverage total: a total cannot see this bug at all.

### ⭐ A round join is a wedge, not a circular segment

`arcPts` returns the arc; closing that back on itself gives the **circular
segment** — the sliver beyond the chord — and leaves the triangle between the
chord and the corner painted by nothing, because neither adjacent segment quad
reaches into it. The result is a notch bitten out of the outside of every round
join. The vertex itself has to be part of the polygon.

(The sweep direction was inverted here too, filling 360° *minus* the corner — a
full disc at every vertex, which on a hundred-point polyline is a string of beads
instead of a line.)

### ⭐⭐⭐ Offsets belong to VERTICES, not to segments

This one is the real find, and the offline harness did not catch it — WPT did,
and then the harness reproduced it in 14 ms.

A quad offset perpendicular to **its own chord** misplaces both of its ends by
`hw · Δ/2`, where Δ is that segment's turn. **Linear in Δ.** So flattening harder
barely helps: getting the error under a tenth of a pixel on a thick arc would take
thousands of segments.

Concretely — `arc(0, 50, 50, 0, −π/2)` stroked 100 wide, which is WPT's
`2d.path.arc.shape.3`: 3° segments put the inner corner **1.4 px past where the
stroke ends**, painting into a quadrant the page never asked to touch, and giving
the whole inside of the arc a ragged fringe.

Offsetting along the **angle bisector at each vertex** instead leaves an error of
`hw · Δ²/8` — **0.02 px** on that same arc, seventy times better — because *the
bisector of two chord normals of a circle is the radius*. Only for gentle turns:
past 15° the bisector offset runs away (that is what `miterLimit` exists to catch),
so anything sharper falls back to chord normals and lets the join wedge do its
job.

And ⭐⭐ **the free ends need the curve's TRUE tangent**, recorded when the arc was
flattened. A round cap can be rotated to compensate; a **butt** cap cannot, because
it is simply where the end quad stops. So the end quad's edge carries the
correction itself and the segment becomes a trapezoid. Every progress ring, donut
chart and gauge on the web is a thick arc with caps — this is the common case, not
the exotic one.

**miterLimit** drops a corner back to a bevel when the spike would exceed
`miterLimit × lineWidth`; without it a nearly-doubled-back line grows an unbounded
needle. **Dashes** are applied along the polyline in user space, with an
odd-length pattern doubled first per spec, so `[5]` means 5-on-5-off rather than
5-on-nothing.

⚠️ **HTML's "trace a path" REMOVES every subpath containing no lines.** A subpath
that is a single point contributes nothing, whatever `lineCap` says. The offline
test asserted the opposite at first — that a round cap turns a lone `moveTo` into
a dot — and `2d.path.stroke.prune.rect` said otherwise: `ctx.rect(50, 25, 0, 0)`
is four coincident points, and with `lineWidth = 100` that invented "dot" is a
hundred-pixel disc splashed across a canvas the page asked to leave alone.

---

## Clipping and hit testing

`clip()` intersects a coverage mask, so a clipped edge **antialiases** instead of
stairstepping, and it carries a bounding box — which is what stops a `copy`
composite from sweeping a whole 1080p bitmap when the clip is a ten-pixel square.
Intersecting only ever shrinks, so the box is always valid.

⚠️ **`isPointInPath(x, y)` takes the point in the CANVAS coordinate space, and it
must NOT be run through the CTM.** The path's points went through the transform
when they were added; the query point never does. Transforming it too applies the
same translation twice, so `translate(50, 0); rect(0, 0, 20, 20)` reports the
rectangle sitting at 100 instead of 50 — **a hit test that is wrong by exactly the
transform**, which is the hardest kind of wrong to see, because it is right
whenever you test it without one.

`isPointInStroke` runs the same query against the generated outline.

---

## ⭐⭐ `scripts/canvas_offline_test.mjs`

114 geometry checks in **~15 ms**, sliced out of the shipping `bootstrap.js`
between the `CANVAS2D-BEGIN/END` markers — so it tests the code that actually
ships, not a copy of it. Same trick as `xpath_offline_test.mjs` and
`webaudio_offline_test.mjs`, for the same reason: a rasterizer is a **pure
function**, and a pure function does not need a browser, a CDP session and a
26-second rebuild to be told it is wrong.

**RUN IT BEFORE TOUCHING THE RASTERIZER.**

Its first run found two failures in 16 ms. One was a genuine precision gap (the
`√r` segment count). The other was **my own assertion being wrong** — I had
checked "is this pixel more than half covered" on a stroke that is centred on a
pixel boundary and therefore straddles two rows at exactly half each. Both were
information; neither needed a rebuild.

---

## Results

| directory | before | after |
|---|---:|---:|
| `path-objects` (20 files sampled) | 8/20 | **19/20** |
| `line-styles` (8 files sampled) | 3/8 | **8/8** |

Named files this quest turned green: `2d.path.fill.winding.evenodd.1`,
`2d.path.fill.overlap`, `2d.path.stroke.overlap`, `2d.path.clip.intersect`,
`2d.path.clip.winding.1`, `2d.path.bezierCurveTo.shape`,
`2d.path.quadraticCurveTo.shape`, `2d.path.arc.shape.1/3`,
`2d.path.arcTo.shape.curve1`, `2d.path.isPointInPath.basic/winding/transform.1`,
`2d.path.transformation.basic`, `2d.path.stroke.prune.rect`,
`2d.path.roundrect.1.radius.double`, `2d.line.cap.round`, `2d.line.join.miter`,
`2d.line.miter.exceeded`, `2d.line.width.transformed`, `2d.line.cross`.

Full per-file numbers in [`../WPT_PROGRESS.md`](../WPT_PROGRESS.md).

---

## ⛔ Honest caps

- **`lineDashOffset` on a closed subpath** starts the pattern at the subpath's
  first point rather than distributing the phase; visually identical for the
  common cases, wrong for a dashed circle whose pattern should meet itself.
- **A dashed stroke's caps** use chord directions even on a flattened curve, since
  dashing creates new ends the recorded tangents do not describe. Correct — just
  worth writing down.
- **Curve flattening is uniform in parameter**, not adaptive, so a bezier with one
  very tight corner spends segments evenly along its length.
