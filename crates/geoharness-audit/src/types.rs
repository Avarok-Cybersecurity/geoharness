//! Wire types of contract §3 (`audit`).

use serde::{Deserialize, Serialize};

use geoharness_core::SiteConfig;
use geoharness_core::types::LiveObservation;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuditInput {
    pub config: SiteConfig,
    /// The deployed commit; the live build-meta check compares against it.
    pub build_id: String,
    pub pages: Vec<AuditPage>,
    /// `SiteOutput.excludedRoutes`: pages in the output that are not audited;
    /// links to them resolve.
    pub excluded_routes: Vec<String>,
    pub robots: String,
    pub headers: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub llms: Option<String>,
    pub sitemap: String,
    /// Present only for the post-deploy audit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub live: Option<Vec<LiveObservation>>,
}

/// Input of `auditLive`: the config-less live audit of a deployed origin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveAuditInput {
    /// `https://host`, no path.
    pub origin: String,
    /// Routes sampled for the Accept matrix (`/` is always included).
    pub routes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub build_id: Option<String>,
    pub live: Vec<LiveObservation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuditPage {
    pub route: String,
    pub html: String,
    pub markdown: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct AuditReport {
    /// 0–100, weighted over the categories that had findings.
    pub score: f64,
    pub categories: Vec<CategoryScore>,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct CategoryScore {
    pub id: String,
    pub title: String,
    pub weight: f64,
    pub score: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Blocking,
    Advisory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub check_id: String,
    pub title: String,
    /// Blocking ⇔ grade A/B access/indexability evidence.
    pub severity: Severity,
    pub passed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub route: Option<String>,
    pub evidence: String,
    /// Ids from CITATIONS.md.
    pub citations: Vec<String>,
}
