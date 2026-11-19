//! Wire types of contract §2 (`processSite`) and §4 (`liveCheckPlan`).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::config::SiteConfig;
use crate::error::CoreError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SiteInput {
    pub config: SiteConfig,
    /// Commit SHA.
    pub build_id: String,
    /// Host names the site is served on (the action's `domains`, lower case,
    /// no port); each gets its own tagged rewrite rules. Includes the
    /// origin's host.
    pub hosts: Vec<String>,
    /// Only the names in `config.env`; the core re-checks.
    pub env: BTreeMap<String, String>,
    pub pages: Vec<PageInput>,
    pub existing: Existing,
    /// Newest commit date (`YYYY-MM-DDTHH:MM:SSZ`, UTC) of each source glob
    /// of `config.content.sources` that matched a committed file; a glob
    /// matching none is left out.
    pub source_lastmod: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Existing {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub robots: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub headers: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub llms: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub sitemap: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageInput {
    /// `"/"`, `"/about/"`.
    pub route: String,
    /// Output-relative path: `"index.html"`, `"about/index.html"`.
    pub file: String,
    pub html: String,
    /// Adapter-supplied source markdown (preferred over conversion).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub markdown: Option<String>,
    /// ISO 8601 from git, never "now".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub lastmod: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SiteOutput {
    pub files: Vec<OutFile>,
    pub rewrite_rules: Vec<RewriteRule>,
    pub pages: Vec<PageSummary>,
    pub warnings: Vec<CoreError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct OutFile {
    pub file: String,
    pub contents: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct RewriteRule {
    pub description: String,
    pub expression: String,
    pub path_expression: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageSummary {
    pub route: String,
    pub markdown_file: String,
    pub title: String,
    pub description: String,
    pub tokens: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub lastmod: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct LiveRequest {
    pub url: String,
    pub user_agent: String,
    pub accept: String,
    pub expect: LiveExpect,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct LiveExpect {
    pub status: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub content_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub vary_includes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub body_includes: Option<String>,
}

/// Contract §3: one live response, as fetched by the host.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveObservation {
    pub url: String,
    pub user_agent: String,
    pub accept: String,
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body_prefix: String,
    /// The end of the body (same length bound as the prefix): edge-injected
    /// scripts such as the Web Analytics beacon sit before `</body>`.
    pub body_suffix: String,
}

/// Contract §4 input: exactly one of `config` and `origin` (the latter for
/// the config-less live audit). Without `buildId` the build check is omitted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveCheckInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub config: Option<SiteConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub origin: Option<String>,
    pub routes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub build_id: Option<String>,
}
