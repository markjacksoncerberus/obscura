# 🧂 The Derived Verdict — turning a password into a key

> **Quest #470** · realm `WebCryptoAPI/derive_bits_keys` · 2026-08-05
>
> **3,426/12,351 → 9,668/12,351. +6,242.**

---

## The gap

Quest #469 built the object model and left `deriveBits`/`deriveKey` throwing
`NotSupportedError`. That is the half of Web Crypto a login page actually
touches: **PBKDF2 is how a password a human can remember becomes a key**, and
**HKDF is how one shared secret becomes several independent ones** without any
of them weakening the others.

The realm was already scoring 3,426 without either of them, and that number is
itself worth understanding: those were the tests asserting the *errors* — a bad
hash name is `NotSupportedError`, a missing `salt` member is a `TypeError` —
which #469's normalization layer answers correctly without deriving anything.
Error handling passes long before the feature does.

## The work

The Rust primitives were already written and wired in #469 (`op_crypto_pbkdf2`,
`op_crypto_hkdf`); this quest is the policy layer:

* `deriveBits(algorithm, baseKey, length)` — with the two `InvalidAccessError`s
  kept **separate**, because they say different things: *that key is for a
  different algorithm* and *that key was never allowed to do this*.
* `deriveKey(...)` — which normalizes **three** times over two different things:
  the derivation, and the derived key's own algorithm (once to import it, once to
  ask **how long** it needs to be). "Get key length" is a property of the key you
  asked for, not of the derivation that produces it.
* `length` in **bits**, required to be a whole number of bytes; a null length is
  an `OperationError` rather than a default, because these algorithms have no
  natural output size and silently choosing one hands the caller a key of a size
  they never asked for.
* `iterations: 0` → `OperationError`. The iteration count *is* the defence.

## 🔍 The finding

**Every single remaining failure in this realm is one missing feature, and it is
not a derivation feature.** 213 of the 1,001 subtests in each PBKDF2 chunk fail
on this line of the shared runner:

```js
subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, false, ["deriveKey", "deriveBits"])
```

The suite generates an **ECDH** key purely to prove that passing the *wrong kind
of key* to `deriveBits` is an `InvalidAccessError`. We could not make one, so
`wrongKey` was `null` and we threw a `TypeError` instead. The derivation itself
is correct against **every one of the thousands of PBKDF2 and HKDF vectors** —
all four hashes, empty/short/long passwords and salts, 1 to 100,000 iterations.

That is ~1,900 subtests across this realm alone riding on EC key generation,
which is why quest #471 went there next rather than to AES.

## Results

| Test | Before | After |
|---|---|---|
| `pbkdf2.https.any.html` (9 chunks) | ~265/1001 each | **~788/1001 each** |
| `hkdf.https.any.html` (4 chunks) | ~200/1001 each | **~775/1001 each** |
| `derive_key_and_encrypt` | 0/1 | **1/1** |
| `derived_bits_length` | ? | 15/29 |
| **Realm total** | **3,426/12,351** | **9,668/12,351** |

## ⛔ Caps / Next

* **~1,900 subtests** blocked on ECDH key generation → taken up by **#471**.
* `derived_bits_length` 15/29 — the rest are ECDH/X25519 length-handling, also
  #471's.
* `cfrg_curves_bits/keys_curve25519` 0/7 and 0/8 — X25519 derivation, #471.
