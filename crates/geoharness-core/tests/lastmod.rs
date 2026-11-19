//! `content.sources`: built pages get a lastmod from the git dates of their
//! source files, supplied by the host per source glob (`SiteInput.sourceLastmod`).

mod common;

use std::collections::BTreeMap;

use geoharness_core::process_site;
use geoharness_core::types::{SiteInput, SiteOutput};

fn run(input: &SiteInput) -> SiteOutput {
    process_site(input).unwrap_or_else(|e| panic!("{e:?}"))
}

fn lastmod(out: &SiteOutput, route: &str) -> Option<String> {
    out.pages
        .iter()
        .find(|p| p.route == route)
        .and_then(|p| p.lastmod.clone())
}

#[test]
fn a_mapped_page_takes_the_newest_date_of_its_sources_over_the_adapter_date() {
    let mut input = common::input();
    input.config.content.sources = BTreeMap::from([
        ("/guide/**".to_owned(), vec!["content/guide/**".to_owned()]),
        ("/guide/".to_owned(), vec!["content/shared.md".to_owned()]),
    ]);
    input.source_lastmod = BTreeMap::from([
        (
            "content/guide/**".to_owned(),
            "2026-11-12T10:00:00Z".to_owned(),
        ),
        (
            "content/shared.md".to_owned(),
            "2026-11-15T08:00:00Z".to_owned(),
        ),
    ]);
    let out = run(&input);
    // /guide/ matches both entries: the newer source wins over its adapter date (2026-11-01).
    assert_eq!(
        lastmod(&out, "/guide/").as_deref(),
        Some("2026-11-15T08:00:00Z")
    );
    // /guide/advanced/ had none from the adapter (untracked output).
    assert_eq!(
        lastmod(&out, "/guide/advanced/").as_deref(),
        Some("2026-11-12T10:00:00Z")
    );
    // Unmapped pages keep the adapter's date.
    assert_eq!(lastmod(&out, "/").as_deref(), Some("2026-11-10T09:00:00Z"));
    let sitemap = out
        .files
        .iter()
        .find(|f| f.file == "sitemap.xml")
        .map(|f| f.contents.clone())
        .unwrap_or_default();
    assert!(
        sitemap.contains("<lastmod>2026-11-12T10:00:00Z</lastmod>"),
        "{sitemap}"
    );
}

#[test]
fn pages_left_without_a_lastmod_are_named_in_one_warning() {
    let mut input = common::input();
    input.config.content.sources.clear();
    input.source_lastmod.clear();
    let out = run(&input);
    let w: Vec<_> = out
        .warnings
        .iter()
        .filter(|w| w.code == "page.no_lastmod")
        .collect();
    assert_eq!(w.len(), 1, "{:#?}", out.warnings);
    assert!(
        w[0].message.contains("/guide/advanced/"),
        "{}",
        w[0].message
    );
    assert!(w[0].message.contains("content.sources"), "{}", w[0].message);
    assert_eq!(w[0].path.as_deref(), Some("content.sources"));
}

#[test]
fn source_dates_must_be_utc_seconds_and_for_configured_globs_only() {
    for (glob, date) in [
        ("content/guide/**", "2026-11-12T10:00:00+02:00"),
        ("content/guide/**", "now"),
        ("not/configured/**", "2026-11-12T10:00:00Z"),
    ] {
        let mut input = common::input();
        input.config.content.sources =
            BTreeMap::from([("/guide/**".to_owned(), vec!["content/guide/**".to_owned()])]);
        input.source_lastmod = BTreeMap::from([(glob.to_owned(), date.to_owned())]);
        let codes: Vec<String> = process_site(&input)
            .err()
            .unwrap_or_default()
            .into_iter()
            .map(|e| e.code)
            .collect();
        assert_eq!(codes, vec!["input.invalid"], "{glob} {date}");
    }
}

#[test]
fn source_globs_are_validated_in_the_config() {
    for (route, src) in [
        ("guide/**", "content/**"),
        ("/guide/**", "/abs/**"),
        ("/guide/**", "../up/**"),
        ("/guide/**", ""),
    ] {
        let mut config = common::input().config;
        config.content.sources = BTreeMap::from([(route.to_owned(), vec![src.to_owned()])]);
        let errs = geoharness_core::config::validate(&config)
            .err()
            .unwrap_or_default();
        assert!(
            errs.iter().any(|e| e.code == "config.invalid"
                && e.path
                    .as_deref()
                    .is_some_and(|p| p.starts_with("content.sources"))),
            "{route} {src}: {errs:#?}"
        );
    }
}
