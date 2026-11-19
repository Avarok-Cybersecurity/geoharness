//! Semantic validation beyond what serde checks. Every check reports the
//! dotted config key it concerns; all failures are returned, not the first.

use super::SiteConfig;
use crate::error::{CoreError, Error};

struct Report(Vec<CoreError>);

impl Report {
    fn check(&mut self, ok: bool, path: &str, message: impl FnOnce() -> String) {
        if !ok {
            self.0.push(Error::ConfigInvalid(message()).at(path));
        }
    }
}

/// Validates a parsed config. Also run on configs that arrive as JSON.
pub fn validate(config: &SiteConfig) -> Result<(), Vec<CoreError>> {
    let mut r = Report(Vec::new());
    site(config, &mut r);
    identity(config, &mut r);
    bots(config, &mut r);
    content(config, &mut r);
    llms(config, &mut r);
    env(config, &mut r);
    for (i, g) in config.headers.immutable.iter().enumerate() {
        r.check(is_path_glob(g), &format!("headers.immutable[{i}]"), || {
            format!("{g:?} must start with '/' and be a single line")
        });
    }
    if let Some(p) = &config.prerender {
        for (i, route) in p.routes.iter().enumerate() {
            let ok = is_path_glob(route) && !route.contains(['*', '?', '#', ' ']);
            r.check(ok, &format!("prerender.routes[{i}]"), || {
                format!("{route:?} must be a literal absolute route")
            });
        }
    }
    if r.0.is_empty() { Ok(()) } else { Err(r.0) }
}

fn site(c: &SiteConfig, r: &mut Report) {
    let origin = &c.site.origin;
    r.check(is_origin(origin), "site.origin", || {
        format!("{origin:?} must be https://host with no path, query or trailing slash")
    });
    r.check(single_line(&c.site.name), "site.name", || {
        "must be a non-empty single line".to_owned()
    });
    r.check(is_bcp47(&c.site.language), "site.language", || {
        format!("{:?} is not a BCP 47 tag", c.site.language)
    });
}

fn identity(c: &SiteConfig, r: &mut Report) {
    let id = &c.identity;
    r.check(single_line(&id.name), "identity.name", || {
        "must be a non-empty single line".to_owned()
    });
    r.check(is_url(&id.url), "identity.url", || {
        format!("{:?} must be an absolute http(s) URL", id.url)
    });
    for (i, u) in id.same_as.iter().enumerate() {
        r.check(is_url(u), &format!("identity.sameAs[{i}]"), || {
            format!("{u:?} must be an absolute http(s) URL")
        });
    }
    if let Some(org) = &id.organization {
        r.check(single_line(&org.name), "identity.organization.name", || {
            "must be a non-empty single line".to_owned()
        });
        r.check(is_url(&org.url), "identity.organization.url", || {
            format!("{:?} must be an absolute http(s) URL", org.url)
        });
    }
}

fn bots(c: &SiteConfig, r: &mut Report) {
    r.check(!c.bots.is_empty(), "bots", || {
        "at least one bot policy is required".to_owned()
    });
    let mut seen: Vec<String> = Vec::new();
    for (i, b) in c.bots.iter().enumerate() {
        r.check(!b.tokens.is_empty(), &format!("bots[{i}].tokens"), || {
            "must list at least one user-agent token".to_owned()
        });
        for t in &b.tokens {
            let ok = !t.is_empty() && !t.chars().any(|ch| ch.is_whitespace() || ch == ':');
            r.check(ok, &format!("bots[{i}].tokens"), || {
                format!("{t:?} is not a user-agent token")
            });
            let lower = t.to_ascii_lowercase();
            r.check(!seen.contains(&lower), &format!("bots[{i}].tokens"), || {
                format!("{t:?} appears in more than one policy")
            });
            seen.push(lower);
        }
        for (key, list) in [("allow", &b.allow), ("disallow", &b.disallow)] {
            for p in list {
                let ok = (p.starts_with('/') || p.starts_with('*')) && single_line(p);
                r.check(ok, &format!("bots[{i}].{key}"), || {
                    format!("{p:?} must start with '/' or '*'")
                });
            }
        }
    }
}

fn content(c: &SiteConfig, r: &mut Report) {
    let sel = &c.content.main_selector;
    r.check(
        scraper::Selector::parse(sel).is_ok(),
        "content.mainSelector",
        || format!("{sel:?} is not a valid CSS selector"),
    );
    for (i, g) in c.content.exclude.iter().enumerate() {
        r.check(is_path_glob(g), &format!("content.exclude[{i}]"), || {
            format!("{g:?} must start with '/'")
        });
    }
    for (route, sources) in &c.content.sources {
        let key = format!("content.sources.{route:?}");
        r.check(is_path_glob(route), &key, || {
            format!("route glob {route:?} must start with '/'")
        });
        r.check(!sources.is_empty(), &key, || {
            "lists no source globs".to_owned()
        });
        for (i, g) in sources.iter().enumerate() {
            r.check(is_source_glob(g), &format!("{key}[{i}]"), || {
                format!("{g:?} must be a path relative to the site directory (no leading '/', ':' or '!', no '..')")
            });
        }
    }
}

/// A git pathspec glob relative to the site directory; never pathspec magic.
fn is_source_glob(s: &str) -> bool {
    single_line(s) && !s.starts_with(['/', ':', '!']) && !s.split('/').any(|seg| seg == "..")
}

fn llms(c: &SiteConfig, r: &mut Report) {
    r.check(single_line(&c.llms.summary), "llms.summary", || {
        "must be a non-empty single line (it becomes the blockquote)".to_owned()
    });
    for (i, s) in c.llms.sections.iter().enumerate() {
        r.check(
            single_line(&s.title),
            &format!("llms.sections[{i}].title"),
            || "must be a non-empty single line".to_owned(),
        );
        for g in &s.routes {
            r.check(
                is_path_glob(g),
                &format!("llms.sections[{i}].routes"),
                || format!("{g:?} must start with '/'"),
            );
        }
    }
}

fn env(c: &SiteConfig, r: &mut Report) {
    for (i, name) in c.env.iter().enumerate() {
        r.check(is_env_name(name), &format!("env[{i}]"), || {
            format!("{name:?} must match [A-Z_][A-Z0-9_]*")
        });
        r.check(!c.env[..i].contains(name), &format!("env[{i}]"), || {
            format!("{name:?} is declared twice")
        });
    }
}

/// `https://host[:port]` with no path, query or trailing slash.
pub fn is_origin(origin: &str) -> bool {
    let host = origin.strip_prefix("https://").unwrap_or("");
    !host.is_empty()
        && host
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | ':'))
}

fn single_line(s: &str) -> bool {
    !s.trim().is_empty() && !s.contains(['\n', '\r'])
}

fn is_path_glob(s: &str) -> bool {
    s.starts_with('/') && single_line(s)
}

fn is_url(s: &str) -> bool {
    let rest = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"));
    rest.is_some_and(|r| !r.is_empty() && !r.starts_with('/')) && single_line(s) && !s.contains(' ')
}

/// Matches identifiers declared in `env`.
pub(crate) fn is_env_name(s: &str) -> bool {
    let mut chars = s.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_uppercase() || c == '_')
        && chars.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

fn is_bcp47(s: &str) -> bool {
    let mut parts = s.split('-');
    let primary = parts.next().unwrap_or("");
    (2..=8).contains(&primary.len())
        && primary.chars().all(|c| c.is_ascii_alphabetic())
        && parts.all(|p| (1..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}
