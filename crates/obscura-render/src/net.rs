//! Resource loading abstraction for the render pipeline.
//!
//! Blitz fetches sub-resources (images, web fonts, `@import`ed and linked CSS,
//! `url()` references) through a [`NetProvider`]. During `resolve()` the
//! document calls [`NetProvider::fetch`] synchronously for each resource; the
//! provider is expected to deliver bytes later via the supplied [`NetHandler`],
//! which hands them back into the document's message channel (applied on the
//! next `resolve()`).
//!
//! [`ResourceProvider`] extends that contract with the small amount of state the
//! render loop needs to know when the document has stopped waiting on the
//! network, so it can stop re-resolving.

use std::time::Duration;

use blitz_traits::net::{NetHandler, NetProvider, Request};

/// A [`NetProvider`] that also reports its in-flight work, letting the render
/// loop resolve repeatedly until resources settle (or a deadline is hit).
pub trait ResourceProvider: NetProvider {
    /// Number of fetches started but not yet delivered (or failed).
    fn pending(&self) -> usize;

    /// Block for up to `timeout`, returning early if the in-flight count
    /// changes. Used to avoid busy-spinning between `resolve()` calls while
    /// fetches complete on another thread.
    fn wait_for_progress(&self, timeout: Duration);
}

/// A provider that fetches nothing.
///
/// Useful for rendering self-contained documents (inline styles, no external
/// images or fonts) and in tests. Any resource Blitz requests simply never
/// arrives, so it renders with whatever defaults apply.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoOpNetProvider;

impl NetProvider for NoOpNetProvider {
    fn fetch(&self, _doc_id: usize, _request: Request, _handler: Box<dyn NetHandler>) {
        // Drop the handler without delivering bytes.
    }
}

impl ResourceProvider for NoOpNetProvider {
    fn pending(&self) -> usize {
        0
    }

    fn wait_for_progress(&self, _timeout: Duration) {}
}
