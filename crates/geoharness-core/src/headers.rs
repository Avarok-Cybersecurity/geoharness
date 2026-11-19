//! `_headers` for Workers static assets (`cf-workers-static-assets`): the
//! site's own file first, then the `GeoHarness` block. Cloudflare allows at
//! most 100 rules; exceeding that is an error, not a truncation.
//!
//! Cloudflare combines the headers of every rule that matches a request, so
//! a `GeoHarness` rule whose URL pattern the site already uses is written
//! inside that site rule, between indented markers, instead of as a second
//! rule with the same pattern: same headers in production, and `wrangler dev`
//! (which keeps only the last rule per pattern) serves what production serves.

use crate::config::SiteConfig;
use crate::error::Error;
use crate::robots::content_signal_value;

pub const BLOCK_BEGIN: &str = "# BEGIN GeoHarness";
pub const BLOCK_END: &str = "# END GeoHarness";
pub const MAX_RULES: usize = 100;
pub const CSP: &str = "content-security-policy";

/// A rule is a URL-pattern line: not indented, not blank, not a comment.
fn is_rule(line: &str) -> bool {
    !line.trim().is_empty() && !line.starts_with([' ', '\t']) && !line.trim_start().starts_with('#')
}

pub fn count_rules(headers: &str) -> usize {
    headers.lines().filter(|l| is_rule(l)).count()
}

/// `(name, value)` of an indented `Name: value` header line.
pub fn header_line(line: &str) -> Option<(&str, &str)> {
    if !line.starts_with([' ', '\t']) || line.trim_start().starts_with('#') {
        return None;
    }
    let (name, value) = line.trim().split_once(':')?;
    Some((name.trim(), value.trim()))
}

/// Every `(URL pattern, header value)` of the headers named `name`.
pub fn values<'a>(headers: &'a str, name: &str) -> Vec<(&'a str, &'a str)> {
    let mut pattern = "";
    let mut out = Vec::new();
    for line in headers.lines() {
        if is_rule(line) {
            pattern = line.trim();
        } else if let Some((n, v)) = header_line(line)
            && n.eq_ignore_ascii_case(name)
        {
            out.push((pattern, v));
        }
    }
    out
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

/// The `GeoHarness` rules: `(URL pattern, header lines without indentation)`.
fn rules(config: &SiteConfig) -> Vec<(String, Vec<String>)> {
    // Every HTML URL can also answer with markdown (Accept negotiation), so
    // every response must vary on Accept for downstream caches.
    let mut out = vec![
        (
            "/*".to_owned(),
            vec![
                "Vary: Accept".to_owned(),
                format!(
                    "Content-Signal: {}",
                    content_signal_value(config.content_signal)
                ),
            ],
        ),
        (
            "/*.md".to_owned(),
            vec!["Content-Type: text/markdown; charset=utf-8".to_owned()],
        ),
    ];
    for pattern in &config.headers.immutable {
        out.push((
            pattern.clone(),
            vec!["Cache-Control: public, max-age=31536000, immutable".to_owned()],
        ));
    }
    out
}

/// Writes `headers` into the first site rule with `pattern`; false if none.
fn merge_into(lines: &mut Vec<String>, pattern: &str, headers: &[String]) -> bool {
    let Some(start) = lines.iter().position(|l| is_rule(l) && l.trim() == pattern) else {
        return false;
    };
    let mut end = start + 1;
    let mut at = end;
    while end < lines.len() && !is_rule(&lines[end]) && !lines[end].starts_with('#') {
        if lines[end].starts_with([' ', '\t']) {
            at = end + 1;
        }
        end += 1;
    }
    let mut insert = vec![format!("  {BLOCK_BEGIN}")];
    insert.extend(headers.iter().map(|h| format!("  {h}")));
    insert.push(format!("  {BLOCK_END}"));
    lines.splice(at..at, insert);
    true
}

/// Merges the `GeoHarness` rules into `site` (already free of a previous
/// `GeoHarness` block).
fn merge_site(site: &str, config: &SiteConfig) -> String {
    let mut lines: Vec<String> = site.trim_end().lines().map(str::to_owned).collect();
    let mut block = String::new();
    for (pattern, headers) in rules(config) {
        if !merge_into(&mut lines, &pattern, &headers) {
            block.push_str(&pattern);
            block.push('\n');
            for h in headers {
                block.push_str(&format!("  {h}\n"));
            }
        }
    }
    let mut out = lines.join("\n");
    if !block.is_empty() {
        if !out.is_empty() {
            out.push_str("\n\n");
        }
        out.push_str(&format!("{BLOCK_BEGIN}\n{block}{BLOCK_END}"));
    }
    out.push('\n');
    out
}

/// Merges the `GeoHarness` rules with `existing`; `edit_site` may change the
/// site's own text first (the one sanctioned edit: the opt-in CSP extension).
pub fn merge_with(
    existing: Option<&str>,
    config: &SiteConfig,
    edit_site: impl FnOnce(String) -> String,
) -> Result<String, Error> {
    let site = edit_site(strip_block(existing.unwrap_or("")));
    let out = merge_site(&site, config);
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

/// Merges the `GeoHarness` rules with `existing`, leaving the site's text as is.
pub fn merge(existing: Option<&str>, config: &SiteConfig) -> Result<String, Error> {
    merge_with(existing, config, |s| s)
}
