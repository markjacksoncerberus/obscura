#[macro_use]
extern crate html5ever;

pub mod module_loader;
pub mod runtime;
pub mod ops;
/// The Blitz-backed layout bridge — only compiled with the renderer.
#[cfg(feature = "render")]
pub mod layout;
pub mod aes_ops;
pub mod compress_ops;
pub mod crypto_ops;
pub mod rsa_ops;
pub mod ec_ops;
/// The image decoder: encoded bytes in, RGBA out. Unconditional — the codecs are
/// pure Rust, so a build with no renderer still has `createImageBitmap`.
pub mod image_ops;
pub mod sse_ops;
pub mod ws_ops;
pub mod v8_flags;
pub mod markdown;

pub use markdown::HTML_TO_MARKDOWN_JS;
pub use v8_flags::set_v8_flags;
