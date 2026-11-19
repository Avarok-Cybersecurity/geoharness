//! CSP checks: the static robots.txt-fetch check and the live beacon check,
//! each with a positive case and a negative control.

mod support;

use geoharness_core::config::Analytics;
use support::{all_pass, fails, healthy_live, run, static_input};

const BEACON: &str = "<script defer src=\"https://static.cloudflareinsights.com/beacon.min.js/v1\" data-cf-beacon='{}'></script></body></html>";

fn with_csp(rule: &str, csp: &str) -> geoharness_audit::AuditInput {
    let mut input = static_input();
    input.headers = format!(
        "{rule}\n  Content-Security-Policy: {csp}\n\n{}",
        input.headers
    );
    input
}

#[test]
fn no_csp_passes() {
    all_pass(&run(&static_input()), "index.csp_robots");
}

#[test]
fn connect_src_self_passes() {
    let r = run(&with_csp(
        "/*",
        "default-src 'none'; connect-src 'self'; img-src 'self'",
    ));
    all_pass(&r, "index.csp_robots");
}

#[test]
fn default_src_none_without_connect_src_fails() {
    let r = run(&with_csp("/*", "default-src 'none'; img-src 'self'"));
    fails(&r, "index.csp_robots", None);
}

#[test]
fn a_second_policy_in_the_same_header_also_restricts() {
    let r = run(&with_csp(
        "/*",
        "default-src 'self', connect-src https://api.example.net",
    ));
    fails(&r, "index.csp_robots", None);
}

#[test]
fn a_csp_on_non_page_urls_is_ignored() {
    let r = run(&with_csp("/*.md", "default-src 'none'"));
    all_pass(&r, "index.csp_robots");
}

#[test]
fn origin_host_source_passes() {
    let r = run(&with_csp(
        "/*",
        "default-src 'none'; connect-src https://example.com",
    ));
    all_pass(&r, "index.csp_robots");
}

fn live_with_beacon(analytics: Option<bool>) -> geoharness_audit::AuditReport {
    let mut input = static_input();
    input.config.analytics = analytics.map(|v| Analytics {
        cloudflare_web_analytics: v,
    });
    let mut live = healthy_live(&input);
    for o in &mut live {
        if o.accept.starts_with("text/html") {
            o.body_suffix = BEACON.into();
        }
    }
    input.live = Some(live);
    run(&input)
}

#[test]
fn no_beacon_passes() {
    let mut input = static_input();
    input.live = Some(healthy_live(&input));
    all_pass(&run(&input), "index.live_beacon");
}

#[test]
fn injected_beacon_without_the_opt_in_fails_and_says_how_to_fix() {
    for analytics in [None, Some(false)] {
        let r = live_with_beacon(analytics);
        fails(&r, "index.live_beacon", None);
        let f = support::findings(&r, "index.live_beacon");
        assert!(
            f[0].evidence.contains("cloudflareWebAnalytics = true"),
            "{}",
            f[0].evidence
        );
        assert!(
            f[0].evidence.contains("turn off automatic setup"),
            "{}",
            f[0].evidence
        );
    }
}

#[test]
fn injected_beacon_with_the_opt_in_passes() {
    all_pass(&live_with_beacon(Some(true)), "index.live_beacon");
}
