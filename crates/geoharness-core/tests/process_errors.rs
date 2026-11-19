//! processSite failure modes: each returns a typed error, never partial output.

mod common;

use geoharness_core::process_site;

fn codes(input: &geoharness_core::types::SiteInput) -> Vec<String> {
    process_site(input)
        .err()
        .unwrap_or_default()
        .into_iter()
        .map(|e| e.code)
        .collect()
}

#[test]
fn env_value_for_an_undeclared_name_is_rejected() {
    let mut input = common::input();
    input.env.insert("SECRET".into(), "x".into());
    assert_eq!(codes(&input), vec!["env.undeclared"]);
}

#[test]
fn template_reading_an_undeclared_name_is_an_error() {
    let mut input = common::input();
    input.pages[0].html = input.pages[0].html.replace("<h1>", "<h1>{{env.SECRET}}");
    assert_eq!(codes(&input), vec!["template.undeclared_env"]);
}

#[test]
fn robots_conflict_is_an_error() {
    let mut input = common::input();
    input.existing.robots = Some("User-agent: GPTBot\nAllow: /\n".into());
    assert_eq!(codes(&input), vec!["robots.conflict"]);
}

#[test]
fn more_than_100_header_rules_is_an_error() {
    let mut input = common::input();
    input.existing.headers = Some(
        (0..99)
            .map(|i| format!("/p{i}\n  X: y\n"))
            .collect::<Vec<_>>()
            .concat(),
    );
    assert_eq!(codes(&input), vec!["headers.too_many_rules"]);
}

#[test]
fn duplicate_routes_and_unsafe_files_are_rejected() {
    let mut input = common::input();
    input.pages[1].route = "/".into();
    input.pages[2].file = "../escape.html".into();
    assert_eq!(codes(&input), vec!["input.invalid", "input.invalid"]);
}

#[test]
fn existing_llms_and_sitemap_are_kept_with_warnings() {
    let mut input = common::input();
    input.existing.llms = Some("# mine\n".into());
    input.existing.sitemap = Some("<urlset/>".into());
    let out = process_site(&input).unwrap_or_else(|e| panic!("{e:?}"));
    assert!(
        !out.files
            .iter()
            .any(|f| f.file == "llms.txt" || f.file == "sitemap.xml")
    );
    assert_eq!(
        out.warnings
            .iter()
            .filter(|w| w.code == "output.existing_kept")
            .count(),
        2
    );
}

#[test]
fn author_tags_are_never_overridden() {
    let out = process_site(&common::input()).unwrap_or_else(|e| panic!("{e:?}"));
    let guide = out
        .files
        .iter()
        .find(|f| f.file == "guide/index.html")
        .map_or("", |f| f.contents.as_str());
    assert_eq!(guide.matches("rel=\"canonical\"").count(), 1);
    assert!(guide.contains("href=\"https://docs.example.org/guide/\""));
    assert_eq!(guide.matches("og:title").count(), 1);
    let home = out
        .files
        .iter()
        .find(|f| f.file == "index.html")
        .map_or("", |f| f.contents.as_str());
    assert_eq!(
        home.matches("application/ld+json").count(),
        1,
        "author JSON-LD kept, none added"
    );
}

#[test]
fn every_served_host_gets_its_own_tagged_rewrite_rules() {
    let input = common::input();
    let out = process_site(&input).unwrap_or_else(|e| panic!("{e:?}"));
    for host in &input.hosts {
        let tagged: Vec<_> = out
            .rewrite_rules
            .iter()
            .filter(|r| r.description.starts_with(&format!("geoharness:{host} ")))
            .collect();
        assert_eq!(tagged.len(), 3, "{host}: {tagged:#?}");
        let guard = format!("http.host eq \"{host}\"");
        assert!(
            tagged.iter().all(|r| r.expression.contains(&guard)),
            "{tagged:#?}"
        );
    }
    assert_eq!(out.rewrite_rules.len(), 3 * input.hosts.len());
}

#[test]
fn hosts_must_include_the_origin_host_and_be_plain_unique_host_names() {
    for hosts in [
        vec![],
        vec!["www.example.com"],
        vec!["example.com", "example.com"],
        vec!["example.com", "Example.org"],
        vec!["example.com", "example.org:8443"],
        vec!["example.com", ""],
    ] {
        let mut input = common::input();
        input.hosts = hosts.iter().map(|h| (*h).to_owned()).collect();
        assert_eq!(codes(&input), vec!["input.invalid"], "{hosts:?}");
    }
}
