//! `GeoHarness` robots block, appended after the site's own file.
//!
//! The site's file is kept verbatim. A configured token that an existing
//! group already names is skipped when that group's rules are identical and
//! is an error otherwise: `GeoHarness` never silently overrides an author.
//! `Content-Signal` is written into every generated group because a crawler
//! obeys only the most specific group naming it (RFC 9309), so a signal in
//! `*` alone would not reach a bot with its own group.

use super::parse::{Group, Rule, RuleKind, parse, strip_block};
use crate::config::{ContentSignal, SiteConfig};
use crate::error::Error;

pub const BLOCK_BEGIN: &str = "# BEGIN GeoHarness";
pub const BLOCK_END: &str = "# END GeoHarness";

fn yes_no(b: bool) -> &'static str {
    if b { "yes" } else { "no" }
}

/// `search=yes, ai-input=yes, ai-train=no` (`cf-content-signals`).
pub fn content_signal_value(s: ContentSignal) -> String {
    format!(
        "search={}, ai-input={}, ai-train={}",
        yes_no(s.search),
        yes_no(s.ai_input),
        yes_no(s.ai_train)
    )
}

fn configured_groups(config: &SiteConfig) -> Vec<Group> {
    let signal = Some(content_signal_value(config.content_signal));
    let mut groups: Vec<Group> = config
        .bots
        .iter()
        .map(|b| Group {
            agents: b.tokens.clone(),
            rules: b
                .allow
                .iter()
                .map(|p| Rule {
                    kind: RuleKind::Allow,
                    path: p.clone(),
                })
                .chain(b.disallow.iter().map(|p| Rule {
                    kind: RuleKind::Disallow,
                    path: p.clone(),
                }))
                .collect(),
            content_signal: signal.clone(),
        })
        .collect();
    if !groups.iter().any(|g| g.names("*")) {
        groups.push(Group {
            agents: vec!["*".into()],
            rules: Vec::new(),
            content_signal: signal,
        });
    }
    groups
}

/// Merges the configured policy into `existing` (contract §2, robots.txt).
pub fn merge(existing: Option<&str>, config: &SiteConfig) -> Result<String, Error> {
    let site = strip_block(existing.unwrap_or(""));
    let parsed = parse(&site);
    let explicit_star = config
        .bots
        .iter()
        .any(|b| b.tokens.iter().any(|t| t == "*"));
    let mut conflicts = Vec::new();
    let mut emit = Vec::new();
    for mut group in configured_groups(config) {
        let implicit = group.names("*") && !explicit_star;
        let ours = group.rule_set();
        group.agents.retain(|token| {
            let Some(theirs) = parsed.groups.iter().find(|g| g.names(token)) else {
                return true;
            };
            if !implicit && theirs.rule_set() != ours {
                conflicts.push(token.clone());
            }
            false
        });
        if !group.agents.is_empty() {
            emit.push(group);
        }
    }
    if !conflicts.is_empty() {
        return Err(Error::RobotsConflict(format!(
            "the site's robots.txt already has different rules for: {}",
            conflicts.join(", ")
        )));
    }
    let sitemap = format!("{}/sitemap.xml", config.site.origin);
    let mut out = site.trim_end().to_owned();
    if !out.is_empty() {
        out.push_str("\n\n");
    }
    out.push_str(BLOCK_BEGIN);
    out.push_str("\n# Content signals: https://contentsignals.org/\n");
    for g in &emit {
        out.push('\n');
        write_group(&mut out, g);
    }
    if !parsed.sitemaps.contains(&sitemap) {
        out.push_str(&format!("\nSitemap: {sitemap}\n"));
    }
    out.push_str(BLOCK_END);
    out.push('\n');
    Ok(out)
}

fn write_group(out: &mut String, g: &Group) {
    for a in &g.agents {
        out.push_str(&format!("User-agent: {a}\n"));
    }
    if let Some(s) = &g.content_signal {
        out.push_str(&format!("Content-Signal: {s}\n"));
    }
    for r in &g.rules {
        let key = match r.kind {
            RuleKind::Allow => "Allow",
            RuleKind::Disallow => "Disallow",
        };
        out.push_str(&format!("{key}: {}\n", r.path));
    }
}
