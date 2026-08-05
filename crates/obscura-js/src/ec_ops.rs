//! Elliptic-curve primitives for Web Crypto: ECDSA, ECDH, Ed25519 and X25519.
//!
//! Same layering as `crypto_ops.rs` — bytes in, bytes out, no policy. The JS
//! side owns key formats (SPKI/PKCS8/JWK/raw), usages and error ordering; this
//! file only ever sees a curve name, a scalar and a point.
//!
//! Two conventions hold throughout, because they are what Web Crypto uses on the
//! wire and picking anything else would mean converting twice:
//!
//!   * a **private key** is its scalar `d`, big-endian, left-padded to the
//!     curve's field size (32/48/66 bytes for P-256/P-384/P-521);
//!   * a **public key** is the uncompressed SEC1 point `0x04 ‖ x ‖ y`.
//!
//! ECDSA signs a **prehash**: Web Crypto lets the caller pair any curve with any
//! hash, so the digest is computed on the JS side and handed here already made.
//! Signatures are the fixed-width `r ‖ s` Web Crypto specifies — *not* the DER
//! encoding that ECDSA uses in TLS and X.509. Handing a page a DER signature
//! where it expects `r ‖ s` produces a signature that verifies nowhere.

use deno_core::op2;
use deno_error::JsErrorBox;

fn bad(msg: &str) -> JsErrorBox {
    JsErrorBox::generic(msg.to_string())
}

/// Run `$body` with `$C` bound to the concrete curve type for a Web Crypto
/// `namedCurve` string. Unknown curves are the caller's error to report as a
/// `NotSupportedError`, so they come back as a plain failure here.
macro_rules! per_curve {
    ($curve:expr, |$c:ident| $body:block) => {
        match $curve {
            "P-256" => { use p256 as $c; $body }
            "P-384" => { use p384 as $c; $body }
            "P-521" => { use p521 as $c; $body }
            _ => return Err(bad("unsupported namedCurve")),
        }
    };
}

/// Generate an EC private key: a uniformly random scalar in [1, n-1].
#[op2]
#[buffer]
pub fn op_crypto_ec_generate(#[string] curve: String) -> Result<Vec<u8>, JsErrorBox> {
    per_curve!(curve.as_str(), |C| {
        let sk = C::ecdsa::SigningKey::random(&mut rand_core_compat::OsRng);
        Ok(sk.to_bytes().to_vec())
    })
}

/// Derive the public point from a private scalar. Also the validity check for an
/// imported private key: a scalar of the wrong size, or zero, or ≥ n, fails here
/// rather than silently producing a key that cannot sign.
#[op2]
#[buffer]
pub fn op_crypto_ec_public(#[string] curve: String, #[buffer] d: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    per_curve!(curve.as_str(), |C| {
        let sk = C::ecdsa::SigningKey::from_slice(d).map_err(|_| bad("invalid private key"))?;
        let vk = C::ecdsa::VerifyingKey::from(&sk);
        Ok(vk.to_encoded_point(false).as_bytes().to_vec())
    })
}

/// Validate a SEC1 point and return it in uncompressed form.
///
/// Accepts both encodings a public key can arrive in and normalises to one, so
/// nothing downstream has to care which was used. A **compressed** point is
/// `0x02`/`0x03 ‖ x` — half the bytes, because y can be recomputed from x up to
/// a sign, and the prefix carries the sign. Rejecting it would mean rejecting a
/// perfectly good key for being efficiently encoded, which matters most on
/// exactly the metered connections this browser is for.
///
/// The validation is not a formality either. A "public key" that is not on the
/// curve — or is the point at infinity, or sits in a small subgroup — is the
/// classic invalid-curve attack: hand it to an ECDH peer and their replies leak
/// their private key a few bits at a time. The RustCrypto decoders reject all of
/// those, so a successful decode IS the check.
#[op2]
#[buffer]
pub fn op_crypto_ec_point_normalize(
    #[string] curve: String,
    #[buffer] point: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    per_curve!(curve.as_str(), |C| {
        let vk = C::ecdsa::VerifyingKey::from_sec1_bytes(point).map_err(|_| bad("invalid public key"))?;
        Ok(vk.to_encoded_point(false).as_bytes().to_vec())
    })
}

/// Left-pad a digest to the curve's field width.
///
/// SEC1 §4.1.3 takes the leftmost `min(hashLen, fieldLen)` bits of the digest as
/// an integer — so a digest SHORTER than the field is simply that integer, which
/// as bytes means zero-padding on the left. RustCrypto's prehash traits refuse a
/// short digest outright (a sane default: it usually means the caller paired the
/// wrong hash with the curve), but Web Crypto explicitly allows any pairing —
/// P-521 with SHA-256 is legal and useful. Without this, EVERY P-521 signature
/// and every P-384-with-SHA-1 signature failed.
fn pad_prehash(prehash: &[u8], field: usize) -> Vec<u8> {
    if prehash.len() >= field {
        return prehash.to_vec();
    }
    let mut out = vec![0u8; field];
    out[field - prehash.len()..].copy_from_slice(prehash);
    out
}

fn field_bytes(curve: &str) -> usize {
    match curve { "P-256" => 32, "P-384" => 48, _ => 66 }
}

/// ECDSA over an already-computed digest. Returns `r ‖ s`, each left-padded to
/// the field size.
#[op2]
#[buffer]
pub fn op_crypto_ecdsa_sign(
    #[string] curve: String,
    #[buffer] d: &[u8],
    #[buffer] prehash: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    use ecdsa::signature::hazmat::PrehashSigner;
    let prehash = &pad_prehash(prehash, field_bytes(&curve))[..];
    per_curve!(curve.as_str(), |C| {
        let sk = C::ecdsa::SigningKey::from_slice(d).map_err(|_| bad("invalid private key"))?;
        let sig: C::ecdsa::Signature = sk.sign_prehash(prehash).map_err(|_| bad("ECDSA signing failed"))?;
        Ok(sig.to_bytes().to_vec())
    })
}

/// Verify an `r ‖ s` signature over a digest. A malformed signature is `false`,
/// never an error: "this signature is not valid" is exactly the answer the
/// caller asked for, and turning it into an exception tempts a page into a
/// `catch` block that treats the failure as a transient problem.
#[op2(fast)]
pub fn op_crypto_ecdsa_verify(
    #[string] curve: String,
    #[buffer] point: &[u8],
    #[buffer] sig: &[u8],
    #[buffer] prehash: &[u8],
) -> Result<bool, JsErrorBox> {
    use ecdsa::signature::hazmat::PrehashVerifier;
    let prehash = &pad_prehash(prehash, field_bytes(&curve))[..];
    per_curve!(curve.as_str(), |C| {
        let vk = match C::ecdsa::VerifyingKey::from_sec1_bytes(point) {
            Ok(v) => v,
            Err(_) => return Ok(false),
        };
        let signature = match C::ecdsa::Signature::from_slice(sig) {
            Ok(s) => s,
            Err(_) => return Ok(false),
        };
        Ok(vk.verify_prehash(prehash, &signature).is_ok())
    })
}

/// ECDH. The shared secret is the **x coordinate only** — y is discarded, which
/// is why two peers who computed mirror-image points still agree.
#[op2]
#[buffer]
pub fn op_crypto_ecdh(
    #[string] curve: String,
    #[buffer] d: &[u8],
    #[buffer] point: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    per_curve!(curve.as_str(), |C| {
        use C::elliptic_curve::sec1::ToEncodedPoint;
        let secret = C::SecretKey::from_slice(d).map_err(|_| bad("invalid private key"))?;
        let public = C::PublicKey::from_sec1_bytes(point).map_err(|_| bad("invalid public key"))?;
        let shared = C::elliptic_curve::ecdh::diffie_hellman(
            secret.to_nonzero_scalar(),
            public.as_affine(),
        );
        let _ = public.to_encoded_point(false);
        Ok(shared.raw_secret_bytes().to_vec())
    })
}

// ── The CFRG curves ──────────────────────────────────────────────────────────
// Ed25519 and X25519 have no curve parameter: the curve IS the algorithm. Both
// keys are 32 bytes in every direction, which is most of why they are pleasant.

#[op2]
#[buffer]
pub fn op_crypto_ed25519_generate() -> Result<Vec<u8>, JsErrorBox> {
    let mut seed = [0u8; 32];
    getrandom::getrandom(&mut seed).map_err(|_| bad("getrandom failed"))?;
    Ok(seed.to_vec())
}

#[op2]
#[buffer]
pub fn op_crypto_ed25519_public(#[buffer] seed: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    let s: [u8; 32] = seed.try_into().map_err(|_| bad("invalid Ed25519 private key"))?;
    let sk = ed25519_dalek::SigningKey::from_bytes(&s);
    Ok(sk.verifying_key().to_bytes().to_vec())
}

#[op2]
#[buffer]
pub fn op_crypto_ed25519_sign(#[buffer] seed: &[u8], #[buffer] msg: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    use ed25519_dalek::Signer;
    let s: [u8; 32] = seed.try_into().map_err(|_| bad("invalid Ed25519 private key"))?;
    let sk = ed25519_dalek::SigningKey::from_bytes(&s);
    Ok(sk.sign(msg).to_bytes().to_vec())
}

/// Ed25519 verification, with the strictness Web Crypto asks for: the small-order
/// public keys and non-canonical encodings that some libraries accept are
/// rejected here (`verify_strict`), because two implementations disagreeing about
/// whether a signature is valid is itself the vulnerability.
#[op2(fast)]
pub fn op_crypto_ed25519_verify(
    #[buffer] public: &[u8],
    #[buffer] sig: &[u8],
    #[buffer] msg: &[u8],
) -> Result<bool, JsErrorBox> {
    let p: [u8; 32] = match public.try_into() { Ok(p) => p, Err(_) => return Ok(false) };
    let s: [u8; 64] = match sig.try_into() { Ok(s) => s, Err(_) => return Ok(false) };
    let vk = match ed25519_dalek::VerifyingKey::from_bytes(&p) { Ok(v) => v, Err(_) => return Ok(false) };
    Ok(vk.verify_strict(msg, &ed25519_dalek::Signature::from_bytes(&s)).is_ok())
}

#[op2]
#[buffer]
pub fn op_crypto_x25519_generate() -> Result<Vec<u8>, JsErrorBox> {
    let mut seed = [0u8; 32];
    getrandom::getrandom(&mut seed).map_err(|_| bad("getrandom failed"))?;
    Ok(seed.to_vec())
}

#[op2]
#[buffer]
pub fn op_crypto_x25519_public(#[buffer] d: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    let s: [u8; 32] = d.try_into().map_err(|_| bad("invalid X25519 private key"))?;
    Ok(x25519_dalek::PublicKey::from(&x25519_dalek::StaticSecret::from(s)).to_bytes().to_vec())
}

/// X25519 agreement. An all-zero output means the peer sent a small-order point
/// and the "shared secret" is one every attacker already knows — Web Crypto
/// requires that be an error, not a key.
#[op2]
#[buffer]
pub fn op_crypto_x25519(#[buffer] d: &[u8], #[buffer] public: &[u8]) -> Result<Vec<u8>, JsErrorBox> {
    let s: [u8; 32] = d.try_into().map_err(|_| bad("invalid X25519 private key"))?;
    let p: [u8; 32] = public.try_into().map_err(|_| bad("invalid X25519 public key"))?;
    let shared = x25519_dalek::StaticSecret::from(s).diffie_hellman(&x25519_dalek::PublicKey::from(p));
    if !shared.was_contributory() {
        return Err(bad("X25519 produced an all-zero shared secret"));
    }
    Ok(shared.to_bytes().to_vec())
}

/// `ecdsa::SigningKey::random` wants an `OsRng` from the `rand_core` version the
/// elliptic-curve stack was built against; this keeps that coupling in one place.
mod rand_core_compat {
    pub use p256::elliptic_curve::rand_core::OsRng;
}
