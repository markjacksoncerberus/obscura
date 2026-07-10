# Quest #178 — The Suggestions Verdict (+8)

**Realm:** `html/semantics/forms/the-input-element/input-list.html` + `maxlength.html`
**Result:** input-list 0/6 → **6/6**, maxlength 3/5 → **5/5** (both 100%). **ZERO regressions.**
**Session:** 2026-07-10

## The gap

Two small, self-contained `HTMLInputElement` IDL primitives were missing/wrong —
picked as a cheap wide-ish follow-on to #177's input-activation work, both in the
same `bootstrap.js` reflected-attribute block:

**1. `input.list` didn't exist** (`0/6`). The getter returned `undefined`, so every
subtest of `input-list.html` failed at `assert_equals(...list, <datalist|null>)`.
The spec (HTML §4.10.5) defines `list` as returning the input's **suggestions
source element**: the element the `list` content attribute's ID points at, but
only if that element is a `<datalist>`. The subtlety the test targets is
**getElementById tree-order**: when an earlier non-`<datalist>` and a later
`<datalist>` share the same ID, `list` is `null` (the first-in-tree-order element
wins and it isn't a datalist); when the `<datalist>` comes first, `list` returns
it even though a later element reuses the ID.

**2. `maxLength`/`minLength` reflected a plain `long`** (`3/5`). They reflect a
`long` **"limited to only non-negative numbers"**, which the generic `_cvReflLong`
ignored:
- Setting a negative integer (`el.maxLength = -5`) must throw **`IndexSizeError`**
  — Obscura silently `setAttribute`d `"-5"`.
- Setting a non-numeric value (`el.maxLength = "not-a-number"`) must go through the
  Web IDL `long` (ToInt32) conversion → `0`, not `-1` — Obscura stored the raw
  string and the getter parsed it back to `-1`.

## The fix (`bootstrap.js`)

**`_cvReflLong` → limited-to-non-negative reflector** (shared by `maxLength` and
`minLength` on `<input>`/`<textarea>` — its only two callers):
- **getter:** a missing, non-numeric, *or negative* content attribute maps to the
  default `-1` (added the `n < 0` clause).
- **setter:** `n = isFinite(Number(v)) ? (n | 0) : 0` (ToInt32; `"not-a-number"` →
  `0`), then throw `IndexSizeError` if `n < 0`, else `setAttribute` the integer.

**New `HTMLInputElement.prototype.list` getter:**
```js
get() {
  const t = (this.getAttribute("type") || "text").toLowerCase();
  if (_listNoApply.has(t)) return null;          // hidden/password/checkbox/radio/
                                                  // file/submit/image/reset/button
  const id = this.getAttribute("list");
  if (id == null || id === "") return null;
  const root = this.getRootNode();
  const cand = (root && typeof root.getElementById === "function")
    ? root.getElementById(id)
    : (this.ownerDocument ? this.ownerDocument.getElementById(id) : null);
  return (cand && cand.tagName === "DATALIST") ? cand : null;
}
```
`getRootNode().getElementById` gives spec-correct first-in-tree-order lookup (works
for both a connected document and a `DocumentFragment` root; falls back to
`ownerDocument` for a detached element root).

## Results

| Test | Before | After |
|------|:------:|:-----:|
| `the-input-element/input-list.html` | 0/6 | **6/6** |
| `the-input-element/maxlength.html` | 3/5 | **5/5** |

**ZERO regressions** — swept: minlength 5/5, checkbox 6/6, radio 12/12,
select-validity 5/6 (pre-existing cap), form-validation-validity-valueMissing
78/78, type-change-state 380/380, qsa 1975, DOMTokenList, createElement 147,
dispatchEvent 25, popover-focus 30/30, popover-light-dismiss 25/33 (held).

## Caps / Next

- **`list` type-applicability is a static keyword-set check**, not the full
  input-type state machine; correct for every fixture (the excluded set is the
  spec's non-applicable list). No datalist *rendering* — `list` is state-only.
- The `maxLength` setter uses `n | 0` (32-bit ToInt32 wrap); faithful to Web IDL
  `long` and sufficient here.
- **Next levers** (unchanged from #177): cross-document pointerdown/up pairing
  (`popover-light-dismiss` ~8 fails — pointer-down in one document, up in another
  shouldn't dismiss); scripting-errors exact line/col. Or continue mining the
  forms realm for more small IDL primitives (the input-element realm is now nearly
  all green, so this vein is thinning — a fresh wide realm may pay better next).
