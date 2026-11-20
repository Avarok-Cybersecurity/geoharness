//! Per-page HTTP `Link` headers in `_headers`: generic `:splat` rules where
//! they are exact for every page, exact rules otherwise, and the
//! all-or-nothing fallback at Cloudflare's 100-rule cap.

mod common;

use geoharness_core::headers::{Rule, count_rules, values};
use geoharness_core::link_header::{PageLink, parse, rules};
use geoharness_core::process_site;

const O: &str = "https://example.com";

struct Owned(Vec<(String, String, String)>);

impl Owned {
    /// Directory-style pages at `routes`, each its own canonical.
    fn dirs(routes: &[&str]) -> Self {
        Self(
            routes
                .iter()
                .map(|r| {
                    let file = format!("{}index.md", &r[1..]);
                    ((*r).to_owned(), file, format!("{O}{r}"))
                })
                .collect(),
        )
    }

    fn links(&self) -> Vec<PageLink<'_>> {
        self.0
            .iter()
            .map(|(route, markdown_file, canonical)| PageLink {
                route,
                markdown_file,
                canonical,
            })
            .collect()
    }
}

fn patterns(rules: &[Rule]) -> Vec<&str> {
    rules.iter().map(|r| r.pattern.as_str()).collect()
}

#[test]
fn directory_pages_share_generic_rules_whatever_the_site_size() {
    let few = Owned::dirs(&["/", "/a/"]);
    assert_eq!(
        patterns(&rules(O, &few.links(), &[])),
        ["/*/", "/*/index.md", "/", "/index.md"]
    );
    let routes: Vec<String> = (0..300).map(|i| format!("/p{i}/")).collect();
    let mut all: Vec<&str> = routes.iter().map(String::as_str).collect();
    all.push("/");
    assert_eq!(rules(O, &Owned::dirs(&all).links(), &[]).len(), 4);
    assert_eq!(
        rules(O, &few.links(), &[])[0].headers,
        [format!(
            "Link: <{O}/:splat/index.md>; rel=\"alternate\"; type=\"text/markdown\", <{O}/llms.txt>; rel=\"describedby\""
        )]
    );
}

#[test]
fn file_style_pages_get_exact_rules() {
    let p = PageLink {
        route: "/about",
        markdown_file: "about.md",
        canonical: "https://example.com/about",
    };
    let out = rules(O, &[p], &[]);
    assert_eq!(patterns(&out), ["/about", "/about.md"]);
    assert_eq!(
        out[1].headers,
        ["Link: <https://example.com/about>; rel=\"canonical\""]
    );
}

#[test]
fn a_foreign_canonical_makes_every_twin_rule_exact_and_names_it() {
    let mut pages = Owned::dirs(&["/a/", "/g/"]);
    pages.0[1].2 = "https://docs.example.org/g/".into();
    let out = rules(O, &pages.links(), &[]);
    assert_eq!(patterns(&out), ["/*/", "/a/index.md", "/g/index.md"]);
    assert_eq!(
        out[2].headers,
        ["Link: <https://docs.example.org/g/>; rel=\"canonical\""]
    );
}

#[test]
fn an_excluded_directory_makes_every_page_rule_exact() {
    let pages = Owned::dirs(&["/a/", "/b/"]);
    let out = rules(O, &pages.links(), &["/drafts/x/", "/"]);
    assert_eq!(patterns(&out), ["/*/index.md", "/a/", "/b/"]);
    assert!(out.iter().all(|r| r.pattern != "/drafts/x/"));
}

#[test]
fn no_rule_detaches_a_header() {
    let mut pages = Owned::dirs(&["/", "/a/", "/g/"]);
    pages.0[2].2 = "https://docs.example.org/g/".into();
    let out = rules(O, &pages.links(), &["/drafts/x/"]);
    assert!(
        out.iter()
            .flat_map(|r| &r.headers)
            .all(|h| !h.starts_with('!')),
        "{out:?}"
    );
}

#[test]
fn the_fixture_site_declares_links_and_keeps_the_site_rules() {
    let out = process_site(&common::input()).unwrap_or_else(|e| panic!("{e:?}"));
    let headers = out
        .files
        .iter()
        .find(|f| f.file == "_headers")
        .map(|f| f.contents.clone())
        .unwrap_or_default();
    let links = values(&headers, "link");
    // The fixture excludes /drafts/wip/ and one page names another canonical: every rule is exact.
    assert!(
        links
            .iter()
            .any(|(p, v)| *p == "/guide/" && v.contains("rel=\"alternate\"")),
        "{headers}"
    );
    assert!(
        links
            .iter()
            .any(|(p, v)| *p == "/guide/index.md" && v.contains("https://docs.example.org/guide/")),
        "{headers}"
    );
    assert!(
        links.iter().all(|(p, _)| !p.starts_with("/drafts/")),
        "{headers}"
    );
    assert!(
        !out.warnings
            .iter()
            .any(|w| w.code == "headers.link_skipped")
    );
}

#[test]
fn links_that_would_break_the_cap_are_all_left_out_with_a_warning() {
    let mut input = common::input();
    let site = (0..95)
        .map(|i| format!("/r{i}\n  X-A: b\n"))
        .collect::<Vec<_>>()
        .concat();
    input.existing.headers = Some(site);
    let out = process_site(&input).unwrap_or_else(|e| panic!("{e:?}"));
    let headers = out
        .files
        .iter()
        .find(|f| f.file == "_headers")
        .map(|f| f.contents.clone())
        .unwrap_or_default();
    assert!(count_rules(&headers) <= 100);
    assert!(values(&headers, "link").is_empty(), "{headers}");
    assert!(
        out.warnings
            .iter()
            .any(|w| w.code == "headers.link_skipped"),
        "{:?}",
        out.warnings
    );
}

#[test]
fn parses_link_values_with_quoted_commas_and_rel_lists() {
    let v = parse(
        "<https://e.com/a.md>; rel=\"alternate\"; type=\"text/markdown\"; title=\"a, b\", <https://e.com/llms.txt>; rel=\"describedby index\"",
    );
    assert_eq!(v.len(), 2);
    assert_eq!(v[0].target, "https://e.com/a.md");
    assert!(v[0].has_rel("alternate"));
    assert_eq!(v[0].param("type"), Some("text/markdown"));
    assert_eq!(v[0].param("title"), Some("a, b"));
    assert!(v[1].has_rel("describedby") && v[1].has_rel("index"));
    assert!(parse("garbage").is_empty());
    assert!(parse("").is_empty());
}
