//! Blocking per-page checks: head metadata, internal links, markdown twin.

use geoharness_core::links::{resolve, route_for};
use geoharness_core::rewrite::extension;

use super::{PageCtx, Scored, pass_fail};
use crate::catalog::{BROKEN_LINKS, CANONICAL, DESCRIPTION, TITLE, TWIN};
use crate::equivalence::overlap;
use crate::weights::TWIN_MIN_OVERLAP;

pub fn head(p: &PageCtx<'_>) -> Vec<Scored> {
    let h = p.page.head();
    let present = |v: &Option<String>, what: &str| match v {
        Some(v) => format!("{what}: {v:?}"),
        None => format!("no {what}"),
    };
    vec![
        pass_fail(
            &TITLE,
            Some(p.route),
            h.title.is_some(),
            present(&h.title, "title"),
        ),
        pass_fail(
            &DESCRIPTION,
            Some(p.route),
            h.description.is_some(),
            present(&h.description, "meta description"),
        ),
        pass_fail(
            &CANONICAL,
            Some(p.route),
            h.canonical.is_some(),
            present(&h.canonical, "canonical"),
        ),
    ]
}

/// Links whose path looks like a page (no extension, `.html`, `.md`) and
/// that resolve to no audited route. Asset links are not judged: the audit
/// does not see asset files.
pub fn broken_links(p: &PageCtx<'_>, origin: &str, routes: &[&str]) -> Scored {
    let mut broken: Vec<String> = p
        .page
        .all_links()
        .iter()
        .filter_map(|href| resolve(origin, p.route, href))
        .filter(|path| matches!(extension(path).as_str(), "" | "html" | "md"))
        .filter(|path| route_for(path, routes).is_none())
        .collect();
    broken.sort();
    broken.dedup();
    let evidence = if broken.is_empty() {
        "every internal page link resolves".to_owned()
    } else {
        format!("no page at: {}", broken.join(", "))
    };
    pass_fail(&BROKEN_LINKS, Some(p.route), broken.is_empty(), evidence)
}

pub fn twin(p: &PageCtx<'_>, main_selector: &str) -> Scored {
    if p.markdown.trim().is_empty() {
        return pass_fail(&TWIN, Some(p.route), false, "no markdown twin");
    }
    let text = p.page.main(main_selector).text();
    let score = overlap(&text, p.markdown);
    pass_fail(
        &TWIN,
        Some(p.route),
        score >= TWIN_MIN_OVERLAP,
        format!("word overlap {score:.2} with the main content (threshold {TWIN_MIN_OVERLAP})"),
    )
}
