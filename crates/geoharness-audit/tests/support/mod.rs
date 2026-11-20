//! Audit inputs built from the processed fixture site.
#![allow(dead_code)]

#[path = "../../../geoharness-core/tests/common/mod.rs"]
pub mod common;

use std::collections::BTreeMap;

use geoharness_audit::{AuditInput, AuditPage, AuditReport, Finding, audit};
use geoharness_core::live::{LiveTarget, plan};
use geoharness_core::process_site;
use geoharness_core::types::{LiveObservation, LiveRequest};

pub fn static_input() -> AuditInput {
    let input = common::input();
    let out = process_site(&input).unwrap_or_else(|e| panic!("{e:?}"));
    let file = |name: &str| {
        out.files
            .iter()
            .find(|f| f.file == name)
            .map(|f| f.contents.clone())
    };
    let pages = out
        .pages
        .iter()
        .map(|p| {
            let html_file = input
                .pages
                .iter()
                .find(|i| i.route == p.route)
                .map(|i| i.file.clone())
                .unwrap_or_default();
            AuditPage {
                route: p.route.clone(),
                html: file(&html_file).unwrap_or_default(),
                markdown: file(&p.markdown_file).unwrap_or_default(),
            }
        })
        .collect();
    AuditInput {
        config: input.config.clone(),
        build_id: common::BUILD_ID.into(),
        pages,
        robots: file("robots.txt").unwrap_or_default(),
        headers: file("_headers").unwrap_or_default(),
        llms: file("llms.txt"),
        sitemap: file("sitemap.xml").unwrap_or_default(),
        live: None,
    }
}

/// Observations that satisfy every planned expectation.
pub fn healthy_live(input: &AuditInput) -> Vec<LiveObservation> {
    let routes: Vec<String> = input.pages.iter().map(|p| p.route.clone()).collect();
    let target = LiveTarget::from_config(&input.config, Some(&input.build_id))
        .unwrap_or_else(|e| panic!("{e:?}"));
    observe(plan(&target, &routes))
}

/// Observations that satisfy every expectation of `requests`.
pub fn observe(requests: Vec<LiveRequest>) -> Vec<LiveObservation> {
    requests
        .into_iter()
        .map(|r| {
            let ct = r
                .expect
                .content_type
                .clone()
                .unwrap_or_else(|| "text/html".into());
            let ct = if ct == "xml" {
                "application/xml".to_owned()
            } else {
                format!("{ct}; charset=utf-8")
            };
            let link = match r.expect.content_type.as_deref() {
                Some("text/html") => Some(format!(
                    "<{}index.md>; rel=\"alternate\"; type=\"text/markdown\"",
                    r.url
                )),
                Some("text/markdown") => Some(format!("<{}>; rel=\"canonical\"", r.url)),
                _ => None,
            };
            let mut headers = BTreeMap::from([
                ("Content-Type".into(), ct),
                ("Vary".into(), "Accept-Encoding, Accept".into()),
            ]);
            if let Some(link) = link {
                headers.insert("Link".into(), link);
            }
            LiveObservation {
                url: r.url,
                user_agent: r.user_agent,
                accept: r.accept,
                status: r.expect.status,
                headers,
                body_prefix: r.expect.body_includes.unwrap_or_default(),
                body_suffix: "</body></html>".into(),
            }
        })
        .collect()
}

pub fn run(input: &AuditInput) -> AuditReport {
    audit(input).unwrap_or_else(|e| panic!("{e:?}"))
}

pub fn findings<'a>(report: &'a AuditReport, check: &str) -> Vec<&'a Finding> {
    report
        .findings
        .iter()
        .filter(|f| f.check_id == check)
        .collect()
}

/// Asserts `check` has at least one finding and all of them passed.
pub fn all_pass(report: &AuditReport, check: &str) {
    let f = findings(report, check);
    assert!(!f.is_empty(), "{check}: no findings");
    assert!(f.iter().all(|x| x.passed), "{check}: {f:#?}");
}

/// Asserts `check` failed (for `route` when given).
pub fn fails(report: &AuditReport, check: &str, route: Option<&str>) {
    let f = findings(report, check);
    assert!(
        f.iter()
            .any(|x| !x.passed && (route.is_none() || x.route.as_deref() == route)),
        "{check} expected to fail for {route:?}: {f:#?}"
    );
}
