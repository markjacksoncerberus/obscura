# 🔑 Scroll 466 — The Sealed & Wrapped Verdicts

> **Quests #473–#474** · realms `WebCryptoAPI/{import_export,sign_verify,encrypt_decrypt,generateKey,serialization,wrapKey_unwrapKey}` · 2026-08-05
> The 26-file cipher window: **2,506 / 5,689** → **5,761 / 5,761 (100%)**
> Chrome scores **5,024 / 5,761** on the same window. **We are 737 ahead.**
> **`WebCryptoAPI` has no algorithm family left unimplemented.**

---

## The gap

After Quest #472 the realm could hash, sign with EC, agree keys, and encrypt
with AES. **RSA was still validation-only** — it could tell you your
`publicExponent` was wrong and could not do one useful thing with a correct one
— and **`wrapKey`/`unwrapKey` were `throw _notSupported`.**

RSA is not a legacy curiosity. It is what a page meets when it talks to
*anything that already exists*: a JWT signed `RS256`, a server certificate's
key, a JWK Set fetched from an identity provider, a payment terminal, a
government API. A browser that cannot import an RSA public key cannot verify a
token issued by most of the internet.

And `wrapKey` is the operation that makes key storage safe at all. Its whole
reason to exist is that **the key material never becomes a value the page can
hold**: a page wraps a key, stores the bundle, unwraps it later, and at no point
are the bytes in a JavaScript variable — so an XSS bug on that page cannot read
the key out. Without it, "store this key" means "put the secret in a string
first", which is exactly the thing the API was designed to avoid.

## The work

### Quest #473 — RSA (`rsa_ops.rs`, new; ~280 lines of `bootstrap.js`)

Key generation, PKCS#1 v1.5 and PSS signatures, and OAEP encryption over
RustCrypto's `rsa`. Writing RSA by hand is where implementations go to acquire
CVEs, and not because the arithmetic is hard.

**🔍 The largest single block in the realm needed no RSA maths at all.**
`import_export/rsa_importKey` is **1,056 subtests** and every one of them is
ASN.1 and JWK: import a key in `spki`/`pkcs8`/`jwk`, export it again, and assert
the bytes come back *identical*. That is 63% of the RSA work, and it is a
serialization problem wearing a cryptography hat. Worth remembering when sizing
the next algorithm: measure what the file actually asserts before assuming it
needs the primitive.

The design that makes the byte-exact round trip fall out for free: **the key's
handle IS the inner PKCS#1 DER**, kept verbatim from import and re-wrapped in
the `spki`/`pkcs8` envelope on export. One encoder, one place, no drift — and
the same bytes go straight to Rust, so the JS and Rust sides can never disagree
about what a key is.

Three details that are each a whole afternoon if you get them wrong:

* **A DER INTEGER is signed and every RSA component is not.** A modulus whose
  top bit is set needs a leading zero byte or it reads as negative; the reverse
  trip strips those zeros back off. Get either half wrong and the round trip
  lands one byte away from the input, a thousand times.
* **RSA's `AlgorithmIdentifier` carries an explicit NULL parameter.** Omitting
  it is a *different byte string* for the same meaning — and therefore a
  different key file.
* **`alg` in a JWK names the padding AND the hash**, in three different
  spellings with no pattern to infer: `RS256` / `PS256` / `RSA-OAEP-256`. A key
  whose `alg` disagrees with the requested hash is a `DataError`, because the
  key's author and the importer disagree about what the key is for and only one
  of them knows.

**🔍 RSA binds the hash to the KEY; ECDSA binds it to the CALL.** `sign()` for
RSA must read the hash out of `key.algorithm`, not out of the algorithm passed
to the call — the opposite of the rule three quests ago. The salt length is the
other way round: PSS's `saltLength` is a property of the *signature*, so it
comes from the call.

### Quest #474 — `wrapKey` / `unwrapKey` (299 subtests)

Export-then-encrypt and decrypt-then-import, with two ordering rules worth
naming:

* **Only AES-KW has a `wrapKey` operation of its own.** Every other wrapper is a
  cipher being used on key bytes, and the spec says so by *falling back* from
  `wrapKey` to `encrypt` when the first registry lookup answers
  NotSupportedError. The retry must catch **only** NotSupportedError — any other
  error is the caller's and must not be swallowed.
* **`wrapKey` refuses a non-extractable key**, because wrapping *is* an export
  and a non-extractable key said those bytes never leave. But `unwrapKey` may
  produce one: a JWK carrying `ext: false` must unwrap non-extractable and must
  be a `DataError` if the caller asks for it extractable.

AES-KW only handles whole 64-bit blocks — which is why WPT's own hand-rolled
wrapper pads a JWK with spaces before the closing brace, and why our JSON parse
has to tolerate it.

## Results

| File | Before | After | Chrome |
|---|---|---|---|
| `import_export/rsa_importKey` | 0/1056 | **1056/1056** ✅ | 1056/1056 |
| `sign_verify/rsa_pss` | 0/144 | **144/144** ✅ | 144/144 |
| `sign_verify/rsa_pkcs` | 0/68 | **68/68** ✅ | 68/68 |
| `encrypt_decrypt/rsa_oaep` | 1/181 | **181/181** ✅ | 181/181 |
| `generateKey/successes_{RSASSA,RSA-PSS,RSA-OAEP}` | 0/36, 0/36, 0/156 | **36, 36, 156** ✅ | same |
| `generateKey/failures_{RSASSA,RSA-PSS,RSA-OAEP}` | 456/460, 456/460, 640/644 | **460, 460, 644** ✅ | same |
| `serialization/{rsa-oaep,rsa-pss,rsassa-pkcs1-v1_5}` | 0/2 each | **2/2** each ✅ | same |
| `wrapKey_unwrapKey/wrapKey_unwrapKey` | 1/227 | **299/299** ✅ | 299/299 |
| **The 26-file cipher window** | **2,506/5,689** | **5,761/5,761** | **5,024/5,761** |

**+3,255 subtests across the two quests** (+1,694 for #473, +298 for #474, and
+1,263 already banked by #472). Every file in the window is at 100%.

Note the `wrapKey_unwrapKey` denominator moving 227 → 299: **72 subtests were
not "failing", they did not exist.** The suite builds its matrix out of the
wrapper/key combinations that import successfully, so an unimplemented algorithm
silently shrinks the test. A fourth way a recorded number can mislead — this
time by being *too small* rather than too generous.

## Zero-regression sweep

Ritual, 66 files, run three times across the session — after #472, after #473,
and after #474: **15,767 PASS / 111 FAIL / 15,878, byte-identical every time.**
The 111 is the recorded 110-fail baseline plus the single known `idlharness`
fail contributed by the five WebCryptoAPI guard files added last commit.

## ⛔ Caps / Next

**`WebCryptoAPI` now has no algorithm family left unimplemented.** What remains
in the realm is small and named honestly:

* **Tentative algorithms** — `ChaCha20-Poly1305`, `AES-OCB`, `ML-DSA`, `ML-KEM`,
  `KMAC`, `Ed448`/`X448`. Chrome itself scores 0 on most. Not chased: tentative
  means the spec has not settled, and building to a moving target costs the next
  comrade more than it gains.
* `okp_importKey_Ed25519` 52/72 — JWK member-count assertions.
* `ec_importKey_failures_*` leave 35 and 19 — malformed-DER rejection the small
  decoder does not distinguish finely enough.
* `historical.any.html` 0/3 and `crypto-subtle-secure-context-available` —
  need **`isSecureContext`** *and* a non-secure origin the harness cannot serve.
* `algorithm-discards-context` 4/13 — TIMEOUT, uninvestigated.

**⭐ Next leverage, in order:**

1. **F7 — a LAYOUT / HIT-TESTING model.** Now the named cap in four realms
   (`selection`'s `modify`/`caret`/`bidi`, `uievents`' mouse-boundary files,
   `pointerevents`' whole input-driven half, and `css/CSS2`'s **2,461** reftest
   subtests we have never scored). Nothing else on the board blocks this much.
2. **Untouched realms**, re-measured with the Chrome-summary method first:
   `mimesniff` (Chrome only 38.8% — 3,885), `websockets` 1,991, `workers`
   1,370, `compression` 1,304.
3. **Banked:** lenient HTTP response-header parse (58 `cookies` rows), storage
   on disk, `Response.clone()` must tee, `FormData` cannot hold a `File`,
   `isSecureContext` missing.
