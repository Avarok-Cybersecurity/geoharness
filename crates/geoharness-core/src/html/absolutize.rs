//! Makes internal `href`/`src` absolute before conversion, so a twin's links
//! keep working wherever it is read (inside llms-full.txt, or fetched at the
//! HTML URL through the rewrite rule). A fragment-only link (`#experience`)
//! points into the HTML page, which the twin is not, so it becomes
//! `<canonical>#experience`.

use lol_html::{RewriteStrSettings, element, rewrite_str};

use crate::error::Error;
use crate::links::resolve;

/// `href` resolved against `route`, keeping its query and fragment; `None`
/// for external or fragment-only links (left untouched).
pub fn absolute(origin: &str, route: &str, href: &str) -> Option<String> {
    let path = resolve(origin, route, href)?;
    let suffix = href.find(['?', '#']).map_or("", |i| &href[i..]);
    Some(format!("{origin}{path}{suffix}"))
}

/// `canonical#frag` for a fragment-only `href` with a non-empty fragment.
fn in_page(canonical: &str, href: &str) -> Option<String> {
    let frag = href.trim().strip_prefix('#').filter(|f| !f.is_empty())?;
    Some(format!("{canonical}#{frag}"))
}

/// Rewrites `a[href]` and `img[src]` in an HTML fragment taken from the page
/// at `route`, whose canonical URL is `canonical`.
pub fn absolutize(
    fragment: &str,
    origin: &str,
    route: &str,
    canonical: &str,
) -> Result<String, Error> {
    let fix = |el: &mut lol_html::html_content::Element<'_, '_>, attr: &str| {
        if let Some(abs) = el
            .get_attribute(attr)
            .and_then(|v| absolute(origin, route, &v).or_else(|| in_page(canonical, &v)))
        {
            el.set_attribute(attr, &abs)?;
        }
        Ok::<(), lol_html::errors::AttributeNameError>(())
    };
    let settings = RewriteStrSettings::new()
        .append_element_content_handler(element!("a[href]", |el| Ok(fix(el, "href")?)))
        .append_element_content_handler(element!("img[src]", |el| Ok(fix(el, "src")?)));
    rewrite_str(fragment, settings).map_err(|e| Error::Html(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::absolutize;

    #[test]
    fn rewrites_internal_and_fragments_keeps_external() {
        let out = absolutize(
            "<a href=\"b/?q=1#x\">b</a><a href=\"https://o.org/\">o</a><a href=\"#top\">t</a><a href=\"#\">e</a>",
            "https://ex.com",
            "/a/",
            "https://www.ex.com/a/",
        );
        assert_eq!(
            out.ok().as_deref(),
            Some(
                "<a href=\"https://ex.com/a/b/?q=1#x\">b</a><a href=\"https://o.org/\">o</a>\
                 <a href=\"https://www.ex.com/a/#top\">t</a><a href=\"#\">e</a>"
            )
        );
    }
}
