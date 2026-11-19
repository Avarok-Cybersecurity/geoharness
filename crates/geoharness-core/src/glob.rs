//! Route/path globs used by `content.exclude`, `llms.sections[].routes` and
//! `headers.immutable`: `*` matches any run of characters except `/`, `**`
//! matches any run including `/`. Everything else is literal.

/// Returns whether `path` matches `pattern` in full.
pub fn matches(pattern: &str, path: &str) -> bool {
    matches_bytes(pattern.as_bytes(), path.as_bytes())
}

fn matches_bytes(p: &[u8], s: &[u8]) -> bool {
    match p {
        [] => s.is_empty(),
        [b'*', b'*', rest @ ..] => (0..=s.len()).any(|i| matches_bytes(rest, &s[i..])),
        [b'*', rest @ ..] => {
            let limit = s.iter().position(|&c| c == b'/').unwrap_or(s.len());
            (0..=limit).any(|i| matches_bytes(rest, &s[i..]))
        }
        [c, rest @ ..] => s.first() == Some(c) && matches_bytes(rest, &s[1..]),
    }
}

/// Returns whether `path` matches any of `patterns`.
pub fn any(patterns: &[String], path: &str) -> bool {
    patterns.iter().any(|p| matches(p, path))
}

#[cfg(test)]
mod tests {
    use super::matches;

    #[test]
    fn star_stays_in_segment_double_star_crosses() {
        assert!(matches("/blog/*", "/blog/post"));
        assert!(!matches("/blog/*", "/blog/a/b"));
        assert!(matches("/blog/**", "/blog/a/b/"));
        assert!(matches("/", "/"));
        assert!(!matches("/", "/a/"));
        assert!(matches("/assets/*.js", "/assets/app.123.js"));
    }
}
