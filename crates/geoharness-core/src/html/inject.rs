//! Fill-only head injection with `lol_html` (`lol-html` citation): a tag is
//! added only when the author's page lacks it; author tags are never touched.

use std::cell::Cell;

use lol_html::html_content::ContentType;
use lol_html::{RewriteStrSettings, element, rewrite_str};

use super::HeadFacts;
use crate::error::Error;

/// Values `GeoHarness` would declare for a page.
pub struct HeadValues<'a> {
    pub canonical: &'a str,
    pub markdown_url: &'a str,
    pub llms_url: &'a str,
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub site_name: &'a str,
    pub json_ld: &'a str,
    pub build_id: &'a str,
    pub same_as: &'a [String],
}

/// Escapes a value for a double-quoted HTML attribute.
pub fn attr_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn meta(out: &mut String, key: &str, name: &str, value: &str) {
    out.push_str(&format!(
        "<meta {key}=\"{name}\" content=\"{}\">",
        attr_escape(value)
    ));
}

/// The tags `facts` lacks, in a stable order.
pub fn missing_tags(facts: &HeadFacts, v: &HeadValues<'_>) -> String {
    let mut out = String::new();
    if facts.canonical.is_none() {
        out.push_str(&format!(
            "<link rel=\"canonical\" href=\"{}\">",
            attr_escape(v.canonical)
        ));
    }
    if !facts.has_markdown_alternate {
        out.push_str(&format!(
            "<link rel=\"alternate\" type=\"text/markdown\" href=\"{}\">",
            attr_escape(v.markdown_url)
        ));
    }
    if !facts.has_describedby {
        out.push_str(&format!(
            "<link rel=\"describedby\" href=\"{}\">",
            attr_escape(v.llms_url)
        ));
    }
    let canonical = facts.canonical.as_deref().unwrap_or(v.canonical);
    let social: [(&str, &str, Option<&str>); 8] = [
        ("property", "og:title", v.title),
        ("property", "og:description", v.description),
        ("property", "og:url", Some(canonical)),
        ("property", "og:type", Some("website")),
        ("property", "og:site_name", Some(v.site_name)),
        ("name", "twitter:card", Some("summary")),
        ("name", "twitter:title", v.title),
        ("name", "twitter:description", v.description),
    ];
    for (key, name, value) in social {
        if let (false, Some(value)) = (facts.social.iter().any(|s| s == name), value) {
            meta(&mut out, key, name, value);
        }
    }
    for url in v.same_as.iter().filter(|u| !facts.rel_me.contains(u)) {
        out.push_str(&format!("<link rel=\"me\" href=\"{}\">", attr_escape(url)));
    }
    if facts.json_ld.is_empty() {
        out.push_str("<script type=\"application/ld+json\">");
        out.push_str(&v.json_ld.replace("</", "<\\/"));
        out.push_str("</script>");
    }
    if facts.build.is_none() {
        meta(&mut out, "name", "build", v.build_id);
    }
    out
}

/// Appends `tags` to `<head>`; creates a `<head>` when the page has none.
pub fn inject(html: &str, tags: &str) -> Result<String, Error> {
    if tags.is_empty() {
        return Ok(html.to_owned());
    }
    let seen_head = Cell::new(false);
    let seen_html = Cell::new(false);
    let wrapped = format!("<head>{tags}</head>");
    let settings = RewriteStrSettings::new()
        .append_element_content_handler(element!("head", |el| {
            if !seen_head.replace(true) {
                el.append(tags, ContentType::Html);
            }
            Ok(())
        }))
        .append_element_content_handler(element!("html", |_el| {
            seen_html.set(true);
            Ok(())
        }));
    let out = rewrite_str(html, settings).map_err(|e| Error::Html(e.to_string()))?;
    if seen_head.get() {
        return Ok(out);
    }
    let settings =
        RewriteStrSettings::new().append_element_content_handler(element!("html", |el| {
            el.prepend(&wrapped, ContentType::Html);
            Ok(())
        }));
    if seen_html.get() {
        return rewrite_str(&out, settings).map_err(|e| Error::Html(e.to_string()));
    }
    Ok(format!("{wrapped}{out}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_into_existing_head_once() {
        let out = inject(
            "<html><head><title>t</title></head><body></body></html>",
            "<meta name=\"x\">",
        );
        assert_eq!(
            out.ok().as_deref(),
            Some("<html><head><title>t</title><meta name=\"x\"></head><body></body></html>")
        );
    }

    #[test]
    fn creates_head_when_missing() {
        let out = inject("<html><body></body></html>", "<meta name=\"x\">");
        assert_eq!(
            out.ok().as_deref(),
            Some("<html><head><meta name=\"x\"></head><body></body></html>")
        );
    }
}
