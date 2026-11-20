//! The site's `_headers`: the site-wide `GeoHarness` rules, the per-page
//! `Link` rules, and the site's CSP extended for the beacon on explicit opt-in.

use super::page::Processed;
use crate::error::{CoreError, warn, warning};
use crate::link_header::{self, PageLink};
use crate::types::SiteInput;
use crate::{analytics, glob, headers};

pub fn merged(
    input: &SiteInput,
    processed: &[Processed],
    warnings: &mut Vec<CoreError>,
) -> Result<String, CoreError> {
    let config = &input.config;
    let pages: Vec<PageLink<'_>> = processed
        .iter()
        .map(|p| PageLink {
            route: &p.summary.route,
            markdown_file: &p.summary.markdown_file,
            canonical: &p.canonical,
        })
        .collect();
    let excluded: Vec<&str> = input
        .pages
        .iter()
        .map(|p| p.route.as_str())
        .filter(|r| glob::any(&config.content.exclude, r))
        .collect();
    let links = link_header::rules(&config.site.origin, &pages, &excluded);
    let mut extended = Vec::new();
    let merged = headers::merge_with(input.existing.headers.as_deref(), config, &links, |site| {
        if !config.cloudflare_web_analytics() {
            return site;
        }
        let (text, patterns) = analytics::extend_site_headers(&site);
        extended = patterns;
        text
    })
    .map_err(|e| e.at("_headers"))?;
    if merged.skipped > 0 {
        warnings.push(warn(
            warning::LINK_SKIPPED,
            format!(
                "the {} Link header rules would exceed Cloudflare's {} _headers rules; none were written (pages keep their <link> tags, and the live audit's signals.live_link_header reports the gap)",
                merged.skipped,
                headers::MAX_RULES
            ),
            Some("_headers".to_owned()),
        ));
    }
    if !extended.is_empty() {
        warnings.push(warn(
            warning::CSP_EXTENDED,
            format!(
                "analytics.cloudflareWebAnalytics = true: the site's Content-Security-Policy for {} now admits {} (script-src) and 'self' plus {} (connect-src)",
                extended.join(", "),
                analytics::BEACON_SCRIPT_SOURCE,
                analytics::BEACON_REPORT_SOURCE
            ),
            Some("_headers".to_owned()),
        ));
    }
    Ok(merged.text)
}
