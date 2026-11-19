//! Cloudflare Web Analytics (`cf-web-analytics`). On a proxied hostname
//! Cloudflare injects its beacon (`static.cloudflareinsights.com`) into every
//! HTML response; a site CSP that does not admit it logs a violation on every
//! page. With `analytics.cloudflareWebAnalytics = true` the site's own CSP
//! lines in `_headers` are extended — the one edit `GeoHarness` makes to the
//! site's block, and only on that explicit opt-in.

use crate::csp;
use crate::headers::{CSP, header_line};

/// The beacon script's host (CSP `script-src`).
pub const BEACON_SCRIPT_SOURCE: &str = "https://static.cloudflareinsights.com";
/// Where a manually embedded beacon reports (CSP `connect-src`); the
/// automatically injected one reports to the site's own `/cdn-cgi/rum`.
pub const BEACON_REPORT_SOURCE: &str = "https://cloudflareinsights.com";
/// Marker of an injected beacon in live HTML.
pub const BEACON_MARKER: &str = "static.cloudflareinsights.com/beacon";

/// Sources added per directive: the beacon script, and both report targets.
const ADDITIONS: [(&str, &str); 4] = [
    ("script-src", BEACON_SCRIPT_SOURCE),
    ("script-src-elem", BEACON_SCRIPT_SOURCE),
    ("connect-src", "'self'"),
    ("connect-src", BEACON_REPORT_SOURCE),
];

/// Admits the beacon in one CSP header value (every policy in it).
pub fn extend_policy(value: &str) -> String {
    value
        .split(',')
        .map(|raw| {
            let mut p = csp::parse(raw);
            for (directive, source) in ADDITIONS {
                // script-src-elem is extended only where the site set it; an
                // absent one falls back to the extended script-src.
                if directive != "script-src-elem" || p.has(directive) {
                    p.add_source(directive, source);
                }
            }
            p.serialize()
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Extends every `Content-Security-Policy` line of the site's `_headers`
/// text. Returns the new text and the URL patterns whose CSP changed.
pub fn extend_site_headers(site: &str) -> (String, Vec<String>) {
    let mut pattern = String::new();
    let mut changed = Vec::new();
    let mut out = String::new();
    for line in site.lines() {
        let mut text = line.to_owned();
        match header_line(line) {
            Some((name, value)) if name.eq_ignore_ascii_case(CSP) => {
                let extended = extend_policy(value);
                if extended != value {
                    let indent = &line[..line.len() - line.trim_start().len()];
                    text = format!("{indent}{name}: {extended}");
                    changed.push(pattern.clone());
                }
            }
            None if !line.trim().is_empty() && !line.starts_with([' ', '\t', '#']) => {
                line.trim().clone_into(&mut pattern);
            }
            _ => {}
        }
        out.push_str(&text);
        out.push('\n');
    }
    (out, changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_script_and_connect_src_are_created_from_default_src() {
        let v = extend_policy("default-src 'none'; img-src 'self'");
        assert_eq!(
            v,
            "default-src 'none'; connect-src 'self' https://cloudflareinsights.com; script-src https://static.cloudflareinsights.com; img-src 'self'"
        );
    }

    #[test]
    fn existing_directives_are_extended_and_elem_only_when_present() {
        let v = extend_policy("script-src 'self'; script-src-elem 'self'; connect-src 'self'");
        assert_eq!(
            v,
            "script-src 'self' https://static.cloudflareinsights.com; script-src-elem 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com"
        );
        assert_eq!(extend_policy(&v), v, "idempotent");
    }

    #[test]
    fn an_unrestricted_policy_is_unchanged() {
        assert_eq!(
            extend_policy("frame-ancestors 'none'"),
            "frame-ancestors 'none'"
        );
    }

    #[test]
    fn only_csp_lines_change_and_patterns_are_reported() {
        let site = "# site\n/*\n  Content-Security-Policy: default-src 'self'\n  X-Frame-Options: DENY\n/a/*\n  content-security-policy-report-only: default-src 'none'\n";
        let (out, changed) = extend_site_headers(site);
        assert_eq!(changed, ["/*"]);
        assert!(out.contains("  Content-Security-Policy: default-src 'self'; connect-src 'self' https://cloudflareinsights.com; script-src 'self' https://static.cloudflareinsights.com\n"));
        assert!(out.contains("  X-Frame-Options: DENY\n/a/*\n  content-security-policy-report-only: default-src 'none'\n"));
    }
}
