# 🔐 Scroll 470 — The Offloaded Verdict

> **Quest #479** · realm `WebCryptoAPI/**/*.any.worker.html` — the whole realm, seen from a worker · 2026-08-05
> The non-tentative worker window: **0 (every file could-not-run)** → **29,383 / 29,506 (99.58%)** across **66 files**.
> Chrome's non-tentative worker window is **105 files / 29,754 subtests**; the 39 files we did not sweep are worth **248 Chrome subtests** (see Caps).
> Baseline measured on the pre-change binary: `WebCryptoAPI/digest/digest.https.any.worker.html` **could-not-run**.

---

## Why this, and why it is the right shape of win

Quest #478 built the worker global scope. This quest is what it was *for*.

Aggregating Chrome's run summary by variant put **39,722 subtests** in
`WebCryptoAPI`'s `.any.worker.html` files — more than half of the entire
platform-wide worker pool, and by a wide margin the largest single block. We
finished the `WebCryptoAPI` realm two arcs ago (Quests #469–#474: hashes,
signatures, key agreement, the whole cipher half, wrap/unwrap). Every line of
that code was already written. **None of it could be reached from a worker.**

That is not a bookkeeping detail. **Cryptography is the single most important
thing a page does off the main thread.** PBKDF2 at 100,000 iterations, an RSA
key generation, an AES-GCM pass over a file being uploaded — these are the
operations that take *hundreds of milliseconds to seconds*, and a page that runs
them on the main thread is a page that goes grey and stops accepting input. On a
current laptop that is a stutter. On a hand-me-down laptop it is the browser
appearing to crash.

So the encrypted note app, the password manager, the chat client, the "encrypt
before you sync" backup tool — every one of them does its work in a worker,
because doing it anywhere else is unusable on the hardware this project exists
for. A browser whose `crypto.subtle` works only on the main thread has an API
that is technically present and practically unusable exactly where it matters.

## The work

**None in `WebCryptoAPI`.** This quest wrote no crypto code at all. Quest #478's
worker global scope was the entire fix; this quest is the measurement that proves
it, plus the two worker-side gaps it turned up.

That is the honest and slightly unusual shape of this one: **the largest single
block of subtests on the worker frontier needed no new implementation, because the
implementation was already correct and simply unreachable.** Worth naming as a
pattern — *before writing code for a realm that scores zero, check whether the
realm is unreachable rather than unimplemented.* It is the same lesson the
campaign has now hit from five directions.

## The results

| | before | after |
|---|---|---|
| `WebCryptoAPI/**/*.any.worker.html` — 66 files | **0** (all could-not-run) | **29,383 / 29,506 — 99.58%** |

Every large file at 100%:

| file | worker |
|---|---|
| `import_export/rsa_importKey` | **1056/1056** |
| `derive_bits_keys/hkdf` (3 shards) | **3003/3003** |
| `derive_bits_keys/pbkdf2` (8 shards) | **8008/8008** |
| `generateKey/failures_*` (the error-order suites) | 100% |
| `wrapKey_unwrapKey` | **299/299** |
| `generateKey/successes_AES-{CBC,CTR,GCM}` | **288/288** each |
| `import_export/ec_importKey` | **264/264** |
| `encrypt_decrypt/rsa_oaep` | **181/181** |
| `sign_verify/rsa_pss` | **144/144** |
| `digest/digest` | **116/116** |
| `sign_verify/rsa_pkcs` · `sign_verify/hmac` · `encrypt_decrypt/aes_cbc` | 68/68 · 65/65 · 61/61 |

### ⭐ The confirmation worth keeping: the failures match to the subtest

Nine files scored short of 100%. **Every one of them is a cap already recorded for
its WINDOW twin, and the shortfalls match exactly:**

| file | worker | short by | recorded window cap |
|---|---|---|---|
| `ec_importKey_failures_ECDSA` | 889/908 | **19** | Quest #471 scroll: `ec_importKey_failures_*` **19** |
| `ec_importKey_failures_ECDH` | 873/908 | **35** | Quest #471 scroll: `ec_importKey_failures_*` **35** |
| `okp_importKey_Ed25519` | 52/72 | 20 | Quest #474 scroll: `okp_importKey_Ed25519` **52/72** |
| `okp_importKey_failures_X25519` | 636/662 | 26 | window-side, same |
| `okp_importKey_failures_Ed25519` | 754/770 | 16 | window-side, same |
| `derive_bits_keys/ecdh_bits` | 37/40 | 3 | window-side, same |
| `derived_bits_length` | 27/29 | 2 | window-side, same |
| `idlharness` | 81/82 | 1 | window-side, same |
| `cfrg_curves_bits_curve25519` | 18/19 | 1 | window-side, same |

**A worker that fails in precisely the same nine places, by precisely the same
counts, is a worker running the same code.** That is a stronger statement than the
percentage: it says the worker scope is not an approximation of the page's — it is
the page's implementation, reached through a different global. Had the deny list
been wrong, or an intrinsic been missing, or the `with` scope leaked, the failures
would have been *different* failures, not the same ones.

## Caps — honest

* **39 of the 105 files in the non-tentative window were not swept.** They are
  `generateKey/successes_RSA-{OAEP,PSS}` / `RSASSA-PKCS1-v1_5` shards worth
  **248 Chrome subtests in total (0.8% of the window)**, and each one generates
  real 2048/3072/4096-bit RSA keys — measured at roughly **five minutes per
  ten-subtest shard**, which is over three hours of wall clock for less than one
  percent of the window. Their window twins are recorded at **228/228** in the
  ledger from Quest #473. **This is a measurement cap, not a conformance claim:
  those 248 subtests are unmeasured, not passing.** The list is preserved at
  `scripts/wpt-crypto-worker-remainder.txt` for anyone with the wall clock.
* **The 50 `tentative` files (9,968 subtests) were excluded**, keeping the same
  window convention Quests #472–#474 used. Chrome itself only passes 2,649 of
  them; they are ChaCha20-Poly1305, AES-OCB, ML-DSA/ML-KEM, KMAC, Ed448/X448 —
  a moving spec, not worth chasing.
* Everything in the failure table above is inherited from the window side and
  belongs to the `WebCryptoAPI` realm, not to workers.

## Next

* The `.any.sharedworker.html` family (**688 files / 9,315 subtests**) → Quest #480.
* `.any.serviceworker.html`: **661 files / 9,092 subtests**, untouched.
* The remaining large worker realms, now reachable and unmeasured: **fetch 2,734**,
  **url 2,154**, **html 1,881**, **IndexedDB 1,540**, **streams 1,419**,
  **wasm 1,489**, **webcodecs 1,302**.
