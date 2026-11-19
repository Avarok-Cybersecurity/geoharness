//! Check runners. Each returns scored findings; `score` aggregates them.

pub mod access;
pub mod advisory;
pub mod csp;
pub mod index;
pub mod live;

use geoharness_core::html::Page;

use crate::catalog::Check;
use crate::types::{AuditInput, Finding};

/// A finding plus its credit in `[0, 1]` (partial credit is advisory only).
pub struct Scored {
    pub finding: Finding,
    pub credit: f64,
    pub category: &'static str,
}

pub fn scored(
    check: &Check,
    route: Option<&str>,
    credit: f64,
    evidence: impl Into<String>,
) -> Scored {
    Scored {
        finding: Finding {
            check_id: check.id.to_owned(),
            title: check.title.to_owned(),
            severity: check.severity,
            passed: credit >= 1.0,
            route: route.map(str::to_owned),
            evidence: evidence.into(),
            citations: check.citations.iter().map(|c| (*c).to_owned()).collect(),
        },
        credit,
        category: check.category,
    }
}

pub fn pass_fail(
    check: &Check,
    route: Option<&str>,
    ok: bool,
    evidence: impl Into<String>,
) -> Scored {
    scored(check, route, if ok { 1.0 } else { 0.0 }, evidence)
}

/// One audited page, parsed once.
pub struct PageCtx<'a> {
    pub route: &'a str,
    /// The page as served, for checks that depend on byte positions.
    pub html: &'a str,
    pub page: Page,
    pub markdown: &'a str,
}

pub fn pages(input: &AuditInput) -> Vec<PageCtx<'_>> {
    input
        .pages
        .iter()
        .map(|p| PageCtx {
            route: &p.route,
            html: &p.html,
            page: Page::parse(&p.html),
            markdown: &p.markdown,
        })
        .collect()
}
