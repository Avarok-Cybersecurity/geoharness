//! `index.broken_links` against `content.exclude`: a page excluded from
//! processing is still in the output, so a link to it resolves; a link that
//! only matches the exclude glob, with no page behind it, is still broken.

mod support;

use geoharness_audit::AuditInput;
use support::{fails, findings, run, static_input};

const PAGE: &str = "/guide/";

fn linking_to(href: &str) -> AuditInput {
    let mut input = static_input();
    let page = input
        .pages
        .iter_mut()
        .find(|p| p.route == PAGE)
        .unwrap_or_else(|| panic!("fixture has no {PAGE}"));
    page.html = page
        .html
        .replacen("</body>", &format!("<a href=\"{href}\">x</a></body>"), 1);
    input
}

fn broken_links_passes(input: &AuditInput) -> bool {
    let report = run(input);
    let f = findings(&report, "index.broken_links");
    let f = f
        .iter()
        .find(|f| f.route.as_deref() == Some(PAGE))
        .unwrap_or_else(|| panic!("no index.broken_links finding for {PAGE}"));
    f.passed
}

#[test]
fn the_fixture_excludes_a_page_it_still_ships() {
    let input = static_input();
    assert_eq!(input.excluded_routes, vec!["/drafts/wip/".to_owned()]);
    assert!(input.pages.iter().all(|p| p.route != "/drafts/wip/"));
    assert!(
        broken_links_passes(&input),
        "{PAGE} must pass before the edit"
    );
}

#[test]
fn a_link_to_an_excluded_page_in_the_output_resolves() {
    assert!(broken_links_passes(&linking_to("/drafts/wip/")));
    assert!(broken_links_passes(&linking_to("/drafts/wip/index.html")));
}

#[test]
fn a_link_matching_the_exclude_glob_with_no_page_behind_it_is_broken() {
    let report = run(&linking_to("/drafts/gone/"));
    fails(&report, "index.broken_links", Some(PAGE));
    let f = findings(&report, "index.broken_links");
    assert!(
        f.iter()
            .any(|f| f.route.as_deref() == Some(PAGE) && f.evidence.contains("/drafts/gone/")),
        "{f:#?}"
    );
}

#[test]
fn without_the_excluded_routes_the_same_link_is_broken() {
    let mut input = linking_to("/drafts/wip/");
    input.excluded_routes.clear();
    fails(&run(&input), "index.broken_links", Some(PAGE));
}
