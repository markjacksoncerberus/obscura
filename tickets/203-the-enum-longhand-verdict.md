# Quest #203 — The Enum Longhand Verdict

> *Three little properties, each with a fixed vocabulary. `from-image`, `none`,
> `pixelated`, `cover scale-down` — words the grammar knows. `auto`, `30deg`,
> `flip from-image`, `contain cover` — words it does not. Obscura learned the
> difference for `image-orientation`, `image-rendering`, and `object-fit`.*

**Realm:** `css/css-images/parsing/` — the three plain-enum longhands.
**Result:** **+22, ZERO regressions.**

---

## The gap

Took #202's next-leverage: the raw-store enum longhands in the same directory.
Three properties were registered in `_GCS_DEFAULTS` / the inherit lists but had
**no value validation** — any garbage stored raw, canonical reorders never applied:

| Test | Before | Grammar |
|---|:---:|---|
| `image-orientation-invalid` | 0/12 | `from-image \| none` |
| `object-fit-invalid` | 0/5 | `fill \| none \| [contain\|cover] \|\| scale-down` |
| `object-fit-valid` | 6/9 | (3 multi-token combos mis-serialized) |
| `image-rendering-invalid` | 0/2 | `auto \| smooth \| high-quality \| crisp-edges \| pixelated` |

`image-orientation` and `image-rendering` are single-keyword enums, so a value is
valid iff it is exactly one of the keywords — any multi-token value or foreign
keyword is rejected. `object-fit` is the interesting one: a `||` combination with a
non-obvious canonical fold.

## The fix — validate + canonicalize in setProperty

Two module-level keyword sets and one fold function, next to `_serContain`:

```js
const _IMAGE_ORIENTATION_KW = new Set(['from-image', 'none']);
const _IMAGE_RENDERING_KW = new Set(['auto', 'smooth', 'high-quality', 'crisp-edges', 'pixelated']);

const _serObjectFit = (value) => {
  const low = String(value).trim().toLowerCase();
  if (low === '') return null;
  if (low === 'fill' || low === 'none') return low;
  let fit = null, scaleDown = false;
  for (const t of _wsTokens(low)) {
    if (t === 'contain' || t === 'cover') { if (fit) return null; fit = t; }
    else if (t === 'scale-down') { if (scaleDown) return null; scaleDown = true; }
    else return null;                                    // unknown / fill|none in a list
  }
  if (!fit && !scaleDown) return null;
  if (scaleDown) return fit === 'cover' ? 'cover scale-down' : 'scale-down';
  return fit;                                            // contain or cover alone
};
```

**The object-fit fold.** The `||` normally serializes the fit keyword before
`scale-down`. But `contain` is redundant beside `scale-down` (scale-down already
fits as `contain` would), so the two collapse to just `scale-down`:

| Input | Serializes to |
|---|---|
| `contain scale-down` / `scale-down contain` | `scale-down` |
| `cover scale-down` / `scale-down cover` | `cover scale-down` |
| `contain` / `cover` / `scale-down` / `fill` / `none` | itself |

The single-keyword enums need no fold — a valid value is already canonical (bar
lowercasing), and any multi-token invalid (`0 flip`, `flip from-image`,
`high-quality crisp-edges`) simply isn't in the set.

Wired identity-guarded (`!_CSS_WIDE.has(low) && !_TF_VAR_RE.test` so `inherit`/
`var()`/`env()` pass through) as branches in **both** setProperty paths (inline
~919 and API ~1339):

```js
} else if (name === 'image-orientation' || name === 'image-rendering') {
  const low = value.toLowerCase();
  if (!_CSS_WIDE.has(low) && !_TF_VAR_RE.test(value)) {
    const set = name === 'image-orientation' ? _IMAGE_ORIENTATION_KW : _IMAGE_RENDERING_KW;
    if (!set.has(low)) continue;                   // invalid enum keyword → drop
    value = low;                                   // canonical lowercase keyword
  }
} else if (name === 'object-fit') {
  const low = value.toLowerCase();
  if (!_CSS_WIDE.has(low) && !_TF_VAR_RE.test(value)) {
    const c = _serObjectFit(value); if (c == null) continue;   // invalid → drop
    value = c;
  }
}
```

No computed-getter branch needed: the computed tests use only already-canonical
inputs, and the specified value is now canonicalized on store — computed can't
regress. Reused `_wsTokens` unmodified → fully isolated (2 sets + 1 fn + 2×2 branches).

## Results

| Test | Before | After |
|---|:---:|:---:|
| `image-orientation-invalid` | 0/12 | **12/12** |
| `image-orientation-valid` | 2/2 | 2/2 (held) |
| `object-fit-invalid` | 0/5 | **5/5** |
| `object-fit-valid` | 6/9 | **9/9** |
| `object-fit-computed` | 6/6 | 6/6 (held) |
| `image-rendering-invalid` | 0/2 | **2/2** |
| `image-rendering-valid` | 5/5 | 5/5 (held) |

**+22, ZERO regressions.**

**Zero-regression sweep held:** gradient-interpolation-method-invalid 292/292,
-valid 1398/1398, image-function-valid 13/13, image-function-invalid 6/6,
object-position-valid 18/18, image-resolution-valid 12/12, cursor-invalid 10/10,
contain-invalid 14/14, will-change-invalid 127/127, line-clamp-valid 18/18,
qsa 1975/1975.

## Caps / Next

No cap in this batch — every subtest is winnable and won. The same
`css/css-images/parsing/` dir still has invalid-rejection gaps:

- **`gradient-position-invalid` 0/9** — malformed radial/conic direction & position
  preludes (`_canonGradientDirection` canonicalizes leniently; same
  lenient-canon→add-rejection pattern as #202's `_gradientInvalid`).
- **`conic-gradient-calc-angle-percentage-invalid` 0/4** (+ `-valid` 1/6) — `calc()`
  angle/percentage rules in conic stops.
- **`background-image-invalid` 0/12** (in `css/css-backgrounds/parsing/`, NOT this
  dir) — a different gradient sub-grammar: negative radial radii + `cross-fade()`
  percentage rules.
- Or a NEW `css/*/parsing/` dir (baseline the `*-invalid` files first — 0/N = the
  raw-store tell).

grep `_serObjectFit` / `_IMAGE_ORIENTATION_KW` / `_IMAGE_RENDERING_KW`.
