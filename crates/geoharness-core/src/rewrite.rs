//! Zone URL Rewrite rules that send `Accept: text/markdown` requests to the
//! `.md` twin (`cf-transform-rules`, `cf-rules-functions`, `cf-phases`).
//! No regex (Free plan): only `concat`, `wildcard_replace`, `ends_with` and
//! the path `extension` field. Each rule is derived from a [`Kind`] that also
//! has a Rust model of its matching and rewriting, so the property tests
//! exercise the same definition the expressions are rendered from.

use crate::types::RewriteRule;

/// How a bare path (`/about`) maps to its twin.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BareMapping {
    /// `/about` → `/about.md` (site emits `about.html`).
    Sibling,
    /// `/about` → `/about/index.md` (site emits `about/index.html`).
    Index,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Directory,
    Bare(BareMapping),
    Html,
}

const PATH: &str = "http.request.uri.path";

impl Kind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Directory => "directory",
            Self::Bare(_) => "bare path",
            Self::Html => ".html",
        }
    }

    fn condition(self) -> String {
        match self {
            Self::Directory => format!("ends_with({PATH}, \"/\")"),
            Self::Bare(_) => format!("not ends_with({PATH}, \"/\") and {PATH}.extension eq \"\""),
            Self::Html => format!("{PATH}.extension eq \"html\""),
        }
    }

    fn path_expression(self) -> String {
        match self {
            Self::Directory => format!("concat({PATH}, \"index.md\")"),
            Self::Bare(BareMapping::Sibling) => format!("concat({PATH}, \".md\")"),
            Self::Bare(BareMapping::Index) => format!("concat({PATH}, \"/index.md\")"),
            Self::Html => format!("wildcard_replace({PATH}, \"*.html\", \"${{1}}.md\")"),
        }
    }

    /// Model of `condition()` under Cloudflare's field semantics.
    pub fn applies(self, path: &str) -> bool {
        let ext = extension(path);
        match self {
            Self::Directory => path.ends_with('/'),
            Self::Bare(_) => !path.ends_with('/') && ext.is_empty(),
            Self::Html => ext == "html",
        }
    }

    /// Model of `path_expression()`.
    pub fn rewrite(self, path: &str) -> String {
        match self {
            Self::Directory => format!("{path}index.md"),
            Self::Bare(BareMapping::Sibling) => format!("{path}.md"),
            Self::Bare(BareMapping::Index) => format!("{path}/index.md"),
            Self::Html => format!("{}.md", &path[..path.len() - ".html".len()]),
        }
    }
}

/// `http.request.uri.path.extension`: lowercased text after the last `.` of
/// the last segment, empty when there is none.
pub fn extension(path: &str) -> String {
    let last = path.rsplit('/').next().unwrap_or("");
    last.rfind('.')
        .map_or_else(String::new, |i| last[i + 1..].to_ascii_lowercase())
}

/// The three kinds for a site whose bare paths map as `bare`.
pub fn kinds(bare: BareMapping) -> [Kind; 3] {
    [Kind::Directory, Kind::Bare(bare), Kind::Html]
}

/// Renders the rules for `host` (no port).
pub fn rules(host: &str, bare: BareMapping) -> Vec<RewriteRule> {
    let guard = format!(
        "http.host eq \"{host}\" and any(http.request.headers[\"accept\"][*] contains \"text/markdown\")"
    );
    kinds(bare)
        .into_iter()
        .map(|k| RewriteRule {
            description: format!("geoharness:{host} markdown twin ({})", k.label()),
            expression: format!("({guard}) and {}", k.condition()),
            path_expression: k.path_expression(),
        })
        .collect()
}

/// Picks the bare mapping from page files: the majority layout wins; a mixed
/// site is reported by the caller.
pub fn bare_mapping(files: &[&str]) -> (BareMapping, usize, usize) {
    let non_root = files.iter().filter(|f| **f != "index.html");
    let (index, sibling) = non_root.fold((0, 0), |(i, s), f| {
        if f.ends_with("/index.html") {
            (i + 1, s)
        } else {
            (i, s + 1)
        }
    });
    let mapping = if sibling > index {
        BareMapping::Sibling
    } else {
        BareMapping::Index
    };
    (mapping, index, sibling)
}
