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

/// One `_headers` rule `GeoHarness` writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    pub pattern: String,
    /// Header lines without indentation.
    pub headers: Vec<String>,
}

impl Rule {
    pub fn new(pattern: impl Into<String>, headers: Vec<String>) -> Self {
        Self {
            pattern: pattern.into(),
            headers,
        }
    }
}

/// The site-wide `GeoHarness` rules for `site` (the site's own text).
/// Cloudflare sends the headers of every matching rule, so a site rule with a
/// different `Content-Signal` would put two conflicting signals on its URLs
/// (`/*` matches them all): an error. The same value on the site's `/*` rule
/// is not written a second time.
fn rules(config: &SiteConfig, site: &str) -> Result<Vec<Rule>, Error> {
    let signal = content_signal_value(config.content_signal);
    let site_signals = values(site, "content-signal");
    if let Some((pattern, value)) = site_signals.iter().find(|(_, v)| *v != signal) {
        return Err(Error::HeadersConflict(format!(
            "site rule {pattern} sets Content-Signal: {value}, but contentSignal is {signal} and GeoHarness \
             sends it on /*; remove the site's header or make contentSignal match it"
        )));
    }
    // Every HTML URL can also answer with markdown (Accept negotiation), so
    // every response must vary on Accept for downstream caches.
    let mut site_wide = vec!["Vary: Accept".to_owned()];
    if !site_signals.iter().any(|(p, _)| *p == "/*") {
        site_wide.push(format!("Content-Signal: {signal}"));
    }
    let mut out = vec![
        Rule::new("/*", site_wide),
        Rule::new(
            "/*.md",
            vec!["Content-Type: text/markdown; charset=utf-8".to_owned()],
        ),
    ];
    for pattern in &config.headers.immutable {
        out.push(Rule::new(
            pattern.clone(),
            vec!["Cache-Control: public, max-age=31536000, immutable".to_owned()],
        ));
    }
    Ok(out)
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

/// Merges `rules` into `site` (already free of a previous `GeoHarness` block).
fn merge_site(site: &str, rules: &[Rule]) -> String {
    let mut lines: Vec<String> = site.trim_end().lines().map(str::to_owned).collect();
    let mut block = String::new();
    for rule in rules {
        if !merge_into(&mut lines, &rule.pattern, &rule.headers) {
            block.push_str(&rule.pattern);
            block.push('\n');
            for h in &rule.headers {
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

/// A merged `_headers` file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Merged {
    pub text: String,
    /// The optional rules (`optional` of [`merge_with`]) left out because the
    /// file would otherwise exceed [`MAX_RULES`]; 0 when all were written.
    pub skipped: usize,
}

/// Merges the `GeoHarness` rules with `existing`; `edit_site` may change the
/// site's own text first (the one sanctioned edit: the opt-in CSP extension).
/// `optional` rules (the per-page `Link` headers, which are advisory) are
/// written only when all of them fit: a site with some pages declared and
/// others silently not would be harder to reason about than one with none
/// (and a warning). The required rules over the limit are an error.
pub fn merge_with(
    existing: Option<&str>,
    config: &SiteConfig,
    optional: &[Rule],
    edit_site: impl FnOnce(String) -> String,
) -> Result<Merged, Error> {
    let site = edit_site(strip_block(existing.unwrap_or("")));
    let required = rules(config, &site)?;
    let all: Vec<Rule> = required.iter().chain(optional).cloned().collect();
    let out = merge_site(&site, &all);
    if count_rules(&out) <= MAX_RULES {
        return Ok(Merged {
            text: out,
            skipped: 0,
        });
    }
    let out = merge_site(&site, &required);
    let rules = count_rules(&out);
    if rules > MAX_RULES {
        return Err(Error::HeadersTooManyRules(format!(
            "{rules} rules (site {} + GeoHarness {}); Cloudflare allows {MAX_RULES}",
            count_rules(&site),
            rules - count_rules(&site)
        )));
    }
    Ok(Merged {
        text: out,
        skipped: optional.len(),
    })
}

/// Merges the `GeoHarness` site-wide rules with `existing`, leaving the
/// site's text as is.
pub fn merge(existing: Option<&str>, config: &SiteConfig) -> Result<String, Error> {
    merge_with(existing, config, &[], |s| s).map(|m| m.text)
}
