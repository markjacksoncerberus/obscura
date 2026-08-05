//! The Web Cryptography primitives, in Rust.
//!
//! Everything here is a *primitive*: bytes in, bytes out, no policy. All of the
//! Web Crypto policy — algorithm normalization, key usages, JWK, the error
//! ordering the spec mandates — lives in `bootstrap.js`, because that is where
//! the WebIDL surface lives and where the errors have to be thrown from.
//!
//! Two reasons these are not written in JavaScript:
//!
//!   1. **Honesty.** The implementations below come from the RustCrypto crates,
//!      which are audited and written to avoid secret-dependent branches. A
//!      hand-rolled SHA-256 in `bootstrap.js` would pass every WPT vector and
//!      still be the wrong thing to hand a person who is using this browser to
//!      log in to something that matters.
//!   2. **The machine on the other end.** This browser exists for hardware that
//!      big-tech browsers gave up on. PBKDF2 with 100k iterations is the exact
//!      workload where an interpreted implementation stops being a slow page and
//!      starts being a page that never finishes.
//!
//! The hash is selected by its Web Crypto name ("SHA-1"/"SHA-256"/"SHA-384"/
//! "SHA-512"), already normalized and case-folded by the JS caller.

use deno_core::op2;
use deno_error::JsErrorBox;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha384, Sha512};

fn unsupported(alg: &str) -> JsErrorBox {
    JsErrorBox::generic(format!("unsupported hash: {alg}"))
}

/// `crypto.subtle.digest()`. The old JS stub returned an FNV scramble of the
/// input — the right *length*, and pure fiction. Anything that compared a digest
/// to one computed anywhere else (a subresource hash, a cache key, a signature)
/// silently disagreed with the rest of the world.
#[op2]
#[buffer]
pub fn op_crypto_digest(#[string] alg: String, #[buffer] data: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    Ok(match alg.as_str() {
        "SHA-1" => Sha1::digest(data).to_vec(),
        "SHA-256" => Sha256::digest(data).to_vec(),
        "SHA-384" => Sha384::digest(data).to_vec(),
        "SHA-512" => Sha512::digest(data).to_vec(),
        other => return Err(unsupported(other)),
    })
}

/// Dispatch on the Web Crypto hash name to a concrete RustCrypto type.
///
/// Written as a macro rather than a generic function on purpose: the digest
/// traits are generic over associated core types whose bounds are painful to
/// spell at the call site, and every one of these bodies is monomorphic anyway.
/// `$body` is instantiated once per hash with `$h` bound to the concrete type.
macro_rules! per_hash {
    ($name:expr, |$h:ident| $body:block) => {
        match $name {
            "SHA-1" => { type $h = Sha1; $body }
            "SHA-256" => { type $h = Sha256; $body }
            "SHA-384" => { type $h = Sha384; $body }
            "SHA-512" => { type $h = Sha512; $body }
            other => return Err(unsupported(other)),
        }
    };
}

/// HMAC over any of the four hashes. Used for `sign`/`verify` with an HMAC key
/// and as the PRF inside PBKDF2 and HKDF.
///
/// `verify` does NOT call a separate op: the JS side re-signs and compares. The
/// comparison itself is the security-sensitive part and is done in constant time
/// there — see `_cryptoBytesEqual` in bootstrap.js.
///
/// An HMAC key may be any length, including zero: the construction hashes
/// over-long keys and zero-pads short ones, so `new_from_slice` cannot fail.
#[op2]
#[buffer]
pub fn op_crypto_hmac(
    #[string] hash: String,
    #[buffer] key: &[u8],
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    Ok(per_hash!(hash.as_str(), |H| {
        let mut m = <Hmac<H> as Mac>::new_from_slice(key).expect("HMAC accepts any key length");
        m.update(data);
        m.finalize().into_bytes().to_vec()
    }))
}

/// Fill a buffer from the operating system's CSPRNG.
///
/// This replaces `Math.random()`. That is not a conformance fix — no WPT test
/// can tell the difference — it is a real one. `crypto.getRandomValues()` is
/// what a page calls to mint a session token, an IV, a CSRF nonce or a password
/// salt, and an attacker who can observe a few outputs of a `Math.random()` PRNG
/// can recover its state and predict every value it will ever produce again.
#[op2(fast)]
pub fn op_crypto_random_bytes(#[buffer] out: &mut [u8]) -> Result<(), JsErrorBox> {
    getrandom::getrandom(out).map_err(|e| JsErrorBox::generic(format!("getrandom failed: {e}")))
}

/// PBKDF2 (RFC 8018) — "turn a password a human can remember into a key".
/// The iteration count is the whole point of the algorithm: it is the cost an
/// attacker pays per guess, so it is deliberately expensive and belongs here
/// rather than in an interpreter.
///
/// DK = T1 ‖ T2 ‖ …, where Ti = U1 ⊕ U2 ⊕ … ⊕ Uc,
/// U1 = PRF(P, S ‖ INT(i)) and Uj = PRF(P, Uj-1).
#[op2]
#[buffer]
pub fn op_crypto_pbkdf2(
    #[string] hash: String,
    #[buffer] password: &[u8],
    #[buffer] salt: &[u8],
    iterations: u32,
    length: u32,
) -> Result<Vec<u8>, JsErrorBox> {
    let mut out = vec![0u8; length as usize];
    if out.is_empty() {
        return Ok(out);
    }
    per_hash!(hash.as_str(), |H| {
        let prf = <Hmac<H> as Mac>::new_from_slice(password).expect("HMAC accepts any key length");
        let hlen = prf.clone().finalize().into_bytes().len();
        for (block_index, chunk) in out.chunks_mut(hlen).enumerate() {
            let counter = (block_index as u32 + 1).to_be_bytes();
            let mut u = {
                let mut m = prf.clone();
                m.update(salt);
                m.update(&counter);
                m.finalize().into_bytes()
            };
            let mut t = u;
            for _ in 1..iterations {
                let mut m = prf.clone();
                m.update(&u);
                u = m.finalize().into_bytes();
                for (a, b) in t.iter_mut().zip(u.iter()) {
                    *a ^= *b;
                }
            }
            let n = chunk.len();
            chunk.copy_from_slice(&t[..n]);
        }
    });
    Ok(out)
}

/// HKDF (RFC 5869) — extract-then-expand. Unlike PBKDF2 this is cheap; it is
/// here so both derivations share one code path and one set of test vectors.
///
/// Extract: PRK = HMAC(salt, IKM) — a missing salt is HashLen zero bytes, which
/// the JS side passes as an empty buffer and HMAC pads to exactly that.
/// Expand:  T(n) = HMAC(PRK, T(n-1) ‖ info ‖ n), T(0) = empty.
#[op2]
#[buffer]
pub fn op_crypto_hkdf(
    #[string] hash: String,
    #[buffer] ikm: &[u8],
    #[buffer] salt: &[u8],
    #[buffer] info: &[u8],
    length: u32,
) -> Result<Vec<u8>, JsErrorBox> {
    let mut out = vec![0u8; length as usize];
    per_hash!(hash.as_str(), |H| {
        let hlen = <Hmac<H> as Mac>::new_from_slice(&[])
            .expect("HMAC accepts any key length")
            .finalize()
            .into_bytes()
            .len();
        // HKDF's one failure mode: you cannot ask for more than 255·HashLen
        // octets. Web Crypto turns that into an OperationError.
        if out.len() > 255 * hlen {
            return Err(JsErrorBox::generic("hkdf: requested length too long"));
        }
        let prk = {
            let mut m = <Hmac<H> as Mac>::new_from_slice(salt).expect("HMAC accepts any key length");
            m.update(ikm);
            m.finalize().into_bytes()
        };
        let mut t: Vec<u8> = Vec::new();
        for (block_index, chunk) in out.chunks_mut(hlen).enumerate() {
            let mut m = <Hmac<H> as Mac>::new_from_slice(&prk).expect("HMAC accepts any key length");
            m.update(&t);
            m.update(info);
            m.update(&[block_index as u8 + 1]);
            t = m.finalize().into_bytes().to_vec();
            let n = chunk.len();
            chunk.copy_from_slice(&t[..n]);
        }
    });
    Ok(out)
}
