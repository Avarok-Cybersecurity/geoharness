//! Line-oriented robots.txt parser (RFC 9309 grouping).

use super::merge::{BLOCK_BEGIN, BLOCK_END};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RuleKind {
    Allow,
    Disallow,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Rule {
    pub kind: RuleKind,
    pub path: String,
}

/// One group: its user agents, rules and other `key: value` lines.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Group {
    pub agents: Vec<String>,
    pub rules: Vec<Rule>,
    pub content_signal: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Robots {
    pub groups: Vec<Group>,
    pub sitemaps: Vec<String>,
}

impl Group {
    /// Whether this group names `token` (case-insensitive, `*` literal).
    pub fn names(&self, token: &str) -> bool {
        self.agents.iter().any(|a| a.eq_ignore_ascii_case(token))
    }

    /// Rules as a sorted set, for equality between groups.
    pub fn rule_set(&self) -> Vec<Rule> {
        let mut r = self.rules.clone();
        r.sort();
        r.dedup();
        r
    }
}

/// Removes a previously generated `GeoHarness` block so re-runs are idempotent.
pub fn strip_block(robots: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for line in robots.lines() {
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

/// Parses robots.txt. Unknown keys are ignored as RFC 9309 requires.
pub fn parse(robots: &str) -> Robots {
    let mut out = Robots::default();
    let mut current: Option<Group> = None;
    let mut last_was_agent = false;
    for raw in robots.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let (key, value) = (key.trim().to_ascii_lowercase(), value.trim().to_owned());
        match key.as_str() {
            "user-agent" => {
                if !last_was_agent {
                    out.groups.extend(current.take());
                }
                current
                    .get_or_insert_with(Group::default)
                    .agents
                    .push(value);
                last_was_agent = true;
                continue;
            }
            "sitemap" => out.sitemaps.push(value),
            "allow" | "disallow" if !value.is_empty() => {
                let kind = if key == "allow" {
                    RuleKind::Allow
                } else {
                    RuleKind::Disallow
                };
                if let Some(g) = current.as_mut() {
                    g.rules.push(Rule { kind, path: value });
                }
            }
            "content-signal" => {
                if let Some(g) = current.as_mut() {
                    g.content_signal = Some(value);
                }
            }
            _ => {}
        }
        last_was_agent = false;
    }
    out.groups.extend(current);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_consecutive_agents_and_skips_comments() {
        let r = parse(
            "User-agent: a\nUser-agent: b # c\nDisallow: /x\n\nUser-agent: *\nAllow: /\nSitemap: s",
        );
        assert_eq!(r.groups.len(), 2);
        assert_eq!(r.groups[0].agents, vec!["a", "b"]);
        assert_eq!(r.groups[0].rules.len(), 1);
        assert_eq!(r.sitemaps, vec!["s"]);
    }
}
