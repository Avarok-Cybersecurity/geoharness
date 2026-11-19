//! CSP checks. Lighthouse fetches `/robots.txt` from the audited page's own
//! context (`lighthouse-robots-txt`), so a CSP whose effective `connect-src`
//! does not admit the origin makes the SEO audit fail ("unable to download a
//! robots.txt file") although the file is served. A beacon Cloudflare injects
//! at the edge that the CSP blocks logs a console error on every page
//! (`lighthouse-errors-in-console`); only the live site shows it.

use geoharness_core::analytics::BEACON_MARKER;
use geoharness_core::config::SiteConfig;
use geoharness_core::csp;
use geoharness_core::headers::{CSP, values};
use geoharness_core::types::LiveObservation;

use super::{Scored, pass_fail};
use crate::catalog::{CSP_ROBOTS, LIVE_BEACON};

/// Whether a `_headers` URL pattern (`*` splat, `:name` one segment, path or
/// absolute URL) matches `route`.
pub fn pattern_matches(pattern: &str, route: &str) -> bool {
    let path = match pattern.split_once("//") {
        Some((scheme, rest)) if scheme.is_empty() || scheme.ends_with(':') => {
            rest.find('/').map_or("/", |i| &rest[i..])
        }
        _ => pattern,
    };
    matches(path.as_bytes(), route.as_bytes())
}

fn matches(p: &[u8], s: &[u8]) -> bool {
    match p.first() {
        None => s.is_empty(),
        Some(b'*') => (0..=s.len()).any(|i| matches(&p[1..], &s[i..])),
        Some(b':') => {
            let name_end = p[1..]
                .iter()
                .position(|c| !c.is_ascii_alphanumeric() && *c != b'_')
                .map_or(p.len(), |i| i + 1);
            let seg_end = s.iter().position(|c| *c == b'/').unwrap_or(s.len());
            seg_end > 0 && (1..=seg_end).any(|i| matches(&p[name_end..], &s[i..]))
        }
        Some(c) => s.first() == Some(c) && matches(&p[1..], &s[1..]),
    }
}

/// Blocking, static: every CSP that applies to an audited page must let it
/// fetch `/robots.txt` from its own origin.
pub fn robots_fetch(config: &SiteConfig, headers: &str, routes: &[&str]) -> Scored {
    let origin = &config.site.origin;
    let mut blocked = Vec::new();
    let mut seen = 0;
    for (pattern, value) in values(headers, CSP) {
        if !routes.iter().any(|r| pattern_matches(pattern, r)) {
            continue;
        }
        for policy in csp::parse_header(value) {
            seen += 1;
            if let Some(sources) = policy.effective("connect-src")
                && !csp::allows_robots_fetch(sources, origin)
            {
                blocked.push(format!("{pattern}: connect-src is {}", sources.join(" ")));
            }
        }
    }
    let evidence = if seen == 0 {
        "no Content-Security-Policy applies to the audited pages".to_owned()
    } else if blocked.is_empty() {
        format!(
            "{seen} Content-Security-Policy on HTML pages; each admits a same-origin fetch of /robots.txt"
        )
    } else {
        format!(
            "the CSP blocks Lighthouse's same-origin fetch of /robots.txt ({}); add connect-src 'self'",
            blocked.join("; ")
        )
    };
    pass_fail(&CSP_ROBOTS, None, blocked.is_empty(), evidence)
}

/// Blocking, live: a beacon Cloudflare injected into the HTML needs the opt-in
/// that extends the CSP for it.
pub fn live_beacon(config: &SiteConfig, live: &[LiveObservation]) -> Scored {
    let injected: Vec<&str> = live
        .iter()
        .filter(|o| o.body_prefix.contains(BEACON_MARKER) || o.body_suffix.contains(BEACON_MARKER))
        .map(|o| o.url.as_str())
        .collect();
    let opted_in = config.cloudflare_web_analytics();
    let evidence = match (injected.first(), opted_in) {
        (None, _) => "no Cloudflare Web Analytics beacon in the live HTML".to_owned(),
        (Some(url), true) => format!(
            "Cloudflare injects the Web Analytics beacon ({url}); analytics.cloudflareWebAnalytics = true extended the CSP for it"
        ),
        (Some(url), false) => format!(
            "Cloudflare injects the Web Analytics beacon into {url} (and {} more responses) but the site's CSP was not extended for it, \
             so every page logs a CSP violation. Either set [analytics] cloudflareWebAnalytics = true in geoharness.toml, or turn off \
             automatic setup for this hostname (Cloudflare dashboard → Web Analytics → Manage site → Disable).",
            injected.len() - 1
        ),
    };
    pass_fail(
        &LIVE_BEACON,
        None,
        injected.is_empty() || opted_in,
        evidence,
    )
}

#[cfg(test)]
mod tests {
    use super::pattern_matches;

    #[test]
    fn header_patterns() {
        for (p, r) in [
            ("/*", "/"),
            ("/*", "/a/b/"),
            ("/docs/*", "/docs/x/"),
            ("/:lang/", "/en/"),
            ("https://example.com/*", "/a/"),
            ("/", "/"),
        ] {
            assert!(pattern_matches(p, r), "{p} {r}");
        }
        for (p, r) in [
            ("/*.md", "/"),
            ("/docs/*", "/"),
            ("/:lang/", "/en/x/"),
            ("/a", "/a/"),
        ] {
            assert!(!pattern_matches(p, r), "{p} {r}");
        }
    }
}
