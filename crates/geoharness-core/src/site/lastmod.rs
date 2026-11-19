//! A page's lastmod: from `content.sources` when the config maps its route,
//! else what the adapter found; never the current time.

use std::collections::BTreeMap;

use crate::config::SiteConfig;
use crate::error::{CoreError, Error, warn, warning};
use crate::glob;

/// `YYYY-MM-DDTHH:MM:SSZ`: one format, so dates compare as strings.
fn is_utc_seconds(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 20
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            10 => *c == b'T',
            13 | 16 => *c == b':',
            19 => *c == b'Z',
            _ => c.is_ascii_digit(),
        })
}

/// `sourceLastmod`: dates in the one format, for globs the config declares.
pub fn check(config: &SiteConfig, dates: &BTreeMap<String, String>) -> Vec<CoreError> {
    let declared = |g: &str| config.content.sources.values().flatten().any(|s| s == g);
    let mut errors = Vec::new();
    for (g, date) in dates {
        if !declared(g) {
            errors.push(
                Error::InputInvalid(format!("{g:?} is not a source glob of content.sources"))
                    .at("sourceLastmod"),
            );
        } else if !is_utc_seconds(date) {
            errors.push(
                Error::InputInvalid(format!("{g:?}: {date:?} is not YYYY-MM-DDTHH:MM:SSZ"))
                    .at("sourceLastmod"),
            );
        }
    }
    errors
}

/// The newest date among the sources mapped to `route`; `adapter` when the
/// config maps none of them (or none had a commit).
pub fn effective(
    config: &SiteConfig,
    dates: &BTreeMap<String, String>,
    route: &str,
    adapter: Option<&str>,
) -> Option<String> {
    let mapped = config
        .content
        .sources
        .iter()
        .filter(|(pattern, _)| glob::matches(pattern, route))
        .flat_map(|(_, globs)| globs)
        .filter_map(|g| dates.get(g))
        .max();
    mapped.cloned().or_else(|| adapter.map(str::to_owned))
}

/// One warning naming the routes the sitemap lists without a lastmod.
pub fn missing_warning(routes: &[String]) -> Option<CoreError> {
    (!routes.is_empty()).then(|| {
        warn(
            warning::NO_LASTMOD,
            format!(
                "{} page(s) have no lastmod (sitemap.xml and {{{{geo.lastmod}}}} go without): {}. Their HTML is not \
                 tracked by git (built output) and no content.sources entry maps them to source files",
                routes.len(),
                routes.join(", ")
            ),
            Some("content.sources".into()),
        )
    })
}
