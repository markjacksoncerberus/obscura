# 🎲 Scroll #17 — The Entropy Gate

> *The vault that hands out randomness had no gate at all: `getRandomValues` was a
> `Math.random` fill that checked nothing, enforced nothing, and actually threw when
> handed a BigInt array. We hung the real door.*

**Realm:** `WebCryptoAPI/getRandomValues`
**Hold:** **39/39 (SECURED 100%)** — was 23/39.
**Bounty banked:** **+16.**
**Location:** `crates/obscura-js/js/bootstrap.js` — the `globalThis.crypto` IIFE (~4894),
plus `DOMException._codes` (~98) and a new `QuotaExceededError` class (~114). Pure JS.

## The beast we slew

```js
globalThis.crypto = { getRandomValues(arr) {
  for (let i=0;i<arr.length;i++) arr[i]=Math.floor(Math.random()*256); return arr; }, … };
```
It honored none of the WebCrypto contract: it never type-checked the argument, never
enforced the 65536-byte quota, happily mutated `Float32Array`/`DataView`, and — because it
assigned plain numbers element-by-element — **threw `TypeError: Cannot convert N to a
BigInt`** when handed a `BigInt64Array`/`BigUint64Array`.

## The gate (Web Crypto `getRandomValues`)

```js
getRandomValues(view) {
  if (!ArrayBuffer.isView(view)) throw new TypeError(…);              // not a view
  if (!isIntegerView(view))      throw new DOMException(…, "TypeMismatchError");  // Float*/DataView
  if (view.byteLength > 65536)   throw new QuotaExceededError(…);     // over quota
  fillRandomBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)); // fill via byte view
  return view;                                                        // SAME object
}
```

Filling through a `Uint8Array` view over the underlying buffer is the key move: it writes
raw bytes regardless of the element type, so BigInt views fill without any number→BigInt
coercion. Integer views accepted: Int8/Uint8/Uint8Clamped/Int16/Uint16/Int32/Uint32/
BigInt64/BigUint64 (and subclasses — the brand follows the typed-array kind).

## Two shared-surface fixes the harness demanded

The errors threw with the right *names* but the wrong *shape* — `assert_throws_dom` and
`assert_throws_quotaexceedederror` check more than the name:

1. **`TypeMismatchError` code.** `DOMException._codes` (the name→code map behind the `code`
   getter) was missing `TypeMismatchError`, so it returned `0`; the test wants `17`. The
   legacy `TYPE_MISMATCH_ERR: 17` constant already existed on the interface object — only
   the map entry was missing. Added `TypeMismatchError: 17`.
2. **The modern `QuotaExceededError` interface.** `assert_throws_quotaexceedederror`
   requires `e.requested`/`e.quota` to exist (nullable) **and** `e.constructor ===
   self.QuotaExceededError` — i.e. the new WHATWG `QuotaExceededError : DOMException`
   subclass, not a bare `new DOMException(…, "QuotaExceededError")`. Added the class
   (nullable `quota`/`requested`, defaulting to `null`) and the global, and throw it.

`randomUUID` was already 3/3 — the old `Math.random` template happened to produce a valid
RFC-4122 v4 string — but it's reimplemented here from random bytes alongside the rest.

## Honest caveat / to revisit

Entropy is still `Math.random`, which is **not cryptographically secure**. This scroll is
conformance only — it does not weaken anything versus the prior stub, but a genuine browser
should back `getRandomValues`/`randomUUID` with a CSPRNG. The real fix is a Rust-exposed
secure RNG op (e.g. `getrandom`) called from these functions. Left as a security follow-up.
