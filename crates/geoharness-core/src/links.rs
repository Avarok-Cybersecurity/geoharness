//! Internal link resolution shared by RAG edges and the broken-link audit.

/// Resolves `href` found on `base_route` to a site path, or `None` when it
/// is external, a fragment-only link or a non-HTTP scheme.
pub fn resolve(origin: &str, base_route: &str, href: &str) -> Option<String> {
    let href = href.trim();
    let local = match href.strip_prefix(origin) {
        Some(rest) if rest.is_empty() || rest.starts_with(['/', '?', '#']) => rest,
        Some(_) => return None,
        None => href,
    };
    if local.starts_with("//") || local.starts_with('#') || has_scheme(local) {
        return None;
    }
    let path = local.split(['?', '#']).next().unwrap_or("");
    let joined = if path.starts_with('/') {
        path.to_owned()
    } else if path.is_empty() {
        base_route.to_owned()
    } else {
        let dir = &base_route[..=base_route.rfind('/').unwrap_or(0)];
        format!("{dir}{path}")
    };
    Some(normalize(&joined))
}

fn has_scheme(s: &str) -> bool {
    let end = s.find([':', '/', '?', '#']);
    end.is_some_and(|i| s.as_bytes().get(i) == Some(&b':') && i > 0)
}

fn normalize(path: &str) -> String {
    let trailing = path.ends_with('/') || path.ends_with("/.") || path.ends_with("/..");
    let mut parts: Vec<&str> = Vec::new();
    for seg in path.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    let mut out = format!("/{}", parts.join("/"));
    if trailing && out != "/" {
        out.push('/');
    }
    out
}

/// The route among `routes` that serves `path`, trying the forms a static
/// host accepts: exact, with a trailing slash, `index.html`, `.html`, `.md`.
pub fn route_for<'a>(path: &str, routes: &'a [&'a str]) -> Option<&'a str> {
    let mut candidates = vec![path.to_owned(), format!("{path}/")];
    for suffix in ["index.html", "index.md"] {
        if let Some(stem) = path.strip_suffix(suffix) {
            candidates.push(stem.to_owned());
        }
    }
    for suffix in [".html", ".md"] {
        if let Some(stem) = path.strip_suffix(suffix) {
            candidates.push(stem.to_owned());
            candidates.push(format!("{stem}/"));
        }
    }
    candidates
        .iter()
        .find_map(|c| routes.iter().copied().find(|r| r == c))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_absolute_and_external() {
        let o = "https://ex.com";
        assert_eq!(resolve(o, "/a/b/", "../c/").as_deref(), Some("/a/c/"));
        assert_eq!(resolve(o, "/a/b", "c").as_deref(), Some("/a/c"));
        assert_eq!(
            resolve(o, "/a/", "https://ex.com/x?y#z").as_deref(),
            Some("/x")
        );
        assert_eq!(resolve(o, "/a/", "https://other.com/x"), None);
        assert_eq!(resolve(o, "/a/", "mailto:x@y"), None);
        assert_eq!(resolve(o, "/a/", "#top"), None);
    }

    #[test]
    fn route_lookup_accepts_static_forms() {
        let routes = ["/", "/about/", "/x"];
        assert_eq!(route_for("/about", &routes), Some("/about/"));
        assert_eq!(route_for("/about/index.html", &routes), Some("/about/"));
        assert_eq!(route_for("/x.html", &routes), Some("/x"));
        assert_eq!(route_for("/missing/", &routes), None);
    }
}
