//! Markdown twins: path mapping, frontmatter and assembly (contract §2).

use crate::error::Error;

/// `x/index.html` → `x/index.md`; `x.html` → `x.md`; anything else is not a page.
pub fn twin_path(file: &str) -> Result<String, Error> {
    file.strip_suffix(".html")
        .filter(|stem| !stem.is_empty() && !file.starts_with('/'))
        .map(|stem| format!("{stem}.md"))
        .ok_or_else(|| {
            Error::InputInvalid(format!(
                "page file {file:?} must be a relative path ending in .html"
            ))
        })
}

/// URL path at which a twin is served: `about/index.md` → `/about/index.md`.
pub fn twin_url_path(markdown_file: &str) -> String {
    format!("/{markdown_file}")
}

/// Frontmatter fields, in output order.
pub struct Frontmatter<'a> {
    pub title: &'a str,
    pub description: &'a str,
    pub canonical: &'a str,
    pub lastmod: Option<&'a str>,
    pub tokens: u32,
}

/// YAML double-quoted scalar (JSON string syntax is valid YAML).
fn yaml_str(s: &str) -> String {
    serde_json::Value::String(s.to_owned()).to_string()
}

/// Assembles the twin: frontmatter, body, then JSON-LD as a fenced block.
/// `tokens` counts the body and JSON-LD (everything after the frontmatter).
pub fn assemble(fm: &Frontmatter<'_>, after_frontmatter: &str) -> String {
    let mut out = String::from("---\n");
    out.push_str(&format!("title: {}\n", yaml_str(fm.title)));
    out.push_str(&format!("description: {}\n", yaml_str(fm.description)));
    out.push_str(&format!("canonical: {}\n", yaml_str(fm.canonical)));
    if let Some(l) = fm.lastmod {
        out.push_str(&format!("lastmod: {}\n", yaml_str(l)));
    }
    out.push_str(&format!("tokens: {}\n---\n\n", fm.tokens));
    out.push_str(after_frontmatter);
    out
}

/// Body plus fenced JSON-LD blocks; each block is pretty-printed when it
/// parses, verbatim otherwise (the caller warns).
pub fn body_with_json_ld(body: &str, json_ld: &[String]) -> String {
    let mut out = body.trim().to_owned();
    out.push('\n');
    for block in json_ld {
        let pretty = serde_json::from_str::<serde_json::Value>(block)
            .ok()
            .and_then(|v| serde_json::to_string_pretty(&v).ok())
            .unwrap_or_else(|| block.trim().to_owned());
        out.push_str("\n```json\n");
        out.push_str(&pretty);
        out.push_str("\n```\n");
    }
    out
}

/// Removes a leading YAML frontmatter block from adapter-supplied markdown.
pub fn strip_frontmatter(md: &str) -> &str {
    let Some(rest) = md
        .strip_prefix("---\n")
        .or_else(|| md.strip_prefix("---\r\n"))
    else {
        return md;
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        offset += line.len();
        if line.trim_end() == "---" {
            return &rest[offset..];
        }
    }
    md
}

/// Splits a twin into (frontmatter-free body without JSON-LD fences).
/// Used by the audit to compare a twin's prose with its page.
pub fn prose(twin: &str) -> String {
    let body = strip_frontmatter(twin);
    let mut out = String::new();
    let mut in_json = false;
    for line in body.lines() {
        match (in_json, line.trim()) {
            (false, "```json") => in_json = true,
            (true, "```") => in_json = false,
            (false, _) => {
                out.push_str(line);
                out.push('\n');
            }
            (true, _) => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_both_layouts_and_rejects_others() {
        assert_eq!(
            twin_path("about/index.html").ok().as_deref(),
            Some("about/index.md")
        );
        assert_eq!(twin_path("x.html").ok().as_deref(), Some("x.md"));
        assert!(twin_path("x.htm").is_err());
        assert!(twin_path("/abs.html").is_err());
    }

    #[test]
    fn strips_frontmatter_only_when_closed() {
        assert_eq!(strip_frontmatter("---\na: 1\n---\nbody"), "body");
        assert_eq!(strip_frontmatter("---\nnever closed"), "---\nnever closed");
    }
}
