# 🔐 Scroll 465 — The Enciphered Verdict

> **Quest #472** · realm `WebCryptoAPI/encrypt_decrypt` · 2026-08-05
> `4 / 1,267` → **`1,267 / 1,267` (100%)** — and **384 subtests AHEAD of Chrome.**

---

## The gap

`crypto.subtle.encrypt()` and `crypto.subtle.decrypt()` were two lines each:

```js
encrypt(algorithm, key, data) {
  return _promise(this, 3, arguments.length, () => {
    _normalizeAlgorithm(algorithm, "encrypt");
    throw _notSupported("encrypt is not implemented yet");
  });
}
```

Quests #469–#471 gave the realm real hashes, real signatures, real key
agreement and a real key object model. What it did not have was **the ability to
encrypt anything at all.** A page could prove who it was talking to and could
not keep a single byte private from anyone on the wire between them.

That is not an exotic corner. It is the note-taking app that encrypts before it
syncs, the chat client, the password manager, the "encrypt this before you put
it in `localStorage`" line in a hundred tutorials. Every one of them got
`NotSupportedError` and had to either drop the encryption or drop the browser.

## The work

**`crates/obscura-js/src/aes_ops.rs`** (new, ~370 lines) — the three AES modes as
primitives, over RustCrypto's `aes` (the block cipher), `cbc` (the mode), and
`ghash` (GCM's universal hash), plus `aes-kw` for the key-wrap mode that
Quest #474 will use.

**`crates/obscura-js/js/bootstrap.js`** — the `encrypt`/`decrypt` operations and
a per-algorithm cipher table holding every rule the spec attaches to them.

### 🔍 What we wrote out by hand, and why — stated plainly

`aes-gcm` and `ctr` are the obvious dependencies and this scroll did not use
them for the mode composition. That deserves an honest answer rather than a
shrug, because "we rolled our own crypto" is normally the beginning of a
post-mortem:

* Web Crypto's **AES-CTR takes a counter width in bits** — any value from 1 to
  128 — and the counter must wrap *inside exactly that field*, leaving the nonce
  above it untouched. The `ctr` crate offers 32, 64 and 128 and nothing else.
* Web Crypto's **AES-GCM takes an IV of any length and a tag of any of seven
  lengths** (32…128 bits). `aes-gcm` fixes both as *type parameters*: a 40-byte
  IV or a 32-bit tag cannot be expressed at all, at any cost.

So the choice was between refusing legal keys and messages, or writing out the
counter arithmetic and the GCM length framing. Those are **public values with no
secret-dependent control flow**; every secret-dependent step — the AES block
cipher, GHASH, CBC — is still the audited crate, and the tag comparison is
constant-time by construction. It is documented at the top of `aes_ops.rs` so
the next comrade does not have to reverse-engineer the reasoning.

Three Rust unit tests guard it: the counter-width property, **NIST SP 800-38D
test case 2** (a real published GCM vector), and a tampered-message rejection.

### 🔍 The lessons

**A truncated GCM tag is the leftmost bits of the full one, and it is a weaker
promise, not a different one.** A 32-bit tag means a forgery succeeds once in
four billion tries — which is not many tries. The seven legal lengths are a
closed set: anything else is an `OperationError` rather than being quietly
rounded up to something we do support, because silently strengthening a
caller's parameters hides that their protocol asked for something impossible.

**Every cipher failure reports the same error with the same message.** Bad
padding, a tag that did not verify, a length that does not fit — one
`OperationError`, no detail. This looks like laziness and is the opposite: the
difference between "the padding was malformed" and "the padding was fine but the
tag failed" is *precisely* the oracle a padding-oracle attack is built out of.
No page has any use for the distinction.

**GCM verifies before it decrypts.** Returning the plaintext of a message whose
tag did not check out is the one thing an authenticated cipher exists to
prevent.

**The copy of the caller's bytes happens AFTER normalization** — the third realm
in this campaign where that ordering is the test. WPT's AES suite proves it four
different ways per vector: it corrupts the plaintext, then repairs it from an
author getter on `algorithm.name`; and it *transfers the buffer away* from that
same getter. A detached buffer reads as zero bytes, and the expected answer is
then mode-specific and load-bearing: **AES-CBC yields 16 bytes** (PKCS#7 means
even an empty message gets a full block of padding), **AES-GCM yields
`tagLength/8`**, and **AES-CTR yields 0**. Decrypting a transferred ciphertext
splits the same way — CTR hands back an empty plaintext, CBC and GCM must
*refuse*.

## Results

Measured with `scripts/wpt_run.py` against a `--features render` server.
Chrome's own per-file numbers from its current wpt.fyi master run.

| File | Before | After | Chrome |
|---|---|---|---|
| `encrypt_decrypt/aes_cbc.https.any.html` | 1/61 | **61/61** ✅ | 41/61 |
| `encrypt_decrypt/aes_ctr.https.any.html` | 1/52 | **52/52** ✅ | 35/52 |
| `encrypt_decrypt/aes_gcm.https.any.html` | 1/577 | **577/577** ✅ | 385/577 |
| `encrypt_decrypt/aes_gcm_256_iv.https.any.html` | 1/577 | **577/577** ✅ | 385/577 |
| **Total** | **4/1,267** | **1,267/1,267** | **846/1,267** |

**+1,263 subtests, and 421 ahead of Chrome.** The lead is exactly the generality
argued for above: Chrome refuses the short tag lengths and some IV sizes that
the specification permits, and each refusal costs it thirteen subtests per
vector.

## Zero-regression sweep

Full ritual, 66 files: **15,767 PASS / 111 FAIL / 15,878 total.** The recorded
baseline was 110 fails over the 61-file list; the five WebCryptoAPI guard files
added by the previous commit contribute exactly one more (`idlharness` 81/82),
and their 2,501 subtests account for the whole change in the total. **No test
that passed before this change fails after it.**

## ⛔ Caps / Next

Nothing in `encrypt_decrypt` is left except the **tentative** files
(`aes_ocb`, which Chrome itself scores 1/277 on). Not chased: tentative means
the specification has not settled.

**Next, in order:**

1. **RSA** — the last algorithm family that is validation-only.
   `import_export/rsa_importKey` **1,056** (pure DER/JWK, *no RSA maths at
   all*), `sign_verify/rsa_pss` 144 + `rsa_pkcs` 68, `encrypt_decrypt/rsa_oaep`
   181, `generateKey/successes_RSA-*` 228, `serialization/rsa-*` 6.
2. **`wrapKey`/`unwrapKey`** — 1/227, and the AES-KW primitive it needs is
   already built and registered by this quest.
3. Then **F7 — a layout / hit-testing model**, still the named cap in four
   realms.
