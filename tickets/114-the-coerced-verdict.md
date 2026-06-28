# Quest #114 — The Coerced Verdict

> *The spec asks for an `unsigned long`, and JavaScript hands it whatever it likes.
> The job is to make `-1` mean four billion before anyone reads it.*

**Realm:** `dom/nodes/CharacterData-substringData.html`, `-deleteData.html`,
`-replaceData.html`, `-insertData.html`, `-appendData.html` — the #113-named
"next leverage" CharacterData mutator tail.
**Result:** substringData **14/28 → 28/28**, deleteData **12/18 → 18/18**,
replaceData **30/34 → 34/34**, insertData **14/18 → 18/18**, appendData
**12/14 → 14/14**. All five now 100%. **+30 total.**

## The gap

The `offset` and `count` parameters of `substringData`/`insertData`/`deleteData`/
`replaceData`/`appendData` are all WebIDL **`unsigned long`**. Per WebIDL, an
ECMAScript value passed where an `unsigned long` is expected is converted with
**ToUint32** — ToNumber, then (for finite non-zero) truncate toward zero, then
modulo 2³². Our mutators used the raw JS number, so every failing subtest was one
of these coercion edge cases:

| Call (data = `"test"`) | ToUint32 result | Expected behaviour |
|---|---|---|
| `deleteData(-1, 10)` | offset `4294967295` | `> length` → `IndexSizeError` |
| `deleteData(2, -1)` | count `4294967295` | clamp to tail → `"te"` |
| `deleteData(1, -0x100000000 + 2)` | count `2` | delete 2 at 1 → `"tt"` |
| `replaceData(-1, 1, "x")` | offset `4294967295` | `> length` → `IndexSizeError` |
| `substringData(0x100000000 + 2, 1)` | offset `2` | `"s"` |
| `substringData(-0x100000000 + 2, 1)` | offset `2` | `"s"` |
| `substringData("test", 3)` | offset `ToUint32(NaN) = 0` | `"tes"` |
| `substringData(2, 0x100000000 + 1)` | count `1` | `"s"` |
| `substringData(0, -1)` | count huge | `offset+count > length` → tail `"test"` |

Plus the WebIDL **required-argument** rule: a call missing a required arg throws
`TypeError` *before* any of the above runs:

- `substringData()` and `substringData(0)` → `TypeError` (2 required args)
- `appendData()` → `TypeError` (1 required arg) — was silently appending the
  string `"undefined"`.

## The key realisation

`x >>> 0` in JavaScript **is** ToUint32 — the `>>>` operator is *defined* to apply
ToUint32 to its left operand. The codebase already uses exactly this idiom in
`Range.setStart`/`setEnd` (`offset = offset >>> 0`) and `Text.splitText`. So the
whole coercion is two `>>> 0`s in the right place — no bespoke modular arithmetic.

`(-1) >>> 0` → `4294967295`; `(-0x100000000 + 2) >>> 0` → `2`;
`(0x100000000 + 1) >>> 0` → `1`; `"test" >>> 0` → `0` (NaN → 0); `4.9 >>> 0` → `4`.

## The fix (pure JS, additive — `bootstrap.js`)

1. **Shared `__obscura_replaceData` primitive** (underlies `insertData`,
   `deleteData`, `replaceData`, `appendData`): coerce at the very top —
   ```js
   offset = offset >>> 0; count = count >>> 0;
   ```
   The pre-existing `if (offset > old.length) throw IndexSizeError` and
   `if (offset + count > old.length) count = old.length - offset` then do the
   right thing for the huge coerced values (out-of-bounds throw; tail clamp).

2. **`substringData`** rewritten to spec ("substring data"): require 2 args
   (`arguments.length < 2` → `TypeError`), coerce both via `>>> 0`, throw
   `IndexSizeError` when `offset > length`, return `data.slice(offset)` when
   `offset + count` overruns the end, else `data.slice(offset, offset + count)`.

3. **`appendData`** gains a `arguments.length < 1` → `TypeError` guard.

Internal Range callers route through these primitives with plain in-bounds
integers (`sc.substringData(so, eo - so)`, `sc.deleteData(so, …)`), for which
`>>> 0` is the identity and `arguments.length` is always 2 — so the blast radius
on the Range content-ops is nil.

## Results

| Test | Before | After |
|---|---|---|
| `CharacterData-substringData.html` | 14/28 | **28/28** ✅ |
| `CharacterData-deleteData.html` | 12/18 | **18/18** ✅ |
| `CharacterData-replaceData.html` | 30/34 | **34/34** ✅ |
| `CharacterData-insertData.html` | 14/18 | **18/18** ✅ |
| `CharacterData-appendData.html` | 12/14 | **14/14** ✅ |

## Zero-regression sweep

The primitives are used internally by the Range content-ops, so those were the
priority: `Range-extractContents` 187, `Range-deleteContents` 125,
`Range-cloneContents` 187, `Range-surroundContents` 1840, `Range-comparePoint`
5580, `Text-splitText` 6/6, `Node-normalize` 4/4 — all held. Wider ritual:
`Element-classlist` 1420, `Document-createElement` 147,
`ParentNode-querySelector-All` 1975, `Node-properties` 726 — all held.

(Dev-loop note: `qsa` lives at `dom/nodes/ParentNode-querySelector-All.html` —
hyphen before "All". The un-hyphenated path 404s as a could-not-run, not a
regression.)

## Caps / Next

The entire CharacterData mutator family is now 100%. The named next leverage from
#113 still stands: the `__obscura_liveRanges` registry is a real primitive — wire
it into the **other** spec range-mutation hooks (node insert/remove pre-remove
steps, `splitText`, `normalize`) for more Range / `*-mutations` greens. CSS
`%`→used-px against the containing block stays layout-capped (#109/#110).
