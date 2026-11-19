//! Content-Security-Policy parsing (CSP Level 3, `w3c-csp3`): directive
//! lists, the fetch-directive fallback chain, and the two questions
//! `GeoHarness` asks of a policy — may the page fetch its own origin, and how
//! to admit one more source without loosening anything else.

/// One policy: directives in source order, names lower-cased.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Policy {
    directives: Vec<(String, Vec<String>)>,
}

const NONE: &str = "'none'";

/// The fallback chain of a fetch directive, most specific first (CSP3 §6.8.3
/// "Get the effective directive for request" and the per-directive fallback
/// lists). Directives not listed fall back only to themselves.
fn fallback_chain(name: &str) -> &'static [&'static str] {
    match name {
        "script-src-elem" => &["script-src-elem", "script-src", "default-src"],
        "script-src" => &["script-src", "default-src"],
        "connect-src" => &["connect-src", "default-src"],
        "default-src" => &["default-src"],
        _ => &[],
    }
}

/// Splits a header value into its policies (`,` separates policies, `;`
/// directives). The first occurrence of a directive wins, as in browsers.
pub fn parse_header(value: &str) -> Vec<Policy> {
    value
        .split(',')
        .map(parse)
        .filter(|p| !p.directives.is_empty())
        .collect()
}

/// Parses one serialized policy.
pub fn parse(policy: &str) -> Policy {
    let mut directives: Vec<(String, Vec<String>)> = Vec::new();
    for raw in policy.split(';') {
        let mut tokens = raw.split_ascii_whitespace();
        let Some(name) = tokens.next() else { continue };
        let name = name.to_ascii_lowercase();
        if directives.iter().any(|(n, _)| *n == name) {
            continue;
        }
        directives.push((name, tokens.map(str::to_owned).collect()));
    }
    Policy { directives }
}

impl Policy {
    fn get(&self, name: &str) -> Option<&[String]> {
        self.directives
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, s)| s.as_slice())
    }

    /// The source list that governs `name`, following the fallback chain;
    /// `None` when nothing restricts it.
    pub fn effective(&self, name: &str) -> Option<&[String]> {
        fallback_chain(name).iter().find_map(|d| self.get(d))
    }

    pub fn has(&self, name: &str) -> bool {
        self.get(name).is_some()
    }

    /// Adds `source` to what governs `name`. A present directive gets the
    /// source appended (`'none'` is replaced, being valid only alone). An
    /// absent one is created from its effective fallback list, so every other
    /// fetch keeps exactly the policy it had. Returns whether anything changed;
    /// nothing changes when `name` is unrestricted or already lists `source`.
    pub fn add_source(&mut self, name: &str, source: &str) -> bool {
        let Some(current) = self.effective(name) else {
            return false;
        };
        if current.iter().any(|s| s.eq_ignore_ascii_case(source)) {
            return false;
        }
        let mut sources: Vec<String> = current.iter().filter(|s| *s != NONE).cloned().collect();
        sources.push(source.to_owned());
        if let Some(entry) = self.directives.iter_mut().find(|(n, _)| n == name) {
            entry.1 = sources;
        } else {
            let at = self
                .directives
                .iter()
                .position(|(n, _)| n == "default-src")
                .map_or(self.directives.len(), |i| i + 1);
            self.directives.insert(at, (name.to_owned(), sources));
        }
        true
    }

    /// Serialized as `name source …; name …`.
    pub fn serialize(&self) -> String {
        self.directives
            .iter()
            .map(|(n, s)| {
                if s.is_empty() {
                    n.clone()
                } else {
                    format!("{n} {}", s.join(" "))
                }
            })
            .collect::<Vec<_>>()
            .join("; ")
    }
}

/// Whether a source list admits a same-origin fetch of `/robots.txt` from a
/// page on `origin` (`https://host[:port]`): `'self'`, `*`, the origin's
/// scheme, or a host source naming the origin (`*.` wildcards included) whose
/// path, if any, covers `/robots.txt`.
pub fn allows_robots_fetch(sources: &[String], origin: &str) -> bool {
    let (scheme, host) = origin.split_once("://").unwrap_or(("https", origin));
    sources.iter().any(|s| {
        let s = s.to_ascii_lowercase();
        if s == "'self'" || s == "*" || s == format!("{scheme}:") {
            return true;
        }
        let rest = match s.split_once("://") {
            Some((sch, rest)) if sch == scheme || (scheme == "http" && sch == "https") => rest,
            Some(_) => return false,
            None => s.as_str(),
        };
        let (pattern, path) = rest.find('/').map_or((rest, ""), |i| rest.split_at(i));
        let host_ok = pattern == host
            || pattern
                .strip_prefix("*.")
                .is_some_and(|suffix| host.ends_with(&format!(".{suffix}")));
        let path_ok = path.is_empty()
            || (path.ends_with('/') && "/robots.txt".starts_with(path))
            || path == "/robots.txt";
        host_ok && path_ok
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SITE: &str = "default-src 'none'; style-src 'sha256-x'; img-src 'self'; base-uri 'none'; upgrade-insecure-requests";

    #[test]
    fn effective_follows_the_fallback_chain() {
        let p = parse(SITE);
        assert_eq!(p.effective("connect-src"), Some(&["'none'".to_owned()][..]));
        assert_eq!(
            p.effective("img-src"),
            None,
            "img-src has no fallback in this table"
        );
        assert_eq!(parse("img-src 'self'").effective("connect-src"), None);
        let p = parse("default-src 'self'; script-src a.example");
        assert_eq!(
            p.effective("script-src-elem"),
            Some(&["a.example".to_owned()][..])
        );
    }

    #[test]
    fn first_directive_wins_and_names_are_case_insensitive() {
        let p = parse("Connect-Src 'self'; connect-src 'none'");
        assert_eq!(p.effective("connect-src"), Some(&["'self'".to_owned()][..]));
    }

    #[test]
    fn adding_to_an_absent_directive_copies_its_fallback() {
        let mut p = parse("default-src 'self' https://cdn.example; img-src 'self'");
        assert!(p.add_source("script-src", "https://static.cloudflareinsights.com"));
        assert_eq!(
            p.serialize(),
            "default-src 'self' https://cdn.example; script-src 'self' https://cdn.example https://static.cloudflareinsights.com; img-src 'self'"
        );
    }

    #[test]
    fn adding_replaces_none_and_is_idempotent() {
        let mut p = parse(SITE);
        assert!(p.add_source("connect-src", "'self'"));
        assert!(!p.add_source("connect-src", "'self'"));
        assert!(
            p.serialize()
                .contains("default-src 'none'; connect-src 'self'; style-src")
        );
        let mut q = parse("script-src 'none'");
        assert!(q.add_source("script-src", "https://a.example"));
        assert_eq!(q.serialize(), "script-src https://a.example");
    }

    #[test]
    fn an_unrestricted_directive_is_left_alone() {
        let mut p = parse("img-src 'self'; upgrade-insecure-requests");
        assert!(!p.add_source("connect-src", "https://cloudflareinsights.com"));
        assert_eq!(p.serialize(), "img-src 'self'; upgrade-insecure-requests");
    }

    #[test]
    fn robots_fetch_matching() {
        let o = "https://geo.example.com";
        let yes = [
            "'self'",
            "*",
            "https:",
            "geo.example.com",
            "https://geo.example.com",
            "*.example.com",
            "https://geo.example.com/robots.txt",
        ];
        for s in yes {
            assert!(allows_robots_fetch(&[s.to_owned()], o), "{s}");
        }
        let no = [
            "'none'",
            "http:",
            "other.example.com",
            "http://geo.example.com",
            "*.geo.example.com",
            "'unsafe-inline'",
            "https://geo.example.com/assets/",
        ];
        for s in no {
            assert!(!allows_robots_fetch(&[s.to_owned()], o), "{s}");
        }
    }

    #[test]
    fn header_values_split_into_policies() {
        let ps = parse_header("default-src 'self', connect-src 'none'");
        assert_eq!(ps.len(), 2);
        assert!(parse_header(" ").is_empty());
    }
}
