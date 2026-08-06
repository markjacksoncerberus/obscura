//! The streaming compression primitives behind `CompressionStream` and
//! `DecompressionStream`.
//!
//! Same contract as the crypto ops next door: bytes in, bytes out, no policy.
//! Every Web-facing rule (which formats exist, what a bad chunk does to the
//! stream, when a `TypeError` is thrown) lives in `bootstrap.js`.
//!
//! **Why this matters on a slow connection.** A page that can compress before it
//! uploads, and decompress what it caches, moves a fraction of the bytes. For a
//! reader paying by the megabyte that is not a nicety — it is whether the page
//! is affordable at all. Every format here is one a real site already assumes.
//!
//! **What is written out here and what is not.** DEFLATE itself is `flate2` over
//! the pure-Rust `miniz_oxide` backend (no C toolchain, so the browser still
//! builds anywhere), and Brotli is the `brotli` crate. The zlib *wrapper* and its
//! Adler-32 come free from `flate2::Decompress::new(true)`. The **gzip framing**
//! — RFC 1952's header, its optional fields, the CRC-32 and ISIZE trailer — is
//! written out below, because `flate2`'s own gzip helpers are only compiled with
//! a C zlib backend. Writing it out is not a workaround so much as a benefit: a
//! corrupt gzip header has to fail in *exactly* the places the spec says, and
//! here we can see every one of them.
//!
//! **Streams are stateful, so these ops are handle-based.** A codec lives in a
//! thread-local table keyed by an integer; JS creates one, pushes chunks, and
//! finishes it. Because a *chunk* can be both partially decoded and invalid — a
//! valid stream with trailing garbage decodes fine and then must error — a push
//! never fails outright. It returns whatever it produced and records the error,
//! and JS asks for it separately. Losing the good bytes to report the bad ones
//! would fail `decompression-extra-input`, which reads the payload *first*.

use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Write;

use deno_core::op2;
use deno_error::JsErrorBox;
use flate2::{Compress, Compression, Crc, Decompress, FlushCompress, FlushDecompress, Status};

/// Work buffer for one turn of a codec loop. Big enough that the common chunk
/// is one pass, small enough to stay off the stack limit — it is heap'd anyway.
const CHUNK: usize = 64 * 1024;

/// The gzip header we *write*. MTIME is left zero and OS is 0xff ("unknown") on
/// purpose: a real timestamp and a real OS byte are two bits of fingerprint that
/// the format does not need and that no reader of the data ever wants.
const GZIP_HEADER: [u8; 10] = [0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0xff];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Format {
    /// RFC 1950 — DEFLATE inside a zlib wrapper. Confusingly, the web calls this
    /// one "deflate"; the *actual* bare DEFLATE is `deflate-raw`.
    Deflate,
    /// RFC 1951 — DEFLATE with no wrapper at all.
    DeflateRaw,
    /// RFC 1952.
    Gzip,
    /// RFC 7932.
    Brotli,
}

fn parse_format(s: &str) -> Option<Format> {
    match s {
        "deflate" => Some(Format::Deflate),
        "deflate-raw" => Some(Format::DeflateRaw),
        "gzip" => Some(Format::Gzip),
        "brotli" => Some(Format::Brotli),
        _ => None,
    }
}

// ── gzip framing ────────────────────────────────────────────────────────────

/// What we must still track while *writing* a gzip member.
struct GzOut {
    crc: Crc,
    header_written: bool,
}

/// What we must still track while *reading* one.
struct GzIn {
    /// Header bytes seen so far, held until the header is complete. A one-byte
    /// write is legal, so the header can arrive across ten calls.
    hdr: Vec<u8>,
    header_done: bool,
    crc: Crc,
    /// The 8-byte trailer, likewise accumulated across calls.
    trailer: Vec<u8>,
}

/// Parse an RFC 1952 header.
///
/// `Ok(Some(n))` — the header is complete and `n` bytes long.
/// `Ok(None)` — valid so far, but truncated; ask again with more.
/// `Err(())` — this is not a gzip header, and no amount of extra input fixes it.
fn parse_gzip_header(b: &[u8]) -> Result<Option<usize>, ()> {
    // The magic and CM can be judged from the first bytes that arrive, so a
    // wrong ID errors immediately rather than waiting for a header that will
    // never be valid.
    if !b.is_empty() && b[0] != 0x1f {
        return Err(());
    }
    if b.len() >= 2 && b[1] != 0x8b {
        return Err(());
    }
    if b.len() >= 3 && b[2] != 8 {
        // CM: DEFLATE is the only compression method gzip ever defined.
        return Err(());
    }
    if b.len() < 10 {
        return Ok(None);
    }
    let flg = b[3];
    if flg & 0xe0 != 0 {
        // Reserved bits. RFC 1952 §2.3.1: "must be zero" — a decoder that
        // ignored them could not tell a future extension from corruption.
        return Err(());
    }
    let mut i = 10usize;
    if flg & 0x04 != 0 {
        // FEXTRA: a 2-byte length then that many bytes.
        if b.len() < i + 2 {
            return Ok(None);
        }
        let xlen = u16::from_le_bytes([b[i], b[i + 1]]) as usize;
        i += 2 + xlen;
        if b.len() < i {
            return Ok(None);
        }
    }
    for flag in [0x08u8, 0x10] {
        // FNAME then FCOMMENT: NUL-terminated, so scan for the terminator.
        if flg & flag != 0 {
            let end = b[i..].iter().position(|&c| c == 0);
            match end {
                Some(p) => i += p + 1,
                None => return Ok(None),
            }
        }
    }
    if flg & 0x02 != 0 {
        // FHCRC: the low 16 bits of the CRC-32 of everything above it. This is
        // the check that catches a single flipped byte in the header — the one
        // place gzip verifies itself before spending any work on the payload.
        if b.len() < i + 2 {
            return Ok(None);
        }
        let mut crc = Crc::new();
        crc.update(&b[..i]);
        if (crc.sum() & 0xffff) as u16 != u16::from_le_bytes([b[i], b[i + 1]]) {
            return Err(());
        }
        i += 2;
    }
    Ok(Some(i))
}

// ── the codec table ─────────────────────────────────────────────────────────

enum Inner {
    Enc {
        c: Compress,
        gz: Option<GzOut>,
    },
    Dec {
        d: Decompress,
        gz: Option<GzIn>,
        /// Set once the compressed stream reports its own end. Everything after
        /// that point is trailing garbage, which is an error, not more data.
        ended: bool,
    },
    // The Brotli crate's `Write` adapters already speak exactly the shape we
    // need — including reporting a short write at end-of-stream, which is how
    // trailing garbage announces itself. `Option` only so `finish` can consume.
    BrEnc(Option<brotli::CompressorWriter<Vec<u8>>>),
    BrDec {
        w: Option<brotli::DecompressorWriter<Vec<u8>>>,
        ended: bool,
    },
}

struct Stream {
    inner: Inner,
    /// Bytes produced and not yet handed to JS.
    out: Vec<u8>,
    /// Sticky: once a compressed stream is wrong it stays wrong.
    errored: bool,
}

thread_local! {
    static CODECS: RefCell<HashMap<u32, Stream>> = RefCell::new(HashMap::new());
    static NEXT_ID: RefCell<u32> = const { RefCell::new(1) };
}

/// Drive `flate2`'s compressor until it stops making progress.
///
/// `flate2` reports consumption through running totals rather than return
/// values, so each turn is measured as a delta. With `Finish` we must keep
/// going until `StreamEnd`; otherwise we stop when the input is drained and the
/// codec has no more output to give.
fn run_compress(c: &mut Compress, mut input: &[u8], flush: FlushCompress, out: &mut Vec<u8>) -> bool {
    let mut buf = vec![0u8; CHUNK];
    loop {
        let (in0, out0) = (c.total_in(), c.total_out());
        let status = match c.compress(input, &mut buf, flush) {
            Ok(s) => s,
            Err(_) => return false,
        };
        let consumed = (c.total_in() - in0) as usize;
        let produced = (c.total_out() - out0) as usize;
        out.extend_from_slice(&buf[..produced]);
        input = &input[consumed..];
        if status == Status::StreamEnd {
            return true;
        }
        if flush == FlushCompress::Finish {
            if produced == 0 && consumed == 0 {
                return false; // wedged without ending: treat as failure
            }
            continue;
        }
        if input.is_empty() && produced == 0 {
            return true;
        }
    }
}

impl Stream {
    fn push(&mut self, data: &[u8]) {
        if self.errored {
            return;
        }
        match &mut self.inner {
            Inner::Enc { c, gz } => {
                if let Some(g) = gz {
                    if !g.header_written {
                        self.out.extend_from_slice(&GZIP_HEADER);
                        g.header_written = true;
                    }
                    g.crc.update(data);
                }
                if !run_compress(c, data, FlushCompress::None, &mut self.out) {
                    self.errored = true;
                }
            }
            Inner::Dec { d, gz, ended } => {
                // Peel the gzip header first, if we are still inside it. It can
                // straddle any number of writes — a one-byte write is legal —
                // so it is buffered whole and what follows it becomes the input.
                let mut after_header: Vec<u8> = Vec::new();
                let mut header_just_ended = false;
                if let Some(g) = gz {
                    if !g.header_done {
                        g.hdr.extend_from_slice(data);
                        match parse_gzip_header(&g.hdr) {
                            Err(()) => {
                                self.errored = true;
                                return;
                            }
                            Ok(None) => return,
                            Ok(Some(n)) => {
                                g.header_done = true;
                                after_header = g.hdr.split_off(n);
                                g.hdr = Vec::new();
                                header_just_ended = true;
                            }
                        }
                    }
                }
                let mut input: &[u8] = if header_just_ended { &after_header } else { data };
                let mut buf = vec![0u8; CHUNK];
                while !input.is_empty() && !*ended && !self.errored {
                    let (in0, out0) = (d.total_in(), d.total_out());
                    let status = match d.decompress(input, &mut buf, FlushDecompress::None) {
                        Ok(s) => s,
                        Err(_) => {
                            self.errored = true;
                            return;
                        }
                    };
                    let consumed = (d.total_in() - in0) as usize;
                    let produced = (d.total_out() - out0) as usize;
                    if let Some(g) = gz {
                        g.crc.update(&buf[..produced]);
                    }
                    self.out.extend_from_slice(&buf[..produced]);
                    input = &input[consumed..];
                    if status == Status::StreamEnd {
                        *ended = true;
                    } else if consumed == 0 && produced == 0 {
                        // No progress and no end: the codec is waiting for input
                        // it will only get on the next write.
                        break;
                    }
                }
                if *ended && !input.is_empty() {
                    match gz {
                        // gzip's 8-byte trailer is not "trailing garbage" — it
                        // is the part that proves the payload arrived intact.
                        Some(g) => {
                            let want = 8 - g.trailer.len().min(8);
                            let take = want.min(input.len());
                            g.trailer.extend_from_slice(&input[..take]);
                            if input.len() > take {
                                self.errored = true;
                            }
                        }
                        None => self.errored = true,
                    }
                }
            }
            Inner::BrEnc(w) => {
                let w = w.as_mut().expect("encoder outlives its pushes");
                if w.write_all(data).is_err() {
                    self.errored = true;
                }
                self.out.append(w.get_mut());
            }
            Inner::BrDec { w, ended } => {
                let dec = w.as_mut().expect("decoder outlives its pushes");
                if *ended {
                    if !data.is_empty() {
                        self.errored = true;
                    }
                    return;
                }
                match dec.write(data) {
                    Ok(n) => {
                        // A short write is how this decoder says "the brotli
                        // stream ended here"; anything past that point is not
                        // part of it.
                        if n < data.len() {
                            *ended = true;
                            self.errored = true;
                        }
                    }
                    Err(_) => self.errored = true,
                }
                self.out.append(dec.get_mut());
            }
        }
    }

    /// End of input. Flush what is buffered and check that the stream is whole.
    fn finish(&mut self) {
        if self.errored {
            return;
        }
        match &mut self.inner {
            Inner::Enc { c, gz } => {
                if let Some(g) = gz {
                    if !g.header_written {
                        // Nothing was ever written: still a valid empty member.
                        self.out.extend_from_slice(&GZIP_HEADER);
                        g.header_written = true;
                    }
                }
                if !run_compress(c, &[], FlushCompress::Finish, &mut self.out) {
                    self.errored = true;
                    return;
                }
                if let Some(g) = gz {
                    self.out.extend_from_slice(&g.crc.sum().to_le_bytes());
                    self.out.extend_from_slice(&g.crc.amount().to_le_bytes());
                }
            }
            Inner::Dec { d: _, gz, ended } => {
                if !*ended {
                    // Truncated. A decompressor that returned what it had would
                    // hand the page a silently half-read file.
                    self.errored = true;
                    return;
                }
                if let Some(g) = gz {
                    if g.trailer.len() != 8 {
                        self.errored = true;
                        return;
                    }
                    let crc = u32::from_le_bytes([g.trailer[0], g.trailer[1], g.trailer[2], g.trailer[3]]);
                    let len = u32::from_le_bytes([g.trailer[4], g.trailer[5], g.trailer[6], g.trailer[7]]);
                    if crc != g.crc.sum() || len != g.crc.amount() {
                        self.errored = true;
                    }
                }
            }
            Inner::BrEnc(w) => {
                // `into_inner` is what finalizes a brotli stream, so the writer
                // has to be consumed here rather than merely flushed.
                if let Some(enc) = w.take() {
                    self.out.append(&mut enc.into_inner());
                }
            }
            Inner::BrDec { w, ended: _ } => {
                if let Some(dec) = w.take() {
                    match dec.into_inner() {
                        Ok(mut v) => self.out.append(&mut v),
                        Err(mut v) => {
                            self.out.append(&mut v);
                            self.errored = true;
                        }
                    }
                }
            }
        }
    }
}

// ── the plain implementation ────────────────────────────────────────────────
//
// `#[op2]` rewrites a function into a binding struct, so the bodies live here as
// ordinary functions: the ops below are one-line wrappers, and the tests at the
// bottom exercise the same code the ops do.

/// Create a codec. Returns its handle, or `None` for a format we do not know.
fn new_codec(format: &str, decompress: bool) -> Option<u32> {
    let f = parse_format(format)?;
    let inner = match (f, decompress) {
        (Format::Brotli, false) => {
            // Quality 6 / window 22: the knee of the curve. Quality 11 is where
            // brotli earns its reputation and also where it costs seconds of CPU
            // per megabyte — the wrong trade on the hardware this browser is for.
            Inner::BrEnc(Some(brotli::CompressorWriter::new(Vec::new(), CHUNK, 6, 22)))
        }
        (Format::Brotli, true) => Inner::BrDec {
            w: Some(brotli::DecompressorWriter::new(Vec::new(), CHUNK)),
            ended: false,
        },
        (_, false) => Inner::Enc {
            c: Compress::new(Compression::default(), f == Format::Deflate),
            gz: (f == Format::Gzip).then(|| GzOut { crc: Crc::new(), header_written: false }),
        },
        (_, true) => Inner::Dec {
            d: Decompress::new(f == Format::Deflate),
            gz: (f == Format::Gzip).then(|| GzIn {
                hdr: Vec::new(),
                header_done: false,
                crc: Crc::new(),
                trailer: Vec::new(),
            }),
            ended: false,
        },
    };
    let id = NEXT_ID.with(|n| {
        let mut n = n.borrow_mut();
        let id = *n;
        *n = n.wrapping_add(1).max(1);
        id
    });
    CODECS.with(|t| {
        t.borrow_mut().insert(id, Stream { inner, out: Vec::new(), errored: false });
    });
    Some(id)
}

fn push_codec(id: u32, data: &[u8]) -> Vec<u8> {
    CODECS.with(|t| match t.borrow_mut().get_mut(&id) {
        Some(s) => {
            s.push(data);
            std::mem::take(&mut s.out)
        }
        None => Vec::new(),
    })
}

fn finish_codec(id: u32) -> Vec<u8> {
    CODECS.with(|t| match t.borrow_mut().get_mut(&id) {
        Some(s) => {
            s.finish();
            std::mem::take(&mut s.out)
        }
        None => Vec::new(),
    })
}

fn codec_errored(id: u32) -> bool {
    CODECS.with(|t| t.borrow().get(&id).map(|s| s.errored).unwrap_or(false))
}

fn free_codec(id: u32) {
    CODECS.with(|t| {
        t.borrow_mut().remove(&id);
    });
}

// ── ops ─────────────────────────────────────────────────────────────────────

#[op2(fast)]
pub fn op_compress_new(#[string] format: &str, decompress: bool) -> Result<u32, JsErrorBox> {
    new_codec(format, decompress).ok_or_else(|| JsErrorBox::generic("unsupported format"))
}

/// Feed one chunk. Returns everything produced so far; never rejects, because a
/// chunk can be both productive and fatal — see the module note.
#[op2]
#[buffer]
pub fn op_compress_push(id: u32, #[buffer] data: &[u8]) -> Vec<u8> {
    push_codec(id, data)
}

/// End of input. Returns the tail of the output.
#[op2]
#[buffer]
pub fn op_compress_finish(id: u32) -> Vec<u8> {
    finish_codec(id)
}

/// Did the codec go wrong? Asked after every push and after finish.
#[op2(fast)]
pub fn op_compress_errored(id: u32) -> bool {
    codec_errored(id)
}

/// Drop a codec. JS calls this from every terminal path — flush, cancel, error —
/// so a page that opens a stream per request does not accumulate them.
#[op2(fast)]
pub fn op_compress_free(id: u32) {
    free_codec(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(format: &str) {
        let msg = b"expected output, twice over: expected output";
        let enc = new_codec(format, false).unwrap();
        let mut z = push_codec(enc, msg);
        z.extend(finish_codec(enc));
        assert!(!codec_errored(enc), "{format} compress errored");
        free_codec(enc);

        let dec = new_codec(format, true).unwrap();
        let mut back = push_codec(dec, &z);
        back.extend(finish_codec(dec));
        assert!(!codec_errored(dec), "{format} decompress errored");
        assert_eq!(back, msg, "{format} round trip");
        free_codec(dec);
    }

    #[test]
    fn all_formats_round_trip() {
        for f in ["deflate", "deflate-raw", "gzip", "brotli"] {
            roundtrip(f);
        }
    }

    #[test]
    fn trailing_garbage_is_an_error_but_the_payload_still_arrives() {
        // The shape `decompression-extra-input` checks: good bytes first, then
        // the error.
        let deflate: &[u8] = &[
            120, 156, 75, 173, 40, 72, 77, 46, 73, 77, 81, 200, 47, 45, 41, 40, 45, 1, 0, 48, 173,
            6, 36, 0,
        ];
        let dec = new_codec("deflate", true).unwrap();
        let out = push_codec(dec, deflate);
        assert_eq!(out, b"expected output");
        assert!(codec_errored(dec));
        free_codec(dec);
    }

    #[test]
    fn a_truncated_stream_does_not_pass_for_a_whole_one() {
        let dec = new_codec("gzip", true).unwrap();
        push_codec(dec, &[31, 139, 8, 0, 0, 0, 0, 0, 0, 3, 75]);
        finish_codec(dec);
        assert!(codec_errored(dec));
        free_codec(dec);
    }

    #[test]
    fn a_bad_gzip_checksum_is_caught() {
        let mut gz: Vec<u8> = vec![
            31, 139, 8, 0, 0, 0, 0, 0, 0, 3, 75, 173, 40, 72, 77, 46, 73, 77, 81, 200, 47, 45, 41,
            40, 45, 1, 0, 176, 1, 57, 179, 15, 0, 0, 0,
        ];
        let n = gz.len();
        gz[n - 8] = 0; // corrupt the CRC-32
        let dec = new_codec("gzip", true).unwrap();
        push_codec(dec, &gz);
        finish_codec(dec);
        assert!(codec_errored(dec));
        free_codec(dec);
    }

    #[test]
    fn a_split_header_is_still_a_header() {
        let gz: Vec<u8> = vec![
            31, 139, 8, 0, 0, 0, 0, 0, 0, 3, 75, 173, 40, 72, 77, 46, 73, 77, 81, 200, 47, 45, 41,
            40, 45, 1, 0, 176, 1, 57, 179, 15, 0, 0, 0,
        ];
        let dec = new_codec("gzip", true).unwrap();
        let mut out = Vec::new();
        for byte in &gz {
            out.extend(push_codec(dec, &[*byte]));
        }
        out.extend(finish_codec(dec));
        assert!(!codec_errored(dec));
        assert_eq!(out, b"expected output");
        free_codec(dec);
    }
}
