//! Blocking per-page checks: head metadata, internal links, markdown twin.

use geoharness_core::links::{resolve, route_for};
use geoharness_core::live::{BODY_PREFIX_CHARS, build_meta};
use geoharness_core::rewrite::extension;

use super::{PageCtx, Scored, pass_fail};
use crate::catalog::{BROKEN_LINKS, BUILD_META_EARLY, CANONICAL, DESCRIPTION, TITLE, TWIN};
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
    let text = p.page.main(main_selector).text_with_link_names();
    let score = overlap(&text, p.markdown);
    pass_fail(
        &TWIN,
        Some(p.route),
        score >= TWIN_MIN_OVERLAP,
        format!("word overlap {score:.2} with the main content (threshold {TWIN_MIN_OVERLAP})"),
    )
}

/// The live build check looks for exactly [`build_meta`] in the first
/// [`BODY_PREFIX_CHARS`] UTF-16 units of the page; a page that ships its own
/// meta later (or in another form) would deploy and then fail verification.
pub fn build_meta_early(p: &PageCtx<'_>, build_id: &str) -> Scored {
    let meta = build_meta(build_id);
    let (ok, evidence) = match p.html.find(&meta) {
        None => (
            false,
            format!("no {meta} in the page; the live check matches exactly this tag (a site's own build meta must use this form)"),
        ),
        Some(at) => {
            let end = p.html[..at + meta.len()].encode_utf16().count();
            (
                end <= BODY_PREFIX_CHARS,
                format!("build meta ends at character {end}; the live check reads the first {BODY_PREFIX_CHARS}"),
            )
        }
    };
    pass_fail(&BUILD_META_EARLY, Some(p.route), ok, evidence)
}
