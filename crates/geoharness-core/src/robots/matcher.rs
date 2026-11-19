//! RFC 9309 §2.2: the most specific (longest) matching rule wins; on a tie
//! `Allow` wins. Groups naming the agent are combined; otherwise `*` applies.

use super::{Robots, RuleKind};

/// Whether `agent` may fetch `path` under `robots`.
pub fn is_allowed(robots: &Robots, agent: &str, path: &str) -> bool {
    let named: Vec<_> = robots.groups.iter().filter(|g| g.names(agent)).collect();
    let groups = if named.is_empty() {
        robots.groups.iter().filter(|g| g.names("*")).collect()
    } else {
        named
    };
    let best = groups
        .iter()
        .flat_map(|g| g.rules.iter())
        .filter(|r| pattern_matches(&r.path, path))
        .max_by_key(|r| (r.path.len(), r.kind == RuleKind::Allow));
    best.is_none_or(|r| r.kind == RuleKind::Allow)
}

fn pattern_matches(pattern: &str, path: &str) -> bool {
    let (pattern, anchored) = match pattern.strip_suffix('$') {
        Some(p) => (p, true),
        None => (pattern, false),
    };
    matches_from(pattern.as_bytes(), path.as_bytes(), anchored)
}

fn matches_from(p: &[u8], s: &[u8], anchored: bool) -> bool {
    match p {
        [] => !anchored || s.is_empty(),
        [b'*', rest @ ..] => (0..=s.len()).any(|i| matches_from(rest, &s[i..], anchored)),
        [c, rest @ ..] => s.first() == Some(c) && matches_from(rest, &s[1..], anchored),
    }
}

#[cfg(test)]
mod tests {
    use super::super::parse;
    use super::is_allowed;

    #[test]
    fn longest_match_and_allow_ties() {
        let r =
            parse("User-agent: *\nDisallow: /private/\nAllow: /private/ok\nDisallow: /*.pdf$\n");
        assert!(is_allowed(&r, "x", "/"));
        assert!(!is_allowed(&r, "x", "/private/a"));
        assert!(is_allowed(&r, "x", "/private/ok/b"));
        assert!(!is_allowed(&r, "x", "/a/b.pdf"));
        assert!(is_allowed(&r, "x", "/a/b.pdf?x"));
    }

    #[test]
    fn named_group_replaces_star() {
        let r = parse("User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n");
        assert!(is_allowed(&r, "gptbot", "/a"));
        assert!(!is_allowed(&r, "other", "/a"));
    }
}
