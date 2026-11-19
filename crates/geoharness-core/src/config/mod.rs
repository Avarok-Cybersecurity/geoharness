//! `SiteConfig` (contract §1). Field docs and defaults are mirrored in
//! `docs/config.md`; a key that has no `#[serde(default)]` here is required.

mod parse;
mod validate;

pub use parse::parse_config;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SiteConfig {
    pub site: Site,
    pub identity: Identity,
    pub content_signal: ContentSignal,
    pub bots: Vec<BotPolicy>,
    pub content: Content,
    pub llms: Llms,
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub headers: Headers,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub prerender: Option<Prerender>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub analytics: Option<Analytics>,
}

/// Third-party analytics the site opts into. Present only when the site
/// states a choice; inside it every key is required.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Analytics {
    /// Cloudflare Web Analytics (`cf-web-analytics`): true extends the site's
    /// CSP so the beacon Cloudflare injects can load and report.
    pub cloudflare_web_analytics: bool,
}

/// Routes the host's prerender adapter (e.g. vite-prerender) renders to
/// static HTML. The core only validates them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Prerender {
    pub routes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Site {
    /// `https://example.com`, no trailing slash, no path.
    pub origin: String,
    pub name: String,
    /// BCP 47 language tag.
    pub language: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum IdentityKind {
    Person,
    Organization,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    pub kind: IdentityKind,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub same_as: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub organization: Option<Organization>,
    /// Absolute URL of the entity's logo (JSON-LD `logo`); absent: no logo
    /// is declared, none is guessed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub logo: Option<String>,
    /// Public contact address (JSON-LD `email`); absent: no contact is
    /// declared, none is guessed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub email: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Organization {
    pub name: String,
    pub url: String,
}

/// Cloudflare Content Signals (`cf-content-signals`). All three required.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct ContentSignal {
    pub search: bool,
    pub ai_input: bool,
    pub ai_train: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum BotGroup {
    Search,
    User,
    Training,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BotPolicy {
    pub tokens: Vec<String>,
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub disallow: Vec<String>,
    pub group: BotGroup,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Content {
    /// CSS selector of the main content element.
    pub main_selector: String,
    /// Route globs that get no twin and are left out of llms/sitemap.
    #[serde(default)]
    pub exclude: Vec<String>,
    /// Route glob → source path globs (relative to the site directory). A
    /// page matching a route glob takes the newest commit date of those
    /// sources as its lastmod: built output is usually not tracked by git.
    #[serde(default)]
    pub sources: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Llms {
    pub summary: String,
    pub sections: Vec<LlmsSection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LlmsSection {
    pub title: String,
    /// Route globs, matched against page routes in page order.
    pub routes: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Headers {
    /// Path globs of content-hashed assets.
    #[serde(default)]
    pub immutable: Vec<String>,
}

impl SiteConfig {
    /// Whether the site opted into Cloudflare Web Analytics.
    pub fn cloudflare_web_analytics(&self) -> bool {
        self.analytics.is_some_and(|a| a.cloudflare_web_analytics)
    }

    /// Host part of `site.origin` (validated to exist by `parse_config`).
    pub fn host(&self) -> &str {
        self.site
            .origin
            .split_once("://")
            .map_or(self.site.origin.as_str(), |(_, rest)| rest)
    }
}

pub use validate::{is_origin, validate};
