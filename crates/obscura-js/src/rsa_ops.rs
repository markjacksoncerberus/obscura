//! RSA — key generation, PKCS#1 v1.5 and PSS signatures, and OAEP encryption.
//!
//! Same contract as the other two crypto modules: bytes in, bytes out, no
//! policy. Everything Web Crypto cares about — which errors, in which order,
//! what a JWK looks like, how a key is framed as SPKI or PKCS#8 — lives in
//! `bootstrap.js`.
//!
//! **Keys cross this boundary as PKCS#1 DER**, not as eight separate big
//! integers. That is not a shortcut: `bootstrap.js` already has to build and
//! parse exactly that structure to answer `exportKey("pkcs8")` byte-for-byte,
//! so passing it through means one encoder, in one place, rather than two that
//! can drift.
//!
//! The maths is RustCrypto's `rsa`. Writing RSA by hand is where implementations
//! go to acquire CVEs — Bleichenbacher's attack on PKCS#1 v1.5 is thirty years
//! old and still catching people, because it is not the arithmetic that is hard,
//! it is *never revealing which step failed*.

use deno_core::op2;
use deno_error::JsErrorBox;
use rsa::pkcs1::{DecodeRsaPrivateKey, DecodeRsaPublicKey, EncodeRsaPrivateKey, EncodeRsaPublicKey};
use rsa::rand_core::TryRng;
use rsa::traits::PublicKeyParts;
use rsa::{BoxedUint, Oaep, Pkcs1v15Sign, Pss, RsaPrivateKey, RsaPublicKey};
use sha1_v11::Sha1;
use sha2_v11::{Sha256, Sha384, Sha512};

/// The operating system's CSPRNG, in the shape `rsa` asks for.
///
/// Every random value RSA needs is one that must never be guessable: the primes
/// a key is built from, and the salt in every PSS signature and OAEP ciphertext.
/// So this is the OS generator, the same source as `crypto.getRandomValues`.
struct SysRng;

// `rand_core` derives the infallible `Rng`/`CryptoRng` traits from a `TryRng`
// whose error is `Infallible`, so this one impl is the whole thing. If the OS
// generator is unavailable there is no safe fallback and no key worth minting,
// so that case panics rather than quietly producing predictable bytes.
impl TryRng for SysRng {
    type Error = core::convert::Infallible;
    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        let mut b = [0u8; 4];
        self.try_fill_bytes(&mut b)?;
        Ok(u32::from_le_bytes(b))
    }
    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        let mut b = [0u8; 8];
        self.try_fill_bytes(&mut b)?;
        Ok(u64::from_le_bytes(b))
    }
    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Self::Error> {
        getrandom::getrandom(dst).expect("the OS CSPRNG must be available");
        Ok(())
    }
}
impl rsa::rand_core::TryCryptoRng for SysRng {}

/// One error for every failure, deliberately.
///
/// The JS side turns this into a bare `OperationError`, and none of these
/// messages reaches the page. That is the whole point: "the padding was
/// malformed" versus "the padding was fine and the value was out of range" is
/// exactly the one bit of information Bleichenbacher's attack needs, repeated a
/// million times, to decrypt a message without the key.
fn failed(what: &str) -> JsErrorBox {
    JsErrorBox::generic(format!("RSA {what} failed"))
}

/// Run `$body` with `$h` bound to the hash the caller named. Web Crypto ties the
/// hash to the KEY for RSA (unlike ECDSA, where it is named per signature), so
/// this comes from the key's algorithm.
macro_rules! per_hash {
    ($name:expr, |$h:ident| $body:block) => {
        match $name {
            "SHA-1" => { type $h = Sha1; $body }
            "SHA-256" => { type $h = Sha256; $body }
            "SHA-384" => { type $h = Sha384; $body }
            "SHA-512" => { type $h = Sha512; $body }
            other => return Err(JsErrorBox::generic(format!("unsupported hash: {other}"))),
        }
    };
}

fn private_key(der: &[u8]) -> Result<RsaPrivateKey, JsErrorBox> {
    RsaPrivateKey::from_pkcs1_der(der).map_err(|_| failed("private key decode"))
}
fn public_key(der: &[u8]) -> Result<RsaPublicKey, JsErrorBox> {
    RsaPublicKey::from_pkcs1_der(der).map_err(|_| failed("public key decode"))
}

/// Generate a key pair, returned as a PKCS#1 `RSAPrivateKey`.
///
/// This is the slowest thing in the whole Web Crypto surface — it hunts for two
/// random primes — which is why WPT marks the RSA generation tests `timeout=long`
/// and why a page should generate once and store, not generate per request.
fn rsa_generate(modulus_length: u32, public_exponent: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    let e = BoxedUint::from_be_slice_vartime(public_exponent);
    let key = RsaPrivateKey::new_with_exp(&mut SysRng, modulus_length as usize, e)
        .map_err(|_| failed("key generation"))?;
    Ok(key.to_pkcs1_der().map_err(|_| failed("key encode"))?.as_bytes().to_vec())
}

/// The public half of a private key, as a PKCS#1 `RSAPublicKey`.
fn rsa_public(private_der: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    let key = private_key(private_der)?;
    let pubk = RsaPublicKey::from(&key);
    Ok(pubk.to_pkcs1_der().map_err(|_| failed("public key encode"))?.as_bytes().to_vec())
}

/// The modulus length in bits, which `key.algorithm.modulusLength` reports.
/// Taken from the parsed key rather than from the DER byte count so that a
/// modulus with a short high byte is not reported eight bits too long.
#[op2(fast)]
pub fn op_crypto_rsa_modulus_bits(#[buffer] public_der: &[u8]) -> Result<u32, JsErrorBox> {
    Ok(public_key(public_der)?.n().bits() as u32)
}

fn rsa_sign(
    private_der: &[u8],
    scheme: String,
    hash: String,
    salt_length: u32,
    digest: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    let key = private_key(private_der)?;
    per_hash!(hash.as_str(), |H| {
        // PSS needs randomness (its salt); PKCS#1 v1.5 is deterministic and
        // ignores the rng. One call site for both, so the salt can never be
        // accidentally left out of the signature that needs it.
        if scheme == "PSS" {
            key.sign_with_rng(&mut SysRng, Pss::<H>::new_with_salt(salt_length as usize), digest)
        } else {
            key.sign_with_rng(&mut SysRng, Pkcs1v15Sign::new::<H>(), digest)
        }
        .map_err(|_| failed("signing"))
    })
}

/// Verification answers a plain boolean, not an error.
///
/// "This signature is not valid" is an ANSWER, and the page is supposed to act
/// on it. Turning it into an exception invites the `try { verify() } catch {}`
/// that treats a forgery as a transient glitch.
fn rsa_verify(
    public_der: &[u8],
    scheme: String,
    hash: String,
    salt_length: u32,
    digest: &[u8],
    signature: &[u8],
) -> Result<bool, JsErrorBox> {
    let key = public_key(public_der)?;
    per_hash!(hash.as_str(), |H| {
        Ok(if scheme == "PSS" {
            key.verify(Pss::<H>::new_with_salt(salt_length as usize), digest, signature)
        } else {
            key.verify(Pkcs1v15Sign::new::<H>(), digest, signature)
        }
        .is_ok())
    })
}

/// RSA-OAEP encryption. The `label` is optional context that both sides must
/// agree on; it is not secret and it is not encrypted, it is folded into the
/// padding so that a ciphertext minted for one purpose cannot be replayed into
/// another. Arbitrary bytes, not text — which is why it travels as a buffer.
fn rsa_encrypt(
    public_der: &[u8],
    hash: String,
    label: &[u8],
    data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    let key = public_key(public_der)?;
    per_hash!(hash.as_str(), |H| {
        let padding = if label.is_empty() {
            Oaep::<H>::new()
        } else {
            Oaep::<H>::new_with_label(label.to_vec().into_boxed_slice())
        };
        key.encrypt(&mut SysRng, padding, data).map_err(|_| failed("encryption"))
    })
}

fn rsa_decrypt(
    private_der: &[u8],
    hash: String,
    label: &[u8],
    data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    let key = private_key(private_der)?;
    per_hash!(hash.as_str(), |H| {
        let padding = if label.is_empty() {
            Oaep::<H>::new()
        } else {
            Oaep::<H>::new_with_label(label.to_vec().into_boxed_slice())
        };
        // `decrypt_blinded` adds RSA blinding: the private-key operation is run
        // against a randomised value so that its timing carries no information
        // about the key. On a shared or virtualised machine — which is most of
        // the machines this browser is for — that is not paranoia.
        key.decrypt_blinded(&mut SysRng, padding, data).map_err(|_| failed("decryption"))
    })
}


// ── The op boundary ─────────────────────────────────────────────────────────
// Thin wrappers over the functions above. Keeping the real bodies as ordinary
// Rust functions is what lets the tests at the bottom of this file call them
// directly — an op is a JS calling convention, not a place to put logic.

#[op2]
#[buffer]
pub fn op_crypto_rsa_generate(
    modulus_length: u32,
    #[buffer] public_exponent: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    rsa_generate(modulus_length, public_exponent)
}

#[op2]
#[buffer]
pub fn op_crypto_rsa_public(#[buffer] private_der: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    rsa_public(private_der)
}

#[op2]
#[buffer]
pub fn op_crypto_rsa_sign(
    #[buffer] private_der: &[u8],
    #[string] scheme: String,
    #[string] hash: String,
    salt_length: u32,
    #[buffer] digest: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    rsa_sign(private_der, scheme, hash, salt_length, digest)
}

#[op2(fast)]
pub fn op_crypto_rsa_verify(
    #[buffer] public_der: &[u8],
    #[string] scheme: String,
    #[string] hash: String,
    salt_length: u32,
    #[buffer] digest: &[u8],
    #[buffer] signature: &[u8],
) -> Result<bool, JsErrorBox> {
    rsa_verify(public_der, scheme, hash, salt_length, digest, signature)
}

#[op2]
#[buffer]
pub fn op_crypto_rsa_encrypt(
    #[buffer] public_der: &[u8],
    #[string] hash: String,
    #[buffer] label: &[u8],
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    rsa_encrypt(public_der, hash, label, data)
}

#[op2]
#[buffer]
pub fn op_crypto_rsa_decrypt(
    #[buffer] private_der: &[u8],
    #[string] hash: String,
    #[buffer] label: &[u8],
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    rsa_decrypt(private_der, hash, label, data)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 1024-bit key is too small to use, and exactly the right size to test
    /// with: generation is quick and every code path is the same one a 2048-bit
    /// key takes.
    fn key_der() -> Vec<u8> {
        rsa_generate(1024, &[1, 0, 1]).unwrap()
    }

    #[test]
    fn pkcs1v15_round_trip() {
        let priv_der = key_der();
        let pub_der = rsa_public(&priv_der).unwrap();
        let digest = [7u8; 32];
        let sig =
            rsa_sign(&priv_der, "PKCS1".into(), "SHA-256".into(), 0, &digest).unwrap();
        assert!(
            rsa_verify(&pub_der, "PKCS1".into(), "SHA-256".into(), 0, &digest, &sig)
                .unwrap()
        );
        // A different message must NOT verify — the check that a stub which
        // always answers `true` would fail.
        let other = [8u8; 32];
        assert!(
            !rsa_verify(&pub_der, "PKCS1".into(), "SHA-256".into(), 0, &other, &sig)
                .unwrap()
        );
    }

    #[test]
    fn pss_round_trip_and_rejects_a_forgery() {
        let priv_der = key_der();
        let pub_der = rsa_public(&priv_der).unwrap();
        let digest = [3u8; 20];
        let sig = rsa_sign(&priv_der, "PSS".into(), "SHA-1".into(), 20, &digest).unwrap();
        assert!(
            rsa_verify(&pub_der, "PSS".into(), "SHA-1".into(), 20, &digest, &sig).unwrap()
        );
        let mut bad = sig.clone();
        bad[0] ^= 1;
        assert!(
            !rsa_verify(&pub_der, "PSS".into(), "SHA-1".into(), 20, &digest, &bad)
                .unwrap()
        );
    }

    #[test]
    fn oaep_round_trip_with_and_without_a_label() {
        let priv_der = key_der();
        let pub_der = rsa_public(&priv_der).unwrap();
        let msg = b"for a person on a slow connection";
        for label in [&b""[..], &b"context"[..], &[0xff, 0xfe, 0x00][..]] {
            let ct = rsa_encrypt(&pub_der, "SHA-256".into(), label, msg).unwrap();
            let pt = rsa_decrypt(&priv_der, "SHA-256".into(), label, &ct).unwrap();
            assert_eq!(pt, msg);
        }
        // A label is part of the promise: decrypting under a different one must
        // fail rather than quietly succeed.
        let ct = rsa_encrypt(&pub_der, "SHA-256".into(), b"one", msg).unwrap();
        assert!(rsa_decrypt(&priv_der, "SHA-256".into(), b"two", &ct).is_err());
    }
}
