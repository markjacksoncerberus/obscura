# 🧭 The Varied Verdict — Quest #520

> **`<meta name="variant">` expansion in `scripts/wpt_run.py`.**
> A WPT file that declares variants is not one test. It is N tests, and the
> runner was only ever running whichever one the file behaves as with no query
> string — which, for several suites, is *none of them*.

**Realm:** the harness. **Status:** ✅ landed.
**Named as leverage #4 by the outgoing knight of the intended/declared/reported arc.**

---

## The gap

WPT lets a file say, in its own `<head>`:

```html
<meta name="variant" content="?Backspace,ul">
<meta name="variant" content="?Delete,ol">
```

`wptrunner` — and therefore wpt.fyi, and therefore every score we compare
ourselves against — runs that file **once per variant**, each with its own row.
`scripts/wpt_run.py` fetched the bare URL and ran it once.

For a file that merely *reads* its query string, that costs a few subtests. For
the `input-events` suite it costs everything: those files end with

```js
default: throw new Error("Unhandled variant");
```

so the bare path throws on line one and scores **0**, for a reason that has
nothing whatever to do with the engine. Quest #517 worked around it by writing
the expansion out **by hand** into `scripts/wpt-input-events-probe.txt` — twelve
lines of query strings maintained by a human, in one probe list, for one realm.

## The work

`variant_urls(url)` in `scripts/wpt_run.py`:

* fetches the file once (first 256 KB — far past any real `<head>`), reads every
  `<meta name="variant">` in document order, and returns one URL per variant;
* returns `[url]` unchanged when the file declares none, when the fetch fails
  (**a runner that dies because wpt.live hiccuped is worse than one that runs the
  bare path**), or when the caller *already* qualified the URL with a `?`/`#` —
  so every hand-written expansion still in the probe lists keeps working and is
  never expanded a second time;
* caches per process, so a 219-file ritual pays one extra GET per file, once.

Rows are labelled with the caller's own path plus whatever the variant added, so
a probe list stays greppable against the output. `--no-variants` turns it off.

## Result

```
input-events-get-target-ranges-deleting-in-list-items.tentative.html
  → ?Backspace,ul  ?Backspace,ol  ?Delete,ul  ?Delete,ol
```

…discovered from the file rather than from a maintained list.

## ⛔ Caps / Next

* Only `<meta name="variant">` is expanded. WPT also generates variants from
  `// META: variant=` comments in `.any.js`/`.window.js` files — but wpt.live
  serves the **generated** `.any.html`, which carries the `<meta>` tags, so those
  are covered for free by fetching the served file.
* The extra GET is serial with the run. On a 219-file ritual that is ~20 s.
* **This will move ledger rows in both directions** — a file that was scoring
  the "no variant" path may now report four rows where it reported one, and a
  file that threw `Unhandled variant` will suddenly register real subtests. That
  is a *change in what is being measured*, not a regression; the per-file ritual
  diff shows them as rows that *appeared*.
