# ✍️ The Signed Verdict — the curves, and the 182 false greens paid back

> **Quest #471** · realm `WebCryptoAPI` (asymmetric) · 2026-08-05
>
> **The 81-file realm sweep: 9,884 → 13,935.** Plus ~1,900 more in
> `derive_bits_keys`, which was blocked on one line of this quest's work.

---

## The gap

Quest #469 shipped every symmetric algorithm and named its own cap honestly:
**we could not generate or import an asymmetric key.** That single hole was load-
bearing in three separate places, which is why this quest went here rather than
to AES:

1. **The 182 false greens.** `sign_verify/ecdsa`, `rsa_pss`, `eddsa_*` and seven
   `serialization/*` files had been passing against the *stub* because
   `verify()` returned `true` and `generateKey()` returned a fake object.
   Becoming honest cost those points; only real ECDSA/EdDSA wins them back.
2. **~1,900 subtests in `derive_bits_keys`.** Every PBKDF2 and HKDF chunk spends
   213 of its 1,001 subtests on one setup line — `generateKey({name:"ECDH",
   namedCurve:"P-256"})` — used purely to prove that the *wrong kind of key* is
   an `InvalidAccessError`. No ECDH, no `wrongKey`, no points.
3. **`sign_verify/hmac`'s** last 8, for the same reason.

A gap that shows up in three unrelated realms is not three gaps.

## The work

**Rust — `crates/obscura-js/src/ec_ops.rs` (new).** P-256/P-384/P-521 (RustCrypto
`p256`/`p384`/`p521`), Ed25519 and X25519: key generation, public-key derivation,
SEC1 point validation and normalization, ECDSA sign/verify over a prehash, ECDH
and X25519 agreement, Ed25519 sign/`verify_strict`.

**JS — `bootstrap.js`.** A small ASN.1 DER encoder/decoder (SPKI and PKCS8 are
how a key arrives from anything that is not a browser — a server, a certificate),
JWK for `EC` and `OKP` key types, the public/private key-pair split, ECDSA
sign/verify, and ECDH/X25519 `deriveBits`/`deriveKey`.

## 🔍 The findings

**1. Every P-521 signature failed, and so did every P-384-with-SHA-1 — for the
same reason, and it was not a curve bug.** RustCrypto's prehash traits *refuse* a
digest shorter than the curve's field. That is a sensible default (it usually
means the caller paired the wrong hash with the curve), but **Web Crypto
explicitly allows any pairing**: P-521 with SHA-256 is legal and useful, and P-521
is 66 bytes wide so *every* hash is "too short" for it. SEC1 §4.1.3 takes the
leftmost `min(hashLen, fieldLen)` bits as an integer — which, as bytes, is
zero-padding on the left. Sixteen bytes of padding, 24 subtests.

**2. A public key arrives in two shapes and a browser must take both.** A
**compressed** SEC1 point is `0x02`/`0x03 ‖ x` — half the size, because `y` is
recoverable from `x` up to a sign and the prefix carries the sign. Rejecting it
means rejecting a perfectly good key *for being efficiently encoded*, which bites
hardest on exactly the metered connections this browser exists for. All 48
remaining `ec_importKey` failures were this; accepting both encodings and
normalizing to one internally took it to **264/264**.

**3. Validating the point is the security step, not a formality.** A "public key"
that is not on the curve — or is the point at infinity, or sits in a small
subgroup — is the classic invalid-curve attack: hand it to an ECDH peer and their
replies leak their private key a few bits at a time. The decoder rejects all of
those, so a successful decode *is* the check. The same instinct is why X25519
treats an all-zero shared secret as an error rather than a key, and why Ed25519
verification is `verify_strict`: **two implementations disagreeing about whether
a signature is valid is itself the vulnerability.**

**4. An ECDH public key carries NO usages.** Not "deriveBits" — none. There is
nothing a peer's public key entitles you to do on its own; you derive with your
own private half. The final empty-usages check on a generated pair therefore
looks only at the **private** key.

**5. Web Crypto's ECDSA signature is `r ‖ s`, not DER.** TLS and X.509 use the
DER-wrapped form. Emitting DER here would produce signatures that verify nowhere
and look almost right in a debugger.

## Results

| Test | Before (#469) | After | |
|---|---|---|---|
| `sign_verify/ecdsa` | 24/324 | **324/324** | ✅ **Chrome parity** |
| `sign_verify/hmac` | 57/65 | **65/65** | ✅ **Chrome parity** |
| `sign_verify/eddsa_curve25519` | 2/19 | **19/19** | ✅ |
| `sign_verify/eddsa_small_order_points` | 0/14 | **14/14** | ✅ **> Chrome (8/14)** |
| `generateKey/failures_{ECDH,ECDSA,Ed25519,X25519}` | 530/536 … | **536/536, 502/502, 444/444, 464/464** | ✅ **all Chrome parity** |
| `generateKey/successes_{ECDH,ECDSA,Ed25519,X25519}` | 0 | **72/72, 54/54, 36/36, 32/32** | ✅ |
| `import_export/ec_importKey` | 0/264 | **264/264** | ✅ **Chrome parity** |
| `import_export/okp_importKey_X25519` | 0/54 | **54/54** | ✅ |
| `import_export/ec_importKey_failures_{ECDH,ECDSA}` | 8/908 | **873/908, 889/908** | ⬆️ |
| `import_export/okp_importKey_failures_{Ed25519,X25519}` | 10/770, 8/662 | **754/770, 636/662** | ⬆️ |
| `serialization/{ecdh,ecdsa,ed25519,x25519}` | 0 | **3/3, 3/3, 2/2, 2/2** | ✅ real, this time |
| **The 81-file realm sweep** | **9,884** | **13,935** | **+4,051** |

## ⛔ Caps / Next

**RSA is the one algorithm family still unimplemented** — validation only, exactly
as EC was after #469. It is the last big block in the realm:

| Block | Subtests |
|---|---|
| `import_export/rsa_importKey` | 1,056 |
| `sign_verify/rsa_pss` + `rsa_pkcs` | 144 + 68 |
| `generateKey/successes_RSA-*` | ~180 |
| `serialization/rsa-*` | 6 |

Then **AES encrypt/decrypt** (`aes_gcm` 577×2, `aes_cbc` 61, `aes_ctr` 52) and
**`wrapKey_unwrapKey`** (1/227) — the cipher half, which nothing else blocks.

Smaller, named honestly:

* `okp_importKey_Ed25519` 52/72 — JWK member-count assertions; the `alg: "EdDSA"`
  member was added but 20 rows still disagree. Not chased.
* `ec_importKey_failures_*` leave 35 and 19 — malformed-DER rejection cases the
  small DER decoder does not distinguish finely enough yet.
* `historical.any.html` 0/3 — needs `isSecureContext` **and** a non-secure origin
  the harness cannot serve (the #465 scheme trap).
* `algorithm-discards-context` 4/13 and `crypto-subtle-secure-context-available`
  1/2 both TIMEOUT, uninvestigated.
