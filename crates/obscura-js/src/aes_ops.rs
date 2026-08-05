//! The AES cipher modes — CBC, CTR and GCM — as primitives.
//!
//! Same contract as [`crate::crypto_ops`]: bytes in, bytes out, no policy. Every
//! Web Crypto rule (which errors, in which order, what a missing `tagLength`
//! defaults to) lives in `bootstrap.js`.
//!
//! **What is audited here and what is not.** The AES block cipher comes from
//! RustCrypto's `aes`, the CBC mode from `cbc`, and the GHASH universal hash
//! from `ghash` — the same crates `aes-gcm` itself is built from, all written to
//! avoid secret-dependent branches and table lookups. The CTR keystream and the
//! GCM composition around GHASH are written out here rather than taken from
//! `aes-gcm`, and that is a deliberate trade with a specific reason:
//!
//!   * Web Crypto's AES-CTR takes a **counter width in bits** — any value from 1
//!     to 128 — and the counter wraps inside exactly that many low bits. The
//!     `ctr` crate offers 32/64/128 only.
//!   * Web Crypto's AES-GCM takes an IV of **any length** and a tag of any of
//!     seven lengths (32…128 bits). `aes-gcm` fixes both as *type parameters*,
//!     so a 40-byte IV or a 32-bit tag cannot be expressed at all.
//!
//! Refusing those would mean refusing keys and messages that are perfectly
//! legal, which is its own kind of breakage. The parts that are written out are
//! counter arithmetic and length framing — public values, no secret-dependent
//! control flow — and the tag comparison, which is done in constant time below.
//! Everything secret-dependent is still the audited primitive.

use aes::cipher::{
    BlockCipherEncrypt, BlockModeDecrypt, BlockModeEncrypt, KeyInit, KeyIvInit,
    block_padding::Pkcs7, common::InnerInit,
};
use aes::{Aes128, Aes192, Aes256};
use deno_core::op2;
use deno_error::JsErrorBox;
use ghash::GHash;
use ghash::universal_hash::UniversalHash;

/// AES has a 16-byte block whatever the key size, but the block *type* is
/// generic, so these two convert at the boundary and let everything else here
/// speak in plain `[u8; 16]`.
fn to_block<C: aes::cipher::BlockSizeUser>(b: &[u8; 16]) -> aes::cipher::Block<C> {
    aes::cipher::Block::<C>::try_from(&b[..]).expect("AES block is 16 bytes")
}
fn from_block<C: aes::cipher::BlockSizeUser>(b: &aes::cipher::Block<C>) -> [u8; 16] {
    let mut out = [0u8; 16];
    out.copy_from_slice(b.as_ref());
    out
}

fn bad_key() -> JsErrorBox {
    JsErrorBox::generic("AES key must be 128, 192 or 256 bits")
}

/// Dispatch on the raw key length to a concrete AES type.
///
/// A macro rather than a generic fn for the same reason as `per_hash!` next
/// door: each body is monomorphic and the trait bounds are painful to spell at
/// the call site. `$c` is bound to the concrete cipher type.
macro_rules! per_aes {
    ($key:expr, |$c:ident| $body:block) => {
        match $key.len() {
            16 => {
                type $c = Aes128;
                $body
            }
            24 => {
                type $c = Aes192;
                $body
            }
            32 => {
                type $c = Aes256;
                $body
            }
            _ => return Err(bad_key()),
        }
    };
}

// ── CBC ─────────────────────────────────────────────────────────────────────

/// AES-CBC with PKCS#7 padding, which is what Web Crypto specifies.
///
/// The padding is why a CBC ciphertext is always a whole number of blocks and
/// always at least one block long: a message that already ends on a block
/// boundary gets a whole extra block of padding, so that stripping it is never
/// ambiguous.
#[op2]
#[buffer]
pub fn op_crypto_aes_cbc_encrypt(
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    if iv.len() != 16 {
        return Err(JsErrorBox::generic("AES-CBC iv must be 16 bytes"));
    }
    Ok(per_aes!(key, |C| {
        let enc = <cbc::Encryptor<C> as KeyIvInit>::new_from_slices(key, iv)
            .map_err(|_| bad_key())?;
        enc.encrypt_padded_vec::<Pkcs7>(data)
    }))
}

/// AES-CBC decryption.
///
/// Bad padding is a real error and is reported as one — but note what the JS
/// side does with it: every CBC decryption failure becomes the same
/// `OperationError` with the same message, because "the padding was wrong" and
/// "the length was wrong" are exactly the distinction a padding-oracle attack
/// needs, and a page has no use for it.
#[op2]
#[buffer]
pub fn op_crypto_aes_cbc_decrypt(
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    if iv.len() != 16 {
        return Err(JsErrorBox::generic("AES-CBC iv must be 16 bytes"));
    }
    if data.is_empty() || data.len() % 16 != 0 {
        return Err(JsErrorBox::generic("AES-CBC ciphertext length is invalid"));
    }
    Ok(per_aes!(key, |C| {
        let dec = <cbc::Decryptor<C> as KeyIvInit>::new_from_slices(key, iv)
            .map_err(|_| bad_key())?;
        dec.decrypt_padded_vec::<Pkcs7>(data)
            .map_err(|_| JsErrorBox::generic("AES-CBC decryption failed"))?
    }))
}

// ── CTR ─────────────────────────────────────────────────────────────────────

/// Increment the low `bits` bits of a 128-bit counter block, in place, wrapping
/// inside that field and leaving the bits above it alone.
///
/// This is the part of AES-CTR that Web Crypto parameterizes: the counter block
/// is split into a fixed nonce (the high bits) and a counter (the low `bits`).
/// The nonce must stay put — otherwise a long message would walk out of its own
/// counter space and into another message's keystream.
fn inc_counter(block: &mut [u8; 16], bits: u32) {
    let mut carry = 1u16;
    let mut done = 0u32;
    let mut i = 16usize;
    while done < bits && carry != 0 && i > 0 {
        i -= 1;
        let avail = core::cmp::min(bits - done, 8);
        let mask: u8 = if avail == 8 { 0xff } else { ((1u16 << avail) - 1) as u8 };
        let sum = (block[i] & mask) as u16 + carry;
        block[i] = (block[i] & !mask) | ((sum as u8) & mask);
        carry = u16::from(sum > mask as u16);
        done += avail;
    }
}

/// The AES-CTR keystream, XORed into `data`. Encryption and decryption are the
/// same operation — that is the whole point of a stream mode — so one op serves
/// both.
fn ctr_xor<C: BlockCipherEncrypt + KeyInit>(
    key: &[u8],
    counter: &[u8; 16],
    bits: u32,
    data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    let cipher = C::new_from_slice(key).map_err(|_| bad_key())?;
    let mut block = *counter;
    let mut out = data.to_vec();
    for chunk in out.chunks_mut(16) {
        let mut ks = to_block::<C>(&block);
        cipher.encrypt_block(&mut ks);
        for (b, k) in chunk.iter_mut().zip(ks.iter()) {
            *b ^= *k;
        }
        inc_counter(&mut block, bits);
    }
    Ok(out)
}

#[op2]
#[buffer]
pub fn op_crypto_aes_ctr(
    #[buffer] key: &[u8],
    #[buffer] counter: &[u8],
    length: u32,
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    if counter.len() != 16 {
        return Err(JsErrorBox::generic("AES-CTR counter must be 16 bytes"));
    }
    if length == 0 || length > 128 {
        return Err(JsErrorBox::generic("AES-CTR length must be 1..=128 bits"));
    }
    let mut block = [0u8; 16];
    block.copy_from_slice(counter);
    per_aes!(key, |C| { ctr_xor::<C>(key, &block, length, data) })
}

// ── GCM ─────────────────────────────────────────────────────────────────────

/// GHASH the way GCM frames its inputs: AAD zero-padded to a block boundary,
/// then the ciphertext zero-padded likewise, then one final block holding the
/// two *bit* lengths. The lengths are what stop an attacker from moving bytes
/// between the authenticated-but-not-encrypted half and the encrypted half.
fn ghash_tag_input(h: &[u8; 16], aad: &[u8], ct: &[u8]) -> [u8; 16] {
    let mut gh = <GHash as KeyInit>::new(h.into());
    gh.update_padded(aad);
    gh.update_padded(ct);
    let mut lengths = [0u8; 16];
    lengths[..8].copy_from_slice(&((aad.len() as u64) * 8).to_be_bytes());
    lengths[8..].copy_from_slice(&((ct.len() as u64) * 8).to_be_bytes());
    gh.update(&[lengths.into()]);
    gh.finalize().into()
}

/// GCM's pre-counter block J0.
///
/// A 96-bit IV is used directly, with the counter field set to 1 — that is the
/// fast path GCM was designed around, and why 96 bits is the recommended IV
/// size. Any other length is hashed down to 128 bits through GHASH, which costs
/// an extra pass but accepts an IV of any size, including one a page derived
/// from something else and cannot resize.
fn gcm_j0(h: &[u8; 16], iv: &[u8]) -> [u8; 16] {
    if iv.len() == 12 {
        let mut j0 = [0u8; 16];
        j0[..12].copy_from_slice(iv);
        j0[15] = 1;
        return j0;
    }
    let mut gh = <GHash as KeyInit>::new(h.into());
    gh.update_padded(iv);
    let mut lengths = [0u8; 16];
    lengths[8..].copy_from_slice(&((iv.len() as u64) * 8).to_be_bytes());
    gh.update(&[lengths.into()]);
    gh.finalize().into()
}

/// Everything both GCM directions share: the hash subkey H, the pre-counter
/// block J0, and the mask E(K, J0) that turns the GHASH output into a tag.
fn gcm_setup<C: BlockCipherEncrypt + KeyInit>(
    key: &[u8],
    iv: &[u8],
) -> Result<([u8; 16], [u8; 16], [u8; 16]), JsErrorBox> {
    let cipher = C::new_from_slice(key).map_err(|_| bad_key())?;
    let mut h = aes::cipher::Block::<C>::default();
    cipher.encrypt_block(&mut h);
    let h = from_block::<C>(&h);
    let j0 = gcm_j0(&h, iv);
    let mut mask = to_block::<C>(&j0);
    cipher.encrypt_block(&mut mask);
    Ok((h, j0, from_block::<C>(&mask)))
}

fn gcm_encrypt<C: BlockCipherEncrypt + KeyInit>(
    key: &[u8],
    iv: &[u8],
    aad: &[u8],
    tag_len: usize,
    plaintext: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    let (h, j0, mask) = gcm_setup::<C>(key, iv)?;
    // The data counter starts one past J0; J0 itself is reserved for the tag
    // mask, so no keystream block is ever reused as a mask or vice versa.
    let mut ctr = j0;
    inc_counter(&mut ctr, 32);
    let mut out = ctr_xor::<C>(key, &ctr, 32, plaintext)?;
    let s = ghash_tag_input(&h, aad, &out);
    // A truncated tag is the *leftmost* bits of the full one (SP 800-38D §5.2.1.2).
    for i in 0..tag_len {
        out.push(s[i] ^ mask[i]);
    }
    Ok(out)
}

fn gcm_decrypt<C: BlockCipherEncrypt + KeyInit>(
    key: &[u8],
    iv: &[u8],
    aad: &[u8],
    tag_len: usize,
    data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    if data.len() < tag_len {
        return Err(JsErrorBox::generic("AES-GCM ciphertext is shorter than its tag"));
    }
    let (ct, tag) = data.split_at(data.len() - tag_len);
    let (h, j0, mask) = gcm_setup::<C>(key, iv)?;
    let s = ghash_tag_input(&h, aad, ct);
    // Verify BEFORE decrypting, and compare in constant time. Returning the
    // plaintext of a message whose tag did not check out is the one thing an
    // authenticated cipher exists to prevent, and comparing with an early
    // return would let an attacker find a valid tag one byte at a time.
    let mut diff = 0u8;
    for i in 0..tag_len {
        diff |= tag[i] ^ (s[i] ^ mask[i]);
    }
    if diff != 0 {
        return Err(JsErrorBox::generic("AES-GCM authentication failed"));
    }
    let mut ctr = j0;
    inc_counter(&mut ctr, 32);
    ctr_xor::<C>(key, &ctr, 32, ct)
}

#[op2]
#[buffer]
pub fn op_crypto_aes_gcm_encrypt(
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
    #[buffer] aad: &[u8],
    tag_length: u32,
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    let tag_len = (tag_length / 8) as usize;
    per_aes!(key, |C| { gcm_encrypt::<C>(key, iv, aad, tag_len, data) })
}

#[op2]
#[buffer]
pub fn op_crypto_aes_gcm_decrypt(
    #[buffer] key: &[u8],
    #[buffer] iv: &[u8],
    #[buffer] aad: &[u8],
    tag_length: u32,
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    let tag_len = (tag_length / 8) as usize;
    per_aes!(key, |C| { gcm_decrypt::<C>(key, iv, aad, tag_len, data) })
}

// ── AES-KW ──────────────────────────────────────────────────────────────────

/// The NIST AES Key Wrap (RFC 3394). This is the one AES mode whose *only* job
/// is to protect other keys: no IV, no nonce, deterministic, and authenticated
/// by a fixed 64-bit integrity check value. It is what lets a page hand a key to
/// storage — or to a server — without the key ever being in the clear.
///
/// From RustCrypto's `aes-kw`, unmodified.
#[op2]
#[buffer]
pub fn op_crypto_aes_kw_wrap(
    #[buffer] key: &[u8],
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    if data.len() < 16 || data.len() % 8 != 0 {
        return Err(JsErrorBox::generic("AES-KW data must be a multiple of 8 bytes, at least 16"));
    }
    Ok(per_aes!(key, |C| {
        let kek = aes_kw::AesKw::<C>::inner_init(C::new_from_slice(key).map_err(|_| bad_key())?);
        let mut out = vec![0u8; data.len() + 8];
        kek.wrap_key(data, &mut out)
            .map_err(|_| JsErrorBox::generic("AES-KW wrap failed"))?;
        out
    }))
}

#[op2]
#[buffer]
pub fn op_crypto_aes_kw_unwrap(
    #[buffer] key: &[u8],
    #[buffer] data: &[u8],
) -> Result<Vec<u8>, JsErrorBox> {
    if data.len() < 24 || data.len() % 8 != 0 {
        return Err(JsErrorBox::generic("AES-KW data must be a multiple of 8 bytes, at least 24"));
    }
    Ok(per_aes!(key, |C| {
        let kek = aes_kw::AesKw::<C>::inner_init(C::new_from_slice(key).map_err(|_| bad_key())?);
        let mut out = vec![0u8; data.len() - 8];
        kek.unwrap_key(data, &mut out)
            .map_err(|_| JsErrorBox::generic("AES-KW unwrap failed"))?;
        out
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The counter field wraps inside its own width and never disturbs the
    /// nonce above it — the property that keeps two messages under one key from
    /// colliding keystreams.
    #[test]
    fn counter_wraps_within_its_width() {
        let mut b = [0xffu8; 16];
        inc_counter(&mut b, 8);
        assert_eq!(b[15], 0x00);
        assert_eq!(b[14], 0xff, "the nonce above the counter must not move");

        let mut b = [0u8; 16];
        b[15] = 0xff;
        inc_counter(&mut b, 16);
        assert_eq!(&b[14..], &[0x01, 0x00]);

        // A 4-bit counter is four bits wide, not one byte.
        let mut b = [0u8; 16];
        b[15] = 0xaf;
        inc_counter(&mut b, 4);
        assert_eq!(b[15], 0xa0);
    }

    /// NIST SP 800-38D test case 2 — the smallest GCM vector with a real tag.
    #[test]
    fn gcm_matches_nist_case_2() {
        let key = [0u8; 16];
        let iv = [0u8; 12];
        let out = gcm_encrypt::<Aes128>(&key, &iv, &[], 16, &[0u8; 16]).unwrap();
        let expect_ct = [
            0x03, 0x88, 0xda, 0xce, 0x60, 0xb6, 0xa3, 0x92, 0xf3, 0x28, 0xc2, 0xb9, 0x71, 0xb2,
            0xfe, 0x78,
        ];
        let expect_tag = [
            0xab, 0x6e, 0x47, 0xd4, 0x2c, 0xec, 0x13, 0xbd, 0xf5, 0x3a, 0x67, 0xb2, 0x12, 0x57,
            0xbd, 0xdf,
        ];
        assert_eq!(&out[..16], &expect_ct);
        assert_eq!(&out[16..], &expect_tag);
        assert_eq!(gcm_decrypt::<Aes128>(&key, &iv, &[], 16, &out).unwrap(), vec![0u8; 16]);
    }

    /// A flipped bit anywhere must fail the tag check rather than hand back
    /// plaintext.
    #[test]
    fn gcm_rejects_a_tampered_message() {
        let key = [7u8; 32];
        let iv = [9u8; 12];
        let mut out = gcm_encrypt::<Aes256>(&key, &iv, b"aad", 16, b"hello").unwrap();
        out[0] ^= 1;
        assert!(gcm_decrypt::<Aes256>(&key, &iv, b"aad", 16, &out).is_err());
    }
}
