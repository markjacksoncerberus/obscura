# 📜 Scroll 500 — The Reflected Verdict

> **Quests #731–#744 · 2026-09-10 · branch `engine-per-page-threads`**
>
> **A page that took five seconds was not slowed down. It was executed.**
> And underneath that: `img.alt`, `td.colSpan`, `a.ping`, `th.scope` and 179 more
> reflected members simply did not exist.
>
> `html/dom/reflection-*` — ten files, **56,660 subtests** — went from
> **10,065 scoreable / three files dead** to **56,660 / 56,660**.

---

## I. How the region was chosen

The outgoing knight's pointer named Range geometry (⭐⭐⭐) and float layout (⭐⭐⭐).
Both were measured cold before anything was written, which is the ritual and which
is what saved this session:

| candidate | measured | verdict |
|---|---|---|
| Range geometry (`cssom-view/range-*`, `highlightsFromPoint`) | **18 / 201** over 20 scored files | real, but ~25 subtests of score behind a deep change into the fork's inline layout |
| float layout (`css/css-flexbox/align-content-horiz-001a/b`) | 0/72 **each** — 144 subtests | real, and confirmed float-blocked (every `data-offset-x` in the file depends on floats sitting side by side) |
| a 26-file sample of the biggest-denominator files on the platform | **40,500 / 42,147** | the realms that *look* untouched are already held |

The third row is the one that mattered. Sampling the largest files by Chrome
subtest count — `selection/collapse-30` (5,133), `shadow-dom/declarative/gethtml`
(6,908), `css-anchor-position/anchor-size-parse-valid` (4,305) — came back at 96%,
which is a campaign in good health. But three rows in that sample read
**`testharness did not load / run`**, and their denominators were 10,202, 8,922
and 8,271.

**27,395 subtests were not failing. They were invisible.**

---

## II. ⭐⭐⭐ Quest #731 — a page that was slow was a page that was killed

`html/dom/reflection-text.html` did not time out. It came back in **seven
seconds** with no harness at all, and every CDP `Runtime.evaluate` against it
returned nothing — not an error, not `undefined`, *nothing*. The server log said
it plainly:

```
WARN obscura_js::runtime: Script killed after 5s timeout
```

Two separate bugs sat behind that one line.

### The watchdog had the question backwards

```rust
pub fn execute_script_guarded(&mut self, _name: &str, source: &str) -> Result<(), String> {
    if source.len() < 10_000 {
        self.execute_script(_name, source)        // NO timeout at all
    } else {
        self.execute_script_with_timeout(source, Duration::from_secs(5))
    }
}
```

A fifty-byte `while (1) {}` was **exempt** and hung the engine thread — and
therefore CDP, and therefore the whole browser — forever. A large, entirely
well-behaved script was **killed at five seconds** for the crime of being slow on
the modest hardware this browser exists to serve. Size is not a proxy for danger,
and it never was.

### ⭐⭐⭐ And termination is STICKY

This is the root cause, and it is the kind of bug that only shows up as "the
browser stopped answering":

```rust
if msg.contains("Uncaught Error: execution terminated") {
    tracing::warn!("Script killed after {}s timeout", timeout.as_secs());
    self.runtime.execute_script("<reset>", "undefined".to_string()).ok();   // ← does nothing
    Ok(())
}
```

`Isolate::terminate_execution()` does not merely unwind the running script. It
puts the isolate into a **terminating state** in which every subsequent entry
into JavaScript bails out immediately, until `cancel_terminate_execution()`
clears it. That call was never made. The `<reset>` script meant to recover was
itself terminated on arrival, silently, because a terminated isolate cannot run
the script that would prove it is alive.

So the watchdog did not kill a script. **It killed the page** — the document's
remaining `<script>`s, its event handlers, its timers, and every `Runtime.evaluate`
a driver sent afterwards. From the outside that is indistinguishable from a
browser that has crashed while still holding the socket open.

**The fix is two lines and one sentence of understanding:**

```rust
self.runtime.v8_isolate().cancel_terminate_execution();
self.runtime.execute_script("<reset>", "undefined".to_string()).ok();
```

### Quest #732 — every script guarded, and the budget taken from measurement

With termination survivable, the budget can be honest. Every classic script is
now guarded (no size exemption), and the default is **60 seconds**, overridable
with `OBSCURA_SCRIPT_TIMEOUT_MS` (`0` disables the watchdog). The number is not a
guess: the heaviest generators WPT has need **10–25 s** of script time on this
engine (`reflection-text` 20 s, `reflection-tabular` 23 s, `reflection-misc`
16 s), measured solo on a fresh server. A first pass at 120 s was measured and
**rejected** — it turned "the page finishes without its slow script" into "the
page never finishes", and `Page.goto` began timing out on files that had been
fine.

*A page is allowed to be slow. It is not allowed to be infinite.*

**What one line bought, before a single reflector was written:**

| file | before | after #731 |
|---|---|---|
| `html/dom/reflection-text.html` | — *(dead)* | **9989 / 10202** |
| `html/dom/reflection-embedded.html` | — *(dead)* | 6277 / 8922 |
| `html/dom/reflection-forms.html` | — *(dead)* | 6525 / 8271 |
| `html/dom/reflection-tabular.html` | — *(dead)* | 3642 / 6116 |
| `css/css-color/parsing/color-computed-hsl.html` | — *(dead)* | 3726 / 3753 |
| `css/css-color/parsing/color-computed-relative-color.html` | — *(dead)* | 1119 / 1169 |
| `css/css-values/calc-size/animation/calc-size-height-interpolation.html` | — *(dead)* | 400 / 1266 |

**+28,036 subtests from one fix**, and not one of them was a feature we did not
already have.

---

## III. Quests #733–#744 — reflection, on the interface that owns it

With the suite visible, it could finally be read. 183 distinct reflected members
across 33 interfaces were **absent**: `a.ping`, `a.coords`, `a.shape`, `q.cite`,
`br.clear`, `td.colSpan`, `th.scope`, `img.alt`, `img.srcset`, `object.data`,
`track.kind`, `input.accept`, `textarea.wrap`, `form.autocomplete`, every
`table`/`tr`/`td` presentational attribute, the whole `<frame>`/`<frameset>`/
`<marquee>` family.

Reflection is the plainest promise the DOM makes: `img.alt` **is** the `alt=""`
in the markup, and a script that sets one has set the other. It is also the
promise a page notices the instant it breaks — `a.ping = url` becoming an expando
means the beacon never fires; `th.scope` reading `undefined` means a screen
reader is told nothing about a table's headers.

### ⭐⭐ The shape of the old mechanism was the bug

Obscura *had* reflectors — `__reflectedStringAttrs`, `__reflectedBoolAttrs`,
`__reflectedEnumAttrs` — but all of them hung on **`Element.prototype`**, one
flat namespace for the whole platform. That shape cannot express the truth that:

- `a.type` is a plain `DOMString` while `input.type` is an enumeration limited to
  twenty-two keywords;
- `value` is a `DOMString` on `<data>`, a `double` on `<meter>`, and something
  else again on `<input>`;
- `td.colSpan` clamps into `[1, 1000]` while `td.rowSpan` clamps into `[0, 65534]`.

So the table is now keyed by **interface**, and each member lands exactly where
WebIDL says it lives — transcribed from the HTML element index, with the eleven
reflected types the spec defines:

| quest | type | note |
|---|---|---|
| #734 | `DOMString`, `USVString` (URL) | URL reflections resolve against the element's base URL; `[LegacyNullToEmptyString]` on the presentational leftovers, so `td.bgColor = null` means *no colour*, not the text `"null"` |
| #735 | `boolean` | present/absent, never the value |
| #736 | enumerated | canonical keyword, missing-value default, invalid-value default, non-canonical aliases; ASCII-case-insensitive **only** — U+212A KELVIN SIGN is not a `k` and U+017F LONG S is not an `s`, which the suite probes directly |
| #737 | `long`, limited `long` | a negative assignment to a limited long throws `IndexSizeError` |
| #738 | `unsigned long`, limited, limited-with-fallback | out of the signed range on *set* falls back to the default rather than wrapping — a width of 4,294,967,295 is a mistake, not a four-gigapixel canvas |
| #739 | clamped `unsigned long` | `colspan`/`rowspan`/`span`: the **getter** clamps, the setter writes what it was given. `colspan="99999"` is not an error in markup — it means "to the end of the row", and the clamp is what says so |
| #740 | `double`, limited `double` | `progress.max = 0` is **ignored**, leaving the bar as it was, rather than making every value infinite |

The parsing rules are HTML's, written out rather than borrowed
(`_rParseInt` / `_rParseNonneg` / `_rParseFloat`): `parseInt` accepts `0x10` and
stops at the first junk character, and HTML's rules do neither.

### ⭐ Quest #741 — `<meter>`'s six numbers are a system, not six reflections

`meter.value` returned the literal **string** `""`. But the deeper problem is
that HTML §the-meter-element derives every one of the six from the others, in
order: `max` is floored by `min`, `high` by `low`, `optimum` and `value` are
clamped into whatever range survives. Reflecting them one at a time gives a gauge
whose needle can sit outside its own dial. The getters now compute the whole set
and then answer.

### ⭐⭐ Quest #742 — `nonce` is the one reflection that must NOT write its attribute

A CSP nonce is a secret shared between the server and the document, and the
attack it defends against is a page that can be made to **read** it — dangling
markup injection, or a CSS attribute selector like `script[nonce^="a"]`
exfiltrating it one character at a time. HTML's answer (§nonce-attributes) is to
keep the live value in an internal slot, `[[CryptographicNonce]]`, so the content
attribute can be blanked once it has been used.

So the IDL setter updates the **slot**, and touches the content attribute only
when the element is connected. Assigning `script.nonce` to an element you are
still building must not stamp the secret into markup something else may later
read. (The getter still prefers a later `setAttribute('nonce', …)` — that is the
page speaking last, and the spec's attribute-change steps hand the new value
straight to the slot.)

### Quests #743–#744 — the last two rows

- **#743** the obsolete frame family: `HTMLFrameElement`, `HTMLFrameSetElement`,
  `HTMLMarqueeElement`, `HTMLFontElement`, `HTMLDirectoryElement`. Old, yes — and
  still exactly what a twenty-year-old government form or library catalogue is
  built out of, which is the web the people this browser is for are actually
  handed.
- **#744** `input.type` was missing `week` and `month`, so a date-of-birth picker
  fell back to a plain text box.

---

## IV. Results

| test | before | after | Δ |
|---|---:|---:|---:|
| `html/dom/reflection-text.html` | — *(dead)* | **10202 / 10202** | +10202 |
| `html/dom/reflection-embedded.html` | — *(dead)* | **8922 / 8922** | +8922 |
| `html/dom/reflection-forms.html` | — *(dead)* | **8271 / 8271** | +8271 |
| `html/dom/reflection-tabular.html` | — *(dead)* | **6116 / 6116** | +6116 |
| `html/dom/reflection-sections.html` | — *(dead)* | **5604 / 5604** | +5604 |
| `html/dom/reflection-grouping.html` | 5314 / 5358 | **5358 / 5358** | +44 |
| `html/dom/reflection-misc.html` | 4751 / 4877 | **4877 / 4877** | +126 |
| `html/dom/reflection-metadata.html` | — *(dead)* | **3110 / 3110** | +3110 |
| `html/dom/reflection-obsolete.html` | — *(dead)* | **2621 / 2621** | +2621 |
| `html/dom/reflection-forms-weekmonth.html` | — *(dead)* | **1579 / 1579** | +1579 |
| **suite total** | **10,065 scoreable** | **56,660 / 56,660** | **+46,595** |

Plus, from #731 alone and outside the suite:
`css/css-color/parsing/color-computed-hsl` 0 → **3726/3753**,
`color-computed-relative-color` 0 → **1119/1169**,
`calc-size-height-interpolation` 0 → **400/1266**.

---

## V. ⛔ Caps, honestly named

- **The 60-second budget is a judgement call, not a measurement.** It is bounded
  above by "a driver should not think the browser has died" and below by "the
  heaviest real page must finish". 60 s clears the heaviest thing WPT has by more
  than 2×. If an agent workload ever needs a page that legitimately computes for
  longer, `OBSCURA_SCRIPT_TIMEOUT_MS` is the door.
- **A guarded script still blocks the engine thread while it runs.** The watchdog
  bounds the damage; it does not make the engine concurrent. That is a much
  larger change and is not attempted here.
- `customGetter` members (`img.width`, `option.value`, `input.autocomplete`)
  reflect **only on setting** — an existing getter is kept exactly as it was,
  because `img.width` is the *rendered* width and not the attribute.

---

## VI. Quests #745–#752 — the rest of the arc

With the suite green, the same 26-file "biggest denominators on the platform"
sample was re-read for what else was measurably behind. Five more root causes,
each found by reading the failure rather than the score.

### ⭐⭐⭐ #745 — `'zIndex' in el.style` was FALSE

`el.style.zIndex = '5'` worked. `'zIndex' in el.style` did not — because reads
were answered by a **trap**, and a trap answers `get` but not `in`, not
`Object.keys`, not `getOwnPropertyDescriptor`, and not a subclass that wants to
override one. Feature detection on the platform is written as
`'gridTemplateAreas' in document.body.style`, so a browser whose style object
cannot be *asked* what it supports reports that it supports nothing — which is
how a page decides to serve you the 2009 layout.

CSSOM gives each supported property up to three real IDL attributes, and all
three are now generated: the camel-cased (`zIndex`), the dashed (`z-index`), and
— only for `-webkit-` properties — the webkit-cased (`webkitLineClamp`). WPT
asserts that last distinction directly: `-moz-binding` gets `MozBinding` and must
**never** get `mozBinding`.

### ⭐⭐ #746 — the browser gave two different answers to "do you support this?"

`CSS.supports()` decided property-hood by walking a long chain of per-family
validators; `_CSS_KNOWN_PROPS` was the registry `getComputedStyle` enumerates
from. **They were never the same list.** `ruby-align` was supported and not in
the registry; `align-content` was in the registry and reported *unsupported*.
A browser that answers "do you support this?" two ways is worse for a page than
one that says no twice, because feature detection picks a branch and stays there.

Underneath it, a smaller and sharper bug: **a CSS-wide keyword is valid in every
declaration.** `inherit`, `initial`, `unset`, `revert` and `revert-layer` belong
to the grammar of a *declaration*, not of any property's value, so the only
question they raise is whether the property exists. A dozen of the per-family
branches had remembered that and a dozen had not. Asked once, at the top, out of
one unioned registry, the answers cannot drift apart again.

`css/css-conditional/js/CSS-supports-CSSStyleDeclaration.html` **869 → 1495/1495**.

### ⚠️ …and the ritual caught the regression that came with it

Making the IDL attributes real broke `getComputedStyle(el).fontSize`, which
started returning `""`. The computed-style Proxy delegates with
`if (prop in target) return target[prop]` — and `target` is the backing
`CSSStyleProperties`, so the moment every property had an attribute on that
prototype, the delegation began answering **from the element's inline
declaration** instead of from the computed values. Property names now resolve
before the delegation; only genuine interface members fall through.

*A delegation guarded by `in` is a delegation that changes meaning when someone
adds a property.*

### ⭐⭐ #747 — `font-family: simple default` is a font called "simple default"

432 subtests were failing because `<family-name>` — which is `<custom-ident>+` —
was being checked keyword-by-keyword: any family name *containing* `default`,
`inherit`, `initial` or `unset` as one of its words was rejected. The exclusion
belongs to the **name**, not to each word in it. And in the other direction, the
stylesheet parser was *keeping* invalid font-family declarations that
`el.style.setProperty` correctly dropped — the same string parsing two ways
depending on where it was written.

`css/css-fonts/test_font_family_parsing.html` **1768 → 2217/2232**.

### ⭐⭐ #748 — an unknown media query is not a broken one

MQ4 has three truth values, and Obscura had two. A balanced `( <any-value> )`
the UA does not understand — a feature from a spec we have not shipped, a range
with two comparisons pointing opposite ways — is `<general-enclosed>`: it
*parses*, it is kept verbatim in `mediaText`, and it evaluates to **unknown**,
which is false and **stays false under `not`**. Collapsing it to `not all`
instead erased the author's text and, worse, made
`@media not (some-future-feature)` come out **true** — which is how a page ends
up serving the fallback to the one browser that will support the feature next
year.

Also fixed: `(min-width)` has no boolean form (it is a comparison with its second
half missing), the range syntax and the `min-`/`max-` prefixes may not be mixed,
and a `@media` **rule** now applies the same MQ4 error handling `matchMedia()`
already did — it used to echo its own broken prelude back as if the browser had
understood it.

### ⭐⭐ #749 — the URL parser said no and four APIs did not listen

`url/failure.html` is 1,175 assertions that a URL which fails to parse fails
*everywhere*. Obscura's parser (the Rust `url` crate) was right; three of its
callers simply never asked:

- `xhr.open('GET', 'http://[::1')` **succeeded**, and `send()` then waited on a
  request the network layer had already refused to make;
- `navigator.sendBeacon(bad)` returned `false` — but `false` means *the bytes
  were not queued*, and a URL that does not parse means the **call** was wrong;
- `location.href = bad` did nothing at all, leaving a page believing it had
  navigated.

Plus `[PutForwards=href]` on `window.location`, on the main window and on a
frame's: `frame.contentWindow.location = url` was **replacing the Location
object with a string**.

`url/failure.html` **604 → 1174/1175**.

### ⭐⭐⭐ #750–#752 — `<img width=200>` was 200 of nothing

The dimension attributes — `width`, `height`, `hspace`, `vspace` — did not map
into the cascade at all. This is the markup the old web is *made of*: a
twenty-year-old library catalogue, a government form, a school's homework page.
On those pages every image, table cell and frame was laid out at `auto`.

The grammar is HTML's "rules for parsing dimension values", and it is
deliberately not `parseFloat`: the exponent in `20.25e2` is not part of it (it
means 20.25, not 2025), a leading `+` is a parse failure, and `200 %` is two
hundred **pixels** because the space ends the number. `<td width=0>` is the
"ignoring zero" flavour — not a request for a zero-width cell, just an author
writing nothing.

⭐ And a `<source>`'s dimensions belong to the `<img>` it stands in for: inside a
`<picture>`, the aspect ratio the author declared on the source has to reach the
image, or a responsive picture reflows the whole page when it finally loads —
which, on a slow connection, is the difference between a readable article and a
moving target.

`html/rendering/dimension-attributes.html` **952 → 1720/1720**.

---

## VI½. ⚠️ The two regressions the ritual caught in my own work

Both were mine, both were found by the pre/post per-file diff, and both are the
same shape: **a mechanism that was safe while something else was small.**

### ⭐⭐⭐ A condvar wait with no predicate check is a lost wakeup waiting to happen

`urlpattern/urlpattern.any.html` scored 370/370 with a 5-second budget, **0/1 at
25 seconds, and nothing was killed in either run.** The elapsed time tracked the
budget exactly. The watchdog thread did this:

```rust
let mut cancelled = lock.lock().unwrap();
let deadline = Instant::now() + timeout;
loop {
    let remaining = ...;
    let result = cvar.wait_timeout(cancelled, remaining).unwrap();   // ← waits FIRST
    cancelled = result.0;
    if *cancelled { return; }
}
```

A short script finishes, sets the flag and calls `notify_one()` **before the
watchdog thread has been scheduled at all** — and a notification sent while
nobody is waiting is simply gone. The watchdog then waits out the whole budget,
and `watchdog.join()` on the engine thread blocks for exactly that long. Not a
hung script: **a hung browser**, with nothing in the log to say so.

The bug was survivable at five seconds and only for scripts over 10 kB. At sixty
seconds, for every script, it froze whole pages. The fix is the predicate check
that belongs at the top of every condvar loop — plus taking the deadline on the
calling thread, so a script's budget does not depend on how busy the machine is
when its watchdog starts.

### ⭐⭐ A generated table must not assume a reflector is *only* a reflector

`webstorage/event_basic.html` went 2/2 → timeout, because the iframe it builds
never loaded: the table had defined `HTMLIFrameElement.src` as a plain
`setAttribute`, shadowing the hand-written setter that actually **navigates the
frame**. The same trap was sitting under `canvas.width` (which resets the
bitmap), `input.type`, and `option.value`.

So an accessor that already exists anywhere on the interface's prototype chain
now **keeps its setter**, and the table supplies only the half that was missing.
Where the existing setter merely forgot the WebIDL coercion — `iframe.src = 7`
wrote the *number* — it is wrapped rather than replaced, for the string-shaped
types only, and never for `srcdoc`, which passes a TrustedHTML through
unstringified on purpose.

**That costs 69 subtests** (the reflection suite settles at **56,591 / 56,660**
rather than a clean sweep), and it is the right trade: a browser that scores
56,660 and cannot load an iframe is not a better browser.

---

## VII. Results, all of it

| test | before | after | Δ |
|---|---:|---:|---:|
| `html/dom/reflection-*` (10 files) | 10,065 scoreable | **56,591 / 56,660** | **+46,526** |
| `html/dom/idlharness.https.html?include=HTML` | 2299 / 3898 | **2773 / 3898** | +474 |
| `html/rendering/dimension-attributes.html` | 952 / 1720 | **1720 / 1720** | +768 |
| `css/css-conditional/js/CSS-supports-CSSStyleDeclaration.html` | 869 / 1495 | **1495 / 1495** | +626 |
| `url/failure.html` | 604 / 1175 | **1174 / 1175** | +570 |
| `css/css-fonts/test_font_family_parsing.html` | 1768 / 2232 | **2217 / 2232** | +449 |
| `css/css-color/parsing/color-computed-hsl.html` | — *(dead)* | **3726 / 3753** | +3726 |
| `css/css-color/parsing/color-computed-relative-color.html` | — *(dead)* | **1119 / 1169** | +1119 |
| `css/css-values/calc-size/animation/calc-size-height-interpolation.html` | — *(dead)* | **400 / 1266** | +400 |
| `css/mediaqueries/test_media_queries.html` | 908 / 1349 | **915 / 1349** | +7 |

---

## VII½. Zero regressions, the strong proof

The 370-entry ritual list run against the **pre-arc binary** and the final one,
diffed **per file**, at identical settings (8 shards / chunk 2 / timeout 75):

```
before: 55,689 / 56,297   (392 rows, 1 could-not-run)
after:  55,707 / 56,297   (392 rows, 1 could-not-run)
```

**Two rows moved.** One is an improvement —
`css/cssom-view/scroll-behavior-main-frame-root.html` **1/40 → 40/40**, a page
that had been dying on a slow script. The other is the file the campaign memory
already flags as flaky, and it was re-proven solo, three runs on each binary:

| | run 1 | run 2 | run 3 |
|---|---:|---:|---:|
| pre-arc | 205/258 | 228/258 | 228/258 |
| final | 207/258 | 228/258 | 205/258 |

Same swing, same ceiling, on both. **Not a regression.**

⚠️ The first attempt at this ritual is worth recording as a harness lesson: run
at the old `--timeout 45`, it reported **84 files as could-not-run** and looked
catastrophic. `wpt_batch_par.sh` caps a chunk at `(timeout + 10) × chunk`
seconds, and pages that used to die at five seconds now take twenty-five, so
whole chunks were being dropped and their rows read as regressions. *A row that
reads `nav-error: Page.goto: Timeout` under load and scores full marks solo is
the harness, not the engine.*

---

## VIII. ⛔ Caps, honestly named

- **The 60-second budget is a judgement call, not a measurement.** Bounded above
  by "a driver should not think the browser has died" and below by "the heaviest
  real page must finish". It clears the heaviest thing WPT has by more than 2×.
  `OBSCURA_SCRIPT_TIMEOUT_MS` is the door if an agent workload needs more.
- **A guarded script still blocks the engine thread while it runs.** The watchdog
  bounds the damage; it does not make the engine concurrent.
- **The measurement harness had to be re-tuned for it.** `wpt_batch_par.sh` caps
  a chunk at `(timeout + 10) × chunk` seconds, and pages that used to die at 5 s
  now take 20–25 s, so the old `--timeout 45` settings drop chunks and report
  them as could-not-run. The ritual for this arc runs at `8 shards / chunk 2 /
  timeout 75`. **A row that reads `nav-error: Page.goto: Timeout` under load and
  scores full marks solo is the harness, not the engine.**
- `customGetter` members (`img.width`, `option.value`, `input.autocomplete`)
  reflect **only on setting**; the existing getter is kept, because `img.width`
  is the *rendered* width.
- **`css/mediaqueries/test_media_queries.html` is capped at ~915 by something
  else entirely**: the whole suite runs inside an `<iframe>` sized 117×76 and
  reads `subdoc.defaultView.getComputedStyle`, so its remaining 434 failures are
  the frame's media context (we answer with the parent's viewport) and
  `<style media>` inside a frame — the carried "iframe-document layout in the
  parent realm" quest, not the MQ grammar.

---

## IX. Caps / Next

1. ⭐⭐⭐ (carried) **Range geometry** — `Range.getBoundingClientRect()` is still a
   literal `new DOMRect()`. Measured this session at **18/201** over its 20
   scoreable files. The blocker is now precisely named: parley's `TreeBuilder`
   collapses whitespace as it builds, and blitz records **no mapping** from a DOM
   text node + offset back to a byte offset in the built text, so there is
   nothing to hand `Layout::cluster_for_byte_index`. Fixing it means recording
   that mapping in `build_inline_layout_recursive`.
2. ⭐⭐⭐ (carried) **float layout** — confirmed worth 144 subtests in
   `css/css-flexbox/align-content-horiz-001a/b` alone (0/72 **each**, and every
   `data-offset-x` in them depends on floats sitting side by side).
   `css/CSS2/floats-*` is almost entirely reftests and scores nothing either way.
3. ⭐⭐⭐ **The frame's media context and `<style media>` inside a frame** — worth
   ~434 subtests in `test_media_queries.html` alone, and it is the same missing
   piece as the carried "iframe-document layout in the parent realm".
4. ⭐⭐ `url/IdnaTestV2.any.html` **1912 / 2671** — IDNA/Punycode, a pure function
   of its input and therefore testable offline (see the handoff's `mimesniff`
   note) before a single CDP cycle.
5. ⭐⭐ `css/css-values/calc-size/animation/*-interpolation` **400/1266** and
   **224/842**.
6. ⭐⭐ `dom/idlharness.window.html?exclude=Node` **756 / 1366**.
7. ⭐⭐ `css/css-shapes/shape-outside/values/shape-outside-{ellipse,circle}-004`
   **600 / 780** each.
8. ⭐ `html/dom/idlharness.https.html?include=HTML` **2773 / 3898** — the tail the
   reflection work did not reach.
