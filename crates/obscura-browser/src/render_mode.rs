//! Runtime control over when (and whether) the page is rendered.
//!
//! This enum is always compiled, even when the `render` feature is off, so the
//! CLI and CDP layers can talk about render modes uniformly. When the feature is
//! off, only [`RenderMode::Never`] is meaningful — see `obscura-browser`'s
//! `render` module for the gated implementation.

use std::fmt;
use std::str::FromStr;

/// How aggressively Obscura builds and paints a visual rendering of a page.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RenderMode {
    /// Never instantiate the renderer. Zero CPU/memory cost; screenshots and
    /// real layout geometry are unavailable. This is the default: rendering is
    /// opt-in at runtime even when compiled in.
    #[default]
    Never,
    /// Build, lay out, and paint only when an operation needs pixels or
    /// geometry (a screenshot, layout metrics, a JS pixel measurement). The
    /// result is cached and reused until the DOM changes.
    OnDemand,
    /// Keep a freshly resolved layout available at all times — eagerly resolved
    /// after each navigation — so geometry is always current and the first
    /// screenshot has no build latency.
    Always,
}

impl RenderMode {
    /// Whether this mode ever produces a rendering.
    pub fn is_enabled(self) -> bool {
        !matches!(self, RenderMode::Never)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            RenderMode::Never => "never",
            RenderMode::OnDemand => "on-demand",
            RenderMode::Always => "always",
        }
    }
}

impl fmt::Display for RenderMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for RenderMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Accept a few spellings so `on_demand`/`ondemand` all work.
        match s.trim().to_ascii_lowercase().replace('_', "-").as_str() {
            "never" | "off" | "none" => Ok(RenderMode::Never),
            "on-demand" | "ondemand" | "demand" | "lazy" => Ok(RenderMode::OnDemand),
            "always" | "eager" | "on" => Ok(RenderMode::Always),
            other => Err(format!(
                "invalid render mode '{other}' (expected: never, on-demand, always)"
            )),
        }
    }
}

/// The visual viewport a page is laid out and painted against. Always compiled
/// (CDP `Page.getLayoutMetrics` reports it even when rendering is off); updated
/// by `Emulation.setDeviceMetricsOverride` / `setEmulatedMedia`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewportConfig {
    /// Layout viewport width in CSS pixels.
    pub width: u32,
    /// Layout viewport height in CSS pixels.
    pub height: u32,
    /// Device pixel ratio (physical pixels per CSS pixel).
    pub device_scale_factor: f64,
    /// Emulate `prefers-color-scheme: dark`.
    pub dark: bool,
    /// Emulate `print` media instead of `screen`.
    pub print: bool,
}

impl Default for ViewportConfig {
    fn default() -> Self {
        // Chrome's headless default.
        Self {
            width: 1280,
            height: 720,
            device_scale_factor: 1.0,
            dark: false,
            print: false,
        }
    }
}

impl ViewportConfig {
    /// Physical (device) pixel dimensions: CSS size × device scale factor.
    pub fn physical_size(&self) -> (u32, u32) {
        let w = ((self.width as f64) * self.device_scale_factor).round() as u32;
        let h = ((self.height as f64) * self.device_scale_factor).round() as u32;
        (w.max(1), h.max(1))
    }
}

/// Bundle of render-related configuration threaded from the CLI/server down to
/// each [`BrowserContext`](crate::BrowserContext).
#[derive(Debug, Clone, Copy, Default)]
pub struct RenderSettings {
    pub mode: RenderMode,
    pub viewport: ViewportConfig,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_roundtrips() {
        assert_eq!("never".parse::<RenderMode>().unwrap(), RenderMode::Never);
        assert_eq!(
            "on-demand".parse::<RenderMode>().unwrap(),
            RenderMode::OnDemand
        );
        assert_eq!(
            "on_demand".parse::<RenderMode>().unwrap(),
            RenderMode::OnDemand
        );
        assert_eq!("always".parse::<RenderMode>().unwrap(), RenderMode::Always);
        assert_eq!(RenderMode::default(), RenderMode::Never);
        assert!("bogus".parse::<RenderMode>().is_err());
        assert_eq!(RenderMode::OnDemand.to_string(), "on-demand");
    }
}
