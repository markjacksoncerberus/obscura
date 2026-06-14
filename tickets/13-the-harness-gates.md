# Scroll XIII — The Harness Gates

> *Meta-quest. Some realms report no spoils not because we lose the battle, but
> because the gate never opens — `testharness.js` aborts before a single subtest
> is counted. Open the gate and whole regions become measurable (and some pass
> for free).*

Realm: tests that **could-not-run** / **no-results** under `scripts/wpt_run.py`.
Hold at scouting: see below. Difficulty: ⚔️⚔️. Date scouted: 2026-06-14.

---

## The two gate signatures (from `scripts/wpt_run.py`)

1. **`testharness did not load / run`** — `add_completion_callback` never defined
   *and* no `#results` table. testharness.js itself never executed.
2. **`no-results (test ran but summary never appeared)`** — harness loaded, but
   the `Found N tests …` summary line never rendered (setup threw, a subtest
   hung, or completion never fired).

A diagnostic probe was added at `scripts/harness_probe.py` — it navigates a test,
collects console + uncaught `pageerror`s, dumps harness state, and runs a surface
probe of the JS/DOM features testharness leans on.

---

## ✅ Gate A — `Document.createCDATASection` — RAISED (2026-06-14)

**Done in `bootstrap.js` + `obscura-dom/src/tree.rs`.** `could-not-run: 0` across
the previously-gated ranges/traversal suite. Results after the fix:
`TreeWalker 300/761`, `NodeIterator 1/766`, `Range-comparePoint 0/5580` (loads),
the heavy `Range-{cloneContents,deleteContents,extractContents}` now run (harness
TIMEOUT — they do real work against the still-stubbed `Range`; that's Scroll #10).
Bonus: a latent `Comment`/`PI` `textContent` bug fixed along the way bumped
`Node-cloneNode` 98→99. No regressions (`Node-appendChild` 11/11,
`Element-classlist` 1315/1420 held).

What shipped:
- `Document.prototype.createCDATASection` (throws on HTML docs per spec) +
  `createProcessingInstruction` (validates target Name / rejects `?>`).
- `CDATASection` (nodeType 4) and `ProcessingInstruction` (nodeType 7) classes,
  real-node-backed; exposed as globals; Node type constants added.
- `DetachedDocument` — a standalone document (backed by a real document node)
  for `new Document()`, `implementation.createDocument` / `createHTMLDocument`,
  plus `implementation.createDocumentType`. Scoped queries/factories so synthetic
  docs never pollute the live page (verified).
- `tree.rs::text_content` now returns a CharacterData node's own data for
  Comment/PI (Element/Document still exclude comments — verified).

---

### Original scouting notes (kept for the chronicles)

## ⚔️ Gate A — `Document.createCDATASection` (HIGH LEVERAGE) — CONFIRMED

**Symptom:** every `dom/ranges/*` and `dom/traversal/*` test reports *no-results*.

**Root cause (one line):**
```
TypeError: xmlDocument.createCDATASection is not a function   at setupRangeTests
```
The shared WPT range/traversal setup helper (`setupRangeTests`) builds a foreign
document and populates it with a CDATA section. It throws on the very first call,
so **zero subtests register** → the summary never prints → the whole file is
unmeasurable.

**Why it throws (two layers, both in `crates/obscura-js/js/bootstrap.js`):**
- `Document.prototype` has **no `createCDATASection`** (nor `createProcessingInstruction`).
  Present today: `createElement/NS`, `createTextNode`, `createComment`,
  `createDocumentFragment`, `createEvent` (≈ line 1285–1332).
- `document.implementation.createDocument()` is a **stub that returns the main
  `document` itself** (line 1446–1452: `createDocument(){ return globalThis.document; }`).
  So `xmlDocument` *is* the HTML document, and the missing method bites immediately.

**Battle plan (minimal unblock — flips the region to measurable):**
- Add `createCDATASection(data)` and `createProcessingInstruction(target, data)`
  to `Document.prototype` (mirror onto `FrameDocument`, ≈ line 3267–3272).
  CDATASection is a `Text` subtype; backing it with a text/character-data node is
  enough for `setupRangeTests` to proceed. (In a real HTML doc the spec says
  `createCDATASection` *throws NotSupportedError* — but here the helper runs it on
  what it believes is an XML/foreign doc, so it must succeed.)
- This is the entire #13 win for ranges+traversal: it does **not** require real
  Ranges. Once the gate opens, individual subtests become honest pass/fail and
  roll into Scroll #10 (The Traversal Labyrinth).

**Beware (downstream, NOT part of this gate — they belong to Scroll #10):**
- `createRange()` (line 1332) and `globalThis.Range` (line 3138) are **complete
  no-op stubs** (`setStart(){}` … `cloneContents(){ return fragment }`).
- `createNodeIterator` (line 1441) just delegates to `createTreeWalker`.
- `document.implementation.createDocument` returning the main document is itself
  a latent bug; a real (even minimal) XML document would be the proper fix.

---

## 🜂 Gate B — "testharness did not load" — PHANTOM (tooling artifact)

Every `testharness did not load / run` result in the scout turned out to be a
**404**, not an engine gate. In this environment a missing path returns a 42-byte
JSON body `{"error":{"code":404,"message":"404"}}` with no `<script>` tags, which
the runner reports identically to a real harness failure (`hasHarness=False`,
`bodyLen=42`). Both `Event-constructors.html` (plural) **and**
`Event-constructor.html` (singular) 404 here — the canonical WPT event-constructor
test is not served at either guessed URL. Sibling `dom/events/Event-defaultPrevented.html`
loads fine (7/8), so `dom/events/` itself is reachable.

**Conclusion: no genuine "testharness did not load" gate exists in the sample.**
The 404 body fooled the runner twice — which is exactly why the tooling follow-up
below is worth doing.

---

## Minor gaps noticed while scouting (not gates; log for later)

- **`document.title` setter is a no-op** — `document.title='x'` does not stick.
  Surfaces as individual subtest failures across many files; cheap to fix.

---

## Tooling follow-up (optional, improves future scouting)

- Teach `scripts/wpt_run.py` to flag an HTTP-error body (e.g. a `{"error":{"code":404`
  body or tiny body with no `<script>`) as `bad-path` rather than
  `testharness did not load`, so typos/renamed tests don't masquerade as gates.

---

## Leverage measurement (focused sweep, 2026-06-14)

Files using the foreign-doc `setupRangeTests` helper gate on Gate A; simpler
files that skip it already load. From a 10-test focused sweep:

| Test | Result | Gated by A? |
|------|:------:|:-----------:|
| `dom/ranges/Range-cloneContents.html` | no-results | ✅ yes |
| `dom/ranges/Range-comparePoint.html` | no-results | ✅ yes |
| `dom/ranges/Range-deleteContents.html` | no-results | ✅ yes |
| `dom/ranges/Range-extractContents.html` | no-results | ✅ yes |
| `dom/traversal/TreeWalker.html` | no-results | ✅ yes |
| `dom/traversal/NodeIterator.html` | no-results | ✅ yes |
| `dom/ranges/Range-attributes.html` | 0/1 (loads) | no (skips helper) |
| `dom/traversal/TreeWalker-basic.html` | 1/6 (loads) | no (skips helper) |
| `dom/events/Event-defaultPrevented.html` | 7/8 (loads) | n/a |
| `dom/events/Event-constructor{,s}.html` | 404 | phantom (Gate B) |

**Takeaway:** Gate A unblocks the *substantive* core of ranges + traversal (the
many files that build a foreign document in setup), not literally every file —
but those are the high-subtest-count tests, so it's where the bounty lives. After
the gate opens, the now-measurable subtests are feature work for Scroll #10.
