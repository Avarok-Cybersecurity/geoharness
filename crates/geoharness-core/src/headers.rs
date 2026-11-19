//! `_headers` for Workers static assets (`cf-workers-static-assets`): the
//! site's own file verbatim first, then the `GeoHarness` block. Cloudflare
//! allows at most 100 rules; exceeding that is an error, not a truncation.

use crate::config::SiteConfig;
use crate::error::Error;
use crate::robots::content_signal_value;

pub const BLOCK_BEGIN: &str = "# BEGIN GeoHarness";
pub const BLOCK_END: &str = "# END GeoHarness";
pub const MAX_RULES: usize = 100;

/// A rule is a URL-pattern line: not indented, not blank, not a comment.
pub fn count_rules(headers: &str) -> usize {
    headers
        .lines()
        .filter(|l| {
            !l.trim().is_empty() && !l.starts_with([' ', '\t']) && !l.trim_start().starts_with('#')
        })
        .count()
}

fn strip_block(headers: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for line in headers.lines() {
        match line.trim() {
            l if l == BLOCK_BEGIN => inside = true,
            l if l == BLOCK_END => inside = false,
            _ if inside => {}
            _ => {
                out.push_str(line);
                out.push('\n');
            }
        }
    }
    out
}

fn block(config: &SiteConfig) -> String {
    let mut out = format!("{BLOCK_BEGIN}\n");
    // Every HTML URL can also answer with markdown (Accept negotiation), so
    // every response must vary on Accept for downstream caches.
    out.push_str("/*\n  Vary: Accept\n");
    out.push_str(&format!(
        "  Content-Signal: {}\n",
        content_signal_value(config.content_signal)
    ));
    out.push_str("/*.md\n  Content-Type: text/markdown; charset=utf-8\n");
    for pattern in &config.headers.immutable {
        out.push_str(&format!(
            "{pattern}\n  Cache-Control: public, max-age=31536000, immutable\n"
        ));
    }
    out.push_str(BLOCK_END);
    out.push('\n');
    out
}

/// Merges the `GeoHarness` block after `existing`.
pub fn merge(existing: Option<&str>, config: &SiteConfig) -> Result<String, Error> {
    let site = strip_block(existing.unwrap_or(""));
    let mut out = site.trim_end().to_owned();
    if !out.is_empty() {
        out.push_str("\n\n");
    }
    out.push_str(&block(config));
    let rules = count_rules(&out);
    if rules > MAX_RULES {
        return Err(Error::HeadersTooManyRules(format!(
            "{rules} rules (site {} + GeoHarness {}); Cloudflare allows {MAX_RULES}",
            count_rules(&site),
            rules - count_rules(&site)
        )));
    }
    Ok(out)
}
