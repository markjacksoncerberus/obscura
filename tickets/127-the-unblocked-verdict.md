# 127 — The Unblocked Verdict

> **Quest #526** · realms: `editing`, `input-events`
> *The debt three arcs booked, collected.*

## The gap

Quests #514–#516 opened `editing`, the largest realm on WPT. Quest #517 opened
`input-events`. Both ended above 90% and both ended with the same sentence in
their Caps: **the biggest files still time out, because layout is not
incremental.**

That is a different kind of failure from the ones this campaign usually chases.
Nothing was missing and nothing was wrong. The engine knew how to run every one
of those subtests; it simply could not run them fast enough, because each of the
thousands of assertions in a `editing/run/*.html` variant is a mutate-then-measure
pair, and each pair cost 13 ms.

Quest #525 made that pair cost 2.7 ms. This quest is the measurement of what that
bought — no new features, no new code, the same test files against a faster
engine.

## Method

Both probe lists run against the pre-quest binary and the post-quest one, sharded
identically, diffed per file. Nothing else differs.

## `input-events` — 1,805/2,980 → 2,119/3,209

| file | before | after |
|---|---:|---:|
| `…get-target-ranges-joining-dl-elements.tentative.html?Backspace` | 173/337 | **254/389** |
| `…get-target-ranges-joining-dl-elements.tentative.html?Delete` | 197/339 | **263/377** |
| `…get-target-ranges-deleting-in-list-items.tentative.html?Delete,ol` | 134/275 | **179/313** |
| `…get-target-ranges-deleting-in-list-items.tentative.html?Backspace,ul` | 150/285 | **188/316** |
| `…get-target-ranges-deleting-in-list-items.tentative.html?Delete,ul` | 130/271 | **171/306** |
| `…get-target-ranges-deleting-in-list-items.tentative.html?Backspace,ol` | 146/282 | **171/302** |
| `…input-events-get-target-ranges-forwarddelete.tentative.html` | 75/161 | **93/176** |

**7 files improved, 0 regressions.**

⭐ **Read the denominators.** They grew — 2,980 → 3,209 total subtests — and that
is the whole story of this quest. These files were not failing their last two
hundred assertions; they were never reaching them. A timeout does not report the
tests it did not get to, so the realm's *apparent* size was a function of how
fast the engine was. **A score whose denominator moves when you change nothing
but speed was measuring the clock.**

## `editing` — 78,183/80,787 → 82,256/83,982

| file | before | after |
|---|---:|---:|
| `editing/run/delete.html?6001-7000` | **0/1000** | **948/1000** |
| `editing/run/insertparagraph.html?5001-6000` | could-not-run | **997/1000** |
| `editing/run/justifyfull.html?2001-3000` | could-not-run | **981/1000** |
| `editing/run/forwarddelete.html?5001-6000` | (never reached) | **990/1000** |
| `editing/run/insertparagraph.html?6001-7000` | (never reached) | **965/1000** |
| `editing/run/insertparagraph.html?7001-last` | (never reached) | **164/195** |

**could-not-run 2 → 0. 0 regressions.**

`delete.html?6001-7000` is the clearest single case: a thousand subtests that
scored **zero**, not one of them because the engine got the answer wrong. It now
scores 948.

Three variant slices appear in the after-run that have no before-row at all —
`forwarddelete.html?5001-6000`, `insertparagraph.html?6001-7000`,
`insertparagraph.html?7001-last`. The shard never got far enough into those files
to emit a row.

## What this says about the campaign

Two realms held above 90% for two arcs while thousands of their subtests had
never once been *attempted*. Nobody was hiding it — both scrolls said so plainly
in their Caps — but the ledger row said 97.7% and the ledger row is what gets
read.

> **A cap named honestly in a scroll is still a number missing from the
> scoreboard. The only way to find out how big it was is to remove it.**

## ⛔ Caps / Next

* The remaining `editing` failures are now real disagreements, not timeouts —
  roughly 1,700 subtests across 43 files, and they are the ordinary long tail of
  a very large realm.
* `input-events` is still around two-thirds. Its remaining failures concentrate
  in `getTargetRanges()` shapes around list items and definition lists, which is
  editing-algorithm work rather than performance.
* The layout fast path still refuses fifteen tags (see `126`), so a page whose
  mutations carry an `<img>` gets the old cost. None of these two realms' files
  do, which is why the win landed here first and may not land as cleanly
  elsewhere.
