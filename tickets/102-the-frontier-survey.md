# 🗺️ The Frontier Survey — where the campaign should go next

> *Not a quest. A map. The Captain's Counsel was written on 2026-06-14 (session 5)
> and we are at quest #453 — every session since has followed the previous
> session's ⭐, and that chain has stayed inside CSS for seven weeks. Good local
> decisions, nobody checking the global one. This is the global one, measured.*

**Session:** 2026-08-02 · **Method:** 152 files measured across 33 top-level realms
the ledger had **never touched**, compared against Chrome's per-realm score on the
**same files**.

---

## How this was built (reproducible in ~40 minutes)

1. Chrome's full run summary is one file listing **every test path in WPT** with its
   pass/total — so every path is guaranteed valid (~⅓ of hand-guessed paths 404):
   ```sh
   curl -s "https://wpt.fyi/api/runs?label=master&product=chrome&max-count=1"   # → results_url
   curl -s --compressed "<results_url>" -o summary.json                          # ~13 MB
   ```
2. Bucket by top-level directory, keep tests with **≥2 subtests** (a proxy for
   "testharness, scoreable by our runner" — reftests report `[0,1]`/`[1,1]`), and
   diff that list against the realms present in `WPT_PROGRESS.md`.
3. Sample the densest files per realm, run them one at a time:
   ```sh
   .venv/bin/python scripts/wpt_baseline.py --list scripts/wpt-frontier-probe.txt --timeout 20
   ```
   The list used is committed at **`scripts/wpt-frontier-probe.txt`**.

---

## The headline

**The ledger covers 21 top-level realms. WPT has 262.**

In the realms we have fought over we are at **88–99%**. In the realms nobody has ever
opened we are at **0–48%**, against a Chrome that is at **93–100%** on the very same
files. This is not a tail. It is most of the platform.

| realm | ours | ours % | Chrome % | files | could-not-run |
|---|---:|---:|---:|---:|---:|
| `accname` | 0/144 | **0.0%** | 98.6% | 3 | 0 |
| `compression` | 0/204 | **0.0%** | 75.0% | 4 | 0 |
| `eventsource` | 0/18 | **0.0%** | 100.0% | 3 | 3 |
| `cookies` | 2/259 | **0.8%** | 96.9% | 6 | 4 |
| `workers` | 2/258 | **0.8%** | 96.9% | 6 | 5 |
| `IndexedDB` | 12/417 | **2.9%** | 99.8% | 8 | 1 |
| `fs` | 5/98 | 5.1% | 98.0% | 3 | 0 |
| `selection` | 24/403 | **6.0%** | 98.8% | 6 | 0 |
| `websockets` | 9/84 | 10.7% | 97.6% | 5 | 1 |
| `service-workers` | 43/358 | 12.0% | 100.0% | 5 | 1 |
| `streams` | 77/585 | 13.2% | 99.5% | 8 | 6 |
| **`fetch`** | **187/1204** | **15.5%** | 92.3% | 12 | 5 |
| `html/canvas` | 108/609 | 17.7% | 97.4% | 8 | 2 |
| `resize-observer` | 15/84 | 17.9% | 100.0% | 3 | 2 |
| `intersection-observer` | 15/83 | 18.1% | 94.0% | 5 | 0 |
| `urlpattern` | 14/76 | 18.4% | 100.0% | 4 | 0 |
| `editing` | 145/684 | 21.2% | 88.3% | 6 | 1 |
| `pointerevents` | 68/301 | 22.6% | 98.7% | 6 | 1 |
| `wai-aria` | 76/303 | 25.1% | 100.0% | 3 | 0 |
| `clipboard-apis` | 17/65 | 26.2% | 93.8% | 2 | 1 |
| `webmessaging` | 14/52 | 26.9% | 100.0% | 4 | 2 |
| `storage` | 34/121 | 28.1% | 100.0% | 4 | 0 |
| `web-locks` | 17/60 | 28.3% | 93.8% | 2 | 0 |
| `uievents` | 65/203 | 32.0% | 96.1% | 5 | 2 |
| `content-security-policy` | 35/106 | 33.0% | 96.7% | 3 | 1 |
| `webstorage` | 30/86 | 34.9% | 86.0% | 6 | 1 |
| `mathml` | 224/628 | 35.7% | 99.0% | 4 | 0 |
| `webaudio` | 219/542 | 40.4% | 100.0% | 4 | 0 |
| `quirks` | 75/156 | 48.1% | 98.1% | 5 | 0 |
| `referrer-policy` | 24/42 | 57.1% | 100.0% | 3 | 0 |
| `permissions` | 39/66 | 59.1% | 98.5% | 2 | 0 |
| `css/CSS2` | 350/440 | **79.5%** | 100.0% | 4 | 0 |

### Honest limits of this survey

- **152 files out of ~11,000** in these realms. It sizes a realm; it does not bucket one.
- The sample deliberately took the **densest files per realm**, which skew hard. A
  realm's true rate is probably somewhat better than its row here.
- `could-not-run` is counted as zero. That is the campaign's convention and it is the
  honest one — a test the engine cannot start is not a test it passes — but some CNRs
  are infra (`eventsource` is 3/3 CNR, which is one missing primitive, not 18 gaps).
- Chrome's column is exact: its score on **these same files**, from its own run.

---

## Recommended order — weighted by the mission, not by subtest count

The mission is *a real page working for a real person on a cheap device*, and *an
agent able to drive it*. Ranked by that, not by raw weight:

### 1. `fetch` + `streams` — the data layer of every modern page
**187/1204 and 77/585.** The largest single block of winnable subtests anywhere on
this map, and the most load-bearing: a page whose `fetch()` fails does not render
badly, it renders **empty**. `streams` is underneath it (`response.body`), so the two
are one region. Start with `fetch/api/headers/`, `fetch/api/request/`,
`fetch/api/response/` — pure object-model files with no network dependency, likely the
same "build the class properly" shape as #446.

### 2. `cookies` + `webstorage` + `IndexedDB` — staying logged in
**0.8% / 34.9% / 2.9%.** This is the difference between a browser you can *use* and a
browser you can *look at*. No session survives a navigation without cookies; no app
works offline without storage — and offline matters most exactly where connections are
metered and unreliable, which is who we are building for.

### 3. `accname` + `wai-aria` — **0.0% and 25.1%, and this is our own mission**
Accessible-name computation is how a screen reader says what a button is — **and it is
how an AI agent identifies a button.** We are a browser for agents on modest machines
and we score **zero** on the API that tells you what an element *is*. Highest
mission-value per subtest on the whole map. `accname` is 3 files, 144 subtests, Chrome
98.6%.

### 4. `pointerevents` + `uievents` + `selection` — how the agent acts
**22.6% / 32.0% / 6.0%.** Clicking, typing, selecting text. Same argument as (3) from
the other side: (3) is how the agent *reads*, this is how it *acts*.

### 5. `quirks` (48.1%) and `css/CSS2` (79.5%) — the old web
Quirks mode is not legacy trivia for our audience; the hand-me-down-laptop web is full
of pages written in 2004. `css/CSS2` at 79.5% is the **best** score on this map, which
means it is close to bankable.

### Deliberately NOT recommended yet
`wasm` (191k subtests) and `editing` (108k) are the two biggest realms by weight and
both are poor value now — `wasm` is mechanical spec conformance that no ordinary page
depends on, `editing` is `contenteditable`, which matters for authoring tools rather
than for reading the web. `webnn`, `webrtc`, `webcodecs`, `media-source` need real
media/hardware stacks.

---

## Two findings that are not about scores

- **`resize-observer/eventloop.html` HANGS THE ENGINE.** It wedged the sweep twice,
  hard enough that the runner never advanced past it and the server had to be killed
  and restarted — Playwright could not even open a new page afterwards. That is a real
  hang, not a failing assertion, and a page that hangs is worse than a page that
  renders wrong. **Worth a quest on its own; excluded from the list at
  `scripts/wpt-frontier-probe.txt` so the survey can be re-run.**
- **The whole visual half of the platform is still unmeasured and unmeasurable by this
  harness.** `wpt_baseline.py` scores testharness assertions only; it cannot run CSS
  reftests, which are most of `css/`. `css/CSS2` alone holds 2,461 reftest subtests
  Chrome passes that we have never scored. The ledger has never once asked "does the
  page *look* right" — `scripts/shot.py` is the stopgap, a human eye on a screenshot.
  A real reftest runner is the largest single blind spot in the campaign's
  instrumentation.
