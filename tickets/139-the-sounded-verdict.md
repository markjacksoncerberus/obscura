# 🏰 Scroll #139 — The Sounded Verdict: the directives that answer with an EVENT (Quests #555–#559)

> **Region:** the un-probed CSP directories — `media-src`, `object-src`,
> `frame-src`, `navigation`, `blob`, `default-src`, `font-src`, `img-src`,
> `svg`, `meta`, `parsing` — 93 files baselined at **72/143**.
> **Banner taken 2026-08-13**, right after the contained arc.

## The gap

Every one of these suites is written around the same contract: a blocked
resource makes TWO sounds — an `error` event where the element's fallback
listens, and a `securitypolicyviolation` event where the page's telemetry
listens. The engine had learned the first sound for scripts, styles, images
and fetches over five arcs, but for MEDIA the ask never happened at all
(the `error` fired, the violation never did — so every media-src test awaited
a violation forever), for a URL-less `<object>` there was no ask to make, and
a `javascript:` frame navigation wasn't a question anyone asked.

## Quest #555 — media-src, and WHERE a media failure lands

`__mediaSrcChanged` now asks `media-src` for the candidate URL **before the
fetch would happen**. In this build resource selection fails either way (no
codecs), so blocked and unsupported converge on the same `error` — but the
ask fires the violation event, and that event is how a page (and the whole
suite) tells a policy decision from a codec gap. blockedURI is the full
resource URL (media loads are fetches, not navigations).

⭐ **WHERE the failure lands depends on where the candidate came from.** A
`src` attribute fails at the MEDIA element (error attribute set, event
there); a candidate from a `<source>` child fails with the spec's "dedicated
media source failure steps" — the `error` fires at the SOURCE ELEMENT and the
media element's error attribute stays null. Every player that offers WebM and
MP4 alternatives listens on its `<source>` children for exactly this.

⭐ And a `<track>` is its OWN fetch with its OWN error target: blocked or
merely unloadable, the error lands on the track element, where players listen
for a missing caption file. (The first version routed a track failure through
the video's source-child path and REGRESSED `media-src-7_3_2` 1/2 → 0/2 —
caught by the breadth diff, closed in-session at 2/2, one better than
baseline.)

`media-src-blocked` 0/4 → **4/4**, `media-src-7_1_2`/`7_2_2` 1/3 → **3/3**
each, `media-src-7_3_2` 1/2 → **2/2**. ⛔ The POSITIVE halves (7_1/7_2:
`onloadeddata` must fire for an allowed webm) are capped on the missing media
decoder, honestly.

## Quest #556 — object-src governs the PLUGIN, not just its data stream

`<object type="application/x-…"></object>` — no URL anywhere — must still
fire an object-src violation: the element requests PLUGIN instantiation, and
that is what the directive governs. The connect path now asks `object-src`
(with the document URL as the report subject) for a URL-less `<object>`/
`<embed>` carrying a `type`. `<embed>` had never been in the markup
resource scan at all ("link, object" → "link, object, embed").
`object-src-no-url-blocked`, `-embed-blocked`, `-empty-source-list-*`,
`-url-embed-blocked` all 0/1 → **1/1**.

## Quest #557 — a frame navigation asks different questions than a fetch

* **`javascript:` frame navigation is an INLINE SCRIPT question for the
  EMBEDDING document** — script-src-elem, blockedURI `"inline"` — and
  `frame-src` has NO say: `to-javascript-url-frame-src.html` runs a
  `javascript:` frame under `frame-src 'none'` and expects it to EXECUTE
  (0/1 → **1/1**). When allowed the URL body runs; the frame keeps its
  about:blank either way (string completion values are unimplemented).
* **`frame-src` moved onto the SRC-SETTER path** — it was only asked at
  insertion, so `frame.src = url` on an already-inserted frame navigated
  ungated. A blocked frame never navigates: it keeps its about:blank and
  fires `load` for it.
* **A frame violation reports the target's ORIGIN, not its full URL** — a
  frame load is a NAVIGATION, and reporting the path would leak where inside
  a cross-origin site the document tried to go. `_cspURLAllowed` gained a
  `reportUri` override (matching still runs on the full URL — path
  expressions must work; only the REPORT is stripped).
  `frame-src-same-document` 0/1 → **1/1**.

## Quest #558 — `'self'` never matches a local scheme

A blob:/data:/filesystem: URL made by an https page SERIALIZES with that
page's origin, so an origin comparison says "same site" — and
`worker-src 'self'` would then allow
`new Worker(URL.createObjectURL(blob))`: any injected string as a whole
second script environment. The spec requires local schemes to be granted BY
NAME (`blob:`), precisely so `'self'` keeps meaning "my own server", not
"anything I can mint". One guard in `_cspMatchesSource`'s `'self'` branch:
`self-doesnt-match-blob` 0/3 → **1/1**, `blob-urls-do-not-match-self` and
`frame-src-self-does-not-match-blob` 0/1 → **1/1** each.

## Quest #559 — the breadth diff, and what it caught

93-file re-run against the baseline, diffed per file: **13 files improved,
one regressed — and the regression was REAL** (the track routing above),
proven and closed in-session. `frame-src-sandboxed-allowed` appeared to
vanish in the after-run; solo re-run on the final binary: **1/1** — its chunk
had been poisoned by a wedging neighbor, not by the change.

Final breadth: **72/143 → 88/132 + the track file's 2/2** (denominators move
as wedged chunks shift which files score).

## ⛔ Caps / wedges (named, pre-existing)

* **Three files WEDGE the engine at page load** (a spinning page thread,
  ~33% CPU, even `page.goto` never resolves): `to-javascript-url-script-src`,
  `frame-src-blocked-path-matching`, `frame-src-redirect`. All were TIMEOUT
  at baseline too — this arc did not cause them, and their chunks poison
  neighboring files in batch runs (the sandboxed-allowed lesson). The wedge
  class involves cross-host/echo-policy frames; likely the one-realm
  testharness collision (#530's cap). Diagnose with a thread dump, not from
  the outside.
* Positive media rows (loadeddata for allowed sources) need a media decoder.
* `blob-urls-match-blob` (allowed blob WORKER must run and postMessage) needs
  blob-URL worker script execution.
* `svg-inline`, `meta/sandbox-iframe`, `img-src` css-background/filter/svg-use
  rows, `wasm postMessage` — untouched this arc.

## Zero-regression proof

294-file ritual list (331 scored rows — the container-queries lands joined the
list this arc), PRE-Arc-B binary (bootstrap.js stashed at a6c7cc4) vs the
final binary, diffed per file:

```
before: 55151/55764  (1 could-not-run, 331 rows)
after:  55151/55764  (1 could-not-run, 331 rows)
0 regressions, 0 moved rows — byte-identical.
```

Every one of this arc's gates fires only where a policy has an opinion, and
the ritual list carries no CSP-governed media/object/frame pages — exactly
the isolation the gating was designed for.
