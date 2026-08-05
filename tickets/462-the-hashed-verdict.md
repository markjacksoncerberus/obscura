# 🔐 The Hashed Verdict — `verify()` returned `true`. For everything.

> **Quest #469** · realm `WebCryptoAPI` · 2026-08-05 · branch `engine-per-page-threads`
>
> The largest untouched realm on the map, and the only one where the gap was not
> "a page renders wrong" but "a page is told a forgery is genuine".

---

## The gap

`crypto.subtle` was twelve one-line stubs:

```js
async digest(algorithm, data) { /* an FNV scramble, of the right LENGTH */ }
async sign()   { return new ArrayBuffer(32); }   // 32 zero bytes
async verify() { return true; }                  // ← always. for every input.
async generateKey() { return { type:'secret', algorithm:{}, extractable:false, usages:[] }; }
```

`digest()` was the familiar campaign shape — the right *type*, the wrong
*value* — and it is bad in the ordinary way: any page comparing a hash against
one computed anywhere else in the world silently disagreed with the world.

`verify()` is a different kind of wrong. A page calls it to ask **"is this
really from who it claims to be from?"** — a session token, a software update, a
signed message. Every page that ever asked got back `true` about a forgery.
There is no page-visible symptom for that; it fails silently, in the direction
of unsafe.

And `crypto.getRandomValues()` — the one piece that *did* work — was seeded from
`Math.random()`. That is the function a page calls to mint a session token, an
IV, a CSRF nonce, a password salt. An attacker who sees a handful of outputs of
a `Math.random()`-class PRNG can recover its internal state and predict every
value it will produce from then on.

**The realm was also invisible, which is why nobody had costed it.** The frontier
survey never scored `generateKey/*` — ~15,400 subtests — because every file there
loads `algorithm_registry.js`, whose third line reads:

```js
{name: "AES-CTR", resultType: CryptoKey, usages: [...]},
//                            ^^^^^^^^^ ReferenceError: CryptoKey is not defined
```

One missing global, and fourteen files' worth of tests never ran a single
assertion. That is the **third** distinct way a recorded number has lied to this
campaign (after #465's could-not-run realms and its `.https` vs plain scheme
split) — and it is the same failure mode as #465: *a realm reported
could-not-run has no score yet.*

---

## The work

**Rust — `crates/obscura-js/src/crypto_ops.rs` (new).** Bytes in, bytes out, no
policy: SHA-1/256/384/512, HMAC, PBKDF2, HKDF, and an OS-CSPRNG fill, over the
audited RustCrypto crates. Two reasons this is not JavaScript: a hand-rolled
SHA-256 in `bootstrap.js` would pass every WPT vector and still be the wrong
thing to hand someone logging in to something that matters; and PBKDF2 at 100k
iterations is exactly the workload where an interpreted implementation stops
being a slow page and becomes a page that never finishes — on the hardware this
browser exists for.

**JS — `bootstrap.js`, the whole Web Crypto module rebuilt (~600 lines).**

* `Crypto`, `SubtleCrypto`, `CryptoKey` as real WebIDL interfaces — enumerable
  prototype accessors, brand-throws, `@@toStringTag`, correct `length`. (The
  five-point table from #467 applied verbatim; it keeps paying.)
* **`normalize an algorithm`** — the registry of 18 algorithms × their ops ×
  their IDL parameter dictionaries, with recursive `hash` normalization.
* Key material in a `WeakMap`, never on the object: `key.handle = …` is not a
  thing a page can write and `JSON.stringify(key)` is not a way to exfiltrate a
  secret.
* HMAC (generate/import/export/sign/verify), AES-CTR/CBC/GCM/KW key management,
  HKDF/PBKDF2 key import, JWK in both directions.
* `window.crypto` promoted from a **data property** to the IDL accessor it is —
  a data property is something an injected script can overwrite with its own
  object, after which every `crypto.subtle` call in the page goes somewhere else.
* `CryptoKey` made **[Serializable]**, so `structuredClone` — and therefore
  IndexedDB — round-trips a key. That is how a real page *keeps* a key, and a
  non-extractable key survives the trip **still non-extractable**.

---

## 🔍 The findings

**1. The error ORDER is the specification.** `generateKey/failures_*` is ~1,000
subtests per file of nothing but *which* error and *in what order*, and it
encodes a real rule a caller depends on: "I asked for an algorithm you don't
have" (`NotSupportedError`) must be distinguishable from "you have it, my
parameters are wrong" (`OperationError`) from "these usages make no sense for
it" (`SyntaxError`). The mandated order is **usages → algorithm properties →
generate → empty-usages**, and the *last* one is the subtle one: `[]` is not an
invalid usage, it is a key that can do nothing, and the spec only rejects it
once everything else has been found sound.

**2. The copy of the caller's bytes happens AFTER normalization, not before.**
Both the `digest` and `importKey` suites prove it with the same trick: an author
getter on `algorithm.name` that mutates the data buffer while normalization is
running. Get the order wrong and you hash/import bytes the page had already
replaced. The deeper rule is that **every BufferSource is copied, always** — the
page owns that memory and can mutate or transfer it the instant we yield to the
microtask queue.

**3. A usage is a permission, and an unrecognized one is a category error.**
"Sign with an AES key" is not a typo to be forgiven — `SyntaxError`. And
`[[usages]]` is frozen at creation: a key whose permissions a later caller can
append to is not a permission at all.

**4. Constant-time comparison is not optional, and it is not in the tests.**
Comparing a MAC with an early-return loop leaks, through timing, how many
leading bytes an attacker guessed right — which is how you forge one byte at a
time. No WPT subtest can see the difference. `_bytesEqual` does it in constant
time anyway.

**5. `crypto.subtle` is `[SecureContext]`, and that interacts with our harness.**
`historical.any.html` asserts `crypto.subtle`, `SubtleCrypto` and `CryptoKey`
are **absent** in a non-secure context. `wpt_run.py` serves everything over
`https://wpt.live`, so we are always secure and always fail it — the same
scheme trap #465 found in `cookies`. It is 3 subtests and it is honest to call
it a harness artifact plus a genuine missing feature (`isSecureContext`).

---

## Results

**The realm, over the 81 non-tentative window-variant files: 314 → 9,884.
Net +9,570**, measured on the stashed build and the new one.

| Test | Before | After | |
|---|---|---|---|
| `digest/digest.https.any.html` | 0/116 | **116/116** | ✅ |
| `idlharness.https.any.html` | 12/82 | **81/82** | ⬆️ |
| `generateKey/failures_AES-{CBC,CTR,GCM}` | could-not-run | **978/978** each | ✅ **> Chrome (976)** |
| `generateKey/failures_AES-KW` | could-not-run | **576/576** | ✅ **> Chrome (574)** |
| `generateKey/failures_HMAC` | could-not-run | **776/776** | ✅ |
| `generateKey/failures_{ECDH,ECDSA,Ed25519,X25519}` | could-not-run | 530/536, 496/502, 440/444, 460/464 | ⬆️ |
| `generateKey/failures_{RSA-OAEP,RSA-PSS,RSASSA}` | could-not-run | 640/644, 456/460, 456/460 | ⬆️ |
| `generateKey/successes_AES-{CBC,CTR,GCM}` | could-not-run | **288/288** each | ✅ **> Chrome (192)** |
| `generateKey/successes_{AES-KW,HMAC}` | could-not-run | **72/72**, **192/192** | ✅ |
| `import_export/symmetric_importKey` | 0/606 | **606/606** | ✅ **> Chrome (510)** |
| `sign_verify/hmac` | 29/65 | 57/65 | ⬆️ |
| `serialization/{aes-cbc,aes-ctr,aes-gcm,aes-kw}` | 3/3 (fake) | **3/3** (real) | ✅ |
| `serialization/hmac` | 8/8 (fake) | **8/8** (real) | ✅ |
| `normalize-algorithm-name` | 0/4 | **4/4** | ✅ |
| `algorithm-discards-context` | 1/13 | 4/13 | ⬆️ |

### ⚠️ The false greens — 182 subtests the stub passed BY LYING

This is the finding worth carrying forward, and it is a warning about how we
measure. **A round-trip test cannot tell a correct implementation from one where
both directions are the same lie.** `serialization/ecdsa` scored 3/3 against the
stub: `generateKey()` returned a plain object, `structuredClone` happily cloned
it, and `exportKey()` returned 32 zero bytes *both times*, so "the round trip
works" was true. `sign_verify/rsa_pss` scored 56/144 because `verify()` returned
`true`. Making the engine honest **removes** those points:

| Test | Stub | Now | Why |
|---|---|---|---|
| `sign_verify/rsa_pss` | 56/144 | 0/144 | `verify()` no longer says yes to everything |
| `sign_verify/ecdsa` | 96/324 | 24/324 | ″ |
| `sign_verify/rsa_pkcs` | 28/68 | 0/68 | ″ |
| `sign_verify/eddsa_curve25519` | 9/19 | 2/19 | ″ |
| `sign_verify/eddsa_small_order_points` | 1/14 | 0/14 | ″ |
| `serialization/{ecdh,ecdsa}` | 3/3 | 0/3 | `generateKey()` no longer returns a fake object |
| `serialization/{ed25519,x25519,rsa-oaep,rsa-pss,rsassa-*}` | 2/2 | 0/2 | ″ |
| `historical.any.html` | 2/3 | 0/3 | `SubtleCrypto`/`CryptoKey` now exist — see finding 5 |

**182 subtests.** Every one of them was a green square over a security hole, and
every one comes back for real the moment quest #471 lands ECDSA/Ed25519/RSA.
Counted honestly, the realm went **314 → 9,884**; counted the flattering way it
would look like +9,752, and the difference is exactly the part we should never
have been credited for.

---

## ⛔ Caps / Next

**The named cap of this quest: we do not generate or import ASYMMETRIC keys.**
Everything symmetric is complete; every public-key algorithm has its *parameter
validation* implemented (so a bad curve is `NotSupportedError` and a bad RSA
exponent is `OperationError`, correctly and in order) and then honestly throws
`NotSupportedError` at the generation step. That costs ~4–6 subtests per
`failures_*` file (the "Empty usages" case, which must reach generation before
it can be rejected) and all of `successes_EC*`/`successes_RSA*`.

Directly behind it, and all blocked on the same thing:

| Block | Subtests | Needs |
|---|---|---|
| `import_export/rsa_importKey` | 1,056 | RSA key import (SPKI/PKCS8/JWK parse) |
| `import_export/ec_importKey_failures_{ECDH,ECDSA}` | 908 each | EC key import + validation |
| `import_export/okp_importKey_failures_{Ed25519,X25519}` | 770 / 662 | OKP import + validation |
| `sign_verify/{ecdsa,rsa_pss,rsa_pkcs}` | 324 / 144 / 68 | ECDSA, RSA-PSS, RSASSA |
| `wrapKey_unwrapKey` | 111 | AES-KW + RSA-OAEP cipher |

**⭐ NEXT (this arc):** `derive_bits_keys` — PBKDF2 (~8,600) and HKDF (~3,700)
are **~12,300 subtests** and the Rust ops for both are already written and
wired; only the JS `deriveBits`/`deriveKey` policy layer is missing. Then AES
encrypt/decrypt (CBC/CTR/GCM ≈ 1,300) and wrap/unwrap.

**Honest measurement note:** `algorithm-discards-context` (4/13) and
`crypto-subtle-secure-context-available` (1/2) both TIMEOUT rather than fail —
not investigated this quest.
