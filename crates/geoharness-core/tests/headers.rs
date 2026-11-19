//! `_headers` merge: one rule per URL pattern (so `wrangler dev` serves what
//! production serves), idempotence, and the opt-in CSP extension.

mod common;

use geoharness_core::analytics::BEACON_SCRIPT_SOURCE;
use geoharness_core::config::Analytics;
use geoharness_core::headers::{BLOCK_BEGIN, merge, values};
use geoharness_core::{parse_config, process_site};

const SITE: &str = "/*\n  Content-Security-Policy: default-src 'none'; img-src 'self'\n  X-Frame-Options: DENY\n/og.png\n  Cache-Control: public, max-age=86400\n";

fn patterns(headers: &str) -> Vec<&str> {
    headers
        .lines()
        .filter(|l| !l.trim().is_empty() && !l.starts_with([' ', '#']))
        .collect()
}

#[test]
fn a_pattern_the_site_already_uses_is_merged_into_its_rule() {
    let out = merge(Some(SITE), &common::config()).unwrap_or_else(|e| panic!("{e}"));
    let mut seen = patterns(&out);
    let n = seen.len();
    seen.sort_unstable();
    seen.dedup();
    assert_eq!(seen.len(), n, "duplicate URL patterns:\n{out}");
    assert!(out.starts_with(&format!(
        "/*\n  Content-Security-Policy: default-src 'none'; img-src 'self'\n  X-Frame-Options: DENY\n  {BLOCK_BEGIN}\n  Vary: Accept\n"
    )), "{out}");
    assert_eq!(values(&out, "vary"), [("/*", "Accept")]);
    assert!(out.contains("# BEGIN GeoHarness\n/*.md\n"), "{out}");
}

#[test]
fn merging_twice_is_idempotent() {
    let config = common::config();
    let once = merge(Some(SITE), &config).unwrap_or_else(|e| panic!("{e}"));
    let twice = merge(Some(&once), &config).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(once, twice);
}

#[test]
fn without_a_site_file_everything_is_in_the_block() {
    let out = merge(None, &common::config()).unwrap_or_else(|e| panic!("{e}"));
    assert!(
        out.starts_with("# BEGIN GeoHarness\n/*\n  Vary: Accept\n"),
        "{out}"
    );
}

fn processed_headers(analytics: Option<bool>) -> (String, Vec<String>) {
    let mut input = common::input();
    input.existing.headers = Some(SITE.to_owned());
    input.config.analytics = analytics.map(|v| Analytics {
        cloudflare_web_analytics: v,
    });
    let out = process_site(&input).unwrap_or_else(|e| panic!("{e:?}"));
    let headers = out
        .files
        .iter()
        .find(|f| f.file == "_headers")
        .map(|f| f.contents.clone());
    let codes = out.warnings.iter().map(|w| w.code.clone()).collect();
    (headers.unwrap_or_default(), codes)
}

#[test]
fn opting_into_web_analytics_extends_the_site_csp_with_a_warning() {
    let (headers, codes) = processed_headers(Some(true));
    let csp = values(&headers, "content-security-policy");
    assert_eq!(csp.len(), 1);
    assert!(
        csp[0]
            .1
            .contains(&format!("script-src {BEACON_SCRIPT_SOURCE}")),
        "{csp:?}"
    );
    assert!(
        csp[0]
            .1
            .contains("connect-src 'self' https://cloudflareinsights.com"),
        "{csp:?}"
    );
    assert!(
        codes.contains(&"headers.csp_extended".to_owned()),
        "{codes:?}"
    );
}

#[test]
fn without_the_opt_in_the_site_csp_is_kept_verbatim() {
    for analytics in [None, Some(false)] {
        let (headers, codes) = processed_headers(analytics);
        assert_eq!(
            values(&headers, "content-security-policy"),
            [("/*", "default-src 'none'; img-src 'self'")]
        );
        assert!(!codes.contains(&"headers.csp_extended".to_owned()));
    }
}

#[test]
fn analytics_table_requires_its_key() {
    let base = include_str!("../../../fixtures/core/site/geoharness.toml");
    let missing = parse_config(&format!("{base}\n[analytics]\n"))
        .err()
        .unwrap_or_default();
    assert_eq!(
        missing.first().map(|e| e.code.as_str()),
        Some("config.missing_key")
    );
    let ok = parse_config(&format!(
        "{base}\n[analytics]\ncloudflareWebAnalytics = true\n"
    ));
    assert!(ok.is_ok_and(|c| c.cloudflare_web_analytics()));
}
