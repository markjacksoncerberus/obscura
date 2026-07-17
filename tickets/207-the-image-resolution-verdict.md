# Quest #207 — The Image-Resolution Verdict

**Realm:** `css/css-images/parsing/` (the `image-resolution` longhand)
**Result:** `image-resolution-invalid` **0/5 → 5/5** (`-valid` held **12/12**).
**+5, ZERO regressions.**
**Commit:** `feat(css-images): a pure rejection gate for image-resolution — _isValidImageResolution`

## The gap

`image-resolution = [ from-image || <resolution> ] && snap?` (CSS Images 4 §7) had **no
value handling at all** — it was registered only in the `_GCS_DEFAULTS` table and every
value fell through to the generic raw-store path, kept byte-for-byte.

- `-invalid` **0/5** — five malformed values the property must REJECT, all silently
  accepted by raw-store.
- `-valid` **12/12** — already passing, and this is the subtle part: **no browser ships
  `image-resolution`**, so WPT's `-valid` file omits the third `serializedValue` argument
  to `test_valid_value` → it expects the value to serialize back to *the author's own
  byte-order* (`snap 7.5dpi` stays `snap 7.5dpi`, not reordered to `7.5dpi snap`). Our
  raw-store already delivers exactly that.

So the fix could not be a canonicalizer (any reorder would break the 12 valid
round-trips). It had to be the **#202 pattern taken to its limit**: a *pure rejection
gate* that leaves a valid value byte-identical.

## The grammar

`[ from-image || <resolution> ] && snap?`

- The **group** `[from-image || <resolution>]` is required: at least one of `from-image`
  / a `<resolution>` must be present, and each appears **at most once**, in either order.
- `snap` is optional (`?`), appears at most once, and — sitting on the **other side of the
  `&&`** from the group — may appear only *before* or *after* the group as a whole, never
  interleaved into it.

Reading the two files against that grammar:

| Value | Verdict | Why |
|-------|:-------:|-----|
| `auto` | invalid | not `from-image`, not a `<resolution>`, not `snap` — group empty |
| `100%` | invalid | `<percentage>` is not a `<resolution>` |
| `2` | invalid | bare `<number>` is not a `<resolution>` |
| `3dpi snap from-image` | invalid | `snap` split into the middle of the group |
| `from-image snap 4dppx` | invalid | `snap` split into the middle of the group |
| `1dpi`, `from-image`, `2dpcm from-image`, `4dpi snap`, `snap 7.5dpi`, `snap -8dpcm from-image`, `snap from-image 0dppx`, … | valid | group present, `snap` (if any) at an edge |

## The fix — `_isValidImageResolution`

A single predicate next to `_serObjectFit`:

```js
const _RESOLUTION_UNITS = new Set(['dpi', 'dpcm', 'dppx', 'x']);
const _isResolutionTok = (t) => {
  const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?([a-z]+)$/.exec(String(t).toLowerCase());
  return !!m && _RESOLUTION_UNITS.has(m[1]);
};
const _isValidImageResolution = (value) => {
  const toks = _wsTokens(String(value).trim());
  if (toks.length < 1 || toks.length > 3) return false;
  const snaps = toks.filter(t => t.toLowerCase() === 'snap');
  if (snaps.length > 1) return false;
  let group = toks;
  if (snaps.length === 1) {
    const idx = toks.findIndex(t => t.toLowerCase() === 'snap');
    if (idx !== 0 && idx !== toks.length - 1) return false;   // snap split into the group
    group = toks.filter(t => t.toLowerCase() !== 'snap');
  }
  if (group.length < 1 || group.length > 2) return false;      // group is required
  let fromImage = 0, res = 0;
  for (const t of group) {
    if (t.toLowerCase() === 'from-image') fromImage++;
    else if (_isResolutionTok(t)) res++;
    else return false;                                         // auto / 100% / 2 / …
  }
  return fromImage <= 1 && res <= 1 && (fromImage + res) >= 1;
};
```

Key move: because `snap` is one token and the group is contiguous, "snap is not interior"
reduces to "snap is at index 0 or last". Remove it and the remaining 1–2 tokens *are* the
group — no separate contiguity check needed. `<resolution>` reuses the `dpi/dpcm/dppx/x`
unit set already present in `_UNIT_KIND`.

Wired as an `image-resolution` branch in **both** setProperty paths (the inline
declaration-block path ~937 and the CSSOM API path ~1372), guarded so CSS-wide keywords
and `var()`/`env()` defer, and — crucially — **the value is left untouched when valid**, so
the `-valid` file's verbatim round-trips are preserved:

```js
} else if (name === 'image-resolution') {
  const low = value.toLowerCase();
  if (!_CSS_WIDE.has(low) && !_TF_VAR_RE.test(value)) {
    if (!_isValidImageResolution(value)) continue;   // invalid → drop (value kept verbatim)
  }
}
```

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `image-resolution-invalid` | 0/5 | **5/5** |
| `image-resolution-valid` | 12/12 | 12/12 (held) |

**+5, ZERO regressions.**

Zero-regression sweep held: gradient-interpolation-method-invalid 292/292 + -valid
1398/1398, gradient-position-invalid 9/9 + -valid 18/18,
conic-gradient-calc-angle-percentage-invalid 4/4 + -valid 6/6, image-function-invalid 6/6,
object-fit-invalid 5/5 + -valid 9/9, object-position-valid 18/18, image-orientation-invalid
12/12, image-rendering-invalid 2/2, background-image-invalid 12/12 + -valid 13/13,
background-valid 45/46 (pre-existing cap), background-computed 39/39, mask-image-computed
47/47, qsa 1975.

## Caps / Next

- **CAP:** none in this file (5/5).
- **NEXT:** `css/css-images/parsing/` is now essentially fully green — every `*-invalid`
  file there passes. Move to a **NEW `css/*/parsing/` dir** and baseline its `*-invalid`
  files for the same raw-store tell: an `*-invalid` file at 0/N while its paired `*-valid`
  already passes means the property is stored raw with no validation, and a parallel
  rejection gate (the #202→#207 pattern) turns it green without risking the valid side.
  grep `_isValidImageResolution`.
