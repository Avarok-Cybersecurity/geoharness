//! HTTP `Link` headers (`rfc-8288`): each HTML page declares its markdown
//! twin (`rel="alternate"; type="text/markdown"`, `llmstxt-spec`) and
//! llms.txt (`rel="describedby"`); each twin declares its page
//! (`rel="canonical"`, `google-canonical-header`). The same links are in the
//! page's `<head>`; the header carries them to clients that read only
//! headers, and to the markdown twin, which has no `<head>`.
//!
//! Directory-style pages (`x/index.html`) can share two generic rules
//! through Cloudflare's `:splat` placeholder (`cf-workers-static-assets`), so
//! the rule count does not grow with the site. A generic rule is used only
//! where it is exact for every page it matches: `/*/` only when no excluded
//! directory route (which has no twin) lies under it, `/*/index.md` only when
//! every directory page's canonical is its own URL. Otherwise those pages get
//! exact rules, as file-style pages (`x.html`) and `/` always do. No rule
//! relies on detaching (`! Link`): `wrangler dev` does not apply it, so the
//! pre-deploy gate would not see what production serves. A `/*/` rule also
//! answers for a directory URL that 404s; such a response is not indexed.

use crate::headers::Rule;

/// One processed page, as the `Link` rules need it.
pub struct PageLink<'a> {
    pub route: &'a str,
    /// Output-relative twin file: `about/index.md`.
    pub markdown_file: &'a str,
    /// The canonical the page declares (or `origin + route`).
    pub canonical: &'a str,
}

fn page_link(twin: &str, llms: &str) -> String {
    format!(
        "Link: <{twin}>; rel=\"alternate\"; type=\"text/markdown\", <{llms}>; rel=\"describedby\""
    )
}

fn twin_link(canonical: &str) -> String {
    format!("Link: <{canonical}>; rel=\"canonical\"")
}

/// `x/index.html` served at `/x/`, other than `/`.
fn nested_directory(p: &PageLink<'_>) -> bool {
    p.route.len() > 1
        && p.route.ends_with('/')
        && p.markdown_file == format!("{}index.md", &p.route[1..])
}

/// The `Link` rules for `pages`; `excluded` are the routes that get no twin.
pub fn rules(origin: &str, pages: &[PageLink<'_>], excluded: &[&str]) -> Vec<Rule> {
    let llms = format!("{origin}/llms.txt");
    let nested: Vec<&PageLink<'_>> = pages.iter().filter(|p| nested_directory(p)).collect();
    let generic_pages =
        !nested.is_empty() && !excluded.iter().any(|r| r.len() > 1 && r.ends_with('/'));
    let generic_twins = !nested.is_empty()
        && nested
            .iter()
            .all(|p| p.canonical == format!("{origin}{}", p.route));
    let mut out = Vec::new();
    if generic_pages {
        let twin = format!("{origin}/:splat/index.md");
        out.push(Rule::new("/*/", vec![page_link(&twin, &llms)]));
    }
    if generic_twins {
        let canonical = format!("{origin}/:splat/");
        out.push(Rule::new("/*/index.md", vec![twin_link(&canonical)]));
    }
    for p in pages {
        let nested = nested_directory(p);
        if !(nested && generic_pages) {
            let twin = format!("{origin}/{}", p.markdown_file);
            out.push(Rule::new(p.route, vec![page_link(&twin, &llms)]));
        }
        if !(nested && generic_twins) {
            let twin_path = format!("/{}", p.markdown_file);
            out.push(Rule::new(twin_path, vec![twin_link(p.canonical)]));
        }
    }
    out
}

/// One link-value of a `Link` header: its target and `(name, value)`
/// parameters (names lower-cased, quotes removed).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkValue {
    pub target: String,
    pub params: Vec<(String, String)>,
}

impl LinkValue {
    /// Whether `rel` lists `relation` (a space-separated list, `rfc-8288` §3.3).
    pub fn has_rel(&self, relation: &str) -> bool {
        self.param("rel").is_some_and(|r| {
            r.split_ascii_whitespace()
                .any(|t| t.eq_ignore_ascii_case(relation))
        })
    }

    pub fn param(&self, name: &str) -> Option<&str> {
        self.params
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, v)| v.as_str())
    }
}

/// Parses a `Link` header value (comma-separated link-values, `rfc-8288`
/// §3); a malformed link-value ends parsing.
pub fn parse(value: &str) -> Vec<LinkValue> {
    let mut out = Vec::new();
    let mut rest = value.trim_start();
    while let Some(after) = rest.strip_prefix('<') {
        let Some(end) = after.find('>') else { break };
        let target = after[..end].trim().to_owned();
        let mut tail = &after[end + 1..];
        let mut params = Vec::new();
        loop {
            tail = tail.trim_start();
            let Some(p) = tail.strip_prefix(';') else {
                break;
            };
            let (param, next) = split_param(p.trim_start());
            if let Some((n, v)) = param.split_once('=') {
                params.push((
                    n.trim().to_ascii_lowercase(),
                    v.trim().trim_matches('"').to_owned(),
                ));
            } else if !param.trim().is_empty() {
                params.push((param.trim().to_ascii_lowercase(), String::new()));
            }
            tail = next;
        }
        out.push(LinkValue { target, params });
        rest = tail
            .trim_start()
            .strip_prefix(',')
            .unwrap_or("")
            .trim_start();
    }
    out
}

/// Splits one parameter off `s`, honouring quoted strings: `(param, rest)`
/// where `rest` starts at the next `;` or `,` outside quotes.
fn split_param(s: &str) -> (&str, &str) {
    let mut quoted = false;
    for (i, ch) in s.char_indices() {
        match ch {
            '"' => quoted = !quoted,
            ';' | ',' if !quoted => return (&s[..i], &s[i..]),
            _ => {}
        }
    }
    (s, "")
}
