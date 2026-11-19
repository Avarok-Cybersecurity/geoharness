//! The GEO audit (contract §3). Weights, thresholds and citations live in
//! [`weights`]; every finding names the CITATIONS.md ids it rests on.

pub mod catalog;
pub mod checks;
pub mod equivalence;
pub mod score;
pub mod types;
pub mod weights;

use geoharness_core::config::validate;
use geoharness_core::live::LiveTarget;
use geoharness_core::{CoreError, Error};

pub use types::{
    AuditInput, AuditPage, AuditReport, CategoryScore, Finding, LiveAuditInput, Severity,
};

/// Contract §3: static audit, plus live checks when `input.live` is present.
pub fn audit(input: &AuditInput) -> Result<AuditReport, Vec<CoreError>> {
    validate(&input.config)?;
    if input.pages.is_empty() {
        return Err(vec![
            Error::InputInvalid("audit needs at least one page".into()).at("pages"),
        ]);
    }
    let config = &input.config;
    let selector = &config.content.main_selector;
    let routes: Vec<&str> = input.pages.iter().map(|p| p.route.as_str()).collect();
    let entities = [config.identity.name.as_str(), config.site.name.as_str()];
    let pages = checks::pages(input);
    let mut scored = vec![
        checks::access::robots_bots(input),
        checks::advisory::llms(input.llms.as_deref()),
        checks::csp::robots_fetch(config, &input.headers, &routes),
    ];
    for p in &pages {
        scored.push(checks::access::spa_shell(p));
        scored.extend(checks::index::head(p));
        scored.push(checks::index::build_meta_early(p, &input.build_id));
        scored.push(checks::index::broken_links(p, &config.site.origin, &routes));
        scored.push(checks::index::twin(p, selector));
        scored.extend(checks::advisory::page(p, selector, &entities));
    }
    if let Some(live) = &input.live {
        let target = LiveTarget::from_config(config, Some(&input.build_id))?;
        let routes: Vec<String> = input.pages.iter().map(|p| p.route.clone()).collect();
        scored.extend(checks::live::checks(&target, &routes, live));
        scored.push(checks::csp::live_beacon(config, live));
    }
    Ok(score::report(scored))
}

/// Config-less live audit (`geoharness audit <url>`): only the live checks,
/// against a bare origin. Without `buildId` the build check is omitted and
/// llms.txt need only have an H1.
pub fn audit_live(input: &LiveAuditInput) -> Result<AuditReport, Vec<CoreError>> {
    let target = LiveTarget::from_origin(&input.origin, input.build_id.as_deref())?;
    Ok(score::report(checks::live::checks(
        &target,
        &input.routes,
        &input.live,
    )))
}
